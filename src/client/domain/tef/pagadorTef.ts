import type { ClienteVenda } from '../cliente/clienteVenda';

/**
 * Dados do pagador de `CriarCardPagamento` (T006, `research.md` D9,
 * `data-model.md` §2.5).
 *
 * Ao contrário do PIX desde AD-258, aqui o ERP **não** resolve o pagador pelo
 * código do cliente: `SDTSmartTefCriarCardReq` tem os dois campos, e o Checkout
 * os preenche.
 */
export interface PagadorTef {
  /** Só dígitos; `''` quando a venda não tem documento (cliente default). */
  readonly cpf: string;
  readonly nome: string;
}

const NAO_DIGITO = /\D/g;

/**
 * - **Cliente identificado** → documento só com dígitos, CPF **ou** CNPJ: o
 *   domínio `CPF` do ERP é `VARCHAR(14)` e cabe um CNPJ, e o valor só alimenta
 *   `extras.CPF` na SmartTEF, não validação fiscal.
 * - **Cliente default** (ou de documento importado sem `GetCliente`, AD-237) →
 *   `documento` é `null`, o CPF vai vazio (ponto 5 do pedido de 2026-10-02) e o
 *   nome do default segue — mais útil ao conciliador do que vazio.
 * - **Sem cliente** → `null`. O chamador recusa sem rede; na prática a ordem da
 *   venda (AD-209) garante cliente antes do pagamento.
 */
export function montarPagadorTef(cliente: ClienteVenda | null): PagadorTef | null {
  if (cliente === null) {
    return null;
  }
  return {
    cpf: cliente.documento === null ? '' : cliente.documento.replace(NAO_DIGITO, ''),
    nome: cliente.nome,
  };
}
