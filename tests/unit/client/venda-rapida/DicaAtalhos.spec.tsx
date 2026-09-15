import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { useFocoDeModal } from '../../../../src/client/lib/useFocoDeModal';
import { DicaAtalhos } from '../../../../src/client/features/venda-rapida/DicaAtalhos';
import { TeclasDosAtalhos } from '../../../../src/client/features/venda-rapida/TeclasVendaRapida';
import { ATRIBUTO_ATALHOS_PERMITIDOS } from '../../../../src/client/hotkeys/mapaAtalhos';
import { MEIO_PAGTO } from '../../../../src/client/domain/pagamento/formaPagamento';
import type { AtalhoVendaRapida } from '../../../../src/client/domain/vendaRapida/tipos';

/**
 * Faixa de atalhos da venda rápida (T012, T020, T021).
 *
 * `DicaAtalhos` é presentacional: recebe `ListaAtalhos` pronta e o comando. É o
 * que permite exercitar aqui, sem provider de finalização nem query de
 * catálogo, as três afirmações do contrato — o que ela mostra (`FR-016`), que o
 * clique usa o **mesmo** comando da tecla (`US3`, cenário 3) e que a tecla não
 * colide com digitação nem bipagem (`FR-014`, `SC-005`).
 */

function atalhoDe(opcoes: Partial<AtalhoVendaRapida> = {}): AtalhoVendaRapida {
  return {
    tecla: opcoes.tecla ?? 'F6',
    nome: opcoes.nome ?? 'Dinheiro à vista',
    condicaoCodigo: opcoes.condicaoCodigo ?? 1,
    formaCodigo: opcoes.formaCodigo ?? 1,
    meioPagtoNFe: opcoes.meioPagtoNFe ?? MEIO_PAGTO.Dinheiro,
    encerraOperacao: opcoes.encerraOperacao ?? false,
  };
}

const DOIS_ATALHOS = [
  atalhoDe({ tecla: 'F6', nome: 'Dinheiro à vista' }),
  atalhoDe({
    tecla: 'F8',
    nome: 'Débito à vista',
    formaCodigo: 3,
    meioPagtoNFe: MEIO_PAGTO.CartaoDebito,
  }),
];

/* ------------------------------------------------------------------ *
 * T020 — o que a faixa mostra (FR-016)
 * ------------------------------------------------------------------ */

describe('DicaAtalhos — renderização (T020)', () => {
  it('mostra uma entrada por atalho, com tecla e nome', () => {
    render(<DicaAtalhos atalhos={DOIS_ATALHOS} onAcionar={vi.fn()} />);

    expect(screen.getByTestId('atalho-venda-rapida-F6')).toHaveTextContent('Dinheiro à vista (F6)');
    expect(screen.getByTestId('atalho-venda-rapida-F8')).toHaveTextContent('Débito à vista (F8)');
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  it('lista vazia não renderiza nada — nem faixa, nem mensagem de erro (I4)', () => {
    const { container } = render(<DicaAtalhos atalhos={[]} onAcionar={vi.fn()} />);

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId('dica-atalhos-venda-rapida')).toBeNull();
  });

  it('não filtra nem reordena: exibe exatamente a lista recebida, na ordem recebida', () => {
    const invertida = [DOIS_ATALHOS[1], DOIS_ATALHOS[0]] as AtalhoVendaRapida[];

    render(<DicaAtalhos atalhos={invertida} onAcionar={vi.fn()} />);

    /* `textContent` é normalizado porque o ícone entra antes do rótulo e o
       reicon injeta o SVG com `dangerouslySetInnerHTML`, deixando os espaços
       literais entre `<path>` como nós de texto dentro do `<svg>` — invisíveis
       na tela, mas contados aqui. O que a asserção verifica é a lista e a
       ordem dos rótulos, não o espaçamento do desenho. */
    const rotulos = screen
      .getAllByRole('button')
      .map((botao) => botao.textContent?.replace(/\s+/g, ' ').trim());
    expect(rotulos).toEqual(['Débito à vista (F8)', 'Dinheiro à vista (F6)']);
  });
});

/* ------------------------------------------------------------------ *
 * T021 — clique e tecla usam o mesmo comando (US3, cenário 3)
 * ------------------------------------------------------------------ */

describe('DicaAtalhos — acionamento (T021)', () => {
  it('clicar no atalho chama o comando com a tecla daquele atalho', async () => {
    const usuario = userEvent.setup();
    const onAcionar = vi.fn();
    render(<DicaAtalhos atalhos={DOIS_ATALHOS} onAcionar={onAcionar} />);

    await usuario.click(screen.getByTestId('atalho-venda-rapida-F8'));

    expect(onAcionar).toHaveBeenCalledTimes(1);
    expect(onAcionar).toHaveBeenCalledWith('F8');
  });

  it('a tecla chama o mesmo comando, com o mesmo argumento', async () => {
    const usuario = userEvent.setup();
    const onAcionar = vi.fn();
    render(
      <>
        <DicaAtalhos atalhos={DOIS_ATALHOS} onAcionar={onAcionar} />
        <TeclasDosAtalhos atalhos={DOIS_ATALHOS} onAcionar={onAcionar} />
      </>,
    );

    await usuario.keyboard('{F8}');

    expect(onAcionar).toHaveBeenCalledExactlyOnceWith('F8');
  });

  it('a faixa sozinha não escuta tecla nenhuma — o dono das teclas é outro (feature 016)', async () => {
    // Desde a 016 a faixa é só visual: as teclas são registradas por
    // `TeclasVendaRapida`, montado em `AppShell` nos dois layouts. Se a faixa
    // voltasse a registrar, o desktop teria dois donos para F6–F9 e o segundo
    // veria `defaultPrevented` do primeiro.
    const usuario = userEvent.setup();
    const onAcionar = vi.fn();
    render(<DicaAtalhos atalhos={DOIS_ATALHOS} onAcionar={onAcionar} />);

    await usuario.keyboard('{F6}');

    expect(onAcionar).not.toHaveBeenCalled();
  });

  it('tecla sem atalho na lista não chama nada', async () => {
    const usuario = userEvent.setup();
    const onAcionar = vi.fn();
    render(<TeclasDosAtalhos atalhos={DOIS_ATALHOS} onAcionar={onAcionar} />);

    await usuario.keyboard('{F7}');
    await usuario.keyboard('{F9}');

    expect(onAcionar).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ *
 * T012 — não colide com digitação nem com bipagem (FR-014, SC-005, C8)
 *
 * Desde a feature 016 estes casos exercitam `TeclasDosAtalhos`, que herdou o
 * registro de F6–F9 da faixa. As regras são as mesmas; mudou só quem as
 * aplica.
 * ------------------------------------------------------------------ */

describe('DicaAtalhos — o atalho não dispara durante digitação nem bipagem (T012)', () => {
  function renderizarComCampos(onAcionar: () => void) {
    return render(
      <>
        <TeclasDosAtalhos atalhos={DOIS_ATALHOS} onAcionar={onAcionar} />
        {/* O campo de código do produto é a **única** exceção: declara-se
            transparente aos atalhos globais, como em `EntradaRapidaProduto`. */}
        <input aria-label="Código do produto" {...ATRIBUTO_ATALHOS_PERMITIDOS} />
        <input aria-label="Quantidade" type="number" />
        <input aria-label="Valor recebido" />
        <textarea aria-label="Observação" />
      </>,
    );
  }

  it.each(['Quantidade', 'Valor recebido', 'Observação'])(
    'com o foco em "%s", F6 e F8 não acionam nada',
    async (rotulo) => {
      const usuario = userEvent.setup();
      const onAcionar = vi.fn();
      renderizarComCampos(onAcionar);

      await usuario.click(screen.getByLabelText(rotulo));
      await usuario.keyboard('{F6}');
      await usuario.keyboard('{F8}');

      expect(onAcionar).not.toHaveBeenCalled();
    },
  );

  it('no campo de código do produto o atalho **dispara** — a exceção da regra', async () => {
    const usuario = userEvent.setup();
    const onAcionar = vi.fn();
    renderizarComCampos(onAcionar);

    await usuario.click(screen.getByLabelText('Código do produto'));
    await usuario.keyboard('{F6}');

    expect(onAcionar).toHaveBeenCalledExactlyOnceWith('F6');
  });

  it('uma leitura de código de barras no campo de produto não vira atalho', async () => {
    const usuario = userEvent.setup({ delay: null });
    const onAcionar = vi.fn();
    renderizarComCampos(onAcionar);

    const campo = screen.getByLabelText('Código do produto');
    await usuario.click(campo);
    // O leitor se comporta como um teclado muito rápido terminando em Enter.
    // Mesmo com o campo transparente aos atalhos, dígitos e `Enter` não são
    // tecla de função — é por isso que a exceção é segura.
    await usuario.keyboard('7891234567895{Enter}');

    expect(onAcionar).not.toHaveBeenCalled();
    expect(campo).toHaveValue('7891234567895');
  });

  it('opção de combobox aberto não dispara atalho', async () => {
    const usuario = userEvent.setup();
    const onAcionar = vi.fn();
    render(
      <>
        <TeclasDosAtalhos atalhos={DOIS_ATALHOS} onAcionar={onAcionar} />
        <button type="button" role="option" aria-selected="false">
          A VISTA
        </button>
      </>,
    );

    await usuario.click(screen.getByRole('option'));
    await usuario.keyboard('{F6}');

    expect(onAcionar).not.toHaveBeenCalled();
  });

  it('combinação com modificador é outro atalho, não este', async () => {
    const usuario = userEvent.setup();
    const onAcionar = vi.fn();
    render(<TeclasDosAtalhos atalhos={DOIS_ATALHOS} onAcionar={onAcionar} />);

    await usuario.keyboard('{Control>}{F6}{/Control}');
    await usuario.keyboard('{Shift>}{F6}{/Shift}');
    await usuario.keyboard('{Alt>}{F6}{/Alt}');

    expect(onAcionar).not.toHaveBeenCalled();
  });

  it('o atalho não dispara por cima de um modal aberto', async () => {
    const usuario = userEvent.setup();
    const onAcionar = vi.fn();
    render(
      <>
        <TeclasDosAtalhos atalhos={DOIS_ATALHOS} onAcionar={onAcionar} />
        <div role="dialog" aria-modal="true">
          <button type="button">Confirmar</button>
        </div>
      </>,
    );

    await usuario.click(screen.getByRole('button', { name: 'Confirmar' }));
    await usuario.keyboard('{F6}');

    expect(onAcionar).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ *
 * Faixa bloqueada — venda sem item ativo no grid
 * ------------------------------------------------------------------ */

/**
 * Correção do usuário (2026-09-10): a faixa precisa **parecer** bloqueada
 * quando não há produto ativo no grid, não só recusar depois do clique.
 *
 * A recusa em si já existia — `acionarCenario` devolve `SEM_ITENS` e avisa
 * (G3, `tests/integration/vendaRapida.spec.ts`). O que faltava era o estado
 * visível antes do gesto: os botões seguiam com a mesma aparência dos
 * acionáveis, e o operador só descobria a regra ao tentar.
 *
 * O motivo chega por prop porque este componente não decide nada — quem lê o
 * grid é `FaixaAtalhosVendaRapida`.
 */
describe('DicaAtalhos — faixa bloqueada (correção do usuário, 2026-09-10)', () => {
  const MOTIVO = 'Não há itens nesta venda: bipe ao menos um produto antes de usar o atalho.';

  it('marca todos os botões como desabilitados, com o motivo no título', () => {
    render(<DicaAtalhos atalhos={DOIS_ATALHOS} onAcionar={vi.fn()} bloqueio={MOTIVO} />);

    for (const tecla of ['F6', 'F8']) {
      const botao = screen.getByTestId(`atalho-venda-rapida-${tecla}`);
      expect(botao).toHaveAttribute('aria-disabled', 'true');
      expect(botao).toHaveAttribute('title', MOTIVO);
      // `aria-disabled`, não `disabled`: o clique precisa continuar chegando ao
      // handler para o motivo ser dito (`lib/bloqueio.ts`).
      expect(botao).toBeEnabled();
    }
  });

  it('o clique não aciona o cenário', async () => {
    const usuario = userEvent.setup();
    const onAcionar = vi.fn();
    render(<DicaAtalhos atalhos={DOIS_ATALHOS} onAcionar={onAcionar} bloqueio={MOTIVO} />);

    await usuario.click(screen.getByTestId('atalho-venda-rapida-F6'));

    expect(onAcionar).not.toHaveBeenCalled();
  });

  it('sem bloqueio, os botões seguem acionáveis e sem `aria-disabled`', async () => {
    const usuario = userEvent.setup();
    const onAcionar = vi.fn();
    render(<DicaAtalhos atalhos={DOIS_ATALHOS} onAcionar={onAcionar} bloqueio={null} />);

    const botao = screen.getByTestId('atalho-venda-rapida-F6');
    expect(botao).not.toHaveAttribute('aria-disabled');
    expect(botao).toHaveAttribute('title', 'Dinheiro à vista (F6)');

    await usuario.click(botao);
    expect(onAcionar).toHaveBeenCalledWith('F6');
  });
});

/* ------------------------------------------------------------------ *
 * Posse das teclas com cenário (achado do usuário, 2026-09-15)
 * ------------------------------------------------------------------ */

/**
 * Achado do usuário no dev server: com um modal aberto, F6 e F7 **com cenário
 * cadastrado** chegavam ao navegador — F6 leva o foco à barra de endereços, F7
 * liga a navegação por cursor. As guardas de modal, campo e repetição ficavam em
 * `ignoreEventWhen`, e a biblioteca pula o `preventDefault` junto: a ação era
 * suprimida, mas a tecla escapava. É a mesma classe de falha que a feature 016
 * fechou para F1–F4/F10 (`data-model.md` §4 daquela spec).
 *
 * A regra agora: tecla com cenário é sempre do Checkout; modal, campo e
 * repetição suprimem só a ação. "Chegou ao navegador" é lido de
 * `defaultPrevented` num ouvinte de `window`, o último da propagação.
 */
describe('TeclasDosAtalhos — a tecla com cenário nunca escapa para o navegador', () => {
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
  });

  /** Uma janela aberta de verdade, pela mesma pilha dos modais da base. */
  function JanelaAberta(): ReactElement {
    const ref = useFocoDeModal<HTMLDivElement>(true);
    return (
      <div ref={ref} role="dialog" aria-modal="true">
        <input aria-label="Busca do modal" />
      </div>
    );
  }

  it('com um modal aberto e o foco dentro dele, F6 é engolida e não aciona', async () => {
    const usuario = userEvent.setup();
    const onAcionar = vi.fn();
    render(
      <>
        <TeclasDosAtalhos atalhos={DOIS_ATALHOS} onAcionar={onAcionar} />
        <JanelaAberta />
      </>,
    );

    await usuario.click(screen.getByLabelText('Busca do modal'));
    chegadas = [];
    await usuario.keyboard('{F6}');

    expect(chegadas).toEqual([{ tecla: 'F6', engolida: true }]);
    expect(onAcionar).not.toHaveBeenCalled();
  });

  it('com o modal aberto e o foco solto no body, F8 também não aciona por baixo dele', async () => {
    const usuario = userEvent.setup();
    const onAcionar = vi.fn();
    render(
      <>
        <TeclasDosAtalhos atalhos={DOIS_ATALHOS} onAcionar={onAcionar} />
        <JanelaAberta />
      </>,
    );
    (document.activeElement as HTMLElement | null)?.blur();

    await usuario.keyboard('{F8}');

    expect(chegadas).toEqual([{ tecla: 'F8', engolida: true }]);
    expect(onAcionar).not.toHaveBeenCalled();
  });

  it('com o foco no campo de quantidade, F6 é engolida — o próximo bipe não vai parar no navegador', async () => {
    const usuario = userEvent.setup();
    const onAcionar = vi.fn();
    render(
      <>
        <TeclasDosAtalhos atalhos={DOIS_ATALHOS} onAcionar={onAcionar} />
        <input aria-label="Quantidade" />
      </>,
    );

    await usuario.click(screen.getByLabelText('Quantidade'));
    chegadas = [];
    await usuario.keyboard('{F6}');

    expect(chegadas).toEqual([{ tecla: 'F6', engolida: true }]);
    expect(onAcionar).not.toHaveBeenCalled();
  });

  it('tecla segurada aciona uma vez e nenhuma repetição escapa', async () => {
    const usuario = userEvent.setup();
    const onAcionar = vi.fn();
    render(<TeclasDosAtalhos atalhos={DOIS_ATALHOS} onAcionar={onAcionar} />);

    await usuario.keyboard('{F6>3/}');

    expect(chegadas).toHaveLength(3);
    expect(chegadas.every((chegada) => chegada.engolida)).toBe(true);
    expect(onAcionar).toHaveBeenCalledOnce();
  });

  it('tecla sem cenário continua com o navegador — a posse cobre só o que está cadastrado', async () => {
    const usuario = userEvent.setup();
    render(<TeclasDosAtalhos atalhos={DOIS_ATALHOS} onAcionar={vi.fn()} />);

    await usuario.keyboard('{F7}');

    expect(chegadas).toEqual([{ tecla: 'F7', engolida: false }]);
  });
});
