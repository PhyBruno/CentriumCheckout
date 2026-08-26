# Contract: `GetCliente` / `GetListaClientes` / `PostCliente` via `/api/erp/*`

Consumido pela camada de serviço `src/client/services/cliente/clienteQueries.ts` (ver `plan.md`, Project Structure). Todas as chamadas passam pelo proxy autenticado do BFF (`/api/erp/*`, feature 002) — nunca diretamente para o host do ERP a partir do navegador.

Fonte: `Fluxograma - Diagrama - Alinhamentos/APICentriumOAuth.yaml`.

---

## `GET /api/erp/GetCliente`

**Query params**: `Empresa` (int64, opcional — preenchido automaticamente pelo BFF a partir da sessão), `CPFCNPJ` (string).

**Response** (`GetClienteOutput.Cliente`, schema `ClienteCheckout`):

```ts
interface ClienteCheckout {
  Empresa: number;
  CodCliente: number;
  nome: string;
  cpf: string;
  email: string;
  celular: string;
  cep: string;
  endereco: string;
  bairro: string;
  numero: string;
  cidade: string;
  uf: string;
  LimiteCredito: number;        // presente no contrato, NUNCA usado pelo Checkout (D5/AD-026)
  PermiteVendaCredito: boolean; // idem
  CodigoConvenio: number;
  NomeConvenio: string;
  DescontoConvenio: number;     // percentual 0-100, não valor absoluto (AD-023)
  ListaPreco: number;
}
```

**Limitação confirmada (AD-094, pendência bloqueante)**: não existe parâmetro `CodCliente`/`CodigoCliente` — a única forma de buscar é por documento. Não há caminho de contrato para resolver um cliente a partir só do código (ex.: `SessaoUsuario.ClienteDefaultCodigo`).

**Uso no Checkout**: `fetchClientePorDocumento(cpfCnpj)` — chamada imperativa (não `useQuery` cacheado), disparada em dois pontos: (1) busca direta por documento (`CLI-01`), (2) depois de selecionar um candidato no modal de lista, usando o `CPF` do item selecionado (`research.md`, D1).

---

## `GET /api/erp/GetListaClientes`

**Query params**: `Empresa` (int64, automático), `Txtbusca` (string), `Pagina` (int32), `Tamanhopagina` (int64).

**Response** (`GetListaClientesOutput.ListaClientes`, schema `SDTCheckoutListaClientes`):

```ts
interface SDTCheckoutListaClientes {
  PaginaAtual: number;
  RegistrosPorPagina: number;
  TotalRegistros: number;
  TotalPaginas: number;
  Clientes: ClientesItem[];
}

interface ClientesItem {
  ClienteCodigo: number;
  ClienteNome: string;
  CPF: string;
  ListaPreco: number;
  Celular: string;
  Telefone: string;
  Endereco: {
    cep: string;
    endereco: string;
    bairro: string;
    numero: string;
    cidade: string;
    uf: string;
  };
}
```

**Ausentes deste schema** (confirmado por inspeção do yaml — não é falta de mapeamento): `DescontoConvenio`, `CodigoConvenio`, `email`, e **qualquer campo de status/ativo**. Não existe parâmetro de filtro por status entre os quatro parâmetros aceitos.

**Uso no Checkout**: `useBuscaClientes(txtBusca, pagina)` — `enabled: txtBusca.length >= SessaoUsuario.QtdMinCharParaConsulta` (mesmo piso já usado pela busca de produto, feature 003, nunca hardcodado — AD-024). `staleTime: 0` — busca-como-digita, sem necessidade de manter resultado antigo em cache além do próprio ciclo de vida do modal. Cada item selecionado dispara `fetchClientePorDocumento(item.CPF)` antes de associar o cliente à venda (D1).

**Filtro "Ativo"**: **não implementado** — removido do design (AD-093). Nenhum parâmetro de status é enviado; a UI não exibe o chip.

---

## `POST /api/erp/PostCliente`

**Request body** (`PostClienteInput.Cliente`, schema `ClienteCheckout`, mas o Checkout só preenche o subconjunto confirmado por AD-024):

```jsonc
{
  "Cliente": {
    "Empresa": 1,                          // codigoEmpresa da sessão
    "nome": "string",
    "cpf": "string",                        // 11 dígitos, validado por formato antes do envio (D6)
    "email": "string",
    "celular": "string",
    "cep": "string",                        // 8 dígitos, validado por formato antes do envio (D6)
    "endereco": "string",                   // texto livre, sem validação de IBGE
    "bairro": "string",
    "numero": "string",
    "cidade": "string",
    "uf": "string"
    // LimiteCredito, PermiteVendaCredito, CodCliente, CodigoConvenio, NomeConvenio,
    // DescontoConvenio, ListaPreco: NUNCA enviados pelo Checkout — o schema permite,
    // mas PCheckout_PostCliente não os grava (AD-024); enviá-los seria ruído sem efeito.
  }
}
```

**Response**: `array<GeneXus.Common.Messages_Message>` — sem corpo de cliente criado. O Checkout precisa, na sequência, chamar `GetCliente(CPFCNPJ=<cpf enviado>)` para obter o `CodCliente`/registro completo recém-criado, já que `PostCliente` não devolve o cliente criado diretamente.

**Achados confirmados na KB do ERP (AD-024, não repetidos aqui em detalhe — ver `.specs/project/STATE.md`)**:
- `CliTip` é hardcoded `'F'` dentro da procedure — o Checkout nunca cria cliente pessoa jurídica por este caminho, independente do que o formulário envie.
- Quando o tenant tem `UtilizaSegundoNivelDeEnderecos = 'S'`, o mesmo payload de endereço é roteado para um registro de `Endereco` separado — transparente para o Checkout, mesmo payload de qualquer forma.

**Uso no Checkout**: `postCliente(dados: CadastroSimplificadoInput)` monta o payload acima, chama `PostCliente`, depois `fetchClientePorDocumento(dados.cpf)` para obter o `ClienteCheckout` completo (incluindo `CodCliente`) antes de `clienteSlice.cadastrarESelecionarCliente` associar o cliente à venda e disparar `CLIENTE_CRIADO`.
