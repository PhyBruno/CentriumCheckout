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

1. Escolha a **condição de pagamento** e a **forma** de cartão (capítulo [06](06-pagamento.md)).
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
| "Identifique o cliente da venda antes de cobrar no TEF." | A venda está sem cliente. | Veja o capítulo [03](03-identificar-cliente.md). |
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

- [06. Pagamento](06-pagamento.md)
- [07. Pagamento PIX](07-pagamento-pix.md)
- [10. Finalizar e suspender a venda](10-finalizar-e-suspender-venda.md)
- [15. Solução de problemas](15-solucao-de-problemas.md)
