"""Testa o acesso à AWS usando as variáveis definidas no arquivo .env.

Além de validar as credenciais, verifica quais serviços citados nos critérios de
avaliação do hackathon estão liberados para a conta. Cada verificação faz uma única
chamada de leitura (list/describe), sem criar nem alterar recursos.
"""

import sys
from pathlib import Path

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from dotenv import load_dotenv

RAIZ = Path(__file__).resolve().parent.parent
load_dotenv(RAIZ / ".env")

ERROS_DE_PERMISSAO = {
    "AccessDenied",
    "AccessDeniedException",
    "AuthorizationError",
    "UnauthorizedOperation",
    "UnauthorizedException",
    "NotAuthorized",
}

# (grupo, serviço, client boto3, método, argumentos)
VERIFICACOES = [
    ("Serverless", "Lambda", "lambda", "list_functions", {"MaxItems": 1}),
    ("Serverless", "API Gateway (REST)", "apigateway", "get_rest_apis", {"limit": 1}),
    ("Serverless", "API Gateway (HTTP)", "apigatewayv2", "get_apis", {"MaxResults": "1"}),
    ("Serverless", "S3", "s3", "list_buckets", {}),
    ("Serverless", "DynamoDB", "dynamodb", "list_tables", {"Limit": 1}),
    ("Serverless", "Step Functions", "stepfunctions", "list_state_machines", {"maxResults": 1}),
    ("Eventos", "EventBridge", "events", "list_event_buses", {"Limit": 1}),
    ("Eventos", "SNS", "sns", "list_topics", {}),
    ("Eventos", "SQS", "sqs", "list_queues", {"MaxResults": 1}),
    ("IaC", "CloudFormation (SAM/CDK)", "cloudformation", "list_stacks", {}),
    ("IA generativa", "Bedrock", "bedrock", "list_foundation_models", {}),
    ("Segurança", "Cognito", "cognito-idp", "list_user_pools", {"MaxResults": 1}),
    ("Segurança", "Verified Permissions", "verifiedpermissions", "list_policy_stores", {"maxResults": 1}),
    ("Segurança", "IAM", "iam", "list_roles", {"MaxItems": 1}),
    ("Segurança", "KMS", "kms", "list_keys", {"Limit": 1}),
    ("Segurança", "Secrets Manager", "secretsmanager", "list_secrets", {"MaxResults": 1}),
    ("Observabilidade", "CloudWatch Logs", "logs", "describe_log_groups", {"limit": 1}),
    ("Frontend", "CloudFront", "cloudfront", "list_distributions", {"MaxItems": "1"}),
    ("Frontend", "Amplify Hosting", "amplify", "list_apps", {"maxResults": 1}),
]


def verificar_servico(sessao: boto3.Session, client: str, metodo: str, argumentos: dict) -> tuple[str, str]:
    """Retorna (status, detalhe) para a chamada de leitura de um serviço."""
    try:
        resposta = getattr(sessao.client(client), metodo)(**argumentos)
    except ClientError as erro:
        codigo = erro.response.get("Error", {}).get("Code", "")
        if codigo in ERROS_DE_PERMISSAO:
            return "BLOQUEADO", codigo
        return "ERRO", f"{codigo}: {erro.response.get('Error', {}).get('Message', '')}"
    except BotoCoreError as erro:
        return "ERRO", str(erro)

    if client == "bedrock":
        return "LIBERADO", f"{len(resposta.get('modelSummaries', []))} modelos listados"
    return "LIBERADO", ""


def main() -> int:
    try:
        sessao = boto3.Session()
        print(f"Região: {sessao.region_name}")

        identidade = sessao.client("sts").get_caller_identity()
        print("Acesso OK (STS get-caller-identity)")
        print(f"  Account: {identidade['Account']}")
        print(f"  Arn:     {identidade['Arn']}")
    except (ClientError, BotoCoreError) as erro:
        print(f"Falha ao acessar a AWS: {erro}", file=sys.stderr)
        return 1

    print("\nServiços dos critérios de avaliação:")
    liberados = 0
    grupo_atual = None
    for grupo, servico, client, metodo, argumentos in VERIFICACOES:
        if grupo != grupo_atual:
            print(f"\n  [{grupo}]")
            grupo_atual = grupo
        status, detalhe = verificar_servico(sessao, client, metodo, argumentos)
        liberados += status == "LIBERADO"
        sufixo = f" ({detalhe})" if detalhe else ""
        print(f"    {status:<9} {servico}{sufixo}")

    print(f"\n{liberados}/{len(VERIFICACOES)} serviços liberados para leitura.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
