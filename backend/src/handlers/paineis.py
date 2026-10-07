"""Lambda `paineis`: /ambientes/{id}/ocupacao, /painel/atendimento e /notificacoes
(design.md §4; R7, R8, R9).

`de`/`ate` são ISO 8601 (qualquer offset; sem offset = −03:00). Sem eles, a janela é de hoje
00:00 a hoje + 7 dias. A ocupação não expõe dados da reserva; atendente vê só o seu setor e o
e-mail do solicitante mascarado.
"""

from datetime import datetime, timedelta

from aws_lambda_powertools.event_handler import APIGatewayHttpResolver

from comum.auth import Usuario, autorizar, mascarar_para
from comum.http import (
    nao_encontrado,
    proibido,
    registrar_erros,
    requisicao_invalida,
    resposta,
    usuario_do_evento,
)
from comum.repo import obter_repo
from dominio import hierarquia, regras
from dominio.modelos import (
    CaixaNotificacoes,
    CardAtendimento,
    CodigoErro,
    Erro,
    PedidoSnp,
    PeriodoOcupado,
)
from dominio.tempo import FUSO, para_datetime, para_iso

JANELA_PADRAO = timedelta(days=7)

app = APIGatewayHttpResolver()
registrar_erros(app)


def agora() -> datetime:
    return datetime.now(FUSO)


def _janela() -> tuple[datetime, datetime]:
    """`?de&ate` → datetimes em −03:00; inválidos → 400 `PERIODO_INVALIDO` no campo."""
    evento = app.current_event
    erros: list[Erro] = []
    valores: dict[str, datetime | None] = {}
    for campo in ("de", "ate"):
        texto = evento.get_query_string_value(campo)
        try:
            valores[campo] = para_datetime(texto) if texto else None
        except ValueError:
            valores[campo] = None
            erros.append(Erro(campo, CodigoErro.PERIODO_INVALIDO,
                              f"Informe '{campo}' como data e hora ISO 8601 "
                              "(ex.: 2026-11-10T00:00:00-03:00)."))
    if erros:
        raise requisicao_invalida(erros)
    de = valores["de"] or agora().replace(hour=0, minute=0, second=0, microsecond=0)
    ate = valores["ate"] or de + JANELA_PADRAO
    if ate <= de:
        raise requisicao_invalida([Erro("ate", CodigoErro.PERIODO_INVALIDO,
                                        "'ate' deve ser depois de 'de'.")])
    return de, ate


def _do_setor(usuario: Usuario, pedidos: list[PedidoSnp]) -> list[PedidoSnp]:
    return pedidos if usuario.is_admin else [p for p in pedidos if p.setorId == usuario.setorId]


@app.get("/ambientes/<ambiente_id>/ocupacao")
def ocupacao(ambiente_id: str):
    """Períodos ocupados do ambiente, ancestrais e descendentes (RN6), sem dados da reserva."""
    usuario_do_evento(app)  # qualquer autenticado
    repo = obter_repo()
    ambientes = repo.carregar_cadastros().catalogo.ambientes
    if not any(a.id == ambiente_id for a in ambientes):
        raise nao_encontrado()
    de, ate = _janela()
    ocupados = [PeriodoOcupado(ambienteId=x, inicio=o.inicio, termino=o.termino)
                for x in hierarquia.afetados(ambiente_id, ambientes)
                for o in repo.ocupacoes_ambiente(x, para_iso(ate), consistente=False)
                if para_datetime(o.termino) > de]
    ocupados.sort(key=lambda p: (para_datetime(p.inicio), p.ambienteId))
    return resposta(ocupados)


@app.get("/painel/atendimento")
def atendimento():
    """Cards das reservas com período na janela (R8), com pedidos SNP."""
    usuario = usuario_do_evento(app)
    if not autorizar(usuario, "listar_atendimento"):
        raise proibido()
    de, ate = _janela()
    repo, momento = obter_repo(), agora()
    ids = [p.reservaId for p in repo.agenda(para_iso(de), para_iso(ate))
           if not p.cancelada and (usuario.is_admin or usuario.setorId in p.setoresIds)]
    cards = []
    for r in repo.obter_metas(ids):
        r.status = regras.status(r, momento)
        cards.append(CardAtendimento(reserva=mascarar_para(usuario, r),
                                     pedidosSnp=_do_setor(usuario, repo.pedidos_snp(r.id))))
    cards.sort(key=lambda c: min(para_datetime(p.inicio) for p in c.reserva.periodos))
    return resposta(cards)


@app.get("/notificacoes")
def notificacoes():
    """E-mails simulados da janela e os pedidos SNP das reservas citadas (atendente: só o setor)."""
    usuario = usuario_do_evento(app)
    if not autorizar(usuario, "listar_notificacoes"):
        raise proibido()
    de, ate = _janela()
    repo = obter_repo()
    emails = [e for e in repo.notificacoes(para_iso(de), para_iso(ate))
              if usuario.is_admin or e.setorId == usuario.setorId]
    pedidos = [p for rid in dict.fromkeys(e.reservaId for e in emails)
               for p in _do_setor(usuario, repo.pedidos_snp(rid))]
    return resposta(CaixaNotificacoes(emails=emails, pedidosSnp=pedidos))


def handler(event, context):
    return app.resolve(event, context)
