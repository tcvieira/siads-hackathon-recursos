"""Smoke test do Amplify Hosting: dispara um build do branch e confere se a página é servida.

O app está conectado ao GitHub, e cada push no branch já dispara build e deploy. Este
teste faz o mesmo sob demanda, sem precisar de commit:

1. Localiza o app pelo ID (--app-id) ou pelo nome, recusando nomes ambíguos.
2. Dispara um job RELEASE do último commit do branch.
3. Espera o job terminar.
4. Faz GET em https://<branch>.<appId>.amplifyapp.com/ até receber HTTP 200.

Na rede do MPF, a inspeção de TLS troca o certificado do site. Para o passo 4 funcionar,
a CA raiz do MPF precisa estar no bundle indicado por SSL_CERT_FILE.
"""

import argparse
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from dotenv import load_dotenv

RAIZ = Path(__file__).resolve().parent.parent
load_dotenv(RAIZ / ".env")

STATUS_FINAIS = {"SUCCEED", "FAILED", "CANCELLED"}


def localizar_app(amplify, nome: str) -> str:
    """Retorna o appId do único app com esse nome."""
    ids = [
        app["appId"]
        for pagina in amplify.get_paginator("list_apps").paginate()
        for app in pagina["apps"]
        if app["name"] == nome
    ]
    if not ids:
        raise RuntimeError(f"nenhum app com o nome '{nome}'")
    if len(ids) > 1:
        raise RuntimeError(f"mais de um app com o nome '{nome}' ({', '.join(ids)}); use --app-id")
    return ids[0]


def esperar_job(amplify, app_id: str, branch: str, job_id: str, limite_s: int) -> str:
    """Espera o job chegar a um status final e retorna esse status."""
    fim = time.monotonic() + limite_s
    status = ""
    while time.monotonic() < fim:
        status = amplify.get_job(appId=app_id, branchName=branch, jobId=job_id)["job"]["summary"]["status"]
        if status in STATUS_FINAIS:
            return status
        time.sleep(10)
    return f"TIMEOUT (último status: {status})"


def esperar_pagina(url: str, limite_s: int) -> tuple[bool, str]:
    """Faz GET até receber HTTP 200. Retorna (ok, último resultado)."""
    fim = time.monotonic() + limite_s
    ultimo = ""
    while time.monotonic() < fim:
        try:
            with urllib.request.urlopen(url, timeout=15) as resposta:
                return True, f"HTTP {resposta.status}"
        except urllib.error.HTTPError as erro:
            ultimo = f"HTTP {erro.code}"
        except urllib.error.URLError as erro:
            ultimo = str(erro.reason)
        time.sleep(5)
    return False, ultimo


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--app-id", help="ID do app no Amplify (sem ele, procura pelo nome)")
    parser.add_argument("--nome", default="sisgares", help="nome do app no Amplify (padrão: sisgares)")
    parser.add_argument("--branch", default="main", help="branch do app (padrão: main)")
    args = parser.parse_args()

    try:
        sessao = boto3.Session()
        amplify = sessao.client("amplify")
        print(f"Região: {sessao.region_name}")

        app_id = args.app_id or localizar_app(amplify, args.nome)
        app = amplify.get_app(appId=app_id)["app"]
        print(f"App: {app_id} ({app.get('repository') or 'sem repositório'})")

        job = amplify.start_job(appId=app_id, branchName=args.branch, jobType="RELEASE")["jobSummary"]
        print(f"Build iniciado (job {job['jobId']}, commit {job.get('commitId', '?')[:8]}), aguardando...")

        status = esperar_job(amplify, app_id, args.branch, job["jobId"], limite_s=900)
        print(f"Job: {status}")
        if status != "SUCCEED":
            print(f"Log no console: https://console.aws.amazon.com/amplify/apps/{app_id}/branches/{args.branch}/deployments")
            return 1
    except (ClientError, BotoCoreError, RuntimeError) as erro:
        print(f"Falha: {erro}", file=sys.stderr)
        return 1

    url = f"https://{args.branch}.{app_id}.amplifyapp.com/"
    ok, detalhe = esperar_pagina(url, limite_s=120)
    print(f"Página: {'OK' if ok else 'FALHOU'} ({detalhe}) em {url}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
