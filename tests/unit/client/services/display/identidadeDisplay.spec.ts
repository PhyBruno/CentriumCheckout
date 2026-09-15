import { describe, expect, it } from 'vitest';
import { criarAnuncianteIdentidadeDisplay } from '../../../../../src/client/services/display/identidadeDisplay';
import { NOME_CANAL_DISPLAY } from '../../../../../src/shared/display';
import { criarBarramentoFalso, type BarramentoFalso } from '../../../../support/display';

/**
 * Anunciante da identidade da loja no display (correção do usuário, 2026-09-15).
 *
 * O defeito: a tela do cliente aberta **antes** do primeiro PIX ficava sem o
 * nome da empresa. O nome só viajava dentro de `ESTADO`, que uma aba em repouso
 * não publica — de propósito, para não apagar o QR de outra aba (C2 do
 * contrato). A identidade viaja agora numa mensagem própria, que não carrega
 * estado de tela e que toda aba de checkout pode mandar sem risco.
 */

const DEPS = { agora: () => 1_789_077_600_000 };

function identidadesPublicadas(barramento: BarramentoFalso): readonly unknown[] {
  return barramento.publicadas.filter(
    (mensagem) => (mensagem as { readonly tipo?: unknown }).tipo === 'IDENTIDADE',
  );
}

describe('criarAnuncianteIdentidadeDisplay', () => {
  it('abre o canal do contrato', () => {
    const barramento = criarBarramentoFalso();
    criarAnuncianteIdentidadeDisplay({ ...DEPS, criarCanal: barramento.criarCanal });

    expect(barramento.nomes).toEqual([NOME_CANAL_DISPLAY]);
  });

  it('anuncia o nome da loja assim que o conhece — cobre a tela aberta antes do checkout', () => {
    const barramento = criarBarramentoFalso();
    const anunciante = criarAnuncianteIdentidadeDisplay({
      ...DEPS,
      criarCanal: barramento.criarCanal,
    });

    anunciante.anunciar('Mercado Aurora');

    expect(identidadesPublicadas(barramento)).toEqual([
      {
        tipo: 'IDENTIDADE',
        nomeLoja: 'Mercado Aurora',
        origemId: expect.stringMatching(/^aba-/) as unknown,
        emitidoEm: 1_789_077_600_000,
      },
    ]);
  });

  it('responde ao handshake com a identidade, mesmo sem nenhuma cobrança', () => {
    const barramento = criarBarramentoFalso();
    const anunciante = criarAnuncianteIdentidadeDisplay({
      ...DEPS,
      criarCanal: barramento.criarCanal,
    });
    anunciante.anunciar('Mercado Aurora');

    barramento.emitirDeFora({ tipo: 'SOLICITAR_ESTADO' });

    expect(identidadesPublicadas(barramento)).toHaveLength(2);
  });

  it('nunca publica estado de tela — não tem como apagar o QR de outra aba', () => {
    const barramento = criarBarramentoFalso();
    const anunciante = criarAnuncianteIdentidadeDisplay({
      ...DEPS,
      criarCanal: barramento.criarCanal,
    });
    anunciante.anunciar('Mercado Aurora');

    barramento.emitirDeFora({ tipo: 'SOLICITAR_ESTADO' });

    expect(
      barramento.publicadas.some(
        (mensagem) => (mensagem as { readonly tipo?: unknown }).tipo === 'ESTADO',
      ),
    ).toBe(false);
  });

  it('sem nome — sessão ainda carregando ou empresa sem cadastro — fica calado', () => {
    const barramento = criarBarramentoFalso();
    const anunciante = criarAnuncianteIdentidadeDisplay({
      ...DEPS,
      criarCanal: barramento.criarCanal,
    });

    anunciante.anunciar(null);
    barramento.emitirDeFora({ tipo: 'SOLICITAR_ESTADO' });

    expect(identidadesPublicadas(barramento)).toEqual([]);
  });

  it('encerrar fecha o canal, para de responder e é idempotente', () => {
    const barramento = criarBarramentoFalso();
    const anunciante = criarAnuncianteIdentidadeDisplay({
      ...DEPS,
      criarCanal: barramento.criarCanal,
    });
    anunciante.anunciar('Mercado Aurora');

    anunciante.encerrar();
    anunciante.encerrar();
    barramento.emitirDeFora({ tipo: 'SOLICITAR_ESTADO' });
    anunciante.anunciar('Outra Loja');

    expect(barramento.canaisAbertos()).toBe(0);
    expect(identidadesPublicadas(barramento)).toHaveLength(1);
  });
});
