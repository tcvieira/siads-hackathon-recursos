# Arquitetura — SISGARES (hackathon, 4h)

## Visão geral

```
Frontend (Amplify Hosting)
   │  login (Authorization Code + PKCE)
   ▼
Cognito User Pool  (3 grupos = papéis, 3 contas de demo, custom:setorId)
   │  JWT
   ▼
API Gateway HTTP API ── JWT authorizer
   ▼
Lambda de negócio ──IsAuthorizedWithToken──► Verified Permissions
   │
   ├─► DynamoDB (KMS)
   └─► CloudWatch Logs (decisões allow/deny)
```

Frontend: **Amplify Hosting** (decidido). Simulação IAM deu `allowed` para criar app e fazer deploy. Se der `AccessDenied` na prática, cai para S3 + CloudFront.

## Prioridade

O que mais pesa na nota são as **regras de conflito (RN5 a RN8)** funcionando na demo. A autenticação deve levar **no máximo ~45 min de uma pessoa**.

## Autenticação (Cognito)

Três conceitos separados:

| Conceito | O que é | Onde mora |
|---|---|---|
| **Usuário** | A pessoa que faz login | Cognito (um `sub` por pessoa) |
| **Papel** | O que a pessoa pode fazer: `solicitante`, `atendente` ou `admin` | Grupo do Cognito (`cognito:groups`) |
| **Setor (envolvido)** | Equipe da unidade que atende recursos e serviços. É dado de negócio, não conta de acesso | Tabela de envolvidos (`dados-envolvido.csv`: `ENVO_ID`, `ENVO_DESC`, `ENVO_EMAIL`) |

- User Pool com app client público (sem secret), fluxo Authorization Code + PKCE, login pela página hospedada do Cognito.
- Atributo customizado `custom:setorId`, que liga um usuário com o papel `atendente` ao setor onde ele trabalha (`ENVO_ID`). O painel do atendente usa esse atributo para filtrar as reservas.
- O e-mail (RF13) e o pedido no SNP (RF14) vão para o **setor**, sem depender de usuário logado. Um setor pode ter vários atendentes ou nenhum.
- Admin e atendente têm papéis diferentes, mas usam o mesmo painel (o "painel do Administrador/Atendente" da spec).
- **Sem triggers Lambda.** Como o setor não é usuário, o cadastro de usuário não precisa criar registro nenhum.
- Sem auto-cadastro: só o admin cria contas. Para a demo, 3 grupos e 3 contas, uma por papel. Em produção, cada grupo teria vários usuários.

| Conta de demo           | Grupo (papel) | `custom:setorId`                  |
|-------------------------|---------------|-----------------------------------|
| solicitante@example.com | `solicitante` | —                                 |
| atendente@example.com   | `atendente`   | `1` (SMSG - Manutenção e Serviços Gerais) |
| admin@example.com       | `admin`       | —                                 |

Os e-mails usam `example.com`, domínio reservado para exemplos. Nenhuma mensagem é enviada a eles (`--message-action SUPPRESS`).

### ID token, não access token

O `custom:setorId` **só aparece no ID token**. O access token traz `cognito:groups`, mas não traz atributos customizados, e sem trigger Lambda não há como incluí-los. Por isso:

- O frontend manda o **ID token** em `Authorization: Bearer <id_token>`.
- O JWT authorizer do API Gateway usa o **client ID como audience**, porque o ID token traz o client ID na claim `aud`.
- Na Lambda, as claims ficam em `event.requestContext.authorizer.jwt.claims`. O HTTP API entrega `cognito:groups` como **string** (`"[atendente]"`), não como lista. A Lambda precisa converter.

### Passo a passo (AWS CLI v2)

Rodar em um único terminal, na ordem, porque cada passo usa as variáveis do anterior. Os valores entre `<>` precisam ser preenchidos.

**0. App no Amplify (só para fixar a URL do frontend)**

O Cognito precisa da URL do frontend antes de o frontend existir. Criar o app e o branch `main` no Amplify já fixa a URL `https://main.$APP_ID.amplifyapp.com`, sem precisar de deploy nem de repositório git (o deploy manual usa o mesmo branch).

```bash
export AWS_REGION=us-east-1                 # região do hackathon
APP_ID=$(aws amplify create-app --name sisgares --query app.appId --output text)
aws amplify create-branch --app-id "$APP_ID" --branch-name main
echo "APP_ID=$APP_ID"                       # formato d1a2b3c4d5e6f7
```

Se o app já existir, pegue o ID em vez de criar outro:

```bash
APP_ID=$(aws amplify list-apps --query "apps[?name=='sisgares'].appId" --output text)
```

**1. Variáveis**

```bash
NOME=sisgares
DOMINIO='sisgares-<sufixo-unico>'            # prefixo do domínio de login, único na região
SENHA='<Senha-Demo-123!>'                   # 8+ caracteres, com maiúscula, minúscula, número e símbolo
SETOR_ID=1                                  # ENVO_ID do setor do atendente (dados-envolvido.csv)
CALLBACKS="http://localhost:4200/ https://main.$APP_ID.amplifyapp.com/"
```

As URLs de callback precisam bater **exatamente** (inclusive a barra final) com o `redirect_uri` usado pelo frontend. Só `localhost` pode usar `http`.

**2. User Pool, com o atributo `setorId` no schema**

```bash
POOL=$(aws cognito-idp create-user-pool --pool-name "$NOME" \
  --username-attributes email \
  --schema Name=setorId,AttributeDataType=String,Mutable=true \
  --admin-create-user-config AllowAdminCreateUserOnly=true \
  --policies 'PasswordPolicy={MinimumLength=8,RequireUppercase=true,RequireLowercase=true,RequireNumbers=true,RequireSymbols=true}' \
  --query UserPool.Id --output text)
echo "POOL=$POOL"                           # formato us-east-1_AbC123xyz
```

- `--username-attributes email`: o login é feito pelo e-mail.
- O atributo é declarado como `setorId`, e o Cognito acrescenta o prefixo `custom:`. Atributo customizado **não pode ser removido** depois de criado.

Se o pool já existir, pegue o ID em vez de criar outro:

```bash
POOL=$(aws cognito-idp list-user-pools --max-results 20 \
  --query "UserPools[?Name=='$NOME'].Id" --output text)
```

**3. Domínio da página de login**

```bash
aws cognito-idp create-user-pool-domain --user-pool-id "$POOL" --domain "$DOMINIO"
```

A página de login fica em `https://$DOMINIO.auth.$AWS_REGION.amazoncognito.com`.

**4. App client público**

```bash
CLIENT_ID=$(aws cognito-idp create-user-pool-client --user-pool-id "$POOL" \
  --client-name "$NOME-web" \
  --no-generate-secret \
  --allowed-o-auth-flows-user-pool-client \
  --allowed-o-auth-flows code \
  --allowed-o-auth-scopes openid email profile \
  --supported-identity-providers COGNITO \
  --callback-urls $CALLBACKS \
  --logout-urls $CALLBACKS \
  --explicit-auth-flows ALLOW_USER_SRP_AUTH ALLOW_REFRESH_TOKEN_AUTH \
  --read-attributes email email_verified custom:setorId \
  --write-attributes email \
  --prevent-user-existence-errors ENABLED \
  --query UserPoolClient.ClientId --output text)
echo "CLIENT_ID=$CLIENT_ID"
```

- `--no-generate-secret`: client público, porque o código roda no navegador. A proteção do fluxo vem do PKCE, que o frontend envia (`code_challenge`).
- `--read-attributes ... custom:setorId`: sem isso o atributo **não aparece** no ID token.
- `--write-attributes email`: o `custom:setorId` fica **de fora** de propósito. Se ficasse, o próprio usuário conseguiria trocar de setor.
- `$CALLBACKS` fica sem aspas para virar uma lista de URLs.

Para mudar as URLs depois, use `update-user-pool-client`. Atenção: ele **zera todo campo que não for informado**, então repita todos os flags acima, trocando `create` por `update` e acrescentando `--client-id "$CLIENT_ID"` (sem `--no-generate-secret`, que só existe na criação).

**5. Grupos (papéis)**

```bash
for G in solicitante atendente admin; do
  aws cognito-idp create-group --user-pool-id "$POOL" --group-name "$G"
done
```

**6. Contas de demo**

```bash
criar_conta() {  # uso: criar_conta <email> <grupo> [setorId]
  local EMAIL=$1 GRUPO=$2 SETOR=$3
  local ATTRS=(Name=email,Value="$EMAIL" Name=email_verified,Value=true)
  [ -n "$SETOR" ] && ATTRS+=(Name=custom:setorId,Value="$SETOR")

  aws cognito-idp admin-create-user --user-pool-id "$POOL" --username "$EMAIL" \
    --user-attributes "${ATTRS[@]}" --message-action SUPPRESS > /dev/null
  aws cognito-idp admin-set-user-password --user-pool-id "$POOL" --username "$EMAIL" \
    --password "$SENHA" --permanent
  aws cognito-idp admin-add-user-to-group --user-pool-id "$POOL" --username "$EMAIL" \
    --group-name "$GRUPO"
}

criar_conta solicitante@example.com solicitante
criar_conta atendente@example.com   atendente "$SETOR_ID"
criar_conta admin@example.com       admin
```

- `--message-action SUPPRESS`: não envia e-mail de convite.
- `email_verified=true`: dispensa a verificação de e-mail no primeiro login.
- `admin-set-user-password --permanent`: a conta já nasce com a senha definitiva, sem a troca obrigatória no primeiro acesso.

**7. Conferência**

```bash
aws cognito-idp admin-get-user --user-pool-id "$POOL" --username atendente@example.com \
  --query UserAttributes                      # deve listar custom:setorId
aws cognito-idp admin-list-groups-for-user --user-pool-id "$POOL" \
  --username atendente@example.com --query 'Groups[].GroupName'
```

Para testar o login no navegador, abra a URL abaixo, entre com uma conta de demo e confira se o Cognito redireciona para o callback com `?code=...`:

```bash
echo "https://$DOMINIO.auth.$AWS_REGION.amazoncognito.com/login?client_id=$CLIENT_ID&response_type=code&scope=openid+email+profile&redirect_uri=http://localhost:4200/"
```

**8. Valores para o resto da aplicação**

| Valor | Onde é usado |
|---|---|
| Issuer: `https://cognito-idp.$AWS_REGION.amazonaws.com/$POOL` | JWT authorizer do API Gateway |
| Audience: `$CLIENT_ID` | JWT authorizer do API Gateway |
| `$POOL`, `$CLIENT_ID`, domínio de login | Configuração do frontend |

Sugestão: guardar esses valores no `.env` (ver `.env-example`).

## API

- API Gateway **HTTP API** com JWT authorizer nativo apontando para o User Pool. Ele rejeita token inválido ou expirado sem código.
- A Lambda lê `sub`, `cognito:groups` e `custom:setorId` das claims.

## Autorização

Toda a autorização passa por **uma única função**:

```python
def autorizar(usuario, acao, reserva) -> bool: ...
```

1. **Versão 1 (em código):** `if`s simples sobre grupo, dono da reserva e setor. É a primeira coisa a ser feita.
2. **Versão 2 (AVP):** a mesma assinatura, chamando `IsAuthorizedWithToken` no Verified Permissions.
   - Se estiver funcionando **até a metade do hackathon**, troca a implementação.
   - Se não estiver, a demo sai com a versão em código e o AVP vira "próximo passo" no pitch.

Políticas (as mesmas nas duas versões):

1. O solicitante altera ou cancela **só a própria** reserva.
2. O admin pode tudo.
3. O atendente vê só as reservas que envolvem **o setor dele** (`custom:setorId`).
4. O atendente **não vê dados pessoais** do solicitante (LGPD). A resposta é mascarada na Lambda.

Toda decisão é logada em JSON no CloudWatch: `{usuario, grupo, acao, reservaId, decisao}`.

## Dados (DynamoDB)

- Tabelas criptografadas com uma CMK do KMS.
- O modelo sai dos CSVs em `docs/requisitos/dados/` (recurso, ambiente, disposição, solicitação, período de reserva, envolvido/setor, vínculos).
- As consultas precisam atender principalmente à **checagem de conflito de reservas** (RN5–RN8). Ela é o critério que define as chaves e os índices.

## Segurança e IaC

- IAM: uma role por Lambda, com privilégio mínimo (policy templates do SAM).
- Secrets Manager: só se surgir integração externa.
- IaC: AWS SAM (Cognito, HTTP API, Lambdas, DynamoDB, KMS e, se der tempo, o policy store do AVP).

## Fora do escopo (se sobrar tempo)

Triggers do Cognito, Step Functions, EventBridge/SNS, Bedrock.
