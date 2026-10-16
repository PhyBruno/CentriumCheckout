# 14. Display do cliente

> Uma segunda tela, voltada para quem paga, que mostra o nome da loja e, durante um PIX, o QR Code e o valor a pagar.

**Quem usa:** Operador de caixa | Supervisor/gestor | Suporte

## Para que serve

O **display do cliente** é uma janela do Checkout feita para ficar em um segundo monitor, virado para o cliente. Ela mostra três coisas, uma por vez:

1. **Repouso:** o nome da loja e a saudação **Seja bem-vindo!**
2. **PIX aguardando:** **Pague com PIX**, o QR Code, **Valor a pagar** e **Aguardando pagamento**.
3. **PIX aprovado:** **Pagamento confirmado**, **Valor pago** e uma contagem regressiva ("Obrigado! Esta tela volta em N s").

O cliente **não vê** itens, preços, totais, descontos, o nome dele nem o documento. Só o PIX é espelhado: dinheiro e cartão (inclusive TEF) não mudam nada nessa tela.

## Antes de começar

- É preciso um **segundo monitor** conectado ao computador do caixa (ou apenas espaço na tela para uma segunda janela).
- A tela do cliente **só funciona no mesmo navegador** e no mesmo computador em que o Checkout do operador está aberto. Ela conversa com a tela do operador por dentro do navegador, não pela internet.
- A tela do cliente existe só no **computador** (botão na barra superior do layout de mouse).
- Mantenha o Checkout do operador aberto: o display depende dele.

## Passo a passo

### Abrir o display

1. Na barra superior do Checkout, clique no botão do monitor (dica: **Display do cliente**).
2. Uma nova janela abre, mostrando o nome da loja e **Seja bem-vindo!**
3. Arraste a janela para o monitor voltado ao cliente.
4. Se o navegador permitir, aperte **F11** nessa janela para a tela cheia.

Clicar no botão de novo **não abre outra janela**: o Checkout traz à frente a que já está aberta.

![Tela do cliente em repouso: símbolo do carrinho, o nome da loja em destaque e o texto "Seja bem-vindo!".](imagens/14-01-display-repouso.png)
*Figura 14.01 — Display do cliente em repouso.*

### O que o cliente vê durante um PIX

1. Quando o operador gera a cobrança PIX (capítulo [07](07-pagamento-pix.md)) e o QR Code fica pronto, o display muda sozinho para **Pague com PIX**, com o nome da loja, o QR Code, o **Valor a pagar** e **Aguardando pagamento**.
2. O cliente escaneia o QR Code com o aplicativo do banco ("Abra o app do seu banco e escaneie o QR Code").
3. Quando o banco confirma, o display mostra **Pagamento confirmado** e **Valor pago**, com "Obrigado! Esta tela volta em 10 s" contando até zero.
4. Depois de 10 segundos (ou quando o operador fecha a janela do PIX), o display volta ao repouso.

O código "copia e cola" **não aparece** no display, porque o cliente não tem teclado nem mouse nessa tela. Se o cliente preferir esse caminho, o operador usa o botão de copiar ou de WhatsApp na tela dele.

![Tela do cliente durante um PIX: nome da loja, título "Pague com PIX", texto "Abra o app do seu banco e escaneie o QR Code", QR Code grande, "Valor a pagar R$ 50,00" e "Aguardando pagamento".](imagens/14-02-display-pix.png)
*Figura 14.02 — Display com a cobrança PIX no ar.*

![Tela do cliente com o pagamento aprovado: ícone verde, "Pagamento confirmado", "Valor pago R$ 50,00" e "Obrigado! Esta tela volta em 8 s".](imagens/14-03-display-aprovado.png)
*Figura 14.03 — Display com o PIX aprovado.*

## Regras e bloqueios

- **O display não faz nada sozinho.** Ele só desenha o que o Checkout do operador manda. Não gera cobrança, não consulta o banco e não tem botão nenhum.
- **Sempre honesto com o cliente.** Para o próximo cliente da fila nunca pagar o PIX do anterior, o display volta ao repouso:
  - quando a janela do PIX fecha, é desistida ou dá erro;
  - quando a aba do operador é **fechada**;
  - quando o operador **fica sem enviar sinal por 15 segundos** (por exemplo, se a aba travar).
- **Enquanto o QR Code ainda está sendo gerado**, ou se houver erro ou valor abaixo do mínimo do PIX, o display fica em repouso: ele não mostra mensagem de erro ao cliente.
- **Abrir ou recarregar o display não inicia venda** nem mexe na venda do operador. Se você recarregar o display com um PIX em curso, ele volta a mostrar a cobrança em instantes.
- **Várias abas de operador:** o display espelha a cobrança da aba do operador que a gerou.
- **O nome da loja** vem do cadastro da loja no ERP, e aparece desde a primeira abertura do Checkout.

## Mensagens que você pode ver

O display não mostra mensagens de erro ao cliente. Os textos que ele exibe são estes:

| Texto na tela do cliente | Quando aparece |
|---|---|
| Nome da loja e "Seja bem-vindo!" | Repouso (nenhum PIX em andamento). |
| "Pague com PIX", "Abra o app do seu banco e escaneie o QR Code", "Valor a pagar", "Aguardando pagamento" | Há uma cobrança PIX aguardando. |
| "Pagamento confirmado", "Valor pago", "Obrigado! Esta tela volta em N s" | O banco confirmou o pagamento. |

> **Suporte:** o display fica em um endereço próprio do Checkout (`/display`), servido pelo mesmo servidor, e se comunica com a tela do operador por um canal interno do navegador (mesma origem, mesmo navegador). A cobrança é reconfirmada a cada 5 segundos, e o display volta ao repouso após 15 segundos sem sinal. Se houver duas versões do Checkout abertas (por exemplo, depois de uma atualização), mensagens fora do padrão são descartadas.

## Dúvidas frequentes

**O display não mostra o QR Code, mas o operador mostra.**
Confira se o display foi aberto **pelo botão do monitor** do Checkout (não copiando o endereço em outro navegador) e no **mesmo navegador** do operador. Em outro navegador ou outro computador, ele não recebe nada.

**O display ficou "preso" no repouso com a cobrança ativa.**
Feche o display e abra de novo pelo botão do monitor. Ele pede ao Checkout a cobrança em curso e a mostra, se ainda existir.

**O display mostra o QR Code de uma cobrança que já acabou.**
Não deveria acontecer. Se acontecer, feche e reabra a janela e chame o suporte.

**Dá para mostrar propaganda ou os itens da venda?**
Não nesta versão.

**O cartão (TEF) também aparece no display?**
Não. Só o PIX.

## Veja também

- [02. Conhecendo a tela](02-conhecendo-a-tela.md)
- [07. Pagamento PIX](07-pagamento-pix.md)
- [15. Solução de problemas](15-solucao-de-problemas.md)
