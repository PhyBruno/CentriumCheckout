# Pagamento — PIX — Specification

## Problem Statement

O operador precisa gerar um pagamento PIX e saber quando ele foi aprovado, sem depender de eventos push do ERP. Comportamento comum a todas as formas de pagamento (carregamento de formas/condições, ticket devolução) está em `.specs/features/pagamento-geral/spec.md`; TEF está em `.specs/features/pagamento-tef/spec.md`.

## UI Design

Modal PIX: frame `PDV Online Web - Modal PIX` (QR Code, copia e cola, badge de status). Tela principal e área "Pagamento e totais": ver `.specs/features/pagamento-geral/spec.md`.

## Goals

- [ ] Status de PIX confirmado de forma confiável via consulta ativa, sem SSE.

## Out of Scope

| Feature | Reason |
|---|---|
| Server-Sent Events (SSE) para status de PIX | Confirmado (2026-08-20, AD-012 em `.specs/project/STATE.md`): não será usado — apesar de diagrama de referência do ERP mencionar SSE, o Checkout opta por consulta ativa (polling), mais simples de operar sem exigir que o BFF mínimo (AD-022) — hoje só responsável por sessão/proxy — passe a manter conexões persistentes |

---

## User Stories

### P1: Consulta ativa de status de PIX ⭐ MVP

**User Story**: Como operador de caixa, quero saber quando o pagamento PIX foi aprovado, sem depender de notificação push do servidor.

**Why P1**: Sem confirmação, a venda não pode ser finalizada com segurança.

**Acceptance Criteria**:

1. WHEN um pagamento PIX é gerado (QR Code exibido) THEN o sistema SHALL consultar ativamente `GET /ApiCentriumOAuth/StatusPIX` (params `Empresa`, `Trnguid`, retorna `StatusTransacao`) a cada 10 segundos — nunca via SSE. **Resolvido (2026-08-21, AD-023):** endpoint confirmado no `ApiCentriumOAuth.yaml` atualizado. **Intervalo de polling resolvido (2026-08-24, AD-026):** decisão direta do usuário — a cada 10s, sem estratégia de backoff documentada.

**Independent Test**: Mockar `StatusPIX` alternando entre pendente e aprovado; confirmar que o polling detecta a mudança.

---

### P1: Ocultar PIX quando não configurado ⭐ MVP

**User Story**: Como operador de caixa, não quero ver a opção de PIX quando o tenant não a utiliza.

**Why P1**: Evita oferecer uma forma de pagamento indisponível.

**Acceptance Criteria**:

1. WHEN `ConfiguracoesPIX.UtilizaCentriumPAG` é `false` THEN o sistema SHALL ocultar/desabilitar o recurso de PIX.

**Independent Test**: Mockar `GetSessao` com `UtilizaCentriumPAG=false` e confirmar que PIX não aparece na tela de pagamento. Faz parte do mesmo teste combinado descrito em `.specs/features/pagamento-geral/spec.md` (Story P1, `PAY-01`).

---

## Edge Cases

- WHEN o intervalo de polling de `StatusPIX` precisa ser definido THEN o sistema SHALL consultar a cada 10 segundos. **Resolvido (2026-08-24, AD-026):** decisão direta do usuário — intervalo fixo de 10s.
- WHEN `GerarPIX` é chamado THEN o sistema SHALL enviar `Empresa` (`codigoEmpresa` persistido, ver AD-019 em `.specs/project/STATE.md`), exigido pelo contrato — regra geral detalhada em `.specs/features/pagamento-geral/spec.md`.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
|---|---|---|---|
| PAY-03 | Ocultar PIX quando `UtilizaCentriumPAG=false` | - | Verified |
| PAY-04 | Consulta ativa de status de PIX (sem SSE) | - | Verified (2026-08-21, AD-023 — endpoint `StatusPIX` confirmado no contrato atualizado) |

**Coverage:** 2 total, 0 edge cases pendentes (intervalo de polling de `StatusPIX` resolvido em 2026-08-24, AD-026 — decisão direta do usuário, a cada 10s).

---

## Success Criteria

- [ ] Nenhuma venda finalizada sem confirmação ativa de PIX quando aplicável.
