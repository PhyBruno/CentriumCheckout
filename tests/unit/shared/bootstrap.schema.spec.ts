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
      QtdMinCharParaConsulta: 3,
      UsuarioTipoCodigoProduto: 'I',
      ClienteDefaultCodigo: 1,
      CadSerieNFCe: '1',
      CadMaqHost: '127.0.0.1:4545',
      TipoImpressao: 'E',
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
    (payload['SessaoUsuario'] as Record<string, unknown>)['ListaPrecoDefault'] = '3,5';

    expect(bootstrapPayloadSchema.safeParse(payload).success).toBe(false);
  });

  /**
   * Shape **real** do `GetSessao` (AD-165), verificado ao vivo contra o ERP de
   * demonstração em 2026-09-04: todo `int64` chega como string JSON. Os valores
   * abaixo são sintéticos, mas os tipos são os observados — antes desta correção
   * o bootstrap inteiro falhava contra o ERP real e o Checkout nunca abria.
   */
  it('aceita os inteiros de SessaoUsuario como string, como o ERP real devolve (AD-165)', () => {
    const payload = payloadValido();
    const sessao = payload['SessaoUsuario'] as Record<string, unknown>;
    sessao['QtdMinCharParaConsulta'] = '3';
    sessao['ClienteDefaultCodigo'] = '999999';
    sessao['ListaPrecoDefault'] = '1';
    sessao['caixa'] = '0';
    sessao['VendedorCodigo'] = '0';

    const resultado = bootstrapPayloadSchema.parse(payload);

    expect(resultado.SessaoUsuario.QtdMinCharParaConsulta).toBe(3);
    expect(resultado.SessaoUsuario.ClienteDefaultCodigo).toBe(999999);
    expect(resultado.SessaoUsuario.ListaPrecoDefault).toBe(1);
    expect(resultado.SessaoUsuario.caixa).toBe(0);
    expect(resultado.SessaoUsuario.VendedorCodigo).toBe(0);
  });

  it('recusa string não numérica num campo inteiro — tolerância não é indulgência', () => {
    const payload = payloadValido();
    (payload['SessaoUsuario'] as Record<string, unknown>)['ClienteDefaultCodigo'] = '';

    expect(bootstrapPayloadSchema.safeParse(payload).success).toBe(false);
  });

  it.each(['tenant', 'codigoEmpresa', 'SessaoUsuario'])('recusa payload sem %s', (campo) => {
    const payload = payloadValido();
    delete payload[campo];

    expect(bootstrapPayloadSchema.safeParse(payload).success).toBe(false);
  });

  it.each([
    'TipoPreco',
    'CadMaqCod',
    'ListaPrecoDefault',
    'CenarioPagamento',
    'QtdMinCharParaConsulta',
    'UsuarioTipoCodigoProduto',
    'ClienteDefaultCodigo',
  ])('recusa SessaoUsuario sem %s', (campo) => {
    const payload = payloadValido();
    delete (payload['SessaoUsuario'] as Record<string, unknown>)[campo];

    expect(bootstrapPayloadSchema.safeParse(payload).success).toBe(false);
  });

  it('recusa tenant vazio (quebraria o isolamento por tenant, FR-009)', () => {
    const payload = payloadValido();
    payload['tenant'] = '';

    expect(bootstrapPayloadSchema.safeParse(payload).success).toBe(false);
  });
});
