# Quickstart — Pagamento — PIX

Cenários de validação end-to-end. Pré-requisito: feature 008 (`podeAplicarForma`, `resolverIntegracao`, `aplicarPagamento`) e feature 002 (bootstrap/BFF) implementadas. Detalhes de contrato em `contracts/erp-pix-api.md`/`contracts/pix-domain-api.md`; algoritmos em `data-model.md`.

## Pré-requisitos

- Bootstrap mockado com `SessaoUsuario.ConfiguracoesPIX = { UtilizaCentriumPAG: true, MinimoPix: 500, TempoEspera: 10 }` (`MinimoPix` em centavos convertidos, ex. R$ 5,00).
- Catálogo de pagamento (008) com uma forma `FormaMeioPagtoNFe: 'Pix'`.
- Cliente atual definido (`clienteAtual` da feature 005) — cenários variam entre identificado e default.
- Mock de `POST /api/erp/GerarPIX` e `GET /api/erp/StatusPIX` (MSW ou equivalente).

## Cenário 1 — Fluxo dourado: geração, polling, aprovação

1. Carrinho com subtotal de R$ 65,50, nenhum pagamento aplicado.
2. Operador seleciona a forma PIX → `resolverIntegracao` retorna `PIX_DINAMICO` → `ModalPix` abre.
3. Mock de `GerarPIX` retorna `Trnbase64image`/`Trnbase64text` válidos → QR Code e "copia e cola" exibidos.
4. Mock de `StatusPIX` retorna `{ StatusTransacao: 'G' }` (Aguardando Pagamento) na primeira consulta (t=0s) e `t=10s` — nenhuma transição.
5. Mock de `StatusPIX` retorna `{ StatusTransacao: 'P' }` (Pagamento Recebido) em `t=20s`. Repetir o cenário com `{ StatusTransacao: 'M' }` (Pagamento Liberado Manualmente) — mesmo resultado esperado.
6. **Esperado**: modal fecha automaticamente; `PagamentoAplicado` correspondente muda para `status: 'APROVADO'` com `pixGuid` preenchido; evento `FORMA_PAGAMENTO_APLICADA` registrado na auditoria (008); saldo restante da venda cai para R$ 0,00.

## Cenário 2 — PIX oculto quando não configurado

1. Bootstrap mockado com `ConfiguracoesPIX.UtilizaCentriumPAG = false`.
2. **Esperado**: a forma PIX não aparece na lista de formas disponíveis (`formaDisponivel` retorna `false`, feature 008) — nenhum request a `GerarPIX` é possível.

## Cenário 3 — Fechamento manual com PIX pendente

1. Repetir passos 1-3 do Cenário 1.
2. Mock de `StatusPIX` sempre retorna `'G'` (Aguardando Pagamento).
3. Operador clica em fechar o modal.
4. **Esperado**: aviso de desassociação manual exibido; `PagamentoAplicado` correspondente é removido da lista (não fica como `PENDENTE_INTEGRACAO` órfão); nenhuma chamada HTTP de cancelamento é disparada (verificar `list_network_requests` do harness de teste); operador consegue aplicar outra forma de pagamento no valor total restante.

## Cenário 4 — Falha terminal reportada pela CentriumPag/ERP (`'X'`/`'R'`/`'E'`/`'F'`/`'O'`)

1. Repetir passos 1-3 do Cenário 1.
2. Mock de `StatusPIX` retorna `{ StatusTransacao: 'R' }` (Recusada) em `t=10s`.
3. **Esperado**: mesmo tratamento do Cenário 3 (aviso + remoção do pagamento local, sem cancelamento) — a diferença é que o gatilho veio do polling, não de uma ação do operador. Repetir para `'X'` (Expirada), `'E'` (Erro), `'F'` (Fechada) e `'O'` (Removido Associação PIX).

## Cenário 5 — Valor mínimo bloqueado no cliente

1. Bootstrap com `ConfiguracoesPIX.MinimoPix = 500` (R$ 5,00).
2. Carrinho com saldo restante de R$ 3,00.
3. Operador seleciona PIX.
4. **Esperado**: toast de bloqueio exibido; `ModalPix` não abre; nenhuma chamada a `GerarPIX`.

## Cenário 6 — Saldo residual em pagamento dividido (split)

1. Carrinho de R$ 100,00; operador aplica R$ 40,00 em dinheiro primeiro (`APROVADO`).
2. Operador seleciona PIX para o restante.
3. **Esperado**: `TrnValor` enviado a `GerarPIX` é `60.00` (saldo residual), não `100.00`.

## Cenário 7 — Falha na própria geração (rede) com retry

1. Mock de `GerarPIX` retorna erro 500 na primeira chamada, sucesso na segunda.
2. Operador seleciona PIX → toast de erro simples com "Tentar novamente".
3. Operador clica em "Tentar novamente".
4. **Esperado**: segunda chamada usa um `TrnGUID` diferente da primeira; sucesso exibe QR Code normalmente.

## Cenário 8 — Dados do pagador: cliente identificado vs. default

1. Cenário A: `clienteAtual` com `origem: 'BUSCA_DOCUMENTO'`, `nome: 'Maria Exemplo'`, `documento: '11122233344'`.
2. Cenário B: `clienteAtual` com `origem: 'DEFAULT'`, `nome: 'Cliente Padrão'`, `documento: null`.
3. **Esperado**: no payload de `GerarPIX`, `TrnPagadorNome`/`TrnPagadorCgc` refletem o cliente de cada cenário; no Cenário B, `TrnPagadorCgc` é enviado como string vazia (nunca `null`/`undefined` bruto no JSON). Em ambos, `TrnPagadorEmail`/`TrnPagadorFone` são string vazia.

## Fluxo dourado end-to-end (Playwright)

Repetir o Cenário 1 via UI real (não mock de função, mock de rede): abrir tela de pagamento → selecionar PIX → confirmar QR Code renderizado (`<img>` com `src` iniciando em `data:image/jpeg;base64,`) → confirmar botão "Copiar" funcional (Clipboard API) → simular aprovação via mock → confirmar navegação de volta à tela de pagamento com a forma PIX listada como aplicada e saldo zerado.
