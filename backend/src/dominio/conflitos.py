"""Conflito de ambiente (RN5, RN6) e de recurso limitado (RN8).

As funções recebem as ocupações já lidas (no salvamento, com leitura consistente depois dos
locks — RN7). A hierarquia entra pelo chamador: `ocupacoes` traz uma entrada por ambiente de
`hierarquia.afetados(a)`.
"""

from collections.abc import Iterable, Mapping
from datetime import datetime, timedelta

from dominio.modelos import CodigoErro, Erro, Ocupacao, Periodo, Recurso
from dominio.tempo import data_curta, hhmm, para_datetime


def _intervalo(inicio: str, termino: str) -> tuple[datetime, datetime] | None:
    try:
        return para_datetime(inicio), para_datetime(termino)
    except (TypeError, ValueError):
        return None


def _faixa(ini: datetime, fim: datetime) -> str:
    if ini.date() == fim.date():
        return f"{data_curta(ini)} das {hhmm(ini)} às {hhmm(fim)}"
    return f"{data_curta(ini)} {hhmm(ini)} a {data_curta(fim)} {hhmm(fim)}"


def conflitos_ambiente(periodos: Iterable[Periodo], ocupacoes: Mapping[str, Iterable[Ocupacao]],
                       margem: int | timedelta, ignorar_id: str | None = None,
                       nomes: Mapping[str, str] | None = None) -> list[Erro]:
    """Um `CONFLITO_AMBIENTE` por período em conflito (RN5), com sugestão de horário livre.

    Conflito QUANDO `novoInício < exTérmino + margem` E `exInício < novoTérmino + margem`.
    `margem` em minutos (int) ou timedelta; `ignorar_id` é a própria reserva na alteração.
    """
    if not isinstance(margem, timedelta):
        margem = timedelta(minutes=margem)
    nomes = nomes or {}
    existentes = []
    for ambiente_id, lista in ocupacoes.items():
        for o in lista:
            intervalo = _intervalo(o.inicio, o.termino)
            if intervalo and o.reservaId != ignorar_id:
                existentes.append((ambiente_id, *intervalo))
    existentes.sort(key=lambda e: e[1])

    erros: list[Erro] = []
    for n, p in enumerate(periodos):
        novo = _intervalo(p.inicio, p.termino)
        if novo is None:
            continue
        ini, fim = novo
        choques = [(a, ex_ini, ex_fim) for a, ex_ini, ex_fim in existentes
                   if ini < ex_fim + margem and ex_ini < fim + margem]
        if not choques:
            continue
        ocupados = "; ".join(f"{nomes.get(a, a)} ocupado em {_faixa(ex_ini, ex_fim)}"
                             for a, ex_ini, ex_fim in choques)
        livre = max(ex_fim for _, _, ex_fim in choques) + margem
        sugestao = f"livre a partir de {hhmm(livre)}"
        if livre.date() != ini.date():
            sugestao += f" de {data_curta(livre)}"
        minutos = int(margem.total_seconds() // 60)
        erros.append(Erro("periodos", CodigoErro.CONFLITO_AMBIENTE,
                          f"Período {n + 1} ({_faixa(ini, fim)}) em conflito: {ocupados} "
                          f"(margem de {minutos} min).",
                          periodoIndex=n, sugestao=sugestao))
    return erros


def excesso_recurso(periodos: Iterable[Periodo], recurso: Recurso, ocupacoes: Iterable[Ocupacao],
                    qtd: int, ignorar_id: str | None = None) -> list[Erro]:
    """`RECURSO_ESGOTADO` por período em que a soma reservada + `qtd` passa da disponibilidade (RN8).

    Sobreposição sem margem; uma reserva com vários períodos sobrepostos conta uma vez (R4.2).
    """
    if not recurso.limitado:
        return []
    existentes = []
    for o in ocupacoes:
        intervalo = _intervalo(o.inicio, o.termino)
        if intervalo and o.reservaId != ignorar_id:
            existentes.append((o.reservaId, int(o.qtd), *intervalo))

    erros: list[Erro] = []
    for n, p in enumerate(periodos):
        novo = _intervalo(p.inicio, p.termino)
        if novo is None:
            continue
        ini, fim = novo
        por_reserva: dict[str, int] = {}
        for reserva_id, q, ex_ini, ex_fim in existentes:
            if ex_ini < fim and ini < ex_fim:
                por_reserva[reserva_id] = max(por_reserva.get(reserva_id, 0), q)
        reservado = sum(por_reserva.values())
        if reservado + qtd <= recurso.disponibilidade:
            continue
        disponivel = max(recurso.disponibilidade - reservado, 0)
        erros.append(Erro("recursos", CodigoErro.RECURSO_ESGOTADO,
                          f"{recurso.desc} no período {n + 1} ({_faixa(ini, fim)}): "
                          f"disponível {disponivel}, pedida {qtd}.",
                          periodoIndex=n,
                          sugestao=f"peça até {disponivel}" if disponivel else None))
    return erros
