"""Lambda `reservas`: /reservas, /reservas/validar e /reservas/{id} (design.md §4; R2–R5, R9).

A regra de negócio fica em `comum/servico.py`; aqui só autorização, leitura do corpo e status
HTTP. Os cadastros são carregados uma vez por invocação. `agora()` é função de módulo para os
testes fixarem o relógio.
"""

from datetime import datetime

from aws_lambda_powertools.event_handler import APIGatewayHttpResolver

from comum import servico
from comum.auth import autorizar, mascarar_para
from comum.http import (
    ErroApi,
    ler_reserva_entrada,
    nao_encontrado,
    proibido,
    registrar_erros,
    resposta,
    usuario_do_evento,
)
from comum.repo import obter_repo
from dominio import regras
from dominio.modelos import Reserva, ResultadoValidacao
from dominio.tempo import FUSO

app = APIGatewayHttpResolver()
registrar_erros(app)


def agora() -> datetime:
    return datetime.now(FUSO)


def _reserva_existente(reserva_id: str) -> Reserva:
    reserva = obter_repo().obter_reserva(reserva_id)
    if reserva is None:
        raise nao_encontrado()
    return reserva


@app.post("/reservas/validar")
def validar():
    """Dry-run (200 `ResultadoValidacao`). `?reservaId=` ativa o modo edição."""
    usuario = usuario_do_evento(app)
    reserva_id = app.current_event.get_query_string_value("reservaId")
    antiga = None
    if reserva_id:
        antiga = _reserva_existente(reserva_id)
        if not autorizar(usuario, "alterar", antiga):
            raise proibido()
    elif not autorizar(usuario, "criar"):
        raise proibido()
    try:
        entrada = ler_reserva_entrada(app.current_event.decoded_body)
    except ErroApi as erro:  # erros de formato também saem como resultado da validação
        return resposta(ResultadoValidacao(ok=False, erros=erro.erros))
    repo = obter_repo()
    erros = servico.validar(entrada, repo.carregar_cadastros(), repo, agora(), antiga)
    return resposta(ResultadoValidacao(ok=not erros, erros=erros))


@app.post("/reservas")
def criar():
    usuario = usuario_do_evento(app)
    if not autorizar(usuario, "criar"):
        raise proibido()
    entrada = ler_reserva_entrada(app.current_event.decoded_body)
    repo = obter_repo()
    reserva = servico.criar(entrada, usuario, repo.carregar_cadastros(), repo, agora())
    return resposta(reserva, 201)


@app.get("/reservas")
def listar_minhas():
    usuario = usuario_do_evento(app)
    if not autorizar(usuario, "listar_minhas"):
        raise proibido()
    momento = agora()
    reservas = obter_repo().listar_por_solicitante(usuario.sub)
    for r in reservas:
        r.status = regras.status(r, momento)
    return resposta(reservas)


@app.get("/reservas/<reserva_id>")
def obter(reserva_id: str):
    usuario = usuario_do_evento(app)
    reserva = _reserva_existente(reserva_id)
    if not autorizar(usuario, "ler", reserva):
        raise proibido()
    reserva.status = regras.status(reserva, agora())
    return resposta(mascarar_para(usuario, reserva))


@app.put("/reservas/<reserva_id>")
def alterar(reserva_id: str):
    usuario = usuario_do_evento(app)
    antiga = _reserva_existente(reserva_id)
    if not autorizar(usuario, "alterar", antiga):
        raise proibido()
    entrada = ler_reserva_entrada(app.current_event.decoded_body)
    repo = obter_repo()
    reserva = servico.alterar(antiga, entrada, usuario, repo.carregar_cadastros(), repo, agora())
    return resposta(reserva)


@app.delete("/reservas/<reserva_id>")
def cancelar(reserva_id: str):
    usuario = usuario_do_evento(app)
    reserva = _reserva_existente(reserva_id)
    if not autorizar(usuario, "cancelar", reserva):
        raise proibido()
    repo = obter_repo()
    return resposta(servico.cancelar(reserva, repo.carregar_cadastros(), repo, agora()))


def handler(event, context):
    return app.resolve(event, context)
