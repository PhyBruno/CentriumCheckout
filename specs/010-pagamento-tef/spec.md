# Feature Specification: Pagamento — TEF

**Feature Branch**: `[010-pagamento-tef]`

**Created**: 2026-08-26

**Status**: Draft

**Input**: User description: "O operador precisa aplicar uma forma de pagamento cobrada no terminal físico do ponto de venda — uma vez aprovada, ela fica travada na venda; a opção só aparece quando o ambiente a utiliza, e não está disponível no layout mobile."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Aplicar pagamento cobrado no terminal físico (Priority: P1)

Como operador de caixa, quero aplicar uma forma de pagamento que é cobrada diretamente no terminal físico do ponto de venda.

**Why this priority**: É uma das formas de pagamento centrais no ponto de venda físico — sem ela, o operador não consegue receber por cartão através do terminal.

**Independent Test**: Pode ser testado aplicando esse pagamento numa venda e confirmando que, uma vez aprovado no terminal, ele fica registrado na venda e não pode mais ser removido.

**Acceptance Scenarios**:

1. **Given** uma venda com valor pendente, **When** o operador aplica o pagamento pelo terminal físico e ele é aprovado, **Then** o valor é registrado na venda.
2. **Given** um pagamento pelo terminal já aprovado na venda, **When** o operador tenta removê-lo, **Then** o sistema não permite — qualquer reversão precisa ser feita diretamente no terminal físico, fora do Checkout.

---

### User Story 2 - Ocultar a opção quando não disponível (Priority: P1)

Como operador de caixa, não quero ver a opção de pagamento pelo terminal físico quando o ambiente não a utiliza.

**Why this priority**: Evita oferecer uma forma de pagamento indisponível.

**Independent Test**: Pode ser testado com o ambiente configurado sem essa integração habilitada e confirmando que a opção não aparece na tela de pagamento.

**Acceptance Scenarios**:

1. **Given** o pagamento pelo terminal físico não habilitado para o ambiente, **When** a tela de pagamento é exibida, **Then** essa opção fica oculta ou desabilitada.

---

### Edge Cases

- O que acontece com uma venda que já tem um pagamento pelo terminal físico aprovado, se o operador tentar suspendê-la? A suspensão fica bloqueada — a mesma regra que impede remover esse pagamento também impede suspender a venda.
- O Checkout imprime algum comprovante para esse pagamento? Não — o comprovante é emitido pelo próprio terminal físico.
- Essa forma de pagamento está disponível no layout mobile? Não — depende de um terminal físico conectado ao ponto de venda, sem equivalente para uso em tablet/celular, independentemente da configuração do ambiente.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST permitir que o operador aplique um pagamento cobrado através do terminal físico conectado ao ponto de venda.
- **FR-002**: O sistema MUST ocultar ou desabilitar a opção de pagamento pelo terminal físico quando essa integração não estiver habilitada para o ambiente.
- **FR-003**: Uma vez que um pagamento pelo terminal físico é aprovado, o sistema MUST NOT permitir a remoção desse pagamento da venda.
- **FR-004**: O sistema MUST bloquear a suspensão de uma venda que tenha um pagamento pelo terminal físico já aprovado.
- **FR-005**: O sistema MUST NOT imprimir nenhum comprovante para um pagamento aprovado pelo terminal físico — essa responsabilidade é do próprio terminal.
- **FR-006**: O sistema MUST NOT oferecer nem tentar esse pagamento no layout mobile, independentemente da configuração do ambiente.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Nenhum pagamento pelo terminal físico já cobrado é removido de uma venda sem passar pelo próprio terminal.
- **SC-002**: Nenhuma venda com pagamento pelo terminal físico aprovado é suspensa.

## Assumptions

- O mecanismo técnico de comunicação com o terminal físico (protocolo, formato de mensagem, tratamento de timeout/erro) está deliberadamente fora do escopo desta especificação — será definido separadamente, já que o parceiro de integração atual está previsto para ser trocado.
- O comportamento comum a todas as formas de pagamento e o comportamento específico de PIX têm especificações próprias, complementares a esta.
