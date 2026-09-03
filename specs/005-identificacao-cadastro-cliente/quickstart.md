# Quickstart — Validação da Identificação e Cadastro de Cliente

**Feature**: `specs/005-identificacao-cadastro-cliente/` | **Date**: 2026-08-26

Guia de validação: como provar que a feature funciona ponta a ponta. Não contém código de implementação — os detalhes de contrato estão em `contracts/` e a modelagem em `data-model.md`.

---

## Pré-requisitos

| # | Pré-requisito | Origem |
|---|---|---|
| 1 | Scaffolding do projeto criado (`package.json`, Vite, TypeScript `strict`, Docker) | feature 002 |
| 2 | BFF respondendo `/session/start`, `/api/bootstrap` e o proxy `/api/erp/*` | feature 002 |
| 3 | `vendaStore` (Zustand + Immer) existindo, com os slices `auditoria` (001) e `carrinho` (003) combinados | features 001, 003 |
| 4 | Sessão do ERP válida, com `SessaoUsuario.ClienteDefaultCodigo`/`ClienteDefaultNome`/`QtdMinCharParaConsulta` no bootstrap | feature 002 |
| 5 | Ao menos um cliente cadastrado com `DescontoConvenio`/`ListaPreco` preenchidos, e um documento (CPF) inexistente para testar o cadastro simplificado | ambiente ERP de dev |
| 6 | Ao menos um produto com `TipoPreco = 9` (preço por lista) configurado, para validar a troca de cliente com carrinho populado | ambiente ERP de dev |

O projeto roda 100% em Docker (`.specs/codebase/ARCHITECTURE.md`). Comandos abaixo assumem o container de desenvolvimento em execução.

---

## Camada 1 — Domínio puro

```bash
npm test -- tests/unit/domain/cliente
```

| Arquivo | Cenários mínimos | Requisito |
|---|---|---|
| `documento.spec.ts` | 11 dígitos → `CPF`; 14 dígitos → `CNPJ`; outro comprimento → `INVALIDO`; texto com pontuação (`123.456.789-00`) classificado corretamente; `validarFormatoCEP` aceita `12345-678` e `12345678`, rejeita menos/mais dígitos | `CLI-04`, `FR-010` |

---

## Camada 2 — Slice (integração de estado)

```bash
npm test -- tests/integration/clienteSlice.spec.ts
```

| Cenário | Como montar | Esperado | Requisito |
|---|---|---|---|
| Pré-seleção do default | `inicializarClientePadrao({ ClienteDefaultCodigo: 42, ClienteDefaultNome: 'Fulano', ListaPrecoDefault: 3 })` | `clienteAtual = { codigoCliente: 42, nome: 'Fulano', documento: null, listaPreco: 3, descontoConvenio: 0, origem: 'DEFAULT' }`; **nenhum** evento de auditoria disparado; **nenhuma** chamada a `GetCliente` | `FR-004`, AD-032, AD-108 |
| Default vazio | `inicializarClientePadrao({ ClienteDefaultCodigo: null })` | `clienteAtual === null` | `FR-005`, `CLI-06` |
| Primeira seleção explícita | `selecionarCliente(clienteX, 'BUSCA_DOCUMENTO')` numa venda nova | evento `CLIENTE_SELECIONADO` com `{ codigoCliente, nome }` de `clienteX` | `research.md` D9 |
| Troca subsequente | selecionar `clienteX`, depois `selecionarCliente(clienteY, 'BUSCA_LIVRE')` | evento `CLIENTE_TROCADO` com `{ codigoClienteAnterior: X, codigoClienteNovo: Y }` | `research.md` D9 |
| Cadastro simplificado | `cadastrarESelecionarCliente(dados)` com mock de `postCliente` retornando sucesso | evento `CLIENTE_CRIADO`; `clienteAtual.origem === 'CADASTRO_SIMPLIFICADO'` | `CLI-03`, AD-061 |
| Bloqueio pós-pagamento | injetar `podeMutarCarrinho: () => false`, tentar `selecionarCliente` | `clienteAtual` inalterado, nenhum evento disparado | `FR-008`, `CLI-07`, AD-043 |
| Troca dispara re-fetch por SKU | carrinho com 2 linhas ativas de SKUs diferentes + 1 linha congelada; trocar cliente | `fetchProduto` chamado exatamente 2 vezes (uma por SKU ativo distinto), nunca para o SKU da linha congelada | `research.md` D7 |
| `null` nunca vira fallback | inspecionar `ClienteVenda` de um cliente sem convênio | `descontoConvenio === null`, nunca `0` tratado como "valor calculado" pelo consumidor | `research.md` D10 |

---

## Camada 3 — E2E (fluxo dourado)

```bash
npx playwright test tests/e2e/identificacao-cliente.spec.ts
```

Percurso, contra o ambiente de dev do ERP:

1. Abrir o Checkout pelo redirect do ERP (sessão válida) → o campo cliente já mostra o cliente default, sem nenhuma interação.
2. Abrir o modal de busca, digitar um CPF conhecido → resultado único, seleção associa o cliente à venda (evento `CLIENTE_SELECIONADO`).
3. Abrir o modal novamente, buscar por nome parcial → lista paginada aparece (skeleton Boneyard enquanto carrega); selecionar um candidato dispara `GetCliente` pelo documento do candidato antes de associar (evento `CLIENTE_TROCADO`, já que houve seleção explícita antes).
4. Buscar um CPF inexistente → sem resultado, oferece cadastro simplificado; preencher e confirmar → `PostCliente` é chamado, cliente passa a existir e é associado (evento `CLIENTE_CRIADO`).
5. Digitar um CNPJ (14 dígitos) no campo de documento → **nenhuma chamada de rede é feita** (`GetCliente` não é disparado); aviso explica que a venda para pessoa jurídica exige NFe, emitida pelo ERP, fora do Checkout; o cadastro simplificado **não** é oferecido. Informar no mesmo campo o **código** de um cliente pessoa jurídica (até 6 dígitos) → o cadastro é resolvido por `GetCliente`, mas a associação é recusada com o mesmo aviso e `clienteAtual` fica inalterado. Note que **não há como montar esse cenário pela busca por termo livre**: `PCheckout_ClientesLista` filtra `where CliTip = 'F'` no próprio ERP (verificado no código-fonte, 2026-09-03), então a lista nunca exibe pessoa jurídica. ~~Buscar um CNPJ **com** resultado (cliente PJ pré-existente) → seleção funciona normalmente.~~ **Corrigido (2026-09-03, AD-133).**
6. Com carrinho já populado (produto com `TipoPreco = 9`), trocar o cliente → nova chamada a `GetProduto` por SKU ativo, preço da linha atualiza para refletir a lista do novo cliente.
7. Repetir o passo 6 com um pagamento aprovado no carrinho → troca bloqueada, sem chamada de rede nova, `clienteAtual` inalterado.
8. Repetir os passos 2-4 no layout mobile (mesmo estado de venda, layout condicional) → mesmo resultado.

### Verificações manuais que o E2E não cobre

- **F5 no meio da venda**: o navegador pede confirmação (`beforeunload`) e, ao confirmar, o cliente volta a ser o default (ou vazio) — nada do que foi selecionado sobrevive (Constitution VI, AD-006).
- **Filtro "Ativo"**: confirmar visualmente que o chip **não** aparece no modal de busca (AD-093) — sua ausência é o comportamento correto, não uma regressão.

---

## Gates antes de considerar a feature pronta

| Gate | Comando | Quando |
|---|---|---|
| TypeScript `strict` sem erro | `npx tsc --noEmit` | antes de **qualquer** `git push` (Constitution, Development Workflow) |
| Suíte unitária do domínio verde | `npm test -- tests/unit/domain/cliente` | antes do push |
| `/owasp-security` | skill | antes de merge para `master`/deploy de produção |

---

## Achados de contrato levantados no Design

| Achado | Resolução | Onde está |
|---|---|---|
| `GetListaClientes`/`GetCliente` sem campo/parâmetro de status | **AD-093** — filtro "Ativo" removido do modal de cliente, decisão de produto, nada bloqueado | `research.md`, achados desta fase |
| `GetCliente` só busca por documento, sem forma de completar dados do cliente default por código | **AD-094**, **resolvido em 2026-08-31 por AD-108** — a lista de preço do cliente default vem de `SessaoUsuario.ListaPrecoDefault` e o convênio é inexistente (`descontoConvenio = 0`), então `GetCliente` nunca é chamado para ele; item 31 de `.specs/project/PENDENCIES.md` **fechado** | `research.md`, D3, D10, achados desta fase |

A feature 005 não fica bloqueada para `/speckit-tasks` — e, desde AD-108 (2026-08-31), não tem mais nenhuma limitação conhecida em aberto.
