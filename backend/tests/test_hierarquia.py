"""Hierarquia de ambientes (RN6) com o catálogo dos CSVs do caso."""

import pytest

from catalogo_csv import carregar
from dominio.hierarquia import afetados, ancestrais, descendentes, raiz
from dominio.modelos import Ambiente


@pytest.fixture(scope="module")
def ambientes():
    catalogo, _, _ = carregar()
    return catalogo.ambientes


def test_auditorio_completo_afeta_as_duas_partes(ambientes):
    assert afetados("1", ambientes) == {"1", "5", "6"}


def test_parte_a_afeta_o_pai_mas_nao_a_irma(ambientes):
    assert afetados("5", ambientes) == {"5", "1"}


def test_raiz_da_parte_b_e_o_auditorio(ambientes):
    assert raiz("6", ambientes) == "1"
    assert ancestrais("6", ambientes) == ["1"]


def test_ambiente_sem_pai_nem_filhos(ambientes):
    assert afetados("3", ambientes) == {"3"}
    assert raiz("3", ambientes) == "3"
    assert ancestrais("3", ambientes) == []
    assert descendentes("3", ambientes) == []


def test_descendentes_em_varios_niveis():
    ambientes = [Ambiente("a", "A", True), Ambiente("b", "B", True, paiId="a"),
                 Ambiente("c", "C", False, paiId="b")]
    assert descendentes("a", ambientes) == ["b", "c"]
    assert ancestrais("c", ambientes) == ["b", "a"]
    assert raiz("c", ambientes) == "a"


def test_ciclo_nao_trava():
    ambientes = [Ambiente("a", "A", True, paiId="b"), Ambiente("b", "B", True, paiId="a")]
    assert afetados("a", ambientes) == {"a", "b"}
    assert raiz("a", ambientes) == "b"
