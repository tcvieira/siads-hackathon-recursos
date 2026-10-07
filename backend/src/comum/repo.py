"""Repositório da tabela única `sisgares` (design.md §3). Único módulo com boto3 (R12.2).

Formato dos itens igual ao de `scripts/seed.py`. A tabela é usada pelo recurso de alto nível do
boto3; o cliente (`tabela.meta.client`) herda a conversão de tipos Python ↔ DynamoDB também em
`transact_write_items` e `batch_get_item`.
"""

import os
from collections.abc import Iterable, Mapping
from dataclasses import asdict, dataclass, fields, replace
from decimal import Decimal
from typing import Any

import boto3
from boto3.dynamodb.conditions import Key
from boto3.dynamodb.types import TypeDeserializer
from botocore.exceptions import ClientError

from dominio.modelos import (
    Alteracao,
    Ambiente,
    Catalogo,
    Config,
    Disposicao,
    EmailSimulado,
    GrupoRecurso,
    ItemRecurso,
    Ocupacao,
    PedidoSnp,
    Periodo,
    Recurso,
    Reserva,
    Setor,
    VinculoSetor,
)

LOTE_BATCH_GET = 100
MAX_TENTATIVAS_BATCH = 5


class ConflitoConcorrente(Exception):
    """A transação foi cancelada por condição: outra gravação mudou um lock ou o META (RN7).

    `motivos` traz o `Code` de cada operação, na ordem da transação (`None` = sem falha).
    """

    def __init__(self, motivos: list[str | None]):
        super().__init__(f"Transação cancelada: {motivos}")
        self.motivos = motivos


# --- Cache por ambiente de execução --------------------------------------------------------

_repo: "Repositorio | None" = None


def obter_repo() -> "Repositorio":
    global _repo
    if _repo is None:
        _repo = Repositorio(boto3.resource("dynamodb").Table(os.environ["TABLE_NAME"]))
    return _repo


def reiniciar_cache() -> None:
    global _repo
    _repo = None


# --- Chaves --------------------------------------------------------------------------------


def chave_lock_ambiente(raiz: str) -> str:
    """Pai e filhos compartilham o lock da raiz da hierarquia (design §3, passo 2)."""
    return f"LOCK#AMBI#{raiz}"


def chave_lock_recurso(recurso_id: str) -> str:
    return f"LOCK#RECU#{recurso_id}"


def _pk_reserva(reserva_id: str) -> str:
    return f"RESE#{reserva_id}"


# --- Conversões ----------------------------------------------------------------------------


def _py(valor: Any) -> Any:
    """Decimal → int (ou float, se não for inteiro), recursivo em listas e mapas."""
    if isinstance(valor, Decimal):
        return int(valor) if valor == valor.to_integral_value() else float(valor)
    if isinstance(valor, list):
        return [_py(v) for v in valor]
    if isinstance(valor, dict):
        return {k: _py(v) for k, v in valor.items()}
    return valor


def _para(cls, item: Mapping[str, Any]):
    """Item → dataclass, ignorando PK/SK/GSI1* e qualquer atributo que a classe não tenha."""
    nomes = {f.name for f in fields(cls)}
    return cls(**{k: _py(v) for k, v in item.items() if k in nomes})


def _reserva(item: Mapping[str, Any]) -> Reserva:
    # Local próprio: o META não grava `ambienteId` (atributos None ficam de fora, como no seed).
    r = _para(Reserva, {"ambienteId": None, **item})
    r.periodos = [Periodo(inicio=p["inicio"], termino=p["termino"]) for p in r.periodos]
    r.recursos = [ItemRecurso(recursoId=str(i["recursoId"]), qtd=int(i["qtd"])) for i in r.recursos]
    r.status = None  # calculado (RN13), nunca gravado
    return r


def _email(item: Mapping[str, Any]) -> EmailSimulado:
    e = _para(EmailSimulado, item)
    e.alteracoes = [Alteracao(**a) for a in e.alteracoes]
    return e


def _sem_nulos(d: dict) -> dict:
    return {k: v for k, v in d.items() if v is not None}


def _ordem_id(obj) -> tuple:
    return (0, int(obj.id), "") if obj.id.isdigit() else (1, 0, obj.id)


def reserva_de_imagem(image: Mapping[str, Any]) -> Reserva:
    """`NewImage`/`OldImage` do stream (formato baixo nível do DynamoDB) → Reserva."""
    desserializar = TypeDeserializer().deserialize
    return _reserva({k: desserializar(v) for k, v in image.items()})


# --- Cadastros -----------------------------------------------------------------------------


@dataclass
class Cadastros:
    """Catálogo completo (com inativos), setores por id e vínculos setor × ambiente/recurso."""

    catalogo: Catalogo
    setores: dict[str, Setor]
    vinculos: list[VinculoSetor]

    def catalogo_publico(self) -> Catalogo:
        """GET /catalogo: só itens ativos (R2.8). `Catalogo` não tem e-mail de setor."""
        c = self.catalogo
        return Catalogo(ambientes=[a for a in c.ambientes if a.ativo],
                        disposicoes=[d for d in c.disposicoes if d.ativo],
                        grupos=list(c.grupos),
                        recursos=[r for r in c.recursos if r.ativo],
                        config=c.config)

    def limitados(self) -> set[str]:
        return {r.id for r in self.catalogo.recursos if r.limitado}


@dataclass
class PeriodoAgenda:
    """RESE#<id> / PER#<n> lido do GSI1 `AGENDA` (painel de atendimento)."""

    reservaId: str
    inicio: str
    termino: str
    cancelada: bool
    setoresIds: list[str]
    ambienteId: str | None = None


# --- Repositório ---------------------------------------------------------------------------


class Repositorio:
    def __init__(self, tabela):
        self.tabela = tabela
        self.cliente = tabela.meta.client

    # Leituras genéricas -----------------------------------------------------------------

    def _query(self, **kwargs) -> list[dict]:
        itens, inicio = [], None
        while True:
            if inicio:
                kwargs["ExclusiveStartKey"] = inicio
            resp = self.tabela.query(**kwargs)
            itens.extend(resp.get("Items", []))
            inicio = resp.get("LastEvaluatedKey")
            if not inicio:
                return itens

    def _particao(self, pk: str, consistente: bool = False) -> list[dict]:
        return self._query(KeyConditionExpression=Key("PK").eq(pk), ConsistentRead=consistente)

    def _gsi1(self, pk: str, de: str | None = None, ate: str | None = None) -> list[dict]:
        cond = Key("GSI1PK").eq(pk)
        if de is not None and ate is not None:
            cond = cond & Key("GSI1SK").between(de, ate)
        return self._query(IndexName="GSI1", KeyConditionExpression=cond)

    # Catálogo ---------------------------------------------------------------------------

    def carregar_cadastros(self) -> Cadastros:
        ambientes = sorted((_para(Ambiente, i) for i in self._particao("CAT#AMBI")), key=_ordem_id)
        disposicoes = sorted((_para(Disposicao, i) for i in self._particao("CAT#DISP")),
                             key=_ordem_id)
        grupos = [_para(GrupoRecurso, i) for i in sorted(self._particao("CAT#GREC"),
                                                          key=lambda g: int(g.get("ordem", 0)))
                  if i.get("ativo", True)]
        recursos = sorted((_para(Recurso, i) for i in self._particao("CAT#RECU")), key=_ordem_id)
        setores = {s.id: s for s in sorted((_para(Setor, i) for i in self._particao("CAT#ENVO")),
                                           key=_ordem_id)}
        vinculos = [_para(VinculoSetor, i) for i in self._particao("CAT#VINC")]
        conf = self.tabela.get_item(Key={"PK": "CAT#CONF", "SK": "GLOBAL"}).get("Item")
        if conf is None:
            raise RuntimeError("Configuração CAT#CONF/GLOBAL ausente na tabela.")
        catalogo = Catalogo(ambientes, disposicoes, grupos, recursos, _para(Config, conf))
        return Cadastros(catalogo=catalogo, setores=setores, vinculos=vinculos)

    # Locks e ocupações (sempre consistentes: RN7) ----------------------------------------

    def ler_versoes_locks(self, chaves: Iterable[str]) -> dict[str, int]:
        """Versão atual de cada lock (`ConsistentRead`); lock inexistente = 0."""
        versoes = {}
        for chave in dict.fromkeys(chaves):
            item = self.tabela.get_item(Key={"PK": chave, "SK": "LOCK"},
                                        ConsistentRead=True).get("Item")
            versoes[chave] = int(item.get("versao", 0)) if item else 0
        return versoes

    def _ocupacoes(self, pk: str, ate: str, consistente: bool) -> list[Ocupacao]:
        itens = self._query(KeyConditionExpression=Key("PK").eq(pk) & Key("SK").lt(ate),
                            ConsistentRead=consistente)
        return [_para(Ocupacao, i) for i in itens]

    def ocupacoes_ambiente(self, ambiente_id: str, ate: str,
                           consistente: bool = True) -> list[Ocupacao]:
        """OCUP#AMBI#<a> com início antes de `ate` (o filtro de término fica no domínio)."""
        return self._ocupacoes(f"OCUP#AMBI#{ambiente_id}", ate, consistente)

    def ocupacoes_recurso(self, recurso_id: str, ate: str) -> list[Ocupacao]:
        return self._ocupacoes(f"OCUP#RECU#{recurso_id}", ate, True)

    # Reservas ---------------------------------------------------------------------------

    def obter_reserva(self, reserva_id: str, consistente: bool = True) -> Reserva | None:
        item = self.tabela.get_item(Key={"PK": _pk_reserva(reserva_id), "SK": "META"},
                                    ConsistentRead=consistente).get("Item")
        return _reserva(item) if item else None

    @staticmethod
    def _item_meta(r: Reserva) -> dict:
        corpo = asdict(r)
        corpo.pop("status", None)
        return {"PK": _pk_reserva(r.id), "SK": "META", "GSI1PK": f"SOLI#{r.solicitanteSub}",
                "GSI1SK": r.criadoEm, **_sem_nulos(corpo)}

    @staticmethod
    def _itens_filhos(r: Reserva, limitados: set[str]) -> list[dict]:
        """PER#<n> (GSI1 AGENDA), OCUP#AMBI#<a> e OCUP#RECU#<r> (só limitados), como o seed."""
        itens = []
        for n, p in enumerate(r.periodos):
            per = {"PK": _pk_reserva(r.id), "SK": f"PER#{n}", "GSI1PK": "AGENDA",
                   "GSI1SK": f"{p.inicio}#{r.id}", "reservaId": r.id, "inicio": p.inicio,
                   "termino": p.termino, "cancelada": r.cancelada, "setoresIds": list(r.setoresIds)}
            sk_ocup = f"{p.inicio}#{r.id}#{n}"
            if r.ambienteId is not None:
                per["ambienteId"] = r.ambienteId
                itens.append({"PK": f"OCUP#AMBI#{r.ambienteId}", "SK": sk_ocup, "reservaId": r.id,
                              "inicio": p.inicio, "termino": p.termino})
            itens.append(per)
            for item in r.recursos:
                if item.recursoId in limitados:
                    itens.append({"PK": f"OCUP#RECU#{item.recursoId}", "SK": sk_ocup,
                                  "reservaId": r.id, "inicio": p.inicio, "termino": p.termino,
                                  "qtd": item.qtd})
        return itens

    def _transacao(self, operacoes: list[dict]) -> None:
        """TransactWriteItems; cancelamento por condição vira ConflitoConcorrente."""
        try:
            self.cliente.transact_write_items(TransactItems=operacoes)
        except ClientError as erro:
            if erro.response.get("Error", {}).get("Code") != "TransactionCanceledException":
                raise
            motivos = [m.get("Code") for m in erro.response.get("CancellationReasons", [])]
            if {"ConditionalCheckFailed", "TransactionConflict"} & set(motivos):
                raise ConflitoConcorrente(motivos) from erro
            raise

    def _limitados(self, cadastros: Cadastros | None) -> set[str]:
        return (cadastros or self.carregar_cadastros()).limitados()

    def salvar_reserva(self, nova: Reserva, antiga: Reserva | None,
                       versoes_locks: Mapping[str, int],
                       cadastros: Cadastros | None = None) -> Reserva:
        """Cria (antiga=None) ou altera a reserva numa única transação (design §3, passo 5).

        Cada lock lido avança uma versão com a condição de não ter mudado; o META exige não
        existir (criação) ou estar na versão da antiga (alteração). `versao` e `cancelada` são
        definidos aqui. Devolve a reserva gravada (sem `status`).
        """
        limitados = self._limitados(cadastros)
        nova = replace(nova, cancelada=False, status=None,
                       versao=1 if antiga is None else antiga.versao + 1)
        nome = self.tabela.name
        ops: list[dict] = []
        for chave, lida in versoes_locks.items():
            ops.append({"Update": {
                "TableName": nome, "Key": {"PK": chave, "SK": "LOCK"},
                "UpdateExpression": "SET versao = :nova",
                "ConditionExpression": "attribute_not_exists(versao)" if lida == 0
                else "versao = :lida",
                "ExpressionAttributeValues": {":nova": lida + 1, **({":lida": lida} if lida else {})},
            }})
        meta = {"TableName": nome, "Item": self._item_meta(nova)}
        if antiga is None:
            meta["ConditionExpression"] = "attribute_not_exists(PK)"
        else:
            meta["ConditionExpression"] = "versao = :antiga"
            meta["ExpressionAttributeValues"] = {":antiga": antiga.versao}
        ops.append({"Put": meta})

        novos = self._itens_filhos(nova, limitados)
        chaves_novas = {(i["PK"], i["SK"]) for i in novos}
        ops.extend({"Put": {"TableName": nome, "Item": i}} for i in novos)
        if antiga is not None:
            for i in self._itens_filhos(antiga, limitados):
                if (i["PK"], i["SK"]) not in chaves_novas:
                    ops.append({"Delete": {"TableName": nome, "Key": {"PK": i["PK"], "SK": i["SK"]}}})
        self._transacao(ops)
        return nova

    def cancelar_reserva(self, reserva: Reserva, cadastros: Cadastros | None = None) -> Reserva:
        """META `cancelada=true` e `versao+1` (com condição), PER# cancelados, OCUP# apagados."""
        limitados = self._limitados(cadastros)
        nome = self.tabela.name
        ops: list[dict] = [{"Update": {
            "TableName": nome, "Key": {"PK": _pk_reserva(reserva.id), "SK": "META"},
            "UpdateExpression": "SET cancelada = :sim, versao = :nova",
            "ConditionExpression": "versao = :lida",
            "ExpressionAttributeValues": {":sim": True, ":nova": reserva.versao + 1,
                                          ":lida": reserva.versao},
        }}]
        for i in self._itens_filhos(reserva, limitados):
            chave = {"PK": i["PK"], "SK": i["SK"]}
            if i["SK"].startswith("PER#"):
                ops.append({"Update": {"TableName": nome, "Key": chave,
                                       "UpdateExpression": "SET cancelada = :sim",
                                       "ExpressionAttributeValues": {":sim": True}}})
            else:
                ops.append({"Delete": {"TableName": nome, "Key": chave}})
        self._transacao(ops)
        return replace(reserva, cancelada=True, versao=reserva.versao + 1, status=None)

    def proximo_numero(self, nome: str) -> int:
        """Contador atômico `CTR#RESE` / `CTR#SNP`: devolve o novo número emitido."""
        resp = self.tabela.update_item(Key={"PK": f"CTR#{nome}", "SK": "CTR"},
                                       UpdateExpression="ADD valor :um",
                                       ExpressionAttributeValues={":um": 1},
                                       ReturnValues="UPDATED_NEW")
        return int(resp["Attributes"]["valor"])

    # Listagens --------------------------------------------------------------------------

    def listar_por_solicitante(self, sub: str) -> list[Reserva]:
        """GSI1 `SOLI#<sub>`, em ordem de criação."""
        return [_reserva(i) for i in self._gsi1(f"SOLI#{sub}")]

    def agenda(self, de: str, ate: str) -> list[PeriodoAgenda]:
        """GSI1 `AGENDA` com `GSI1SK` (`<inicio>#<id>`) entre `de` e `ate`."""
        return [_para(PeriodoAgenda, i) for i in self._gsi1("AGENDA", de, ate)]

    def obter_metas(self, ids: Iterable[str]) -> list[Reserva]:
        """BatchGetItem dos META em lotes de 100, repetindo as UnprocessedKeys. Ordem de `ids`."""
        unicos = list(dict.fromkeys(ids))
        nome, achados = self.tabela.name, {}
        for k in range(0, len(unicos), LOTE_BATCH_GET):
            pedido = {nome: {"Keys": [{"PK": _pk_reserva(i), "SK": "META"}
                                      for i in unicos[k:k + LOTE_BATCH_GET]]}}
            for _ in range(MAX_TENTATIVAS_BATCH):
                resp = self.cliente.batch_get_item(RequestItems=pedido)
                for item in resp.get("Responses", {}).get(nome, []):
                    achados[str(item["id"])] = _reserva(item)
                pedido = resp.get("UnprocessedKeys") or {}
                if not pedido:
                    break
            else:
                raise RuntimeError("BatchGetItem não processou todas as chaves.")
        return [achados[i] for i in unicos if i in achados]

    def pedidos_snp(self, reserva_id: str) -> list[PedidoSnp]:
        itens = self._query(KeyConditionExpression=Key("PK").eq(_pk_reserva(reserva_id))
                            & Key("SK").begins_with("SNP#"), ConsistentRead=True)
        return [_para(PedidoSnp, i) for i in itens]

    def notificacoes(self, de: str, ate: str) -> list[EmailSimulado]:
        """GSI1 `NOTIF` com `ts` entre `de` e `ate`."""
        return [_email(i) for i in self._gsi1("NOTIF", de, ate)]

    # Notificações (stream) --------------------------------------------------------------

    def gravar_notificacoes(self, reserva_id: str, event_id: str, emails: Iterable[EmailSimulado],
                            pedidos: Iterable[PedidoSnp]) -> bool:
        """Grava e-mails e pedidos SNP com o marcador `EVT#<eventID>` na mesma transação.

        Devolve False, sem gravar nada, se esse evento do stream já tinha sido processado.
        """
        pk, nome = _pk_reserva(reserva_id), self.tabela.name
        ops: list[dict] = [{"Put": {
            "TableName": nome, "Item": {"PK": pk, "SK": f"EVT#{event_id}", "eventId": event_id},
            "ConditionExpression": "attribute_not_exists(PK)",
        }}]
        for e in emails:
            ops.append({"Put": {"TableName": nome, "Item": {
                "PK": pk, "SK": f"EMAIL#{e.ts}#{e.setorId}", "GSI1PK": "NOTIF", "GSI1SK": e.ts,
                **asdict(e)}}})
        for p in pedidos:
            ops.append({"Put": {"TableName": nome,
                                "Item": {"PK": pk, "SK": f"SNP#{p.setorId}", **asdict(p)}}})
        try:
            self._transacao(ops)
        except ConflitoConcorrente as erro:
            # Só a condição do marcador (operação 0) significa "já processado"; um
            # TransactionConflict sobe para o stream retentar.
            if erro.motivos and erro.motivos[0] == "ConditionalCheckFailed":
                return False
            raise
        return True
