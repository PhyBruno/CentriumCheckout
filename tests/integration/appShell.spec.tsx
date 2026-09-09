import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppShell } from '../../src/client/layout/AppShell';
import { INTERVALO_STATUS_SISTEMA_MS } from '../../src/client/services/statusSistema/pollingStatusSistema';
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

/**
 * Avança o relógio falso até depois do próximo ciclo de polling, **dentro de
 * `act`**.
 *
 * O `act` não é formalidade: o `AppShell` monta a tela inteira, e adiantar o
 * relógio assenta junto as queries de condição e forma de pagamento que estavam
 * em voo. Sem o embrulho, esses `setState` acontecem fora do lote do React e o
 * console enche de "An update to SeletorCondicaoPagamento inside a test was not
 * wrapped in act(...)" — ruído que esconderia um aviso de verdade no dia em que
 * aparecesse (revisão da 007, 2026-09-09).
 */
async function avancarAteOProximoPoll(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(INTERVALO_STATUS_SISTEMA_MS + 10);
  });
}

/**
 * Os caminhos de `/api/erp/*` que o duplo de `fetch` recebeu, só os do status.
 *
 * O `AppShell` monta a tela inteira, então há outras chamadas em voo (produto,
 * condição de pagamento); filtrar pelo caminho é o que torna a contagem uma
 * afirmação sobre o polling, e não sobre o tráfego da tela.
 */
function caminhosConsultados(chamadas: ReturnType<typeof vi.fn>): readonly string[] {
  return chamadas.mock.calls
    .map(([entrada]) => (typeof entrada === 'string' ? entrada : String(entrada)))
    .filter((caminho) => caminho.includes('GetStatusSistema'));
}

/**
 * O navegador perguntaria "quer mesmo sair?" agora?
 *
 * `beforeunload` cancelável é como o jsdom expõe a decisão: o ouvinte de
 * `useAvisoAoSair` chama `preventDefault()`, e é isso que o navegador lê como
 * "há algo a perder". Sem ouvinte registrado o evento passa intacto.
 */
function saidaSeriaBarrada(): boolean {
  const evento = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(evento);
  return evento.defaultPrevented;
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

/**
 * O que a extração de `TelaDeVenda` levou junto (`AD-191`, ponto 3).
 *
 * Sessão de auditoria, aviso de saída e polling de `GetStatusSistema` eram três
 * responsabilidades que viviam no componente extraído. Se alguma delas tivesse
 * descido para dentro de `DesktopLayout`/`MobileWizard`, nada quebraria na tela:
 * o desktop continuaria idêntico, e o defeito só apareceria quando o tablet
 * cruzasse o breakpoint — a sessão reaberta apagando a auditoria, o aviso de
 * saída sumindo, o polling recomeçando o relógio. Nenhum teste de composição
 * pega isso; estes pegam.
 */
describe('AppShell — responsabilidades transversais (regressão da extração)', () => {
  it('consulta o status do sistema entre vendas, e segue consultando depois da travessia', async () => {
    vi.useFakeTimers();
    const chamadas = vi
      .fn()
      .mockResolvedValue(
        new Response('0', { status: 200, headers: { 'content-type': 'application/json' } }),
      );
    vi.stubGlobal('fetch', chamadas);

    try {
      // Carrinho vazio e nenhum cliente escolhido: é exatamente a janela em que
      // `FR-013` autoriza a consulta.
      renderizarShell();

      await avancarAteOProximoPoll();
      const antesDaTravessia = caminhosConsultados(chamadas);
      expect(antesDaTravessia.length).toBeGreaterThan(0);

      cruzarBreakpointPara('mobile');
      await avancarAteOProximoPoll();

      // O polling mora **acima** da bifurcação: trocar de árvore não o desliga.
      expect(caminhosConsultados(chamadas).length).toBeGreaterThan(antesDaTravessia.length);
    } finally {
      vi.useRealTimers();
    }
  });

  it('não consulta o status durante uma venda em digitação, em nenhum dos dois layouts (FR-013)', async () => {
    vi.useFakeTimers();
    const chamadas = vi
      .fn()
      .mockResolvedValue(
        new Response('0', { status: 200, headers: { 'content-type': 'application/json' } }),
      );
    vi.stubGlobal('fetch', chamadas);

    try {
      popularVenda();
      renderizarShell();

      await avancarAteOProximoPoll();
      expect(caminhosConsultados(chamadas)).toEqual([]);

      cruzarBreakpointPara('mobile');
      await avancarAteOProximoPoll();

      // Recarregar `SessaoUsuario` no meio da venda descartaria a escolha do
      // operador — e a travessia do breakpoint não é uma brecha para isso.
      expect(caminhosConsultados(chamadas)).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('avisa antes de sair com venda em andamento, e continua avisando no mobile', () => {
    popularVenda();
    renderizarShell();

    expect(saidaSeriaBarrada()).toBe(true);

    cruzarBreakpointPara('mobile');

    // O aviso de saída também subiu para cima da bifurcação: se cada árvore o
    // montasse, o F5 no tablet perderia a venda em silêncio.
    expect(saidaSeriaBarrada()).toBe(true);
  });

  it('não avisa ao sair de uma venda vazia — o aviso que aparece sempre deixa de ser lido', () => {
    renderizarShell();

    expect(saidaSeriaBarrada()).toBe(false);

    cruzarBreakpointPara('mobile');

    expect(saidaSeriaBarrada()).toBe(false);
  });

  it('a remontagem por recarga de bootstrap não reabre a sessão de auditoria', () => {
    popularVenda();
    const { unmount } = renderizarComProvedores(
      <AppShell
        onRecarregarBootstrap={() => {
          /* fora do assunto deste teste */
        }}
      />,
    );

    const eventosAntes = useVendaStore.getState().eventos;
    expect(eventosAntes.length).toBeGreaterThan(0);

    // `App` volta ao `LoadingSkeleton` enquanto recarrega `SessaoUsuario` e
    // remonta o `AppShell` depois — a mesma sequência que o polling dispara ao
    // detectar mudança de configuração. Reabrir a sessão aqui apagaria o
    // histórico da venda que continua na tela.
    unmount();
    renderizarShell();

    expect(useVendaStore.getState().eventos).toBe(eventosAntes);
  });

  it('abre a sessão de auditoria quando a tela entra sem histórico nenhum', () => {
    // O caso oposto do anterior, e o motivo de a guarda ser por histórico vazio
    // e não por "primeira montagem": sem este caminho, a primeira venda do turno
    // chegaria ao ERP sem `VENDA_INICIADA` no `Log`.
    useVendaStore.setState({ eventos: [] });

    renderizarShell();

    expect(useVendaStore.getState().eventos.length).toBeGreaterThan(0);
    expect(useVendaStore.getState().eventos[0]?.tipo).toBe('VENDA_INICIADA');
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

  it('nenhuma tecla global move a venda no mobile, incluindo a do quickstart §4', async () => {
    const usuario = userEvent.setup();
    definirLayoutInicial('mobile');
    popularVenda();
    renderizarShell();

    const antes = useVendaStore.getState();
    // A varredura vai além de F6–F9 de propósito: `FR-005` é sobre a árvore
    // mobile não escutar o teclado, não sobre as quatro teclas que a 013
    // registra hoje. `Ctrl+Enter` é a combinação que o `quickstart.md` §4 manda
    // testar à mão, e F1–F5/F10–F12 são as vagas que uma feature futura ocuparia
    // sem lembrar de conferir o compacto — este teste falha no dia em que
    // alguém registrar uma delas globalmente.
    for (const tecla of [
      '{Control>}{Enter}{/Control}',
      '{F1}',
      '{F2}',
      '{F3}',
      '{F4}',
      '{F5}',
      '{F10}',
      '{F11}',
      '{F12}',
      '{Escape}',
      '{Delete}',
    ]) {
      await usuario.keyboard(tecla);
    }

    const depois = useVendaStore.getState();
    expect(depois.linhas).toBe(antes.linhas);
    expect(depois.clienteAtual).toBe(antes.clienteAtual);
    expect(depois.vendedorAtual).toBe(antes.vendedorAtual);
    expect(depois.pagamentos).toBe(antes.pagamentos);
    expect(depois.condicaoSelecionada).toBe(antes.condicaoSelecionada);
    // Nem a auditoria mexeu: um atalho que só registrasse evento sem alterar a
    // venda ainda seria um atalho ativo.
    expect(depois.eventos).toBe(antes.eventos);
  });

  it('a superfície de atalhos existe no desktop e some ao cruzar para o compacto', () => {
    popularVenda();
    renderizarShell();

    // O contrapeso do teste acima: sem ele, "nada acontece no mobile" passaria
    // igual se a faixa de atalhos tivesse sumido dos **dois** layouts. A
    // diferença tem de ser do layout, não da feature ter parado de existir.
    expect(screen.getByTestId('atalhos-venda')).toBeInTheDocument();

    cruzarBreakpointPara('mobile');

    expect(screen.queryByTestId('atalhos-venda')).toBeNull();
  });
});
