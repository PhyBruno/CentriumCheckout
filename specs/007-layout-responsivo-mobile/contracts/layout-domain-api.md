# Contract: Domínio de Layout Responsivo

Superfície pública de `src/client/domain/layout/` e `src/client/layout/`. Não é uma API HTTP — esta feature não introduz nenhuma rota nova de `/api/erp/*` nem de servidor.

---

## 1. Domínio puro — `src/client/domain/layout/`

### `classificarLayout.ts`

```ts
export type ModoLayout = 'DESKTOP' | 'MOBILE';

export function classificarLayout(larguraViewportPx: number): ModoLayout;
```

Pura, sem `window`/React. `< 768` → `'MOBILE'`; `>= 768` → `'DESKTOP'` (`data-model.md` §1).

### `suportaScannerCamera.ts`

```ts
export function suportaScannerCamera(
  userAgent: string,
  hasBarcodeDetector: boolean,
): boolean;
```

Pura. `true` somente para Chrome em Android com `BarcodeDetector` presente (`data-model.md` §3).

---

## 2. Hook e leitura síncrona — `src/client/layout/`

### `useIsMobile.ts` (hook React)

```ts
export function useIsMobile(): boolean;
```

Único hook que conecta `classificarLayout` a `matchMedia('(max-width: 767.98px)')`, reativo a mudança de viewport (`research.md` D1). Não recebe parâmetros nem depende de nenhum slice do `vendaStore`. Só pode ser chamado dentro de um componente React (regras de hooks) — para leitura fora de React, ver `obterPlataforma.ts` abaixo.

### `obterPlataforma.ts` (AD-116, 2026-08-31) — **não é um hook**

```ts
export function obterPlataforma(): 'DESKTOP' | 'MOBILE';
```

Função plana, sem estado — `() => classificarLayout(window.innerWidth)`. Ponto de leitura síncrona do layout atual **fora de React**, para dependências injetadas que não são componentes (ex.: `capacidades().plataforma` do `pagamentoSlice`, `specs/008-pagamento-geral/contracts/pagamento-domain-api.md` §2). Não duplica o limiar de `useIsMobile` — reaproveita `classificarLayout`, só troca a fonte da largura (`window.innerWidth` em vez de `matchMedia`), equivalentes para larguras inteiras de viewport.

---

## 3. Composição de tela — `src/client/layout/`

```ts
// AppShell.tsx — único chamador de useIsMobile()
export function AppShell(): JSX.Element; // renderiza <DesktopLayout /> ou <MobileWizard />

// desktop/DesktopLayout.tsx
export function DesktopLayout(): JSX.Element;
// Compõe, sem alterar: grid de carrinho (003), campo/modal de cliente (005),
// campo/modal de vendedor (012), painel de pagamento (008), botões
// Finalizar/Cancelar Venda (004, AD-089), menu gerencial, modais de
// importação de DAV (006) e recuperação de NFCe (011, quando existir).

// mobile/MobileWizard.tsx
export interface MobileWizardProps {} // sem props — lê vendaStore diretamente, como o desktop
export function MobileWizard(): JSX.Element;
// Estado local (data-model.md §2): etapaAtual, etapasVisitadas.
// Compõe: EtapaClienteProdutos, EtapaPagamento, EtapaRevisao — nenhuma
// lógica de domínio própria, só navegação.

// mobile/ScannerCamera.tsx
export interface ScannerCameraProps {
  onCodigoLido(codigo: string): void; // chamado com o texto decodificado; o chamador (EtapaClienteProdutos) repassa a carrinhoSlice.inserirItem como { tipo: 'SIMPLES', codigo }
}
export function ScannerCamera(props: ScannerCameraProps): JSX.Element | null;
// Retorna null (não renderiza nada, nem versão desabilitada) quando
// suportaScannerCamera(navigator.userAgent, 'BarcodeDetector' in window) é false.
```

`ScannerCamera` nunca chama `carrinhoSlice` diretamente — devolve o código via `onCodigoLido`, e é o componente de etapa (que já tem acesso ao slice, como qualquer outro consumidor da feature 003) que decide como classificá-lo e inserir, preservando Dependency Inversion (nenhum componente de `layout/` importa `stores/slices/carrinhoSlice` diretamente).

---

## 4. O que este contrato garante às outras features

| Feature | Consome / é consumida |
|---|---|
| 003 — carrinho | `ScannerCamera` alimenta `EntradaCodigo`/`inserirItem`, sem caminho de inserção paralelo. Grid/entrada rápida de 003 são renderizadas sem alteração dentro de `DesktopLayout`/`EtapaClienteProdutos`. |
| 004 — finalização/suspensão | `DesktopLayout` e `EtapaRevisao` renderizam os gatilhos de UI que 004 vai expor (`FIN-001`/`FIN-002`, AD-089) — este plano não define a action/hook que 004 vai oferecer, só reserva o ponto de composição. |
| 005 — cliente | Campo/modal de cliente de 005 é renderizado sem alteração em `DesktopLayout` e `EtapaClienteProdutos`. |
| 008 — pagamento | `EtapaPagamento` compõe o painel de pagamento de 008 **inteiro**, TEF incluído — desde AD-144 (2026-09-03) não há exclusão de integração por layout, e esta feature não injeta mais `plataforma` nas capacidades de pagamento. |
| 012 — vendedor | Campo/modal de vendedor de 012 é renderizado sem alteração em `DesktopLayout` e `EtapaClienteProdutos` (`VEND-*`). |
| 006 — importação de DAV / 011 — recuperação de NFCe | Renderizados **apenas** dentro de `DesktopLayout` — `MobileWizard` e suas etapas nunca importam esses componentes (`FR-008`, AD-046). |
