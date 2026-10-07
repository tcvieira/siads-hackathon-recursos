"""Validações básicas, status e regras de alteração (RN1–RN4, RN9, RN12, RN13)."""

from dataclasses import replace
from datetime import datetime

import pytest

from catalogo_csv import carregar
from dominio.modelos import CodigoErro, ItemRecurso, Periodo, Reserva, ReservaEntrada
from dominio.regras import (
    pode_alterar,
    pode_cancelar,
    periodos_alterados,
    recursos_oferecidos,
    status,
    validar_basico,
)
from dominio.tempo import FUSO, data_curta, hhmm, para_datetime, para_iso

AGORA = datetime(2026, 11, 1, 10, 0, tzinfo=FUSO)


@pytest.fixture(scope="module")
def catalogo():
    return carregar()[0]


def entrada(*periodos, **campos) -> ReservaEntrada:
    base = dict(finalidade="Reunião de alinhamento", participantes=10, ambienteId="3",
                periodos=[Periodo(i, t) for i, t in periodos] or
                [Periodo("2026-11-10T14:00:00-03:00", "2026-11-10T16:00:00-03:00")])
    base.update(campos)
    return ReservaEntrada(**base)


def reserva(*periodos, cancelada=False) -> Reserva:
    return Reserva(id="900", finalidade="Reunião", participantes=10, ambienteId="3",
                   periodos=[Periodo(i, t) for i, t in periodos], recursos=[],
                   solicitanteSub="sub-1", solicitanteEmail="pessoa@example.com",
                   setoresIds=["1"], cancelada=cancelada, versao=1,
                   criadoEm="2026-10-01T09:00:00-03:00")


def codigos(erros) -> list[str]:
    return [e.codigo for e in erros]


def validar(catalogo, reserva_entrada, agora=AGORA, alterados=None):
    return validar_basico(reserva_entrada, catalogo, catalogo.config, agora, alterados)


# --- tempo ---------------------------------------------------------------------------------


def test_tempo_converte_z_e_naive_para_menos_3():
    assert para_iso(para_datetime("2026-11-10T17:00:00Z")) == "2026-11-10T14:00:00-03:00"
    assert para_iso(para_datetime("2026-11-10T14:00")) == "2026-11-10T14:00:00-03:00"
    assert para_iso(datetime(2026, 11, 10, 14, 0, 0, 123456, tzinfo=FUSO)) == \
        "2026-11-10T14:00:00-03:00"
    dt = para_datetime("2026-11-10T14:05:00-03:00")
    assert (hhmm(dt), data_curta(dt)) == ("14:05", "10/11")


# --- RN1 a RN4 -----------------------------------------------------------------------------


def test_reserva_valida_sem_erros(catalogo):
    assert validar(catalogo, entrada()) == []


def test_rn1_termino_antes_do_inicio_bloqueado(catalogo):
    erros = validar(catalogo, entrada(("2026-11-10T14:00:00-03:00", "2026-11-10T13:00:00-03:00")))
    assert codigos(erros) == [CodigoErro.PERIODO_INVALIDO]
    assert erros[0].campo == "periodos" and erros[0].periodoIndex == 0


def test_rn1_periodo_atravessa_dia_aceito(catalogo):
    erros = validar(catalogo, entrada(("2026-11-10T18:00:00-03:00", "2026-11-11T09:00:00-03:00")))
    assert erros == []


def test_rn1_sem_periodos_bloqueado(catalogo):
    erros = validar(catalogo, replace(entrada(), periodos=[]))
    assert codigos(erros) == [CodigoErro.PERIODO_INVALIDO]
    assert erros[0].periodoIndex is None


def test_rn1_periodos_sobrepostos_no_mesmo_pedido_bloqueado(catalogo):
    erros = validar(catalogo, entrada(("2026-11-10T14:00:00-03:00", "2026-11-10T16:00:00-03:00"),
                                      ("2026-11-10T15:00:00-03:00", "2026-11-10T17:00:00-03:00")))
    assert codigos(erros) == [CodigoErro.PERIODO_INVALIDO]
    assert erros[0].periodoIndex == 1


def test_rn1_periodos_encostados_no_mesmo_pedido_aceito(catalogo):
    erros = validar(catalogo, entrada(("2026-11-10T14:00:00-03:00", "2026-11-10T16:00:00-03:00"),
                                      ("2026-11-10T16:00:00-03:00", "2026-11-10T17:00:00-03:00")))
    assert erros == []


def test_rn2_agua_cafe_sem_ambiente_sem_complemento_bloqueado(catalogo):
    erros = validar(catalogo, entrada(ambienteId=None, recursos=[ItemRecurso("3", 1)]))
    assert codigos(erros) == [CodigoErro.CAMPO_OBRIGATORIO]
    assert erros[0].campo == "complemento"


def test_rn2_sem_ambiente_com_complemento_aceito(catalogo):
    erros = validar(catalogo, entrada(ambienteId=None, complemento="Sala 304",
                                      recursos=[ItemRecurso("3", 1)]))
    assert erros == []


def test_rn2_finalidade_e_participantes(catalogo):
    erros = validar(catalogo, entrada(finalidade="   ", participantes=0))
    assert [(e.campo, e.codigo) for e in erros] == [
        ("finalidade", CodigoErro.CAMPO_OBRIGATORIO), ("participantes", CodigoErro.CAMPO_OBRIGATORIO)]
    assert validar(catalogo, entrada(finalidade="x" * 201))[0].campo == "finalidade"


def test_ambiente_e_disposicao_inativos_bloqueados(catalogo):
    erros = validar(catalogo, entrada(ambienteId="2", disposicaoId="999"))
    assert [e.campo for e in erros] == ["ambienteId", "disposicaoId"]


def test_rn3_18h_21h_fora_faixa_bloqueado(catalogo):
    erros = validar(catalogo, entrada(("2026-11-10T18:00:00-03:00", "2026-11-10T21:00:00-03:00")))
    assert codigos(erros) == [CodigoErro.FORA_FAIXA]
    assert "07:00 e 20:00" in erros[0].mensagem


def test_rn3_limites_da_faixa_aceitos(catalogo):
    assert validar(catalogo, entrada(("2026-11-10T07:00:00-03:00",
                                      "2026-11-10T20:00:00-03:00"))) == []


def test_rn4_agora_10h_inicio_11h_bloqueado(catalogo):
    erros = validar(catalogo, entrada(("2026-11-01T11:00:00-03:00", "2026-11-01T12:00:00-03:00")))
    assert codigos(erros) == [CodigoErro.SEM_ANTECEDENCIA]
    assert erros[0].sugestao == "a partir de 12:00 de 01/11"


def test_rn4_agora_10h_inicio_12h_aceito(catalogo):
    assert validar(catalogo, entrada(("2026-11-01T12:00:00-03:00",
                                      "2026-11-01T13:00:00-03:00"))) == []


def test_rn4_sugestao_arredonda_e_respeita_a_faixa(catalogo):
    agora = datetime(2026, 11, 1, 10, 10, tzinfo=FUSO)
    erros = validar(catalogo, entrada(("2026-11-01T11:00:00-03:00", "2026-11-01T12:00:00-03:00")),
                    agora=agora)
    assert erros[0].sugestao == "a partir de 12:30 de 01/11"
    tarde = datetime(2026, 11, 1, 19, 0, tzinfo=FUSO)
    erros = validar(catalogo, entrada(("2026-11-01T19:30:00-03:00", "2026-11-01T20:00:00-03:00")),
                    agora=tarde)
    assert erros[0].sugestao == "a partir de 07:00 de 02/11"


def test_rn4_so_nos_periodos_alterados(catalogo):
    passado = ("2026-11-01T09:00:00-03:00", "2026-11-01T10:00:00-03:00")
    futuro = ("2026-11-10T14:00:00-03:00", "2026-11-10T16:00:00-03:00")
    assert validar(catalogo, entrada(passado, futuro), alterados={1}) == []
    assert codigos(validar(catalogo, entrada(passado, futuro), alterados=None)) == \
        [CodigoErro.SEM_ANTECEDENCIA]


# --- RN9 e quantidades ---------------------------------------------------------------------


def test_rn9_kit_sala1_nao_aparece_sala2(catalogo):
    # CODEC 01 (id 11) é vinculado só à Sala de Reuniões do 9º andar (id 3).
    assert "11" in [r.id for r in recursos_oferecidos("3", catalogo)]
    assert "11" not in [r.id for r in recursos_oferecidos("7", catalogo)]
    erros = validar(catalogo, entrada(ambienteId="7", recursos=[ItemRecurso("11", 1)]))
    assert codigos(erros) == [CodigoErro.RECURSO_INDISPONIVEL_AMBIENTE]
    assert erros[0].campo == "recursos"


def test_rn9_recurso_vinculado_em_local_proprio_bloqueado(catalogo):
    erros = validar(catalogo, entrada(ambienteId=None, complemento="Sala 304",
                                      recursos=[ItemRecurso("11", 1)]))
    assert codigos(erros) == [CodigoErro.RECURSO_INDISPONIVEL_AMBIENTE]


def test_recursos_oferecidos_so_ativos(catalogo):
    inativos = {r.id for r in catalogo.recursos if not r.ativo}
    oferecidos = {r.id for r in recursos_oferecidos("1", catalogo)}
    assert oferecidos and not (oferecidos & inativos)
    assert "2" in {r.id for r in recursos_oferecidos(None, catalogo)}


def test_quantidade_so_para_limitados(catalogo):
    erros = validar(catalogo, entrada(recursos=[ItemRecurso("2", 3)]))
    assert codigos(erros) == [CodigoErro.CAMPO_OBRIGATORIO]
    erros = validar(catalogo, entrada(recursos=[ItemRecurso("6", 5)]))
    assert codigos(erros) == [CodigoErro.RECURSO_ESGOTADO]
    assert validar(catalogo, entrada(recursos=[ItemRecurso("6", 2)])) == []


def test_recurso_repetido_e_inexistente(catalogo):
    erros = validar(catalogo, entrada(recursos=[ItemRecurso("2", 1), ItemRecurso("2", 1),
                                                ItemRecurso("999", 1)]))
    assert codigos(erros) == [CodigoErro.CAMPO_OBRIGATORIO, CodigoErro.RECURSO_INDISPONIVEL_AMBIENTE]


def test_mais_de_cinco_limitados(catalogo):
    cat = replace(catalogo, recursos=[replace(r, limitado=True, disponibilidade=9)
                                      if not r.ambientesVinculados else r
                                      for r in catalogo.recursos])
    livres = [r.id for r in recursos_oferecidos("3", cat) if r.limitado][:6]
    erros = validar(cat, entrada(recursos=[ItemRecurso(r, 1) for r in livres]))
    assert codigos(erros) == [CodigoErro.CAMPO_OBRIGATORIO]


# --- RN13 e RN12 ---------------------------------------------------------------------------


def test_rn13_agora_10h_periodo_9_11_em_andamento():
    r = reserva(("2026-11-01T09:00:00-03:00", "2026-11-01T11:00:00-03:00"))
    assert status(r, AGORA) == "em_andamento"


def test_rn13_prevista_transcorrida_cancelada():
    r = reserva(("2026-11-01T11:00:00-03:00", "2026-11-01T12:00:00-03:00"),
                ("2026-11-01T08:00:00-03:00", "2026-11-01T09:00:00-03:00"))
    assert status(r, datetime(2026, 11, 1, 7, 59, tzinfo=FUSO)) == "prevista"
    assert status(r, datetime(2026, 11, 1, 10, 0, tzinfo=FUSO)) == "em_andamento"
    assert status(r, datetime(2026, 11, 1, 12, 0, tzinfo=FUSO)) == "transcorrida"
    assert status(replace(r, cancelada=True), AGORA) == "cancelada"


def test_rn12_reserva_encerrada_edicao_bloqueada():
    transcorrida = reserva(("2026-10-20T09:00:00-03:00", "2026-10-20T11:00:00-03:00"))
    assert codigos(pode_alterar(transcorrida, AGORA)) == [CodigoErro.RESERVA_ENCERRADA]
    futura = reserva(("2026-11-10T14:00:00-03:00", "2026-11-10T16:00:00-03:00"), cancelada=True)
    assert codigos(pode_alterar(futura, AGORA)) == [CodigoErro.RESERVA_ENCERRADA]
    assert pode_alterar(replace(futura, cancelada=False), AGORA) == []


def test_rn12_cancelamento_sem_antecedencia_bloqueado(catalogo):
    r = reserva(("2026-11-01T11:00:00-03:00", "2026-11-01T12:00:00-03:00"))
    assert codigos(pode_cancelar(r, catalogo.config, AGORA)) == \
        [CodigoErro.CANCELAMENTO_SEM_ANTECEDENCIA]
    r = reserva(("2026-11-01T12:00:00-03:00", "2026-11-01T13:00:00-03:00"))
    assert pode_cancelar(r, catalogo.config, AGORA) == []
    assert codigos(pode_cancelar(replace(r, cancelada=True), catalogo.config, AGORA)) == \
        [CodigoErro.RESERVA_ENCERRADA]


def test_periodos_alterados_compara_inicio():
    antiga = reserva(("2026-11-10T14:00:00-03:00", "2026-11-10T16:00:00-03:00"),
                     ("2026-11-11T14:00:00-03:00", "2026-11-11T16:00:00-03:00"))
    nova = entrada(("2026-11-10T17:00:00Z", "2026-11-10T17:00:00-03:00"),
                   ("2026-11-11T15:00:00-03:00", "2026-11-11T16:00:00-03:00"))
    assert periodos_alterados(antiga, nova) == {1}
