"""Handler `paineis`: ocupação (RN6), painel de atendimento (R8) e notificações (R9)."""

from datetime import datetime

import pytest

from comum import servico
from comum.auth import Usuario
from comum.repo import obter_repo
from dominio.modelos import EmailSimulado, ItemRecurso, PedidoSnp, Periodo, ReservaEntrada
from dominio.tempo import FUSO
from eventos import claims_de, corpo_json, evento_http
from handlers import paineis

AGORA = datetime(2026, 11, 10, 8, 0, tzinfo=FUSO)
D = "2026-11-10T"
F = ":00-03:00"
JANELA = {"de": "2026-11-10T00:00:00-03:00", "ate": "2026-11-12T00:00:00-03:00"}

SOLICITANTE = claims_de("solicitante", "sub-sol", "solicitante@example.com")
ADMIN = claims_de("admin", "sub-admin", "admin@example.com")
ATENDENTE_SMSG = claims_de("atendente", "sub-at1", "smsg@example.com", setorId="1")
ATENDENTE_SEART = claims_de("atendente", "sub-at2", "seart@example.com", setorId="2")
DONO = Usuario("sub-sol", "solicitante@example.com", ["solicitante"])


@pytest.fixture(autouse=True)
def relogio(monkeypatch):
    monkeypatch.setattr(paineis, "agora", lambda: AGORA)


@pytest.fixture
def repo(tabela):
    return obter_repo()


def criar(repo, ambiente="3", ini="14:00", fim="16:00", recursos=(), dia=D):
    entrada = ReservaEntrada(finalidade="Reunião", participantes=5, ambienteId=ambiente,
                             periodos=[Periodo(f"{dia}{ini}{F}", f"{dia}{fim}{F}")],
                             recursos=list(recursos), complemento=None if ambiente else "Sala 3")
    return servico.criar(entrada, DONO, repo.carregar_cadastros(), repo, AGORA)


def chamar(caminho, claims=SOLICITANTE, query=None):
    resp = paineis.handler(evento_http("GET", caminho, claims=claims, query=query), None)
    return resp["statusCode"], corpo_json(resp)


# --- /ambientes/{id}/ocupacao --------------------------------------------------------------


def test_ocupacao_auditorio_inclui_partes_a_e_b(repo):
    criar(repo, "1", "09:00", "10:00", dia="2026-11-11T")
    criar(repo, "5", "14:00", "15:00")
    criar(repo, "6", "16:00", "17:00")
    criar(repo, "3", "14:00", "15:00")  # outro ambiente: fora
    status, dados = chamar("/ambientes/1/ocupacao", query=JANELA)
    assert status == 200
    assert [(o["ambienteId"], o["inicio"]) for o in dados] == [
        ("5", f"{D}14:00{F}"), ("6", f"{D}16:00{F}"), ("1", f"2026-11-11T09:00{F}")]
    assert all(set(o) == {"ambienteId", "inicio", "termino"} for o in dados)


def test_ocupacao_parte_a_inclui_auditorio_e_nao_a_irma(repo):
    criar(repo, "1", "09:00", "10:00", dia="2026-11-11T")
    criar(repo, "6", "16:00", "17:00")
    status, dados = chamar("/ambientes/5/ocupacao", query=JANELA)
    assert status == 200 and [o["ambienteId"] for o in dados] == ["1"]
    assert "reservaId" not in dados[0]


def test_ocupacao_janela_padrao_e_filtro_de_termino(repo):
    criar(repo, "3", "14:00", "16:00")
    criar(repo, "3", "14:00", "16:00", dia="2026-11-20T")  # além de hoje + 7 dias
    status, dados = chamar("/ambientes/3/ocupacao")
    assert status == 200 and [o["inicio"] for o in dados] == [f"{D}14:00{F}"]
    status, dados = chamar("/ambientes/3/ocupacao",
                           query={"de": f"{D}16:00{F}", "ate": "2026-11-12T00:00:00-03:00"})
    assert dados == []  # termina exatamente em `de`


def test_ocupacao_ambiente_inexistente_404_e_data_invalida_400(repo):
    assert chamar("/ambientes/999/ocupacao") == (404, {"mensagem": "Não encontrado."})
    status, dados = chamar("/ambientes/3/ocupacao", query={"de": "ontem"})
    assert status == 400 and list(dados) == ["erros"]
    assert [(e["campo"], e["codigo"]) for e in dados["erros"]] == [("de", "PERIODO_INVALIDO")]


# --- /painel/atendimento -------------------------------------------------------------------


def test_atendimento_atendente_ve_so_o_setor_mascarado(repo):
    copa = criar(repo, None, "15:00", "16:00", recursos=[ItemRecurso("2", 1)])  # SMSG (1)
    ti = criar(repo, None, "10:00", "11:00", recursos=[ItemRecurso("8", 1)])  # SEART (2)
    sala = criar(repo, "3", "14:00", "15:00")  # SMSG e SESOT
    repo.gravar_notificacoes(copa.id, "evt-1", [], [
        PedidoSnp(copa.id, "1", "SNP-2026-00001", "X", "ativo"),
        PedidoSnp(copa.id, "2", "SNP-2026-00002", "Y", "ativo")])
    status, dados = chamar("/painel/atendimento", ATENDENTE_SMSG, JANELA)
    assert status == 200
    assert [c["reserva"]["id"] for c in dados] == [sala.id, copa.id]
    assert ti.id not in {c["reserva"]["id"] for c in dados}
    assert all(c["reserva"]["solicitanteEmail"] == "s***@e***.com" for c in dados)
    assert all("1" in c["reserva"]["setoresIds"] for c in dados)
    assert dados[0]["reserva"]["status"] == "prevista"
    assert [p["setorId"] for p in dados[1]["pedidosSnp"]] == ["1"]


def test_atendimento_admin_ve_todas_sem_mascara_e_sem_canceladas(repo):
    a = criar(repo, "3", "14:00", "15:00")
    b = criar(repo, "7", "10:00", "11:00")
    c = criar(repo, "28", "10:00", "11:00")
    servico.cancelar(c, repo.carregar_cadastros(), repo, AGORA)
    status, dados = chamar("/painel/atendimento", ADMIN, JANELA)
    assert status == 200 and [x["reserva"]["id"] for x in dados] == [b.id, a.id]
    assert dados[0]["reserva"]["solicitanteEmail"] == "solicitante@example.com"


def test_atendimento_solicitante_403(repo):
    assert chamar("/painel/atendimento", SOLICITANTE, JANELA) == (403, {"mensagem": "Acesso negado."})


def test_atendimento_inclui_periodo_que_comecou_antes_de_de(repo):
    """Período de 10/11 18:00 a 11/11 09:00 (RN1) aparece no painel de 11/11."""
    entrada = ReservaEntrada(finalidade="Plantão", participantes=5, ambienteId="3",
                             periodos=[Periodo(f"{D}18:00{F}", f"2026-11-11T09:00{F}")],
                             recursos=[])
    noite = servico.criar(entrada, DONO, repo.carregar_cadastros(), repo, AGORA)
    criar(repo, "7", "10:00", "11:00")  # termina antes de `de`: fora
    status, dados = chamar("/painel/atendimento", ADMIN,
                           {"de": f"2026-11-11T00:00{F}", "ate": f"2026-11-12T00:00{F}"})
    assert status == 200 and [c["reserva"]["id"] for c in dados] == [noite.id]


def test_atendimento_refiltra_pelo_meta(repo, tabela):
    """O PER# do GSI pode estar atrasado; setor e cancelamento valem pelo META."""
    sala = criar(repo, "3", "14:00", "15:00")  # SMSG (1) e SESOT (23)
    outra = criar(repo, "7", "10:00", "11:00")
    tabela.update_item(Key={"PK": f"RESE#{sala.id}", "SK": "META"},
                       UpdateExpression="SET setoresIds = :s",
                       ExpressionAttributeValues={":s": ["23"]})
    tabela.update_item(Key={"PK": f"RESE#{outra.id}", "SK": "META"},
                       UpdateExpression="SET cancelada = :c",
                       ExpressionAttributeValues={":c": True})
    assert chamar("/painel/atendimento", ATENDENTE_SMSG, JANELA) == (200, [])
    status, dados = chamar("/painel/atendimento", ADMIN, JANELA)
    assert [c["reserva"]["id"] for c in dados] == [sala.id]


# --- /notificacoes -------------------------------------------------------------------------


def email(reserva_id: str, setor: str, ts: str) -> EmailSimulado:
    return EmailSimulado(reservaId=reserva_id, ts=ts, setorId=setor, para=f"setor{setor}@example.com",
                         assunto=f"[SISGARES] Reserva {reserva_id} criada", tipo="criada",
                         html="<p>x</p>")


def test_notificacoes_filtradas_por_setor(repo):
    repo.gravar_notificacoes("100", "evt-a", [email("100", "1", f"{D}09:00{F}"),
                                              email("100", "2", f"{D}09:00{F}")],
                             [PedidoSnp("100", "2", "SNP-2026-00001", "SNP-TI-0006", "ativo")])
    repo.gravar_notificacoes("200", "evt-b", [email("200", "2", f"{D}10:00{F}")], [])
    repo.gravar_notificacoes("300", "evt-c", [email("300", "1", f"2026-11-20T10:00{F}")], [])

    status, dados = chamar("/notificacoes", ATENDENTE_SEART, JANELA)
    assert status == 200 and set(dados) == {"emails", "pedidosSnp"}
    assert [(e["reservaId"], e["setorId"]) for e in dados["emails"]] == [("100", "2"), ("200", "2")]
    assert [p["numero"] for p in dados["pedidosSnp"]] == ["SNP-2026-00001"]

    status, dados = chamar("/notificacoes", ATENDENTE_SMSG, JANELA)
    assert [(e["reservaId"], e["setorId"]) for e in dados["emails"]] == [("100", "1")]
    assert dados["pedidosSnp"] == []

    status, dados = chamar("/notificacoes", ADMIN, JANELA)
    assert len(dados["emails"]) == 3 and len(dados["pedidosSnp"]) == 1


def test_notificacoes_solicitante_403(repo):
    assert chamar("/notificacoes", SOLICITANTE) == (403, {"mensagem": "Acesso negado."})
