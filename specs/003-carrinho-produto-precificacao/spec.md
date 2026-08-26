# Feature Specification: Carrinho, Busca/Inserção de Produto e Motor de Precificação

**Feature Branch**: `[003-carrinho-produto-precificacao]`

**Created**: 2026-08-26

**Status**: Draft

**Input**: User description: "O operador precisa inserir produtos na venda por busca livre ou por código já conhecido, com o preço correto aplicado automaticamente conforme as regras de precificação do produto — recalculado a cada mutação relevante do carrinho, sem depender de recálculo manual, e com itens cancelados preservados para auditoria."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Busca de produto por termo livre (Priority: P1)

Como operador de caixa, quero buscar produto por termo livre quando não sei o código exato, para listar candidatos e selecionar o certo.

**Why this priority**: Caminho de entrada obrigatório quando o operador não tem o código em mãos.

**Independent Test**: Pode ser testado buscando um termo parcial e confirmando que os candidatos retornados incluem o produto esperado.

**Acceptance Scenarios**:

1. **Given** o operador não sabe o código do produto, **When** ele digita um termo de busca, **Then** o sistema lista os produtos candidatos correspondentes.
2. **Given** uma lista de candidatos exibida, **When** o operador seleciona um deles, **Then** as informações de preço desse produto ficam disponíveis para o restante da venda sem precisar buscar de novo.

---

### User Story 2 - Inserção direta por código conhecido (Priority: P1)

Como operador de caixa, quero inserir um produto direto pelo código de barras bipado ou digitado, sem passar pela busca, para agilizar a operação.

**Why this priority**: Fluxo mais comum no dia a dia do ponto de venda — velocidade é crítica.

**Independent Test**: Pode ser testado bipando/digitando um código conhecido e confirmando que o item entra na venda sem passar por tela de busca.

**Acceptance Scenarios**:

1. **Given** o operador conhece o código do produto, **When** ele bipa ou digita esse código, **Then** o produto é localizado e inserido na venda diretamente.
2. **Given** um produto já inserido na venda, **When** o mesmo produto é inserido novamente, **Then** o sistema reaproveita as informações já conhecidas dele, sem nova consulta.
3. **Given** o operador digitando o código de um produto, **When** ele informa o código seguido de uma quantidade (ex.: "código*quantidade") e confirma, **Then** o item entra na venda com a quantidade informada; **When** ele informa só o código e confirma, **Then** o item entra com quantidade 1.

---

### User Story 3 - Preço sempre correto, sem recálculo manual (Priority: P1)

Como operador de caixa, quero que o preço de cada item reflita automaticamente a regra de precificação correta do produto, sem precisar recalcular manualmente.

**Why this priority**: Lógica de negócio crítica — um erro aqui é um erro de cobrança ao cliente.

**Independent Test**: Pode ser testado inserindo quantidade suficiente de um produto para cruzar uma faixa de preço por quantidade e confirmando que todas as unidades daquele produto na venda passam a valer o preço da faixa atingida; e cancelando parte dessa quantidade, confirmando que o preço volta para a faixa inferior.

**Acceptance Scenarios**:

1. **Given** um produto com preço por faixa de quantidade, **When** a quantidade total desse produto na venda atinge o limiar de uma faixa, **Then** todas as unidades desse produto na venda passam a valer o preço dessa faixa.
2. **Given** qualquer mutação relevante em um produto do carrinho (inserção, edição de quantidade, cancelamento), **When** essa mutação acontece, **Then** o sistema recalcula automaticamente o preço de todas as linhas ativas daquele produto, sem ação manual do operador.
3. **Given** uma linha cancelada que reduz a quantidade total de um produto abaixo de um limiar de faixa, **When** o cancelamento acontece, **Then** o sistema recalcula automaticamente as linhas restantes desse produto para a faixa inferior.

---

### User Story 4 - Item cancelado permanece rastreável (Priority: P1)

Como operador de caixa, ao cancelar um item por engano de inserção, quero que ele fique visível como cancelado na lista da venda (não desapareça), para que fique rastreável.

**Why this priority**: Requisito de auditoria da venda — sem isso, um cancelamento não deixa rastro.

**Independent Test**: Pode ser testado cancelando um item e confirmando que ele permanece visível, marcado como cancelado, e que o total da venda não o inclui.

**Acceptance Scenarios**:

1. **Given** um item já inserido na venda, **When** o operador o cancela, **Then** o item permanece visível na lista, marcado como cancelado, em vez de ser removido.
2. **Given** um item marcado como cancelado, **When** o sistema calcula quantidades e totais da venda, **Then** esse item é excluído desse cálculo.

---

### Edge Cases

- O que acontece quando o operador digita menos caracteres do que o mínimo necessário para buscar um produto? O sistema exige um tamanho mínimo de termo de busca, configurado para o ambiente, antes de retornar resultados.
- Como o sistema aplica um desconto especial de convênio do cliente, quando existir? Automaticamente, como percentual aplicado aos itens elegíveis, sem entrada manual do operador.
- O que acontece quando o produto é do tipo pesável (identificado no cadastro do produto)? A quantidade e o preço desse item são obtidos a partir da informação embutida no código de barras gerado pela balança, sem digitação manual; se o preço do produto não estiver disponível para esse cálculo, o sistema bloqueia a inserção e avisa o operador.
- Como o sistema trata um produto não pesável marcado como editável no cadastro? Ao ser identificado, o item não entra na venda imediatamente — o operador pode revisar e ajustar preço, unidade, quantidade e desconto antes de confirmar a inserção.
- Como o sistema trata um produto não pesável e não editável? O item entra na venda imediatamente, com preço, unidade, quantidade e desconto já resolvidos e somente leitura.
- O que acontece quando qualquer forma de pagamento já foi aprovada na venda? Edição e cancelamento de item ficam bloqueados; para algumas formas de pagamento esse bloqueio é permanente pelo resto da venda, para outras a remoção do próprio pagamento reabilita a edição.
- O sistema exige aprovação de supervisor ou reautenticação para cancelar um item? Não — o único bloqueio de cancelamento é um pagamento já aprovado (ver acima).
- O sistema valida saldo/estoque disponível ao inserir um produto? Não — essa validação é de responsabilidade do ERP, não do Checkout.
- O que acontece com o preço de um item quando a venda é retomada a partir de um rascunho salvo ou de um documento importado? O preço fica congelado exatamente como estava salvo, sem recálculo automático, até que o operador reinsira ou edite esse item explicitamente.
- O que acontece com os preços já calculados quando o cliente da venda é trocado com o carrinho já populado? Para produtos cujo preço depende do cliente (lista de preço específica), o sistema recalcula automaticamente.
- O uso de múltiplas formas de pagamento na mesma venda (pagamento dividido) cria alguma restrição adicional de edição/cancelamento de item? Não — a mesma regra única de bloqueio por pagamento aprovado se aplica, independente de a venda ter uma ou várias formas de pagamento.
- Como o sistema arredonda um cálculo monetário que não fecha em centavos exatos? Usa centavos inteiros por linha, distribuindo a sobra um centavo por vez às linhas com maior parte fracionária descartada, da maior para a menor, até zerar — nunca fração de centavo.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST permitir que o operador busque um produto por termo livre quando não sabe o código exato, retornando uma lista de candidatos para seleção.
- **FR-002**: O sistema MUST permitir que o operador insira um produto diretamente por um código conhecido (bipado ou digitado), sem passar pela busca.
- **FR-003**: O sistema MUST reaproveitar as informações de preço já conhecidas de um produto já presente na venda quando ele é inserido novamente, sem nova consulta.
- **FR-004**: O sistema MUST permitir que o operador digite um código de produto seguido de uma quantidade numa única entrada para inserir o item já com essa quantidade; digitar só o código MUST resultar em quantidade padrão igual a 1.
- **FR-005**: O sistema MUST aplicar a cada item o preço já resolvido para aquele produto conforme a regra de precificação vigente para a sessão do operador, sem precisar decidir localmente qual regra vale.
- **FR-006**: Quando um produto é precificado por faixa de quantidade, o sistema MUST aplicar a faixa atingida pela quantidade total desse produto acumulada na venda inteira a todas as unidades desse produto na venda, não só às unidades recém-inseridas.
- **FR-007**: O sistema MUST recalcular automaticamente o preço de todas as linhas ativas (não congeladas) de um produto sempre que houver uma mutação relevante nele (inserção, edição de quantidade, cancelamento), sem exigir recálculo manual.
- **FR-008**: Quando o cancelamento de uma linha reduz a quantidade acumulada de um produto abaixo de um limiar de faixa, o sistema MUST recalcular automaticamente as linhas ativas restantes desse produto para a faixa inferior.
- **FR-009**: O sistema MUST manter um item cancelado visível na venda, marcado como cancelado, em vez de removê-lo, para fins de auditoria — e MUST excluí-lo dos cálculos de quantidade e total.
- **FR-010**: O sistema MUST bloquear edição e cancelamento de qualquer item do carrinho assim que uma forma de pagamento tiver sido aprovada na venda, exceto quando esse pagamento específico puder ser removido, o que reabilita a edição/cancelamento pelo restante da venda.
- **FR-011**: O sistema MUST NOT exigir validação de saldo/estoque disponível para permitir a inserção de um produto no carrinho.
- **FR-012**: O sistema MUST NOT exigir aprovação de supervisor ou reautenticação para cancelar um item do carrinho.
- **FR-013**: Para um produto pesável, o sistema MUST obter tanto a quantidade quanto o preço aplicável a partir da informação embutida no código de barras gerado pela balança, sem digitação manual, e MUST bloquear a inserção (com aviso ao operador) quando o preço do produto não estiver disponível para completar esse cálculo.
- **FR-014**: Para um produto não pesável marcado como editável, o sistema MUST permitir que o operador revise e ajuste preço, unidade, quantidade e desconto antes de o item ser efetivamente adicionado à venda, em vez de inseri-lo imediatamente.
- **FR-015**: Para um produto não pesável e não editável, o sistema MUST inserir o item na venda imediatamente, com preço, unidade, quantidade e desconto já resolvidos e somente leitura.
- **FR-016**: O sistema MUST arredondar qualquer cálculo monetário que não feche em centavos exatos para centavos inteiros, distribuindo a sobra de arredondamento entre as linhas afetadas um centavo por vez, na ordem da maior parte fracionária descartada para a menor.
- **FR-017**: O sistema MUST preservar o preço de um item exatamente como estava quando a venda é retomada a partir de um rascunho salvo ou de um documento importado, sem disparar recálculo automático para esse item, até que o operador o reinsira ou edite explicitamente.
- **FR-018**: O sistema MUST recalcular o preço de um item quando o cliente da venda é trocado com o carrinho já populado, para todo produto cujo preço dependa de uma lista de preço específica do cliente.

### Key Entities *(include if feature involves data)*

- **Item do Carrinho**: um produto inserido na venda, com sua quantidade, preço resolvido, desconto e estado (ativo ou cancelado).
- **Faixa de Preço por Quantidade**: uma regra de precificação por limiar, em que a quantidade total de um produto acumulada na venda determina o preço unitário aplicado a todas as suas unidades.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: O preço aplicado nunca diverge entre linhas do mesmo produto na mesma venda.
- **SC-002**: Nenhum recálculo de preço exige uma ação manual do operador.
- **SC-003**: Todo item cancelado permanece rastreável (visível, marcado como cancelado) até o fim da venda.

## Assumptions

- A disponibilidade de saldo/estoque é controlada inteiramente pelo ERP; o Checkout não duplica essa validação.
- O conjunto de regras de precificação que um produto pode seguir, e qual delas vale para a sessão do operador, é determinado inteiramente pelo ERP; o Checkout aplica o valor que recebe, sem reimplementar essa lógica de seleção.
- O conceito de "produto pai" (agrupamento) e um modelo de precificação progressivo por banda estão fora de escopo — a precificação por faixa é de limiar único (flat): atingida a faixa, todas as unidades do produto na venda valem o preço dela.
