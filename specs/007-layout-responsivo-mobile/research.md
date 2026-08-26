# Phase 0 — Research: Layout Responsivo (Desktop/Mobile)

**Feature**: `specs/007-layout-responsivo-mobile/` | **Date**: 2026-08-26

Nenhum `[NEEDS CLARIFICATION]` restava no spec (`checklists/requirements.md`, Notes) — esta fase resolve só decisões técnicas de implementação, não requisito de comportamento.

---

## D1: Mecanismo de detecção de layout — `matchMedia`, não `resize` bruto nem biblioteca de terceiros

**Decision**: `useIsMobile()` usa `window.matchMedia('(max-width: 767.98px)')` com listener (`addEventListener('change', ...)`), não um listener de `window.resize` com debounce manual nem lib (`react-responsive`, `usehooks-ts`).

**Rationale**: `matchMedia` já debounça no nível do navegador (só dispara no cruzamento do limiar, não a cada pixel de resize), é nativo (sem dependência nova — `AD-018`/`AD-007` reservam novas libs de UI para lacunas reais, não para algo o browser já resolve) e testável por mock direto (`window.matchMedia = jest.fn(...)`) sem simular eventos de resize sintéticos.

**Alternatives considered**: `ResizeObserver` no elemento raiz — descartado por resolver um problema diferente (tamanho de um elemento específico, não do viewport); lib `react-responsive` — descartada por ser uma dependência nova para embrulhar exatamente `matchMedia`.

**0.98px no limiar**: evita a ambiguidade de igualdade dupla em `768px` exato — `max-width: 767.98px` é o mesmo padrão que frameworks CSS usam (ex.: Bootstrap) para breakpoint "abaixo de 768".

---

## D2: Onde vive o estado do wizard (etapa atual, etapas visitadas) — local ao container, fora do `vendaStore`

**Decision**: `MobileWizard.tsx` guarda `etapaAtual: 1 | 2 | 3` e `etapasVisitadas: Set<1 | 2 | 3>` como estado de componente (`useState`), não como um slice novo do `vendaStore` Zustand.

**Rationale**: É estado 100% de apresentação — nenhuma feature de domínio precisa saber em qual etapa do wizard o operador está; a spec (`FR-002`) exige preservar o estado de **venda**, não a posição de navegação. Colocar isso no `vendaStore` violaria SRP (Constitution II) ao misturar "em qual etapa estou" com "o que estou vendendo" no mesmo store, e criaria acoplamento desnecessário entre `layout/` e `stores/`.

**Trade-off aceito**: se o `AppShell` desmontar `MobileWizard` (ex.: viewport cruza para desktop e volta), a posição do wizard reseta para a etapa 1 — aceitável porque não há requisito contrário, e o estado de venda (que é o que importa) permanece intacto no `vendaStore` durante toda essa troca.

**Alternatives considered**: slice `layoutSlice` no `vendaStore` — descartado pelo motivo SRP acima; roteador (`react-router`) com uma rota por etapa — descartado por introduzir uma dependência nova (roteamento) só para 3 telas sem necessidade de URL profunda/compartilhável, e a spec não pede navegação por URL.

---

## D3: `AppShell` como único ponto de leitura de `useIsMobile`

**Decision**: Apenas `AppShell.tsx` chama `useIsMobile()`; todo componente abaixo (`DesktopLayout`, `MobileWizard` e suas etapas) já sabe seu contexto por posição na árvore, nunca reconsultando o breakpoint.

**Rationale**: Evita o anti-padrão de checagem de breakpoint espalhada (`if (isMobile) ... else ...` em dezenas de componentes) — reforça Open/Closed (Constitution II): adicionar uma 4ª etapa mobile, ou mudar o breakpoint, toca só `AppShell`/`useIsMobile`, nunca os componentes de domínio compostos.

**Alternatives considered**: cada componente de feature (ex.: grid de carrinho) checando `useIsMobile()` internamente para variar seu próprio layout interno (não a composição de tela) — não descartado por completo: um componente de domínio **pode** usar `useIsMobile()` para variações internas de apresentação (ex.: densidade da grid), desde que isso não decida *quais* componentes existem na tela — essa decisão de composição é exclusiva do `AppShell`.

---

## D4: Detecção do suporte a "Scanner" por câmera — capacidade + UA, não só capacidade

**Decision**: `suportaScannerCamera(userAgent, hasBarcodeDetector)` exige **ambos**: `'BarcodeDetector' in window` **e** a `userAgent` corresponder a Chrome em Android (`/Android/.test(ua) && /Chrome\//.test(ua) && !/Edg|OPR|SamsungBrowser/.test(ua)`, excluindo browsers baseados em Chromium que reescrevem a UA).

**Rationale**: `BarcodeDetector` já existe (ou pode existir por polyfill/flag) em outros contextos Chromium (desktop, outros Android WebViews) — mas `AD-086` é uma decisão **explícita** de escopo do usuário ("só funciona em Chrome no Android"), não uma decisão de capacidade técnica. Checar só `'BarcodeDetector' in window` exporia o botão em cenários fora do escopo decidido (ex.: Chrome desktop com a API disponível), violando `AD-090` (botão deve ficar ausente fora do escopo aprovado, não "ausente onde a API falhar").

**Alternatives considered**: checagem só por capacidade (`'BarcodeDetector' in window`) — descartada pelo motivo acima; checagem só por UA sem checar a API — descartada porque UA pode mentir/estar desatualizada (navegador Android antigo identificado como Chrome mas sem a API implementada); nesse caso a função ainda deve devolver `false` (a checagem de capacidade é o fallback de segurança).

---

## D5: Onde o "Scanner" injeta o código lido — mesmo pipeline `EntradaCodigo` do carrinho (003)

**Decision**: `ScannerCamera.tsx`, ao decodificar um código de barras, chama a mesma função pública de classificação/inserção que já processa entrada de leitor físico/digitação (`EntradaCodigo` → `carrinhoSlice.inserirItem`, `specs/003-carrinho-produto-precificacao/data-model.md` §7/§contracts), nunca um caminho de inserção próprio.

**Rationale**: `FR-007` do spec 007 exige exatamente isso ("mesmo caminho já usado para entrada via leitor físico ou digitação") — e é a aplicação direta do Constitution Check II (nenhuma lógica de negócio duplicada): a classificação de código simples/com-quantidade/balança já existe em `codigoProduto.ts` (003); `ScannerCamera` só produz a string decodificada e entrega à mesma porta de entrada, como se fosse um `Enter` no campo de bipagem.

**Alternatives considered**: `ScannerCamera` resolver o produto sozinha (chamando `GetProduto` diretamente) — descartada por duplicar a orquestração que `carrinhoSlice`/`produtoQueries` (003) já fazem, violando III e II.

---

## D6: Desativação de atalhos no mobile — ausência estrutural, não flag condicional

**Decision**: Nenhum componente dentro de `layout/mobile/` chama `useHotkeys`/monta `HotkeysProvider` com os escopos `venda-navegacao`/`venda-acao` (`.claude/skills/react-hotkeys-pdv/SKILL.md`). A árvore desktop (`layout/desktop/DesktopLayout.tsx`) é o único lugar que registra esses escopos.

**Rationale**: `MOB-05` pede desativação, e a forma mais robusta de "nunca disparar por engano" não é uma condicional em runtime (`if (isMobile) return` dentro de cada handler) — é o atalho simplesmente não existir naquela árvore. Isso também elimina qualquer risco de um atalho global vazar para o mobile por reexecução do componente.

**Alternatives considered**: registrar os hotkeys sempre e usar `enableScope`/`disableScope` condicionado a `useIsMobile()` — descartado por ser estritamente mais complexo (estado extra para sincronizar) sem ganho, já que nenhum atalho de venda precisa funcionar no mobile.
