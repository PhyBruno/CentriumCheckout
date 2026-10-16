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

- [04. Selecionar vendedor](04-selecionar-vendedor.md)
- [09. Venda rápida e atalhos](09-venda-rapida-e-atalhos.md)
- [10. Finalizar e suspender a venda](10-finalizar-e-suspender-venda.md)
- [15. Solução de problemas](15-solucao-de-problemas.md)
