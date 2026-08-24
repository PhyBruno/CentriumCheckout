# Autenticação, Sessão e Bootstrap — Specification

## Problem Statement

O operador já está autenticado no ERP e não deve digitar credenciais de novo no Checkout. O ERP redireciona o navegador para o Checkout com as credenciais do operador; um BFF mínimo (AD-022 em `.specs/project/STATE.md`) — sem lógica de negócio, sem banco de dados — troca essas credenciais por um `access_token` próprio do Checkout, mantém a sessão num cookie cifrado `HttpOnly` inacessível a JavaScript, carrega a configuração do tenant (~5MB) antes de liberar a tela de venda, e mantém a sessão viva sem exigir novo login manual quando o token expira. O frontend nunca lida com `client_secret`, `password` ou `access_token` diretamente.

## UI Design

O fluxo de login/troca de token é automático (sem interação do operador, sem tela própria). A tela de carregamento bloqueante do requisito `AUTH-05` tem frame dedicado no Pencil: **"PDV Online Web - Skeleton Carregamento"** (id `BIu92`, em `design/CentriumCheckout.pen`) — replica a estrutura completa da tela principal do PDV com placeholders shimmer (gradiente cinza) no lugar do conteúdo real:

- Barra superior com a marca/identidade do PDV já visível (não é skeleton) — "Centrium Checkout" + identificação de caixa/PDV
- Bloco "Cliente da venda" (campos CPF/nome/botões) em skeleton
- Bloco "Entrada rápida de produto" (código, quantidade, unidade, preço, desconto, total) em skeleton
- Tabela "Produtos da venda" com cabeçalho + 6 linhas em skeleton
- Rodapé da venda (status do carrinho, subtotal) em skeleton
- Painel lateral "Pagamento e totais" (condição, desconto/acréscimo, forma de pagamento, valor recebido, pagamentos aplicados, cartão de total da venda) em skeleton

Implementação segue via Boneyard (AD-005/AD-007 em `.specs/project/STATE.md`), usando este frame como referência visual — não é necessário reproduzir pixel a pixel, o Boneyard gera o shimmer em runtime a partir da estrutura de layout real dos componentes.

## Goals

- [ ] Zero tela de login manual — sessão iniciada 100% a partir do redirecionamento do ERP.
- [ ] Nenhuma tela de PDV parcialmente carregada — bootstrap completo antes de liberar a operação.
- [ ] Renovação de token automática e silenciosa, sem derrubar o operador.
- [ ] Nenhuma credencial sensível (`client_secret`, `password`, `access_token`) é acessível a JavaScript no navegador em nenhum momento.

## Out of Scope

| Feature | Reason |
|---|---|
| Tela de login manual (campos usuário/senha) | Credenciais sempre chegam prontas via query params do ERP — confirmado (2026-08-20) contra diagrama de referência que sugeria o contrário |
| Uso de `refresh_token` para renovação | Fluxo decidido reautentica via novo `password` grant — confirmado que `refresh_token` **não será utilizado** (AD-019 em `.specs/project/STATE.md`) |
| SPA processar diretamente os query params do redirect do ERP | Um cookie `HttpOnly` só pode ser setado por resposta de servidor — precisa de um BFF mínimo (AD-022), deixou de ser responsabilidade do JS da SPA |

---

## User Stories

### P1: Login automático via redirecionamento do ERP ⭐ MVP

**User Story**: Como operador de caixa, quero que o Checkout abra pronto para uso ao clicar no botão do ERP, sem digitar nada, para começar a vender imediatamente.

**Why P1**: Sem isso não existe ponto de entrada na aplicação.

**Acceptance Criteria**:

1. WHEN o operador clica no botão do ERP THEN o ERP SHALL abrir a URL do Checkout com query parameters `tenant`, `client_id`, `client_secret`, `username`, `password`, `Repository`, `codigoEmpresa` e `validationKey` — nunca um `access_token` pronto. `validationKey` é uma credencial fixa por ambiente (variável de ambiente Docker), igual para todos os tenants, que só confirma a legitimidade da origem do redirect — não deve ser confundida com as credenciais OAuth do operador (AD-022 em `.specs/project/STATE.md`).
2. WHEN o BFF recebe esse redirect (rota `GET /session/start`) THEN o sistema SHALL validar `validationKey` antes de prosseguir e montar o host da API do ERP prefixando `tenant` a um domínio base fixo vindo de variável de ambiente Docker `baseDomain` (ex.: `TENANT.apps.centrium.inf.br`).
3. WHEN o BFF monta o request de token THEN o sistema SHALL chamar `POST /oauth/access_token` (form `application/x-www-form-urlencoded`) com `client_id`, `client_secret`, `grant_type=password`, `username`, `password` e `additionalParameters` contendo `Repository` no formato `{"AuthenticationTypeName":"local","Repository":"<guid>"}`. Essa chamada é sempre servidor-a-servidor — o navegador nunca a faz diretamente.
4. WHEN o token é obtido THEN o BFF SHALL cifrar `access_token` e as credenciais originais (`tenant`, `client_id`, `client_secret`, `username`, `password`, `Repository`, `codigoEmpresa`) usando uma chave de servidor (variável de ambiente Docker `SESSION_SECRET`) e devolver isso em `Set-Cookie` (`HttpOnly`, `Secure`, `SameSite=Lax`) — nunca em `localStorage`/`sessionStorage`, e nunca em texto plano acessível fora do processo do BFF. `codigoEmpresa` SHALL ser reenviado como campo `Empresa` em praticamente todos os demais endpoints do contrato (ver AD-019 em `.specs/project/STATE.md`).
5. WHEN o cookie é setado com sucesso THEN o BFF SHALL redirecionar o navegador para a URL limpa da SPA, sem os query params sensíveis.

**Independent Test**: Simular chamada a `GET /session/start` com query params válidos (incluindo `validationKey`) e verificar que a resposta seta o cookie de sessão cifrado e redireciona para a URL limpa — sem qualquer input manual do operador e sem o `access_token` aparecer em nenhum payload de resposta visível ao navegador.

---

### P1: Bootstrap automático da configuração do tenant ⭐ MVP

**User Story**: Como operador de caixa, quero que toda a configuração do PDV (formas de pagamento, condições, TEF/PIX) já esteja carregada quando a tela principal aparecer, para não encontrar comportamento inconsistente no meio da venda.

**Why P1**: O motor de precificação e as demais features dependem dessa configuração já estar presente.

**Acceptance Criteria**:

1. WHEN a SPA carrega THEN o sistema SHALL chamar `GET /api/bootstrap` (mesma origem, cookie de sessão enviado automaticamente pelo navegador) — o BFF decifra o cookie no servidor, chama `GET /ApiCentriumOAuth/GetSessao` no ERP (header `Authorization` no formato `"OAuth <token>"`, header `Empresa` (`codigoEmpresa`), header `Content-Type` obrigatório no contrato, query `Login` (`username`)) e devolve ao JS uma resposta combinada com `codigoEmpresa`, `tenant` e o payload de configuração do `GetSessao` — nunca `access_token`, `client_secret` ou `password`.
2. WHEN a resposta de `/api/bootstrap` (~até 5MB) chega ao navegador THEN o sistema SHALL fazer parse e validação em Web Worker (evita bloquear a thread principal) e gravar o resultado normalizado no Dexie (IndexedDB), com checagem de versão/hash para evitar re-download se nada mudou.
3. WHEN o operador recarrega a aplicação (F5) sem mudança de versão THEN o sistema SHALL reusar o payload já persistido no Dexie, sem nova chamada de rede a `/api/bootstrap`.
4. WHEN a troca de credenciais por token, a chamada a `/api/bootstrap` e o parse/validação do payload ainda não terminaram THEN a interface SHALL exibir uma tela de carregamento skeleton bloqueante— podendo ser em formato skeleton via Boneyard (AD-005/AD-007 em `.specs/project/STATE.md`).

**Independent Test**: Mockar `GetSessao` com payload de teste e verificar que a tela principal só renderiza após o Dexie confirmar a gravação.

---

### P1: Renovação de sessão silenciosa ⭐ MVP

**User Story**: Como operador de caixa, não quero ser desconectado no meio de uma venda só porque o token expirou.

**Why P1**: Interrupção no meio de uma venda em digitação é inaceitável operacionalmente.

**Acceptance Criteria**:

1. WHEN o `access_token` expira durante o uso normal THEN o BFF SHALL detectar o `401` do ERP em qualquer chamada feita através de `/api/erp/*`, obter um novo `access_token` automaticamente repetindo a chamada a `/oauth/access_token` com as credenciais já salvas no cookie de sessão, regravar o cookie e refazer a chamada original — tudo de forma transparente ao JS, sem retry especial no cliente e sem novo login manual.
2. WHEN a tentativa de renovação falha THEN o sistema SHALL desconectar o operador (única condição de logout automático) — o BFF invalida o cookie de sessão e o frontend exibe mensagem pedindo para reabrir pelo ERP.

**Independent Test**: Forçar expiração do token mockado nas respostas do ERP e verificar que o BFF reautentica sozinho sem que o cliente precise implementar lógica de retry.

---

## Edge Cases

- WHEN `codigoEmpresa` é necessário em qualquer endpoint além de `/oauth/access_token` THEN o sistema SHALL enviá-lo como campo `Empresa` — confirmado presente no contrato (`ApiCentriumOAuth.yaml`) sob esse nome (AD-019).
- WHEN o nome da variável de ambiente do domínio base é necessário no deploy THEN o sistema SHALL usar `baseDomain` (AD-019).
- WHEN `validationKey` recebido em `GET /session/start` não confere com o valor configurado no ambiente THEN o BFF SHALL rejeitar o request antes de chamar `/oauth/access_token` (evita gastar uma tentativa de autenticação OAuth com uma origem não verificada) (AD-022).
- WHEN o JS do frontend precisa de `codigoEmpresa` ou de qualquer dado de sessão THEN ele SHALL obtê-lo exclusivamente via `GET /api/bootstrap` — nunca lendo o cookie diretamente (impossível, é `HttpOnly`) nem recebendo o valor embutido em HTML/JS na resposta inicial (AD-022).

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
- [ ] Nenhuma credencial sensível (`client_secret`, `password`, `access_token`) é acessível a JavaScript no navegador em nenhum momento.
