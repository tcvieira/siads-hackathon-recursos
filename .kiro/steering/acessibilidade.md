---
inclusion: always
---

# Acessibilidade — Diretrizes do projeto (ABNT NBR 17225:2025 + NBR 17060:2022)

Toda interface deste projeto (telas web, componentes, e-mails HTML, documentos
gerados e um eventual app mobile) DEVE seguir as normas brasileiras de acessibilidade
digital adotadas pela equipe:

- **ABNT NBR 17225:2025 — Acessibilidade em conteúdo e aplicações web — Requisitos**
  (publicada em 11/03/2025, ABNT/CB-040, CE-040:000.004). Baseada no **WCAG 2.2**.
  Aplica-se a todo o frontend web.
- **ABNT NBR 17060:2022 — Acessibilidade em aplicativos de dispositivos móveis —
  Requisitos** (publicada em 26/10/2022, ABNT/CB-040). Baseada no **WCAG 2.1 + eMAG +
  GDAMA**. Aplica-se a qualquer app nativo, híbrido ou web em dispositivo móvel.

Ambas dão cumprimento ao Art. 63 da Lei Brasileira de Inclusão (LBI, Lei 13.146/2015)
e à Lei 10.098/2000. Esta é uma regra **sempre ativa**.

## Decisão da equipe sobre mobile
Caso o projeto venha a ter um aplicativo móvel, **usamos os mesmos critérios de
acessibilidade do web**: aplicam-se os requisitos da NBR 17225:2025 e, adicionalmente,
os requisitos específicos de mobile da NBR 17060:2022 (interação por toque, orientação
de tela, respeito às configurações de acessibilidade do dispositivo, controle de ações
por movimento etc.). Em caso de sobreposição, cumpre-se o critério mais rigoroso.

## Conformidade (NBR 17225:2025, Seção 4)
A norma separa **Requisito** de **Recomendação**:
- **Requisito** → obrigatório. Equivale aos níveis **A e AA** do WCAG 2.2.
  Atender a todos os requisitos = **conformidade regular**.
- **Recomendação** → nível **AAA** e boas práticas. Atender requisitos + recomendações
  = **conformidade plena**. Se uma recomendação não for atendida, é necessária
  justificativa razoável.

**Meta do projeto: conformidade regular (todos os Requisitos) como mínimo**, buscando
recomendações sempre que viável. Os códigos entre parênteses (ex: 2.4.7 AA) referenciam
o critério de sucesso WCAG correspondente, para rastreabilidade.

## Como validar antes de concluir uma tela
1. Navegar a tela inteira **apenas com teclado** (Tab, Shift+Tab, Enter, Espaço, Esc, setas); em mobile, apenas com leitor de tela (TalkBack/VoiceOver) e toque.
2. Rodar verificador automatizado (axe DevTools / `@axe-core/react`, Lighthouse) e zerar violações A/AA.
3. Conferir contraste de todas as cores novas (texto 4.5:1; grande 3:1; componentes/gráficos 3:1).
4. Testar reflow em 320px de largura e zoom/texto a 200% sem perda de conteúdo ou rolagem horizontal.
Nenhuma tela é "pronta" sem passar nesses quatro checks.

---

# Parte 1 — Web (ABNT NBR 17225:2025)

Numeração oficial da norma. "Req." = Requisito (A/AA, obrigatório); "Rec." = Recomendação (AAA/boas práticas).

## 5.1 Interação por teclado
- 5.1.1 Indicador de foco visível — Req. (2.4.7 AA)
- 5.1.2 Elemento em foco totalmente visível — Rec. (2.4.11 AA / 2.4.12 AAA)
- 5.1.3 Elemento em foco parcialmente visível — Req. (2.4.11 AA)
- 5.1.4 Ordem de foco previsível — Req. (2.4.3 A)
- 5.1.5 Uso de foco — Rec. (2.1.1 A / 2.1.3 AAA)
- 5.1.6 Armadilha de foco — Req. (2.1.2 A)
- 5.1.7 Conteúdo adicional (não só por foco/hover) — Rec. (1.4.13 AA)
- 5.1.8 Conteúdo adicional persistente — Req. (1.4.13 AA)
- 5.1.9 Conteúdo adicional dispensável — Req. (1.4.13 AA)
- 5.1.10 Atalhos de teclado (com tecla modificadora) — Rec. (2.1.4 A)
- 5.1.11 Atalhos de teclado sem tecla modificadora (desativáveis/remapeáveis) — Req. (2.1.4 A)
- 5.1.12 Acessibilidade por teclado total — Rec. (2.1.1 A / 2.1.3 AAA)
- 5.1.13 Acessibilidade por teclado parcial — Req. (2.1.1 A)
- 5.1.14 Mecanismos de entrada simultâneos — Rec. (2.5.6 AAA)
- 5.1.15 Comportamento de componentes customizados — Rec. (2.1.1 A / 2.1.3 AAA)
- 5.1.16 Instruções para componentes customizados — Req. (3.3.2 A)

## 5.2 Imagens
- 5.2.1 Texto alternativo para imagens de conteúdo — Req. (1.1.1 A)
- 5.2.2 Texto alternativo para imagens funcionais (descreve a ação/destino) — Req. (1.1.1 A / 2.4.4 A / 2.4.9 AAA)
- 5.2.3 Texto alternativo para imagens decorativas (alt="" ) — Req. (1.1.1 A)
- 5.2.4 Descrição para imagens complexas — Req. (1.1.1 A)
- 5.2.5 Imagens de texto (evitar; se essencial, alt equivalente) — Req. (1.1.1 A / 1.4.5 AA / 1.4.9 AAA)
- 5.2.6 Texto alternativo para mapas de imagens — Req. (1.1.1 A)

## 5.3 Cabeçalhos
- 5.3.1 Semântica de cabeçalho — Req. (1.3.1 A)
- 5.3.2 Uso de cabeçalhos (identificar seções) — Req. (1.3.1 A / 2.4.6 AA)
- 5.3.3 Cabeçalho principal (um único h1) — Rec. (2.4.6 AA / 2.4.10 AAA)
- 5.3.4 Seções com cabeçalhos — Rec. (2.4.10 AAA)
- 5.3.5 Estrutura de cabeçalhos (hierárquica, sem pular níveis) — Req. (1.3.1 A / 2.4.6 AA / 2.4.10 AAA)

## 5.4 Regiões (landmarks)
- 5.4.1 Semântica de região — Req. (1.3.1 A / 1.3.6 AAA)
- 5.4.2 Uso de regiões — Req. (1.3.1 A / 1.3.6 AAA)
- 5.4.3 Conteúdo em regiões — Rec. (1.3.6 AAA)
- 5.4.4 Regiões únicas (um header/main/footer) — Rec. (1.3.1 A / 1.3.6 AAA)
- 5.4.5 Regiões identificadas unicamente (aria-label distinto) — Req. (1.3.1 A / 4.1.2 A)

## 5.5 Listas
- 5.5.1 Semântica de lista — Req. (1.3.1 A)
- 5.5.2 Uso de listas — Req. (1.3.1 A)

## 5.6 Tabelas
- 5.6.1 Semântica de tabela — Req. (1.3.1 A)
- 5.6.2 Uso de tabelas (dados, não leiaute) — Req. (1.3.1 A)
- 5.6.3 Cabeçalhos de tabela (th + scope) — Req. (1.3.1 A)
- 5.6.4 Título de tabela (caption) — Rec. (2.4.6 AA / 2.4.10 AAA)
- 5.6.5 Título de tabela associado — Req. (1.3.1 A)
- 5.6.6 Descrição para tabelas complexas — Rec. (3.1.5 AAA)

## 5.7 Links e navegação
- 5.7.1 Semântica de link — Req. (1.3.1 A)
- 5.7.2 Uso de links — Req. (1.3.1 A)
- 5.7.3 Propósito do link sem contexto — Rec. (2.4.4 A / 2.4.9 AAA)
- 5.7.4 Propósito do link no contexto — Req. (2.4.4 A)
- 5.7.5 Links com identificação consistente — Rec. (3.2.4 AA / 2.4.9 AAA)
- 5.7.6 Links que abrem nova guia/janela (avisar) — Rec. (2.4.4 A / 2.4.9 AAA / 3.2.5 AAA)
- 5.7.7 Links para arquivos não HTML (formato/tamanho) — Rec. (2.4.4 A / 2.4.9 AAA)
- 5.7.8 Links para sites externos (avisar) — Rec. (2.4.4 A / 2.4.9 AAA)
- 5.7.9 Texto complementar do link — Rec. (2.4.4 A)
- 5.7.10 Links adjacentes — Rec. (2.4.4 A)
- 5.7.11 Links para contornar blocos (skip link) — Rec. (2.4.1 A)
- 5.7.12 Links para contornar blocos em conjunto de páginas — Req. (2.4.1 A)
- 5.7.13 Alternativas para localização — Req. (2.4.5 AA)
- 5.7.14 Localização em conjunto de páginas — Rec. (2.4.8 AAA)
- 5.7.15 Navegação consistente — Req. (3.2.3 AA)
- 5.7.16 Ajuda consistente — Req. (3.2.6 A)

## 5.8 Botões e controles
- 5.8.1 Semântica de botão — Req. (1.3.1 A)
- 5.8.2 Uso de botões — Req. (1.3.1 A)
- 5.8.3 Propósito do botão (nome acessível) — Req. (4.1.2 A / 2.4.6 AA)
- 5.8.4 Identificação consistente na página — Rec. (3.2.4 AA)
- 5.8.5 Identificação consistente em conjunto de páginas — Req. (3.2.4 AA)
- 5.8.6 Área de acionamento aprimorada (44px) — Rec. (2.5.8 AA / 2.5.5 AAA)
- 5.8.7 Área de acionamento mínima (24px) — Req. (2.5.8 AA)
- 5.8.8 Mudança de contexto previsível — Rec. (3.2.1 A / 3.2.2 A / 3.2.5 AAA)
- 5.8.9 Mudança de contexto previsível no foco — Req. (3.2.1 A)
- 5.8.10 Mudança de contexto previsível na entrada — Req. (3.2.2 A)
- 5.8.11 Acionamento por ponteiro único (up-event/cancelável) — Req. (2.5.2 A)
- 5.8.12 Operação por gestos de ponteiro (alternativa simples) — Req. (2.5.1 A)
- 5.8.13 Operação por arrastar (alternativa) — Req. (2.5.7 AA)
- 5.8.14 Operação por movimento (alternativa) — Req. (2.5.4 A)
- 5.8.15 Controles com retorno (feedback) — Rec. (1.3.3 A / 4.1.3 AA)

## 5.9 Formulários e entrada de dados (crítico para o cadastro de reserva)
- 5.9.1 Rótulo de campo — Req. (3.3.2 A / 4.1.2 A)
- 5.9.2 Rótulo de campo previsível — Req. (1.3.1 A / 3.3.2 A)
- 5.9.3 Rótulo de campo associado (for/id) — Req. (1.3.1 A)
- 5.9.4 Rótulo de campo descritivo — Req. (2.4.6 A)
- 5.9.5 Textos de ajuda previsíveis — Req. (3.3.2 A)
- 5.9.6 Campos relacionados (fieldset/legend) — Req. (1.3.1 A)
- 5.9.7 Campos obrigatórios identificados — Req. (3.3.2 A)
- 5.9.8 Tipo de dado determinado (programaticamente) — Req. (1.3.5 AA)
- 5.9.9 Mensagem de erro descritiva (identifica campo e erro) — Req. (3.3.1 A)
- 5.9.10 Sugestão de correção — Req. (3.3.3 AA)
- 5.9.11 Prevenção de erro — Rec. (3.3.4 AA / 3.3.6 AAA)
- 5.9.12 Prevenção de erro para formulários críticos (reverter/verificar/confirmar) — Req. (3.3.4 AA)
- 5.9.13 Ajuda contextual — Rec. (3.3.5 AAA)
- 5.9.14 Botão de submissão — Rec. (3.2.2 A)
- 5.9.15 Reentrada de dados (autofill/seleção) — Req. (3.3.7 A)
- 5.9.16 Validação sensorial ou por movimento (alternativa) — Req. (1.1.1 A / 2.5.4 A / 2.5.6 AAA)
- 5.9.17 Autenticação acessível aprimorada — Rec. (3.3.8 AA / 3.3.9 AAA)
- 5.9.18 Autenticação acessível mínima (sem teste cognitivo) — Req. (3.3.8 AA)

## 5.10 Apresentação
- 5.10.1 Características sensoriais (não só forma/cor/som) — Req. (1.3.3 A)
- 5.10.2 Ordem de apresentação — Req. (1.3.2 A)
- 5.10.3 Orientação de exibição (retrato e paisagem) — Req. (1.3.4 AA)
- 5.10.4 Design responsivo (reflow 320px/256px) — Req. (1.4.10 AA)
- 5.10.5 Área do indicador de foco visível — Rec. (2.4.13 AAA)

## 5.11 Uso de cores
- 5.11.1 Uso de cores (nunca só cor para informar) — Req. (1.4.1 A)
- 5.11.2 Contraste para texto aprimorado (7:1) — Rec. (1.4.3 AA / 1.4.6 AAA)
- 5.11.3 Contraste para texto mínimo (4.5:1; grande 3:1) — Req. (1.4.3 AA)
- 5.11.4 Contraste para componentes (3:1) — Req. (1.4.11 AA)
- 5.11.5 Contraste para objetos gráficos (3:1) — Req. (1.4.11 AA)
- 5.11.6 Contraste para indicador de foco visível (3:1) — Req. (1.4.11 AA / 2.4.13 AAA)

## 5.12 Conteúdo textual
- 5.12.1 Espaçamento entre linhas (1.5×) — Req. (1.4.12 AA / 1.4.8 AAA)
- 5.12.2 Espaçamento entre parágrafos (2×) — Req. (1.4.12 AA / 1.4.8 AAA)
- 5.12.3 Espaçamento entre letras (0.12×) — Req. (1.4.12 AA)
- 5.12.4 Espaçamento entre palavras (0.16×) — Req. (1.4.12 AA)
- 5.12.5 Alinhamento de blocos de texto — Rec. (1.4.8 AAA)
- 5.12.6 Largura de blocos de texto (≤80 caracteres) — Req. (1.4.10 AA / 1.4.8 AAA)
- 5.12.7 Texto redimensionado (até 200% sem perda) — Req. (1.4.4 AA / 1.4.8 AAA)
- 5.12.8 Semântica de texto especial (ênfase/citação/abreviação) — Req. (1.3.1 A)
- 5.12.9 Uso de texto especial — Req. (1.3.1 A)
- 5.12.10 Definições de significado — Rec. (3.1.3 AAA)
- 5.12.11 Siglas e abreviaturas — Rec. (3.1.4 AAA)
- 5.12.12 Nível de linguagem (linguagem simples) — Rec. (3.1.5 AAA)
- 5.12.13 Pronúncia identificada — Rec. (3.1.6 AAA)

## 5.13 Codificação e marcação semântica
- 5.13.1 Título da página (único/descritivo) — Req. (2.4.2 A)
- 5.13.2 Idioma da página (lang) — Req. (3.1.1 A)
- 5.13.3 Idioma das partes da página — Req. (3.1.2 AA)
- 5.13.4 Título do frame/iframe — Req. (1.3.1 A / 4.1.2 A)
- 5.13.5 Zoom não bloqueado — Req. (1.4.4 AA / 1.4.10 AA)
- 5.13.6 Ordem de leitura (lógica no código) — Req. (1.3.2 A)
- 5.13.7 Texto visível no nome acessível — Req. (2.5.3 A)
- 5.13.8 Mensagens de status (aria-live/role=status/alert) — Req. (4.1.3 AA)
- 5.13.9 Propósito identificável — Rec. (1.3.6 AAA)
- 5.13.10 Componentes com nome acessível — Req. (4.1.2 A)
- 5.13.11 Elementos nativos (preferir HTML nativo) — Rec. (1.3.1 A)
- 5.13.12 Semântica de componentes customizados — Req. (1.3.1 A / 4.1.2 A)
- 5.13.13 Estados, propriedades e valores de componentes customizados — Req. (4.1.2 A)

## 5.14 Áudio e vídeo
- 5.14.1 Alternativa em texto para áudio — Req. (1.2.1 A)
- 5.14.2 Legendas descritivas para vídeo — Req. (1.2.2 A)
- 5.14.3 Transcrição para vídeo — Rec. (1.2.1 A / 1.2.3 A / 1.2.8 AAA)
- 5.14.4 Audiodescrição para vídeo — Req. (1.2.1 A / 1.2.3 A / 1.2.5 AA)
- 5.14.5 Audiodescrição estendida — Rec. (1.2.7 AAA)
- 5.14.6 Janela de Libras — Rec. (1.2.6 AAA)
- 5.14.7 Controle de áudio (autoplay > 3s pausável) — Req. (1.4.2 A)
- 5.14.8 Áudio sem ruído — Rec. (1.4.7 AAA)
- 5.14.9 Legendas para áudio/vídeo ao vivo — Req. (1.2.4 AA)
- 5.14.10 Transcrição para áudio ao vivo — Rec. (1.2.9 AAA)

## 5.15 Animação
- 5.15.1 Controle de animação (pausar/parar/ocultar) — Req. (2.2.2 A)
- 5.15.2 Animações acionadas por interação (prefers-reduced-motion) — Rec. (2.3.3 AAA)
- 5.15.3 Flash intermitente (≤3/s) — Rec. (2.3.1 A / 2.3.2 AAA)
- 5.15.4 Flash intermitente limitado — Req. (2.3.1 A)

## 5.16 Tempo
- 5.16.1 Limite de tempo — Rec. (2.2.1 A / 2.2.3 AAA)
- 5.16.2 Limite de tempo ajustável (desligar/estender) — Req. (2.2.1 A)
- 5.16.3 Controle de atualização — Req. (2.2.2 A)
- 5.16.4 Interrupções — Rec. (2.2.4 AAA)
- 5.16.5 Reautenticação (sem perda de dados) — Rec. (2.2.1 A / 2.2.5 AAA)
- 5.16.6 Tempo de inatividade — Rec. (2.2.1 A / 2.2.6 AAA)

---

# Parte 2 — Mobile (ABNT NBR 17060:2022)

Aplicar APENAS se houver app nativo/híbrido/web em dispositivo móvel. Todos obrigatórios
são "Requisitos"; os demais são "Recomendações". Base: WCAG 2.1 + eMAG + GDAMA.

## 5.1.1 Percepção e compreensão
- 5.1.1.1 Texto alternativo para elementos não textuais — Req.
- 5.1.1.2 Textos em vez de imagens — Rec.
- 5.1.1.3 Evitar elementos decorativos que distraiam — Rec.
- 5.1.1.4 Rótulos em elementos interativos/de interface — Req.
- 5.1.1.5 Cabeçalhos e rótulos para estruturar — Req.
- 5.1.1.6 Mesma organização de elementos/nomes acessíveis — Req.
- 5.1.1.7 Nomes acessíveis contêm os rótulos — Req.
- 5.1.1.8 Descrição de elementos interativos (fora de contexto) — Req.
- 5.1.1.9 Padrão visual consistente — Rec.
- 5.1.1.10 Posicionamento de elementos em padrões conhecidos — Rec.
- 5.1.1.11 Rótulos de formulário na ordem usual — Req.
- 5.1.1.12 Um componente de formulário por linha — Rec.
- 5.1.1.13 Tipo de campo conforme a entrada (teclado adequado) — Req.
- 5.1.1.14 Instruções de preenchimento — Req.
- 5.1.1.15 Indicador de foco de navegação — Req.
- 5.1.1.16 Situar o usuário em itens sequenciais/paginação — Req.
- 5.1.1.17 Contraste de textos e elementos gráficos (WCAG AA) — Req.
- 5.1.1.18 Cor não é a única forma de informar — Req.
- 5.1.1.19 Não depender só de características sensoriais — Req.
- 5.1.1.20 Feedback perceptível por todos (visual + assistivo) — Req.
- 5.1.1.21 Saída/retorno perceptível (fechar modal, voltar) — Req.
- 5.1.1.22 Feedback para ações indisponíveis/inativas — Rec.
- 5.1.1.23 Título que descreve páginas/aplicações — Req.
- 5.1.1.24 Idiomas da aplicação e das partes declarados — Req.
- 5.1.1.25 Opção de contornar elementos piscantes — Req.
- 5.1.1.26 Orientação no primeiro uso (guided tour/wizard) — Rec.
- 5.1.1.27 Linguagem simples e clara — Rec.
- 5.1.1.28 Textos curtos e concisos — Rec.

## 5.1.2 Controle e interação
- 5.1.2.1 Respeitar configurações de acessibilidade do dispositivo — Req.
- 5.1.2.2 Controle do usuário sobre ações por movimento — Req.
- 5.1.2.3 Configuração de notificação — Req.
- 5.1.2.4 Avisar antes de forçar orientação de tela — Req.
- 5.1.2.5 Não restringir a uma única orientação — Rec.
- 5.1.2.6 Tempo suficiente / ajustável para atividades — Req.
- 5.1.2.7 Controle de áudios iniciados automaticamente — Req.
- 5.1.2.8 Não iniciar áudio automaticamente — Rec.
- 5.1.2.9 Controle de conteúdo em movimento — Req.
- 5.1.2.10 Sem alteração de contexto inesperada em formulários — Req.
- 5.1.2.11 Sem alteração de contexto inesperada ao focar — Req.
- 5.1.2.12 Interação por toque único (alternativa a gestos) — Req.
- 5.1.2.13 Tamanho mínimo da área de toque (WCAG AAA) — Rec.
- 5.1.2.14 Sem bloqueio na navegação sequencial assistiva — Req.
- 5.1.2.15 Indicação e correção de erros de interação — Req.
- 5.1.2.16 Ampliação da tela sem perda de informação/função — Req.
- 5.1.2.17 Comandos de voz com modalidade alternativa — Req.
- 5.1.2.18 Listas/tabelas com ordenação — Rec.
- 5.1.2.19 Mecanismo de busca em apps com muita informação — Rec.

## 5.1.3 Mídia
- 5.1.3.1 Legendas para conteúdo em áudio (inclui ao vivo) — Req.
- 5.1.3.2 Recurso alternativo em vídeo pré-gravado (transcrição/audiodescrição) — Req.
- 5.1.3.3 Transcrição textual para áudio pré-gravado — Req.
- 5.1.3.4 Alternativa em texto para áudio ao vivo — Rec.
- 5.1.3.5 Libras em conteúdo com áudio — Rec.
- 5.1.3.6 Audiodescrição estendida em vídeo pré-gravado — Rec.

## 5.1.4 Codificação
- 5.1.4 Código estruturado conforme padrões técnicos; componentes customizados com
  nome, função e valores declarados e acessíveis à tecnologia assistiva — Req.

---

# Aplicação específica a este projeto (Solare — Reservas de Ambientes)

Pontos onde a acessibilidade é mais crítica dado o escopo do sistema:

- **Grade dos painéis de reserva (RF16/RF17):** componente de maior risco. NÃO usar
  tabela de leiaute (NBR 17225 5.6.2 / Anexo A.1.8). Usar tabela de dados semântica
  (`<th scope>` para datas e horários, `<caption>`) ou grid ARIA com navegação por
  setas (5.1.4, 5.13.12). Estados das células (`Reservar às XX:XX`, `Margem de
  tolerância`, `Horário ultrapassado`, `Sem antecedência mínima`, ocupado) NÃO podem
  ser comunicados só por cor (5.11.1 / 5.10.1); exigir texto e/ou ícone. Células-link
  de "Reservar" com nome acessível completo incluindo data e hora (5.7.4, 5.13.7).

- **Imagens de disposição de ambiente (RF04):** cada `disp_*.jpg` com `alt` descritivo
  (ex: "Mesas em U") — 5.2.1. Disposição selecionada com estado anunciado à tecnologia
  assistiva (5.13.13).

- **Ícones de recurso (RF06):** `equip_*/estrut_*/serv_*.png` acompanhados do nome em
  texto → decorativos (`alt=""`, 5.2.3); quando o ícone for o único rótulo → `aria-label`
  (5.2.2 / 5.8.3).

- **Formulário de reserva (RF10):** campo "Complemento do ambiente" obrigatório quando
  "Não solicitado / local próprio" selecionado → `aria-required` dinâmico e mensagem de
  erro clara (5.9.7, 5.9.9). Quantidade de recurso limitado só aparece para recursos
  limitados → anunciar mudança via `aria-live` sem alterar contexto (5.13.8, 5.8.10).

- **Críticas de conflito (RF11/RF12):** erros de validação comunicados com
  `role="alert"`/`aria-live`, identificando período/recurso e como resolver, sem mover
  o foco abruptamente (5.9.9, 5.9.10, 5.13.8).

- **Cancelamento de reserva (RF15):** ação crítica/irreversível — exigir confirmação
  (5.9.12, formulário crítico 3.3.4 AA).

- **E-mails HTML de notificação (RF13/RF15):** o destaque das alterações da reserva não
  pode depender só de cor (5.11.1); usar também texto (ex: "ALTERADO:") e marcação
  semântica, pois clientes de e-mail e leitores de tela variam.

- **Links de SNP (RF10/RF17):** links para o pedido no sistema nacional abrem recurso
  externo — texto de link descritivo (5.7.4) e aviso de que abre em novo contexto quando
  aplicável (5.7.6, 5.7.8).

- **Antecedência mínima / horários (RF09, RF16):** sem limites de tempo artificiais na
  interface que impeçam o preenchimento; se houver sessão autenticada, preservar dados
  após reautenticação (5.16.2, 5.16.5).

---

## Fontes (normas oficiais fornecidas pela equipe)
- **ABNT NBR 17225:2025** — Acessibilidade em conteúdo e aplicações web — Requisitos (ABNT/CB-040, CE-040:000.004; publicada 11/03/2025; base WCAG 2.2). Checklist oficial no Anexo C da norma.
- **ABNT NBR 17060:2022** — Acessibilidade em aplicativos de dispositivos móveis — Requisitos (ABNT/CB-040; publicada 26/10/2022; base WCAG 2.1 + eMAG + GDAMA).
- Leis de referência: LBI (Lei 13.146/2015, Art. 63), Lei 10.098/2000, Decreto 5.296/2004.

> Esta diretriz foi redigida a partir dos textos oficiais das normas ABNT NBR 17225:2025
> e NBR 17060:2022 fornecidos pela equipe, preservando a numeração oficial dos requisitos
> e recomendações e os critérios de sucesso WCAG correspondentes. Para a redação integral
> de cada item, consultar o texto completo das normas adquirido junto à ABNT.
