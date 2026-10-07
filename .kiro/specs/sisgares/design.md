# Design — SISGARES

> Este design consolida e detalha o `ARQUITETURA.md` da equipe para o fluxo da spec.
> Onde houver divergência, o `ARQUITETURA.md` (decisões já tomadas pela equipe) prevalece
> e esta spec deve ser atualizada. Foco: suportar as regras de conflito RN5–RN8 com
> eficiência e cumprir os requisitos não funcionais de segurança/LGPD e acessibilidade.

## 1. Visão geral da arquitetura

```
Angular (Amplify Hosting)
   │  login Authorization Code + PKCE (ID token)
   ▼
Cognito User Pool  (grupos: solicitante/atendente/admin; custom:setorId)
   │  Authorization: Bearer <ID token>
   ▼
API Gateway HTTP API ── JWT authorizer (issuer=UserPool, audience=client_id)
   ▼
Lambdas (Python)  ──autorizar(usuario, acao, reserva)──► [v1 em código] / [v2 Verified Permissions]
   │
   ├─► DynamoDB (single-table, KMS CMK)
   ├─► SES  (RF13 — e-mail aos setores)
   ├─► SNP (HTTP externo, endpoint configurável — RF14)
   └─► CloudWatch Logs (decisões de autorização em JSON)
```

Stack confirmado: **Angular** (callbacks `localhost:4200`), **Amplify Hosting**
(fallback S3+CloudFront), **AWS SAM** como IaC. **Bedrock fora de escopo.**

## 2. Autenticação e autorização

### 2.1 Cognito (resumo do ARQUITETURA.md)
- User Pool, app client público (sem secret), Authorization Code + PKCE, página hospedada.
- Grupos = papéis: `solicitante`, `atendente`, `admin` (claim `cognito:groups`).
- Atributo `custom:setorId` liga o atendente ao setor (`ENVO_ID`); só aparece no **ID token**.
- Frontend envia **ID token**; JWT authorizer usa **client_id como audience**.
- `cognito:groups` chega como **string** no HTTP API (ex.: `"[atendente]"`) — a Lambda normaliza para lista.

### 2.2 Função única de autorização
```python
def autorizar(usuario: Claims, acao: str, reserva: Reserva | None) -> bool: ...
```
Políticas (iguais nas duas versões):
1. solicitante altera/cancela **só a própria** reserva (`reserva.solicitante_sub == usuario.sub`).
2. admin pode tudo.
3. atendente vê só reservas que envolvem **o setor dele** (`custom:setorId` ∈ setores da reserva).
4. atendente **não vê dados pessoais** do solicitante → mascaramento na Lambda (ver 5.4).

- **v1 (código):** `if`s simples. É o caminho da demo.
- **v2 (AVP):** mesma assinatura chamando `IsAuthorizedWithToken`. Trocar até a metade do hackathon se estiver pronto; senão, vira "próximo passo" no pitch.
- Toda decisão logada: `{usuario, grupo, acao, reservaId, decisao}` em JSON no CloudWatch.

## 3. Modelo de dados (DynamoDB single-table)

Tabela única `sisgares`, criptografada com CMK do KMS. Chaves genéricas `PK`/`SK` + GSIs
para as consultas de conflito. Convenção de tipos no prefixo da chave.

### 3.1 Entidades e chaves

| Entidade | PK | SK | Atributos principais |
|---|---|---|---|
| Unidade | `UNID#<id>` | `META` | descricao |
| Setor (ENVO) | `UNID#<u>` | `ENVO#<id>` | desc, email, emailsExtra[], ativo |
| Ambiente (AMBI) | `UNID#<u>` | `AMBI#<id>` | desc, ativo, paiId, caminho[] (ancestrais) |
| Disposição (DISP) | `DISP#<id>` | `META` | desc, ativo, iconeArquivo |
| Grupo recurso (GREC) | `GREC#<id>` | `META` | desc, ordem, ativo |
| Recurso (RECU) | `UNID#<u ou GLOBAL>` | `RECU#<id>` | desc, grecId, limitado, disponibilidade, icone, ativo |
| Vínculo RECU↔AMBI | `AMBI#<a>` | `RECU#<r>` | (restringe recurso a ambiente) |
| Vínculo ENVO↔AMBI | `AMBI#<a>` | `ENVO#<e>` | codigoServicoSNP? |
| Vínculo ENVO↔RECU | `RECU#<r>` | `ENVO#<e>` | codigoServicoSNP? |
| Reserva (RESE) | `RESE#<id>` | `META` | solicitanteSub, solicitanteNome, ambienteId, complemento, finalidade, participantes, disposicaoId, status, ultimaAlteracao, snps[] |
| Período (PRES) | `RESE#<id>` | `PRES#<ini_iso>#<pid>` | inicio, fim, ambienteId |
| Solicitação recurso (SOLI) | `RESE#<id>` | `SOLI#<rid>` | recursoId, qtd |
| Config | `CONFIG#<unid ou GLOBAL>` | `META` | antecedenciaMin, horaMin, horaMax, snpEndpoint |

### 3.2 Índices para conflito

- **GSI1 — conflito de ambiente (RN5–RN7):**
  `GSI1PK = AMBI#<ambienteId>`, `GSI1SK = <inicio_iso>`.
  Cada PERÍODO é duplicado em itens de índice para **cada ambiente da árvore** que ele
  ocupa: o próprio ambiente + seus ancestrais (ocupar o filho ocupa o pai). Assim, a
  consulta de conflito para o ambiente A é um `Query` em `GSI1PK = AMBI#A` por faixa de
  tempo, cobrindo também reservas de descendentes (que gravaram A como ancestral) e de
  ancestrais (A é descendente deles → ao reservar A gravamos os ancestrais; ao reservar
  o ancestral, consultamos a faixa e encontramos A? ver nota).
  - **Estratégia escolhida (projeção de ocupação):** ao salvar um período no ambiente A,
    grava-se um item de ocupação para **cada** ambiente em `{A} ∪ ancestrais(A)`. A
    consulta de conflito para reservar o ambiente B busca ocupações em
    `{B} ∪ ancestrais(B) ∪ descendentes(B)`. Como ancestrais já estão projetados pela
    gravação, e descendentes projetaram seus ancestrais (incluindo B), a interseção é
    detectada consultando `GSI1PK ∈ {B} ∪ descendentes(B)`. Em árvore rasa (dados reais:
    Auditório → Partes A/B), o custo é baixo.
- **GSI2 — conflito de recurso (RN8):**
  `GSI2PK = RECU#<recursoId>`, `GSI2SK = <inicio_iso>`. Cada SOLI de recurso limitado
  projeta um item de ocupação por período. Consulta por faixa de tempo soma `qtd` das
  reservas ativas que intersectam e compara com `RECU_DISPONIBILIDADE`.

> Nota de simplicidade para 4h: a árvore de ambientes nos dados reais tem profundidade 2
> (Auditório Completo → Parte A / Parte B). Uma implementação direta pode, no momento do
> salvar, (a) resolver `{A} ∪ ancestrais(A) ∪ descendentes(A)` a partir de `paiId`, e
> (b) fazer um `Query` por ambiente nesse conjunto. Projeção de ocupação é otimização;
> se faltar tempo, consulta direta por conjunto resolve com correção.

### 3.3 Seed
Script carrega os CSVs de `docs/requisitos/dados/` para a tabela, convertendo datas
`DD/MM/YYYY HH:MM:SS` para ISO 8601 e resolvendo `caminho[]` dos ambientes a partir de
`AMBI_ID_PAI`. Status de reserva é derivado do horário no momento da leitura (ver 5.3).

## 4. API (HTTP API)

Rotas protegidas por JWT authorizer. Base `/api`.

| Método | Rota | Papel | Descrição |
|---|---|---|---|
| GET | `/ambientes` | todos | ambientes ativos da unidade do usuário |
| GET | `/recursos?ambienteId=` | todos | recursos disponíveis (unidade + vínculo ambiente) |
| GET | `/disposicoes` | todos | disposições ativas |
| POST | `/reservas` | solicitante | cria reserva (valida RN5–RN8) |
| PUT | `/reservas/{id}` | solicitante/admin | altera (valida RN5–RN8; dispara diffs) |
| POST | `/reservas/{id}/cancelar` | solicitante/admin | cancela (antecedência + confirmação) |
| GET | `/reservas/{id}` | dono/admin/atendente* | detalhe (*mascarado p/ atendente) |
| GET | `/paineis/solicitante?ambienteId=&de=&colunas=&fds=` | todos | grade RF16 |
| GET | `/paineis/atendente?de=&colunas=&fds=` | atendente/admin | cards RF17 (filtra setor) |
| GET/PUT | `/config` | admin | configurações RF09 |
| CRUD | `/admin/setores|ambientes|recursos|grupos|disposicoes` | admin | tabelas básicas |

Validação de conflito retorna **422** com corpo descritivo:
`{ "erro": "conflito_periodo", "periodo": {...}, "reservaConflitante": "<id>", "regra": "RN6" }`.

## 5. Algoritmos e regras

### 5.1 Conflito de período (RN5–RN7)
```
conflita(reservaNova):
  alvos = {A} ∪ ancestrais(A) ∪ descendentes(A)         # A = ambiente da reserva
  para cada período P de reservaNova:
    Pexp = [P.inicio - 30min, P.fim + 30min]            # RN6
    para cada ambiente X em alvos:
      ocupacoes = query(GSI1PK=AMBI#X, faixa ~ Pexp, status != cancelada, reserva != reservaNova)
      se qualquer ocupacao intersecta Pexp (RN5):  → CONFLITO (identifica período e reserva)
```
A verificação antecipada (RF11.2) chama o mesmo endpoint por período; a verificação
completa (RF11.3) roda no `POST`/`PUT` antes de persistir.

### 5.2 Recurso insuficiente (RN8)
```
para cada SOLI (recurso limitado r, qtd q) da reservaNova:
  D = disponibilidade(r, unidade)
  para cada período P:
    emUso = soma(qtd de SOLI de r em reservas ativas cujo período intersecta P)   # sem margem de 30min
    se emUso + q > D:  → INSUFICIENTE (identifica recurso e período)
```

### 5.3 Status da reserva (RF10.9)
Derivado do horário atual vs. períodos: `cancelada` (persistido) › `transcorrida` (todos
os períodos no passado) › `em andamento` (agora dentro de algum período) › `prevista`.

### 5.4 Mascaramento LGPD (RF17.6 / RNF02)
Ao servir reserva para **atendente**, a Lambda remove/ofusca dados pessoais do
solicitante (ex.: mantém primeiro nome ou matrícula funcional, omite e-mail/CPF). admin
e o próprio solicitante veem os dados completos.

### 5.5 Notificação e SNP (RF13/RF14)
No `POST`/`PUT` bem-sucedido:
1. Resolve setores envolvidos = setores do ambiente (ENVO↔AMBI) ∪ setores dos recursos solicitados (ENVO↔RECU).
2. Para cada setor, envia e-mail (SES) para `email` ou `emailsExtra[]`.
3. Para cada vínculo com `codigoServicoSNP`, chama o endpoint SNP (RF09.3) e guarda o número em `reserva.snps[]`.
4. Em alteração (RF15), monta diff da última versão e destaca em HTML (ver 5.6).

### 5.6 Diff de alteração (RF15.4)
Compara versão anterior × nova (ambiente, períodos, recursos, disposição, finalidade) e
gera e-mail HTML com marcação semântica + texto (ex.: `<ins>`/`<del>`, rótulo
"ALTERADO:") — **sem depender só de cor** (acessibilidade 5.11.1).

## 6. Frontend (Angular)

- **Auth:** `@aws-amplify/auth` ou `angular-oauth2-oidc` com Authorization Code + PKCE; guarda o ID token; interceptor adiciona `Authorization: Bearer`.
- **Rotas:** `/login`, `/painel` (solicitante), `/atendimento` (atendente/admin), `/reserva/:id?`, `/admin/*`. Guards por `cognito:groups`.
- **Grade dos painéis (RF16/RF17):** componente de grade acessível — **tabela de dados** semântica (`<th scope>`, `<caption>`), não tabela de leiaute; estados de célula com texto + ícone, não só cor; células-link com nome acessível completo (data + hora). Navegação por teclado.
- **Formulário de reserva (RF10):** campos com `<label for>`, `aria-required` dinâmico no "Complemento do ambiente", quantidade de recurso limitado anunciada via `aria-live`, erros de conflito em `role="alert"`.
- **Validação dupla:** verificação antecipada por período (chama API) + validação final no submit.

## 7. Segurança / IaC

- IAM: uma role por Lambda, menor privilégio (policy templates do SAM).
- KMS CMK para a tabela; HTTPS em trânsito.
- SAM descreve: Cognito (pool/client/domínio/grupos), HTTP API + authorizer, Lambdas,
  DynamoDB + GSIs, KMS, e (se der tempo) o policy store do AVP.
- `.env` nunca versionado (já no `.gitignore`); credenciais do SNP via Secrets Manager se necessário.

## 8. Mapeamento requisitos → componentes

| Requisito | Componente principal |
|---|---|
| RF01–RF09 | Lambdas `/admin/*` + `/config`; seed CSV; telas admin Angular |
| RF10 | `POST/PUT /reservas` + form Angular; validação RN5–RN8 |
| RF11 (RN5–RN7) | `conflita()` + GSI1; verificação antecipada e completa |
| RF12 (RN8) | validação de recurso + GSI2 |
| RF13 | SES |
| RF14 | cliente SNP + `reserva.snps[]` |
| RF15 | `PUT` + `cancelar` + diff HTML |
| RF16 | `GET /paineis/solicitante` + grade acessível |
| RF17 | `GET /paineis/atendente` + filtro setor + mascaramento |
| RNF01 | steering de acessibilidade |
| RNF02 | `autorizar()` + mascaramento + logs |
| RNF03 | SAM |

## 9. Riscos e decisões em aberto
- **AVP vs. código:** decisão à metade do hackathon (ARQUITETURA.md). Design mantém a assinatura única para troca sem refactor.
- **Projeção de ocupação vs. consulta por conjunto:** começar pela consulta direta por `{A} ∪ ancestrais ∪ descendentes` (correta e simples); projeção é otimização.
- **Amplify vs. S3+CloudFront:** Amplify é o default; fallback já previsto.
- **Unidade macro nos CSVs:** os dados reais são de uma unidade (PR/CE); o modelo mantém `UNID#` para generalidade, com uma unidade default no seed.
