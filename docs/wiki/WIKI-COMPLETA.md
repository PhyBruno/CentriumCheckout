# Wiki operacional do Centrium Checkout

> Guia de uso e de suporte do Centrium Checkout, o ponto de venda (PDV) web do ERP Centrium.

## O que é esta wiki

O **Centrium Checkout** é a tela de caixa do ERP Centrium. O operador não abre o Checkout digitando um endereço: ele entra pelo ERP, que o leva direto ao caixa já identificado. No Checkout, você identifica o cliente, bipa os produtos, recebe o pagamento e emite a NFC-e (nota fiscal de consumidor eletrônica). O ERP continua sendo a fonte de todas as informações: produtos, clientes, formas de pagamento e notas fiscais.

Esta wiki descreve **o que o Checkout faz hoje**, com os nomes de botões, campos e mensagens exatamente como aparecem na tela. Ela serve a três públicos:

- **Operadores de caixa**, que usam o Checkout o dia inteiro.
- **Gestores de loja**, que acompanham o caixa e usam o menu gerencial.
- **Suporte da Centrium**, que atende chamados e precisa saber o que a tela quer dizer e o que coletar.

> **Dica:** se você só quer saber "o que significa esta mensagem?", vá direto ao capítulo [15. Solução de problemas](#15-solução-de-problemas) e procure pelo texto da mensagem.

## Por onde começar, por perfil

### Sou operador de caixa

Leia nesta ordem na primeira vez. Depois, use os capítulos como consulta.

1. [01. Acesso e sessão](#01-acesso-e-sessão): como abrir o Checkout e o que fazer se ele não abrir.
2. [02. Conhecendo a tela](#02-conhecendo-a-tela): para que serve cada parte da tela.
3. [05. Produtos e carrinho](#05-produtos-e-carrinho): bipar, buscar, corrigir e remover itens.
4. [06. Pagamento](#06-pagamento) e depois o da forma que você mais usa: [07. PIX](#07-pagamento-pix) ou [08. Cartão (TEF)](#08-pagamento-com-cartão-tef).
5. [10. Finalizar e suspender a venda](#10-finalizar-e-suspender-a-venda): emitir a nota e o que fazer se der erro.
6. [09. Venda rápida e atalhos](#09-venda-rápida-e-atalhos): as teclas que aceleram o caixa.

Quando precisar: [03. Identificar cliente](#03-identificar-cliente), [04. Selecionar vendedor](#04-selecionar-vendedor), [11. Importar DAV e recuperar NFC-e](#11-importar-dav-e-recuperar-nfc-e), [13. Celular e tablet](#13-celular-e-tablet) e [14. Display do cliente](#14-display-do-cliente).

### Sou gestor de loja

- [12. Menu gerencial](#12-menu-gerencial): acesso à central de movimentação não fiscal (sangria, suprimento) e ao resumo de caixa.
- [11. Importar DAV e recuperar NFC-e](#11-importar-dav-e-recuperar-nfc-e): como retomar uma venda que ficou pela metade.
- [10. Finalizar e suspender a venda](#10-finalizar-e-suspender-a-venda): o que acontece com uma venda suspensa.
- [18. Auditoria de ações](#18-auditoria-de-ações): o que o sistema registra sobre o que o operador fez.
- [16. Glossário](#16-glossário): os termos usados na loja e no ERP.

### Sou do suporte da Centrium

- [15. Solução de problemas](#15-solução-de-problemas): sintoma, causa provável e o que fazer. Inclui a infraestrutura local (impressão, TEF, políticas do Chrome) e **o que coletar ao abrir um chamado**.
- [01. Acesso e sessão](#01-acesso-e-sessão): quase todo "o Checkout não abre" nasce aqui.
- [08. Pagamento com cartão (TEF)](#08-pagamento-com-cartão-tef) e [10. Finalizar e suspender a venda](#10-finalizar-e-suspender-a-venda): onde estão os bloqueios e o reenvio de NFC-e.
- [18. Auditoria de ações](#18-auditoria-de-ações): o registro que acompanha cada NFC-e no ERP.
- [17. Guia de imagens](#17-guia-de-imagens): lista de todas as figuras previstas.

## O que o Checkout não faz

Para evitar expectativa errada, estas funções **não existem** no Checkout:

- **Reimprimir ou cancelar uma NFC-e já autorizada.** Isso é feito no ERP.
- **Tela de login própria.** O acesso sempre vem do ERP.
- **Funcionar sem internet.** Sem conexão com o ERP, não há venda.
- **Guardar a venda ao recarregar a página.** Se você atualizar (F5) ou fechar a aba com uma venda em andamento, a venda se perde. O navegador pede confirmação antes.

## Convenções desta wiki

- Nomes de botões, campos e mensagens aparecem em **negrito** ou entre aspas, do jeito que estão na tela.
- Teclas aparecem em negrito, por exemplo **F2**.
- Os quadros de destaque seguem este padrão:

> **Dica:** um atalho ou um jeito mais rápido.

> **Atenção:** algo que pode causar perda de dados, nota errada ou cobrança em duplicidade.

> **Suporte:** informação para quem atende o chamado.

- As figuras ainda serão capturadas. Onde você ver uma imagem que não carrega, ela está prevista em [17. Guia de imagens](#17-guia-de-imagens).

## Sumário

| Capítulo | Assunto |
|---|---|
| [01. Acesso e sessão](#01-acesso-e-sessão) | Como o operador chega ao Checkout, sessão expirada e acesso inválido |
| [02. Conhecendo a tela](#02-conhecendo-a-tela) | Barra superior e regiões da tela de venda no computador |
| [03. Identificar cliente](#03-identificar-cliente) | CPF/CNPJ, nome, código, cliente padrão e cadastro simplificado |
| [04. Selecionar vendedor](#04-selecionar-vendedor) | Quem atendeu o cliente |
| [05. Produtos e carrinho](#05-produtos-e-carrinho) | Bipagem, busca, quantidade, preço, desconto e total |
| [06. Pagamento](#06-pagamento) | Formas, condições, valor recebido, troco, desconto, vale e validação da nota |
| [07. Pagamento PIX](#07-pagamento-pix) | QR Code, espera, aprovação e cancelamento |
| [08. Pagamento com cartão (TEF)](#08-pagamento-com-cartão-tef) | Cartão pelo TEF e pela maquininha avulsa |
| [09. Venda rápida e atalhos](#09-venda-rápida-e-atalhos) | Teclas F1 a F10 e cenários de pagamento rápido |
| [10. Finalizar e suspender a venda](#10-finalizar-e-suspender-a-venda) | NFC-e, suspensão, erros, WhatsApp e impressão |
| [11. Importar DAV e recuperar NFC-e](#11-importar-dav-e-recuperar-nfc-e) | Retomar vendas e documentos já existentes |
| [12. Menu gerencial](#12-menu-gerencial) | Telas de retaguarda do ERP |
| [13. Celular e tablet](#13-celular-e-tablet) | Layout em etapas, Scanner por câmera e teclado virtual |
| [14. Display do cliente](#14-display-do-cliente) | A segunda tela, voltada para quem paga |
| [15. Solução de problemas](#15-solução-de-problemas) | Consulta para o suporte |
| [16. Glossário](#16-glossário) | Termos e siglas |
| [17. Guia de imagens](#17-guia-de-imagens) | Lista das figuras da wiki |
| [18. Auditoria de ações](#18-auditoria-de-ações) | O que é registrado das ações do operador |

---

# 01. Acesso e sessão

> O Checkout só abre quando você chega a ele pelo ERP; se o acesso falhar ou a sessão acabar, o caminho é sempre abrir de novo pelo ERP.

**Quem usa:** Operador de caixa | Suporte

## Para que serve

Este capítulo explica como você entra no Checkout, o que é a "sessão" do operador e o que fazer quando aparece uma tela de erro logo na abertura.

O Checkout **não tem tela de login**. Você não digita usuário nem senha nele. Quem faz o login é o ERP (o CentriumWEB): ao clicar no botão que abre o Checkout, o ERP envia os seus dados de acesso de forma protegida e o Checkout abre já com você identificado, com a sua loja e o seu caixa.

## Antes de começar

- Entre no ERP (CentriumWEB) com o seu usuário, como sempre.
- Use o **Google Chrome**. Os recursos de impressão, TEF e Scanner por câmera dependem dele (veja o capítulo [13](#13-celular-e-tablet) e o [15](#15-solução-de-problemas)).
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

> **Suporte:** a entrada exige que o ERP cifre os dados de acesso com a chave do ambiente. Acesso recusado logo na entrada costuma ser: chave do ambiente diferente da usada pelo ERP, dados obrigatórios vazios (por exemplo, código da empresa), usuário que o ERP não reconhece ou ERP indisponível. O Checkout repete a autenticação sozinho duas vezes (cerca de 1 segundo no total) antes de recusar. Detalhes na seção de acesso do capítulo [15](#15-solução-de-problemas).

## Dúvidas frequentes

**Posso abrir o Checkout em duas abas para vender duas vezes ao mesmo tempo?**
Não é o uso previsto. Cada aba tem a sua própria venda em memória e as duas dividem a mesma sessão. A segunda aba prevista é apenas a do display do cliente (capítulo [14](#14-display-do-cliente)).

**Sem internet, consigo vender?**
Não. O Checkout depende do ERP para produtos, clientes, formas de pagamento e emissão da nota.

**Atualizei a página sem querer. Perdi a venda?**
Se você confirmou a saída, sim. Refaça a venda. Se você tinha emitido a nota antes, o ERP guardou a nota; veja [11. Importar DAV e recuperar NFC-e](#11-importar-dav-e-recuperar-nfc-e).

**Mudei de caixa/loja no ERP. O Checkout acompanha?**
A loja e o caixa vêm do acesso feito pelo ERP. Para trocar, saia, entre de novo no ERP na loja desejada e reabra o Checkout.

## Veja também

- [02. Conhecendo a tela](#02-conhecendo-a-tela)
- [10. Finalizar e suspender a venda](#10-finalizar-e-suspender-a-venda)
- [15. Solução de problemas](#15-solução-de-problemas)

---

# 02. Conhecendo a tela

> Um mapa da tela de venda no computador: a barra superior, a coluna de venda à esquerda e o painel de pagamento à direita.

**Quem usa:** Operador de caixa

## Para que serve

Este capítulo mostra onde fica cada coisa na tela de venda do computador e para que serve. Cada região tem um capítulo próprio, com o passo a passo.

A tela de computador aparece quando o equipamento tem **mouse (ou touchpad) e a janela tem pelo menos 1024 pixels de largura**. Em celular, tablet ou janela estreita, o Checkout mostra o layout em etapas, descrito no capítulo [13. Celular e tablet](#13-celular-e-tablet).

## Antes de começar

- Abra o Checkout pelo ERP (capítulo [01](#01-acesso-e-sessão)).
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
- **Botão do monitor** (dica ao passar o mouse: **Display do cliente**): abre a segunda tela, voltada para o cliente. Veja o capítulo [14](#14-display-do-cliente).
- **Botão da engrenagem** (**Configurações (ainda não disponível)**): aparece apagado e não faz nada. Está reservado para uma versão futura.

![Barra superior ampliada: símbolo do carrinho, título "Centrium Checkout - Loja Exemplo", linha "Caixa 01 • PDV 02", pílula com o nome do operador, botão do monitor e botão da engrenagem apagado.](imagens/02-02-barra-superior.png)
*Figura 02.02 — Barra superior.*

### 2. Coluna de venda (esquerda)

De cima para baixo:

1. **Cliente da venda.** Um cartão que mostra **Cliente** e **Vendedor** e que se abre e se fecha pelo botão **Recolhido/Expandido** (com uma seta). Aberto, ele tem os campos **Código do cliente ou CPF**, **Nome / telefone**, **Contato**, a lupa **Buscar cliente**, o botão **Identificar** e o campo do vendedor. Capítulos [03](#03-identificar-cliente) e [04](#04-selecionar-vendedor).
2. **Entrada de produto.** A barra onde você bipa ou digita o código. Ela tem o campo de código (com a lupa **Buscar produto**), **Quantidade** (com os botões de menos e de mais), **Unidade**, **Preço unitário**, **Desconto do item**, **Total item** e o botão **Adicionar ao carrinho**. Capítulo [05](#05-produtos-e-carrinho).
3. **Lista de itens.** A tabela da venda, com as colunas **Item**, **Produto**, **Qtd.**, **UN**, **Preço un.**, **Desconto**, **Total** e os botões de lápis (**Editar item**) e lixeira (**Cancelar**) em cada linha. No rodapé da tabela: o último item adicionado, a quantidade de itens e o **Subtotal**. Vazia, a lista mostra **Nenhum item na venda.**
4. **Faixa de três botões**, na base da coluna:
   - **Cancelar venda**: suspende a venda em andamento (capítulo [10](#10-finalizar-e-suspender-a-venda)).
   - **Menu Gerencial**: abre o menu de telas de retaguarda do ERP (capítulo [12](#12-menu-gerencial)).
   - **Menu Importação**: importa um DAV ou recupera uma NFC-e (capítulo [11](#11-importar-dav-e-recuperar-nfc-e)).

![Coluna de venda com uma venda de três itens: cartão de cliente aberto, barra de entrada de produto, tabela de itens com rodapé de subtotal e a faixa com os botões Cancelar venda, Menu Gerencial e Menu Importação.](imagens/02-03-coluna-de-venda.png)
*Figura 02.03 — Coluna de venda.*

### 3. Painel de pagamento e totais (direita)

De cima para baixo:

1. **Faixa de venda rápida:** até quatro botões, como **PIX (F6)**, que lançam um pagamento completo com uma tecla. Só aparece se a sua loja tiver esses atalhos cadastrados no ERP. Capítulo [09](#09-venda-rápida-e-atalhos).
2. **Pagamento**, com o botão **Limpar** no canto: aqui você escolhe a **condição** de pagamento, aplica um **desconto** na venda inteira, escolhe a **forma** (dinheiro, cartão, PIX etc.), informa o valor e vê a lista dos pagamentos já lançados. Capítulos [06](#06-pagamento) a [08](#08-pagamento-com-cartão-tef).
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
O equipamento foi reconhecido como celular ou tablet, ou a janela está estreita. Veja o capítulo [13](#13-celular-e-tablet). Em um computador, maximize a janela. Em PC com tela de toque, mas sem mouse ou touchpad conectado, o Checkout também usa o layout compacto.

**Aparecem F1, F2, F3, F4 ou F10 em algum botão?**
Não. Essas teclas funcionam, mas não são escritas na tela. A tabela completa está no capítulo [09](#09-venda-rápida-e-atalhos).

**Onde fica o nome do vendedor?**
Dentro do cartão **Cliente da venda**, ao lado do cliente. Veja o capítulo [04](#04-selecionar-vendedor).

## Veja também

- [01. Acesso e sessão](#01-acesso-e-sessão)
- [03. Identificar cliente](#03-identificar-cliente)
- [05. Produtos e carrinho](#05-produtos-e-carrinho)
- [06. Pagamento](#06-pagamento)
- [09. Venda rápida e atalhos](#09-venda-rápida-e-atalhos)
- [13. Celular e tablet](#13-celular-e-tablet)

---

# 03. Identificar cliente

> Como colocar o cliente na venda: por código ou CPF, pela busca por nome ou cadastrando um cliente novo, e o que vale quando você não identifica ninguém.

**Quem usa:** Operador de caixa

## Para que serve

Identificar o cliente serve a dois fins:

- **Preço:** a lista de preço do cliente vale para a venda inteira.
- **Nota fiscal:** o Checkout informa o cliente ao ERP, e a nota é emitida com os dados do cadastro dele (capítulo [10](#10-finalizar-e-suspender-a-venda)).

Se você não identificar ninguém, a venda segue com o **cliente padrão** da sua loja (o "consumidor" configurado no ERP).

## Antes de começar

- **Identifique o cliente antes de bipar o primeiro produto.** Depois que a venda tem item, o cliente **não pode mais ser trocado**. Para trocar, cancele os itens antes.
- O cliente fica no cartão **Cliente da venda**, na parte de cima da coluna de venda. Se o cartão estiver fechado (**Recolhido**), clique em **Recolhido** ou na seta para abrir (**Expandido**).
- O Checkout atende **pessoa física (CPF)**. Cliente com CNPJ não pode ser usado na NFC-e (veja "Regras e bloqueios").

![Cartão Cliente da venda aberto, sem item na venda: pílulas Cliente e Vendedor no alto; abaixo os campos "Código do cliente ou CPF", "Nome / telefone", a lupa, o botão Identificar, "Contato" e o campo do vendedor.](imagens/03-01-cartao-cliente-aberto.png)
*Figura 03.01 — Cartão Cliente da venda aberto.*

## Passo a passo

### Identificar pelo código do cliente ou pelo CPF

1. Abra o cartão **Cliente da venda**.
2. Clique no campo **Código do cliente ou CPF** (ou pressione **F3** e use a busca, veja abaixo).
3. Digite só números:
   - **até 6 dígitos:** o Checkout entende como **código do cliente**;
   - **11 dígitos:** o Checkout entende como **CPF**. Pontos e traço são aceitos e ignorados.
4. Pressione **Enter**, clique em **Identificar** ou saia do campo.
5. O nome do cliente aparece em **Nome / telefone**, o telefone em **Contato** e a pílula **Cliente** mostra o nome. O cartão se fecha sozinho e o cursor vai para o campo do produto.

Exemplo: digite `123456` (código) ou `123.456.789-09` (CPF fictício).

![Cartão de cliente depois de identificado: pílula Cliente com o nome "Maria Exemplo", campo Código do cliente ou CPF preenchido, Nome / telefone preenchido e Contato com um telefone fictício.](imagens/03-02-cliente-identificado.png)
*Figura 03.02 — Cliente identificado.*

### Buscar o cliente por nome, e-mail, telefone ou documento

1. Abra o cartão **Cliente da venda** e clique na lupa **Buscar cliente**, ou pressione **F3** em qualquer lugar da tela de venda.
2. Na janela **Consultar cliente**, digite no campo "Busque por nome, e-mail, telefone ou documento". Digite pelo menos o número mínimo de caracteres que a janela pede ("Digite ao menos N caracteres para buscar."). Esse número vem da configuração da sua loja no ERP.
3. A lista mostra **Código**, **Cliente**, **CPF/CNPJ**, **Telefone** e **Cidade**, em páginas. Use **Anterior** e **Próxima** para mudar de página.
4. Clique no cliente desejado. A janela fecha e o cliente entra na venda.
5. Para sair sem escolher, clique em **Fechar** ou pressione **Esc**.

![Janela Consultar cliente com a busca preenchida e uma lista de cinco clientes fictícios nas colunas Código, Cliente, CPF/CNPJ, Telefone e Cidade, com o rodapé "Página 1 de 3" e os botões Anterior e Próxima.](imagens/03-03-busca-cliente.png)
*Figura 03.03 — Janela Consultar cliente.*

### Cadastrar um cliente novo (cadastro simplificado)

O cadastro abre de dois jeitos:

- **Pelo CPF:** você digitou um CPF que o ERP não conhece. O formulário abre sozinho com o CPF já preenchido.
- **Pela busca:** na janela **Consultar cliente**, clique em **Novo cliente**.

Preencha o formulário **Cadastrar cliente** ("Preencha as informações do novo cliente"):

1. **Dados do cliente:**
   - **Nome completo** (obrigatório);
   - **CPF** (obrigatório, 11 dígitos);
   - **E-mail (opcional)**;
   - **Celular (opcional)**.
2. **Endereço:**
   - **CEP** (obrigatório, 8 dígitos);
   - **Endereço**, **Bairro**, **Número**, **Cidade** e **UF**.
3. Clique em **Salvar cliente**. O botão só fica ativo com nome, CPF e CEP válidos.
4. O cliente é gravado no ERP e já entra na venda.

Para desistir, clique em **Cancelar** ou em **Fechar**, ou pressione **Esc**.

![Formulário Cadastrar cliente com as seções "Dados do cliente" e "Endereço", campos preenchidos com dados fictícios e o botão Salvar cliente ativo.](imagens/03-04-cadastro-simplificado.png)
*Figura 03.04 — Cadastro simplificado.*

### Vender para o cliente padrão

1. Não faça nada. Quando o Checkout abre, ele já coloca o cliente padrão da loja na venda.
2. Se a sua loja não tem cliente padrão configurado, o cartão mostra **Não identificado**.

> **Dica:** o cliente padrão não conta como "venda em andamento". Atualizar a página com a venda vazia e só o cliente padrão não pergunta nada.

## Regras e bloqueios

- **Cliente só antes dos itens.** Com pelo menos um item ativo na venda, o campo vira somente leitura e a lupa e o botão **Identificar** ficam bloqueados. Itens cancelados (riscados) não contam. A tecla **F3** diz a mesma coisa.
- **Cliente travado depois de pagamento aprovado.** Com pagamento já aprovado, o cliente não troca mais.
- **Só pessoa física.** O Ajuste SINIEF 11/2025 proíbe NFC-e para pessoa jurídica. Se você digitar um CNPJ, ou escolher na busca um cliente que seja CNPJ, o Checkout recusa e limpa o cliente. Para vender a um CNPJ, é preciso emitir NF-e pelo ERP.
- **Código com até 6 dígitos, CPF com 11.** Valores entre 7 e 10 dígitos, ou letras, são recusados.
- **Identificar não cadastra sozinho um código.** Um código que não existe só mostra aviso. O cadastro novo só abre a partir de um **CPF** desconhecido ou do botão **Novo cliente**.
- Ao identificar o cliente, o ERP informa a lista de preço dele. Essa lista é usada em todos os itens.

## Mensagens que você pode ver

| Mensagem na tela | O que significa | O que fazer |
|---|---|---|
| "Digite o CPF do consumidor para identificar." (motivo do botão **Identificar** apagado) | O campo está vazio. | Digite o código ou o CPF. |
| "Aguarde: a consulta ao ERP ainda está em andamento." | A consulta ainda não voltou. | Espere um instante. |
| "Esta venda já tem itens: o cliente não pode mais ser trocado, porque a lista de preço dele já valeu na precificação. Cancele os itens para trocar o cliente." | Já há item ativo na venda. | Cancele os itens (lixeira) se for mesmo trocar o cliente. |
| "Já há pagamento aprovado nesta venda: o cliente não pode mais ser trocado." | Há pagamento aprovado. | Não é possível trocar. |
| "O código do cliente e o CPF são só números: remova as letras." | O campo tem letras. | Digite só números. |
| "Informe o código do cliente (até 6 dígitos) ou um CPF (11 dígitos)." | A quantidade de dígitos não bate. | Confira o número. |
| "Venda para CNPJ exige NFe emitida pelo ERP: o Ajuste SINIEF 11/2025 proíbe NFCe para pessoa jurídica. Informe um CPF (11 dígitos) ou o código do cliente." | Foi digitado um CNPJ. | Use um CPF ou o código de um cliente pessoa física. |
| "Venda para CNPJ exige NFe emitida pelo ERP: [...] Escolha um cliente pessoa física." | O cliente escolhido é pessoa jurídica. | Escolha outro cliente. |
| "Nenhum cliente com o código N." | O código não existe. | Confira o código ou busque pelo nome. |
| "Não foi possível consultar o cliente. Tente novamente." | Falha na consulta ao ERP (rede ou ERP). | Tente de novo. Se repetir, chame o suporte. |
| "O ERP devolveu um cliente em formato inesperado. Nada foi alterado." | Resposta inválida do ERP. | Chame o suporte. |
| "O ERP encontrou o cliente N mas devolveu o cadastro sem nome. Não é possível identificá-lo na venda — avise o suporte." | Cadastro incompleto no ERP. | Chame o suporte; use outro cliente enquanto isso. |
| "Nenhum cliente encontrado para o termo informado." | A busca não achou. | Tente outro termo ou use **Novo cliente**. |
| "Digite ao menos N caracteres para buscar." | O termo é curto demais. | Digite mais caracteres. |
| "Não foi possível buscar clientes. Tente novamente." | Falha na busca. | Repita. |
| Frase devolvida pelo ERP ao salvar (por exemplo, CPF já cadastrado) | O ERP recusou o cadastro e disse o motivo. | Corrija o dado indicado. |
| "Configuração do ponto de venda ainda não carregada." | O cadastro foi tentado antes de a configuração carregar. | Aguarde o carregamento e tente de novo. |

## Dúvidas frequentes

**O cliente quer o CPF na nota, mas já lancei os itens. E agora?**
O Checkout não tem uma opção separada de "CPF na nota": o ERP usa o cliente da venda. Com itens lançados o cliente não troca. Cancele os itens (e use **Limpar**, se já escolheu a condição de pagamento), identifique o cliente e lance os itens de novo. Veja [10. Finalizar e suspender a venda](#10-finalizar-e-suspender-a-venda).

**Digitei o CPF e o cadastro novo abriu. É erro?**
Não: significa que o ERP não conhece esse CPF. Cadastre, ou confira se digitou certo.

**Como saber se o cliente foi identificado por mim ou é o padrão?**
No cartão aberto, o campo **Código do cliente ou CPF** mostra o código do padrão. Identificado por CPF, mostra o CPF.

**A tecla F3 não abre a busca.**
Se a venda já tem item, a tecla mostra o motivo do bloqueio. Veja o capítulo [09](#09-venda-rápida-e-atalhos).

## Veja também

- [04. Selecionar vendedor](#04-selecionar-vendedor)
- [05. Produtos e carrinho](#05-produtos-e-carrinho)
- [09. Venda rápida e atalhos](#09-venda-rápida-e-atalhos)
- [10. Finalizar e suspender a venda](#10-finalizar-e-suspender-a-venda)

---

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
Sim: na pílula **Vendedor** do cartão de cliente. O código do vendedor também segue para a nota e para a auditoria (capítulo [18](#18-auditoria-de-ações)).

**Posso trocar o vendedor depois de finalizar?**
Não. A NFC-e já foi emitida com o vendedor escolhido.

## Veja também

- [03. Identificar cliente](#03-identificar-cliente)
- [05. Produtos e carrinho](#05-produtos-e-carrinho)
- [06. Pagamento](#06-pagamento)
- [18. Auditoria de ações](#18-auditoria-de-ações)

---

# 05. Produtos e carrinho

> Como lançar produtos na venda (bipando, digitando ou buscando), corrigir um item, cancelar itens e entender como o preço é calculado.

**Quem usa:** Operador de caixa

## Para que serve

A **entrada de produto** e a **lista de itens** formam o carrinho da venda. É aqui que você monta o que o cliente vai pagar. O Checkout busca o produto no ERP, aplica o preço certo e mostra o total de cada linha e o subtotal da venda.

## Antes de começar

Siga a ordem da venda. Ela existe para evitar preço errado e nota sem vendedor:

1. **Vendedor e cliente primeiro.** Sem vendedor, o Checkout não aceita produto. O cliente não pode mais ser trocado depois que há item. Veja os capítulos [03](#03-identificar-cliente) e [04](#04-selecionar-vendedor).
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
2. A linha **não some**: ela fica **riscada** e deixa de somar no total. O Checkout guarda o cancelamento para a auditoria (capítulo [18](#18-auditoria-de-ações)).
3. O item cancelado não pode ser reativado. Lance o produto de novo, se preciso.

![Lista de itens com uma linha cancelada: a segunda linha riscada em cinza, sem botões de ação, e o subtotal somando só as outras linhas.](imagens/05-03-item-cancelado.png)
*Figura 05.03 — Item cancelado (riscado) na lista.*

### Cancelar a venda inteira

O botão **Cancelar venda**, na base da coluna de venda, **suspende** a venda: ela vira rascunho no ERP e o caixa fica limpo. O capítulo [10. Finalizar e suspender a venda](#10-finalizar-e-suspender-a-venda) explica o passo a passo e os cuidados (por exemplo, quando já existe PIX gerado).

## Regras e bloqueios

### Como o preço é calculado

- **Preço padrão:** o ERP já informa o preço do produto na sua loja e para o cliente da venda. O Checkout usa esse valor.
- **Preço por faixa de quantidade:** em lojas configuradas assim, o produto tem preços diferentes conforme a quantidade vendida. Quando a **soma das quantidades do mesmo produto** na venda atinge a faixa, **todas as unidades** passam a valer o preço da faixa, inclusive as linhas lançadas antes. Se você cancelar uma linha e a quantidade cair abaixo da faixa, o preço volta ao da faixa anterior. Isso acontece sozinho, a cada item lançado, editado ou cancelado.
- **Desconto de convênio:** clientes com convênio recebem um desconto automático por item, que aparece na coluna **Desconto**.
- **Desconto do item:** só em produtos de preço editável, digitado em reais no campo **Desconto do item**. Ele **nunca pode zerar o item**: o total da linha tem de ficar em pelo menos R$ 0,01.
- **Subtotal e Total a pagar:** o **Subtotal**, no rodapé da lista, soma os itens ativos. O **Total a pagar**, no painel de pagamento, também considera o desconto aplicado à venda inteira (capítulo [06](#06-pagamento)).

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
| "Escolha o vendedor da venda antes de inserir produtos: use a lupa ao lado de "Vendedor NFCe"." | A venda não tem vendedor. | Escolha o vendedor (capítulo [04](#04-selecionar-vendedor)). |
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
Sim. **F1** a **F4** e **F10** funcionam em qualquer campo. Veja o capítulo [09](#09-venda-rápida-e-atalhos).

## Veja também

- [03. Identificar cliente](#03-identificar-cliente)
- [04. Selecionar vendedor](#04-selecionar-vendedor)
- [06. Pagamento](#06-pagamento)
- [09. Venda rápida e atalhos](#09-venda-rápida-e-atalhos)
- [10. Finalizar e suspender a venda](#10-finalizar-e-suspender-a-venda)
- [13. Celular e tablet](#13-celular-e-tablet)

---

# 06. Pagamento

> Como receber o pagamento da venda: condição, desconto, formas, valor recebido, troco, vale devolução e a conferência que o ERP faz antes da nota.

**Quem usa:** Operador de caixa

## Para que serve

O cartão **Pagamento**, no painel da direita, é onde você diz **como** o cliente vai pagar. Você pode dividir o total em várias formas (por exemplo, parte em dinheiro e parte em cartão). Quando o total estiver coberto, o botão **Finalizar venda** libera.

Os pagamentos com PIX e com cartão pelo TEF abrem janelas próprias, descritas nos capítulos [07](#07-pagamento-pix) e [08](#08-pagamento-com-cartão-tef).

## Antes de começar

- Termine de montar o carrinho. **Escolher a condição de pagamento congela a venda**: depois disso você não consegue incluir, editar ou cancelar itens, nem trocar cliente ou vendedor. Aplicar um desconto na venda, ou ter um pagamento aprovado, congela do mesmo jeito.
- Para voltar a editar, use **Limpar** no cabeçalho do cartão **Pagamento**. Ele desfaz condição, desconto e formas de uma vez.
- O vendedor da venda precisa estar escolhido para finalizar (capítulo [04](#04-selecionar-vendedor)).

![Painel de pagamento com uma venda de R$ 100,00: condição escolhida, campo Desconto, forma "Dinheiro", campo Valor recebido com "Enter adiciona", lista Pagamentos aplicados e os totais.](imagens/06-01-painel-pagamento.png)
*Figura 06.01 — Cartão Pagamento com a venda em andamento.*

## Passo a passo

### 1. Escolher a condição de pagamento

1. Em **Condição de pagamento**, clique no campo ("Selecione a condição").
2. Escolha uma opção da lista. Ela define as formas disponíveis e o prazo.
3. Você também pode usar as setas do teclado quando o campo está em foco (sem a lista aberta).

Cada venda usa **uma única condição**. Para trocá-la depois de aplicar uma forma, use **Limpar**.

### 2. Aplicar desconto na venda inteira (opcional)

1. No bloco **Desconto**, escolha a unidade: **R$** (valor) ou **%** (percentual).
2. Digite o valor no campo e pressione **Enter** (ou saia do campo). Em reais, use até duas casas decimais; em percentual, até uma casa.
3. Em percentual, o Checkout mostra ao lado o valor em reais equivalente, "sobre o subtotal".
4. Para tirar o desconto, apague o valor ou digite 0.

O desconto é dividido entre os itens e vale para a nota inteira. Ele **não pode zerar a venda** nem zerar um item: cada item precisa continuar valendo pelo menos R$ 0,01.

### 3. Escolher a forma de pagamento

1. Em **Forma de pagamento**, clique no campo ("Selecione a forma").
2. Escolha **dinheiro, cartão, PIX** ou a forma que o cliente vai usar. As formas listadas dependem da condição escolhida.
3. Formas de **PIX** só aparecem disponíveis se a sua loja tem o PIX ativo. Se não tiver, a opção fica apagada com o motivo ao passar o mouse.

### 4. Informar o valor e adicionar

1. No bloco **Valor recebido**, o campo já abre com o valor que **falta** pagar. Se for outro valor, apague e digite.
2. Pressione **Enter** ("Enter adiciona") ou clique em **Adicionar pagamento**.
3. A forma entra em **Pagamentos aplicados**. Com **dinheiro**, você pode digitar um valor maior que o que falta: a diferença vira **Troco**.
4. Repita para cada forma, até o total ficar coberto.
5. Quando o total estiver coberto, o cursor vai direto para **Finalizar venda**.

> **Dica:** se você mudar o desconto antes de digitar o valor recebido, o valor que o Checkout pré-preencheu acompanha o novo total. Quando você digita, o valor passa a ser o seu.

Exemplo: venda de R$ 100,00, cliente paga R$ 60,00 no cartão e R$ 50,00 em dinheiro. Adicione primeiro o cartão de R$ 60,00 (falta R$ 40,00); depois dinheiro com R$ 50,00. O painel mostra **Recebido** R$ 110,00 e **Troco** R$ 10,00.

![Cartão Pagamento com duas formas aplicadas: Cartão de crédito R$ 60,00 e Dinheiro R$ 40,00 aplicados, painel com Total a pagar R$ 100,00, Recebido R$ 110,00 e Troco R$ 10,00.](imagens/06-02-troco.png)
*Figura 06.02 — Pagamento dividido em duas formas, com troco.*

### 5. Pagar com vale devolução

1. Em **Forma de pagamento**, escolha a forma de vale devolução da sua loja.
2. A janela **Vale devolução** abre, com o nome da forma. Digite o **Código do vale** e pressione **Enter** ou clique em **Aplicar vale**.
3. O ERP valida o vale e informa o valor. O valor entra automaticamente: você não digita o valor do vale.
4. Se o vale for **maior** que o que falta pagar, a janela avisa: "Vale devolução não gera troco." e mostra o valor do vale, o que falta e a diferença que será perdida. Para seguir, clique em **Aplicar mesmo assim**; para desistir, feche a janela.

![Janela Vale devolução com o campo "Código do vale" preenchido com um código fictício e o botão Aplicar vale.](imagens/06-03-vale-devolucao.png)
*Figura 06.03 — Janela Vale devolução.*

### 6. Remover um pagamento já aplicado

1. Em **Pagamentos aplicados**, clique no botão de remover da forma (**Remover** mais o nome da forma).
2. **Dinheiro e outras formas simples** saem da lista na hora. A linha fica **riscada**, como registro, e deixa de contar.
3. **PIX** e **pagamento vindo de um documento retomado** pedem confirmação antes de sair. Leia o aviso: remover daqui **não devolve o dinheiro**.
4. **Cartão aprovado no TEF** só sai por **estorno** (capítulo [08](#08-pagamento-com-cartão-tef)).

### 7. Limpar tudo e recomeçar

1. Clique em **Limpar**, no cabeçalho do cartão **Pagamento**.
2. Condição, desconto e formas somem e a venda volta a aceitar edição de itens.
3. Se houver PIX gerado ou pagamento vindo de documento, o Checkout pede confirmação ("Limpar mesmo assim").

## A conferência do ERP (validação prévia da NFC-e)

Cada vez que você adiciona uma forma de pagamento, o Checkout pergunta ao ERP se a venda, do jeito que está, poderia virar uma NFC-e. Isso evita descobrir o problema só na hora de finalizar.

- **O ERP aceita:** a forma entra. Se o ERP tiver observações, elas aparecem como avisos de atenção no canto da tela.
- **O ERP recusa:** a forma **não** entra. Uma janela **Pagamento não aceito** ("A forma não foi aplicada") mostra os **Motivo apontado pelo ERP** e diz que a venda continua aberta. Corrija o que o ERP apontou (cliente, condição ou forma) e tente de novo. Clique em **Entendi** para fechar.
- **O ERP não responde:** a forma não entra e um aviso explica a causa (rede, demora, erro no ERP ou resposta inesperada). Tente de novo.
- Enquanto o ERP não aprovar a venda, **Finalizar venda** fica apagado.

![Janela "Pagamento não aceito" com o subtítulo "A forma não foi aplicada", o bloco "Motivo apontado pelo ERP" com uma frase de exemplo e o botão Entendi.](imagens/06-04-pagamento-nao-aceito.png)
*Figura 06.04 — Janela de recusa do ERP ao adicionar pagamento.*

## Regras e bloqueios

- **Condição:** só libera com pelo menos um produto na venda e sem forma aplicada.
- **Desconto:** só antes de qualquer pagamento. Com pagamento aplicado, o desconto trava.
- **Forma e valor:** exigem que a condição esteja escolhida e que o total da venda seja maior que zero.
- **Um dinheiro por venda.** Não é possível aplicar duas formas de dinheiro.
- **Só dinheiro dá troco.** Cartão, PIX e outras formas aceitam no máximo o valor que falta.
- **Não adicione quando já está tudo pago.** O saldo precisa ser maior que zero.
- **Cliente e vendedor travam** quando a venda entra em pagamento.
- **Pagamento vindo de documento:** em uma venda retomada de DAV ou NFC-e que já veio paga, os itens ficam travados até você usar **Limpar**, e isso **descarta** o registro do valor já recebido. Se finalizar assim, a nota sai sem o valor que o cliente pagou.
- **Atalhos de venda rápida (F6 a F9)** lançam condição e forma de uma vez, mas só em venda **sem pagamento iniciado** (capítulo [09](#09-venda-rápida-e-atalhos)).

## Mensagens que você pode ver

| Mensagem na tela | O que significa | O que fazer |
|---|---|---|
| "Aguarde: o catálogo de condições de pagamento ainda está carregando." | As condições ainda não carregaram. | Espere alguns segundos. |
| "Catálogo de pagamento indisponível: recarregue a tela de venda." | Falha ao carregar as condições. | Abra o Checkout de novo pelo ERP. Se persistir, chame o suporte. |
| "Nenhuma condição de pagamento cadastrada para este ponto de venda." | O ERP não tem condição para este PDV. | Chame o suporte/cadastro do ERP. |
| "Insira ao menos um produto na venda antes de escolher a condição de pagamento." | O carrinho está vazio. | Lance um produto. |
| "Esta venda já tem forma de pagamento aplicada e cada venda usa uma condição só: use "Limpar" para recomeçar o pagamento." | Tentou trocar a condição com forma aplicada. | Use **Limpar**. |
| "Escolha primeiro a condição de pagamento: as formas disponíveis vêm dela." | Falta escolher a condição. | Escolha a condição. |
| "Esta condição de pagamento não tem nenhuma forma cadastrada." | Condição sem formas no ERP. | Escolha outra ou chame o suporte. |
| "Esta venda não tem valor a cobrar: revise o desconto ou os itens antes de escolher a forma de pagamento." | O total está zerado. | Revise o desconto e os itens. |
| "(forma) indisponível: a integração PIX não está ativa neste ponto de venda." | A loja não tem PIX ativo. | Use outra forma. Chame o suporte para ativar. |
| "Escolha a forma de pagamento antes de informar o valor recebido." | Falta a forma. | Escolha a forma. |
| "Informe o valor recebido para adicionar o pagamento." | O valor está vazio. | Digite o valor. |
| "Valor inválido: use apenas números, com no máximo duas casas decimais." | O valor tem letras ou muitas casas. | Corrija. |
| "O valor recebido precisa ser maior que zero." | Valor zero. | Digite um valor positivo. |
| "Aguarde: o pagamento anterior ainda está sendo processado." | A forma anterior ainda não terminou. | Espere. |
| "Já existe uma forma dinheiro aplicada nesta venda." | Tentou lançar dinheiro duas vezes. | Remova o dinheiro anterior ou ajuste o valor. |
| "O saldo desta venda já está totalmente coberto." | Não falta mais nada. | Finalize a venda. |
| "Esta forma de pagamento não gera troco: informe no máximo o valor que falta para fechar a venda." | O valor passa do que falta, em forma sem troco. | Informe até o valor que falta. |
| "Esta forma de pagamento não pertence à condição selecionada." | A forma não é da condição escolhida. | Escolha a forma na lista da condição. |
| "Esta venda já tem pagamento aplicado: o desconto não pode mais ser alterado." | Tentou mexer no desconto com pagamento. | Use **Limpar** se precisar. |
| "O desconto não pode zerar o total da venda: informe um valor menor que o total." | O desconto é igual ou maior que o total. | Diminua o desconto. |
| "Este desconto zeraria um item da venda: no rateio, cada item precisa continuar valendo pelo menos R$ 0,01." | O desconto, dividido entre os itens, zeraria um deles. | Diminua o desconto. |
| "Valor inválido: use apenas números, com até duas casas decimais." / "Percentual inválido: use apenas números, com até uma casa decimal." | Formato errado no campo **Desconto**. | Corrija. |
| "Não foi possível validar a venda no ERP: o pagamento não foi aplicado." | Falha na conferência do ERP. | Tente de novo. |
| "Sem comunicação com o ERP para validar a venda. O pagamento não foi aplicado — verifique a rede e tente de novo." | Sem rede. | Verifique a internet e tente de novo. |
| "O ERP demorou demais para validar a venda. O pagamento não foi aplicado — tente de novo." | Demora do ERP. | Tente de novo. |
| "O ERP não conseguiu validar a venda agora. O pagamento não foi aplicado — tente de novo em instantes." | ERP com problema. | Tente em instantes. |
| "O ERP respondeu em formato inesperado ao validar a venda. O pagamento não foi aplicado — tente de novo." | Resposta inválida do ERP. | Tente; se repetir, chame o suporte. |
| "O ERP recusou esta venda, mas não informou o motivo. Revise cliente, condição e formas de pagamento." | Recusa sem detalhe. | Revise cliente, condição e formas. |
| "A venda mudou enquanto o ERP validava este pagamento. Nada foi aplicado: confira o saldo e lance novamente." | O carrinho ou o valor mudou durante a conferência. | Confira o saldo e lance de novo. |
| "Este valor já foi recebido" / "Remover o pagamento vindo do documento?" | Você vai remover um pagamento que já veio no documento retomado. | Leia o aviso. Remover só apaga o registro desta tela; não devolve o dinheiro. |
| "Limpar o pagamento vindo do documento?" ("Esta venda foi retomada já paga") | Mesma situação, ao usar **Limpar**. | Idem. Para continuar, **Limpar mesmo assim**; para desistir, **Voltar**. |
| "Remover o PIX da venda?" / "Limpar o pagamento com PIX gerado?" ("A cobrança já foi gerada no banco") | Existe PIX gerado. O Checkout não cancela a cobrança. | Leia o aviso e o capítulo [07](#07-pagamento-pix). |
| "Cartão aprovado no TEF só sai da venda por estorno: use o botão Remover da forma para estornar no TEF." | Tentou limpar uma venda com cartão TEF aprovado. | Estorne pelo botão de remover (capítulo [08](#08-pagamento-com-cartão-tef)). |
| "Informe o código do vale devolução." | Código vazio. | Digite o código. |
| "Este vale devolução já foi aplicado nesta venda." | O mesmo vale duas vezes. | Use outro vale. |
| "O vale informado está sendo validado no ERP. Aguarde o resultado." | A validação está em curso. | Espere. |
| "Não foi possível validar o vale devolução no ERP: nada foi aplicado." | Falha na validação do vale. | Tente de novo. |
| "Esta forma de pagamento não é vale devolução: escolha a forma de vale no catálogo." | Forma errada para o vale. | Escolha a forma de vale. |
| Frase do ERP ao validar o vale (por exemplo, vale inválido ou já utilizado) | O ERP recusou o vale e disse o motivo. | Confira o código ou use outro vale. |
| "Este cartão aprovado no TEF não tem a identificação da transação para estornar: confira o estorno no ERP." | Cartão aprovado sem identificador para estornar. | Chame o suporte. O estorno precisa ser conferido no ERP. |

## Dúvidas frequentes

**O que é "Faltante"?**
É o quanto ainda falta pagar. Quando chega a zero, o painel passa a mostrar **Troco** no lugar.

**Posso pagar com duas formas de cartão?**
Sim, com valores diferentes. O que não pode é lançar mais de uma forma de dinheiro.

**Lancei a forma errada. E agora?**
Remova pelo botão de remover da forma (ela fica riscada na lista). Cartão aprovado no TEF exige estorno.

**Por que não consigo mais mudar a quantidade de um item?**
Porque a venda já está em pagamento. Use **Limpar** para voltar a editar.

**O desconto que dei sumiu.**
**Limpar** também remove o desconto. Se o valor ficou inválido ao digitar, o Checkout o descarta e mostra o motivo.

## Veja também

- [05. Produtos e carrinho](#05-produtos-e-carrinho)
- [07. Pagamento PIX](#07-pagamento-pix)
- [08. Pagamento com cartão (TEF)](#08-pagamento-com-cartão-tef)
- [09. Venda rápida e atalhos](#09-venda-rápida-e-atalhos)
- [10. Finalizar e suspender a venda](#10-finalizar-e-suspender-a-venda)
- [11. Importar DAV e recuperar NFC-e](#11-importar-dav-e-recuperar-nfc-e)

---

# 07. Pagamento PIX

> Como cobrar por PIX: o Checkout mostra um QR Code, espera o banco confirmar e libera a venda; o Checkout não cancela a cobrança no banco.

**Quem usa:** Operador de caixa | Suporte

## Para que serve

Quando o cliente paga por **PIX**, o Checkout pede ao ERP uma cobrança, mostra o **QR Code** na tela (e na tela do cliente, se estiver aberta) e fica consultando o banco até o pagamento ser confirmado. Você não digita nada: a janela fecha sozinha depois da aprovação.

> **Atenção:** o PIX depende do ERP da loja devolver a cobrança. Em ambiente de testes, a geração de cobrança ainda não tinha sido validada de ponta a ponta. Antes de colocar o PIX em uso numa loja, faça uma cobrança de teste de valor baixo (veja o capítulo [15](#15-solução-de-problemas)).

## Antes de começar

- **A loja precisa ter o PIX ativo** no ERP. Sem isso, a forma de PIX aparece apagada ("indisponível: a integração PIX não está ativa neste ponto de venda").
- A venda precisa ter **um cliente**: o ERP exige o cliente na cobrança. O cliente padrão da loja já cumpre isso. Se a loja não tem cliente padrão, identifique o cliente antes de bipar (capítulo [03](#03-identificar-cliente)).
- O PIX tem **valor mínimo**, definido no ERP. Abaixo dele, a cobrança não é gerada.
- Em lojas que cobram o PIX pela maquininha (TEF), o PIX segue o fluxo do capítulo [08](#08-pagamento-com-cartão-tef), e não este.

## Passo a passo

### Cobrar por PIX

1. Escolha a **condição de pagamento** e, em **Forma de pagamento**, a forma de **PIX** (capítulo [06](#06-pagamento)).
2. Informe o valor e pressione **Enter** (ou clique em **Adicionar pagamento**). O Checkout confere a venda com o ERP.
3. A janela **Pagamento via PIX** abre, com o subtítulo **Aguardando pagamento**. Enquanto o QR Code carrega, aparece "Gerando o QR Code do PIX".
4. Mostre o QR Code ao cliente. Ele abre o aplicativo do banco e escaneia ("Abra o app do seu banco e escaneie o QR Code para concluir o pagamento."). Se a tela do cliente estiver aberta, o QR Code aparece lá também (capítulo [14](#14-display-do-cliente)).
5. Se o cliente preferir, use o **código copia e cola**. Clique no botão **Copiar código PIX** e a mensagem **Código PIX copiado.** confirma.
6. A janela mostra **Valor a cobrar** e o selo **Aguardando confirmação**. O Checkout consulta o banco a cada 10 segundos.
7. Quando o banco confirma, a janela mostra **Pagamento aprovado** ("Transação concluída com sucesso" e "Pagamento confirmado pelo banco. Esta janela fecha sozinha em instantes."). Ela fecha sozinha em cerca de 10 segundos. Se quiser fechar antes, clique em **Fechar**.
8. A forma de PIX entra em **Pagamentos aplicados**. Quando o total estiver coberto, o cursor vai para **Finalizar venda**.

![Janela Pagamento via PIX aguardando: QR Code ao centro, texto "Abra o app do seu banco e escaneie o QR Code para concluir o pagamento.", linha com o código copia e cola e os botões Copiar e Enviar por WhatsApp, Valor a cobrar R$ 50,00, selo Aguardando confirmação e botão Desistir da operação.](imagens/07-01-pix-aguardando.png)
*Figura 07.01 — Janela Pagamento via PIX aguardando o cliente pagar.*

![Janela Pagamento via PIX aprovado: ícone verde, título Pagamento aprovado, subtítulo Transação concluída com sucesso, valor pago e botão Fechar.](imagens/07-02-pix-aprovado.png)
*Figura 07.02 — Pagamento aprovado.*

### Enviar a cobrança por WhatsApp

1. Na janela **Pagamento via PIX**, clique no botão **Enviar por WhatsApp**, ao lado de **Copiar código PIX**.
2. Preencha **Nome do cliente** ("Para quem é a cobrança") e **Número de destino (com DDD)**, por exemplo (11) 98765-4321. Quando o cliente é identificado, os dados dele já vêm preenchidos; com o cliente padrão, o nome é obrigatório.
3. Clique em **Enviar cobrança**. O botão mostra **Enviando…** durante o envio.
4. Quando o ERP aceita, aparece "Cobrança PIX enviada para o WhatsApp do cliente." e, na janela, **Cobrança enviada por WhatsApp.**

O número pode ter 10 ou 11 dígitos (DDD mais número) ou já começar com 55.

![Janela Pagamento via PIX com o formulário do WhatsApp aberto: campos Nome do cliente e Número de destino (com DDD) preenchidos com dados fictícios e o botão Enviar cobrança.](imagens/07-03-pix-whatsapp.png)
*Figura 07.03 — Envio da cobrança por WhatsApp.*

### Quando o cliente desiste

1. Na janela, clique em **Desistir da operação**.
2. O Checkout pergunta **Desistir da cobrança PIX?** ("A cobrança já foi gerada no banco").
3. Leia o aviso: **O PIX não é cancelado por aqui.** Desistir tira o PIX da venda, mas a cobrança continua existindo no banco até você resolvê-la lá.
4. Para sair, clique em **Desistir mesmo assim**. Para continuar esperando, clique em **Continuar aguardando**.

![Confirmação "Desistir da cobrança PIX?" com o subtítulo "A cobrança já foi gerada no banco", o aviso "O PIX não é cancelado por aqui" e os botões "Continuar aguardando" e "Desistir mesmo assim".](imagens/07-04-pix-desistir.png)
*Figura 07.04 — Confirmação ao desistir de uma cobrança PIX.*

### Se a cobrança não for gerada

1. A janela mostra **Falha ao gerar a cobrança** e "Não foi possível gerar a cobrança PIX." com o motivo.
2. Clique em **Tentar novamente**.
3. Se continuar falhando, feche (**Desistir da operação**), use outra forma de pagamento e chame o suporte.

## Regras e bloqueios

- **A janela do PIX trava até a aprovação.** O botão de fechar (X) fica bloqueado com o motivo: "Aguarde a confirmação do pagamento. Se o cliente desistiu, use "Desistir da operação"."
- **O Checkout não cancela a cobrança no banco.** Desistir, remover a forma do PIX, limpar o pagamento ou suspender a venda **não devolvem o dinheiro**. Se o cliente pagar depois, o valor entra numa venda que já não existe, e só o banco desfaz. O cancelamento ou o estorno é feito direto no banco, e a desassociação do documento, na Central de Transações PIX do ERP.
- **Remover ou limpar um PIX** pede confirmação ("Remover o PIX da venda?", "Limpar o pagamento com PIX gerado?"). O aviso é o mesmo: a cobrança continua no banco.
- **Suspender a venda com PIX gerado** pede confirmação ("Cancelar a venda com PIX gerado?"). A venda vira rascunho no ERP, e a cobrança não é cancelada.
- **Valor mínimo.** Abaixo do mínimo da loja, a janela nem abre: aparece "O valor mínimo para cobrança PIX é R$ X. Escolha outra forma de pagamento."
- **Cliente obrigatório** para gerar a cobrança (o cliente padrão serve).
- **WhatsApp** só funciona se a loja tiver o envio habilitado no ERP. Sem isso, o botão fica bloqueado: "Envio do PIX por WhatsApp desabilitado. Entre em contato com o comercial para habilitar."
- **Falha, expiração ou recusa do banco:** a forma sai da venda sozinha, com um aviso explicando o motivo.

## Mensagens que você pode ver

| Mensagem na tela | O que significa | O que fazer |
|---|---|---|
| "O valor mínimo para cobrança PIX é R$ X. Escolha outra forma de pagamento." | O valor é menor que o mínimo da loja. | Use outra forma ou some outro valor. |
| "Identifique o cliente da venda antes de gerar o PIX: o ERP exige o cliente na cobrança." | A venda está sem cliente (loja sem cliente padrão). | Identifique o cliente. Como o cliente não troca depois de ter item, isso se faz antes de bipar; se já há itens, é preciso cancelar os itens (e usar **Limpar**, se já escolheu a condição) para poder identificar o cliente. |
| "O ERP não gerou o QR Code desta cobrança. Confira a configuração do PIX da empresa no ERP." | O ERP respondeu, mas sem QR Code. | Use outra forma. Chame o suporte para conferir a configuração do PIX. |
| "Não foi possível gerar a cobrança PIX. Tente novamente." | Falha ao gerar. | **Tentar novamente**; se persistir, outra forma. |
| "Aguarde a confirmação do pagamento. Se o cliente desistiu, use "Desistir da operação"." | Tentou fechar a janela durante a espera. | Aguarde ou use **Desistir da operação**. |
| "A cobrança PIX expirou sem pagamento." | O tempo da cobrança acabou. | A forma saiu da venda. Gere outra, se o cliente ainda quiser pagar. |
| "A cobrança PIX foi recusada." | O banco recusou. | Idem. |
| "A cobrança PIX terminou em erro no provedor de pagamento." | Erro do provedor. | Idem; se repetir, chame o suporte. |
| "A cobrança PIX foi encerrada sem pagamento." | A cobrança foi encerrada. | Idem. |
| "A cobrança PIX foi desassociada na Central de Transações PIX." | Alguém desassociou a cobrança no ERP. | Idem; confira com o gestor. |
| "A cobrança PIX retornou uma situação desconhecida e não pode ser confirmada." | O ERP devolveu um status que o Checkout não conhece. | Chame o suporte. Confirme no banco se o dinheiro entrou. |
| "Cobrança PIX encerrada sem confirmação de pagamento." | Você desistiu. | Siga o aviso sobre o banco. |
| "Não foi possível copiar o código. Selecione e copie manualmente." | O navegador bloqueou a cópia. | Selecione o código na tela e copie. |
| "Informe o número de destino com DDD, por exemplo (11) 98765-4321." | Número inválido. | Corrija o número. |
| "Informe o nome do cliente para enviar a cobrança." | Nome vazio (cliente padrão). | Digite o nome. |
| "Identifique o cliente da venda para enviar a cobrança por WhatsApp." | Sem cliente. | Identifique o cliente. |
| "Enviando a cobrança. Aguarde a resposta do ERP." | O envio está em curso. | Espere. |
| "O ERP não respondeu ao envio." / "O ERP recusou a chamada de envio." / "O ERP respondeu em formato inesperado." / "A sessão terminou antes do envio." (seguidas de "A cobrança continua válida na tela.") | O envio falhou. | A cobrança continua válida. Mostre o QR Code ou copie o código e tente de novo. |

> **Suporte:** o PIX usa três chamadas ao ERP: gerar a cobrança, consultar o status (a cada 10 segundos) e, opcionalmente, enviar por WhatsApp. Pontos a confirmar quando a cobrança não nasce: PIX ativo na configuração da loja, forma de PIX cadastrada na condição, cliente identificado e valor acima do mínimo. Durante a homologação, o ERP de testes chegou a recusar a geração com o cliente padrão. Veja o capítulo [15](#15-solução-de-problemas).

## Dúvidas frequentes

**O cliente pagou, mas a janela continua em "Aguardando". O que faço?**
Espere até 10 segundos e confira se o dinheiro entrou no banco. Se entrou e a tela não atualiza, não gere outra cobrança sem antes conferir. Chame o suporte.

**Posso finalizar a venda sem esperar o PIX?**
Não. A janela só libera quando o banco confirma, ou quando você desiste (e o PIX sai da venda).

**O cliente pagou depois que eu desisti.**
O dinheiro entrou no banco, mas não na venda. Resolva o estorno direto no banco e peça ao gestor para tratar a desassociação na Central de Transações PIX do ERP.

**Dá para dividir um pagamento entre PIX e dinheiro?**
Sim. Lance cada forma com o valor correspondente (capítulo [06](#06-pagamento)).

## Veja também

- [06. Pagamento](#06-pagamento)
- [08. Pagamento com cartão (TEF)](#08-pagamento-com-cartão-tef)
- [10. Finalizar e suspender a venda](#10-finalizar-e-suspender-a-venda)
- [14. Display do cliente](#14-display-do-cliente)
- [15. Solução de problemas](#15-solução-de-problemas)

---

# 08. Pagamento com cartão (TEF)

> Como cobrar no cartão: pelo TEF (o Checkout manda o valor para a maquininha e espera) ou pela maquininha avulsa (você cobra fora do Checkout e só registra).

**Quem usa:** Operador de caixa | Suporte

## Para que serve

O cartão pode ser cobrado de dois jeitos. Qual deles vale depende do cadastro da forma de pagamento no ERP, não de uma escolha sua:

- **TEF (integrado):** o Checkout envia o valor para a maquininha, acompanha a transação e só libera a venda quando o cartão é aprovado. Aparece a janela **Pagamento no TEF**.
- **Maquininha avulsa (POS):** nenhuma janela abre. Você passa o cartão na maquininha, fora do Checkout, e o Checkout apenas registra a forma e o valor na venda. A aprovação é sua responsabilidade: confira na maquininha antes de finalizar.

Formas de PIX cadastradas para cobrar no terminal também seguem o fluxo de TEF descrito aqui.

> **Atenção:** o fluxo de TEF foi implementado e medido contra uma maquininha simulada. Ele ainda não foi validado com um terminal real da loja. Antes de usar numa loja nova, faça uma cobrança e um estorno de teste de valor baixo, com o suporte acompanhando.

## Antes de começar

- **A loja precisa ter o TEF ativo** e a forma de pagamento precisa estar cadastrada para passar pelo TEF. Quem faz isso é o suporte, no ERP.
- **O seu usuário precisa estar vinculado a uma maquininha no ERP.** O ERP escolhe a maquininha pelo usuário que está operando. Sem o vínculo, o Checkout recusa a cobrança no TEF.
- **A venda precisa ter cliente** (o cliente padrão serve) para a cobrança no TEF.
- **A maquininha deve estar ligada e conectada** durante toda a operação.

## Passo a passo

### Cobrar no cartão pelo TEF

1. Escolha a **condição de pagamento** e a **forma** de cartão (capítulo [06](#06-pagamento)).
2. Informe o valor e pressione **Enter** (ou **Adicionar pagamento**). O Checkout confere a venda com o ERP.
3. A janela **Pagamento no TEF** abre ("Operação em andamento"). Primeiro aparece **Enviando para a maquininha…** e depois **Aguardando retorno do TEF**, com o selo **Processando** e o **Valor a cobrar**.
4. Peça ao cliente para passar ou aproximar o cartão **na maquininha** e digitar a senha, se pedir.
5. Não feche a janela nem desligue a maquininha ("Não feche esta tela nem desligue a maquininha durante a operação.").
6. Quando a maquininha aprova, a janela mostra **Pagamento aprovado** ("Transação concluída com sucesso") e o **Valor pago**. Ela fecha sozinha em cerca de 10 segundos; se quiser, clique em **Fechar**.
7. A forma aparece em **Pagamentos aplicados**. Com o total coberto, o cursor vai para **Finalizar venda**.

No cartão de **crédito**, o número de parcelas enviado à maquininha é o prazo da condição de pagamento escolhida. Em **débito** e nas demais formas, a cobrança é à vista.

![Janela Pagamento no TEF aguardando: título Pagamento no TEF, subtítulo Operação em andamento, indicador de carregamento, selo Processando, texto "Aguardando retorno do TEF", aviso "Não feche esta tela nem desligue a maquininha durante a operação.", Valor a cobrar R$ 80,00 e botão Desistir da operação.](imagens/08-01-tef-aguardando.png)
*Figura 08.01 — Janela Pagamento no TEF aguardando a maquininha.*

![Janela Pagamento no TEF aprovado: título Pagamento aprovado, subtítulo Transação concluída com sucesso, selo Aprovado, Valor pago e botão Fechar.](imagens/08-02-tef-aprovado.png)
*Figura 08.02 — Cartão aprovado no TEF.*

### Quando a maquininha não aprova uma tentativa

1. A janela continua aberta e mostra **O cartão não foi aprovado**.
2. Leia o texto: "A maquininha não aprovou esta tentativa. O cliente pode passar o cartão de novo, ou usar outro: esta tela continua esperando a aprovação." Quando a maquininha informa o motivo, ele aparece em **Motivo informado:**.
3. O cliente tenta de novo na maquininha. Não é preciso fazer nada no Checkout.

![Janela Pagamento no TEF com o bloco "O cartão não foi aprovado", o texto explicando que o cliente pode passar o cartão de novo e a linha "Motivo informado:" com um texto de exemplo.](imagens/08-03-tef-tentativa-recusada.png)
*Figura 08.03 — Tentativa recusada: a janela continua esperando.*

### Quando o cliente desiste

1. Clique em **Desistir da operação**.
2. O Checkout pergunta **Desistir do pagamento no TEF?** ("A cobrança pode já estar na maquininha").
3. Leia o aviso: **A transação não é cancelada por aqui.** O Checkout não cancela a transação na maquininha. Se o cliente ainda passar o cartão, ela pode ser aprovada. Confira no terminal antes de cobrar de outro jeito.
4. Para sair, clique em **Desistir mesmo assim**. Para continuar esperando, clique em **Continuar aguardando**.

### Estornar um cartão já aprovado no TEF

1. Em **Pagamentos aplicados**, clique no botão de remover do cartão (**Remover Cartão de crédito** ou **Remover Cartão de débito**).
2. O Checkout pergunta **Estornar o pagamento no cartão?** ("O pagamento já foi aprovado no TEF"), com o aviso "O valor volta para o cartão do cliente".
3. Para seguir, clique em **Estornar**. Para desistir, **Voltar**.
4. A janela **Estorno no TEF** abre: **Consultando a transação** e depois **Estorno em andamento** ("Aguardando a confirmação do estorno"). Mantenha a maquininha ligada.
5. Quando concluir, a janela mostra **Estornado** ("Estorno efetuado com sucesso") e **Valor estornado**. A forma sai da venda, fica riscada na lista e o valor volta a faltar.
6. Se não quiser esperar, clique em **Desistir de esperar**. O Checkout pergunta **Desistir de esperar o estorno?** ("O estorno já foi pedido ao TEF"). O estorno pode se concluir na maquininha sem o Checkout ver. O pagamento **continua aprovado na venda**, e a venda continua sem poder ser suspensa, até você conferir. Para conferir, clique em **Remover** de novo.

![Janela Estorno no TEF em andamento: subtítulo Estorno em andamento, texto "Aguardando a confirmação do estorno", aviso para não fechar a tela nem desligar a maquininha, Valor a estornar e botão Desistir de esperar.](imagens/08-04-tef-estorno.png)
*Figura 08.04 — Estorno no TEF em andamento.*

### Cobrar em maquininha avulsa (POS)

1. Escolha a forma de cartão que a sua loja usa para a maquininha avulsa (a forma que **não** abre a janela do TEF).
2. Informe o valor e adicione. A forma entra direto em **Pagamentos aplicados**, aprovada.
3. Passe o cartão na maquininha avulsa. Confira a aprovação **antes** de finalizar a venda.
4. Se o cartão não passar, remova a forma do Checkout (ela sai na hora, sem estorno).

## Regras e bloqueios

- **Cartão aprovado no TEF não é removido de forma simples:** só sai por **estorno**.
- **Limpar** fica bloqueado com cartão aprovado no TEF: "Cartão aprovado no TEF só sai da venda por estorno: use o botão Remover da forma para estornar no TEF."
- **Cancelar venda** (suspender) fica bloqueado com cartão aprovado no TEF: "Há cartão aprovado no TEF nesta venda: estorne a forma pelo botão Remover antes de cancelar a venda." A tecla **F10** diz a mesma coisa.
- **A janela do TEF trava até o fim.** O botão de fechar fica bloqueado: "Aguarde o retorno do TEF. Se o cliente desistiu, use "Desistir da operação"." Na janela de estorno: "Aguarde a confirmação do estorno. Para sair sem esperar, use "Desistir de esperar"."
- **O Checkout consulta a maquininha a cada 10 segundos.**
- **Cartão de documento retomado:** em uma venda retomada de DAV ou NFC-e com cartão já cobrado, o Checkout não oferece estorno. O estorno dessa forma não é feito pelo Checkout: chame o suporte.
- **O Checkout não cancela transações em andamento.** O cancelamento e o estorno de uma transação que você abandonou precisam ser conferidos na maquininha.

## Mensagens que você pode ver

| Mensagem na tela | O que significa | O que fazer |
|---|---|---|
| "Este operador não tem usuário do TEF vinculado no ERP: peça ao administrador para vincular a maquininha ao seu usuário, ou escolha outra forma de pagamento." | O seu usuário não está ligado a nenhuma maquininha no ERP. | Use outra forma. Peça ao administrador/suporte para vincular a maquininha. |
| "Identifique o cliente da venda antes de cobrar no TEF." | A venda está sem cliente. | Veja o capítulo [03](#03-identificar-cliente). |
| "Falha ao criar a cobrança" / "Não foi possível criar a cobrança no TEF." (com o motivo do ERP) | O ERP não conseguiu criar a cobrança (maquininha não encontrada, TEF fora do ar, rede). | Clique em **Tentar novamente**. Se persistir, use outra forma e chame o suporte. |
| "O ERP respondeu sem identificar a cobrança: ela pode ter sido criada na maquininha. Confira no terminal antes de tentar de novo." | A resposta veio sem identificador. | **Não** tente de novo antes de olhar a maquininha: o cliente pode ser cobrado em duplicidade. |
| "O ERP não respondeu à criação da cobrança." | Sem resposta do ERP. | Confira a rede e a maquininha antes de tentar de novo. |
| "Aguarde o retorno do TEF. Se o cliente desistiu, use "Desistir da operação"." | Tentou fechar a janela durante a espera. | Aguarde ou use **Desistir da operação**. |
| "O cartão não foi aprovado" | A maquininha recusou esta tentativa. | O cliente tenta de novo ou usa outro cartão. |
| "O operador da maquininha não aceitou a cobrança, e nada foi cobrado do cliente. Escolha outra forma de pagamento ou cobre de novo." | A cobrança foi rejeitada. | Escolha outra forma ou cobre de novo. |
| "O ERP cancelou a cobrança antes de ela ser aprovada. Confira na maquininha antes de cobrar de outro jeito." | A cobrança foi cancelada no ERP. | Confira a maquininha. |
| "A cobrança foi estornada fora do Checkout antes de ser confirmada aqui. Confira na maquininha antes de cobrar de outro jeito." | Alguém estornou fora do Checkout. | Confira a maquininha. |
| "Pagamento no TEF encerrado sem aprovação." seguido de "O Checkout não cancela automaticamente a transação em voo no TEF. Se o cliente ainda passar o cartão, ela pode ser aprovada na maquininha: confira no terminal antes de cobrar de outro jeito." | Você desistiu do TEF. | Confira o terminal. |
| "Este cartão aprovado no TEF não tem a identificação da transação para estornar: confira o estorno no ERP." | Faltou o identificador para estornar. | Chame o suporte. O estorno precisa ser feito/conferido no ERP. |
| "Não foi possível pedir o estorno." (com o motivo e "O pagamento continua aprovado.") | O pedido de estorno falhou. | Tente de novo. Se persistir, chame o suporte. |
| "A maquininha não aceitou o estorno, e ele não foi feito. O pagamento continua aprovado na venda." | Estorno rejeitado. | O pagamento continua aprovado. Chame o suporte. |
| "O estorno foi solicitado e pode se concluir na maquininha sem o Checkout ver. O pagamento continua aprovado na venda: use "Remover" de novo para conferir o status." | Você desistiu de esperar o estorno. | Use **Remover** de novo para conferir. |

> **Suporte:** o operador é identificado na maquininha pelo identificador do usuário no ERP, e o Checkout o obtém no momento do acesso. Se o aviso de "usuário do TEF vinculado" aparecer, confirme o vínculo no ERP e peça ao operador para **reabrir o Checkout pelo ERP** (a sessão antiga não tem o dado). Em desistência de cobrança ou de estorno, o status real só se confere na maquininha ou no ERP. Em loja de homologação sem maquininha cadastrada para o usuário, o ERP responde que a maquininha não foi localizada e nada é cobrado.

## Dúvidas frequentes

**O cliente passou o cartão, mas a janela continua esperando.**
Aguarde alguns segundos: o Checkout consulta a cada 10 segundos. Não gere outra cobrança. Se passar muito tempo, confira na maquininha e chame o suporte.

**Desisti, mas o cliente ainda passou o cartão. E agora?**
A transação pode ter sido aprovada na maquininha. O Checkout não a cancela. Confira no terminal, estorne pela maquininha ou pelo ERP e chame o suporte.

**Preciso estornar um cartão de uma venda antiga.**
Não é possível pelo Checkout: ele só estorna cartões da venda em andamento. Chame o suporte.

**A forma de cartão que eu uso abre a janela do TEF e a outra não. Por quê?**
É o cadastro da forma no ERP: formas marcadas para TEF passam pela maquininha integrada; as demais são maquininha avulsa.

## Veja também

- [06. Pagamento](#06-pagamento)
- [07. Pagamento PIX](#07-pagamento-pix)
- [10. Finalizar e suspender a venda](#10-finalizar-e-suspender-a-venda)
- [15. Solução de problemas](#15-solução-de-problemas)

---

# 09. Venda rápida e atalhos

> Todas as teclas do Checkout em uma tabela, e como funcionam os atalhos de venda rápida (F6 a F9), que lançam o pagamento inteiro com um toque.

**Quem usa:** Operador de caixa | Supervisor/gestor | Suporte

## Para que serve

Duas famílias de atalhos aceleram o caixa:

1. **Teclas fixas (F1, F2, F3, F4 e F10):** são as mesmas em toda loja. Abrem a importação, a busca de cliente, a busca de produto e suspendem a venda.
2. **Venda rápida (F6 a F9):** a sua loja cadastra no ERP até quatro "cenários de pagamento" (por exemplo, "Dinheiro à vista" ou "PIX"). Cada cenário vira uma tecla que lança a condição e a forma de pagamento de uma vez, pelo valor que falta pagar.

## Antes de começar

- As teclas fixas funcionam em **qualquer** equipamento, com ou sem mouse, no computador, no tablet ou no celular com teclado físico.
- As teclas F6 a F9 só funcionam se a **sua loja tiver cenários cadastrados** no ERP. Sem cenário, essas teclas continuam sendo do navegador.
- Os atalhos **não aparecem escritos nos botões** da tela, com uma exceção: os botões de venda rápida mostram o nome e a tecla (por exemplo, **PIX (F6)**).

## Tabela mestra de atalhos

### Teclas fixas do Checkout

| Tecla | O que faz | Quando é recusada |
|---|---|---|
| **F1** | Abre a janela **Importar DAV** (capítulo [11](#11-importar-dav-e-recuperar-nfc-e)). | Venda que já tem itens (mesmo cancelados) ou cliente identificado, ou que veio de um documento, ou que já está em pagamento (condição escolhida ou pagamento aprovado). No layout compacto: "A importação de DAV e NFCe não está disponível no layout compacto: use um PDV com mouse." |
| **F2** | Abre a janela de **recuperação de NFC-e** (capítulo [11](#11-importar-dav-e-recuperar-nfc-e)). | As mesmas recusas do **F1**. |
| **F3** | Abre a janela **Consultar cliente** (capítulo [03](#03-identificar-cliente)). | Venda com itens ativos: "Esta venda já tem itens: o cliente não pode mais ser trocado, [...]". |
| **F4** | Abre a janela **Consultar produto** (capítulo [05](#05-produtos-e-carrinho)). | Venda em pagamento: "Esta venda já está em pagamento: use "Limpar" no cartão de pagamento [...]". |
| **F10** | **Suspende** a venda, o mesmo que o botão **Cancelar venda** (capítulo [10](#10-finalizar-e-suspender-a-venda)). | Venda sendo enviada ao ERP; venda vazia; cartão aprovado no TEF na venda. |

Regras que valem para as cinco teclas:

- **Funcionam em qualquer lugar da tela de venda**, inclusive com o cursor em um campo de digitação (código do produto, quantidade, valor recebido) e mesmo com uma janela aberta. Com janela aberta, a tecla **não faz a ação** (para não ser executada por baixo da janela), mas também **não volta para o navegador**.
- **A tecla nunca vai para o navegador.** F1 não abre a ajuda do navegador, F3 não abre a busca do Chrome, F4 não abre o menu do navegador.
- Quando a ação não pode ser feita, o Checkout mostra o **motivo** em um aviso no canto da tela. A tecla nunca fica muda.
- **Segurar a tecla** conta como uma pressionada só.
- Ao abrir uma janela por atalho, o cursor já cai no campo de busca.

### Teclas de venda rápida

| Tecla | O que faz |
|---|---|
| **F6**, **F7**, **F8**, **F9** | Lançam o cenário de pagamento cadastrado para a tecla. O nome e a tecla aparecem nos botões da faixa **Métodos de pagamento rápidos** (no topo do painel de pagamento, no computador). |

### Outras teclas úteis da tela

| Tecla | Onde | O que faz |
|---|---|---|
| **Enter** | Campo de código do produto | Lança o produto (aceita `3*código`). |
| **Tab** | Campo de código do produto | Faz o mesmo que **Enter**. |
| **Shift+Tab** | Campo de código do produto | Leva o cursor ao campo do cliente. |
| **Esc** | Barra de produto | Cancela a prévia ou a edição do item. |
| **Enter** | Campos da barra de produto (quantidade, preço, desconto) | Confirma o item. |
| **Enter** | Campo **Código do cliente ou CPF** | Identifica o cliente. |
| **Enter** | Campo **Desconto** | Aplica o desconto da venda. |
| **Enter** | Campo **Valor recebido** | Adiciona o pagamento. |
| **Enter** | Campo **Código do vale** | Aplica o vale devolução. |
| **Seta para cima / para baixo** | Campo **Condição de pagamento** ou **Forma de pagamento** (fechado) | Muda a opção. |
| **Esc** | Lista aberta de condição ou forma | Fecha a lista. |
| **Esc** | Janelas de busca (cliente, produto, vendedor), vale devolução, avisos de erro, janelas de PIX e TEF **depois da aprovação** | Fecha a janela. |
| **F5** | Qualquer lugar | Atualiza a página: **perde a venda**. O navegador pede confirmação. |
| **F11** | Qualquer lugar | Tela cheia do navegador. O Checkout não controla essa tecla. |
| **F12** | Qualquer lugar | Ferramentas do navegador. O Checkout não controla essa tecla. |

> **Atenção:** **F5, F11 e F12 pertencem ao navegador.** F5 apaga a venda em andamento (o navegador pergunta antes). Não use F5 no meio de uma venda.

## Passo a passo

### Lançar um pagamento com uma tecla de venda rápida

1. Lance os itens da venda (a venda precisa ter pelo menos um item ativo).
2. Com o cursor no **campo de código do produto** ou fora de qualquer campo, pressione a tecla do cenário (por exemplo, **F6**), ou clique no botão do cenário na faixa **Métodos de pagamento rápidos**.
3. O Checkout escolhe a **condição**, aplica a **forma** pelo **valor que falta** e confere a venda com o ERP.
4. Se a forma for **PIX** ou **cartão no TEF**, a janela correspondente abre e o Checkout espera a aprovação (capítulos [07](#07-pagamento-pix) e [08](#08-pagamento-com-cartão-tef)).
5. Se o cenário **encerra a operação** e o total ficou coberto, o Checkout **finaliza a venda sozinho**, sem pedir confirmação.
6. Se o cenário **não** encerra a operação, a venda fica pronta no pagamento. Revise e clique em **Finalizar venda**.

> **Atenção:** um cenário que "encerra a operação" **emite a NFC-e na hora**. Confira o carrinho, o cliente e o vendedor **antes** de pressionar a tecla.

![Faixa "Métodos de pagamento rápidos" no topo do painel de pagamento, com quatro botões: "PIX (F6)", "Dinheiro (F7)", "Débito (F8)" e "Crédito (F9)", todos em cinza.](imagens/09-01-faixa-venda-rapida.png)
*Figura 09.01 — Faixa de venda rápida no painel de pagamento.*

![Faixa de venda rápida bloqueada com a venda vazia: botões apagados e, ao clicar, o aviso "Não há itens nesta venda: bipe ao menos um produto antes de usar o atalho de pagamento."](imagens/09-02-faixa-bloqueada.png)
*Figura 09.02 — Faixa de venda rápida apagada porque a venda não tem item.*

![Aviso de recusa no canto superior direito depois de pressionar F7 com um pagamento já lançado: "Esta venda já tem pagamento iniciado: o atalho lança a condição e a forma dele, e cada venda aceita uma condição só. Use "Limpar" no cartão de pagamento para recomeçar."](imagens/09-03-aviso-pagamento-iniciado.png)
*Figura 09.03 — Atalho recusado porque a venda já tem pagamento iniciado.*

### Posse da tecla e bipagem do leitor de código de barras

O leitor de código de barras funciona como um teclado muito rápido: ele digita os dígitos do código e termina com **Enter**. Ele **nunca** envia teclas de função. Por isso:

- **F1, F2, F3, F4 e F10** podem ser pressionadas a qualquer momento, até no meio da bipagem, sem atrapalhar a leitura do código.
- **F6 a F9 respeitam quem está digitando.** Se o cursor estiver em um campo de digitação (quantidade, desconto, valor recebido, busca, cliente), a tecla **não lança** o cenário. A única exceção é o **campo de código do produto**, onde o operador passa a venda toda: ali, F6 a F9 funcionam.
- **Janela aberta bloqueia F6 a F9**, porque a janela descreve uma decisão pendente (por exemplo, um PIX aguardando).
- **Segurar F6 a F9** lança uma vez só.

Resumo prático: para usar F6 a F9, deixe o cursor no campo de código do produto ou fora de qualquer campo.

## Regras e bloqueios

Um cenário de venda rápida só é lançado quando:

- a venda tem **pelo menos um item ativo**;
- **ainda não há pagamento iniciado**, ou a condição escolhida é a mesma do cenário. Cada venda usa uma condição só, e o atalho lança também a condição dele;
- **há valor em aberto** para cobrar;
- não existe outro lançamento de atalho em andamento.

Os botões da faixa ficam **apagados** quando a venda não tem item, com o motivo no texto ao passar o mouse e ao clicar.

Quais cenários aparecem:

- Só entram cenários com tecla de **F6 a F9**, nome preenchido, e cuja condição e forma existam no catálogo de pagamento da sessão.
- Se duas linhas usam a mesma tecla, vale a primeira.
- Cenários incompletos ou fora do padrão são ignorados em silêncio. Sem nenhum cenário válido, a faixa inteira some, sem mensagem.
- Nada na faixa depende de você: ela é cadastrada no ERP, por loja.

No **celular e no tablet**, as teclas F6 a F9 também funcionam com teclado físico, mas a faixa visual **não** é mostrada.

## Mensagens que você pode ver

| Mensagem na tela | O que significa | O que fazer |
|---|---|---|
| "Não há itens nesta venda: bipe ao menos um produto antes de usar o atalho de pagamento." | Venda sem item. | Lance um produto. |
| "Esta venda já tem pagamento iniciado: o atalho lança a condição e a forma dele, e cada venda aceita uma condição só. Use "Limpar" no cartão de pagamento para recomeçar." | Já existe forma aplicada, ou a condição escolhida é outra. | Use **Limpar** e pressione a tecla de novo, ou termine pelo painel. |
| "Esta venda não tem saldo em aberto: não há valor para o atalho lançar." | Não falta nada a pagar. | Finalize a venda. |
| "Esta forma de pagamento não pertence à condição selecionada." | O cenário no ERP aponta para uma forma que não existe na condição. | Chame o suporte: o cadastro do cenário precisa ser corrigido no ERP. |
| Recusa do ERP ao conferir a venda | Mesma conferência do capítulo [06](#06-pagamento). | Siga o motivo informado. |
| "A importação de DAV e NFCe não está disponível no layout compacto: use um PDV com mouse." | F1 ou F2 no celular/tablet. | Use um PDV com mouse. |
| Motivos de recusa de F1 e F2 | Ver capítulo [11](#11-importar-dav-e-recuperar-nfc-e). | Idem. |

> **Suporte:** se o botão ou o pagamento lançado por um atalho vier com a forma "errada" (por exemplo, "Cheque" no lugar de "Dinheiro"), o Checkout lança exatamente o par condição/forma cadastrado para a tecla no ERP. Corrija o cenário no ERP. Se a tecla F6 a F9 não faz nada, confirme que a loja tem cenário cadastrado para ela e que o cursor não está em um campo de digitação.

## Dúvidas frequentes

**Apertei F6 e abriu a barra de endereço do navegador.**
Não há cenário cadastrado para a F6 na sua loja. Sem cenário, a tecla volta a ser do navegador.

**Apertei F6 e nada aconteceu.**
Confira se há item na venda, se o cursor está no campo de código (e não em outro campo), se não há janela aberta e se a venda já tem forma aplicada.

**Posso usar F1 no meio de uma venda?**
A tecla funciona, mas a importação é recusada: ela só é aceita em uma venda totalmente nova, sem itens e sem cliente escolhido.

**F10 cancela a venda e apaga tudo?**
Não. F10 **suspende**: a venda vira rascunho no ERP e pode ser retomada. Numa venda vazia, só avisa que não há o que cancelar.

**Cada atalho fica registrado em algum lugar?**
Sim. A auditoria da venda registra o acionamento, com a origem "teclado" ou "clique" (capítulo [18](#18-auditoria-de-ações)).

## Veja também

- [03. Identificar cliente](#03-identificar-cliente)
- [05. Produtos e carrinho](#05-produtos-e-carrinho)
- [06. Pagamento](#06-pagamento)
- [10. Finalizar e suspender a venda](#10-finalizar-e-suspender-a-venda)
- [11. Importar DAV e recuperar NFC-e](#11-importar-dav-e-recuperar-nfc-e)
- [13. Celular e tablet](#13-celular-e-tablet)

---

# 10. Finalizar e suspender a venda

> Como emitir a NFC-e, o que fazer quando ela dá erro e como suspender (ou cancelar) uma venda sem emitir nota.

**Quem usa:** Operador de caixa | Supervisor/gestor | Suporte

## Para que serve

No fim da venda você tem dois caminhos:

- **Finalizar venda:** o Checkout envia a venda ao ERP, que emite a **NFC-e** (nota fiscal de consumidor eletrônica) e a autoriza na SEFAZ. Depois o cupom é impresso.
- **Cancelar venda:** o Checkout **suspende** a venda. Ela vira um **rascunho** no ERP, que pode ser retomado depois (capítulo [11](#11-importar-dav-e-recuperar-nfc-e)), e o caixa fica livre. O mesmo vale para a tecla **F10**. Quando a venda tem itens lançados, não existe no Checkout uma forma de "apagar" a venda: ela sempre é guardada como rascunho.

> **Atenção:** o Checkout **não reimprime e não cancela uma NFC-e já autorizada**. Isso se faz no ERP.

## Antes de começar

- Para finalizar, a venda precisa de: **vendedor**, itens com valor, **total totalmente coberto** pelas formas de pagamento e **aprovação do ERP** (capítulo [06](#06-pagamento)).
- O botão **Finalizar venda** só libera quando tudo isso está certo. Passe o mouse sobre o botão apagado para ver o que falta.
- Confira o cliente, o vendedor e os itens antes de finalizar. **Depois de emitida, a nota não volta.**

## Passo a passo

### Finalizar a venda

1. Confira **Total a pagar**, **Recebido** e **Troco** no painel.
2. Clique em **Finalizar venda** (ou pressione **Enter** quando o cursor já estiver no botão, o que acontece sozinho quando o total fica coberto).
3. O botão mostra **Finalizando…** e abre a janela **Autorizando NFCe**: "Aguarde a autorização da SEFAZ. Não feche nem recarregue esta tela." O título é **Finalizando venda** ("Aguardando o retorno do ERP"). A espera pode levar alguns segundos.
4. Quando o ERP autoriza, a janela **Venda finalizada** aparece ("NFCe autorizada com sucesso"), com o número e a série da nota, por exemplo "NFCe 1234 · série 1".
5. O Checkout cuida do cupom (veja "Impressão" abaixo). Ao fechar a janela, o caixa já está pronto para a **próxima venda**, com o cliente padrão e o vendedor padrão da loja.

![Janela "Autorizando NFCe": título Finalizando venda, subtítulo Aguardando o retorno do ERP, indicador de carregamento e o texto "Aguarde a autorização da SEFAZ. Não feche nem recarregue esta tela."](imagens/10-01-autorizando-nfce.png)
*Figura 10.01 — Aguardando a autorização da NFC-e.*

![Janela "Venda finalizada" com o subtítulo "NFCe autorizada com sucesso", o número da nota "NFCe 1234 · série 1", o texto "Enviado para a impressora" e o botão "Abrir o PDF em outra aba".](imagens/10-02-venda-finalizada.png)
*Figura 10.02 — Venda finalizada, com a nota emitida.*

### Impressão do cupom

A forma de imprimir é definida pelo ERP, por caixa:

- **Impressão direta:** o Checkout envia o cupom ao **serviço de impressão da própria máquina do caixa**, que fica fora do Checkout. A janela mostra **Enviado para a impressora** ("O cupom foi enviado à impressora do caixa. Se ele não sair, abra o PDF pelo botão abaixo. Esta janela fecha sozinha em 10 segundos."). Se o caixa não tiver o endereço do serviço de impressão configurado, o Checkout usa o endereço padrão `127.0.0.1:4545` e avisa.
- **PDF:** o Checkout abre o cupom em PDF em **outra aba**. Se o navegador bloquear a aba, a janela mostra **O navegador bloqueou a aba do PDF**: clique em **Abrir o PDF em outra aba**.

Em qualquer caso, você pode fechar a janela com **Esc**: a nota já foi emitida.

Se a impressão falhar, a janela mostra **Não foi possível imprimir** ("A venda foi emitida normalmente. Abra o PDF para conferir ou reimprimir."). **A venda foi emitida**: não finalize de novo.

![Janela Venda finalizada com falha de impressão: ícone amarelo, título "Não foi possível imprimir", texto "A venda foi emitida normalmente. Abra o PDF para conferir ou reimprimir.", aviso de erro de impressão e botão "Abrir o PDF em outra aba".](imagens/10-03-falha-impressao.png)
*Figura 10.03 — Falha de impressão com a nota já emitida.*

### Suspender (cancelar) a venda

1. Clique em **Cancelar venda**, na base da coluna de venda, ou pressione **F10**.
2. **Venda totalmente vazia** (sem item, sem cliente escolhido por você e sem origem em documento): aparece o aviso "Não há nada a cancelar: esta venda está vazia." e nada acontece.
3. **Sem nenhum item, mas com cliente escolhido por você:** o Checkout descarta a venda sem enviar nada ao ERP e mostra "Venda cancelada. Nada foi enviado ao ERP."
4. **Com itens lançados (mesmo que cancelados) ou vinda de um documento:** o Checkout envia a venda ao ERP como rascunho. Aparece "Venda suspensa. O rascunho continua disponível para retomada." e o caixa fica limpo, pronto para uma nova venda.
5. Para retomar o rascunho depois, use **Menu Importação** > NFC-e (capítulo [11](#11-importar-dav-e-recuperar-nfc-e)).

> **Atenção:** se a venda tem um **PIX já gerado**, o Checkout pergunta **Cancelar a venda com PIX gerado?** ("A venda vira rascunho no ERP, a cobrança não"). Leia o aviso: a cobrança **continua no banco**. Se o cliente pagar depois, o dinheiro entra numa venda que virou rascunho, e só o banco desfaz. Para seguir, clique em **Cancelar a venda mesmo assim**; para ficar, **Voltar para a venda**.

> **Atenção:** com **cartão aprovado no TEF**, a venda não pode ser suspensa: estorne o cartão antes (capítulo [08](#08-pagamento-com-cartão-tef)).

## Quando o envio dá erro

Cada tipo de erro tem uma janela e uma regra de ouro. Leia o **título** da janela.

### "NFCe não emitida" / "Venda não suspensa" (o ERP respondeu com erro)

- A janela diz **O envio não foi concluído** e **A venda continua aberta no checkout**.
- A caixa **Resposta do ERP** mostra o texto do ERP.
- Clique em **Entendi**, corrija o que o ERP apontou (se for o caso) e finalize (ou cancele) de novo. Nenhuma nota foi emitida.

### "Venda não aceita pelo ERP" (o ERP recusou a venda)

- A janela diz **A venda precisa de ajuste** e lista o **Motivo apontado pelo ERP**.
- A venda continua aberta no caixa. Ajuste o que o ERP apontou (cliente, condição, formas) e finalize de novo.

### "Sem resposta do servidor" (a internet caiu na hora do envio)

- A janela diz: "A finalização [ou suspensão] pode ou não ter sido processada" e **Confirme no ERP antes de reenviar**.
- **Não reenvie sem conferir.** Reenviar uma venda já processada emite um segundo documento fiscal.
- Confira no ERP se a nota foi emitida (ou se o rascunho foi criado). Depois:
  - **Já verifiquei, reenviar:** reenvia a venda. O botão mostra **Reenviando…**.
  - **Agora não:** fecha a janela e mantém a venda no caixa.

![Janela "Sem resposta do servidor" com o aviso "Confirme no ERP antes de reenviar", o texto "Reenviar uma venda já processada emite um segundo documento fiscal." e os botões "Agora não" e "Já verifiquei, reenviar".](imagens/10-04-sem-resposta.png)
*Figura 10.04 — Confirmação de reenvio depois de uma falha de rede.*

### "NFCe rejeitada" (a SEFAZ não autorizou)

- A janela diz **A SEFAZ não autorizou a nota** e **Corrija a nota no ERP**. Ela mostra o **Rascunho** e a **série** da nota gravada, o **Código** do erro e o **Motivo da rejeição**. Quando disponível, mostra uma **Sugestão de correção** e o link **Consultar solução detalhada**.
- **O ERP já gravou a nota** (não autorizada). Por isso o Checkout **não permite reenviar** a mesma venda: cada envio grava uma nota nova no ERP, e reenviar emitiria uma segunda nota para a mesma compra.
- Clique em **Fechar e iniciar uma nova venda**. O caixa é **limpo ao fechar**. Localize o rascunho no ERP, corrija e transmita de novo por lá.

> **Atenção:** se você vai refazer a venda do zero no Checkout em vez de corrigir no ERP, avise o gestor: a nota rejeitada continua existindo no ERP.

### "Cenário tributário não encontrado"

- A janela diz **Correção no cadastro fiscal do ERP** e **Não há o que corrigir no Checkout**.
- O produto ou o cliente não tem cenário tributário no ERP. Clique em **Fechar e iniciar uma nova venda** e peça a correção do cadastro fiscal ao responsável. O caixa é limpo ao fechar.

![Janela "NFCe rejeitada" com o subtítulo "A SEFAZ não autorizou a nota", linha "Rascunho 5001 · série 1", bloco "Motivo da rejeição" com um texto de exemplo, seção "Sugestão de correção" e o botão "Fechar e iniciar uma nova venda".](imagens/10-05-nfce-rejeitada.png)
*Figura 10.05 — NFC-e rejeitada: a correção é feita no ERP.*

## Documento na nota, WhatsApp e reimpressão

- **CPF na nota:** o Checkout informa ao ERP o **cliente** da venda, e o ERP monta a nota com os dados do cadastro desse cliente. O Checkout **não tem** uma opção própria para "CPF na nota" nem para trocar o documento no momento da finalização. Para a nota sair com CPF, identifique o cliente **antes** de bipar os produtos (capítulo [03](#03-identificar-cliente)). Com o cliente padrão, vale o que o ERP faz para o cliente padrão da loja.
- **WhatsApp:** o Checkout envia por WhatsApp apenas a **cobrança PIX** (capítulo [07](#07-pagamento-pix)). Ele **não envia a NFC-e** por WhatsApp.
- **Reimpressão:** não existe no Checkout. Se o cupom não saiu, use **Abrir o PDF em outra aba** na janela da venda finalizada, ou reimprima pelo ERP.

## Regras e bloqueios

- **Finalizar venda** fica apagado, com o motivo em texto, quando:
  - O envio anterior falhou ("O envio anterior falhou. Use "Tentar novamente" antes de finalizar.").
  - Falta vendedor ("Escolha o vendedor da venda: o ERP não aceita NFCe sem vendedor associado.").
  - O total não está coberto ("A venda ainda não fecha: lance itens e cubra todo o total com as formas de pagamento.").
  - O ERP ainda não aprovou ("O ERP ainda não aprovou esta venda. Revise cliente, condição e formas de pagamento.").
  - O envio está em curso ("Aguarde: esta venda ainda está sendo enviada ao ERP.").
- **Cancelar venda** e **F10** ficam bloqueados enquanto o envio está em curso, e com cartão aprovado no TEF.
- **Um envio por vez.** Enquanto há envio em curso, falha de rede sem resolver, NFC-e rejeitada ou erro de cenário tributário, o Checkout não aceita outro envio.
- **Cada envio grava uma nota nova no ERP.** É a regra por trás de todos os cuidados acima.
- A **venda retomada de um documento** (rascunho) mantém o número do rascunho; finalizar ou suspender atualiza o mesmo documento.

## Mensagens que você pode ver

| Mensagem na tela | O que significa | O que fazer |
|---|---|---|
| "Não há nada a cancelar: esta venda está vazia." | **Cancelar venda** em venda sem nada. | Nada a fazer. |
| "Venda cancelada. Nada foi enviado ao ERP." | Venda vazia descartada. | Nada. |
| "Venda suspensa. O rascunho continua disponível para retomada." | Suspensão concluída. | Retome pelo **Menu Importação**, se quiser. |
| "Há cartão aprovado no TEF nesta venda: estorne a forma pelo botão Remover antes de cancelar a venda." | Suspensão bloqueada pelo TEF. | Estorne o cartão (capítulo [08](#08-pagamento-com-cartão-tef)). |
| "A venda ainda não tem validação aprovada do ERP. Revise os pagamentos antes de finalizar." | O ERP não aprovou a venda. | Revise os pagamentos (capítulo [06](#06-pagamento)). |
| "Não há valor a faturar: insira ao menos um item com valor antes de finalizar." | Venda sem valor. | Lance itens. |
| "Configuração do ponto de venda indisponível: a venda não pode ser finalizada nem suspensa." | A configuração da loja não está carregada. | Abra o Checkout de novo pelo ERP. |
| "Não foi possível montar o pagamento desta venda: revise o desconto e as formas aplicadas." | Falha ao montar o pagamento. | Revise o desconto e as formas; se persistir, chame o suporte. |
| "A sessão do operador foi encerrada. Reabra o Checkout pelo ERP e tente novamente." | Sessão acabou; **nada foi emitido**. | Reabra pelo ERP e refaça a venda (capítulo [01](#01-acesso-e-sessão)). |
| "O ERP recusou a operação (HTTP N). Nada foi emitido." | O ERP devolveu um erro. | Tente de novo; se persistir, chame o suporte com o número N. |
| "O ERP respondeu em formato ilegível. Nada foi emitido." / "O ERP respondeu em formato inesperado. A venda não foi suspensa." | Resposta inválida. | Confira no ERP se algo foi gravado antes de tentar de novo. Chame o suporte. |
| "O ERP respondeu sem a nota fiscal pronta para impressão. A venda não foi emitida." | O ERP não devolveu a nota. | **Confira no ERP antes de reenviar** e chame o suporte. |
| "O ERP registrou a NFCe como não autorizada, mas não informou o motivo." | Rejeição sem detalhe. | Consulte a nota no ERP. |
| "O PDV não tem host de impressão configurado; foi usado o padrão 127.0.0.1:4545." | O caixa não tem o endereço do serviço de impressão cadastrado. | Se o cupom não sair, chame o suporte para cadastrar o endereço. |
| "Não foi possível imprimir diretamente: o serviço de impressão da máquina não respondeu." | O serviço de impressão não respondeu. | Use o PDF. Chame o suporte para conferir o serviço. |
| "O navegador bloqueou a comunicação com o serviço de impressão local. É configuração de navegador/política de TI [...], não uma falha da impressora." | O Chrome bloqueou a chamada à impressão local. | Use o PDF. Chame o suporte/TI da loja (capítulo [15](#15-solução-de-problemas)). |
| "Não foi possível falar com o serviço de impressão local. Confira se ele está rodando nesta máquina; se estiver, o navegador está bloqueando a chamada [...]" | Serviço parado ou bloqueado. | Idem. |
| "O ERP devolveu um PDF que o navegador não conseguiu abrir. A venda foi emitida; reimprima o cupom pelo próprio ERP." | PDF inválido. | Reimprima pelo ERP. |

> **Suporte:** a impressão direta é uma chamada do **navegador** ao serviço de impressão instalado na máquina do caixa, sem passar pelo servidor do Checkout. Ela exige as políticas do Chrome `LocalNetworkAccessAllowedForUrls` e `InsecureContentAllowedForUrls` com a origem do Checkout. Sem elas, a impressão falha mesmo com o serviço rodando. O tipo de impressão (direta ou PDF) e o endereço do serviço vêm do cadastro do caixa no ERP. Em reclamação de "nota duplicada", confira primeiro no ERP quantas notas foram gravadas para a venda e se houve falha de rede no envio. Veja o capítulo [15](#15-solução-de-problemas).

## Dúvidas frequentes

**Finalizei, mas a internet caiu. A nota saiu?**
Não dá para saber pela tela. Confira no ERP antes de reenviar.

**O cupom não saiu, mas a janela de venda finalizada apareceu. Perdi a venda?**
Não. A nota foi emitida. Use **Abrir o PDF em outra aba**.

**Suspendi uma venda por engano. Dá para recuperar?**
Sim: ela virou rascunho no ERP. Use **Menu Importação** > NFC-e (capítulo [11](#11-importar-dav-e-recuperar-nfc-e)).

**Posso cancelar uma nota já emitida?**
Não pelo Checkout. O cancelamento é feito no ERP.

**O botão Cancelar venda não apaga a venda?**
Com itens lançados, ele guarda a venda como rascunho no ERP. Só uma venda sem item (por exemplo, só com cliente escolhido) é descartada sem enviar nada.

## Veja também

- [06. Pagamento](#06-pagamento)
- [07. Pagamento PIX](#07-pagamento-pix)
- [08. Pagamento com cartão (TEF)](#08-pagamento-com-cartão-tef)
- [11. Importar DAV e recuperar NFC-e](#11-importar-dav-e-recuperar-nfc-e)
- [15. Solução de problemas](#15-solução-de-problemas)
- [18. Auditoria de ações](#18-auditoria-de-ações)

---

# 11. Importar DAV e recuperar NFC-e

> Como trazer para o caixa um documento que já existe no ERP: um DAV (pedido, orçamento ou ordem de serviço) ou uma NFC-e suspensa.

**Quem usa:** Operador de caixa | Supervisor/gestor

## Para que serve

- **DAV** (Documento Auxiliar de Venda) é o documento que a loja monta antes do caixa: **pedido**, **orçamento** ou **ordem de serviço (O.S)**. Importar o DAV traz os itens, o cliente, o vendedor e a condição de pagamento para o caixa, e você só cobra e finaliza.
- **NFC-e suspensa** é uma venda que foi guardada como rascunho: por exemplo, uma venda suspensa pelo botão **Cancelar venda** (ou **F10**) neste ou em outro caixa. Recuperar traz a venda de volta para você continuar de onde parou.

Os dois ficam no **Menu Importação**, na faixa de três botões embaixo da lista de itens (só no computador).

## Antes de começar

- **A importação só funciona em uma venda totalmente nova.** O caixa precisa estar sem itens (nem cancelados), sem cliente escolhido por você, sem condição de pagamento escolhida e sem documento já importado.
- Se a venda já foi começada, o botão **Menu Importação** aparece apagado com o motivo. Para importar, **cancele a venda** antes (botão **Cancelar venda**, que guarda a venda atual como rascunho).
- No celular e no tablet, a importação **não existe** (use um PDV com mouse).

## Passo a passo

### Escolher o tipo de importação

1. Clique em **Menu Importação** (ou pressione **F1** para ir direto ao DAV, **F2** para ir direto à NFC-e).
2. A janela **Menu Importação** ("Selecione o tipo de importação para continuar") mostra duas opções:
   - **Importar DAV** ("Carregue uma DAV para a venda atual");
   - **Importar NFCe** ("Carregue uma NFCe suspensa para a venda atual").
3. Clique na opção desejada. Para sair, **Fechar** ou **Esc**.

![Janela Menu Importação com as duas opções: "Importar DAV – Carregue uma DAV para a venda atual" e "Importar NFCe – Carregue uma NFCe suspensa para a venda atual".](imagens/11-01-menu-importacao.png)
*Figura 11.01 — Janela Menu Importação.*

### Importar um DAV

1. Na janela **Importação de DAV** ("Selecione um documento para importar para a venda"), a lista abre com os DAVs dos **últimos 7 dias**.
2. Para achar o documento, digite em "Busque por número, título, cliente ou senha" e/ou ajuste a **Data inicial** e a **Data final** de emissão. O período máximo é de **um ano**.
3. A lista mostra **DAV**, **Documento de Origem** (número, e o tipo **Pedido**, **Orçamento** ou **O.S**), **Senha**, **Cliente** (com o vendedor), **Emissão** e **Total**. Clique no título de uma coluna para ordenar. Use as setas de página embaixo.
4. Clique no documento para selecioná-lo.
5. Clique em **Importar DAV**, ou pressione **Enter**. (Com o documento já selecionado, **Enter** também importa.)
6. A janela fecha e a venda aparece no caixa: itens, cliente, vendedor e condição de pagamento do documento.

![Janela Importação de DAV com o campo de busca, as datas inicial e final, a tabela de DAVs com uma linha selecionada, a contagem "3 DAV(s) encontrada(s)", a paginação e o botão Importar DAV.](imagens/11-02-importacao-dav.png)
*Figura 11.02 — Janela Importação de DAV.*

### Recuperar uma NFC-e suspensa

1. Na janela **Importação de NFCe** ("Selecione um documento para importar para a venda"), a lista abre com as NFC-e suspensas dos **últimos 7 dias**.
2. Para achar a venda, digite em "Busque por nome do cliente ou do vendedor" e/ou ajuste as datas de emissão (máximo um ano).
3. A lista mostra **NFCe**, **Série**, **Cliente**, **Operador**, **Emissão**, **Total** e **Status** (**Suspensa**).
4. Clique na venda e depois em **Importar NFCe** (ou **Enter**).
5. A venda volta ao caixa, com itens, cliente, vendedor, condição e as formas de pagamento que já tinham sido lançadas.

![Janela Importação de NFCe com a tabela de NFC-e suspensas nas colunas NFCe, Série, Cliente, Operador, Emissão, Total e Status "Suspensa", uma linha selecionada e o botão Importar NFCe.](imagens/11-03-importacao-nfce.png)
*Figura 11.03 — Janela Importação de NFCe.*

### Depois de importar

1. Confira os itens, o cliente e o vendedor. O vendedor pode aparecer como **Vendedor #número** se o ERP não informou o nome.
2. Os **preços dos itens importados ficam congelados**: o Checkout usa o valor que veio no documento.
3. Se o documento **já veio com pagamento** (por exemplo, dinheiro já recebido), as formas aparecem em **Pagamentos aplicados** e os **itens ficam travados**. Veja "Regras e bloqueios".
4. Siga o fluxo normal: cobre o que falta (capítulo [06](#06-pagamento)) e finalize (capítulo [10](#10-finalizar-e-suspender-a-venda)). Ao finalizar ou suspender, o Checkout atualiza o **mesmo documento** do ERP.

## Regras e bloqueios

- **Só em venda nova.** O botão **Menu Importação** e as teclas **F1** e **F2** recusam com o motivo quando:
  - já há pagamento aprovado ou condição de pagamento escolhida: "Já há pagamento aprovado nesta venda: não é possível importar um documento.";
  - a venda já veio de um documento: "Esta venda já foi iniciada a partir de um documento. Cancele a venda para importar outro.";
  - há itens lançados, mesmo cancelados: "Esta venda já tem itens lançados, mesmo que cancelados. Cancele a venda para importar um documento.";
  - há cliente identificado: "Esta venda já tem um cliente identificado. Cancele a venda para importar um documento."
- **Importar não mistura documentos.** Um documento por venda.
- **Pagamento vindo do documento:**
  - Os itens ficam travados ("Esta venda foi retomada com o pagamento já registrado no documento, por isso os itens estão travados [...]").
  - Para editar, use **Limpar** no cartão **Pagamento**. Isso **descarta o registro** do valor já recebido, mas **não devolve dinheiro** ao cliente: se a venda for finalizada sem o pagamento, a NFC-e sai **sem o valor que o cliente já pagou**. O Checkout pede confirmação.
- **Cartão TEF de documento retomado:** o Checkout não oferece estorno dessa forma.
- **NFC-e rejeitada não é recuperável pelo Checkout.** Uma nota que a SEFAZ rejeitou não aparece na lista de suspensas; a correção e a retransmissão são feitas no ERP (capítulo [10](#10-finalizar-e-suspender-a-venda)).
- **O que aparece na lista** é o que o ERP devolve para a sua loja. Na lista de NFC-e, a coluna **Operador** mostra quem suspendeu a venda.

## Mensagens que você pode ver

| Mensagem na tela | O que significa | O que fazer |
|---|---|---|
| Frases de recusa do **Menu Importação** / **F1** / **F2** (acima) | A venda atual não está vazia. | Use **Cancelar venda** e tente de novo. |
| "A importação de DAV e NFCe não está disponível no layout compacto: use um PDV com mouse." | F1/F2 no celular ou tablet. | Use um PDV com mouse. |
| "Não foi possível carregar os documentos. Tente novamente." | Falha ao listar DAVs. | Repita a busca. |
| "Nenhum documento encontrado para os filtros informados." | Nada no período/busca. | Amplie as datas ou mude a busca. |
| "Não foi possível carregar as NFCes suspensas. Tente novamente." | Falha ao listar rascunhos. | Repita. |
| "Nenhuma NFCe suspensa encontrada para os filtros informados." | Nada no período/busca. | Amplie as datas. |
| "O período de busca é de no máximo um ano." | A data escolhida passa de um ano. | Ajuste as datas. |
| "O cliente deste documento não foi encontrado no ERP. Nada foi importado." | O cadastro do cliente do documento não existe mais. | Chame o suporte/cadastro. |
| "O ERP encontrou o cliente N mas devolveu o cadastro sem nome [...] Nada foi importado." | Cadastro incompleto. | Chame o suporte. |
| "A condição de pagamento N deste documento não está disponível nesta sessão. Nada foi importado." | A condição do documento não existe nesta loja/caixa. | Chame o suporte. |
| "O ERP recusou este documento: (motivo). Nada foi importado." | O ERP recusou carregar o documento. | Siga o motivo. |
| "O ERP devolveu este documento em formato inesperado. Nada foi importado." | Resposta inválida. | Chame o suporte. |
| "Não foi possível carregar este documento. Ele pode já ter sido faturado." | O documento não abre (já faturado ou removido). | Confira no ERP. |
| "Este rascunho veio sem série e o ponto de venda não tem série configurada. Verifique no ERP." | Falta a série do documento. | Chame o suporte. |
| "A sessão do operador foi encerrada. Reabra o Checkout pelo ERP." | Sessão acabou. | Reabra pelo ERP. |

> **Suporte:** importar um DAV faz o ERP gerar um rascunho de NFC-e a partir dele, e a venda passa a ter o número desse rascunho. Em contas do ERP em que o vendedor do rascunho vem como "0", o nome do vendedor pode aparecer como **Vendedor #número**, ou o vendedor pode vir em branco: a regra do Checkout é sempre exigir um vendedor antes de finalizar.

## Dúvidas frequentes

**Suspendi uma venda por engano. Como volto?**
Importe a NFC-e suspensa: **Menu Importação** > **Importar NFCe**.

**Não acho um DAV na lista.**
Ajuste o período (a lista começa nos últimos 7 dias) e a busca. Confira se o documento já foi faturado.

**Importei o documento errado.**
Use **Cancelar venda** (a venda fica guardada como rascunho no ERP) e importe o certo.

**Posso importar um DAV no meio de uma venda?**
Não. A venda precisa estar vazia. Isso evita misturar o carrinho com os preços congelados do documento.

## Veja também

- [06. Pagamento](#06-pagamento)
- [09. Venda rápida e atalhos](#09-venda-rápida-e-atalhos)
- [10. Finalizar e suspender a venda](#10-finalizar-e-suspender-a-venda)
- [15. Solução de problemas](#15-solução-de-problemas)

---

# 12. Menu gerencial

> Um atalho, na tela de venda do computador, para duas telas de retaguarda do ERP: movimentação não fiscal do caixa e resumo de caixa.

**Quem usa:** Supervisor/gestor | Operador de caixa

## Para que serve

O **Menu Gerencial** não é uma tela do Checkout. Ele só abre, em outra aba do navegador, telas que já existem no ERP:

- **Central de movimentação não fiscal:** "Sangria, suprimento e outras movimentações de caixa".
- **Relatório de resumo de caixa:** "Totais, formas de pagamento e fechamento do caixa".

Tudo o que você faz nessas telas é feito **no ERP**, com as permissões do ERP. O Checkout não guarda nem altera nada disso.

## Antes de começar

- O menu existe **só no computador** (layout de mouse). No celular e no tablet ele não aparece.
- Ele fica na faixa de três botões da base da coluna de venda: **Cancelar venda**, **Menu Gerencial** e **Menu Importação**.
- Não há tecla de atalho para o Menu Gerencial: só o clique.
- O navegador precisa permitir que o Checkout abra novas abas.

## Passo a passo

### Abrir uma tela gerencial

1. Clique em **Menu Gerencial**.
2. Na janela **Menu gerencial** ("Selecione uma opção para continuar"), escolha:
   - **Central de movimentação não fiscal**, para sangria, suprimento e outras movimentações;
   - **Relatório de resumo de caixa**, para totais, formas de pagamento e fechamento do caixa.
3. A tela do ERP abre em uma **nova aba** e a janela do menu fecha. A venda do Checkout continua como estava, na aba original.
4. Quando terminar, feche a aba do ERP e volte à aba do Checkout.

Para sair do menu sem escolher, clique em **Fechar** ou pressione **Esc**.

![Janela Menu gerencial com as duas opções: "Central de movimentação não fiscal – Sangria, suprimento e outras movimentações de caixa" e "Relatório de resumo de caixa – Totais, formas de pagamento e fechamento do caixa".](imagens/12-01-menu-gerencial.png)
*Figura 12.01 — Janela Menu gerencial.*

![Faixa de três botões na base da coluna de venda, com o botão "Menu Gerencial" destacado no meio, entre "Cancelar venda" e "Menu Importação".](imagens/12-02-botao-menu-gerencial.png)
*Figura 12.02 — Onde fica o botão Menu Gerencial.*

![Navegador com duas abas: a primeira com o Checkout e a segunda com a tela "Central de movimentação não fiscal" do ERP, aberta depois de escolher a opção no menu.](imagens/12-03-tela-do-erp-em-nova-aba.png)
*Figura 12.03 — A tela do ERP abre em uma nova aba; a venda continua na aba do Checkout.*

## Regras e bloqueios

- **O botão nunca fica bloqueado.** Abrir uma tela de retaguarda em outra aba não mexe na venda em andamento. Você pode abrir o menu com itens no carrinho.
- **Nova aba, sempre.** O Checkout não navega para fora da própria aba, porque isso apagaria a venda em andamento.
- **O destino é fixo.** O Checkout só abre essas duas telas, na instalação do ERP da sua loja.
- **A engrenagem da barra superior não abre o Menu Gerencial.** O botão da engrenagem ainda não tem função.

## Mensagens que você pode ver

| Mensagem na tela | O que significa | O que fazer |
|---|---|---|
| Resposta de "sessão ausente ou inválida" na nova aba | A sessão do Checkout expirou. | Reabra o Checkout pelo ERP (capítulo [01](#01-acesso-e-sessão)). |

> **Suporte:** o Checkout redireciona para o ERP no servidor, a partir da sessão do operador, e só aceita os dois destinos fixos. Uma resposta de erro nessa navegação indica sessão do Checkout ausente (acesso negado) ou destino desconhecido (não encontrado). O endereço do ERP é montado a partir da loja da sessão. Se a tela do ERP abrir com erro, o problema está no ERP.

## Dúvidas frequentes

**Posso fazer sangria direto no Checkout?**
Não. A sangria e o suprimento são feitos na **Central de movimentação não fiscal**, no ERP.

**Perdi a venda ao abrir o menu?**
Não. O ERP abre em outra aba. A venda do Checkout fica como estava.

**Por que o Menu Gerencial não aparece no meu tablet?**
Ele só existe no layout de computador. Use um PDV com mouse ou acesse o ERP direto.

## Veja também

- [02. Conhecendo a tela](#02-conhecendo-a-tela)
- [11. Importar DAV e recuperar NFC-e](#11-importar-dav-e-recuperar-nfc-e)
- [15. Solução de problemas](#15-solução-de-problemas)

---

# 13. Celular e tablet

> Como o Checkout funciona no celular e no tablet: venda em três etapas, leitura de código de barras pela câmera (Scanner) e teclado virtual.

**Quem usa:** Operador de caixa | Suporte

## Para que serve

Em equipamentos de toque, o Checkout troca a tela única do computador por um layout em **três etapas**, feito para uma mão só e para telas pequenas. A venda, as regras e os preços são **os mesmos** do computador: só muda a apresentação.

## Antes de começar

**Quando o Checkout usa este layout.** A escolha é automática. O layout de computador só aparece quando o equipamento tem **mouse ou touchpad** *e* a janela tem **pelo menos 1024 pixels de largura**. Em qualquer outra situação (celular, tablet só com toque, janela estreita), aparece o layout em etapas. Isso inclui um tablet grande e deitado, se ele só tem toque.

**O que não existe neste layout:**

- **Menu Importação** (importar DAV e recuperar NFC-e): para isso, use um PDV com mouse.
- **Menu Gerencial** (capítulo [12](#12-menu-gerencial)).
- **Botão do display do cliente** (capítulo [14](#14-display-do-cliente)).
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

Na etapa 1, use a barra de produto como no computador (capítulo [05](#05-produtos-e-carrinho)). Algumas diferenças:

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

- [02. Conhecendo a tela](#02-conhecendo-a-tela)
- [05. Produtos e carrinho](#05-produtos-e-carrinho)
- [06. Pagamento](#06-pagamento)
- [09. Venda rápida e atalhos](#09-venda-rápida-e-atalhos)
- [15. Solução de problemas](#15-solução-de-problemas)

---

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

1. Quando o operador gera a cobrança PIX (capítulo [07](#07-pagamento-pix)) e o QR Code fica pronto, o display muda sozinho para **Pague com PIX**, com o nome da loja, o QR Code, o **Valor a pagar** e **Aguardando pagamento**.
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

- [02. Conhecendo a tela](#02-conhecendo-a-tela)
- [07. Pagamento PIX](#07-pagamento-pix)
- [15. Solução de problemas](#15-solução-de-problemas)

---

# 15. Solução de problemas

> Consulta rápida para o suporte: sintoma, causa provável e o que fazer, por área, mais a infraestrutura local e o que coletar ao abrir um chamado.

**Quem usa:** Suporte | Supervisor/gestor

## Como usar este capítulo

1. Procure o **texto exato** que o operador viu (as mensagens estão entre aspas nos capítulos de cada área) ou o sintoma.
2. Leia a causa provável e siga o "o que fazer".
3. Se não resolver, reúna as informações da seção **O que coletar ao abrir um chamado** antes de escalar.

Três regras valem em qualquer caso, e evitam o pior dos problemas:

> **Atenção:** **nunca reenvie** uma finalização sem conferir no ERP. **Cada envio grava uma nota nova** no ERP. Uma NFC-e rejeitada já foi gravada.

> **Atenção:** **o Checkout não cancela PIX nem transação de cartão no TEF.** Desistir, remover ou suspender não devolve dinheiro. Confira no banco ou na maquininha.

> **Atenção:** **a venda não sobrevive a F5.** Recarregar a página apaga a venda em andamento.

## O que coletar ao abrir um chamado

Peça ao operador (ou colete) estas informações. Elas encurtam muito o atendimento:

1. **Loja, caixa e operador** (aparecem na barra superior: nome da loja, "Caixa NN • PDV NN" e o nome do operador).
2. **Dia e hora** em que o problema aconteceu, e se acontece sempre ou de vez em quando.
3. **O texto exato** da mensagem na tela (foto ou captura). Se houver janela de erro, o título dela (por exemplo, "NFCe rejeitada") e o bloco **Motivo apontado pelo ERP** ou **Motivo da rejeição**.
4. **O que o operador estava fazendo** (passo a passo curto) e se havia itens, cliente, vendedor e forma de pagamento.
5. **O equipamento:** computador (mouse e janela grande) ou celular/tablet; navegador e versão (o Chrome tem `chrome://version`); se havia segundo monitor.
6. **Em venda finalizada ou com erro de envio:** o **número e a série** da nota (aparecem na janela "Venda finalizada" como "NFCe N · série S") ou do rascunho ("Rascunho N · série S"), e **se o ERP tem a nota** (quantas notas existem para a venda).
7. **Em PIX:** o valor, o horário e se o dinheiro entrou no banco.
8. **Em cartão pelo TEF:** o valor, o horário e o que a maquininha mostrou.
9. **Em problema de impressão:** o tipo de impressão do caixa (direta ou PDF) e se o serviço de impressão da máquina está em execução.
10. **Do lado do servidor do Checkout** (quem faz a implantação): o log do servidor no horário do problema. As frases de log mais úteis estão na tabela de acesso abaixo. O endereço `/health` do Checkout responde "ok" quando o servidor está de pé.

![Janela "Venda finalizada" com a identificação da nota "NFCe 1234 · série 1" em destaque, que o operador deve fotografar ou anotar ao abrir um chamado.](imagens/15-01-identificacao-da-nota.png)
*Figura 15.01 — O número e a série da nota aparecem na janela "Venda finalizada": peça ao operador para registrá-los.*

## Acesso e sessão

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| Tela "Não foi possível carregar o checkout com os dados fornecidos" **sem botão**, e a instrução "Acesse o Checkout novamente pelo CentriumWEB." | O acesso não foi aceito: endereço digitado à mão, vencido ou incompleto; **chave de cifra do ambiente diferente da usada pelo ERP**; dados obrigatórios vazios no acesso (por exemplo, código da empresa); usuário não reconhecido pelo ERP; ou a sessão já terminou. | Abra pelo ERP de novo. Se for recorrente em todos os operadores, confira com a implantação a chave e o vetor de cifra de entrada (iguais aos do ERP) e o log: "redirect sem entrada cifrada válida" (chave diferente ou endereço em claro), "entrada decifrada sem os campos obrigatórios" (campos vazios), "falha ao iniciar sessão" (login recusado ou ERP fora) ou "operador não identificado pelo ERP". |
| Mesma tela, **com** o botão "Tentar novamente" | O acesso foi aceito, mas o carregamento da configuração falhou (ERP lento ou fora, resposta inválida, rede). | **Tentar novamente**. Se persistir, confira o ERP e a rede. Log comum: resposta do ERP que não é JSON válido ou configuração fora do contrato. |
| "A sessão do operador foi encerrada. Reabra o Checkout pelo ERP [...]" no meio de uma operação | A sessão expirou ou o login foi invalidado (por exemplo, troca de senha). | Reabra pelo ERP. Se a operação era finalizar, **confira no ERP** se algo foi gravado. |
| Operador entra, mas vê o nome de outro usuário na barra | Sessão de outro usuário no mesmo navegador. | Feche, saia do ERP, entre com o usuário certo e reabra o Checkout. |
| Configuração da loja mudou no ERP e o caixa não refletiu | O Checkout confere a mudança a cada 1 minuto, **só com a venda vazia**. | Espere ou reabra pelo ERP. |

## Tela de venda, atalhos e produtos

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| F6 a F9 não fazem nada | Sem cenário cadastrado na tecla; cursor em campo de digitação (menos o de código); janela aberta; venda sem item ou já em pagamento. | Veja o capítulo [09](#09-venda-rápida-e-atalhos). |
| F6 abriu a barra de endereço do Chrome | Não há cenário cadastrado para a tecla. | Cadastre o cenário no ERP ou oriente a não usar a tecla. |
| Pagamento por atalho com forma "errada" (por exemplo, "Cheque") | O cadastro do cenário/forma no ERP. | Corrija o cenário no ERP. |
| "Escolha o vendedor da venda antes de inserir produtos" em toda venda | Loja sem vendedor padrão configurado. | Oriente a escolher o vendedor, ou configure um padrão no ERP. |
| Pílula do vendedor mostra o nome do operador | O ERP usa o nome do usuário quando não há vendedor padrão (pendência do ERP). | O código enviado na nota é o correto; só o nome na tela engana. |
| "Produto N não encontrado" para produto que existe | Código lido no tipo errado, produto de outra empresa, ou resposta vazia do ERP. | Confira o tipo de código do usuário no ERP (campo mostra "Código reduzido", "Código de barras" ou "Referência") e a empresa. |
| Produto sem preço ("está sem preço de venda no ERP") | Cadastro sem preço. | Corrija no ERP. |
| Janela "Produto não inserido" / "Cenário tributário não encontrado" | Falta cenário tributário para o produto e o cliente no ERP. | Corrija o cadastro fiscal. Cada tentativa de **suspender** nesse caso pode criar um rascunho vazio no ERP (limpe no ERP). |
| "Estoque insuficiente para [...]" | Política de saldo do ERP (avisa ou bloqueia). | Ajuste a quantidade ou o saldo. |
| Preço diferente do esperado | Lista de preço do cliente, faixa de quantidade ou convênio. | Confira o cliente da venda, a quantidade total do produto e o cadastro. |
| Cliente com CNPJ recusado | Regra fiscal: NFC-e não pode ser emitida para pessoa jurídica. | NF-e pelo ERP. |
| Não consegue trocar cliente ou vendedor | Venda com item (cliente) ou em pagamento. | Cancele os itens ou use **Limpar**. |
| "Tentar de novo" na câmera, ou botão Scanner ausente | Veja o capítulo [13](#13-celular-e-tablet). | Android com Chrome, HTTPS, câmera liberada. |

## Pagamento, PIX e TEF

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| Condição de pagamento bloqueada | Sem produto; ou já há forma aplicada; ou catálogo não carregou. | Veja os motivos em [06](#06-pagamento). |
| "Finalizar venda" apagado e o ERP "ainda não aprovou" | A conferência prévia do ERP não aprovou ou nunca rodou. | Revise cliente, condição e formas; adicione o pagamento de novo. |
| Janela "Pagamento não aceito" | O ERP recusou a venda ao adicionar a forma; o motivo vem do ERP. | Leia o **Motivo apontado pelo ERP** e corrija. |
| PIX indisponível (forma apagada) | PIX não está ativo na configuração da loja. | Ative no ERP. |
| "O ERP não gerou o QR Code desta cobrança [...]" ou "Não foi possível gerar a cobrança PIX" | Configuração do PIX incompleta no ERP, ou falha na geração. No ambiente de testes, a geração com o cliente padrão chegou a falhar. | Confira a configuração do PIX da empresa e teste com um cliente identificado; escale ao ERP com horário e valor. |
| PIX "preso" aguardando | O banco ainda não confirmou, ou a consulta não atualiza. | Confira no banco. Não gere outra cobrança sem conferir. A janela só sai com **Desistir da operação**. |
| Cliente pagou o PIX depois de desistir | O Checkout não cancela a cobrança. | Estorno no banco e desassociação na Central de Transações PIX do ERP. |
| WhatsApp do PIX desabilitado | Loja sem o envio habilitado. | Habilite com o comercial. |
| TEF: "Este operador não tem usuário do TEF vinculado no ERP [...]" | O usuário não tem o identificador do TEF, ou a sessão foi aberta antes do vínculo. | Vincule a maquininha ao usuário no ERP e peça para reabrir o Checkout pelo ERP. |
| TEF: "Falha ao criar a cobrança" | Maquininha não localizada para o usuário, TEF fora, rede. | Confira a maquininha e o vínculo. Em homologação sem maquininha, nada é cobrado. |
| TEF: janela esperando sem fim | Maquininha desligada, sem rede ou operação não concluída. | Confira na maquininha. Use **Desistir da operação** e **confira o terminal**: a transação pode ser aprovada depois. |
| Cartão aprovado e a venda não pode ser suspensa ou limpa | Regra: só estorno remove cartão aprovado. | Estorne pelo botão de remover. |
| Cartão avulso (POS) lançado sem janela | A forma não está marcada para TEF. | Normal: o operador confere na maquininha. Se era para ser TEF, ajuste o cadastro da forma. |

## Finalização, NFC-e e impressão

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| "Sem resposta do servidor [...] Confirme no ERP antes de reenviar" | A rede caiu no envio. A nota pode ou não ter sido gravada. | **Confira no ERP** antes de reenviar. Reenviar uma venda já processada gera uma segunda nota. |
| "NFCe rejeitada" | A SEFAZ não autorizou. A nota foi gravada no ERP. | Corrija e retransmita **no ERP**. O Checkout não reenvia. O número e a série da nota podem vir zerados na rejeição (pendência do ERP). |
| "O ERP respondeu sem a nota fiscal pronta para impressão. A venda não foi emitida." | O ERP respondeu sem a nota. Em testes, uma emissão respondeu assim e o rascunho saiu da lista de suspensas. | **Confira no ERP** se a nota existe antes de qualquer reenvio. |
| "Venda não aceita pelo ERP" | Recusa de negócio do ERP, com o motivo. | Corrija conforme o motivo. A venda continua aberta. |
| Nota duplicada | Reenvio após falha de rede, ou finalização repetida. | Confira quantas notas foram gravadas; cancele a duplicada **no ERP**. |
| Cupom não imprime, janela "Não foi possível imprimir" | Serviço de impressão local parado ou bloqueado pelo Chrome. | Veja "Infraestrutura local" abaixo. Use **Abrir o PDF em outra aba** enquanto isso. |
| "O navegador bloqueou a aba do PDF" | Bloqueador de pop-up. | Libere pop-ups para o Checkout. |
| Venda suspensa sumiu | Rascunho no ERP. | Menu Importação > NFC-e (capítulo [11](#11-importar-dav-e-recuperar-nfc-e)). Rascunho de NFC-e rejeitada não aparece lá. |
| Vendedor "#0" ou em branco ao retomar documento | O ERP devolve o vendedor zerado em alguns rascunhos. | O operador escolhe o vendedor antes de finalizar. |
| Importação recusada ("Esta venda já tem itens [...]") | A venda não está vazia. | **Cancelar venda** e importar de novo. |
| Itens travados em venda retomada | O documento veio com pagamento já registrado. | **Limpar** descarta o registro (não devolve dinheiro). Confirme com o gestor antes. |

## Infraestrutura local

O Checkout roda em um servidor próprio, mas a **impressão** e o **TEF** dependem de coisas instaladas na **máquina do caixa**, fora do servidor.

### Impressão direta

- O **navegador** do caixa chama o serviço de impressão instalado na própria máquina, por HTTP, no endereço do cadastro do caixa no ERP. Se o caixa não tem endereço cadastrado, o Checkout usa o padrão `127.0.0.1:4545` e avisa.
- O tipo de impressão (direta ou PDF) vem do cadastro do caixa no ERP.
- Sintomas: "Não foi possível imprimir diretamente: o serviço de impressão da máquina não respondeu." (serviço parado ou endereço errado); "O navegador bloqueou a comunicação com o serviço de impressão local [...]" (política do Chrome).
- **Confira, nesta ordem:** (1) o serviço de impressão está em execução na máquina do caixa; (2) o endereço cadastrado está certo; (3) as políticas do Chrome abaixo estão aplicadas; (4) a impressora está ligada e é a padrão do serviço.

### Políticas do Chrome (TI da loja)

O Checkout é servido por HTTPS, e o serviço de impressão local responde por HTTP. A partir do Chrome 142, o navegador bloqueia por padrão o acesso a endereços de rede local e o conteúdo misto. A TI de cada cliente deve aplicar (por política de grupo no Windows ou pelo gerenciamento de navegador na nuvem), com a **origem do Checkout** da loja:

- **`LocalNetworkAccessAllowedForUrls`:** libera o acesso à rede local.
- **`InsecureContentAllowedForUrls`:** libera o conteúdo misto (HTTP a partir de página HTTPS).

Para conferir, abra `chrome://policy` na máquina do caixa e procure as duas políticas. Depois de aplicar, **reinicie o Chrome**. O Checkout sempre tenta a chamada e só depois classifica a falha: por isso, o bloqueio aparece como a mensagem de "configuração de navegador/política de TI", não como erro genérico de conexão.

![Página chrome://policy do Chrome na máquina do caixa, com as políticas LocalNetworkAccessAllowedForUrls e InsecureContentAllowedForUrls listadas, com status "OK" e a origem do Checkout da loja como valor.](imagens/15-02-chrome-policy.png)
*Figura 15.02 — As duas políticas do Chrome aplicadas na máquina do caixa.*

> **Suporte:** essa configuração é responsabilidade da TI do cliente e é item do checklist de implantação. O Checkout não consegue contorná-la.

### TEF (maquininha)

- O TEF é cobrado pelo **ERP**, que fala com a maquininha. O Checkout apenas pede a cobrança, acompanha o status e pede o estorno.
- Requisitos: TEF ativo na empresa; forma marcada para TEF; **usuário vinculado a uma maquininha** no ERP; maquininha ligada e conectada.
- O identificador do usuário no TEF é obtido na abertura da sessão: depois de mudar o vínculo no ERP, o operador precisa **reabrir o Checkout pelo ERP**.
- A validação com terminal real ainda não foi feita (veja abaixo). Faça cobrança e estorno de teste.

### Câmera (Scanner)

Exige Chrome para Android, endereço HTTPS e permissão de câmera. Veja o capítulo [13](#13-celular-e-tablet).

### Rede

O Checkout depende de internet até o ERP. Sem rede: o acesso falha, e envios e conferências retornam "Sem comunicação com o ERP [...]". Oscilações curtas na entrada são repetidas pelo servidor duas vezes antes de recusar.

## Pontos conhecidos que dependem do ERP ou de homologação

Itens que podem aparecer em campo e que **não são defeito do Checkout**:

- **TEF sem terminal real:** a cobrança e o estorno foram medidos contra uma maquininha simulada. Bandeira, NSU e autorização reais ainda precisam ser conferidos com um terminal da loja. Rejeição de pagamento e de estorno também não foram medidas ao vivo.
- **PIX:** a geração de cobrança em ambiente de testes não foi concluída de ponta a ponta (o ERP de testes recusou ou respondeu sem cobrança). Valide em cada loja nova.
- **Motivo de NFC-e rejeitada:** o texto vem do ERP, às vezes longo, com sugestão de correção; número e série da nota podem vir zerados.
- **Vendedor:** rascunhos retomados podem trazer o vendedor zerado.
- **Recusa por cenário tributário:** o ERP pode gravar um rascunho vazio a cada tentativa.
- **Finalização sem nota na resposta:** em testes, o ERP respondeu sem a nota e o rascunho saiu da lista de suspensas; o Checkout trata como falha e mantém a venda no caixa.
- **Cartão TEF de documento retomado:** o Checkout não oferece estorno.
- **Cenário tributário de produto:** em ambiente de testes, nenhum produto foi aprovado pela checagem de cenário.

## Veja também

- [01. Acesso e sessão](#01-acesso-e-sessão)
- [06. Pagamento](#06-pagamento)
- [07. Pagamento PIX](#07-pagamento-pix)
- [08. Pagamento com cartão (TEF)](#08-pagamento-com-cartão-tef)
- [10. Finalizar e suspender a venda](#10-finalizar-e-suspender-a-venda)
- [13. Celular e tablet](#13-celular-e-tablet)
- [18. Auditoria de ações](#18-auditoria-de-ações)

---

# 16. Glossário

> Os termos, siglas e nomes usados no Checkout e nesta wiki, em ordem alfabética.

**Quem usa:** Operador de caixa | Supervisor/gestor | Suporte

## Como ler

Cada termo tem uma explicação curta e, quando existe, o capítulo onde ele é tratado. Nomes de botões e campos da tela aparecem em **negrito**.

## A

**Adicionar ao carrinho**
Botão da barra de produto que lança o item na venda. Na edição de um item, vira **Confirmar edição**. Capítulo [05](#05-produtos-e-carrinho).

**Auditoria**
Registro, com data e hora, das ações do operador durante a venda. Vai ao ERP junto com a NFC-e. Capítulo [18](#18-auditoria-de-ações).

## B

**Balança (código de balança)**
Etiqueta de 13 dígitos começando em 2, impressa por balanças. O Checkout lê o valor da etiqueta e calcula a quantidade. Capítulo [05](#05-produtos-e-carrinho).

**Bipar**
Passar o leitor de código de barras no produto. O leitor digita o código no campo e termina com Enter.

## C

**Caixa**
O posto de venda e o próprio operador, conforme o contexto. Na barra superior, "Caixa 01" identifica o número do caixa.

**Cenário de pagamento**
Combinação nomeada de **condição** e **forma** de pagamento, cadastrada no ERP e ligada a uma tecla (F6 a F9). Capítulo [09](#09-venda-rápida-e-atalhos).

**Cenário tributário**
Regra fiscal do ERP que define os impostos de um produto para um cliente. Sem ele, o produto não entra na venda e a nota não é emitida. Capítulos [05](#05-produtos-e-carrinho) e [10](#10-finalizar-e-suspender-a-venda).

**CentriumWEB**
O ERP da Centrium, de onde o operador abre o Checkout. Capítulo [01](#01-acesso-e-sessão).

**Cliente padrão**
O cliente "consumidor" configurado pela loja no ERP. Entra automaticamente em toda venda nova. Capítulo [03](#03-identificar-cliente).

**CNPJ**
Cadastro de pessoa jurídica. O Checkout não emite NFC-e para CNPJ. Capítulo [03](#03-identificar-cliente).

**Condição de pagamento**
Regra que define como a venda será paga (por exemplo, "à vista" ou "2 vezes") e quais formas estão disponíveis. Uma por venda. Capítulo [06](#06-pagamento).

**Convênio**
Acordo comercial que dá desconto automático a certos clientes. Aparece na coluna **Desconto** do item. Capítulo [05](#05-produtos-e-carrinho).

**Copia e cola (PIX)**
Texto que o cliente pode colar no aplicativo do banco no lugar de escanear o QR Code. Capítulo [07](#07-pagamento-pix).

**CPF**
Cadastro de pessoa física, de 11 dígitos. Identifica o cliente. Capítulo [03](#03-identificar-cliente).

## D

**DAV (Documento Auxiliar de Venda)**
Documento montado antes do caixa: **pedido**, **orçamento** ou **ordem de serviço (O.S)**. Pode ser importado para a venda. Capítulo [11](#11-importar-dav-e-recuperar-nfc-e).

**Desconto da venda (desconto de capa)**
Desconto aplicado ao total da venda, no bloco **Desconto** do pagamento, em reais ou em porcentagem. É dividido entre os itens. Capítulo [06](#06-pagamento).

**Desconto do item**
Desconto digitado em um item, só em produtos de preço editável. Capítulo [05](#05-produtos-e-carrinho).

**Display do cliente**
Segunda tela, voltada para o cliente, que mostra o nome da loja e o QR Code do PIX. Capítulo [14](#14-display-do-cliente).

## E

**EAN**
Padrão de código de barras de produtos (EAN-13 e EAN-8). Capítulo [05](#05-produtos-e-carrinho).

**Entrada rápida (barra de produto)**
A barra com o campo de código, a quantidade, o preço, o desconto e o botão **Adicionar ao carrinho**. Capítulo [05](#05-produtos-e-carrinho).

**ERP**
Sistema de gestão da Centrium. É a fonte de todos os dados do Checkout (produtos, clientes, pagamentos e notas).

**Estorno (TEF)**
Devolução de uma cobrança de cartão aprovada no TEF. Capítulo [08](#08-pagamento-com-cartão-tef).

## F

**Faltante**
O quanto ainda falta pagar na venda. Quando chega a zero, o painel mostra **Troco**. Capítulo [06](#06-pagamento).

**Faixa de quantidade (preço por faixa)**
Preço que muda conforme a quantidade vendida do mesmo produto. Capítulo [05](#05-produtos-e-carrinho).

**Finalizar venda**
Envia a venda ao ERP para emitir a NFC-e. Capítulo [10](#10-finalizar-e-suspender-a-venda).

**Forma de pagamento**
O meio usado para pagar: dinheiro, cartão, PIX, vale e outros. Capítulo [06](#06-pagamento).

## L

**Lista de preço**
Tabela de preços associada ao cliente. O ERP escolhe o preço do produto conforme a lista do cliente. Capítulo [05](#05-produtos-e-carrinho).

**Log (da NFC-e)**
Campo do ERP que recebe o registro de auditoria da venda. Capítulo [18](#18-auditoria-de-ações).

## M

**Maquininha avulsa (POS)**
Maquininha de cartão usada fora do Checkout. O operador cobra nela e apenas registra a forma. Capítulo [08](#08-pagamento-com-cartão-tef).

**Menu Gerencial**
Atalho para telas de retaguarda do ERP. Capítulo [12](#12-menu-gerencial).

**Menu Importação**
Atalho para importar um DAV ou recuperar uma NFC-e suspensa. Capítulo [11](#11-importar-dav-e-recuperar-nfc-e).

## N

**NFC-e (Nota Fiscal de Consumidor Eletrônica)**
Nota fiscal da venda ao consumidor final. É emitida pelo ERP e autorizada pela SEFAZ. Capítulo [10](#10-finalizar-e-suspender-a-venda).

**NF-e**
Nota fiscal eletrônica comum. É a que o ERP emite para vendas a pessoa jurídica.

## O

**Operador**
A pessoa que usa o caixa. O nome aparece na barra superior e vai na nota.

## P

**Pesável**
Produto vendido por peso. Em geral, só a quantidade pode ser ajustada. Capítulo [05](#05-produtos-e-carrinho).

**PDV (Ponto de Venda)**
O caixa, com computador, leitor, impressora e maquininha.

**PIX**
Pagamento instantâneo por QR Code ou código copia e cola. Capítulo [07](#07-pagamento-pix).

**Posse da tecla**
Quando o Checkout "toma" uma tecla para si, de modo que ela nunca vá para o navegador. Vale para F1, F2, F3, F4 e F10. Capítulo [09](#09-venda-rápida-e-atalhos).

## Q

**QR Code**
Imagem que o cliente escaneia com o aplicativo do banco para pagar o PIX. Capítulo [07](#07-pagamento-pix).

## R

**Rascunho**
Venda guardada no ERP sem ter sido finalizada. Nasce ao **suspender** a venda e pode ser recuperada. Capítulo [11](#11-importar-dav-e-recuperar-nfc-e).

**Recuperar NFC-e**
Trazer de volta ao caixa uma venda suspensa. Capítulo [11](#11-importar-dav-e-recuperar-nfc-e).

## S

**Saldo (de estoque)**
Quantidade disponível de um produto. Capítulo [05](#05-produtos-e-carrinho).

**Scanner**
Botão que lê o código de barras pela câmera, no Chrome para Android. Capítulo [13](#13-celular-e-tablet).

**SEFAZ**
Secretaria da Fazenda, que autoriza as notas fiscais. A espera "Autorizando NFCe" é a conversa do ERP com ela. Capítulo [10](#10-finalizar-e-suspender-a-venda).

**Série (da nota)**
Número que, junto com o número da nota, identifica o documento. Capítulo [10](#10-finalizar-e-suspender-a-venda).

**Sessão**
O acesso do operador ao Checkout, aberto pelo ERP. Capítulo [01](#01-acesso-e-sessão).

**SmartTEF**
Serviço de TEF usado pelo ERP para falar com a maquininha. Capítulo [08](#08-pagamento-com-cartão-tef).

**Suspender (venda)**
Guardar a venda como rascunho no ERP, sem emitir a nota. É o que **Cancelar venda** e **F10** fazem. Capítulo [10](#10-finalizar-e-suspender-a-venda).

## T

**TEF (Transferência Eletrônica de Fundos)**
Cobrança de cartão integrada: o Checkout manda o valor para a maquininha e acompanha a aprovação. Capítulo [08](#08-pagamento-com-cartão-tef).

**Troco**
Diferença a devolver quando o dinheiro recebido é maior que o valor aplicado. Só o dinheiro gera troco. Capítulo [06](#06-pagamento).

## U

**UN / UDM**
Unidade de medida do produto (unidade, quilo, caixa e outras). Capítulo [05](#05-produtos-e-carrinho).

## V

**Vale devolução**
Crédito emitido por uma devolução, usado como forma de pagamento com o código do vale. Capítulo [06](#06-pagamento).

**Validação prévia (da NFC-e)**
Conferência que o ERP faz, a cada forma de pagamento adicionada, para saber se a venda poderia virar uma NFC-e. Capítulo [06](#06-pagamento).

**Vendedor**
Quem atendeu o cliente. É obrigatório e vai na nota. Não é o operador do caixa. Capítulo [04](#04-selecionar-vendedor).

**Venda rápida**
Teclas F6 a F9 que lançam um cenário de pagamento. Capítulo [09](#09-venda-rápida-e-atalhos).

## Veja também

- [README: mapa da wiki](#wiki-operacional-do-centrium-checkout)
- [15. Solução de problemas](#15-solução-de-problemas)

---

# 17. Guia de imagens

> A lista de todas as figuras previstas na wiki: o arquivo, o capítulo e o que capturar em cada uma.

**Quem usa:** Quem for capturar as imagens (equipe de documentação ou suporte)

## Como usar

1. Capture cada tela no estado descrito na coluna **O que capturar**.
2. Salve em `docs/wiki/imagens/` com **exatamente** o nome da coluna **Arquivo** (formato PNG).
3. Os capítulos já apontam para esses nomes: ao colocar o arquivo, a figura passa a aparecer.

## Antes de capturar

- **Use um ambiente de testes e dados fictícios.** Nunca capture dados reais de clientes, vendedores, operadores, lojas, CPF, telefones, e-mails, endereços de ERP ou chaves. Os exemplos dos capítulos usam nomes como "Maria Exemplo" e "Loja Exemplo".
- **Computador:** janela do Chrome com 1366 × 768 ou maior, sem barras de favoritos e sem outras abas à mostra, exceto onde a figura pedir.
- **Celular:** capture em um aparelho Android real ou no modo de dispositivo do Chrome, em 360 × 640 ou 390 × 844, na vertical.
- **Corte** a imagem na região que interessa, sem barra de endereço, salvo onde ela é o assunto.
- **Aviso no canto da tela:** capture logo depois do gesto, porque o aviso some sozinho.
- Quando a figura mostra um **valor ou número de documento** (R$ 100,00, "NFCe 1234 · série 1"), pode-se usar os valores de exemplo do texto.
- Onde o texto diz "(marcar com números)", acrescente as marcações depois da captura, em um editor de imagens.

## Lista de figuras

### Capítulo 01. Acesso e sessão

| Arquivo | O que capturar |
|---|---|
| `01-01-tela-carregando.png` | Tela de carregamento no computador: o desenho da tela de venda em cinza, com o brilho de carregamento, antes de aparecer qualquer dado. |
| `01-02-tela-aberta.png` | Tela de venda recém-aberta, vazia, com a barra superior mostrando o nome da loja, o caixa e o nome do operador. |
| `01-03-acesso-invalido.png` | Tela de acesso inválido: painel central com o carrinho em círculo azul, o título "Não foi possível carregar o checkout com os dados fornecidos" e o texto "Acesse o Checkout novamente pelo CentriumWEB.", sem botões. (Abra o endereço do Checkout direto, sem passar pelo ERP.) |
| `01-04-tentar-novamente.png` | Tela de falha de carregamento com o botão azul "Tentar novamente". |

### Capítulo 02. Conhecendo a tela

| Arquivo | O que capturar |
|---|---|
| `02-01-tela-completa.png` | Tela de venda completa, com uma venda em andamento. Marcar com os números 1 (barra superior), 2 (coluna de venda) e 3 (painel de pagamento). |
| `02-02-barra-superior.png` | Barra superior ampliada: símbolo do carrinho, "Centrium Checkout - Loja Exemplo", "Caixa 01 • PDV 02", nome do operador, botão do monitor e botão da engrenagem apagado. |
| `02-03-coluna-de-venda.png` | Coluna de venda com três itens: cartão do cliente aberto, barra de produto, tabela com rodapé de subtotal e a faixa **Cancelar venda**, **Menu Gerencial**, **Menu Importação**. |
| `02-04-painel-pagamento.png` | Painel de pagamento com uma venda em andamento: faixa de venda rápida no topo, **Pagamento**, lista de pagamentos, **Total a pagar**, **Recebido**, **Faltante** e **Finalizar venda**. |
| `02-05-aviso-recusa.png` | Aviso de erro no canto superior direito com "Não há itens nesta venda: bipe ao menos um produto antes de usar o atalho de pagamento." (clique em um botão de venda rápida com a venda vazia). |

### Capítulo 03. Identificar cliente

| Arquivo | O que capturar |
|---|---|
| `03-01-cartao-cliente-aberto.png` | Cartão **Cliente da venda** aberto, sem item: pílulas **Cliente** e **Vendedor**, campos **Código do cliente ou CPF**, **Nome / telefone**, lupa, **Identificar**, **Contato** e o campo do vendedor. |
| `03-02-cliente-identificado.png` | Cartão depois de identificar o cliente "Maria Exemplo": campos preenchidos, **Contato** com telefone fictício. |
| `03-03-busca-cliente.png` | Janela **Consultar cliente** com a busca preenchida e cinco clientes fictícios (Código, Cliente, CPF/CNPJ, Telefone, Cidade), rodapé "Página 1 de 3" com **Anterior** e **Próxima**. |
| `03-04-cadastro-simplificado.png` | Formulário **Cadastrar cliente** com "Dados do cliente" e "Endereço" preenchidos com dados fictícios e **Salvar cliente** ativo. |

### Capítulo 04. Selecionar vendedor

| Arquivo | O que capturar |
|---|---|
| `04-01-campo-vendedor-vazio.png` | Cartão aberto com o campo **Vendedor NFCe** mostrando "Selecionar vendedor" e a lupa; pílula Vendedor ausente. (Use uma loja sem vendedor padrão.) |
| `04-02-busca-vendedor.png` | Janela **Consultar vendedor** com a busca preenchida e quatro vendedores fictícios (Código, Vendedor, CPF), com paginação. |
| `04-03-vendedor-escolhido.png` | Cartão com o vendedor "Carlos Exemplo" escolhido: pílula **Vendedor** e campo **Vendedor NFCe** preenchidos. |

### Capítulo 05. Produtos e carrinho

| Arquivo | O que capturar |
|---|---|
| `05-01-entrada-de-produto.png` | Barra de produto vazia: placeholder "Bipe ou digite (use * p/ quantidade)", lupa, **Quantidade** 1,000, **Unidade**, **Preço unitário**, **Desconto do item**, **Total item** e **Adicionar ao carrinho**. |
| `05-02-busca-produto.png` | Janela **Consultar produto** com busca preenchida, filtro de saldo, lista de produtos fictícios (Código, Produto, Saldo, Unidade) e paginação. |
| `05-03-item-cancelado.png` | Lista de itens com a segunda linha cancelada (riscada, sem botões) e o subtotal somando só as outras. |

### Capítulo 06. Pagamento

| Arquivo | O que capturar |
|---|---|
| `06-01-painel-pagamento.png` | Painel com venda de R$ 100,00: condição escolhida, campo **Desconto**, forma **Dinheiro**, **Valor recebido** com "Enter adiciona", **Pagamentos aplicados** e totais. |
| `06-02-troco.png` | Duas formas aplicadas (Cartão de crédito R$ 60,00 e Dinheiro com R$ 50,00 recebidos) e os totais: **Total a pagar** R$ 100,00, **Recebido** R$ 110,00, **Troco** R$ 10,00. |
| `06-03-vale-devolucao.png` | Janela **Vale devolução** com o **Código do vale** preenchido (código fictício) e **Aplicar vale**. |
| `06-04-pagamento-nao-aceito.png` | Janela "Pagamento não aceito" ("A forma não foi aplicada"), com "Motivo apontado pelo ERP" e **Entendi**. (Use um cenário de teste em que o ERP recuse.) |

### Capítulo 07. Pagamento PIX

| Arquivo | O que capturar |
|---|---|
| `07-01-pix-aguardando.png` | Janela **Pagamento via PIX** aguardando: QR Code, texto "Abra o app do seu banco...", código copia e cola com **Copiar código PIX** e **Enviar por WhatsApp**, **Valor a cobrar**, selo **Aguardando confirmação**, **Desistir da operação**. (QR Code de teste.) |
| `07-02-pix-aprovado.png` | Mesma janela aprovada: **Pagamento aprovado**, "Transação concluída com sucesso", valor pago e **Fechar**. |
| `07-03-pix-whatsapp.png` | Janela do PIX com o formulário do WhatsApp aberto: **Nome do cliente**, **Número de destino (com DDD)** fictícios e **Enviar cobrança**. |
| `07-04-pix-desistir.png` | Confirmação "Desistir da cobrança PIX?" com "O PIX não é cancelado por aqui", **Continuar aguardando** e **Desistir mesmo assim**. |

### Capítulo 08. Pagamento com cartão (TEF)

| Arquivo | O que capturar |
|---|---|
| `08-01-tef-aguardando.png` | Janela **Pagamento no TEF** aguardando: "Operação em andamento", selo **Processando**, "Aguardando retorno do TEF", aviso de não fechar, **Valor a cobrar** R$ 80,00 e **Desistir da operação**. |
| `08-02-tef-aprovado.png` | Janela **Pagamento aprovado** do TEF com selo **Aprovado**, **Valor pago** e **Fechar**. |
| `08-03-tef-tentativa-recusada.png` | Janela do TEF com "O cartão não foi aprovado" e a linha "Motivo informado:". |
| `08-04-tef-estorno.png` | Janela **Estorno no TEF** em andamento: "Aguardando a confirmação do estorno", **Valor a estornar** e **Desistir de esperar**. |

> **Atenção:** as figuras do TEF e do PIX dependem de um ambiente com maquininha e PIX configurados. Se não houver, capture em um ambiente de testes que simule as respostas, ou deixe para quando a loja de homologação estiver pronta.

### Capítulo 09. Venda rápida e atalhos

| Arquivo | O que capturar |
|---|---|
| `09-01-faixa-venda-rapida.png` | Faixa **Métodos de pagamento rápidos** no topo do painel, com quatro botões: "PIX (F6)", "Dinheiro (F7)", "Débito (F8)" e "Crédito (F9)", todos em cinza. |
| `09-02-faixa-bloqueada.png` | Faixa com a venda vazia (botões apagados) e o aviso de erro "Não há itens nesta venda..." depois do clique. |
| `09-03-aviso-pagamento-iniciado.png` | Aviso depois de pressionar uma tecla de venda rápida com pagamento já lançado: "Esta venda já tem pagamento iniciado...". |

### Capítulo 10. Finalizar e suspender a venda

| Arquivo | O que capturar |
|---|---|
| `10-01-autorizando-nfce.png` | Janela "Autorizando NFCe": "Finalizando venda", "Aguardando o retorno do ERP", indicador de carregamento e o texto da SEFAZ. |
| `10-02-venda-finalizada.png` | Janela **Venda finalizada** ("NFCe autorizada com sucesso"), com "NFCe 1234 · série 1", "Enviado para a impressora" e **Abrir o PDF em outra aba**. |
| `10-03-falha-impressao.png` | Janela de venda finalizada com "Não foi possível imprimir", o texto "A venda foi emitida normalmente..." e o aviso de erro. |
| `10-04-sem-resposta.png` | Janela "Sem resposta do servidor" com "Confirme no ERP antes de reenviar" e os botões **Agora não** e **Já verifiquei, reenviar**. |
| `10-05-nfce-rejeitada.png` | Janela **NFCe rejeitada** com "Rascunho 5001 · série 1", **Motivo da rejeição**, **Sugestão de correção** e **Fechar e iniciar uma nova venda**. |

### Capítulo 11. Importar DAV e recuperar NFC-e

| Arquivo | O que capturar |
|---|---|
| `11-01-menu-importacao.png` | Janela **Menu Importação** com as opções **Importar DAV** e **Importar NFCe**, com as descrições. |
| `11-02-importacao-dav.png` | Janela **Importação de DAV** com busca, datas, tabela com uma linha selecionada, "3 DAV(s) encontrada(s)", paginação e **Importar DAV**. |
| `11-03-importacao-nfce.png` | Janela **Importação de NFCe** com a tabela de suspensas (NFCe, Série, Cliente, Operador, Emissão, Total, Status "Suspensa"), uma linha selecionada e **Importar NFCe**. |

### Capítulo 12. Menu gerencial

| Arquivo | O que capturar |
|---|---|
| `12-01-menu-gerencial.png` | Janela **Menu gerencial** com **Central de movimentação não fiscal** e **Relatório de resumo de caixa**, com as descrições. |
| `12-02-botao-menu-gerencial.png` | Faixa de três botões da base da coluna de venda, com **Menu Gerencial** destacado (por exemplo, com um quadro vermelho). |
| `12-03-tela-do-erp-em-nova-aba.png` | Navegador com duas abas: o Checkout e a tela **Central de movimentação não fiscal** do ERP, aberta pelo menu. |

### Capítulo 13. Celular e tablet

| Arquivo | O que capturar |
|---|---|
| `13-01-etapa-1.png` | Etapa 1 no celular: barra superior, indicador "Cliente e produtos 1/3", cartão do cliente, barra de produto com **Scanner**, lista de itens e **Ver produtos e pagamento**. |
| `13-02-etapa-2.png` | Etapa 2: indicador "Produtos e pagamento 2/3", lista de itens, cartão **Pagamento** e os botões **Cliente e produtos** e **Revisar venda**. |
| `13-03-etapa-3.png` | Etapa 3: indicador "Revisão e finalização 3/3", totais, **Conferência**, **Pagamentos** e **Finalizar venda**. |
| `13-04-scanner.png` | Scanner aberto: "Aponte para o código de barras", a câmera ao fundo e **Fechar scanner**. |

### Capítulo 14. Display do cliente

| Arquivo | O que capturar |
|---|---|
| `14-01-display-repouso.png` | Tela do cliente em repouso: símbolo do carrinho, nome da loja e "Seja bem-vindo!". |
| `14-02-display-pix.png` | Tela do cliente durante um PIX: nome da loja, "Pague com PIX", QR Code, "Valor a pagar R$ 50,00" e "Aguardando pagamento". |
| `14-03-display-aprovado.png` | Tela do cliente com "Pagamento confirmado", "Valor pago R$ 50,00" e "Obrigado! Esta tela volta em 8 s". |

### Capítulo 15. Solução de problemas

| Arquivo | O que capturar |
|---|---|
| `15-01-identificacao-da-nota.png` | Janela **Venda finalizada** com a identificação da nota ("NFCe 1234 · série 1") em destaque. |
| `15-02-chrome-policy.png` | Página `chrome://policy` do Chrome, com `LocalNetworkAccessAllowedForUrls` e `InsecureContentAllowedForUrls` listadas, status "OK", e a origem do Checkout como valor. Use um endereço de teste. |

### Capítulo 18. Auditoria de ações

| Arquivo | O que capturar |
|---|---|
| `18-01-log-no-erp.png` | Tela do ERP com uma NFC-e aberta e o campo de log mostrando a lista de eventos (`VENDA_INICIADA`, `PRODUTO_INSERIDO`, `FORMA_PAGAMENTO_APLICADA`, `VENDA_FINALIZADA`), com dados fictícios. |

Os capítulos 16 (glossário) e o próprio 17 não têm figuras. O README também não.

## Resumo

- **Total de figuras:** 55.
- **Por capítulo:** 01 (4), 02 (5), 03 (4), 04 (3), 05 (3), 06 (4), 07 (4), 08 (4), 09 (3), 10 (5), 11 (3), 12 (3), 13 (4), 14 (3), 15 (2), 18 (1).
- Para regenerar esta lista depois de mudar os capítulos, busque por `![` em `docs/wiki/*.md`.

## Veja também

- [README: mapa da wiki](#wiki-operacional-do-centrium-checkout)
- [15. Solução de problemas](#15-solução-de-problemas)

---

# 18. Auditoria de ações

> O que o Checkout registra do que o operador faz durante a venda e entrega ao ERP junto com a NFC-e, e como o suporte e o gestor podem ler esse registro.

**Quem usa:** Supervisor/gestor | Suporte

## Para que serve

Durante cada venda, o Checkout anota, em ordem e com data e hora, as ações importantes do operador: quem foi o cliente, quais produtos entraram e saíram, como foi o pagamento, se houve recusa, se a venda foi finalizada ou suspensa. No fim, esse registro vai ao ERP **junto com a venda**, no campo de log da NFC-e. Assim, o gestor e o suporte conseguem reconstruir **o que aconteceu** na venda, inclusive o que nunca chega a aparecer na nota (itens cancelados, pagamentos recusados, trocas de cliente).

O operador **não vê** esse registro na tela e não tem como editá-lo.

## Antes de começar

- O registro vale **para cada venda** e começa quando a tela de venda abre ou quando uma nova venda começa (depois de finalizar ou suspender).
- Ele existe **só na memória do navegador** durante a venda. Não é gravado no computador, não sobrevive a F5 e some quando a aba fecha.
- Quem lê o registro é quem tem acesso à NFC-e (ou ao rascunho) no ERP.

## Como o registro funciona

1. **Abertura:** ao começar uma venda, entra o primeiro evento, `VENDA_INICIADA`. Na versão atual, a origem registrada nele é sempre `NOVA`; quando a venda é retomada de um documento, isso aparece em um evento seguinte (`DAV_IMPORTADO` ou `NFCE_RECUPERADA`).
2. **Durante a venda:** cada ação relevante acrescenta um evento, com a hora (formato internacional, em horário UTC) e os detalhes.
3. **No envio:** quando o operador **finaliza** ou **suspende**, o Checkout acrescenta `VENDA_FINALIZADA` ou `VENDA_SUSPENSA` e envia **todo o histórico** ao ERP, no campo de log da operação.
4. **Depois do envio com sucesso:** o histórico é descartado e uma nova venda começa com um registro novo. Se o envio falhar por rede e o operador reenviar, o histórico acompanha o reenvio, com um evento `FATURAMENTO_FALHOU` marcando a falha.
5. **Venda vazia cancelada:** se nada é enviado ao ERP (venda sem itens), o registro é descartado.

> **Atenção:** o registro é **produzido no navegador do operador**. Ele serve como trilha para reconstruir a venda, mas **não é uma prova independente**: o ERP não tem como conferir o conteúdo por outra fonte.

## O que é registrado

| Evento no log | Quando acontece | Detalhes registrados |
|---|---|---|
| `VENDA_INICIADA` | Começo da venda (sempre o primeiro evento) | Origem (hoje, sempre `NOVA`) |
| `CLIENTE_SELECIONADO` | Primeira escolha do cliente na venda | Código e nome do cliente |
| `CLIENTE_CRIADO` | Cadastro simplificado salvo | Código e nome do novo cliente |
| `CLIENTE_TROCADO` | Troca do cliente por outro | Código anterior e código novo |
| `VENDEDOR_SELECIONADO` | Primeira escolha do vendedor | Código e nome do vendedor |
| `VENDEDOR_TROCADO` | Troca do vendedor | Código anterior e código novo |
| `PRODUTO_INSERIDO` | Item lançado na venda | Código do produto, quantidade, preço unitário e desconto |
| `PRODUTO_ALTERADO` | Quantidade, preço ou desconto de um item editado | Código do produto, campo alterado, valor anterior e valor novo |
| `PRODUTO_CANCELADO` | Item cancelado (lixeira) | Código do produto |
| `CONDICAO_PAGAMENTO_APLICADA` | Condição de pagamento escolhida | Descrição da condição |
| `FORMA_PAGAMENTO_APLICADA` | Forma de pagamento aprovada e aplicada | Descrição da forma e valor |
| `FORMA_PAGAMENTO_REMOVIDA` | Forma removida, estornada ou limpa | Descrição da forma |
| `VALE_DEVOLUCAO_USADO` | Vale devolução aplicado | Código do vale e valor |
| `PAGAMENTO_RECUSADO` | Pagamento recusado (por exemplo, vale inválido, PIX recusado ou desistência) | Tipo do pagamento e o motivo |
| `VALIDACAO_VENDA_RECUSADA` | O ERP recusou a venda na conferência prévia ao adicionar pagamento | Origem (manual ou atalho), condição, forma e o motivo do ERP |
| `VENDA_RAPIDA_ACIONADA` | Atalho F6 a F9 acionado e pagamento lançado | Tecla, nome do cenário, códigos da condição e da forma, valor lançado e se a finalização foi automática |
| `DAV_IMPORTADO` | DAV importado | Número do DAV, número do rascunho, quantidade de linhas e de formas de pagamento |
| `NFCE_RECUPERADA` | NFC-e suspensa recuperada | Número e série do rascunho, quantidade de linhas e de formas de pagamento |
| `ATALHO_ACIONADO` | Tecla fixa acionada (F1, F2, F3, F4 ou F10) | Qual comando e a origem (`TECLADO`) |
| `FATURAMENTO_FALHOU` | Falha de rede no envio de finalização ou suspensão | Qual operação falhou |
| `VENDA_FINALIZADA` | O operador finalizou | (nenhum) |
| `VENDA_SUSPENSA` | O operador suspendeu | (nenhum) |

Cada evento tem também o campo de **hora** (`timestamp`). Exemplo sintético do formato, com dois eventos:

```json
[
  { "tipo": "VENDA_INICIADA", "timestamp": "2026-10-13T14:02:11.000Z", "detalhes": { "origem": "NOVA" } },
  { "tipo": "PRODUTO_INSERIDO", "timestamp": "2026-10-13T14:02:40.000Z",
    "detalhes": { "codigoProduto": "123", "quantidade": 2, "precoUnitario": 10, "desconto": 0 } }
]
```

![Tela do ERP com uma NFC-e aberta e o campo de log da operação mostrando a lista de eventos em formato de texto (VENDA_INICIADA, PRODUTO_INSERIDO, FORMA_PAGAMENTO_APLICADA, VENDA_FINALIZADA), com dados fictícios.](imagens/18-01-log-no-erp.png)
*Figura 18.01 — O registro de auditoria no campo de log da NFC-e, no ERP.*

## O que **não** é registrado

- **Dados pessoais além do nome e do código do cliente.** O CPF e o telefone do cliente não entram no registro.
- **Aberturas de janelas e consultas:** buscar cliente, produto ou vendedor; abrir o Menu Gerencial; abrir o display; abrir o Menu Importação.
- **Atalhos recusados.** Só o acionamento que de fato executou a ação gera `ATALHO_ACIONADO`.
- **Login e logout** do operador (são do ERP).
- **Cobranças PIX e transações TEF em si.** O registro guarda o resultado na venda (forma aplicada, recusada ou removida), não o passo a passo da cobrança.
- **Erros de tela** que não alteram a venda (por exemplo, "Produto não encontrado").

## Como o gestor ou o suporte usa

1. Abra a NFC-e (ou o rascunho) no ERP e localize o campo de **log** da operação.
2. Leia os eventos em ordem. A hora está em horário UTC (três horas à frente de Brasília, fora do horário de verão).
3. Use o registro para responder, por exemplo:
   - **O cliente foi trocado?** Procure `CLIENTE_TROCADO`.
   - **Teve item cancelado?** Procure `PRODUTO_CANCELADO` e `PRODUTO_ALTERADO`.
   - **O preço ou o desconto de um item foi mexido?** Veja `PRODUTO_ALTERADO` (campo, valor anterior e valor novo).
   - **Como foi o pagamento?** Veja `CONDICAO_PAGAMENTO_APLICADA`, `FORMA_PAGAMENTO_APLICADA`, `FORMA_PAGAMENTO_REMOVIDA` e `PAGAMENTO_RECUSADO`.
   - **A venda foi finalizada por atalho?** Procure `VENDA_RAPIDA_ACIONADA` com a finalização automática ligada.
   - **Houve falha de rede e reenvio?** Procure `FATURAMENTO_FALHOU`. Em caso de nota duplicada, é o primeiro lugar para olhar.
   - **A venda veio de um documento?** Procure `DAV_IMPORTADO` ou `NFCE_RECUPERADA`.

> **Suporte:** uma NFC-e rejeitada ou suspensa também carrega o registro daquele envio. Em vendas retomadas, o registro **não inclui o histórico de antes da suspensão**: ele começa na abertura da tela e segue com a retomada (`DAV_IMPORTADO` ou `NFCE_RECUPERADA`). O que aconteceu antes de suspender fica no log do envio anterior.

## Regras e bloqueios

- **O operador não vê, não edita e não apaga** o registro.
- **O registro é só da venda atual** e se perde com F5, fechamento da aba ou falha de energia antes do envio.
- **Nada é enviado ao ERP em separado:** o registro viaja só dentro do envio da venda (finalizar ou suspender).
- **O conteúdo vem do navegador** e deve ser lido como trilha, não como prova.

## Mensagens que você pode ver

O operador não vê nada sobre a auditoria. Não há mensagens de tela para este assunto.

## Dúvidas frequentes

**O operador pode desligar a auditoria?**
Não. Ela é automática em toda venda.

**O registro mostra quem foi o operador?**
O operador vai no próprio envio da venda (campo do usuário), e não dentro do registro de eventos. O servidor do Checkout confere o operador da sessão no momento do envio.

**A auditoria guarda a senha ou o CPF do cliente?**
Não. Do cliente, só o código e o nome (e, no caso da troca, os dois códigos).

**Por que existe um evento para cada tecla F1 a F10?**
Para distinguir, na análise, o que foi feito por teclado do que foi feito por clique.

## Veja também

- [04. Selecionar vendedor](#04-selecionar-vendedor)
- [09. Venda rápida e atalhos](#09-venda-rápida-e-atalhos)
- [10. Finalizar e suspender a venda](#10-finalizar-e-suspender-a-venda)
- [15. Solução de problemas](#15-solução-de-problemas)

