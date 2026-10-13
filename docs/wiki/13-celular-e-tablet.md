# 13. Celular e tablet

> Como o Checkout funciona no celular e no tablet: venda em três etapas, leitura de código de barras pela câmera (Scanner) e teclado virtual.

**Quem usa:** Operador de caixa | Suporte

## Para que serve

Em equipamentos de toque, o Checkout troca a tela única do computador por um layout em **três etapas**, feito para uma mão só e para telas pequenas. A venda, as regras e os preços são **os mesmos** do computador: só muda a apresentação.

## Antes de começar

**Quando o Checkout usa este layout.** A escolha é automática. O layout de computador só aparece quando o equipamento tem **mouse ou touchpad** *e* a janela tem **pelo menos 1024 pixels de largura**. Em qualquer outra situação (celular, tablet só com toque, janela estreita), aparece o layout em etapas. Isso inclui um tablet grande e deitado, se ele só tem toque.

**O que não existe neste layout:**

- **Menu Importação** (importar DAV e recuperar NFC-e): para isso, use um PDV com mouse.
- **Menu Gerencial** (capítulo [12](12-menu-gerencial.md)).
- **Botão do display do cliente** (capítulo [14](14-display-do-cliente.md)).
- **Faixa visual de venda rápida.** As teclas **F6** a **F9** funcionam com um teclado físico conectado, mas a faixa de botões não é mostrada.

**Navegador.** Use o **Google Chrome**. O **Scanner** por câmera só existe no **Chrome para Android**: no iPhone, em outros navegadores do Android (Edge, Opera, Samsung Internet e semelhantes) e em equipamentos sem leitor de código de barras embutido no navegador, o botão **Scanner** não aparece.

## Passo a passo

### Entender as três etapas

No alto da tela há o nome do sistema, a identificação do caixa, o nome do operador e o botão **Cancelar venda** (só o ícone). Logo abaixo, o indicador de etapa mostra o nome da etapa e **1/3**, **2/3** ou **3/3**, com três barrinhas.

| Etapa | Título | O que tem |
|---|---|---|
| 1 | **Cliente e produtos** | O cartão do cliente e do vendedor, a barra de produto (com o botão **Scanner**) e a lista de itens. |
| 2 | **Produtos e pagamento** | A lista de itens (só leitura) e o cartão **Pagamento**. |
| 3 | **Revisão e finalização** | **Total a pagar**, **Recebido**, **Faltante** ou **Troco**, o quadro **Conferência** (**Cliente**, **Vendedor**, **Produtos**, **Ajuste**), **Pagamentos** e o botão **Finalizar venda**. |

![Etapa 1 no celular: barra superior, indicador "Cliente e produtos 1/3", cartão do cliente, barra de produto com o botão Scanner, lista de itens e o botão "Ver produtos e pagamento".](imagens/13-01-etapa-1.png)
*Figura 13.01 — Etapa 1, Cliente e produtos.*

![Etapa 2 no celular: indicador "Produtos e pagamento 2/3", lista de itens e cartão Pagamento com condição, forma e valor recebido, e os botões "Cliente e produtos" e "Revisar venda".](imagens/13-02-etapa-2.png)
*Figura 13.02 — Etapa 2, Produtos e pagamento.*

![Etapa 3 no celular: indicador "Revisão e finalização 3/3", totais, quadro Conferência, lista Pagamentos e o botão Finalizar venda.](imagens/13-03-etapa-3.png)
*Figura 13.03 — Etapa 3, Revisão e finalização.*

### Avançar e voltar entre as etapas

1. Use os botões de rodapé: na etapa 1, **Ver produtos e pagamento**; na etapa 2, **Cliente e produtos** (voltar) e **Revisar venda** (avançar); na etapa 3, **Pagamento** (voltar).
2. Você também pode tocar nas barrinhas do indicador para ir a uma etapa **já visitada**.
3. Ao mudar de etapa, o teclado virtual fecha sozinho.

Os botões de avançar ficam **apagados** quando algo falta, e o motivo aparece ao tocar:

- Para a etapa 2: "Insira ao menos um produto na venda antes de avançar para o pagamento." (Se você tocar sem produto, o Checkout leva de volta à etapa 1 e coloca o cursor no campo de código.)
- Para a etapa 3: "Adicione formas de pagamento que cubram todo o valor da venda antes de revisar."
- Voltar para a etapa 1 com a venda já em pagamento: "Esta venda já está em pagamento: use "Limpar" no cartão de pagamento para remover condição, desconto e formas e voltar a editar os itens." (Vá à etapa 2 e use **Limpar**.)

### Lançar produtos

Na etapa 1, use a barra de produto como no computador (capítulo [05](05-produtos-e-carrinho.md)). Algumas diferenças:

1. A lista de itens mostra os **três últimos** produtos. Toque em **+N produtos anteriores** para ver todos (**Ocultar N produtos anteriores** fecha de novo).
2. Cada item mostra o nome, o total da linha e "quantidade unidade × preço". Os botões **Editar item** e **Cancelar** funcionam como no computador. Na etapa 2 a lista é só para conferência.
3. Ao **sair do campo de código** com um código digitado (por exemplo, tocando em outro campo), o Checkout **consulta o produto** na hora, como se você tivesse apertado Enter.

### Ler o código de barras pela câmera (Scanner)

1. Na etapa 1, toque em **Scanner** (ao lado do campo de código).
2. Permita o uso da câmera quando o Chrome pedir.
3. Aponte a câmera traseira para o código de barras ("Aponte para o código de barras"). O Checkout lê códigos **EAN-13, EAN-8, Code 128, Code 39 e ITF**.
4. Quando ele reconhece o código, a câmera fecha sozinha e o produto é consultado, como se o código tivesse sido digitado e confirmado. Produto comum entra direto na lista.
5. Para fechar a câmera sem ler nada, toque em **Fechar scanner**.

![Tela do Scanner aberto: faixa "Aponte para o código de barras", imagem da câmera ao fundo e botão Fechar scanner.](imagens/13-04-scanner.png)
*Figura 13.04 — Scanner por câmera.*

### Digitar com o teclado virtual

1. O campo de código abre o **teclado numérico**, que é o mais rápido para códigos de barras.
2. Para digitar letras (códigos com letras, referências) ou o asterisco da quantidade, toque no botão **ABC** ao lado do campo. O botão passa a **123**, que volta ao teclado numérico. (Para leitores de tela, o botão se chama "Usar teclado com letras" ou "Usar teclado numérico".)
3. O teclado numérico do iPhone **não tem Enter**: confirme o código **saindo do campo** (toque em outro campo ou fora dele) ou use o botão **Adicionar ao carrinho**.
4. **Toque fora de um campo** para fechar o teclado.
5. Ao entrar em um campo, o conteúdo dele fica selecionado: o que você digitar substitui o valor anterior.

### Os avisos no celular

Os avisos aparecem no alto da tela com um título (**Erro**, **Atenção** ou **Pronto**) e a frase embaixo. Quando um aviso aparece com o teclado aberto, a tela rola para o topo para você vê-lo.

## Regras e bloqueios

- **A venda é a mesma** nos dois layouts: se a janela mudar de tamanho no meio da venda e o layout trocar, **nada se perde**. As janelas abertas na hora (por exemplo, uma busca) são fechadas e a tela volta para a etapa 1.
- **F1 e F2** (importação) recusam com: "A importação de DAV e NFCe não está disponível no layout compacto: use um PDV com mouse." **F3** e **F4** funcionam e levam à etapa 1. **F10** suspende a venda.
- **Cada etapa só deixa avançar quando faz sentido** (veja acima).
- **A câmera exige conexão segura (HTTPS).** O endereço do Checkout precisa ser seguro.

## Mensagens que você pode ver

| Mensagem na tela | O que significa | O que fazer |
|---|---|---|
| "A permissão da câmera não foi concedida. Se o aparelho avisou que o site não pode pedir permissões, feche o que estiver sobreposto na tela — bolhas de conversa, filtro de luz, gravador — e toque em "Tentar de novo". Pelo campo de código a venda segue normalmente." | A câmera foi negada ou o Android bloqueou o pedido por causa de algo sobreposto na tela. | Feche as bolhas e sobreposições, toque em **Tentar de novo** e permita a câmera. Ou digite o código. |
| "Nenhuma câmera disponível neste aparelho. Use o campo de código para inserir o produto." | O aparelho não tem câmera utilizável. | Digite o código. |
| "A câmera está em uso por outro aplicativo. Feche-o e toque em "Tentar de novo", ou use o campo de código." | Outro aplicativo usa a câmera. | Feche o outro aplicativo e toque em **Tentar de novo**. |
| "A câmera só abre em conexão segura: acesse o Checkout por um endereço HTTPS confiável. Use o campo de código para inserir o produto." | O Checkout foi aberto por um endereço não seguro. | Chame o suporte/TI. Use o campo de código enquanto isso. |
| "Não foi possível abrir a câmera. Use o campo de código." | Falha genérica. | **Tentar de novo** ou digite o código. |
| "Insira ao menos um produto na venda antes de avançar para o pagamento." | Etapa 2 sem produto. | Lance um produto. |
| "Adicione formas de pagamento que cubram todo o valor da venda antes de revisar." | Etapa 3 com valor em aberto. | Cubra o total. |

> **Suporte:** o Scanner só aparece em **Android com Chrome** e quando o navegador oferece o leitor de código de barras. Se o operador diz que "o botão Scanner sumiu", confira o navegador (Edge, Opera e Samsung Internet não contam) e se é Android. A câmera só funciona em endereço HTTPS. O balão "Este site não pode pedir permissões" é do Android, não do Checkout: costuma ser causado por bolhas de chat, filtro de luz azul ou gravador de tela sobrepostos. No iPhone, o botão **ABC/123** exige passar por outro campo para trocar o teclado: o comportamento é do Safari. O desempenho do Scanner depende da latência do ERP: o código pode ficar parado no campo por instantes até a consulta voltar.

## Dúvidas frequentes

**Meu tablet mostra o layout de celular. Dá para forçar o de computador?**
Não há botão para isso. O layout de computador exige mouse (ou touchpad) e janela de 1024 pixels ou mais. Conecte um mouse ou use um computador.

**Por que o Scanner não aparece no meu iPhone?**
A leitura por câmera só existe no Chrome para Android. No iPhone, digite o código ou use um leitor de código de barras Bluetooth, que funciona como um teclado.

**O leitor de código de barras Bluetooth funciona?**
Sim. Ele digita o código no campo, como no computador. Deixe o cursor no campo de código.

**Posso importar um DAV no tablet?**
Não. A importação só existe no layout de computador.

**O teclado cobre o botão que eu preciso.**
Toque fora de qualquer campo para fechar o teclado.

## Veja também

- [02. Conhecendo a tela](02-conhecendo-a-tela.md)
- [05. Produtos e carrinho](05-produtos-e-carrinho.md)
- [06. Pagamento](06-pagamento.md)
- [09. Venda rápida e atalhos](09-venda-rapida-e-atalhos.md)
- [15. Solução de problemas](15-solucao-de-problemas.md)
