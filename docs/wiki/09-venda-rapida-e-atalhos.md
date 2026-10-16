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
| **F1** | Abre a janela **Importar DAV** (capítulo [11](11-importar-dav-e-recuperar-nfce.md)). | Venda que já tem itens (mesmo cancelados) ou cliente identificado, ou que veio de um documento, ou que já está em pagamento (condição escolhida ou pagamento aprovado). No layout compacto: "A importação de DAV e NFCe não está disponível no layout compacto: use um PDV com mouse." |
| **F2** | Abre a janela de **recuperação de NFC-e** (capítulo [11](11-importar-dav-e-recuperar-nfce.md)). | As mesmas recusas do **F1**. |
| **F3** | Abre a janela **Consultar cliente** (capítulo [03](03-identificar-cliente.md)). | Venda com itens ativos: "Esta venda já tem itens: o cliente não pode mais ser trocado, [...]". |
| **F4** | Abre a janela **Consultar produto** (capítulo [05](05-produtos-e-carrinho.md)). | Venda em pagamento: "Esta venda já está em pagamento: use "Limpar" no cartão de pagamento [...]". |
| **F10** | **Suspende** a venda, o mesmo que o botão **Cancelar venda** (capítulo [10](10-finalizar-e-suspender-venda.md)). | Venda sendo enviada ao ERP; venda vazia; cartão aprovado no TEF na venda. |

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
4. Se a forma for **PIX** ou **cartão no TEF**, a janela correspondente abre e o Checkout espera a aprovação (capítulos [07](07-pagamento-pix.md) e [08](08-pagamento-cartao-tef.md)).
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
| Recusa do ERP ao conferir a venda | Mesma conferência do capítulo [06](06-pagamento.md). | Siga o motivo informado. |
| "A importação de DAV e NFCe não está disponível no layout compacto: use um PDV com mouse." | F1 ou F2 no celular/tablet. | Use um PDV com mouse. |
| Motivos de recusa de F1 e F2 | Ver capítulo [11](11-importar-dav-e-recuperar-nfce.md). | Idem. |

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
Sim. A auditoria da venda registra o acionamento, com a origem "teclado" ou "clique" (capítulo [18](18-auditoria-de-acoes.md)).

## Veja também

- [03. Identificar cliente](03-identificar-cliente.md)
- [05. Produtos e carrinho](05-produtos-e-carrinho.md)
- [06. Pagamento](06-pagamento.md)
- [10. Finalizar e suspender a venda](10-finalizar-e-suspender-venda.md)
- [11. Importar DAV e recuperar NFC-e](11-importar-dav-e-recuperar-nfce.md)
- [13. Celular e tablet](13-celular-e-tablet.md)
