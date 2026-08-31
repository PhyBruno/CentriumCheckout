# Implementation Plan: Auditoria de Ações do Operador

**Branch**: `001-auditoria-acoes-operador` | **Date**: 2026-08-26 | **Spec**: `specs/001-auditoria-acoes-operador/spec.md`

**Input**: Feature specification from `specs/001-auditoria-acoes-operador/spec.md`, complementada pela especificação de domínio mais detalhada em `.specs/features/auditoria-acoes-operador/spec.md` (catálogo completo de tipos de evento, campos de `detalhes` por tipo, contrato do campo `Log`) e pela decisão arquitetural já registrada em `.specs/project/STATE.md` (AD-061, AD-062, AD-069).

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Um slice dedicado `auditoria`, combinado no mesmo store Zustand+Immer da venda em andamento (sem `persist`, mesmo ciclo de vida do carrinho — AD-006), acumula um array de eventos tipados com timestamp a cada ação relevante da venda (cliente, vendedor, produto, pagamento, falhas, finalização/suspensão). Cada feature de negócio que já existe (identificação de cliente, seleção de vendedor, carrinho, pagamento, finalização/suspensão) dispara esse evento explicitamente através de um dispatcher tipado — não há middleware genérico de interceptação de estado (rejeitado em brainstorming, AD-061). Ao finalizar ou suspender a venda, o array acumulado é serializado (`JSON.stringify`) e enviado no campo `Log` (string) de `CheckoutFaturarNFCe`, tanto em `SuspenderOuFaturar = "FATURAR"` quanto em `"SUSPENDER"`. Em caso de falha de rede no envio, o slice não é descartado — o log completo (incluindo o evento `FATURAMENTO_FALHOU`) é reenviado íntegro na tentativa seguinte; só é descartado após uma entrega bem-sucedida, junto com o carrinho e o cache de produtos.

## Technical Context

**Language/Version**: TypeScript `strict`, React 19 — feature inteiramente client-side, sem envolvimento do BFF (sessão/proxy, feature 002).

**Primary Dependencies**: Zustand + Immer (slice `auditoria` combinado no store de venda, sem `persist`) — nenhuma dependência nova; não usa TanStack Query (não há dado de servidor a cachear) nem Dexie (não é configuração de tenant, é estado efêmero da venda, vedado pela Constitution VI).

**Storage**: N/A — sem persistência. O array de eventos vive só em memória, com o mesmo ciclo de vida do carrinho (AD-006): não sobrevive a F5, é descartado ao final da venda (sucesso) e nunca é gravado em Dexie/localStorage/IndexedDB.

**Testing**: Vitest + Testing Library — teste unitário por tipo de evento (18 variantes, ver `data-model.md`) cobrindo a action creator e o formato de `detalhes`; teste de integração do slice cobrindo ordem cronológica estritamente crescente e a serialização para o campo `Log` (parse de volta ao array original). Sem E2E dedicado (mecanismo sem tela, FR-009) — a cobertura E2E do campo `Log` é responsabilidade do teste ponta a ponta de finalização/suspensão (feature 004, `specs/004-finalizacao-suspensao-venda/`), que só precisa afirmar que `Log` chega preenchido e parseável.

**Target Platform**: Navegador (mesma SPA das demais features) — sem mudança de plataforma ou processo.

**Project Type**: Extensão puramente frontend da estrutura de processo único (BFF Fastify + SPA no mesmo container) já proposta pela feature 002 — esta feature não adiciona nada a `src/server/`.

**Performance Goals**: Sem meta numérica — array limitado a dezenas de eventos por sessão de venda única, `push` síncrono em memória, custo imperceptível na UI.

**Constraints**:
- Nenhuma tela própria (FR-009) — mecanismo inteiramente de bastidor.
- Timestamp em ISO 8601 completo, com segundos (AD-061) — `new Date().toISOString()` (UTC, com milissegundos, satisfaz o requisito de precisão de segundos).
- Toda feature de negócio que gera um evento MUST chamar um dispatcher tipado (`registrarEventoAuditoria(...)`) — não há interceptação genérica de mutações Zustand (descartada, AD-061 "Out of Scope").
- Slice zerado só no evento `VENDA_INICIADA` (início ou retomada); nunca reconstrói histórico de sessão anterior (FR-008, AUDIT-10 — catálogo de invariantes em `.specs/features/auditoria-acoes-operador/spec.md`, linha 88).
- Slice preservado (nunca descartado) em falha de rede de `FaturarNFCe`; descartado só após entrega bem-sucedida (FR-006/FR-007, AUDIT-09 — mesma referência, linha 87).
- Nenhum campo de identidade do operador por evento — autoria é implícita à sessão autenticada (Assumptions da spec).

**Scale/Scope**: 1 slice Zustand (`auditoriaSlice`) + união discriminada de 18 tipos de evento + 1 módulo de serialização para o campo `Log` + pontos de disparo em 6 outras features (identificação de cliente — spec 005, seleção de vendedor — spec 012, carrinho — spec 003, pagamento — spec 008, finalização/suspensão — spec 004, validação prévia — spec 014). Este plano é dono do slice, da união de tipos e da serialização; os pontos de disparo em cada feature de negócio são implementados pelos planos dessas features, referenciando o contrato definido aqui (`contracts/auditoria-events.md`).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Avaliação |
|---|---|
| I. Spec-Driven Development | ✅ Este plano é o resultado de `/speckit-plan` sobre `specs/001-auditoria-acoes-operador/spec.md`, seguindo a sequência obrigatória. |
| II. Arquitetura SOLID | ✅ O slice `auditoria` tem responsabilidade única (acumular + serializar eventos); não conhece regras de negócio de cliente/vendedor/produto/pagamento — só recebe `detalhes` já normalizados via dispatcher tipado. Cada feature de negócio permanece responsável por decidir *quando* disparar seu próprio evento (Open/Closed: novo tipo de evento não exige alterar o slice, só estender a união em `data-model.md`). |
| III. ERP como Fonte Única de Verdade | ✅ O Checkout não interpreta, audita ou reprocessa o log — só acumula e repassa ao ERP como string opaca no campo `Log`; nenhuma tela de revisão é oferecida (FR-009), evitando que o Checkout vire uma segunda fonte de verdade de auditoria. |
| IV. Tipagem Estrita e Validação de Fronteira | ✅ União TypeScript discriminada (`tipo` como discriminante) cobre os 17 eventos sem `any`. Zod não se aplica à entrada — todo dado do evento é gerado internamente pela própria aplicação (não cruza uma fronteira externa); a única saída de fronteira é a serialização para `Log`, que é sempre `JSON.stringify` de um tipo já validado em compile-time. |
| V. Precisão Monetária Inegociável | ✅ Parcial — os eventos que carregam valor monetário (`PRODUTO_INSERIDO.precoUnitario`, `PRODUTO_ALTERADO.valorAnterior/valorNovo`) reaproveitam a representação em centavos inteiros já validada pela feature de origem (carrinho/precificação, spec 003); este módulo não recalcula nem arredonda nada, só transporta o valor recebido. |
| VI. Sem Estado de Venda Persistido no Cliente | ✅ Slice Zustand sem `persist`, mesmo ciclo de vida do carrinho (AD-006) — não sobrevive a F5, nunca é gravado em Dexie/localStorage. |

Nenhuma violação identificada. Nenhuma entrada necessária em "Complexity Tracking".

## Project Structure

### Documentation (this feature)

```text
specs/001-auditoria-acoes-operador/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   └── auditoria-events.md
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/client/
├── stores/
│   ├── vendaStore.ts                  # store combinado (Zustand+Immer) da venda em andamento — combina os slices de carrinho/cliente/vendedor/pagamento (outras features) com o slice abaixo
│   └── slices/
│       └── auditoriaSlice.ts          # slice desta feature: array de eventos + registrarEventoAuditoria() + resetarAuditoria() + descartarAuditoria()
└── domain/
    └── auditoria/
        ├── eventos.ts                  # união discriminada dos 18 tipos de evento (ver data-model.md) + factory functions tipadas por tipo
        └── serializarLog.ts            # monta a string JSON do campo Log a partir do array acumulado

tests/
└── unit/
    └── domain/
        └── auditoria/
            ├── eventos.spec.ts         # 1 caso por tipo de evento — shape de detalhes, timestamp ISO 8601
            └── serializarLog.spec.ts   # ordem cronológica, round-trip JSON.stringify/JSON.parse
```

**Structure Decision**: Esta é a segunda feature a propor estrutura de diretórios (a primeira foi a 002, para sessão/bootstrap — `src/client/`, `src/server/`). Esta feature adiciona `src/client/stores/` (o store combinado da venda, que a feature 003 — carrinho — vai estender com seu próprio slice) e `src/client/domain/auditoria/` (módulo de domínio puro, sem dependência de React/Zustand, seguindo o mesmo padrão do motor de precificação descrito em `.specs/codebase/ARCHITECTURE.md`). As features de negócio que disparam eventos (003, 004, 005, 008, 012) importam `registrarEventoAuditoria` de `auditoriaSlice.ts` a partir de seus próprios call sites — este plano não implementa esses call sites, só o contrato que eles vão consumir (`contracts/auditoria-events.md`).

## Complexity Tracking

> Nenhuma violação de Constitution Check identificada nesta fase — seção não preenchida.
