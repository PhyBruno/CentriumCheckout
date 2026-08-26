# Phase 0 Research: Autenticação, Sessão e Bootstrap

Nenhum item da spec (`specs/002-autenticacao-sessao-bootstrap/spec.md` e `.specs/features/autenticacao-sessao-bootstrap/spec.md`) está marcado `NEEDS CLARIFICATION` — toda a rodada de esclarecimento já ocorreu antes desta fase, registrada em `.specs/project/STATE.md` (AD-019, AD-022, AD-044, AD-045, AD-049, AD-054, AD-071) e resumida em `.specs/codebase/CONCERNS.md`. Esta seção documenta, no formato Decision/Rationale/Alternatives exigido pelo `/speckit-plan`, as decisões técnicas já tomadas que esta feature implementa — não é uma nova investigação, é a consolidação do que já foi decidido para a fase de Design poder prosseguir sem reabrir perguntas fechadas.

## Framework do BFF

- **Decision**: Fastify.
- **Rationale**: Schema/validation nativo, alinhado à escolha de Zod na camada de validação do projeto (AD-071, `.specs/project/STATE.md`).
- **Alternatives considered**: Express (descartado — sem schema/validation nativo, exigiria middleware adicional para o mesmo resultado); Nest.js (descartado — peso arquitetural desproporcional para um BFF deliberadamente mínimo, sem lógica de negócio, AD-022).

## Onde o cookie de sessão é setado e por quê é preciso um BFF

- **Decision**: Introduzir um BFF mínimo (Node) que seta o cookie de sessão via `Set-Cookie` em resposta de servidor.
- **Rationale**: Um cookie `HttpOnly` só pode ser setado por uma resposta de servidor — a SPA sozinha (arquitetura original "sem backend próprio") não tem como cumprir o requisito FR-002 (nunca expor `access_token`/credenciais ao JS) sem um componente servidor dedicado a isso (AD-022, resolve a contradição identificada em `.specs/codebase/CONCERNS.md`, "Mecanismo de acesso do JS a dados de sessão com cookie HttpOnly").
- **Alternatives considered**: SPA processar diretamente os query params do redirect do ERP e guardar o token em memória JS (descartado — impossível cumprir "nunca exposto ao JS" e não sobrevive a reload); `localStorage`/`sessionStorage` (descartado explicitamente na spec — acessível a JS, portanto a qualquer XSS).

## Estratégia de renovação de token

- **Decision**: Reautenticar via novo `password` grant (`POST /oauth/access_token` com as credenciais já salvas no cookie cifrado), não via `refresh_token`.
- **Rationale**: Confirmado que `refresh_token` não será utilizado pelo contrato do ERP (AD-019); o fluxo de renovação já decidido reautentica com as credenciais originais, mantidas cifradas no cookie desde o login inicial.
- **Alternatives considered**: `refresh_token` grant (descartado — não suportado pelo fluxo real do ERP, confirmado em AD-019).

## Persistência do bootstrap (Dexie) e isolamento por tenant

- **Decision**: Gravar o payload normalizado de `GetSessao` no Dexie (IndexedDB), com a chave do banco incluindo o `tenant`, e um hash/versão calculado localmente no Checkout (não vindo do ERP) para decidir se um novo download é necessário.
- **Rationale**: Decisão direta do usuário (AD-045, `.specs/project/STATE.md`) — evita re-download desnecessário do payload de ~5MB em F5 sem mudança (FR-008) e isola tenants diferentes que compartilhem o mesmo navegador/máquina (FR-009).
- **Alternatives considered**: Confiar em um campo de versão retornado pelo próprio `GetSessao` (descartado — o endpoint não retorna esse campo; confirmado por inspeção de contrato, AD-045).

## Tela de erro em falha não-401 no bootstrap

- **Decision**: Exibir tela de erro com botão "Tentar novamente" quando `/api/bootstrap`/`GetSessao` falhar por motivo diferente de autenticação (ex.: `500`, timeout).
- **Rationale**: Decisão direta do usuário (AD-049) — distingue falha transitória de infraestrutura de falha de autenticação (que segue outro caminho, AUTH-06), evitando forçar reautenticação por um problema que reautenticar não resolve.
- **Alternatives considered**: Tratar toda falha de bootstrap como sessão inválida e forçar novo login (descartado — reautenticar não resolve uma falha de rede/timeout do ERP, e piora a experiência do operador sem necessidade).

## Aviso ao operador quando a renovação de sessão falha com venda em andamento

- **Decision**: Reaproveitar o mesmo padrão de diálogo nativo já usado para `beforeunload` (proteção contra F5/fechamento acidental, AD-006) para avisar que a sessão será encerrada e a venda pode ser perdida.
- **Rationale**: Decisão direta do usuário (AD-044) — consistência de padrão de interação já validado em vez de introduzir um novo componente de diálogo só para este caso.
- **Alternatives considered**: Encerrar a sessão silenciosamente sem aviso (descartado — spec exige aviso explícito quando há carrinho com itens, FR-006/AUTH-06).

## Múltiplas abas com o mesmo cookie de sessão

- **Decision**: Não implementar nenhuma coordenação entre abas — uma aba pode afetar a validade da sessão nas demais (renovar ou encerrar), e isso é aceito como está.
- **Rationale**: Decisão direta do usuário (AD-054) — o custo de implementar coordenação entre abas (`BroadcastChannel`, lock compartilhado etc.) não se justifica para este caso de uso.
- **Alternatives considered**: `BroadcastChannel`/`SharedWorker` para sincronizar estado de sessão entre abas (descartado — complexidade não justificada pela decisão do usuário).

**Output**: Todos os itens de Technical Context do `plan.md` estão resolvidos — nenhum `NEEDS CLARIFICATION` remanescente.
