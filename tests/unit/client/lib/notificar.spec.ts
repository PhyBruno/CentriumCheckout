import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notificar } from '../../../../src/client/lib/notificar';
import { ATRIBUTO_ROLAGEM_DE_NOTIFICACAO } from '../../../../src/client/layout/rolarParaOTopo';

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

/**
 * 390px é o iPhone de referência do wizard; 1440px, o caixa de balcão.
 *
 * Era 1280px até 2026-09-09. Continuaria valendo como desktop pelo critério
 * final (AD-198: 1280 com mouse é desktop), mas 1440 deixa a intenção explícita
 * e sobrevive a qualquer ajuste futuro do piso de 1024px.
 */
const LARGURA_MOBILE = 390;
const LARGURA_DESKTOP = 1440;

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

/**
 * Desktop estreito (correção do usuário, 2026-09-24: "a notificação tem que se
 * adequar ao tamanho da tela"). O layout de desktop vale a partir de 1024px, e
 * o título do goey é uma linha que não quebra: uma frase mais larga que a
 * janela passava da borda. Nesse caso ela desce para o corpo que quebra linha.
 */
describe('notificar no desktop estreito', () => {
  const FRASE_MAIOR_QUE_A_JANELA =
    'Não foi possível validar a NFCe: o ERP recusou a venda porque a forma de pagamento escolhida não está liberada para esta condição, revise o pagamento.';

  beforeEach(() => {
    definirLargura(1024);
  });

  it('frase que não cabe numa linha desce para `description`, sem tremer', () => {
    notificar.erro(FRASE_MAIOR_QUE_A_JANELA);

    const { titulo, opcoes } = ultimaChamada();
    expect(titulo).toBe('Erro');
    expect((opcoes as OpcoesDoToast).description).toBe(FRASE_MAIOR_QUE_A_JANELA);
    expect((opcoes as OpcoesDoToast).classNames?.description).toBe(
      'cc-toast-frase cc-toast-frase-erro',
    );
    // A tremida é do compacto: no desktop o operador está olhando a tela.
    expect((opcoes as OpcoesDoToast).classNames?.wrapper).toBeUndefined();
  });

  it('frase que cabe continua sendo o título, como sempre', () => {
    notificar.erro(FRASE_LONGA);

    expect(ultimaChamada()).toEqual({ tipo: 'error', titulo: FRASE_LONGA, opcoes: undefined });
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

/**
 * A tela volta ao topo junto com o toast (pedido do usuário, 2026-09-15: "quando
 * há notificação, e a tela está scrollada pra baixo, o scroll não é jogado pra
 * cima, deveria, pois é a única forma de o usuário ver a notificação").
 *
 * O toast é `position: fixed`, mas fixo contra a *layout* viewport: com o
 * teclado virtual aberto o Chrome/Android desloca a *visual* viewport por dentro
 * dela, e o canto onde o toast nasce sai do enquadramento visível. Ver
 * `layout/rolarParaOTopo.ts`.
 *
 * **O `scrollTop` é instrumentado, não medido.** O jsdom não tem layout: o
 * setter nativo de `scrollTop` é no-op e o getter devolve 0 sempre, então um
 * `coluna.scrollTop = 300` de preparação nunca "desceria" a coluna e o caso
 * passaria por acidente. O par get/set próprio registra a escrita que a função
 * de fato faz, que é o comportamento em jogo.
 */
describe('notificar — rolagem da tela', () => {
  function colunaRolada(px: number): { readonly elemento: HTMLElement; posicao(): number } {
    const elemento = document.createElement('div');
    elemento.setAttribute(ATRIBUTO_ROLAGEM_DE_NOTIFICACAO, '');
    document.body.append(elemento);

    let posicao = px;
    Object.defineProperty(elemento, 'scrollTop', {
      configurable: true,
      get: () => posicao,
      set: (novo: number) => {
        posicao = novo;
      },
    });

    return { elemento, posicao: () => posicao };
  }

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('no mobile, traz a coluna marcada de volta ao topo', () => {
    definirLargura(LARGURA_MOBILE);
    const coluna = colunaRolada(300);

    notificar.erro(FRASE_LONGA);

    expect(coluna.posicao()).toBe(0);
  });

  it('no desktop, não mexe em quem já está no lugar certo', () => {
    // Lá a tela de venda ocupa a janela inteira sem rolagem de página, e o toast
    // largo aparece inteiro no canto: rolar seria efeito colateral sem causa.
    definirLargura(LARGURA_DESKTOP);
    const coluna = colunaRolada(300);

    notificar.erro(FRASE_LONGA);

    expect(coluna.posicao()).toBe(300);
  });

  it('desliza em vez de saltar quando o navegador oferece `scrollTo`', () => {
    // Correção do usuário, 2026-09-15: *"a notificação não tá suave, parece meio
    // lagada"*. Um `scrollTop = 0` cru move a tela inteira num quadro só, no
    // mesmo instante em que o toast entra — dois movimentos brutos somados. O
    // jsdom não implementa `scrollTo`, então o duplo é o único jeito de provar
    // qual caminho o código escolhe quando ele existe.
    definirLargura(LARGURA_MOBILE);
    const coluna = colunaRolada(300);
    const pedidos: unknown[] = [];
    Object.defineProperty(coluna.elemento, 'scrollTo', {
      configurable: true,
      value: (opcoes: unknown) => pedidos.push(opcoes),
    });

    notificar.erro(FRASE_LONGA);

    expect(pedidos).toEqual([{ top: 0, behavior: 'smooth' }]);
    // E sem escrever `scrollTop` por cima: as duas rolagens juntas brigariam,
    // uma cancelando a animação da outra.
    expect(coluna.posicao()).toBe(300);
  });

  it('não alcança container nenhum que não tenha se declarado', () => {
    // `ListaPagamentosAplicados` rola para o **fim** ao aplicar uma forma. Se a
    // varredura fosse por "qualquer coisa rolada", um aviso qualquer desfaria
    // esse posicionamento.
    definirLargura(LARGURA_MOBILE);
    const outro = document.createElement('div');
    document.body.append(outro);
    let posicao = 300;
    Object.defineProperty(outro, 'scrollTop', {
      configurable: true,
      get: () => posicao,
      set: (novo: number) => {
        posicao = novo;
      },
    });

    notificar.aviso('Forma de pagamento aplicada.');

    expect(posicao).toBe(300);
  });
});
