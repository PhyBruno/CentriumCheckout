# Implementation Plan: Seleção de Vendedor

**Branch**: `012-selecao-vendedor` | **Date**: 2026-08-27 | **Spec**: `specs/012-selecao-vendedor/spec.md`

**Input**: Feature specification from `specs/012-selecao-vendedor/spec.md`, complementada pela especificação de domínio mais detalhada em `.specs/features/selecao-vendedor/spec.md` (contratos de API, campos de `GetListaVendedores`/`FaturarNFCe`), pelo contrato real `Fluxograma - Diagrama - Alinhamentos/ApiCentriumOAuth.yaml` e pelas decisões arquiteturais já registradas em `.specs/project/STATE.md` (AD-019, AD-023, AD-024, AD-032, AD-043, AD-053, AD-056, AD-061, AD-095, AD-103).

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Um slice `vendedor`, combinado no mesmo `vendaStore` Zustand+Immer da venda em andamento (criado pela feature 001, sem `persist` — AD-006), guarda o vendedor atual da venda como um snapshot `{ codigo, nome, origem }`. Ao iniciar uma nova NFCe, o slice é pré-populado com `SessaoUsuario.VendedorCodigo`/`VendedorNome` do bootstrap (AD-032) — sem interação do operador e, ao contrário do cliente default (AD-094), **sem** nenhum campo indisponível, porque os dois campos que a venda precisa já vêm completos de `GetSessao`. A busca usa um único endpoint (`GET /ApiCentriumOAuth/GetListaVendedores`) e a seleção de uma linha da lista é definitiva — não existe endpoint singular de vendedor, então, ao contrário de cliente/produto, não há uma segunda chamada de resolução. Um achado de contrato desta fase (`AD-103`) remove o filtro "Ativo" do design, mesma lacuna já corrigida para cliente em AD-093: `GetListaVendedores` não expõe status. Trocar o vendedor com o carrinho já populado é permitido e não dispara reprecificação (diferente de cliente/`TipoPreco=9`) — fica bloqueado assim que há pagamento aprovado, reaproveitando o mesmo predicado `podeMutarCarrinho()` que carrinho (003) e cliente (005) já usam. Dois eventos de auditoria (`VENDEDOR_SELECIONADO`, `VENDEDOR_TROCADO`, shapes já fixados por `specs/001-auditoria-acoes-operador/data-model.md`) são disparados via o dispatcher da feature 001, nunca pela pré-seleção automática do default nem pela sobrescrita programática que a retomada de rascunho (004/011) e a importação de DAV (006) já reservam via `trocarVendedor({ codigo, nome: null })`.

## Technical Context

**Language/Version**: TypeScript `strict`, React 19 + Vite — feature inteiramente client-side. O BFF (feature 002) participa apenas como proxy autenticado em `/api/erp/*`; nenhuma rota nova de servidor é introduzida por esta feature.

**Primary Dependencies**: Zustand + Immer (slice `vendedor` combinado no `vendaStore`, sem `persist`); TanStack Query (busca de vendedor, `staleTime: 0` — mesmo padrão de busca-como-digita da feature 005); Zod (validação de fronteira de `CheckoutListaVendedores`); shadcn/ui + Boneyard (modal de busca com skeleton, mesmo padrão de `ModalBuscaCliente` da feature 005) + Goey Toast (aviso de bloqueio pós-pagamento). Nenhuma dependência nova além das já fixadas pelo `STACK.md`.

**Storage**: N/A para estado de venda — o vendedor atual vive só em memória (Constitution VI, AD-006), descartado ao finalizar/suspender e não sobrevive a F5. `SessaoUsuario.VendedorCodigo`/`VendedorNome` são **lidos** do bootstrap já persistido em Dexie pela feature 002 — esta feature não grava nada em Dexie.

**Testing**: Vitest + Testing Library para o slice: pré-seleção do default sem evento de auditoria (`inicializarVendedorPadrao`), transição `VENDEDOR_SELECIONADO` → `VENDEDOR_TROCADO` (primeira seleção explícita vs. troca subsequente), `trocarVendedor` sempre sem auditoria e aceitando `nome: null`, bloqueio de `selecionarVendedor`/`trocarVendedor` quando `podeMutarCarrinho()` é `false`. Nenhum módulo de domínio puro nesta feature (ao contrário de precificação/documento) — não há função isolada a testar fora do slice, já que a lógica é toda de orquestração de estado sem cálculo. Playwright (E2E) para o fluxo dourado: venda nasce com vendedor default → buscar por nome parcial → selecionar candidato diferente → finalizar e confirmar `vendedorCodigo` correto no payload → trocar vendedor com carrinho populado → bloqueio pós-pagamento.

**Target Platform**: Navegador (Chrome prioritário), desktop e mobile pelo mesmo estado de venda (`.specs/features/layout-responsivo-mobile/spec.md`) — gatilho de abertura do modal é `Campo Vendedor mobile` no wizard mobile, mesmo conteúdo de modal em ambas as plataformas.

**Performance Goals**: Busca por termo livre é debounced e só dispara a partir de `SessaoUsuario.QtdMinCharParaConsulta` (mesmo piso já usado pelas buscas de produto e cliente, nunca hardcodado — AD-024). Sem custo adicional de rede na seleção (D1 de `research.md`) — ao contrário de cliente, que sempre paga uma segunda chamada (`GetCliente`) por seleção.

**Constraints**:
- Filtro "Ativo" **não** implementado — `GetListaVendedores` não tem parâmetro de status nem campo `Ativo`/`Status` na resposta (`AD-103`, mesma lacuna de AD-093 para cliente).
- Coluna "subtítulo de função" do design ilustrativo (ex.: "Vendedora responsável") **não** implementada — não existe campo de função/cargo no contrato (`AD-103`).
- Vendedor da venda nunca é inferido do `UsuarioCodigo` (operador logado) — confirmado como campo genuinamente distinto no schema (`AD-056`, Fato F1) — os dois campos permanecem sempre editáveis independentemente um do outro.
- Troca de vendedor com carrinho populado **não** dispara reprecificação — diferente da troca de cliente (`TipoPreco=9`), preço de venda não depende de vendedor em nenhum `TipoPreco` documentado (AD-059/AD-060).
- Vendedor sem nome (`nome: null`) só ocorre para as origens `RASCUNHO`/`DAV` (retomada de rascunho via `CarregarNFCe`, importação de DAV) — nunca para `DEFAULT`/`BUSCA`, onde o nome sempre está disponível.
- Troca de vendedor bloqueada a partir de qualquer pagamento aprovado — reaproveita o predicado `podeMutarCarrinho()` já definido pela feature 003 (D8), sem `vendedorSlice` importar o slice de pagamento/carrinho/cliente.

**Scale/Scope**: 1 slice Zustand (`vendedorSlice`) + 1 camada de query (`vendedorQueries.ts`: busca paginada) + 1 schema Zod de fronteira + 1 superfície de UI (modal de busca, sem formulário de cadastro — vendedor não é cadastrado pelo Checkout, `FR-015`). Menor escopo que a feature 005 (cliente): sem domínio puro, sem endpoint singular de resolução, sem formulário. Fora do escopo deste plano: o call site que invoca `trocarVendedor` a partir de `CarregarNFCe` (feature 004/011, ainda não desenhada) e a implementação do slice de auditoria (feature 001 — este plano só consome o dispatcher).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Avaliação (pré-Phase 0) | Re-avaliação (pós-Phase 1) |
|---|---|---|
| I. Spec-Driven Development | ✅ Este plano é resultado de `/speckit-plan` sobre `specs/012-selecao-vendedor/spec.md`, seguindo a sequência obrigatória. | ✅ Mantido — nenhum artefato de design introduziu requisito não rastreável a um `FR-xxx`/`VEND-xx`; uma correção de escopo (filtro Ativo + coluna de função, AD-103) foi registrada em `.specs/` antes de qualquer artefato de código, sem pendência bloqueante remanescente. |
| II. Arquitetura SOLID | ✅ Planejado com separação estrita: slice (orquestração de estado + auditoria) ↔ query (rede) ↔ UI — sem módulo de domínio puro, porque não há lógica computável isolada nesta feature. | ✅ Confirmado em `contracts/vendedor-domain-api.md`: o bloqueio pós-pagamento entra pelo mesmo predicado injetado (Dependency Inversion) que as features 003/005 já definiram; `vendedorSlice` nunca importa `carrinhoSlice`/`clienteSlice`/`pagamentoSlice`. Nenhuma duplicação de lógica. |
| III. ERP como Fonte Única de Verdade | ✅ O Checkout não reimplementa nenhuma regra de negócio de vendedor — a listagem, os dados default e os dados de rascunho/DAV vêm sempre do ERP; o Checkout só copia o resultado para dentro do estado da venda. | ✅ Confirmado — o achado de contrato desta fase (AD-103) foi tratado sem o Checkout inventar dado que o ERP não fornece (filtro de status, campo de função): removido do design, nunca simulado. |
| IV. Tipagem Estrita e Validação de Fronteira | ✅ Zod obrigatório na resposta de `GetListaVendedores`. | ✅ Confirmado em `contracts/erp-vendedor-api.md`: o schema Zod cobre `CheckoutListaVendedores`/`VendedoresItem` tal como o contrato real define — sem campo inventado (ex.: sem `Ativo`, sem `funcao`, que não existem). |
| V. Precisão Monetária Inegociável | ✅ N/A — esta feature não introduz nem consome nenhum valor monetário; vendedor não participa do cálculo de preço em nenhum `TipoPreco` (AD-059/AD-060). | ✅ Confirmado — nenhuma aritmética monetária é tocada por este plano. |
| VI. Sem Estado de Venda Persistido no Cliente | ✅ Slice sem `persist`, mesmo ciclo de vida do carrinho, cliente e auditoria. | ✅ Confirmado — nenhum artefato de design introduz gravação em Dexie/localStorage; o vendedor default é **lido** do bootstrap já persistido pela feature 002, nunca escrito por esta feature. |

Nenhuma violação identificada em nenhuma das duas avaliações. Nenhuma entrada necessária em "Complexity Tracking".

## Project Structure

### Documentation (this feature)

```text
specs/012-selecao-vendedor/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   ├── erp-vendedor-api.md      # consumo de GetListaVendedores via /api/erp/*
│   └── vendedor-domain-api.md   # superfície pública do slice + integração com carrinho (003/008), auditoria (001), DAV (006) e rascunho (004/011)
├── checklists/
│   └── requirements.md  # gerado por /speckit-specify
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── client/
│   ├── stores/
│   │   ├── vendaStore.ts                   # store combinado (criado pela feature 001) — passa a combinar o slice abaixo
│   │   └── slices/
│   │       └── vendedorSlice.ts            # vendedorAtual + selecionarVendedor/trocarVendedor + inicializarVendedorPadrao + auditoria
│   ├── services/
│   │   └── vendedor/
│   │       └── vendedorQueries.ts          # useBuscaVendedores (GetListaVendedores)
│   └── features/
│       └── vendedor/
│           ├── ModalBuscaVendedor.tsx       # busca por nome (Boneyard skeleton), VEND-01/VEND-02, sem filtro de status (AD-103)
│           └── CampoVendedorVenda.tsx       # exibe o vendedor atual da venda, "Vendedor #<codigo>" quando nome é null (AD-095/D4), sem indicador de origem (AD-053)
└── shared/
    └── schemas/
        └── vendedor.schema.ts               # Zod: CheckoutListaVendedores / VendedoresItem

tests/
├── integration/
│   └── vendedorSlice.spec.ts                # VENDEDOR_SELECIONADO vs. VENDEDOR_TROCADO, pré-seleção sem evento, trocarVendedor sem evento/com nome null, bloqueio pós-pagamento
└── e2e/
    └── selecao-vendedor.spec.ts             # fluxo dourado: default → busca → seleção → finalização com vendedorCodigo correto → troca com carrinho populado → bloqueio pós-pagamento
```

**Structure Decision**: Esta é a sexta feature a estender a árvore proposta pela feature 002 (`src/client/`, `src/server/`, `src/shared/`) e mantém dois dos três padrões já estabelecidos: (a) slices sob `src/client/stores/slices/`, combinados no `vendaStore.ts` que a feature 001 criou — este plano adiciona `vendedorSlice.ts` à mesma combinação que já inclui `auditoriaSlice` (001), `carrinhoSlice` (003) e `clienteSlice` (005); (b) camada de serviço (`services/<assunto>/`) isolando chamadas de rede da UI, mesmo padrão de `services/produto/` (003) e `services/cliente/` (005). **Não** adiciona um módulo de domínio puro (`domain/<assunto>/`) — diferente de precificação (003) e documento (005), não há função pura isolável nesta feature, porque a seleção de vendedor não envolve cálculo nem classificação, só orquestração de estado. Esta feature **não** adiciona nada a `src/server/` — consome o proxy `/api/erp/*` já definido pela feature 002. A integração com carrinho/pagamento (003/008) acontece só pela injeção de `podeMutarCarrinho()` — `vendedorSlice` nunca importa `carrinhoSlice`/`clienteSlice`/`pagamentoSlice`, preservando o Constitution Check II. A integração com DAV (006) e rascunho (004/011) acontece só pela action pública `trocarVendedor`, já reservada pela feature 006 antes desta fase Design.

## Complexity Tracking

> Nenhuma violação de Constitution Check identificada nesta fase — seção não preenchida.
