import { describe, expect, it, vi } from 'vitest';
import {
  ehCartao,
  ehDinheiro,
  ehPixDinamico,
  exigeDocumentoImpresso,
  MEIOS_PAGTO_NFE,
} from '../../../../src/client/domain/pagamento/formaPagamento';
import { formaDe } from '../../../support/pagamento';

describe('exigeDocumentoImpresso — nunca exige impressão (FR-018/AD-064)', () => {
  it.each(MEIOS_PAGTO_NFE)('devolve false para %s', (meio) => {
    expect(exigeDocumentoImpresso(formaDe({ meioPagtoNFe: meio }))).toBe(false);
  });

  it('teste negativo (I10, D12): aplicar DuplicataMercantil nunca aciona o serviço de impressão', () => {
    const impressora = vi.fn();
    const forma = formaDe({ meioPagtoNFe: 'DuplicataMercantil' });

    // Reproduz o formato real do call site: o serviço de impressão só seria
    // acionado se `exigeDocumentoImpresso` autorizasse. O tipo de retorno
    // literal `false` já barra isso em compilação — este teste reafirma a
    // garantia em runtime, para que uma feature futura de impressão não
    // reintroduza o comportamento em silêncio.
    function aplicarPagamentoComImpressaoSePreciso(): void {
      if (exigeDocumentoImpresso(forma)) {
        impressora();
      }
    }

    aplicarPagamentoComImpressaoSePreciso();

    expect(impressora).not.toHaveBeenCalled();
  });
});

describe('predicados sobre a forma (sanidade — comportamento já fixado em formaPagamento.ts)', () => {
  it('ehDinheiro reconhece só Dinheiro', () => {
    expect(ehDinheiro(formaDe({ meioPagtoNFe: 'Dinheiro' }))).toBe(true);
    expect(ehDinheiro(formaDe({ meioPagtoNFe: 'Pix' }))).toBe(false);
  });

  it('ehCartao reconhece crédito e débito', () => {
    expect(ehCartao(formaDe({ meioPagtoNFe: 'CartaoCredito' }))).toBe(true);
    expect(ehCartao(formaDe({ meioPagtoNFe: 'CartaoDebito' }))).toBe(true);
    expect(ehCartao(formaDe({ meioPagtoNFe: 'Dinheiro' }))).toBe(false);
  });

  it('ehPixDinamico não reconhece PixEstatico', () => {
    expect(ehPixDinamico(formaDe({ meioPagtoNFe: 'Pix' }))).toBe(true);
    expect(ehPixDinamico(formaDe({ meioPagtoNFe: 'PixEstatico' }))).toBe(false);
  });
});
