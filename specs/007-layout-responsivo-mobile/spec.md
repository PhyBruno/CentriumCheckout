# Feature Specification: Layout Responsivo (Desktop/Mobile)

**Feature Branch**: `[007-layout-responsivo-mobile]`

**Created**: 2026-08-26

**Status**: Draft

**Input**: User description: "O operador pode usar o PDV em tablet/celular, onde uma tela única com todas as áreas simultâneas não cabe com usabilidade aceitável — a apresentação precisa se adaptar ao tamanho da tela, sem duplicar regra de negócio entre desktop e mobile."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Alternância automática de layout por tamanho de tela (Priority: P2)

Como operador de caixa em tablet, quero que a interface se adapte automaticamente ao tamanho da tela, sem configuração manual.

**Why this priority**: Importante para adoção em loja física com tablets, mas o fluxo desktop já cobre o uso inicial.

**Independent Test**: Pode ser testado redimensionando a tela através do limiar de troca e confirmando que o estado da venda em andamento não se perde nem duplica.

**Acceptance Scenarios**:

1. **Given** a aplicação aberta numa tela estreita (tamanho de tablet/celular), **When** o layout é avaliado, **Then** o sistema usa a apresentação em etapas (mobile); **Given** uma tela larga (desktop), **Then** o sistema usa a apresentação em tela única.
2. **Given** uma venda em andamento, **When** o layout muda de um formato para outro, **Then** o estado da venda permanece exatamente o mesmo, sem perda nem duplicação.

---

### User Story 2 - Navegação em etapas no mobile (Priority: P2)

Como operador de caixa em mobile, quero navegar entre etapas da venda (cliente/produtos → pagamento → revisão) e poder voltar a uma etapa já visitada, para corrigir erros sem recomeçar.

**Why this priority**: Reduz o risco de um erro não corrigível no meio do fluxo mobile.

**Independent Test**: Pode ser testado avançando até a última etapa, voltando à primeira, alterando um dado e confirmando que o estado permanece consistente ao avançar de novo.

**Acceptance Scenarios**:

1. **Given** o operador no layout mobile, **When** a venda está em andamento, **Then** o sistema apresenta 3 etapas sequenciais: identificação de cliente e produtos, conferência de produtos e pagamento, e revisão final.
2. **Given** uma etapa anterior já visitada, **When** o operador deseja voltar a ela, **Then** o sistema permite essa navegação livremente, a qualquer momento antes da finalização.

---

### User Story 3 - Leitura de código de barras pela câmera (mobile) (Priority: P3)

Como operador de caixa em mobile, quero apontar a câmera do dispositivo para o código de barras do produto, sem depender de leitor físico.

**Why this priority**: Conveniência para cenários sem leitor físico conectado ao dispositivo; não bloqueia o uso principal, que já cobre inserção manual/por leitor físico.

**Independent Test**: Pode ser testado ativando a leitura por câmera, apontando para um código de barras válido e confirmando que o produto correspondente é inserido na venda.

**Acceptance Scenarios**:

1. **Given** o operador no layout mobile, em um navegador/dispositivo com suporte a essa funcionalidade, **When** ele aciona a leitura por câmera, **Then** o sistema solicita permissão de câmera e, uma vez concedida, ativa a leitura de código de barras.
2. **Given** um código de barras lido com sucesso, **When** a leitura é confirmada, **Then** o produto correspondente é inserido na venda pelo mesmo caminho já usado para leitor físico ou digitação.

---

### Edge Cases

- Quais fluxos não estão disponíveis no layout mobile? A importação de documento pronto para faturamento e a recuperação de uma venda suspensa/com falha de emissão — ambos permanecem exclusivos do layout desktop.
- O pagamento por terminal físico (cartão integrado) está disponível no mobile? Sim — nas mesmas condições do desktop, decididas só pela configuração do ambiente. **Corrigido em 2026-09-03 (AD-144):** a resposta anterior era "não", por supor hardware incompatível com tablet/celular; o usuário revogou essa premissa. O pagamento via PIX segue disponível como sempre.
- Telas de gestão/retaguarda (ex.: sangria, suprimento, fechamento de caixa) estão disponíveis no mobile? Não — permanecem exclusivas do layout desktop.
- Atalhos de teclado pensados para operador com teclado físico/leitor fixo continuam ativos no mobile? Não — são desativados nesse layout, sem equivalente touch necessário.
- Qual o comportamento da leitura de código de barras por câmera em um navegador ou dispositivo sem suporte a essa funcionalidade? A opção fica inteiramente ausente da interface — sem versão desabilitada nem mensagem de indisponibilidade.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST alternar automaticamente entre a apresentação em tela única e a apresentação em etapas, com base no tamanho da tela, sem exigir configuração manual do operador.
- **FR-002**: O sistema MUST preservar exatamente o mesmo estado da venda em andamento ao alternar entre os dois formatos de apresentação, sem perda nem duplicação de dados.
- **FR-003**: No layout mobile, o sistema MUST apresentar a venda em 3 etapas sequenciais: identificação de cliente e adição de produtos; conferência de produtos e forma/condição de pagamento; revisão final e finalização.
- **FR-004**: No layout mobile, o sistema MUST permitir que o operador navegue livremente de volta a qualquer etapa já visitada, a qualquer momento antes da finalização.
- **FR-005**: No layout mobile, o sistema MUST desativar os atalhos de teclado pensados para uso com teclado físico ou leitor fixo.
- **FR-006**: No layout mobile, em um navegador/dispositivo com suporte, o sistema MUST permitir que o operador ative a câmera do dispositivo para ler o código de barras de um produto, como alternativa à digitação ou ao leitor físico.
- **FR-007**: Quando um código de barras é lido com sucesso pela câmera, o sistema MUST inserir o produto correspondente pelo mesmo caminho já usado para entrada via leitor físico ou digitação.
- **FR-008**: O sistema MUST NOT oferecer, no layout mobile, os fluxos de importação de documento pronto para faturamento e de recuperação de venda suspensa/com falha — ambos permanecem exclusivos do desktop.
- **FR-009**: O sistema MUST oferecer no layout mobile as mesmas formas de pagamento e integrações do desktop — inclusive a de terminal físico —, decididas só pela configuração do ambiente, sem nenhuma regra de disponibilidade baseada no layout. **Corrigido em 2026-09-03 (AD-144):** o texto anterior proibia o pagamento por terminal físico no mobile; a proibição foi revogada pelo usuário.
- **FR-010**: O sistema MUST NOT oferecer telas de gestão/retaguarda no layout mobile.
- **FR-011**: Quando o navegador ou dispositivo em uso não suportar a leitura de código de barras pela câmera, o sistema MUST NOT exibir a opção ao operador — nem botão desabilitado, nem mensagem de indisponibilidade; a leitura por câmera fica inteiramente ausente da interface nesses casos.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Nenhuma regra de negócio é duplicada entre os layouts desktop e mobile.
- **SC-002**: O operador nunca perde progresso ao alternar entre etapas já visitadas no mobile.
- **SC-003**: Alternar entre os dois layouts (redimensionamento de tela) nunca perde nem duplica a venda em andamento.

## Assumptions

- O critério de alternância entre os dois layouts é exclusivamente o tamanho da tela, não a capacidade de toque do dispositivo.
- Não está em escopo um aplicativo nativo ou instalável dedicado — é uma experiência web responsiva, na mesma aplicação.
- Busca/cadastro de cliente, inserção/edição/exclusão de item, identificação de vendedor e seleção de forma/condição de pagamento funcionam normalmente no mobile, sujeitos apenas à adaptação de apresentação já descrita — não a regras de negócio diferentes das do desktop.
