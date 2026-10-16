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
4. Siga o fluxo normal: cobre o que falta (capítulo [06](06-pagamento.md)) e finalize (capítulo [10](10-finalizar-e-suspender-venda.md)). Ao finalizar ou suspender, o Checkout atualiza o **mesmo documento** do ERP.

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
- **NFC-e rejeitada não é recuperável pelo Checkout.** Uma nota que a SEFAZ rejeitou não aparece na lista de suspensas; a correção e a retransmissão são feitas no ERP (capítulo [10](10-finalizar-e-suspender-venda.md)).
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

- [06. Pagamento](06-pagamento.md)
- [09. Venda rápida e atalhos](09-venda-rapida-e-atalhos.md)
- [10. Finalizar e suspender a venda](10-finalizar-e-suspender-venda.md)
- [15. Solução de problemas](15-solucao-de-problemas.md)
