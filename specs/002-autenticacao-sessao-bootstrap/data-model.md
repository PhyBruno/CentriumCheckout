# Phase 1 Data Model: Autenticação, Sessão e Bootstrap

Entidades derivadas dos Key Entities da spec (`specs/002-autenticacao-sessao-bootstrap/spec.md`) e detalhadas com os campos já confirmados em `.specs/features/autenticacao-sessao-bootstrap/spec.md` e no contrato `ApiCentriumOAuth.yaml`. Nomes de campo abaixo são os nomes reais do contrato/decisões já registradas — não inferidos.

## Sessão do Operador (cookie cifrado, server-side only)

Vive inteiramente cifrada dentro do cookie `HttpOnly`/`Secure`/`SameSite=Lax` do BFF — nunca em `localStorage`/`sessionStorage`, nunca acessível a JavaScript no navegador (FR-002).

| Campo | Tipo | Origem | Observação |
|---|---|---|---|
| `access_token` | string | Resposta de `POST /oauth/access_token` | Nunca exposto ao JS — só usado pelo BFF para montar `Authorization: OAuth <token>` nas chamadas a `/api/erp/*` |
| `tenant` | string | Query param do redirect do ERP | Usado para montar o host `TENANT.<baseDomain>` |
| `client_id` | string | Query param do redirect do ERP | Guardado para permitir renovação (novo `password` grant) sem novo redirect |
| `client_secret` | string | Query param do redirect do ERP | Nunca exposto ao JS |
| `username` | string | Query param do redirect do ERP | Reenviado em renovações |
| `password` | string | Query param do redirect do ERP | Reenviado em renovações — nunca exposto ao JS |
| `Repository` | string | Query param do redirect do ERP | Usado em `additionalParameters` de `/oauth/access_token` |
| `codigoEmpresa` | string | Query param do redirect do ERP | Reenviado como campo `Empresa` em praticamente todos os endpoints do ERP (AD-019) |

**Validação/Estado**: nenhuma validação de negócio — o BFF só cifra/decifra e repassa. **State transitions**: `ausente` → `ativa` (após `/session/start` bem-sucedido) → `renovada` (após 401 + novo `password` grant bem-sucedido, mesmos campos, `access_token` atualizado) → `encerrada` (renovação falhou; cookie invalidado pelo BFF).

## Configuração do Ponto de Venda (bootstrap, persistido no Dexie)

Payload combinado devolvido por `GET /api/bootstrap`: campos não sensíveis do cookie (`codigoEmpresa`, `tenant`) + payload de `GET /ApiCentriumOAuth/GetSessao` do ERP (~5MB).

| Campo | Tipo | Origem | Observação |
|---|---|---|---|
| `tenant` | string | Cookie de sessão (decifrado no servidor) | Faz parte da chave do registro no Dexie — isola tenants diferentes no mesmo navegador (FR-009) |
| `codigoEmpresa` | string | Cookie de sessão (decifrado no servidor) | Reenviado como `Empresa` nas chamadas subsequentes via `/api/erp/*` |
| `SessaoUsuario.TipoPreco` | integer (1–11) | `GetSessao` | Consumido pelo motor de precificação (feature separada, `carrinho-produto-precificacao`) — só armazenado aqui |
| `SessaoUsuario.CadMaqCod` | string | `GetSessao` | Usado por outras features (ex.: `GetStatusSistema`) — só armazenado aqui |
| `SessaoUsuario.ListaPrecoDefault` | integer (int64) | `GetSessao` | Lista de preço **do cliente default** (o `CliListCod` dele, com fallback `1` aplicado pelo ERP). Consumido pelas features `identificacao-cadastro-cliente` e `carrinho-produto-precificacao` — só armazenado aqui. **Correção (2026-08-31, AD-108):** redações anteriores desta linha traziam `SessaoUsuario.listaPrecoPadrao` (string) descrito como "lista de preço padrão da empresa, fallback quando o cliente não tem lista própria" — esse campo **nunca existiu no contrato** e esse conceito não existe no domínio (AD-092). O campo real, acrescentado em `20260827192357`, é este `ListaPrecoDefault`, e ele é a lista do cliente default, não da empresa |
| `_versionHash` | string | **Calculado localmente pelo Checkout** (não vem do ERP) | Usado para decidir se um novo `GET /api/bootstrap` é necessário num F5 (FR-008, AD-045) |

**Chave do registro Dexie**: `${tenant}` (garante isolamento entre empresas que compartilhem navegador/máquina, FR-009). **Validação**: todo o payload passa por schema Zod antes de gravar no Dexie (Princípio IV da constitution) — parse/validação roda em Web Worker para não bloquear a thread principal (AUTH-04). **State transitions**: `ausente` → `carregando` (chamada a `/api/bootstrap` em curso, tela de skeleton visível, AUTH-05) → `pronto` (gravado no Dexie, tela de venda liberada) → `erro-recuperável` (falha não-401, tela "Tentar novamente", AUTH-07) → `reaproveitado` (F5 sem mudança de hash, nenhuma nova chamada de rede).

## Relação entre as duas entidades

A Sessão do Operador (server-side) é pré-requisito para obter a Configuração do Ponto de Venda (client-side/Dexie) — sem cookie de sessão válido, `GET /api/bootstrap` não tem o que decifrar e a chamada correspondente do BFF ao `GetSessao` do ERP não pode ser autenticada. As duas entidades têm ciclos de vida independentes depois de estabelecidas: a sessão pode ser renovada silenciosamente várias vezes sem que a configuração do PDV precise ser recarregada (FR-008).
