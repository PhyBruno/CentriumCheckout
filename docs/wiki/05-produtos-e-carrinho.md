# 05. Produtos e carrinho

> Como lançar produtos na venda (bipando, digitando ou buscando), corrigir um item, cancelar itens e entender como o preço é calculado.

**Quem usa:** Operador de caixa

## Para que serve

A **entrada de produto** e a **lista de itens** formam o carrinho da venda. É aqui que você monta o que o cliente vai pagar. O Checkout busca o produto no ERP, aplica o preço certo e mostra o total de cada linha e o subtotal da venda.

## Antes de começar

Siga a ordem da venda. Ela existe para evitar preço errado e nota sem vendedor:

1. **Vendedor e cliente primeiro.** Sem vendedor, o Checkout não aceita produto. O cliente não pode mais ser trocado depois que há item. Veja os capítulos [03](03-identificar-cliente.md) e [04](04-selecionar-vendedor.md).
2. **Itens depois.** Monte o carrinho inteiro.
3. **Pagamento por último.** Ao escolher a **condição de pagamento**, a venda "congela": você não consegue mais incluir, editar nem cancelar itens, nem trocar vendedor ou cliente. Para voltar a editar, use **Limpar** no cartão **Pagamento**.

![Entrada de produto vazia, pronta para bipar: campo de código com o texto "Bipe ou digite (use * p/ quantidade)", lupa, Quantidade 1,000, Unidade, Preço unitário, Desconto do item, Total item e o botão Adicionar ao carrinho.](imagens/05-01-entrada-de-produto.png)
*Figura 05.01 — Entrada de produto pronta para uso.*

## Passo a passo

### Lançar um produto bipando ou digitando o código

1. Clique no campo de código. Ele já fica selecionado quando a tela abre e depois de cada item lançado.
2. Bipe o código de barras ou digite o código e pressione **Enter**.
3. O produto entra na lista com **quantidade 1**, o preço do ERP e o total da linha. O cursor volta ao campo de código para o próximo item.

O nome do campo muda conforme o seu cadastro no ERP: **Código reduzido**, **Código de barras**, **Referência** ou **Código do produto**. O tipo de código aceito é o do seu usuário no ERP.

> **Dica:** a tecla **Tab** no campo de código faz o mesmo que **Enter**. **Shift+Tab** volta ao campo de cliente.

### Lançar vários da mesma coisa de uma vez (quantidade com asterisco)

1. No campo de código, digite a **quantidade, um asterisco e o código**. Exemplo: `3*789000000001`.
2. Pressione **Enter**.
3. A quantidade é sempre o número **antes** do `*`. Aceita decimais, com vírgula ou ponto (por exemplo `0,5*123`).

### Produto de balança (etiqueta de peso)

Etiquetas de balança com 13 dígitos começando por **2** são lidas pelo Checkout. Ele calcula a quantidade pelo valor da etiqueta e pelo preço do produto no ERP. Bipe a etiqueta como qualquer código.

### Buscar um produto que você não sabe o código

1. Clique na lupa **Buscar produto**, ou pressione **F4**.
2. Na janela **Consultar produto** ("Busque por código, descrição, SKU ou referência"), digite o termo. Digite pelo menos o número mínimo de caracteres que a janela pedir; esse número vem da configuração da loja.
3. A lista mostra **Código**, **Produto**, **Saldo** e **Unidade**, com a referência e o EAN abaixo do nome. Use **Anterior** e **Próxima** para mudar de página.
4. Se quiser, use o filtro de **Saldo** (**Saldo maior ou igual a**, **Saldo menor ou igual a** ou **Saldo igual a**) para esconder produtos sem estoque. O filtro vale só para a página que você está vendo.
5. Clique no produto. Produtos comuns entram direto na lista. Produtos que exigem digitar quantidade, preço ou desconto abrem na barra de entrada para você preencher e confirmar.
6. Para sair sem escolher, clique em **Fechar** ou pressione **Esc**.

![Janela Consultar produto com a busca preenchida, o filtro de saldo no canto, a lista de produtos fictícios nas colunas Código, Produto, Saldo e Unidade e o rodapé de paginação.](imagens/05-02-busca-produto.png)
*Figura 05.02 — Janela Consultar produto.*

### Produto com preço ou desconto editável

Alguns produtos têm o preço ou o desconto liberados para o operador no cadastro do ERP. Para esses, ao bipar:

1. O produto **não** entra direto. Ele abre na barra de entrada, com **Quantidade**, **Preço unitário** e **Desconto do item** liberados para digitar.
2. Preencha o que for necessário. O **Total item** mostra o resultado.
3. Pressione **Enter** ou clique em **Adicionar ao carrinho**.

### Mudar a quantidade antes de lançar

1. Com o produto na barra (quando ele abre para revisão), use os botões de menos (**Diminuir quantidade**) e de mais (**Aumentar quantidade**) ou digite a quantidade no campo **Quantidade**.
2. A quantidade aceita até três casas decimais e precisa ser maior que zero.
3. Clique em **Adicionar ao carrinho** (ou **Enter**). Para desistir, pressione **Esc**.

### Corrigir um item já lançado (lápis)

1. Na linha do item, clique no lápis (**Editar item**).
2. O item sobe para a barra de entrada. O botão passa a ser **Confirmar edição**, e o código fica travado: ("O código não muda na edição de um item já lançado: cancele com Esc para inserir outro produto.").
3. Ajuste a quantidade. Nos produtos de preço editável, ajuste também o preço e o desconto.
4. Pressione **Enter** ou clique em **Confirmar edição**. Para desistir, pressione **Esc**.

> **Atenção:** o lápis só funciona em produtos que o ERP marca como editáveis ou pesáveis. Em um produto comum, o lápis fica apagado. Para mudar a quantidade de um produto comum, cancele a linha e lance de novo com a quantidade (`3*código`).

### Cancelar um item (lixeira)

1. Na linha do item, clique na lixeira (**Cancelar**).
2. A linha **não some**: ela fica **riscada** e deixa de somar no total. O Checkout guarda o cancelamento para a auditoria (capítulo [18](18-auditoria-de-acoes.md)).
3. O item cancelado não pode ser reativado. Lance o produto de novo, se preciso.

![Lista de itens com uma linha cancelada: a segunda linha riscada em cinza, sem botões de ação, e o subtotal somando só as outras linhas.](imagens/05-03-item-cancelado.png)
*Figura 05.03 — Item cancelado (riscado) na lista.*

### Cancelar a venda inteira

O botão **Cancelar venda**, na base da coluna de venda, **suspende** a venda: ela vira rascunho no ERP e o caixa fica limpo. O capítulo [10. Finalizar e suspender a venda](10-finalizar-e-suspender-venda.md) explica o passo a passo e os cuidados (por exemplo, quando já existe PIX gerado).

## Regras e bloqueios

### Como o preço é calculado

- **Preço padrão:** o ERP já informa o preço do produto na sua loja e para o cliente da venda. O Checkout usa esse valor.
- **Preço por faixa de quantidade:** em lojas configuradas assim, o produto tem preços diferentes conforme a quantidade vendida. Quando a **soma das quantidades do mesmo produto** na venda atinge a faixa, **todas as unidades** passam a valer o preço da faixa, inclusive as linhas lançadas antes. Se você cancelar uma linha e a quantidade cair abaixo da faixa, o preço volta ao da faixa anterior. Isso acontece sozinho, a cada item lançado, editado ou cancelado.
- **Desconto de convênio:** clientes com convênio recebem um desconto automático por item, que aparece na coluna **Desconto**.
- **Desconto do item:** só em produtos de preço editável, digitado em reais no campo **Desconto do item**. Ele **nunca pode zerar o item**: o total da linha tem de ficar em pelo menos R$ 0,01.
- **Subtotal e Total a pagar:** o **Subtotal**, no rodapé da lista, soma os itens ativos. O **Total a pagar**, no painel de pagamento, também considera o desconto aplicado à venda inteira (capítulo [06](06-pagamento.md)).

### Estoque

Se o ERP da sua loja valida o saldo de estoque, o Checkout confere o saldo antes de lançar ou de aumentar a quantidade. A regra vem do cadastro da loja:

- **Avisa:** a frase "Estoque insuficiente para (produto): disponível X, na venda Y." aparece, mas o item entra.
- **Bloqueia:** a frase aparece e o item **não entra**. Ele fica na barra para você reduzir a quantidade.
- **Não valida:** nenhuma checagem.

A conta considera tudo o que já está na venda do mesmo produto. Quantidade igual ao saldo passa.

### Bloqueios dos botões

| Botão ou campo | Fica bloqueado quando | Motivo exibido |
|---|---|---|
| Campo de código, **Buscar produto** (**F4**), **Editar item** e **Cancelar** (lixeira) | A venda já está em pagamento (condição escolhida ou pagamento aprovado). | "Esta venda já está em pagamento: use "Limpar" no cartão de pagamento para remover condição, desconto e formas e voltar a editar os itens." |
| Os mesmos | A venda foi retomada com o pagamento já registrado no documento. | "Esta venda foi retomada com o pagamento já registrado no documento, por isso os itens estão travados. Para editá-los, use "Limpar" no cartão de pagamento — isso descarta um valor que já foi recebido." |
| **Editar item** | O produto não permite ajuste de preço, desconto nem quantidade. | "Este produto não é editável: o cadastro do ERP não permite ajustar preço nem desconto dele." |
| **Editar item** e **Cancelar** | O item já está carregado na barra. | "Este item já está carregado na barra de entrada: confirme ou cancele a edição antes." |
| **Adicionar ao carrinho** | Sem vendedor; ou campo de código vazio; ou valor inválido na barra. | Veja a tabela abaixo. |

## Mensagens que você pode ver

| Mensagem na tela | O que significa | O que fazer |
|---|---|---|
| "Escolha o vendedor da venda antes de inserir produtos: use a lupa ao lado de "Vendedor NFCe"." | A venda não tem vendedor. | Escolha o vendedor (capítulo [04](04-selecionar-vendedor.md)). |
| "Aguarde: o produto ainda está sendo consultado no ERP." | A consulta ao ERP ainda não voltou. | Espere um instante. |
| "Digite ou bipe o código do produto para inserir." | O campo de código está vazio. | Bipe ou digite. |
| "Código apagado: o item saiu da barra. Bipe ou digite o código do produto." | Você apagou o código de um produto que estava na barra. | Bipe de novo. |
| "Informe a quantidade do item: ela precisa ser um número maior que zero." | Quantidade vazia, zero ou inválida. | Corrija a quantidade. |
| "Informe o preço unitário do item: ele precisa ser um valor maior que zero." | Preço vazio ou zero (produto de preço editável). | Digite o preço. |
| "Desconto do item inválido: use apenas números, com no máximo duas casas decimais." | O desconto tem letras ou mais de duas casas. | Corrija o desconto. |
| "O desconto não pode zerar o item: reduza o valor para o total ficar em pelo menos R$ 0,01." | O desconto cobre o valor todo. | Reduza o desconto. |
| "O desconto deste item zeraria o total dele: reduza o desconto ou aumente a quantidade." | Mesma regra, ao editar uma linha. | Idem. |
| "Produto N não encontrado." | O código não existe no ERP. | Confira o código ou busque pelo nome. |
| "Produto N está sem preço de venda no ERP. Nada foi inserido." | Cadastro sem preço. | Avise o responsável pelo cadastro. |
| "Produto pesável sem preço cadastrado no ERP. Nada foi inserido." | Produto de balança sem preço. | Idem. |
| "O ERP devolveu um produto em formato inesperado. Nada foi inserido." | Resposta inválida do ERP. | Chame o suporte. |
| "Não foi possível consultar o produto. Tente novamente." | Falha de rede ou do ERP. | Bipe de novo. Se repetir, chame o suporte. |
| ""Descrição" não tem código cadastrado no ERP — não é possível inseri-lo." | Na busca, o produto não tem nenhum código utilizável. | Escolha outro produto e avise o cadastro. |
| "Estoque insuficiente para (produto): disponível X, na venda Y." | Saldo menor que o pedido (aviso ou bloqueio, conforme a loja). | Reduza a quantidade ou siga, se for só aviso. |
| Janela **Produto não inserido** ("Sem cenário tributário para este cliente"), com o nome do produto e o "Motivo apontado pelo ERP" | O ERP não achou cenário tributário (cadastro fiscal) para este produto e este cliente. A frase na janela diz: "Este produto não pode entrar na venda". | Clique em **Entendi**. Escolha outro produto ou peça a correção do cadastro fiscal no ERP. |
| "Nenhum produto encontrado para o termo informado." | A busca não achou nada. | Tente outro termo. |
| "Nenhum produto desta página atende ao filtro de saldo." | O filtro de saldo escondeu a página. | Mude o filtro ou a página. |
| "Digite ao menos N caracteres para buscar." | O termo é curto demais. | Digite mais. |
| "Não foi possível buscar produtos. Tente novamente." | Falha na busca. | Repita. |

## Dúvidas frequentes

**Bipei o mesmo produto duas vezes. Vai somar?**
Cada bipe cria uma linha. Para o preço por faixa, o Checkout soma todas as linhas do mesmo produto. Se preferir uma linha só, use `2*código` da primeira vez.

**Posso trocar o produto de uma linha?**
Não. Cancele a linha e lance o produto certo.

**O preço do produto está diferente do que eu esperava.**
O preço vem do ERP para a sua loja e para o cliente da venda. Confira o cliente (lista de preço), a quantidade (faixas) e o cadastro do produto no ERP.

**O leitor de código de barras digitou o número no campo errado.**
O leitor digita onde estiver o cursor. Depois de cada item, o Checkout devolve o cursor ao campo de código. Se o cursor estiver em outro campo, clique no campo de código antes de bipar.

**Atalhos funcionam com o cursor no campo de código?**
Sim. **F1** a **F4** e **F10** funcionam em qualquer campo. Veja o capítulo [09](09-venda-rapida-e-atalhos.md).

## Veja também

- [03. Identificar cliente](03-identificar-cliente.md)
- [04. Selecionar vendedor](04-selecionar-vendedor.md)
- [06. Pagamento](06-pagamento.md)
- [09. Venda rápida e atalhos](09-venda-rapida-e-atalhos.md)
- [10. Finalizar e suspender a venda](10-finalizar-e-suspender-venda.md)
- [13. Celular e tablet](13-celular-e-tablet.md)
