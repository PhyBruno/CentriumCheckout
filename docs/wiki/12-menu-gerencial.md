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
| Resposta de "sessão ausente ou inválida" na nova aba | A sessão do Checkout expirou. | Reabra o Checkout pelo ERP (capítulo [01](01-acesso-e-sessao.md)). |

> **Suporte:** o Checkout redireciona para o ERP no servidor, a partir da sessão do operador, e só aceita os dois destinos fixos. Uma resposta de erro nessa navegação indica sessão do Checkout ausente (acesso negado) ou destino desconhecido (não encontrado). O endereço do ERP é montado a partir da loja da sessão. Se a tela do ERP abrir com erro, o problema está no ERP.

## Dúvidas frequentes

**Posso fazer sangria direto no Checkout?**
Não. A sangria e o suprimento são feitos na **Central de movimentação não fiscal**, no ERP.

**Perdi a venda ao abrir o menu?**
Não. O ERP abre em outra aba. A venda do Checkout fica como estava.

**Por que o Menu Gerencial não aparece no meu tablet?**
Ele só existe no layout de computador. Use um PDV com mouse ou acesse o ERP direto.

## Veja também

- [02. Conhecendo a tela](02-conhecendo-a-tela.md)
- [11. Importar DAV e recuperar NFC-e](11-importar-dav-e-recuperar-nfce.md)
- [15. Solução de problemas](15-solucao-de-problemas.md)
