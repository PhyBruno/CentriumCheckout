import { describe, expect, it } from 'vitest';
import { calcularVersionHash } from '../../../src/shared/versionHash';

/**
 * Hash de versão do payload de bootstrap (FR-008, AD-045).
 *
 * Um falso "nada mudou" aqui vira `304` no BFF e configuração de PDV
 * desatualizada servida em silêncio ao operador.
 */

/**
 * Payload sintético grande cujo miolo é o único trecho que varia.
 *
 * As chaves são serializadas em ordem alfabética, então `bordaInicial` cobre
 * bem mais que os 4096 primeiros caracteres e `bordaFinal`, os 4096 últimos.
 */
function payloadComMeioVariavel(miolo: string): Record<string, unknown> {
  return {
    aBordaInicial: 'x'.repeat(5000),
    mMiolo: miolo,
    zBordaFinal: 'y'.repeat(5000),
  };
}

describe('calcularVersionHash', () => {
  it('devolve 16 dígitos hexadecimais estáveis para o mesmo payload', () => {
    const payload = { tenant: 'acme', SessaoUsuario: { CadMaqCod: 'PDV01' } };

    expect(calcularVersionHash(payload)).toMatch(/^[0-9a-f]{16}$/);
    expect(calcularVersionHash(payload)).toBe(calcularVersionHash(payload));
  });

  it('ignora a ordem das chaves (serialização canônica)', () => {
    expect(calcularVersionHash({ a: 1, b: 2 })).toBe(calcularVersionHash({ b: 2, a: 1 }));
  });

  it('muda quando um valor muda', () => {
    expect(calcularVersionHash({ CadMaqCod: 'PDV01' })).not.toBe(
      calcularVersionHash({ CadMaqCod: 'PDV02' }),
    );
  });

  it('distingue payloads grandes que só diferem no miolo', () => {
    // Mesmo tamanho total e mesmas bordas: a versão anterior amostrava só os
    // 4096 primeiros e os 4096 últimos caracteres na segunda passada, então
    // uma lista de preço alterada no meio de ~5MB podia passar por "igual".
    const a = calcularVersionHash(payloadComMeioVariavel('AAAA'.repeat(500)));
    const b = calcularVersionHash(payloadComMeioVariavel('BBBB'.repeat(500)));

    expect(a).not.toBe(b);
    // A segunda metade do hash é a segunda passada — antes, idêntica nos dois.
    expect(a.slice(8)).not.toBe(b.slice(8));
  });
});
