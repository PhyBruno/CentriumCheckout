# 10. Finalizar e suspender a venda

> Como emitir a NFC-e, o que fazer quando ela dá erro e como suspender (ou cancelar) uma venda sem emitir nota.

**Quem usa:** Operador de caixa | Supervisor/gestor | Suporte

## Para que serve

No fim da venda você tem dois caminhos:

- **Finalizar venda:** o Checkout envia a venda ao ERP, que emite a **NFC-e** (nota fiscal de consumidor eletrônica) e a autoriza na SEFAZ. Depois o cupom é impresso.
- **Cancelar venda:** o Checkout **suspende** a venda. Ela vira um **rascunho** no ERP, que pode ser retomado depois (capítulo [11](11-importar-dav-e-recuperar-nfce.md)), e o caixa fica livre. O mesmo vale para a tecla **F10**. Quando a venda tem itens lançados, não existe no Checkout uma forma de "apagar" a venda: ela sempre é guardada como rascunho.

> **Atenção:** o Checkout **não reimprime e não cancela uma NFC-e já autorizada**. Isso se faz no ERP.

## Antes de começar

- Para finalizar, a venda precisa de: **vendedor**, itens com valor, **total totalmente coberto** pelas formas de pagamento e **aprovação do ERP** (capítulo [06](06-pagamento.md)).
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
5. Para retomar o rascunho depois, use **Menu Importação** > NFC-e (capítulo [11](11-importar-dav-e-recuperar-nfce.md)).

> **Atenção:** se a venda tem um **PIX já gerado**, o Checkout pergunta **Cancelar a venda com PIX gerado?** ("A venda vira rascunho no ERP, a cobrança não"). Leia o aviso: a cobrança **continua no banco**. Se o cliente pagar depois, o dinheiro entra numa venda que virou rascunho, e só o banco desfaz. Para seguir, clique em **Cancelar a venda mesmo assim**; para ficar, **Voltar para a venda**.

> **Atenção:** com **cartão aprovado no TEF**, a venda não pode ser suspensa: estorne o cartão antes (capítulo [08](08-pagamento-cartao-tef.md)).

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

- **CPF na nota:** o Checkout informa ao ERP o **cliente** da venda, e o ERP monta a nota com os dados do cadastro desse cliente. O Checkout **não tem** uma opção própria para "CPF na nota" nem para trocar o documento no momento da finalização. Para a nota sair com CPF, identifique o cliente **antes** de bipar os produtos (capítulo [03](03-identificar-cliente.md)). Com o cliente padrão, vale o que o ERP faz para o cliente padrão da loja.
- **WhatsApp:** o Checkout envia por WhatsApp apenas a **cobrança PIX** (capítulo [07](07-pagamento-pix.md)). Ele **não envia a NFC-e** por WhatsApp.
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
| "Há cartão aprovado no TEF nesta venda: estorne a forma pelo botão Remover antes de cancelar a venda." | Suspensão bloqueada pelo TEF. | Estorne o cartão (capítulo [08](08-pagamento-cartao-tef.md)). |
| "A venda ainda não tem validação aprovada do ERP. Revise os pagamentos antes de finalizar." | O ERP não aprovou a venda. | Revise os pagamentos (capítulo [06](06-pagamento.md)). |
| "Não há valor a faturar: insira ao menos um item com valor antes de finalizar." | Venda sem valor. | Lance itens. |
| "Configuração do ponto de venda indisponível: a venda não pode ser finalizada nem suspensa." | A configuração da loja não está carregada. | Abra o Checkout de novo pelo ERP. |
| "Não foi possível montar o pagamento desta venda: revise o desconto e as formas aplicadas." | Falha ao montar o pagamento. | Revise o desconto e as formas; se persistir, chame o suporte. |
| "A sessão do operador foi encerrada. Reabra o Checkout pelo ERP e tente novamente." | Sessão acabou; **nada foi emitido**. | Reabra pelo ERP e refaça a venda (capítulo [01](01-acesso-e-sessao.md)). |
| "O ERP recusou a operação (HTTP N). Nada foi emitido." | O ERP devolveu um erro. | Tente de novo; se persistir, chame o suporte com o número N. |
| "O ERP respondeu em formato ilegível. Nada foi emitido." / "O ERP respondeu em formato inesperado. A venda não foi suspensa." | Resposta inválida. | Confira no ERP se algo foi gravado antes de tentar de novo. Chame o suporte. |
| "O ERP respondeu sem a nota fiscal pronta para impressão. A venda não foi emitida." | O ERP não devolveu a nota. | **Confira no ERP antes de reenviar** e chame o suporte. |
| "O ERP registrou a NFCe como não autorizada, mas não informou o motivo." | Rejeição sem detalhe. | Consulte a nota no ERP. |
| "O PDV não tem host de impressão configurado; foi usado o padrão 127.0.0.1:4545." | O caixa não tem o endereço do serviço de impressão cadastrado. | Se o cupom não sair, chame o suporte para cadastrar o endereço. |
| "Não foi possível imprimir diretamente: o serviço de impressão da máquina não respondeu." | O serviço de impressão não respondeu. | Use o PDF. Chame o suporte para conferir o serviço. |
| "O navegador bloqueou a comunicação com o serviço de impressão local. É configuração de navegador/política de TI [...], não uma falha da impressora." | O Chrome bloqueou a chamada à impressão local. | Use o PDF. Chame o suporte/TI da loja (capítulo [15](15-solucao-de-problemas.md)). |
| "Não foi possível falar com o serviço de impressão local. Confira se ele está rodando nesta máquina; se estiver, o navegador está bloqueando a chamada [...]" | Serviço parado ou bloqueado. | Idem. |
| "O ERP devolveu um PDF que o navegador não conseguiu abrir. A venda foi emitida; reimprima o cupom pelo próprio ERP." | PDF inválido. | Reimprima pelo ERP. |

> **Suporte:** a impressão direta é uma chamada do **navegador** ao serviço de impressão instalado na máquina do caixa, sem passar pelo servidor do Checkout. Ela exige as políticas do Chrome `LocalNetworkAccessAllowedForUrls` e `InsecureContentAllowedForUrls` com a origem do Checkout. Sem elas, a impressão falha mesmo com o serviço rodando. O tipo de impressão (direta ou PDF) e o endereço do serviço vêm do cadastro do caixa no ERP. Em reclamação de "nota duplicada", confira primeiro no ERP quantas notas foram gravadas para a venda e se houve falha de rede no envio. Veja o capítulo [15](15-solucao-de-problemas.md).

## Dúvidas frequentes

**Finalizei, mas a internet caiu. A nota saiu?**
Não dá para saber pela tela. Confira no ERP antes de reenviar.

**O cupom não saiu, mas a janela de venda finalizada apareceu. Perdi a venda?**
Não. A nota foi emitida. Use **Abrir o PDF em outra aba**.

**Suspendi uma venda por engano. Dá para recuperar?**
Sim: ela virou rascunho no ERP. Use **Menu Importação** > NFC-e (capítulo [11](11-importar-dav-e-recuperar-nfce.md)).

**Posso cancelar uma nota já emitida?**
Não pelo Checkout. O cancelamento é feito no ERP.

**O botão Cancelar venda não apaga a venda?**
Com itens lançados, ele guarda a venda como rascunho no ERP. Só uma venda sem item (por exemplo, só com cliente escolhido) é descartada sem enviar nada.

## Veja também

- [06. Pagamento](06-pagamento.md)
- [07. Pagamento PIX](07-pagamento-pix.md)
- [08. Pagamento com cartão (TEF)](08-pagamento-cartao-tef.md)
- [11. Importar DAV e recuperar NFC-e](11-importar-dav-e-recuperar-nfce.md)
- [15. Solução de problemas](15-solucao-de-problemas.md)
- [18. Auditoria de ações](18-auditoria-de-acoes.md)
