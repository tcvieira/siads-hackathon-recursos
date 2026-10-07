"""Conflitos de ambiente (RN5, RN6, RN7) e de recurso limitado (RN8)."""

from dataclasses import replace

import pytest

from catalogo_csv import carregar
from dominio.conflitos import conflitos_ambiente, excesso_recurso
from dominio.hierarquia import afetados
from dominio.modelos import CodigoErro, Ocupacao, Periodo

MARGEM = 30
DIA = "2026-11-10"


def per(ini: str, fim: str, dia: str = DIA) -> Periodo:
    return Periodo(f"{dia}T{ini}:00-03:00", f"{dia}T{fim}:00-03:00")


def ocup(ini: str, fim: str, reserva_id: str = "100", qtd: int = 1, dia: str = DIA) -> Ocupacao:
    p = per(ini, fim, dia)
    return Ocupacao(p.inicio, p.termino, reserva_id, qtd)


@pytest.fixture(scope="module")
def catalogo():
    return carregar()[0]


@pytest.fixture(scope="module")
def nomes(catalogo):
    return {a.id: a.desc for a in catalogo.ambientes}


def ocupacoes_para(ambiente_id, gravadas, catalogo):
    """O que o repositório leria: uma entrada por ambiente afetado (RN6)."""
    return {x: gravadas.get(x, []) for x in afetados(ambiente_id, catalogo.ambientes)}


# --- RN5 -----------------------------------------------------------------------------------


def test_rn5_margem_1120_bloqueado(nomes):
    erros = conflitos_ambiente([per("11:20", "12:00")], {"1": [ocup("09:00", "11:00")]}, MARGEM,
                               nomes=nomes)
    assert [e.codigo for e in erros] == [CodigoErro.CONFLITO_AMBIENTE]
    erro = erros[0]
    assert (erro.campo, erro.periodoIndex) == ("periodos", 0)
    assert "Auditório (Completo)" in erro.mensagem and "10/11 das 09:00 às 11:00" in erro.mensagem
    assert erro.sugestao == "livre a partir de 11:30"


def test_rn5_margem_1130_aceito():
    ocupacoes = {"1": [ocup("09:00", "11:00")]}
    bloqueado = conflitos_ambiente([per("11:20", "12:00")], ocupacoes, MARGEM)
    assert bloqueado[0].sugestao == "livre a partir de 11:30"
    assert conflitos_ambiente([per("11:30", "12:00")], ocupacoes, MARGEM) == []


def test_rn5_margem_antes_do_existente():
    ocupacoes = {"1": [ocup("09:00", "11:00")]}
    assert conflitos_ambiente([per("08:00", "08:40")], ocupacoes, MARGEM)
    assert conflitos_ambiente([per("08:00", "08:30")], ocupacoes, MARGEM) == []


def test_rn5_um_erro_por_periodo_e_sugestao_pelo_maior_termino():
    ocupacoes = {"1": [ocup("09:00", "10:00", "100"), ocup("10:30", "11:00", "101")]}
    erros = conflitos_ambiente([per("09:30", "10:30"), per("14:00", "15:00")], ocupacoes, MARGEM)
    assert [e.periodoIndex for e in erros] == [0]
    assert erros[0].sugestao == "livre a partir de 11:30"


def test_rn5_sugestao_em_outro_dia():
    ocupacoes = {"1": [ocup("18:00", "23:45")]}
    erros = conflitos_ambiente([per("19:00", "20:00")], ocupacoes, MARGEM)
    assert erros[0].sugestao == "livre a partir de 00:15 de 11/11"


def test_rn5_ignora_a_propria_reserva():
    ocupacoes = {"1": [ocup("09:00", "11:00", "100")]}
    assert conflitos_ambiente([per("10:00", "11:00")], ocupacoes, MARGEM, ignorar_id="100") == []


# --- RN6 -----------------------------------------------------------------------------------


def test_rn6_pai_filho(catalogo, nomes):
    gravadas = {"5": [ocup("14:00", "16:00")]}  # Auditório (Parte A)
    erros = conflitos_ambiente([per("15:00", "17:00")], ocupacoes_para("1", gravadas, catalogo),
                               MARGEM, nomes=nomes)
    assert [e.codigo for e in erros] == [CodigoErro.CONFLITO_AMBIENTE]
    assert "Auditório (Parte A)" in erros[0].mensagem


def test_rn6_filho_pai(catalogo):
    gravadas = {"1": [ocup("14:00", "16:00")]}
    assert conflitos_ambiente([per("15:00", "17:00")], ocupacoes_para("6", gravadas, catalogo),
                              MARGEM)


def test_rn6_irmaos_nao_conflitam(catalogo):
    gravadas = {"5": [ocup("14:00", "16:00")]}  # Parte A; a nova é na Parte B
    assert conflitos_ambiente([per("15:00", "17:00")], ocupacoes_para("6", gravadas, catalogo),
                              MARGEM) == []


# --- RN7 -----------------------------------------------------------------------------------


def test_rn7_segundo_salvamento(catalogo):
    """Dois usuários com Auditório 09:00–10:00: a revalidação do segundo vê o primeiro."""
    gravadas: dict[str, list[Ocupacao]] = {}
    pedido = [per("09:00", "10:00")]
    assert conflitos_ambiente(pedido, ocupacoes_para("1", gravadas, catalogo), MARGEM) == []
    gravadas.setdefault("1", []).append(ocup("09:00", "10:00", "200"))  # 1º salvamento
    erros = conflitos_ambiente(pedido, ocupacoes_para("1", gravadas, catalogo), MARGEM)
    assert [e.codigo for e in erros] == [CodigoErro.CONFLITO_AMBIENTE]


# --- RN8 -----------------------------------------------------------------------------------


@pytest.fixture
def projetor(catalogo):
    original = next(r for r in catalogo.recursos if r.id == "6")
    return replace(original, disponibilidade=3)


def test_rn8_projetor_2_bloqueado_1_aceito(projetor):
    ocupacoes = [ocup("14:00", "16:00", "300", qtd=2)]
    erros = excesso_recurso([per("15:00", "17:00")], projetor, ocupacoes, 2)
    assert [e.codigo for e in erros] == [CodigoErro.RECURSO_ESGOTADO]
    erro = erros[0]
    assert (erro.campo, erro.periodoIndex) == ("recursos", 0)
    assert "Projetor Multimídia Portátil" in erro.mensagem
    assert "disponível 1, pedida 2" in erro.mensagem
    assert excesso_recurso([per("15:00", "17:00")], projetor, ocupacoes, 1) == []


def test_rn8_encostado_nao_sobrepoe(projetor):
    ocupacoes = [ocup("14:00", "16:00", "300", qtd=3)]
    assert excesso_recurso([per("16:00", "17:00")], projetor, ocupacoes, 3) == []


def test_rn8_reserva_com_varios_periodos_conta_uma_vez(projetor):
    ocupacoes = [ocup("14:00", "15:00", "300", qtd=2), ocup("15:30", "16:30", "300", qtd=2)]
    assert excesso_recurso([per("14:00", "17:00")], projetor, ocupacoes, 1) == []
    assert excesso_recurso([per("14:00", "17:00")], projetor, ocupacoes, 2)


def test_rn8_ignora_a_propria_reserva_e_nao_limitado(catalogo, projetor):
    ocupacoes = [ocup("14:00", "16:00", "300", qtd=3)]
    assert excesso_recurso([per("14:00", "16:00")], projetor, ocupacoes, 3, ignorar_id="300") == []
    cafe = next(r for r in catalogo.recursos if r.id == "2")
    assert excesso_recurso([per("14:00", "16:00")], cafe, ocupacoes, 1) == []
