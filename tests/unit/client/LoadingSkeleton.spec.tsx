import { render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';
// Mesmo import de efeito colateral do entry (`src/client/main.tsx`): sem ele o
// `<Skeleton name="pdv-venda">` não acha a geometria capturada.
import '../../../src/client/bones/registry';
import { LoadingSkeleton } from '../../../src/client/features/session-bootstrap/LoadingSkeleton';

/**
 * Tela de carregamento do bootstrap (T025, AUTH-05 / FR-004).
 *
 * O `<Skeleton>` do Boneyard só desenha o shimmer quando existem bones
 * registrados para o `name`; sem o registry gerado por `npm run bones`, ele cai
 * silenciosamente no `fallback` estático — visualmente parecido, mas sem
 * animação nenhuma.
 */

/** jsdom não implementa `ResizeObserver`, observado pelo `<Skeleton>`. */
class ResizeObserverStub implements ResizeObserver {
  observe(): void {
    /* sem medição: o componente cai em `window.innerWidth` */
  }
  unobserve(): void {
    /* nada a fazer */
  }
  disconnect(): void {
    /* nada a fazer */
  }
}

/** jsdom também não implementa `matchMedia`, usado na detecção de tema escuro. */
function criarMatchMediaStub(query: string): MediaQueryList {
  const nada = (): void => {
    /* nada a fazer */
  };

  return {
    matches: false,
    media: query,
    onchange: null,
    addListener: nada,
    removeListener: nada,
    addEventListener: nada,
    removeEventListener: nada,
    dispatchEvent: () => false,
  };
}

beforeAll(() => {
  // Atribuição direta no `window`: sob o vitest o `window` do jsdom não é o
  // mesmo objeto que `globalThis`, então `vi.stubGlobal` não alcança o que o
  // Boneyard enxerga.
  window.ResizeObserver = ResizeObserverStub;
  window.matchMedia = criarMatchMediaStub;
});

describe('LoadingSkeleton', () => {
  it('anuncia o carregamento a leitores de tela', () => {
    render(<LoadingSkeleton />);

    expect(screen.getByTestId('skeleton-carregamento')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('Carregando a configuração do ponto de venda…')).toBeInTheDocument();
  });

  it('desenha o shimmer do Boneyard, não apenas o fallback estático', () => {
    const { container } = render(<LoadingSkeleton />);

    expect(container.querySelector('[data-boneyard="pdv-venda"]')).not.toBeNull();

    // O overlay só é montado quando o Boneyard resolveu bones para este nome
    // (`showSkeleton === true` em `boneyard-js/react`).
    const overlay = container.querySelector('[data-boneyard-overlay="true"]');
    expect(overlay).not.toBeNull();
    expect(overlay?.querySelectorAll('[data-boneyard-bone="true"]').length).toBeGreaterThan(0);
  });
});
