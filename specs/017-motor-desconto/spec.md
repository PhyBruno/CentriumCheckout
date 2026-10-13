# Feature Specification: Motor de desconto do Checkout (capa e item)

**Feature Branch**: `feat/motor-desconto`

**Created**: 2026-10-13

**Status**: Draft

**Input**: User description: novo motor de desconto — desconto de capa aplicado automaticamente pela condição de pagamento (`CondicaoDesconto`) e limitado pelo teto da condição (`CondicaoDescontoMaximo`), enviado ao ERP em `CheckoutFaturarNFCe.DescontoCapaValor` sem rateio local; base de cálculo da capa é o subtotal já líquido dos descontos de item; preço unitário e desconto do item vinculados; desconto do item validado pelo preço mínimo do produto, com ajuste automático e aviso.

## Contexto

Hoje o Checkout trata desconto de forma solta, e isso gera três problemas que o operador e o ERP sentem:

1. **Preço e desconto do item não conversam.** O operador de um produto de preço editável pode digitar preço R$ 18 e desconto R$ 0 num item cujo preço de tabela é R$ 20, ou preço R$ 20 e desconto R$ 2. O resultado é o mesmo, mas a tela mostra duas verdades e o desconto real da venda fica invisível quando o operador mexe só no preço.
2. **Não existe limite de desconto.** O produto traz do ERP um preço mínimo, e o Checkout o descarta. O único freio é não deixar o item zerar. A condição de pagamento traz do ERP um desconto automático e um teto, e nenhum dos dois é lido.
3. **A capa é diluída antes de chegar ao ERP.** O Checkout reparte o desconto de capa em partes iguais entre os itens e o embute no desconto de cada um. O ERP recebe só o total por item e não consegue distinguir desconto de capa de desconto de item, nem aplicar a sua própria regra de rateio.

Esta feature substitui o desconto solto por um motor com regras explícitas: o preço e o desconto do item passam a ser a mesma informação vista de dois lados; o preço mínimo do produto e o teto da condição passam a limitar o desconto; a capa vai ao ERP como um valor único, para ele ratear.

**Regras vigentes que esta feature supera** (a serem reescritas nas specs de origem, não só anexadas ao fim):

- AD-098: rateio igual da capa entre os itens, feito no Checkout.
- AD-151: recusa de capa que deixaria um item abaixo de R$ 0,01 (`ZERA_UM_ITEM`), quando o rateio passa a ser do ERP.
- Spec 008, FR-014 e FR-015: desconto de item e de capa "sem teto".
- Spec 003, FR-014 e FR-015 e invariantes I8/I9: desconto de item como campo independente do preço.
- Spec 008, `data-model.md`: "`CondicaoDesconto` e `CondicaoDescontoMaximo` não alimentam nem limitam o desconto manual".

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Preço e desconto do item andam juntos (Priority: P1)

O operador inclui um produto de preço editável cujo preço de tabela é R$ 20,00. Ele digita R$ 18,00 no campo de preço e o campo de desconto passa a mostrar R$ 2,00 sozinho. Se ele apaga o desconto, o preço volta a R$ 20,00. Se digita R$ 5,00 de desconto, o preço desce para R$ 15,00. Não existe estado em que preço e desconto se contradigam.

**Why this priority**: é a regra mais usada do motor — todo desconto de item passa por ela — e é a fundação das outras duas: o preço mínimo (história 2) só tem sentido se preço e desconto forem a mesma grandeza. Entregue sozinha já elimina a ambiguidade de "o desconto foi dado ou não".

**Independent Test**: com um produto de preço editável cadastrado a R$ 20,00, percorrer os três gestos (digitar preço, digitar desconto, apagar desconto) e conferir que o outro campo acompanha e que o total da linha confere. Não exige condição de pagamento nem preço mínimo.

**Acceptance Scenarios**:

1. **Given** um produto de preço de tabela R$ 20,00, quantidade 1, **When** o operador digita R$ 18,00 no preço, **Then** o desconto mostra R$ 2,00 e o total da linha é R$ 18,00.
2. **Given** o item do cenário anterior, **When** o operador zera o desconto, **Then** o preço volta a R$ 20,00.
3. **Given** o mesmo produto, **When** o operador digita R$ 5,00 de desconto, **Then** o preço passa a R$ 15,00.
4. **Given** quantidade 3, preço de tabela R$ 20,00, **When** o operador digita R$ 18,00 no preço, **Then** o desconto mostra R$ 6,00 (R$ 2,00 por unidade, sobre o total da linha) e o total é R$ 54,00.
5. **Given** quantidade 3, preço R$ 18,00, desconto R$ 6,00, **When** o operador muda a quantidade para 5, **Then** o preço permanece R$ 18,00 e o desconto passa a R$ 10,00.
6. **Given** um produto de preço fixo (não editável) ou pesável, **When** o item é incluído, **Then** preço e desconto continuam somente leitura, como hoje.
7. **Given** um item em edição pelo lápis, **When** o operador altera quantidade, preço e desconto e confirma, **Then** a linha fica com o conjunto digitado ou com o conjunto ajustado pelas regras — nunca com parte das alterações aplicada e parte descartada.

---

### User Story 2 - Desconto de item limitado pelo preço mínimo (Priority: P2)

O produto tem preço mínimo de R$ 8,00 cadastrado no ERP. O operador tenta vender a R$ 6,00. O sistema não deixa o preço cair abaixo de R$ 8,00: ajusta o desconto para o maior valor permitido, mostra o preço e o desconto já corrigidos e avisa, em texto, qual é o preço mínimo do item e que o valor foi ajustado automaticamente.

**Why this priority**: protege a margem da loja e usa um dado que o ERP já entrega. Depende da história 1 (o desconto precisa ser a diferença do preço de tabela), por isso vem depois, mas pode ser entregue e demonstrada sozinha sobre ela.

**Independent Test**: com um produto de preço de tabela R$ 20,00 e mínimo R$ 8,00, digitar preço abaixo do mínimo (e, separadamente, desconto que levaria o preço abaixo) e verificar o ajuste, o aviso e o total. Repetir com produto sem preço mínimo e confirmar que não há limite.

**Acceptance Scenarios**:

1. **Given** preço de tabela R$ 20,00 e preço mínimo R$ 8,00, **When** o operador digita R$ 6,00 no preço, **Then** o preço passa a R$ 8,00, o desconto a R$ 12,00 e um aviso informa o preço mínimo do item (R$ 8,00) e que o valor foi ajustado automaticamente.
2. **Given** o mesmo produto, **When** o operador digita R$ 15,00 de desconto (levaria o preço a R$ 5,00), **Then** o desconto é limitado a R$ 12,00, o preço fica em R$ 8,00 e o mesmo aviso aparece.
3. **Given** quantidade 3, mínimo R$ 8,00, preço de tabela R$ 20,00, **When** o operador digita R$ 40,00 de desconto na linha, **Then** o desconto é limitado a R$ 36,00 (R$ 12,00 por unidade × 3) e o aviso aparece.
4. **Given** um produto sem preço mínimo cadastrado (valor zero ou ausente), **When** o operador dá qualquer desconto que não zere o item, **Then** nenhum limite nem aviso de preço mínimo é aplicado.
5. **Given** um desconto dentro do limite, **When** o operador confirma, **Then** nenhum aviso de preço mínimo aparece.
6. **Given** que o ajuste foi feito no campo, **When** o item é gravado na venda por qualquer caminho (barra de entrada, lápis, importação), **Then** a venda nunca contém item com preço abaixo do mínimo cadastrado, mesmo que a tela tenha sido contornada.

---

### User Story 3 - Capa preenchida pela condição de pagamento, com teto (Priority: P2)

O operador escolhe a condição de pagamento "À vista", que no ERP concede 5% de desconto, com teto de 8%. O campo de desconto de capa já aparece preenchido com 5%, calculado sobre o subtotal da venda já com os descontos de item. O operador pode trocar para 7%, remover, ou tentar 10% — que o sistema recusa, informando o teto da condição. Se ele escolher outra condição, a capa é recalculada pela nova condição e a que ele tinha digitado é descartada.

**Why this priority**: entrega o desconto automático e o teto que o ERP já cadastra. É independente das histórias de item. Fica em P2 porque o ERP ainda precisa estar pronto para receber o valor (história 4) antes de a loja usar isso em produção.

**Independent Test**: com duas condições de pagamento cadastradas (uma com desconto 5% e teto 8%, outra com desconto 0% e teto 0%), escolher cada uma e verificar o preenchimento, a edição dentro do teto, a recusa acima do teto e o bloqueio quando o teto é zero.

**Acceptance Scenarios**:

1. **Given** uma venda de subtotal líquido R$ 100,00 e condição com desconto 5% e teto 8%, **When** o operador escolhe a condição, **Then** a capa fica em 5% (R$ 5,00) e o total a pagar é R$ 95,00.
2. **Given** a capa automática aplicada, **When** o operador digita 7%, **Then** a capa passa a 7%; **When** digita 10%, **Then** a capa é ajustada ao teto da condição (8%), o campo passa a mostrar 8% e um aviso em texto informa o teto e que o valor foi ajustado automaticamente.
3. **Given** a capa automática aplicada, **When** o operador a remove, **Then** o total volta a R$ 100,00 e a condição continua escolhida.
4. **Given** uma capa digitada pelo operador (7%), **When** ele escolhe outra condição, **Then** a capa digitada é descartada e a nova condição define a capa (ou a deixa vazia, se ela não tiver desconto).
5. **Given** uma condição de teto zero, **When** o operador a escolhe ou tenta digitar qualquer desconto de capa, **Then** o campo fica bloqueado com a explicação de que a condição não permite desconto.
6. **Given** uma condição com desconto automático maior que o próprio teto (cadastro incoerente no ERP), **When** o operador a escolhe, **Then** a capa é aplicada limitada ao teto e o operador é avisado.
7. **Given** itens com desconto próprio (por exemplo, subtotal bruto R$ 120,00 e R$ 20,00 de desconto de item), **When** a capa de 10% é aplicada, **Then** ela incide sobre R$ 100,00 (o subtotal já líquido), ou seja, R$ 10,00 — e não sobre R$ 120,00.
8. **Given** que já existe pagamento aplicado, **When** o operador tenta trocar a condição, **Then** a troca é recusada como hoje e a capa não muda.
9. **Given** uma condição escolhida cuja capa automática igualaria ou excederia o subtotal da venda, **When** a condição é escolhida, **Then** a capa não é aplicada e o operador é avisado.
10. **Given** nenhuma condição escolhida, **When** o operador digita desconto de capa, **Then** não há teto de condição a aplicar (comportamento anterior preservado).

---

### User Story 4 - Capa vai ao ERP como valor único, sem rateio local (Priority: P3)

Ao finalizar, suspender ou validar a venda, o Checkout envia o desconto de capa como um valor único em campo próprio do documento, e cada item leva apenas o seu desconto individual (de convênio e manual). O ERP reparte a capa entre os itens pela regra dele e soma ao desconto de cada item. A mudança só entra em vigor quando a loja a liga explicitamente; até lá o comportamento atual (rateio no Checkout) continua.

**Why this priority**: sem esta história o ERP segue recebendo capa diluída, mas as histórias 1 a 3 funcionam do mesmo jeito para o operador. Depende de o ERP criar o campo, que está fora do controle do Checkout; por isso é a última, e nasce desligada.

**Independent Test**: com a chave desligada, finalizar uma venda com capa e conferir que o envio é idêntico ao de hoje (capa repartida nos itens). Com a chave ligada, finalizar a mesma venda e conferir que o documento leva o valor da capa em campo próprio e que a soma dos descontos por item não inclui a capa.

**Acceptance Scenarios**:

1. **Given** a chave desligada e uma venda com capa de R$ 3,00 e três itens, **When** a venda é finalizada, **Then** o envio é exatamente o de hoje: a capa repartida em partes iguais nos descontos dos itens, sem campo de capa no cabeçalho.
2. **Given** a chave ligada e a mesma venda, **When** a venda é finalizada, **Then** o cabeçalho leva a capa de R$ 3,00 em campo próprio, e o desconto de cada item contém só o seu convênio e o seu desconto manual.
3. **Given** a chave ligada, **When** a venda é validada antes do pagamento ou suspensa, **Then** o documento enviado nessas operações tem a mesma forma do documento da finalização.
4. **Given** a chave ligada e uma venda sem capa, **When** ela é enviada, **Then** o campo de capa vai com valor zero (ou é omitido, conforme o contrato do ERP) e o resto do documento não muda.
5. **Given** a chave ligada, **When** a capa igualar ou exceder o subtotal da venda, **Then** a capa é recusada na digitação, como hoje; a recusa "deixaria um item abaixo de R$ 0,01" deixa de existir, porque o rateio é do ERP.
6. **Given** um DAV ou NFCe importado cujo desconto de capa já vem diluído nos itens, **When** a venda é aberta, **Then** o comportamento da importação não muda: o desconto vira desconto manual de item e a capa começa vazia.

---

### Edge Cases

- **Preço de tabela zero.** Produto de preço livre cujo preço cadastrado é zero: não há referência para calcular desconto. Preço e desconto continuam independentes, e não há validação de mínimo (comportamento de hoje).
- **Preço digitado acima do preço de tabela.** Não existe acréscimo: o preço digitado passa a ser o preço do item e o desconto fica em zero.
- **Preço mínimo igual ou maior que o preço de tabela.** O limite de desconto é zero: qualquer desconto é ajustado de volta a zero e o aviso aparece.
- **Divisão não exata.** Desconto de R$ 1,00 numa linha de quantidade 3 resulta num preço unitário com fração de centavo. O desconto total é a verdade; o preço exibido é arredondado ao centavo, e o total da linha nunca diverge do desconto digitado.
- **Desconto de convênio.** O desconto automático do convênio do cliente continua separado e calculado como hoje. Ele não entra na comparação com o preço mínimo (o mínimo compara com o preço após o desconto manual).
- **Item cancelado e capa ativa.** O carrinho continua congelado enquanto houver capa; nada na regra de congelamento muda.
- **Capa e pagamento já aplicado.** A capa não pode ser alterada com pagamento vivo, como hoje.
- **Operador troca de condição sem capa digitada.** A capa passa a ser a da nova condição (pode ser vazia).
- **Teto da condição ausente.** Condição que não traz o campo do teto é tratada como teto zero (nenhum desconto de capa).
- **ERP sem o campo de capa.** Chave ligada e ERP que ainda não lê o campo: o desconto não aparece na nota. É risco de implantação, não de operação, e é tratado na ordem de virada (ver Dependências).

## Requirements *(mandatory)*

### Functional Requirements

**Desconto de item**

- **FR-001**: O sistema MUST manter preço unitário e desconto de um item como a mesma informação: alterar um recalcula o outro de imediato, sem estado em que contradigam.
- **FR-002**: O desconto do item MUST continuar sendo valor absoluto sobre o total da linha, igual a (preço de tabela − preço praticado) × quantidade.
- **FR-003**: Quando o preço digitado for menor que o preço de tabela, o sistema MUST calcular o desconto por diferença. Quando o desconto digitado for zero, o preço MUST voltar ao preço de tabela. Quando o preço digitado for maior que o de tabela, o desconto MUST ser zero e o preço digitado passa a valer.
- **FR-004**: Quando a quantidade de um item mudar, o sistema MUST manter o preço praticado e recalcular o desconto total da linha.
- **FR-005**: Quando o preço de tabela do produto for zero ou ausente, o sistema MUST manter preço e desconto independentes e MUST NOT aplicar validação de preço mínimo.
- **FR-006**: O vínculo entre preço e desconto MUST valer apenas onde o operador hoje pode editar esses campos (produto de preço editável); produto de preço fixo ou pesável permanece somente leitura.
- **FR-007**: A edição de um item existente (quantidade, preço e desconto) MUST ser aplicada como uma única operação: ou o conjunto resultante é gravado, ou nada é gravado. Estado parcial MUST NOT ocorrer.
- **FR-008**: O sistema MUST continuar recusando desconto que deixe o total da linha abaixo de R$ 0,01 (regra existente), com a mesma mensagem explicativa.

**Preço mínimo**

- **FR-009**: O sistema MUST ler o preço mínimo do produto no cadastro do ERP e usá-lo em toda decisão de desconto daquele item durante a venda. Valor zero ou ausente significa "sem preço mínimo".
- **FR-010**: Quando o preço praticado, após o desconto manual, ficar abaixo do preço mínimo, o sistema MUST ajustar o desconto automaticamente para o maior valor que mantém o preço no mínimo e MUST informar o operador, em texto, qual é o preço mínimo do item e que o valor foi ajustado automaticamente.
- **FR-011**: O limite do FR-010 MUST ser: desconto máximo da linha = (preço de tabela − preço mínimo) × quantidade, com piso em zero.
- **FR-012**: A regra do preço mínimo MUST valer na inclusão de produto, na edição de item existente e em qualquer outro caminho que grave um item na venda, de modo que nenhum deles produza item abaixo do mínimo, mesmo que a tela seja contornada.
- **FR-013**: O ajuste automático MUST notificar o operador uma única vez por ocorrência; a mesma situação MUST NOT gerar dois avisos.
- **FR-014**: O desconto de convênio MUST ficar fora da comparação com o preço mínimo.

**Desconto de capa — condição de pagamento**

- **FR-015**: Ao escolher uma condição de pagamento, o sistema MUST aplicar como desconto de capa o percentual de desconto da condição, calculado sobre o subtotal líquido dos descontos de item.
- **FR-016**: O operador MUST poder alterar ou remover a capa aplicada, em percentual ou em valor, desde que o resultado não ultrapasse o teto da condição. Uma digitação acima do teto MUST ser ajustada automaticamente ao teto, com aviso em texto informando o teto e que o valor foi ajustado — o mesmo tratamento que o preço mínimo recebe no item (FR-010). Ajustar, e não recusar, porque a capa é gravada a cada tecla: ao digitar "10", o "1" já foi uma capa válida, e "voltar ao último valor válido" restauraria um valor que o operador nunca escolheu.
- **FR-017**: O teto da condição MUST ser tratado como percentual do subtotal líquido; um valor digitado em reais MUST ser comparado pelo seu equivalente em percentual.
- **FR-018**: Teto zero ou ausente numa condição MUST significar que nenhum desconto de capa é permitido nela: o campo fica bloqueado e explica o motivo.
- **FR-019**: Trocar a condição MUST recalcular a capa a partir da nova condição e MUST descartar a capa digitada anteriormente.
- **FR-020**: Quando o desconto automático da condição for maior que o teto da mesma condição, o sistema MUST aplicar a capa limitada ao teto e MUST avisar o operador.
- **FR-021**: Quando a capa automática igualar ou exceder o subtotal da venda, o sistema MUST NOT aplicá-la e MUST avisar o operador.
- **FR-022**: Quando nenhuma condição estiver escolhida, o sistema MUST preservar o comportamento atual, sem teto de condição.
- **FR-023**: A base de cálculo da capa MUST ser sempre o subtotal já líquido dos descontos de item (convênio e manual).
- **FR-024**: A capa MUST continuar congelando a edição do carrinho enquanto existir, e MUST continuar impedindo alterações com pagamento já aplicado.
- **FR-025**: O sistema MUST registrar na trilha de auditoria da venda se a capa veio da condição ou foi digitada pelo operador.

**Desconto de capa — envio ao ERP**

- **FR-026**: Existindo uma chave de ambiente do servidor intermediário ligada, o sistema MUST enviar a capa como valor único em campo próprio do cabeçalho do documento de faturamento, e MUST NOT ratear a capa nos itens: o desconto de cada item MUST conter apenas convênio e manual.
- **FR-027**: Com a chave desligada, que é o estado inicial, o sistema MUST manter integralmente o comportamento atual (capa repartida em partes iguais entre os itens, sem campo de capa no cabeçalho).
- **FR-028**: O documento enviado na validação prévia, na suspensão e na finalização MUST ter a mesma forma, em ambos os estados da chave.
- **FR-029**: Com a chave ligada, a recusa de capa por "deixaria um item abaixo de R$ 0,01" MUST deixar de valer; a recusa por "igualaria ou excederia o subtotal da venda" MUST continuar.
- **FR-030**: A importação de DAV e de NFCe MUST manter o comportamento atual, tratando o desconto diluído nos itens como desconto manual de item e iniciando a venda sem capa.

### Key Entities

- **Item da venda**: linha com produto, quantidade, preço de tabela de referência, preço praticado, desconto manual (valor absoluto sobre o total da linha), desconto de convênio e preço mínimo do produto.
- **Desconto de capa**: desconto da venda inteira, com modo de entrada (percentual ou valor), valor resolvido em reais, e origem (condição ou digitado).
- **Condição de pagamento**: opção escolhida pelo operador, com percentual de desconto automático e percentual de teto de desconto, ambos vindos do ERP.
- **Chave de virada**: configuração do servidor intermediário que decide se a capa é repartida no Checkout ou enviada ao ERP em campo próprio.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em 100% dos gestos de edição de preço ou desconto de um item, o outro campo reflete o novo valor no mesmo gesto, sem que o operador precise sair do campo ou confirmar duas vezes.
- **SC-002**: Em nenhuma venda finalizada existe item com preço praticado abaixo do preço mínimo do produto no ERP, por qualquer caminho de inclusão ou edição.
- **SC-003**: Em 100% das tentativas de desconto de item abaixo do mínimo, o operador é informado em texto do preço mínimo e de que o valor foi ajustado, sem precisar consultar outro sistema.
- **SC-004**: Ao escolher uma condição de pagamento com desconto, o operador chega ao total a pagar com desconto sem digitar nada — zero campos preenchidos manualmente no caminho feliz.
- **SC-005**: Nenhuma venda aceita desconto de capa acima do teto da condição escolhida.
- **SC-006**: O total de uma venda com desconto de item e capa confere com o cálculo manual em reais: capa = percentual × (subtotal bruto − descontos de item), sem divergência de centavo.
- **SC-007**: Com a chave desligada, 100% dos documentos enviados ao ERP são idênticos aos de antes da mudança; com a chave ligada, o valor do campo de capa é igual ao desconto de capa exibido ao operador em 100% das vendas.
- **SC-008**: O operador conclui uma venda com desconto de item, capa e pagamento no mesmo número de gestos que hoje ou menos.

## Dependencies

- **ERP — campo de capa.** O ERP precisa criar o campo de desconto de capa no documento de faturamento (`CheckoutFaturarNFCe.DescontoCapaValor`) e rateá-lo entre os itens, somando ao desconto individual. Até lá, a chave fica desligada. O nome e o tipo exatos do campo precisam ser confirmados com o ERP antes de ligar.
- **ERP — cadastro de tetos.** A maioria das condições de pagamento hoje vem com teto zero. Ligar a regra do teto sem cadastrar tetos bloquearia o desconto de capa em quase todas as condições; o cadastro precisa ser revisado antes da virada.
- **ERP — preço mínimo.** O cadastro do produto já entrega o preço mínimo; valores zero são tratados como "sem mínimo".

**Ordem de virada sugerida**: (1) ERP cria e testa o campo; (2) cadastro de tetos revisado; (3) chave ligada numa loja piloto; (4) demais lojas.

## Assumptions

- O preço de tabela de referência do item é o preço de venda que o ERP entrega com o produto no momento da inclusão. Para produtos de preço por faixa de quantidade, a referência segue o que o motor de precificação já resolve para a quantidade do item.
- O vínculo entre preço e desconto só se aplica a itens cujos campos o operador já pode editar hoje.
- O preço mínimo é comparado com o preço do item após o desconto manual; o desconto automático do convênio não entra na comparação.
- Sem condição de pagamento escolhida, a capa continua livre. Se existir condição padrão importada de um documento, ela segue as regras da condição escolhida.
- A mensagem de ajuste por preço mínimo e as de recusa por teto são avisos em texto, no mesmo padrão das demais notificações do Checkout.
- O desconto de capa em modo percentual aceita uma casa decimal, e em modo valor aceita duas, como hoje.
- Escopo fora desta feature: desconto percentual por item como campo próprio, alçada/autorização de gerente para exceder tetos, relatório de descontos concedidos, e leitura de capa em DAV/NFCe importados (depende de o ERP devolvê-la no documento).
- Esta feature supera parcialmente as decisões AD-098, AD-151 e as regras de desconto sem teto das specs 003 e 008; a reescrita dessas passagens nas specs de origem e o registro de um novo AD em `.specs/project/STATE.md` fazem parte da implementação.
