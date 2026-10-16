# 02. Conhecendo a tela

> Um mapa da tela de venda no computador: a barra superior, a coluna de venda à esquerda e o painel de pagamento à direita.

**Quem usa:** Operador de caixa

## Para que serve

Este capítulo mostra onde fica cada coisa na tela de venda do computador e para que serve. Cada região tem um capítulo próprio, com o passo a passo.

A tela de computador aparece quando o equipamento tem **mouse (ou touchpad) e a janela tem pelo menos 1024 pixels de largura**. Em celular, tablet ou janela estreita, o Checkout mostra o layout em etapas, descrito no capítulo [13. Celular e tablet](13-celular-e-tablet.md).

## Antes de começar

- Abra o Checkout pelo ERP (capítulo [01](01-acesso-e-sessao.md)).
- Se a janela estiver pequena demais, a tela troca sozinha para o layout de celular. Maximize a janela do Chrome.
- A tela de venda ocupa a janela inteira e **não rola**. Quem rola é a lista de itens.

## Passo a passo

### Visão geral

A tela tem três partes:

1. **Barra superior**, no alto, de ponta a ponta.
2. **Coluna de venda**, à esquerda, onde você identifica o cliente e lança os produtos.
3. **Painel de pagamento e totais**, à direita, onde você recebe o pagamento e finaliza a venda.

![Tela de venda completa no computador com uma venda em andamento: barra superior, coluna de venda à esquerda (cliente, entrada de produto, lista de itens, três botões embaixo) e painel de pagamento à direita. Marcar com números 1 a 3 as três partes.](imagens/02-01-tela-completa.png)
*Figura 02.01 — As três partes da tela de venda.*

### 1. Barra superior

Da esquerda para a direita:

- **Marca e nome da loja:** o símbolo do carrinho e o título **Centrium Checkout - nome da loja**. Se o ERP não tiver o nome da loja cadastrado, aparece só **Centrium Checkout**.
- **Identificação do caixa**, abaixo do título, por exemplo **Caixa 01 • PDV 02**. Cada parte só aparece se o ERP informar o dado.
- **Operador:** o seu nome ao lado do ícone de pessoa. Confira sempre que assumir o caixa.
- **Botão do monitor** (dica ao passar o mouse: **Display do cliente**): abre a segunda tela, voltada para o cliente. Veja o capítulo [14](14-display-do-cliente.md).
- **Botão da engrenagem** (**Configurações (ainda não disponível)**): aparece apagado e não faz nada. Está reservado para uma versão futura.

![Barra superior ampliada: símbolo do carrinho, título "Centrium Checkout - Loja Exemplo", linha "Caixa 01 • PDV 02", pílula com o nome do operador, botão do monitor e botão da engrenagem apagado.](imagens/02-02-barra-superior.png)
*Figura 02.02 — Barra superior.*

### 2. Coluna de venda (esquerda)

De cima para baixo:

1. **Cliente da venda.** Um cartão que mostra **Cliente** e **Vendedor** e que se abre e se fecha pelo botão **Recolhido/Expandido** (com uma seta). Aberto, ele tem os campos **Código do cliente ou CPF**, **Nome / telefone**, **Contato**, a lupa **Buscar cliente**, o botão **Identificar** e o campo do vendedor. Capítulos [03](03-identificar-cliente.md) e [04](04-selecionar-vendedor.md).
2. **Entrada de produto.** A barra onde você bipa ou digita o código. Ela tem o campo de código (com a lupa **Buscar produto**), **Quantidade** (com os botões de menos e de mais), **Unidade**, **Preço unitário**, **Desconto do item**, **Total item** e o botão **Adicionar ao carrinho**. Capítulo [05](05-produtos-e-carrinho.md).
3. **Lista de itens.** A tabela da venda, com as colunas **Item**, **Produto**, **Qtd.**, **UN**, **Preço un.**, **Desconto**, **Total** e os botões de lápis (**Editar item**) e lixeira (**Cancelar**) em cada linha. No rodapé da tabela: o último item adicionado, a quantidade de itens e o **Subtotal**. Vazia, a lista mostra **Nenhum item na venda.**
4. **Faixa de três botões**, na base da coluna:
   - **Cancelar venda**: suspende a venda em andamento (capítulo [10](10-finalizar-e-suspender-venda.md)).
   - **Menu Gerencial**: abre o menu de telas de retaguarda do ERP (capítulo [12](12-menu-gerencial.md)).
   - **Menu Importação**: importa um DAV ou recupera uma NFC-e (capítulo [11](11-importar-dav-e-recuperar-nfce.md)).

![Coluna de venda com uma venda de três itens: cartão de cliente aberto, barra de entrada de produto, tabela de itens com rodapé de subtotal e a faixa com os botões Cancelar venda, Menu Gerencial e Menu Importação.](imagens/02-03-coluna-de-venda.png)
*Figura 02.03 — Coluna de venda.*

### 3. Painel de pagamento e totais (direita)

De cima para baixo:

1. **Faixa de venda rápida:** até quatro botões, como **PIX (F6)**, que lançam um pagamento completo com uma tecla. Só aparece se a sua loja tiver esses atalhos cadastrados no ERP. Capítulo [09](09-venda-rapida-e-atalhos.md).
2. **Pagamento**, com o botão **Limpar** no canto: aqui você escolhe a **condição** de pagamento, aplica um **desconto** na venda inteira, escolhe a **forma** (dinheiro, cartão, PIX etc.), informa o valor e vê a lista dos pagamentos já lançados. Capítulos [06](06-pagamento.md) a [08](08-pagamento-cartao-tef.md).
3. **Total a pagar**, em destaque, com **Recebido** e, ao lado, **Faltante** (enquanto falta pagar) ou **Troco** (quando o valor recebido cobre tudo).
4. **Finalizar venda**: emite a NFC-e. Fica apagado até a venda estar completa.

![Painel de pagamento e totais com uma venda em andamento: faixa de venda rápida no topo, bloco Pagamento com condição e forma, lista de pagamentos, Total a pagar, Recebido, Faltante e botão Finalizar venda.](imagens/02-04-painel-pagamento.png)
*Figura 02.04 — Painel de pagamento e totais.*

### Como o Checkout avisa

Você vê dois tipos de aviso:

- **Avisos no canto superior direito** (balões que somem sozinhos). Há três tipos: de sucesso (deu certo), de atenção (algo pede cuidado) e de erro (a ação foi recusada e o texto diz por quê). O texto do aviso é sempre a informação importante; leia-o antes de repetir o gesto.
- **Janelas no centro da tela** para decisões importantes, como erro ao emitir a nota. Elas pedem uma ação sua antes de continuar.

![Aviso vermelho no canto superior direito com a frase "Não há itens nesta venda: bipe ao menos um produto antes de usar o atalho de pagamento."](imagens/02-05-aviso-recusa.png)
*Figura 02.05 — Aviso de recusa no canto superior direito.*

## Regras e bloqueios

Vários botões ficam **apagados** quando a ação não pode ser feita agora. Isso é de propósito e funciona sempre do mesmo jeito:

- **Passe o mouse** sobre o botão apagado: o motivo aparece em texto.
- **Clique** no botão apagado: o motivo aparece em um aviso de erro no canto da tela.
- O botão apagado não recebe foco pela tecla **Tab**.

Os motivos mais comuns, por botão:

| Botão | Fica bloqueado quando | Texto do motivo |
|---|---|---|
| **Cancelar venda** | A venda está sendo enviada ao ERP, ou tentou-se enviar e falhou a rede. | "Aguarde: esta venda ainda está sendo enviada ao ERP." |
| **Cancelar venda** | A venda está vazia. | "Não há nada a cancelar: esta venda está vazia." |
| **Finalizar venda** | O envio anterior falhou. | "O envio anterior falhou. Use "Tentar novamente" antes de finalizar." |
| **Finalizar venda** | Nenhum vendedor escolhido. | "Escolha o vendedor da venda: o ERP não aceita NFCe sem vendedor associado." |
| **Finalizar venda** | A venda ainda não está paga por completo. | "A venda ainda não fecha: lance itens e cubra todo o total com as formas de pagamento." |
| **Finalizar venda** | O ERP ainda não aprovou a venda. | "O ERP ainda não aprovou esta venda. Revise cliente, condição e formas de pagamento." |
| **Limpar** | Não há nada a limpar no pagamento. | "Não há condição, desconto ou forma de pagamento nesta venda para limpar." |

Os demais bloqueios estão nos capítulos de cada área.

## Mensagens que você pode ver

| Mensagem na tela | O que significa | O que fazer |
|---|---|---|
| **Nenhum item na venda.** | A lista de itens está vazia. | Bipe ou digite um produto. |
| **Nenhum item adicionado ainda** (rodapé da lista) | Nenhum item foi lançado nesta venda. | Idem. |
| **Configurações (ainda não disponível)** (dica do botão da engrenagem) | O botão ainda não tem função. | Ignore. |

## Dúvidas frequentes

**Por que a minha tela está diferente (três etapas, botões grandes)?**
O equipamento foi reconhecido como celular ou tablet, ou a janela está estreita. Veja o capítulo [13](13-celular-e-tablet.md). Em um computador, maximize a janela. Em PC com tela de toque, mas sem mouse ou touchpad conectado, o Checkout também usa o layout compacto.

**Aparecem F1, F2, F3, F4 ou F10 em algum botão?**
Não. Essas teclas funcionam, mas não são escritas na tela. A tabela completa está no capítulo [09](09-venda-rapida-e-atalhos.md).

**Onde fica o nome do vendedor?**
Dentro do cartão **Cliente da venda**, ao lado do cliente. Veja o capítulo [04](04-selecionar-vendedor.md).

## Veja também

- [01. Acesso e sessão](01-acesso-e-sessao.md)
- [03. Identificar cliente](03-identificar-cliente.md)
- [05. Produtos e carrinho](05-produtos-e-carrinho.md)
- [06. Pagamento](06-pagamento.md)
- [09. Venda rápida e atalhos](09-venda-rapida-e-atalhos.md)
- [13. Celular e tablet](13-celular-e-tablet.md)
