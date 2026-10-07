# SISGARES — reserva de ambientes, recursos e serviços

MVP do hackathon AWS × MPF. O solicitante escolhe um horário livre na grade de 30 min e reserva
ambiente, recursos e serviços. O sistema bloqueia conflitos de horário (com margem de 30 min e
entre ambiente pai e filhos) e recurso limitado acima do disponível. Cada setor envolvido recebe
um e-mail simulado e, quando o vínculo tem código de serviço, um pedido SNP simulado. O atendente
planeja o atendimento num painel de cards por data, sem ver dados pessoais do solicitante.

- Frontend: https://main.d3vro5b84ccm5j.amplifyapp.com/
- Spec: `.kiro/specs/sisgares-mvp/` (`requirements.md`, `design.md`, `tasks.md`)
- Pitch: `docs/apresentacao/sisgares-pitch.pptx`

## Arquitetura

```
Navegador (React SPA, Amplify Hosting)
   │ login PKCE                       ┌─► CloudWatch Logs (JSON, decisões allow/deny, sem PII)
   ▼                                  │
Cognito (3 grupos, custom:setorId)    │
   │ ID token                         │
   ▼                                  │
API Gateway HTTP API (JWT) ──► λ catalogo · λ reservas · λ paineis
                                      │
                                      ▼
                     DynamoDB `sisgares` (tabela única, CMK do KMS)
                                      │ Stream (filtro RESE#…/META)
                                      ▼
                     λ notificacoes ──► e-mails simulados + pedidos SNP
```

- Serverless e orientado a eventos: e-mails e pedidos SNP saem do stream, não da requisição.
- IaC: `backend/template.yaml` (SAM). O Cognito vem do `scripts/cognito.sh` e entra como parâmetro.
- Segurança: uma role IAM por Lambda, com privilégio mínimo; CMK com rotação; CORS restrito;
  autorização centralizada em `comum/auth.py`; atendente vê o e-mail do solicitante mascarado.
- Conflitos (RN5–RN7): ocupações em partições próprias lidas com `ConsistentRead`, locks
  versionados e `TransactWriteItems` condicional. Detalhes em `design.md` §3.

## Modelo de dados (tabela única `sisgares`)

| Item | PK | SK | GSI1PK / GSI1SK | Atributos |
|---|---|---|---|---|
| Ambiente | `CAT#AMBI` | `<id>` | | desc, ativo, paiId, setores[] |
| Disposição | `CAT#DISP` | `<id>` | | desc, ativo, icone |
| Recurso | `CAT#RECU` | `<id>` | | desc, grupoId, limitado, disponibilidade, ativo, icone, ambientesVinculados[], setores[] |
| Grupo de recurso | `CAT#GREC` | `<id>` | | desc, ordem, ativo |
| Setor | `CAT#ENVO` | `<id>` | | desc, email, ativo |
| Vínculo setor | `CAT#VINC` | `AMBI#<id>#ENVO#<id>` ou `RECU#<id>#ENVO#<id>` | | tipo, alvoId, setorId, codigoServicoSnp? |
| Config | `CAT#CONF` | `GLOBAL` | | faixaInicio, faixaFim, antecedenciaMin, margemMin |
| Reserva | `RESE#<id>` | `META` | `SOLI#<sub>` / `<criadoEm>` | finalidade, participantes, ambienteId?, complemento?, disposicaoId?, periodos[{inicio,termino}], recursos[{recursoId,qtd}], id, solicitanteSub, solicitanteEmail, setoresIds[], cancelada, versao |
| Agenda do período | `RESE#<id>` | `PER#<n>` | `AGENDA` / `<inicio>#<id>` | reservaId, inicio, termino, cancelada, ambienteId?, setoresIds[] |
| Ocupação de ambiente | `OCUP#AMBI#<a>` | `<inicio>#<id>#<n>` | | reservaId, inicio, termino |
| Ocupação de recurso limitado | `OCUP#RECU#<r>` | `<inicio>#<id>#<n>` | | reservaId, inicio, termino, qtd |
| Lock | `LOCK#AMBI#<raiz>` / `LOCK#RECU#<r>` | `LOCK` | | versao |
| Contador | `CTR#RESE` / `CTR#SNP` | `CTR` | | valor (último número emitido) |
| E-mail simulado | `RESE#<id>` | `EMAIL#<ts>#<setor>#<eventID>` | `NOTIF` / `<ts>` | setorId, para, assunto, tipo(criada/alterada/cancelada), alteracoes[{campo,antes,depois}], html |
| Pedido SNP | `RESE#<id>` | `SNP#<setor>` | | numero, codigoServico, situacao |

Os dados vêm dos CSVs do kit (`docs/requisitos/dados/`), carregados pelo `scripts/seed.py`.

## Como rodar

Pré-requisitos: AWS CLI v2, SAM CLI, Python 3.12, Node 22 e `uv`. Credenciais no `.env` (seção
abaixo).

```bash
python3 -m venv .venv && .venv/bin/pip install -r backend/requirements-dev.txt python-dotenv
bash scripts/cognito.sh                        # User Pool, grupos e as 3 contas de demo
bash scripts/deploy_backend.sh                 # sam build + sam deploy; grava API_URL no .env
.venv/bin/python scripts/seed.py               # catálogo, reservas do CSV e cenário de demo
cd frontend && npm ci && npm run dev           # http://localhost:5173 (lê o .env da raiz)
```

O frontend publicado é construído pelo Amplify a cada push na `main` (`amplify.yml`), com as
variáveis `VITE_*` configuradas no branch.

## Acesso

Acesse https://main.d3vro5b84ccm5j.amplifyapp.com/ com uma das contas de demo. Todas usam a
mesma senha: `Hackaton#123`.

| Login | Senha | Papel |
|---|---|---|
| `solicitante@example.com` | `Hackaton#123` | solicitante |
| `atendente@example.com` | `Hackaton#123` | atendente do setor 1 (SMSG) |
| `admin@example.com` | `Hackaton#123` | admin |

## Testes

```bash
cd backend && ../.venv/bin/python -m pytest -q        # domínio (RN1–RN13), repo, handlers, stream
uv run scripts/obter_tokens.py                         # ID tokens das 3 contas (1 hora)
.venv/bin/python scripts/e2e_api.py                    # roteiro da demo (design.md §11) na API real
```

O `e2e_api.py` cria uma reserva de teste em D2, altera e cancela, e confere bloqueios RN5, RN6 e
RN8, e-mails do stream, pedido SNP e o painel do atendente.

## Credenciais AWS para o CLI

Copie `.env-example` para `.env` e preencha `AWS_DEFAULT_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` e `AWS_SESSION_TOKEN`. Depois, na raiz do projeto:

```bash
set -a
source .env
set +a
```

O `set -a` exporta automaticamente todas as variáveis definidas pelo `source`; o `set +a` desliga isso.

Para conferir:

```bash
aws sts get-caller-identity
```

Deve aparecer `assumed-role/WSParticipantRole/Participant`.

Observações:

- Vale só para o terminal atual. Em outra aba, rode o `source` de novo.
- As credenciais são temporárias. Se aparecer `ExpiredToken`, pegue novas no portal do workshop e atualize o `.env`.
- Se o `.env` foi salvo no Windows (com `\r` no fim das linhas), rode uma vez `sed -i 's/\r$//' .env`.
- Não commite o `.env`.
