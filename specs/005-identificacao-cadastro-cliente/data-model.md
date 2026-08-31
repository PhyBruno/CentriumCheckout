# Phase 1 — Data Model: Identificação e Cadastro de Cliente

**Feature**: `specs/005-identificacao-cadastro-cliente/` | **Date**: 2026-08-26

Todas as estruturas abaixo vivem **em memória**, no slice `cliente` do `vendaStore` (Zustand + Immer, sem `persist` — Constitution VI / AD-006). Nada aqui é gravado em Dexie, `localStorage` ou IndexedDB, e nada sobrevive a F5.

---

## 1. `ClienteVenda` — snapshot do cliente atual da venda

Cópia dos dados relevantes de `ClienteCheckout` (ou dos campos disponíveis de `GetSessao`, no caso do default — ver `research.md` D3), feita **no momento da seleção/inicialização**. Nunca uma referência viva ao cache do TanStack Query — mesma regra de fronteira que a feature 003 já aplica ao produto (`.specs/codebase/ARCHITECTURE.md`).

```ts
export interface ClienteVenda {
  readonly codigoCliente: number;          // ClienteCheckout.CodCliente / SessaoUsuario.ClienteDefaultCodigo
  readonly nome: string;
  readonly documento: string | null;       // CPF/CNPJ — null só para origem 'DEFAULT' (GetSessao não devolve documento, ver D3)
  readonly listaPreco: number | null;       // lista de preço do cliente — ClienteCheckout.ListaPreco, ou SessaoUsuario.ListaPrecoDefault quando origem = 'DEFAULT' (AD-108)
  readonly descontoConvenio: number | null; // ClienteCheckout.DescontoConvenio — percentual 0-100; sempre 0 para origem = 'DEFAULT' (cliente default não tem convênio, AD-108)
  readonly codigoConvenio: number | null;   // ClienteCheckout.CodigoConvenio
  readonly origem: OrigemCliente;
}

export type OrigemCliente = 'DEFAULT' | 'BUSCA_DOCUMENTO' | 'BUSCA_LIVRE' | 'CADASTRO_SIMPLIFICADO';
```

**Invariante**: `listaPreco`/`descontoConvenio` nunca recebem um valor de fallback inventado (`0`, `1`) — `null` significa "o cadastro deste cliente não define o campo" e, hoje, só ocorre em `CADASTRO_SIMPLIFICADO` (`research.md`, D10). Para `origem = 'DEFAULT'` os dois campos carregam **valores reais**, não `null`: a lista vem de `SessaoUsuario.ListaPrecoDefault` e o convênio é `0` por regra de negócio (AD-108). A feature 003, ao consumir este snapshot, MUST tratar `null` como ausência de dado, nunca como "sem desconto"/"lista padrão".

**Nota de origem por campo**:

| Origem | `documento` | `listaPreco` | `descontoConvenio` |
|---|---|---|---|
| `DEFAULT` (pré-seleção automática, AD-032) | sempre `null` | `SessaoUsuario.ListaPrecoDefault` (AD-108) | sempre `0` — cliente default não tem convênio (AD-108) |
| `BUSCA_DOCUMENTO` (`GetCliente` direto) | preenchido | preenchido se o cliente tiver | preenchido se o cliente tiver convênio |
| `BUSCA_LIVRE` (seleção na lista → `GetCliente`, D1) | preenchido | preenchido se o cliente tiver | preenchido se o cliente tiver convênio |
| `CADASTRO_SIMPLIFICADO` (`PostCliente`) | preenchido (o CPF informado no formulário) | `null` — cliente novo, sem lista de preço nem convênio configurados | `null` |

---

## 2. Estado do slice

```ts
export interface ClienteState {
  readonly clienteAtual: ClienteVenda | null; // null só quando a empresa nunca configurou cliente default (FR-005/CLI-06)
  readonly houveEscolhaExplicita: boolean;    // interno — decide CLIENTE_SELECIONADO vs. CLIENTE_TROCADO, ver research.md D9
}
```

### Invariantes

| # | Invariante | Requisito |
|---|---|---|
| I1 | `clienteAtual` só é `null` quando `SessaoUsuario.ClienteDefaultCodigo` veio vazio **e** o operador ainda não selecionou/cadastrou nenhum cliente | `FR-005`, `CLI-06` |
| I2 | `houveEscolhaExplicita` reseta para `false` só no início/retomada de uma venda (mesmo call site de `resetarAuditoria`, feature 001) — nunca no meio de uma venda em andamento | `research.md` D9 |
| I3 | A pré-seleção automática do default (`inicializarClientePadrao`) nunca altera `houveEscolhaExplicita` nem dispara evento de auditoria | `research.md` D3, D9 |
| I4 | `trocarCliente`/`cadastrarESelecionarCliente` são no-op quando `podeMutarCarrinho()` retorna `false` (pagamento aprovado) — `clienteAtual` permanece inalterado | `FR-008`, `CLI-07`, AD-043 |
| I5 | Nenhum indicador de origem (`origem`) é exposto na UI do campo cliente — o campo mostra só nome/documento, sem distinguir `DEFAULT` de seleção manual | `FR-006`, AD-053 |

---

## 3. Ações do slice

```ts
function inicializarClientePadrao(sessaoUsuario: SessaoUsuario): void;
// Chamado uma única vez, no início/retomada de uma sessão de venda — mesmo call site que zera carrinho e auditoria.
// Não dispara evento de auditoria (I3). Ver research.md D3.

function selecionarCliente(cliente: ClienteCheckout, origem: 'BUSCA_DOCUMENTO' | 'BUSCA_LIVRE'): void;
// Aplica o predicado podeMutarCarrinho() antes de mutar, se houver carrinho populado (I4).
// Dispara CLIENTE_SELECIONADO (primeira escolha) ou CLIENTE_TROCADO (substituição) — ver research.md D9.
// Se o carrinho tem linhas ativas não-congeladas, dispara o re-fetch de GetProduto por SKU (research.md D7).

function cadastrarESelecionarCliente(dados: CadastroSimplificadoInput): Promise<void>;
// Chama postCliente(dados) (contrato em contracts/erp-cliente-api.md), depois aplica o resultado
// via o mesmo caminho de selecionarCliente, mas sempre dispara CLIENTE_CRIADO (nunca TROCADO).
```

Não há uma função `trocarCliente` separada de `selecionarCliente` — a distinção `SELECIONADO`/`TROCADO` é decidida internamente pela flag `houveEscolhaExplicita` (`research.md` D9), não por duas actions diferentes na API pública do slice.

---

## 4. Entrada do formulário de cadastro simplificado

```ts
export interface CadastroSimplificadoInput {
  readonly nome: string;
  readonly cpf: string;       // validado por formato (11 dígitos) antes do envio — research.md D6
  readonly email: string;
  readonly celular: string;
  readonly cep: string;       // validado por formato (8 dígitos) antes do envio — research.md D6
  readonly endereco: string;  // texto livre, sem validação de IBGE (AD-023)
  readonly bairro: string;
  readonly numero: string;
  readonly cidade: string;
  readonly uf: string;
}
```

**Nunca presentes**: `LimiteCredito`, `PermiteVendaCredito` (`research.md` D5, AD-026) — nem no tipo, nem na UI, nem no payload de `PostCliente`.

Mapeamento para o payload real (`PostClienteInput.Cliente`, contrato em `contracts/erp-cliente-api.md`): os mesmos 10 campos acima, mais `Empresa` (de `codigoEmpresa`, já disponível na sessão — AD-019). `CliTip` nunca é enviado — hardcoded `'F'` na procedure do ERP (AD-024).

---

## 5. Classificação de documento (`src/client/domain/cliente/documento.ts`)

Módulo puro, sem React/Zustand/Query — mesma categoria arquitetural que `domain/precificacao/codigoProduto.ts` (feature 003).

```ts
export type TipoDocumento = 'CPF' | 'CNPJ' | 'INVALIDO';

function classificarDocumento(texto: string): TipoDocumento;
// Remove pontuação, conta dígitos: 11 → 'CPF', 14 → 'CNPJ', outro comprimento → 'INVALIDO'.

function validarFormatoCPF(texto: string): boolean;   // 11 dígitos, sem checksum — research.md D6
function validarFormatoCEP(texto: string): boolean;   // 8 dígitos, sem validação de IBGE — AD-023
```

**Uso em `ModalBuscaCliente.tsx`**: `classificarDocumento(termoBusca) === 'CNPJ'` decide se o CTA de cadastro simplificado é oferecido numa busca sem resultado (`research.md` D4) — não decide se a busca em si é bloqueada.

---

## 6. Eventos de auditoria emitidos

Consumidos via o contrato da feature 001 (`specs/001-auditoria-acoes-operador/contracts/auditoria-events.md`). Shapes confirmados em `specs/001-auditoria-acoes-operador/data-model.md`:

| Ação do operador | Evento | `detalhes` |
|---|---|---|
| Primeira seleção explícita de cliente (busca) | `CLIENTE_SELECIONADO` | `{ codigoCliente: number, nome: string }` |
| Cadastro simplificado confirmado | `CLIENTE_CRIADO` | `{ codigoCliente: number, nome: string }` |
| Substituição de um cliente já escolhido explicitamente | `CLIENTE_TROCADO` | `{ codigoClienteAnterior: number, codigoClienteNovo: number }` |

Regra completa de qual evento dispara quando: `research.md`, D9. A pré-seleção automática do default nunca gera evento algum.
