"""Validações básicas da reserva, status e regras de alteração/cancelamento.

RN1, RN2, RN3, RN4, RN9, RN12 e RN13 (R2, R5). Python puro: `agora` sempre injetado.
Conflitos de ambiente e de recurso limitado ficam em `dominio.conflitos` (precisam das ocupações).
"""

from collections.abc import Iterable
from datetime import datetime, time, timedelta

from dominio.modelos import (
    Catalogo,
    CodigoErro,
    Config,
    Erro,
    Recurso,
    Reserva,
    ReservaEntrada,
    StatusReserva,
)
from dominio.tempo import data_curta, hhmm, no_fuso, para_datetime

MAX_LIMITADOS = 5
TAMANHO_FINALIDADE = 200


def _hora(texto: str) -> time:
    h, m = texto.split(":")[:2]
    return time(int(h), int(m))


def _local(dt: datetime) -> time:
    """Hora local sem fuso, para comparar com a faixa `HH:MM`."""
    return no_fuso(dt).time().replace(tzinfo=None)


def _intervalos(periodos) -> list[tuple[datetime, datetime]] | None:
    try:
        return [(para_datetime(p.inicio), para_datetime(p.termino)) for p in periodos]
    except (TypeError, ValueError):
        return None


def _primeiro_horario(minimo: datetime, config: Config) -> datetime:
    """Primeiro início possível: arredonda para a grade de 30 min e respeita a faixa (RN3)."""
    exato = no_fuso(minimo)
    minimo = exato.replace(second=0, microsecond=0)
    if minimo < exato or minimo.minute % 30:
        minimo += timedelta(minutes=30 - minimo.minute % 30)
    inicio_faixa, fim_faixa = _hora(config.faixaInicio), _hora(config.faixaFim)
    if _local(minimo) < inicio_faixa:
        return minimo.replace(hour=inicio_faixa.hour, minute=inicio_faixa.minute)
    if _local(minimo) >= fim_faixa:
        dia = minimo + timedelta(days=1)
        return dia.replace(hour=inicio_faixa.hour, minute=inicio_faixa.minute)
    return minimo


def _descricao_periodo(n: int, ini: datetime, fim: datetime) -> str:
    return f"período {n + 1} ({data_curta(ini)} {hhmm(ini)}–{data_curta(fim)} {hhmm(fim)})"


def _validar_periodos(reserva, config, agora, alterados) -> list[Erro]:
    erros: list[Erro] = []
    if not reserva.periodos:
        return [Erro("periodos", CodigoErro.PERIODO_INVALIDO, "Informe ao menos um período.")]
    inicio_faixa, fim_faixa = _hora(config.faixaInicio), _hora(config.faixaFim)
    limite = no_fuso(agora) + timedelta(minutes=config.antecedenciaMin)
    for n, p in enumerate(reserva.periodos):
        try:
            ini, fim = para_datetime(p.inicio), para_datetime(p.termino)
        except (TypeError, ValueError):
            erros.append(Erro("periodos", CodigoErro.PERIODO_INVALIDO,
                              f"O período {n + 1} tem data ou hora inválida.", periodoIndex=n))
            continue
        if fim <= ini:  # RN1
            erros.append(Erro("periodos", CodigoErro.PERIODO_INVALIDO,
                              f"No período {n + 1}, o término ({data_curta(fim)} {hhmm(fim)}) deve "
                              f"ser depois do início ({data_curta(ini)} {hhmm(ini)}).",
                              periodoIndex=n))
            continue
        fora = [nome for nome, dt in (("início", ini), ("término", fim))
                if not inicio_faixa <= _local(dt) <= fim_faixa]
        if fora:  # RN3
            erros.append(Erro("periodos", CodigoErro.FORA_FAIXA,
                              f"O {' e o '.join(fora)} do {_descricao_periodo(n, ini, fim)} devem "
                              f"ficar entre {config.faixaInicio} e {config.faixaFim}.",
                              periodoIndex=n))
        if (alterados is None or n in alterados) and ini < limite:  # RN4
            sugestao = _primeiro_horario(limite, config)
            erros.append(Erro("periodos", CodigoErro.SEM_ANTECEDENCIA,
                              f"O {_descricao_periodo(n, ini, fim)} precisa começar com pelo menos "
                              f"{config.antecedenciaMin} minutos de antecedência.",
                              periodoIndex=n,
                              sugestao=f"a partir de {hhmm(sugestao)} de {data_curta(sugestao)}"))
    return erros


def _validar_campos(reserva, catalogo) -> list[Erro]:
    erros: list[Erro] = []
    finalidade = (reserva.finalidade or "").strip()
    if not 1 <= len(finalidade) <= TAMANHO_FINALIDADE:  # RN2
        erros.append(Erro("finalidade", CodigoErro.CAMPO_OBRIGATORIO,
                          f"Informe a finalidade, com 1 a {TAMANHO_FINALIDADE} caracteres."))
    if not isinstance(reserva.participantes, int) or reserva.participantes < 1:
        erros.append(Erro("participantes", CodigoErro.CAMPO_OBRIGATORIO,
                          "Informe o número de participantes (inteiro, 1 ou mais)."))
    if reserva.ambienteId is None:
        if not (reserva.complemento or "").strip():
            erros.append(Erro("complemento", CodigoErro.CAMPO_OBRIGATORIO,
                              "Sem ambiente (local próprio), informe o complemento com o local."))
    else:
        ambiente = next((a for a in catalogo.ambientes if a.id == reserva.ambienteId), None)
        if ambiente is None or not ambiente.ativo:
            erros.append(Erro("ambienteId", CodigoErro.CAMPO_OBRIGATORIO,
                              "Escolha um ambiente ativo ou \"Não solicitado / local próprio\"."))
    if reserva.disposicaoId is not None:
        disposicao = next((d for d in catalogo.disposicoes if d.id == reserva.disposicaoId), None)
        if disposicao is None or not disposicao.ativo:
            erros.append(Erro("disposicaoId", CodigoErro.CAMPO_OBRIGATORIO,
                              "Escolha uma disposição ativa."))
    return erros


def _validar_recursos(reserva, catalogo) -> list[Erro]:
    erros: list[Erro] = []
    por_id = {r.id: r for r in catalogo.recursos}
    vistos: set[str] = set()
    limitados = 0
    for item in reserva.recursos:
        recurso = por_id.get(item.recursoId)
        if item.recursoId in vistos:
            nome = recurso.desc if recurso else item.recursoId
            erros.append(Erro("recursos", CodigoErro.CAMPO_OBRIGATORIO,
                              f"O recurso {nome} foi pedido mais de uma vez."))
            continue
        vistos.add(item.recursoId)
        if recurso is None or not recurso.ativo:
            erros.append(Erro("recursos", CodigoErro.RECURSO_INDISPONIVEL_AMBIENTE,
                              f"O recurso {recurso.desc if recurso else item.recursoId} "
                              "não está disponível."))
            continue
        if not _oferecido(recurso, reserva.ambienteId):  # RN9
            local = (f"no ambiente {_nome_ambiente(reserva.ambienteId, catalogo)}"
                     if reserva.ambienteId else "em local próprio")
            erros.append(Erro("recursos", CodigoErro.RECURSO_INDISPONIVEL_AMBIENTE,
                              f"O recurso {recurso.desc} não está disponível {local}."))
            continue
        if recurso.limitado:
            limitados += 1
            if not isinstance(item.qtd, int) or item.qtd < 1:
                erros.append(Erro("recursos", CodigoErro.CAMPO_OBRIGATORIO,
                                  f"Informe a quantidade de {recurso.desc} (1 ou mais)."))
            elif item.qtd > recurso.disponibilidade:
                erros.append(Erro("recursos", CodigoErro.RECURSO_ESGOTADO,
                                  f"{recurso.desc}: pedida {item.qtd}, mas só existem "
                                  f"{recurso.disponibilidade} no total."))
        elif item.qtd != 1:
            erros.append(Erro("recursos", CodigoErro.CAMPO_OBRIGATORIO,
                              f"O recurso {recurso.desc} não tem quantidade: use 1."))
    if limitados > MAX_LIMITADOS:
        erros.append(Erro("recursos", CodigoErro.CAMPO_OBRIGATORIO,
                          f"Peça no máximo {MAX_LIMITADOS} recursos com quantidade limitada."))
    return erros


def _nome_ambiente(ambiente_id: str, catalogo: Catalogo) -> str:
    return next((a.desc for a in catalogo.ambientes if a.id == ambiente_id), ambiente_id)


def _oferecido(recurso: Recurso, ambiente_id: str | None) -> bool:
    return not recurso.ambientesVinculados or ambiente_id in recurso.ambientesVinculados


def validar_basico(reserva: ReservaEntrada, catalogo: Catalogo, config: Config, agora: datetime,
                   periodos_alterados: Iterable[int] | None = None) -> list[Erro]:
    """RN1, RN2, RN3, RN4 (só nos `periodos_alterados`; `None` = todos), RN9 e quantidades."""
    alterados = None if periodos_alterados is None else set(periodos_alterados)
    return (_validar_periodos(reserva, config, agora, alterados)
            + _validar_campos(reserva, catalogo)
            + _validar_recursos(reserva, catalogo))


def recursos_oferecidos(ambienteId: str | None, catalogo: Catalogo) -> list[Recurso]:
    """Recursos ativos sem vínculo ou vinculados ao ambiente (RN9, R2.8)."""
    return [r for r in catalogo.recursos if r.ativo and _oferecido(r, ambienteId)]


def status(reserva: Reserva, agora: datetime) -> StatusReserva:
    """RN13: cancelada > prevista > em_andamento > transcorrida."""
    if getattr(reserva, "cancelada", False):
        return "cancelada"
    intervalos = _intervalos(reserva.periodos) or []
    agora = no_fuso(agora)
    if not intervalos or agora < min(i for i, _ in intervalos):
        return "prevista"
    if agora < max(f for _, f in intervalos):
        return "em_andamento"
    return "transcorrida"


def pode_alterar(reserva: Reserva, agora: datetime) -> list[Erro]:
    """RN12: transcorrida ou cancelada não pode ser alterada."""
    situacao = status(reserva, agora)
    if situacao in ("transcorrida", "cancelada"):
        return [Erro("reserva", CodigoErro.RESERVA_ENCERRADA,
                     f"A reserva {reserva.id} está {situacao} e não pode ser alterada.")]
    return []


def pode_cancelar(reserva: Reserva, config: Config, agora: datetime) -> list[Erro]:
    """RN12: encerrada não cancela; senão exige antecedência mínima até o menor início."""
    situacao = status(reserva, agora)
    if situacao in ("transcorrida", "cancelada"):
        return [Erro("reserva", CodigoErro.RESERVA_ENCERRADA,
                     f"A reserva {reserva.id} está {situacao} e não pode ser cancelada.")]
    primeiro = min(para_datetime(p.inicio) for p in reserva.periodos)
    if no_fuso(agora) + timedelta(minutes=config.antecedenciaMin) > primeiro:
        return [Erro("reserva", CodigoErro.CANCELAMENTO_SEM_ANTECEDENCIA,
                     f"O cancelamento exige {config.antecedenciaMin} minutos de antecedência "
                     f"do início ({data_curta(primeiro)} {hhmm(primeiro)}).")]
    return []


def periodos_alterados(antiga: Reserva, nova: ReservaEntrada) -> set[int]:
    """Índices dos períodos da nova cujo início não existia na antiga (RN4 na alteração)."""
    inicios = set()
    for p in antiga.periodos:
        try:
            inicios.add(para_datetime(p.inicio))
        except (TypeError, ValueError):
            continue
    resultado = set()
    for n, p in enumerate(nova.periodos):
        try:
            if para_datetime(p.inicio) not in inicios:
                resultado.add(n)
        except (TypeError, ValueError):
            resultado.add(n)
    return resultado
