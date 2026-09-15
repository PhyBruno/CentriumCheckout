import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import type { OrigemCliente } from '../../src/client/domain/cliente/clienteVenda';
import { AppShell, MOTIVO_IMPORTACAO_NO_COMPACTO } from '../../src/client/layout/AppShell';
import { notificar } from '../../src/client/lib/notificar';
import { useFocoDeModal } from '../../src/client/lib/useFocoDeModal';
import { mensagemDeRecusa } from '../../src/client/services/importacao/importarVendaExistente';
import { useJanelasStore } from '../../src/client/stores/janelasStore';
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
 * Atalhos fixos na tela de venda montada (feature 016).
 *
 * Os casos de US1 afirmam uma coisa só, em cada estado que antes esvaziava o
 * registro: **o navegador não recebe a tecla**. "Recebe" é lido de
 * `defaultPrevented` num ouvinte de `window` em fase de bolha — o último ponto
 * da propagação antes do navegador.
 */

const TECLAS_FIXAS = ['F1', 'F2', 'F3', 'F4', 'F10'] as const;

/** Cada `keydown` que chegou ao fim da propagação, e se alguém o tomou. */
let chegadas: { readonly tecla: string; readonly engolida: boolean }[] = [];
function observar(evento: KeyboardEvent): void {
  chegadas.push({ tecla: evento.key, engolida: evento.defaultPrevented });
}

/** Rede que nunca responde: o catálogo e o resto das queries ficam pendentes. */
function redePendente(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Promise<Response>(() => {
          /* nunca resolve — é o esqueleto na tela do cenário C1 */
        }),
    ),
  );
}

function renderizarShell(extra?: ReactElement): void {
  renderizarComProvedores(
    <>
      <AppShell
        onRecarregarBootstrap={() => {
          /* fora do assunto destes testes */
        }}
      />
      {extra}
    </>,
  );
}

/** Uma janela aberta de verdade, pela mesma pilha dos modais da base. */
function JanelaDeTeste(): ReactElement {
  const ref = useFocoDeModal<HTMLDivElement>(true);
  return (
    <div ref={ref} role="dialog" aria-modal="true" data-testid="janela-de-teste">
      <button type="button">Confirmar</button>
    </div>
  );
}

/** O esqueleto do Boneyard nas janelas de importação mede a caixa; jsdom não traz `ResizeObserver`. */
class ResizeObserverStub implements ResizeObserver {
  observe(): void {
    /* sem medição */
  }
  unobserve(): void {
    /* nada a fazer */
  }
  disconnect(): void {
    /* nada a fazer */
  }
}

beforeAll(() => {
  instalarMatchMediaDeLayout();
  window.ResizeObserver = ResizeObserverStub;
});

beforeEach(() => {
  chegadas = [];
  window.addEventListener('keydown', observar);
  definirLayoutInicial('desktop');
  redePendente();
  useJanelasStore.getState().fechar();
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

afterEach(() => {
  window.removeEventListener('keydown', observar);
  useJanelasStore.getState().fechar();
  vi.restoreAllMocks();
});

/* ------------------------------------------------------------------ *
 * US1 — nenhuma tecla reservada escapa (T009–T011)
 * ------------------------------------------------------------------ */

describe('US1 — posse das teclas fixas na tela de venda', () => {
  it('com o catálogo do ERP ainda carregando, nenhuma tecla fixa chega ao navegador (C1, FR-002)', async () => {
    const usuario = userEvent.setup();
    renderizarShell();

    for (const tecla of TECLAS_FIXAS) {
      await usuario.keyboard(`{${tecla}}`);
    }

    expect(chegadas.map((chegada) => chegada.tecla)).toEqual([...TECLAS_FIXAS]);
    expect(chegadas.every((chegada) => chegada.engolida)).toBe(true);
  });

  it('no layout compacto, também — a posse não consulta a plataforma (FR-010)', async () => {
    const usuario = userEvent.setup();
    definirLayoutInicial('mobile');
    renderizarShell();

    for (const tecla of TECLAS_FIXAS) {
      await usuario.keyboard(`{${tecla}}`);
    }

    expect(chegadas.every((chegada) => chegada.engolida)).toBe(true);
    expect(chegadas).toHaveLength(TECLAS_FIXAS.length);
  });

  it.each(TECLAS_FIXAS)(
    '%s é engolida com o foco no campo de quantidade (C2, FR-005)',
    async (tecla) => {
      const usuario = userEvent.setup();
      renderizarShell();

      await usuario.click(screen.getByTestId('previa-quantidade'));
      chegadas = [];
      await usuario.keyboard(`{${tecla}}`);

      expect(chegadas).toEqual([{ tecla, engolida: true }]);
    },
  );

  it('com uma janela aberta, nenhuma tecla fixa chega ao navegador (C3, FR-006)', async () => {
    const usuario = userEvent.setup();
    renderizarShell(<JanelaDeTeste />);

    for (const tecla of TECLAS_FIXAS) {
      await usuario.keyboard(`{${tecla}}`);
    }

    expect(chegadas.every((chegada) => chegada.engolida)).toBe(true);
    // E nenhuma janela nova foi aberta por baixo desta.
    expect(useJanelasStore.getState().janela).toBe('nenhuma');
  });

  it.each(['F5', 'F11', 'F12'])('%s continua com o navegador (FR-008)', async (tecla) => {
    const usuario = userEvent.setup();
    renderizarShell();

    await usuario.keyboard(`{${tecla}}`);

    expect(chegadas).toEqual([{ tecla, engolida: false }]);
  });
});

/** Os `ATALHO_ACIONADO` do histórico, na forma que a análise posterior lê. */
function atalhosAuditados(): readonly unknown[] {
  return useVendaStore
    .getState()
    .eventos.filter((evento) => evento.tipo === 'ATALHO_ACIONADO')
    .map((evento) => evento.detalhes);
}

/* ------------------------------------------------------------------ *
 * US2 — cliente e produto sem tirar a mão do teclado (T015)
 * ------------------------------------------------------------------ */

const ATALHOS_DE_BUSCA = [
  {
    tecla: 'F3',
    comando: 'IDENTIFICAR_CLIENTE',
    modal: 'modal-busca-cliente',
    campo: 'campo-busca-cliente',
  },
  {
    tecla: 'F4',
    comando: 'IDENTIFICAR_PRODUTO',
    modal: 'modal-busca-produto',
    campo: 'campo-busca-produto',
  },
] as const;

describe('US2 — F3 e F4 abrem as buscas com o campo focado', () => {
  it.each(ATALHOS_DE_BUSCA)(
    '$tecla aciona com o foco fora de campo, e o campo de busca recebe o foco (a)',
    async ({ tecla, comando, modal, campo }) => {
      const usuario = userEvent.setup();
      renderizarShell();
      (document.activeElement as HTMLElement | null)?.blur();

      await usuario.keyboard(`{${tecla}}`);

      expect(await screen.findByTestId(modal)).toBeInTheDocument();
      await waitFor(() => {
        expect(screen.getByTestId(campo)).toHaveFocus();
      });
      expect(atalhosAuditados()).toEqual([{ comando, origem: 'TECLADO' }]);
    },
  );

  it.each(ATALHOS_DE_BUSCA)(
    '$tecla não vaza para o navegador durante a bipagem no campo de produto (b)',
    async ({ tecla, modal }) => {
      const usuario = userEvent.setup({ delay: null });
      renderizarShell();

      await usuario.type(screen.getByTestId('campo-codigo-produto'), '789123');
      chegadas = [];
      await usuario.keyboard(`{${tecla}}`);

      expect(chegadas).toEqual([{ tecla, engolida: true }]);
      expect(await screen.findByTestId(modal)).toBeInTheDocument();
    },
  );

  it('com o modal de cliente aberto, F4 não abre um segundo modal (US2-4)', async () => {
    const usuario = userEvent.setup();
    renderizarShell();

    await usuario.keyboard('{F3}');
    await screen.findByTestId('modal-busca-cliente');
    chegadas = [];
    await usuario.keyboard('{F4}');

    expect(chegadas).toEqual([{ tecla: 'F4', engolida: true }]);
    expect(screen.queryByTestId('modal-busca-produto')).toBeNull();
    expect(useJanelasStore.getState().janela).toBe('cliente');
  });

  it('com item na venda, F3 ainda abre a busca — a lupa não é bloqueada, quem recusa a troca é o slice (US2-5)', async () => {
    const usuario = userEvent.setup();
    useVendaStore.setState({ linhas: [linhaDe({ idLinha: 'linha-1' })] });
    renderizarShell();

    await usuario.keyboard('{F3}');

    expect(await screen.findByTestId('modal-busca-cliente')).toBeInTheDocument();
  });

  it('no wizard mobile, F3 fora da etapa 1 leva à etapa 1 e abre a busca lá (decisão de 2026-09-15)', async () => {
    const usuario = userEvent.setup();
    definirLayoutInicial('mobile');
    useVendaStore.setState({
      linhas: [linhaDe({ idLinha: 'linha-1', precoUnitario: 1_000, quantidadeEmUnidades: 1 })],
    });
    renderizarShell();
    await usuario.click(screen.getByTestId('wizard-avancar'));
    expect(screen.queryByTestId('etapa-cliente-produtos')).toBeNull();

    await usuario.keyboard('{F3}');

    expect(await screen.findByTestId('etapa-cliente-produtos')).toBeInTheDocument();
    expect(await screen.findByTestId('modal-busca-cliente')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('campo-busca-cliente')).toHaveFocus();
    });
  });
});

/* ------------------------------------------------------------------ *
 * US3 — importar DAV e NFCe por tecla (T022, T023)
 * ------------------------------------------------------------------ */

const ATALHOS_DE_IMPORTACAO = [
  {
    tecla: 'F1',
    comando: 'IMPORTAR_DAV',
    janela: 'dav',
    modal: 'modal-importacao-dav',
    campo: 'campo-busca-dav',
  },
  {
    tecla: 'F2',
    comando: 'IMPORTAR_NFCE',
    janela: 'nfce',
    modal: 'modal-recuperacao-nfce',
    campo: 'campo-busca-nfce',
  },
] as const;

const CLIENTE_IDENTIFICADO = {
  codigoCliente: 42,
  nome: 'Cliente de Teste',
  documento: '11144477735',
  celular: null,
  listaPreco: 3,
  descontoConvenio: 0,
  codigoConvenio: null,
  origem: 'BUSCA_DOCUMENTO' as OrigemCliente,
};

describe('US3 — F1 e F2 abrem a importação direto, com recusa explicada', () => {
  it.each(ATALHOS_DE_IMPORTACAO)(
    '$tecla em venda vazia abre a janela direto, pulando o seletor, com a busca focada (a)',
    async ({ tecla, comando, janela, modal, campo }) => {
      const usuario = userEvent.setup();
      renderizarShell();
      (document.activeElement as HTMLElement | null)?.blur();

      await usuario.keyboard(`{${tecla}}`);

      expect(await screen.findByTestId(modal)).toBeInTheDocument();
      expect(screen.queryByTestId('modal-menu-importacao')).toBeNull();
      expect(useJanelasStore.getState().janela).toBe(janela);
      await waitFor(() => {
        expect(screen.getByTestId(campo)).toHaveFocus();
      });
      expect(atalhosAuditados()).toEqual([{ comando, origem: 'TECLADO' }]);
    },
  );

  it.each(ATALHOS_DE_IMPORTACAO)(
    '$tecla não vaza para o navegador durante a bipagem no campo de produto (b)',
    async ({ tecla, modal }) => {
      const usuario = userEvent.setup({ delay: null });
      renderizarShell();

      await usuario.type(screen.getByTestId('campo-codigo-produto'), '789123');
      chegadas = [];
      await usuario.keyboard(`{${tecla}}`);

      expect(chegadas).toEqual([{ tecla, engolida: true }]);
      expect(await screen.findByTestId(modal)).toBeInTheDocument();
    },
  );

  it('com item lançado, F1 não abre e diz o mesmo motivo do botão bloqueado (C7, US3-3)', async () => {
    const usuario = userEvent.setup();
    const erro = vi.spyOn(notificar, 'erro');
    useVendaStore.setState({ linhas: [linhaDe({ idLinha: 'linha-1' })] });
    renderizarShell();

    await usuario.keyboard('{F1}');

    const motivoDoBotao = screen.getByTestId('botao-menu-importacao').getAttribute('title');
    expect(motivoDoBotao).toBe(mensagemDeRecusa('carrinho-populado'));
    expect(erro).toHaveBeenCalledExactlyOnceWith(motivoDoBotao);
    expect(useJanelasStore.getState().janela).toBe('nenhuma');
    expect(atalhosAuditados()).toEqual([]);
  });

  it('com cliente identificado e nenhum item, F2 recusa com motivo (US3-4)', async () => {
    const usuario = userEvent.setup();
    const erro = vi.spyOn(notificar, 'erro');
    useVendaStore.setState({ clienteAtual: CLIENTE_IDENTIFICADO, houveEscolhaExplicita: true });
    renderizarShell();

    await usuario.keyboard('{F2}');

    expect(erro).toHaveBeenCalledExactlyOnceWith(mensagemDeRecusa('cliente-identificado'));
    expect(screen.queryByTestId('modal-recuperacao-nfce')).toBeNull();
  });

  it('só com o cliente padrão aplicado, F1 abre — cliente padrão não é venda em andamento (C8, AD-138)', async () => {
    const usuario = userEvent.setup();
    useVendaStore.setState({
      clienteAtual: { ...CLIENTE_IDENTIFICADO, origem: 'DEFAULT' },
      houveEscolhaExplicita: false,
    });
    renderizarShell();

    await usuario.keyboard('{F1}');

    expect(await screen.findByTestId('modal-importacao-dav')).toBeInTheDocument();
  });

  it('a janela de DAV aberta no desktop não atravessa para o compacto e trava as teclas de lá', async () => {
    // A janela mora no store e sobreviveria ao desmonte; do lado compacto não
    // há quem desenhe a de DAV, e o store "ocupado" deixaria F3 sem efeito.
    const usuario = userEvent.setup();
    renderizarShell();
    await usuario.keyboard('{F1}');
    await screen.findByTestId('modal-importacao-dav');

    cruzarBreakpointPara('mobile');

    expect(useJanelasStore.getState().janela).toBe('nenhuma');
    await usuario.keyboard('{F3}');
    expect(await screen.findByTestId('modal-busca-cliente')).toBeInTheDocument();
  });

  it('no layout compacto, F1 e F2 recusam explicando — a importação não existe ali (decisão de 2026-09-15)', async () => {
    const usuario = userEvent.setup();
    const erro = vi.spyOn(notificar, 'erro');
    definirLayoutInicial('mobile');
    renderizarShell();

    await usuario.keyboard('{F1}');
    await usuario.keyboard('{F2}');

    expect(erro).toHaveBeenCalledTimes(2);
    expect(erro).toHaveBeenNthCalledWith(1, MOTIVO_IMPORTACAO_NO_COMPACTO);
    expect(useJanelasStore.getState().janela).toBe('nenhuma');
    expect(chegadas.every((chegada) => chegada.engolida)).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * US4 — suspender a venda por tecla (T027, T028)
 * ------------------------------------------------------------------ */

/** Só os tipos do histórico, na ordem em que entraram. */
function tiposDeEvento(): readonly string[] {
  return useVendaStore.getState().eventos.map((evento) => evento.tipo);
}

describe('US4 — F10 suspende a venda', () => {
  it('com item lançado e o foco fora de campo, F10 suspende pelo mesmo caminho do botão (a)', async () => {
    const usuario = userEvent.setup();
    useVendaStore.setState({ linhas: [linhaDe({ idLinha: 'linha-1' })] });
    renderizarShell();
    (document.activeElement as HTMLElement | null)?.blur();

    await usuario.keyboard('{F10}');

    // O gesto primeiro, o desfecho de sempre depois: `VENDA_SUSPENSA` é o
    // evento que a máquina da 004 registra antes de enviar.
    expect(tiposDeEvento().slice(-2)).toEqual(['ATALHO_ACIONADO', 'VENDA_SUSPENSA']);
    expect(atalhosAuditados()).toEqual([{ comando: 'SUSPENDER_VENDA', origem: 'TECLADO' }]);
  });

  it('F10 não vaza para o navegador durante a bipagem no campo de produto (b)', async () => {
    const usuario = userEvent.setup({ delay: null });
    useVendaStore.setState({ linhas: [linhaDe({ idLinha: 'linha-1' })] });
    renderizarShell();

    await usuario.type(screen.getByTestId('campo-codigo-produto'), '789123');
    chegadas = [];
    await usuario.keyboard('{F10}');

    expect(chegadas).toEqual([{ tecla: 'F10', engolida: true }]);
    expect(tiposDeEvento()).toContain('VENDA_SUSPENSA');
  });

  it('em venda vazia, F10 recusa com a frase do botão e não vaza (C9, US4-4)', async () => {
    const usuario = userEvent.setup();
    const erro = vi.spyOn(notificar, 'erro');
    renderizarShell();

    await usuario.keyboard('{F10}');

    const motivoDoBotao = screen.getByTestId('botao-cancelar-venda').getAttribute('title');
    expect(motivoDoBotao).not.toBeNull();
    expect(erro).toHaveBeenCalledExactlyOnceWith(motivoDoBotao);
    expect(chegadas).toEqual([{ tecla: 'F10', engolida: true }]);
    expect(tiposDeEvento()).not.toContain('VENDA_SUSPENSA');
  });

  it('com o envio em curso, um segundo F10 recusa explicando — não fica mudo nem reenvia', async () => {
    const usuario = userEvent.setup();
    const erro = vi.spyOn(notificar, 'erro');
    useVendaStore.setState({ linhas: [linhaDe({ idLinha: 'linha-1' })] });
    renderizarShell();

    await usuario.keyboard('{F10}');
    await usuario.keyboard('{F10}');

    expect(erro).toHaveBeenCalledExactlyOnceWith(
      'Aguarde: esta venda ainda está sendo enviada ao ERP.',
    );
    expect(tiposDeEvento().filter((tipo) => tipo === 'VENDA_SUSPENSA')).toHaveLength(1);
  });

  it('F10 tem um desfecho só: suspende, nunca finaliza nem oferece descarte (FR-017, US4-6)', async () => {
    const usuario = userEvent.setup();
    useVendaStore.setState({ linhas: [linhaDe({ idLinha: 'linha-1' })] });
    renderizarShell();

    await usuario.keyboard('{F10}');

    expect(tiposDeEvento()).toContain('VENDA_SUSPENSA');
    expect(tiposDeEvento()).not.toContain('VENDA_FINALIZADA');
    expect(screen.queryByText(/descart/i)).toBeNull();
  });
});
