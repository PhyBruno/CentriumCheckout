import { describe, expect, it } from 'vitest';
import {
  ehFormaDeValeDevolucao,
  interpretarRespostaTicket,
} from '../../../../src/client/domain/pagamento/valeDevolucao';
import { emCentavos, formaDe } from '../../../support/pagamento';

/**
 * Substitui os casos de AD-048/D10, que liam `fpgUtiCar` como sinalizador de
 * elegibilidade e tratavam vazio como elegível. Decisão do usuário
 * (2026-09-04): `'VDV'` identifica a forma **que é** o vale devolução, e nada
 * mais.
 */
describe('ehFormaDeValeDevolucao — só `VDV` (revoga AD-048/D10)', () => {
  it('fpgUtiCar "VDV" é a forma de vale devolução', () => {
    expect(ehFormaDeValeDevolucao(formaDe({ fpgUtiCar: 'VDV' }))).toBe(true);
  });

  it('fpgUtiCar vazio NÃO é vale devolução — é uma forma comum', () => {
    expect(ehFormaDeValeDevolucao(formaDe({ fpgUtiCar: '' }))).toBe(false);
  });

  it('fpgUtiCar só com espaços NÃO é vale devolução', () => {
    expect(ehFormaDeValeDevolucao(formaDe({ fpgUtiCar: '   ' }))).toBe(false);
  });

  it('qualquer outro valor NÃO é vale devolução', () => {
    expect(ehFormaDeValeDevolucao(formaDe({ fpgUtiCar: 'OUTRO' }))).toBe(false);
  });

  it('normaliza espaços e caixa — o cadastro do ERP é string livre', () => {
    expect(ehFormaDeValeDevolucao(formaDe({ fpgUtiCar: ' vdv ' }))).toBe(true);
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
