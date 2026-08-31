# Contract: BFF de Sessão/Autenticação (interno ao Checkout)

Este contrato cobre só as rotas que o **BFF do Checkout** expõe para a própria SPA (mesma origem) — não é o contrato do ERP (`ApiCentriumOAuth.yaml`, já existente e referenciado em `.specs/codebase/INTEGRATIONS.md`), que o BFF consome internamente. Nenhum destes três endpoints é chamado diretamente pelo navegador com credenciais/token visíveis — o cookie viaja automaticamente, cifrado, `HttpOnly`.

## `GET /session/start`

**Chamador**: navegador, via redirect feito pelo ERP (não é uma chamada AJAX da SPA).

**Query params** (todos vindos do ERP, nunca digitados pelo operador):

| Param | Tipo | Obrigatório |
|---|---|---|
| `tenant` | string | Sim |
| `client_id` | string | Sim |
| `client_secret` | string | Sim |
| `username` | string | Sim |
| `password` | string | Sim |
| `Repository` | string (GUID) | Sim |
| `codigoEmpresa` | string | Sim |
| `validationKey` | string | Sim — credencial fixa por ambiente (variável Docker), valida a origem do redirect |

**Comportamento**:
1. Rejeita a requisição (sem chamar o ERP) se `validationKey` não confere com o valor configurado no ambiente.
2. Monta o host do ERP como `tenant.<baseDomain>` (variável de ambiente Docker).
3. Chama `POST /oauth/access_token` no ERP (form `application/x-www-form-urlencoded`; `grant_type=password`; `additionalParameters={"AuthenticationTypeName":"local","Repository":"<Repository>"}`).
4. Cifra `access_token` + todas as credenciais originais com `SESSION_SECRET` e responde com `Set-Cookie` (`HttpOnly`, `Secure`, `SameSite=Lax`).
5. Redireciona (`302`) para a URL limpa da SPA — sem nenhum dos query params sensíveis.

**Resposta ao navegador**: `302 Found` com header `Set-Cookie`; corpo vazio. Nenhum campo sensível no corpo ou na URL de destino.

**Erros**: `validationKey` inválida → `401` sem chamar o ERP. Falha do ERP em `/oauth/access_token` → repassa o status de erro, sem setar cookie.

## `GET /api/bootstrap`

**Chamador**: SPA, na inicialização (cookie de sessão enviado automaticamente pelo navegador, mesma origem).

**Request**: sem parâmetros — toda a informação necessária (`tenant`, `codigoEmpresa`, `access_token`) vem do cookie decifrado no servidor.

**Comportamento**: decifra o cookie, monta `GET /ApiCentriumOAuth/GetSessao` no ERP com header `Authorization: OAuth <access_token>`, header `Empresa: <codigoEmpresa>`, query `Login: <username>`. Combina a resposta com `codigoEmpresa` e `tenant`.

**Resposta** (exemplo ilustrativo, valores sintéticos):

```json
{
  "tenant": "acme",
  "codigoEmpresa": "1",
  "SessaoUsuario": {
    "TipoPreco": 1,
    "CadMaqCod": "PDV01",
    "listaPrecoPadrao": "0",
    "CenarioPagamento": "[\"1;DINHEIRO;1;A VISTA;Dinheiro à vista;True;F6\"]"
  }
}
```

Nunca inclui `access_token`, `client_secret` ou `password`.

**Nota sobre `CenarioPagamento`** (acrescentado ao contrato do ERP na versão `20260827192357`, ver AD-104): o BFF repassa o campo **como está**, sem interpretar nem reformatar — é `string` no contrato do ERP e continua `string` na resposta do bootstrap. Toda a estrutura interna (array JSON de strings com 7 campos delimitados por `;`) é responsabilidade da feature 013, que a valida na fronteira do cliente — ver `specs/013-venda-rapida-cenario-pagamento/contracts/erp-cenario-pagamento-api.md`. Esta feature apenas garante que o campo chegue íntegro ao navegador e seja persistido no Dexie com o restante do payload.

**Erros**: `401` do ERP → o BFF tenta renovação silenciosa (ver `/api/erp/*` abaixo) antes de responder; se a renovação falhar, `401` ao cliente (aciona AUTH-06). Qualquer outro erro (`500`, timeout) → repassado como está, aciona a tela "Tentar novamente" (AUTH-07), sem forçar novo login.

## `/api/erp/*` (proxy autenticado)

**Chamador**: SPA, para toda chamada de negócio subsequente ao bootstrap (produto, cliente, pagamento, NFCe — outras features).

**Comportamento**: injeta `Authorization`/`Empresa` a partir do cookie decifrado, repassa a chamada ao endpoint correspondente do ERP (`ApiCentriumOAuth.yaml`) e devolve a resposta como está. Se o ERP responder `401`:
1. Chama `POST /oauth/access_token` novamente com as credenciais salvas no cookie (mesmo fluxo de `/session/start`, passo 3).
2. Regrava o cookie com o `access_token` novo.
3. Refaz a chamada original ao ERP, de forma transparente ao JS (sem retry especial no cliente).
4. Se a renovação falhar: invalida o cookie e responde `401` ao cliente — único gatilho de logout automático (aciona o aviso de venda em digitação, AUTH-06).

**Fora de escopo desta feature**: o conteúdo de negócio de cada endpoint proxiado (schemas de produto, pagamento, NFCe) — coberto pelas specs das respectivas features.
