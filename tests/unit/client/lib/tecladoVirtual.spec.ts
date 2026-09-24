import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ehCampoDeDigitacao,
  fecharTecladoVirtual,
  focarSemTeclado,
  instalarFechamentoDoTecladoAoTocarFora,
} from '../../../../src/client/lib/tecladoVirtual';

/**
 * Pedido do usuário, 2026-09-24, em Android e iPhone: o teclado virtual
 * precisa fechar quando o Enter leva a um botão, quando o operador toca fora
 * do campo e quando o wizard troca de etapa.
 *
 * Não há teclado no jsdom: o que estes casos travam é o gesto que o fecha nos
 * dois navegadores — tirar o foco do campo de digitação.
 */

function toque(alvo: Element, tipo: 'pointerdown' | 'pointerup', x = 0, y = 0): void {
  // O jsdom não tem `PointerEvent`: um `MouseEvent` com os campos que o
  // instalador lê reproduz o contrato.
  const evento = new MouseEvent(tipo, { bubbles: true, clientX: x, clientY: y });
  Object.assign(evento, { pointerType: 'touch', pointerId: 1 });
  alvo.dispatchEvent(evento);
}

describe('ehCampoDeDigitacao', () => {
  it('campo de texto abre teclado; bloqueado, botão e data não', () => {
    const texto = document.createElement('input');
    const somenteLeitura = document.createElement('input');
    somenteLeitura.readOnly = true;
    const data = document.createElement('input');
    data.type = 'date';

    expect(ehCampoDeDigitacao(texto)).toBe(true);
    expect(ehCampoDeDigitacao(somenteLeitura)).toBe(false);
    expect(ehCampoDeDigitacao(data)).toBe(false);
    expect(ehCampoDeDigitacao(document.createElement('button'))).toBe(false);
  });
});

describe('fechamento do teclado', () => {
  let campo: HTMLInputElement;
  let botao: HTMLButtonElement;
  let desinstalar: () => void;

  beforeEach(() => {
    const rotulo = document.createElement('label');
    campo = document.createElement('input');
    const simbolo = document.createElement('span');
    simbolo.textContent = 'R$';
    rotulo.append(simbolo, campo);
    botao = document.createElement('button');
    document.body.append(rotulo, botao);
    desinstalar = instalarFechamentoDoTecladoAoTocarFora();
    campo.focus();
  });

  afterEach(() => {
    desinstalar();
    document.body.replaceChildren();
  });

  it('fecharTecladoVirtual tira o foco do campo', () => {
    fecharTecladoVirtual();
    expect(campo).not.toHaveFocus();
  });

  it('focarSemTeclado fecha mesmo quando o destino não existe', () => {
    focarSemTeclado(null);
    expect(campo).not.toHaveFocus();
  });

  it('focarSemTeclado leva o foco ao botão', () => {
    focarSemTeclado(botao);
    expect(botao).toHaveFocus();
  });

  it('tocar num botão fecha o teclado', () => {
    toque(botao, 'pointerdown');
    toque(botao, 'pointerup');
    expect(campo).not.toHaveFocus();
  });

  it('tocar no rótulo do campo não fecha', () => {
    const simbolo = document.querySelector('span');
    if (simbolo === null) {
      throw new Error('símbolo não montado');
    }
    toque(simbolo, 'pointerdown');
    toque(simbolo, 'pointerup');
    expect(campo).toHaveFocus();
  });

  it('arrastar para rolar não fecha', () => {
    toque(botao, 'pointerdown', 0, 0);
    toque(botao, 'pointerup', 0, 40);
    expect(campo).toHaveFocus();
  });

  it('clique de mouse fica com o comportamento do navegador', () => {
    botao.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    botao.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
    expect(campo).toHaveFocus();
  });
});
