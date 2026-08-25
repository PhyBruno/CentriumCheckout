# Recuperação de NFCe — Specification

## Problem Statement

Além de criar uma NFCe do zero ou importar um DAV, o operador de caixa precisa poder retomar um rascunho de NFCe já existente no ERP (venda suspensa anteriormente, ver `.specs/features/finalizacao-suspensao-venda/spec.md`, story "Suspender a venda em digitação"), sem redigitar os itens/pagamentos já lançados.

## UI Design

Frame `PDV Online Web - Modal Recuperação NFCe` em `design/CentriumCheckout.pen` — UI de referência já existe. Feature é **desktop-only** (2026-08-25, AD-046 em `.specs/project/STATE.md`) — sem equivalente no wizard mobile.

## Goals

- [ ] Retomar um rascunho de NFCe pronto para continuar a venda, sem redigitar itens/pagamentos.
- [ ] Preço de cada item sempre igual ao valor salvo no rascunho, salvo reinserção explícita do operador.

**Nota (2026-08-25, AD-057 em `.specs/project/STATE.md`):** a importação de DAV (`.specs/features/importacao-dav/spec.md`) reusa exatamente este mesmo mecanismo de import/mapeamento — `GetDAV` faz o ERP gerar automaticamente um rascunho de NFCe e devolve o mesmo shape JSON que `CarregarNFCe` (`OutCheckoutFaturarNFCe`/`CheckoutFaturarNFCe`), não uma estrutura própria de DAV. Toda a lógica desta feature (preservação de `NumeroNota`, preço congelado sem motor de precificação, pré-seleção de vendedor) se aplica igualmente a um DAV importado.

## Out of Scope

| Feature | Reason |
|---|---|
| Layout/equivalente mobile | Confirmado (2026-08-25, AD-046): decisão direta do usuário — feature é desktop-only, mesmo tratamento já dado ao Modal DAV (`.specs/features/importacao-dav/spec.md`) |
| Lock otimista/pessimista entre operadores no mesmo rascunho | Confirmado (2026-08-25, AD-052): decisão direta do usuário — concorrência é resolvida inteiramente pelo ERP, sem controle no Checkout |

---

## User Stories

### P1: Listar e selecionar rascunho de NFCe para retomada ⭐ MVP

**User Story**: Como operador de caixa, quero ver a lista de rascunhos de NFCe (vendas suspensas) e escolher um para retomar.

**Why P1**: Ponto de entrada do fluxo — sem lista, não há retomada.

**Acceptance Criteria**:

1. WHEN o operador abre o modal de recuperação de NFCe THEN o sistema SHALL chamar `GET /ApiCentriumOAuth/GetListaNFCes` (DataProvider real `DpCheckout_RascunhosLista`, mesmo padrão paginado de `GetListaClientes`/`GetListaVendedores`: params `Empresa`, `TxtBusca`, `Pagina`, `TamanhoPagina`) e listar os rascunhos disponíveis. **Confirmado (Fato F2 de `.specs/project/DECISIONS.md`, verificado via KB do GenExus):** `TxtBusca` filtra **só** por `CliNom` (nome do cliente) ou `NfcRepNom` (nome do vendedor) — **não busca por número da nota**. Dois filtros vêm hardcoded no servidor, não parametrizáveis: `NfcStatus = '0'` (sempre só rascunhos) e `NfcDatEmi >= (Today - 30)` (sempre só últimos 30 dias) — ver Edge Cases.
2. WHEN o operador digita um termo de busca THEN o sistema SHALL filtrar a listagem por nome de cliente ou nome de vendedor — nunca por número da nota, já que o endpoint não suporta esse filtro.

**Independent Test**: Abrir o modal de recuperação e verificar paginação da lista; buscar por nome de cliente e por nome de vendedor e confirmar que ambos filtram a listagem; confirmar que buscar por número de nota não retorna resultado algum (comportamento esperado, não é bug).

---

### P1: Retomar rascunho de NFCe para o carrinho ⭐ MVP

**User Story**: Como operador de caixa, ao selecionar um rascunho, quero que os itens, pagamentos e o número da nota já venham preenchidos, para só revisar e continuar a venda.

**Why P1**: Elimina redigitação manual de uma venda já iniciada e suspensa.

**Acceptance Criteria**:

1. WHEN o operador seleciona um rascunho da lista THEN o sistema SHALL chamar `GET /ApiCentriumOAuth/CarregarNFCe` e receber a venda completa (itens, formas de pagamento, cliente, vendedor).
2. WHEN o rascunho é carregado THEN o sistema SHALL preservar o campo `NumeroNota` retornado, reenviando-o em `FaturarNFCe` na finalização/suspensão subsequente (`.specs/features/finalizacao-suspensao-venda/spec.md`, `FIN-03`) — nunca `NumeroNota = 0` para uma venda retomada.
3. WHEN o rascunho é carregado THEN o sistema SHALL popular o carrinho com o preço de cada item **preservado/congelado** exatamente como salvo no rascunho — SEM disparar o motor de precificação (`.specs/features/carrinho-produto-precificacao/spec.md`) automaticamente. Reflete que o preço pode ter sido alterado manualmente pelo operador na inserção original.
4. WHEN o operador reinsere, depois de retomar o rascunho, um item que já está no carrinho retomado THEN o sistema SHALL disparar o recálculo normal de preço (`CART-04`/`CART-05`) para esse SKU — a preservação do preço vale só para os itens exatamente como vieram do rascunho, não para reinserções feitas depois de retomar.
5. WHEN o rascunho carregado já traz `vendedorCodigo` preenchido THEN o sistema SHALL pré-selecionar automaticamente esse vendedor (mesmo comportamento já confirmado para `CarregarNFCe` em `.specs/features/selecao-vendedor/spec.md`, AD-024).

**Independent Test**: Retomar um rascunho mockado com 2 itens (preços distintos dos preços atuais de catálogo) e 1 forma de pagamento; verificar que o carrinho reflete exatamente os preços salvos, sem recálculo. Reinserir um dos dois itens já presentes e confirmar que só esse SKU dispara recálculo. Finalizar a venda e confirmar que `NumeroNota` enviado é o mesmo do rascunho.

---

## Edge Cases

- WHEN o operador usa qualquer filtro além do texto de busca (cliente/vendedor) THEN ⚠️ não há suporte — `NfcStatus` e `NfcDatEmi` são hardcoded no `DataProvider` (`DpCheckout_RascunhosLista`), a listagem é sempre "só rascunhos" + "últimos 30 dias", independentemente do que o Checkout envie. Não é uma questão de o contrato aceitar ou não parâmetro adicional — é limitação real do servidor (Fato F2).
- WHEN o Checkout monta o request de `GetListaNFCes` THEN o sistema SHALL limitar `TamanhoPagina` no próprio request, não confiar no servidor para isso — mesmo bug de paginação de cap-50 anulado já encontrado em `ListaDAVs` (AD-024 em `.specs/project/STATE.md`): `&TamanhoPaginaAuxiliar` é limitado a 50 e depois sobrescrito sem teto por uma segunda atribuição quando `&TamanhoPagina` não é vazio.
- WHEN dois operadores acessam concorrentemente o mesmo rascunho de NFCe suspenso (ex.: ambos tentam retomar o mesmo rascunho) THEN o sistema SHALL NÃO implementar nenhum mecanismo de lock otimista/pessimista — a resolução de conflito fica inteiramente a cargo do próprio ERP. **Resolvido (2026-08-25, AD-052):** decisão direta do usuário, mesma regra aplicada a `.specs/features/importacao-dav/spec.md`.
- WHEN a venda retomada tem uma forma de pagamento removível (dinheiro/cartão manual) já aplicada e é suspensa novamente THEN esse pagamento SHALL persistir, disponível na próxima retomada — ver `.specs/features/finalizacao-suspensao-venda/spec.md` (Edge Cases, AD-042).

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
|---|---|---|---|
| NFCE-01 | Listar rascunhos via `GetListaNFCes` (busca só por cliente/vendedor, sem número) | - | Verified (2026-08-25, AD-041 — Fato F2, verificado via KB do GenExus) |
| NFCE-02 | Retomar rascunho completo via `CarregarNFCe`, preservando `NumeroNota` | - | Verified (2026-08-25, AD-041) |
| NFCE-03 | Preço preservado/congelado do rascunho, exceto reinserção de item já existente | - | Verified (2026-08-25, AD-041) |
| NFCE-04 | Pré-seleção de vendedor salvo no rascunho | - | Verified (mesma regra de `CarregarNFCe`, AD-024) |
| NFCE-05 | Sem lock entre operadores no mesmo rascunho | - | Verified (2026-08-25, AD-052) |

**Coverage:** 5 total, 1 limitação conhecida sem solução prevista (filtros de `GetListaNFCes` restritos a nome de cliente/vendedor, sem busca por número — limitação real do `DataProvider` do ERP, não pendência a resolver).

---

## Success Criteria

- [ ] Nenhum dado de um rascunho retomado é redigitado manualmente.
- [ ] Preço de item retomado nunca diverge do valor salvo no rascunho, exceto reinserção explícita do operador.
- [ ] Venda retomada segue exatamente as mesmas regras de pagamento/finalização de uma venda criada do zero.
