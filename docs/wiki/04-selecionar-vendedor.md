# 04. Selecionar vendedor

> Como escolher o vendedor que atendeu o cliente: a NFC-e só é emitida com um vendedor associado.

**Quem usa:** Operador de caixa

## Para que serve

Toda NFC-e sai com o **vendedor** que atendeu o cliente. O vendedor não é o operador do caixa: são duas pessoas diferentes, e cada uma aparece em um lugar. O operador é o seu nome na barra superior. O vendedor é o que você escolhe no campo **Vendedor NFCe**, dentro do cartão **Cliente da venda**.

## Antes de começar

- O vendedor fica **dentro do cartão Cliente da venda**. Se o cartão estiver fechado, clique em **Recolhido** para abrir (ele passa a mostrar **Expandido**).
- Algumas lojas têm um **vendedor padrão** configurado no ERP, que já vem escolhido quando a venda começa. Nessas lojas, você só mexe aqui para trocar de vendedor.
- Em lojas sem vendedor padrão, o campo mostra **Selecionar vendedor** e **você precisa escolher alguém antes de bipar o primeiro produto**.

![Cartão Cliente da venda aberto, mostrando o campo "Vendedor NFCe" com o texto "Selecionar vendedor" e a lupa ao lado, com a pílula Vendedor ausente no alto do cartão.](imagens/04-01-campo-vendedor-vazio.png)
*Figura 04.01 — Campo Vendedor NFCe sem vendedor escolhido.*

## Passo a passo

### Escolher ou trocar o vendedor

1. Abra o cartão **Cliente da venda**.
2. No campo **Vendedor NFCe**, clique na lupa **Buscar vendedor**.
3. Na janela **Consultar vendedor** ("Selecione o vendedor informado na NFCe"), digite no campo "Busque o vendedor pelo nome" pelo menos o número de caracteres que a janela pedir ("Digite ao menos N caracteres para buscar."). Esse número vem da configuração da loja no ERP.
4. A lista mostra **Código**, **Vendedor** e **CPF**, em páginas. Use **Anterior** e **Próxima** para mudar de página.
5. Clique no vendedor. A janela fecha, o nome aparece no campo **Vendedor NFCe** e na pílula **Vendedor** do cartão, e o cursor volta ao campo do produto.
6. Para sair sem escolher, clique em **Fechar** ou pressione **Esc**.

![Janela Consultar vendedor com a busca preenchida e uma lista de quatro vendedores fictícios nas colunas Código, Vendedor e CPF, com o rodapé de paginação.](imagens/04-02-busca-vendedor.png)
*Figura 04.02 — Janela Consultar vendedor.*

![Cartão Cliente da venda com o vendedor escolhido: pílula "Vendedor" com o nome "Carlos Exemplo" no alto do cartão e o campo "Vendedor NFCe" preenchido com o mesmo nome ao lado da lupa.](imagens/04-03-vendedor-escolhido.png)
*Figura 04.03 — Vendedor escolhido, na pílula e no campo Vendedor NFCe.*

### Quando o campo mostra "Vendedor #número"

Isso acontece quando a venda foi retomada de um DAV ou de um rascunho de NFC-e: o ERP informou o código do vendedor, mas não o nome. A venda está correta. Se quiser, abra a busca e escolha o vendedor pelo nome.

## Regras e bloqueios

- **Sem vendedor, sem produto.** Se a venda não tem vendedor, o Checkout recusa a inserção de qualquer produto (bipagem, digitação, câmera ou busca) e leva o cursor ao campo do vendedor. Editar um item que já está na venda continua permitido.
- **Sem vendedor, sem NFC-e.** O botão **Finalizar venda** fica apagado com o motivo "Escolha o vendedor da venda: o ERP não aceita NFCe sem vendedor associado."
- **O vendedor pode ser trocado com a venda em andamento**, enquanto a venda ainda não entrou em pagamento. Escolher a **condição de pagamento** já conta como "entrar em pagamento".
- **Depois de iniciar o pagamento, o vendedor trava.** O campo mostra o motivo ao passar o mouse e ao clicar na lupa. Para voltar a editar, use **Limpar** no cartão de pagamento.
- O vendedor escolhido é o que vai na nota, mesmo que seja diferente do vendedor padrão da loja. Escolher de novo o mesmo vendedor não conta como troca.

## Mensagens que você pode ver

| Mensagem na tela | O que significa | O que fazer |
|---|---|---|
| "Escolha o vendedor da venda antes de inserir produtos: use a lupa ao lado de "Vendedor NFCe"." | A venda não tem vendedor e você tentou inserir um produto. | Abra a busca (lupa **Buscar vendedor**) e escolha. |
| "Escolha o vendedor da venda: o ERP não aceita NFCe sem vendedor associado." (motivo do botão **Finalizar venda**) | Não há vendedor na venda. | Escolha um vendedor. |
| "Esta venda já está em pagamento: o vendedor não pode mais ser trocado. Use "Limpar" no cartão de pagamento para voltar a editar." | O pagamento já foi iniciado. | Se precisar mesmo trocar, use **Limpar** no cartão **Pagamento** (isso descarta condição, desconto e formas). |
| "Nenhum vendedor encontrado para o termo informado." | A busca não achou ninguém. | Tente outra parte do nome. |
| "Digite ao menos N caracteres para buscar." | O termo é curto demais. | Digite mais caracteres. |
| "Não foi possível buscar vendedores. Tente novamente." | Falha na busca. | Repita. Se persistir, chame o suporte. |
| "Aguardando a configuração do ponto de venda." | A configuração da loja ainda não carregou. | Aguarde alguns segundos. |

## Dúvidas frequentes

**Preciso escolher o vendedor toda venda?**
Só quando a loja não tem vendedor padrão, ou quando o vendedor da venda é outro. O vendedor padrão já vem preenchido em cada venda nova.

**O vendedor aparece em outro lugar além do cartão de cliente?**
Sim: na pílula **Vendedor** do cartão de cliente. O código do vendedor também segue para a nota e para a auditoria (capítulo [18](18-auditoria-de-acoes.md)).

**Posso trocar o vendedor depois de finalizar?**
Não. A NFC-e já foi emitida com o vendedor escolhido.

## Veja também

- [03. Identificar cliente](03-identificar-cliente.md)
- [05. Produtos e carrinho](05-produtos-e-carrinho.md)
- [06. Pagamento](06-pagamento.md)
- [18. Auditoria de ações](18-auditoria-de-acoes.md)
