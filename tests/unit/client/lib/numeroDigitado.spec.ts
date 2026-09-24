import { describe, expect, it } from 'vitest';
import {
  lerCentavosDigitados,
  lerDecimalDigitado,
} from '../../../../src/client/lib/numeroDigitado';

/**
 * Pedido do usuário, 2026-09-24: `,8` é `0,8`, e campo vazio é `0` — "não
 * precisa ter que voltar no campo e digitar 0" —, em valor, quantidade,
 * desconto e percentual.
 */
describe('lerDecimalDigitado', () => {
  it.each([
    ['3', 3],
    ['3,5', 3.5],
    ['3.5', 3.5],
    [',8', 0.8],
    ['.8', 0.8],
    ['8,', 8],
    ['', 0],
    ['   ', 0],
    [',', 0],
  ])('%j vale %d', (texto, esperado) => {
    expect(lerDecimalDigitado(texto, 3)).toBe(esperado);
  });

  it.each(['abc', '1,2,3', '-1', '1e3', '3,1234'])('%j não é número', (texto) => {
    expect(lerDecimalDigitado(texto, 3)).toBeNull();
  });

  it('o limite de casas é de quem chama', () => {
    expect(lerDecimalDigitado('5,5', 1)).toBe(5.5);
    expect(lerDecimalDigitado('5,55', 1)).toBeNull();
  });
});

describe('lerCentavosDigitados', () => {
  it.each([
    ['12,34', 1234],
    ['12.34', 1234],
    [',5', 50],
    [',05', 5],
    ['', 0],
    ['10', 1000],
  ])('%j vale %d centavos', (texto, esperado) => {
    expect(lerCentavosDigitados(texto)).toBe(esperado);
  });

  it('três casas não é dinheiro', () => {
    expect(lerCentavosDigitados('1,234')).toBeNull();
  });
});
