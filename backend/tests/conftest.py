"""Põe backend/src no sys.path, como no Lambda (CodeUri: src/), e simula a tabela com a moto."""

import sys
from pathlib import Path

import pytest

SRC = Path(__file__).resolve().parent.parent / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

NOME_TABELA = "sisgares"


@pytest.fixture
def tabela(monkeypatch):
    """Tabela `sisgares` na moto, igual ao backend/template.yaml, com o catálogo dos CSVs.

    Credenciais falsas e região fixa: nenhum teste alcança a AWS real, e o .env nunca é lido.
    """
    import boto3
    from moto import mock_aws

    import catalogo_csv
    from comum import repo

    for chave in ("AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN",
                  "AWS_SECURITY_TOKEN"):
        monkeypatch.setenv(chave, "testing")
    monkeypatch.setenv("AWS_DEFAULT_REGION", "us-east-1")
    monkeypatch.delenv("AWS_PROFILE", raising=False)
    monkeypatch.setenv("TABLE_NAME", NOME_TABELA)

    repo.reiniciar_cache()
    with mock_aws():
        dynamodb = boto3.resource("dynamodb", region_name="us-east-1")
        t = dynamodb.create_table(
            TableName=NOME_TABELA,
            BillingMode="PAY_PER_REQUEST",
            AttributeDefinitions=[{"AttributeName": n, "AttributeType": "S"}
                                  for n in ("PK", "SK", "GSI1PK", "GSI1SK")],
            KeySchema=[{"AttributeName": "PK", "KeyType": "HASH"},
                       {"AttributeName": "SK", "KeyType": "RANGE"}],
            GlobalSecondaryIndexes=[{
                "IndexName": "GSI1",
                "KeySchema": [{"AttributeName": "GSI1PK", "KeyType": "HASH"},
                              {"AttributeName": "GSI1SK", "KeyType": "RANGE"}],
                "Projection": {"ProjectionType": "ALL"},
            }],
            StreamSpecification={"StreamEnabled": True, "StreamViewType": "NEW_AND_OLD_IMAGES"},
        )
        with t.batch_writer() as lote:
            for item in catalogo_csv.itens_tabela():
                lote.put_item(Item=item)
        yield t
    repo.reiniciar_cache()
