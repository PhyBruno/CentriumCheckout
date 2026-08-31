# Implementation Plan: Importação e Faturamento de DAV

**Branch**: `006-importacao-dav` | **Date**: 2026-08-26 | **Spec**: `specs/006-importacao-dav/spec.md`

**Input**: Feature specification from `specs/006-importacao-dav/spec.md`, complementada pela especificação de domínio mais detalhada em `.specs/features/importacao-dav/spec.md` (contratos de API, shape de `GetDav`) e pela mecânica de importação já descrita em `.specs/features/recuperacao-nfce/spec.md` (mesmo shape, mesma congelação de preço), pelo contrato real `Fluxograma - Diagrama - Alinhamentos/APICentriumOAuth.yaml` e pelas decisões arquiteturais já registradas em `.specs/project/STATE.md` (AD-023, AD-024, AD-032, AD-035, AD-046, AD-052, AD-055, AD-057, AD-058, AD-061, AD-067, AD-077, AD-087, AD-091, AD-095, AD-096, AD-107).

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Uma janela de importação (desktop-only, AD-046) lista DAVs prontos para faturamento via `GetListaDAVs`/`ListaDAVs` (busca livre + período de emissão real, `Datainicial`/`Datafinal`, AD-077/AD-087) e, ao selecionar um, chama `GET /GetDav` — que devolve **o mesmo shape** de `CarregarNFCe`/`FaturarNFCe` (`CheckoutFaturarNFCe`, AD-057), porque o ERP já gera automaticamente um rascunho de NFCe vinculado ao DAV. Este plano introduz um mecanismo de domínio **compartilhado** — `mapearVendaExistente(CheckoutFaturarNFCe) → VendaImportada` — que traduz esse shape em: linhas de carrinho **congeladas** (`origem: 'DAV'`, `precoCongelado: true`, reaproveitando o tipo já previsto em `specs/003-carrinho-produto-precificacao/data-model.md`), cliente e vendedor **sempre sobrescritos** (FR-007, nunca preservando o default anterior), formas de pagamento já registradas, e `NumeroNota` preservado para reenvio em `FaturarNFCe` — **`NumeroNota` é o único elo com o DAV de origem** desde que `DavNum` saiu do contrato (AD-107): é pelo rascunho identificado por esse número que o ERP reconhece, ao faturar, que a NFCe nasceu de um DAV. Este mesmo mecanismo será reaproveitado, sem alteração, pela feature 011 (recuperação de rascunho de NFCe) quando sua fase Design ocorrer — só troca a chamada de rede (`GetDav` → `CarregarNFCe`), a nota já deixada em `.specs/features/recuperacao-nfce/spec.md` confirma essa intenção. Dois achados de contrato desta fase (AD-095, AD-096) resolvem lacunas de exibição sem afetar preço/corretude fiscal: `ListaDAVs`/`GetDav` não trazem `VendedorNome` (exibido só por código até o operador reabrir o modal de vendedor) e `CheckoutFaturarNFCe.produtos` não traz descrição de produto (resolvida por busca best-effort em paralelo via `GetProduto`, só para exibição, nunca sobrescrevendo o preço congelado). Depois de importada, a venda segue exatamente o mesmo fluxo de carrinho/pagamento/finalização de uma venda manual (FR-008) — nenhuma etapa especial de "marcar como importado": o próprio `FaturarNFCe` fecha o DAV internamente no ERP (AD-058).

## Technical Context

**Language/Version**: TypeScript `strict`, React 19 + Vite — feature inteiramente client-side. O BFF (feature 002) participa apenas como proxy autenticado em `/api/erp/*`; nenhuma rota nova de servidor é introduzida por esta feature.

**Primary Dependencies**: TanStack Query (`ListaDAVs` paginado, `GetDav` sob demanda, lote de `GetProduto` para descrição — AD-096); Zustand + Immer (nenhum slice novo — orquestra os slices já existentes de carrinho (003), cliente (005) e vendedor (012) através das ações públicas que cada um já expõe, mais uma extensão pontual do `CarrinhoSlice` — ver `contracts/importacao-domain-api.md`); Zod (validação de fronteira de `CheckoutListaDAVs`/`CheckoutFaturarNFCe`, reaproveitando o mesmo schema Zod que a feature 011 também vai consumir); shadcn/ui + Boneyard (tabela de DAVs paginada com skeleton, mesmo padrão do Modal cliente/vendedor) + Goey Toast (erro de importação, ex.: DAV já faturado por outro operador — AD-052, sem lock, o ERP só rejeita). Nenhuma lib nova.

**Storage**: N/A — o resultado da importação vive só em memória, dentro dos slices já existentes (Constitution VI, AD-006). Nada é gravado em Dexie/localStorage por esta feature.

**Testing**: Vitest + Testing Library. Unitário puro (sem React) para `mapearVendaExistente`: `CheckoutFaturarNFCe` sintético → `LinhaCarrinho[]` congeladas + `ClienteVenda`/`VendedorVenda` sobrescritos + `NumeroNota` preservado (sem `DavNum` — AD-107); casos de borda (documento sem forma de pagamento, produto com `GetProduto` de descrição falhando). Integração para a orquestração de importação: substituição de cliente/vendedor mesmo com default já selecionado (FR-007), ausência de evento de auditoria de reprecificação para as linhas congeladas, emissão de `DAV_IMPORTADO` (auditoria). Playwright (E2E) para o fluxo dourado: abrir janela → buscar → filtrar por período → selecionar DAV → confirmar carrinho populado → finalizar como uma venda normal.

**Target Platform**: Desktop apenas (AD-046) — mesma decisão já tomada para o modal de recuperação de NFCe (011); sem equivalente no wizard mobile.

**Performance Goals**: Busca por termo livre segue o mesmo piso `SessaoUsuario.QtdMinCharParaConsulta` (AD-024) já usado pelos demais modais de busca. Importação de um DAV com N SKUs distintos dispara até N chamadas paralelas a `GetProduto` (AD-096) — mesma ordem de grandeza (dezenas) já aceita pela feature 005 na troca de cliente.

**Constraints**:
- Preço de cada item importado é **congelado** — nunca passa por `repricarSku` (`specs/003-carrinho-produto-precificacao/contracts/precificacao-domain-api.md`), mesmo quando outra linha do mesmo SKU dispara reprecificação por outro motivo (AD-067).
- Cliente e vendedor da venda são **sempre** sobrescritos pelos dados do DAV, mesmo que já houvesse um default pré-selecionado (FR-007, AD-055) — nunca um merge/preservação parcial.
- Sem lock otimista/pessimista entre operadores no mesmo DAV — resolução de conflito é 100% responsabilidade do ERP (AD-052); a única defesa do Checkout é tratar o erro que `GetDav`/`FaturarNFCe` devolver se o DAV já tiver sido faturado por outro operador.
- Ação de reimpressão por linha, presente no design do Pencil, **não é implementada** (AD-035) — removida na fase de UI.
- Sem mecanismo próprio de "marcar DAV como importado" e sem informar o DAV ao ERP (AD-107) — o vínculo é interno ao ERP a partir do rascunho gerado por `GetDav`; `FaturarNFCe` fecha o DAV sozinho (AD-058).
- `VendedorNome` não disponível na importação (AD-095) — exibição só por código até reseleção manual. `Descricao` de produto resolvida best-effort via `GetProduto` em paralelo, nunca bloqueante para a importação em si (AD-096).

**Scale/Scope**: 1 módulo de domínio puro (`mapearVendaExistente.ts`) + 1 camada de query (`davQueries.ts`: `useListaDavs`, `fetchDav`) + 1 ação de orquestração (`importarVendaExistente`, cross-slice) + 1 extensão pontual do `CarrinhoSlice` (`importarLinhasCongeladas`, reaproveitável pela feature 011) + 1 schema Zod de fronteira + 1 superfície de UI (Modal DAV: tabela paginada + filtros de busca/data). Fora do escopo: o motor de precificação em si (003 — aqui só se evita chamá-lo), a UI de seleção de cliente/vendedor (005/012 — aqui só se chamam as ações públicas de sobrescrita que esses slices já expõem), e a implementação da feature 011 (que reaproveita o mecanismo criado aqui, mas não é implementada por este plano).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Avaliação (pré-Phase 0) | Re-avaliação (pós-Phase 1) |
|---|---|---|
| I. Spec-Driven Development | ✅ Plano resultado de `/speckit-plan` sobre `specs/006-importacao-dav/spec.md`, seguindo a sequência obrigatória. | ✅ Mantido — os dois achados de contrato (AD-095, AD-096) foram registrados em `.specs/` antes de qualquer artefato de código, e a correção em `selecao-vendedor/spec.md` foi feita no ponto, não anexada ao final. |
| II. Arquitetura SOLID | ✅ Domínio puro (`mapearVendaExistente`) ↔ orquestração cross-slice ↔ query, mesma separação das features 003/005. | ✅ Confirmado em `contracts/importacao-domain-api.md`: `mapearVendaExistente` é 100% pura (sem rede/Zustand), reaproveitada tal e qual pela futura feature 011 — Open/Closed satisfeito por extensão (`importarLinhasCongeladas` novo no `CarrinhoSlice`), não por modificação das actions existentes (`inserirItem`/`editarItem`/`cancelarItem` continuam intocadas). |
| III. ERP como Fonte Única de Verdade | ✅ Nenhuma regra de negócio de faturamento de DAV é reimplementada — o Checkout só traduz o shape que o ERP já resolveu. | ✅ Confirmado — os dois achados (AD-095, AD-096) foram tratados sem inventar dado que o ERP não fornece: nome de vendedor fica ausente (fallback por código) em vez de suposto, descrição de produto é resolvida por uma chamada real (`GetProduto`), nunca inferida. |
| IV. Tipagem Estrita e Validação de Fronteira | ✅ Zod obrigatório em `CheckoutListaDAVs`/`CheckoutFaturarNFCe`. | ✅ Confirmado em `contracts/erp-dav-api.md`: schema cobre exatamente os campos reais do yaml, sem campo inventado (ex.: sem `VendedorNome` em `DAV_DAV`, corrigindo a suposição antiga de `selecao-vendedor/spec.md`). |
| V. Precisão Monetária Inegociável | ✅ Nenhuma aritmética monetária nova — valores de `produtos[]`/`FormasDePagamento[]` são copiados como centavos inteiros na fronteira (mesmo `.transform()` Zod de `specs/003-carrinho-produto-precificacao/data-model.md`), sem recálculo. | ✅ Confirmado — `mapearVendaExistente` não soma, não desconta, não arredonda: só copia `precoUnitario`/`quantidade`/`DescontoValor` já resolvidos pelo ERP para dentro de `LinhaCarrinho.precoCongelado = true`. |
| VI. Sem Estado de Venda Persistido no Cliente | ✅ Nenhum estado novo em Dexie/localStorage; a venda importada vive só em memória, como qualquer outra. | ✅ Confirmado — nenhum artefato de design introduz persistência além do já existente. |

Nenhuma violação identificada em nenhuma das duas avaliações. Nenhuma entrada necessária em "Complexity Tracking".

## Project Structure

### Documentation (this feature)

```text
specs/006-importacao-dav/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   ├── erp-dav-api.md          # consumo de ListaDAVs/GetDav via /api/erp/*
│   └── importacao-domain-api.md # mapearVendaExistente + extensão do CarrinhoSlice + integração com cliente (005) e vendedor (012)
├── checklists/
│   └── requirements.md  # gerado por /speckit-specify
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── client/
│   ├── domain/
│   │   └── importacaoVenda/
│   │       └── mapearVendaExistente.ts     # CheckoutFaturarNFCe → { linhas, cliente, vendedor, formasDePagamento, numeroNota } — puro, sem React/Zustand/Query; reaproveitado pela feature 011
│   ├── stores/
│   │   └── slices/
│   │       └── carrinhoSlice.ts            # extensão pontual: importarLinhasCongeladas(linhas) — nova action, não altera as existentes (003)
│   ├── services/
│   │   └── dav/
│   │       └── davQueries.ts               # useListaDavs (ListaDAVs, paginado), fetchDav (GetDav), importarVendaExistente (orquestração: chama fetchDav, mapeia, sobrescreve cliente/vendedor, importa linhas, dispara lote de GetProduto para descrição)
│   └── features/
│       └── dav/
│           └── ModalImportacaoDav.tsx      # tabela paginada (Boneyard skeleton), busca livre + período de emissão, DAV-01..DAV-04, desktop-only (AD-046)
└── shared/
    └── schemas/
        └── dav.schema.ts                    # Zod: CheckoutListaDAVs, CheckoutFaturarNFCe (reaproveitado pela feature 011)

tests/
├── unit/
│   └── domain/
│       └── importacaoVenda/
│           └── mapearVendaExistente.spec.ts # shape sintético → linhas congeladas, cliente/vendedor sobrescritos, NumeroNota preservado, formas de pagamento sem forma nenhuma
├── integration/
│   └── importacaoDav.spec.ts                # sobrescrita de cliente/vendedor com default já selecionado, sem evento de reprecificação, DAV_IMPORTADO emitido, falha isolada de GetProduto não bloqueia importação
└── e2e/
    └── importacao-dav.spec.ts               # fluxo dourado: abrir janela → buscar → filtrar por data → importar → carrinho populado → finalizar como venda normal
```

**Structure Decision**: Sexta feature a estender a árvore proposta pela feature 002, seguindo os três padrões já estabelecidos (domínio puro / slice orquestrador / camada de serviço). Diferente das features 003/005, esta não introduz um slice Zustand novo — a orquestração de importação vive na camada de serviço (`davQueries.ts`, `importarVendaExistente`), que chama as actions públicas já existentes dos slices de cliente (005) e vendedor (012), mais uma única action nova no `CarrinhoSlice` (`importarLinhasCongeladas`) — extensão aditiva, não modificação das actions existentes, preservando Open/Closed (Constitution II). `mapearVendaExistente.ts` fica em `domain/importacaoVenda/`, não em `domain/precificacao/` (003), porque não é lógica de precificação — é tradução de shape de API para o modelo de carrinho, reaproveitável por qualquer origem futura que devolva o mesmo `CheckoutFaturarNFCe` (hoje: DAV; amanhã: rascunho de NFCe, feature 011). Esta feature não adiciona nada a `src/server/`.

## Complexity Tracking

> Nenhuma violação de Constitution Check identificada nesta fase — seção não preenchida.
