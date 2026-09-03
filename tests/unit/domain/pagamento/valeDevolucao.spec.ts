import { describe, expect, it } from 'vitest';
import {
  ehElegivelParaVale,
  interpretarRespostaTicket,
} from '../../../../src/client/domain/pagamento/valeDevolucao';
import { emCentavos, formaDe } from '../../../support/pagamento';

describe('ehElegivelParaVale — AD-048/D10', () => {
  it('fpgUtiCar vazio é elegível', () => {
    expect(ehElegivelParaVale(formaDe({ fpgUtiCar: '' }))).toBe(true);
  });

  it('fpgUtiCar só com espaços é elegível', () => {
    expect(ehElegivelParaVale(formaDe({ fpgUtiCar: '   ' }))).toBe(true);
  });

  it('fpgUtiCar "VDV" é elegível', () => {
    expect(ehElegivelParaVale(formaDe({ fpgUtiCar: 'VDV' }))).toBe(true);
  });

  it('valor explicitamente diferente de vale devolução é inelegível', () => {
    expect(ehElegivelParaVale(formaDe({ fpgUtiCar: 'OUTRO' }))).toBe(false);
  });
});

describe('interpretarRespostaTicket — AD-101 (corrige o fallback de AD-099)', () => {
  it('usa só valido — ignora mensagem mesmo quando ela "confirmaria" o ticket', () => {
    const resultado = interpretarRespostaTicket({
      valorTicket: emCentavos(1500),
      valido: true,
      mensagem: 'qualquer coisa',
    });

    expect(resultado).toEqual({ valido: true, valor: 1500 });
  });

  it('mensagem "Ticket Válido" não basta — AD-099 foi revogada por AD-101', () => {
    const resultado = interpretarRespostaTicket({
      valorTicket: emCentavos(1500),
      valido: false,
      mensagem: 'Ticket Válido',
    });

    expect(resultado).toEqual({ valido: false, mensagem: 'Ticket Válido' });
  });
});
