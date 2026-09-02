---

description: "Task list template for feature implementation"
---

# Tasks: Autenticação, Sessão e Bootstrap

**Input**: Design documents from `specs/002-autenticacao-sessao-bootstrap/` (`plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/session-bff-api.md`, `quickstart.md`)

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Tests**: Incluídos — `plan.md` define explicitamente Vitest+Testing Library e Playwright com arquivos-alvo (`tests/unit/server/session/`, `tests/integration/bootstrap-cache.spec.ts`, `tests/e2e/auth-bootstrap.spec.ts`), e `quickstart.md` mapeia 5 cenários E2E concretos — não é um caso ambíguo de "só incluir se pedido explicitamente".

**Organization**: Tarefas agrupadas pelas 3 user stories da spec (todas P1) — US1 (login automático), US2 (bootstrap completo antes da tela de venda), US3 (renovação de sessão sem interromper venda).

**Nota de contexto**: Esta é a primeira feature do projeto — não existe ainda scaffolding (`package.json`, `tsconfig.json`, etc.). A Fase 1 (Setup) cria a árvore de diretórios e configuração inicial descrita em `plan.md` § Project Structure, que as demais features reaproveitarão sem recriar.

**⚠️ Ordem de implementação** (atualizado 2026-08-31, achados I1/I2 do `/speckit-analyze`): as Fases 1-2 (Setup/Foundational) desta feature devem ser implementadas **antes** da `001` (auditoria) — a Fase 1 da 001 cria subdiretórios dentro de `src/client/`, que só existe depois que a Fase 1 desta feature terminar (ver `specs/001-auditoria-acoes-operador/tasks.md`, nota "Pré-requisito de ordem de implementação"). Na direção oposta, a **Fase 5 (US3)** desta feature — que precisa ler o carrinho da venda em andamento para decidir se avisa o operador antes de encerrar a sessão (FR-006) — depende de `vendaStore.ts` (criado pela Foundational da feature **001**, T003) e do slice de carrinho (`carrinhoSlice.ts`, criado pela Foundational da feature **003**, T009 — ver `specs/003-carrinho-produto-precificacao/tasks.md`). **Ordem prática resultante**: 002 (Fases 1-2) → 001 → 003 (ao menos T009) → 002 (Fase 5, US3). As Fases 3-4 desta feature (US1/US2) não têm essa dependência e seguem a sequência normal logo após a Fase 2.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência de tarefas incompletas)
- **[Story]**: A qual user story a tarefa pertence (US1, US2, US3)
- Caminhos de arquivo exatos em cada descrição

## Path Conventions

Estrutura de único processo Node (BFF Fastify + SPA no mesmo container) — ver `plan.md` § Project Structure / Structure Decision:

```text
src/client/    # SPA React (Vite)
src/server/    # BFF Fastify
src/shared/    # Schemas Zod compartilhados
tests/unit/ | tests/integration/ | tests/e2e/
```

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Criar o scaffolding inicial do projeto (primeira feature a fazê-lo — ver `plan.md` § Structure Decision).

- [X] T001 Inicializar `package.json` (TypeScript `strict`), `tsconfig.json`, `.gitignore` e ESLint/Prettier na raiz do repositório
- [X] T002 [P] Configurar Vite para a SPA React em `vite.config.ts`, com `index.html` e `src/client/main.tsx`/`src/client/App.tsx` placeholder
- [X] T003 [P] Criar entrypoint do BFF Fastify em `src/server/index.ts` (registra rotas, serve assets estáticos compilados da SPA em produção)
- [X] T004 [P] Criar `Dockerfile` (multi-stage: build da SPA + processo Node do BFF) e `docker-compose.yml` de dev (hot-reload via volume) — variáveis `baseDomain`, `validationKey`, `SESSION_SECRET`
- [X] T005 [P] Configurar Vitest + Testing Library em `vitest.config.ts`
- [X] T006 [P] Configurar Playwright em `playwright.config.ts`
- [X] T007 Criar árvore de diretórios vazia conforme `plan.md` § Project Structure (`src/client/features/`, `src/client/stores/`, `src/client/db/`, `src/client/services/`, `src/server/routes/`, `src/server/session/`, `src/server/config/`, `src/shared/schemas/`, `tests/unit/`, `tests/integration/`, `tests/e2e/`)

**Checkpoint**: Projeto inicializa (`npm run dev` sobe Vite + Fastify vazios), suíte de testes roda (vazia).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Módulos de sessão server-side usados pelas 3 user stories — nenhuma pode ser implementada sem eles.

**⚠️ CRITICAL**: Nenhuma user story pode começar até esta fase terminar.

- [X] T008 Criar módulo de configuração de ambiente em `src/server/config/env.ts` (lê `baseDomain`, `validationKey`, `SESSION_SECRET` de `process.env`, falha rápido se ausente)
- [X] T009 [P] Criar schema Zod da resposta de `POST /oauth/access_token` em `src/shared/schemas/token-response.schema.ts` (campo `access_token` obrigatório, demais campos conforme contrato OAuth do ERP em `.specs/codebase/INTEGRATIONS.md`) — **adicionado 2026-08-31 (achado C1 do `/speckit-analyze`)**: fecha a lacuna de validação de fronteira exigida pela Constitution IV para toda resposta externa do ERP, inclusive a de troca/renovação de token
- [X] T010 [P] Implementar cifra/decifra do cookie de sessão em `src/server/session/cookie.ts` (usa `SESSION_SECRET` de T008; cookie `HttpOnly`/`Secure`/`SameSite=Lax`; campos conforme `data-model.md` § Sessão do Operador: `access_token`, `tenant`, `client_id`, `client_secret`, `username`, `password`, `Repository`, `codigoEmpresa`)
- [X] T011 Implementar troca/renovação de token em `src/server/session/tokenExchange.ts` (`POST /oauth/access_token`, `grant_type=password`, `additionalParameters={"AuthenticationTypeName":"local","Repository":"<Repository>"}`, host `tenant.<baseDomain>` de T008; **valida a resposta com o schema de T009 antes de repassá-la ao chamador**) — função reaproveitada tanto pelo login inicial (US1) quanto pela renovação silenciosa em 401 (US2/US3) (depende de T008, T009)

**Checkpoint**: Módulos de sessão prontos — implementação das user stories pode começar.

---

## Phase 3: User Story 1 - Entrada automática vindo do ERP (Priority: P1) 🎯 MVP

**Goal**: Operador acionado a partir do ERP chega ao Checkout sem digitar credenciais, e nenhum dado sensível aparece na URL final.

**Independent Test**: Acionar o Checkout a partir do ERP (ou simular o redirect) e verificar tela de venda liberada sem campo de login, com `Set-Cookie` presente e URL de destino limpa.

### Tests for User Story 1

- [X] T012 [P] [US1] Unit test da cifra/decifra do cookie (round-trip, campos íntegros) em `tests/unit/server/session/cookie.spec.ts`
- [X] T013 [P] [US1] Unit test da troca inicial de token (`tokenExchange`, grant inicial, valida resposta com o schema de T009) em `tests/unit/server/session/tokenExchange.spec.ts`

### Implementation for User Story 1

- [X] T014 [US1] Implementar rota `GET /session/start` em `src/server/routes/session-start.ts` (valida `validationKey` contra T008 sem chamar o ERP se inválida; monta host `tenant.baseDomain`; chama T011; cifra resposta com T010; responde `302` para URL limpa da SPA — ver `contracts/session-bff-api.md`)
- [X] T015 [US1] Registrar rota `session-start` em `src/server/index.ts`
- [X] T016 [US1] E2E — Cenário 1 do quickstart (redirect ERP → `302` com `Set-Cookie`, URL sem query params sensíveis; `validationKey` inválida → `401` sem chamar o mock do ERP) em `tests/e2e/auth-bootstrap.spec.ts`

**Checkpoint**: User Story 1 funcional e testável de forma independente — login automático completo (FR-001, FR-002, SC-001, SC-004 para esta rota).

---

## Phase 4: User Story 2 - Tela principal só aparece com tudo carregado (Priority: P1)

**Goal**: A tela de venda só é liberada depois que toda a configuração do PDV (formas de pagamento, condições, terminal) termina de carregar; F5 sem mudança reaproveita o cache.

**Independent Test**: Observar que a tela de venda nunca aparece parcialmente configurada; recarregar (F5) sem mudança no mock e confirmar zero chamadas de rede novas a `/api/bootstrap`.

### Tests for User Story 2

- [X] T017 [P] [US2] Unit test do schema Zod de bootstrap (payload válido/inválido) em `tests/unit/shared/bootstrap.schema.spec.ts`

### Implementation for User Story 2

- [X] T018 [P] [US2] Criar schema Zod do payload de bootstrap em `src/shared/schemas/bootstrap.schema.ts` — campos conforme `data-model.md` § Configuração do Ponto de Venda: `tenant`, `codigoEmpresa`, `SessaoUsuario.TipoPreco` (integer 1–11), `SessaoUsuario.CadMaqCod` (string), `SessaoUsuario.ListaPrecoDefault` (integer), `SessaoUsuario.CenarioPagamento` (string, repassada sem reformatar — validação estrutural é da feature 013), `SessaoUsuario.QtdMinCharParaConsulta` (integer ≥ 1), `SessaoUsuario.UsuarioTipoCodigoProduto` (string) e `SessaoUsuario.ClienteDefaultCodigo` (integer) — estes três acrescentados em 2026-09-02 pela implementação da feature 003 (AD-119), que os consome em `GetProduto`/`GetListaProdutos`
- [X] T019 [US2] Implementar rota `GET /api/bootstrap` em `src/server/routes/bootstrap.ts` (decifra cookie com T010; chama `GET /ApiCentriumOAuth/GetSessao` com `Authorization`/`Empresa`/`Login`; em `401` tenta renovação via T011 antes de responder; outros erros repassados como estão — ver `contracts/session-bff-api.md`)
- [X] T020 [US2] Registrar rota `bootstrap` em `src/server/index.ts`
- [X] T021 [P] [US2] Criar módulo Dexie em `src/client/db/bootstrapDb.ts` (tabela chaveada por `tenant`, campos de `data-model.md` + `_versionHash` calculado localmente)
- [X] T022 [US2] Criar Web Worker de parse/validação em `src/client/services/bootstrapWorker.ts` (valida payload com o schema de T018 fora da thread principal, ~5MB)
- [X] T023 [US2] Implementar `src/client/services/bootstrapClient.ts` (chama `GET /api/bootstrap`, delega ao worker de T022, calcula `_versionHash`, decide reuso vs. gravação no Dexie de T021, FR-008)
- [X] T024 [US2] Implementar `src/client/stores/sessionStore.ts` (Zustand, sem `persist` — estados `carregando`/`pronto`/`erro-recuperável`/`reaproveitado` de `data-model.md`)
- [X] T025 [P] [US2] Implementar `src/client/features/session-bootstrap/LoadingSkeleton.tsx` (Boneyard, AUTH-05)
- [X] T026 [P] [US2] Implementar `src/client/features/session-bootstrap/ErrorRetry.tsx` (erro não-401, botão "Tentar novamente", AUTH-07 — sem forçar novo login)
- [X] T027 [US2] Orquestrar em `src/client/App.tsx`: dispara `bootstrapClient` (T023) no mount, alterna `LoadingSkeleton`/`ErrorRetry`/tela de venda conforme `sessionStore` (T024), libera a tela de venda só após confirmação de gravação no Dexie
- [X] T028 [US2] Integration tests — reuso de cache por hash (Cenário 2 passo 4) e isolamento por tenant (Cenário 3, FR-009) em `tests/integration/bootstrap-cache.spec.ts`
- [X] T029 [US2] E2E — Cenário 2 (skeleton até resposta, tela liberada, registro Dexie por `tenant`, F5 sem nova chamada) e Cenário 4 (falha `500` → tela "Tentar novamente") em `tests/e2e/auth-bootstrap.spec.ts`

**Checkpoint**: User Stories 1 e 2 funcionam juntas — login automático + bootstrap completo antes da venda (FR-003 a FR-004, FR-008, FR-009, SC-002).

---

## Phase 5: User Story 3 - Sessão renovada sem interromper a venda (Priority: P1)

**Goal**: Expiração de sessão durante o uso normal é resolvida silenciosamente; só quando a renovação falha a sessão é encerrada, com aviso prévio se houver venda em digitação.

**Independent Test**: Forçar expiração de sessão durante uma venda em andamento e confirmar que a operação continua sem exigir novo login; forçar falha de renovação com carrinho vazio (encerra direto) e com itens (avisa antes).

**⚠️ Depende de** (fora desta feature, achado I1 do `/speckit-analyze`, 2026-08-31): `vendaStore.ts` (feature 001, Foundational T003) e o slice de carrinho da venda (`carrinhoSlice.ts`, feature 003, Foundational T009 — ver `specs/003-carrinho-produto-precificacao/tasks.md`) — T033/T035 abaixo leem esse carrinho, em modo **somente leitura**, para decidir se avisam o operador antes de encerrar a sessão (FR-006). Ver a nota "Ordem de implementação" no topo deste documento — a validação de ponta a ponta desta fase (T036) só fecha depois que 001 e 003 (ao menos T009) existirem.

### Tests for User Story 3

- [X] T030 [P] [US3] Unit test da renovação de token em `401` (sucesso e falha; valida resposta com o schema de T009) em `tests/unit/server/session/tokenExchange.spec.ts` — **implementado em `tests/unit/server/session/chamadaAutenticada.spec.ts`**: a renovação em `401` não vive em `tokenExchange.ts` (que só faz o grant), e sim em `src/server/session/chamadaAutenticada.ts`, extraído porque T019 e T031 exigem exatamente o mesmo comportamento (Constitution II); o teste acompanha o módulo testado

### Implementation for User Story 3

- [X] T031 [US3] Implementar rota de proxy `/api/erp/*` em `src/server/routes/erp-proxy.ts` (injeta `Authorization`/`Empresa` do cookie decifrado via T010; em `401` do ERP chama renovação via T011, regrava cookie, refaz a chamada original; se a renovação falhar, invalida o cookie e responde `401` — ver `contracts/session-bff-api.md`)
- [X] T032 [US3] Registrar rota `erp-proxy` (catch-all) em `src/server/index.ts`
- [X] T033 [US3] Criar `src/client/services/erpClient.ts` (wrapper de fetch para `/api/erp/*`; ao receber `401` terminal do BFF, consulta — só leitura — o carrinho em `vendaStore.ts`, feature 001/003, antes de decidir a mensagem)
- [X] T034 [US3] Implementar `src/client/features/session-bootstrap/SessionExpiredWarning.tsx` (reaproveita o padrão de diálogo `beforeunload` já validado, AD-044/AUTH-06 — avisa que a sessão será encerrada e a venda pode ser perdida)
- [X] T035 [US3] Conectar em `src/client/services/erpClient.ts`/`src/client/App.tsx`: `401` terminal com carrinho vazio → mensagem "reabra pelo ERP" e encerra; com carrinho com itens → exibe `SessionExpiredWarning` (T034) antes de encerrar (FR-006) — lê `vendaStore.ts` (feature 001/003) somente leitura, nunca modifica
- [ ] T036 [US3] E2E — Cenário 5 completo (renovação silenciosa sem carrinho, falha de renovação sem carrinho, falha de renovação com carrinho + aviso) em `tests/e2e/auth-bootstrap.spec.ts` — só roda de ponta a ponta depois que `vendaStore.ts` (001) e o slice de carrinho (003) existirem. **Parcial em 2026-09-01:** os dois primeiros casos estão implementados e passando; o terceiro (falha de renovação **com carrinho populado** → `SessionExpiredWarning`) continua aberto, pois exige a venda em andamento das features 001/003. O caminho já está pronto dos dois lados: `App.tsx` decide pelo `itensNaVenda` e `erpClient.ts` expõe a porta `LeitorCarrinho` — fechar esta tarefa é injetar o leitor real e acrescentar o caso ao spec

**Checkpoint**: As 3 user stories funcionam de forma independente e integrada — feature completa (FR-005, FR-006, SC-003).

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Fechamento documental e validação final de tipo/segurança/aceite.

- [X] T037 [P] Atualizar `.specs/codebase/ARCHITECTURE.md` § Code Organization e `.specs/project/ROADMAP.md` registrando que o scaffolding inicial foi criado por esta feature
- [X] T038 Rodar `npx tsc --noEmit` e confirmar zero erros de tipo — gate obrigatório da Constitution (`Development Workflow`, "Gates obrigatórios antes de push/merge") — **adicionado 2026-08-31 (achado G1 do `/speckit-analyze`)**
- [X] T039 Revisão de segurança (SC-004): confirmar por inspeção de código e nas respostas de `/api/bootstrap`/`/api/erp/*`/erros que `access_token`, `client_secret` e `password` nunca são serializados para o cliente
- [X] T040 Rodar os 5 cenários de `quickstart.md` ponta a ponta e confirmar o critério de aceite da feature

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Sem dependências — pode começar imediatamente
- **Foundational (Phase 2)**: Depende do Setup — BLOQUEIA todas as user stories
- **User Stories (Phase 3-5)**: Todas dependem do Foundational
  - US1 pode começar assim que Phase 2 terminar
  - US2 depende do cookie de sessão existir (US1) para o quickstart fim-a-fim, mas sua implementação de rota/cliente pode ser codificada em paralelo — testar em conjunto exige US1 completo
  - US3 depende de T011 (Foundational) e reaproveita o padrão de proxy — mas T033/T035/T036 também dependem de `vendaStore.ts` (feature 001) e do slice de carrinho `carrinhoSlice.ts` (feature 003, T009) — não pode ser validada de ponta a ponta antes de 001 e 003 (ao menos T009) existirem
- **Polish (Phase 6)**: Depende das 3 user stories completas

### User Story Dependencies

- **US1 (P1)**: Sem dependência de outras stories
- **US2 (P1)**: Depende de Foundational; integração E2E completa pressupõe US1 (cookie já setado)
- **US3 (P1)**: Depende de Foundational (T011); integração E2E completa pressupõe US2 (chamada de negócio via `/api/erp/*` só existe depois do bootstrap) **e** de `vendaStore.ts`/slice de carrinho fora desta feature (001/003)

### Within Each User Story

- Tests antes da implementação correspondente
- Módulos server-side antes das rotas que os usam
- Rotas antes do registro em `src/server/index.ts`
- Serviços/cliente antes dos componentes de UI que os consomem
- Story completa antes do checkpoint

### Parallel Opportunities

- T002–T006 (Setup) em paralelo
- T009–T010 (Foundational) em paralelo após T008
- T012–T013 (testes US1) em paralelo
- T017–T018 podem ser paralelos entre si dentro de US2 (arquivos diferentes)
- T021, T025, T026 em paralelo dentro de US2 (arquivos diferentes, sem dependência entre si)
- T030 pode rodar em paralelo a outras tarefas de US3 que não toquem o mesmo arquivo

---

## Parallel Example: User Story 2

```bash
# Schema e teste do schema (arquivos diferentes):
Task: "Criar schema Zod do payload de bootstrap em src/shared/schemas/bootstrap.schema.ts"
Task: "Unit test do schema Zod de bootstrap em tests/unit/shared/bootstrap.schema.spec.ts"

# Componentes de UI independentes:
Task: "Implementar LoadingSkeleton.tsx em src/client/features/session-bootstrap/LoadingSkeleton.tsx"
Task: "Implementar ErrorRetry.tsx em src/client/features/session-bootstrap/ErrorRetry.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Completar Phase 1: Setup
2. Completar Phase 2: Foundational (bloqueia tudo)
3. Completar Phase 3: User Story 1
4. **PARAR e VALIDAR**: login automático funcionando isoladamente (mock de ERP)
5. Nesse ponto o operador ainda não teria tela de venda real (depende de US2), mas o mecanismo de sessão está validável

### Incremental Delivery

1. Setup + Foundational → base pronta
2. US1 → validar isoladamente (Cenário 1 do quickstart)
3. US2 → validar isoladamente + em conjunto com US1 (Cenários 2, 3, 4)
4. US3 → implementação de rota/proxy (T031–T035) pode avançar assim que Foundational terminar, mas a validação de ponta a ponta (T036, Cenário 5) só fecha depois que `vendaStore.ts` (001) e o slice de carrinho (003) existirem — feature completa

### Parallel Team Strategy

Com mais de um desenvolvedor: completar Setup + Foundational juntos; depois um desenvolvedor segue com US1, outro inicia a implementação de rota/schema de US2 em paralelo (sem poder validar E2E até US1 fechar); US3 pode começar assim que T011 estiver pronto, mas seu checkpoint final depende de 001/003.

---

## Notes

- [P] = arquivos diferentes, sem dependências
- [Story] mapeia cada tarefa à user story correspondente para rastreabilidade
- Verificar que os testes falham antes de implementar (TDD onde aplicável)
- Commit após cada tarefa ou grupo lógico
- Parar em cada checkpoint para validar a story isoladamente
- Achados do `/speckit-analyze` de 2026-08-31 (C1, I1, I2, G1) já aplicados nesta versão — ver `plan.md` para o mesmo histórico de correção

---

## Notas de implementação (`/speckit-implement`, 2026-09-01)

Decisões tomadas durante a implementação que não estavam fixadas nos artefatos de design. Cada uma vale como registro para `/speckit-analyze` e para as features seguintes.

1. **Módulo `src/server/session/chamadaAutenticada.ts` (novo, não previsto no `plan.md`).** T019 e T031 descrevem o mesmo comportamento de renovação em `401`. Implementá-lo duas vezes violaria Single Responsibility e criaria duas razões para mudar a mesma regra, então ele foi extraído para um módulo próprio, consumido pelas duas rotas. `plan.md` § Project Structure precisa ganhar esta entrada.

2. **`ETag`/`If-None-Match` em `GET /api/bootstrap` — resolvido em 2026-09-02.** O texto original do `quickstart.md` (Cenário 2, passo 4) pedia "nenhuma nova chamada de rede a `/api/bootstrap`" no F5, mas AD-022 proíbe o JS de descobrir o `tenant` por qualquer via que não seja essa mesma rota — sem o `tenant`, a SPA não tem como escolher o registro do Dexie antes de chamar. A implementação já resolvia o objetivo real (FR-008/AD-045: não retransmitir os ~5MB) enviando em `If-None-Match` os hashes que a SPA tem, com o BFF respondendo `304` sem corpo quando um deles bate. Decisão do usuário: ajustar o texto do quickstart para descrever o comportamento real (há requisição no F5, mas sem payload) em vez de mudar a implementação — `quickstart.md` Cenário 2 passo 4 corrigido.

3. **`ERP_HOST_OVERRIDE` e `ERP_PROTOCOL` em `env.ts`.** Não estavam previstos. `ERP_PROTOCOL` é necessário para falar com um ERP mockado em HTTP; `ERP_HOST_OVERRIDE` existe porque subdomínios de `localhost` não resolvem em todos os sistemas operacionais (confirmado neste ambiente: `acme.localhost` → `ENOTFOUND`), o que impediria rodar os cenários do `quickstart.md`. Ambos documentados em `.env.example` como exclusivos de dev/teste.

4. **Divergência de contrato — `Empresa` header vs. query — resolvida em 2026-09-02 (AD-118).** A spec de domínio (`AUTH-03`) e `contracts/session-bff-api.md` mandam enviar `Empresa` como **header** e `Login` como query em `GetSessao`. O `ApiCentriumOAuth.yaml` (versão `20260827192357`, linhas 17-29) declara **ambos como query params**. Inspeção direta do código-fonte real da KB do GeneXus confirmou: a declaração `WebServices` do objeto `APICentriumOAuth` usa o binding GET padrão (todo `in` sem anotação vira query, é isso que o `.yaml` reflete), mas o evento `GetSessao.Before` sobrescreve `&Empresa` lendo do header cru (`&HttpRequest.GetHeader('empresa')`), com uma validação que exige explicitamente "Cabeçalho de Empresa" — mesmo padrão nos outros oito eventos da API. A spec/implementação (header `Empresa` + query `Login`) estava certa; o `.yaml` é quem está desatualizado nesse ponto. Nenhuma mudança de código necessária — ver AD-118 em `.specs/project/STATE.md`.

5. **Caminho de `POST /oauth/access_token`.** A spec usa `/oauth/access_token` na raiz do host do tenant; o `securityScheme` do YAML aponta `\/Centrium1600Web/oauth/gam/v2.0/access_token` — mas esse bloco descreve o ambiente de dev (`.specs/codebase/INTEGRATIONS.md` registra que `servers:` é só URL de dev). Implementado conforme a spec; mesma observação de confirmação do item 4.

6. **`LeitorCarrinho` como porta (T033/T035).** A leitura do carrinho entra por uma interface com implementação default vazia, em vez de um import direto de `vendaStore.ts`. Assim esta feature não depende de código que ainda não existe, e a 001/003 só precisam injetar o leitor real — sem alterar `erpClient.ts` nem `App.tsx`.

7. **Skeleton com Boneyard.** `boneyard-js@1.10.0` instalado como dependência real (AD-018). O tarball publicado no npm **não** contém `SKILL.md`/`CLAUDE.md` — o vetor descrito em AD-084 existe só no repositório GitHub, não no pacote. Sem `postinstall` próprio; `playwright` vem como dependency real, mas já era devDependency do projeto para E2E. `LoadingSkeleton.tsx` envolve a estrutura real da tela no `<Skeleton>` e o Boneyard gera os bones em runtime; cor e ângulo do shimmer saem dos tokens do frame `BIu92` do Pencil via `configureBoneyard`.

8. **Design tokens.** `src/client/styles/global.css` deriva de `design/DESIGN-coinbase.md` e do export `design/HTML - Pencil/CentriumCheckout.html` — cores, tipografia, espaçamento, raios e o gradiente exato do shimmer, em vez de valores inventados.

9. **Stack de UI completada (2026-09-01, a pedido do usuário).** A primeira rodada instalou só o Boneyard; `shadcn/ui` e `goey-toast` também são stack fixada (AD-007/AD-018) e entraram junto: Tailwind v4 (`@tailwindcss/vite`) como pré-requisito do shadcn, `components.json` escrito à mão em vez de `shadcn init` — para o CLI não sobrescrever `global.css` e apagar os tokens do Pencil —, alias `@/*` → `src/client/*` espelhado em `tsconfig.json`, `vite.config.ts` e `vitest.config.ts`, e uma ponte de variáveis em `global.css` que aponta cada token semântico do shadcn (`--primary`, `--border`, `--radius`…) para o token do design aprovado, evitando um tema paralelo. `<GooeyToaster />` montado uma única vez em `main.tsx` com o CSS do pacote. Efeito colateral encontrado nos testes: o Sonner (base do goey-toast) também expõe `role="status"`, o que tornava `getByRole('status')` ambíguo no E2E do skeleton — o `LoadingSkeleton` ganhou `data-testid="skeleton-carregamento"` e o teste passou a mirar nele, mantendo o papel ARIA nos dois.

10. **Revisão de tipos (typescript-lsp).** O binário `typescript-language-server` não estava instalado; foi instalado globalmente, mas a ferramenta LSP desta sessão capturou o `PATH` na inicialização e só o enxergará numa sessão nova. A revisão foi feita com o mesmo motor, emitindo as declarações inferidas (`tsc --declaration --emitDeclarationOnly`), o que mostra exatamente os tipos públicos. Resultados: nenhum `any` no código; os `as` restantes são narrowing documentado. **Bug encontrado e corrigido:** `erp-proxy.ts` fazia `request.query as Record<string, string>`, o que achataria uma query com chave repetida (`?Codigo=1&Codigo=2` viraria `Codigo=1,2`) e corromperia a chamada ao ERP — passou a repassar a query string crua (`RequisicaoErp.queryString`), com dois testes cobrindo o caso. **Observação de tipo:** como os schemas são `z.looseObject`, `BootstrapPayload` (e portanto `RegistroBootstrap`) carrega index signature `[k: string]: unknown` — intencional para repassar íntegros os campos consumidos por outras features, mas significa que ler um campo inexistente do bootstrap compila como `unknown` em vez de falhar; vale ter em mente nas features 003+.

11. **Rodada de correções pós-revisão (2026-09-02).** A revisão de código da feature apontou 10 problemas verificados em código, todos corrigidos nesta rodada. O que mudou e por quê:

- **`401` depois da renovação virava "sessão encerrada" falsa (crítico).** `chamarErpComRenovacao` devolvia a resposta da chamada refeita mesmo quando ela também vinha `401`. As rotas só tratam `ErroSessaoEncerrada` **lançado** como fim de sessão, mas `bootstrapClient.ts`/`erpClient.ts` tratam qualquer `401` vindo do BFF como logout terminal — o operador caía em "reabra pelo ERP" com um cookie válido recém-gravado, violando FR-006. Agora esse caso lança `ErroSessaoEncerrada` (causa: `ErroTrocaDeToken('erp', 401, …)`), reaproveitando o `clearCookie` que as rotas já faziam.
- **Renovação sem single-flight.** N chamadas concorrentes em `401` disparavam N `password` grants para um único evento de expiração, cada uma gravando seu próprio `Set-Cookie` e descartando os outros tokens válidos. Um `Map<string, Promise<TokenResponse>>` no nível do módulo passa a coalescer as renovações; a chave é o SHA-256 de `tenant:username` (nunca `access_token`/`password`), e a entrada sai do mapa num `finally`, em sucesso ou falha. Processo Node único (`.specs/codebase/ARCHITECTURE.md`), então não há coordenação entre instâncias a fazer.
- **Shimmer do Boneyard nunca aparecia (crítico) — supera o que a nota 7 afirma.** Não havia nenhum `registerBones` no repo, então `getRegisteredBones('pdv-venda')` devolvia `undefined`, `showSkeleton` ficava `false` e a tela caía sempre no `fallback` estático; **o Boneyard não gera bones em runtime**, eles vêm do CLI. Agora existem `boneyard.config.json` (out `./src/client/bones`, breakpoint 1280 — a tela é desktop-only até a feature 007), o `<Skeleton>` ganhou `fixture={<EstruturaTelaVenda />}`, e `src/client/bones/{pdv-venda.bones.json,registry.ts}` (33 bones) são versionados e importados uma vez em `main.tsx`. **Decisão de implementação não especificada:** o CLI navega até o dev server e só encontra `<Skeleton>` se a SPA estiver no estado de carregamento — com o BFF fora do ar ela cai em "Tentar novamente" antes da captura e o CLI reporta "No skeletons found". Por isso a regeneração passa por `npm run bones` (`scripts/boneyard-capture.mjs`), que sobe o Vite com um middleware que deixa `GET /api/bootstrap` pendurado durante a captura. Nada disso toca código de produção. `src/client/bones/` entrou no `.prettierignore` por ser gerado.
- **Respostas do worker cruzavam entre chamadas concorrentes.** `analisar()` registrava um listener por chamada, sem correlação: duas análises em voo eram ambas resolvidas pela primeira resposta. `RequisicaoWorker`/`RespostaWorker` ganharam `id` (`crypto.randomUUID()`, ecoado pelo worker) e o analisador passou a ter um único listener com um `Map` de pendentes. Como defesa em profundidade, `App.tsx` passa `tentando` para `<ErrorRetry>` — a prop já existia e nunca era usada; o flag é um `useState` local, porque quando `ErrorRetry` está na tela o `estado` já é `'erro-recuperavel'`.
- **`encerrar()` deixava promises penduradas para sempre.** O cleanup do efeito termina o worker mesmo com `analisar()` em voo, e `postMessage` num worker terminado é um no-op silencioso. `encerrar()` agora rejeita todos os pendentes com `AnalisadorCanceladoError`, e `carregarBootstrap` traduz isso no estado `'cancelado'`, tratado em silêncio por `App.tsx` (o componente está desmontando — não há estado de UI a atualizar).
- **Hash de ETag fraco.** A segunda passada do `calcularVersionHash` só amostrava os 4096 primeiros e os 4096 últimos caracteres, então payloads de vários MB que diferiam apenas no miolo (lista de preço ou `CenarioPagamento` alterado no meio) podiam colidir e o BFF responder `304` para uma configuração que mudou. A segunda passada passou a varrer a string canônica inteira de trás para frente, semeada com o tamanho — cobertura de 100% dos bytes nas duas passadas, custo ainda linear, função ainda síncrona (nenhum call site mudou). O caminho criptográfico (`SHA-256`) foi descartado por tornar a função assíncrona nos dois lados sem ganho prático para um hash que não é mecanismo de segurança.
- **`Content-Type` sempre forçado para `application/json`.** `montarHeaders` mantém esse default (serve ao bootstrap, `GET` sem corpo), mas `erp-proxy.ts` nunca preenchia `headersExtras` — toda chamada de negócio chegava ao ERP como JSON. O proxy passou a repassar o `content-type` real da requisição quando existir.
- **Corpo de resposta de erro do ERP não drenado.** O undici só devolve a conexão ao pool depois que o corpo é consumido; `bootstrap.ts` devolvia o erro sem ler o corpo, e o mesmo valia para as respostas `401` descartadas dentro da renovação. Todas passam por um descarte explícito. A mensagem enviada ao cliente continua genérica (FR-007) — o corpo do ERP segue sem vazar.
- **Duplicações removidas.** O `catch (ErroSessaoEncerrada) → clearCookie + 401`, repetido quase literalmente nas duas rotas, virou `executarOuEncerrarSessao` em `src/server/session/respostaSessaoEncerrada.ts` (módulo separado de propósito: `chamadaAutenticada.ts` decide **quando** a sessão acabou e não precisa conhecer `FastifyReply`); os chamadores fazem `if (resultado === null) return reply;`. A normalização de `ETag`/`If-None-Match`, duplicada entre BFF e SPA, virou `src/shared/etag.ts`.

Testes: `chamadaAutenticada.spec.ts` ganhou o caso de `401` pós-renovação (o teste antigo, que esperava a resposta `401` normal, foi reescrito) e o de renovação única sob concorrência; `tests/unit/shared/versionHash.spec.ts` é novo e cobre a colisão de miolo; `tests/unit/client/LoadingSkeleton.spec.tsx` é novo e prova que o overlay do Boneyard (`data-boneyard-overlay`) é montado, e não só o `fallback` — precisa de stubs de `ResizeObserver` e `matchMedia` direto no `window`, porque sob o vitest o `window` do jsdom não é o mesmo objeto que `globalThis`. O E2E do skeleton ganhou a mesma asserção em navegador real. Resultado: `npm run typecheck` sem erros, 63 testes Vitest e 11 Playwright passando, `npm run lint` limpo.
