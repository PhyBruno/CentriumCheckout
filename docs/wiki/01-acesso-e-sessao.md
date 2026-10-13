# 01. Acesso e sessão

> O Checkout só abre quando você chega a ele pelo ERP; se o acesso falhar ou a sessão acabar, o caminho é sempre abrir de novo pelo ERP.

**Quem usa:** Operador de caixa | Suporte

## Para que serve

Este capítulo explica como você entra no Checkout, o que é a "sessão" do operador e o que fazer quando aparece uma tela de erro logo na abertura.

O Checkout **não tem tela de login**. Você não digita usuário nem senha nele. Quem faz o login é o ERP (o CentriumWEB): ao clicar no botão que abre o Checkout, o ERP envia os seus dados de acesso de forma protegida e o Checkout abre já com você identificado, com a sua loja e o seu caixa.

## Antes de começar

- Entre no ERP (CentriumWEB) com o seu usuário, como sempre.
- Use o **Google Chrome**. Os recursos de impressão, TEF e Scanner por câmera dependem dele (veja o capítulo [13](13-celular-e-tablet.md) e o [15](15-solucao-de-problemas.md)).
- Tenha internet. O Checkout não funciona sem conexão com o ERP.
- Se você usa TEF ou impressão direta, a máquina do caixa já deve estar preparada pela TI da loja.

> **Atenção:** nunca salve o endereço do Checkout nos favoritos para entrar por ele. O endereço de entrada é gerado pelo ERP a cada acesso e **não funciona** se for digitado ou reaproveitado.

## Passo a passo

### Abrir o Checkout

1. Entre no ERP com o seu usuário.
2. Clique no botão do ERP que abre o Checkout.
3. Espere a tela de carregamento. Ela mostra o desenho da tela de venda em cinza, com um brilho passando. Na primeira vez no dia, ou quando a configuração da loja mudou, o carregamento demora um pouco mais, porque o Checkout baixa as configurações da loja.
4. Quando a tela de venda aparecer completa, o caixa está pronto.

![Tela de carregamento do Checkout no computador: o desenho da tela de venda em cinza, com o brilho de carregamento, antes de qualquer dado aparecer.](imagens/01-01-tela-carregando.png)
*Figura 01.01 — Tela de carregamento.*

![Tela de venda recém-aberta, vazia, com a barra superior mostrando o nome da loja, o caixa e o nome do operador.](imagens/01-02-tela-aberta.png)
*Figura 01.02 — Checkout aberto e pronto para a primeira venda.*

### Confirmar que você entrou como o operador certo

1. Olhe a barra superior, no canto direito.
2. Confira o seu nome ao lado do ícone de pessoa.
3. Se o nome não for o seu, **não venda**. Feche o Checkout, saia do ERP, entre de novo com o seu usuário e abra o Checkout pelo ERP.

> **Atenção:** a nota fiscal sai com o operador da sessão. Vender com a sessão de outra pessoa grava o nome dela na nota e na auditoria.

### Quando a tela mostra "Tentar novamente"

1. Leia o título: **Não foi possível carregar o checkout com os dados fornecidos**.
2. Clique em **Tentar novamente**. O botão muda para **Tentando…** enquanto repete o carregamento.
3. Se continuar falhando depois de duas ou três tentativas, abra o Checkout de novo pelo ERP.
4. Se ainda assim falhar, chame o suporte (veja "O que o suporte vai pedir" abaixo).

### Quando a tela diz para acessar de novo pelo CentriumWEB

1. Leia a mensagem: **Não foi possível carregar o checkout com os dados fornecidos** e, logo abaixo, **Acesse o Checkout novamente pelo CentriumWEB.**
2. Não existe botão nesta tela. Volte ao ERP e clique de novo no botão que abre o Checkout.

![Tela de acesso inválido: painel central com o ícone de carrinho em círculo azul, o título "Não foi possível carregar o checkout com os dados fornecidos" e o texto "Acesse o Checkout novamente pelo CentriumWEB.", sem botões.](imagens/01-03-acesso-invalido.png)
*Figura 01.03 — Acesso inválido: só um novo acesso pelo ERP resolve.*

![Tela de falha de carregamento com o botão "Tentar novamente": mesmo painel, título "Não foi possível carregar o checkout com os dados fornecidos" e o botão azul "Tentar novamente".](imagens/01-04-tentar-novamente.png)
*Figura 01.04 — Falha de carregamento em que repetir faz sentido.*

## Regras e bloqueios

- **Acesso só pelo ERP.** Abrir o endereço do Checkout direto no navegador, ou colar um endereço antigo, resulta na tela de acesso inválido.
- **A venda não sobrevive ao recarregar.** Se você apertar **F5**, fechar a aba ou voltar a página com uma venda em andamento (itens no carrinho ou cliente identificado por você), o navegador pergunta se quer sair. O texto dessa pergunta é do próprio navegador. Se você confirmar, a venda inteira se perde. O cliente padrão, escolhido automaticamente, não conta como venda em andamento.
- **Sessão do operador.** Ela fica guardada no navegador de forma protegida e é renovada sozinha, sem você perceber. Se a renovação falhar (por exemplo, senha alterada no ERP no meio do turno), a próxima ação que falar com o ERP mostra uma mensagem pedindo para reabrir o Checkout pelo ERP.
- **Configuração da loja atualizada.** Com o caixa **sem venda em andamento**, o Checkout confere a cada 1 minuto se a configuração da loja mudou no ERP e, se mudou, recarrega sozinho. Durante uma venda ele não recarrega nada.
- **Uma sessão por navegador.** Se você abrir o Checkout por outro usuário do ERP no mesmo navegador, a sessão anterior é substituída.

## Mensagens que você pode ver

| Mensagem na tela | O que significa | O que fazer |
|---|---|---|
| **Não foi possível carregar o checkout com os dados fornecidos** com o botão **Tentar novamente** | O acesso foi aceito, mas o carregamento falhou (ERP lento ou fora do ar, rede instável, resposta inesperada). | Clique em **Tentar novamente**. Se persistir, reabra pelo ERP e depois chame o suporte. |
| **Não foi possível carregar o checkout com os dados fornecidos** e **Acesse o Checkout novamente pelo CentriumWEB.** (sem botão) | O Checkout não recebeu dados de acesso válidos: foi aberto direto, o endereço está vencido ou incompleto, o ERP não conseguiu autenticar você, ou a sessão já terminou. | Abra o Checkout de novo pelo botão do ERP. |
| **A sessão será encerrada** / "Não foi possível renovar a sessão do operador. A venda em digitação, com N itens, pode ser perdida. Reabra o Checkout a partir do ERP para começar de novo." / botão **Entendi, encerrar sessão** | A sessão do operador não pôde ser renovada. | Clique em **Entendi, encerrar sessão** e reabra pelo ERP. A venda em andamento pode ser perdida. |
| "A sessão do operador foi encerrada. Reabra o Checkout pelo ERP e tente novamente." (aparece como aviso ao finalizar a venda) | A sessão expirou no meio da venda e a nota **não foi enviada**. | Reabra o Checkout pelo ERP e refaça a venda. |
| "A sessão do operador foi encerrada. Reabra o Checkout pelo ERP." (aparece ao importar DAV ou NFC-e) | Mesma causa, ao importar um documento. | Reabra o Checkout pelo ERP. |
| *Pergunta do navegador ao tentar sair ou atualizar a página* | Há venda em andamento que será perdida. | Cancele a saída, a menos que você queira mesmo descartar a venda. |

> **Suporte:** a entrada exige que o ERP cifre os dados de acesso com a chave do ambiente. Acesso recusado logo na entrada costuma ser: chave do ambiente diferente da usada pelo ERP, dados obrigatórios vazios (por exemplo, código da empresa), usuário que o ERP não reconhece ou ERP indisponível. O Checkout repete a autenticação sozinho duas vezes (cerca de 1 segundo no total) antes de recusar. Detalhes na seção de acesso do capítulo [15](15-solucao-de-problemas.md).

## Dúvidas frequentes

**Posso abrir o Checkout em duas abas para vender duas vezes ao mesmo tempo?**
Não é o uso previsto. Cada aba tem a sua própria venda em memória e as duas dividem a mesma sessão. A segunda aba prevista é apenas a do display do cliente (capítulo [14](14-display-do-cliente.md)).

**Sem internet, consigo vender?**
Não. O Checkout depende do ERP para produtos, clientes, formas de pagamento e emissão da nota.

**Atualizei a página sem querer. Perdi a venda?**
Se você confirmou a saída, sim. Refaça a venda. Se você tinha emitido a nota antes, o ERP guardou a nota; veja [11. Importar DAV e recuperar NFC-e](11-importar-dav-e-recuperar-nfce.md).

**Mudei de caixa/loja no ERP. O Checkout acompanha?**
A loja e o caixa vêm do acesso feito pelo ERP. Para trocar, saia, entre de novo no ERP na loja desejada e reabra o Checkout.

## Veja também

- [02. Conhecendo a tela](02-conhecendo-a-tela.md)
- [10. Finalizar e suspender a venda](10-finalizar-e-suspender-venda.md)
- [15. Solução de problemas](15-solucao-de-problemas.md)
