# Importação e Faturamento de DAV — Specification

## Problem Statement

Além da inserção manual de produtos, o operador de caixa precisa poder importar um DAV (Documento Auxiliar de Venda) já existente no ERP e faturá-lo, sem digitar os itens/pagamentos novamente.

## UI Design

Frame `PDV Online Web - Modal DAV` em `design/CentriumCheckout.pen` (Modal Menu DAV: tabela de DAVs, paginação, ação de reimpressão por linha, e 6 filtros — cliente, data de emissão, status, vendedor, tipo, origem). ⚠️ Nenhum desses filtros nem a ação de reimpressão têm requisito/critério de aceite correspondente ainda — ver Edge Cases.

## Goals

- [ ] Importar um DAV pronto para faturamento com um clique, populando a venda automaticamente.
- [ ] Depois de importado, o DAV segue o fluxo normal de carrinho/pagamento/finalização sem tratamento especial.

## Out of Scope

Nenhum item explicitamente excluído identificado até o momento — feature descoberta na varredura dos diagramas de sequência do ERP, escopo ainda sendo confirmado.

---

## User Stories

### P1: Listar e selecionar DAV para importação ⭐ MVP

**User Story**: Como operador de caixa, quero ver a lista de DAVs prontos para faturamento e escolher um para importar.

**Why P1**: Ponto de entrada do fluxo alternativo — sem lista, não há importação.

**Acceptance Criteria**:

1. WHEN o operador abre a janela de importação de DAVs THEN o sistema SHALL chamar `GET /ApiCentriumOAuth/ListaDAVs` (paginado) e listar os DAVs prontos para faturamento.

**Independent Test**: Abrir a janela de importação e verificar paginação da lista.

---

### P1: Importar DAV completo para o carrinho ⭐ MVP

**User Story**: Como operador de caixa, ao selecionar um DAV, quero que os itens e formas de pagamento já venham preenchidos, para só revisar e finalizar.

**Why P1**: Elimina redigitação manual de um documento já existente no ERP.

**Acceptance Criteria**:

1. WHEN o operador seleciona um DAV da lista THEN o sistema SHALL chamar `GET /ApiCentriumOAuth/GetDAV?NumeroDAV=...` e receber o DAV completo (cabeçalho, cliente, itens em `DavItemStruct`, formas de pagamento em `DavForPagamento`).
2. WHEN o DAV é carregado THEN o sistema SHALL popular a venda com os dados importados e seguir o fluxo normal de carrinho/pagamento/finalização (`.specs/features/carrinho-produto-precificacao/spec.md`, `.specs/features/pagamento/spec.md`, `.specs/features/finalizacao-suspensao-venda/spec.md`), sem lógica especial adicional.

**Independent Test**: Importar um DAV mockado com 2 itens e 1 forma de pagamento; verificar que o carrinho reflete exatamente esses dados antes de qualquer edição manual.

---

## Edge Cases

- WHEN um DAV é importado THEN o sistema SHALL faturá-lo através do próprio `POST /ApiCentriumOAuth/FaturarNFCe` — não existe endpoint separado de "marcar DAV como importado/em faturamento". **Parcialmente resolvido (2026-08-21, AD-023):** resposta direta do usuário — o próprio `FaturarNFCe` já trata a marcação de status como efeito colateral, mas exige um campo preenchido no SDT `CheckoutFaturarNFCe` cujo nome exato **ainda não foi definido** (marcado explicitamente pelo usuário como "PENDÊNCIA DEV" — falta identificar/confirmar o campo, não é mais uma dúvida de "existe endpoint ou não").
- WHEN o operador usa qualquer um dos 6 filtros desenhados no modal (cliente, data de emissão, status, vendedor, tipo, origem) THEN ⚠️ pendente: `GET /ApiCentriumOAuth/ListaDAVs` só aceita `Pagina`/`TamanhoPagina` no contrato atual — não há suporte a filtro server-side por nenhum desses 6 campos; não confirmado se a filtragem deve ser só client-side sobre a página já carregada, ou se o contrato precisa ser expandido.
- WHEN o operador usa a ação de reimpressão por linha, presente no design THEN ⚠️ pendente: nenhum requisito cobre esse botão ainda — `finalizacao-suspensao-venda/spec.md` já trata reimpressão de NFCe como fora de escopo (`GetPDFNota` não usado para essa finalidade); não confirmado se a reimpressão do Modal DAV é o mesmo conceito ou algo distinto (ex.: reimprimir o próprio DAV, não a NFCe).

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
|---|---|---|---|
| DAV-01 | Listar DAVs via `ListaDAVs` (paginado) | - | Verified |
| DAV-02 | Importar DAV completo via `GetDAV` | - | Verified |
| DAV-03 | DAV importado segue fluxo normal de venda | - | Verified |

**Coverage:** 3 total, 2 edge cases pendentes de confirmação com equipe do ERP (filtros server-side, ação de reimpressão), 1 pendência de implementação já entendida (campo do SDT `CheckoutFaturarNFCe` para marcar DAV importado — "PENDÊNCIA DEV", ver AD-023 em `.specs/project/STATE.md`).

---

## Success Criteria

- [ ] Nenhum dado do DAV é redigitado manualmente após importação.
- [ ] Venda a partir de DAV segue exatamente as mesmas regras de precificação/pagamento/finalização de uma venda manual.
