/**
 * Fixtures sintéticas dos payloads de `ListaDAVs` e `GetDav` (feature 006),
 * compartilhadas pelos testes unitários e de integração.
 *
 * Todos os valores são inventados — nenhum dado de produção. Os números vêm em
 * **reais e unidades**, exatamente como o ERP devolve (`double`): a conversão
 * para centavos/milésimos é responsabilidade do schema Zod, e é justamente isso
 * que os testes precisam exercitar.
 */

/** `DataEmissao`/`Datainicial`/`Datafinal` — `format: date` do contrato. */
export const DATA_EMISSAO = '2026-06-11';

export const NUMERO_DAV = '004821';
export const NUMERO_NOTA = 90210;
export const CODIGO_CLIENTE_DAV = 4711;
export const CODIGO_VENDEDOR_DAV = 12;
export const SKU_DAV = '001234';

export function davDaLista(sobrescritas: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    NumeroDAV: NUMERO_DAV,
    Titulo: 'PV-11842',
    // Presente no contrato, sem uso no Checkout — passa íntegro pelo `loose`.
    Senha: '',
    DataEmissao: DATA_EMISSAO,
    ClienteCodigo: CODIGO_CLIENTE_DAV,
    ClienteNome: 'CLIENTE TESTE 01',
    VendedorCodigo: CODIGO_VENDEDOR_DAV,
    ValorTotal: 18.5,
    ...sobrescritas,
  };
}

export function respostaListaDavs(
  itens: readonly Record<string, unknown>[] = [davDaLista()],
  sobrescritas: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    CheckoutListaDAVs: {
      PaginaAtual: 1,
      RegistrosPorPagina: 20,
      TotalRegistros: itens.length,
      TotalPaginas: 1,
      DAV: itens,
      ...sobrescritas,
    },
  };
}

export function produtoDoDav(sobrescritas: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sequencial: 1,
    codigoProduto: SKU_DAV,
    quantidade: 2,
    precoUnitario: 10.0,
    DescontoPercentual: 0,
    DescontoValor: 1.5,
    UDM: 'UN',
    ValorBruto: 20.0,
    ValorTotal: 18.5,
    ...sobrescritas,
  };
}

/** Item de pagamento em dinheiro: `TEFidentificacao = 0` marca "não é TEF". */
export function formaDePagamentoDoDav(
  sobrescritas: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    FormaCodigo: 1,
    FormaMeioPagtoNFe: '01',
    FormaValor: 18.5,
    FormaIntegracaoCartao: '',
    FormaFpgUtiCar: '',
    FormaEntrada: '',
    TEFidentificacao: 0,
    TEFCNPJ: '',
    TEFBandeira: '',
    TEFNumeroAutorizacao: '',
    TEFTipoIntegracao: '',
    FormaPixGUID: '',
    TicketDevolucao: '',
    ...sobrescritas,
  };
}

/** Corpo de `CheckoutFaturarNFCe` — o mesmo shape de `CarregarNFCe` (AD-057). */
export function documentoDoDav(
  sobrescritas: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    Empresa: 1,
    SuspenderOuFaturar: '',
    clienteCodigo: CODIGO_CLIENTE_DAV,
    vendedorCodigo: CODIGO_VENDEDOR_DAV,
    CondicaoPagamentoCodigo: 1,
    NumeroNota: NUMERO_NOTA,
    CadSerieNFCe: '1',
    UsuarioCodigo: 7,
    Log: '',
    produtos: [produtoDoDav()],
    FormasDePagamento: [formaDePagamentoDoDav()],
    // Sem `DavNum`: o campo saiu do contrato em `20260827192357` (AD-107).
    ...sobrescritas,
  };
}

export function respostaGetDav(
  sobrescritas: Record<string, unknown> = {},
): Record<string, unknown> {
  return { OutCheckoutFaturarNFCe: documentoDoDav(sobrescritas) };
}
