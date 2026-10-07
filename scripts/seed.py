"""Carrega o catálogo, as reservas do CSV e o cenário de demo na tabela `sisgares` (R11).

Chaves conforme o design.md §3. Precisa rodar depois do primeiro deploy (tabela existe) e antes
do redeploy com a `notificacoes` real, para não gerar e-mails das reservas carregadas aqui.

Idempotente (R11.7): todo item é gravado com `attribute_not_exists`. Se o META de uma reserva já
existe, a reserva inteira é pulada (inclusive períodos e ocupações).

Uso, na raiz do repositório:
    .venv/bin/python scripts/seed.py [--data-demo AAAA-MM-DD] [--dry-run]
"""

import argparse
import csv
import os
import random
import sys
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import boto3
from botocore.exceptions import ClientError
from dotenv import load_dotenv

RAIZ = Path(__file__).resolve().parent.parent
DADOS = RAIZ / "docs" / "requisitos" / "dados"
FUSO = ZoneInfo("America/Fortaleza")
MARGEM = timedelta(minutes=30)
CONFIG = {"faixaInicio": "07:00", "faixaFim": "20:00", "antecedenciaMin": 120, "margemMin": 30}

# R11.4: vínculos com código de serviço do SNP (setor, recurso). Copa (SMSG × 1, 2, 3) fica sem.
CODIGOS_SNP = {("2", "6"): "SNP-TI-0006", ("2", "8"): "SNP-TI-0008", ("2", "96"): "SNP-TI-0096",
               ("3", "5"): "SNP-LOG-0005"}

FINALIDADES = [
    "Reunião de alinhamento da PR/CE", "Audiência pública", "Treinamento de servidores",
    "Reunião com órgãos parceiros", "Seminário institucional", "Oficina de planejamento",
    "Videoconferência com a PGR", "Reunião do comitê de gestão", "Palestra de integração",
    "Sessão de mediação",
]
# Solicitantes fictícios (LGPD: nenhum dado real). Os subs não existem no Cognito.
FICTICIOS = [(f"ficticio-{i:02d}", f"pessoa{i:02d}@example.com") for i in range(1, 9)]


def inteiro(texto: str) -> int:
    """'17.325' → 17325 (R11.1)."""
    return int(texto.replace(".", ""))


def ler_csv(nome: str) -> list[dict]:
    with open(DADOS / nome, encoding="utf-8") as arq:
        return list(csv.DictReader(arq))


def iso(instante: datetime) -> str:
    return instante.astimezone(FUSO).isoformat()


def data_csv(texto: str) -> datetime:
    """'20/10/2026 11:00:00' → datetime em −03:00 (R11.1)."""
    return datetime.strptime(texto, "%d/%m/%Y %H:%M:%S").replace(tzinfo=FUSO)


# --- Catálogo -------------------------------------------------------------------------------


@dataclass
class Catalogo:
    ambientes: dict[str, dict]
    recursos: dict[str, dict]
    setores_ambiente: dict[str, list[str]]
    setores_recurso: dict[str, list[str]]
    vinculos_recurso: dict[str, set[str]]
    disposicoes_ativas: list[str]
    itens: list[dict]

    def familia(self, ambiente: str) -> set[str]:
        """O próprio ambiente, ancestrais e descendentes (RN6). Irmãos não entram."""
        pai = {a: d["AMBI_ID_PAI"] or None for a, d in self.ambientes.items()}
        resultado, atual = {ambiente}, pai[ambiente]
        while atual:
            resultado.add(atual)
            atual = pai[atual]
        pendentes = [ambiente]
        while pendentes:
            x = pendentes.pop()
            for filho in (a for a, p in pai.items() if p == x):
                resultado.add(filho)
                pendentes.append(filho)
        return resultado

    def setores(self, ambiente: str | None, recursos: list[dict]) -> list[str]:
        ids = set(self.setores_ambiente.get(ambiente, [])) if ambiente else set()
        for item in recursos:
            ids |= set(self.setores_recurso.get(item["recursoId"], []))
        return sorted(ids, key=int)


def montar_catalogo() -> Catalogo:
    ambientes = {r["AMBI_ID"]: r for r in ler_csv("dados-ambiente.csv")}
    recursos = {r["RECU_ID"]: r for r in ler_csv("dados-recurso.csv")}
    setores_ambiente, setores_recurso = defaultdict(list), defaultdict(list)
    vinculos_recurso = defaultdict(set)
    itens = []

    for v in ler_csv("dados-envolvido-ambiente.csv"):
        setores_ambiente[v["EAMB_AMBI_ID"]].append(v["EAMB_ENVO_ID"])
        itens.append({"PK": "CAT#VINC", "SK": f"AMBI#{v['EAMB_AMBI_ID']}#ENVO#{v['EAMB_ENVO_ID']}",
                      "tipo": "AMBI", "alvoId": v["EAMB_AMBI_ID"], "setorId": v["EAMB_ENVO_ID"]})
    for v in ler_csv("dados-envolvido-recurso.csv"):
        setor, recurso = v["EREC_ENVO_ID"], v["EREC_RECU_ID"]
        setores_recurso[recurso].append(setor)
        item = {"PK": "CAT#VINC", "SK": f"RECU#{recurso}#ENVO#{setor}",
                "tipo": "RECU", "alvoId": recurso, "setorId": setor}
        if (setor, recurso) in CODIGOS_SNP:
            item["codigoServicoSnp"] = CODIGOS_SNP[(setor, recurso)]
        itens.append(item)
    faltando = set(CODIGOS_SNP) - {(i["setorId"], i["alvoId"]) for i in itens if i["tipo"] == "RECU"}
    assert not faltando, f"Vínculos do R11.4 ausentes no CSV: {faltando}"
    for v in ler_csv("dados-vinculo-recurso.csv"):
        vinculos_recurso[v["VREC_RECU_ID"]].add(v["VREC_AMBI_ID"])

    for a, r in ambientes.items():
        item = {"PK": "CAT#AMBI", "SK": a, "id": a, "desc": r["AMBI_DESC"],
                "ativo": r["AMBI_ST_ATIVO"] == "S", "setores": sorted(setores_ambiente[a], key=int)}
        if r["AMBI_ID_PAI"]:
            item["paiId"] = r["AMBI_ID_PAI"]
        itens.append(item)
    disposicoes_ativas = []
    for r in ler_csv("dados-disposicao.csv"):
        itens.append({"PK": "CAT#DISP", "SK": r["DISP_ID"], "id": r["DISP_ID"], "desc": r["DISP_DESC"],
                      "ativo": r["DISP_ST_ATIVO"] == "S", "icone": r["DISP_ICONE_ARQUIVO"]})
        if r["DISP_ST_ATIVO"] == "S":
            disposicoes_ativas.append(r["DISP_ID"])
    for r in ler_csv("dados-grupo-recurso.csv"):
        itens.append({"PK": "CAT#GREC", "SK": r["GREC_ID"], "id": r["GREC_ID"], "desc": r["GREC_DESC"],
                      "ordem": int(r["GREC_ORDEM"]), "ativo": r["GREC_ST_ATIVO"] == "S"})
    for rid, r in recursos.items():
        itens.append({"PK": "CAT#RECU", "SK": rid, "id": rid, "desc": r["RECU_DESC"],
                      "grupoId": r["RECU_GREC_ID"], "limitado": r["RECU_ST_LIMITADO"] == "S",
                      "disponibilidade": int(r["RECU_DISPONIBILIDADE"]), "ativo": r["RECU_ST_ATIVO"] == "S",
                      "icone": r["RECU_ICONE_ARQUIVO"],
                      "ambientesVinculados": sorted(vinculos_recurso[rid], key=int),
                      "setores": sorted(setores_recurso[rid], key=int)})
    for r in ler_csv("dados-envolvido.csv"):
        itens.append({"PK": "CAT#ENVO", "SK": r["ENVO_ID"], "id": r["ENVO_ID"], "desc": r["ENVO_DESC"],
                      "email": r["ENVO_EMAIL"], "ativo": r["ENVO_ST_ATIVO"] == "S"})
    itens.append({"PK": "CAT#CONF", "SK": "GLOBAL", **CONFIG})

    return Catalogo(ambientes, recursos, setores_ambiente, setores_recurso, vinculos_recurso,
                    disposicoes_ativas, itens)


# --- Reservas e alocação --------------------------------------------------------------------


@dataclass
class Reserva:
    id: int
    periodos: list[tuple[datetime, datetime]]
    recursos: list[dict]
    sub: str
    email: str
    ambiente: str | None = None
    finalidade: str = ""
    participantes: int = 10
    disposicao: str | None = None
    complemento: str | None = None
    criado_em: datetime | None = None
    observacoes: list[str] = field(default_factory=list)


class Agenda:
    """Ocupações já alocadas, para escolher ambientes sem conflito (RN5, RN6) e conferir a RN8."""

    def __init__(self, catalogo: Catalogo):
        self.cat = catalogo
        self.ambientes: dict[str, list[tuple[datetime, datetime]]] = defaultdict(list)
        self.recursos: dict[str, list[tuple[datetime, datetime, int, int]]] = defaultdict(list)

    def ambiente_livre(self, ambiente: str, periodos) -> bool:
        for x in self.cat.familia(ambiente):
            for ini, fim in self.ambientes[x]:
                for novo_ini, novo_fim in periodos:
                    if novo_ini < fim + MARGEM and ini < novo_fim + MARGEM:
                        return False
        return True

    def recurso_cabe(self, recurso: str, qtd: int, periodos) -> bool:
        disponivel = int(self.cat.recursos[recurso]["RECU_DISPONIBILIDADE"])
        for novo_ini, novo_fim in periodos:
            # Uma reserva com vários períodos sobrepostos conta uma vez só (R4.2).
            por_reserva = {rid: q for ini, fim, q, rid in self.recursos[recurso]
                           if ini < novo_fim and novo_ini < fim}
            if sum(por_reserva.values()) + qtd > disponivel:
                return False
        return True

    def registrar(self, r: Reserva) -> None:
        if r.ambiente:
            self.ambientes[r.ambiente].extend(r.periodos)
        for item in r.recursos:
            if self.cat.recursos[item["recursoId"]]["RECU_ST_LIMITADO"] == "S":
                for ini, fim in r.periodos:
                    self.recursos[item["recursoId"]].append((ini, fim, item["qtd"], r.id))


def candidatos(cat: Catalogo, recursos: list[dict]) -> list[str]:
    """Ambientes ativos compatíveis com os recursos vinculados pedidos (RN9)."""
    ativos = {a for a, r in cat.ambientes.items() if r["AMBI_ST_ATIVO"] == "S"}
    for item in recursos:
        vinculos = cat.vinculos_recurso.get(item["recursoId"])
        if vinculos:
            ativos &= vinculos
    return sorted(ativos, key=int)


def dias_uteis(apos: date, quantos: int) -> list[date]:
    dias, d = [], apos
    while len(dias) < quantos:
        d += timedelta(days=1)
        if d.weekday() < 5:
            dias.append(d)
    return dias


def cenario_demo(data_demo: date, solicitante: tuple[str, str], proximo_id) -> list[Reserva]:
    """Reservas fixas do roteiro (design.md §11) e cards dos próximos dias (R11.6)."""
    d1, d2, d3, d4, d5 = dias_uteis(data_demo, 5)
    em = lambda dia, h1, m1, h2, m2: (datetime.combine(dia, time(h1, m1), FUSO),  # noqa: E731
                                      datetime.combine(dia, time(h2, m2), FUSO))
    coord = ("ficticio-coord", "coordenacao.eventos@example.com")
    especificacao = [
        # F-RN5, F-RN6 e F-RN8 (R11.6)
        (coord, "1", "Seminário institucional (F-RN5)", [em(d1, 9, 0, 11, 0)], [("3", 1)]),
        (coord, "5", "Treinamento de servidores (F-RN6)", [em(d1, 14, 0, 16, 0)], [("2", 1)]),
        (coord, "3", "Oficina de planejamento (F-RN8)", [em(d1, 14, 0, 16, 0)], [("6", 2)]),
        # Cards dos próximos dias para o SMSG (copa) e reservas do solicitante de demo.
        (FICTICIOS[0], "7", "Videoconferência com a PGR", [em(d1, 10, 0, 12, 0)], [("3", 1), ("76", 1)]),
        (FICTICIOS[1], "1", "Audiência pública", [em(d2, 14, 0, 17, 0)], [("2", 1), ("5", 1)]),
        (FICTICIOS[2], "28", "Palestra de integração", [em(d3, 9, 0, 11, 0)], [("1", 1)]),
        (solicitante, "3", "Reunião de alinhamento da equipe", [em(d3, 15, 0, 16, 30)], [("3", 1)]),
        (FICTICIOS[3], "6", "Sessão de mediação", [em(d4, 8, 30, 10, 0)], [("2", 1)]),
        (solicitante, "7", "Reunião com órgãos parceiros", [em(d5, 13, 0, 15, 0)], [("3", 1), ("8", 1)]),
    ]
    agora = datetime.now(FUSO)
    return [Reserva(id=proximo_id(), periodos=periodos, sub=sub, email=email, ambiente=ambiente,
                    finalidade=finalidade, participantes=20,
                    recursos=[{"recursoId": r, "qtd": q} for r, q in recursos],
                    disposicao="5", criado_em=agora)
            for (sub, email), ambiente, finalidade, periodos, recursos in especificacao]


def historicas(cat: Catalogo, rnd: random.Random) -> list[Reserva]:
    """Reservas do CSV, com recursos de dados-solicitacao.csv (R11.2)."""
    periodos = defaultdict(list)
    for p in ler_csv("dados-periodo-reserva.csv"):
        periodos[inteiro(p["PRES_RESE_ID"])].append(
            (data_csv(p["PRES_DTHR_INICIO"]), data_csv(p["PRES_DTHR_TERMINO"])))
    recursos = defaultdict(list)
    for s in ler_csv("dados-solicitacao.csv"):
        recursos[inteiro(s["SOLI_RESE_ID"])].append(
            {"recursoId": s["SOLI_RECU_ID"], "qtd": int(s["SOLI_QTD"]) if s["SOLI_QTD"] else 1})
    reservas = []
    for rid in sorted(periodos, key=lambda r: min(periodos[r])):
        sub, email = rnd.choice(FICTICIOS)
        reservas.append(Reserva(id=rid, periodos=sorted(periodos[rid]), recursos=recursos[rid],
                                sub=sub, email=email, finalidade=rnd.choice(FINALIDADES),
                                participantes=rnd.randint(5, 80),
                                disposicao=rnd.choice(cat.disposicoes_ativas),
                                criado_em=min(periodos[rid])[0] - timedelta(days=7)))
    return reservas


def alocar(cat: Catalogo, agenda: Agenda, r: Reserva) -> None:
    """Ambiente compatível (RN9) e livre (RN5, RN6); RN3/RN4 não se aplicam ao histórico (R11.3)."""
    for item in list(r.recursos):
        limitado = cat.recursos[item["recursoId"]]["RECU_ST_LIMITADO"] == "S"
        if limitado and not agenda.recurso_cabe(item["recursoId"], item["qtd"], r.periodos):
            r.recursos.remove(item)
            r.observacoes.append(f"recurso {item['recursoId']} retirado (RN8)")
    for ambiente in candidatos(cat, r.recursos):
        if agenda.ambiente_livre(ambiente, r.periodos):
            r.ambiente = ambiente
            break
    else:
        r.ambiente = None
        r.complemento = "Local próprio da unidade solicitante"
        r.recursos = [i for i in r.recursos if not cat.vinculos_recurso.get(i["recursoId"])]
        r.observacoes.append("local próprio")
    agenda.registrar(r)


def itens_da_reserva(cat: Catalogo, r: Reserva) -> list[dict]:
    """META, PER#n (AGENDA) e OCUP#… (design.md §3). O META vem primeiro."""
    setores = cat.setores(r.ambiente, r.recursos)
    rid = str(r.id)
    meta = {"PK": f"RESE#{rid}", "SK": "META", "GSI1PK": f"SOLI#{r.sub}", "GSI1SK": iso(r.criado_em),
            "id": rid, "finalidade": r.finalidade, "participantes": r.participantes,
            "periodos": [{"inicio": iso(i), "termino": iso(f)} for i, f in r.periodos],
            "recursos": r.recursos, "solicitanteSub": r.sub, "solicitanteEmail": r.email,
            "setoresIds": setores, "cancelada": False, "versao": 1, "criadoEm": iso(r.criado_em)}
    for chave, valor in (("ambienteId", r.ambiente), ("complemento", r.complemento),
                         ("disposicaoId", r.disposicao)):
        if valor is not None:
            meta[chave] = valor
    itens = [meta]
    for n, (ini, fim) in enumerate(r.periodos):
        per = {"PK": f"RESE#{rid}", "SK": f"PER#{n}", "GSI1PK": "AGENDA", "GSI1SK": f"{iso(ini)}#{rid}",
               "reservaId": rid, "inicio": iso(ini), "termino": iso(fim), "cancelada": False,
               "setoresIds": setores}
        if r.ambiente:
            per["ambienteId"] = r.ambiente
            itens.append({"PK": f"OCUP#AMBI#{r.ambiente}", "SK": f"{iso(ini)}#{rid}#{n}",
                          "reservaId": rid, "inicio": iso(ini), "termino": iso(fim)})
        itens.append(per)
        for item in r.recursos:
            if cat.recursos[item["recursoId"]]["RECU_ST_LIMITADO"] == "S":
                itens.append({"PK": f"OCUP#RECU#{item['recursoId']}", "SK": f"{iso(ini)}#{rid}#{n}",
                              "reservaId": rid, "inicio": iso(ini), "termino": iso(fim),
                              "qtd": item["qtd"]})
    return itens


# --- Gravação -------------------------------------------------------------------------------


def gravar(tabela, item: dict) -> bool:
    """Put condicional (R11.7). Devolve False se o item já existia."""
    try:
        tabela.put_item(Item=item, ConditionExpression="attribute_not_exists(PK)")
        return True
    except ClientError as erro:
        if erro.response["Error"]["Code"] == "ConditionalCheckFailedException":
            return False
        raise


def gravar_reserva(tabela, itens: list[dict]) -> str:
    if not gravar(tabela, itens[0]):
        return "existente"
    for item in itens[1:]:
        gravar(tabela, item)
    return "nova"


def sub_do_solicitante(pool_id: str) -> str:
    cognito = boto3.client("cognito-idp")
    try:
        usuario = cognito.admin_get_user(UserPoolId=pool_id, Username="solicitante@example.com")
    except cognito.exceptions.UserNotFoundException:
        sys.exit("A conta solicitante@example.com não existe: rode antes `bash scripts/cognito.sh`.")
    return next(a["Value"] for a in usuario["UserAttributes"] if a["Name"] == "sub")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--data-demo", type=date.fromisoformat, default=datetime.now(FUSO).date())
    parser.add_argument("--dry-run", action="store_true", help="só monta e conta os itens")
    args = parser.parse_args()

    load_dotenv(RAIZ / ".env")
    nome_tabela = os.environ.get("TABLE_NAME") or sys.exit("Falta TABLE_NAME no .env (tarefa 1.5).")
    pool_id = os.environ.get("COGNITO_USER_POOL_ID") or sys.exit("Falta COGNITO_USER_POOL_ID no .env.")

    rnd = random.Random(42)  # determinístico: a mesma execução gera os mesmos dados
    cat = montar_catalogo()
    solicitante = (sub_do_solicitante(pool_id) if not args.dry_run else "sub-dry-run",
                   "solicitante@example.com")

    historico = historicas(cat, rnd)
    ultimo_id = [max(r.id for r in historico)]

    def proximo_id() -> int:
        ultimo_id[0] += 1
        return ultimo_id[0]

    # Cenário de demo primeiro: as históricas é que desviam dele (R11.6).
    agenda = Agenda(cat)
    demo = cenario_demo(args.data_demo, solicitante, proximo_id)
    for r in demo:
        assert agenda.ambiente_livre(r.ambiente, r.periodos), f"cenário em conflito: {r.finalidade}"
        assert all(agenda.recurso_cabe(i["recursoId"], i["qtd"], r.periodos) for i in r.recursos
                   if cat.recursos[i["recursoId"]]["RECU_ST_LIMITADO"] == "S"), r.finalidade
        agenda.registrar(r)
    for r in historico:
        alocar(cat, agenda, r)

    # ≥ 3 reservas do solicitante de demo: as 2 do cenário + a primeira histórica (transcorrida).
    historico[0].sub, historico[0].email = solicitante

    reservas = demo + historico
    contadores = [{"PK": "CTR#RESE", "SK": "CTR", "valor": ultimo_id[0]},
                  {"PK": "CTR#SNP", "SK": "CTR", "valor": 0}]
    lotes = [itens_da_reserva(cat, r) for r in reservas]

    print(f"Data da demo: {args.data_demo} (D1 = {dias_uteis(args.data_demo, 1)[0]})")
    print(f"Catálogo: {len(cat.itens)} itens; reservas: {len(demo)} do cenário + {len(historico)} do CSV")
    print(f"  com ambiente: {sum(1 for r in reservas if r.ambiente)}; "
          f"local próprio: {sum(1 for r in reservas if not r.ambiente)}; "
          f"recursos retirados pela RN8: {sum('RN8' in o for r in reservas for o in r.observacoes)}")
    print(f"  itens de reserva: {sum(len(l) for l in lotes)}; CTR#RESE = {ultimo_id[0]}")
    if args.dry_run:
        return

    tabela = boto3.resource("dynamodb").Table(nome_tabela)
    with ThreadPoolExecutor(max_workers=16) as pool:
        novos_cat = sum(pool.map(lambda i: gravar(tabela, i), cat.itens + contadores))
        estados = list(pool.map(lambda l: gravar_reserva(tabela, l), lotes))
    print(f"Gravados: {novos_cat} itens de catálogo/contadores novos; "
          f"{estados.count('nova')} reservas novas, {estados.count('existente')} já existiam.")


if __name__ == "__main__":
    main()
