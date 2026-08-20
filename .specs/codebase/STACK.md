# Tech Stack

**Analyzed:** 2026-08-20 (pré-código — stack decidida, ainda não implementada; nenhuma versão de dependência foi fixada em `package.json` porque ele ainda não existe)

## Core

- Framework: React (via Vite)
- Language: TypeScript (`strict`)
- Runtime: navegador (SPA sem wrapper Electron/Tauri)
- Package manager: a definir na criação do `package.json`

## Frontend

- UI Framework: React + Vite
- Styling/Design system: shadcn/ui, seguindo tokens do design aprovado no Pencil (Ver C:\CentriumCheckout\design)
- Ícones: Lucide
- Skeletons de carregamento: Boneyard (modais que carregam dados da API, ex.: busca de produto)
- Notificações (toast): Goey Toast
- Navegação por teclado: react-hotkeys-hook (desativado no layout mobile — ver `.specs/features/layout-responsivo-mobile/spec.md`)
- State Management (venda em andamento): Zustand + Immer, sem `persist` (ver AD-006 em `.specs/project/STATE.md`)
- Server state / cache: TanStack Query (produtos, formas de pagamento — dados vindos do ERP)
- Persistência local: Dexie.js (IndexedDB) — só para o payload de bootstrap (configurações/flags do tenant), não para a venda em andamento

## Backend

Não há backend próprio — o Checkout consome diretamente a API do ERP (`ApiCentriumOAuth.yaml`, ver `.specs/codebase/INTEGRATIONS.md`). Não há banco de dados do lado do Checkout além do Dexie (cache local no navegador).

## Validação

- Validação de fronteira: Zod — payload de bootstrap (~5MB), resposta de produto, resposta de TEF/PIX, resposta de finalização de venda.
- Aritmética monetária: valores em centavos (inteiros) ou lib tipo `dinero.js` — evita erro de ponto flutuante em preço/desconto/troco.

## Testing

- Unit/Integration: Vitest + Testing Library
- E2E: Playwright
- Cobertura prioritária: lógica de precificação (crítica, ver `.specs/features/carrinho-produto-precificacao/spec.md`) e fluxo dourado ponta a ponta

## External Services

- ERP Centrium: API REST (`ApiCentriumOAuth.yaml`), autenticação OAuth password grant
- TEF: integração local HTTP (máquina do PDV)
- Impressão: servidor de impressão local HTTP (máquina do PDV)
- PIX: via API do ERP (não SSE — consulta ativa por `StatusPIX`)

## Development Tools

- Empacotamento/execução: Docker (100% containerizado — dev com hot-reload via volume, produção com build multi-stage servido por Nginx ou equivalente)
