# Feature Specification: Recuperação de NFCe

**Feature Branch**: `[011-recuperacao-nfce]`

**Created**: 2026-08-26

**Status**: Draft

**Input**: User description: "Além de criar uma venda do zero ou importar um documento pronto, o operador precisa poder retomar um rascunho de venda já suspenso anteriormente, sem redigitar os itens e pagamentos já lançados."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Listar e selecionar rascunho para retomada (Priority: P1)

Como operador de caixa, quero ver a lista de rascunhos de venda suspensos e escolher um para retomar.

**Why this priority**: Ponto de entrada do fluxo — sem lista, não há retomada.

**Independent Test**: Pode ser testado abrindo a lista de rascunhos e confirmando que ela aparece, com busca por nome de cliente ou vendedor funcionando.

**Acceptance Scenarios**:

1. **Given** o operador abre a lista de rascunhos, **When** ela carrega, **Then** os rascunhos disponíveis para retomada são exibidos.
2. **Given** a lista exibida, **When** o operador busca por nome de cliente ou de vendedor, **Then** a lista é filtrada pelos rascunhos correspondentes.

---

### User Story 2 - Retomar rascunho para o carrinho (Priority: P1)

Como operador de caixa, ao selecionar um rascunho, quero que os itens, pagamentos e a identidade original da venda já venham preenchidos, para só revisar e continuar.

**Why this priority**: Elimina redigitação manual de uma venda já iniciada e suspensa anteriormente.

**Independent Test**: Pode ser testado retomando um rascunho com itens e uma forma de pagamento já registrados, confirmando que o carrinho reflete exatamente esses dados sem recálculo, e que a venda finalizada depois mantém a identidade original do rascunho.

**Acceptance Scenarios**:

1. **Given** um rascunho selecionado na lista, **When** o operador confirma a retomada, **Then** o carrinho é preenchido com os itens, formas de pagamento, cliente e vendedor já registrados nesse rascunho.
2. **Given** um rascunho retomado, **When** a venda é finalizada ou suspensa novamente, **Then** ela mantém a identidade original desse rascunho, não uma identidade nova.
3. **Given** um item vindo do rascunho, **When** ele entra no carrinho, **Then** seu preço é preservado exatamente como estava salvo, sem recálculo automático.
4. **Given** um item que já veio do rascunho, **When** o operador o reinsere manualmente depois da retomada, **Then** o sistema recalcula o preço normalmente para esse item, como faria para uma inserção comum.
5. **Given** um rascunho que já tem um vendedor registrado, **When** ele é retomado, **Then** esse vendedor é pré-selecionado automaticamente.

---

### Edge Cases

- É possível buscar um rascunho pelo número da venda? Não — a busca só filtra por nome de cliente ou nome de vendedor.
- A lista de rascunhos mostra vendas suspensas de qualquer período? Não — mostra apenas rascunhos ainda em aberto dentro de uma janela recente de tempo, consistente com o que o sistema de origem disponibiliza.
- O que acontece quando dois operadores tentam retomar o mesmo rascunho ao mesmo tempo? Não há nenhum bloqueio implementado no Checkout para impedir isso — a resolução desse conflito é responsabilidade do sistema de origem dos rascunhos.
- O que acontece com uma forma de pagamento removível já aplicada a uma venda retomada, se ela for suspensa de novo? Ela permanece associada, disponível na próxima retomada.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST permitir que o operador visualize uma lista de rascunhos de venda suspensos disponíveis para retomada.
- **FR-002**: O sistema MUST permitir que o operador busque nessa lista por nome de cliente ou nome de vendedor.
- **FR-003**: O sistema MUST restringir a lista a rascunhos ainda em aberto dentro de uma janela recente de tempo, consistente com o que o sistema de origem disponibiliza.
- **FR-004**: O sistema MUST permitir que o operador selecione um rascunho da lista para retomá-lo.
- **FR-005**: Ao retomar um rascunho, o sistema MUST preencher o carrinho com todos os itens, formas de pagamento, cliente e vendedor já registrados nesse rascunho.
- **FR-006**: Ao retomar um rascunho, o sistema MUST preservar a identidade original da venda, usando-a novamente quando essa venda retomada for finalizada ou suspensa.
- **FR-007**: Ao retomar um rascunho, o sistema MUST preservar o preço de cada item exatamente como salvo no rascunho, sem disparar recálculo automático.
- **FR-008**: O sistema MUST disparar o recálculo normal de preço para um item que o operador reinsere manualmente depois de retomar o rascunho, mesmo que esse item já estivesse presente no rascunho retomado.
- **FR-009**: Ao retomar um rascunho que já tem um vendedor registrado, o sistema MUST pré-selecionar esse vendedor automaticamente.
- **FR-010**: O sistema MUST NOT implementar nenhum mecanismo de bloqueio para impedir que dois operadores retomem o mesmo rascunho concorrentemente.

### Key Entities *(include if feature involves data)*

- **Rascunho de Venda Suspenso**: uma venda suspensa anteriormente, disponível para retomada, carregando seus itens, preços, pagamentos, cliente, vendedor e identidade originais.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Nenhum dado de um rascunho retomado é redigitado manualmente pelo operador.
- **SC-002**: O preço de um item retomado nunca diverge do valor salvo no rascunho, exceto após uma reinserção explícita do operador.
- **SC-003**: Uma venda retomada segue exatamente as mesmas regras de pagamento e finalização de uma venda criada do zero.

## Assumptions

- Buscar um rascunho pelo número da venda não é suportado nesta versão — apenas nome de cliente e nome de vendedor.
- Esta feature é exclusiva do layout desktop — não há equivalente no layout mobile.
- Resolver um conflito entre dois operadores retomando o mesmo rascunho é responsabilidade do sistema de origem dos rascunhos, não do Checkout.
- O mecanismo usado para importar um documento pronto para faturamento (ver feature própria) reaproveita este mesmo comportamento de retomada (preservação de preço, identidade da venda, pré-seleção de vendedor).
