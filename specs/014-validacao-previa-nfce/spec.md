# Feature Specification: Validação Prévia da Venda no ERP (`ValidarNFCe`)

**Feature Branch**: `[014-validacao-previa-nfce]`

**Created**: 2026-08-31

**Status**: Draft

**Input**: User description: "Ao inserir uma forma de pagamento/condição [clicar no botão de inserir] (seja por cenário de pagamento (013), ou por qualquer outro fluxo), o checkout sempre deverá chamar o endpoint `ValidarNFCe`, que fará a validação de todas as regras de backend do ERP acerca da venda (não as tributárias, isso é só na finalização da NFCe mesmo). O endpoint retornará `true` para válido, onde poderá finalizar a venda se o valor total está preenchido, e `false` se não está válido; em caso de `false` também retornará a mensagem do motivo da invalidação, e a mensagem deve ser exibida com notification Goey. Em caso de `true`, também pode retornar com message — em geral nesses casos são avisos, que devem ser exibidos em tela, mas não bloquear a continuidade. Claramente esse fluxo tem que ser feito antes das questões de pagamento, pois é uma validação pré-inserção da forma/condição de pagamento."

## Contexto

Até aqui, o Checkout decidia sozinho se uma forma de pagamento podia entrar na venda: as regras de saldo, troco, exclusividade de dinheiro e elegibilidade de vale devolução são todas locais (feature 008). Mas o ERP tem um conjunto de regras de negócio sobre a **venda inteira** que o Checkout não conhece e não deve reimplementar — limite de crédito do cliente, duplicatas em aberto, bloqueio de crédito, data limite vencida, proibição de venda a prazo para cliente não identificado. Essas regras só fazem sentido quando já se sabe **qual condição e qual forma** vão pagar a venda, e precisam ser respondidas **antes** de o pagamento existir, não depois.

O ERP passou a expor exatamente esse gate: o endpoint `ValidarNFCe`, acrescentado ao contrato em `ApiCentriumOAuth.yaml` (`info.version: 20260827192357`). Ele recebe a **mesma representação da venda** usada na emissão (`CheckoutFaturarNFCe`), devolve `Valido` (booleano) e uma lista de mensagens, e **não executa nada** — não grava, não reserva, não emite. É consulta pura.

**Regras que o ERP aplica hoje** (confirmadas por leitura direta do código-fonte de `PCheckout_ValidarNFCe` na KB `CentriumDEVU6`, 2026-08-31):

| Situação avaliada | `Valido` | Severidade da mensagem |
|---|---|---|
| Empresa ausente ou inexistente | `false` | Erro |
| Condição de pagamento inexistente | `false` | Erro |
| Cliente inexistente na empresa | `false` | Erro |
| Condição **a prazo** com o cliente default (não identificado) | `false` | Erro — "Não é permitido venda a prazo para cliente não identificado!" |
| Crediário acima do limite de crédito, empresa com controle `'A'` | **`true`** | **Aviso** — "Limite de crédito ultrapassado!" (não bloqueia) |
| Crediário acima do limite de crédito, empresa com controle `'B'` | `false` | Aviso (com o saldo de crédito disponível no texto) |
| Data limite de crédito do cliente vencida | `false` | Aviso |
| Cliente com crédito bloqueado | `false` | Aviso |

Três consequências que esta especificação trata como regra, não como detalhe:

1. **A severidade informada pelo ERP não decide bloqueio.** Existem mensagens de aviso que bloqueiam e uma mensagem de aviso que não bloqueia. Só o campo `Valido` decide.
2. **A validação depende da forma que ainda não foi inserida.** O cálculo do crediário percorre as formas de pagamento da venda procurando as marcadas como crediário (`FormaFpgUtiCar = 'CRD'` **e** `FormaEntrada = 'N'`). Perguntar ao ERP com o estado anterior à inserção nunca dispararia essa regra: a pergunta certa é "e se eu inserir esta forma?".
3. **A condição de pagamento é o principal insumo.** É ela que define se a venda é à vista ou a prazo, e portanto se o bloco de regras de crédito é sequer avaliado.

**O que esta feature não é:** não é validação fiscal/tributária. Cálculo de imposto, CST, CFOP e autorização do documento continuam acontecendo somente na emissão (feature 004). E não é uma tela — é um gate transversal, sem interface própria, no mesmo padrão da trilha de auditoria (feature 001).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ser impedido de lançar um pagamento que o ERP recusa (Priority: P1)

Como operador de caixa, quero que o sistema me impeça de lançar um pagamento que o ERP não aceita, me dizendo o motivo na hora, para não descobrir o problema só na emissão da nota — quando desfazer já custa caro.

**Why this priority**: É a razão de existir da feature. Sem isso, uma venda a prazo para cliente com crédito bloqueado só falha na emissão, com o cliente já esperando no balcão e o pagamento eventualmente já capturado por uma integração externa.

**Independent Test**: Pode ser testado com um cliente de crédito bloqueado e uma condição a prazo: ao confirmar a inserção da forma, o pagamento não entra na venda e o motivo aparece na tela.

**Acceptance Scenarios**:

1. **Given** uma venda com itens e um cliente cujo crédito está bloqueado no ERP, **When** o operador confirma a inserção de uma forma de pagamento com condição a prazo, **Then** o sistema não insere o pagamento, exibe o motivo devolvido pelo ERP como notificação de erro, e a venda permanece exatamente como estava antes do gesto.
2. **Given** a mesma venda recusada, **When** o operador corrige o que causou a recusa (por exemplo, identifica um cliente com crédito liberado) e tenta de novo, **Then** o sistema consulta o ERP novamente e a inserção passa a ser aceita.
3. **Given** uma venda com o cliente default (não identificado), **When** o operador tenta inserir uma condição a prazo, **Then** o sistema não insere o pagamento e exibe a recusa devolvida pelo ERP.
4. **Given** uma recusa exibida ao operador, **When** ele fecha a notificação, **Then** nenhuma forma de pagamento ficou aplicada e nenhuma cobrança externa foi iniciada.

---

### User Story 2 - Ser avisado sem ser bloqueado (Priority: P1)

Como operador de caixa, quero ver os avisos que o ERP tem sobre a venda mesmo quando ele a aceita, para saber o que está fora do comum sem ter meu fluxo interrompido.

**Why this priority**: É a outra metade do mesmo gate, e distingue-se da História 1 justamente onde o erro é mais caro: tratar aviso como bloqueio trava vendas legítimas; tratar bloqueio como aviso emite nota indevida. As duas leituras precisam ser testadas separadamente.

**Independent Test**: Pode ser testado com uma empresa configurada para apenas avisar sobre limite de crédito: a inserção acontece normalmente e o aviso aparece na tela.

**Acceptance Scenarios**:

1. **Given** uma venda cujo crediário ultrapassa o limite de crédito numa empresa que apenas avisa, **When** o operador confirma a inserção, **Then** o pagamento é inserido normalmente e o texto do aviso é exibido como notificação de aviso, sem exigir confirmação e sem interromper o fluxo.
2. **Given** uma venda aceita pelo ERP sem nenhuma mensagem, **When** o operador confirma a inserção, **Then** o pagamento é inserido e nenhuma notificação é exibida.
3. **Given** uma resposta do ERP com várias mensagens, **When** ela é apresentada, **Then** todas as mensagens são exibidas ao operador, na ordem em que vieram, nenhuma descartada.
4. **Given** uma resposta em que o ERP recusa a venda e classifica a mensagem apenas como aviso, **When** o sistema a interpreta, **Then** ela é tratada como **bloqueio**, porque a recusa vem do veredito e não da severidade do texto.

---

### User Story 3 - Ter a mesma proteção por qualquer caminho de inserção (Priority: P1)

Como Checkout, quero que toda forma de entrar com um pagamento na venda passe pelo mesmo gate, para que nenhum atalho contorne uma regra do ERP.

**Why this priority**: A venda rápida por tecla de função (feature 013) lança o pagamento sem o operador passar pela tela de pagamento, e pode inclusive finalizar a venda em seguida. Se o gate morasse apenas no botão da tela, o atalho seria um buraco direto para a emissão de uma nota que o ERP recusaria.

**Independent Test**: Pode ser testado provocando a mesma recusa por dois caminhos — o botão de inserir da tela de pagamento e a tecla de atalho de um cenário — e confirmando comportamento idêntico nos dois.

**Acceptance Scenarios**:

1. **Given** uma venda que o ERP recusa, **When** o operador aciona um cenário de venda rápida por tecla de função, **Then** o sistema não lança o pagamento, exibe o motivo e **não** inicia a finalização automática, mesmo que o cenário esteja marcado para encerrar a operação.
2. **Given** a mesma venda, **When** o operador tenta inserir a forma pelo botão da tela de pagamento, **Then** o resultado e a mensagem são idênticos aos do acionamento por tecla.
3. **Given** uma forma de pagamento que depende de integração externa (terminal físico ou PIX), **When** a venda é recusada pelo ERP, **Then** nenhuma cobrança é gerada e nenhuma transação é iniciada nessa integração.
4. **Given** uma venda aceita, **When** a forma depende de integração externa, **Then** a integração é acionada normalmente, depois do veredito favorável.

---

### User Story 4 - Finalizar apoiado no veredito já obtido (Priority: P2)

Como operador de caixa, quero que a finalização use a validação que já foi feita ao lançar o pagamento, para não esperar uma segunda consulta ao ERP no momento em que o cliente está indo embora.

**Why this priority**: É otimização de fluxo, não proteção — a proteção já foi dada nas Histórias 1 a 3. Só é segura porque a venda fica congelada depois do primeiro pagamento aplicado, e por isso vem depois delas.

**Independent Test**: Pode ser testado finalizando uma venda logo após um lançamento aceito e confirmando que a emissão ocorre sem nova consulta de validação; e removendo o pagamento, alterando a venda e reinserindo, confirmando que houve nova consulta.

**Acceptance Scenarios**:

1. **Given** uma venda cujo último lançamento foi aceito pelo ERP e cujo total está totalmente coberto, **When** o operador finaliza, **Then** o sistema emite o documento sem repetir a consulta de validação.
2. **Given** uma venda com pagamento aplicado, **When** o operador remove esse pagamento, **Then** o veredito deixa de valer, e qualquer nova inserção exige uma nova consulta ao ERP.
3. **Given** uma venda sem nenhum veredito favorável vigente, **When** a finalização é solicitada, **Then** o sistema não emite o documento.
4. **Given** uma venda com pagamento aplicado, **When** o operador tenta alterar o carrinho, o cliente, o vendedor ou o desconto sobre o total, **Then** o sistema bloqueia a alteração — para mudar qualquer uma dessas coisas ele precisa antes remover a forma de pagamento aplicada.

---

### Edge Cases

- **Sem resposta do ERP** (queda de rede, tempo esgotado, erro de servidor, resposta ilegível): o pagamento **não** é inserido. O operador é avisado de que a validação não pôde ser feita — mensagem distinta de uma recusa por regra de negócio — e pode tentar novamente.
- **Resposta recusando a venda sem nenhuma mensagem**: o operador recebe uma recusa genérica, nunca um bloqueio silencioso.
- **Acionamento repetido** (duplo clique no botão, tecla pressionada duas vezes): enquanto uma validação está em curso, um novo acionamento é ignorado — o gate não pode virar caminho de pagamento duplicado.
- **Recusa local antes da consulta**: quando o próprio Checkout já recusaria o gesto (venda sem itens, saldo em aberto zerado, segunda forma "dinheiro", desconto acima do subtotal), a consulta ao ERP não chega a ser feita.
- **Suspensão da venda**: suspender não emite documento fiscal e **não** passa por este gate.
- **Venda retomada de um rascunho**: o primeiro lançamento de pagamento sobre a venda retomada passa pelo gate como qualquer outro, mesmo que o rascunho já trouxesse pagamentos do lado do ERP.
- **Divergência entre o aviso e o desfecho**: um aviso exibido ao operador não vira impedimento posterior — se o ERP aceitou, a venda segue.
- **Layout mobile**: o gate vale igualmente no mobile; não é exclusividade do desktop.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST consultar a validação da venda no ERP **antes** de efetivar a inserção de qualquer forma ou condição de pagamento, por **qualquer** caminho de acionamento — botão da tela de pagamento, atalho de cenário de venda rápida, ou qualquer fluxo futuro que insira pagamento.
- **FR-001a**: A consulta MUST acontecer em **toda e cada** inserção da mesma venda — na primeira forma, na segunda, na terceira e em todas as seguintes de um pagamento dividido. O sistema MUST NOT reaproveitar o veredito de uma inserção anterior para autorizar a próxima, MUST NOT agrupar várias inserções numa única consulta e MUST NOT cachear a resposta: cada forma acrescentada muda o retrato da venda (em particular o total de crediário) e pode inverter o desfecho de aceite para recusa.
- **FR-002**: A consulta MUST descrever a venda **como ela ficaria** com a forma/condição pretendida já aplicada — as formas **já aplicadas** mais a candidata — e não o estado anterior ao gesto; sem isso, as regras de crédito do ERP não são avaliadas.
- **FR-003**: A consulta MUST usar a mesma representação da venda que é enviada na emissão do documento fiscal, para que a resposta corresponda ao que a emissão realmente encontraria.
- **FR-004**: Quando o ERP recusar a venda, o sistema MUST NOT efetivar a inserção, MUST preservar a venda exatamente no estado anterior ao acionamento, e MUST exibir ao operador o motivo devolvido pelo ERP como notificação de erro.
- **FR-005**: Quando o ERP aceitar a venda, o sistema MUST efetivar a inserção e, havendo mensagens na resposta, MUST exibi-las como notificação de aviso, sem bloquear, sem exigir confirmação e sem alterar o fluxo.
- **FR-006**: O sistema MUST decidir bloqueio **exclusivamente** pelo veredito de validade devolvido pelo ERP, e MUST NOT usar a severidade das mensagens para essa decisão — existem mensagens de aviso que acompanham uma recusa e uma que acompanha uma aceitação.
- **FR-007**: O sistema MUST exibir **todas** as mensagens devolvidas na resposta, preservando a ordem em que vieram e o texto tal como o ERP o escreveu, sem reescrever, resumir ou traduzir.
- **FR-008**: Quando a resposta recusar a venda sem nenhuma mensagem, o sistema MUST exibir uma recusa genérica ao operador, MUST NOT falhar silenciosamente.
- **FR-009**: Quando a consulta não puder ser concluída (indisponibilidade, tempo esgotado, erro de servidor ou resposta em formato inesperado), o sistema MUST tratar o resultado como recusa — MUST NOT efetivar a inserção — e MUST avisar o operador com uma mensagem que distinga falha de comunicação de recusa por regra de negócio, permitindo nova tentativa.
- **FR-010**: A consulta MUST ocorrer **antes** de qualquer integração externa de pagamento (terminal físico ou PIX): uma venda recusada MUST NOT gerar cobrança, código de pagamento ou transação em nenhuma integração.
- **FR-011**: O sistema MUST ignorar novos acionamentos de inserção enquanto uma consulta de validação estiver em curso, evitando lançamento duplicado.
- **FR-012**: O sistema MUST aplicar primeiro as suas próprias regras locais de inserção (venda sem itens, saldo em aberto zerado ou negativo, segunda forma "dinheiro", desconto acima do subtotal) e MUST NOT consultar o ERP quando o gesto já for recusado localmente.
- **FR-013**: O sistema MUST reter o veredito favorável obtido na última inserção aceita como a autorização vigente para finalizar a venda, e MUST NOT repetir a consulta no momento da finalização.
- **FR-014**: O sistema MUST invalidar o veredito vigente sempre que a venda deixar de corresponder ao que foi validado — em particular, ao remover uma forma de pagamento aplicada.
- **FR-015**: O sistema MUST NOT emitir o documento fiscal quando não houver veredito favorável vigente, ainda que o total esteja coberto.
- **FR-016**: Enquanto houver qualquer forma de pagamento aplicada à venda, o sistema MUST bloquear a alteração do carrinho, do cliente, do vendedor e do desconto sobre o total; alterar qualquer um deles MUST exigir a remoção prévia da forma aplicada.
- **FR-017**: A suspensão da venda MUST NOT passar por esta validação.
- **FR-018**: O sistema MUST registrar na trilha de auditoria da venda toda recusa de inserção — tanto a recusa por regra de negócio quanto a falha de comunicação — identificando o caminho de acionamento e a forma/condição pretendida.
- **FR-019**: O gate MUST valer igualmente nos layouts desktop e mobile.
- **FR-020**: Esta validação MUST ser complementar às validações locais de pagamento, MUST NOT substituí-las, e MUST NOT reimplementar localmente nenhuma das regras de negócio que o ERP avalia (limite de crédito, duplicatas em aberto, bloqueio de crédito, venda a prazo).

### Key Entities *(include if feature involves data)*

- **Retrato da venda para validação**: a descrição completa da venda como ela ficaria após a inserção pretendida — empresa, cliente, condição de pagamento, itens e formas de pagamento (incluindo, para cada forma, se ela é crediário e se é entrada). É a mesma representação usada na emissão do documento fiscal.
- **Veredito de validação**: o resultado de uma consulta — se a venda é aceita ou recusada, as mensagens que a acompanham, e o momento/caminho de acionamento em que foi obtido. Um veredito favorável é a autorização vigente para finalizar, até ser invalidado.
- **Mensagem de validação**: um texto devolvido pelo ERP, com um identificador e uma severidade informada por ele. A severidade orienta como exibir; **não** decide bloqueio.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% das inserções de forma/condição de pagamento passam pela validação do ERP, independentemente do caminho de acionamento — nenhum atalho a contorna.
- **SC-002**: Nenhuma cobrança externa (PIX ou terminal físico) é iniciada em uma venda que o ERP recusou, em nenhum caso de teste.
- **SC-003**: 100% das mensagens devolvidas pelo ERP chegam ao operador, com o texto original preservado.
- **SC-004**: Nenhuma recusa do ERP resulta em pagamento aplicado, e nenhuma aceitação com aviso resulta em fluxo interrompido — verificado nos dois casos de limite de crédito (o que bloqueia e o que apenas avisa).
- **SC-005**: Nenhum documento fiscal é emitido sem um veredito favorável vigente.
- **SC-006**: O operador vê o desfecho do gesto (pagamento inserido ou recusa explicada) em menos de 2 segundos em condições normais de rede.
- **SC-007**: Nenhum acionamento repetido em sequência rápida produz duas consultas ou dois pagamentos.

## Assumptions

- O endpoint de validação é **consulta pura**: não grava, não reserva número de documento e não altera nada no ERP. Chamá-lo a cada inserção é seguro e não tem efeito colateral.
- As regras tributárias (cálculo de imposto, CST/CFOP, autorização do documento) **não** são avaliadas aqui — permanecem exclusivamente na emissão, conforme decisão direta do usuário.
- Não há revalidação no momento da finalização — decisão direta do usuário (2026-08-31): depois da primeira forma de pagamento inserida, o operador não pode aplicar desconto na capa, mexer no carrinho ou trocar o cliente; para isso precisaria remover a forma já inserida, o que por sua vez invalida o veredito (`FR-014`).
- Falha de comunicação bloqueia a inserção (comportamento *fail-closed*) — decisão direta do usuário (2026-08-31). O caixa não opera "às cegas" quando o ERP não responde.
- Os avisos são exibidos como notificação e **não** são registrados na trilha de auditoria — decisão direta do usuário (2026-08-31). Apenas as recusas entram na trilha (`FR-018`).
- O Checkout não interpreta o conteúdo das mensagens do ERP: repassa o texto ao operador. Se uma mensagem precisar de tratamento especial no futuro, isso será uma mudança de especificação, não uma heurística de texto.
- A representação da venda usada na consulta é idêntica à da emissão; como consequência, a montagem dessa representação deixa de ser exclusiva do fluxo de finalização e passa a ser compartilhada — o desenho dessa partilha é decidido na fase de planejamento desta feature.

## Dependências

- **004 — Finalização e suspensão da venda**: hoje é a dona da montagem e do envio da representação da venda ao ERP; esta feature reutiliza a mesma representação e passa a condicionar a emissão ao veredito vigente (`FR-013`/`FR-015`).
- **008 — Pagamento (geral)**: fornece o gesto de inserção de forma/condição, as validações locais que precedem a consulta (`FR-012`), a remoção de pagamento que invalida o veredito (`FR-014`) e o congelamento da venda após o primeiro pagamento (`FR-016`).
- **013 — Venda rápida por cenário de pagamento**: é o segundo caminho de acionamento coberto por `FR-001`, e o único em que uma recusa também precisa abortar a finalização automática.
- **009 — Pagamento PIX** e **010 — Pagamento por terminal físico (TEF)**: são acionadas somente após o veredito favorável (`FR-010`).
- **005 — Identificação e cadastro de cliente**: o cliente da venda (identificado ou default) é insumo direto das regras de crédito avaliadas pelo ERP.
- **003 — Carrinho, produto e precificação** e **012 — Seleção de vendedor**: fornecem itens, totais e vendedor que compõem o retrato da venda.
- **001 — Auditoria de ações do operador**: recebe o evento exigido por `FR-018`.
- **002 — Autenticação, sessão e bootstrap**: fornece a empresa da sessão, primeiro campo avaliado pela validação.

## Decisões registradas nesta especificação

| Questão | Decisão | Onde está |
|---------|---------|-----------|
| Isto é feature própria ou emenda à 008? | Feature própria, transversal e sem tela — a validação precisa do retrato completo da venda (escopo da 004) e é acionada por caminhos que não passam pela tela de pagamento (013) | Toda esta spec; mesmo padrão da feature 001 |
| O que decide o bloqueio? | Somente o veredito de validade; a severidade da mensagem é apenas de exibição | `FR-006` |
| A forma pretendida entra no retrato enviado? | Sim — a validação é "e se eu inserir isto?" | `FR-002` |
| Falha de comunicação com o ERP | Bloqueia a inserção (*fail-closed*) | `FR-009` |
| Revalidação na finalização | Não — vale o veredito da última inserção aceita, que só cai quando um pagamento é removido | `FR-013`/`FR-014` |
| Exibição dos avisos (`Valido = true` com mensagem) | Notificação de aviso, sem bloqueio e sem registro na trilha de auditoria | `FR-005`, Assumptions |
| Ordem em relação a TEF/PIX | Validação primeiro, integração depois | `FR-010` |
