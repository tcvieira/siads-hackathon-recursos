# Requisitos — SISGARES (Solicitação de Ambientes e Recursos)

## Introdução

O SISGARES é um sistema de gerenciamento de solicitações de reservas de ambientes
físicos e/ou recursos institucionais, com integração ao sistema nacional de pedidos
(SNP). Um usuário cadastra a reserva de um ambiente — dentre os disponíveis na sua
unidade macro — para um período e horário, podendo incluir recursos (notebook, projetor,
som etc.) e serviços (água, café). Reservas que demandem recursos/serviços de um setor
geram notificação automática por e-mail ao setor e, quando houver serviço vinculado no
catálogo, disparam um pedido no SNP. O sistema oferece dois painéis: um para o
solicitante e outro para o setor de atendimento.

Este documento formaliza os requisitos funcionais (RF01–RF17) do enunciado e as regras
de negócio de conflito (RN5–RN8), que são a **prioridade de avaliação** da demo. O
desenho técnico está em `design.md` e se apoia no `ARQUITETURA.md` da equipe.

### Glossário
- **Unidade macro:** unidade organizacional (ex.: PR/CE) à qual pertencem ambientes, recursos e setores. Escopo de visibilidade de uma reserva.
- **Setor envolvido (ENVO):** equipe da unidade que atende recursos/serviços; recebe notificações. É dado de negócio, não conta de acesso.
- **Ambiente (AMBI):** espaço físico reservável; pode ser subdivisão (filho) de outro ambiente da mesma unidade (`AMBI_ID_PAI`).
- **Recurso (RECU):** item solicitável (serviço, estrutura ou equipamento), com grupo (GREC), ícone, opcional de unidade e opcional de disponibilidade limitada.
- **Disposição (DISP):** arrumação de mesas/cadeiras do ambiente, com imagem ilustrativa.
- **Reserva (RESE):** solicitação de um solicitante, com um ou mais períodos e zero ou mais solicitações de recurso.
- **Período (PRES):** intervalo início–término de uma reserva; pode cruzar a meia-noite.
- **Solicitação de recurso (SOLI):** vínculo reserva↔recurso com quantidade (quando limitado).
- **SNP:** Sistema Nacional de Pedidos (externo), acionado por endpoint configurável.

### Papéis (Cognito — ver ARQUITETURA.md)
- **solicitante:** cria/edita/cancela as próprias reservas; usa o painel do solicitante.
- **atendente:** vê reservas que envolvem o seu setor (`custom:setorId`); usa o painel de atendimento; não vê dados pessoais do solicitante (LGPD).
- **admin:** cadastra tabelas básicas e configurações; acesso total.

---

## Requisitos

### Módulo 1 — Cadastro de tabelas básicas

### RF01 — Cadastro de Setor Envolvido
**User story:** Como admin, quero cadastrar setores existentes na base corporativa, para
que possam ser vinculados a ambientes e recursos e recebam notificações.

#### Critérios de aceitação
1. QUANDO o admin cadastra um setor, O SISTEMA DEVE persistir descrição e status ativo (base: `dados-envolvido.csv` — `ENVO_ID`, `ENVO_DESC`, `ENVO_EMAIL`, `ENVO_ST_ATIVO`).
2. O SISTEMA DEVE permitir informar a caixa postal padrão do setor (`ENVO_EMAIL`) para notificações.
3. ONDE o setor exigir, O SISTEMA DEVE permitir, opcionalmente, uma lista de e-mails arbitrária para notificação em vez da caixa padrão.
4. O SISTEMA DEVE associar cada setor a uma unidade macro.

### RF02 — Cadastro de Ambiente
**User story:** Como admin, quero cadastrar ambientes físicos de uma unidade macro, com
hierarquia pai/filho, para refletir subdivisões.

#### Critérios de aceitação
1. QUANDO o admin cadastra um ambiente, O SISTEMA DEVE persistir descrição, status ativo e unidade macro (base: `dados-ambiente.csv` — `AMBI_ID`, `AMBI_DESC`, `AMBI_ST_ATIVO`, `AMBI_ID_PAI`).
2. O SISTEMA DEVE permitir associar um ambiente como subdivisão (filho) de outro ambiente **da mesma unidade macro** via `AMBI_ID_PAI`.
3. O SISTEMA NÃO DEVE permitir associar um ambiente a um pai de unidade macro diferente.
4. O SISTEMA NÃO DEVE permitir ciclos na hierarquia (um ambiente não pode ser ancestral de si mesmo).
5. A hierarquia DEVE ser considerada na crítica de conflito de períodos (ver RN5–RN7).

### RF03 — Relacionamento de Ambiente com Setor Envolvido
**User story:** Como admin, quero vincular um ambiente a um ou mais setores da mesma
unidade, para que sejam notificados das reservas daquele ambiente.

#### Critérios de aceitação
1. QUANDO o admin edita um ambiente, O SISTEMA DEVE permitir associá-lo a um ou mais setores da **mesma unidade macro** (base: `dados-envolvido-ambiente.csv` — `EAMB_ENVO_ID`, `EAMB_AMBI_ID`).
2. PARA CADA vínculo ambiente↔setor, O SISTEMA DEVE permitir informar, opcionalmente, um **código de serviço no catálogo do SNP**.
3. QUANDO uma reserva usa o ambiente, O SISTEMA DEVE notificar os setores vinculados (ver RF13) e, SE houver código de serviço, disparar pedido no SNP (ver RF14).

### RF04 — Cadastro de Disposição de Ambiente
**User story:** Como admin, quero cadastrar disposições físicas de mesas/cadeiras com
imagem ilustrativa única, para o solicitante escolher a arrumação.

#### Critérios de aceitação
1. QUANDO o admin cadastra uma disposição, O SISTEMA DEVE persistir descrição, status e nome do arquivo de imagem (base: `dados-disposicao.csv` — `DISP_ID`, `DISP_DESC`, `DISP_ST_ATIVO`, `DISP_ICONE_ARQUIVO`).
2. O SISTEMA DEVE associar cada disposição a **uma imagem ilustrativa única**.
3. QUANDO o solicitante seleciona uma disposição na reserva, O SISTEMA DEVE exibir a respectiva imagem.

### RF05 — Cadastro de Grupo de Recurso
**User story:** Como admin, quero cadastrar grupos de recurso (Serviço, Estrutura,
Equipamento) com ordem de posição, para classificar e ordenar os recursos nas telas.

#### Critérios de aceitação
1. QUANDO o admin cadastra um grupo, O SISTEMA DEVE persistir descrição, ordem e status (base: `dados-grupo-recurso.csv` — `GREC_ID`, `GREC_DESC`, `GREC_ORDEM`, `GREC_ST_ATIVO`).
2. O SISTEMA DEVE usar `GREC_ORDEM` para ordenar os recursos nas diversas telas.

### RF06 — Cadastro de Recurso
**User story:** Como admin, quero cadastrar recursos (serviços, estrutura, equipamentos)
com grupo, ícone, unidade opcional e disponibilidade limitada opcional.

#### Critérios de aceitação
1. QUANDO o admin cadastra um recurso, O SISTEMA DEVE persistir descrição, grupo, ícone e status (base: `dados-recurso.csv` — `RECU_ID`, `RECU_DESC`, `RECU_GREC_ID`, `RECU_ST_LIMITADO`, `RECU_DISPONIBILIDADE`, `RECU_ST_ATIVO`, `RECU_ICONE_ARQUIVO`).
2. O SISTEMA DEVE exigir que cada recurso pertença a **exatamente um** grupo (`RECU_GREC_ID`) e tenha **um ícone** dentre os disponíveis.
3. O SISTEMA DEVE permitir vincular o recurso a uma unidade macro específica; SE não informada, o recurso fica disponível para reservas em **qualquer** unidade.
4. QUANDO o recurso tem disponibilidade limitada (`RECU_ST_LIMITADO = S`), O SISTEMA DEVE exigir a quantidade disponível na unidade (`RECU_DISPONIBILIDADE`).
5. A disponibilidade limitada DEVE ser considerada na crítica de recursos insuficientes (ver RN8).

### RF07 — Relacionamento de Recurso com Setor Envolvido
**User story:** Como admin, quero vincular um recurso a um ou mais setores da mesma
unidade, para que sejam notificados das reservas que demandem o recurso.

#### Critérios de aceitação
1. QUANDO o admin edita um recurso, O SISTEMA DEVE permitir associá-lo a um ou mais setores da **mesma unidade macro** (base: `dados-envolvido-recurso.csv` — `EREC_ENVO_ID`, `EREC_RECU_ID`).
2. PARA CADA vínculo recurso↔setor, O SISTEMA DEVE permitir informar, opcionalmente, um **código de serviço no catálogo do SNP**.
3. QUANDO uma reserva solicita o recurso, O SISTEMA DEVE notificar os setores vinculados (RF13) e, SE houver código de serviço, disparar pedido no SNP (RF14).

### RF08 — Relacionamento de Recurso com Ambiente
**User story:** Como admin, quero restringir um recurso a determinados ambientes, para
que ele só possa ser solicitado nesses ambientes.

#### Critérios de aceitação
1. QUANDO o admin edita um recurso, O SISTEMA DEVE permitir associá-lo a um ou mais ambientes da unidade (base: `dados-vinculo-recurso.csv` — `VREC_RECU_ID`, `VREC_AMBI_ID`).
2. ONDE um recurso tiver vínculo com ambientes, O SISTEMA DEVE torná-lo selecionável **apenas** nas reservas desses ambientes.
3. ONDE um recurso não tiver vínculo com ambientes, O SISTEMA DEVE mantê-lo disponível conforme a regra de unidade (RF06.3).

### RF09 — Configurações (admin)
**User story:** Como admin, quero configurar antecedência mínima, faixa de horário e o
endpoint do SNP.

#### Critérios de aceitação
1. O SISTEMA DEVE permitir configurar a **antecedência mínima (em minutos)** para o início ao cadastrar uma reserva.
2. O SISTEMA DEVE permitir configurar **horário mínimo e máximo** para períodos de reserva, de forma **global** e, opcionalmente, **por unidade macro** (a configuração por unidade sobrepõe a global).
3. O SISTEMA DEVE permitir configurar o **endpoint da API do SNP** para registro automático de pedidos.
4. QUANDO existir configuração por unidade, O SISTEMA DEVE aplicá-la em vez da global para aquela unidade.

### Módulo 2 — Reservas

### RF10 — Cadastro de Reserva
**User story:** Como solicitante, quero incluir, alterar ou cancelar uma reserva de
ambientes e/ou recursos para um período, informando os dados exigidos.

#### Critérios de aceitação
1. O SISTEMA DEVE permitir escolher um ambiente dentre os disponíveis na unidade macro do solicitante OU a opção **"Não solicitado / local próprio"** (default).
2. QUANDO a opção "Não solicitado / local próprio" estiver selecionada, O SISTEMA DEVE exigir o preenchimento do campo **"Complemento do ambiente"**.
3. O SISTEMA DEVE exigir a **finalidade** da reserva (texto multilinha, obrigatório).
4. O SISTEMA DEVE exigir a **quantidade de participantes** estimada (obrigatório).
5. ONDE um ambiente for solicitado, O SISTEMA DEVE permitir escolher uma **disposição** (opcional) e exibir a imagem da selecionada.
6. O SISTEMA DEVE exigir **pelo menos um período** com data/hora de início e término, podendo início e término cair em dias diferentes.
7. O SISTEMA DEVE limitar os horários dos períodos à faixa configurada (RF09.2), global ou por unidade.
8. O SISTEMA DEVE permitir **zero ou mais** solicitações de recurso; QUANDO o recurso for limitado, O SISTEMA DEVE habilitar o campo de **quantidade** solicitada.
9. O SISTEMA DEVE exibir, na parte superior da tela: nome do solicitante; status da reserva (prevista, em andamento, transcorrida ou cancelada — conforme o horário); data/hora da última alteração; e, quando houver, número do(s) SNP(s) vinculado(s) como link para o pedido.
10. QUANDO a reserva for salva, O SISTEMA DEVE executar a verificação completa de conflitos (RN5–RN7) e de recursos insuficientes (RN8) antes de persistir.

### RF11 — Crítica quanto a períodos conflitantes
**User story:** Como solicitante, quero ser impedido de cadastrar uma reserva que
conflite com outra no mesmo ambiente ou parte dele, para evitar choques.

#### Critérios de aceitação
1. O SISTEMA DEVE criticar e **impedir** o salvamento quando qualquer período da reserva tiver interseção com um período de outra reserva ativa para o mesmo ambiente ou parte dele (ver RN5, RN6, RN7).
2. O SISTEMA DEVE realizar uma **verificação antecipada** à medida que o solicitante escolhe cada período, notificando conflitos detectados.
3. O SISTEMA DEVE realizar uma **verificação completa** no momento de salvar, cobrindo conflitos que tenham surgido durante o preenchimento.
4. QUANDO houver conflito, O SISTEMA DEVE identificar o período e a reserva conflitante na mensagem.

### RF12 — Crítica quanto a recursos insuficientes
**User story:** Como solicitante, quero ser impedido de solicitar mais de um recurso
limitado do que o disponível no período, para não exceder o estoque.

#### Critérios de aceitação
1. O SISTEMA DEVE criticar e **impedir** o salvamento quando a quantidade solicitada de um recurso limitado exceder a disponível para os períodos informados (ver RN8).
2. O SISTEMA DEVE considerar **todas as interseções** com períodos de outras reservas ativas que solicitam o mesmo recurso limitado.
3. QUANDO houver insuficiência, O SISTEMA DEVE identificar o recurso e o período na mensagem.

### RF13 — Notificações automáticas para setores envolvidos
**User story:** Como setor envolvido, quero receber e-mail com os detalhes das reservas
que envolvem meu setor, para me organizar.

#### Critérios de aceitação
1. QUANDO uma reserva é criada ou alterada, O SISTEMA DEVE gerar notificação por e-mail para os setores vinculados ao ambiente (RF03) e aos recursos solicitados (RF07).
2. O SISTEMA DEVE enviar para a caixa postal padrão do setor OU para a lista de e-mails arbitrária, quando configurada (RF01.3).
3. A notificação DEVE conter os detalhes da reserva (solicitante, finalidade, períodos, ambiente, recursos).

### RF14 — Registro automático de pedidos no SNP
**User story:** Como sistema, quero registrar pedidos no SNP automaticamente quando o
vínculo setor↔ambiente ou setor↔recurso tiver código de serviço no catálogo.

#### Critérios de aceitação
1. QUANDO uma reserva é salva e um vínculo envolvido (ambiente ou recurso) possui código de serviço no catálogo, O SISTEMA DEVE registrar um pedido no SNP via endpoint configurado (RF09.3), sob a categoria do serviço, considerando recurso/serviço e unidade.
2. O SISTEMA DEVE armazenar o(s) número(s) de SNP retornado(s) e vinculá-los à reserva (exibidos em RF10.9 e RF17).
3. SE o vínculo não tiver código de serviço, O SISTEMA NÃO DEVE abrir pedido no SNP (apenas notifica por e-mail).

### RF15 — Alteração ou cancelamento da reserva
**User story:** Como solicitante, quero alterar ou cancelar reservas ainda não
transcorridas, com as mesmas validações e notificações destacando as mudanças.

#### Critérios de aceitação
1. O SISTEMA DEVE permitir alterar reservas ainda **não transcorridas**.
2. O SISTEMA DEVE permitir **cancelar** mediante confirmação e respeitando a antecedência mínima (RF09.1).
3. QUANDO uma reserva é alterada, O SISTEMA DEVE reexecutar todas as validações do cadastro (RN5–RN8).
4. QUANDO uma reserva é alterada, O SISTEMA DEVE disparar notificação aos setores envolvidos destacando, com **HTML e recursos de estilo**, o que mudou em relação à última versão.

### Módulo 3 — Painéis de Reservas

### RF16 — Painel de reservas para o Solicitante
**User story:** Como solicitante, quero um painel em grade (datas × horários) por
ambiente, para visualizar disponibilidade e iniciar reservas com um clique.

#### Critérios de aceitação
1. O SISTEMA DEVE exibir uma grade onde as **colunas são datas consecutivas** a partir de uma data de referência (inicialmente a data corrente) e as **linhas são horários** da faixa disponível, uma a cada **30 minutos**.
2. O SISTEMA DEVE permitir, na parte superior, selecionar o ambiente, ajustar o número de colunas e exibir/ocultar finais de semana.
3. QUANDO uma célula de horário/data está livre, O SISTEMA DEVE exibi-la como link **"Reservar às XX:XX"** que leva ao cadastro já preenchendo ambiente, data e hora de início.
4. O SISTEMA DEVE preencher visualmente todo o intervalo ocupado por cada período de reserva existente no ambiente (ou parte dele) dentro do intervalo exibido.
5. ONDE o usuário for o solicitante da reserva OU tiver perfil de gestor, O SISTEMA DEVE permitir navegar à tela de cadastro da respectiva reserva.
6. O SISTEMA DEVE marcar como indisponíveis as células imediatamente anteriores ao início e posteriores ao término de um período, com o texto **"Margem de tolerância"** (ver RN6).
7. O SISTEMA DEVE marcar como indisponíveis as células cujos horários já passaram, com o texto **"Horário ultrapassado"**.
8. O SISTEMA DEVE marcar como indisponíveis as células que não atendem à antecedência mínima (RF09.1), com o texto **"Sem antecedência mínima"**.

### RF17 — Painel de reservas para o Atendente (setor envolvido)
**User story:** Como atendente, quero um painel por datas com cards das reservas do meu
setor, para atendê-las.

#### Critérios de aceitação
1. O SISTEMA DEVE exibir colunas de **datas consecutivas** a partir de uma data de referência (inicialmente a corrente).
2. PARA CADA reserva com período na data, O SISTEMA DEVE exibir um **card** com horário, finalidade, solicitante, recursos e número do SNP vinculado (link para o pedido).
3. O card DEVE prover link para a tela de cadastro da reserva.
4. O SISTEMA DEVE permitir, na parte superior, ajustar o número de colunas e exibir/ocultar finais de semana.
5. O SISTEMA DEVE exibir apenas reservas que envolvem o **setor do atendente** (`custom:setorId`).
6. O SISTEMA NÃO DEVE expor dados pessoais do solicitante além do necessário (LGPD; ver RN mascaramento no design).

---

## Regras de negócio de conflito (prioridade de avaliação)

> Estas regras concretizam RF11 e RF12. São o critério que mais pesa na nota e devem
> estar cobertas por testes. A numeração RN5–RN8 segue a convenção adotada pela equipe
> no `ARQUITETURA.md`.

### RN5 — Interseção de períodos
Dois períodos **P1 = [inicio1, fim1]** e **P2 = [inicio2, fim2]** têm interseção quando
`inicio1 < fim2` E `inicio2 < fim1` (sobreposição de intervalos; o encosto exato
fim1 == inicio2 **não** é interseção por si só — mas ver RN6, margem de tolerância).
- Períodos podem cruzar a meia-noite (início e término em dias diferentes) — a comparação é sobre datas-horário completas, não só hora.
- Só contam períodos de reservas **ativas** (status ≠ cancelada).

### RN6 — Margem de tolerância de 30 minutos
Para evitar problemas de logística, considera-se **conflito** também quando um período
se inicia ou encerra com **menos de 30 minutos** de diferença para o encerramento ou
início de um período de outra reserva no mesmo ambiente (ou parte dele).
- Operacionalmente: ao comparar P1 com P2, expanda P1 em 30 min para cada lado
  (`[inicio1 - 30min, fim1 + 30min]`) e aplique RN5 contra P2. Se houver interseção, é conflito.
- Reflexo no painel (RF16.6): as células imediatamente antes do início e depois do término de um período aparecem como **"Margem de tolerância"**.

### RN7 — Hierarquia de ambientes (pai/filho)
O conflito considera o ambiente escolhido **e** sua árvore hierárquica na mesma unidade:
- Reservar um ambiente **pai** conflita com reservas ativas de **qualquer ambiente filho** (descendente) cujo período intersecte (com RN6).
- Reservar um ambiente **filho** conflita com reservas ativas do **pai** (ancestral) e de **irmãos**? → Não com irmãos; conflita com **ancestrais** e **descendentes**, pois ocupar o filho também ocupa o espaço dentro do pai, e ocupar o pai ocupa todos os filhos. Irmãos são espaços distintos e não conflitam entre si.
- Formalmente: ao reservar o ambiente A, o conjunto de ambientes em conflito é
  `{A} ∪ ancestrais(A) ∪ descendentes(A)`. Qualquer reserva ativa nesse conjunto, com período que intersecte (RN6), bloqueia.
- A opção "Não solicitado / local próprio" **não** participa de conflito de ambiente (não ocupa espaço físico gerenciado).

### RN8 — Recurso limitado insuficiente
Para um recurso com `RECU_ST_LIMITADO = S` e disponibilidade `D = RECU_DISPONIBILIDADE`
na unidade:
- Para cada período P da reserva sendo salva, calcule a soma das quantidades já
  solicitadas desse recurso por **reservas ativas** cujos períodos **intersectam P**
  (interseção pela RN5; a margem de 30 min do RN6 **não** se aplica a recurso, apenas a
  ambiente — recurso é sobre quantidade simultânea).
- SE `soma_em_uso(P) + quantidade_solicitada > D` para qualquer P, O SISTEMA DEVE
  impedir o salvamento e identificar recurso e período.
- Recursos **não** limitados (`RECU_ST_LIMITADO = N`) não entram nesta crítica.

> Observação de modelagem: nos CSVs, `SOLI_QTD` vem vazio para recursos não limitados
> (ex.: serviços) e preenchido para limitados. O design define como as chaves/índices do
> DynamoDB suportam as consultas de interseção de RN5–RN8 de forma eficiente.

---

## Requisitos não funcionais

### RNF01 — Acessibilidade
Todo o frontend DEVE seguir o steering `.kiro/steering/acessibilidade.md` (ABNT NBR
17225:2025; e NBR 17060:2022 se houver mobile). Pontos críticos: grade dos painéis
(5.6/5.10/5.11), formulário de reserva (5.9), críticas via `aria-live`/`role=alert`
(5.13.8), e-mails de alteração sem depender só de cor (5.11.1).

### RNF02 — Segurança e LGPD
1. Autenticação via Cognito (Authorization Code + PKCE); autorização por papel + dono + setor.
2. O atendente NÃO DEVE receber dados pessoais do solicitante além do necessário; a resposta é mascarada na Lambda.
3. Dados em repouso criptografados (KMS); HTTPS em trânsito; IAM de menor privilégio.
4. Toda decisão de autorização DEVE ser logada em JSON no CloudWatch.

### RNF03 — Arquitetura serverless (AWS)
Lambda + API Gateway HTTP API + DynamoDB + Cognito + KMS, IaC em AWS SAM, conforme
`ARQUITETURA.md`. Verified Permissions (AVP) é evolução opcional da função de autorização.

### RNF04 — Escopo e prioridade do MVP (hackathon 4h)
A prioridade de implementação e demo é o **fluxo vertical**: cadastro de reserva com as
críticas RN5–RN8 funcionando, seguido de notificação/SNP e dos dois painéis. O CRUD
completo de todas as tabelas básicas é desejável, mas secundário à demonstração das
regras de conflito.

---

## Rastreabilidade (origem dos dados)
Os CSVs em `docs/requisitos/dados/` são a base do modelo e do seed:
`dados-grupo-recurso`, `dados-recurso`, `dados-ambiente`, `dados-disposicao`,
`dados-envolvido`, `dados-envolvido-ambiente`, `dados-envolvido-recurso`,
`dados-vinculo-recurso`, `dados-periodo-reserva`, `dados-solicitacao`. As imagens em
`docs/requisitos/Imagens/` (ícones de disposição e de recurso) são usadas nas telas.
