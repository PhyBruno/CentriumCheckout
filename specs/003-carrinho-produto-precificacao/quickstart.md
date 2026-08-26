# Quickstart — Validação do Carrinho e do Motor de Precificação

**Feature**: `specs/003-carrinho-produto-precificacao/` | **Date**: 2026-08-26

Guia de validação: como provar que a feature funciona ponta a ponta. Não contém código de implementação — os detalhes de contrato estão em `contracts/` e a modelagem em `data-model.md`.

---

## Pré-requisitos

| # | Pré-requisito | Origem |
|---|---|---|
| 1 | Scaffolding do projeto criado (`package.json`, Vite, TypeScript `strict`, Docker) | feature 002 |
| 2 | BFF respondendo `/session/start`, `/api/bootstrap` e o proxy `/api/erp/*` | feature 002 |
| 3 | `vendaStore` (Zustand + Immer) existindo, com o slice `auditoria` combinado | feature 001 |
| 4 | Sessão do ERP válida, com `SessaoUsuario.TipoPreco`, `QtdMinCharParaConsulta` e `UsuarioTipoCodigoProduto` no bootstrap | feature 002 |
| 5 | Ao menos um produto no ambiente de teste com faixa configurada (`TipoPreco = 8`, `QtdMinimaPreco2 > 0`) e um produto pesável (`ProdutoPesavelEditavel ∈ {'S','B'}`) com `PrecoVenda` preenchido | ambiente ERP de dev |

O projeto roda 100% em Docker (`.specs/codebase/ARCHITECTURE.md`). Comandos abaixo assumem o container de desenvolvimento em execução.

---

## Camada 1 — Domínio puro (a mais importante)

Esta é a cobertura prioritária declarada em `.specs/codebase/STACK.md`. Roda sem navegador, sem React, sem rede — em milissegundos.

```bash
# suíte inteira do domínio de precificação
npm test -- tests/unit/domain/precificacao
```

### O que precisa passar

| Arquivo | Cenários mínimos | Requisito |
|---|---|---|
| `dinheiro.spec.ts` | soma/multiplicação em centavos sem drift de ponto flutuante; `distribuirPorMaiorResto` devolve parcelas cuja soma é **exatamente** o total, em casos que não fecham em centavo (ex.: dividir 100 por 3) | `FR-016`, AD-072 |
| `tabelaPreco.spec.ts` | um caso por `TipoPreco` de `1` a `11`; para `8`, quantidade **abaixo**, **exatamente igual** e **acima** de cada limiar; limiar `0` ignorado como faixa não configurada | `FR-005`, `FR-006`, AD-059/AD-060 |
| `reprecificacao.spec.ts` | cruzar faixa recalcula **todas** as linhas do SKU; cancelamento derruba as remanescentes para a faixa inferior; linha congelada não é alterada nem entra no agregado; linhas de outros SKUs voltam por identidade inalterada | `FR-006`, `FR-007`, `FR-008`, AD-067, D3 |
| `codigoProduto.spec.ts` | `"001234*3"` → `COM_QTD`; `"001234"` → `SIMPLES` com quantidade 1; EAN-13 válido iniciado em `2` → `BALANCA` com código e valor corretos; DV inválido cai em `SIMPLES`; `quantidadePesavel` com `precoVenda = 0` lança | `FR-004`, `FR-013`, AD-028/AD-029/AD-076 |

### Cenário de aceitação central (o teste que não pode faltar)

Reproduz o `Independent Test` da User Story 3, com valores sintéticos:

1. Produto com `PrecoVenda1 = 1000` centavos, `PrecoVenda2 = 900`, `QtdMinimaPreco2 = 5` unidades.
2. Inserir 3 unidades → 1 linha, preço `1000`.
3. Inserir mais 3 unidades (segunda linha do mesmo SKU) → agregado 6, cruza a faixa → **as duas linhas** passam a `900`.
4. Cancelar a segunda linha → agregado volta a 3 → a linha remanescente volta a `1000`, e a linha cancelada **permanece no array** com `cancelada: true`.
5. Total da venda não inclui a linha cancelada.

Passos 3, 4 e 5 cobrem simultaneamente `SC-001`, `SC-002` e `SC-003`.

---

## Camada 2 — Slice (integração de estado)

```bash
npm test -- tests/integration/carrinhoSlice.spec.ts
```

| Cenário | Como montar | Esperado | Requisito |
|---|---|---|---|
| Linha cancelada é preservada | inserir 1 linha, cancelar | `linhas.length === 1`, `linhas[0].cancelada === true` | `FR-009` |
| Bloqueio pós-pagamento | injetar `podeMutarCarrinho: () => false` | `editarItem` e `cancelarItem` são no-op; `linhas` inalterado | `FR-010`, AD-030 |
| Cancelamento sem supervisor | `podeMutarCarrinho: () => true` | `cancelarItem` executa sem nenhum prompt/modal de reautenticação | `FR-012`, AD-065 |
| Reinserção do mesmo SKU não busca de novo | espionar o fetcher de produto | exatamente **1** chamada para 2 inserções do mesmo código | `FR-003`, `CART-03` |
| Linha congelada preservada | inserir linha com `precoCongelado: true`, depois inserir linha nova do mesmo SKU | a linha congelada mantém preço e não altera o agregado; a nova precifica normalmente | `FR-017`, AD-067, D3 |
| Descongelamento explícito | editar a linha congelada | ela deixa de ser congelada e passa a participar do agregado e do recálculo | `FR-017`, I6 |
| Auditoria emitida | espionar `registrarEventoAuditoria` | 1 evento por ação do operador; **nenhum** evento gerado por reprecificação automática | AD-061, D11 |

---

## Camada 3 — E2E (fluxo dourado)

```bash
npx playwright test tests/e2e/carrinho-precificacao.spec.ts
```

Percurso, contra o ambiente de dev do ERP:

1. Abrir o Checkout pelo redirect do ERP (sessão válida).
2. Digitar menos caracteres que `QtdMinCharParaConsulta` no modal de busca → **nenhuma** chamada a `GetListaProdutos` é disparada.
3. Completar o termo → lista paginada aparece (skeleton Boneyard enquanto carrega).
4. Selecionar um candidato → uma chamada a `GetProduto` é feita e a linha entra na grid com preço, unidade e quantidade.
5. Bipar/digitar o código de um produto com faixa, em quantidade que cruza o limiar → todas as linhas daquele SKU exibem o novo preço.
6. Cancelar uma dessas linhas → ela permanece visível **riscada**; as demais voltam à faixa inferior; o subtotal não a inclui.
7. Digitar `codigo*3` + Enter → linha entra com quantidade 3. Digitar só `codigo` + Enter → linha entra com quantidade 1.
8. Bipar o EAN-13 de um produto pesável → quantidade e preço vêm da etiqueta, campos somente-leitura.
9. Digitar o código de um produto `ProdutoPesavelEditavel = 'E'` e pressionar TAB → a linha **não** entra; o foco vai para os campos editáveis; a linha só entra ao acionar `+`.
10. Repetir o passo 6 no layout mobile (mesmo estado de venda, layout condicional) → mesmo resultado.

### Verificações manuais que o E2E não cobre

- **F5 no meio da venda**: o navegador pede confirmação (`beforeunload`) e, ao confirmar, o carrinho está vazio — nada foi persistido (Constitution VI, AD-006).
- **DevTools → Application → IndexedDB/localStorage**: nenhuma linha de carrinho gravada em lugar nenhum; apenas o bootstrap do tenant no Dexie.

---

## Gates antes de considerar a feature pronta

| Gate | Comando | Quando |
|---|---|---|
| TypeScript `strict` sem erro | `npx tsc --noEmit` | antes de **qualquer** `git push` (Constitution, Development Workflow) |
| Suíte unitária do domínio verde | `npm test -- tests/unit/domain/precificacao` | antes do push |
| `/owasp-security` | skill | antes de merge para `master`/deploy de produção |

---

## Pendências conhecidas que **não** bloqueiam esta validação

| Item | Efeito prático | Onde está |
|---|---|---|
| `SessaoUsuario.listaPrecoPadrao` não existe no contrato | o fallback de `TipoPreco = 9` para cliente sem lista própria omite o parâmetro `Listapreco` e deixa o ERP aplicar o padrão dele — comportamento interino | `research.md`, D10 / achado A2 |
| `GetListaProdutos` não devolve `PrecoVenda`/`ProdutoPesavelEditavel` | já resolvido por design: a busca é seletor de código, `GetProduto` resolve a linha | `research.md`, D1 / achado A1 |
