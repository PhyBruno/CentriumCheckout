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

- [README: mapa da wiki](README.md)
- [15. Solução de problemas](15-solucao-de-problemas.md)
