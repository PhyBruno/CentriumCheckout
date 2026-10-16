import { describe, expect, it } from 'vitest';
import { formaParaRetrato } from '../../../../src/client/domain/pagamento/formaParaRetrato';
import { MEIO_PAGTO } from '../../../../src/client/domain/pagamento/formaPagamento';
import { pagamentoDe } from '../../../support/pagamento';

/**
 * T020 — o bloco TEF do retrato da NFCe segue o SDT `CheckoutFaturarNFCe` da
 * KB (`research.md` D16, invariante T11 de `data-model.md` §6).
 *
 * O SDT trocou `TEFidentificacao`/`TEFCNPJ`/`TEFNumeroAutorizacao` por
 * `TEFPagId`: o ERP lê autorização, adquirente e bandeira da `TransacaoTEF`.
 * Valores sintéticos.
 */

const CAMPOS_TEF_REMOVIDOS = ['TEFidentificacao', 'TEFCNPJ', 'TEFNumeroAutorizacao'] as const;

/**
 * Feature 018, FR-016/FR-017 — o dinheiro vai ao ERP com o que o cliente entregou,
 * para o ERP calcular o troco; as demais formas seguem com o valor aplicado.
 */
describe('formaParaRetrato — FormaValor e troco', () => {
  it('dinheiro com troco leva o recebido, não o que quitou a venda', () => {
    const forma = formaParaRetrato(
      pagamentoDe({
        meioPagtoNFe: MEIO_PAGTO.Dinheiro,
        valorAplicado: 8_700,
        valorRecebido: 10_000,
      }),
    );

    expect(forma).toMatchObject({ FormaValor: 100 });
  });

  it('dinheiro exato leva o valor da venda (recebido igual ao aplicado)', () => {
    const forma = formaParaRetrato(
      pagamentoDe({
        meioPagtoNFe: MEIO_PAGTO.Dinheiro,
        valorAplicado: 8_700,
        valorRecebido: 8_700,
      }),
    );

    expect(forma).toMatchObject({ FormaValor: 87 });
  });

  it('cartão leva o valor aplicado', () => {
    const forma = formaParaRetrato(
      pagamentoDe({
        meioPagtoNFe: MEIO_PAGTO.CartaoCredito,
        valorAplicado: 6_000,
        valorRecebido: null,
      }),
    );

    expect(forma).toMatchObject({ FormaValor: 60 });
  });
});

describe('formaParaRetrato — TEF', () => {
  it('forma TEF aprovada leva TEFPagId, TEFBandeira e TEFTipoIntegracao "1" (T11)', () => {
    const forma = formaParaRetrato(
      pagamentoDe({
        formaCodigo: 40,
        meioPagtoNFe: MEIO_PAGTO.CartaoDebito,
        integracaoCartao: '1',
        integracao: 'TEF',
        valorAplicado: 8329,
        dadosTEF: {
          pagId: 'pay_exemplo_0001',
          bandeira: 'MASTERCARD',
          nsu: '048291',
          autorizacao: '192837',
          tipoIntegracao: '1',
        },
      }),
    );

    expect(forma).toMatchObject({
      FormaCodigo: 40,
      FormaValor: 83.29,
      TEFPagId: 'pay_exemplo_0001',
      TEFBandeira: 'MASTERCARD',
      TEFTipoIntegracao: '1',
    });
    for (const campo of CAMPOS_TEF_REMOVIDOS) {
      expect(forma).not.toHaveProperty(campo);
    }
  });

  // NSU e autorização são só da tela (`research.md` D13): o ERP os lê da
  // própria `TransacaoTEF`, e mandá-los seria criar um campo que o SDT não tem.
  it('não envia NSU nem autorização, que são só da tela', () => {
    const forma = formaParaRetrato(
      pagamentoDe({
        integracao: 'TEF',
        dadosTEF: {
          pagId: 'pay_exemplo_0002',
          bandeira: 'VISA',
          nsu: '1',
          autorizacao: '2',
          tipoIntegracao: '1',
        },
      }),
    );

    expect(
      Object.keys(forma)
        .filter((chave) => chave.startsWith('TEF'))
        .sort(),
    ).toEqual(['TEFBandeira', 'TEFPagId', 'TEFTipoIntegracao']);
  });

  it('forma sem TEF não leva nenhum campo TEF*', () => {
    const forma = formaParaRetrato(pagamentoDe({ meioPagtoNFe: MEIO_PAGTO.Dinheiro }));

    expect(Object.keys(forma).some((chave) => chave.startsWith('TEF'))).toBe(false);
  });
});
