import { render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
// Mesmo import de efeito colateral do entry (`src/client/main.tsx`): sem ele o
// `<Skeleton name="pdv-venda">` do desktop não acha a geometria capturada.
import '../../../../src/client/bones/registry';
import { TelaDeCarregamento } from '../../../../src/client/layout/TelaDeCarregamento';
import { CONSULTA_LAYOUT_COMPACTO } from '../../../../src/client/layout/useIsMobile';

/**
 * A tela de carregamento do bootstrap segue o layout (achado em 2026-09-15).
 *
 * O celular recebia a tela única do desktop — colunas de largura fixa e a
 * lateral de 392px —, e a página se alargava para 956px num aparelho de 412px:
 * a cada recarga o operador via uma miniatura do desktop e depois um pulo para o
 * wizard.
 */

/** jsdom não implementa `ResizeObserver`, observado pelo `<Skeleton>`. */
class ResizeObserverStub implements ResizeObserver {
  observe(): void {
    /* nada a medir */
  }
  unobserve(): void {
    /* nada a fazer */
  }
  disconnect(): void {
    /* nada a fazer */
  }
}

/** `matchMedia` que responde `compacto` só à consulta do layout compacto. */
function usarLayout(compacto: boolean): void {
  const nada = (): void => {
    /* nada a fazer */
  };

  window.matchMedia = (query: string): MediaQueryList => ({
    matches: compacto && query === CONSULTA_LAYOUT_COMPACTO,
    media: query,
    onchange: null,
    addListener: nada,
    removeListener: nada,
    addEventListener: nada,
    removeEventListener: nada,
    dispatchEvent: () => false,
  });
}

beforeAll(() => {
  window.ResizeObserver = ResizeObserverStub;
});

afterEach(() => {
  usarLayout(false);
});

describe('TelaDeCarregamento', () => {
  it('no compacto, desenha o esqueleto do wizard e não a tela única', () => {
    usarLayout(true);
    const { container } = render(<TelaDeCarregamento />);

    expect(screen.getByTestId('skeleton-compacto')).toBeInTheDocument();
    expect(container.querySelector('[data-boneyard="pdv-venda"]')).toBeNull();
  });

  it('no compacto, anuncia o carregamento a leitores de tela como no desktop', () => {
    usarLayout(true);
    render(<TelaDeCarregamento />);

    expect(screen.getByTestId('skeleton-carregamento')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('Carregando a configuração do ponto de venda…')).toBeInTheDocument();
  });

  it('no desktop, mantém a tela única com o shimmer do Boneyard', () => {
    usarLayout(false);
    const { container } = render(<TelaDeCarregamento />);

    expect(screen.queryByTestId('skeleton-compacto')).toBeNull();
    expect(container.querySelector('[data-boneyard="pdv-venda"]')).not.toBeNull();
  });
});
