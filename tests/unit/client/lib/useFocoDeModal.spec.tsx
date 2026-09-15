import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { useRef, type ReactElement } from 'react';
import { haJanelaAberta, useFocoDeModal } from '../../../../src/client/lib/useFocoDeModal';
import { usePresenca } from '../../../../src/client/lib/usePresenca';

/**
 * T014 (feature 016) — o foco inicial declarado de uma janela.
 *
 * O caso que motivou a opção não é o `inert` que `research.md` D11 supunha: os
 * modais desta base desmontam ao fechar e o `autoFocus` do campo de busca
 * funcionava em toda abertura **por cima de uma tela já montada**. Ele falha
 * quando a janela nasce **no mesmo commit** que outro campo com foco próprio —
 * o F3 no wizard mobile, que monta a etapa 1 junto com o modal: o `autoFocus`
 * do campo de código de produto, que vem depois na árvore, rouba o foco da
 * busca, sem erro nenhum. O `focoInicial` é aplicado depois do commit, e é o
 * que o teste de "ladrão" abaixo verifica.
 */

interface JanelaProps {
  readonly aberto: boolean;
}

/** Uma janela montada por `usePresenca`, como os modais reais. */
function Janela({ aberto }: JanelaProps): ReactElement | null {
  const { montado } = usePresenca(aberto, 0);
  const campo = useRef<HTMLInputElement>(null);
  const janelaRef = useFocoDeModal<HTMLDivElement>(aberto, { focoInicial: campo });

  if (!montado) {
    return null;
  }
  return (
    <div ref={janelaRef} role="dialog" aria-modal="true">
      <button type="button">Fechar</button>
      <input ref={campo} aria-label="Busca" />
    </div>
  );
}

describe('useFocoDeModal — foco inicial declarado', () => {
  it('abrindo sobre uma tela já montada, o campo declarado recebe o foco', async () => {
    const { rerender } = render(
      <>
        <input aria-label="Fora" />
        <Janela aberto={false} />
      </>,
    );

    rerender(
      <>
        <input aria-label="Fora" />
        <Janela aberto />
      </>,
    );

    await waitFor(() => {
      expect(screen.getByLabelText('Busca')).toHaveFocus();
    });
  });

  it('nascendo no mesmo commit que um campo com autoFocus depois dele, o foco termina no campo declarado', async () => {
    render(
      <>
        <Janela aberto />
        {/* O "ladrão": o campo de código de produto, montado junto na etapa 1. */}
        <input aria-label="Ladrão" autoFocus />
      </>,
    );

    await waitFor(() => {
      expect(screen.getByLabelText('Busca')).toHaveFocus();
    });
  });

  it('ao fechar, o foco volta ao elemento que o detinha antes (comportamento preservado)', async () => {
    const { rerender } = render(
      <>
        <input aria-label="Fora" />
        <Janela aberto={false} />
      </>,
    );
    screen.getByLabelText('Fora').focus();

    rerender(
      <>
        <input aria-label="Fora" />
        <Janela aberto />
      </>,
    );
    await waitFor(() => {
      expect(screen.getByLabelText('Busca')).toHaveFocus();
    });

    rerender(
      <>
        <input aria-label="Fora" />
        <Janela aberto={false} />
      </>,
    );

    await waitFor(() => {
      expect(screen.getByLabelText('Fora')).toHaveFocus();
    });
  });
});

describe('haJanelaAberta', () => {
  it('acompanha a pilha: verdadeiro com a janela aberta, falso depois de fechar', () => {
    const { rerender } = render(<Janela aberto={false} />);
    expect(haJanelaAberta()).toBe(false);

    rerender(<Janela aberto />);
    expect(haJanelaAberta()).toBe(true);

    rerender(<Janela aberto={false} />);
    expect(haJanelaAberta()).toBe(false);
  });
});
