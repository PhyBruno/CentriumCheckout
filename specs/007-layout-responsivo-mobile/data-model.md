# Phase 1 — Data Model: Layout Responsivo (Desktop/Mobile)

**Feature**: `specs/007-layout-responsivo-mobile/` | **Date**: 2026-08-26

Esta feature não introduz nenhuma entidade de negócio nem estado persistido. As duas estruturas abaixo são estado de **apresentação**, não de venda — nenhuma delas vive no `vendaStore` nem em Dexie/localStorage.

---

## 1. Classificação de layout

```ts
// src/client/domain/layout/classificarLayout.ts
export type ModoLayout = 'DESKTOP' | 'MOBILE';

export function classificarLayout(larguraViewportPx: number): ModoLayout;
// larguraViewportPx < 768  => 'MOBILE'
// larguraViewportPx >= 768 => 'DESKTOP'
```

Função pura — sem `window`, sem React. `useIsMobile()` (`src/client/layout/useIsMobile.ts`) é a única casca que conecta essa função a `matchMedia('(max-width: 767.98px)')` (`research.md` D1) e devolve um `boolean` reativo.

| # | Invariante | Requisito |
|---|---|---|
| I1 | O critério é exclusivamente a largura do viewport — nunca `navigator.maxTouchPoints`/`ontouchstart` | `MOB-01`, Assumptions do spec |
| I2 | `768px` exato conta como `DESKTOP` (limiar `max-width: 767.98px`) | `research.md` D1 |

---

## 2. `WizardState` — estado local do wizard mobile

```ts
// src/client/layout/mobile/MobileWizard.tsx (useState, não Zustand)
export type EtapaWizard = 1 | 2 | 3;

interface WizardState {
  etapaAtual: EtapaWizard;
  etapasVisitadas: ReadonlySet<EtapaWizard>;
}
```

| Etapa | Conteúdo | Requisito |
|---|---|---|
| `1` | Identificação de cliente e adição de produtos | `MOB-03` |
| `2` | Conferência de produtos e forma/condição de pagamento | `MOB-03` |
| `3` | Revisão final e finalização | `MOB-03` |

### Invariantes

| # | Invariante | Requisito |
|---|---|---|
| I1 | `etapaAtual` inicia em `1` a cada montagem de `MobileWizard` (inclusive após alternância de layout que o desmonte e remonte) | `research.md` D2 |
| I2 | `etapasVisitadas` só cresce (nunca remove uma etapa já visitada) durante o ciclo de vida de uma venda em digitação | `FR-004`, `MOB-04` |
| I3 | Navegar para qualquer etapa em `etapasVisitadas` é sempre permitido, a qualquer momento antes da finalização — sem validação de campo obrigatório bloqueando o retorno | `FR-004`, `MOB-04` |
| I4 | `WizardState` nunca é lido por nenhum slice do `vendaStore` nem por nenhum componente de `layout/desktop/` | `research.md` D2, Constitution VI |
| I5 | Trocar de etapa nunca reseta nem recalcula nenhum dado do `vendaStore` (carrinho, cliente, vendedor, pagamento) — é navegação pura de apresentação | `SC-001` |

### Transições

```
        entra na etapa (clique/avanço)
                    │
                    ▼
   etapaAtual := N;  etapasVisitadas := etapasVisitadas ∪ {N}
```

Não há transição de saída/reset explícita nesta feature — a limpeza do estado de venda ao finalizar/suspender pertence à feature 004 (`FIN-012`); quando isso ocorre, `MobileWizard` é desmontado pela troca de tela (nova venda), reiniciando `WizardState` por I1.

---

## 3. Suporte ao "Scanner" por câmera

```ts
// src/client/domain/layout/suportaScannerCamera.ts
export function suportaScannerCamera(
  userAgent: string,
  hasBarcodeDetector: boolean,
): boolean;
```

| # | Invariante | Requisito |
|---|---|---|
| I1 | Devolve `true` somente quando `hasBarcodeDetector` é `true` **e** `userAgent` indica Chrome em Android, excluindo outros navegadores baseados em Chromium (Edge, Opera, Samsung Internet) | `MOB-06`, AD-086, `research.md` D4 |
| I2 | Devolve `false` em qualquer navegador/SO fora dessa combinação, mesmo que `BarcodeDetector` exista em `window` | AD-090, `research.md` D4 |
| I3 | O botão "Scanner" só é renderizado quando esta função devolve `true` — nunca uma versão desabilitada nem mensagem de indisponibilidade | `FR-011` |

**Sem estado próprio** — é avaliada uma vez por sessão (não reativa a mudança de UA/API em runtime, o que não ocorre na prática dentro de uma mesma sessão de navegador).

---

## 4. Entrada de código via câmera → pipeline existente

Não é uma entidade nova — é um ponto de integração. Quando `ScannerCamera.tsx` decodifica com sucesso, a string resultante é entregue como:

```ts
{ tipo: 'SIMPLES', codigo: string }
```

exatamente o mesmo formato de `EntradaCodigo` já definido em `specs/003-carrinho-produto-precificacao/data-model.md` §7, processado pelo mesmo `carrinhoSlice.inserirItem` que já resolve entrada por leitor físico/digitação — sem estrutura de dado paralela.
