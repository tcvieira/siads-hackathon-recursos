#!/usr/bin/env bash
# Build e deploy do stack SAM `sisgares` (tarefas 1.5 e 1.8).
#
# Lê COGNITO_USER_POOL_ID e COGNITO_CLIENT_ID do .env, passa como --parameter-overrides e grava os
# outputs ApiUrl e TableName de volta no .env (API_URL, TABLE_NAME). Só a Frente 1 roda este script:
# dois deploys ao mesmo tempo falham com UPDATE_IN_PROGRESS.
#
# Uso, na raiz do repositório:  bash scripts/deploy_backend.sh
set -euo pipefail

RAIZ=$(cd "$(dirname "$0")/.." && pwd)
ENV_FILE="$RAIZ/.env"
sed -i 's/\r$//' "$ENV_FILE"
set -a; . "$ENV_FILE"; set +a
: "${COGNITO_USER_POOL_ID:?Rode antes o scripts/cognito.sh}"
: "${COGNITO_CLIENT_ID:?Rode antes o scripts/cognito.sh}"

gravar_env() {
  if grep -q "^$1=" "$ENV_FILE"; then
    sed -i "s|^$1=.*|$1=$2|" "$ENV_FILE"
  else
    printf '%s=%s\n' "$1" "$2" >> "$ENV_FILE"
  fi
}

cd "$RAIZ/backend"
sam validate --lint
sam build
sam deploy --parameter-overrides \
  "UserPoolId=$COGNITO_USER_POOL_ID" "ClientId=$COGNITO_CLIENT_ID"

saida() {
  aws cloudformation describe-stacks --stack-name sisgares \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue | [0]" --output text
}
gravar_env API_URL "$(saida ApiUrl)"
gravar_env TABLE_NAME "$(saida TableName)"
echo "API_URL e TABLE_NAME gravados no .env."
