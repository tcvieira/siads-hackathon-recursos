"""Integração entre as Lambdas: API grava, o stream da moto alimenta `notificacoes`, painéis leem.

Os registros vêm do DynamoDB Stream simulado (não montados à mão), para pegar desencontros entre
o que `repo.salvar_reserva`/`cancelar_reserva` gravam e o que o consumidor e os painéis esperam.
"""
import re
from datetime import datetime, timedelta

import boto3
import pytest

from dominio.tempo import FUSO, para_iso
from eventos import claims_de, corpo_json, evento_http
from handlers import notificacoes, paineis, reservas

AGORA = datetime(2026, 11, 10, 8, 0, tzinfo=FUSO)
D = "2026-11-10T"
F = ":00-03:00"
JANELA = {"de": "2026-11-10T00:00:00-03:00", "ate": "2026-11-12T00:00:00-03:00"}
SOLICITANTE = claims_de("solicitante", "sub-sol", "solicitante@example.com")
ADMIN = claims_de("admin", "sub-admin", "admin@example.com")
ATENDENTE_SEART = claims_de("atendente", "sub-at2", "seart@example.com", setorId="2")


@pytest.fixture(autouse=True)
def relogio(monkeypatch):
    monkeypatch.setattr(reservas, "agora", lambda: AGORA)
    monkeypatch.setattr(paineis, "agora", lambda: AGORA)


class Stream:
    """Lê o stream da tabela simulada a partir do início e entrega só os registros novos."""

    def __init__(self, tabela):
        arn = tabela.meta.client.describe_table(TableName=tabela.name)["Table"]["LatestStreamArn"]
        self.cliente = boto3.client("dynamodbstreams", region_name="us-east-1")
        shard = self.cliente.describe_stream(StreamArn=arn)["StreamDescription"]["Shards"][0]
        self.iterador = self.cliente.get_shard_iterator(
            StreamArn=arn, ShardId=shard["ShardId"], ShardIteratorType="TRIM_HORIZON",
        )["ShardIterator"]

    def novos(self) -> list[dict]:
        resp = self.cliente.get_records(ShardIterator=self.iterador)
        self.iterador = resp["NextShardIterator"]
        registros = resp["Records"]
        for r in registros:  # a Lambda recebe epoch em segundos; o boto3 devolve datetime
            data = r["dynamodb"]["ApproximateCreationDateTime"]
            r["dynamodb"]["ApproximateCreationDateTime"] = data.timestamp()
        return registros


def http(modulo, metodo, caminho, corpo=None, claims=SOLICITANTE, query=None):
    resp = modulo.handler(evento_http(metodo, caminho, corpo, claims, query), None)
    return resp["statusCode"], corpo_json(resp)


def janela_notificacoes() -> dict[str, str]:
    """O `ts` do e-mail vem do relógio real do stream, não do relógio fixo dos handlers."""
    agora = datetime.now(FUSO)
    return {"de": para_iso(agora - timedelta(days=1)), "ate": para_iso(agora + timedelta(days=1))}


def test_ciclo_criar_alterar_cancelar_gera_emails_e_snp(tabela):
    stream = Stream(tabela)
    corpo = {"finalidade": "Reunião <alinhamento>", "participantes": 10, "ambienteId": "3",
             "disposicaoId": None,
             "periodos": [{"inicio": f"{D}14:00{F}", "termino": f"{D}16:00{F}"}],
             "recursos": [{"recursoId": "6", "qtd": 1}]}

    status, criada = http(reservas, "POST", "/reservas", corpo)
    assert status == 201, criada
    rid = criada["id"]
    assert set(criada["setoresIds"]) == {"1", "2", "3", "23"}
    notificacoes.handler({"Records": stream.novos()}, None)

    status, cards = http(paineis, "GET", "/painel/atendimento", claims=ATENDENTE_SEART,
                         query=JANELA)
    assert status == 200
    assert [c["reserva"]["id"] for c in cards] == [rid]
    assert cards[0]["reserva"]["solicitanteEmail"] != "solicitante@example.com"  # mascarado
    [pedido] = cards[0]["pedidosSnp"]
    assert pedido["situacao"] == "ativo" and pedido["setorId"] == "2"
    assert re.fullmatch(r"SNP-\d{4}-00001", pedido["numero"])

    status, caixa = http(paineis, "GET", "/notificacoes", claims=ATENDENTE_SEART,
                         query=janela_notificacoes())
    assert status == 200
    assert [(e["reservaId"], e["setorId"], e["tipo"]) for e in caixa["emails"]] == [
        (rid, "2", "criada")]
    assert "&lt;alinhamento&gt;" in caixa["emails"][0]["html"]
    assert "solicitante@example.com" not in caixa["emails"][0]["html"]

    corpo["periodos"] = [{"inicio": f"{D}15:00{F}", "termino": f"{D}17:00{F}"}]
    status, alterada = http(reservas, "PUT", f"/reservas/{rid}", corpo)
    assert status == 200, alterada
    assert alterada["versao"] == 2
    notificacoes.handler({"Records": stream.novos()}, None)

    status, caixa = http(paineis, "GET", "/notificacoes", claims=ATENDENTE_SEART,
                         query=janela_notificacoes())
    tipos = [e["tipo"] for e in caixa["emails"]]
    assert tipos.count("alterada") == 1
    email_alt = next(e for e in caixa["emails"] if e["tipo"] == "alterada")
    assert [a["campo"] for a in email_alt["alteracoes"]] == ["Períodos"]
    assert "ALTERADO:" in email_alt["html"]
    assert [p["numero"] for p in caixa["pedidosSnp"]] == [pedido["numero"]]  # mesmo número

    status, cancelada = http(reservas, "DELETE", f"/reservas/{rid}")
    assert status == 200 and cancelada["cancelada"] is True
    registros = stream.novos()
    notificacoes.handler({"Records": registros}, None)
    notificacoes.handler({"Records": registros}, None)  # retentativa: idempotente por eventID

    status, caixa = http(paineis, "GET", "/notificacoes", claims=ADMIN,
                         query=janela_notificacoes())
    do_seart = [e["tipo"] for e in caixa["emails"] if e["setorId"] == "2"]
    assert sorted(do_seart) == ["alterada", "cancelada", "criada"]
    assert len([e for e in caixa["emails"] if e["tipo"] == "cancelada"]) == 4
    assert [(p["numero"], p["situacao"]) for p in caixa["pedidosSnp"]] == [
        (pedido["numero"], "cancelado")]

    status, cards = http(paineis, "GET", "/painel/atendimento", claims=ADMIN, query=JANELA)
    assert status == 200 and cards == []


def test_local_proprio_passa_pelo_stream_sem_ambiente(tabela):
    stream = Stream(tabela)
    corpo = {"finalidade": "Visita técnica", "participantes": 3, "ambienteId": None,
             "complemento": "Sala do gabinete",
             "periodos": [{"inicio": f"{D}14:00{F}", "termino": f"{D}15:00{F}"}],
             "recursos": []}
    status, criada = http(reservas, "POST", "/reservas", corpo)
    assert status == 201, criada
    notificacoes.handler({"Records": stream.novos()}, None)

    status, caixa = http(paineis, "GET", "/notificacoes", claims=ADMIN,
                         query=janela_notificacoes())
    assert status == 200
    # META sem ambienteId (como o repo grava local próprio) é lida pelo consumidor sem erro.
    assert sorted(e["setorId"] for e in caixa["emails"]) == sorted(criada["setoresIds"])
    assert all("Sala do gabinete" in e["html"] for e in caixa["emails"])
