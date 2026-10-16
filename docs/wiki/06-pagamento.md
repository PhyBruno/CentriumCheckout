# 06. Pagamento

> Como receber o pagamento da venda: condição, desconto, formas, valor recebido, troco, vale devolução e a conferência que o ERP faz antes da nota.

**Quem usa:** Operador de caixa

## Para que serve

O cartão **Pagamento**, no painel da direita, é onde você diz **como** o cliente vai pagar. Você pode dividir o total em várias formas (por exemplo, parte em dinheiro e parte em cartão). Quando o total estiver coberto, o botão **Finalizar venda** libera.

Os pagamentos com PIX e com cartão pelo TEF abrem janelas próprias, descritas nos capítulos [07](07-pagamento-pix.md) e [08](08-pagamento-cartao-tef.md).

## Antes de começar

- Termine de montar o carrinho. **Escolher a condição de pagamento congela a venda**: depois disso você não consegue incluir, editar ou cancelar itens, nem trocar cliente ou vendedor. Aplicar um desconto na venda, ou ter um pagamento aprovado, congela do mesmo jeito.
- Para voltar a editar, use **Limpar** no cabeçalho do cartão **Pagamento**. Ele desfaz condição, desconto e formas de uma vez.
- O vendedor da venda precisa estar escolhido para finalizar (capítulo [04](04-selecionar-vendedor.md)).

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
4. **Cartão aprovado no TEF** só sai por **estorno** (capítulo [08](08-pagamento-cartao-tef.md)).

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
- **Atalhos de venda rápida (F6 a F9)** lançam condição e forma de uma vez, mas só em venda **sem pagamento iniciado** (capítulo [09](09-venda-rapida-e-atalhos.md)).

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
| "Remover o PIX da venda?" / "Limpar o pagamento com PIX gerado?" ("A cobrança já foi gerada no banco") | Existe PIX gerado. O Checkout não cancela a cobrança. | Leia o aviso e o capítulo [07](07-pagamento-pix.md). |
| "Cartão aprovado no TEF só sai da venda por estorno: use o botão Remover da forma para estornar no TEF." | Tentou limpar uma venda com cartão TEF aprovado. | Estorne pelo botão de remover (capítulo [08](08-pagamento-cartao-tef.md)). |
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

- [05. Produtos e carrinho](05-produtos-e-carrinho.md)
- [07. Pagamento PIX](07-pagamento-pix.md)
- [08. Pagamento com cartão (TEF)](08-pagamento-cartao-tef.md)
- [09. Venda rápida e atalhos](09-venda-rapida-e-atalhos.md)
- [10. Finalizar e suspender a venda](10-finalizar-e-suspender-venda.md)
- [11. Importar DAV e recuperar NFC-e](11-importar-dav-e-recuperar-nfce.md)
