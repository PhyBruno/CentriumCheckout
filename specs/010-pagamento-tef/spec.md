# Feature Specification: Pagamento — TEF

**Feature Branch**: `[010-pagamento-tef]`

**Created**: 2026-08-26

**Status**: Draft

**Input**: User description: "O operador precisa aplicar uma forma de pagamento cobrada no terminal físico do ponto de venda — uma vez aprovada, ela fica travada na venda; a opção só aparece quando o ambiente a utiliza." **Revisado em 2026-09-03 (AD-144):** a descrição original terminava com "e não está disponível no layout mobile" — essa restrição foi revogada pelo usuário e não vale mais. **Revisado em 2026-09-04 (AD-162):** "travada na venda" deixou de significar "sem saída nenhuma" — o operador pode cancelar a transação, mas o cancelamento passa por um endpoint do ERP com confirmação por sondagem, nunca por um "remover" direto na UI. Ver User Story 3.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Aplicar pagamento cobrado no terminal físico (Priority: P1)

Como operador de caixa, quero aplicar uma forma de pagamento que é cobrada diretamente no terminal físico do ponto de venda.

**Why this priority**: É uma das formas de pagamento centrais no ponto de venda físico — sem ela, o operador não consegue receber por cartão através do terminal.

**Independent Test**: Pode ser testado aplicando esse pagamento numa venda e confirmando que, uma vez aprovado no terminal, ele fica registrado na venda e não pode mais ser removido.

**Acceptance Scenarios**:

1. **Given** uma venda com valor pendente, **When** o operador aplica o pagamento pelo terminal físico e ele é aprovado, **Then** o valor é registrado na venda.
2. **Given** um pagamento pelo terminal já aprovado na venda, **When** o operador tenta removê-lo diretamente (um "remover" na lista de pagamentos), **Then** o sistema não permite — a única reversão possível é o cancelamento pelo ERP da User Story 3, nunca um "remover" que tira a forma da tela sem mais nada. **Corrigido em 2026-09-04 (AD-162):** a redação anterior concluía que "qualquer reversão precisa ser feita diretamente no terminal físico, fora do Checkout" — o usuário informa que **existe**, sim, um caminho de reversão pelo Checkout (User Story 3); o que continua verdadeiro é só que não há um clique isolado de "remover".

---

### User Story 2 - Ocultar a opção quando não disponível (Priority: P1)

Como operador de caixa, não quero ver a opção de pagamento pelo terminal físico quando o ambiente não a utiliza.

**Why this priority**: Evita oferecer uma forma de pagamento indisponível.

**Independent Test**: Pode ser testado com o ambiente configurado sem essa integração habilitada e confirmando que a opção não aparece na tela de pagamento.

**Acceptance Scenarios**:

1. **Given** o pagamento pelo terminal físico não habilitado para o ambiente, **When** a tela de pagamento é exibida, **Then** essa opção fica oculta ou desabilitada.

---

### User Story 3 - Cancelar uma transação já aprovada, pelo ERP (Priority: P2)

**Adicionada em 2026-09-04 (AD-162), pedido direto do usuário.**

Como operador de caixa, quero poder cancelar uma transação pelo terminal físico que já foi aprovada, sabendo que o Checkout confirma o cancelamento com o ERP antes de liberar a venda.

**Why this priority**: Sem isso, um pagamento aprovado por engano (valor errado, cliente desistiu) trava a venda para sempre — a única saída seria abandoná-la sem nenhum documento fiscal. É P2, e não P1, porque a venda continua operável sem este caminho (só fica presa no caso de engano, que não é o fluxo comum).

**Independent Test**: Bloqueado até os dois endpoints do ERP (solicitação de cancelamento e confirmação) estarem especificados no contrato — ver Assumptions.

**Acceptance Scenarios**:

1. **Given** um pagamento pelo terminal físico já aprovado na venda, **When** o operador solicita o cancelamento, **Then** o sistema chama um endpoint do ERP dedicado a essa operação — não um cancelamento que aconteça só no terminal, sem o ERP saber.
2. **Given** um cancelamento solicitado, **When** o Checkout aguarda a confirmação, **Then** o sistema sonda ativamente um segundo endpoint do ERP até obter a confirmação, com a mesma mecânica de polling já usada pelo PIX (intervalo fixo, sem SSE, sem estratégia de backoff).
3. **Given** a confirmação de cancelamento recebida, **When** o Checkout processa a resposta, **Then** a forma sai da venda, liberando-a para receber outra forma de pagamento ou ser suspensa.
4. **Given** um cancelamento ainda não confirmado pelo ERP, **When** o operador tenta remover a forma ou suspender a venda por qualquer outro caminho, **Then** o sistema recusa — a forma permanece irremovível e a venda permanece bloqueada até a confirmação chegar (User Story 1, cenário 2, e Edge Case de suspensão abaixo).

---

### Edge Cases

- O que acontece com uma venda que já tem um pagamento pelo terminal físico aprovado, se o operador tentar suspendê-la? A suspensão fica bloqueada — a mesma regra que impede remover esse pagamento também impede suspender a venda. **A única saída passa a ser o cancelamento da User Story 3 (2026-09-04, AD-162):** confirmado o cancelamento pelo ERP, a forma sai da venda e a suspensão deixa de estar bloqueada. Antes de AD-162 não havia saída nenhuma pelo Checkout — só o operador desfazer a cobrança diretamente no terminal, sem o ERP ficar sabendo.
- O Checkout imprime algum comprovante para esse pagamento? Não — o comprovante é emitido pelo próprio terminal físico.
- Essa forma de pagamento está disponível no layout mobile? Sim — nas mesmas condições do desktop, decididas só pela configuração do ambiente. **Corrigido em 2026-09-03 (AD-144 em `.specs/project/STATE.md`):** a resposta anterior era "não", por supor que o terminal físico não tem equivalente em tablet/celular; o usuário informa que o dispositivo móvel também pode alcançá-lo.
- O cancelamento da User Story 3 e o "mecanismo técnico de comunicação com o terminal físico" das Assumptions são a mesma coisa? Não. O cancelamento fala com o **ERP** (dois endpoints HTTP, mesma família de `GerarPIX`/`StatusPIX`); o mecanismo em Assumptions é sobre como o Checkout invoca o **terminal** para cobrar (protocolo proprietário do parceiro de TEF). São bloqueios distintos, com motivos distintos — ver Assumptions.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST permitir que o operador aplique um pagamento cobrado através do terminal físico conectado ao ponto de venda.
- **FR-002**: O sistema MUST ocultar ou desabilitar a opção de pagamento pelo terminal físico quando essa integração não estiver habilitada para o ambiente.
- **FR-003**: Uma vez que um pagamento pelo terminal físico é aprovado, o sistema MUST NOT permitir a remoção **direta** desse pagamento da venda — a única saída é o cancelamento de `FR-007`/`FR-008`.
- **FR-004**: O sistema MUST bloquear a suspensão de uma venda que tenha um pagamento pelo terminal físico já aprovado, **até que o cancelamento de `FR-007`/`FR-008` seja confirmado pelo ERP**.
- **FR-005**: O sistema MUST NOT imprimir nenhum comprovante para um pagamento aprovado pelo terminal físico — essa responsabilidade é do próprio terminal.
- **FR-006**: O sistema MUST oferecer e tentar esse pagamento no layout mobile nas mesmas condições do desktop — a disponibilidade depende só da configuração do ambiente, nunca do layout. **Corrigido em 2026-09-03 (AD-144):** o texto anterior proibia esse pagamento no mobile; o usuário revogou a proibição.
- **FR-007** *(adicionado em 2026-09-04, AD-162)*: O sistema MUST, ao solicitar o cancelamento de um pagamento pelo terminal físico já aprovado, chamar um endpoint dedicado do ERP para essa operação.
- **FR-008** *(adicionado em 2026-09-04, AD-162)*: O sistema MUST, depois de solicitar o cancelamento, sondar ativamente um endpoint do ERP até confirmar que o cancelamento foi de fato efetivado, usando a mesma mecânica de polling já especificada para o PIX (intervalo fixo, sem SSE).
- **FR-009** *(adicionado em 2026-09-04, AD-162)*: O sistema MUST, ao confirmar o cancelamento (`FR-008`), remover a forma da venda e liberar tanto a inserção de outra forma quanto a suspensão da venda (revoga o bloqueio de `FR-003`/`FR-004` para aquele pagamento específico).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Nenhum pagamento pelo terminal físico já cobrado é removido de uma venda sem passar pelo fluxo de cancelamento (`FR-007`–`FR-009`) — nunca por um "remover" direto e nunca só pelo terminal, sem o ERP confirmar.
- **SC-002**: Nenhuma venda com pagamento pelo terminal físico aprovado é suspensa **enquanto o cancelamento não for confirmado**.

## Assumptions

- O mecanismo técnico de comunicação com o terminal físico (protocolo, formato de mensagem, tratamento de timeout/erro **da própria cobrança**) está deliberadamente fora do escopo desta especificação — será definido separadamente, já que o parceiro de integração atual está previsto para ser trocado (AD-037). **Este bloqueio não cobre o cancelamento da User Story 3** (2026-09-04, AD-162): aquele fala com o ERP por HTTP, não com o terminal por um protocolo proprietário — são dois assuntos distintos, e só o segundo tem parceiro-a-trocar como motivo de adiamento.
- Os **nomes e o contrato** dos dois endpoints de cancelamento (`FR-007`/`FR-008`) ainda não foram confirmados na KB do ERP — pendência aberta, não bloqueio deliberado (2026-09-04, AD-162; item 41 de `.specs/project/PENDENCIES.md`). Diferente do ponto acima, este é só uma confirmação de contrato pendente, sem motivo para adiar além disso.
- O comportamento comum a todas as formas de pagamento e o comportamento específico de PIX têm especificações próprias, complementares a esta.
