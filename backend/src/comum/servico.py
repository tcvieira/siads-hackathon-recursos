"""Orquestração de validar/criar/alterar/cancelar reservas (design.md §3, algoritmo RN5–RN7).

Fica fora dos handlers para ser testada com a tabela simulada sem montar eventos HTTP.
Ordem do salvamento: validações básicas (400) → lê os locks → consultas consistentes e
conflitos (409) → `TransactWriteItems`. Se a transação cancelar por condição (outra gravação
entre a leitura dos locks e o salvamento), relê, revalida e tenta UMA vez; na segunda, 409.
"""

from collections.abc import Callable
from dataclasses import replace
from datetime import datetime, timedelta

from comum.auth import Usuario
from comum.http import conflito, requisicao_invalida
from comum.repo import (
    Cadastros,
    ConflitoConcorrente,
    Repositorio,
    chave_lock_ambiente,
    chave_lock_recurso,
)
from dominio import hierarquia, regras
from dominio.conflitos import conflitos_ambiente, excesso_recurso
from dominio.modelos import CodigoErro, Erro, Periodo, Reserva, ReservaEntrada
from dominio.notificacao import setores_envolvidos
from dominio.tempo import para_datetime, para_iso

MENSAGEM_CONCORRENCIA = ("Outra gravação mudou a agenda ou esta reserva ao mesmo tempo; "
                         "tente novamente.")


def _com_status(reserva: Reserva, agora: datetime) -> Reserva:
    return replace(reserva, status=regras.status(reserva, agora))


def _limitados_pedidos(entrada: ReservaEntrada, cad: Cadastros) -> dict[str, int]:
    """Recurso limitado pedido → quantidade (repetidos já são barrados em `validar_basico`)."""
    limitados = cad.limitados()
    pedidos: dict[str, int] = {}
    for item in entrada.recursos:
        if item.recursoId in limitados:
            pedidos.setdefault(item.recursoId, item.qtd)
    return pedidos


def _chaves_locks(entrada: ReservaEntrada, cad: Cadastros) -> list[str]:
    """Lock da raiz da hierarquia (pai e filhos compartilham) e um por recurso limitado."""
    chaves = []
    if entrada.ambienteId is not None:
        chaves.append(chave_lock_ambiente(hierarquia.raiz(entrada.ambienteId,
                                                          cad.catalogo.ambientes)))
    chaves.extend(chave_lock_recurso(r) for r in _limitados_pedidos(entrada, cad))
    return chaves


def _conflitos(entrada: ReservaEntrada, cad: Cadastros, repo: Repositorio,
               ignorar_id: str | None) -> list[Erro]:
    """RN5/RN6 (ambiente + ancestrais + descendentes, com margem) e RN8, com leitura consistente."""
    catalogo = cad.catalogo
    fim = max(para_datetime(p.termino) for p in entrada.periodos)
    erros: list[Erro] = []
    if entrada.ambienteId is not None:
        ate = para_iso(fim + timedelta(minutes=catalogo.config.margemMin))
        ocupacoes = {x: repo.ocupacoes_ambiente(x, ate)
                     for x in sorted(hierarquia.afetados(entrada.ambienteId, catalogo.ambientes))}
        nomes = {a.id: a.desc for a in catalogo.ambientes}
        erros += conflitos_ambiente(entrada.periodos, ocupacoes, catalogo.config.margemMin,
                                    ignorar_id=ignorar_id, nomes=nomes)
    por_id = {r.id: r for r in catalogo.recursos}
    for recurso_id, qtd in _limitados_pedidos(entrada, cad).items():
        erros += excesso_recurso(entrada.periodos, por_id[recurso_id],
                                 repo.ocupacoes_recurso(recurso_id, para_iso(fim)), qtd,
                                 ignorar_id=ignorar_id)
    return erros


def _basico(entrada: ReservaEntrada, cad: Cadastros, agora: datetime,
            antiga: Reserva | None) -> list[Erro]:
    alterados = None if antiga is None else regras.periodos_alterados(antiga, entrada)
    return regras.validar_basico(entrada, cad.catalogo, cad.catalogo.config, agora, alterados)


def validar(entrada: ReservaEntrada, cad: Cadastros, repo: Repositorio, agora: datetime,
            antiga: Reserva | None = None) -> list[Erro]:
    """Dry-run de POST /reservas/validar: todos os erros de uma vez, sem gravar.

    No modo edição (`antiga`), RN4 vale só para os períodos alterados, a própria reserva é
    ignorada nos conflitos e a regra de alteração (RN12) também entra, como no PUT.
    """
    erros = [] if antiga is None else regras.pode_alterar(antiga, agora)
    erros += _basico(entrada, cad, agora, antiga)
    if not any(e.codigo == CodigoErro.PERIODO_INVALIDO for e in erros):
        erros += _conflitos(entrada, cad, repo, antiga.id if antiga else None)
    return erros


def _montar(entrada: ReservaEntrada, cad: Cadastros, id_: str, solicitante_sub: str,
            solicitante_email: str, criado_em: str, versao: int) -> Reserva:
    return Reserva(
        id=id_, finalidade=entrada.finalidade, participantes=entrada.participantes,
        ambienteId=entrada.ambienteId,
        # Datas sempre em −03:00: as SKs `<inicio>#…` são comparadas como texto.
        periodos=[Periodo(para_iso(para_datetime(p.inicio)), para_iso(para_datetime(p.termino)))
                  for p in entrada.periodos],
        recursos=list(entrada.recursos), solicitanteSub=solicitante_sub,
        solicitanteEmail=solicitante_email,
        setoresIds=setores_envolvidos(entrada.ambienteId, entrada.recursos, cad.catalogo),
        cancelada=False, versao=versao, criadoEm=criado_em, complemento=entrada.complemento,
        disposicaoId=entrada.disposicaoId)


def _gravar(entrada: ReservaEntrada, cad: Cadastros, repo: Repositorio, agora: datetime,
            antiga: Reserva | None, montar: Callable[[], Reserva],
            antes_de_salvar: Callable[[], None] | None) -> Reserva:
    erros = _basico(entrada, cad, agora, antiga)
    if erros:
        raise requisicao_invalida(erros)
    chaves = _chaves_locks(entrada, cad)
    ignorar_id = antiga.id if antiga else None
    nova: Reserva | None = None
    for tentativa in range(2):
        versoes = repo.ler_versoes_locks(chaves)  # antes das consultas (RN7)
        erros = _conflitos(entrada, cad, repo, ignorar_id)
        if erros:
            raise conflito(erros)
        if nova is None:
            nova = montar()  # id emitido uma vez, reaproveitado na nova tentativa
        if antes_de_salvar is not None:
            antes_de_salvar()
        try:
            return _com_status(repo.salvar_reserva(nova, antiga, versoes, cad), agora)
        except ConflitoConcorrente:
            if tentativa:
                # Sem sobreposição na revalidação: a falha é de concorrência, não de ambiente.
                raise conflito([Erro("periodos", CodigoErro.CONFLITO_CONCORRENTE,
                                     MENSAGEM_CONCORRENCIA)]) from None
    raise AssertionError("inalcançável")


def criar(entrada: ReservaEntrada, usuario: Usuario, cad: Cadastros, repo: Repositorio,
          agora: datetime, antes_de_salvar: Callable[[], None] | None = None) -> Reserva:
    """Cria a reserva (R2–R4). `antes_de_salvar` é um gancho de teste para simular a corrida."""
    def montar() -> Reserva:
        return _montar(entrada, cad, str(repo.proximo_numero("RESE")), usuario.sub,
                       usuario.email, para_iso(agora), 1)

    return _gravar(entrada, cad, repo, agora, None, montar, antes_de_salvar)


def alterar(antiga: Reserva, entrada: ReservaEntrada, usuario: Usuario, cad: Cadastros,
            repo: Repositorio, agora: datetime,
            antes_de_salvar: Callable[[], None] | None = None) -> Reserva:
    """Altera a reserva (R5.1): mantém id, solicitante e `criadoEm`; `versao` avança."""
    erros = regras.pode_alterar(antiga, agora)
    if erros:
        raise conflito(erros)

    def montar() -> Reserva:
        return _montar(entrada, cad, antiga.id, antiga.solicitanteSub, antiga.solicitanteEmail,
                       antiga.criadoEm, antiga.versao + 1)

    return _gravar(entrada, cad, repo, agora, antiga, montar, antes_de_salvar)


def cancelar(reserva: Reserva, cad: Cadastros, repo: Repositorio, agora: datetime) -> Reserva:
    """Cancela (R5.2, RN12): libera as ocupações e marca META e períodos como cancelados."""
    erros = regras.pode_cancelar(reserva, cad.catalogo.config, agora)
    if erros:
        raise conflito(erros)
    try:
        return _com_status(repo.cancelar_reserva(reserva, cad), agora)
    except ConflitoConcorrente:
        raise conflito([Erro("reserva", CodigoErro.CONFLITO_CONCORRENTE,
                             "A reserva foi alterada ao mesmo tempo; tente novamente.")]) from None
