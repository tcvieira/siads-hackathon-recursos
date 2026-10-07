"""Fumaça da Fase 0: contratos importáveis e handlers stub respondendo."""

import json

import pytest

from dominio import modelos
from handlers import catalogo, notificacoes, paineis, reservas

CODIGOS_DESIGN = {
    "PERIODO_INVALIDO",
    "CAMPO_OBRIGATORIO",
    "FORA_FAIXA",
    "SEM_ANTECEDENCIA",
    "RECURSO_INDISPONIVEL_AMBIENTE",
    "CONFLITO_AMBIENTE",
    "RECURSO_ESGOTADO",
    "RESERVA_ENCERRADA",
    "CANCELAMENTO_SEM_ANTECEDENCIA",
}


def test_codigos_de_erro_iguais_ao_design():
    assert {c.value for c in modelos.CodigoErro} == CODIGOS_DESIGN


def test_modelos_instanciaveis():
    reserva = modelos.Reserva(
        id="17326",
        finalidade="Reunião",
        participantes=10,
        ambienteId="1",
        periodos=[modelos.Periodo("2026-05-04T09:00:00-03:00", "2026-05-04T11:00:00-03:00")],
        recursos=[modelos.ItemRecurso(recursoId="6", qtd=1)],
        solicitanteSub="sub",
        solicitanteEmail="solicitante@example.com",
        setoresIds=["1"],  # ENVO_ID (1 = SMSG), não a sigla
        cancelada=False,
        versao=1,
        criadoEm="2026-05-01T10:00:00-03:00",
    )
    assert reserva.status is None
    assert modelos.ResultadoValidacao(ok=True).erros == []
    erro = modelos.Erro(campo="periodos", codigo=modelos.CodigoErro.CONFLITO_AMBIENTE, mensagem="x")
    assert modelos.RespostaErro(erros=[erro]).erros[0].codigo == "CONFLITO_AMBIENTE"


def test_dominio_sem_boto3():
    fonte = open(modelos.__file__, encoding="utf-8").read()
    assert "boto3" not in fonte.replace("sem boto3", "")
    assert "pydantic" not in fonte.lower().replace("sem pydantic", "")


@pytest.mark.parametrize("modulo", [catalogo, reservas, paineis])
def test_handlers_http_stub_501(modulo):
    resposta = modulo.handler({}, None)
    assert resposta["statusCode"] == 501
    assert isinstance(json.loads(resposta["body"]), dict)


def test_handler_stream_stub_sem_erro():
    assert notificacoes.handler({"Records": []}, None) is None
