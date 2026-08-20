# Autenticação, Sessão e Bootstrap — Specification

## Problem Statement

O operador já está autenticado no ERP e não deve digitar credenciais de novo no Checkout. O Checkout precisa obter seu próprio `access_token` a partir de credenciais recebidas do ERP, carregar a configuração do tenant (~5MB) antes de liberar a tela de venda, e manter a sessão viva sem exigir novo login manual quando o token expira.

## UI Design

Nenhuma tela dedicada identificada em `design/CentriumCheckout.pen` — o fluxo é automático (sem interação do operador). A tela de carregamento bloqueante do requisito `AUTH-05` ainda não tem frame correspondente no Pencil — ⚠️ pendente de design visual.

## Goals

- [ ] Zero tela de login manual — sessão iniciada 100% a partir do redirecionamento do ERP.
- [ ] Nenhuma tela de PDV parcialmente carregada — bootstrap completo antes de liberar a operação.
- [ ] Renovação de token automática e silenciosa, sem derrubar o operador.

## Out of Scope

| Feature | Reason |
|---|---|
| Tela de login manual (campos usuário/senha) | Credenciais sempre chegam prontas via query params do ERP — confirmado (2026-08-20) contra diagrama de referência que sugeria o contrário |
| Uso de `refresh_token` para renovação | Fluxo decidido reautentica via novo `password` grant; ver pendência em `.specs/codebase/CONCERNS.md` |

---

## User Stories

### P1: Login automático via redirecionamento do ERP ⭐ MVP

**User Story**: Como operador de caixa, quero que o Checkout abra pronto para uso ao clicar no botão do ERP, sem digitar nada, para começar a vender imediatamente.

**Why P1**: Sem isso não existe ponto de entrada na aplicação.

**Acceptance Criteria**:

1. WHEN o operador clica no botão do ERP THEN o ERP SHALL abrir a URL do Checkout com query parameters `tenant`, `client_id`, `client_secret`, `username`, `password`, `Repository` e `codigoEmpresa` — nunca um `access_token` pronto.
2. WHEN o Checkout recebe esses parâmetros THEN o sistema SHALL montar o host da API do ERP prefixando `tenant` a um domínio base fixo vindo de variável de ambiente Docker (ex.: `TENANT.apps.centrium.inf.br`).
3. WHEN o Checkout monta o request de token THEN o sistema SHALL chamar `POST /oauth/access_token` (form `application/x-www-form-urlencoded`) com `client_id`, `client_secret`, `grant_type=password`, `username`, `password` e `additionalParameters` contendo `Repository` no formato `{"AuthenticationTypeName":"local","Repository":"<guid>"}`.
4. WHEN o token é obtido THEN o sistema SHALL armazenar `access_token` e as credenciais originais (`tenant`, `client_id`, `client_secret`, `username`, `password`, `Repository`) em cookie `HttpOnly` — nunca em `localStorage`/`sessionStorage`. `codigoEmpresa` SHALL ser armazenado separadamente, fora desse conjunto de reautenticação.

**Independent Test**: Simular abertura da URL com query params válidos e verificar que o cookie `HttpOnly` recebe o token, sem qualquer input manual do operador.

---

### P1: Bootstrap automático da configuração do tenant ⭐ MVP

**User Story**: Como operador de caixa, quero que toda a configuração do PDV (formas de pagamento, condições, TEF/PIX) já esteja carregada quando a tela principal aparecer, para não encontrar comportamento inconsistente no meio da venda.

**Why P1**: O motor de precificação e as demais features dependem dessa configuração já estar presente.

**Acceptance Criteria**:

1. WHEN o `access_token` é obtido THEN o sistema SHALL chamar automaticamente `GET /ApiCentriumOAuth/GetSessao` com header `Authorization` (token), header `Empresa` (`codigoEmpresa`) e query `Login` (`username`).
2. WHEN a resposta (~até 5MB) chega THEN o sistema SHALL fazer fetch, parse e validação em Web Worker (evita bloquear a thread principal) e gravar o resultado normalizado no Dexie (IndexedDB), com checagem de versão/hash para evitar re-download se nada mudou.
3. WHEN o operador recarrega a aplicação (F5) sem mudança de versão THEN o sistema SHALL reusar o payload já persistido no Dexie, sem novo download de 5MB.
4. WHEN a obtenção do token, a chamada ao `GetSessao` e o parse/validação do payload ainda não terminaram THEN a interface SHALL exibir uma tela de carregamento bloqueante ("montando a sessão") — a tela principal só aparece depois que tudo termina com sucesso, nunca parcialmente carregada.

**Independent Test**: Mockar `GetSessao` com payload de teste e verificar que a tela principal só renderiza após o Dexie confirmar a gravação.

---

### P1: Renovação de sessão silenciosa ⭐ MVP

**User Story**: Como operador de caixa, não quero ser desconectado no meio de uma venda só porque o token expirou.

**Why P1**: Interrupção no meio de uma venda em digitação é inaceitável operacionalmente.

**Acceptance Criteria**:

1. WHEN o `access_token` expira durante o uso normal THEN o sistema SHALL tentar obter um novo `access_token` automaticamente, repetindo a chamada a `/oauth/access_token` com as credenciais já salvas (sem novo login manual).
2. WHEN a tentativa de renovação falha THEN o sistema SHALL desconectar o operador (única condição de logout automático).

**Independent Test**: Forçar expiração do token mockado e verificar reautenticação silenciosa sem interromper o fluxo do operador.

---

## Edge Cases

- WHEN `codigoEmpresa` é necessário em qualquer endpoint além de `/oauth/access_token` THEN o sistema SHALL enviá-lo — ⚠️ pendente: parâmetro ainda não documentado em `ApiCentriumOAuth.yaml` (ver `.specs/codebase/CONCERNS.md`).
- WHEN o nome da variável de ambiente do domínio base é necessário no deploy THEN ⚠️ pendente: nome ainda não definido (ver `.specs/codebase/CONCERNS.md`).

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
|---|---|---|---|
| AUTH-01 | Login automático — troca de credenciais por token | - | Verified (requisito confirmado, aguarda Design/Tasks) |
| AUTH-02 | Login automático — armazenamento em cookie HttpOnly | - | Verified |
| AUTH-03 | Bootstrap — chamada automática a GetSessao | - | Verified |
| AUTH-04 | Bootstrap — persistência Dexie com versionamento | - | Verified |
| AUTH-05 | Bootstrap — tela de carregamento bloqueante | - | Verified |
| AUTH-06 | Renovação silenciosa de sessão | - | Verified |

**Coverage:** 6 total, 0 mapeados a tasks (Tasks ainda não iniciado), 6 requisitos já confirmados em conversas anteriores (não ambíguos).

---

## Success Criteria

- [ ] Operador nunca vê tela de login manual.
- [ ] Operador nunca vê tela principal com configuração parcialmente carregada.
- [ ] Expiração de token durante o uso não interrompe a venda em andamento.
