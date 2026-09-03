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
 * para esse cliente. Só o documento segue indisponível — `GetSessao` não o
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
    celular: null,
    listaPreco: sessaoUsuario.ListaPrecoDefault,
    descontoConvenio: 0,
    codigoConvenio: null,
    origem: 'DEFAULT',
  };
}
