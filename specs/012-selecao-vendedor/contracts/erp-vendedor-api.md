# Contract: `GetListaVendedores` via `/api/erp/*`

Consumido pela camada de serviço `src/client/services/vendedor/vendedorQueries.ts` (ver `plan.md`, Project Structure). A chamada passa pelo proxy autenticado do BFF (`/api/erp/*`, feature 002) — nunca diretamente para o host do ERP a partir do navegador.

Fonte: `Fluxograma - Diagrama - Alinhamentos/ApiCentriumOAuth.yaml`.

---

## `GET /api/erp/GetListaVendedores`

**Query params**: `Empresa` (int64, opcional — preenchido automaticamente pelo BFF a partir da sessão, mesmo padrão de escopo por empresa de AD-019), `Txtbusca` (string), `Pagina` (int32), `Tamanhopagina` (int64).

**Response** (`GetListaVendedoresOutput.CheckoutListaVendedores`, schema `CheckoutListaVendedores`):

```ts
interface CheckoutListaVendedores {
  PaginaAtual: number;
  RegistrosPorPagina: number;
  TotalRegistros: number;
  TotalPaginas: number;
  Vendedores: VendedoresItem[];
}

interface VendedoresItem {
  VendedorCodigo: number;
  VendedorNome: string;
  VendedorCGC: string;
  VendedorFone: string;
}
```

**Ausentes deste schema** (confirmado por inspeção direta do yaml — não é falta de mapeamento, é a mesma lacuna já registrada para cliente em AD-093): **qualquer campo de status/ativo**, e **qualquer campo de função/cargo**. Não existe parâmetro de filtro por status entre os quatro parâmetros aceitos. Não existe `GetVendedor` (singular) no contrato — `GetListaVendedores` é o único endpoint relacionado a vendedor (`research.md` D1).

**Uso no Checkout**: `useBuscaVendedores(txtBusca, pagina)` — `enabled: txtBusca.length >= SessaoUsuario.QtdMinCharParaConsulta` (mesmo piso já usado pela busca de produto e de cliente, nunca hardcodado — AD-024). `staleTime: 0` — busca-como-digita. Cada item selecionado é usado **diretamente** para montar `VendedorVenda` (`VendedorCodigo` → `codigo`, `VendedorNome` → `nome`) — nenhuma chamada adicional é feita (`research.md` D1). `VendedorCGC` é exibido como coluna "CPF" na tabela do modal; `VendedorFone` não é exibido (sem coluna correspondente no design).

**Filtro "Ativo"**: **não implementado** — removido do design (AD-103, mesma decisão de AD-093 para cliente). Nenhum parâmetro de status é enviado; a UI não exibe o chip.
