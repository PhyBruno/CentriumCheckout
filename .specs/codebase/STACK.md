# Tech Stack

**Analyzed:** 2026-08-21 (pré-código — stack decidida, ainda não implementada; nenhuma versão de dependência foi fixada em `package.json` porque ele ainda não existe)

## Core

- Framework: React (via Vite)
- Language: TypeScript (`strict`)
- Runtime: navegador (SPA sem wrapper Electron/Tauri) para o frontend; Node.js para o BFF de sessão/autenticação (AD-022 em `.specs/project/STATE.md`)
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

BFF (Backend for Frontend) mínimo, introduzido em AD-022 (`.specs/project/STATE.md`) — sem lógica de negócio nem banco de dados; existe só para sessão/autenticação (troca de credenciais por `access_token`, cookie de sessão cifrado `HttpOnly`, proxy autenticado das chamadas ao ERP em `ApiCentriumOAuth.yaml`, ver `.specs/codebase/INTEGRATIONS.md`). Framework: Fastify (decidido em 2026-08-26, AD-071 em `.specs/project/STATE.md` — schema/validation nativo, alinhado à escolha de Zod na camada de validação), rodando no mesmo processo Node que serve os assets estáticos da SPA. O Checkout continua sem banco de dados próprio além do Dexie (cache local no navegador) — a sessão do BFF vive cifrada dentro do cookie, não em disco/Redis/DB.

## Validação

- Validação de fronteira: Zod — payload de bootstrap (~5MB), resposta de produto, resposta de TEF/PIX, resposta de finalização de venda.
- Aritmética monetária: centavos inteiros, sem lib externa (decidido em 2026-08-26, AD-071 em `.specs/project/STATE.md` — `dinero.js` descartado, suficiente para as regras de preço já mapeadas) — evita erro de ponto flutuante em preço/desconto/troco. Sobra de arredondamento distribuída pelo método do maior resto (AD-072).

## Testing

- Unit/Integration: Vitest + Testing Library
- E2E: Playwright
- Cobertura prioritária: lógica de precificação (crítica, ver `.specs/features/carrinho-produto-precificacao/spec.md`) e fluxo dourado ponta a ponta

## External Services

- ERP Centrium: API REST (`ApiCentriumOAuth.yaml`), autenticação OAuth password grant
- TEF: integração local HTTP (máquina do PDV)
- Impressão: servidor de impressão local HTTP (máquina do PDV)
- PIX: via API do ERP (não SSE — consulta ativa ao endpoint `StatusPIX`, confirmado no contrato desde AD-023 em `.specs/project/STATE.md` — ver `.specs/features/pagamento-pix/spec.md` `PAY-04`)

## Development Tools

- Empacotamento/execução: Docker (100% containerizado — dev com hot-reload via volume, produção com build multi-stage servido pelo processo Node do BFF mínimo — não Nginx, ver AD-022 em `.specs/project/STATE.md` e seção Backend acima).
- Imagem-base: `node:<version>-slim` (dev e produção).
- CI/CD produção: a cada merge na `master`, workflow do GitHub Actions builda a imagem e publica no Docker Hub.
- CI/CD dev: script PowerShell local que executa todo o processo de build e sobe a imagem, sem depender de Actions.
- Domínio base da API do ERP: variável de ambiente Docker `baseDomain` (ver AD-019 em `.specs/project/STATE.md`).
