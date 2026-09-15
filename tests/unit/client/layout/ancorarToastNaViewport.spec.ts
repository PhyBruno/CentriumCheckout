import { afterEach, describe, expect, it } from 'vitest';
import { ancorarToastNaViewport } from '../../../../src/client/layout/ancorarToastNaViewport';

/**
 * Correção do usuário, 2026-09-15: *"parece que quando é warning, não está
 * fazendo o scroll up para mostrar a notificação"*.
 *
 * O sintoma era um só — a frase que não aparece —, mas a causa não é a rolagem
 * da coluna: o toast é `position: fixed` e obedece à *layout* viewport, enquanto
 * o teclado virtual do Android desliza a *visual* viewport por dentro dela. Com
 * um modal aberto, ou com o teclado subindo, não há coluna que rolar e nenhuma
 * quantidade de `scrollTop` traz o toast de volta.
 *
 * Estes casos travam a ancoragem em si: quem se move é o toast, pela distância
 * que a visual viewport desceu.
 */

/**
 * `window.visualViewport` falso — um `EventTarget` com `offsetTop` gravável.
 *
 * O jsdom não implementa a API, e não há como "abrir o teclado" num teste: o que
 * este duplo reproduz é exatamente o contrato que o código consome — um alvo de
 * eventos que anuncia `resize`/`scroll` e um deslocamento para ler.
 */
class ViewportFalsa extends EventTarget {
  offsetTop = 0;

  deslocar(px: number): void {
    this.offsetTop = px;
    this.dispatchEvent(new Event('resize'));
  }
}

function instalarViewport(): ViewportFalsa {
  const viewport = new ViewportFalsa();
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
  return viewport;
}

function montarToaster(): HTMLElement {
  const toaster = document.createElement('div');
  toaster.setAttribute('data-sonner-toaster', '');
  document.body.append(toaster);
  return toaster;
}

afterEach(() => {
  document.body.innerHTML = '';
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: undefined });
});

describe('ancorarToastNaViewport', () => {
  it('empurra o toast pela distância que a visual viewport desceu', () => {
    const viewport = instalarViewport();
    const toaster = montarToaster();

    ancorarToastNaViewport();
    // O teclado virtual sobe: a faixa visível começa 260px abaixo do topo da
    // layout viewport, e é ali que o toast precisa nascer.
    viewport.deslocar(260);

    expect(toaster.style.translate).toBe('0px 260px');
  });

  it('volta o toast ao lugar quando a visual viewport se realinha', () => {
    const viewport = instalarViewport();
    const toaster = montarToaster();

    ancorarToastNaViewport();
    viewport.deslocar(260);
    // Teclado fechado: as duas viewports coincidem de novo, e um deslocamento
    // residual deixaria o toast pendurado no meio da tela.
    viewport.deslocar(0);

    expect(toaster.style.translate).toBe('0px 0px');
  });

  it('alcança o toaster que só é montado depois da instalação', () => {
    // A ancoragem roda no `main.tsx`, antes do primeiro render; o container do
    // sonner nasce com a árvore React. Resolver o elemento na instalação
    // guardaria um `null` para sempre.
    const viewport = instalarViewport();
    ancorarToastNaViewport();

    const toaster = montarToaster();
    viewport.deslocar(120);

    expect(toaster.style.translate).toBe('0px 120px');
  });

  it('para de reposicionar depois da limpeza', () => {
    const viewport = instalarViewport();
    const toaster = montarToaster();

    const limpar = ancorarToastNaViewport();
    viewport.deslocar(100);
    limpar();
    viewport.deslocar(300);

    expect(toaster.style.translate).toBe('0px 100px');
  });

  it('sem `visualViewport`, não quebra e ainda devolve a limpeza', () => {
    // Navegador antigo — e o próprio jsdom. Um `main.tsx` que explodisse aqui
    // levaria a aplicação inteira junto por causa de um detalhe de toast.
    const toaster = montarToaster();

    expect(() => {
      ancorarToastNaViewport()();
    }).not.toThrow();
    expect(toaster.style.translate).toBe('');
  });
});
