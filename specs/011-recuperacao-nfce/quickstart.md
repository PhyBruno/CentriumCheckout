# Quickstart — Recuperação de NFCe

**Feature**: `specs/011-recuperacao-nfce/` | Validação ponta a ponta do Design desta feature.

## Pré-requisitos

- Mock/stub de `GET /api/erp/GetListaNFCes` e `GET /api/erp/CarregarNFCe` (MSW, mesma infra de teste de `specs/003-carrinho-produto-precificacao/quickstart.md`), com pelo menos 1 rascunho contendo 2 itens (preços diferentes do catálogo corrente) e 1 forma de pagamento em dinheiro.
- `vendaStore` limpo (venda nova, nenhum item/cliente/pagamento).

## Cenários

### 1. Listar e buscar rascunhos (US1, `NFCE-01`)

1. Abrir o modal de recuperação de NFCe (desktop).
2. Esperar o carregamento (skeleton Boneyard) e confirmar que a lista de rascunhos aparece, paginada.
3. Digitar um nome de cliente parcial → confirmar que a lista filtra.
4. Digitar um nome de vendedor parcial → confirmar que a lista filtra.
5. Digitar um número de nota → confirmar que **nenhum** resultado retorna (comportamento esperado, `research.md` D1) — não é bug.

**Esperado**: `FR-001`/`FR-002`/`FR-003`/`NFCE-01` satisfeitos.

### 2. Retomar rascunho para o carrinho (US2, `NFCE-02`/`NFCE-03`)

1. No mock, o rascunho tem 2 itens com `precoUnitario` divergente do preço atual de catálogo desses mesmos SKUs.
2. Selecionar o rascunho na lista e confirmar a retomada.
3. Inspecionar o carrinho: os 2 itens aparecem com `precoUnitario` **exatamente** igual ao do rascunho, `origem = 'RASCUNHO'`, `precoCongelado = true` (`data-model.md` §4).
4. Confirmar que a forma de pagamento em dinheiro aparece aplicada, `status = 'APROVADO'` (`data-model.md` §5).
5. Confirmar que o cliente e o vendedor do rascunho aparecem selecionados na tela.
6. Confirmar, via inspeção do `vendaStore`, que `identidadeVenda = { origem: 'RASCUNHO', numeroNota: <mesmo do rascunho> }`.

**Esperado**: `FR-005`/`FR-006`/`FR-007`/`FR-009`, `NFCE-02`/`NFCE-03`/`NFCE-04`.

### 3. Reinserir um item já presente (US2, AC4/AC5 da spec)

1. A partir do carrinho retomado do cenário 2, buscar/inserir manualmente um dos SKUs já presentes numa linha congelada.
2. Confirmar que só esse SKU dispara recálculo de preço (mesmo teste independente já descrito em `.specs/features/carrinho-produto-precificacao/spec.md`, CART-06/AD-067) — comportamento pertence à feature 003, esta feature só garante que a linha original ficou congelada corretamente até este ponto.

**Esperado**: `FR-008`, sem regressão de `data-model.md` J1/J2.

### 4. Finalizar a venda retomada (fluxo dourado, integra com feature 004)

1. A partir do carrinho retomado, finalizar a venda (`FaturarNFCe`, `SuspenderOuFaturar = 'FATURAR'`).
2. Inspecionar o payload de rede: `NumeroNota` enviado é o mesmo do rascunho (nunca `0`).

**Esperado**: `J3` (`data-model.md`), `NFCE-02`, consistente com `specs/004-finalizacao-suspensao-venda/data-model.md` §1.

### 5. Auditoria da retomada

1. Repetir o cenário 2 com o slice `auditoria` inspecionável.
2. Confirmar que o **primeiro** evento é `VENDA_INICIADA({ origem: 'RASCUNHO' })` e que nenhum outro evento (`PRODUTO_INSERIDO`, `FORMA_PAGAMENTO_APLICADA` etc.) é emitido pela hidratação em si.

**Esperado**: `J5`/`J6` (`data-model.md`).

### 6. Sem lock entre operadores (edge case, `NFCE-05`)

1. Simular duas retomadas concorrentes do mesmo `NumeroNota` (duas chamadas a `CarregarNFCe` sem nenhuma chamada intermediária de bloqueio).
2. Confirmar que nenhuma chamada de rede adicional de lock/unlock é feita em nenhum dos dois casos.

**Esperado**: `J7`, AD-052.

## Fluxo dourado (Playwright, `tests/e2e/recuperacao-nfce.spec.ts`)

Abrir modal → buscar por nome de cliente → selecionar rascunho → confirmar carrinho populado com preço/pagamento/cliente/vendedor do rascunho → finalizar venda → confirmar `NumeroNota` no payload de rede.
