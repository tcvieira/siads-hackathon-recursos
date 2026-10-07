# Plano de implementação — SISGARES MVP (2h)

Referências: `requirements.md` (R1–R13) e `design.md`.

## Como executar em paralelo

Depois da Fase 0, três frentes rodam **ao mesmo tempo**, cada uma numa sessão própria do Kiro
("execute as tarefas da Frente N do `tasks.md`"). Elas só se tocam pelos contratos congelados na
Fase 0 (`design.md` §3 e §4) e pelos marcos abaixo.

| Frente | Escopo | Dona dos arquivos |
|---|---|---|
| 1 — Infra, Cognito e dados | Cognito, SAM, deploys, seed, Amplify, README | `scripts/`, `backend/template.yaml`, `backend/samconfig.toml`, `.env-example`, `README.md` |
| 2 — Backend | Domínio, testes, auth, repositório, handlers | `backend/src/`, `backend/tests/` |
| 3 — Frontend | Telas, login, mocks, acessibilidade | `frontend/` |

Regras:

- Cada frente só edita os próprios arquivos. Mudar `modelos.py` ou `tipos.ts` depois da Fase 0 exige
  avisar as outras duas frentes e mudar os dois arquivos juntos.
- Só a Frente 1 roda `sam deploy` e o seed. Dois deploys ao mesmo tempo falham com `UPDATE_IN_PROGRESS`.
- Commits pequenos, `git pull --rebase` antes de cada push. Todo push na `main` dispara build no
  Amplify, o que é inofensivo.

### Marcos

| Marco | Quando (aprox.) | Quem entrega | O que destrava |
|---|---|---|---|
| M0 — base e contratos no `main` | 0:10 | Fase 0 | Início das três frentes |
| M1 — Cognito pronto (`COGNITO_*` no `.env`) | 0:35 | Frente 1 (1.2) | Login real na Frente 3 (3.3); parâmetros do deploy (1.5) |
| M2 — `hierarquia` e `conflitos` verdes | 0:45 | Frente 2 (2.1, 2.3) | Seed (1.7) |
| M3 — stack no ar com stubs (`API_URL`, `TABLE_NAME`) | 0:50 | Frente 1 (1.5) | Variáveis `VITE_*` (1.6); seed (1.7) |
| M4 — handlers reais prontos | 1:25 | Frente 2 (2.11) | Redeploy (1.8) |
| M5 — API real no ar | 1:30 | Frente 1 (1.8) | Integração (Fase 4) |

### Ordem de corte se o tempo apertar

1. Lista diária mobile da 3.6 (a grade passa a ter rolagem horizontal própria, que o 1.4.10 admite para tabelas de dados).
2. Retry da transação na 2.7 (devolve 409 direto).
3. `/notificacoes` da 3.8 vira uma lista simples, sem filtros.
4. Reservas históricas do CSV na 1.7 (fica só o catálogo + o cenário de demo).

As regras RN5–RN8 e o cenário de demo nunca entram no corte.

---

## Fase 0 — Base comum (0:00–0:10, uma sessão, antes das frentes)

- [ ] 0.1 Esqueleto do backend conforme `design.md` §2, sem lógica. _R11, R13.1_
  - [ ] Pastas `backend/src/{dominio,comum,handlers}` com `__init__.py` e `backend/tests/`.
  - [ ] `handlers/{catalogo,reservas,paineis,notificacoes}.py` com `handler` stub (HTTP: 501; stream: retorna sem erro), para o template da Frente 1 já apontar para eles.
  - [ ] `backend/src/requirements.txt` (aws-lambda-powertools, pydantic v2) e `backend/requirements-dev.txt` (pytest, boto3), com versões exatas.
  - [ ] `.aws-sam/` no `.gitignore`.
- [ ] 0.2 Congelar os contratos: `backend/src/dominio/modelos.py` (dataclasses, sem Pydantic e sem boto3) e `frontend/src/api/tipos.ts` com o mesmo shape, mais os códigos de erro (`design.md` §4). _R2, R12.2_
- [ ] 0.3 Nomes das variáveis novas no `.env-example`, sem valores: `AMPLIFY_APP_ID`, `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`, `COGNITO_DOMAIN`, `API_URL`, `TABLE_NAME` e as `VITE_*` (`design.md` §7, §12.3). _R13.6_
- [ ] 0.4 Hooks do Kiro (contam no critério "uso de hooks" e ajudam desde o início), criados pelo painel Agent Hooks, no evento de salvar arquivo:
  - [ ] `backend/src/dominio/**` e `backend/tests/**` → rodar `cd backend && pytest -q` e corrigir o que quebrar.
  - [ ] `frontend/src/**/*.tsx` → rodar `cd frontend && npm run lint` (oxlint com `jsx-a11y`) e corrigir violações.
- [ ] 0.5 Commit e push na `main` (**M0**).

---

## Frente 1 — Infra, Cognito e dados

- [ ] 1.1 Pré-requisitos de conta e ferramentas (0:10–0:15). _R13.6, design §12_
  - [ ] `.env` preenchido a partir do `.env-example`, `source` feito e `python scripts/testar_aws.py` ok em `us-east-1`, sem `BLOQUEADO` em Cognito, CloudFormation, IAM, Lambda, API Gateway (HTTP), DynamoDB, KMS, CloudWatch Logs e Amplify Hosting.
  - [ ] AWS CLI v2 e SAM CLI instalados (`aws --version`, `sam --version`).
  - [ ] App Amplify confirmado sem recriar (`aws amplify list-apps` → `d3vro5b84ccm5j`, branch `main` com auto-build); `AMPLIFY_APP_ID` anotado no `.env`.
- [ ] 1.2 `scripts/cognito.sh` (0:15–0:35): passos 1–7 do `ARQUITETURA.md` (o passo 0 já foi feito), idempotente, callbacks `http://localhost:5173/` e `https://main.$APP_ID.amplifyapp.com/`. Rodar. Ao terminar, avisar as frentes 2 e 3 (**M1**). _R1, R13.2, R13.8, design §12.2_
  - [ ] O script começa com `APP_ID=${AMPLIFY_APP_ID:?}` e `export AWS_REGION=${AWS_DEFAULT_REGION:-us-east-1}`.
  - [ ] `DOMINIO=${COGNITO_DOMAIN:-}`; se vazio, pede o sufixo (`read -p`) e grava `COGNITO_DOMAIN` no `.env`; a segunda execução reaproveita o mesmo prefixo.
  - [ ] Cada `create-*` (pool, domínio, client, grupos, contas) é precedido de consulta e pula o que já existe; a segunda execução não cria nada.
  - [ ] Senha de demo lida sem eco (`read -s`), fora do `.env` e do repositório.
  - [ ] `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID` e `COGNITO_DOMAIN` (só o prefixo) gravados no `.env`.
  - [ ] Conferência do passo 7: o atendente tem `custom:setorId`; as 3 contas estão no grupo certo.
  - [ ] Teste de login no Cognito redireciona para `http://localhost:5173/?code=...`.
- [ ] 1.3 Regra de rewrite de SPA no app Amplify (independe do resto): `aws amplify update-app --app-id "$AMPLIFY_APP_ID" --custom-rules '[{"source":"</^[^.]+$/>","target":"/index.html","status":"200"}]'`. _R13.7, design §12.2_
- [ ] 1.4 `backend/template.yaml` (pode começar em paralelo com a 1.2, porque só usa parâmetros). `sam validate --lint`. _design §1, §3, §8, §12.2; R13.1, R13.3, R13.4, R13.5, R13.8_
  - [ ] Parâmetros `UserPoolId`, `ClientId` e `AmplifyOrigin` (sem barra final); nenhum valor de conta ou segredo fixo.
  - [ ] `AWS::KMS::Key` + alias `alias/sisgares`, com rotação habilitada.
  - [ ] Tabela `PAY_PER_REQUEST`, `SSEType: KMS` com a CMK, **só o GSI1** com projeção `ALL`, stream `NEW_AND_OLD_IMAGES` (`design.md` §3).
  - [ ] `DeletionPolicy`/`UpdateReplacePolicy`: `Delete` na tabela, `Retain` na CMK.
  - [ ] 4 funções Python 3.12 com `CodeUri: src/`, `Handler` próprio, `TABLE_NAME`/`POWERTOOLS_SERVICE_NAME`/`LOG_LEVEL` em `Globals` e uma role por função com as policies do `design.md` §12.2.
  - [ ] HTTP API com `DefaultAuthorizer` JWT (`$request.header.Authorization`), CORS para `AmplifyOrigin` e `http://localhost:5173`, throttling 50 rps / burst 100; todas as rotas da §4 já declaradas como eventos `HttpApi` (apontando para os stubs da 0.1).
  - [ ] Event source `DynamoDB` na `notificacoes` (`LATEST`, batch 10, bisect, `MaximumRetryAttempts: 2`, filtro `PK` prefixo `RESE#` e `SK = META`).
  - [ ] Log group explícito por função (`LogGroupName: !Sub /aws/lambda/${<Função>}`), `RetentionInDays: 7`.
  - [ ] Outputs `ApiUrl` e `TableName`; `backend/samconfig.toml` com stack `sisgares`, `us-east-1`, `CAPABILITY_IAM`, `resolve_s3`.
- [ ] 1.5 Primeiro `sam build && sam deploy` em `backend/`, com os stubs (0:40–0:50). `UserPoolId`/`ClientId` passados por `--parameter-overrides` a partir do `.env`. Ao terminar, avisar as frentes (**M3**). _1.2, 1.4; R13.1, R13.5_
  - [ ] Stack em `CREATE_COMPLETE`.
  - [ ] Outputs anotados no `.env` (`API_URL`, `TABLE_NAME`).
  - [ ] `aws dynamodb describe-table` mostra `SSEType: KMS`, o GSI1 e o stream.
  - [ ] `curl` sem token em `$API_URL/catalogo` responde 401.
- [ ] 1.6 Variáveis do frontend (logo após a M3). _R13.7, design §7, §12.3_
  - [ ] `VITE_COGNITO_AUTHORITY`, `VITE_COGNITO_CLIENT_ID`, `VITE_COGNITO_DOMAIN`, `VITE_API_URL` e `VITE_REDIRECT_URI=http://localhost:5173/` no `.env` da raiz (lido pelo Vite em dev).
  - [ ] As mesmas na branch `main` do Amplify (`aws amplify update-branch --environment-variables`), com `VITE_REDIRECT_URI=https://main.d3vro5b84ccm5j.amplifyapp.com/`.
- [ ] 1.7 `scripts/seed.py` e execução (0:50–1:15). Importa `dominio.hierarquia` e `dominio.conflitos` da Frente 2 (**M2**); grava as chaves do `design.md` §3 (inclusive `OCUP#…` e `AGENDA`). Lê `TABLE_NAME` e `COGNITO_USER_POOL_ID` do `.env`. Precisa rodar **antes** do redeploy (1.8), enquanto a `notificacoes` ainda é o stub. _R11; 1.5, M2_
  - [ ] Catálogo, vínculos com `setores[]`/`ambientesVinculados[]` pré-computados, `codigoServicoSnp` (R11.4), config e contadores (`CTR#RESE` = 17326).
  - [ ] Números com ponto → inteiros; datas → ISO −03:00 (R11.1).
  - [ ] Recursos de `dados-solicitacao.csv` (R11.2).
  - [ ] Cenário de demo primeiro (`--data-demo`, padrão hoje): F-RN5, F-RN6, F-RN8, ≥ 6 reservas nos próximos 7 dias para o SMSG, ≥ 3 do `solicitante@example.com` com o `sub` lido por `admin-get-user` (R11.6).
  - [ ] Históricas com ambiente compatível com a RN9 e sem conflito com a RN5/RN6, sem aplicar RN3/RN4; RN8 conferida contra o cenário; fallback "local próprio" com complemento (R11.3).
  - [ ] Gravação com `attribute_not_exists`: a segunda execução não altera nada (R11.7).
  - [ ] Conferir a contagem de itens por tipo (`CAT#…`, `RESE#…`, `OCUP#…`).
- [ ] 1.8 Redeploy `sam build && sam deploy` com os handlers reais (quando a Frente 2 avisar a **M4**). Ao terminar, avisar as frentes (**M5**). _1.7, M4; R13.1_
  - [ ] O redeploy sem mudança no template não cria recursos novos (só atualiza código).
  - [ ] Com o ID token de uma conta de demo, `GET $API_URL/catalogo` responde 200; sem o header `Authorization` ou com token adulterado (1 caractere trocado na assinatura), 401.
  - [ ] Primeira escrita (`POST /reservas`) funciona; testar sem o statement inline `kms:GenerateDataKey` e removê-lo se a escrita continuar ok (`design.md` §12.5). _R13.4_
  - [ ] Log group de cada função recebe as decisões `allow`/`deny` em JSON, sem e-mail. _R9.2_
  - [ ] A criação gera `EMAIL#…` e, para a SEART, `SNP#…` (stream funcionando).

## Frente 2 — Backend

Domínio em Python puro, sem boto3, com `agora` injetado (R12.2). Enquanto o hook da 0.4 roda o
pytest a cada gravação, cada função nasce com o seu teste.

- [ ] 2.1 `dominio/hierarquia.py`: `ancestrais`, `descendentes`, `raiz`, `afetados`. _R3.2_
- [ ] 2.2 `dominio/regras.py`: `validar_basico(reserva, catalogo, config, agora, periodos_alterados)` → `list[Erro]` (RN1, RN2, RN3, RN4, RN9, quantidade só para limitados, itens inativos); `recursos_oferecidos(ambienteId, catalogo)` (RN9); `status(reserva, agora)` (RN13); `pode_alterar`, `pode_cancelar` (RN12). Comparações de horário no fuso `America/Fortaleza`. _R2, R5_
- [ ] 2.3 `dominio/conflitos.py`: `conflitos_ambiente(periodos, ocupacoes, margem, ignorar_id)` e `excesso_recurso(periodos, recurso, ocupacoes, qtd, ignorar_id)`, com mensagem e sugestão ("livre a partir de HH:MM"). Com a 2.1 verde, commit e aviso à Frente 1 (**M2**). _R3, R4_
- [ ] 2.4 `dominio/notificacao.py`: `setores_envolvidos`, `diff_reservas`, `montar_email` (HTML escapado, "ALTERADO:" + `<del>`/`<ins>`), `precisa_snp`. _R6_
- [ ] 2.5 `tests/`: um teste nomeado por exemplo da seção 6 do caso, de RN1 a RN13 (inclusive RN9 "kit da Sala 1 não aparece na Sala 2", RN10 copa/TI e RN11 com/sem código), mais o diff e o caso "MODIFY sem diferença". `pytest -q` verde. _R12_
- [ ] 2.6 `comum/auth.py`: `Usuario.from_claims` (parse de `"[a b]"`), `autorizar`, `mascarar_para`, log de decisão sem e-mail. `tests/test_auth.py`. _R1, R8.3, R9_
- [ ] 2.7 `comum/repo.py` (`design.md` §3): leitura do catálogo; leitura dos locks **antes** das consultas; ocupações em `OCUP#…` com `ConsistentRead=true`; `salvar_reserva` em `TransactWriteItems` com locks e retry único; `cancelar_reserva` (META + `PER#` + Delete dos `OCUP#`); listagens no GSI1 (`SOLI#`, `AGENDA`, `NOTIF`); contadores. _R3.4, R4, R5.3_
- [ ] 2.8 `comum/http.py` + `handlers/catalogo.py` e `handlers/reservas.py` (Powertools `APIGatewayHttpResolver`, Pydantic com datas convertidas para −03:00 e limites de 5 períodos / 10 recursos, erros → 400/403/404/409 com `erros[]`). _R2–R5_
- [ ] 2.9 `handlers/paineis.py`: ocupação do ambiente (com hierarquia, sem dados da reserva), atendimento (GSI1 `AGENDA` + filtro por setor + `BatchGetItem` + máscara + pedidos SNP), notificações. _R7, R8_
- [ ] 2.10 `handlers/notificacoes.py`: consumo do stream → `EMAIL#…` e upsert `SNP#…` (`design.md` §6), idempotente por `eventID`, ignorando `MODIFY` sem diferença. _R6_
- [ ] 2.11 `pytest -q` verde, commit e aviso à Frente 1 para o redeploy (**M4**).

## Frente 3 — Frontend

Critério de pronto de **cada tela** (3.4–3.8): `npm run build` e `npm run lint` verdes, navegação
completa só com teclado, axe sem violações A/AA e reflow em 320px (steering de acessibilidade).

- [ ] 3.1 Setup sobre o esqueleto existente (0:10–0:25). _R10_
  - [ ] Remover o conteúdo de exemplo do Vite (`App.css`, `assets/`, hero).
  - [ ] Fixar as versões do `package.json` nas do `package-lock.json` (sem `^`/`~`) e criar `frontend/.npmrc` com `save-exact=true`.
  - [ ] Tailwind + shadcn/ui (button, input, label, select, combobox, checkbox, radio-group, dialog, alert-dialog, card, badge, toast), react-router, @tanstack/react-query, react-oidc-context, react-hook-form + zod, lucide-react, date-fns + date-fns-tz; em dev, `@axe-core/react` e MSW.
  - [ ] Plugin `jsx-a11y` no `frontend/.oxlintrc.json`; `lang="pt-BR"` no `index.html`; tokens de cor com contraste conferido.
  - [ ] `envDir: '..'` no `vite.config.ts` (lê o `.env` da raiz, `design.md` §7).
  - [ ] Copiar `docs/requisitos/Imagens/icones-*` para `frontend/public/icones/`.
- [ ] 3.2 Mocks de API com MSW a partir de `api/tipos.ts` e das rotas do `design.md` §4, incluindo respostas 409 de RN5/RN6/RN8, para desenvolver as telas sem backend. Ligados por `VITE_USE_MOCKS=1`.
- [ ] 3.3 Auth: `react-oidc-context` com PKCE, `api/cliente.ts` com o ID token, guarda de rota por grupo, layout (skip link, header/nav/main, título + foco no `<h1>` por rota), menu por papel (R1.4), logout. Até a **M1**, usar um usuário simulado nos mocks. _R1_
- [ ] 3.4 `/reservas/nova` e `/reservas/:id/editar`: formulário completo (`design.md` §7), recursos filtrados pelo ambiente (RN9), validação ao vivo em `aria-live` e resumo de erros com `role="alert"`. _R2, R3.3, R3.6, R4.3_
- [ ] 3.5 `/minhas-reservas` com status em texto + badge, Editar e Cancelar (AlertDialog). _R5_
- [ ] 3.6 `/grade`: tabela semântica de 30 min com estados em texto + ícone e botões "Reservar às HH:MM de dd/mm", que abrem o formulário preenchido; lista diária abaixo de 640px. _R7_
- [ ] 3.7 `/atendimento`: cards por data (hoje + 7 dias, com navegação), `<h2>` por dia, lista semântica. _R8_
- [ ] 3.8 `/notificacoes`: caixa de saída estruturada (sem renderizar o HTML do e-mail) + pedidos SNP. _R6.4_
- [ ] 3.9 Depois da **M5**: `VITE_USE_MOCKS=0`, login real e as telas contra a API real.

---

## Fase 4 — Integração e entrega (1:30–2:00, todas as frentes)

- [ ] 4.1 Fluxo de ponta a ponta com as 3 contas, em `localhost:5173` contra a API real. Bugs vão para a frente dona do arquivo.
- [ ] 4.2 (Frente 1) Push na `main`, job do Amplify em `SUCCEED`, `scripts/smoke_amplify.py` ok, login pela URL do Amplify volta com `?code=`, a primeira chamada à API passa no CORS e recarregar `/grade` não dá 404. Se a URL mudar (plano B do `ARQUITETURA.md`), atualizar callbacks (`update-user-pool-client` com todos os flags) e `AmplifyOrigin` (novo `sam deploy`). _R13.7, R13.8_
- [ ] 4.3 Ensaiar o roteiro da demo (`design.md` §11) na URL do Amplify e corrigir os bloqueios.
- [ ] 4.4 (Frente 3) Passada final dos 4 checks da steering nas 5 telas. _R10_
- [ ] 4.5 (Frente 1) `README.md`: descrição, arquitetura, **modelo de dados** (`design.md` §3, entregável do caso), como rodar (cognito.sh → sam deploy → seed → frontend), contas de demo, testes.
- [ ] 4.6 (Frente 2) Slide e roteiro do pitch: problema → solução → demo (§11) → arquitetura → próximos passos (AVP, CRUD de cadastros, SES, SNP real, unidades macro, particionamento das ocupações por mês, custo estimado).

## Próximos passos de provisionamento (fora do MVP)

Só depois de tudo acima. Não entram na demo nem na ordem de corte.

- [ ] P.1 Verified Permissions no `template.yaml`: policy store, identity source no User Pool, schema e políticas da `design.md` §5; `verifiedpermissions:IsAuthorizedWithToken` nas roles da `reservas` e da `paineis` (ambas chamam `autorizar`; `catalogo` e `notificacoes` não recebem); `autorizar` passa a chamar o AVP. _R9.1, design §12.2_
- [ ] P.2 Secrets Manager, só ao integrar um serviço externo (SES ou SNP real): segredo no stack e `secretsmanager:GetSecretValue` só na role da Lambda que usar. _R13.6, design §12.2_
