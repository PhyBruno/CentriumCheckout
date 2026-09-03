# Implementation Plan: Layout Responsivo (Desktop/Mobile)

**Branch**: `docs/plan-layout-responsivo-mobile` | **Date**: 2026-08-26 | **Spec**: `specs/007-layout-responsivo-mobile/spec.md`

**Input**: Feature specification from `specs/007-layout-responsivo-mobile/spec.md`, complementada pela especificação de domínio mais detalhada em `.specs/features/layout-responsivo-mobile/spec.md` (breakpoint, escopo mobile confirmado tela a tela, requisitos `MOB-01` a `MOB-06`) e pelas decisões arquiteturais já registradas em `.specs/project/STATE.md` (AD-006, AD-046, AD-074, AD-085, AD-086, AD-089, AD-090).

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Uma única árvore de componentes React decide, a cada render, entre apresentação **desktop** (tela única) e **mobile** (wizard de 3 etapas) usando um único hook (`useIsMobile`, `matchMedia('(max-width: 767.98px)')`, breakpoint `768px` — MOB-01) — nenhuma rota separada, nenhum estado de venda duplicado: os dois layouts leem e escrevem o **mesmo** `vendaStore` (Zustand+Immer, sem `persist`, AD-006) já produzido pelas features 001/003/005/012, mais o que 004/008 ainda vão produzir. Este plano não introduz nenhuma regra de negócio nova — é presentation-only por definição de escopo (Constitution III): compõe, para cada layout, os componentes de tela que cada feature de domínio já expõe (grid do carrinho — 003, modal de cliente — 005, modal de vendedor — 012, pagamento — 008, finalização — 004), sem duplicar nenhuma lógica de cálculo, validação ou orquestração de rede entre as duas árvores. O wizard mobile guarda **só** o índice da etapa atual e o conjunto de etapas já visitadas — estado 100% local de UI (não vive no `vendaStore`), descartado ao desmontar; nenhuma feature de domínio depende dele. Atalhos de teclado (`react-hotkeys-hook`) nunca são registrados/ativados dentro da árvore mobile (MOB-05) — não é uma flag de runtime, é ausência estrutural do `useHotkeys` fora da árvore desktop. O botão "Scanner" (mobile, etapa de produtos) só é renderizado quando `BarcodeDetector` existe em `window` **e** a UA indica Chrome em Android (AD-086/AD-090) — quando lê um código com sucesso, entra pelo **mesmo** pipeline de classificação de entrada (`EntradaCodigo`, `specs/003-carrinho-produto-precificacao/data-model.md` §7) já usado por leitor físico/digitação, nunca um caminho de inserção próprio.

## Technical Context

**Language/Version**: TypeScript `strict`, React 19 + Vite — feature inteiramente client-side, sem rota nova de servidor. `BarcodeDetector` é uma Web API nativa do navegador (Shape Detection API), sem polyfill/lib de decodificação.

**Primary Dependencies**: Nenhuma dependência nova. Reaproveita react-hotkeys-hook (já na stack, `.specs/codebase/STACK.md`) apenas para o lado desktop; shadcn/ui + Boneyard (esqueleto das 3 telas mobile, mesmo padrão de carregamento das demais features) para os containers de etapa; Zustand (não um slice de domínio — um `useState`/store de UI local ao container do wizard, fora do `vendaStore`, ver `data-model.md` §2) para o índice de etapa e o conjunto de etapas visitadas.

**Storage**: N/A — nenhum estado novo em Dexie/localStorage (Constitution VI). O índice/etapas-visitadas do wizard não sobrevive a F5 nem a troca de layout, e isso é aceitável: a spec (`FR-002`/`MOB-02`) só exige preservação do estado de **venda** (carrinho/cliente/vendedor/pagamento) na troca de layout, nunca da posição de navegação do wizard.

**Testing**: Vitest + Testing Library. Unitário puro (sem React) para `classificarLayout(width)` (limiar `768px`, casos de borda `767px`/`768px`) e para `suportaScannerCamera(userAgent, hasBarcodeDetector)` (Chrome/Android, Chrome/desktop excluído, Safari/iOS excluído, Chrome-em-iOS excluído — motor ainda é WebKit). Integração para o container do wizard: navegação livre entre etapas já visitadas (`MOB-04`), preservação do `vendaStore` ao alternar `useIsMobile` de `true`↔`false` num teste com `resizeObserver`/`matchMedia` mockado, ausência de `useHotkeys` registrado quando o layout é mobile. Playwright (E2E) em duas viewports: fluxo dourado desktop (já existente) e fluxo dourado mobile (login → etapa 1 → 2 → 3 → finalizar), mais um teste de redimensionamento cruzando o breakpoint no meio de uma venda com itens no carrinho.

**Target Platform**: Navegador, ambos os layouts na mesma aplicação — desktop (Chrome prioritário) e mobile (tablet/celular, câmera restrita a Chrome/Android — AD-086).

**Performance Goals**: Troca de layout é síncrona (reação a `matchMedia`), sem chamada de rede própria — nenhum dos dois layouts refaz bootstrap/GetSessao ao alternar. `BarcodeDetector.detect()` roda no próprio frame de vídeo via `requestAnimationFrame`, sem Web Worker (decisão de AD-086: evitar biblioteca externa/WASM justamente para não precisar dessa complexidade).

**Constraints**:
- Critério de troca de layout é exclusivamente largura de viewport — nunca capacidade de toque do dispositivo (`Assumptions` do spec, Out of Scope de `.specs/features/layout-responsivo-mobile/spec.md`).
- Nenhuma duplicação de regra de negócio entre as duas árvores (`SC-001`) — todo componente de domínio (grid de itens, modal de cliente/vendedor, fluxo de pagamento/finalização) é **o mesmo componente/hook**, reposicionado por layout, nunca reimplementado.
- Import/recuperação de NFCe (features 006/011) e o menu gerencial ficam **fora** da árvore mobile — não é uma flag de "oculto", é ausência estrutural: o `MobileWizard` nunca importa esses componentes (`FR-008`, AD-046). **O TEF saiu desta lista em 2026-09-03 (AD-144):** ele passa a integrar a árvore mobile como qualquer outra forma de pagamento.
- PIX e TEF estão igualmente disponíveis no mobile, decididos só por `ConfiguracoesPIX`/`ConfiguracoesTEF` (`FR-009`, **AD-144, 2026-09-03**, que revogou a exclusão de TEF no mobile de AD-074) — este plano não impõe nenhuma restrição de pagamento por layout; a regra de roteamento pertence à feature 008 (pagamento-geral), que este plano consome, não reimplementa.
- Botão "Scanner" ausente (não desabilitado) fora de Chrome/Android — sem mensagem de indisponibilidade (`FR-011`, AD-090).
- Atalhos de teclado nunca ativos na árvore mobile (`FR-005`, MOB-05) — nenhum `useHotkeys`/`HotkeysProvider` scope de venda é montado ali.
- **Dependência de features ainda não desenhadas**: as features 004 (finalização/suspensão) e 012 (seleção de vendedor) e 008 (pagamento) têm `spec.md` mas ainda não passaram por `/speckit-plan` — este plano referencia os componentes/actions que elas **vão** expor pelos requisitos já aprovados (`FIN-*`, `VEND-*`), sem redesenhar essas features; a integração final (nomes exatos de componente) fica sujeita a ajuste não-estrutural quando a fase Design dessas três rodar.

**Scale/Scope**: 1 hook de domínio puro (`useIsMobile`/`classificarLayout`) + 1 módulo puro de suporte a câmera (`suportaScannerCamera`) + 1 container de layout raiz (`AppShell`) + 1 container de wizard mobile (índice de etapa + etapas visitadas, estado local) + 3 componentes de etapa mobile (compõem componentes já existentes de outras features) + 1 componente `ScannerCamera` (wrapper de `BarcodeDetector`, alimenta o mesmo pipeline `EntradaCodigo` de `carrinhoSlice.inserirItem`, feature 003). Fora do escopo: qualquer lógica de negócio das telas compostas (carrinho, cliente, vendedor, pagamento, finalização — cada uma no seu próprio plano) e a implementação em si das features 004/008/012 (este plano só consome a superfície que elas expõem/vão expor).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Avaliação (pré-Phase 0) | Re-avaliação (pós-Phase 1) |
|---|---|---|
| I. Spec-Driven Development | ✅ Plano resultado de `/speckit-plan` sobre `specs/007-layout-responsivo-mobile/spec.md`, seguindo a sequência obrigatória. | ✅ Mantido — nenhum requisito novo introduzido fora de `FR-xxx`/`MOB-xx`; a dependência de 004/008/012 ainda não desenhadas foi registrada como constraint explícita, não contornada por suposição silenciosa. |
| II. Arquitetura SOLID | ✅ Planejado com separação estrita: hook puro de classificação (`useIsMobile`) ↔ containers de layout (composição, sem lógica de domínio) ↔ componentes de feature (inalterados, só reposicionados). | ✅ Confirmado em `contracts/layout-domain-api.md`: nenhum componente de domínio é duplicado entre as árvores — `AppShell` decide qual árvore montar (Open/Closed: nova etapa mobile não altera `useIsMobile`); `ScannerCamera` alimenta o carrinho pela mesma porta pública (`EntradaCodigo`) que leitor físico/digitação já usam (Liskov: três origens de entrada, uma interface). |
| III. ERP como Fonte Única de Verdade | ✅ Esta feature não introduz nenhuma chamada de rede própria — só reposiciona componentes que já chamam o ERP em seus próprios planos. | ✅ Confirmado — `AppShell`/`MobileWizard` não têm `services/`; toda chamada de rede pertence às features de domínio compostas. |
| IV. Tipagem Estrita e Validação de Fronteira | ✅ Sem payload de rede próprio, sem necessidade de schema Zod novo. | ✅ Confirmado — o único dado externo tratado aqui é `navigator.userAgent` (para `suportaScannerCamera`), que não passa por Zod por não vir de resposta HTTP; validado por função pura testada isoladamente. |
| V. Precisão Monetária Inegociável | ✅ Nenhuma aritmética monetária nesta feature. | ✅ Confirmado — nenhum valor de preço/desconto/total é lido, escrito ou formatado por este plano. |
| VI. Sem Estado de Venda Persistido no Cliente | ✅ Estado do wizard (etapa atual, visitadas) é local, não persistido, e não é estado de *venda* — o estado de venda em si continua vivendo só no `vendaStore` já existente. | ✅ Confirmado em `data-model.md` §2 — nenhum artefato de design grava wizard, layout ou venda em Dexie/localStorage. |

Nenhuma violação identificada em nenhuma das duas avaliações. Nenhuma entrada necessária em "Complexity Tracking".

## Project Structure

### Documentation (this feature)

```text
specs/007-layout-responsivo-mobile/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   └── layout-domain-api.md   # useIsMobile, WizardState, integração com carrinho (003) via EntradaCodigo
├── checklists/
│   └── requirements.md  # gerado por /speckit-specify
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── client/
│   ├── domain/
│   │   └── layout/
│   │       ├── classificarLayout.ts        # (largura: number) => 'DESKTOP' | 'MOBILE', limiar 768px — puro, sem React
│   │       └── suportaScannerCamera.ts     # (userAgent, hasBarcodeDetector) => boolean — Chrome/Android apenas (AD-086), puro
│   ├── layout/
│   │   ├── useIsMobile.ts                  # hook: matchMedia + classificarLayout, reativo a resize
│   │   ├── obterPlataforma.ts              # AD-116 (achado da fase de tasks, 2026-08-31): leitura síncrona fora de React, reaproveita classificarLayout — consumida por capacidades().plataforma do pagamentoSlice (008)
│   │   ├── AppShell.tsx                    # decide DesktopLayout vs MobileWizard; único ponto que lê useIsMobile
│   │   ├── desktop/
│   │   │   └── DesktopLayout.tsx           # tela única — compõe carrinho (003), cliente (005), vendedor (012), pagamento (008), finalização (004), menu gerencial, DAV/recuperação (006/011)
│   │   └── mobile/
│   │       ├── MobileWizard.tsx            # estado local: etapaAtual + etapasVisitadas; navegação livre (MOB-04)
│   │       ├── EtapaClienteProdutos.tsx    # etapa 1 — compõe cliente (005) + carrinho (003) + ScannerCamera
│   │       ├── EtapaPagamento.tsx          # etapa 2 — compõe conferência de itens + pagamento (008, TEF incluído — AD-144)
│   │       ├── EtapaRevisao.tsx            # etapa 3 — compõe revisão + finalização (004)
│   │       └── ScannerCamera.tsx           # BarcodeDetector; sucesso alimenta o mesmo EntradaCodigo do carrinho (003)
│   └── stores/
│       └── slices/                          # nenhum slice novo — este plano não adiciona nada ao vendaStore
└── shared/
    └── (nenhum schema novo)

tests/
├── unit/
│   └── domain/
│       └── layout/
│           ├── classificarLayout.spec.ts    # limiar 767px/768px, valores extremos
│           └── suportaScannerCamera.spec.ts # Chrome/Android, Chrome/desktop, Safari/iOS, Chrome/iOS (WebKit), sem BarcodeDetector
├── integration/
│   └── mobileWizard.spec.ts                 # navegação livre entre etapas visitadas, estado de venda preservado ao alternar useIsMobile, hotkeys nunca registrados no mobile
└── e2e/
    ├── layout-desktop.spec.ts               # fluxo dourado desktop (viewport larga)
    ├── layout-mobile.spec.ts                # fluxo dourado mobile (viewport estreita), 3 etapas
    └── layout-responsivo.spec.ts            # redimensionamento cruzando o breakpoint com carrinho populado, sem perda/duplicação
```

**Structure Decision**: Esta é a sétima feature a estender a árvore proposta pela feature 002, mas é a **primeira a introduzir a raiz de composição de UI** (`src/client/layout/`) — nenhuma feature anterior criou `AppShell`/telas-container, porque cada uma só definiu seus próprios componentes de domínio (`features/<assunto>/`). `layout/` fica ao lado de `domain/`, `stores/`, `services/` e `features/` já estabelecidos, com a mesma separação: `domain/layout/` é 100% puro (testável sem montar componente), `layout/*.tsx` é composição de apresentação sem lógica de negócio própria — reforça o Constitution Check III, já que esta feature literalmente não pode duplicar regra de negócio por não ter nenhuma para duplicar. `AppShell` é o único componente do projeto que lê `useIsMobile`; todo componente abaixo dele já sabe em qual layout está por estar dentro de `desktop/` ou `mobile/`, evitando checagem de breakpoint espalhada pelo código (Open/Closed — adicionar uma 4ª etapa mobile não toca `AppShell`).

## Complexity Tracking

> Nenhuma violação de Constitution Check identificada nesta fase — seção não preenchida.
