import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement, useState, type ReactElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  ComboboxPagamento,
  SeletorCondicaoPagamento,
  SeletorFormaPagamento,
  type OpcaoCombobox,
} from '../../../../src/client/features/pagamento/SeletorCondicaoForma';
import type {
  CondicaoPagamento,
  FormaPagamento,
} from '../../../../src/client/domain/pagamento/formaPagamento';
import { centavos } from '../../../../src/client/domain/precificacao/dinheiro';
import { useVendaStore } from '../../../../src/client/stores/vendaStore';
import { linhaDe } from '../../../support/precificacao';

/**
 * Navegação por setas nos comboboxes de pagamento — pedido do usuário
 * (2026-09-04): com o foco no controle **fechado**, `ArrowDown`/`ArrowUp` mudam
 * a escolha sem abrir a lista, para o caixa percorrer condição e forma no ritmo
 * do teclado.
 *
 * As regras exercitadas aqui são as do TSDoc de `navegarPorSeta`: sem nada
 * escolhido só desce; com algo escolhido anda nos dois sentidos; as pontas não
 * circulam; opção bloqueada é pulada; combobox bloqueado e lista aberta ignoram
 * a tecla.
 *
 * Os testes de 1 a 7 exercitam `ComboboxPagamento` direto, que é onde o
 * comportamento mora e de onde os dois seletores o herdam. Os dois últimos
 * provam a fiação de cada seletor — o do store (condição) e o de props (forma).
 */

function opcao(parcial: Partial<OpcaoCombobox> & { chave: string }): OpcaoCombobox {
  return {
    texto: parcial.chave,
    selecionada: false,
    bloqueio: null,
    aoEscolher: () => {
      /* substituído pelo harness */
    },
    ...parcial,
  };
}

interface HarnessProps {
  readonly chaves: readonly { readonly chave: string; readonly bloqueio: string | null }[];
  readonly bloqueio?: string | null;
  readonly aoEscolher: (chave: string) => void;
}

/**
 * `selecionada` é prop, não estado interno do combobox: quem escolhe é o dono
 * das opções. O harness reproduz esse contrato para que a segunda seta ande a
 * partir do que a primeira escolheu, como acontece em produção.
 */
function Harness({ chaves, bloqueio = null, aoEscolher }: HarnessProps): ReactElement {
  const [escolhida, setEscolhida] = useState<string | null>(null);

  return createElement(ComboboxPagamento, {
    rotulo: 'Condição de pagamento',
    icone: null,
    textoSelecionado: escolhida,
    placeholder: 'Selecione a condição',
    bloqueio,
    testId: 'combobox-teste',
    idOpcao: (chave: string) => `opcao-${chave}`,
    opcoes: chaves.map(({ chave, bloqueio: bloqueioOpcao }) =>
      opcao({
        chave,
        bloqueio: bloqueioOpcao,
        selecionada: chave === escolhida,
        aoEscolher: () => {
          setEscolhida(chave);
          aoEscolher(chave);
        },
      }),
    ),
  });
}

function renderHarness(props: HarnessProps): void {
  render(createElement(Harness, props));
  screen.getByTestId('combobox-teste').focus();
}

const TRES_LIVRES = [
  { chave: 'A', bloqueio: null },
  { chave: 'B', bloqueio: null },
  { chave: 'C', bloqueio: null },
];

describe('ComboboxPagamento — navegação por setas (pedido do usuário, 2026-09-04)', () => {
  it('ArrowDown sem nada escolhido pega a primeira opção e não abre a lista', async () => {
    const usuario = userEvent.setup();
    const aoEscolher = vi.fn();
    renderHarness({ chaves: TRES_LIVRES, aoEscolher });

    await usuario.keyboard('{ArrowDown}');

    expect(aoEscolher).toHaveBeenCalledExactlyOnceWith('A');
    expect(screen.getByTestId('combobox-teste')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('combobox-teste-lista')).not.toBeInTheDocument();
  });

  it('ArrowUp sem nada escolhido não escolhe nada — não existe anterior à primeira', async () => {
    const usuario = userEvent.setup();
    const aoEscolher = vi.fn();
    renderHarness({ chaves: TRES_LIVRES, aoEscolher });

    await usuario.keyboard('{ArrowUp}');

    expect(aoEscolher).not.toHaveBeenCalled();
    expect(screen.getByTestId('combobox-teste')).toHaveTextContent('Selecione a condição');
  });

  it('com algo escolhido, anda um passo em cada sentido', async () => {
    const usuario = userEvent.setup();
    const aoEscolher = vi.fn();
    renderHarness({ chaves: TRES_LIVRES, aoEscolher });

    await usuario.keyboard('{ArrowDown}{ArrowDown}');
    expect(screen.getByTestId('combobox-teste')).toHaveTextContent('B');

    await usuario.keyboard('{ArrowUp}');
    expect(screen.getByTestId('combobox-teste')).toHaveTextContent('A');
    expect(aoEscolher.mock.calls.map(([chave]) => chave)).toEqual(['A', 'B', 'A']);
  });

  it('não circula nas pontas: a escolha das extremidades permanece', async () => {
    const usuario = userEvent.setup();
    const aoEscolher = vi.fn();
    renderHarness({ chaves: TRES_LIVRES, aoEscolher });

    // Desce até o fim e insiste: a última continua escolhida, sem voltar ao topo.
    await usuario.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}');
    expect(screen.getByTestId('combobox-teste')).toHaveTextContent('C');

    // Sobe até o começo e insiste: a primeira continua escolhida.
    await usuario.keyboard('{ArrowUp}{ArrowUp}{ArrowUp}{ArrowUp}');
    expect(screen.getByTestId('combobox-teste')).toHaveTextContent('A');
  });

  it('pula a opção bloqueada em vez de parar nela', async () => {
    const usuario = userEvent.setup();
    const aoEscolher = vi.fn();
    renderHarness({
      chaves: [
        { chave: 'A', bloqueio: null },
        { chave: 'B', bloqueio: 'Indisponível neste ponto de venda.' },
        { chave: 'C', bloqueio: null },
      ],
      aoEscolher,
    });

    await usuario.keyboard('{ArrowDown}{ArrowDown}');

    expect(aoEscolher.mock.calls.map(([chave]) => chave)).toEqual(['A', 'C']);
    expect(screen.getByTestId('combobox-teste')).toHaveTextContent('C');
  });

  it('combobox bloqueado ignora as setas', async () => {
    const usuario = userEvent.setup();
    const aoEscolher = vi.fn();
    renderHarness({
      chaves: TRES_LIVRES,
      bloqueio: 'Aguarde: o catálogo ainda está carregando.',
      aoEscolher,
    });

    await usuario.keyboard('{ArrowDown}{ArrowUp}');

    expect(aoEscolher).not.toHaveBeenCalled();
  });

  it('com a lista aberta as setas não mexem na escolha', async () => {
    const usuario = userEvent.setup();
    const aoEscolher = vi.fn();
    renderHarness({ chaves: TRES_LIVRES, aoEscolher });

    await usuario.click(screen.getByTestId('combobox-teste'));
    expect(screen.getByTestId('combobox-teste-lista')).toBeInTheDocument();

    await usuario.keyboard('{ArrowDown}');

    expect(aoEscolher).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ *
 * Fiação dos dois seletores reais
 * ------------------------------------------------------------------ */

const DINHEIRO: FormaPagamento = {
  codigo: 1,
  descricao: 'DINHEIRO',
  entrada: 'S',
  meioPagtoNFe: 'Dinheiro',
  integracaoCartao: '',
  tipoTransacaoTEF: '',
  fpgUtiCar: '',
};

const PIX: FormaPagamento = {
  codigo: 3,
  descricao: 'PIX',
  entrada: 'S',
  meioPagtoNFe: 'Pix',
  integracaoCartao: '',
  tipoTransacaoTEF: '',
  fpgUtiCar: '',
};

const A_VISTA: CondicaoPagamento = {
  codigo: 1,
  descricao: 'A VISTA',
  prazo: 0,
  minimoEntrada: centavos(0),
  desconto: 0,
  descontoMaximo: 0,
  formas: [DINHEIRO, PIX],
};

const A_PRAZO: CondicaoPagamento = {
  codigo: 2,
  descricao: 'A PRAZO',
  prazo: 30,
  minimoEntrada: centavos(0),
  desconto: 0,
  descontoMaximo: 0,
  formas: [DINHEIRO],
};

/**
 * O catálogo chega embutido em `SessaoUsuario` de `GET /api/bootstrap` — não há
 * endpoint dedicado (AD-097). `UtilizaCentriumPAG: false` deixa o PIX
 * indisponível, que é o que prova o "pula a opção bloqueada" no seletor real.
 */
function payloadBootstrap(): unknown {
  return {
    SessaoUsuario: {
      CondicoesDePagamento: [A_VISTA, A_PRAZO].map((condicao) => ({
        CondicaoCodigo: condicao.codigo,
        CondicaoDescricao: condicao.descricao,
        CondicaoPrazo: condicao.prazo,
        CondicaoMinimoEntrada: 0,
        CondicaoDesconto: 0,
        CondicaoDescontoMaximo: 0,
        CondicaoFormasDePagamento: condicao.formas.map((forma) => ({
          FormaCodigo: forma.codigo,
          FormaDescricao: forma.descricao,
          FormaEntrada: forma.entrada,
          FormaMeioPagtoNFe: forma.meioPagtoNFe,
          FormaIntegracaoCartao: forma.integracaoCartao,
          FormaTipoTransacaoTEF: forma.tipoTransacaoTEF,
          FormaFpgUtiCar: forma.fpgUtiCar,
        })),
      })),
      ConfiguracoesTEF: { TEFAtivo: false },
      ConfiguracoesPIX: { UtilizaCentriumPAG: false, MinimoPix: 0, TempoEspera: 10 },
    },
  };
}

function envolverComQueryClient(no: ReactElement): ReactNode {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: queryClient }, no);
}

describe('Seletores de pagamento — setas ligadas ao catálogo real', () => {
  beforeEach(() => {
    // Uma linha no carrinho é pré-requisito do combobox de condição desde
    // 2026-09-04: com subtotal 0,00 ele fica bloqueado, porque não há venda a
    // cobrar. Os testes daqui exercitam a navegação, não essa guarda.
    useVendaStore.setState({
      condicaoSelecionada: null,
      pagamentos: [],
      linhas: [linhaDe({ precoUnitario: 1_000, quantidadeEmUnidades: 1 })],
    });
    useVendaStore.getState().resetarAuditoria('NOVA');
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve(payloadBootstrap()),
          }) as unknown as Promise<Response>,
      ),
    );
  });

  it('condição: ArrowDown escolhe a primeira condição do catálogo e grava no store', async () => {
    const usuario = userEvent.setup();
    render(envolverComQueryClient(createElement(SeletorCondicaoPagamento)));

    // O combobox só sai do bloqueio depois que o catálogo chega.
    await waitFor(() => {
      expect(screen.getByTestId('combobox-condicao-pagamento')).not.toHaveAttribute(
        'aria-disabled',
        'true',
      );
    });

    screen.getByTestId('combobox-condicao-pagamento').focus();
    await usuario.keyboard('{ArrowDown}');

    expect(useVendaStore.getState().condicaoSelecionada?.descricao).toBe('A VISTA');
    expect(screen.getByTestId('combobox-condicao-pagamento')).toHaveTextContent('A VISTA');

    await usuario.keyboard('{ArrowDown}');
    expect(useVendaStore.getState().condicaoSelecionada?.descricao).toBe('A PRAZO');
  });

  it('condição: com o carrinho vazio o combobox fica bloqueado mesmo com o catálogo carregado', async () => {
    // Pedido do usuário (2026-09-04): sem subtotal não há venda a cobrar.
    const usuario = userEvent.setup();
    useVendaStore.setState({ linhas: [] });
    render(envolverComQueryClient(createElement(SeletorCondicaoPagamento)));

    // O `title` é o que distingue este bloqueio do de "catálogo ainda
    // carregando": os dois produzem `aria-disabled`, só o motivo os separa.
    const combobox = screen.getByTestId('combobox-condicao-pagamento');
    await waitFor(() => {
      expect(combobox).toHaveAttribute(
        'title',
        'Insira ao menos um produto na venda antes de escolher a condição de pagamento.',
      );
    });
    expect(combobox).toHaveAttribute('aria-disabled', 'true');

    combobox.focus();
    await usuario.keyboard('{ArrowDown}');
    expect(useVendaStore.getState().condicaoSelecionada).toBeNull();
  });

  it('forma: ArrowDown percorre as formas da condição e pula o PIX sem integração', async () => {
    const usuario = userEvent.setup();
    useVendaStore.setState({ condicaoSelecionada: A_VISTA });
    const onSelecionarForma = vi.fn();

    function Envolvido(): ReactElement {
      const [forma, setForma] = useState<FormaPagamento | null>(null);
      return createElement(SeletorFormaPagamento, {
        formaSelecionada: forma,
        onSelecionarForma: (escolhida: FormaPagamento) => {
          setForma(escolhida);
          onSelecionarForma(escolhida);
        },
      });
    }

    render(envolverComQueryClient(createElement(Envolvido)));

    await waitFor(() => {
      expect(screen.getByTestId('combobox-forma-pagamento')).not.toHaveAttribute(
        'aria-disabled',
        'true',
      );
    });

    screen.getByTestId('combobox-forma-pagamento').focus();
    await usuario.keyboard('{ArrowDown}');
    expect(screen.getByTestId('combobox-forma-pagamento')).toHaveTextContent('DINHEIRO');

    // PIX é a única outra forma da condição e está indisponível
    // (`UtilizaCentriumPAG: false`): a seta não tem para onde ir e a escolha fica.
    await usuario.keyboard('{ArrowDown}');
    expect(screen.getByTestId('combobox-forma-pagamento')).toHaveTextContent('DINHEIRO');
    expect(onSelecionarForma).toHaveBeenCalledExactlyOnceWith(DINHEIRO);
  });

  /**
   * A origem que `escolherForma` (`PainelPagamentoETotais.tsx`) usa para
   * decidir se abre o modal do vale devolução (pedido do usuário, 2026-09-04):
   * seta é `'teclado'`, clique é `'mouse'`. Este teste trava o sinal na fonte —
   * o `SeletorFormaPagamento` real, não o harness sintético da suíte acima.
   */
  it('forma: a seta escolhe com origem "teclado" e o clique com origem "mouse"', async () => {
    const usuario = userEvent.setup();
    useVendaStore.setState({ condicaoSelecionada: A_VISTA });
    const onSelecionarForma = vi.fn();

    function Envolvido(): ReactElement {
      const [forma, setForma] = useState<FormaPagamento | null>(null);
      return createElement(SeletorFormaPagamento, {
        formaSelecionada: forma,
        onSelecionarForma: (escolhida, origem) => {
          setForma(escolhida);
          onSelecionarForma(escolhida, origem);
        },
      });
    }

    render(envolverComQueryClient(createElement(Envolvido)));

    const combobox = await waitFor(() => {
      const elemento = screen.getByTestId('combobox-forma-pagamento');
      expect(elemento).not.toHaveAttribute('aria-disabled', 'true');
      return elemento;
    });

    combobox.focus();
    await usuario.keyboard('{ArrowDown}');
    expect(onSelecionarForma).toHaveBeenNthCalledWith(1, DINHEIRO, 'teclado');

    // PIX está indisponível neste catálogo (`UtilizaCentriumPAG: false`), então
    // o clique repete a mesma forma — o que muda é só a origem, que é o que
    // este teste verifica.
    await usuario.click(combobox);
    await usuario.click(screen.getByTestId('opcao-forma-1'));
    expect(onSelecionarForma).toHaveBeenNthCalledWith(2, DINHEIRO, 'mouse');
  });
});
