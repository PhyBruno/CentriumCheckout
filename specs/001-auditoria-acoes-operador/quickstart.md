# Quickstart: Validação de Auditoria de Ações do Operador

Guia de validação ponta a ponta para confirmar que o mecanismo de auditoria funciona depois de implementado. Não repete os detalhes de campo/tipo — ver `data-model.md` e `contracts/auditoria-events.md`.

## Pré-requisitos

- Scaffolding do projeto existente, com `vendaStore.ts` e `auditoriaSlice.ts` implementados (ver `plan.md`, "Project Structure").
- Pelo menos as features 003 (carrinho), 004 (finalização/suspensão) e uma de identificação de cliente/vendedor (005/012) implementadas o suficiente para disparar seus próprios eventos — esta feature não tem tela própria para testar isoladamente.
- Ambiente rodando via Docker (dev), sessão autenticada (feature 002) já concluída.

## Cenário 1 — Venda nova, do início ao fim (User Story 1 + 2)

1. Iniciar uma venda nova no Checkout.
2. Trocar/selecionar o cliente.
3. Selecionar o vendedor.
4. Inserir 2 produtos distintos.
5. Aplicar uma forma de pagamento.
6. Confirmar "Finalizar Venda".

**Resultado esperado**: inspecionando o payload de rede de `POST /ApiCentriumOAuth/FaturarNFCe` (dev tools → Network), o campo `Log` é uma string JSON não vazia. Parseando `Log` (`JSON.parse`), o array contém, nesta ordem: `VENDA_INICIADA` (`detalhes.origem: "NOVA"`), evento de cliente, evento de vendedor, 2× `PRODUTO_INSERIDO`, `FORMA_PAGAMENTO_APLICADA`, `VENDA_FINALIZADA` — com `timestamp` estritamente crescente entre eventos consecutivos.

## Cenário 2 — Suspensão em vez de finalização

Repetir os passos 1–5 do Cenário 1, depois usar "Cancelar Venda"/suspender em vez de finalizar.

**Resultado esperado**: mesmo comportamento do Cenário 1, mas o payload de `FaturarNFCe` tem `SuspenderOuFaturar: "SUSPENDER"` e o último evento do `Log` é `VENDA_SUSPENSA` em vez de `VENDA_FINALIZADA`.

## Cenário 3 — Falha de rede na finalização (Edge Case)

1. Repetir os passos 1–5 do Cenário 1.
2. Simular perda de rede antes de confirmar "Finalizar Venda" (ex.: DevTools → Network → Offline).
3. Confirmar "Finalizar Venda" — a chamada a `FaturarNFCe` falha por falta de resposta.
4. Restaurar a rede e confirmar "Finalizar Venda" novamente.

**Resultado esperado**: na 1ª tentativa (offline), nenhuma exceção não tratada — a UI deve indicar falha (fora do escopo desta feature, ver spec 004). Inspecionando o estado do slice `auditoria` (ex.: via devtools do Zustand) após a tentativa falha, o array continua intacto e ganhou um evento `FATURAMENTO_FALHOU` (`detalhes.operacao: "FATURAR"`) ao final. Na 2ª tentativa (rede restaurada), o `Log` enviado contém o array completo desde `VENDA_INICIADA`, incluindo o `FATURAMENTO_FALHOU` da tentativa anterior, seguido de `VENDA_FINALIZADA`.

## Cenário 4 — Retomada de rascunho não herda histórico anterior (FR-008)

1. Suspender uma venda com histórico (ex.: Cenário 2).
2. Retomar essa venda a partir do rascunho/NFCe recuperada (feature 011).
3. Realizar uma nova ação (ex.: inserir 1 produto) e finalizar.

**Resultado esperado**: o `Log` enviado nesta finalização começa em `VENDA_INICIADA` (`detalhes.origem: "RASCUNHO"`) — não contém nenhum evento da sessão suspensa anteriormente (que já foi entregue ao ERP naquele momento).

## Testes automatizados equivalentes

- Unitário: `tests/unit/domain/auditoria/eventos.spec.ts` (1 caso por tipo, shape de `detalhes`) e `serializarLog.spec.ts` (ordem cronológica, round-trip JSON).
- E2E: coberto indiretamente pelo teste ponta a ponta de finalização/suspensão da feature 004 (`tests/e2e/`), que deve incluir uma asserção de que `Log` está presente e parseável no payload — não duplicar aqui um E2E dedicado, já que esta feature não tem tela própria (FR-009).
