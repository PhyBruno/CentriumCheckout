# Layout Responsivo (Desktop/Mobile) — Specification

## Problem Statement

O operador pode usar o PDV em tablet/celular, onde uma tela única com todas as áreas simultâneas (identificação de cliente, carrinho, pagamento, finalização) não cabe com usabilidade aceitável. É preciso adaptar a apresentação sem duplicar lógica de negócio entre desktop e mobile.

## UI Design

**Design visual já concluído** — as 3 etapas do wizard mobile existem por completo em `design/CentriumCheckout.pen`: `PDV Mobile 01 - Cliente e Produtos`, `PDV Mobile 02 - Produtos e Pagamento`, `PDV Mobile 03 - Revisão e Finalização`. Falta apenas o **design técnico** (breakpoint de implementação, componentes de layout React, hook `useIsMobile`) — não o visual.

O design mobile já modela o gatilho de seleção de vendedor: `Campo Vendedor mobile` dentro de `Cliente e NFCe mobile` (etapa 1, `PDV Mobile 01`) — abre o mesmo modal de `.specs/features/selecao-vendedor/spec.md`, sem necessidade de spec própria aqui.

## Goals

- [ ] Mesma aplicação, mesmo estado de venda, atendendo desktop e mobile sem build/rota separada.
- [ ] Zero duplicação de regra de negócio entre os dois layouts.

## Out of Scope

| Feature | Reason |
|---|---|
| Detecção de capacidade touch | Critério de troca de layout é só largura de viewport, não capacidade do dispositivo |
| App nativo ou PWA dedicado | Fora de escopo — é responsividade web, não outra plataforma |
| Modal menu gerencial no mobile | Confirmado (2026-08-21): é uma tela só de desktop — não existe equivalente no design mobile (nenhum dos 3 frames do wizard o referencia) e não há necessidade de operação de retaguarda (sangria, suprimento, fechamento de caixa) durante o fluxo de venda em tablet/celular. Ver `.specs/codebase/ARCHITECTURE.md` |

---

## User Stories

### P2: Alternância automática de layout por largura de tela

**User Story**: Como operador de caixa em tablet, quero que a interface se adapte automaticamente ao tamanho da tela, sem configuração manual.

**Why P2**: Importante para adoção em loja física com tablets, mas o fluxo desktop já cobre o MVP inicial.

**Acceptance Criteria**:

1. WHEN a largura do viewport é `< 768px` THEN o sistema SHALL usar o layout mobile (wizard de 3 etapas); WHEN `>= 768px` THEN o sistema SHALL usar o layout desktop (tela única).
2. WHEN o layout muda THEN o sistema SHALL manter o mesmo estado de venda (Zustand) — divisão em etapas é puramente de apresentação, sem lógica de negócio duplicada.

**Independent Test**: Redimensionar a viewport através do breakpoint e verificar que o estado da venda em andamento não é perdido nem duplicado.

---

### P2: Navegação em wizard de 3 etapas (mobile)

**User Story**: Como operador de caixa em mobile, quero navegar entre etapas da venda (cliente/produtos → pagamento → revisão) e poder voltar a uma etapa já visitada, para corrigir erros sem recomeçar.

**Why P2**: Reduz risco de erro não corrigível no meio do fluxo mobile.

**Acceptance Criteria**:

1. WHEN o operador está no layout mobile THEN o sistema SHALL apresentar 3 etapas sequenciais: (1) identificação de cliente e adição de produtos, (2) conferência de produtos e forma/condição de pagamento, (3) revisão final e finalização.
2. WHEN o operador já visitou uma etapa anterior THEN o sistema SHALL permitir navegação livre de volta a ela a qualquer momento antes da finalização.
3. WHEN o layout é mobile THEN o sistema SHALL desativar os atalhos de teclado (react-hotkeys-hook) — otimização pensada para operador com teclado físico/leitor fixo, sem equivalente touch necessário.

**Independent Test**: No layout mobile, avançar até a etapa 3, voltar à etapa 1, trocar o cliente e confirmar que o estado permanece consistente ao avançar de novo.

---

## Edge Cases

Nenhum edge case de comportamento pendente identificado até o momento — a ambiguidade restante desta feature é técnica (fase Design), não de requisito.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
|---|---|---|---|
| MOB-01 | Breakpoint de troca de layout (`< 768px`) | Design técnico | Pending |
| MOB-02 | Estado único compartilhado entre layouts | Design técnico | Pending |
| MOB-03 | Wizard de 3 etapas (mobile) | Design técnico | Pending |
| MOB-04 | Navegação livre entre etapas visitadas | Design técnico | Pending |
| MOB-05 | Atalhos de teclado desativados no mobile | Design técnico | Pending |

**Coverage:** 5 total, 0 mapeados a tasks — requisitos confirmados (Specify concluído), mas a fase **Design** (componentes de layout separados, hook `useIsMobile`, estrutura de wizard) ainda não foi iniciada.

---

## Success Criteria

- [ ] Nenhuma regra de negócio duplicada entre os dois layouts.
- [ ] Operador nunca perde progresso ao alternar entre etapas já visitadas no mobile.
- [ ] Próximo passo: rodar a fase **Design** desta feature antes de decompor em tasks (ver `.specs/project/ROADMAP.md`).
