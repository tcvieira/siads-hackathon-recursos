"""comum/servico.py contra a tabela simulada: criação, conflitos, corrida da RN7, alteração e
cancelamento."""

from datetime import datetime

import pytest
from boto3.dynamodb.conditions import Key

from comum import servico
from comum.auth import Usuario
from comum.http import ErroApi
from comum.repo import obter_repo
from dominio.modelos import CodigoErro, ItemRecurso, Periodo, ReservaEntrada
from dominio.tempo import FUSO

AGORA = datetime(2026, 11, 10, 8, 0, tzinfo=FUSO)
D = "2026-11-10T"
F = ":00-03:00"
SOLICITANTE = Usuario("sub-sol", "solicitante@example.com", ["solicitante"])
OUTRO = Usuario("sub-outro", "outro@example.com", ["solicitante"])


def p(ini: str, fim: str, dia: str = D) -> Periodo:
    return Periodo(f"{dia}{ini}{F}", f"{dia}{fim}{F}")


def entrada(periodos=None, ambiente="3", recursos=None, **extra) -> ReservaEntrada:
    return ReservaEntrada(finalidade="Reunião de alinhamento", participantes=10,
                          ambienteId=ambiente, periodos=periodos or [p("14:00", "16:00")],
                          recursos=recursos or [], **extra)


@pytest.fixture
def repo(tabela):
    return obter_repo()


@pytest.fixture
def cad(repo):
    return repo.carregar_cadastros()


def criar(cad, repo, e, usuario=SOLICITANTE, agora=AGORA, **kw):
    return servico.criar(e, usuario, cad, repo, agora, **kw)


def codigos(erro: ErroApi) -> list[str]:
    return [e.codigo for e in erro.erros]


def test_criar_preenche_id_setores_versao_e_status(cad, repo, tabela):
    r = criar(cad, repo, entrada(recursos=[ItemRecurso("6", 1), ItemRecurso("2", 1)]))
    assert r.id == "17326"  # CTR#RESE do CSV = 17325
    assert r.versao == 1 and r.cancelada is False and r.status == "prevista"
    assert r.setoresIds == ["1", "2", "3", "23"]
    assert r.solicitanteSub == "sub-sol" and r.criadoEm == "2026-11-10T08:00:00-03:00"
    sks = [i["SK"] for i in tabela.query(KeyConditionExpression=Key("PK").eq("RESE#17326"))["Items"]]
    assert sorted(sks) == ["META", "PER#0"]


def test_basico_invalido_400_sem_gravar(cad, repo, tabela):
    with pytest.raises(ErroApi) as erro:
        criar(cad, repo, entrada(periodos=[p("14:00", "13:00")]))
    assert erro.value.status == 400
    assert codigos(erro.value) == [CodigoErro.PERIODO_INVALIDO]
    assert repo.ocupacoes_ambiente("3", "2027") == []


def test_rn5_margem_1120_409_com_sugestao_e_1130_aceito(cad, repo):
    criar(cad, repo, entrada(periodos=[p("09:00", "11:00", "2026-11-11T")]))
    with pytest.raises(ErroApi) as erro:
        criar(cad, repo, entrada(periodos=[p("11:20", "12:00", "2026-11-11T")]))
    assert erro.value.status == 409
    assert erro.value.erros[0].codigo == CodigoErro.CONFLITO_AMBIENTE
    assert erro.value.erros[0].sugestao == "livre a partir de 11:30"
    assert criar(cad, repo, entrada(periodos=[p("11:30", "12:00", "2026-11-11T")])).id


def test_rn6_pai_e_filho_conflitam_irmaos_nao(cad, repo):
    criar(cad, repo, entrada(ambiente="5"))  # Parte A 14–16
    with pytest.raises(ErroApi) as erro:
        criar(cad, repo, entrada(ambiente="1", periodos=[p("15:00", "17:00")]))
    assert erro.value.status == 409 and codigos(erro.value) == [CodigoErro.CONFLITO_AMBIENTE]
    assert criar(cad, repo, entrada(ambiente="6")).ambienteId == "6"  # Parte B


def test_rn8_projetor_esgotado_409(cad, repo):
    criar(cad, repo, entrada(recursos=[ItemRecurso("6", 2)]))  # disponibilidade 2
    with pytest.raises(ErroApi) as erro:
        criar(cad, repo, entrada(ambiente="7", periodos=[p("15:00", "17:00")],
                                 recursos=[ItemRecurso("6", 1)]))
    assert erro.value.status == 409 and codigos(erro.value) == [CodigoErro.RECURSO_ESGOTADO]


def test_rn7_segundo_salvamento_igual_409(cad, repo):
    criar(cad, repo, entrada())
    with pytest.raises(ErroApi) as erro:
        criar(cad, repo, entrada())
    assert erro.value.status == 409 and codigos(erro.value) == [CodigoErro.CONFLITO_AMBIENTE]


def test_rn7_corrida_concorrente_no_mesmo_horario_revalida_e_409(cad, repo):
    """O concorrente grava entre a leitura dos locks e o salvar: a transação cancela, o serviço
    relê os locks, revalida, encontra o conflito e responde 409."""
    chamadas = []

    def concorrente():
        if not chamadas:
            chamadas.append(criar(cad, repo, entrada(), usuario=OUTRO))
        else:
            chamadas.append(None)

    with pytest.raises(ErroApi) as erro:
        criar(cad, repo, entrada(), antes_de_salvar=concorrente)
    assert erro.value.status == 409 and codigos(erro.value) == [CodigoErro.CONFLITO_AMBIENTE]
    assert "ocupado" in erro.value.erros[0].mensagem  # foi a revalidação que barrou
    assert len(chamadas) == 1  # a segunda tentativa nem chegou ao salvar
    assert [o.reservaId for o in repo.ocupacoes_ambiente("3", "2027")] == [chamadas[0].id]


def test_rn7_corrida_sem_sobreposicao_tenta_de_novo_e_grava(cad, repo):
    """Concorrente no mesmo lock (Parte B, raiz Auditório) mas sem conflito: o retry grava."""
    chamadas = []

    def concorrente():
        if not chamadas:
            chamadas.append(criar(cad, repo, entrada(ambiente="6"), usuario=OUTRO))
        else:
            chamadas.append(None)

    r = criar(cad, repo, entrada(ambiente="5"), antes_de_salvar=concorrente)
    assert len(chamadas) == 2 and r.ambienteId == "5"
    assert repo.ler_versoes_locks(["LOCK#AMBI#1"]) == {"LOCK#AMBI#1": 2}


def test_rn7_corrida_repetida_desiste_com_409(cad, repo):
    """Gravações concorrentes nas duas tentativas: 409 com a mensagem de concorrência."""
    def concorrente():
        livre = not repo.ocupacoes_ambiente("3", "2027")
        horario = ("10:00", "11:00") if livre else ("17:00", "18:00")
        criar(cad, repo, entrada(periodos=[p(*horario)]), usuario=OUTRO)

    with pytest.raises(ErroApi) as erro:
        criar(cad, repo, entrada(), antes_de_salvar=concorrente)
    assert erro.value.status == 409
    assert erro.value.erros[0].codigo == CodigoErro.CONFLITO_CONCORRENTE
    assert erro.value.erros[0].mensagem == servico.MENSAGEM_CONCORRENCIA


def test_alterar_ignora_a_propria_reserva_e_avanca_versao(cad, repo):
    antiga = criar(cad, repo, entrada(recursos=[ItemRecurso("6", 2)]))
    nova = servico.alterar(antiga, entrada(periodos=[p("14:30", "16:30")],
                                           recursos=[ItemRecurso("6", 2)]),
                           SOLICITANTE, cad, repo, AGORA)
    assert nova.id == antiga.id and nova.versao == 2 and nova.criadoEm == antiga.criadoEm
    assert [o.inicio for o in repo.ocupacoes_ambiente("3", "2027")] == [f"{D}14:30{F}"]


def test_alterar_rn4_so_nos_periodos_alterados(cad, repo):
    antiga = criar(cad, repo, entrada(periodos=[p("14:00", "16:00"), p("09:00", "10:00",
                                                                      "2026-11-11T")]))
    depois = datetime(2026, 11, 10, 13, 0, tzinfo=FUSO)  # 1h antes do período 0
    nova = servico.alterar(antiga, entrada(periodos=[p("14:00", "16:00"),
                                                     p("09:00", "11:00", "2026-11-11T")]),
                           SOLICITANTE, cad, repo, depois)
    assert nova.periodos[1].termino == f"2026-11-11T11:00{F}"
    with pytest.raises(ErroApi) as erro:
        servico.alterar(nova, entrada(periodos=[p("14:30", "16:00")]), SOLICITANTE, cad, repo,
                        depois)
    assert erro.value.status == 400 and codigos(erro.value) == [CodigoErro.SEM_ANTECEDENCIA]


def test_alterar_transcorrida_409(cad, repo):
    antiga = criar(cad, repo, entrada())
    with pytest.raises(ErroApi) as erro:
        servico.alterar(antiga, entrada(), SOLICITANTE, cad, repo,
                        datetime(2026, 11, 10, 17, 0, tzinfo=FUSO))
    assert erro.value.status == 409 and codigos(erro.value) == [CodigoErro.RESERVA_ENCERRADA]


def test_cancelar_libera_ocupacao_e_sem_antecedencia_409(cad, repo):
    r = criar(cad, repo, entrada(recursos=[ItemRecurso("6", 1)]))
    with pytest.raises(ErroApi) as erro:
        servico.cancelar(r, cad, repo, datetime(2026, 11, 10, 13, 0, tzinfo=FUSO))
    assert codigos(erro.value) == [CodigoErro.CANCELAMENTO_SEM_ANTECEDENCIA]
    cancelada = servico.cancelar(r, cad, repo, AGORA)
    assert cancelada.cancelada and cancelada.status == "cancelada"
    assert repo.ocupacoes_ambiente("3", "2027") == [] and repo.ocupacoes_recurso("6", "2027") == []


def test_cancelar_versao_desatualizada_409_concorrente(cad, repo):
    """Cancelar com a versão antiga depois de uma alteração: 409 de concorrência, não de ambiente."""
    antiga = criar(cad, repo, entrada())
    servico.alterar(antiga, entrada(periodos=[p("14:30", "16:30")]), SOLICITANTE, cad, repo, AGORA)
    with pytest.raises(ErroApi) as erro:
        servico.cancelar(antiga, cad, repo, AGORA)
    assert erro.value.status == 409
    assert codigos(erro.value) == [CodigoErro.CONFLITO_CONCORRENTE]


def test_validar_junta_erros_sem_gravar(cad, repo):
    criar(cad, repo, entrada())
    erros = servico.validar(entrada(periodos=[p("15:00", "21:00")]), cad, repo, AGORA)
    assert {e.codigo for e in erros} == {CodigoErro.FORA_FAIXA, CodigoErro.CONFLITO_AMBIENTE}
    assert len(repo.ocupacoes_ambiente("3", "2027")) == 1


def test_validar_modo_edicao_ignora_a_propria(cad, repo):
    antiga = criar(cad, repo, entrada())
    assert servico.validar(entrada(periodos=[p("14:30", "16:30")]), cad, repo, AGORA,
                           antiga=antiga) == []
