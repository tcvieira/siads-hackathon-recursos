"""Hierarquia de ambientes (RN6, R3.2).

Pai e filhos conflitam entre si; irmãos não. Ambientes inativos continuam na hierarquia,
porque reservas antigas podem apontar para eles. Todas as funções são à prova de ciclo.
"""

from collections.abc import Iterable

from dominio.modelos import Ambiente


def _pais(ambientes: Iterable[Ambiente]) -> dict[str, str | None]:
    return {a.id: a.paiId or None for a in ambientes}


def ancestrais(ambiente_id: str, ambientes: Iterable[Ambiente]) -> list[str]:
    """Pai, avô… do ambiente, do mais próximo ao mais distante."""
    pais = _pais(ambientes)
    resultado: list[str] = []
    vistos = {ambiente_id}
    atual = pais.get(ambiente_id)
    while atual and atual not in vistos:
        resultado.append(atual)
        vistos.add(atual)
        atual = pais.get(atual)
    return resultado


def descendentes(ambiente_id: str, ambientes: Iterable[Ambiente]) -> list[str]:
    """Filhos, netos… do ambiente (todos os níveis), em largura."""
    filhos: dict[str, list[str]] = {}
    for a, pai in _pais(ambientes).items():
        if pai:
            filhos.setdefault(pai, []).append(a)
    resultado: list[str] = []
    vistos = {ambiente_id}
    fila = [ambiente_id]
    while fila:
        atual = fila.pop(0)
        for filho in filhos.get(atual, []):
            if filho not in vistos:
                vistos.add(filho)
                resultado.append(filho)
                fila.append(filho)
    return resultado


def raiz(ambiente_id: str, ambientes: Iterable[Ambiente]) -> str:
    """Ancestral mais distante (ou o próprio ambiente). Pai e filhos compartilham o lock."""
    acima = ancestrais(ambiente_id, ambientes)
    return acima[-1] if acima else ambiente_id


def afetados(ambiente_id: str, ambientes: Iterable[Ambiente]) -> set[str]:
    """O próprio ambiente, seus ancestrais e descendentes. Irmãos ficam de fora."""
    ambientes = list(ambientes)
    return {ambiente_id, *ancestrais(ambiente_id, ambientes), *descendentes(ambiente_id, ambientes)}
