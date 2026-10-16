# Wiki operacional do Centrium Checkout

> Guia de uso e de suporte do Centrium Checkout, o ponto de venda (PDV) web do ERP Centrium.

## O que é esta wiki

O **Centrium Checkout** é a tela de caixa do ERP Centrium. O operador não abre o Checkout digitando um endereço: ele entra pelo ERP, que o leva direto ao caixa já identificado. No Checkout, você identifica o cliente, bipa os produtos, recebe o pagamento e emite a NFC-e (nota fiscal de consumidor eletrônica). O ERP continua sendo a fonte de todas as informações: produtos, clientes, formas de pagamento e notas fiscais.

Esta wiki descreve **o que o Checkout faz hoje**, com os nomes de botões, campos e mensagens exatamente como aparecem na tela. Ela serve a três públicos:

- **Operadores de caixa**, que usam o Checkout o dia inteiro.
- **Gestores de loja**, que acompanham o caixa e usam o menu gerencial.
- **Suporte da Centrium**, que atende chamados e precisa saber o que a tela quer dizer e o que coletar.

> **Dica:** se você só quer saber "o que significa esta mensagem?", vá direto ao capítulo [15. Solução de problemas](15-solucao-de-problemas.md) e procure pelo texto da mensagem.

## Por onde começar, por perfil

### Sou operador de caixa

Leia nesta ordem na primeira vez. Depois, use os capítulos como consulta.

1. [01. Acesso e sessão](01-acesso-e-sessao.md): como abrir o Checkout e o que fazer se ele não abrir.
2. [02. Conhecendo a tela](02-conhecendo-a-tela.md): para que serve cada parte da tela.
3. [05. Produtos e carrinho](05-produtos-e-carrinho.md): bipar, buscar, corrigir e remover itens.
4. [06. Pagamento](06-pagamento.md) e depois o da forma que você mais usa: [07. PIX](07-pagamento-pix.md) ou [08. Cartão (TEF)](08-pagamento-cartao-tef.md).
5. [10. Finalizar e suspender a venda](10-finalizar-e-suspender-venda.md): emitir a nota e o que fazer se der erro.
6. [09. Venda rápida e atalhos](09-venda-rapida-e-atalhos.md): as teclas que aceleram o caixa.

Quando precisar: [03. Identificar cliente](03-identificar-cliente.md), [04. Selecionar vendedor](04-selecionar-vendedor.md), [11. Importar DAV e recuperar NFC-e](11-importar-dav-e-recuperar-nfce.md), [13. Celular e tablet](13-celular-e-tablet.md) e [14. Display do cliente](14-display-do-cliente.md).

### Sou gestor de loja

- [12. Menu gerencial](12-menu-gerencial.md): acesso à central de movimentação não fiscal (sangria, suprimento) e ao resumo de caixa.
- [11. Importar DAV e recuperar NFC-e](11-importar-dav-e-recuperar-nfce.md): como retomar uma venda que ficou pela metade.
- [10. Finalizar e suspender a venda](10-finalizar-e-suspender-venda.md): o que acontece com uma venda suspensa.
- [18. Auditoria de ações](18-auditoria-de-acoes.md): o que o sistema registra sobre o que o operador fez.
- [16. Glossário](16-glossario.md): os termos usados na loja e no ERP.

### Sou do suporte da Centrium

- [15. Solução de problemas](15-solucao-de-problemas.md): sintoma, causa provável e o que fazer. Inclui a infraestrutura local (impressão, TEF, políticas do Chrome) e **o que coletar ao abrir um chamado**.
- [01. Acesso e sessão](01-acesso-e-sessao.md): quase todo "o Checkout não abre" nasce aqui.
- [08. Pagamento com cartão (TEF)](08-pagamento-cartao-tef.md) e [10. Finalizar e suspender a venda](10-finalizar-e-suspender-venda.md): onde estão os bloqueios e o reenvio de NFC-e.
- [18. Auditoria de ações](18-auditoria-de-acoes.md): o registro que acompanha cada NFC-e no ERP.
- [17. Guia de imagens](17-guia-de-imagens.md): lista de todas as figuras previstas.

## Índice completo

| Capítulo | Assunto |
|---|---|
| [01. Acesso e sessão](01-acesso-e-sessao.md) | Como o operador chega ao Checkout, sessão expirada e acesso inválido |
| [02. Conhecendo a tela](02-conhecendo-a-tela.md) | Barra superior e regiões da tela de venda no computador |
| [03. Identificar cliente](03-identificar-cliente.md) | CPF/CNPJ, nome, código, cliente padrão e cadastro simplificado |
| [04. Selecionar vendedor](04-selecionar-vendedor.md) | Quem atendeu o cliente |
| [05. Produtos e carrinho](05-produtos-e-carrinho.md) | Bipagem, busca, quantidade, preço, desconto e total |
| [06. Pagamento](06-pagamento.md) | Formas, condições, valor recebido, troco, desconto, vale e validação da nota |
| [07. Pagamento PIX](07-pagamento-pix.md) | QR Code, espera, aprovação e cancelamento |
| [08. Pagamento com cartão (TEF)](08-pagamento-cartao-tef.md) | Cartão pelo TEF e pela maquininha avulsa |
| [09. Venda rápida e atalhos](09-venda-rapida-e-atalhos.md) | Teclas F1 a F10 e cenários de pagamento rápido |
| [10. Finalizar e suspender a venda](10-finalizar-e-suspender-venda.md) | NFC-e, suspensão, erros, WhatsApp e impressão |
| [11. Importar DAV e recuperar NFC-e](11-importar-dav-e-recuperar-nfce.md) | Retomar vendas e documentos já existentes |
| [12. Menu gerencial](12-menu-gerencial.md) | Telas de retaguarda do ERP |
| [13. Celular e tablet](13-celular-e-tablet.md) | Layout em etapas, Scanner por câmera e teclado virtual |
| [14. Display do cliente](14-display-do-cliente.md) | A segunda tela, voltada para quem paga |
| [15. Solução de problemas](15-solucao-de-problemas.md) | Consulta para o suporte |
| [16. Glossário](16-glossario.md) | Termos e siglas |
| [17. Guia de imagens](17-guia-de-imagens.md) | Lista das figuras da wiki |
| [18. Auditoria de ações](18-auditoria-de-acoes.md) | O que é registrado das ações do operador |

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

- As figuras ainda serão capturadas. Onde você ver uma imagem que não carrega, ela está prevista em [17. Guia de imagens](17-guia-de-imagens.md).
