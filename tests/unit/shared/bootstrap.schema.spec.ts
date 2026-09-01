import { describe, expect, it } from 'vitest';
import { bootstrapPayloadSchema } from '../../../src/shared/schemas/bootstrap.schema';

/** Payload sintético mínimo válido. */
function payloadValido(): Record<string, unknown> {
  return {
    tenant: 'acme',
    codigoEmpresa: '1',
    SessaoUsuario: {
      TipoPreco: 1,
      CadMaqCod: 'PDV01',
      ListaPrecoDefault: 3,
      CenarioPagamento: '["1;DINHEIRO;1;A VISTA;Dinheiro à vista;True;F6"]',
    },
  };
}

describe('bootstrapPayloadSchema', () => {
  it('aceita um payload completo', () => {
    const resultado = bootstrapPayloadSchema.safeParse(payloadValido());

    expect(resultado.success).toBe(true);
  });

  it('preserva campos extras do GetSessao sem transformá-los (Constitution III)', () => {
    const payload = payloadValido();
    const sessao = payload['SessaoUsuario'] as Record<string, unknown>;
    sessao['UsuarioNome'] = 'Operador de Teste';
    sessao['CondicoesDePagamento'] = [{ CondicaoCodigo: 1 }];

    const resultado = bootstrapPayloadSchema.parse(payload);

    expect(resultado.SessaoUsuario['UsuarioNome']).toBe('Operador de Teste');
    expect(resultado.SessaoUsuario['CondicoesDePagamento']).toEqual([{ CondicaoCodigo: 1 }]);
  });

  it('repassa CenarioPagamento como string, sem interpretar (AD-104)', () => {
    const bruto = '["1;DINHEIRO;1;A VISTA;Dinheiro à vista;True;F6"]';

    const resultado = bootstrapPayloadSchema.parse(payloadValido());

    expect(resultado.SessaoUsuario.CenarioPagamento).toBe(bruto);
    expect(typeof resultado.SessaoUsuario.CenarioPagamento).toBe('string');
  });

  it.each([1, 5, 9, 11])('aceita TipoPreco = %i', (tipoPreco) => {
    const payload = payloadValido();
    (payload['SessaoUsuario'] as Record<string, unknown>)['TipoPreco'] = tipoPreco;

    expect(bootstrapPayloadSchema.safeParse(payload).success).toBe(true);
  });

  it.each([0, 12, 1.5])('recusa TipoPreco fora do contrato (%s)', (tipoPreco) => {
    const payload = payloadValido();
    (payload['SessaoUsuario'] as Record<string, unknown>)['TipoPreco'] = tipoPreco;

    expect(bootstrapPayloadSchema.safeParse(payload).success).toBe(false);
  });

  it('recusa ListaPrecoDefault não inteiro', () => {
    const payload = payloadValido();
    (payload['SessaoUsuario'] as Record<string, unknown>)['ListaPrecoDefault'] = '3';

    expect(bootstrapPayloadSchema.safeParse(payload).success).toBe(false);
  });

  it.each(['tenant', 'codigoEmpresa', 'SessaoUsuario'])('recusa payload sem %s', (campo) => {
    const payload = payloadValido();
    delete payload[campo];

    expect(bootstrapPayloadSchema.safeParse(payload).success).toBe(false);
  });

  it.each(['TipoPreco', 'CadMaqCod', 'ListaPrecoDefault', 'CenarioPagamento'])(
    'recusa SessaoUsuario sem %s',
    (campo) => {
      const payload = payloadValido();
      delete (payload['SessaoUsuario'] as Record<string, unknown>)[campo];

      expect(bootstrapPayloadSchema.safeParse(payload).success).toBe(false);
    },
  );

  it('recusa tenant vazio (quebraria o isolamento por tenant, FR-009)', () => {
    const payload = payloadValido();
    payload['tenant'] = '';

    expect(bootstrapPayloadSchema.safeParse(payload).success).toBe(false);
  });
});
