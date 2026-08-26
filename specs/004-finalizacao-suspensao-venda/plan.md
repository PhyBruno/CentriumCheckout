# Implementation Plan: Finalização e Suspensão da Venda

**Branch**: `004-finalizacao-suspensao-venda` | **Date**: 2026-08-26 | **Spec**: `specs/004-finalizacao-suspensao-venda/spec.md`

**Input**: Feature specification from `specs/004-finalizacao-suspensao-venda/spec.md`, complementada pela especificação de domínio mais detalhada em `.specs/features/finalizacao-suspensao-venda/spec.md` (contrato de `FaturarNFCe`, protocolo do serviço de impressão local, semântica de `GetStatusSistema`) e pelas decisões arquiteturais já registradas em `.specs/project/STATE.md` (AD-006, AD-019, AD-022, AD-023, AD-024, AD-030, AD-032, AD-034, AD-037, AD-038, AD-042, AD-061, AD-062, AD-065, AD-082, AD-083, AD-088, AD-089) e em `.specs/codebase/INTEGRATIONS.md` (restrição de Local Network Access/Mixed Content para a chamada ao serviço de impressão local).

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Finalizar e suspender a venda são a mesma operação de rede — `POST /api/erp/FaturarNFCe`, diferindo só em `SuspenderOuFaturar` (`"FATURAR"`/`"SUSPENDER"`) — disparada pelos botões "Finalizar Venda"/"Cancelar Venda" no desktop e pelos equivalentes mobile (AD-089). Um hook orquestrador monta o payload combinando o que já existe em outros slices do `vendaStore` (itens do carrinho, feature 003; log de auditoria serializado, feature 001) com dois campos que esta feature passa a possuir: a **identidade da venda** (`origem`/`numeroNota`, novo slice `identidadeVenda`, decide `FR-003`) e a leitura direta de `SessaoUsuario` (`CadSerieNFCe`, `vendedorCodigo` — este último ainda a cargo da feature 012, referenciado por contrato). Falha de rede (sem resposta) nunca reenvia automaticamente — entra num estado que exige confirmação manual do operador antes de um novo envio (AD-038); falha de negócio do ERP (resposta com erro) não tem essa trava, o operador corrige e tenta de novo livremente. Em sucesso, a mesma operação que descarta carrinho + cache de produto + log de auditoria + identidade da venda decide o caminho de entrega do documento fiscal a partir de `SessaoUsuario.TipoImpressao`: impressão direta ao serviço local do PDV (chamada feita pelo navegador direto ao `CadMaqHost`, **fora** do proxy do BFF, replicando o `Impressao.js` real do PDV atual — AD-083) com fallback para PDF quando essa chamada falhar (erro de rede ou bloqueio de Local Network Access/Mixed Content do Chrome), ou exibição/download direto do PDF. Um mecanismo secundário e não relacionado ao envio — o polling de `GetStatusSistema` a cada 60s, ativo só quando não há venda em digitação (`FR-013`, AD-088) — também é escopo desta feature porque é onde a spec formal (`specs/004/spec.md`) o posicionou.

## Technical Context

**Language/Version**: TypeScript `strict`, React 19 — feature inteiramente client-side. O BFF (feature 002) participa só como proxy autenticado em `/api/erp/FaturarNFCe` e `/api/erp/GetStatusSistema`; nenhuma rota nova de servidor é introduzida. A chamada ao serviço de impressão local é a **única** chamada de rede desta feature que não passa pelo BFF — vai direto do navegador ao `CadMaqHost` (rede local do PDV), pelas razões documentadas em `.specs/codebase/INTEGRATIONS.md`.

**Primary Dependencies**: Zustand + Immer (novo slice `identidadeVenda` combinado no `vendaStore`, sem `persist`); TanStack Query (mutation para `FaturarNFCe`; invalidação total do cache de produto — `removeQueries({ queryKey: ['produto'] })`, mesmo padrão já definido em `specs/003-carrinho-produto-precificacao/contracts/erp-produto-api.md`); Zod (validação de fronteira da resposta de `FaturarNFCe` — `NotaFiscal.PDFImpressao`/`XMLImpressao`); Goey Toast (falha de rede, falha de impressão, bloqueio de suspensão); shadcn/ui (botões "Finalizar Venda"/"Cancelar Venda", diálogo de confirmação manual de reenvio, diálogo de apresentação do documento fiscal). **Sem biblioteca de retry/fila** — a ausência de reenvio automático é requisito de negócio (`FR-004`/AD-038), não uma lacuna técnica a preencher com uma lib.

**Storage**: N/A — sem persistência (Constitution VI). Identidade da venda, estado de envio e confirmação manual de reenvio vivem em memória, com o mesmo ciclo de vida do carrinho; descartados em sucesso, preservados em falha de rede até a próxima tentativa (mesmo padrão do slice `auditoria`, AD-061).

**Testing**: Vitest + Testing Library para a camada de domínio pura (montagem do payload — `NumeroNota` `0` vs. preenchido, campos obrigatórios por operação; decisão do mecanismo de impressão — `'E'`/`'P'`, ausência de `TipoImpressao`) e para a máquina de estados de envio (falha de rede não reenvia sem confirmação; falha de negócio permite reenvio livre; sucesso dispara limpeza completa). Playwright (E2E) para o fluxo dourado de finalizar uma venda nova e uma retomada, suspender com pagamento removível, e o bloqueio de suspensão com TEF/PIX aprovado — com o serviço de impressão local stubado (a chamada real depende de rede local do PDV, fora do alcance do ambiente de CI).

**Target Platform**: Navegador (Chrome prioritário — mesma restrição de Local Network Access/Mixed Content de `.specs/codebase/INTEGRATIONS.md`), desktop e mobile pelo mesmo estado de venda.

**Performance Goals**: Sem meta numérica de latência — a operação é síncrona do ponto de vista do operador (um clique, uma resposta). O polling de `GetStatusSistema` é a única atividade periódica desta feature: 60s de intervalo, ativo só entre vendas (`FR-013`), custo de rede desprezível (um `GET` leve por ciclo).

**Constraints**:
- Nenhum reenvio automático após falha de rede em `FaturarNFCe` — exige confirmação explícita do operador antes do próximo envio (`FR-004`, AD-038). Falha de **negócio** (resposta HTTP com erro do ERP) é distinta: não ativa essa trava.
- Suspender é bloqueado quando existe pagamento TEF/PIX aprovado (não removível); permitido quando só há pagamento removível aplicado (dinheiro/cartão manual) — mesmo predicado de bloqueio já usado por `CART-09`/`VEND-09` (`FR-005`/`FR-006`, AD-030/AD-042), injetado por dependência a partir da feature de pagamento (008), ainda não implementada.
- `vendedorCodigo` enviado é sempre o selecionado no modal de vendedor (feature 012, `VEND-05`) — nunca o operador logado (`FR-010`).
- `CadSerieNFCe` vem sempre de `SessaoUsuario.CadSerieNFCe` (bootstrap, feature 002) — nunca escolhido pelo operador (AD-034).
- Log de auditoria (campo `Log`, string) é sempre incluído, `FATURAR` e `SUSPENDER` (`FR-011`, contrato já definido por `specs/001-auditoria-acoes-operador/contracts/auditoria-events.md`).
- Descarte de estado local (carrinho + cache de produto + log de auditoria + identidade da venda) só ocorre após sucesso — nunca antes do envio, nunca após falha (`FR-012`).
- A chamada ao serviço de impressão local não valida formato de resposta — sucesso é só "a requisição não lançou erro de rede" (AD-083); falha aciona pergunta de fallback para PDF, nunca falha silenciosa (`FR-009`).
- Polling de `GetStatusSistema` só roda quando carrinho vazio **e** nenhum cliente identificado — nunca durante venda ativa (`FR-013`, AD-088); depende de estado das features 003 (carrinho) e 005 (cliente), lido, não mutado, por esta feature.

**Scale/Scope**: 1 slice Zustand (`identidadeVendaSlice`) + 2 módulos de domínio puro (`montarPayloadFaturarNFCe`, `decidirMecanismoImpressao`) + 3 módulos de serviço (mutation de `FaturarNFCe`, chamada ao serviço de impressão local, polling de `GetStatusSistema`) + 1 hook orquestrador + 4 superfícies de UI (botões de finalizar/cancelar, diálogo de confirmação de reenvio, diálogo do documento fiscal). Fora do escopo: a UI/lógica de pagamento que decide se há pagamento removível ou não-removível (feature 008 — este plano só consome o predicado), a seleção de vendedor (feature 012) e a identificação de cliente (feature 005) — este plano só lê o que essas features escrevem no `vendaStore`.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Avaliação (pré-Phase 0) | Re-avaliação (pós-Phase 1) |
|---|---|---|
| I. Spec-Driven Development | ✅ Este plano é resultado de `/speckit-plan` sobre `specs/004-finalizacao-suspensao-venda/spec.md`, seguindo a sequência obrigatória. | ✅ Mantido — todo artefato de design é rastreável a um `FR-xxx`/`FIN-xx`; nenhuma decisão nova introduz requisito não coberto pela spec. |
| II. Arquitetura SOLID | ✅ Planejado com separação estrita: domínio puro (montagem de payload, decisão de impressão) ↔ serviços (rede: `FaturarNFCe`, impressão local, `GetStatusSistema`) ↔ slice (identidade da venda) ↔ hook orquestrador (composição) ↔ UI. | ✅ Confirmado em `contracts/faturamento-api.md`: `montarPayloadFaturarNFCe` é função pura que recebe snapshots já prontos de outros slices, sem conhecer Zustand/React/rede; o predicado de bloqueio de suspensão entra por **injeção de dependência** (mesmo padrão de Dependency Inversion que 003 usou para bloqueio pós-pagamento), então esta feature não importa o slice de pagamento. Novo mecanismo de impressão (ex.: um terceiro valor de `TipoImpressao`) só altera `decidirMecanismoImpressao` (Open/Closed). |
| III. ERP como Fonte Única de Verdade | ✅ O Checkout não decide se a venda pode ser faturada — só monta o payload com dados já calculados (carrinho, auditoria) e delega ao ERP a emissão da NFCe, geração do PDF/XML e validação de negócio. | ✅ Confirmado — inclusive o protocolo do serviço de impressão local é uma réplica exata (não uma reinterpretação) do `Impressao.js` real já em produção (AD-083), evitando o Checkout inventar um contrato próprio. `GetStatusSistema` só decide **se** deve rechamar `GetSessao` (feature 002) — nunca reimplementa a lógica de config do ERP. |
| IV. Tipagem Estrita e Validação de Fronteira | ✅ Zod obrigatório na resposta de `FaturarNFCe`. | ✅ Confirmado em `contracts/faturamento-api.md` e `data-model.md`: o schema Zod valida `NotaFiscal.PDFImpressao`/`XMLImpressao` (strings base64/texto) antes de entrar no domínio; `identidadeVenda.numeroNota` é tipado como `number` não-negativo, nunca `string`/`any`. A resposta do serviço de impressão local **não** é validada por Zod — é uma exceção documentada e deliberada (AD-083: não há formato de resposta, sucesso é ausência de erro de rede), não uma omissão. |
| V. Precisão Monetária Inegociável | N/A para esta feature — nenhum cálculo de preço/desconto/total é feito aqui; os valores monetários que entram no payload (itens, total) já chegam prontos em `Centavos` do carrinho (feature 003), esta feature só os transporta. | N/A — confirmado; nenhuma aritmética monetária nova introduzida em `data-model.md`. |
| VI. Sem Estado de Venda Persistido no Cliente | ✅ Novo slice `identidadeVenda` sem `persist`, mesmo ciclo de vida do carrinho. | ✅ Confirmado — nenhum artefato de design grava em Dexie/localStorage; o estado de "aguardando confirmação de reenvio" também vive só em memória (estado local do hook orquestrador), nunca persistido. |

Nenhuma violação identificada em nenhuma das duas avaliações. Nenhuma entrada necessária em "Complexity Tracking".

## Project Structure

### Documentation (this feature)

```text
specs/004-finalizacao-suspensao-venda/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   ├── faturamento-api.md        # consumo de POST /api/erp/FaturarNFCe (FATURAR/SUSPENDER)
│   ├── impressao-local-api.md    # protocolo do serviço de impressão local (fora do proxy do BFF)
│   └── status-sistema-api.md     # polling de GET /api/erp/GetStatusSistema
├── checklists/
│   └── requirements.md  # gerado por /speckit-specify
└── tasks.md              # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/client/
├── domain/
│   └── finalizacaoVenda/                     # camada pura — sem React, Zustand, Query ou fetch
│       ├── montarPayloadFaturarNFCe.ts       # combina carrinho+auditoria+identidadeVenda+sessão em CheckoutFaturarNFCe (FR-001..FR-003, FR-010, FR-011)
│       └── decidirMecanismoImpressao.ts      # SessaoUsuario.TipoImpressao -> 'direta' | 'pdf' (FR-008)
├── stores/
│   ├── vendaStore.ts                          # store combinado (feature 001) — passa a combinar o slice abaixo
│   └── slices/
│       └── identidadeVendaSlice.ts            # { origem, numeroNota } + setters chamados pelas features 006/011 ao carregar rascunho/DAV
├── services/
│   ├── faturamento/
│   │   ├── faturarNFCeMutation.ts             # TanStack mutation POST /api/erp/FaturarNFCe, sem retry automático
│   │   └── faturarNFCeMapper.ts               # valida resposta (Zod) e extrai NotaFiscal.PDFImpressao/XMLImpressao
│   ├── impressao/
│   │   └── imprimirNFCeLocal.ts               # POST direto a http://{CadMaqHost} (raw XML, text/plain) — replica Impressao.js (AD-083)
│   └── statusSistema/
│       └── pollingStatusSistema.ts            # GET /api/erp/GetStatusSistema a cada 60s, só entre vendas (FR-013, AD-088)
└── features/
    └── finalizacao-suspensao/
        ├── useFinalizarOuSuspenderVenda.ts    # hook orquestrador: monta payload, envia, trata rede/negócio/sucesso, decide impressão, limpa estado
        ├── BotaoFinalizarVenda.tsx            # desktop "Finalizar Venda" / mobile etapa 03 (AD-089)
        ├── BotaoCancelarVenda.tsx             # desktop "Cancelar Venda" / mobile ícone de lixeira, todas as etapas (AD-089)
        ├── DialogoConfirmarReenvio.tsx        # confirmação manual pós-falha de rede (FR-004, AD-038)
        └── DialogoDocumentoFiscal.tsx         # apresenta PDF/aciona impressão direta, oferece fallback em falha (FR-009)

tests/
├── unit/
│   └── domain/
│       └── finalizacaoVenda/
│           ├── montarPayloadFaturarNFCe.spec.ts   # NumeroNota 0 vs. preenchido, CadSerieNFCe/vendedorCodigo sempre presentes, Log serializado
│           └── decidirMecanismoImpressao.spec.ts  # 'E' -> direta, 'P' -> pdf, valor inesperado tratado como erro de fronteira
├── integration/
│   └── finalizacaoSuspensao.spec.ts               # falha de rede -> aguarda confirmação -> reenvio; falha de negócio -> reenvio livre; sucesso -> descarta carrinho/cache/auditoria/identidade
└── e2e/
    └── finalizacao-suspensao.spec.ts               # finalizar venda nova e retomada; suspender com pagamento removível; bloqueio com TEF/PIX aprovado; fallback de impressão
```

**Structure Decision**: Esta é a quarta feature a estender a árvore proposta pela feature 002 (`src/client/`, `src/server/`, `src/shared/`) e mantém os três padrões já estabelecidos: (a) domínio puro sob `src/client/domain/<assunto>/`, como as features 001 (`domain/auditoria/`) e 003 (`domain/precificacao/`) já fizeram; (b) um slice novo sob `src/client/stores/slices/`, combinado no `vendaStore.ts` criado pela feature 001; (c) serviços de rede isolados em `src/client/services/<assunto>/`, como a feature 003 fez para produto. A novidade desta feature é o **hook orquestrador** (`useFinalizarOuSuspenderVenda.ts`) sob `features/finalizacao-suspensao/` — nenhuma feature anterior precisou compor mutação de rede + múltiplos slices + decisão de impressão num único ponto; mantê-lo fora do domínio puro (que não pode depender de React/Query) e fora do slice (que não deve conhecer rede) é o que sustenta o Constitution Check II. Esta feature **não** adiciona nada a `src/server/` — consome os proxies `/api/erp/FaturarNFCe` e `/api/erp/GetStatusSistema` já cobertos pelo padrão geral de `/api/erp/*` da feature 002; a única chamada de rede fora desse proxy (serviço de impressão local) é direta do navegador, documentada em `contracts/impressao-local-api.md`.

## Complexity Tracking

> Nenhuma violação de Constitution Check identificada nesta fase — seção não preenchida.
