import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  preservarSelecaoNoProximoFoco,
  selecionarConteudoAoFocar,
} from '../../../../src/client/lib/selecionarConteudoAoFocar';

/**
 * Pedido do usuário, 2026-09-24: chegar a um campo seleciona o conteúdo
 * inteiro, e a primeira tecla digitada substitui o que estava lá — "como se eu
 * tivesse dado 3 cliques no campo".
 */
describe('selecionarConteudoAoFocar', () => {
  let desinstalar: () => void;

  function campoCom(valor: string, ajuste?: (campo: HTMLInputElement) => void): HTMLInputElement {
    const campo = document.createElement('input');
    campo.value = valor;
    ajuste?.(campo);
    document.body.append(campo);
    return campo;
  }

  function selecao(campo: HTMLInputElement): [number | null, number | null] {
    return [campo.selectionStart, campo.selectionEnd];
  }

  beforeEach(() => {
    vi.useFakeTimers();
    desinstalar = selecionarConteudoAoFocar();
  });

  afterEach(() => {
    desinstalar();
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it('seleciona tudo ao chegar ao campo', () => {
    const campo = campoCom('1,000');
    campo.focus();
    campo.setSelectionRange(5, 5);

    vi.runAllTimers();

    expect(selecao(campo)).toEqual([0, 5]);
  });

  it('campo somente leitura não é selecionado', () => {
    const campo = campoCom('12,00', (c) => {
      c.readOnly = true;
    });
    campo.focus();
    campo.setSelectionRange(0, 0);

    vi.runAllTimers();

    expect(selecao(campo)).toEqual([0, 0]);
  });

  it('o foco que já saiu do campo não é selecionado', () => {
    const primeiro = campoCom('abc');
    const segundo = campoCom('def');
    primeiro.focus();
    primeiro.setSelectionRange(3, 3);
    segundo.focus();

    vi.runAllTimers();

    expect(selecao(primeiro)).toEqual([3, 3]);
    expect(selecao(segundo)).toEqual([0, 3]);
  });

  it('o foco preservado mantém o cursor, e só uma vez', () => {
    const campo = campoCom('789');
    preservarSelecaoNoProximoFoco(campo);
    campo.focus();
    campo.setSelectionRange(2, 2);
    vi.runAllTimers();
    expect(selecao(campo)).toEqual([2, 2]);

    campo.blur();
    campo.focus();
    vi.runAllTimers();
    expect(selecao(campo)).toEqual([0, 3]);
  });

  it('só o mouseup do clique que trouxe o foco é engolido', () => {
    const campo = campoCom('50,00');
    campo.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    campo.focus();
    const soltarDoFoco = new MouseEvent('mouseup', { bubbles: true, cancelable: true });
    campo.dispatchEvent(soltarDoFoco);
    expect(soltarDoFoco.defaultPrevented).toBe(true);

    const soltarSeguinte = new MouseEvent('mouseup', { bubbles: true, cancelable: true });
    campo.dispatchEvent(soltarSeguinte);
    expect(soltarSeguinte.defaultPrevented).toBe(false);
  });

  it('foco por teclado não engole o clique seguinte', () => {
    const campo = campoCom('50,00');
    campo.focus();

    const soltar = new MouseEvent('mouseup', { bubbles: true, cancelable: true });
    campo.dispatchEvent(soltar);

    expect(soltar.defaultPrevented).toBe(false);
  });
});
