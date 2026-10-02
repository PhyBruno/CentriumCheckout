# Feature Specification: Pagamento — TEF

**Feature Branch**: `[010-pagamento-tef]`

**Created**: 2026-08-26

**Status**: Draft

**Input**: User description: "O operador precisa aplicar uma forma de pagamento cobrada no terminal físico do ponto de venda — uma vez aprovada, ela fica travada na venda; a opção só aparece quando o ambiente a utiliza." **Revisado em 2026-09-03 (AD-144):** a descrição original terminava com "e não está disponível no layout mobile" — essa restrição foi revogada pelo usuário e não vale mais. **Revisado em 2026-09-04 (AD-162):** "travada na venda" deixou de significar "sem saída nenhuma" — o operador pode cancelar a transação, mas o cancelamento passa por um endpoint do ERP com confirmação por sondagem, nunca por um "remover" direto na UI. Ver User Story 3. **Revisado em 2026-10-02 (AD-259):** pedido do usuário para a fase de Design — janela travada com confirmação ao desistir, sondagem como no PIX, estorno ao excluir, várias formas por venda, `UsuarioGAM` do `GetSessao` e os três endpoints reais (`FR-010`–`FR-016`).

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

**Independent Test**: Pode ser testado aprovando um pagamento pelo terminal, pedindo a remoção dele e confirmando que a forma só fica riscada depois de o ERP reportar o estorno como concluído. **Desbloqueado em 2026-10-02 (AD-259):** os endpoints são `EstornarPagamento` (solicitação) e `ConsultarStatusCard` (confirmação) — ver `contracts/erp-tef-api.md`.

**Acceptance Scenarios**:

1. **Given** um pagamento pelo terminal físico já aprovado na venda, **When** o operador pede para removê-lo e confirma, **Then** o sistema solicita o **estorno** ao ERP (`EstornarPagamento`) — não um cancelamento que aconteça só no terminal, sem o ERP saber.
2. **Given** um estorno solicitado, **When** o Checkout aguarda a confirmação, **Then** o sistema sonda a consulta de status do pagamento (`ConsultarStatusCard`, a mesma da cobrança) até o ERP reportar o estorno como concluído ou rejeitado, com a mesma mecânica de polling já usada pelo PIX (intervalo fixo, sem SSE, sem estratégia de backoff).
3. **Given** o estorno confirmado como concluído, **When** o Checkout processa a resposta, **Then** a forma fica riscada na venda (excluída, como as demais formas removidas) e deixa de contar no saldo, liberando a venda para receber outra forma de pagamento ou ser suspensa. Um estorno **rejeitado** mantém o pagamento aprovado.
4. **Given** um cancelamento ainda não confirmado pelo ERP, **When** o operador tenta remover a forma ou suspender a venda por qualquer outro caminho, **Then** o sistema recusa — a forma permanece irremovível e a venda permanece bloqueada até a confirmação chegar (User Story 1, cenário 2, e Edge Case de suspensão abaixo).

---

### Edge Cases

- O que acontece com uma venda que já tem um pagamento pelo terminal físico aprovado, se o operador tentar suspendê-la? A suspensão fica bloqueada — a mesma regra que impede remover esse pagamento também impede suspender a venda. **A única saída passa a ser o cancelamento da User Story 3 (2026-09-04, AD-162):** confirmado o cancelamento pelo ERP, a forma sai da venda e a suspensão deixa de estar bloqueada. Antes de AD-162 não havia saída nenhuma pelo Checkout — só o operador desfazer a cobrança diretamente no terminal, sem o ERP ficar sabendo.
- O Checkout imprime algum comprovante para esse pagamento? Não — o comprovante é emitido pelo próprio terminal físico.
- Essa forma de pagamento está disponível no layout mobile? Sim — nas mesmas condições do desktop, decididas só pela configuração do ambiente. **Corrigido em 2026-09-03 (AD-144 em `.specs/project/STATE.md`):** a resposta anterior era "não", por supor que o terminal físico não tem equivalente em tablet/celular; o usuário informa que o dispositivo móvel também pode alcançá-lo.
- O cancelamento da User Story 3 e o "mecanismo técnico de comunicação com o terminal físico" das Assumptions são a mesma coisa? Não — e desde 2026-10-02 (AD-259) o segundo deixou de ser assunto do Checkout. O Checkout só fala HTTP com o **ERP** (`CriarCardPagamento`, `ConsultarStatusCard`, `EstornarPagamento`); quem fala com o terminal é o ERP, pela integração SmartTEF.
- O operador desiste de esperar com a cobrança já criada na maquininha — a transação é cancelada? Não. O sistema pede confirmação e avisa que **não cancela automaticamente a transação em voo** no TEF: se o cliente ainda passar o cartão, ela pode ser aprovada no terminal. O pagamento sai da venda, como no PIX (`FR-010`).
- A mesma venda pode ter mais de um pagamento pelo terminal? Sim, sem limite de quantidade (`FR-012`). Só uma janela de cobrança ou de estorno fica aberta por vez.
- O operador desiste de esperar um estorno já solicitado? O pagamento continua aprovado na venda (o dinheiro ainda não voltou) e o aviso diz que o estorno foi pedido e pode se concluir; pedir a remoção de novo retoma a confirmação sem solicitar um segundo estorno.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST permitir que o operador aplique um pagamento cobrado através do terminal físico conectado ao ponto de venda.
- **FR-002**: O sistema MUST ocultar ou desabilitar a opção de pagamento pelo terminal físico quando essa integração não estiver habilitada para o ambiente.
- **FR-003**: Uma vez que um pagamento pelo terminal físico é aprovado, o sistema MUST NOT permitir a remoção **direta** desse pagamento da venda — a única saída é o cancelamento de `FR-007`/`FR-008`.
- **FR-004**: O sistema MUST bloquear a suspensão de uma venda que tenha um pagamento pelo terminal físico já aprovado, **até que o cancelamento de `FR-007`/`FR-008` seja confirmado pelo ERP**.
- **FR-005**: O sistema MUST NOT imprimir nenhum comprovante para um pagamento aprovado pelo terminal físico — essa responsabilidade é do próprio terminal.
- **FR-006**: O sistema MUST oferecer e tentar esse pagamento no layout mobile nas mesmas condições do desktop — a disponibilidade depende só da configuração do ambiente, nunca do layout. **Corrigido em 2026-09-03 (AD-144):** o texto anterior proibia esse pagamento no mobile; o usuário revogou a proibição.
- **FR-007** *(adicionado em 2026-09-04, AD-162; endpoint nomeado em 2026-10-02, AD-259)*: O sistema MUST, ao solicitar o cancelamento de um pagamento pelo terminal físico já aprovado, chamar o endpoint de estorno do ERP (`EstornarPagamento`) com o identificador do pagamento.
- **FR-008** *(adicionado em 2026-09-04, AD-162; endpoint nomeado em 2026-10-02, AD-259)*: O sistema MUST, depois de solicitar o estorno, sondar a consulta de status do pagamento (`ConsultarStatusCard`) até o ERP reportar o estorno como concluído (`EST`) ou rejeitado (`REJ_EST`), usando a mesma mecânica de polling já especificada para o PIX (intervalo fixo, sem SSE).
- **FR-009** *(adicionado em 2026-09-04, AD-162; forma de saída fixada em 2026-10-02, AD-259)*: O sistema MUST, **só** ao confirmar o estorno como concluído (`FR-008`), excluir a forma da venda — riscada na lista, fora do saldo e do envio ao ERP, como toda forma excluída (AD-163) — e liberar tanto a inserção de outra forma quanto a suspensão da venda. Estorno rejeitado, com erro ou ainda pendente mantém o pagamento aprovado e os bloqueios de `FR-003`/`FR-004`.
- **FR-010** *(adicionado em 2026-10-02, AD-259)*: O sistema MUST manter a janela do TEF aberta enquanto o ERP cria a cobrança na maquininha e aguarda o pagamento; ESC e o fechamento do cabeçalho não a fecham. Desistir com a cobrança já criada MUST pedir confirmação e informar que o Checkout **não cancela automaticamente a transação em voo** no TEF; confirmada a desistência, o pagamento sai da venda sem nenhuma chamada de cancelamento.
- **FR-011** *(adicionado em 2026-10-02, AD-259)*: O sistema MUST, depois de criar a cobrança, sondar a consulta de status (`ConsultarStatusCard`) a intervalo fixo até o pagamento ser aprovado (`CNC`) ou falhar, da mesma forma que o PIX. Só o status de concluído aprova; qualquer status desconhecido mantém a espera, nunca aprova.
- **FR-012** *(adicionado em 2026-10-02, AD-259)*: O sistema MUST permitir mais de um pagamento pelo terminal na mesma venda, sem limite de quantidade.
- **FR-013** *(adicionado em 2026-10-02, AD-259)*: O sistema MUST criar a cobrança (`CriarCardPagamento`) com o valor do pagamento, o número de parcelas — o `CondicaoPrazo` da condição de pagamento no cartão de crédito e `1` no débito e no PIX —, o CPF/CNPJ do cliente (em branco no cliente default), o nome do cliente e o código da forma. Empresa e usuário do operador (`EmpCod`, `UsuarioGAM`) MUST ser preenchidos pelo servidor a partir da sessão, nunca pelo navegador.
- **FR-014** *(adicionado em 2026-10-02, AD-259)*: O sistema MUST usar o `UsuarioGAM` devolvido pelo `GetSessao` para identificar o operador no TEF. Sem ele, o pagamento pelo terminal MUST ser recusado antes de qualquer chamada, com um motivo que diga que o operador não tem usuário do TEF vinculado.
- **FR-015** *(adicionado em 2026-10-02, AD-259)*: O sistema MUST mostrar, no pagamento aprovado, o NSU, a autorização e a bandeira informados pelo ERP, e fechar a janela sozinho depois de alguns segundos, como no PIX.
- **FR-016** *(adicionado em 2026-10-02, AD-259)*: O sistema MUST enviar, em cada forma aprovada pelo terminal no faturamento da NFCe, o identificador do pagamento (`TEFPagId`) — é por ele que o ERP localiza a autorização, o adquirente e a bandeira.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Nenhum pagamento pelo terminal físico já cobrado é removido de uma venda sem passar pelo fluxo de cancelamento (`FR-007`–`FR-009`) — nunca por um "remover" direto e nunca só pelo terminal, sem o ERP confirmar.
- **SC-002**: Nenhuma venda com pagamento pelo terminal físico aprovado é suspensa **enquanto o cancelamento não for confirmado**.

## Assumptions

- **O Checkout não fala com o terminal físico** (corrigido em 2026-10-02, AD-259). Quem cria a cobrança na maquininha, consulta o status e estorna é o **ERP**, pela integração SmartTEF; o Checkout só chama três endpoints HTTP do ERP — `CriarCardPagamento`, `ConsultarStatusCard` e `EstornarPagamento` (contrato em `contracts/erp-tef-api.md`, confirmado na KB do ERP; fecha o item 41 de `.specs/project/PENDENCIES.md`). O bloqueio deliberado de AD-037 (protocolo com o terminal, parceiro a ser trocado) deixa de alcançar esta feature: o protocolo é problema do ERP. *Até 2026-10-02 esta seção dizia que o mecanismo com o terminal estava fora de escopo por AD-037 e que os nomes dos endpoints de cancelamento não estavam confirmados — as duas coisas foram superadas.*
- O `UsuarioGAM` ainda **não** é devolvido pelo `GetSessao` real (item 64 de `.specs/project/PENDENCIES.md`); até o ERP publicá-lo, `FR-014` recusa o pagamento pelo terminal com o motivo explicado.
- O comportamento comum a todas as formas de pagamento e o comportamento específico de PIX têm especificações próprias, complementares a esta.
