"""Setores envolvidos, diff de reservas, e-mail simulado e pedido SNP (RN10, RN11, RN12; R6).

O HTML do e-mail é semântico e escapado (`html.escape` em todo valor). O destaque de alteração
não depende só de cor: texto "ALTERADO:", `<del>`/`<ins>` e cor (NBR 17225 5.11.1). O e-mail do
solicitante nunca entra no corpo.
"""

from collections.abc import Iterable, Sequence
from html import escape

from dominio.modelos import (
    Alteracao,
    Catalogo,
    EmailSimulado,
    ItemRecurso,
    Periodo,
    Reserva,
    Setor,
    TipoEmail,
    VinculoSetor,
)
from dominio.tempo import data_curta, hhmm, para_datetime

# Cores com contraste ≥ 4.5:1 sobre branco; reforçam o texto, nunca o substituem.
COR_ANTES = "#a40000"
COR_DEPOIS = "#0b6b0b"


def _ordem_id(valor: str):
    return (0, int(valor), "") if valor.isdigit() else (1, 0, valor)


def setores_envolvidos(ambienteId: str | None, recursos: Iterable[ItemRecurso],
                       catalogo: Catalogo) -> list[str]:
    """Setores do ambiente ∪ setores dos recursos pedidos, ordenados (RN10)."""
    ids: set[str] = set()
    if ambienteId is not None:
        ambiente = next((a for a in catalogo.ambientes if a.id == ambienteId), None)
        if ambiente:
            ids |= set(ambiente.setores)
    por_id = {r.id: r for r in catalogo.recursos}
    for item in recursos:
        recurso = por_id.get(item.recursoId)
        if recurso:
            ids |= set(recurso.setores)
    return sorted(ids, key=_ordem_id)


# --- Valores legíveis ----------------------------------------------------------------------


def _periodo(p: Periodo) -> str:
    try:
        ini, fim = para_datetime(p.inicio), para_datetime(p.termino)
    except (TypeError, ValueError):
        return f"{p.inicio}–{p.termino}"
    if ini.date() == fim.date():
        return f"{data_curta(ini)} {hhmm(ini)}–{hhmm(fim)}"
    return f"{data_curta(ini)} {hhmm(ini)}–{data_curta(fim)} {hhmm(fim)}"


def _periodos(reserva: Reserva) -> list[str]:
    return [_periodo(p) for p in sorted(reserva.periodos, key=lambda p: p.inicio)]


def _ambiente(reserva: Reserva, catalogo: Catalogo) -> str:
    if reserva.ambienteId is None:
        return f"Local próprio: {reserva.complemento or ''}".strip()
    return next((a.desc for a in catalogo.ambientes if a.id == reserva.ambienteId),
                reserva.ambienteId)


def _disposicao(reserva: Reserva, catalogo: Catalogo) -> str:
    if reserva.disposicaoId is None:
        return "Não informada"
    return next((d.desc for d in catalogo.disposicoes if d.id == reserva.disposicaoId),
                reserva.disposicaoId)


def _recursos(reserva: Reserva, catalogo: Catalogo) -> list[str]:
    por_id = {r.id: r for r in catalogo.recursos}
    textos = []
    for item in reserva.recursos:
        recurso = por_id.get(item.recursoId)
        if recurso is None:
            textos.append(f"{item.recursoId} ({item.qtd})")
        elif recurso.limitado:
            textos.append(f"{recurso.desc} ({item.qtd})")
        else:
            textos.append(recurso.desc)
    return sorted(textos)


def _campos(reserva: Reserva, catalogo: Catalogo) -> list[tuple[str, str]]:
    """Campos comparados no diff, com o rótulo exibido (design §7)."""
    return [
        ("Períodos", "; ".join(_periodos(reserva))),
        ("Ambiente", _ambiente(reserva, catalogo)),
        ("Disposição", _disposicao(reserva, catalogo)),
        ("Finalidade", reserva.finalidade),
        ("Participantes", str(reserva.participantes)),
        ("Recursos", "; ".join(_recursos(reserva, catalogo)) or "Nenhum"),
    ]


def diff_reservas(antes: Reserva, depois: Reserva, catalogo: Catalogo) -> list[Alteracao]:
    """Campos alterados (períodos, ambiente, disposição, finalidade, participantes, recursos)."""
    return [Alteracao(campo, a, d)
            for (campo, a), (_, d) in zip(_campos(antes, catalogo), _campos(depois, catalogo))
            if a != d]


def classificar_evento(nome: str, antes: Reserva | None, depois: Reserva | None,
                       catalogo: Catalogo) -> tuple[TipoEmail, list[Alteracao]] | None:
    """Tipo de e-mail de um registro do stream; `None` = não notifica (REMOVE, MODIFY sem diff)."""
    if nome == "INSERT" and depois is not None:
        return "criada", []
    if nome != "MODIFY" or antes is None or depois is None:
        return None
    if depois.cancelada and not antes.cancelada:
        return "cancelada", []
    alteracoes = diff_reservas(antes, depois, catalogo)
    return ("alterada", alteracoes) if alteracoes else None


# --- E-mail e SNP --------------------------------------------------------------------------


def montar_email(tipo: TipoEmail, reserva: Reserva, setor: Setor, catalogo: Catalogo, ts: str,
                 alteracoes: Sequence[Alteracao] = ()) -> EmailSimulado:
    """E-mail simulado para um setor, com HTML semântico e escapado."""
    assunto = f"[SISGARES] Reserva {reserva.id} {tipo}"
    e = escape
    itens_periodo = "".join(f"<li>{e(p)}</li>" for p in _periodos(reserva))
    itens_recurso = "".join(f"<li>{e(r)}</li>" for r in _recursos(reserva, catalogo)) \
        or "<li>Nenhum</li>"
    partes = [
        "<!DOCTYPE html>",
        '<html lang="pt-BR">',
        f'<head><meta charset="utf-8"><title>{e(assunto)}</title></head>',
        "<body>",
        f"<h1>Reserva {e(reserva.id)} {e(tipo)}</h1>",
        f"<p>Para: {e(setor.desc)}</p>",
        "<dl>",
        f"<dt>Finalidade</dt><dd>{e(reserva.finalidade)}</dd>",
        f"<dt>Participantes</dt><dd>{e(str(reserva.participantes))}</dd>",
        f"<dt>Ambiente</dt><dd>{e(_ambiente(reserva, catalogo))}</dd>",
        f"<dt>Disposição</dt><dd>{e(_disposicao(reserva, catalogo))}</dd>",
        f"<dt>Períodos</dt><dd><ul>{itens_periodo}</ul></dd>",
        f"<dt>Recursos</dt><dd><ul>{itens_recurso}</ul></dd>",
        "</dl>",
    ]
    if alteracoes:
        partes.append("<h2>Alterações</h2><ul>")
        partes.extend(
            f"<li><strong>ALTERADO:</strong> {e(a.campo)} — "
            f'<del style="color:{COR_ANTES}">{e(a.antes)}</del> → '
            f'<ins style="color:{COR_DEPOIS}">{e(a.depois)}</ins></li>'
            for a in alteracoes)
        partes.append("</ul>")
    partes.append("</body></html>")
    return EmailSimulado(reservaId=reserva.id, ts=ts, setorId=setor.id, para=setor.email,
                         assunto=assunto, tipo=tipo, html="\n".join(partes),
                         alteracoes=list(alteracoes))


def precisa_snp(setorId: str, ambienteId: str | None, recursos: Iterable[ItemRecurso],
                vinculos: Iterable[VinculoSetor]) -> str | None:
    """Código de serviço do primeiro vínculo AMBI/RECU do setor que tenha `codigoServicoSnp` (RN11)."""
    ids_recursos = {item.recursoId for item in recursos}
    for v in vinculos:
        if v.setorId != setorId or not v.codigoServicoSnp:
            continue
        if (v.tipo == "AMBI" and ambienteId is not None and v.alvoId == ambienteId) or \
                (v.tipo == "RECU" and v.alvoId in ids_recursos):
            return v.codigoServicoSnp
    return None


def numero_snp(n: int, ano: int) -> str:
    """Número do pedido SNP simulado: `SNP-<ano>-NNNNN`."""
    return f"SNP-{ano}-{int(n):05d}"
