import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { notificar } from '../../../../src/client/lib/notificar';
import { useFocoDeModal } from '../../../../src/client/lib/useFocoDeModal';
import { useTeclasFixas, type AcaoFixa } from '../../../../src/client/hotkeys/mapaAtalhos';
import type { IdComando } from '../../../../src/client/hotkeys/mapaFixo';

/**
 * T003 — os estágios de uma pressionada (`data-model.md` §4) exercitados sem a
 * tela de venda.
 *
 * O ponto que a suíte protege é o da feature inteira: **a posse nunca depende
 * da ação**. Tecla repetida, janela aberta e ação indisponível mudam o que
 * acontece *depois* do `preventDefault` — nenhuma delas pode devolver a tecla
 * ao navegador.
 *
 * "O navegador reagiria?" é lido de `defaultPrevented` num ouvinte de `window`
 * em fase de bolha: a biblioteca escuta em `document`, que vem antes, então o
 * que chega aqui é exatamente o que o navegador receberia.
 */

type AcaoEspionada = AcaoFixa & { readonly executar: Mock<() => void> };
type Acoes = Record<IdComando, AcaoEspionada>;

function acoesDisponiveis(): Acoes {
  const acao = (): AcaoEspionada => ({
    indisponivel: () => null,
    executar: vi.fn<() => void>(),
  });
  return {
    IMPORTAR_DAV: acao(),
    IMPORTAR_NFCE: acao(),
    IDENTIFICAR_CLIENTE: acao(),
    IDENTIFICAR_PRODUTO: acao(),
    SUSPENDER_VENDA: acao(),
  };
}

function Sonda({ acoes }: { readonly acoes: Record<IdComando, AcaoFixa> }): null {
  useTeclasFixas(acoes);
  return null;
}

/** Uma janela aberta de verdade, pela mesma pilha que os modais da base usam. */
function JanelaAberta(): ReactElement {
  const ref = useFocoDeModal<HTMLDivElement>(true);
  return (
    <div ref={ref} role="dialog" aria-modal="true">
      <button type="button">Confirmar</button>
    </div>
  );
}

/** Cada `keydown` que chegou ao fim da propagação, e se alguém o tomou para si. */
let chegadas: { readonly tecla: string; readonly engolida: boolean }[] = [];
function observar(evento: KeyboardEvent): void {
  chegadas.push({ tecla: evento.key, engolida: evento.defaultPrevented });
}

beforeEach(() => {
  chegadas = [];
  window.addEventListener('keydown', observar);
});

afterEach(() => {
  window.removeEventListener('keydown', observar);
  vi.restoreAllMocks();
});

const TECLAS: readonly (readonly [string, IdComando])[] = [
  ['F1', 'IMPORTAR_DAV'],
  ['F2', 'IMPORTAR_NFCE'],
  ['F3', 'IDENTIFICAR_CLIENTE'],
  ['F4', 'IDENTIFICAR_PRODUTO'],
  ['F10', 'SUSPENDER_VENDA'],
];

describe('useTeclasFixas — estágio 1: posse', () => {
  it.each(TECLAS)(
    '%s é engolida e aciona o comando com o foco fora de campo',
    async (tecla, comando) => {
      const usuario = userEvent.setup();
      const acoes = acoesDisponiveis();
      render(<Sonda acoes={acoes} />);

      await usuario.keyboard(`{${tecla}}`);

      expect(chegadas).toEqual([{ tecla, engolida: true }]);
      expect(acoes[comando].executar).toHaveBeenCalledTimes(1);
    },
  );

  it.each(TECLAS)(
    '%s é engolida com o foco num input comum — e ainda aciona',
    async (tecla, comando) => {
      const usuario = userEvent.setup();
      const acoes = acoesDisponiveis();
      render(
        <>
          <Sonda acoes={acoes} />
          <input aria-label="Quantidade" />
        </>,
      );

      await usuario.click(screen.getByLabelText('Quantidade'));
      await usuario.keyboard(`{${tecla}}`);

      // O contrário da regra de F6–F9 (`FR-014` da 013): lá a tecla pertence a
      // quem digita; aqui ela pertence ao Checkout em qualquer foco (`FR-005`).
      expect(chegadas).toEqual([{ tecla, engolida: true }]);
      expect(acoes[comando].executar).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['F5', 'F11', 'F12', 'F6'])('%s não é tomada por este registro', async (tecla) => {
    const usuario = userEvent.setup();
    render(<Sonda acoes={acoesDisponiveis()} />);

    await usuario.keyboard(`{${tecla}}`);

    expect(chegadas).toEqual([{ tecla, engolida: false }]);
  });
});

describe('useTeclasFixas — estágio 2: elegibilidade do evento', () => {
  it('tecla segurada aciona uma vez só, e nenhuma repetição escapa (FR-007, I4)', async () => {
    const usuario = userEvent.setup();
    const acoes = acoesDisponiveis();
    render(<Sonda acoes={acoes} />);

    // Três `keydown` sem soltar: o segundo e o terceiro chegam com `repeat`.
    await usuario.keyboard('{F1>3/}');

    expect(chegadas).toHaveLength(3);
    expect(chegadas.every((chegada) => chegada.engolida)).toBe(true);
    expect(acoes.IMPORTAR_DAV.executar).toHaveBeenCalledTimes(1);
  });

  it('com janela aberta a tecla é engolida e nenhuma ação roda (FR-006)', async () => {
    const usuario = userEvent.setup();
    const acoes = acoesDisponiveis();
    const erro = vi.spyOn(notificar, 'erro');
    render(
      <>
        <Sonda acoes={acoes} />
        <JanelaAberta />
      </>,
    );

    await usuario.keyboard('{F3}');
    await usuario.keyboard('{F4}');

    expect(chegadas.map((chegada) => chegada.engolida)).toEqual([true, true]);
    expect(acoes.IDENTIFICAR_CLIENTE.executar).not.toHaveBeenCalled();
    expect(acoes.IDENTIFICAR_PRODUTO.executar).not.toHaveBeenCalled();
    // Silencioso por desenho: a decisão pendente na tela é o contexto, não o atalho.
    expect(erro).not.toHaveBeenCalled();
  });

  it('a janela aberta vale mesmo com o foco fora dela, no body', async () => {
    const usuario = userEvent.setup();
    const acoes = acoesDisponiveis();
    render(
      <>
        <Sonda acoes={acoes} />
        <JanelaAberta />
      </>,
    );
    // `closest('[role="dialog"]')` devolveria `null` aqui (`research.md` D3).
    (document.activeElement as HTMLElement | null)?.blur();
    expect(document.activeElement).toBe(document.body);

    await usuario.keyboard('{F10}');

    expect(acoes.SUSPENDER_VENDA.executar).not.toHaveBeenCalled();
  });

  it('respeita quem já tratou a tecla antes (defaultPrevented) — não há segundo dono', async () => {
    const usuario = userEvent.setup();
    const acoes = acoesDisponiveis();
    render(
      <>
        <Sonda acoes={acoes} />
        <input
          aria-label="Campo com tecla própria"
          onKeyDown={(evento) => {
            evento.preventDefault();
          }}
        />
      </>,
    );

    await usuario.click(screen.getByLabelText('Campo com tecla própria'));
    await usuario.keyboard('{F2}');

    expect(acoes.IMPORTAR_NFCE.executar).not.toHaveBeenCalled();
  });
});

describe('useTeclasFixas — estágio 3: disponibilidade da ação', () => {
  it('ação indisponível recusa com o motivo em texto, e a tecla continua engolida (FR-003, I5)', async () => {
    const usuario = userEvent.setup();
    const acoes = acoesDisponiveis();
    const erro = vi.spyOn(notificar, 'erro');
    const indisponivel: Acoes = {
      ...acoes,
      SUSPENDER_VENDA: {
        indisponivel: () => 'Não há nada a cancelar: nenhum item foi lançado nesta venda.',
        executar: acoes.SUSPENDER_VENDA.executar,
      },
    };
    render(<Sonda acoes={indisponivel} />);

    await usuario.keyboard('{F10}');

    expect(chegadas).toEqual([{ tecla: 'F10', engolida: true }]);
    expect(acoes.SUSPENDER_VENDA.executar).not.toHaveBeenCalled();
    expect(erro).toHaveBeenCalledExactlyOnceWith(
      'Não há nada a cancelar: nenhum item foi lançado nesta venda.',
    );
  });

  it('a disponibilidade é consultada na pressionada, não no render', async () => {
    const usuario = userEvent.setup();
    const acoes = acoesDisponiveis();
    let motivo: string | null = null;
    render(
      <Sonda
        acoes={{
          ...acoes,
          IMPORTAR_DAV: { indisponivel: () => motivo, executar: acoes.IMPORTAR_DAV.executar },
        }}
      />,
    );

    // O estado muda entre o render e o gesto, sem re-render nenhum.
    motivo = 'Venda em andamento.';
    vi.spyOn(notificar, 'erro');
    await usuario.keyboard('{F1}');

    expect(acoes.IMPORTAR_DAV.executar).not.toHaveBeenCalled();
  });
});
