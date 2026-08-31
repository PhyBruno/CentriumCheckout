# Feature Specification: Finalização e Suspensão da Venda

**Feature Branch**: `[004-finalizacao-suspensao-venda]`

**Created**: 2026-08-26

**Status**: Draft

**Input**: User description: "O operador precisa fechar a venda gerando a nota fiscal, ou suspendê-la (cancelamento em digitação) sem perder rastreabilidade — o rascunho da venda existe do lado do servidor, então suspender não é uma operação puramente local."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Finalizar a venda (Priority: P1)

Como operador de caixa, quero finalizar a venda e receber o documento fiscal pronto para impressão.

**Why this priority**: É o objetivo final de toda venda.

**Independent Test**: Pode ser testado finalizando uma venda criada do zero e uma venda retomada de um rascunho existente, confirmando em ambos os casos que o documento fiscal é emitido corretamente.

**Acceptance Scenarios**:

1. **Given** uma venda com itens e pagamento já aplicados, **When** o operador confirma finalizar, **Then** o sistema emite o documento fiscal correspondente aos itens e ao total já calculados.
2. **Given** um documento fiscal emitido com sucesso, **When** a emissão é confirmada, **Then** o sistema entrega ao operador o documento pronto para impressão.
3. **Given** uma venda que foi retomada a partir de um rascunho já existente, **When** ela é finalizada, **Then** o sistema a trata sob a identidade original desse rascunho, não como uma venda nova.

---

### User Story 2 - Suspender a venda em digitação (Priority: P1)

Como operador de caixa, ao cancelar uma venda em digitação, quero que ela fique suspensa de forma sincronizada, para manter o rascunho consistente entre o Checkout e o restante do sistema.

**Why this priority**: Suspender não pode ser uma operação puramente local — o rascunho da venda precisa continuar existindo do lado do servidor, disponível para retomada posterior.

**Independent Test**: Pode ser testado suspendendo uma venda em digitação e confirmando que o estado local é completamente limpo e que o rascunho fica disponível para retomada.

**Acceptance Scenarios**:

1. **Given** uma venda em digitação, **When** o operador cancela essa venda, **Then** o sistema a suspende de forma sincronizada, mantendo o rascunho disponível para retomada futura.
2. **Given** uma suspensão confirmada, **When** ela é concluída, **Then** o carrinho e qualquer dado de produto em cache daquela venda são completamente limpos.
3. **Given** uma nova venda iniciada logo após uma suspensão ou finalização, **When** ela começa, **Then** nenhum item ou dado de produto da venda anterior é herdado.

---

### Edge Cases

- O que acontece quando o envio da finalização/suspensão falha por problema de conectividade (sem resposta recebida)? O sistema não reenvia automaticamente — exige que o operador confirme manualmente que uma tentativa já foi feita sem retorno, antes de permitir um novo envio, para evitar gerar um documento fiscal duplicado.
- O que acontece quando a venda já tem uma forma de pagamento aprovada que não pode ser removida? Suspender fica bloqueado, pela mesma regra que já bloqueia edição/cancelamento de item nessa situação.
- E quando a venda só tem pagamento(s) aprovado(s) que podem ser removidos? Suspender é permitido normalmente, e esse pagamento continua associado ao rascunho quando ele for retomado depois.
- Como o operador recebe o documento fiscal após a emissão? Automaticamente, por um dentre dois caminhos definidos pela configuração do ambiente do operador — impressão direta, ou disponibilização do documento para visualização/download — sem precisar escolher a cada venda.
- O que acontece se a impressão direta falhar? O sistema avisa o operador e oferece a alternativa de visualizar/baixar o documento, em vez de falhar silenciosamente.
- Quem é registrado como vendedor responsável pela venda finalizada/suspensa? Sempre o vendedor especificamente selecionado para aquela venda, nunca assumido automaticamente como sendo o operador logado.
- O que acontece com o histórico de auditoria da venda (ver feature de auditoria) ao finalizar ou suspender? Ele é entregue junto com o pedido de finalização/suspensão, em ambos os casos.
- O sistema verifica se algo mudou na configuração do operador enquanto ele está com uma venda em digitação? Não — essa verificação só acontece quando não há venda em andamento; havendo carrinho com item ou cliente já identificado, a verificação periódica não ocorre.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST permitir que o operador finalize a venda, emitindo o documento fiscal a partir dos itens e totais já calculados no Checkout.
- **FR-002**: O sistema MUST permitir que o operador suspenda uma venda ainda em digitação, mantendo-a como um rascunho sincronizado do lado do servidor, em vez de simplesmente descartá-la localmente.
- **FR-003**: Ao finalizar ou suspender, o sistema MUST tratar a venda sob a identidade do rascunho original quando ela foi retomada de um rascunho existente, e como uma venda nova quando foi criada do zero no Checkout.
- **FR-004**: O sistema MUST NOT reenviar automaticamente uma solicitação de finalização ou suspensão que falhou por problema de conectividade (sem resposta recebida) — MUST exigir que o operador confirme explicitamente que uma tentativa anterior não teve retorno antes de permitir um novo envio, para evitar gerar um documento fiscal duplicado.
- **FR-005**: O sistema MUST bloquear a suspensão de uma venda que já tenha uma forma de pagamento aprovada não removível, usando a mesma regra que bloqueia edição/cancelamento de item nessa situação.
- **FR-006**: O sistema MUST permitir suspender uma venda quando os únicos pagamentos aplicados forem removíveis, e MUST preservar esse pagamento quando o rascunho for retomado posteriormente.
- **FR-007**: Ao finalizar com sucesso, o sistema MUST entregar ao operador o documento fiscal pronto para impressão.
- **FR-008**: O sistema MUST decidir automaticamente, com base na configuração do ambiente do operador, se o documento fiscal é impresso diretamente ou disponibilizado para visualização/download, sem exigir que o operador escolha a cada venda.
- **FR-009**: Quando a impressão direta falhar, o sistema MUST avisar o operador e oferecer a alternativa de visualizar/baixar o documento, em vez de falhar silenciosamente.
- **FR-010**: O sistema MUST registrar, em toda venda finalizada ou suspensa, o vendedor especificamente selecionado para aquela venda, nunca assumindo silenciosamente o operador logado como vendedor.
- **FR-011**: O sistema MUST incluir, em toda solicitação de finalização ou suspensão, o histórico de auditoria completo acumulado durante aquela sessão de venda.
- **FR-012**: Ao finalizar ou suspender com sucesso, o sistema MUST descartar por completo o estado local da venda (carrinho e qualquer dado de produto em cache), garantindo que a próxima venda nunca herde dados da anterior.
- **FR-013**: O sistema MUST verificar periodicamente, apenas enquanto nenhuma venda estiver em andamento, se a configuração do operador mudou, atualizando-a localmente quando necessário.
- **FR-014**: O sistema MUST NOT emitir o documento fiscal sem um veredito favorável vigente da validação prévia da venda (feature 014), ainda que o total esteja coberto; e MUST NOT repetir essa validação no momento da finalização — vale o veredito obtido na última inserção de pagamento aceita (AD-113).
- **FR-015**: O sistema MUST produzir a representação da venda enviada ao ERP por um **único** mecanismo, compartilhado entre a validação prévia, a finalização e a suspensão, de modo que a venda validada e a venda emitida nunca possam divergir (AD-111).
- **FR-016**: A suspensão da venda MUST NOT depender da validação prévia — suspender não emite documento fiscal.

### Key Entities *(include if feature involves data)*

- **Venda**: a transação em digitação sendo finalizada ou suspensa, com seus itens, vendedor, cliente, pagamentos e histórico de auditoria.
- **Documento Fiscal**: o documento emitido ao finalizar a venda com sucesso, entregue pronto para impressão ou visualização.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Nenhuma venda finalizada sai sem o histórico de auditoria completo.
- **SC-002**: Nenhuma suspensão deixa o rascunho do lado do servidor divergente do que o operador via no Checkout.
- **SC-003**: Nenhuma finalização gera documento fiscal duplicado, mesmo após uma falha de rede.

## Assumptions

- Cancelar um documento fiscal já autorizado, reimprimir um documento já emitido anteriormente e imprimir comprovantes de pagamento por terminal (TEF) ou de duplicata estão fora do escopo desta feature — ela cobre apenas uma venda ainda em digitação, até sua finalização ou suspensão.
- O caminho de entrega do documento fiscal (impressão direta vs. disponibilização para visualização/download) é definido pela configuração do ambiente do operador, não por uma preferência alterável dentro do fluxo de venda.
