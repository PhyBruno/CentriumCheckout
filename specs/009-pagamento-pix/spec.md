# Feature Specification: Pagamento — PIX

**Feature Branch**: `[009-pagamento-pix]`

**Created**: 2026-08-26

**Status**: Draft

**Input**: User description: "O operador precisa gerar uma cobrança PIX e saber quando ela foi aprovada, verificando ativamente o status em vez de depender de uma notificação automática do servidor, podendo trocar de forma de pagamento sem travar a venda caso o PIX fique pendente."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Acompanhar ativamente a aprovação do PIX (Priority: P1)

Como operador de caixa, quero saber quando o pagamento PIX foi aprovado, sem depender de uma notificação automática do servidor.

**Why this priority**: Sem confirmação, a venda não pode ser finalizada com segurança.

**Independent Test**: Pode ser testado gerando uma cobrança PIX e alternando seu status entre pendente e aprovado, confirmando que a mudança é detectada.

**Acceptance Scenarios**:

1. **Given** uma cobrança PIX gerada e exibida ao operador, **When** o pagamento ainda está pendente, **Then** o sistema verifica ativamente o status em intervalos regulares (a cada 10 segundos).
2. **Given** uma cobrança PIX pendente, **When** o pagamento é aprovado, **Then** o sistema detecta a aprovação na consulta seguinte e registra o pagamento na venda.

---

### User Story 2 - Ocultar PIX quando não disponível (Priority: P1)

Como operador de caixa, não quero ver a opção de PIX quando o ambiente não a utiliza.

**Why this priority**: Evita oferecer uma forma de pagamento indisponível.

**Independent Test**: Pode ser testado com o ambiente configurado sem PIX habilitado e confirmando que a opção não aparece na tela de pagamento.

**Acceptance Scenarios**:

1. **Given** o PIX não habilitado para o ambiente, **When** a tela de pagamento é exibida, **Then** a opção de PIX fica oculta ou desabilitada.

---

### User Story 3 - Fechar a cobrança PIX pendente e trocar de forma de pagamento (Priority: P1)

Como operador de caixa, quero poder fechar a tela de PIX mesmo com uma cobrança ainda pendente e trocar por outra forma de pagamento, sem travar a venda.

**Why this priority**: O cliente pode desistir do PIX ou demorar demais — o operador precisa seguir com outra forma sem depender de expiração automática.

**Independent Test**: Pode ser testado gerando uma cobrança PIX, fechando a tela antes da aprovação, confirmando o aviso exibido, e aplicando outra forma de pagamento no lugar.

**Acceptance Scenarios**:

1. **Given** uma cobrança PIX ainda pendente, **When** o operador fecha essa tela, **Then** o sistema avisa que será necessário desassociar essa cobrança manualmente fora do Checkout.
2. **Given** a tela de PIX fechada nesse estado, **When** isso acontece, **Then** o sistema remove essa forma de pagamento da venda local, permitindo que o operador aplique outra no lugar.
3. **Given** uma cobrança PIX abandonada dessa forma, **When** isso acontece, **Then** o sistema não envia nenhuma solicitação automática de cancelamento — a desassociação é sempre manual.

---

### Edge Cases

- Existe algum limite de tempo para uma cobrança PIX pendente expirar automaticamente? Não — a cobrança permanece pendente até ser aprovada ou abandonada manualmente pelo operador.
- O que acontece se o operador tentar gerar uma cobrança PIX abaixo do valor mínimo configurado para o ambiente? O sistema bloqueia a geração antes mesmo de enviar a solicitação.
- Como o valor da cobrança PIX é calculado quando a venda já tem outras formas de pagamento aplicadas (pagamento dividido)? Usa o saldo ainda não coberto da venda, não o total cheio.
- O que acontece quando a própria geração da cobrança PIX falha (diferente de uma falha ao consultar o status depois)? O sistema exibe um erro simples e oferece a opção de tentar novamente.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST verificar ativamente, em intervalos regulares, se uma cobrança PIX gerada foi aprovada, em vez de depender de uma notificação automática do servidor.
- **FR-002**: O sistema MUST verificar o status de uma cobrança PIX pendente a cada 10 segundos.
- **FR-003**: O sistema MUST ocultar ou desabilitar a opção de pagamento PIX quando essa integração não estiver habilitada para o ambiente.
- **FR-004**: O sistema MUST permitir que o operador feche a tela de PIX enquanto uma cobrança ainda está pendente, sem travar a venda.
- **FR-005**: Ao fechar a tela de PIX com uma cobrança pendente, o sistema MUST avisar que será necessário desassociá-la manualmente fora do Checkout.
- **FR-006**: Ao fechar a tela de PIX com uma cobrança pendente, o sistema MUST remover essa forma de pagamento da venda local, permitindo aplicar outra no lugar.
- **FR-007**: O sistema MUST NOT enviar nenhuma solicitação automática de cancelamento para uma cobrança PIX abandonada dessa forma — a desassociação é sempre manual.
- **FR-008**: O sistema MUST exibir ao operador o código para pagamento (QR Code e código "copia e cola") assim que uma cobrança PIX é gerada.
- **FR-009**: O sistema MUST bloquear a geração de uma cobrança PIX abaixo do valor mínimo configurado para o ambiente, validando isso antes de enviar a solicitação.
- **FR-010**: Ao gerar uma cobrança PIX numa venda que já tem outras formas de pagamento aplicadas, o sistema MUST cobrar apenas o saldo ainda não coberto, não o total cheio da venda.
- **FR-011**: Quando a geração da cobrança PIX falhar (diferente de uma falha posterior ao consultar seu status), o sistema MUST exibir um erro simples e oferecer a opção de tentar novamente.

### Key Entities *(include if feature involves data)*

- **Cobrança PIX**: uma solicitação de pagamento gerada para a venda (ou para o saldo restante dela), acompanhada até ser aprovada, ou até ser abandonada manualmente pelo operador.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Nenhuma venda é finalizada com um pagamento PIX que não teve sua aprovação confirmada ativamente.
- **SC-002**: Nenhuma cobrança PIX abandonada pelo operador gera uma solicitação automática de cancelamento.

## Assumptions

- Se o PIX está disponível para o ambiente, e o valor mínimo cobrável, são determinados inteiramente pela configuração do ambiente.
- O comportamento comum a todas as formas de pagamento (carregamento de formas/condições disponíveis, aplicação de vale devolução) e o comportamento específico de pagamento por terminal físico têm especificações próprias, complementares a esta.
