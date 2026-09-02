# Quickstart: Validação de Autenticação, Sessão e Bootstrap

Guia de validação ponta a ponta desta feature. Pressupõe o BFF (Fastify) e a SPA rodando via `docker-compose` de dev (ver `.specs/codebase/ARCHITECTURE.md`, Containerização), com o ERP mockado (não é necessário um ambiente ERP real para os cenários abaixo).

## Pré-requisitos

- Container de dev subido (`docker-compose up`, hot-reload ativo).
- Mock de `POST /oauth/access_token` e `GET /ApiCentriumOAuth/GetSessao` do ERP (ex.: MSW ou servidor de mock dedicado) respondendo nos formatos documentados em `contracts/session-bff-api.md` e `.specs/features/autenticacao-sessao-bootstrap/spec.md`.
- Variáveis de ambiente Docker configuradas com valores de teste: `baseDomain`, `validationKey`, `SESSION_SECRET`.

## Cenário 1 — Login automático via redirect do ERP (AUTH-01, AUTH-02)

1. Simular o redirect do ERP: `GET /session/start?tenant=acme&client_id=...&client_secret=...&username=...&password=...&Repository=...&codigoEmpresa=1&validationKey=<valor-de-teste>`.
2. **Esperado**: resposta `302` com header `Set-Cookie` presente; nenhum dos query params sensíveis aparece na URL de destino do redirect.
3. Repetir com `validationKey` inválida. **Esperado**: `401`, sem chamada ao mock de `/oauth/access_token` (verificar que o mock não foi acionado).

## Cenário 2 — Bootstrap completo antes da tela de venda (AUTH-03, AUTH-04, AUTH-05)

1. Com o cookie do Cenário 1 já setado, abrir a SPA.
2. **Esperado**: tela de carregamento skeleton (Boneyard) visível até `GET /api/bootstrap` responder.
3. Após a resposta: tela de venda liberada; inspecionar o Dexie do navegador e confirmar um registro chaveado por `tenant=acme`.
4. Recarregar a página (F5) sem alterar o mock. **Esperado**: a SPA ainda chama `GET /api/bootstrap` (é a única via permitida para descobrir o `tenant` e escolher o registro do Dexie — AD-022), mas envia o hash já persistido em `If-None-Match`; o BFF responde `304` sem corpo — verificar na aba de rede do navegador que a resposta é `304` e o `Content-Length` é `0` (nenhum payload de ~5MB retransmitido, FR-008/AD-045).

## Cenário 3 — Isolamento por tenant (FR-009)

1. Repetir o Cenário 1 com `tenant=beta` (outro valor).
2. **Esperado**: novo registro no Dexie chaveado por `tenant=beta`, sem sobrescrever o registro de `tenant=acme`.

## Cenário 4 — Falha não-401 no bootstrap (AUTH-07)

1. Configurar o mock de `GetSessao` para responder `500`.
2. Abrir a SPA com um cookie de sessão válido.
3. **Esperado**: tela de erro com botão "Tentar novamente" — não uma tela de login.

## Cenário 5 — Renovação silenciosa de sessão (AUTH-06)

1. Com sessão ativa e carrinho **vazio**, configurar o mock do ERP para responder `401` numa chamada a `/api/erp/*`.
2. **Esperado**: o BFF renova o token automaticamente (chama `/oauth/access_token` de novo) e refaz a chamada original sem erro visível ao cliente.
3. Configurar o mock de `/oauth/access_token` para falhar na renovação (ex.: `400`).
4. **Esperado (carrinho vazio)**: sessão encerrada, mensagem pedindo para reabrir pelo ERP — sem aviso de venda perdida.
5. Repetir o passo 3 com um carrinho **com itens** (estado simulado no Zustand). **Esperado**: aviso equivalente ao diálogo de `beforeunload` antes de encerrar a sessão.

## Critério de aceite da feature

Todos os 5 cenários acima passam, e nenhuma inspeção de rede/DevTools (aba Network, Application → Cookies/Storage) expõe `access_token`, `client_secret` ou `password` em nenhum momento — valida SC-004 diretamente.
