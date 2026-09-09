import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notificar } from '../../../../src/client/lib/notificar';

/**
 * A apresentação do toast por layout (AD-195).
 *
 * O que este arquivo trava é o **desvio** entre desktop e mobile, porque é o
 * desvio que se perde numa refatoração distraída: um `emitir` unificado "para
 * simplificar" reintroduziria em um dos dois lados o defeito que o outro
 * corrigiu — a pílula branca só com ícone no compacto, ou o rótulo genérico
 * "Erro" ocupando o toast largo do desktop no lugar da frase.
 *
 * Os casos conferem a **chamada à biblioteca**, não pixel: a regra é sobre qual
 * campo da API do `goey-toast` recebe a frase, e é aí que ela quebra. O
 * comportamento visual que decorre disso (recorte de 34px, altura animada) é do
 * pacote, e testá-lo aqui seria testar o pacote.
 */

const { chamadas } = vi.hoisted(() => ({
  chamadas: [] as { readonly tipo: string; readonly titulo: string; readonly opcoes?: unknown }[],
}));

vi.mock('goey-toast', () => {
  const registrar =
    (tipo: string) =>
    (titulo: string, opcoes?: unknown): number =>
      chamadas.push({ tipo, titulo, opcoes });

  return {
    gooeyToast: {
      error: registrar('error'),
      warning: registrar('warning'),
      success: registrar('success'),
    },
  };
});

/**
 * `obterPlataforma` lê `window.innerWidth`, e o jsdom fixa 1024 sem deixar
 * atribuir por cima — daí o `defineProperty` em vez de `window.innerWidth = n`.
 * Restaurado a cada caso para não vazar a largura de um teste para o seguinte.
 */
const larguraOriginal = window.innerWidth;

function definirLargura(px: number): void {
  Object.defineProperty(window, 'innerWidth', { value: px, configurable: true, writable: true });
}

/** 390px é o iPhone de referência do wizard; 1280px, o caixa de balcão. */
const LARGURA_MOBILE = 390;
const LARGURA_DESKTOP = 1280;

const FRASE_LONGA =
  'Insira ao menos um produto na venda antes de escolher a condição de pagamento.';

interface OpcoesDoToast {
  readonly description?: unknown;
  readonly classNames?: { readonly wrapper?: string; readonly description?: string };
}

function ultimaChamada(): {
  readonly tipo: string;
  readonly titulo: string;
  readonly opcoes?: unknown;
} {
  const chamada = chamadas.at(-1);
  if (chamada === undefined) {
    throw new Error('nenhum toast foi emitido');
  }
  return chamada;
}

beforeEach(() => {
  chamadas.length = 0;
});

afterEach(() => {
  definirLargura(larguraOriginal);
});

describe('notificar no desktop (como era antes do wizard)', () => {
  beforeEach(() => {
    definirLargura(LARGURA_DESKTOP);
  });

  it('põe a frase no título e não manda opção nenhuma', () => {
    notificar.erro(FRASE_LONGA);

    expect(ultimaChamada()).toEqual({ tipo: 'error', titulo: FRASE_LONGA, opcoes: undefined });
  });

  it('não usa o rótulo genérico do tipo em lugar nenhum', () => {
    notificar.aviso('Cliente sem convênio.');
    notificar.sucesso('Venda suspensa.');

    // "Atenção"/"Pronto" pertencem ao compacto: no desktop eles roubariam a
    // linha que a frase inteira ocupa desde sempre.
    expect(chamadas.map((chamada) => chamada.titulo)).toEqual([
      'Cliente sem convênio.',
      'Venda suspensa.',
    ]);
  });
});

describe('notificar no mobile (frase em `description`, com tremida)', () => {
  beforeEach(() => {
    definirLargura(LARGURA_MOBILE);
  });

  it('desce a frase para `description` e deixa o rótulo curto no título', () => {
    notificar.erro(FRASE_LONGA);

    const { tipo, titulo, opcoes } = ultimaChamada();
    expect(tipo).toBe('error');
    expect(titulo).toBe('Erro');
    expect((opcoes as OpcoesDoToast).description).toBe(FRASE_LONGA);
  });

  it('pinta a frase com a cor do tipo, que o corpo expandido do pacote não dá', () => {
    notificar.aviso('Desconto acima do permitido.');

    expect((ultimaChamada().opcoes as OpcoesDoToast).classNames?.description).toBe(
      'cc-toast-frase cc-toast-frase-aviso',
    );
  });

  it('sacode o toast de erro e o de aviso', () => {
    notificar.erro('Não foi possível faturar.');
    notificar.aviso('Item sem estoque.');

    const wrappers = chamadas.map(
      (chamada) => (chamada.opcoes as OpcoesDoToast).classNames?.wrapper,
    );
    expect(wrappers).toEqual(['cc-toast-tremida', 'cc-toast-tremida']);
  });

  it('não sacode o de sucesso — tremer é o gesto de "não"', () => {
    notificar.sucesso('Venda finalizada.');

    expect((ultimaChamada().opcoes as OpcoesDoToast).classNames?.wrapper).toBeUndefined();
  });
});
