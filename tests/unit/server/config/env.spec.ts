import { describe, expect, it } from 'vitest';
import { loadEnv } from '../../../../src/server/config/env';
import { ENV_DA_ENTRADA } from '../../../support/entradaCifrada';

/**
 * Chave `DESCONTO_CAPA_NO_ERP` (017, US4, T051): nasce desligada, e só os dois
 * literais são aceitos — um valor qualquer não pode ligar o envio da capa ao ERP
 * em silêncio. Valores sintéticos.
 */

const BASE = {
  baseDomain: 'apps.example.test',
  ...ENV_DA_ENTRADA,
  SESSION_SECRET: 'segredo-sintetico-de-teste-com-32+'.padEnd(32, '-'),
  NODE_ENV: 'test',
  SERVE_STATIC_CLIENT: 'false',
};

describe('loadEnv — DESCONTO_CAPA_NO_ERP', () => {
  it('ausente vale desligada', () => {
    expect(loadEnv(BASE).descontoCapaNoErp).toBe(false);
  });

  it.each([
    ['true', true],
    ['false', false],
  ])('"%s" vira %s', (valor, esperado) => {
    expect(loadEnv({ ...BASE, DESCONTO_CAPA_NO_ERP: valor }).descontoCapaNoErp).toBe(esperado);
  });

  it.each(['1', 'sim', 'TRUE', ''])('recusa "%s"', (valor) => {
    expect(() => loadEnv({ ...BASE, DESCONTO_CAPA_NO_ERP: valor })).toThrow(
      'Configuração de ambiente inválida',
    );
  });
});
