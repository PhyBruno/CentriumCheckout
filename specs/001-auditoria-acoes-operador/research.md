# Phase 0 Research: Auditoria de Ações do Operador

Não há `NEEDS CLARIFICATION` pendente em `spec.md` (checklist `requirements.md` já validado). As decisões abaixo consolidam pesquisa já feita no brainstorming anterior ao Spec Kit (AD-061/AD-062/AD-069 em `.specs/project/STATE.md`) mais três decisões de implementação novas, necessárias só a partir desta fase de plano.

## 1. Onde o slice `auditoria` vive

**Decision**: Slice Zustand combinado no mesmo store da venda (`vendaStore.ts`), via padrão de slices (múltiplos slice creators combinados por `create()`), não um store `create()` separado.

**Rationale**: AD-061 já fixa "mesmo ciclo de vida do carrinho" — combinar no mesmo store garante que resetar/descartar a venda (ex.: sucesso de `FaturarNFCe`) e resetar/descartar a auditoria aconteçam atomicamente, sem precisar sincronizar dois stores independentes. `.specs/codebase/ARCHITECTURE.md` já lista os dois como linhas separadas da tabela de estado, mas ambos "Zustand (sem persist)" com o mesmo padrão de descarte.

**Alternatives considered**: Store `Zustand` isolado (`useAuditoriaStore`) — rejeitado porque exigiria disparar dois `reset()`/`descartar()` em todo call site que hoje só chama um (finalização, retomada de venda), reintroduzindo o risco de dessincronia que a decisão de "mesmo ciclo de vida" tenta evitar.

## 2. Formato do timestamp

**Decision**: `new Date().toISOString()` — UTC, com milissegundos (ex.: `"2026-08-26T17:32:07.123Z"`).

**Rationale**: AD-061 exige "ISO 8601 completo, com segundos — não só precisão de minuto". `toISOString()` nativo do JS já satisfaz isso (e entrega precisão maior, em milissegundos) sem dependência externa, alinhado à ausência de nova lib de data neste projeto (`.specs/codebase/STACK.md` não lista lib de data/hora).

**Alternatives considered**: Biblioteca de data (`date-fns`, `dayjs`) só para formatar timestamp — rejeitada por adicionar dependência para um caso já coberto pela API nativa do navegador.

## 3. Middleware genérico vs. dispatcher explícito por evento

**Decision**: Dispatcher explícito e tipado (`registrarEventoAuditoria(evento)`), chamado manualmente por cada feature de negócio no ponto exato da ação.

**Rationale**: Já decidido em brainstorming e registrado em AD-061/Out of Scope da spec de domínio — um middleware genérico de interceptação de mutações Zustand produziria diffs de estado crus (ex.: "campo X mudou de A para B" sem contexto semântico), inutilizáveis pelo ERP sem reconstrução de intenção do lado de lá. O dispatcher explícito garante que o `Log` entregue ao ERP já tenha exatamente os campos semânticos relevantes por tipo de ação (ex.: `PRODUTO_ALTERADO` já chega com `campo`/`valorAnterior`/`valorNovo`, não um diff de objeto inteiro).

**Alternatives considered**: Middleware Zustand (`subscribeWithSelector` + diff automático) — descartado (ver acima); log no BFF (interceptando chamadas de `/api/erp/*`) — descartado porque o BFF (AD-022) não tem visibilidade de ações puramente locais que nunca chegam a uma chamada de rede (abrir modal, editar campo antes de confirmar), então perderia granularidade.

## Decisões herdadas (já fixadas antes deste plano, sem nova pesquisa)

- Campo `Log` (string) já confirmado em `CheckoutFaturarNFCe` no contrato `ApiCentriumOAuth.yaml` (`info.version: 20260825172440`) — AD-061.
- `produtoCancelado` como campo dedicado de contrato foi removido do escopo; cancelamento de item passa só pelo evento `PRODUTO_CANCELADO` — AD-062.
- Trilha de tier de preço (`TipoPreco = 8`) em `FaturarNFCe.produtos` é satisfeita pelo evento `PRODUTO_ALTERADO`, sem expandir o contrato de `FaturarNFCe` — AD-069.
