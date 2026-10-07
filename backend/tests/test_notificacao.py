"""Setores envolvidos, diff, e-mail simulado e SNP (RN10, RN11, RN12)."""

from dataclasses import replace

import pytest

from catalogo_csv import carregar
from dominio.modelos import Alteracao, ItemRecurso, Periodo, Reserva
from dominio.notificacao import (
    classificar_evento,
    diff_reservas,
    montar_email,
    numero_snp,
    precisa_snp,
    setores_envolvidos,
)

TS = "2026-11-01T10:00:00-03:00"


@pytest.fixture(scope="module")
def dados():
    return carregar()


@pytest.fixture(scope="module")
def catalogo(dados):
    return dados[0]


@pytest.fixture(scope="module")
def setores(dados):
    return {s.id: s for s in dados[1]}


@pytest.fixture(scope="module")
def vinculos(dados):
    return dados[2]


def reserva(**campos) -> Reserva:
    base = dict(id="17400", finalidade="Seminário institucional", participantes=40,
                ambienteId="3", disposicaoId="5",
                periodos=[Periodo("2026-11-10T14:00:00-03:00", "2026-11-10T16:00:00-03:00")],
                recursos=[ItemRecurso("2", 1), ItemRecurso("6", 2)],
                solicitanteSub="sub-1", solicitanteEmail="pessoa01@example.com",
                setoresIds=["1", "2", "3"], cancelada=False, versao=1, criadoEm=TS)
    base.update(campos)
    return Reserva(**base)


# --- RN10 ----------------------------------------------------------------------------------


def test_rn10_cafe_copa_recebe_email(catalogo, setores):
    envolvidos = setores_envolvidos(None, [ItemRecurso("2", 1)], catalogo)
    assert envolvidos == ["1"]
    r = reserva(ambienteId=None, complemento="Sala 304", recursos=[ItemRecurso("2", 1)])
    email = montar_email("criada", r, setores["1"], catalogo, TS)
    assert email.para == "PRCE-SMSG@mpf.mp.br"
    assert email.assunto == "[SISGARES] Reserva 17400 criada"
    assert (email.reservaId, email.setorId, email.ts, email.tipo) == ("17400", "1", TS, "criada")


def test_rn10_projetor_ti_recebe_email(catalogo, setores):
    assert "2" in setores_envolvidos(None, [ItemRecurso("6", 1)], catalogo)
    email = montar_email("criada", reserva(), setores["2"], catalogo, TS)
    assert email.para == "PRCE-ListaSEART@mpf.mp.br"


def test_setores_do_ambiente_e_dos_recursos(catalogo):
    ambiente = next(a for a in catalogo.ambientes if a.id == "3")
    envolvidos = setores_envolvidos("3", [ItemRecurso("6", 1)], catalogo)
    assert set(ambiente.setores) <= set(envolvidos)
    assert {"2", "3"} <= set(envolvidos)
    assert envolvidos == sorted(envolvidos, key=int)


# --- RN11 ----------------------------------------------------------------------------------


def test_rn11_projetor_ti_com_codigo_gera_snp(vinculos):
    assert precisa_snp("2", None, [ItemRecurso("6", 1)], vinculos) == "SNP-TI-0006"
    assert numero_snp(1, 2026) == "SNP-2026-00001"


def test_rn11_copa_sem_codigo_so_email(catalogo, vinculos):
    assert precisa_snp("1", "1", [ItemRecurso("2", 1)], vinculos) is None
    assert "1" in setores_envolvidos("1", [ItemRecurso("2", 1)], catalogo)


def test_rn11_vinculo_de_outro_setor_nao_conta(vinculos):
    assert precisa_snp("3", None, [ItemRecurso("6", 1)], vinculos) is None
    assert precisa_snp("3", None, [ItemRecurso("5", 1)], vinculos) == "SNP-LOG-0005"


# --- RN12: diff e classificação ------------------------------------------------------------


def test_rn12_horario_14_para_15_email_destaca(catalogo, setores):
    antes = reserva()
    depois = replace(antes, versao=2, periodos=[
        Periodo("2026-11-10T15:00:00-03:00", "2026-11-10T17:00:00-03:00")])
    tipo, alteracoes = classificar_evento("MODIFY", antes, depois, catalogo)
    assert tipo == "alterada"
    assert alteracoes == [Alteracao("Períodos", "10/11 14:00–16:00", "10/11 15:00–17:00")]
    email = montar_email(tipo, depois, setores["1"], catalogo, TS, alteracoes)
    assert email.alteracoes == alteracoes
    assert "<strong>ALTERADO:</strong> Períodos — <del" in email.html
    assert "10/11 14:00–16:00</del>" in email.html
    assert "10/11 15:00–17:00</ins>" in email.html
    assert 'style="color:' in email.html


def test_rn12_modify_sem_diferenca_ignorado(catalogo):
    antes = reserva()
    depois = replace(antes, versao=2, recursos=list(reversed(antes.recursos)))
    assert classificar_evento("MODIFY", antes, depois, catalogo) is None


def test_classificar_insert_cancelamento_e_remove(catalogo):
    r = reserva()
    assert classificar_evento("INSERT", None, r, catalogo) == ("criada", [])
    assert classificar_evento("MODIFY", r, replace(r, cancelada=True), catalogo) == ("cancelada", [])
    assert classificar_evento("REMOVE", r, None, catalogo) is None


def test_diff_campos_legiveis(catalogo):
    antes = reserva()
    depois = replace(antes, ambienteId=None, complemento="Sala 304", disposicaoId=None,
                     finalidade="Audiência pública", participantes=12,
                     recursos=[ItemRecurso("2", 1), ItemRecurso("6", 1)])
    por_campo = {a.campo: (a.antes, a.depois) for a in diff_reservas(antes, depois, catalogo)}
    assert por_campo["Ambiente"] == ("Sala de Reuniões - 9º andar", "Local próprio: Sala 304")
    assert por_campo["Disposição"][1] == "Não informada"
    assert por_campo["Finalidade"] == ("Seminário institucional", "Audiência pública")
    assert por_campo["Participantes"] == ("40", "12")
    assert "Projetor Multimídia Portátil (2)" in por_campo["Recursos"][0]
    assert "Projetor Multimídia Portátil (1)" in por_campo["Recursos"][1]
    assert "Períodos" not in por_campo


# --- HTML ----------------------------------------------------------------------------------


def test_email_html_semantico_sem_email_do_solicitante(catalogo, setores):
    html = montar_email("criada", reserva(), setores["1"], catalogo, TS).html
    assert '<html lang="pt-BR">' in html and "<h1>" in html and "<dl>" in html
    assert "pessoa01@example.com" not in html


def test_email_escapa_script_na_finalidade(catalogo, setores):
    r = reserva(finalidade="<script>alert(1)</script>")
    alteracoes = [Alteracao("Finalidade", "<b>x</b>", "<script>alert(1)</script>")]
    html = montar_email("alterada", r, setores["1"], catalogo, TS, alteracoes).html
    assert "<script>" not in html and "<b>x</b>" not in html
    assert "&lt;script&gt;alert(1)&lt;/script&gt;" in html
