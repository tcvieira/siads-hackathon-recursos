"""Consumidor do stream (tarefa 2.10): e-mails por setor e pedidos SNP (R6, RN10, RN11, RN12)."""

from datetime import datetime
from decimal import Decimal

import pytest
from boto3.dynamodb.conditions import Key
from boto3.dynamodb.types import TypeSerializer

from dominio.tempo import FUSO
from handlers import notificacoes

D = "2026-11-10T"
F = ":00-03:00"
TS = "2026-11-05T10:00:00-03:00"
TS2 = "2026-11-05T11:30:00-03:00"
TS3 = "2026-11-05T12:00:00-03:00"


def meta(rid="9001", ini="14:00", fim="16:00", recursos=(("6", 1),), setores=("1", "2", "3", "23"),
         cancelada=False, versao=1, ambiente="3") -> dict:
    """META no formato gravado pelo scripts/seed.py / repo.salvar_reserva."""
    criado = "2026-11-01T10:00:00-03:00"
    return {"PK": f"RESE#{rid}", "SK": "META", "GSI1PK": "SOLI#sub-1", "GSI1SK": criado,
            "id": rid, "finalidade": "Reunião <alinhamento>", "participantes": 12,
            "periodos": [{"inicio": f"{D}{ini}{F}", "termino": f"{D}{fim}{F}"}],
            "recursos": [{"recursoId": r, "qtd": q} for r, q in recursos],
            "solicitanteSub": "sub-1", "solicitanteEmail": "solicitante@example.com",
            "setoresIds": list(setores), "cancelada": cancelada, "versao": versao,
            "criadoEm": criado, "ambienteId": ambiente, "disposicaoId": "5"}


def _imagem(item: dict) -> dict:
    serializar = TypeSerializer().serialize

    def conv(v):
        if isinstance(v, bool):
            return v
        if isinstance(v, int):
            return Decimal(v)
        if isinstance(v, list):
            return [conv(x) for x in v]
        if isinstance(v, dict):
            return {k: conv(x) for k, x in v.items()}
        return v

    return {k: serializar(conv(v)) for k, v in item.items()}


def registro(event_id, nome, nova=None, antiga=None, ts=TS) -> dict:
    """Registro do DynamoDB Stream (NEW_AND_OLD_IMAGES) como a Lambda recebe."""
    base = nova or antiga
    dados = {
        "Keys": _imagem({"PK": base["PK"], "SK": base["SK"]}),
        "ApproximateCreationDateTime": datetime.fromisoformat(ts).timestamp(),
        "StreamViewType": "NEW_AND_OLD_IMAGES",
    }
    if nova is not None:
        dados["NewImage"] = _imagem(nova)
    if antiga is not None:
        dados["OldImage"] = _imagem(antiga)
    return {"eventID": event_id, "eventName": nome, "eventSource": "aws:dynamodb",
            "dynamodb": dados}


def processar(*registros):
    assert notificacoes.handler({"Records": list(registros)}, None) is None


def itens(tabela, rid="9001", prefixo="") -> list[dict]:
    cond = Key("PK").eq(f"RESE#{rid}")
    if prefixo:
        cond &= Key("SK").begins_with(prefixo)
    return tabela.query(KeyConditionExpression=cond)["Items"]


def emails(tabela, rid="9001") -> dict[str, dict]:
    """E-mails por `EMAIL#<ts>#<setor>` (sem o sufixo `#<eventID>` da SK)."""
    return {i["SK"].rsplit("#", 1)[0]: i for i in itens(tabela, rid, "EMAIL#")}


def snp(tabela, rid="9001") -> dict[str, dict]:
    return {i["setorId"]: i for i in itens(tabela, rid, "SNP#")}


ANO = datetime.fromisoformat(TS).astimezone(FUSO).year


@pytest.fixture
def criada(tabela):
    """Reserva 9001 criada no ambiente 3 com o projetor (recurso 6)."""
    processar(registro("e1", "INSERT", nova=meta()))
    return tabela


def test_insert_com_projetor_gera_emails_e_snp(criada):
    tabela = criada
    gravados = emails(tabela)
    assert set(gravados) == {f"EMAIL#{TS}#{s}" for s in ("1", "2", "3", "23")}
    seart = gravados[f"EMAIL#{TS}#2"]
    assert seart["para"] == "PRCE-ListaSEART@mpf.mp.br"
    assert gravados[f"EMAIL#{TS}#1"]["para"] == "PRCE-SMSG@mpf.mp.br"
    assert seart["tipo"] == "criada" and seart["assunto"] == "[SISGARES] Reserva 9001 criada"
    assert seart["GSI1PK"] == "NOTIF" and seart["GSI1SK"] == TS and seart["ts"] == TS
    assert seart["SK"] == f"EMAIL#{TS}#2#e1"
    assert "Reunião &lt;alinhamento&gt;" in seart["html"] and "<alinhamento>" not in seart["html"]
    assert "solicitante@example.com" not in seart["html"]
    pedidos = snp(tabela)
    assert set(pedidos) == {"2"}
    assert pedidos["2"]["numero"] == f"SNP-{ANO}-00001"
    assert pedidos["2"]["codigoServico"] == "SNP-TI-0006"
    assert pedidos["2"]["situacao"] == "ativo"
    assert itens(tabela, prefixo="EVT#")[0]["SK"] == "EVT#e1"


def test_insert_so_copa_sem_snp(tabela):
    processar(registro("e1", "INSERT", nova=meta(recursos=(("2", 1),), setores=("1", "23"))))
    gravados = emails(tabela)
    assert gravados[f"EMAIL#{TS}#1"]["para"] == "PRCE-SMSG@mpf.mp.br"
    assert set(gravados) == {f"EMAIL#{TS}#1", f"EMAIL#{TS}#23"}
    assert snp(tabela) == {}  # RN11: copa não tem código SNP


def test_modify_alterada_mantem_numero_snp(criada):
    tabela = criada
    processar(registro("e2", "MODIFY", nova=meta(ini="15:00", fim="17:00", versao=2),
                       antiga=meta(), ts=TS2))
    seart = emails(tabela)[f"EMAIL#{TS2}#2"]
    assert seart["tipo"] == "alterada"
    assert [a["campo"] for a in seart["alteracoes"]] == ["Períodos"]
    assert "ALTERADO:" in seart["html"] and "<del" in seart["html"] and "<ins" in seart["html"]
    assert "10/11 14:00–16:00" in seart["html"] and "10/11 15:00–17:00" in seart["html"]
    pedidos = snp(tabela)
    assert pedidos["2"]["numero"] == f"SNP-{ANO}-00001" and pedidos["2"]["situacao"] == "ativo"
    contador = tabela.get_item(Key={"PK": "CTR#SNP", "SK": "CTR"})["Item"]["valor"]
    assert contador == 1  # nenhum número novo emitido


def test_modify_alterada_notifica_setor_que_saiu_e_cancela_snp(criada):
    tabela = criada
    processar(registro("e2", "MODIFY", nova=meta(recursos=(("2", 1),), setores=("1", "23"),
                                                 versao=2), antiga=meta(), ts=TS2))
    assert f"EMAIL#{TS2}#2" in emails(tabela)  # antigos ∪ novos
    assert snp(tabela)["2"]["situacao"] == "cancelado"


def test_modify_sem_diferenca_nao_grava(criada):
    tabela = criada
    antes = len(tabela.scan()["Items"])
    processar(registro("e2", "MODIFY", nova=meta(versao=2), antiga=meta(), ts=TS2))
    assert len(tabela.scan()["Items"]) == antes
    assert [i["SK"] for i in itens(tabela, prefixo="EVT#")] == ["EVT#e1"]


def test_cancelamento_gera_email_e_cancela_snp(criada):
    tabela = criada
    processar(registro("e3", "MODIFY", nova=meta(cancelada=True, versao=2), antiga=meta(),
                       ts=TS3))
    gravados = emails(tabela)
    assert gravados[f"EMAIL#{TS3}#2"]["tipo"] == "cancelada"
    assert gravados[f"EMAIL#{TS3}#2"]["assunto"] == "[SISGARES] Reserva 9001 cancelada"
    pedido = snp(tabela)["2"]
    assert pedido["situacao"] == "cancelado" and pedido["numero"] == f"SNP-{ANO}-00001"


def test_mesmo_event_id_nao_duplica(criada):
    tabela = criada
    antes = sorted((i["PK"], i["SK"]) for i in tabela.scan()["Items"])
    processar(registro("e1", "INSERT", nova=meta()))
    depois = sorted((i["PK"], i["SK"]) for i in tabela.scan()["Items"])
    assert depois == antes
    assert snp(tabela)["2"]["numero"] == f"SNP-{ANO}-00001"


def test_remove_e_outras_chaves_ignorados(tabela):
    antes = len(tabela.scan()["Items"])
    per = {"PK": "RESE#9001", "SK": "PER#0", "reservaId": "9001"}
    processar(registro("e1", "REMOVE", antiga=meta()), registro("e2", "INSERT", nova=per))
    assert len(tabela.scan()["Items"]) == antes


def test_lote_vazio(tabela):
    processar()
