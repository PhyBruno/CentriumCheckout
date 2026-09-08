import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { AppShell } from '../../src/client/layout/AppShell';
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
 * T018 — navegação em etapas no mobile (`US2`, `quickstart.md` §3).
 *
 * O cenário do quickstart inteiro: avançar até a etapa 3, voltar à 1, alterar um
 * dado e conferir que a alteração aparece na revisão. É o que separa "wizard" de
 * "três telas que se lembram de nada": as etapas são janelas sobre o **mesmo**
 * `vendaStore`, nunca cópias tiradas na entrada de cada etapa.
 */
function renderizarWizard(): void {
  renderizarComProvedores(
    <AppShell
      onRecarregarBootstrap={() => {
        /* fora do assunto deste teste */
      }}
    />,
  );
}

beforeAll(() => {
  instalarMatchMediaDeLayout();
});

beforeEach(() => {
  definirLayoutInicial('mobile');
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('rede desligada no teste')));
  useSessionStore.setState({ estado: 'pronto', registro: registroBootstrapDe() });
  useVendaStore.setState({
    linhas: [linhaDe({ idLinha: 'linha-1', precoUnitario: 10_000, quantidadeEmUnidades: 1 })],
    clienteAtual: null,
    houveEscolhaExplicita: false,
    vendedorAtual: null,
    condicaoSelecionada: null,
    descontoCapa: null,
    pagamentos: [],
  });
  useVendaStore.getState().resetarAuditoria('NOVA');
});

describe('MobileWizard — navegação', () => {
  it('começa sempre na etapa 1 (I1)', () => {
    renderizarWizard();

    expect(screen.getByTestId('etapa-cliente-produtos')).toBeInTheDocument();
    expect(screen.getByTestId('indicador-etapa')).toHaveTextContent('1/3');
  });

  it('avança 1 → 2 → 3 e volta livremente a qualquer etapa já visitada (FR-004)', async () => {
    const usuario = userEvent.setup();
    renderizarWizard();

    await usuario.click(screen.getByTestId('wizard-avancar'));
    expect(screen.getByTestId('etapa-pagamento')).toBeInTheDocument();
    expect(screen.getByTestId('indicador-etapa')).toHaveTextContent('2/3');

    await usuario.click(screen.getByTestId('wizard-avancar'));
    expect(screen.getByTestId('etapa-revisao')).toBeInTheDocument();
    expect(screen.getByTestId('indicador-etapa')).toHaveTextContent('3/3');

    // Salto direto da 3 para a 1, sem passar pela 2: é isso que "livremente"
    // quer dizer — não há validação de campo obrigatório barrando o retorno.
    await usuario.click(screen.getByTestId('ir-para-etapa-1'));
    expect(screen.getByTestId('etapa-cliente-produtos')).toBeInTheDocument();
    expect(screen.getByTestId('indicador-etapa')).toHaveTextContent('1/3');
  });

  it('não oferece atalho para uma etapa nunca visitada', () => {
    renderizarWizard();

    // Da etapa 1, ninguém esteve na 2 nem na 3: as barras delas são traço, não
    // botão. O caminho para frente é o "avançar", que marca a visita.
    expect(screen.queryByTestId('ir-para-etapa-2')).toBeNull();
    expect(screen.queryByTestId('ir-para-etapa-3')).toBeNull();
  });

  it('a alteração feita na etapa 1 aparece na revisão (quickstart §3)', async () => {
    const usuario = userEvent.setup();
    renderizarWizard();

    await usuario.click(screen.getByTestId('wizard-avancar'));
    await usuario.click(screen.getByTestId('wizard-avancar'));
    expect(screen.getByTestId('conferencia-produtos')).toHaveTextContent('1 item');

    await usuario.click(screen.getByTestId('ir-para-etapa-1'));

    // Um item a mais, pelo mesmo store que o carrinho já usa — a alteração não
    // passa pelo wizard, e é justamente esse o ponto.
    act(() => {
      useVendaStore.setState((estado) => ({
        linhas: [
          ...estado.linhas,
          linhaDe({ idLinha: 'linha-2', precoUnitario: 2_500, quantidadeEmUnidades: 1 }),
        ],
      }));
    });

    await usuario.click(screen.getByTestId('ir-para-etapa-3'));

    expect(screen.getByTestId('conferencia-produtos')).toHaveTextContent('2 itens');
    expect(screen.getByTestId('conferencia-produtos')).toHaveTextContent('R$ 125,00');
  });

  it('trocar de etapa nunca mexe no estado da venda (I5)', async () => {
    const usuario = userEvent.setup();
    renderizarWizard();

    const antes = useVendaStore.getState();

    await usuario.click(screen.getByTestId('wizard-avancar'));
    await usuario.click(screen.getByTestId('wizard-avancar'));
    await usuario.click(screen.getByTestId('ir-para-etapa-1'));

    const depois = useVendaStore.getState();
    expect(depois.linhas).toBe(antes.linhas);
    expect(depois.clienteAtual).toBe(antes.clienteAtual);
    expect(depois.pagamentos).toBe(antes.pagamentos);
    expect(depois.eventos).toBe(antes.eventos);
  });
});

describe('MobileWizard — cabeçalho', () => {
  it('põe o cancelamento da venda no cabeçalho, e não no rodapé (AD-089)', () => {
    renderizarWizard();

    const cabecalho = screen.getByTestId('cabecalho-mobile');
    expect(cabecalho).toContainElement(screen.getByTestId('botao-cancelar-venda'));
    // O paliativo da 004 (`AcoesVendaCompactas`) saiu com esta feature.
    expect(screen.queryByTestId('acoes-venda-compactas')).toBeNull();
  });

  it('mostra o operador da sessão, como a barra superior do desktop', () => {
    renderizarWizard();

    expect(screen.getByTestId('operador-da-sessao')).toHaveTextContent('Bruno');
  });
});
