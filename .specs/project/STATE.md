# State

**Last Updated:** 2026-07-22
**Current Work:** Nenhuma feature em execução — discussão de arquitetura em andamento

---

## Recent Decisions (Last 60 days)

### AD-001: Responsividade mobile via wizard de 3 etapas (2026-07-22)

**Decision:** CheckoutWEB será responsivo. Breakpoint por largura de viewport (`< 768px`) alterna entre layout desktop (tela única) e layout mobile (wizard de 3 etapas: 1. identificação de cliente + adição de produtos → 2. conferência de produtos + forma/condição de pagamento → 3. revisão final e finalização). Navegação livre entre etapas já visitadas. Atalhos de teclado (react-hotkeys-hook) desativados no mobile. Documentado em `ARCHITECTURE.md` seção 6.
**Reason:** Operador pode usar o PDV em tablet/celular, onde uma tela única com todas as áreas simultâneas não cabe com usabilidade aceitável; dividir em etapas sequenciais resolve o espaço sem duplicar lógica de negócio.
**Trade-off:** Dois layouts de apresentação para manter (desktop de tela única + wizard mobile), ambos consumindo o mesmo estado (Zustand) — mais superfície de UI para testar, mas nenhuma duplicação de regra de negócio.
**Impact:** Ainda não implementado — apenas decisão de arquitetura registrada. Ver Deferred Ideas abaixo para o item de implementação.

---

## Active Blockers

_Nenhum blocker ativo no momento._

---

## Lessons Learned

_Nenhuma lição registrada ainda._

---

## Quick Tasks Completed

| #   | Description | Date | Commit | Status |
| --- | ------------ | ---- | ------ | ------ |

---

## Deferred Ideas

Ideas captured during work that belong in future features or phases. Prevents scope creep while preserving good ideas.

- [ ] Implementar o layout responsivo mobile (wizard de 3 etapas) definido em AD-001 / `ARCHITECTURE.md` seção 6 — requer spec própria (breakpoint, componentes de layout separados por dispositivo, hook `useIsMobile`, etc.) antes de codar. — Captured during: discussão de arquitetura (2026-07-22)

---

## Todos

Capture in-progress thoughts and action items that don't fit in active tasks.

- [ ] Quando o PROJECT.md/ROADMAP.md do projeto forem criados (via "initialize project"), promover o item acima de Deferred Ideas para uma feature/milestone formal no ROADMAP.md.
