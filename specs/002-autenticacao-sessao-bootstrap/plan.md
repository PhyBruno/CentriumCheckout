# Implementation Plan: Autenticação, Sessão e Bootstrap

**Branch**: `docs/plan-autenticacao-sessao-bootstrap` | **Date**: 2026-08-26 | **Spec**: `specs/002-autenticacao-sessao-bootstrap/spec.md`

**Input**: Feature specification from `specs/002-autenticacao-sessao-bootstrap/spec.md`, complementada pela especificação de domínio mais detalhada em `.specs/features/autenticacao-sessao-bootstrap/spec.md` (contratos de API, payloads, nomes de header/query param) e pelas decisões arquiteturais já registradas em `.specs/project/STATE.md` (AD-019, AD-022, AD-044, AD-045, AD-049, AD-054, AD-071).

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Um BFF mínimo (Node/Fastify, sem lógica de negócio, sem banco de dados — AD-022) intermedia toda a sessão do operador: recebe o redirecionamento do ERP em `GET /session/start` com credenciais + `validationKey`, troca essas credenciais por `access_token` via `POST /oauth/access_token` do ERP, cifra token + credenciais originais num cookie `HttpOnly`/`Secure`/`SameSite=Lax` (chave de servidor `SESSION_SECRET`), e redireciona para a SPA sem nenhum parâmetro sensível na URL. A SPA então chama `GET /api/bootstrap` (mesma origem) para obter a configuração do tenant (~5MB, via `GetSessao` do ERP), parseia/valida em Web Worker e persiste no Dexie com chave incluindo `tenant` e hash de versão calculado localmente — evitando re-download em F5 sem mudança. Toda chamada de negócio subsequente passa por `/api/erp/*` (proxy do BFF), que renova o `access_token` sozinho em caso de `401`, de forma transparente ao JS; se a renovação falhar, o BFF invalida o cookie e o frontend avisa o operador (mensagem equivalente a `beforeunload`) antes de encerrar, caso haja venda em digitação.

## Technical Context

**Language/Version**: TypeScript `strict` em todo o código (frontend e BFF) — Node.js (versão LTS a fixar no `package.json`, imagem `node:<version>-slim`) para o BFF; React 19 + Vite para o frontend.

**Primary Dependencies**: Fastify (BFF, AD-071); Zod (validação de fronteira — payload de bootstrap, resposta do `/oauth/access_token`); React + Vite, Zustand + Immer (estado de UI efêmero desta feature — sem estado de venda envolvido), TanStack Query (não usado diretamente nesta feature — bootstrap vai para Dexie, não para cache de query), Dexie.js (persistência do payload de bootstrap), Boneyard (skeleton da tela de carregamento bloqueante, AD-005/AD-007).

**Storage**: Dexie (IndexedDB) para o payload de bootstrap normalizado, chaveado por `tenant`, com hash/versão calculado localmente para evitar re-fetch. Nenhum banco de dados do lado do servidor — a sessão inteira vive cifrada dentro do cookie `HttpOnly` (sem Redis/disco/DB no BFF).

**Testing**: Vitest + Testing Library (unit/integration — parse/validação Zod do bootstrap, lógica de decisão de reuso de cache Dexie por hash); Playwright (E2E — fluxo completo: redirect do ERP → cookie setado → tela de carregamento → tela de venda liberada; simulação de expiração de token com carrinho populado → aviso antes de encerrar sessão).

**Target Platform**: Navegador (Chrome, prioritário — mesma restrição de Local Network Access documentada em `.specs/codebase/INTEGRATIONS.md` para outras features) servido via HTTPS a partir do domínio do ERP; BFF roda em container Docker (Node) no mesmo processo que serve os assets estáticos da SPA (não há Nginx separado).

**Project Type**: Aplicação web com um processo servidor único (BFF Fastify) servindo tanto a API de sessão/proxy quanto os assets estáticos da SPA — não é o padrão "frontend/backend como dois projetos deployados separadamente" do template genérico; ver "Structure Decision" abaixo.

**Performance Goals**: Bootstrap (~5MB) parseado/validado em Web Worker para não bloquear a thread principal; tela de venda só é liberada após o Dexie confirmar a gravação (sem meta de latência numérica definida na spec — o requisito é "completo antes de liberar", não um SLA de tempo).

**Constraints**: Nenhuma credencial sensível (`client_secret`, `password`, `access_token`) pode ser acessível a JavaScript no navegador em nenhum momento (FR-002/SC-004); renovação de sessão nunca pode interromper uma venda em digitação (FR-005/SC-003); cache do Dexie deve isolar tenants diferentes que compartilhem o mesmo navegador/máquina (FR-009).

**Scale/Scope**: 3 rotas expostas pelo BFF (`GET /session/start`, `GET /api/bootstrap`, `/api/erp/*` proxy) + 1 fluxo de renovação silenciosa + 1 tela de carregamento bloqueante (skeleton). Escopo desta feature não inclui as telas de negócio que consomem `/api/erp/*` (carrinho, pagamento, etc. — features separadas).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Avaliação |
|---|---|
| I. Spec-Driven Development | ✅ Este plano é o resultado de `/speckit-plan` sobre `specs/002-autenticacao-sessao-bootstrap/spec.md`, seguindo a sequência obrigatória. |
| II. Arquitetura SOLID | ✅ Não avaliável em detalhe nesta fase (sem código ainda) — a "Structure Decision" abaixo já separa responsabilidades (sessão/proxy no BFF; UI de carregamento e leitura de bootstrap no frontend) para permitir SOLID na implementação. Revalidar na fase `/speckit-tasks`/`/speckit-implement`. |
| III. ERP como Fonte Única de Verdade | ✅ O BFF não duplica nem reimplementa lógica de negócio — só troca credenciais por token e faz proxy. A configuração do tenant vem inteiramente do `GetSessao` do ERP, sem transformação de regra de negócio no Checkout. |
| IV. Tipagem Estrita e Validação de Fronteira | ✅ Zod valida o payload de bootstrap (~5MB) e a resposta de `/oauth/access_token` na fronteira, antes de entrar no domínio da aplicação (FR-003, AUTH-03/AUTH-04). |
| V. Precisão Monetária Inegociável | N/A — esta feature não envolve cálculo de preço/pagamento. |
| VI. Sem Estado de Venda Persistido no Cliente | ✅ Esta feature não introduz persistência de venda — o único dado persistido (Dexie) é configuração de tenant/PDV, exceção já prevista na constitution. Cookie de sessão fica no servidor (BFF), nunca em `localStorage`/`sessionStorage`. |

Nenhuma violação identificada. Nenhuma entrada necessária em "Complexity Tracking".

## Project Structure

### Documentation (this feature)

```text
specs/002-autenticacao-sessao-bootstrap/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   └── session-bff-api.md
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── client/                  # SPA React (build via Vite)
│   ├── features/
│   │   └── session-bootstrap/
│   │       ├── LoadingSkeleton.tsx   # tela de carregamento bloqueante (Boneyard, AUTH-05)
│   │       └── ErrorRetry.tsx        # tela de erro não-401 com "Tentar novamente" (AUTH-07)
│   ├── stores/
│   │   └── sessionStore.ts           # estado efêmero de bootstrap (loading/error/ready), Zustand sem persist
│   └── services/
│       └── bootstrapClient.ts        # chama GET /api/bootstrap, valida com Zod, grava no Dexie
├── server/                   # BFF (Fastify) — só sessão/autenticação, sem lógica de negócio (AD-022)
│   ├── routes/
│   │   ├── session-start.ts          # GET /session/start
│   │   ├── bootstrap.ts              # GET /api/bootstrap
│   │   └── erp-proxy.ts              # /api/erp/* (proxy + renovação silenciosa)
│   ├── session/
│   │   ├── cookie.ts                 # cifra/decifra cookie HttpOnly (SESSION_SECRET)
│   │   └── tokenExchange.ts          # POST /oauth/access_token (obtenção e renovação)
│   └── config/
│       └── env.ts                    # baseDomain, validationKey, SESSION_SECRET (variáveis Docker)
└── shared/
    └── schemas/
        └── bootstrap.schema.ts       # schema Zod do payload de GetSessao/bootstrap

tests/
├── unit/
│   └── server/session/               # cifra/decifra cookie, montagem de host por tenant
├── integration/
│   └── bootstrap-cache.spec.ts       # reuso de cache Dexie por hash/versão, isolamento por tenant
└── e2e/
    └── auth-bootstrap.spec.ts        # fluxo completo: redirect ERP → cookie → skeleton → tela liberada
```

**Structure Decision**: Não se aplica nenhuma das três opções padrão do template (não é single-project nem "frontend/backend como dois projetos deployados separadamente", nem mobile+API). A arquitetura já decidida em `.specs/codebase/ARCHITECTURE.md`/`STACK.md` é um **único processo Node (BFF Fastify)** servindo tanto a API de sessão/proxy quanto os assets estáticos compilados da SPA, dentro do mesmo container Docker — por isso `src/client/` e `src/server/` convivem no mesmo repositório/processo em vez de dois projetos separados. Esta é a primeira feature a propor a árvore de diretórios inicial do projeto (`.specs/project/ROADMAP.md` registra que `STRUCTURE.md` só será gerado formalmente depois que o scaffolding existir); a estrutura acima cobre só os módulos desta feature — as demais features (carrinho, pagamento etc.) adicionam seus próprios diretórios sob `src/client/features/` sem alterar esta decisão de organização.

## Complexity Tracking

> Nenhuma violação de Constitution Check identificada nesta fase — seção não preenchida.
