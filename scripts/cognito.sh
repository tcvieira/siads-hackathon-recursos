#!/usr/bin/env bash
# Provisiona o Cognito do SISGARES: passos 1–7 do ARQUITETURA.md (o passo 0, app Amplify, já existe).
#
# Idempotente: cada recurso é consultado antes de ser criado, e a segunda execução não cria nada.
# Lê e grava o .env da raiz: entrada AMPLIFY_APP_ID (e COGNITO_DOMAIN, se já existir); saída
# COGNITO_USER_POOL_ID, COGNITO_CLIENT_ID e COGNITO_DOMAIN (só o prefixo, design.md §12.3).
# A senha das contas de demo é lida sem eco e nunca vai para o .env nem para o repositório.
#
# Uso, na raiz do repositório:  bash scripts/cognito.sh
set -euo pipefail

RAIZ=$(cd "$(dirname "$0")/.." && pwd)
ENV_FILE="$RAIZ/.env"
[ -f "$ENV_FILE" ] || { echo "Falta o $ENV_FILE (copie o .env-example)." >&2; exit 1; }
sed -i 's/\r$//' "$ENV_FILE"
set -a; . "$ENV_FILE"; set +a

# Grava (ou substitui) CHAVE=valor no .env.
gravar_env() {
  if grep -q "^$1=" "$ENV_FILE"; then
    sed -i "s|^$1=.*|$1=$2|" "$ENV_FILE"
  else
    printf '%s=%s\n' "$1" "$2" >> "$ENV_FILE"
  fi
}

# Ponte entre o .env e as variáveis do ARQUITETURA.md.
APP_ID=${AMPLIFY_APP_ID:?Defina AMPLIFY_APP_ID no .env (tarefa 1.1)}
export AWS_REGION=${AWS_DEFAULT_REGION:-us-east-1}

# --- 1. Variáveis -------------------------------------------------------------------------
NOME=sisgares
SETOR_ID=1                                   # ENVO_ID do SMSG (dados-envolvido.csv)
CALLBACKS=(http://localhost:5173/ "https://main.$APP_ID.amplifyapp.com/")
DOMINIO=${COGNITO_DOMAIN:-}
SENHA=''

# Lê a senha de demo só quando alguma conta precisar ser criada.
ler_senha() {
  [ -n "$SENHA" ] && return
  if [ -n "${SENHA_DEMO:-}" ]; then
    SENHA=$SENHA_DEMO
  elif [ -t 0 ]; then
    read -r -s -p "Senha das contas de demo (8+, maiúscula, minúscula, número e símbolo): " SENHA; echo
  else
    echo "Sem terminal para ler a senha: rode em um terminal interativo ou exporte SENHA_DEMO." >&2
    exit 1
  fi
}

# --- 2. User Pool -------------------------------------------------------------------------
POOL=$(aws cognito-idp list-user-pools --max-results 60 \
  --query "UserPools[?Name=='$NOME'].Id | [0]" --output text)
if [ "$POOL" = "None" ] || [ -z "$POOL" ]; then
  POOL=$(aws cognito-idp create-user-pool --pool-name "$NOME" \
    --username-attributes email \
    --schema Name=setorId,AttributeDataType=String,Mutable=true \
    --admin-create-user-config AllowAdminCreateUserOnly=true \
    --policies 'PasswordPolicy={MinimumLength=8,RequireUppercase=true,RequireLowercase=true,RequireNumbers=true,RequireSymbols=true}' \
    --query UserPool.Id --output text)
  echo "User Pool criado: $POOL"
else
  echo "User Pool existente: $POOL"
fi
gravar_env COGNITO_USER_POOL_ID "$POOL"

# --- 3. Domínio da página de login --------------------------------------------------------
DOMINIO_ATUAL=$(aws cognito-idp describe-user-pool --user-pool-id "$POOL" \
  --query UserPool.Domain --output text)
if [ "$DOMINIO_ATUAL" != "None" ] && [ -n "$DOMINIO_ATUAL" ]; then
  DOMINIO=$DOMINIO_ATUAL
  echo "Domínio existente: $DOMINIO"
else
  if [ -z "$DOMINIO" ]; then
    # Padrão: sisgares-<id da conta>, único na região sem precisar perguntar.
    PADRAO="sisgares-$(aws sts get-caller-identity --query Account --output text)"
    if [ -t 0 ]; then
      read -r -p "Prefixo do domínio de login [$PADRAO]: " DOMINIO
    fi
    DOMINIO=${DOMINIO:-$PADRAO}
  fi
  aws cognito-idp create-user-pool-domain --user-pool-id "$POOL" --domain "$DOMINIO" > /dev/null
  echo "Domínio criado: $DOMINIO"
fi
gravar_env COGNITO_DOMAIN "$DOMINIO"

# --- 4. App client público ----------------------------------------------------------------
CLIENT_ID=$(aws cognito-idp list-user-pool-clients --user-pool-id "$POOL" --max-results 60 \
  --query "UserPoolClients[?ClientName=='$NOME-web'].ClientId | [0]" --output text)
if [ "$CLIENT_ID" = "None" ] || [ -z "$CLIENT_ID" ]; then
  CLIENT_ID=$(aws cognito-idp create-user-pool-client --user-pool-id "$POOL" \
    --client-name "$NOME-web" \
    --no-generate-secret \
    --allowed-o-auth-flows-user-pool-client \
    --allowed-o-auth-flows code \
    --allowed-o-auth-scopes openid email profile \
    --supported-identity-providers COGNITO \
    --callback-urls "${CALLBACKS[@]}" \
    --logout-urls "${CALLBACKS[@]}" \
    --explicit-auth-flows ALLOW_USER_SRP_AUTH ALLOW_REFRESH_TOKEN_AUTH \
    --read-attributes email email_verified custom:setorId \
    --write-attributes email \
    --prevent-user-existence-errors ENABLED \
    --query UserPoolClient.ClientId --output text)
  echo "App client criado: $CLIENT_ID"
else
  echo "App client existente: $CLIENT_ID"
fi
gravar_env COGNITO_CLIENT_ID "$CLIENT_ID"

# --- 5. Grupos (papéis) -------------------------------------------------------------------
for G in solicitante atendente admin; do
  if aws cognito-idp get-group --user-pool-id "$POOL" --group-name "$G" > /dev/null 2>&1; then
    echo "Grupo existente: $G"
  else
    aws cognito-idp create-group --user-pool-id "$POOL" --group-name "$G" > /dev/null
    echo "Grupo criado: $G"
  fi
done

# --- 6. Contas de demo --------------------------------------------------------------------
criar_conta() {  # uso: criar_conta <email> <grupo> [setorId]
  local EMAIL=$1 GRUPO=$2 SETOR=${3:-}
  if aws cognito-idp admin-get-user --user-pool-id "$POOL" --username "$EMAIL" > /dev/null 2>&1; then
    echo "Conta existente: $EMAIL"
  else
    ler_senha
    local ATTRS=(Name=email,Value="$EMAIL" Name=email_verified,Value=true)
    [ -n "$SETOR" ] && ATTRS+=(Name=custom:setorId,Value="$SETOR")
    aws cognito-idp admin-create-user --user-pool-id "$POOL" --username "$EMAIL" \
      --user-attributes "${ATTRS[@]}" --message-action SUPPRESS > /dev/null
    aws cognito-idp admin-set-user-password --user-pool-id "$POOL" --username "$EMAIL" \
      --password "$SENHA" --permanent
    echo "Conta criada: $EMAIL"
  fi
  # Idempotente: adicionar a um grupo do qual já é membro não dá erro.
  aws cognito-idp admin-add-user-to-group --user-pool-id "$POOL" --username "$EMAIL" \
    --group-name "$GRUPO"
}

criar_conta solicitante@example.com solicitante
criar_conta atendente@example.com   atendente "$SETOR_ID"
criar_conta admin@example.com       admin
unset SENHA SENHA_DEMO

# --- 7. Conferência -----------------------------------------------------------------------
echo
echo "custom:setorId do atendente: $(aws cognito-idp admin-get-user --user-pool-id "$POOL" \
  --username atendente@example.com \
  --query "UserAttributes[?Name=='custom:setorId'].Value | [0]" --output text)"
for EMAIL in solicitante@example.com atendente@example.com admin@example.com; do
  echo "Grupos de $EMAIL: $(aws cognito-idp admin-list-groups-for-user --user-pool-id "$POOL" \
    --username "$EMAIL" --query 'Groups[].GroupName' --output text)"
done

echo
echo "Issuer:    https://cognito-idp.$AWS_REGION.amazonaws.com/$POOL"
echo "Teste de login (deve voltar para http://localhost:5173/?code=...):"
echo "https://$DOMINIO.auth.$AWS_REGION.amazoncognito.com/login?client_id=$CLIENT_ID&response_type=code&scope=openid+email+profile&redirect_uri=http://localhost:5173/"
