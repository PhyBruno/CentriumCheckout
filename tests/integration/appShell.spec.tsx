import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppShell } from '../../src/client/layout/AppShell';
import { useSessionStore } from '../../src/client/stores/sessionStore';
import { useVendaStore } from '../../src/client/stores/vendaStore';
import {
  cruzarBreakpointPara,
  definirLayoutInicial,
  instalarMatchMediaDeLayout,
  renderizarComProvedores,
} from '../support/layout';
import { linhaDe } from '../support/precificacao';
import { registroBootstrapDe } from '../support/sessao';

/**
 * T011/T012 — a troca de layout (`US1`).
 *
 * O que estes testes protegem não é o pixel: é o invariante de que as duas
 * árvores leem o **mesmo** `vendaStore` e que nenhuma delas migra, copia ou
 * reinicializa estado ao entrar em cena (`FR-002`, `SC-003`). Uma regressão aqui
 * seria invisível na tela até o momento em que o operador virasse o tablet no
 * meio de uma venda.
 */
function renderizarShell(): void {
  renderizarComProvedores(
    <AppShell
      onRecarregarBootstrap={() => {
        /* o polling não é o assunto destes testes */
      }}
    />,
  );
}

/** Uma venda com o que um F5 (ou uma troca de layout) poderia destruir. */
function popularVenda(): void {
  useVendaStore.setState({
    linhas: [
      linhaDe({ idLinha: 'linha-1', precoUnitario: 10_000, quantidadeEmUnidades: 2 }),
      linhaDe({ idLinha: 'linha-2', precoUnitario: 2_500, quantidadeEmUnidades: 1 }),
    ],
    clienteAtual: {
      codigoCliente: 42,
      nome: 'Cliente de Teste',
      documento: '11144477735',
      celular: null,
      listaPreco: 3,
      descontoConvenio: 0,
      codigoConvenio: null,
      origem: 'BUSCA_DOCUMENTO',
    },
    houveEscolhaExplicita: true,
    vendedorAtual: { codigo: 7, nome: 'Vendedor de Teste', origem: 'BUSCA' },
  });
}

beforeAll(() => {
  instalarMatchMediaDeLayout();
});

beforeEach(() => {
  definirLayoutInicial('desktop');
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('rede desligada no teste')));
  useSessionStore.setState({ estado: 'pronto', registro: registroBootstrapDe() });
  useVendaStore.setState({
    linhas: [],
    clienteAtual: null,
    houveEscolhaExplicita: false,
    vendedorAtual: null,
    condicaoSelecionada: null,
    descontoCapa: null,
    pagamentos: [],
  });
  useVendaStore.getState().resetarAuditoria('NOVA');
});

describe('AppShell — alternância de layout', () => {
  it('monta a tela única no desktop e o wizard no mobile', () => {
    definirLayoutInicial('mobile');
    renderizarShell();

    expect(screen.getByTestId('mobile-wizard')).toBeInTheDocument();
    // Ausência estrutural, não `display: none`: a árvore desktop não existe.
    expect(screen.queryByTestId('painel-pagamento-totais')).toBeNull();
    expect(screen.queryByTestId('barra-superior')).toBeNull();
  });

  it('preserva o estado da venda ao cruzar o breakpoint nos dois sentidos (FR-002, SC-003)', () => {
    popularVenda();
    renderizarShell();

    const antes = useVendaStore.getState();
    expect(screen.getByTestId('painel-pagamento-totais')).toBeInTheDocument();

    cruzarBreakpointPara('mobile');

    const noMobile = useVendaStore.getState();
    expect(screen.getByTestId('mobile-wizard')).toBeInTheDocument();
    expect(screen.queryByTestId('painel-pagamento-totais')).toBeNull();
    // Identidade de referência, não igualdade estrutural: se algum caminho
    // recriasse o array, o estado poderia continuar "igual" e ainda assim ter
    // sido reconstruído — e é a reconstrução que perde a auditoria.
    expect(noMobile.linhas).toBe(antes.linhas);
    expect(noMobile.clienteAtual).toBe(antes.clienteAtual);
    expect(noMobile.vendedorAtual).toBe(antes.vendedorAtual);
    expect(noMobile.eventos).toBe(antes.eventos);

    cruzarBreakpointPara('desktop');

    const deVolta = useVendaStore.getState();
    expect(screen.getByTestId('painel-pagamento-totais')).toBeInTheDocument();
    expect(deVolta.linhas).toBe(antes.linhas);
    // Nem perda **nem duplicação**: a volta não reinsere as linhas.
    expect(deVolta.linhas).toHaveLength(2);
    expect(deVolta.clienteAtual).toBe(antes.clienteAtual);
    expect(deVolta.vendedorAtual).toBe(antes.vendedorAtual);
  });

  it('não reabre a sessão de auditoria ao trocar de layout (FR-006/FR-008 da 001)', () => {
    popularVenda();
    renderizarShell();

    const eventosAntes = useVendaStore.getState().eventos.length;
    expect(eventosAntes).toBeGreaterThan(0);

    cruzarBreakpointPara('mobile');
    cruzarBreakpointPara('desktop');

    // `abrirSessaoDeVenda` só roda com a lista vazia; reabri-la aqui apagaria o
    // histórico já acumulado da venda em andamento.
    expect(useVendaStore.getState().eventos).toHaveLength(eventosAntes);
  });
});

describe('AppShell — atalhos de teclado no mobile (FR-005)', () => {
  it('não monta a faixa de atalhos da venda rápida na árvore mobile', () => {
    definirLayoutInicial('mobile');
    popularVenda();
    renderizarShell();

    expect(screen.queryByTestId('dica-atalhos-venda-rapida')).toBeNull();
  });

  it('as teclas de venda rápida não disparam nada no mobile', async () => {
    const usuario = userEvent.setup();
    definirLayoutInicial('mobile');
    popularVenda();
    renderizarShell();

    const antes = useVendaStore.getState();
    for (const tecla of ['{F6}', '{F7}', '{F8}', '{F9}']) {
      await usuario.keyboard(tecla);
    }

    // Nenhuma condição escolhida, nenhum pagamento lançado: o mapa central não
    // chegou a registrar tecla alguma nesta árvore (D6 — ausência estrutural,
    // não condicional dentro do handler).
    expect(useVendaStore.getState().condicaoSelecionada).toBe(antes.condicaoSelecionada);
    expect(useVendaStore.getState().pagamentos).toHaveLength(0);
  });
});
