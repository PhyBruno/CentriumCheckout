# Quickstart: validação da feature 018

Pré-requisitos: ambiente de dev em Docker com o mock do ERP (`tests/e2e/support/erp-mock.ts`), como nas features 008–017. Testes: `npx vitest run` (unit/integration) e `npx playwright test` (e2e). Gate antes do push: `npx tsc --noEmit`.

## US1 — auditoria de forma removida

| # | Passo | Esperado | Req. |
|---|---|---|---|
| 1 | Aplicar TEF de R$ 50,00; aprovar; Remover → estornar até `EST` | linha riscada; no `Log` do retrato, `FORMA_PAGAMENTO_REMOVIDA` com `valor: 5000`, `motivo: "ESTORNO_TEF"`, `tefPagId` = `TEFPagId` da aprovação | FR-010–FR-012 |
| 2 | Aplicar dinheiro R$ 30,00; Remover | evento com `valor: 3000`, `motivo: "OPERADOR"`, sem `tefPagId`/`pixGuid` | FR-010, FR-014 |
| 3 | Gerar PIX, aprovar, Remover (confirmar) | evento com `pixGuid` | FR-013 |
| 4 | Finalizar a venda | o `Log` enviado ao `FaturarNFCe` contém os eventos acima, completos | FR-015 |

## US2 — "Limpar" preserva o histórico

| # | Passo | Esperado | Req. |
|---|---|---|---|
| 5 | Condição + dinheiro (aprovado) + outra forma removida; "Limpar" | as 2 linhas riscadas (`data-status="EXCLUIDO"`); condição e capa vazias; carrinho editável; 1 evento novo `motivo: "LIMPAR"` | FR-001–FR-004, FR-008 |
| 6 | Só formas riscadas, sem condição/capa | "Limpar" bloqueado com "não há … para limpar" | FR-006 |
| 7 | TEF aprovado; "Limpar" | recusado com o aviso de estorno | FR-005 |
| 8 | Após o passo 5, escolher condição e aplicar forma | entra normalmente; riscadas continuam fora do saldo | FR-008 |
| 9 | Finalizar | venda seguinte começa com lista vazia | FR-009 |

## US3 — troco

| # | Passo | Esperado | Req. |
|---|---|---|---|
| 10 | Venda R$ 87,00; dinheiro R$ 100,00 | tela: troco R$ 13,00 (inalterado); `ValidarNFCe` e `FaturarNFCe` com `FormaValor: 100` | FR-016, FR-018, FR-019 |
| 11 | Venda R$ 100,00; cartão 60 + dinheiro 50 | cartão `60`, dinheiro `50` | FR-016, FR-017 |
| 12 | Retomar NFCe suspensa cujo dinheiro é `100` para itens de `87` | linha mostra recebido R$ 100,00, troco R$ 13,00, saldo zerado | FR-020 |
| 13 | **Homologação com ERP real** (bloqueante para merge da US3): finalizar o passo 10 | NFCe autorizada com troco R$ 13,00 | D1 |
