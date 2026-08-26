# Implementation Plan: Carrinho, Busca/Inserção de Produto e Motor de Precificação

**Branch**: `docs/plan-carrinho-produto-precificacao` | **Date**: 2026-08-26 | **Spec**: `specs/003-carrinho-produto-precificacao/spec.md`

**Input**: Feature specification from `specs/003-carrinho-produto-precificacao/spec.md`, complementada pela especificação de domínio mais detalhada em `.specs/features/carrinho-produto-precificacao/spec.md` (contratos de API, semântica de `TipoPreco`, máscara do código de barras de balança), pelo contrato real `Fluxograma - Diagrama - Alinhamentos/APICentriumOAuth.yaml` e pelas decisões arquiteturais já registradas em `.specs/project/STATE.md` (AD-023, AD-024, AD-027, AD-028, AD-029, AD-030, AD-031, AD-033, AD-039, AD-041, AD-043, AD-059, AD-060, AD-061, AD-062, AD-063, AD-065, AD-067, AD-070, AD-071, AD-072, AD-076, AD-091, AD-092).

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

O carrinho é um slice `carrinho` combinado no mesmo store Zustand+Immer da venda em andamento (sem `persist`, AD-006), que guarda um array de linhas — cada linha carregando uma **cópia congelada dos dados de preço do produto** feita no momento da inserção (regra de fronteira de `.specs/codebase/ARCHITECTURE.md`), nunca uma referência viva ao cache do TanStack Query. Toda a matemática de preço vive numa **camada de domínio pura** (`src/client/domain/precificacao/`), sem dependência de React/Zustand/Query, operando exclusivamente em **centavos inteiros** e **milésimos de unidade** (Constitution V, AD-071/AD-072) — o slice apenas orquestra: aplica a mutação, chama `repricarSku(...)` sobre as linhas ativas não-congeladas daquele SKU e registra o evento de auditoria correspondente (contrato da feature 001).

A resolução do produto passa **sempre** por `GET /api/erp/GetProduto`: o modal de busca (`GetListaProdutos`) é apenas um seletor de código, porque o schema de retorno da lista não traz `PrecoVenda` nem `ProdutoPesavelEditavel` e não aceita os parâmetros de precificação (`Tipopreco`/`Codcliente`/`Listapreco`) — confirmado por decisão direta do usuário em AD-091; ver `research.md`, decisão D1. A regra de preço é decidida por `SessaoUsuario.TipoPreco`: para todo valor de `1` a `11` exceto `8`, aplica-se o campo único `PrecoVenda` já resolvido pelo ERP (AD-059/AD-060); `8` é o único caso em que o Checkout calcula localmente, escolhendo entre `PrecoVenda1..PrecoVenda5` pela **quantidade agregada do SKU na venda inteira**, em modelo de limiar único (flat, não progressivo). Cancelar uma linha nunca a remove do array — marca `cancelada: true`, exclui do agregado e dos totais, e dispara a mesma cascata de reprecificação para baixo.

## Technical Context

**Language/Version**: TypeScript `strict`, React 19 + Vite — feature inteiramente client-side. O BFF (feature 002) participa apenas como proxy autenticado em `/api/erp/*`; nenhuma rota nova de servidor é introduzida por esta feature.

**Primary Dependencies**: Zustand + Immer (slice `carrinho` combinado no `vendaStore`, sem `persist`); TanStack Query (cache de produto por SKU, `staleTime: Infinity` durante a venda); Zod (validação de fronteira das respostas de `GetProduto`/`GetListaProdutos`); shadcn/ui + Boneyard (modal de busca com skeleton, AD-005/AD-007) + Goey Toast (avisos de bloqueio); react-hotkeys-hook (entrada rápida no desktop, desativada no mobile). **Nenhuma biblioteca de dinheiro** — aritmética em centavos inteiros escrita à mão (AD-071 descartou `dinero.js`).

**Storage**: N/A para estado de venda — carrinho e linhas vivem só em memória (Constitution VI, AD-006), descartados ao finalizar/suspender e não sobrevivem a F5. O cache de produto do TanStack Query é em memória, também descartado no fim da venda. Dexie não é usado por esta feature (só `SessaoUsuario.TipoPreco`/`QtdMinCharParaConsulta`/`UsuarioTipoCodigoProduto` são **lidos** do bootstrap já persistido pela feature 002).

**Testing**: Vitest + Testing Library como camada principal — a lógica de precificação é a cobertura prioritária declarada em `.specs/codebase/STACK.md`. Testes unitários puros (sem React) para: aritmética em centavos e distribuição de resto pelo maior resto (AD-072), resolução de faixa por quantidade agregada (`TipoPreco = 8`), cascata de reprecificação em cancelamento, parse do EAN-13 de balança (AD-076) e parse de `código*quantidade` (AD-029). Testes de integração do slice para as invariantes de estado (linha cancelada preservada, bloqueio pós-pagamento). Playwright (E2E) para o fluxo dourado: bipar → inserir → cruzar faixa → cancelar → totais corretos.

**Target Platform**: Navegador (Chrome prioritário), desktop e mobile pelo mesmo estado de venda (`.specs/features/layout-responsivo-mobile/spec.md`).

**Performance Goals**: Reprecificação é síncrona e local — opera sobre as linhas do próprio SKU (dezenas de linhas por venda, não milhares), custo desprezível. A meta real é de rede: reinserir um SKU já presente na venda **não pode** gerar nova chamada (`CART-03`), garantido por `staleTime: Infinity` + cópia dos dados na linha.

**Constraints**:
- Nenhuma operação monetária em ponto flutuante (Constitution V) — todo preço em `Centavos` (inteiro) e toda quantidade em `Milesimos` (inteiro), convertidos na fronteira Zod.
- A reprecificação nunca pode depender do cache do TanStack Query estar presente (`CART-05`, AC5) — os dados de preço são copiados para a linha na inserção.
- Linha congelada por origem de rascunho/DAV fica fora de `repricarSku` até reinserção/edição explícita (AD-067) — e, por decisão D3 de `research.md`, também fora da quantidade agregada.
- Edição e cancelamento bloqueados a partir de qualquer pagamento aprovado (`CART-09`, AD-030); bloqueio permanente para TEF/PIX, reversível para dinheiro/cartão manual.
- Cancelamento nunca exige supervisor ou reautenticação (`CART-12`/FR-012, AD-065).
- Nenhuma validação de saldo/estoque na inserção (`CART-10`, AD-030) — responsabilidade do ERP.
- Termo de busca abaixo de `SessaoUsuario.QtdMinCharParaConsulta` não dispara chamada; o valor vem do ERP já com piso aplicado, nunca hardcoded (AD-024).

**Scale/Scope**: 1 slice Zustand (`carrinhoSlice`) + 5 módulos de domínio puro (`dinheiro`, `quantidade`, `tabelaPreco`, `reprecificacao`, `codigoProduto`) + 1 camada de query (busca e produto) + 1 schema Zod de fronteira + 3 superfícies de UI (modal de busca, entrada rápida/grid desktop, lista mobile). Fora do escopo deste plano: as telas de pagamento (feature 008), a retomada de rascunho/DAV que **produz** linhas congeladas (features 011 e 006 — este plano só define como tratá-las), e a implementação do slice de auditoria (feature 001 — este plano só consome o dispatcher).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Avaliação (pré-Phase 0) | Re-avaliação (pós-Phase 1) |
|---|---|---|
| I. Spec-Driven Development | ✅ Este plano é resultado de `/speckit-plan` sobre `specs/003-carrinho-produto-precificacao/spec.md`, seguindo a sequência obrigatória. | ✅ Mantido — nenhum artefato de design introduziu requisito não rastreável a um `FR-xxx`/`CART-xx`. |
| II. Arquitetura SOLID | ✅ Planejado com separação estrita: domínio puro (cálculo) ↔ slice (orquestração de estado) ↔ query (rede) ↔ UI. | ✅ Confirmado em `contracts/precificacao-domain-api.md`: `repricarSku` é função pura sem conhecimento de pagamento, cliente ou rede; o bloqueio pós-pagamento entra por **predicado injetado** (Dependency Inversion), então o carrinho não importa o slice de pagamento. Novo `TipoPreco` só altera `tabelaPreco.ts` (Open/Closed). |
| III. ERP como Fonte Única de Verdade | ✅ O Checkout não reimplementa a seleção de regra de preço — para `TipoPreco ≠ 8` consome `PrecoVenda` já resolvido pelo ERP (AD-059). | ✅ Confirmado, com uma exceção **explicitamente delegada pelo ERP**: `TipoPreco = 8` exige cálculo local de faixa porque o agregado por SKU só existe no carrinho, que é estado do Checkout. Documentado em `research.md` D2 — não é duplicação de fonte de verdade, é a única regra que o ERP não tem como resolver por item isolado. |
| IV. Tipagem Estrita e Validação de Fronteira | ✅ Zod obrigatório nas respostas de `GetProduto`/`GetListaProdutos`. | ✅ Confirmado em `contracts/erp-produto-api.md`: o schema Zod converte `number/double` do ERP para `Centavos` inteiros **na fronteira**, de modo que nenhum `double` de preço entra no domínio. Tipos `Centavos`/`Milesimos` são branded types, impedindo mistura acidental com `number` cru. |
| V. Precisão Monetária Inegociável | ✅ Centavos inteiros, sem lib externa (AD-071); resto pelo método do maior resto (AD-072). | ✅ Confirmado em `data-model.md`: total de linha = `arredondar(precoCentavos × quantidadeMilesimos ÷ 1000)`; rateios usam `distribuirPorMaiorResto`. Toda regra de faixa é auditável (função pura testável isoladamente) e coberta por teste antes da conclusão, conforme exige o princípio. |
| VI. Sem Estado de Venda Persistido no Cliente | ✅ Slice sem `persist`, mesmo ciclo de vida do carrinho. | ✅ Confirmado — nenhum artefato de design introduz gravação em Dexie/localStorage. O cache de produto é em memória e descartado no fim da venda. |

Nenhuma violação identificada em nenhuma das duas avaliações. Nenhuma entrada necessária em "Complexity Tracking".

## Project Structure

### Documentation (this feature)

```text
specs/003-carrinho-produto-precificacao/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   ├── erp-produto-api.md            # consumo de GetListaProdutos/GetProduto via /api/erp/*
│   └── precificacao-domain-api.md    # superfície pública do domínio puro + slice
├── checklists/
│   └── requirements.md  # gerado por /speckit-specify
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── client/
│   ├── domain/
│   │   └── precificacao/                   # camada pura — sem React, Zustand, Query ou fetch
│   │       ├── dinheiro.ts                 # Centavos (branded), soma/multiplicação, distribuirPorMaiorResto (AD-072)
│   │       ├── quantidade.ts               # Milesimos (branded), conversão e formatação de quantidade fracionária
│   │       ├── tabelaPreco.ts              # resolvePrecoUnitario(TipoPreco, snapshot, qtdAgregada) → Centavos
│   │       ├── reprecificacao.ts           # repricarSku(linhas, sku, tipoPreco) → linhas (função pura, CART-04..07)
│   │       └── codigoProduto.ts            # parse de "codigo*quantidade" (AD-029) e do EAN-13 de balança (AD-076)
│   ├── stores/
│   │   ├── vendaStore.ts                   # store combinado (criado pela feature 001) — passa a combinar o slice abaixo
│   │   └── slices/
│   │       └── carrinhoSlice.ts            # linhas + inserir/editar/cancelar + orquestração de repricarSku + auditoria
│   ├── services/
│   │   └── produto/
│   │       ├── produtoQueries.ts           # useBuscaProdutos (GetListaProdutos) e fetchProduto (GetProduto), staleTime: Infinity
│   │       └── produtoMapper.ts            # SDTCheckout_GetProduto validado → SnapshotPrecoProduto (double → Centavos)
│   └── features/
│       └── carrinho/
│           ├── ModalBuscaProduto.tsx        # busca por termo livre (Boneyard skeleton), CART-01
│           ├── EntradaRapidaProduto.tsx     # campo de código/bipagem + TAB/Enter, CART-02
│           ├── GridItens.tsx                # grid desktop, linha cancelada riscada, CART-08
│           ├── ListaItensMobile.tsx         # mesma fonte de estado, layout mobile
│           └── EdicaoItemEditavel.tsx       # fluxo 'E' (não pesável editável): campos + botão "+", AD-027/AD-063
└── shared/
    └── schemas/
        └── produto.schema.ts                # Zod: SDTCheckout_GetProduto e CheckoutListaProdutos

tests/
├── unit/
│   └── domain/
│       └── precificacao/
│           ├── dinheiro.spec.ts             # centavos, maior resto (AD-072)
│           ├── tabelaPreco.spec.ts          # TipoPreco 1-11, faixas de 8, limiares de borda
│           ├── reprecificacao.spec.ts       # cascata em inserção/edição/cancelamento, linha congelada excluída
│           └── codigoProduto.spec.ts        # "codigo*qtd", EAN-13 de balança, DV inválido, PrecoVenda ausente
├── integration/
│   └── carrinhoSlice.spec.ts                # invariantes de estado: linha cancelada preservada, bloqueio pós-pagamento
└── e2e/
    └── carrinho-precificacao.spec.ts        # fluxo dourado: bipar → cruzar faixa → cancelar → totais
```

**Structure Decision**: Esta é a terceira feature a estender a árvore proposta pela feature 002 (`src/client/`, `src/server/`, `src/shared/`) e mantém as duas decisões já tomadas: (a) módulos de domínio puro sob `src/client/domain/<assunto>/`, mesmo padrão que a feature 001 usou para `domain/auditoria/` e que `.specs/codebase/ARCHITECTURE.md` já previa para o motor de precificação ("função pura, camada de domínio, sem dependência de React/Zustand/Query"); (b) slices sob `src/client/stores/slices/`, combinados no `vendaStore.ts` que a feature 001 criou. Esta feature **não** adiciona nada a `src/server/` — consome o proxy `/api/erp/*` já definido pela feature 002. A separação `domain/` ↔ `services/` ↔ `features/` é o que sustenta o Constitution Check II: a matemática de preço é testável sem montar componente nem store.

## Complexity Tracking

> Nenhuma violação de Constitution Check identificada nesta fase — seção não preenchida.
