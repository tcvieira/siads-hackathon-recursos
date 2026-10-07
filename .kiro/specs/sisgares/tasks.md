# Plano de implementação — SISGARES

> Ordem pensada para o hackathon de 4h: priorizar o **fluxo vertical** que a banca mais
> valoriza — reserva com as críticas de conflito RN5–RN8 funcionando ponta a ponta —
> antes de ampliar cobertura. Cada tarefa referencia os requisitos (requirements.md) e o
> design (design.md). Itens marcados **[opcional]** só se sobrar tempo.
>
> Convenção: marque `[x]` ao concluir. Rode `git pull` antes de começar cada bloco, pois
> a equipe trabalha em paralelo.

## Bloco 0 — Fundação (infra mínima)

- [ ] 0.1 Esqueleto SAM (`template.yaml`) com DynamoDB single-table (`PK`/`SK` + GSI1 + GSI2) e KMS CMK
  - Tabela `sisgares`, GSI1 (`GSI1PK`/`GSI1SK`) para conflito de ambiente, GSI2 (`GSI2PK`/`GSI2SK`) para conflito de recurso
  - _Requisitos: RNF03; Design §3, §7_
- [ ] 0.2 Camada de acesso a dados (repo Python) com helpers de chave e conversão de datas ISO 8601
  - _Design §3.1, §3.3_
- [ ] 0.3 Script de seed dos CSVs de `docs/requisitos/dados/` para a tabela
  - Resolver `caminho[]`/ancestrais dos ambientes a partir de `AMBI_ID_PAI`
  - _Requisitos: RF01–RF08 (dados); Design §3.3_

## Bloco 1 — Autenticação e autorização

- [ ] 1.1 Provisionar Cognito via SAM/CLI (pool, client público PKCE, grupos, `custom:setorId`, 3 contas demo)
  - Seguir o passo a passo do `ARQUITETURA.md`; guardar POOL/CLIENT_ID/domínio no `.env`
  - _Requisitos: RNF02; Design §2.1_
- [ ] 1.2 HTTP API + JWT authorizer (issuer = pool, audience = client_id)
  - _Design §2.1, §4_
- [ ] 1.3 Função `autorizar(usuario, acao, reserva)` v1 em código + normalização de `cognito:groups` (string → lista)
  - Políticas 1–4 (dono/admin/setor/LGPD) + log JSON no CloudWatch
  - _Requisitos: RNF02; Design §2.2, §5.4_
- [ ] 1.4 **[opcional]** v2 com Verified Permissions (mesma assinatura, `IsAuthorizedWithToken`) — decidir à metade do hackathon
  - _Design §2.2, §9_

## Bloco 2 — Núcleo: reserva + conflitos (PRIORIDADE MÁXIMA)

- [ ] 2.1 Modelo de Reserva/Período/Solicitação e `POST /reservas` (sem validação ainda), persistindo projeção de ocupação em GSI1/GSI2
  - _Requisitos: RF10; Design §3.1, §4_
- [ ] 2.2 `conflita()` — RN5 (interseção) + RN6 (margem 30min) + RN7 (hierarquia `{A} ∪ ancestrais ∪ descendentes`)
  - Começar pela consulta direta por conjunto de ambientes; projeção é otimização
  - _Requisitos: RF11, RN5, RN6, RN7; Design §5.1_
- [ ] 2.3 Validação de recurso insuficiente — RN8 (soma de interseções de reservas ativas vs. `RECU_DISPONIBILIDADE`)
  - _Requisitos: RF12, RN8; Design §5.2_
- [ ] 2.4 Integrar validações no `POST`/`PUT` (verificação completa ao salvar) + endpoint de verificação antecipada por período
  - Retornar 422 descritivo (`regra`, `periodo`, `reservaConflitante`)
  - _Requisitos: RF10.10, RF11.2, RF11.3, RF12; Design §4, §5.1_
- [ ] 2.5 **Testes das regras de conflito** (unitários) — casos: encosto exato, margem 29/30/31min, pai×filho, filho×pai, irmão (não conflita), recurso no limite/acima, período cruzando meia-noite
  - _Requisitos: RN5–RN8; Design §5.1, §5.2 — alta prioridade: é o critério de nota_

## Bloco 3 — Status, alteração, cancelamento

- [ ] 3.1 Derivação de status (prevista/em andamento/transcorrida/cancelada) por horário
  - _Requisitos: RF10.9; Design §5.3_
- [ ] 3.2 `PUT /reservas/{id}` com reexecução das validações + `POST /reservas/{id}/cancelar` (antecedência + confirmação)
  - _Requisitos: RF15.1, RF15.2, RF15.3; Design §4_
- [ ] 3.3 Diff de alteração e e-mail HTML destacando mudanças (texto + marcação, não só cor)
  - _Requisitos: RF15.4; Design §5.6; Acessibilidade 5.11.1_

## Bloco 4 — Notificação e SNP

- [ ] 4.1 Resolver setores envolvidos (ambiente ∪ recursos) e enviar e-mail via SES
  - _Requisitos: RF03, RF07, RF13; Design §5.5_
- [ ] 4.2 Cliente SNP: abrir pedido quando o vínculo tiver `codigoServicoSNP`; guardar números em `reserva.snps[]`
  - Endpoint configurável (RF09.3); mock se o SNP real não estiver disponível na demo
  - _Requisitos: RF14; Design §5.5_

## Bloco 5 — Painéis (frontend Angular, acessível)

- [ ] 5.1 Projeto Angular + auth PKCE (ID token) + interceptor `Authorization: Bearer` + guards por grupo
  - _Design §6_
- [ ] 5.2 Painel do solicitante (RF16): grade datas×horários (30min), seleção de ambiente, nº de colunas, fins de semana
  - Célula livre = link "Reservar às XX:XX" (pré-preenche ambiente/data/hora); ocupação visual; "Margem de tolerância"/"Horário ultrapassado"/"Sem antecedência mínima"
  - Tabela de dados semântica (não leiaute), estados com texto+ícone, navegação por teclado
  - _Requisitos: RF16; Design §6; Acessibilidade 5.6/5.10/5.11_
- [ ] 5.3 Formulário de reserva (RF10): ambiente/complemento, finalidade, participantes, disposição (imagem), períodos, recursos (qtd se limitado)
  - `aria-required` dinâmico no complemento; qtd via `aria-live`; erros de conflito em `role="alert"`
  - _Requisitos: RF10; Design §6; Acessibilidade 5.9/5.13.8_
- [ ] 5.4 Painel do atendente (RF17): colunas de datas, cards (horário/finalidade/solicitante/recursos/SNP), link para cadastro, filtro por setor, mascaramento LGPD
  - _Requisitos: RF17; Design §5.4, §6_

## Bloco 6 — Tabelas básicas e configurações (admin)

- [ ] 6.1 `GET/PUT /config` (antecedência mínima, faixa de horário global/por unidade, endpoint SNP)
  - _Requisitos: RF09; Design §4_
- [ ] 6.2 **[opcional]** CRUD admin de setores/ambientes/recursos/grupos/disposições + telas
  - Para a demo, o seed dos CSVs já popula; priorizar leitura e deixar escrita como "próximo passo" se faltar tempo
  - _Requisitos: RF01–RF08; Design §4_

## Bloco 7 — Deploy e demo

- [ ] 7.1 Deploy frontend (Amplify Hosting; fallback S3+CloudFront) e `sam deploy` do backend
  - _Design §1, §7 — ação de alto impacto: confirmar antes de executar_
- [ ] 7.2 Roteiro de demo de 5 min: problema → solução → **demo das regras de conflito** → arquitetura/segurança → próximos passos (AVP, CRUD, Bedrock)
  - _Critérios de avaliação: Apresentação + Atendimento aos Requisitos_

## Verificação final (antes do pitch)
- [ ] Testes de RN5–RN8 passando
- [ ] Checklist de acessibilidade nas telas (teclado, contraste, `aria-live`, reflow 320px) — ver steering
- [ ] Autorização mascarando dados do atendente (LGPD) e logando decisões
- [ ] `.env` fora do git; nenhuma credencial commitada
