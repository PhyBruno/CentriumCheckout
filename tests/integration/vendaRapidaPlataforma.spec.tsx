import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppShell } from '../../src/client/layout/AppShell';
import { MEIO_PAGTO } from '../../src/client/domain/pagamento/formaPagamento';
import type { AtalhoVendaRapida } from '../../src/client/domain/vendaRapida/tipos';
import { useSessionStore } from '../../src/client/stores/sessionStore';
import { useVendaStore } from '../../src/client/stores/vendaStore';
import {
  definirLayoutInicial,
  instalarMatchMediaDeLayout,
  renderizarComProvedores,
} from '../support/layout';
import { linhaDe } from '../support/precificacao';
import { registroBootstrapDe } from '../support/sessao';

/**
 * US5 da feature 016 — a venda rápida no PDV de toque (T031).
 *
 * `FR-011`: F6–F9 acionam em qualquer plataforma. `FR-012`: a faixa visual
 * continua só no desktop. Até a 016 os dois eram o mesmo fato — a projeção
 * devolvia `[]` no mobile e a faixa, que registrava as teclas, nem era montada
 * ali.
 *
 * O comando é substituído por um espião: o que está em teste aqui é **quem
 * escuta a tecla em cada layout**, não o lançamento do pagamento, que
 * `vendaRapida.spec.ts` cobre sobre o store real.
 */

const acionar = vi.hoisted(() => vi.fn(() => Promise.resolve({ tipo: 'RECUSADO' as const })));

const ATALHO_F6: AtalhoVendaRapida = {
  tecla: 'F6',
  nome: 'Dinheiro à vista',
  condicaoCodigo: 1,
  formaCodigo: 1,
  meioPagtoNFe: MEIO_PAGTO.Dinheiro,
  encerraOperacao: false,
};

vi.mock('../../src/client/features/venda-rapida/useAcionarCenario', () => ({
  useAcionarCenario: () => ({ atalhos: [ATALHO_F6], acionar }),
}));

function renderizarShell(): void {
  renderizarComProvedores(
    <AppShell
      onRecarregarBootstrap={() => {
        /* fora do assunto destes testes */
      }}
    />,
  );
}

beforeAll(() => {
  instalarMatchMediaDeLayout();
});

beforeEach(() => {
  acionar.mockClear();
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('rede desligada no teste')));
  useSessionStore.setState({ estado: 'pronto', registro: registroBootstrapDe() });
  useVendaStore.setState({
    linhas: [linhaDe({ idLinha: 'linha-1' })],
    clienteAtual: null,
    houveEscolhaExplicita: false,
    vendedorAtual: null,
    condicaoSelecionada: null,
    descontoCapa: null,
    pagamentos: [],
  });
  useVendaStore.getState().resetarAuditoria('NOVA');
});

describe('US5 — venda rápida por tecla em qualquer plataforma', () => {
  it('no layout compacto a faixa não aparece, e F6 aciona o cenário mesmo assim (US5-1, US5-2)', async () => {
    const usuario = userEvent.setup();
    definirLayoutInicial('mobile');
    renderizarShell();

    expect(screen.queryByTestId('dica-atalhos-venda-rapida')).toBeNull();

    await usuario.keyboard('{F6}');

    expect(acionar).toHaveBeenCalledExactlyOnceWith('F6');
  });

  it('no desktop a faixa continua aparecendo, e a tecla aciona uma vez só — um dono (US5-3)', async () => {
    const usuario = userEvent.setup();
    definirLayoutInicial('desktop');
    renderizarShell();

    expect(screen.getByTestId('dica-atalhos-venda-rapida')).toBeInTheDocument();

    await usuario.keyboard('{F6}');

    expect(acionar).toHaveBeenCalledExactlyOnceWith('F6');
  });

  it('a regra de digitação da 013 vale no compacto também: com o foco na quantidade, F6 não aciona', async () => {
    const usuario = userEvent.setup();
    definirLayoutInicial('mobile');
    renderizarShell();

    await usuario.click(screen.getByTestId('previa-quantidade'));
    await usuario.keyboard('{F6}');

    expect(acionar).not.toHaveBeenCalled();
  });
});
