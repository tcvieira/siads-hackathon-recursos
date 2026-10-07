"""comum/auth.py: claims → Usuario, políticas de autorizar, máscara e log de decisão."""

import json
import sys
from contextlib import contextmanager

import pytest

from comum import auth
from comum.auth import Usuario, autorizar, mascarar_email, mascarar_para
from dominio.modelos import Periodo, Reserva


def reserva(sub="dono-sub", setores=("1", "2")) -> Reserva:
    return Reserva(id="900", finalidade="Reunião", participantes=10, ambienteId="3",
                   periodos=[Periodo("2026-11-10T14:00:00-03:00", "2026-11-10T16:00:00-03:00")],
                   recursos=[], solicitanteSub=sub, solicitanteEmail="solicitante@example.com",
                   setoresIds=list(setores), cancelada=False, versao=1,
                   criadoEm="2026-11-01T10:00:00-03:00")


ADMIN = Usuario("admin-sub", "admin@example.com", ["admin"])
DONO = Usuario("dono-sub", "solicitante@example.com", ["solicitante"])
OUTRO = Usuario("outro-sub", "outro@example.com", ["solicitante"])
ATENDENTE_SMSG = Usuario("at-sub", "atendente@example.com", ["atendente"], "1")
ATENDENTE_SELOG = Usuario("at3-sub", "selog@example.com", ["atendente"], "3")
ATENDENTE_SEM_SETOR = Usuario("at0-sub", "semsetor@example.com", ["atendente"], None)
SEM_GRUPO = Usuario("nada-sub", "nada@example.com", [])


@contextmanager
def log_capturado(capsys):
    """Aponta o handler do Logger (criado no import) para o stdout do capsys.

    Precisa rodar no corpo do teste: o capsys só troca o `sys.stdout` na fase de chamada.
    """
    handler = auth.logger.registered_handler
    anterior = handler.stream
    handler.stream = sys.stdout
    registros: list[dict] = []
    try:
        yield registros
    finally:
        handler.stream = anterior
        saida = capsys.readouterr().out
        registros.extend(json.loads(linha) for linha in saida.splitlines() if linha.strip())


# --- from_claims ---------------------------------------------------------------------------


@pytest.mark.parametrize("grupos, esperado", [
    ("[atendente]", ["atendente"]),
    ("[solicitante admin]", ["solicitante", "admin"]),
    ("[solicitante, admin]", ["solicitante", "admin"]),
    ("", []),
    ("[]", []),
    (["atendente", "admin"], ["atendente", "admin"]),
    (None, []),
])
def test_from_claims_grupos(grupos, esperado):
    claims = {"sub": "s1", "email": "a@example.com"}
    if grupos is not None:
        claims["cognito:groups"] = grupos
    assert Usuario.from_claims(claims).grupos == esperado


def test_from_claims_setor_e_campos():
    u = Usuario.from_claims({"sub": "s1", "email": "a@example.com", "cognito:groups": "[atendente]",
                             "custom:setorId": "2"})
    assert (u.sub, u.email, u.setorId) == ("s1", "a@example.com", "2")
    assert Usuario.from_claims({"sub": "s1"}).setorId is None
    assert Usuario.from_claims({"sub": "s1", "custom:setorId": ""}).setorId is None


def test_grupo_por_prioridade():
    assert Usuario("s", "e", ["solicitante", "admin", "atendente"]).grupo == "admin"
    assert Usuario("s", "e", ["solicitante", "atendente"]).grupo == "atendente"
    assert Usuario("s", "e", ["solicitante"]).grupo == "solicitante"
    assert SEM_GRUPO.grupo is None
    assert ADMIN.is_admin and not ADMIN.is_atendente and not ADMIN.is_solicitante


# --- autorizar -----------------------------------------------------------------------------


@pytest.mark.parametrize("acao", ["criar", "listar_minhas"])
def test_criar_e_listar_minhas(acao):
    assert autorizar(DONO, acao)
    assert autorizar(ADMIN, acao)
    assert not autorizar(ATENDENTE_SMSG, acao)
    assert not autorizar(SEM_GRUPO, acao)


def test_ler():
    r = reserva()
    assert autorizar(ADMIN, "ler", r)
    assert autorizar(DONO, "ler", r)
    assert autorizar(ATENDENTE_SMSG, "ler", r)          # setor 1 envolvido
    assert not autorizar(ATENDENTE_SELOG, "ler", r)     # setor 3 fora
    assert not autorizar(ATENDENTE_SEM_SETOR, "ler", r)
    assert not autorizar(OUTRO, "ler", r)
    assert not autorizar(DONO, "ler", None)


@pytest.mark.parametrize("acao", ["alterar", "cancelar"])
def test_alterar_e_cancelar(acao):
    r = reserva()
    assert autorizar(ADMIN, acao, r)
    assert autorizar(DONO, acao, r)
    assert not autorizar(OUTRO, acao, r)
    assert not autorizar(ATENDENTE_SMSG, acao, r)
    # Mesmo sub, mas sem o papel de solicitante.
    assert not autorizar(Usuario("dono-sub", "x@example.com", ["atendente"], "1"), acao, r)


@pytest.mark.parametrize("acao", ["listar_atendimento", "listar_notificacoes"])
def test_listagens_do_atendimento(acao):
    assert autorizar(ADMIN, acao)
    assert autorizar(ATENDENTE_SMSG, acao)
    assert not autorizar(ATENDENTE_SEM_SETOR, acao)
    assert not autorizar(DONO, acao)


def test_log_da_decisao_sem_email(capsys):
    with log_capturado(capsys) as registros:
        autorizar(ATENDENTE_SMSG, "ler", reserva())
        autorizar(OUTRO, "cancelar", reserva())
        autorizar(DONO, "criar")
    assert [r["decisao"] for r in registros] == ["allow", "deny", "allow"]
    primeiro = registros[0]
    assert primeiro["usuario"] == "at-sub"
    assert primeiro["grupo"] == "atendente"
    assert primeiro["acao"] == "ler"
    assert primeiro["reservaId"] == "900"
    assert registros[2].get("reservaId") is None  # o Powertools omite chaves com None
    assert all("@" not in json.dumps(r) for r in registros)


# --- máscara -------------------------------------------------------------------------------


def test_mascarar_email():
    assert mascarar_email("solicitante@example.com") == "s***@e***.com"
    assert mascarar_email("fulano@mpf.mp.br") == "f***@m***.br"
    assert mascarar_email("semarroba") == "s***"


def test_mascarar_para():
    r = reserva()
    assert mascarar_para(ADMIN, r).solicitanteEmail == "solicitante@example.com"
    assert mascarar_para(DONO, r).solicitanteEmail == "solicitante@example.com"
    mascarada = mascarar_para(ATENDENTE_SMSG, r)
    assert mascarada.solicitanteEmail == "s***@e***.com"
    assert mascarada is not r
    assert r.solicitanteEmail == "solicitante@example.com"  # original intacto
    assert mascarada.id == r.id and mascarada.periodos == r.periodos
