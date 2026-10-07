# Requisitos — SISGARES MVP (hackathon, 2h)

Base: `ARQUITETURA.md`, `docs/requisitos/caso-de-uso-hackathon-SISGARES.docx`, CSVs de
`docs/requisitos/dados/`, `criterios-avaliacao-hackathon.html` e a steering
`.kiro/steering/acessibilidade.md`.

Stack decidida: backend **Python 3.12 em AWS Lambda** (uma Lambda por domínio) e frontend
**React + Vite + TypeScript + Tailwind + shadcn/ui**. O requisito "Java 21 e Angular" do
documento do caso foi descartado pela equipe.

## Escopo do MVP (2h)

| Entra (demo) | Fica para o pitch como "próximo passo" |
|---|---|
| F1 cadastro de reserva (RN1, RN2, RN3, RN4, RN9, RN13) | F9 CRUD das tabelas básicas (dados vêm só do seed) |
| F2 conflito de ambiente, pai/filho e margem de 30 min (RN5, RN6, RN7) | F10 tela de configuração (config fixa no seed) |
| F3 recurso limitado (RN8) | Verified Permissions (AVP): autorização fica em código |
| F4 alterar e cancelar (RN12) | Unidades macro: o MVP trabalha com uma unidade só (PR/CE) |
| F5 e-mail simulado com destaque das alterações (RN10, RN12) | Envio real de e-mail (SES) |
| F6 pedido SNP simulado (RN11) | Integração real com o SNP |
| F7 grade de horários do solicitante (RF16) | |
| F8 cards do atendente/admin (RF17) | |

## Glossário

- **Período**: intervalo `[início, término)` de uma reserva. Pode atravessar dias.
- **Margem**: 30 min exigidos entre o fim de um período e o início de outro no mesmo ambiente.
- **Hierarquia de ambiente**: `AMBI_ID_PAI`. Exemplo: Auditório (Completo) é pai das Partes A e B.
- **Setor (envolvido)**: equipe que atende ambiente/recurso (`dados-envolvido.csv`). Não é conta de login.
- **Fuso**: `America/Fortaleza` (UTC−3, sem horário de verão). As datas são gravadas em ISO 8601 com offset.

---

### R1 — Autenticação e papéis
**História:** como usuário, quero entrar com minha conta para ver só o que meu papel permite.

1. QUANDO o usuário não autenticado acessar o frontend, ENTÃO o sistema DEVE redirecioná-lo para a página de login do Cognito (Authorization Code + PKCE).
2. O frontend DEVE enviar o **ID token** em `Authorization: Bearer`. O API Gateway DEVE rejeitar token ausente, inválido ou expirado (401).
3. A Lambda DEVE ler `sub`, `email`, `cognito:groups` (string `"[a b]"`, convertida em lista) e `custom:setorId`.
4. O menu DEVE mostrar só as telas do papel: solicitante (Grade, Minhas reservas); atendente e admin (Atendimento, Notificações). O admin também acessa as telas do solicitante.

### R2 — Cadastro de reserva (F1)
**História:** como solicitante, quero cadastrar uma reserva com ambiente, disposição, recursos e um ou mais períodos.

1. A reserva DEVE ter ≥ 1 período, e `término > início` em todos (RN1). *10/11 14:00→13:00: bloqueado. 10/11 18:00→11/11 09:00: aceito.*
2. Finalidade (1–200 caracteres) e participantes (inteiro ≥ 1) DEVEM ser obrigatórios. Com ambiente "Não solicitado / local próprio" (`ambienteId = null`), o complemento DEVE ser obrigatório (RN2). *Só água e café, sem ambiente e sem complemento: bloqueado.*
3. Início e término de cada período DEVEM ficar dentro da faixa configurada, que no seed é 07:00–20:00 (RN3). *18:00–21:00: bloqueado.*
4. Cada período novo ou com início alterado DEVE começar com no mínimo `antecedenciaMin` minutos (seed: 120) a partir de agora (RN4). *Agora 10:00, início 11:00: bloqueado.*
5. Recurso vinculado a ambientes (`dados-vinculo-recurso.csv`) DEVE ser oferecido e aceito só em reservas desses ambientes. Recurso sem vínculo vale para todos (RN9).
6. O campo de quantidade DEVE aparecer e ser aceito só para recursos com `RECU_ST_LIMITADO = S`. Os demais têm quantidade 1.
7. O status DEVE ser calculado (RN13): `prevista` (agora < menor início), `em_andamento` (entre o menor início e o maior término), `transcorrida` (após o maior término) ou `cancelada`. *Agora 10:00, período 09:00–11:00: em andamento.*
8. Recursos, ambientes e disposições inativos (`ST_ATIVO = N`) NÃO DEVEM ser oferecidos.

### R3 — Conflito de ambiente (F2)
1. Há conflito QUANDO `novoInício < existenteTérmino + 30min` E `existenteInício < novoTérmino + 30min`, para o mesmo ambiente (RN5). *Auditório 09:00–11:00; nova 11:20–12:00: bloqueado; nova 11:30–12:00: aceito.*
2. A checagem DEVE incluir o próprio ambiente, **todos os ancestrais e todos os descendentes**. Irmãos (Parte A × Parte B) não conflitam (RN6). *Parte A 14:00–16:00; Auditório Completo 15:00–17:00: bloqueado.*
3. QUANDO o solicitante alterar um período no formulário, ENTÃO o sistema DEVE validar via `POST /reservas/validar` e anunciar o resultado em região `aria-live`, sem mover o foco.
4. Ao salvar, a checagem DEVE ser refeita por completo e de forma atômica contra gravações concorrentes (RN7). *Dois usuários com Auditório 09:00–10:00: o segundo a salvar é bloqueado (409).*
5. Na alteração, os períodos da própria reserva DEVEM ser ignorados na checagem.
6. A mensagem de erro DEVE identificar o período, o ambiente em conflito e o horário ocupado, e sugerir correção (ex.: "livre a partir de 11:30").

### R4 — Recurso limitado (F3)
1. Para cada período novo e cada recurso limitado, a soma de `qtd` das reservas não canceladas com período sobreposto (sem margem) mais a `qtd` pedida NÃO DEVE passar de `RECU_DISPONIBILIDADE` (RN8). *Disponíveis 3, 2 reservados 14:00–16:00; pede 2 para 15:00–17:00: bloqueado; pede 1: aceito.*
2. Uma reserva com vários períodos sobrepostos ao novo conta uma vez só.
3. O erro DEVE informar o recurso, o período, a quantidade disponível e a pedida.

### R5 — Alterar e cancelar (F4)
1. O solicitante DEVE poder alterar só as próprias reservas que não estejam `transcorrida` nem `cancelada`, com todas as validações de R2–R4 (RN12).
2. O cancelamento DEVE exigir confirmação em diálogo (NBR 17225 5.9.12) e antecedência mínima até o menor início (RN12).
3. O cancelamento é lógico: a reserva continua visível com status `cancelada` e, na mesma transação, libera ambiente e recursos (as ocupações são removidas).

### R6 — Notificações e SNP simulado (F5, F6)
1. QUANDO uma reserva for criada, alterada ou cancelada, ENTÃO o sistema DEVE gerar, **de forma assíncrona e orientada a evento** (DynamoDB Streams), um e-mail simulado para cada setor vinculado ao ambiente (`envolvido-ambiente`) ou a um recurso pedido (`envolvido-recurso`), endereçado a `ENVO_EMAIL` (RN10).
2. Na alteração, o e-mail DEVE listar cada campo alterado com o valor antigo e o novo, usando texto ("ALTERADO:"), `<del>`/`<ins>` e cor (nunca só cor, NBR 5.11.1).
3. QUANDO o vínculo setor↔ambiente/recurso tiver `codigoServicoSnp`, ENTÃO o sistema DEVE gerar um pedido SNP simulado com número `SNP-2026-NNNNN`, um por (reserva, setor). Na alteração mantém o número; no cancelamento marca o pedido como cancelado (RN11). Vínculo sem código gera só e-mail.
4. Os e-mails não são enviados. Ficam gravados e aparecem na tela **Notificações** (caixa de saída simulada).

### R7 — Grade do solicitante (F7, RF16)
1. O solicitante DEVE escolher um ambiente e ver uma semana em grade (colunas: dias; linhas: horários de 30 min dentro da faixa configurada).
2. Cada célula DEVE mostrar, em **texto + ícone**: `Reservar às HH:MM` (livre, acionável), `Ocupado`, `Margem de tolerância`, `Horário ultrapassado` ou `Sem antecedência mínima`. A ocupação DEVE considerar a hierarquia (R3.2).
3. QUANDO o usuário acionar uma célula livre, ENTÃO o sistema DEVE abrir o formulário com ambiente, data e início preenchidos (término sugerido: +1h).
4. Deve ser uma tabela de dados semântica (`<caption>`, `<th scope>`), e cada botão deve ter nome acessível com data e hora.

### R8 — Painel de atendimento (F8, RF17)
1. Atendente e admin DEVEM ver cards das reservas não canceladas agrupados por data (padrão: hoje + 7 dias, com navegação), com horário, ambiente, finalidade, solicitante, recursos e quantidades, número SNP e status.
2. O atendente DEVE ver só reservas que envolvem `custom:setorId`. O admin vê todas.
3. O atendente NÃO DEVE receber o e-mail completo do solicitante: a Lambda mascara (`s***@e***.com`) (LGPD).

### R9 — Autorização e auditoria
1. Toda operação DEVE passar por `autorizar(usuario, acao, reserva) -> bool` com as políticas: solicitante altera/cancela só as próprias; admin pode tudo; atendente só lê reservas do seu setor, mascaradas.
2. Toda decisão DEVE ser logada em JSON: `{usuario: sub, grupo, acao, reservaId, decisao}`, sem e-mail nem outro dado pessoal.
3. Negação DEVE retornar 403 sem detalhar a política.

### R10 — Acessibilidade e responsividade
1. Todas as telas DEVEM cumprir os Requisitos da NBR 17225:2025 (`.kiro/steering/acessibilidade.md`), em especial teclado, foco visível, rótulos, erros com `role="alert"`, contraste e reflow em 320px.
2. Cada tela DEVE passar no axe sem violações A/AA.

### R11 — Dados
1. Um script de seed DEVE carregar os CSVs no DynamoDB. Números com ponto de milhar (`PRES_ID`, `RESE_ID`, `SOLI_ID`, ex.: "17.325") viram inteiros, e as datas `dd/mm/aaaa hh:mm:ss` viram ISO −03:00.
2. Os recursos de cada reserva DEVEM vir de `dados-solicitacao.csv` (`SOLI_QTD` vazio → 1). Reserva sem linha de solicitação fica só com o ambiente.
3. Como não há CSV da reserva, o seed DEVE gerar para cada `RESE_ID` finalidade, participantes, disposição ativa e solicitante fictício, e escolher um ambiente ativo **compatível com os recursos vinculados pedidos (RN9)** e sem conflito (RN5, RN6) com as reservas já gravadas. Se nenhum servir, usa "local próprio", com complemento preenchido e sem os recursos vinculados a ambiente. Os períodos do CSV são históricos e NÃO passam por RN3 nem RN4 (15 deles estão fora da faixa ou atravessam dias). *Com os CSVs atuais: 185 reservas com ambiente e 7 em local próprio.*
4. O seed DEVE acrescentar `codigoServicoSnp` em vínculos de TI (SEART × recursos 6, 8, 96) e de logística (SELOG × recurso 5) para demonstrar a RN11. Copa (SMSG × 1, 2, 3) fica sem código.
5. Config: `{faixaInicio: "07:00", faixaFim: "20:00", antecedenciaMin: 120, margemMin: 30}`.
6. Só 8 das 192 reservas do CSV estão no futuro (2 nos próximos 8 dias), então o seed DEVE gravar um **cenário de demo** relativo a `--data-demo` (padrão: hoje), com `D1` = primeiro dia útil depois dela. As reservas fixas são gravadas antes das históricas, e a alocação das históricas respeita também a RN8 em relação a elas (se exceder, o recurso limitado sai da reserva histórica):
   - F-RN5: Auditório (Completo) (1), `D1` 09:00–11:00.
   - F-RN6: Auditório (Parte A) (5), `D1` 14:00–16:00.
   - F-RN8: Sala de Reuniões – 9º andar (3), `D1` 14:00–16:00, com 2 × Projetor Multimídia Portátil (6, disponibilidade 2).
   - Pelo menos 6 reservas entre a data da demo e +7 dias, em ambientes do SMSG e com serviço de copa, para o painel do atendente.
   - Pelo menos 3 reservas do `solicitante@example.com` (uma transcorrida e uma prevista, no mínimo). O `sub` dessa conta DEVE ser lido do Cognito (`admin-get-user`), porque a reserva guarda `solicitanteSub`.
7. Reexecutar o seed NÃO DEVE sobrescrever itens existentes (`attribute_not_exists`), para não gerar eventos no stream nem e-mails "alterada" vazios.

### R12 — Testes
1. Todas as regras da seção 6 do caso (RN1–RN13) DEVEM ter testes pytest no domínio, com cada exemplo da tabela como caso de teste. RN9 cobre o filtro de recursos por ambiente; RN10 e RN11 cobrem `setores_envolvidos` e `precisa_snp`; RN12 cobre também `diff_reservas`.
2. O domínio DEVE ser Python puro, sem boto3, e receber `agora` injetado.

### R13 — Infraestrutura e provisionamento
**História:** como equipe, quero recriar o ambiente AWS por comandos versionados e documentados, na ordem do `design.md` §12.1, sem segredos no repositório.

1. A CMK do KMS, a tabela `sisgares`, as 4 Lambdas com suas roles, o HTTP API com o JWT authorizer, o event source do stream e os log groups DEVEM ser declarados em `backend/template.yaml` (AWS SAM) e implantados com `sam build && sam deploy` no stack `sisgares`. QUANDO o deploy for repetido sem mudança no template, ENTÃO o sistema NÃO DEVE criar recursos duplicados.
2. QUANDO `scripts/cognito.sh` rodar de novo, ENTÃO ele DEVE reaproveitar o User Pool, o domínio, o app client, os grupos e as contas existentes, sem criar duplicatas. O stack SAM DEVE receber o Cognito só pelos parâmetros `UserPoolId` e `ClientId`.
3. A tabela e o stream DEVEM ser criptografados em repouso com a CMK do KMS do stack.
4. Cada Lambda DEVE ter a sua própria role IAM, com só as ações da tabela e da CMK de que precisa (policy templates do SAM e, quando não houver template, statement inline restrito ao ARN da CMK).
5. QUANDO o stack for implantado, ENTÃO ele DEVE expor os outputs `ApiUrl` e `TableName`.
6. Credenciais AWS, token do GitHub e senha das contas de demo NÃO DEVEM ser versionados: valores só no `.env` (ignorado pelo git) ou lidos sem eco; o `.env-example` traz apenas os nomes das variáveis.
7. QUANDO houver push na `main`, ENTÃO o Amplify DEVE gerar e publicar o frontend pelo `amplify.yml`, com as variáveis `VITE_*` configuradas na branch.
8. O CORS do HTTP API DEVE aceitar só a URL do Amplify e `http://localhost:5173`, e as callbacks do Cognito DEVEM ser exatamente `http://localhost:5173/` e a URL do Amplify.
