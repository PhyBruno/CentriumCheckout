import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DicaAtalhos } from '../../../../src/client/features/venda-rapida/DicaAtalhos';
import { ATRIBUTO_ATALHOS_PERMITIDOS } from '../../../../src/client/hotkeys/mapaAtalhos';
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
    meioPagtoNFe: opcoes.meioPagtoNFe ?? 'Dinheiro',
    encerraOperacao: opcoes.encerraOperacao ?? false,
  };
}

const DOIS_ATALHOS = [
  atalhoDe({ tecla: 'F6', nome: 'Dinheiro à vista' }),
  atalhoDe({ tecla: 'F8', nome: 'Débito à vista', formaCodigo: 3, meioPagtoNFe: 'CartaoDebito' }),
];

/* ------------------------------------------------------------------ *
 * T020 — o que a faixa mostra (FR-016)
 * ------------------------------------------------------------------ */

describe('DicaAtalhos — renderização (T020)', () => {
  it('mostra uma entrada por atalho, com tecla e nome', () => {
    render(<DicaAtalhos atalhos={DOIS_ATALHOS} onAcionar={vi.fn()} />);

    expect(screen.getByTestId('atalho-venda-rapida-F6')).toHaveTextContent(
      'Dinheiro à vista (F6)',
    );
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

    const rotulos = screen.getAllByRole('button').map((botao) => botao.textContent);
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
    render(<DicaAtalhos atalhos={DOIS_ATALHOS} onAcionar={onAcionar} />);

    await usuario.keyboard('{F8}');

    expect(onAcionar).toHaveBeenCalledExactlyOnceWith('F8');
  });

  it('tecla sem atalho na lista não chama nada', async () => {
    const usuario = userEvent.setup();
    const onAcionar = vi.fn();
    render(<DicaAtalhos atalhos={DOIS_ATALHOS} onAcionar={onAcionar} />);

    await usuario.keyboard('{F7}');
    await usuario.keyboard('{F9}');

    expect(onAcionar).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ *
 * T012 — não colide com digitação nem com bipagem (FR-014, SC-005, C8)
 * ------------------------------------------------------------------ */

describe('DicaAtalhos — o atalho não dispara durante digitação nem bipagem (T012)', () => {
  function renderizarComCampos(onAcionar: () => void) {
    return render(
      <>
        <DicaAtalhos atalhos={DOIS_ATALHOS} onAcionar={onAcionar} />
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
        <DicaAtalhos atalhos={DOIS_ATALHOS} onAcionar={onAcionar} />
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
    render(<DicaAtalhos atalhos={DOIS_ATALHOS} onAcionar={onAcionar} />);

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
        <DicaAtalhos atalhos={DOIS_ATALHOS} onAcionar={onAcionar} />
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
