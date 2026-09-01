# Implementation Plan: Recuperação de NFCe

**Branch**: `011-recuperacao-nfce` | **Date**: 2026-08-27 | **Spec**: `specs/011-recuperacao-nfce/spec.md`

**Input**: Feature specification from `specs/011-recuperacao-nfce/spec.md`, complementada pela especificação de domínio mais detalhada em `.specs/features/recuperacao-nfce/spec.md` (`NFCE-01..05`), pelo contrato real `Fluxograma - Diagrama - Alinhamentos/ApiCentriumOAuth.yaml`, pela documentação técnica do projeto (`.specs/codebase/ARCHITECTURE.md`, `STACK.md`, `INTEGRATIONS.md`) e pelas decisões arquiteturais em `.specs/project/STATE.md` (AD-024, AD-041, AD-046, AD-052, AD-057, AD-067).

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

A feature 011 implementa a retomada de um rascunho de NFCe (venda suspensa anteriormente): listar rascunhos via `GetListaNFCes` (busca só por nome de cliente/vendedor, filtros de status/janela de 30 dias hardcoded no servidor, `research.md` D1), carregar o rascunho selecionado via `CarregarNFCe` (mesmo shape de resposta de `FaturarNFCe`/`GetDAV`, D3) e hidratar de uma vez o `vendaStore`: carrinho com preço **congelado** (linhas `precoCongelado: true`, já modeladas por `carrinho-produto-precificacao`/AD-067), pagamentos já aprovados, cliente, vendedor e a identidade original da venda (`NumeroNota`, reaproveitando o slice `identidadeVenda` que a feature 004 já desenhou e deixou como dependência pendente). Nenhuma tela nova de negócio é criada além do modal de listagem/seleção já desenhado no Pencil — o "grosso" desta feature é a orquestração de hidratação sobre slices de outras quatro features já planejadas (001, 003, 004, 005, 008), não uma tela isolada.

O maior achado desta fase (`research.md` D5) foi que uma linha congelada só pode ter um **snapshot parcial** — `CarregarNFCe` nunca devolve faixas de preço nem a flag de pesável/editável (só `GetProduto` devolve), o que a decisão original AD-067 tinha resolvido no plano comportamental (excluir a linha de `repricarSku`) mas não no plano de tipo. Um achado (`research.md` D6) documenta uma extensão necessária, mas não aplicada por este plano, a um artefato já desenhado por outra feature: um quinto valor `'RASCUNHO'` em `OrigemCliente` (005). A pré-seleção de vendedor (`research.md` D7) **é** aplicada por este plano — 012 já reserva `trocarVendedor(..., 'RASCUNHO')` para este uso exato, correção 2026-09-01 da auditoria de lacunas.

## Technical Context

**Language/Version**: TypeScript `strict`, React 19 + Vite — feature inteiramente client-side. O BFF (feature 002) participa só como proxy autenticado em `/api/erp/GetListaNFCes`/`/api/erp/CarregarNFCe`/`/api/erp/GetCliente`; nenhuma rota nova de servidor.

**Primary Dependencies**: TanStack Query (`useListaRascunhos`, paginado/com busca — mesmo padrão de `GetListaClientes`/`GetListaVendedores`); Zod (validação de `GetListaNFCesOutput` e do schema Zod do shape completo `CheckoutFaturarNFCe` já planejado pela feature 006 — `dav.schema.ts`, não o schema menor de `FaturarNFCeOutput`/`NotaFiscal` da feature 004 —, reaproveitado sem alteração para `CarregarNFCeOutput`, D3 corrigido/AD-117); Zustand + Immer (`identidadeVenda`, `carrinho`, `pagamentos`, `cliente`, `auditoria` — todos slices **já existentes**, esta feature só escreve neles); shadcn/ui + Boneyard (modal, skeleton da listagem) + Goey Toast (erro de rascunho não encontrado). **Nenhum slice novo no Zustand** — diferente de 008/009, esta feature não introduz estado próprio além do estado efêmero de UI do modal (`data-model.md` §2).

**Storage**: N/A — nada desta feature sobrevive além da sessão de venda em memória (Constitution VI). A listagem de rascunhos não é cacheada com `staleTime` longo (reflete estado mutável de outros operadores).

**Testing**: Vitest + Testing Library. Unitários puros para `mapearItemParaLinhaCongelada`, `mapearFormaParaPagamentoAplicado`, `mapearRascunhoCarregado` (`contracts/recuperacao-domain-api.md`) — casos: item com preço divergente do catálogo, forma em dinheiro, forma TEF/PIX ecoada opaca. Integração para `retomarRascunho` (ordem de efeitos, `data-model.md` §6) e para `ModalRecuperacaoNFCe` (busca, paginação, seleção). Teste negativo explícito de que a hidratação não dispara `PRODUTO_INSERIDO`/`FORMA_PAGAMENTO_APLICADA` (`data-model.md` J6) nem chama `resolvePrecoUnitario`/`repricarSku` (J2). Playwright para o fluxo dourado de `quickstart.md`.

**Target Platform**: Navegador (Chrome prioritário), **desktop-only** (AD-046) — nenhuma ramificação de layout mobile, `ModalRecuperacaoNFCe` não é renderizado no wizard mobile.

**Performance Goals**: Nenhuma meta além de paginação responsiva (`Tamanhopagina` limitado a 50, `research.md` D2) — sem polling, sem operação recorrente.

**Constraints**:
- Nenhum recálculo de preço (`resolvePrecoUnitario`/`repricarSku`) roda durante a hidratação (`FR-007`/`NFCE-03`, `data-model.md` J2).
- Nenhum mecanismo de lock entre operadores é implementado, mesmo com dois operadores acessando o mesmo rascunho concorrentemente (`NFCE-05`, AD-052, `data-model.md` J7).
- Busca por número da nota não é suportada — limitação real do `DataProvider` do ERP, não bug (`research.md` D1).
- `Serienota` de `CarregarNFCe` é sempre `SessaoUsuario.CadSerieNFCe`, nunca um valor vindo da listagem (`research.md` D4).

**Scale/Scope**: 1 módulo de domínio puro (`mapearItemParaLinhaCongelada`, `mapearFormaParaPagamentoAplicado`, `mapearRascunhoCarregado`) + 1 camada de query (`useListaRascunhos`, `useCarregarRascunho`) + 1 orquestrador de efeito (`retomarRascunho`) + 1 superfície de UI (`ModalRecuperacaoNFCe`). Fora do escopo: a transição `CONGELADA → ATIVA` na reinserção (feature 003, D13), a extensão de `OrigemCliente` (feature 005, D6) e a reutilização deste mesmo mecanismo por `GetDAV` (feature 006, AD-057 — pasta `domain/recuperacao/` já nomeada pensando nesse reuso, mas a integração em si não é desta feature). A pré-seleção de vendedor em si (feature 012) **está** no escopo desta feature — 012 já reserva `trocarVendedor(..., 'RASCUNHO')` para 011 chamar (`research.md` D7).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Avaliação (pré-Phase 0) | Re-avaliação (pós-Phase 1) |
|---|---|---|
| I. Spec-Driven Development | ✅ Plano resultado de `/speckit-plan` sobre `specs/011-recuperacao-nfce/spec.md`, sequência obrigatória respeitada. | ✅ Mantido — todo artefato rastreia a um `FR-xxx`/`NFCE-0x`. Duas lacunas de tipo/enum reveladas nesta fase (D5/D6) foram documentadas como impacto declarado sobre artefatos de outras features, não resolvidas silenciosamente no código. |
| II. Arquitetura SOLID | ✅ Planejado com domínio puro (mapeadores) ↔ query (rede) ↔ orquestrador de efeito ↔ UI, sem o modal tocar `vendaStore` diretamente. | ✅ Confirmado em `contracts/recuperacao-domain-api.md`: os três mapeadores são funções puras sem import de React/Zustand/fetch; `retomarRascunho` é o único ponto que escreve nos slices, mantendo `ModalRecuperacaoNFCe` sem conhecimento de `vendaStore`. Reuso de tipos de 003/004/005/008 em vez de duplicá-los favorece Open/Closed — estender (D5/D6) em vez de recriar. |
| III. ERP como Fonte Única de Verdade | ✅ O Checkout nunca recalcula preço/pagamento de um rascunho — só espelha o que `CarregarNFCe` devolve. | ✅ Reforçado: `data-model.md` J2 é um invariante explícito (nenhuma chamada a `resolvePrecoUnitario`/`repricarSku`); `status = 'APROVADO'` em todo pagamento retomado reflete que o ERP já validou aquele pagamento na suspensão original, o Checkout não reavalia. |
| IV. Tipagem Estrita e Validação de Fronteira | ✅ Zod obrigatório na resposta de `GetListaNFCes`/`CarregarNFCe`. | ✅ Confirmado — `research.md` D3 evita duplicar schema reaproveitando o de `FaturarNFCeOutput`; D5 evita **inventar** valores para campos ausentes do snapshot (`null` explícito, nunca `0`/`''` fabricado); D8 evita inventar troco não devolvido pelo contrato. |
| V. Precisão Monetária Inegociável | ✅ Nenhum cálculo novo de dinheiro — preço e valor de pagamento são copiados tal como vêm do rascunho, em `Centavos` já estabelecido por 003. | ✅ Confirmado — `data-model.md` §4/§5 são mapeamentos 1:1 de campo, não fórmulas; `totalLinha` continua derivado (nunca armazenado), herdando o invariante I9 de 003. |
| VI. Sem Estado de Venda Persistido no Cliente | ✅ Toda a hidratação escreve em slices já `sem persist` do `vendaStore`; o estado do modal (`EstadoListaRascunhos`) é efêmero de componente. | ✅ Confirmado — nenhum artefato de design grava em Dexie/localStorage; a listagem de rascunhos não é cacheada além do TanStack Query padrão da sessão. |

Nenhuma violação identificada em nenhuma das duas avaliações. Nenhuma entrada necessária em "Complexity Tracking" — as duas extensões declaradas (D5/D6) são refinamentos de tipo em artefatos de outras features, não desvios de princípio desta feature.

## Project Structure

### Documentation (this feature)

```text
specs/011-recuperacao-nfce/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output — D1..D13
├── data-model.md        # Phase 1 output — RascunhoListado, RascunhoCarregado, mapeamentos, invariantes J1..J7
├── quickstart.md        # Phase 1 output — 6 cenários + fluxo dourado
├── contracts/            # Phase 1 output
│   ├── erp-recuperacao-api.md   # GetListaNFCes, CarregarNFCe
│   └── recuperacao-domain-api.md # domínio puro + query + orquestrador + UI
├── checklists/
│   └── requirements.md  # gerado por /speckit-specify
└── tasks.md              # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── client/
│   ├── domain/
│   │   └── recuperacao/                          # nome pensado para reuso pela feature 006/DAV (AD-057)
│   │       ├── mapearItemParaLinhaCongelada.ts   # data-model.md §4
│   │       ├── mapearFormaParaPagamentoAplicado.ts # data-model.md §5, research.md D8
│   │       └── mapearRascunhoCarregado.ts        # orquestra os dois acima, sem efeito colateral
│   ├── services/
│   │   └── recuperacao/
│   │       ├── recuperacaoQueries.ts             # useListaRascunhos, useCarregarRascunho
│   │       └── recuperacaoMapper.ts              # parseGetListaNFCesOutput, parseCarregarNFCeOutput
│   └── features/
│       └── venda/
│           ├── retomarRascunho.ts                # orquestrador de efeito — data-model.md §6
│           └── recuperacao/
│               └── ModalRecuperacaoNFCe.tsx       # FR-001..FR-009, frame Pencil "Modal Recuperação NFCe"
└── shared/
    └── schemas/
        └── recuperacaoNFCe.schema.ts              # Zod: GetListaNFCesOutput (CarregarNFCeOutput reaproveita o schema Zod do shape completo CheckoutFaturarNFCe já planejado pela feature 006, dav.schema.ts — não o schema menor de FaturarNFCeOutput/NotaFiscal da feature 004; correção AD-117, achado do /speckit-analyze de 2026-08-31)

tests/
├── unit/
│   └── domain/
│       └── recuperacao/
│           ├── mapearItemParaLinhaCongelada.spec.ts
│           ├── mapearFormaParaPagamentoAplicado.spec.ts
│           └── mapearRascunhoCarregado.spec.ts
├── integration/
│   ├── retomarRascunho.spec.ts                    # ordem de efeitos, J1..J7
│   └── ModalRecuperacaoNFCe.spec.tsx               # busca, paginação, seleção
└── e2e/
    └── recuperacao-nfce.spec.ts                    # fluxo dourado de quickstart.md
```

**Structure Decision**: Sexta feature a estender a árvore proposta pela feature 002, mantendo as duas decisões já consolidadas por 001/003/004/008/009: (a) módulos de domínio puro sob `src/client/domain/<assunto>/`; (b) nenhum slice novo no `vendaStore` quando não há estado próprio a modelar — esta feature só **escreve** em slices que já existem (004, 003, 008, 005, 001), diferente de 008/009 que precisaram introduzir slice próprio. `domain/recuperacao/` (não `domain/nfce/`) é o único nome escolhido deliberadamente pensando em reuso futuro (feature 006/DAV, AD-057) — mas nenhum arquivo desta feature importa ou é importado por código de DAV; a integração real fica para o `/speckit-plan` da feature 006. `ModalRecuperacaoNFCe.tsx` fica sob `features/venda/recuperacao/`, paralelo a `features/pagamento/pix/` (009), por ser uma sub-superfície da tela principal de venda, nunca navegável isoladamente. Não adiciona nada a `src/server/` — consome rotas já cobertas pelo proxy genérico da feature 002.

## Complexity Tracking

> Nenhuma violação de Constitution Check identificada nesta fase — seção não preenchida.
