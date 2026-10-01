/**
 * `ClienteCheckout` já validado → `ClienteVenda` (T004).
 *
 * Uma responsabilidade só: adaptar a forma do ERP à forma do domínio. Nenhuma
 * regra de negócio de cliente mora aqui — o Checkout copia o que o ERP devolve
 * (Constitution III).
 */

import type { ClienteVenda, OrigemCliente } from '../../domain/cliente/clienteVenda';
import type { SessaoUsuario } from '../../../shared/schemas/bootstrap.schema';
import type { ClienteCheckout } from '../../../shared/schemas/cliente.schema';

/** Origens que nascem de um `ClienteCheckout` completo (`GetCliente`). */
export type OrigemComCadastro = Exclude<OrigemCliente, 'DEFAULT'>;

/**
 * `CADASTRO_SIMPLIFICADO` é a única origem em que `listaPreco`/
 * `descontoConvenio` podem legitimamente ser `null`: um cliente recém-criado
 * não tem lista nem convênio configurados no ERP, e `PCheckout_PostCliente`
 * não grava nenhum dos dois (AD-024). Ler os campos do `GetCliente` seguinte
 * traria `0`, que a feature 003 não pode distinguir de "sem desconto" —
 * `null` preserva a diferença (`research.md` D10).
 */
export function mapClienteCheckoutParaVenda(
  cliente: ClienteCheckout,
  origem: OrigemComCadastro,
): ClienteVenda {
  const recemCriado = origem === 'CADASTRO_SIMPLIFICADO';

  return {
    codigoCliente: cliente.CodCliente,
    nome: cliente.nome,
    documento: cliente.cpf,
    celular: cliente.celular,
    listaPreco: recemCriado ? null : cliente.ListaPreco,
    descontoConvenio: recemCriado ? null : cliente.DescontoConvenio,
    codigoConvenio: recemCriado ? null : cliente.CodigoConvenio,
    origem,
  };
}

/**
 * Cliente default do PDV, montado **sem nenhuma chamada de rede** (AD-108,
 * `research.md` D3): a lista de preço vem de `SessaoUsuario.ListaPrecoDefault`
 * e o convênio é `0` por regra de negócio, então `GetCliente` nunca é chamado
 * para esse cliente. O contato vem de `ClienteDefaultContato` (contrato de
 * 2026-09-14, AD-237). Só o documento segue indisponível — `GetSessao` não o
 * devolve.
 *
 * Devolve `null` quando a empresa não configurou cliente default: aí o campo
 * cliente nasce vazio e exige seleção manual (`FR-005`/`CLI-06`). `0` é o
 * "vazio" do contrato — `ClienteDefaultCodigo` é `int64` não anulável no yaml,
 * então a ausência chega como zero, não como `null`.
 */
export function mapClienteDefaultParaVenda(sessaoUsuario: SessaoUsuario): ClienteVenda | null {
  const codigoCliente = sessaoUsuario.ClienteDefaultCodigo;
  if (!codigoCliente) {
    return null;
  }

  return {
    codigoCliente,
    nome: sessaoUsuario.ClienteDefaultNome ?? '',
    documento: null,
    // `''` e ausência (ERP anterior ao contrato) são o mesmo "não informado".
    celular: textoOuNulo(sessaoUsuario.ClienteDefaultContato),
    listaPreco: sessaoUsuario.ListaPrecoDefault,
    descontoConvenio: 0,
    codigoConvenio: null,
    origem: 'DEFAULT',
  };
}

function textoOuNulo(valor: string | undefined): string | null {
  const limpo = (valor ?? '').trim();
  return limpo === '' ? null : limpo;
}

/** Cliente como o próprio documento importado o identifica (AD-237). */
export interface ClienteDoDocumento {
  readonly codigoCliente: number;
  readonly nome: string;
}

/**
 * Cliente de um DAV/NFCe importado **quando o `GetCliente` falhou** e o
 * documento já trouxe `ClienteNome` (AD-237).
 *
 * Só código e nome: lista de preço, convênio, documento e celular ficam `null`
 * — nunca um valor inventado (`research.md` D10). Sem lista, o `GetProduto` de
 * um item novo vai só com `Codcliente` e o ERP resolve o preço; as linhas do
 * documento já chegam com o preço dele.
 */
export function mapClienteDoDocumentoParaVenda(
  cliente: ClienteDoDocumento,
  origem: 'DAV' | 'RASCUNHO',
): ClienteVenda {
  return {
    codigoCliente: cliente.codigoCliente,
    nome: cliente.nome,
    documento: null,
    celular: null,
    listaPreco: null,
    descontoConvenio: null,
    codigoConvenio: null,
    origem,
  };
}
