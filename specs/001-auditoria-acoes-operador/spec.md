# Feature Specification: Auditoria de Ações do Operador

**Feature Branch**: `[001-auditoria-acoes-operador]`

**Created**: 2026-08-26

**Status**: Draft

**Input**: User description: "Toda ação relevante do operador durante uma venda (cliente, vendedor, produto, pagamento, finalização/suspensão) precisa ficar rastreável no ERP com data/hora, não só o resultado final da venda — um mecanismo transversal que roda por trás de todas as etapas, sem tela própria."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Registrar evento a cada ação relevante da venda (Priority: P1)

Como operador de caixa, ao realizar qualquer ação relevante da venda (identificar cliente, selecionar vendedor, inserir/alterar/cancelar produto, aplicar pagamento, finalizar ou suspender), quero que ela fique automaticamente registrada com data/hora, sem precisar de nenhuma ação extra minha.

**Why this priority**: É o objetivo central da feature — sem o registro automático de cada ação, não existe rastreabilidade nenhuma para entregar ao ERP.

**Independent Test**: Pode ser testado completando uma venda do início ao fim (trocar cliente, inserir produtos, aplicar pagamento, finalizar) e conferindo que cada uma dessas ações gerou um registro correspondente, em ordem cronológica.

**Acceptance Scenarios**:

1. **Given** uma venda nova sendo iniciada, **When** o operador identifica ou troca o cliente, seleciona ou troca o vendedor, ou insere/altera/cancela um produto, **Then** cada uma dessas ações gera um registro de auditoria com data/hora, sem interação adicional do operador.
2. **Given** uma venda em andamento, **When** o operador aplica ou remove uma condição/forma de pagamento, ou usa um vale devolução, **Then** o sistema registra o evento correspondente.
3. **Given** uma tentativa de pagamento, **When** a forma de pagamento é recusada, **Then** o sistema registra a recusa (não só os pagamentos aceitos).

---

### User Story 2 - Entregar o histórico da venda ao ERP na finalização/suspensão (Priority: P1)

Como Checkout, quero enviar o histórico acumulado da venda ao ERP sempre que ela for finalizada ou suspensa, para que a rastreabilidade não dependa de nenhum armazenamento local permanente.

**Why this priority**: É o único ponto em que o histórico coletado produz efeito real — sem essa entrega, o registro de eventos não tem utilidade nenhuma fora do Checkout.

**Independent Test**: Pode ser testado finalizando uma venda e conferindo que o histórico completo e ordenado daquela sessão chega ao ERP; e suspendendo uma venda, confirmando o mesmo comportamento.

**Acceptance Scenarios**:

1. **Given** uma venda com uma ou mais ações registradas, **When** o operador confirma finalizar ou suspender, **Then** o registro dessa confirmação é adicionado como último evento e o histórico completo da sessão é enviado ao ERP junto com a venda.
2. **Given** uma entrega ao ERP concluída com sucesso, **When** a venda é finalizada ou suspensa, **Then** o histórico local acumulado é descartado junto com os demais dados da venda.

---

### Edge Cases

- O que acontece quando uma venda é retomada a partir de um rascunho, de um documento importado ou de uma nota recuperada? O histórico começa vazio — não há reconstrução de eventos de uma sessão anterior, já que aquele histórico já foi entregue ao ERP no momento em que essa sessão anterior foi suspensa/importada.
- Como o sistema lida com uma falha de rede ao entregar o histórico na finalização/suspensão? O histórico acumulado não é descartado; a própria falha é registrada como evento, e o histórico completo (incluindo a falha) é reenviado na tentativa seguinte, sem reiniciar o acumulado.
- Nenhum evento carrega a identidade de quem operou — a autoria é implícita à sessão autenticada (um operador por sessão); trocas de vendedor ou cliente são o próprio conteúdo do evento, não um metadado de autoria.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST registrar automaticamente um evento com data/hora para cada ação relevante da venda (identificação/troca de cliente, seleção/troca de vendedor, inserção/alteração/cancelamento de produto, aplicação/remoção de forma de pagamento, uso de vale devolução), sem exigir nenhuma ação extra do operador.
- **FR-002**: O sistema MUST registrar o início ou a retomada de uma venda como o primeiro evento da sessão, identificando a origem (venda nova, rascunho retomado, documento importado).
- **FR-003**: O sistema MUST registrar falhas de ações relevantes (pagamento recusado, falha ao finalizar/suspender), não apenas ações bem-sucedidas.
- **FR-004**: O sistema MUST registrar a confirmação de finalização ou suspensão da venda como o último evento antes de montar o envio ao ERP.
- **FR-005**: O sistema MUST entregar ao ERP o histórico completo e ordenado da sessão no momento em que a venda é finalizada ou suspensa.
- **FR-006**: O sistema MUST preservar o histórico acumulado (sem descartá-lo) quando a entrega ao ERP falhar por problema de conectividade, permitindo reenviar o histórico completo numa tentativa seguinte.
- **FR-007**: O sistema MUST descartar o histórico local acumulado somente após uma entrega bem-sucedida ao ERP.
- **FR-008**: O sistema MUST NOT reconstruir ou herdar o histórico de uma sessão anterior quando uma venda é retomada a partir de rascunho ou documento importado — o histórico dessa nova sessão começa vazio.
- **FR-009**: O sistema MUST NOT oferecer, dentro do Checkout, uma tela para o operador revisar o histórico de auditoria — o histórico é destinado exclusivamente ao ERP.

### Key Entities *(include if feature involves data)*

- **Evento de Auditoria**: um registro com data/hora de uma ação relevante da venda, identificado por um tipo (ex.: cliente selecionado, produto inserido, pagamento recusado, venda finalizada) e detalhes específicos daquele tipo de ação.
- **Histórico de Auditoria da Venda**: a coleção ordenada de eventos de auditoria acumulados durante uma única sessão de venda, reiniciada a cada início ou retomada de venda.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% das vendas finalizadas ou suspensas chegam ao ERP acompanhadas do histórico completo das ações relevantes daquela sessão.
- **SC-002**: Nenhum evento de auditoria é perdido permanentemente por falha de conectividade — uma tentativa de entrega malsucedida nunca descarta eventos já registrados.
- **SC-003**: Nenhum histórico entregue ao ERP mistura eventos de mais de uma venda — toda venda nova ou retomada começa com um histórico limpo.

## Assumptions

- A identidade do operador é implícita à sessão autenticada (uma sessão corresponde a um operador) e não é gravada em cada evento individualmente.
- Esta feature não tem interface própria — é um mecanismo de bastidor, sem tela visível ao operador dentro do Checkout.
- Reconstruir o histórico de sessões anteriores da mesma venda (ex.: de uma suspensão prévia) está fora do escopo — cada entrega ao ERP cobre apenas os eventos da sessão atual.
