import { describe, expect, it } from 'vitest';
import { validarValorMinimoPix } from '../../../../src/client/domain/pix/validarValorMinimoPix';
import { centavos } from '../../../../src/client/domain/precificacao/dinheiro';

/** T009 — `research.md` D13/AD-047: saldo igual, acima e abaixo do mínimo. */

const MINIMO = centavos(500); // R$ 5,00

describe('validarValorMinimoPix', () => {
  it('aceita saldo acima do mínimo', () => {
    expect(validarValorMinimoPix(centavos(6550), MINIMO)).toEqual({ ok: true });
  });

  // O mínimo é o menor valor **aceito**, não o primeiro recusado: cobrar
  // exatamente R$ 5,00 com `MinimoPix` de R$ 5,00 é legítimo.
  it('aceita saldo exatamente igual ao mínimo', () => {
    expect(validarValorMinimoPix(MINIMO, MINIMO)).toEqual({ ok: true });
  });

  it('recusa saldo abaixo do mínimo', () => {
    expect(validarValorMinimoPix(centavos(300), MINIMO)).toEqual({ ok: false });
  });

  it('recusa um centavo abaixo do mínimo', () => {
    expect(validarValorMinimoPix(centavos(499), MINIMO)).toEqual({ ok: false });
  });

  // Empresa sem piso configurado: o bootstrap devolve `0` e nenhuma cobrança é
  // bloqueada por valor.
  it('aceita qualquer saldo quando o mínimo é zero', () => {
    expect(validarValorMinimoPix(centavos(1), centavos(0))).toEqual({ ok: true });
  });
});
