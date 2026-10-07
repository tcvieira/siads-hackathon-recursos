"""Lambda `notificacoes`: consumidor do DynamoDB Stream (design.md §6; R6, RN10, RN11, RN12).

Para cada INSERT/MODIFY de `RESE#<id>` / `META`, grava um `EMAIL#<ts>#<setor>#<eventID>` por setor
envolvido e faz o upsert dos `SNP#<setor>`, tudo na mesma transação do marcador `EVT#<eventID>`
(idempotente entre retentativas). MODIFY sem diferença e REMOVE não geram nada. Erros inesperados
sobem: o event source faz bisect do lote e retenta.
"""

from datetime import datetime

from aws_lambda_powertools import Logger

from comum.repo import Cadastros, Repositorio, obter_repo, reserva_de_imagem
from dominio.modelos import PedidoSnp
from dominio.notificacao import classificar_evento, montar_email, numero_snp, precisa_snp
from dominio.tempo import FUSO, para_iso

logger = Logger()


def _chave_meta(registro: dict) -> str | None:
    """Id da reserva se a chave do registro for `RESE#<id>` / `META`; senão None."""
    chaves = registro.get("dynamodb", {}).get("Keys", {})
    pk, sk = chaves.get("PK", {}).get("S", ""), chaves.get("SK", {}).get("S", "")
    if sk != "META" or not pk.startswith("RESE#"):
        return None
    return pk.removeprefix("RESE#")


def _pedidos(tipo: str, depois, existentes: dict[str, PedidoSnp], cad: Cadastros,
             repo: Repositorio, ano: int) -> list[PedidoSnp]:
    """Pedidos SNP a gravar: ativos para os setores com código (RN11); cancela os que saíram."""
    pedidos: dict[str, PedidoSnp] = {}
    if tipo != "cancelada":
        for setor in depois.setoresIds:
            codigo = precisa_snp(setor, depois.ambienteId, depois.recursos, cad.vinculos)
            if codigo is None:
                continue
            atual = existentes.get(setor)
            numero = atual.numero if atual else numero_snp(repo.proximo_numero("SNP"), ano)
            pedidos[setor] = PedidoSnp(reservaId=depois.id, setorId=setor, numero=numero,
                                       codigoServico=codigo, situacao="ativo")
    for setor, atual in existentes.items():
        if setor not in pedidos and atual.situacao == "ativo":
            pedidos[setor] = PedidoSnp(reservaId=atual.reservaId, setorId=setor,
                                       numero=atual.numero, codigoServico=atual.codigoServico,
                                       situacao="cancelado")
    return list(pedidos.values())


def _processar(registro: dict, cad: Cadastros, repo: Repositorio) -> None:
    event_id, nome = registro["eventID"], registro["eventName"]
    if nome == "REMOVE":
        return
    reserva_id = _chave_meta(registro)
    if reserva_id is None:
        return
    dados = registro["dynamodb"]
    antes = reserva_de_imagem(dados["OldImage"]) if "OldImage" in dados else None
    depois = reserva_de_imagem(dados["NewImage"]) if "NewImage" in dados else None
    classificacao = classificar_evento(nome, antes, depois, cad.catalogo)
    if classificacao is None:
        logger.info("stream_ignorado", reservaId=reserva_id, eventID=event_id)
        return
    tipo, alteracoes = classificacao

    momento = datetime.fromtimestamp(float(dados["ApproximateCreationDateTime"]), FUSO)
    ts = para_iso(momento)
    setores = set(depois.setoresIds)
    if tipo == "alterada":
        setores |= set(antes.setoresIds)
    emails = [montar_email(tipo, depois, cad.setores[s], cad.catalogo, ts, alteracoes)
              for s in sorted(setores, key=lambda s: (len(s), s)) if s in cad.setores]

    existentes = {p.setorId: p for p in repo.pedidos_snp(reserva_id)}
    pedidos = _pedidos(tipo, depois, existentes, cad, repo, momento.year)

    if repo.gravar_notificacoes(reserva_id, event_id, emails, pedidos):
        logger.info("stream_processado", reservaId=reserva_id, eventID=event_id, tipo=tipo)
    else:
        logger.info("stream_ja_processado", reservaId=reserva_id, eventID=event_id, tipo=tipo)


def handler(event, context):
    registros = event.get("Records", [])
    if not registros:
        return None
    repo = obter_repo()
    cad = repo.carregar_cadastros()  # uma vez por invocação
    for registro in registros:
        _processar(registro, cad, repo)
    return None
