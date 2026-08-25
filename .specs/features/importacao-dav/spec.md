# Importação e Faturamento de DAV — Specification

## Problem Statement

Além da inserção manual de produtos, o operador de caixa precisa poder importar um DAV (Documento Auxiliar de Venda) já existente no ERP e faturá-lo, sem digitar os itens/pagamentos novamente.

## UI Design

Frame `PDV Online Web - Modal DAV` em `design/CentriumCheckout.pen` (Modal Menu DAV: tabela de DAVs, paginação, ação de reimpressão por linha, e 6 filtros — cliente, data de emissão, status, vendedor, tipo, origem). ⚠️ Nenhum desses filtros tem requisito/critério de aceite correspondente ainda — ver Edge Cases. A ação de reimpressão por linha, presente no design, **não será implementada** — ver Out of Scope.

## Goals

- [ ] Importar um DAV pronto para faturamento com um clique, populando a venda automaticamente.
- [ ] Depois de importado, o DAV segue o fluxo normal de carrinho/pagamento/finalização sem tratamento especial.

## Out of Scope

- Reimpressão de DAV pela ação por linha do Modal DAV (presente no design) — **decisão direta do usuário (2026-08-25, AD-035):** não será implementada pelo Checkout. Se o operador precisar reimprimir um DAV, deve fazer isso diretamente pelo ERP. Segue a mesma linha da reimpressão de NFCe (já fora de escopo, ver `.specs/features/finalizacao-suspensao-venda/spec.md`), mas aqui é decisão de produto direta, não achado de contrato.

---

## User Stories

### P1: Listar e selecionar DAV para importação ⭐ MVP

**User Story**: Como operador de caixa, quero ver a lista de DAVs prontos para faturamento e escolher um para importar.

**Why P1**: Ponto de entrada do fluxo alternativo — sem lista, não há importação.

**Acceptance Criteria**:

1. WHEN o operador abre a janela de importação de DAVs THEN o sistema SHALL chamar `GET /ApiCentriumOAuth/ListaDAVs` (paginado, params `Empresa`, `TxtBusca`, `Pagina`, `TamanhoPagina`) e listar os DAVs prontos para faturamento. **Resolvido (2026-08-21, AD-024):** confirmado na KB do GenExus (`APICentriumOAuth` → `DpCheckout_GetDavs`) que o endpoint aceita `TxtBusca` (busca por número, título ou nome do cliente do DAV) além da paginação — a listagem sempre é implicitamente filtrada no servidor por "hoje" (`DavDatEmi = Today`) e status aberto (`DavSta = 'A'`), ver Edge Cases.

**Independent Test**: Abrir a janela de importação e verificar paginação da lista.

---

### P1: Importar DAV completo para o carrinho ⭐ MVP

**User Story**: Como operador de caixa, ao selecionar um DAV, quero que os itens e formas de pagamento já venham preenchidos, para só revisar e finalizar.

**Why P1**: Elimina redigitação manual de um documento já existente no ERP.

**Acceptance Criteria**:

1. WHEN o operador seleciona um DAV da lista THEN o sistema SHALL chamar `GET /ApiCentriumOAuth/GetDAV?NumeroDAV=...`. **Corrigido (2026-08-25, AD-057):** o ERP gera automaticamente um rascunho de NFCe ao processar esse endpoint, e o JSON retornado é o mesmo shape de `CarregarNFCe` (`OutCheckoutFaturarNFCe`/`CheckoutFaturarNFCe`) — não o `SDTDav` (`DavItemStruct`/`DavForPagamento`) hoje documentado em `ApiCentriumOAuth.yaml`, que está desatualizado nesse ponto (ver `.specs/codebase/CONCERNS.md`).
2. WHEN o DAV é carregado THEN o sistema SHALL reusar exatamente o mesmo mecanismo de import/mapeamento já usado para retomar um rascunho de NFCe (`.specs/features/recuperacao-nfce/spec.md`, story "Retomar rascunho de NFCe para o carrinho") — incluindo preservar `NumeroNota` (reenviado em `FaturarNFCe`) e manter o preço de cada item preservado/congelado exatamente como veio no rascunho, sem disparar o motor de precificação (`.specs/features/carrinho-produto-precificacao/spec.md`) automaticamente — e não uma lógica de mapeamento própria a partir de `DavItemStruct`/`DavForPagamento`. **Resolvido (2026-08-25, AD-057).**
3. WHEN um DAV é importado THEN o sistema SHALL sempre sobrescrever o cliente e o vendedor default da venda (pré-selecionados via `GetSessao`, AD-032) pelos dados de cliente/vendedor trazidos no próprio DAV — nunca preservar o default anterior. **Resolvido (2026-08-25, AD-055):** decisão direta do usuário.

**Independent Test**: Importar um DAV mockado com 2 itens e 1 forma de pagamento; verificar que o carrinho reflete exatamente esses dados antes de qualquer edição manual, sem recálculo de preço. Importar um DAV com cliente/vendedor diferentes do default da sessão e confirmar que o DAV sobrescreve ambos.

---

## Edge Cases

- WHEN um DAV é importado THEN o sistema SHALL faturá-lo através do próprio `POST /ApiCentriumOAuth/FaturarNFCe` — não existe endpoint separado de "marcar DAV como importado/em faturamento". **Parcialmente resolvido (2026-08-21, AD-023):** resposta direta do usuário — o próprio `FaturarNFCe` já trata a marcação de status como efeito colateral, mas exige um campo preenchido no SDT `CheckoutFaturarNFCe` cujo nome exato **ainda não foi definido** (marcado explicitamente pelo usuário como "PENDÊNCIA DEV"). **Reforçado (2026-08-21, AD-024):** leitura completa da SDT `CheckoutFaturarNFCe` na KB confirma que ela não tem nenhum campo relacionado a DAV hoje (nem `NumeroDav` nem equivalente). Além disso, `genexus_analyze(mode=impact)` em `DavDocFNum` (campo que a DAV usa para registrar o documento fiscal gerado ao ser faturada) não encontrou nenhuma procedure do Checkout escrevendo nele. Ou seja: não existe hoje, em lugar nenhum da KB, um caminho de código que marque a DAV como faturada a partir do fluxo do Checkout — a pendência é uma mudança de KB do ERP a ser priorizada (novo parâmetro + lógica de escrita), não apenas escolher o nome de um campo já existente. **Pergunta em aberto (2026-08-25, AD-057):** com a confirmação de que `GetDAV` já gera automaticamente o rascunho de NFCe no ERP, não está confirmado se esse efeito colateral já é, na prática, o mecanismo de vínculo que falta aqui — fica como pergunta a confirmar com a equipe do ERP, não como resolução automática desta pendência.
- WHEN o operador usa qualquer um dos 6 filtros desenhados no modal (cliente, data de emissão, status, vendedor, tipo, origem) THEN ⚠️ pendente, com forma corrigida (2026-08-21, AD-024): `GET /ApiCentriumOAuth/ListaDAVs` aceita `TxtBusca` (busca livre por número/título/nome do cliente do DAV, ver `DpCheckout_GetDavs` na KB) — cobre parcialmente o filtro "cliente" via busca por nome. Porém `data de emissão` e `status` **nunca poderão ser filtros server-side** nesse endpoint: estão hardcoded na query do `DataProvider` (`Where DavDatEmi = &Today`, `where DavSta = 'A'`) — a listagem sempre retorna só os DAVs de hoje com status aberto, independentemente do que o Checkout envie; não é uma questão de o contrato aceitar ou não o parâmetro. Filtros de vendedor/tipo/origem seguem genuinamente sem suporte server-side (nenhum parâmetro correspondente em `DpCheckout_GetDavs`). Decisão de produto pendente: aceitar essa janela fixa de "hoje + aberto" (a única coisa que o operador pode ajustar é o texto de busca), ou pedir ao ERP que exponha os filtros de data/status/vendedor como parâmetros reais. Achado lateral de qualidade: `DpCheckout_GetDavs` tem um bug de paginação — o cap de 50 registros por página é anulado por uma segunda atribuição (`&TamanhoPaginaAuxiliar = iif(&TamanhoPagina.IsEmpty(), 50, &TamanhoPagina)`) logo após a que aplicava o limite — o Checkout deve limitar o próprio `TamanhoPagina` no request, não confiar no servidor para isso.
- WHEN o operador usa a ação de reimpressão por linha, presente no design THEN o sistema SHALL **não implementar** essa ação. **Resolvido (2026-08-25, AD-035):** decisão direta do usuário — reimpressão de DAV não será feita pelo Checkout; se o operador precisar reimprimir, deve fazer isso pelo próprio ERP. O botão presente no design do Pencil (`PDV Online Web - Modal DAV`) deve ser desconsiderado/removido na fase de implementação de UI.
- WHEN dois operadores acessam concorrentemente o mesmo DAV (ex.: ambos tentam importar o mesmo DAV suspenso) THEN o sistema SHALL NÃO implementar nenhum mecanismo de lock otimista/pessimista — a resolução de conflito fica inteiramente a cargo do próprio ERP. **Resolvido (2026-08-25, AD-052):** decisão direta do usuário.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
|---|---|---|---|
| DAV-01 | Listar DAVs via `ListaDAVs` (paginado) | - | Verified |
| DAV-02 | Importar DAV completo via `GetDAV` | - | Verified (2026-08-25, AD-057 — `GetDAV` retorna o mesmo shape de `CarregarNFCe`; import reusa o fluxo de `.specs/features/recuperacao-nfce/spec.md`) |
| DAV-03 | DAV importado segue fluxo normal de venda | - | Verified |
| DAV-04 | Importação sempre sobrescreve cliente/vendedor default | - | Verified (2026-08-25, AD-055) |

**Coverage:** 4 total, 1 edge case pendente de decisão de produto (janela fixa "hoje + aberto" em `ListaDAVs`, filtros de vendedor/tipo/origem sem suporte, 2026-08-21 AD-024), 1 pendência de KB do ERP (campo/lógica de marcação de DAV importado em `CheckoutFaturarNFCe` — "PENDÊNCIA DEV", reforçada em AD-024 como mudança de KB, não só de nomenclatura; pergunta em aberto se o efeito colateral de `GetDAV` descrito em AD-057 já resolve isso na prática, ver `.specs/project/STATE.md`), 1 pendência de contrato (`ApiCentriumOAuth.yaml` desatualizado quanto a `GetDavOutput`, item 26 de `.specs/project/PENDENCIES.md`). Ação de reimpressão por linha resolvida (2026-08-25, AD-035) — não será implementada, fora de escopo por decisão direta do usuário. Concorrência entre operadores resolvida (2026-08-25, AD-052) — sem lock no Checkout, ERP resolve.

---

## Success Criteria

- [ ] Nenhum dado do DAV é redigitado manualmente após importação.
- [ ] Venda a partir de DAV segue exatamente as mesmas regras de precificação/pagamento/finalização de uma venda manual.
