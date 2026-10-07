# /// script
# requires-python = ">=3.12"
# dependencies = ["boto3", "pycognito==2024.5.1", "python-dotenv"]
# ///
"""Faz login (SRP) com as 3 contas de demo e guarda os ID tokens para testar a API sem o frontend.

O app client só permite USER_SRP_AUTH, então o login usa o protocolo SRP do pycognito. A senha é
lida sem eco. Os tokens (válidos por 1 hora) vão para ~/.cache/sisgares/tokens.json, com
permissão 600 e fora do repositório.

Uso, na raiz do repositório:  uv run scripts/obter_tokens.py
Depois, por exemplo:
    TOKEN=$(jq -r .solicitante ~/.cache/sisgares/tokens.json)
    curl -H "Authorization: Bearer $TOKEN" "$API_URL/catalogo"
"""

import getpass
import json
import os
from pathlib import Path

import boto3
from dotenv import load_dotenv
from pycognito.aws_srp import AWSSRP

RAIZ = Path(__file__).resolve().parent.parent
DESTINO = Path.home() / ".cache" / "sisgares" / "tokens.json"
CONTAS = ["solicitante", "atendente", "admin"]


def main() -> None:
    load_dotenv(RAIZ / ".env")
    pool_id = os.environ["COGNITO_USER_POOL_ID"]
    client_id = os.environ["COGNITO_CLIENT_ID"]
    senha = os.environ.get("SENHA_DEMO") or getpass.getpass("Senha das contas de demo: ")
    cognito = boto3.client("cognito-idp")

    tokens = {}
    for conta in CONTAS:
        srp = AWSSRP(username=f"{conta}@example.com", password=senha, pool_id=pool_id,
                     client_id=client_id, client=cognito)
        tokens[conta] = srp.authenticate_user()["AuthenticationResult"]["IdToken"]
        print(f"ok: {conta}@example.com")

    DESTINO.parent.mkdir(parents=True, exist_ok=True)
    DESTINO.touch(mode=0o600, exist_ok=True)
    DESTINO.write_text(json.dumps(tokens))
    print(f"ID tokens gravados em {DESTINO} (valem 1 hora).")


if __name__ == "__main__":
    main()
