# Quickstart: validar o motor de desconto

**Feature**: [spec.md](./spec.md) | **Contrato**: [contracts/motor-desconto-api.md](./contracts/motor-desconto-api.md)

Roteiro de validação ponta a ponta. Não é a suíte de testes — essa nasce em `tasks.md`.

## Pré-requisitos

1. `npm ci`. Branch `feat/motor-desconto`.
2. **Porta 3100 livre**: derrube qualquer processo nela antes de rodar E2E (uma stack antiga, ou o container de outro projeto, faz o Playwright pular a stack nova e gera falsos negativos).
3. Stack local sem Docker: receita em `.specs/` (`dev-server-local-sem-docker`) — `stack.ts` + `vite` + link de `/session/start`. `stack.ts` sem `--watch` serve mock defasado; reinicie depois de editar `tests/e2e/support/erp-mock.ts`.
4. O `erp-mock` deve expor: um produto `'E'` com `PrecoVenda = 20,00` e `PrecoMinimo = 8,00`; um produto `'E'` com `PrecoMinimo = 0`; um produto `'E'` com `PrecoVenda = 0`; e três condições — **A** (`CondicaoDesconto 5`, `CondicaoDescontoMaximo 8`), **B** (`0`, `0`), **C** (`10`, `8`, cadastro incoerente).

## Cenários

### Q1 — preço e desconto andam juntos (US1)

1. Inclua o produto `'E'` de preço 20,00, quantidade 1.
2. Digite `18` no preço → desconto mostra `2,00`, total `18,00`.
3. Apague o desconto (`0`) → preço volta a `20,00`.
4. Digite `5` no desconto → preço mostra `15,00`.
5. Quantidade 3, preço `18` → desconto `6,00`, total `54,00`. Mude a quantidade para 5 → preço continua `18,00`, desconto `10,00`.
6. Digite `25` no preço → desconto `0,00`, preço `25,00`. Digite `5` no desconto → preço `15,00` (parte de 20, não de 25).
7. Quantidade 3, desconto `1` → preço `19,67`. **Saia do campo de preço sem mexer**: o desconto continua `1,00` (D4).

**Esperado**: nenhum estado com preço e desconto contraditórios; total sempre = bruto − desconto.

### Q2 — preço mínimo (US2)

1. Produto com mínimo 8,00 (preço 20,00): digite `6` no preço e saia do campo → preço `8,00`, desconto `12,00`, **um** aviso com o mínimo.
2. Digite `15` no desconto e saia → desconto `12,00`, preço `8,00`, um aviso.
3. Quantidade 3: desconto `40` → `36,00`.
4. Produto sem mínimo: desconto `19` → aceito, sem aviso.
5. Produto de preço de tabela `0`: preço e desconto independentes, sem aviso de mínimo.
6. Edite pelo lápis um item e troque quantidade, preço e desconto de uma vez → a linha fica com o conjunto aplicado **ou** com o que estava, nunca misturado.

### Q3 — capa pela condição (US3)

1. Venda com subtotal líquido 100,00 (itens com desconto próprio somando 20,00 sobre bruto 120,00).
2. Escolha a condição **A** → capa `5%` = `5,00` sobre 100,00 (não sobre 120,00); total `95,00`.
3. Digite `7` → `7%`. Digite `10` e saia → campo mostra `8`, um aviso com o teto.
4. Escolha a condição **B** → capa some (a digitada é descartada); o campo fica bloqueado com a explicação.
5. Escolha a condição **C** → capa `8%` (limitada ao teto) + aviso.
6. Com uma forma de pagamento aplicada, tente trocar de condição → recusada, capa intacta.
7. No histórico da venda (`Log` do retrato) confira um evento `DESCONTO_CAPA_APLICADO` por confirmação, com `origem` `CONDICAO` ou `MANUAL`, e **nenhum** por tecla digitada.

### Q4 — chave e payload (US4)

Capture o corpo de `FaturarNFCe` no `erp-mock` (ou pelo log do BFF).

| Chave | Venda: 3 itens, capa R$ 3,00 | Esperado |
|---|---|---|
| `DESCONTO_CAPA_NO_ERP=false` (padrão) | finalizar | **idêntico ao anterior à feature**: sem `DescontoCapaValor`; `DescontoValor` de cada item soma a parcela de 1,00 |
| `DESCONTO_CAPA_NO_ERP=true` | finalizar | `DescontoCapaValor: 3` no cabeçalho; `DescontoValor` só com convênio + manual |
| `true` | venda sem capa | `DescontoCapaValor: 0` |
| ambos | validar prévia e suspender | **mesma forma** da finalização |

Troque a variável, reinicie o BFF e recarregue a SPA: o cache do Dexie deve ser descartado sozinho (o hash do bootstrap mudou).

## Gates antes do push

```text
npx tsc --noEmit        # typescript-strict — obrigatório
npx vitest run          # unitário + integração
npx playwright test carrinho-precificacao pagamento-geral venda-rapida
```

`venda-rapida.spec.ts:312` falha ~40% sob carga no `master`: compare com `--repeat-each` antes de chamar de regressão. Antes do merge em `master`: `/owasp-security`.
