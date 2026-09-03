# Feature Specification: Pagamento (Geral)

**Feature Branch**: `[008-pagamento-geral]`

**Created**: 2026-08-26

**Status**: Draft

**Input**: User description: "O operador precisa ver as formas/condições de pagamento disponíveis e aplicá-las na venda — incluindo split entre múltiplas formas, troco em dinheiro, desconto manual e uso de vale devolução — roteando automaticamente para a integração correta quando aplicável, sem depender de revalidação redundante na finalização. Comportamento específico de PIX e de pagamento por terminal físico têm especificações próprias."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ver formas e condições de pagamento disponíveis (Priority: P1)

Como operador de caixa, quero ver as formas e condições de pagamento disponíveis para aplicar na venda.

**Why this priority**: Sem isso a venda não pode ser finalizada.

**Independent Test**: Pode ser testado abrindo a tela de pagamento e confirmando que as formas disponíveis aparecem, e que uma forma desativada para o ambiente não aparece.

**Acceptance Scenarios**:

1. **Given** o operador abre a etapa de pagamento, **When** a tela carrega, **Then** as formas e condições de pagamento disponíveis para a empresa são exibidas.
2. **Given** a integração de pagamento por terminal físico desativada para o ambiente, **When** a tela de pagamento é exibida, **Then** essa opção fica oculta ou desabilitada.
3. **Given** a integração de PIX desativada para o ambiente, **When** a tela de pagamento é exibida, **Then** essa opção fica oculta ou desabilitada.

---

### User Story 2 - Roteamento automático para a integração correta (Priority: P1)

Como Checkout, quero identificar a integração correta a partir da forma de pagamento selecionada, para chamar o pagamento por terminal físico ou PIX somente quando aplicável.

**Why this priority**: Cada forma de pagamento com integração externa (terminal físico, PIX dinâmico) só deve ser confirmada como aplicada depois de aprovada por essa integração — aplicar antes disso seria registrar um pagamento que ainda pode não se confirmar.

**Independent Test**: Pode ser testado selecionando diferentes formas de pagamento e confirmando que só as que dependem de terminal físico chamam essa integração, só o PIX dinâmico chama o fluxo de PIX, e as demais seguem direto sem integração externa.

**Acceptance Scenarios**:

1. **Given** uma forma de pagamento por cartão com a integração de terminal físico ativa, **When** o operador a seleciona, **Then** o sistema aciona essa integração e só registra o pagamento após a aprovação dela.
2. **Given** a forma de pagamento PIX dinâmico com a integração ativa, **When** o operador a seleciona, **Then** o sistema aciona o fluxo de PIX e só registra o pagamento após a confirmação.
3. **Given** uma forma de pagamento que não depende de nenhuma integração externa, **When** o operador a seleciona, **Then** o sistema segue o fluxo normal, sem acionar nenhuma integração.
4. **Given** o layout mobile, **When** o operador aplica um pagamento por cartão, **Then** o sistema aciona a integração de terminal físico exatamente como no desktop, se a configuração do ambiente a habilitar; o PIX continua disponível normalmente. **Corrigido em 2026-09-03 (AD-144):** este cenário exigia o oposto — que a integração nunca fosse acionada no mobile.

---

### User Story 3 - Aplicar vale devolução (Priority: P2)

Como operador de caixa, quero aplicar um vale devolução em uma forma de pagamento elegível, sem validação redundante na finalização.

**Why this priority**: Cenário frequente, mas não bloqueia o fluxo mínimo de venda com pagamento normal.

**Independent Test**: Pode ser testado aplicando um vale devolução numa forma elegível e numa não elegível, confirmando bloqueio apenas na segunda, e confirmando que a finalização não pede validação de novo.

**Acceptance Scenarios**:

1. **Given** um vale devolução informado pelo operador, **When** a forma de pagamento selecionada é elegível para recebê-lo, **Then** o sistema aplica o valor do vale à venda.
2. **Given** uma venda com vale devolução já aplicado, **When** a venda é finalizada, **Then** o sistema não pede validação novamente — o vale já foi consumido no momento da aplicação.
3. **Given** uma forma de pagamento sem elegibilidade explicitamente configurada para vale devolução, **When** o operador tenta aplicar o vale, **Then** o sistema trata essa forma como elegível por padrão, em vez de bloquear.

---

### User Story 4 - Dividir pagamento entre várias formas e calcular troco (Priority: P1)

Como operador de caixa, quero aplicar múltiplas formas de pagamento na mesma venda e ver o troco calculado automaticamente quando o cliente paga em dinheiro acima do total, para fechar a venda com o valor exato recebido.

**Why this priority**: Dividir o pagamento entre formas é operação comum no ponto de venda físico; sem cálculo de troco correto, a venda não pode ser finalizada com segurança.

**Independent Test**: Pode ser testado aplicando duas formas de pagamento diferentes até cobrir o total da venda; aplicando dinheiro acima do total e conferindo o troco calculado; e tentando aplicar uma segunda forma "dinheiro" na mesma venda, confirmando o bloqueio.

**Acceptance Scenarios**:

1. **Given** uma venda com total pendente, **When** o operador aplica mais de uma forma de pagamento, **Then** os valores aplicados são somados até cobrir o total.
2. **Given** um pagamento em dinheiro que excede o total (ou o saldo restante, em uma divisão), **When** o valor é informado, **Then** o sistema calcula e exibe o troco; **Given** um pagamento em cartão ou PIX, **When** ele é aplicado, **Then** nenhum troco é calculado.
3. **Given** uma forma "dinheiro" já aplicada na venda, **When** o operador tenta aplicar outra forma "dinheiro", **Then** o sistema bloqueia a inserção e avisa que já existe uma forma "dinheiro" aplicada.

---

### User Story 5 - Desconto manual em item ou na venda (Priority: P1)

Como operador de caixa, quero aplicar desconto direto em um item ou no total da venda, sem precisar de autorização, para agilizar negociações simples de preço.

**Why this priority**: Desconto manual é operação frequente no balcão, sem depender de aprovação de supervisor.

**Independent Test**: Pode ser testado aplicando um desconto percentual e um desconto em valor fixo sobre o total de uma venda com itens cujo total não divide exatamente, confirmando que o desconto é distribuído entre os itens sem perda de centavos.

**Acceptance Scenarios**:

1. **Given** um item no carrinho, **When** o operador aplica um desconto direto nele, **Then** o sistema aceita o valor informado, sem teto e sem exigir autorização.
2. **Given** uma venda com itens, **When** o operador aplica um desconto sobre o total (em percentual ou valor fixo, à escolha dele), **Then** o sistema aceita o desconto sem teto e sem autorização.
3. **Given** um desconto aplicado ao total da venda, **When** a venda é enviada para finalização, **Then** o desconto é distribuído entre os itens da venda, com qualquer sobra de centavo distribuída um centavo por vez aos itens com maior parte fracionária descartada.

---

### Edge Cases

- Como o sistema distingue, dentro dos pagamentos por cartão, entre um cartão integrado ao terminal físico e um cartão avulso (fora dessa integração)? Essa informação está disponível por forma de pagamento configurada para a empresa, permitindo esse refinamento quando necessário.
- O que acontece quando uma forma de pagamento é aplicada ou removida, um vale devolução é usado, ou um pagamento é recusado? O sistema registra o evento correspondente no histórico de auditoria da venda (ver feature de auditoria de ações do operador).
- O sistema imprime algum documento para uma forma de pagamento por nota promissória/duplicata? Não — não há requisito de impressão associado a esse tipo de pagamento.
- O que acontece quando o ERP recusa a venda no momento da inserção (limite de crédito, crédito bloqueado, venda a prazo para cliente não identificado)? A inserção não acontece, a venda fica intacta e o motivo devolvido pelo ERP é exibido ao operador — regra completa na feature 014 (validação prévia da venda), acionada por `FR-019`.
- E quando o ERP aceita a venda mas devolve um aviso? A inserção acontece normalmente e o aviso é exibido sem bloquear — a severidade da mensagem **não** decide bloqueio, só o veredito do ERP decide (AD-110).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST carregar e exibir, ao abrir a etapa de pagamento, as formas e condições de pagamento disponíveis para a empresa do operador.
- **FR-002**: O sistema MUST ocultar ou desabilitar a opção de pagamento por terminal físico quando essa integração não estiver habilitada para o ambiente.
- **FR-003**: O sistema MUST ocultar ou desabilitar a opção de pagamento PIX quando essa integração não estiver habilitada para o ambiente.
- **FR-004**: O sistema MUST rotear automaticamente um pagamento por cartão para a integração de terminal físico quando ela estiver habilitada e aplicável, e MUST só registrar esse pagamento após a aprovação dessa integração.
- **FR-005**: O sistema MUST rotear automaticamente um pagamento por PIX dinâmico para sua integração dedicada quando aplicável, consultando seu status periodicamente, e MUST só registrar esse pagamento após a confirmação.
- **FR-006**: O sistema MUST NOT rotear uma forma de PIX estático para a integração de PIX dinâmico automaticamente.
- **FR-007**: O sistema MUST rotear as integrações de pagamento sem considerar o layout — a integração de terminal físico e o PIX MUST estar disponíveis no mobile nas mesmas condições do desktop, decididas só pela configuração do ambiente. **Corrigido em 2026-09-03 (AD-144):** o texto anterior proibia a integração de terminal físico no mobile.
- **FR-008**: O sistema MUST permitir que o operador aplique um vale devolução a uma forma de pagamento elegível.
- **FR-009**: O sistema MUST NOT revalidar um vale devolução na finalização da venda — ele é validado e consumido uma única vez, no momento da aplicação.
- **FR-010**: O sistema MUST tratar uma forma de pagamento sem elegibilidade de vale devolução explicitamente configurada como elegível por padrão, em vez de bloqueá-la.
- **FR-011**: O sistema MUST permitir que o operador aplique mais de uma forma de pagamento na mesma venda, somando os valores aplicados até cobrir o total.
- **FR-012**: O sistema MUST calcular e exibir troco somente quando a forma de pagamento é dinheiro e o valor recebido excede o total (ou o saldo restante, em uma divisão de pagamento); nenhuma outra forma de pagamento MUST gerar troco calculado.
- **FR-013**: O sistema MUST bloquear a aplicação de uma segunda forma "dinheiro" na mesma venda, avisando o operador de que já existe uma aplicada.
- **FR-014**: O sistema MUST permitir que o operador aplique um desconto manual diretamente em um item do carrinho, sem teto de valor e sem exigir autorização adicional.
- **FR-015**: O sistema MUST permitir que o operador aplique um desconto manual sobre o total da venda, em percentual ou valor fixo à sua escolha, sem teto de valor e sem exigir autorização adicional.
- **FR-016**: Ao aplicar um desconto sobre o total da venda, o sistema MUST distribuir esse valor entre os itens da venda, usando arredondamento em centavos inteiros com qualquer sobra distribuída um centavo por vez aos itens com maior parte fracionária descartada, da maior para a menor.
- **FR-017**: O sistema MUST registrar, no histórico de auditoria da venda, toda aplicação ou remoção de forma/condição de pagamento, todo uso de vale devolução e todo pagamento recusado.
- **FR-018**: O sistema MUST NOT gerar nem oferecer um documento impresso para uma forma de pagamento que representa uma nota promissória/duplicata.
- **FR-019**: O sistema MUST submeter toda inserção de forma/condição de pagamento à validação prévia da venda no ERP (feature 014) **antes** de efetivar a inserção, e MUST NOT aplicar o pagamento nem acionar qualquer integração externa enquanto não houver veredito favorável. Isso vale para **cada** forma de um pagamento dividido — a segunda e as seguintes são validadas de novo, com as formas já aplicadas somadas à candidata, porque acrescentar uma forma pode inverter o desfecho (`FR-011`).
- **FR-020**: O sistema MUST aplicar primeiro as suas próprias validações locais (venda sem itens, saldo em aberto zerado, segunda forma "dinheiro", desconto acima do subtotal) e MUST NOT consultar o ERP quando o gesto já for recusado localmente.
- **FR-021**: Ao remover uma forma de pagamento aplicada, o sistema MUST invalidar o veredito de validação vigente, de modo que a próxima inserção seja validada de novo.
- **FR-022**: O sistema MUST carregar, para cada forma de pagamento do catálogo da sessão, a indicação de **entrada** (`FormaEntrada`/`FpgEnt`) além da elegibilidade de crediário, e MUST enviá-la em cada forma do retrato da venda — sem esse campo o ERP não consegue avaliar o crediário e a validação prévia aprova vendas que deveria barrar (AD-111).
- **FR-023**: Enquanto houver qualquer forma de pagamento aplicada à venda, o sistema MUST bloquear a alteração do carrinho, do cliente, do vendedor e do desconto sobre o total; alterar qualquer um deles MUST exigir a remoção prévia da forma aplicada (AD-113).

### Key Entities *(include if feature involves data)*

- **Forma de Pagamento**: um meio que o operador pode aplicar à venda (dinheiro, cartão, PIX, vale, etc.), cada uma com suas próprias regras de elegibilidade e comportamento.
- **Pagamento Aplicado**: um valor aplicado à venda sob uma forma específica, podendo fazer parte de uma divisão entre múltiplas formas.
- **Vale Devolução**: um crédito que o cliente pode aplicar a uma condição de pagamento elegível.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um vale devolução nunca bloqueia a finalização por exigir validação redundante.
- **SC-002**: Troco só é calculado para um pagamento em dinheiro que excede o valor devido.
- **SC-003**: Nenhuma venda tem mais de uma forma "dinheiro" aplicada.

## Assumptions

- Quais formas de pagamento são roteadas para a integração de terminal físico ou de PIX dinâmico, e se essas integrações estão habilitadas, é determinado inteiramente pela configuração do ambiente — o Checkout segue essa configuração em vez de decidir isso localmente.
- O comportamento específico do fluxo de PIX dinâmico (geração, consulta de status) e do fluxo de terminal físico têm especificações próprias, complementares a esta.
