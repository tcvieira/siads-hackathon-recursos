# Plano de implementação — SISGARES MVP (2h)

Referências: `requirements.md` (R1–R12) e `design.md`. Depois da Fase 0, as trilhas A–D
rodam **em paralelo** e só se tocam pelos contratos do `design.md` §3 e §4.
Ordem de corte se o tempo apertar: (1) a lista diária mobile da C.4 (a grade passa a ter rolagem
horizontal própria, que o 1.4.10 admite para tabelas de dados); (2) o retry da transação na B.3 (devolve 409 direto); (3) `/notificacoes`
da C.6 vira uma lista simples sem filtros. As regras RN5–RN8 nunca entram no corte.

## Fase 0 — Base (0:00–0:15)

- [ ] 0.1 Criar a estrutura de pastas do `design.md` §2 (`backend/`, `frontend/`, `scripts/`) e o `.gitignore` (node_modules, .aws-sam, dist, .venv). _R11_
- [ ] 0.2 `scripts/cognito.sh`: passos 0–7 do `ARQUITETURA.md`, idempotente (reaproveita app/pool existentes), callbacks `http://localhost:5173/` e `https://main.$APP_ID.amplifyapp.com/`. Grava os IDs no `.env`. Rodar. _R1_
- [ ] 0.3 Congelar os contratos: `backend/src/dominio/modelos.py` (dataclasses/Pydantic) e `frontend/src/api/tipos.ts` com o mesmo shape (`design.md` §4). _R2_

## Trilha A — Domínio + testes (0:15–1:05)

- [ ] A.1 `hierarquia.py`: `ancestrais`, `descendentes`, `raiz`, `afetados`. _R3.2_
- [ ] A.2 `regras.py`: `validar_basico(reserva, catalogo, config, agora, periodos_alterados)` → `list[Erro]` (RN1, RN2, RN3, RN4, RN9, quantidade só para limitados, itens inativos). `status(reserva, agora)` (RN13). `pode_alterar`, `pode_cancelar` (RN12). _R2, R5_
- [ ] A.3 `conflitos.py`: `conflitos_ambiente(periodos, ocupacoes, margem, ignorar_id)` e `excesso_recurso(periodos, recurso, ocupacoes, qtd, ignorar_id)`, com mensagem e sugestão ("livre a partir de HH:MM"). _R3, R4_
- [ ] A.4 `notificacao.py`: `setores_envolvidos`, `diff_reservas`, `montar_email` (HTML escapado, "ALTERADO:" + `<del>`/`<ins>`), `precisa_snp`. _R6_
- [ ] A.5 `tests/`: um teste por exemplo da seção 6 do caso (RN1–RN8, RN12, RN13) + diff + setores. `pytest -q` verde. _R12_

## Trilha B — Infra + API (0:15–1:15)

- [ ] B.1 `template.yaml`: CMK, tabela `sisgares` (PK/SK, GSI1, GSI2, stream NEW_AND_OLD_IMAGES, SSE KMS), HTTP API com JWT authorizer (issuer do pool, audience = ClientId), CORS, throttling, 4 funções Python 3.12 com policies mínimas, event source do stream com filtro. `sam validate --lint`. _design §1, §8_
- [ ] B.2 `comum/auth.py`: `Usuario.from_claims` (parse de `"[a b]"`), `autorizar`, `mascarar_para`, log de decisão. `tests/test_auth.py`. _R1, R8.3, R9_
- [ ] B.3 `comum/repo.py`: leitura do catálogo, queries de ocupação no GSI1, listagens no GSI2, contadores, `salvar_reserva` transacional com locks e retry único (`design.md` §3). _R3.4, R4_
- [ ] B.4 `handlers/catalogo.py` e `handlers/reservas.py` (Powertools `APIGatewayHttpResolver`, Pydantic, erros → 400/403/404/409 com `erros[]`). Usar o domínio da Trilha A; enquanto não estiver pronto, usar stubs. _R2–R5_
- [ ] B.5 `handlers/paineis.py`: ocupação, atendimento (filtro por setor + máscara + pedidos SNP), notificações. _R7, R8_
- [ ] B.6 `sam build && sam deploy` (stack `sisgares`), com os outputs `ApiUrl` e `TableName` no `.env`. _B.1_

## Trilha C — Frontend (0:15–1:20)

- [ ] C.1 Vite + React + TS + Tailwind + shadcn/ui (button, input, label, select, combobox, checkbox, radio-group, dialog, alert-dialog, card, badge, toast), jsx-a11y, `lang="pt-BR"`, tokens de cor com contraste conferido. _R10_
- [ ] C.2 Auth: `react-oidc-context` com PKCE, `api/cliente.ts` com o ID token, guarda de rota por grupo, layout (skip link, header/nav/main, título + foco por rota), logout. _R1_
- [ ] C.3 `/reservas/nova` e `/editar`: formulário completo (`design.md` §7), validação ao vivo em `aria-live` e resumo de erros com `role="alert"`. _R2, R3.3, R3.6, R4.3_
- [ ] C.4 `/grade`: tabela semântica de 30 min com estados em texto + ícone e botões "Reservar às HH:MM de dd/mm", que abrem o formulário pré-preenchido; lista diária abaixo de 640px. _R7_
- [ ] C.5 `/minhas-reservas` com Editar e Cancelar (AlertDialog). _R5_
- [ ] C.6 `/atendimento` (cards por data) e `/notificacoes` (caixa de saída estruturada + SNP). _R6.4, R8_
- [ ] C.7 Mocks de API (MSW ou fixture local) para desenvolver antes da B.6; trocar por `VITE_API_URL` real na integração.

## Trilha D — Dados + eventos (0:15–1:05)

- [ ] D.1 `scripts/seed.py`: CSV → itens (`design.md` §3), números "14.207" → 14207, datas → ISO −03:00, `setores[]`/`ambientesVinculados[]` pré-computados, `codigoServicoSnp` (R11.3), config, contadores. Gerar as reservas sintéticas sem conflito (usando o domínio da Trilha A), com ≥ 3 do solicitante de demo. Idempotente. _R11_
- [ ] D.2 `handlers/notificacoes.py`: consumo do stream → `EMAIL#…` e upsert `SNP#…` (`design.md` §6), idempotente por `eventID`. _R6_
- [ ] D.3 Rodar o seed na tabela implantada e conferir a contagem de itens.

## Fase 3 — Integração e deploy (1:20–1:40)

- [ ] 3.1 Frontend apontando para a API real. Fluxo de ponta a ponta com as 3 contas.
- [ ] 3.2 `scripts/deploy-frontend.sh`: `npm run build`, zip do `dist/`, `amplify create-deployment` + upload + `start-deployment`. Conferir o login pela URL do Amplify.
- [ ] 3.3 Executar o roteiro da demo (`design.md` §11) e corrigir os bloqueios.
- [ ] 3.4 Kiro hook: `PostFileSave` em `backend/src/dominio/**` → `pytest -q` (conta no critério "uso de hooks").

## Fase 4 — Acessibilidade, docs e pitch (1:40–2:00)

- [ ] 4.1 Os 4 checks da steering em cada tela: só teclado, axe sem A/AA, contraste, reflow 320px / zoom 200%. Corrigir as violações. _R10_
- [ ] 4.2 `README.md`: descrição, arquitetura, como rodar (cognito.sh → sam deploy → seed → frontend), contas de demo, testes. _Entregável_
- [ ] 4.3 Slide/roteiro do pitch: problema → solução → demo (§11) → arquitetura → próximos passos (AVP, CRUD de cadastros, SES, SNP real, unidades macro, particionamento do GSI por mês, custo estimado).
