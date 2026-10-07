"""Handlers `catalogo` e `reservas` com eventos HTTP API v2 e a tabela simulada."""

from datetime import datetime

import pytest
from boto3.dynamodb.conditions import Key

from dominio.tempo import FUSO
from eventos import claims_de, corpo_json, evento_http
from handlers import catalogo, reservas

AGORA = datetime(2026, 11, 10, 8, 0, tzinfo=FUSO)
D = "2026-11-10T"
F = ":00-03:00"

SOLICITANTE = claims_de("solicitante", "sub-sol", "solicitante@example.com")
OUTRO = claims_de("solicitante", "sub-outro", "outro@example.com")
ADMIN = claims_de("admin", "sub-admin", "admin@example.com")
ATENDENTE_SMSG = claims_de("atendente", "sub-at1", "smsg@example.com", setorId="1")
ATENDENTE_SEART = claims_de("atendente", "sub-at2", "seart@example.com", setorId="2")


@pytest.fixture(autouse=True)
def relogio(monkeypatch):
    monkeypatch.setattr(reservas, "agora", lambda: AGORA)


def corpo(periodos=None, ambiente="3", recursos=None, **extra) -> dict:
    return {"finalidade": "Reunião de alinhamento", "participantes": 10, "ambienteId": ambiente,
            "periodos": periodos or [{"inicio": f"{D}14:00{F}", "termino": f"{D}16:00{F}"}],
            "recursos": recursos or [], **extra}


def per(ini: str, fim: str, dia: str = D) -> dict:
    return {"inicio": f"{dia}{ini}{F}", "termino": f"{dia}{fim}{F}"}


def chamar(metodo, caminho, corpo_=None, claims=SOLICITANTE, query=None, modulo=reservas):
    resp = modulo.handler(evento_http(metodo, caminho, corpo_, claims, query), None)
    return resp["statusCode"], corpo_json(resp)


def criar(claims=SOLICITANTE, **kw) -> dict:
    status, dados = chamar("POST", "/reservas", corpo(**kw), claims)
    assert status == 201, dados
    return dados


def assert_resposta_erro(dados: dict) -> None:
    assert list(dados) == ["erros"] and dados["erros"]
    for e in dados["erros"]:
        assert set(e) == {"campo", "codigo", "mensagem", "periodoIndex", "sugestao"}


# --- GET /catalogo -------------------------------------------------------------------------


def test_catalogo_so_ativos_sem_email(tabela):
    resp = catalogo.handler(evento_http("GET", "/catalogo", claims=SOLICITANTE), None)
    assert resp["statusCode"] == 200
    assert "email" not in resp["body"] and "@" not in resp["body"]
    dados = corpo_json(resp)
    assert set(dados) == {"ambientes", "disposicoes", "grupos", "recursos", "config"}
    assert all(a["ativo"] for a in dados["ambientes"]) and "2" not in {a["id"] for a in dados["ambientes"]}
    assert all(r["ativo"] for r in dados["recursos"])
    assert dados["config"] == {"faixaInicio": "07:00", "faixaFim": "20:00", "antecedenciaMin": 120,
                               "margemMin": 30}


def test_catalogo_sem_claims_403(tabela):
    status, dados = chamar("GET", "/catalogo", claims=None, modulo=catalogo)
    assert (status, dados) == (403, {"mensagem": "Acesso negado."})


# --- POST /reservas ------------------------------------------------------------------------


def test_criar_201_grava_meta_per_ocup_em_menos_3(tabela):
    dados = criar(periodos=[{"inicio": "2026-11-10T17:00:00Z", "termino": "2026-11-10T19:00:00Z"}],
                  recursos=[{"recursoId": "6", "qtd": 1}])
    assert dados["id"] == "17326" and dados["status"] == "prevista" and dados["versao"] == 1
    assert dados["periodos"] == [per("14:00", "16:00")]
    itens = {(i["PK"], i["SK"]): i for i in tabela.scan()["Items"]
             if "17326" in i["PK"] or i.get("reservaId") == "17326"}
    meta = itens[("RESE#17326", "META")]
    assert meta["GSI1PK"] == "SOLI#sub-sol" and meta["periodos"][0]["inicio"] == f"{D}14:00{F}"
    assert itens[("RESE#17326", "PER#0")]["GSI1PK"] == "AGENDA"
    assert itens[("RESE#17326", "PER#0")]["GSI1SK"] == f"{D}14:00{F}#17326"
    assert ("OCUP#AMBI#3", f"{D}14:00{F}#17326#0") in itens
    assert ("OCUP#RECU#6", f"{D}14:00{F}#17326#0") in itens


def test_criar_400_rn1_e_rn2(tabela):
    status, dados = chamar("POST", "/reservas", corpo(periodos=[per("14:00", "13:00")],
                                                     ambiente=None, recursos=[{"recursoId": "2",
                                                                               "qtd": 1}]))
    assert status == 400
    assert_resposta_erro(dados)
    assert {(e["campo"], e["codigo"], e["periodoIndex"]) for e in dados["erros"]} == {
        ("periodos", "PERIODO_INVALIDO", 0), ("complemento", "CAMPO_OBRIGATORIO", None)}


def test_criar_400_mais_de_5_periodos(tabela):
    periodos = [per(f"{h}:00", f"{h}:30") for h in range(10, 16)]
    status, dados = chamar("POST", "/reservas", corpo(periodos=periodos))
    assert status == 400
    assert_resposta_erro(dados)
    assert [(e["campo"], e["codigo"]) for e in dados["erros"]] == [("periodos", "PERIODO_INVALIDO")]


def test_criar_400_formato_invalido(tabela):
    status, dados = chamar("POST", "/reservas", corpo(
        periodos=[{"inicio": "amanhã", "termino": f"{D}16:00{F}"}], participantes=0,
        recursos=[{"recursoId": "6", "qtd": 0}]))
    assert status == 400
    assert_resposta_erro(dados)
    assert {(e["campo"], e["codigo"], e["periodoIndex"]) for e in dados["erros"]} == {
        ("periodos", "PERIODO_INVALIDO", 0), ("participantes", "CAMPO_OBRIGATORIO", None),
        ("recursos", "CAMPO_OBRIGATORIO", None)}


def test_criar_400_json_invalido(tabela):
    status, dados = chamar("POST", "/reservas", "{nao é json")
    assert status == 400
    assert_resposta_erro(dados)
    assert dados["erros"][0]["campo"] == "corpo"


def test_criar_409_rn5_com_sugestao(tabela):
    criar(periodos=[per("09:00", "11:00", "2026-11-11T")])
    status, dados = chamar("POST", "/reservas", corpo(periodos=[per("11:20", "12:00",
                                                                     "2026-11-11T")]))
    assert status == 409
    assert_resposta_erro(dados)
    assert dados["erros"][0]["codigo"] == "CONFLITO_AMBIENTE"
    assert dados["erros"][0]["periodoIndex"] == 0
    assert dados["erros"][0]["sugestao"] == "livre a partir de 11:30"


def test_criar_409_rn6_pai_filho(tabela):
    criar(ambiente="5")
    status, dados = chamar("POST", "/reservas", corpo(ambiente="1",
                                                     periodos=[per("15:00", "17:00")]))
    assert status == 409 and dados["erros"][0]["codigo"] == "CONFLITO_AMBIENTE"


def test_criar_409_rn8_recurso_esgotado(tabela):
    criar(recursos=[{"recursoId": "6", "qtd": 2}])
    status, dados = chamar("POST", "/reservas", corpo(ambiente="7", periodos=[per("15:00", "17:00")],
                                                     recursos=[{"recursoId": "6", "qtd": 1}]))
    assert status == 409 and [e["codigo"] for e in dados["erros"]] == ["RECURSO_ESGOTADO"]


def test_criar_409_rn7_segundo_salvamento(tabela):
    criar()
    status, dados = chamar("POST", "/reservas", corpo())
    assert status == 409 and dados["erros"][0]["codigo"] == "CONFLITO_AMBIENTE"


def test_criar_atendente_403(tabela):
    status, dados = chamar("POST", "/reservas", corpo(), ATENDENTE_SMSG)
    assert (status, dados) == (403, {"mensagem": "Acesso negado."})


# --- POST /reservas/validar ----------------------------------------------------------------


def test_validar_ok_e_conflito_sem_gravar(tabela):
    status, dados = chamar("POST", "/reservas/validar", corpo())
    assert (status, dados) == (200, {"ok": True, "erros": []})
    criar()
    status, dados = chamar("POST", "/reservas/validar", corpo())
    assert status == 200 and dados["ok"] is False
    assert [e["codigo"] for e in dados["erros"]] == ["CONFLITO_AMBIENTE"]
    sks = tabela.query(KeyConditionExpression=Key("PK").eq("OCUP#AMBI#3"))["Items"]
    assert len(sks) == 1


def test_validar_formato_invalido_vira_resultado(tabela):
    status, dados = chamar("POST", "/reservas/validar", "{")
    assert status == 200 and dados["ok"] is False and dados["erros"][0]["campo"] == "corpo"


def test_validar_modo_edicao_ignora_a_propria_e_exige_dono(tabela):
    r = criar()
    status, dados = chamar("POST", "/reservas/validar", corpo(periodos=[per("14:30", "16:30")]),
                           query={"reservaId": r["id"]})
    assert (status, dados) == (200, {"ok": True, "erros": []})
    status, dados = chamar("POST", "/reservas/validar", corpo(), OUTRO, query={"reservaId": r["id"]})
    assert (status, dados) == (403, {"mensagem": "Acesso negado."})
    status, dados = chamar("POST", "/reservas/validar", corpo(), query={"reservaId": "999"})
    assert (status, dados) == (404, {"mensagem": "Não encontrado."})


# --- GET /reservas e /reservas/{id} --------------------------------------------------------


def test_listar_minhas_com_status(tabela):
    criar()
    criar(claims=OUTRO, ambiente="7")
    status, dados = chamar("GET", "/reservas", query={"minhas": "1"})
    assert status == 200 and [r["ambienteId"] for r in dados] == ["3"]
    assert dados[0]["status"] == "prevista"


def test_obter_404_403_e_mascara(tabela):
    r = criar(recursos=[{"recursoId": "2", "qtd": 1}])  # setores 1 e 23
    assert chamar("GET", "/reservas/999") == (404, {"mensagem": "Não encontrado."})
    assert chamar("GET", f"/reservas/{r['id']}", claims=OUTRO) == (403, {"mensagem": "Acesso negado."})
    assert chamar("GET", f"/reservas/{r['id']}", claims=ATENDENTE_SEART)[0] == 403
    status, dados = chamar("GET", f"/reservas/{r['id']}", claims=ATENDENTE_SMSG)
    assert status == 200 and dados["solicitanteEmail"] == "s***@e***.com"
    assert dados["status"] == "prevista"
    status, dados = chamar("GET", f"/reservas/{r['id']}")
    assert status == 200 and dados["solicitanteEmail"] == "solicitante@example.com"


def test_rota_inexistente_404_generico(tabela):
    assert chamar("GET", "/nada") == (404, {"mensagem": "Não encontrado."})


# --- PUT /reservas/{id} --------------------------------------------------------------------


def test_alterar_ignora_a_propria_reserva(tabela):
    r = criar()
    status, dados = chamar("PUT", f"/reservas/{r['id']}", corpo(periodos=[per("14:30", "16:30")]))
    assert status == 200 and dados["versao"] == 2 and dados["id"] == r["id"]
    ocup = tabela.query(KeyConditionExpression=Key("PK").eq("OCUP#AMBI#3"))["Items"]
    assert [o["inicio"] for o in ocup] == [f"{D}14:30{F}"]


def test_alterar_transcorrida_409(tabela, monkeypatch):
    r = criar()
    monkeypatch.setattr(reservas, "agora", lambda: datetime(2026, 11, 10, 17, 0, tzinfo=FUSO))
    status, dados = chamar("PUT", f"/reservas/{r['id']}", corpo())
    assert status == 409
    assert_resposta_erro(dados)
    assert dados["erros"][0]["codigo"] == "RESERVA_ENCERRADA"


def test_alterar_de_outro_403_e_inexistente_404(tabela):
    r = criar()
    assert chamar("PUT", f"/reservas/{r['id']}", corpo(), OUTRO) == (403, {"mensagem": "Acesso negado."})
    assert chamar("PUT", "/reservas/999", corpo()) == (404, {"mensagem": "Não encontrado."})


# --- DELETE /reservas/{id} -----------------------------------------------------------------


def test_cancelar_sem_antecedencia_409(tabela, monkeypatch):
    r = criar()
    monkeypatch.setattr(reservas, "agora", lambda: datetime(2026, 11, 10, 13, 0, tzinfo=FUSO))
    status, dados = chamar("DELETE", f"/reservas/{r['id']}")
    assert status == 409 and dados["erros"][0]["codigo"] == "CANCELAMENTO_SEM_ANTECEDENCIA"


def test_cancelar_ok_libera_ocupacoes(tabela):
    r = criar(recursos=[{"recursoId": "6", "qtd": 1}])
    status, dados = chamar("DELETE", f"/reservas/{r['id']}")
    assert status == 200 and dados["cancelada"] is True and dados["status"] == "cancelada"
    for pk in ("OCUP#AMBI#3", "OCUP#RECU#6"):
        assert tabela.query(KeyConditionExpression=Key("PK").eq(pk))["Items"] == []
    per0 = tabela.get_item(Key={"PK": f"RESE#{r['id']}", "SK": "PER#0"})["Item"]
    assert per0["cancelada"] is True
    assert chamar("DELETE", f"/reservas/{r['id']}", claims=OUTRO)[0] == 403


def test_admin_altera_e_cancela_reserva_de_outro(tabela):
    r = criar()
    assert chamar("PUT", f"/reservas/{r['id']}", corpo(), ADMIN)[0] == 200
    status, dados = chamar("DELETE", f"/reservas/{r['id']}", claims=ADMIN)
    assert status == 200 and dados["solicitanteSub"] == "sub-sol"
