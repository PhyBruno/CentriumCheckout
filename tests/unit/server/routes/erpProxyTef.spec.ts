import { describe, expect, it } from 'vitest';
import {
  corpoComEmpresaNaRaiz,
  corpoComOperadorTef,
  queryComEmpresaDaSessao,
} from '../../../../src/server/routes/erp-proxy';

/**
 * T018 — o BFF diz de quem é a cobrança TEF (invariante T8, `contracts/erp-tef-api.md`
 * §5, AD-259).
 *
 * `EmpCod` e `UsuarioGAM` decidem em qual empresa e em qual maquininha a
 * cobrança aparece (`PSmartTEF` escolhe o `serial_pos` pelo `UsuarioGAM`). O
 * corpo vem do navegador, e o ERP não o confere contra o token: um valor
 * forjado no DevTools mandaria a cobrança para o terminal de outro operador.
 * Mesmo princípio de AD-224. Valores sintéticos.
 */

const CAMINHO_CRIAR = '/ApiCentriumOAuth/CriarCardPagamento';
const GUID = '0f2c9a4e-0000-4000-8000-000000000000';
const SESSAO = { codigoEmpresa: '7', usuarioGam: GUID };

const CORPO_PLANO = {
  PagamentoValor: 83.29,
  PagamentoParcelas: 1,
  PagamentoCpfCliente: '12345678909',
  PagamentoNomeCliente: 'MARIA EXEMPLO',
  FPgCod: 40,
};

describe('corpoComOperadorTef', () => {
  it('insere EmpCod numérico e UsuarioGAM do cookie no corpo plano', () => {
    expect(corpoComOperadorTef(CORPO_PLANO, CAMINHO_CRIAR, SESSAO)).toEqual({
      ...CORPO_PLANO,
      EmpCod: 7,
      UsuarioGAM: GUID,
    });
  });

  it('sobrescreve EmpCod e UsuarioGAM forjados pelo navegador (T8)', () => {
    const forjado = { ...CORPO_PLANO, EmpCod: 999, UsuarioGAM: 'guid-de-outro-operador' };

    expect(corpoComOperadorTef(forjado, CAMINHO_CRIAR, SESSAO)).toMatchObject({
      EmpCod: 7,
      UsuarioGAM: GUID,
    });
  });

  // `research.md` D6: o envelope do corpo é [medir]. As duas formas recebem a
  // injeção até a medição, para o BFF não ficar para trás de uma troca no cliente.
  it('injeta também dentro de CriarCardReq, se o corpo vier envelopado', () => {
    const corpo = corpoComOperadorTef(
      { CriarCardReq: { ...CORPO_PLANO, UsuarioGAM: 'forjado' } },
      CAMINHO_CRIAR,
      SESSAO,
    ) as Record<string, Record<string, unknown>>;

    expect(corpo['CriarCardReq']).toMatchObject({ EmpCod: 7, UsuarioGAM: GUID, FPgCod: 40 });
  });

  it('cookie sem usuarioGam → UsuarioGAM vazio, nunca o valor do navegador', () => {
    const corpo = corpoComOperadorTef(
      { ...CORPO_PLANO, UsuarioGAM: 'forjado' },
      CAMINHO_CRIAR,
      { codigoEmpresa: '7' },
    ) as Record<string, unknown>;

    expect(corpo['UsuarioGAM']).toBe('');
  });

  it('caminho com caixa diferente casa', () => {
    expect(
      corpoComOperadorTef(CORPO_PLANO, '/apicentriumoauth/criarcardpagamento', SESSAO),
    ).toMatchObject({ EmpCod: 7, UsuarioGAM: GUID });
  });

  it('outro caminho fica intocado', () => {
    const original = { SmartTefPaymentIdentifier: 'pay_exemplo_0001', UsuarioGAM: 'x' };

    expect(corpoComOperadorTef(original, '/ApiCentriumOAuth/EstornarPagamento', SESSAO)).toEqual(
      original,
    );
  });

  it('empresa da sessão não numérica: não grava NaN, mas o UsuarioGAM ainda é o do cookie', () => {
    const corpo = corpoComOperadorTef(
      { ...CORPO_PLANO, EmpCod: 999 },
      CAMINHO_CRIAR,
      { codigoEmpresa: 'acme', usuarioGam: GUID },
    ) as Record<string, unknown>;

    expect(corpo['EmpCod']).toBe(999);
    expect(corpo['UsuarioGAM']).toBe(GUID);
  });

  it('repassa intacto o que não é objeto', () => {
    expect(corpoComOperadorTef('texto cru', CAMINHO_CRIAR, SESSAO)).toBe('texto cru');
  });

  it('não muta o corpo original', () => {
    const original = { ...CORPO_PLANO };
    corpoComOperadorTef(original, CAMINHO_CRIAR, SESSAO);

    expect(original).not.toHaveProperty('EmpCod');
  });
});

describe('EstornarPagamento — Empresa na raiz', () => {
  it('insere Empresa numérica no corpo do estorno', () => {
    expect(
      corpoComEmpresaNaRaiz(
        { SmartTefPaymentIdentifier: 'pay_exemplo_0001', Empresa: 999 },
        '/ApiCentriumOAuth/EstornarPagamento',
        '7',
      ),
    ).toEqual({ SmartTefPaymentIdentifier: 'pay_exemplo_0001', Empresa: 7 });
  });
});

describe('ConsultarStatusCard — Empresa na query', () => {
  // Nenhum código novo: `queryComEmpresaDaSessao` já cobre todo GET (AD-205).
  it('recebe Empresa como primeiro par', () => {
    expect(queryComEmpresaDaSessao('SmartTefPaymentIdentifier=pay_exemplo_0001', '7')).toBe(
      'Empresa=7&SmartTefPaymentIdentifier=pay_exemplo_0001',
    );
  });
});
