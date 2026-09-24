import { describe, expect, it } from 'vitest';
import { urlExternaSegura } from '../../../../src/client/lib/urlExterna';

/** AD-238 — o link `UrlChamadas` só vira `href` se for http(s) absoluto. */
describe('urlExternaSegura', () => {
  it.each([
    ['https://atendimento.exemplo.invalid/x?y=1', 'https://atendimento.exemplo.invalid/x?y=1'],
    ['  http://erp.exemplo.invalid/  ', 'http://erp.exemplo.invalid/'],
    ['HTTPS://ERP.EXEMPLO.INVALID', 'https://erp.exemplo.invalid/'],
  ])('aceita %s', (entrada, esperado) => {
    expect(urlExternaSegura(entrada)).toBe(esperado);
  });

  it.each([
    undefined,
    null,
    '',
    '   ',
    'javascript:alert(1)',
    ' JaVaScRiPt:alert(1)',
    'data:text/html,x',
    'vbscript:x',
    'file:///c:/x',
    'ftp://x.invalid/',
    '//sem-protocolo.invalid/x',
    '/relativo',
    'não é url',
  ])('recusa %s', (entrada) => {
    expect(urlExternaSegura(entrada)).toBeNull();
  });
});
