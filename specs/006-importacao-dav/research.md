# Phase 0 — Research: Importação e Faturamento de DAV

**Feature**: `specs/006-importacao-dav/` | **Date**: 2026-08-26

Nenhum `NEEDS CLARIFICATION` restou no Technical Context do `plan.md` — a spec de produto (`specs/006-importacao-dav/spec.md`) e a especificação de domínio (`.specs/features/importacao-dav/spec.md`) já chegavam a esta fase com a maioria das decisões de contrato fechadas (AD-023, AD-024, AD-035, AD-046, AD-052, AD-055, AD-057, AD-058, AD-077, AD-087; mais AD-107, acrescentado em 2026-08-31). Este documento cobre as decisões de **design** tomadas nesta fase — como implementar o que a spec já exige — e dois achados de contrato novos.

---

## D1 — `GetDav` reaproveita o shape de `CarregarNFCe`, não um mapeamento próprio a partir de `SDTDav`

**Decision**: `mapearVendaExistente` recebe sempre `CheckoutFaturarNFCe` (o SDT real do contrato), nunca `DavItemStruct`/`DavForPagamento` (o `SDTDav` documentado como shape de DAV no `ApiCentriumOAuth.yaml`, hoje desatualizado nesse ponto — AD-057).
**Rationale**: Confirmado por inspeção direta do yaml (`GetDavOutput.OutCheckoutFaturarNFCe` → `$ref: CheckoutFaturarNFCe`) e já decidido pelo usuário em AD-057. Implica que **o mesmo módulo de domínio** serve tanto para importar um DAV quanto para retomar um rascunho de NFCe (feature 011) — só muda o endpoint chamado (`GetDav` vs. `CarregarNFCe`), a resposta é estruturalmente idêntica.
**Alternatives considered**: Mapeamento próprio a partir de `SDTDav` — descartado, o próprio ERP não usa esse shape para este endpoint (o `SDTDav` do yaml está desatualizado, não reflete o comportamento real de `PCheckout_GetDav`).

---

## D2 — Quem "possui" o mecanismo compartilhado, já que a feature 011 ainda não foi planejada

**Decision**: Esta feature (006) cria o módulo `mapearVendaExistente.ts` e a extensão `CarrinhoSlice.importarLinhasCongeladas`. A feature 011 (recuperação de NFCe), quando planejada, **reaproveita sem alteração** — só adiciona a chamada a `CarregarNFCe` e a UI própria do Modal Recuperação NFCe.
**Rationale**: A numeração de feature (`006` vs `011`) não reflete ordem de planejamento — 006 está sendo desenhada primeiro. `.specs/features/recuperacao-nfce/spec.md` já registra a intenção inversa ("a importação de DAV reusa exatamente este mesmo mecanismo"), mas como nenhuma das duas tinha `plan.md` até agora, cabe a quem planeja primeiro criar o mecanismo compartilhado. Evita duplicação (Constitution II) sem bloquear 006 esperando 011.
**Alternatives considered**: Esperar a feature 011 ser planejada primeiro — descartado, sem necessidade real de ordem; adiaria a feature 006 sem ganho. Duplicar a lógica em cada feature — descartado, violaria SOLID (Single Responsibility/DRY) e criaria dois lugares para manter a mesma regra de congelamento de preço (AD-067).

---

## D3 — Cliente e vendedor: sobrescrita total, nunca merge

**Decision**: A importação chama diretamente as actions de sobrescrita já expostas pelos slices de cliente e vendedor, passando os dados do DAV — nunca um merge condicional com o default pré-selecionado. **Corrigido em 2026-08-31 (AD-115):** não existe uma action `trocarCliente` na feature 005 — a única action pública de troca é `selecionarCliente(cliente: ClienteCheckout, origem)`, que exige o cadastro completo do cliente, não só `{codigo, nome}`. Como o DAV só traz `clienteCodigo` (sem CPF/CNPJ, único parâmetro que `GetCliente` aceitava até então — AD-094), a importação primeiro chama `fetchClientePorCodigo(clienteCodigo)` — usando o parâmetro `CodCliente`, acrescentado ao procedure real `PCheckout_GetCliente` por decisão do usuário (AD-115) — e só então `selecionarCliente(clienteCompleto, 'DAV')` (`'DAV'` é um valor novo, aditivo, de `OrigemCliente`). Para vendedor, a action `trocarVendedor({codigo, nome: string | null})` já estava desenhada pela feature 012 com a assinatura exata que esta feature precisa (sem gap a resolver) — consumida por injeção de dependência com stub até a 012 ser tasqueada.
**Rationale**: FR-007 e AD-055 são explícitos: "independentemente de já existir um cliente/vendedor padrão selecionado". Reaproveitar a action de troca já existente (em vez de escrever direto no estado) garante que os mesmos efeitos colaterais da troca manual aconteçam (evento de auditoria, reprecificação por `TipoPreco = 9` se aplicável às linhas **não congeladas** que o operador inserir depois).
**Alternatives considered**: Escrever direto no estado do slice de cliente/vendedor, pulando a action pública — descartado, quebraria a garantia de Dependency Inversion que a feature 005 já estabeleceu (`carrinhoSlice` não conhece `clienteSlice`, e agora a orquestração de importação também não deveria burlar a fronteira entre eles).

---

## D4 — `VendedorNome` ausente na importação (achado de contrato, AD-095)

**Decision**: Ver AD-095 em `.specs/project/STATE.md`. Resumo: `ListaDAVs`/`GetDav` só devolvem `VendedorCodigo`. O Checkout exibe "Vendedor #<código>" até o operador reabrir o modal de vendedor e resolver o nome manualmente. `ClienteNome`, ao contrário, é capturado da própria linha da lista (`ListaDAVs`) no momento da seleção, antes de `GetDav` ser chamado — nunca fica sem nome.
**Rationale/Alternatives**: Ver AD-095 — resolver por busca de texto usando o código foi descartado por risco de correspondência errada.

---

## D5 — Descrição de produto ausente em `CheckoutFaturarNFCe.produtos` (achado de contrato, AD-096)

**Decision**: Ver AD-096 em `.specs/project/STATE.md`. Resumo: lote de `GetProduto` em paralelo, um por `codigoProduto` distinto do documento, só para `Descricao`/conferência de `UDM` — nunca sobrescreve `precoUnitario`/`quantidade`/`DescontoValor`, que ficam congelados exatamente como vieram do DAV. Falha isolada de uma dessas chamadas não bloqueia a importação — a linha entra com `codigoProduto` no lugar da descrição.
**Rationale/Alternatives**: Ver AD-096 — exibir só o código, sem nenhuma chamada extra, foi descartado por UX inaceitável para revisão do carrinho antes de finalizar (`FR-002`/`SC-001`).

---

## D6 — Formas de pagamento importadas: cópia direta, sem reclassificação

**Decision**: Cada item de `FormasDePagamento[]` (`FormaCodigo`, `FormaMeioPagtoNFe`, `FormaValor`, campos de TEF/PIX/ticket) é copiado para o estado de pagamento da venda (feature 008, `pagamento-geral`) exatamente como veio — sem reclassificar como "novo pagamento a processar". O valor já está confirmado no documento original; não há reprocessamento de TEF/PIX na importação.
**Rationale**: A spec (`.specs/features/importacao-dav/spec.md`, DAV-02, AC1) exige que "os itens e formas de pagamento já venham preenchidos, para só revisar e finalizar" — reprocessar TEF/PIX importado geraria uma cobrança duplicada, inaceitável para um documento já pago/registrado no ERP.
**Alternatives considered**: Marcar formas de pagamento importadas como "pendentes de confirmação" — descartado, não há requisito ou UI desenhada para essa etapa intermediária; a spec não define nenhum tratamento especial pós-importação (FR-008).

---

## D7 — Erro de importação (DAV já faturado por outro operador)

**Decision**: Sem lock no Checkout (AD-052) — se `GetDav` ou o subsequente `FaturarNFCe` devolver erro (ex.: DAV já processado), o Checkout exibe o erro via Goey Toast e mantém a janela de importação aberta, sem popular o carrinho com dado parcial.
**Rationale**: Consistente com a decisão do usuário de que a resolução de conflito é 100% do ERP — o Checkout só precisa tratar o erro que a resposta trouxer, não implementar detecção própria.
**Alternatives considered**: Polling/verificação prévia de disponibilidade do DAV antes de importar — descartado, adicionaria uma chamada de rede sem necessidade real, já que o próprio endpoint de importação já valida isso no momento da chamada.

---

## D8 — O DAV de origem não é informado ao ERP; `NumeroNota` é o único elo (AD-107, 2026-08-31)

**Decision**: `mapearVendaExistente`/`VendaImportada` **não** modelam o número do DAV para envio ao ERP, e `FaturarNFCe` não carrega nenhum campo de DAV. O `numeroDav` selecionado na lista continua em memória apenas para a UI e para o evento de auditoria `DAV_IMPORTADO` (trilha local, feature 001). Em contrapartida, `NumeroNota` passa a ser tratado como **elo obrigatório**: reenviado intacto em `FaturarNFCe` e sua ausência no payload validado é erro de contrato (lança), não dado opcional.
**Rationale**: O campo `DavNum` de `CheckoutFaturarNFCe`, presente até `20260826163735`, foi removido em `20260827192357`. O usuário confirmou (AD-107) que o ERP identifica sozinho que a NFCe faturada veio de um DAV — o vínculo é interno, criado pelo rascunho que `GetDav` já gera (AD-057/AD-058). O campo era redundante: o Checkout nunca precisou preenchê-lo. Nada no fluxo desta feature muda além de deixar de modelar o campo.
**Alternatives considered**: Continuar preservando `DavNum` "por segurança" — descartado, o campo não existe mais no schema e um Zod que o exigisse quebraria a validação de fronteira. Enviar o número do DAV em `Log` — descartado, `Log` é a trilha de auditoria do Checkout (AD-061), não canal de vínculo fiscal, e reintroduziria um acoplamento que o ERP não pede.

---

## Resumo dos achados de contrato desta fase

| Achado | AD | Severidade | Resolução |
|---|---|---|---|
| `ListaDAVs`/`GetDav` sem `VendedorNome` | AD-095 | Baixa (exibição) | Fallback por código |
| `CheckoutFaturarNFCe.produtos` sem `Descricao` | AD-096 | Baixa (exibição) | Lote `GetProduto` best-effort |
| `DavNum` removido de `CheckoutFaturarNFCe` (`20260827192357`) | AD-107 | Nenhuma (campo era redundante) | Campo não modelado; `NumeroNota` vira o único elo (D8) |

Nenhum dos dois é pendência bloqueante — ambos resolvidos por decisão de design nesta própria fase, sem depender de mudança de contrato pela equipe do ERP.
