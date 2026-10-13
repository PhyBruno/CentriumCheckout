# 07. Pagamento PIX

> Como cobrar por PIX: o Checkout mostra um QR Code, espera o banco confirmar e libera a venda; o Checkout não cancela a cobrança no banco.

**Quem usa:** Operador de caixa | Suporte

## Para que serve

Quando o cliente paga por **PIX**, o Checkout pede ao ERP uma cobrança, mostra o **QR Code** na tela (e na tela do cliente, se estiver aberta) e fica consultando o banco até o pagamento ser confirmado. Você não digita nada: a janela fecha sozinha depois da aprovação.

> **Atenção:** o PIX depende do ERP da loja devolver a cobrança. Em ambiente de testes, a geração de cobrança ainda não tinha sido validada de ponta a ponta. Antes de colocar o PIX em uso numa loja, faça uma cobrança de teste de valor baixo (veja o capítulo [15](15-solucao-de-problemas.md)).

## Antes de começar

- **A loja precisa ter o PIX ativo** no ERP. Sem isso, a forma de PIX aparece apagada ("indisponível: a integração PIX não está ativa neste ponto de venda").
- A venda precisa ter **um cliente**: o ERP exige o cliente na cobrança. O cliente padrão da loja já cumpre isso. Se a loja não tem cliente padrão, identifique o cliente antes de bipar (capítulo [03](03-identificar-cliente.md)).
- O PIX tem **valor mínimo**, definido no ERP. Abaixo dele, a cobrança não é gerada.
- Em lojas que cobram o PIX pela maquininha (TEF), o PIX segue o fluxo do capítulo [08](08-pagamento-cartao-tef.md), e não este.

## Passo a passo

### Cobrar por PIX

1. Escolha a **condição de pagamento** e, em **Forma de pagamento**, a forma de **PIX** (capítulo [06](06-pagamento.md)).
2. Informe o valor e pressione **Enter** (ou clique em **Adicionar pagamento**). O Checkout confere a venda com o ERP.
3. A janela **Pagamento via PIX** abre, com o subtítulo **Aguardando pagamento**. Enquanto o QR Code carrega, aparece "Gerando o QR Code do PIX".
4. Mostre o QR Code ao cliente. Ele abre o aplicativo do banco e escaneia ("Abra o app do seu banco e escaneie o QR Code para concluir o pagamento."). Se a tela do cliente estiver aberta, o QR Code aparece lá também (capítulo [14](14-display-do-cliente.md)).
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

> **Suporte:** o PIX usa três chamadas ao ERP: gerar a cobrança, consultar o status (a cada 10 segundos) e, opcionalmente, enviar por WhatsApp. Pontos a confirmar quando a cobrança não nasce: PIX ativo na configuração da loja, forma de PIX cadastrada na condição, cliente identificado e valor acima do mínimo. Durante a homologação, o ERP de testes chegou a recusar a geração com o cliente padrão. Veja o capítulo [15](15-solucao-de-problemas.md).

## Dúvidas frequentes

**O cliente pagou, mas a janela continua em "Aguardando". O que faço?**
Espere até 10 segundos e confira se o dinheiro entrou no banco. Se entrou e a tela não atualiza, não gere outra cobrança sem antes conferir. Chame o suporte.

**Posso finalizar a venda sem esperar o PIX?**
Não. A janela só libera quando o banco confirma, ou quando você desiste (e o PIX sai da venda).

**O cliente pagou depois que eu desisti.**
O dinheiro entrou no banco, mas não na venda. Resolva o estorno direto no banco e peça ao gestor para tratar a desassociação na Central de Transações PIX do ERP.

**Dá para dividir um pagamento entre PIX e dinheiro?**
Sim. Lance cada forma com o valor correspondente (capítulo [06](06-pagamento.md)).

## Veja também

- [06. Pagamento](06-pagamento.md)
- [08. Pagamento com cartão (TEF)](08-pagamento-cartao-tef.md)
- [10. Finalizar e suspender a venda](10-finalizar-e-suspender-venda.md)
- [14. Display do cliente](14-display-do-cliente.md)
- [15. Solução de problemas](15-solucao-de-problemas.md)
