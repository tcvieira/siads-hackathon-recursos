# Plano de implementação — SISGARES MVP (2h)

Referências: `requirements.md` (R1–R13) e `design.md`. Depois da Fase 0, as trilhas A–D
rodam **em paralelo** e só se tocam pelos contratos do `design.md` §3 e §4.
A ordem de provisionamento da AWS (credenciais → Amplify → Cognito → stack SAM → seed → variáveis
do Amplify → push) está no `design.md` §12.1.
Ordem de corte se o tempo apertar: (1) a lista diária mobile da C.4 (a grade passa a ter rolagem
horizontal própria, que o 1.4.10 admite para tabelas de dados); (2) o retry da transação na B.4 (devolve 409 direto); (3) `/notificacoes`
da C.6 vira uma lista simples sem filtros. As regras RN5–RN8 nunca entram no corte.

## Fase 0 — Base (0:00–0:15)

- [ ] 0.1 Criar `backend/` conforme `design.md` §2 e acrescentar `.aws-sam/` ao `.gitignore`. O `frontend/` (esqueleto React + Vite), o `amplify.yml` e o `scripts/` já existem: não recriar. _R11_
- [ ] 0.2 Pré-requisitos de conta e ferramentas (antes de qualquer provisionamento). _R13.6, design §12_
  - [ ] `.env` preenchido a partir do `.env-example`, `source` feito e `python scripts/testar_aws.py` ok em `us-east-1`, sem `BLOQUEADO` em Cognito, CloudFormation, IAM, Lambda, API Gateway (HTTP), DynamoDB, KMS, CloudWatch Logs e Amplify Hosting.
  - [ ] AWS CLI v2 e SAM CLI instalados (`aws --version`, `sam --version`).
  - [ ] App Amplify confirmado sem recriar (`aws amplify list-apps` → `d3vro5b84ccm5j`, branch `main` com auto-build); `AMPLIFY_APP_ID` anotado no `.env`.
  - [ ] Nomes das variáveis novas acrescentados ao `.env-example`, sem valores: `AMPLIFY_APP_ID`, `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`, `COGNITO_DOMAIN`, `API_URL`, `TABLE_NAME` (`design.md` §12.3).
- [ ] 0.3 `scripts/cognito.sh`: passos 1–7 do `ARQUITETURA.md` (o passo 0 já foi feito: app Amplify `d3vro5b84ccm5j` conectado ao GitHub), idempotente (reaproveita o pool existente), callbacks `http://localhost:5173/` e `https://main.$APP_ID.amplifyapp.com/`. Grava os IDs no `.env`. Rodar. _R1, R13.2, R13.8, design §12.2_
  - [ ] O script começa com `APP_ID=${AMPLIFY_APP_ID:?}` e `export AWS_REGION=${AWS_DEFAULT_REGION:-us-east-1}` (ponte entre o `.env` e as variáveis do `ARQUITETURA.md`).
  - [ ] `DOMINIO=${COGNITO_DOMAIN:-}`; se vazio, o script pede o sufixo (`read -p`) e grava `COGNITO_DOMAIN` no `.env`; a segunda execução reaproveita o mesmo prefixo (`design.md` §12.2).
  - [ ] Cada `create-*` (pool, domínio, client, grupos, contas) é precedido de consulta e pula o que já existe; segunda execução não cria nada novo.
  - [ ] Senha de demo lida sem eco (`read -s`), fora do `.env` e do repositório.
  - [ ] `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID` e `COGNITO_DOMAIN` (só o prefixo, `design.md` §12.3) gravados no `.env`.
  - [ ] Conferência do passo 7: `admin-get-user` do atendente lista `custom:setorId`; `admin-list-groups-for-user` mostra o grupo certo para as 3 contas.
  - [ ] Teste de login no Cognito redireciona para `http://localhost:5173/?code=...`.
- [ ] 0.4 Congelar os contratos: `backend/src/dominio/modelos.py` (dataclasses/Pydantic) e `frontend/src/api/tipos.ts` com o mesmo shape (`design.md` §4). _R2_

## Trilha A — Domínio + testes (0:15–1:05)

- [ ] A.1 `hierarquia.py`: `ancestrais`, `descendentes`, `raiz`, `afetados`. _R3.2_
- [ ] A.2 `regras.py`: `validar_basico(reserva, catalogo, config, agora, periodos_alterados)` → `list[Erro]` (RN1, RN2, RN3, RN4, RN9, quantidade só para limitados, itens inativos). `status(reserva, agora)` (RN13). `pode_alterar`, `pode_cancelar` (RN12). _R2, R5_
- [ ] A.3 `conflitos.py`: `conflitos_ambiente(periodos, ocupacoes, margem, ignorar_id)` e `excesso_recurso(periodos, recurso, ocupacoes, qtd, ignorar_id)`, com mensagem e sugestão ("livre a partir de HH:MM"). _R3, R4_
- [ ] A.4 `notificacao.py`: `setores_envolvidos`, `diff_reservas`, `montar_email` (HTML escapado, "ALTERADO:" + `<del>`/`<ins>`), `precisa_snp`. _R6_
- [ ] A.5 `tests/`: um teste por exemplo da seção 6 do caso (RN1–RN8, RN12, RN13) + diff + setores. `pytest -q` verde. _R12_

## Trilha B — Infra + API (0:15–1:15)

- [ ] B.1 `template.yaml`: CMK, tabela `sisgares` (PK/SK, GSI1, GSI2, stream NEW_AND_OLD_IMAGES, SSE KMS), HTTP API com JWT authorizer (issuer do pool, audience = ClientId), CORS, throttling, 4 funções Python 3.12 com policies mínimas, event source do stream com filtro. `sam validate --lint`. _design §1, §8, §12.2; R13.1, R13.3, R13.4, R13.5, R13.8_
  - [ ] `handlers/{catalogo,reservas,paineis,notificacoes}.py` com `handler` stub (HTTP: 501; stream: retorna sem erro) e `backend/src/requirements.txt` com versões fixas, para o primeiro deploy (B.2).
  - [ ] Parâmetros `UserPoolId`, `ClientId` e `AmplifyOrigin` (sem barra final); nenhum valor de conta ou segredo fixo no template.
  - [ ] `AWS::KMS::Key` + alias `alias/sisgares`, com rotação habilitada.
  - [ ] Tabela `PAY_PER_REQUEST`, `SSEType: KMS` com a CMK, GSI1 e GSI2 com projeção `ALL`, stream `NEW_AND_OLD_IMAGES`.
  - [ ] `DeletionPolicy`/`UpdateReplacePolicy`: `Delete` na tabela, `Retain` na CMK (`design.md` §12.5).
  - [ ] 4 funções com `CodeUri: src/` (relativo a `backend/template.yaml`), `Handler` próprio, `TABLE_NAME`/`POWERTOOLS_SERVICE_NAME`/`LOG_LEVEL` em `Globals` e uma role por função com as policies da tabela do `design.md` §12.2.
  - [ ] HTTP API com `DefaultAuthorizer` JWT (`$request.header.Authorization`), CORS para `AmplifyOrigin` e `http://localhost:5173`, throttling 50 rps / burst 100; rotas da §4 como eventos `HttpApi`.
  - [ ] Event source `DynamoDB` na `notificacoes` (`LATEST`, batch 10, bisect, `MaximumRetryAttempts: 2`, filtro `PK` prefixo `RESE#` e `SK = META`; `design.md` §6, §12.2).
  - [ ] Log group explícito por função (`LogGroupName: !Sub /aws/lambda/${<Função>}`), `RetentionInDays: 7` (`design.md` §12.2).
  - [ ] Outputs `ApiUrl` e `TableName`; `backend/samconfig.toml` com stack `sisgares`, `us-east-1`, `CAPABILITY_IAM`, `resolve_s3`.
  - [ ] `sam validate --lint` sem erros.
- [ ] B.2 Primeiro `sam build && sam deploy` (rodados em `backend/`, stack `sisgares`) com os handlers stub da B.1, para a tabela existir cedo (desbloqueia a D.3). `UserPoolId`/`ClientId` passados por `--parameter-overrides` a partir do `.env`. _B.1, 0.3; R13.1, R13.5_
  - [ ] Stack em `CREATE_COMPLETE` (`aws cloudformation describe-stacks --stack-name sisgares`).
  - [ ] Outputs `ApiUrl` e `TableName` anotados no `.env` (`API_URL`, `TABLE_NAME`).
  - [ ] `aws dynamodb describe-table` mostra `SSEType: KMS`, GSI1, GSI2 e o stream.
  - [ ] `curl` sem token em `$API_URL/catalogo` responde 401.
- [ ] B.3 `comum/auth.py`: `Usuario.from_claims` (parse de `"[a b]"`), `autorizar`, `mascarar_para`, log de decisão. `tests/test_auth.py`. _R1, R8.3, R9_
- [ ] B.4 `comum/repo.py`: leitura do catálogo, queries de ocupação no GSI1, listagens no GSI2, contadores, `salvar_reserva` transacional com locks e retry único (`design.md` §3). _R3.4, R4_
- [ ] B.5 `handlers/catalogo.py` e `handlers/reservas.py` (Powertools `APIGatewayHttpResolver`, Pydantic, erros → 400/403/404/409 com `erros[]`). Usar o domínio da Trilha A; enquanto não estiver pronto, usar stubs. _R2–R5_
- [ ] B.6 `handlers/paineis.py`: ocupação, atendimento (filtro por setor + máscara + pedidos SNP), notificações. _R7, R8_
- [ ] B.7 Redeploy `sam build && sam deploy` (em `backend/`) com os handlers reais (inclui a `notificacoes` da D.2). _B.2, B.5, B.6, D.2; R13.1_
  - [ ] Segundo deploy sem mudança no template não cria recursos novos (só atualiza código).
  - [ ] Com o ID token de uma conta de demo, `GET $API_URL/catalogo` responde 200; sem o header `Authorization` ou com token adulterado (1 caractere trocado na assinatura), 401.
  - [ ] Primeira escrita (`POST /reservas`) funciona; testar sem o statement inline `kms:GenerateDataKey` e removê-lo se a escrita continuar ok (`design.md` §12.5). _R13.4_
  - [ ] Log group de cada função recebe as decisões `allow`/`deny` em JSON, sem e-mail. _R9.2_

## Trilha C — Frontend (0:15–1:20)

- [ ] C.1 Sobre o esqueleto existente em `frontend/`: remover o conteúdo de exemplo do Vite (`App.css`, `assets/`, hero), fixar as versões do `package.json` nas do `package-lock.json` (sem `^`/`~`) e criar `frontend/.npmrc` com `save-exact=true`; instalar Tailwind + shadcn/ui (button, input, label, select, combobox, checkbox, radio-group, dialog, alert-dialog, card, badge, toast) já com versões exatas; habilitar o plugin `jsx-a11y` no `frontend/.oxlintrc.json`; `lang="pt-BR"` no `index.html`; tokens de cor com contraste conferido. `npm run build` e `npm run lint` verdes. _R10_
- [ ] C.2 Auth: `react-oidc-context` com PKCE, `api/cliente.ts` com o ID token, guarda de rota por grupo, layout (skip link, header/nav/main, título + foco por rota), logout. _R1_
- [ ] C.3 `/reservas/nova` e `/editar`: formulário completo (`design.md` §7), validação ao vivo em `aria-live` e resumo de erros com `role="alert"`. _R2, R3.3, R3.6, R4.3_
- [ ] C.4 `/grade`: tabela semântica de 30 min com estados em texto + ícone e botões "Reservar às HH:MM de dd/mm", que abrem o formulário pré-preenchido; lista diária abaixo de 640px. _R7_
- [ ] C.5 `/minhas-reservas` com Editar e Cancelar (AlertDialog). _R5_
- [ ] C.6 `/atendimento` (cards por data) e `/notificacoes` (caixa de saída estruturada + SNP). _R6.4, R8_
- [ ] C.7 Mocks de API (MSW ou fixture local) para desenvolver antes da B.7; trocar por `VITE_API_URL` real na integração.

## Trilha D — Dados + eventos (0:15–1:05)

- [ ] D.1 `scripts/seed.py`: CSV → itens (`design.md` §3), números "14.207" → 14207, datas → ISO −03:00, `setores[]`/`ambientesVinculados[]` pré-computados, `codigoServicoSnp` (R11.3), config, contadores. Gerar as reservas sintéticas sem conflito (usando o domínio da Trilha A), com ≥ 3 do solicitante de demo. Idempotente. Lê `TABLE_NAME` do `.env`. _R11_
- [ ] D.2 `handlers/notificacoes.py`: consumo do stream → `EMAIL#…` e upsert `SNP#…` (`design.md` §6), idempotente por `eventID`. Vai para a AWS no deploy da B.7. _R6_
- [ ] D.3 Rodar o seed na tabela implantada (depois da B.2) e conferir a contagem de itens. Sem e-mails nem pedidos SNP do seed (esperado: o stub da `notificacoes` descarta os eventos, `design.md` §12.5). _B.2_

## Fase 3 — Integração e deploy (1:20–1:40)

- [ ] 3.1 Frontend apontando para a API real. Fluxo de ponta a ponta com as 3 contas.
- [ ] 3.2 Deploy do frontend por push na `main` (auto-build do Amplify via `amplify.yml`). Antes, cadastrar as variáveis `VITE_*` no app Amplify (`aws amplify update-branch --environment-variables`), porque o build roda no Amplify e não lê o `.env` local. Acompanhar o job, rodar `scripts/smoke_amplify.py` e conferir o login em `https://main.d3vro5b84ccm5j.amplifyapp.com/`. _R13.7, design §12.2_
  - [ ] Variáveis da branch `main`: `VITE_COGNITO_AUTHORITY`, `VITE_COGNITO_CLIENT_ID`, `VITE_COGNITO_DOMAIN`, `VITE_API_URL` e `VITE_REDIRECT_URI=https://main.d3vro5b84ccm5j.amplifyapp.com/` (`design.md` §12.3).
  - [ ] Regra de rewrite de SPA cadastrada no app (`aws amplify update-app --app-id "$AMPLIFY_APP_ID" --custom-rules '[{"source":"</^[^.]+$/>","target":"/index.html","status":"200"}]'`, `design.md` §12.2); recarregar `/grade` não dá 404.
  - [ ] Job do Amplify em `SUCCEED`; login pela URL do Amplify volta com `?code=` e a primeira chamada à API passa no CORS.
  - [ ] Se a URL do frontend mudar (plano B do `ARQUITETURA.md`): callbacks do Cognito atualizadas com `update-user-pool-client` (todos os flags) e `AmplifyOrigin` atualizado com novo `sam deploy`. _R13.8_
- [ ] 3.3 Executar o roteiro da demo (`design.md` §11) e corrigir os bloqueios.
- [ ] 3.4 Kiro hook: `PostFileSave` em `backend/src/dominio/**` → `pytest -q` (conta no critério "uso de hooks").

## Fase 4 — Acessibilidade, docs e pitch (1:40–2:00)

- [ ] 4.1 Os 4 checks da steering em cada tela: só teclado, axe sem A/AA, contraste, reflow 320px / zoom 200%. Corrigir as violações. _R10_
- [ ] 4.2 `README.md`: descrição, arquitetura, como rodar (cognito.sh → sam deploy → seed → frontend), contas de demo, testes. _Entregável_
- [ ] 4.3 Slide/roteiro do pitch: problema → solução → demo (§11) → arquitetura → próximos passos (AVP, CRUD de cadastros, SES, SNP real, unidades macro, particionamento do GSI por mês, custo estimado).

## Próximos passos de provisionamento (fora do MVP)

Só depois de tudo acima. Não entram na demo nem na ordem de corte.

- [ ] P.1 Verified Permissions no `template.yaml`: policy store, identity source no User Pool, schema e políticas da `design.md` §5; `verifiedpermissions:IsAuthorizedWithToken` nas roles da `reservas` e da `paineis` (ambas chamam `autorizar`; `catalogo` e `notificacoes` não recebem); `autorizar` passa a chamar o AVP. _R9.1, design §12.2_
- [ ] P.2 Secrets Manager, só ao integrar um serviço externo (SES ou SNP real): segredo no stack e `secretsmanager:GetSecretValue` só na role da Lambda que usar. _R13.6, design §12.2_
