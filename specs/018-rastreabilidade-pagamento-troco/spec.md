# Feature Specification: Rastreabilidade de pagamentos cancelados e troco enviado ao ERP

**Feature Branch**: `feat/rastreabilidade-pagamento-troco`

**Created**: 2026-10-16

**Status**: Draft

**Input**: User description: "Rastreabilidade de pagamentos cancelados e troco enviado ao ERP. Três mudanças sobre a feature 008 (pagamento geral), 010 (TEF) e 001 (auditoria): (1) 'Limpar' do pagamento deixa de apagar a lista de pagamentos — zera condição, desconto de capa e vales, e passa para excluídos os pagamentos ainda vivos, mantendo riscadas as formas já excluídas (inclusive TEF estornado); (2) o evento de auditoria de forma removida passa a carregar valor, motivo e, quando TEF, o payment_identifier da SmartTEF — o ERP precisa receber os dados do TEF estornado, nem que seja só na auditoria; (3) a forma dinheiro passa a ir ao ERP com o valor total digitado (recebido), e não só com o que completa a venda, para o ERP gerar o troco na NFCe."

## Contexto

Três decisões anteriores são revistas por esta feature, a pedido do usuário (2026-10-16):

- **"Limpar" apagava o histórico de formas.** Desde AD-163 uma forma removida fica riscada na lista, por rastreabilidade. O "Limpar" (`descartarPagamento`, feature 008) contrariava essa regra: esvaziava a lista inteira, inclusive formas já riscadas e TEFs estornados. O operador perdia de vista o que tinha acontecido na venda.
- **A auditoria de forma removida não identificava o pagamento.** O evento que vai ao ERP no `Log` levava só o nome da forma. Dois cartões de R$ 50,00 estornados apareciam como duas linhas iguais, sem valor, sem motivo e sem o identificador da transação TEF. O ERP não tinha como ligar o estorno à transação.
- **O troco não chegava ao ERP.** A decisão D3 da feature 008 fixou que a forma dinheiro vai com o valor que quita a venda, nunca com o valor recebido (invariante `Σ valores das formas = total líquido`). Com isso a NFCe sai sem o campo de troco. Esta feature **reverte D3**: a forma dinheiro passa a ir com o valor que o cliente entregou, e o ERP calcula o troco.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - ERP recebe a identificação de toda forma removida ou estornada (Priority: P1)

O operador aplica um cartão no TEF, o cliente desiste, o operador estorna. Depois paga em dinheiro e finaliza. O ERP recebe, no histórico de auditoria da venda, o registro do cartão estornado com o valor, o motivo (estorno no TEF) e o identificador da transação na SmartTEF. Assim o ERP consegue conciliar o estorno com a transação que a operadora registrou.

**Why this priority**: É a exigência explícita do usuário e a única das três mudanças com efeito financeiro fora do Checkout: uma transação de cartão que o ERP não consegue associar à venda vira divergência de conciliação.

**Independent Test**: Estornar um TEF aprovado, finalizar a venda com outra forma e verificar que o histórico enviado ao ERP contém o evento de remoção com valor, motivo "estornada no TEF" e o identificador da transação.

**Acceptance Scenarios**:

1. **Given** uma venda com um TEF aprovado de R$ 50,00 e identificador de transação `X`, **When** o estorno é confirmado pelo TEF, **Then** o evento de forma removida registra valor R$ 50,00, motivo "estornada no TEF" e identificador `X`.
2. **Given** uma venda com uma forma dinheiro de R$ 30,00 aplicada, **When** o operador a remove pelo botão Remover, **Then** o evento registra valor R$ 30,00 e motivo "removida pelo operador", sem identificador de transação.
3. **Given** uma venda com um PIX aprovado, **When** o operador o remove, **Then** o evento registra o valor, o motivo e o identificador da cobrança PIX.
4. **Given** uma venda finalizada depois de qualquer um dos cenários acima, **When** o retrato da venda é enviado ao ERP, **Then** o histórico de auditoria contém esses eventos completos.

---

### User Story 2 - "Limpar" mantém o histórico das formas na tela (Priority: P2)

O operador escolheu a condição errada ou quer voltar a editar o carrinho e aciona "Limpar". Condição, desconto de capa e vales são zerados. As formas que ainda valiam passam a aparecer riscadas, e as que já estavam riscadas (inclusive TEF estornado) continuam na lista. O operador vê tudo o que aconteceu com o pagamento daquela venda, e cada forma descartada gera o seu evento de remoção.

**Why this priority**: Corrige a contradição com AD-163 e dá ao operador a visão completa da venda. Não muda o que vai ao ERP como pagamento, porque formas riscadas nunca entram no pagamento enviado.

**Independent Test**: Aplicar uma forma, removê-la, aplicar outra, acionar "Limpar" e verificar que as duas aparecem riscadas, com a descrição original, e que a venda volta a aceitar condição, desconto e edição do carrinho.

**Acceptance Scenarios**:

1. **Given** uma venda com uma forma aprovada (não TEF) e uma forma já removida, **When** o operador aciona "Limpar", **Then** as duas aparecem riscadas, condição e desconto de capa ficam vazios, e o carrinho volta a aceitar edição.
2. **Given** uma venda com um TEF estornado e nenhuma forma ativa, mas com condição escolhida, **When** o operador aciona "Limpar", **Then** a condição é zerada e o TEF estornado continua riscado na lista.
3. **Given** uma venda cujas formas estão todas riscadas e sem condição nem desconto de capa, **When** o operador olha o botão "Limpar", **Then** ele aparece bloqueado com a explicação de que não há nada a limpar.
4. **Given** uma venda com TEF aprovado (não estornado), **When** o operador aciona "Limpar", **Then** o gesto é recusado com o aviso de que o cartão só sai por estorno, como hoje.
5. **Given** uma forma riscada pelo "Limpar", **When** a condição de pagamento já não existe mais, **Then** a linha riscada continua mostrando o nome legível do meio de pagamento (ex.: "Dinheiro", "Cartão de Débito"), e não um código técnico.
6. **Given** uma venda limpa com formas riscadas, **When** o operador escolhe nova condição e aplica nova forma, **Then** a nova forma entra normalmente e as riscadas continuam na lista, fora do saldo.

---

### User Story 3 - NFCe sai com o troco calculado pelo ERP (Priority: P3)

Venda de R$ 87,00; o cliente entrega R$ 100,00 em dinheiro. O Checkout mostra troco de R$ 13,00, como hoje, e agora envia ao ERP a forma dinheiro com R$ 100,00. O ERP gera a NFCe com o troco de R$ 13,00.

**Why this priority**: Melhora o documento fiscal, mas depende de o ERP aceitar a soma das formas acima do total da venda (ver Dependências). Até essa confirmação, é a parte de maior risco de recusa.

**Independent Test**: Finalizar uma venda paga em dinheiro com valor acima do total e verificar que a forma dinheiro enviada ao ERP leva o valor entregue pelo cliente e que a NFCe emitida mostra o troco.

**Acceptance Scenarios**:

1. **Given** venda de R$ 87,00 e dinheiro recebido de R$ 100,00, **When** a venda é validada e finalizada, **Then** a forma dinheiro vai ao ERP com R$ 100,00 nas duas chamadas (validação prévia e faturamento).
2. **Given** venda de R$ 100,00 paga com cartão de R$ 60,00 e dinheiro recebido de R$ 50,00, **When** a venda é finalizada, **Then** o cartão vai com R$ 60,00, o dinheiro com R$ 50,00, e o troco esperado é R$ 10,00.
3. **Given** venda paga em dinheiro com o valor exato, **When** a venda é finalizada, **Then** a forma dinheiro vai com o valor da venda, como hoje.
4. **Given** um documento retomado (DAV ou NFCe suspensa) cuja forma dinheiro tem valor maior do que o que falta pagar, **When** a venda é montada a partir dele, **Then** o Checkout reconstrói o valor recebido igual ao valor do documento e o valor que quita a venda igual ao necessário, mostrando o troco, sem acusar pagamento acima do total.
5. **Given** a tela de pagamento, **When** o dinheiro recebido supera o saldo, **Then** saldo, faltante e troco exibidos continuam iguais aos de hoje.

---

### User Story 4 - Desistir do TEF/PIX deixa rastro: forma riscada e identificadores no ERP (Priority: P1)

*Acrescentada em 2026-10-16, a pedido do usuário, depois da US1.* O operador cobra no TEF ou no PIX e o cliente desiste antes da aprovação (ou a cobrança falha depois de criada). A cobrança já existe na SmartTEF ou no banco, e o Checkout não a cancela. Hoje a forma some da lista e o `Log` leva só o tipo e o motivo, sem nada que ligue o evento à cobrança. Passa a ficar riscada na tela, e o `Log` leva o valor e o identificador da cobrança.

**Why this priority**: mesma razão da US1. Uma cobrança que o Checkout deixou viva e que o ERP não consegue associar à venda pode ser paga depois e virar divergência de conciliação. O `payment_identifier` só entrava na forma na aprovação (`CNC`), então uma cobrança abandonada antes disso não tinha identificador nenhum para mandar.

**Independent Test**: Cobrar no TEF, esperar a cobrança ser criada, desistir; finalizar a venda com outra forma e verificar que a forma continua riscada na tela e que o `Log` enviado ao ERP traz o `payment_identifier` da cobrança desistida. Idem no PIX, com o identificador da cobrança PIX.

**Acceptance Scenarios**:

1. **Given** uma cobrança TEF criada (identificador `X`) e ainda não aprovada, **When** o operador desiste, **Then** a forma continua na lista, riscada, fora do saldo, e o `Log` registra a recusa com a forma, o valor, o motivo e o identificador `X`.
2. **Given** uma cobrança PIX gerada (identificador `Y`) e não paga, **When** o operador desiste, **Then** a forma continua riscada e o `Log` traz o identificador `Y`.
3. **Given** uma cobrança que falha depois de criada (recusa do cartão, PIX expirado), **When** a janela encerra a cobrança, **Then** o mesmo: riscada e com o identificador no `Log`.
4. **Given** o operador desiste enquanto a cobrança ainda está sendo criada ou a criação deu erro, **When** a desistência é confirmada, **Then** a forma fica riscada e o `Log` registra a recusa sem identificador (não existe um para mandar).
5. **Given** uma recusa antes de qualquer cobrança (sem usuário GAM, sem cliente, PIX abaixo do mínimo), **When** a janela se encerra, **Then** a forma sai da lista como hoje: nada foi cobrado e o operador não fez nenhum gesto.
6. **Given** uma forma riscada por desistência, **When** o operador tenta outra forma, **Then** a nova entra normalmente e a riscada fica fora do saldo, do payload e das guardas.

---

### Edge Cases

- **Forma pendente de integração no "Limpar"** (PIX gerado e não pago): passa a riscada como as demais; a confirmação de PIX que existe hoje antes do "Limpar" continua valendo.
- **Forma vinda de documento no "Limpar"**: passa a riscada; a confirmação de "valor já recebido" que existe hoje continua valendo.
- **Confirmação de integração chegando depois do "Limpar"**: uma forma riscada não volta a valer. Uma aprovação de PIX/TEF que chegue para uma forma já riscada é ignorada (só pendente pode ser aprovado).
- **Vale devolução descartado pelo "Limpar"**: o código do vale fica livre para ser informado de novo na mesma venda, como na remoção individual.
- **Importação de documento depois de formas riscadas**: a importação substitui a lista, como hoje (é o replay de um documento, não um gesto do operador).
- **Dinheiro em documento retomado sem excedente**: comportamento atual (recebido = aplicado, troco zero).
- **Documento retomado com valor acima do total e sem forma dinheiro, com duas formas dinheiro, ou com excedente maior que o dinheiro**: não há como atribuir o troco a uma forma só; o Checkout importa como está, sem inventar troco (mesma política de reproduzir fielmente o documento).
- **Forma sem identificador de transação** (dinheiro, cartão sem TEF, vale): o evento leva só valor e motivo; o campo de identificador não aparece vazio.
- **PIX riscado pelo "Limpar" e depois cancelar/suspender a venda**: a confirmação de "cobrança PIX segue no banco" continua aparecendo, como já acontece hoje com PIX removido individualmente. A cobrança continua viva no banco, então o aviso continua verdadeiro.
- **Venda finalizada ou cancelada**: a lista de pagamentos é zerada por inteiro, como hoje, porque a venda seguinte não pode herdar formas da anterior. A limpeza pós-entrega não é o "Limpar" do operador.

## Requirements *(mandatory)*

### Functional Requirements

**"Limpar" preserva o histórico (US2)**

- **FR-001**: O "Limpar" MUST zerar condição de pagamento, desconto de capa e vales aplicados da venda.
- **FR-002**: O "Limpar" MUST marcar como excluída toda forma ainda ativa (aprovada ou pendente de integração), em vez de retirá-la da lista.
- **FR-003**: O "Limpar" MUST manter na lista, riscadas, as formas que já estavam excluídas, inclusive TEF estornado.
- **FR-004**: O "Limpar" MUST registrar um evento de forma removida para cada forma que ele exclui, com o motivo "descartada pelo Limpar"; MUST NOT registrar novo evento para formas que já estavam excluídas.
- **FR-005**: O "Limpar" MUST continuar recusado enquanto houver TEF aprovado não estornado, com o aviso atual.
- **FR-006**: A decisão de "há algo a limpar" MUST considerar só formas ativas, condição e desconto de capa; formas riscadas sozinhas não habilitam o "Limpar".
- **FR-007**: A lista MUST continuar exibindo um rótulo legível para cada forma riscada depois de a condição ser zerada. Já é o comportamento atual: o rótulo da lista vem do meio de pagamento, não da condição. O requisito existe para travar isso em teste.
- **FR-008**: Formas riscadas MUST continuar fora do saldo, do valor enviado ao ERP como pagamento e de qualquer regra que pergunte "há pagamento nesta venda".
- **FR-009**: A limpeza que acontece depois da finalização ou do cancelamento da venda MUST continuar zerando a lista por inteiro.

**Auditoria de forma removida (US1)**

- **FR-010**: Todo evento de forma removida MUST registrar a descrição da forma, o valor que ela tinha na venda e o motivo.
- **FR-011**: O motivo MUST ser um entre: removida pelo operador, estornada no TEF, descartada pelo Limpar.
- **FR-012**: Quando a forma removida for TEF com transação aprovada, o evento MUST registrar o identificador da transação na SmartTEF (o mesmo que identifica a transação no faturamento).
- **FR-013**: Quando a forma removida for PIX com cobrança gerada, o evento MUST registrar o identificador dela. (Redação original: "PIX **aprovado**, o único estado em que a forma guarda o identificador"; **corrigida em 2026-10-16** pela US4/FR-022, que guarda o identificador já na geração.)
- **FR-014**: Campos de identificador MUST ser omitidos quando não houver transação, nunca enviados vazios.
- **FR-015**: Os eventos MUST chegar ao ERP no histórico de auditoria da venda, junto do retrato, nas mesmas condições em que os eventos atuais chegam.

**Troco enviado ao ERP (US3)**

- **FR-016**: A forma dinheiro MUST ir ao ERP com o valor recebido do cliente, e não com o valor que quita a venda.
- **FR-017**: As demais formas MUST continuar indo com o valor aplicado (não geram troco).
- **FR-018**: A validação prévia e o faturamento MUST receber exatamente o mesmo valor para a forma dinheiro (o retrato validado e o emitido continuam idênticos).
- **FR-019**: O cálculo de saldo, faltante e troco exibido ao operador MUST permanecer como hoje.
- **FR-020**: Ao montar a venda a partir de um documento do ERP (DAV ou NFCe retomada), quando a soma das formas exceder o total da venda e houver **exatamente uma** forma dinheiro cujo valor cubra todo o excedente, o excedente MUST ser tratado como troco dessa forma: valor recebido igual ao valor do documento, valor que quita a venda igual ao valor do documento menos o excedente. Sem dinheiro, com mais de uma forma dinheiro ou com excedente maior que o dinheiro, o documento MUST ser importado como está, sem inventar troco.
- **FR-021**: Sem excedente, a reconstrução do dinheiro importado MUST continuar com recebido igual a aplicado.

**Desistência e falha de TEF/PIX (US4)**

- **FR-022**: Assim que a cobrança TEF é criada, o `payment_identifier` MUST ficar guardado na forma pendente; assim que a cobrança PIX é gerada, o identificador PIX idem. Guardar não muda o status nem entra no payload: só a forma aprovada vai ao ERP.
- **FR-023**: Quando o operador desiste de uma cobrança TEF ou PIX, ou ela falha depois de criada, a forma MUST ficar na lista como excluída (riscada), e não sair dela.
- **FR-024**: Uma recusa sem cobrança criada e sem gesto do operador (sem usuário GAM, sem cliente, PIX abaixo do mínimo) MUST continuar tirando a forma da lista.
- **FR-025**: A recusa MUST ser registrada no `Log` com a descrição da forma, o valor e, quando houver, o identificador da cobrança TEF ou PIX; identificador ausente é omitido, nunca vazio (FR-014).
- **FR-026**: O identificador MUST ser o mesmo que o ERP recebe em `TEFPagId` / `FormaPixGUID` quando a forma é aprovada.

### Key Entities

- **Forma aplicada**: pagamento de uma venda. Estados: pendente de integração, aprovada, recusada, excluída. Excluída é terminal e permanece na lista.
- **Evento de forma removida**: registro de auditoria enviado ao ERP. Passa a ter descrição, valor, motivo e, quando houver, identificador da transação TEF ou da cobrança PIX.
- **Forma no retrato da venda**: o que o ERP recebe por forma. Para dinheiro, o valor passa a ser o recebido.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% dos estornos de TEF de vendas finalizadas chegam ao ERP com o identificador da transação, permitindo conciliar cada estorno com a transação da operadora.
- **SC-002**: Depois de um "Limpar", o operador continua vendo 100% das formas que a venda teve, cada uma com o rótulo legível do meio de pagamento.
- **SC-003**: 100% das NFCe pagas com dinheiro acima do total saem com o troco igual ao exibido na tela do Checkout.
- **SC-004**: Nenhuma venda recuperada ou importada com troco no documento é recusada ou mostra pagamento acima do total por causa do troco.
- **SC-005**: Nenhuma mudança no saldo, faltante e troco que o operador vê durante o pagamento.

## Assumptions

- O "Limpar" e a remoção individual continuam com as confirmações atuais (PIX gerado, valor vindo do documento); só o efeito final muda.
- O identificador PIX entra no evento pelo mesmo motivo do TEF (conciliação com a cobrança no banco). O usuário pediu explicitamente só o TEF; incluir o PIX não muda nada para o operador. **Corrigido em 2026-10-16 (US4):** a forma passa a guardar o identificador da cobrança PIX já na geração, então o PIX **pendente** desistido ou removido também leva o identificador (a antiga redação o deixava de fora por exigir mudar a 009; a US4 fez essa mudança).
- O valor registrado no evento é o valor que a forma tinha na venda: o aplicado e, para dinheiro, o recebido, que é o que de fato entrou na gaveta. Vale com ou sem a US3.
- O formato do histórico de auditoria (lista de eventos serializada no campo `Log`) não muda; só os detalhes do evento de forma removida ganham campos. O ERP armazena o `Log` sem interpretar campo a campo.
- A reconstrução do troco na importação (FR-020) compara as formas com o total dos itens importados. O desconto de capa de um documento não é importado hoje (lacuna anterior a esta feature). Num documento com desconto no cabeçalho, o excedente pode ficar subestimado e o troco não ser reconstruído; nesse caso a importação segue como hoje.
- **Corrigido em 2026-10-16 (US4):** a desistência do operador e a falha de uma cobrança já criada **deixam de** tirar a forma da lista; ela fica riscada. Só a recusa sem cobrança criada e sem gesto do operador (FR-024) continua saindo na hora.
- O identificador da cobrança só chega depois que o ERP responde à criação. Se o operador desistir antes dessa resposta, o `Log` sai sem identificador (cenário 4); uma resposta que chegue depois da desistência não é registrada. O Checkout continua sem cancelar a cobrança em voo, e a janela segue avisando isso.

## Dependencies

- **ERP aceitar a soma das formas acima do total quando o excedente é dinheiro** (US3): a validação prévia (`PCheckout_ValidarNFCe`) e o faturamento (`PCheckout_FaturarNFCe`) precisam aceitar o valor e calcular o troco. Hoje o Checkout nunca enviou esse cenário. A validação prévia não confere a soma (leitura da KB de 2026-08-31, research D1). O faturamento MUST ser confirmado antes do merge da US3, por homologação com o ERP real e, se possível, leitura de `PCheckout_FaturarNFCe` na KB (tarefa T029). Se o ERP recusar, a US3 sai do PR e US1/US2 seguem independentes.
- Supersede a decisão D3 de `specs/008-pagamento-geral/research.md` e ajusta D8 de `specs/011-recuperacao-nfce/research.md`; os dois documentos precisam ser corrigidos no ponto da decisão, não por anexo (regra de `docs/agents/domain.md`).
