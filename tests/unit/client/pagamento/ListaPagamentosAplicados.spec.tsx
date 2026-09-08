import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ListaPagamentosAplicados } from '../../../../src/client/features/pagamento/ListaPagamentosAplicados';
import { useVendaStore } from '../../../../src/client/stores/vendaStore';
import { pagamentoDe } from '../../../support/pagamento';
import { linhaDe } from '../../../support/precificacao';

/**
 * Rolagem da lista de formas aplicadas — pedido do usuário (2026-09-04): a barra
 * vertical some da coluna inteira do cartão e passa a viver dentro da lista, e
 * cada forma nova traz a lista até o fim.
 *
 * **Por que a primeira asserção olha `className`.** O jsdom não faz layout: não
 * há altura, `getComputedStyle` não enxerga o Tailwind (nenhum CSS é carregado)
 * e nada nunca "estoura" para rolar de verdade. A classe é a única evidência
 * disponível de qual elemento é o contêiner de rolagem, e é justamente o que
 * uma regressão desfaria ao devolver o `overflow-y-auto` para a coluna. O
 * comportamento visual em si é conferido no navegador, não aqui.
 *
 * **Por que `scrollTop`/`scrollHeight` são redefinidos.** O jsdom devolve 0 em
 * `scrollHeight` e ignora a escrita em `scrollTop` — sem os acessores abaixo o
 * efeito rodaria e não deixaria rastro nenhum para verificar. Os valores são
 * sintéticos; o que o teste afirma é que o efeito mira **esta** lista e a leva
 * ao fim exatamente quando uma forma nova entra.
 */
const ALTURA_ROLAVEL = 500;

describe('ListaPagamentosAplicados — a rolagem é da lista e segue a última forma inserida', () => {
  let scrollTopsAplicados: number[] = [];

  beforeEach(() => {
    scrollTopsAplicados = [];

    Object.defineProperty(HTMLUListElement.prototype, 'scrollHeight', {
      configurable: true,
      get: () => ALTURA_ROLAVEL,
    });
    Object.defineProperty(HTMLUListElement.prototype, 'scrollTop', {
      configurable: true,
      get: () => scrollTopsAplicados.at(-1) ?? 0,
      set: (valor: number) => {
        scrollTopsAplicados.push(valor);
      },
    });

    // O bloco lê o catálogo de pagamento (`useCondicoesPagamento`) para o mínimo
    // do PIX. Nenhum pagamento daqui é integrado, então o valor não importa —
    // basta a rede não sair do teste.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('rede desligada no teste')));

    useVendaStore.setState({
      linhas: [linhaDe({ precoUnitario: 10_000, quantidadeEmUnidades: 1 })],
      condicaoSelecionada: null,
      pagamentos: [],
      descontoCapa: null,
    });
    useVendaStore.getState().resetarAuditoria('NOVA');
  });

  afterEach(() => {
    Reflect.deleteProperty(HTMLUListElement.prototype, 'scrollHeight');
    Reflect.deleteProperty(HTMLUListElement.prototype, 'scrollTop');
  });

  function renderizarLista(): void {
    const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={cliente}>
        <ListaPagamentosAplicados />
      </QueryClientProvider>,
    );
  }

  it('a barra de rolagem mora na lista, e não no cartão inteiro', () => {
    useVendaStore.setState({ pagamentos: [pagamentoDe({ valorAplicado: 1_000 })] });
    renderizarLista();

    const lista = screen.getByRole('list');
    expect(lista.className).toContain('overflow-y-auto');
  });

  /**
   * A lista encolhe, mas **nunca até zero** (2026-09-04).
   *
   * A versão anterior fixava `min-h-0` na lista e na seção, e era isso que
   * causava o defeito: numa venda em 1280×720 — o PDV real — os blocos fixos da
   * coluna (condição, desconto, forma, valor) consomem toda a altura, e o flex
   * entregava zero ao único bloco flexível. As faixas escapavam para fora da
   * coluna e ficavam cobertas pelo bloco de total, que vem depois no fluxo: o
   * pagamento aparecia na tela e "Remover" era intocável, com o clique caindo em
   * `total-da-venda`. Foi assim que `pagamento-pix.spec.ts` falhava.
   *
   * Com o piso, a falta de espaço passa a sobrar para a coluna do cartão, que
   * tem `overflow-y-auto` justamente como rede de segurança — e o bloco de
   * total e o botão de finalizar não se movem, por serem irmãos dela.
   */
  it('a lista nunca colapsa a zero: piso de uma faixa na lista e na seção', () => {
    useVendaStore.setState({ pagamentos: [pagamentoDe({ valorAplicado: 1_000 })] });
    renderizarLista();

    expect(screen.getByRole('list').className).toContain('min-h-[34px]');
    // `min-h-min` (min-content) deriva o piso da seção do próprio conteúdo —
    // cabeçalho mais uma faixa — sem crescer com o número de pagamentos.
    expect(screen.getByTestId('pagamentos-aplicados').className).toContain('min-h-min');
  });

  it('cada forma inserida traz a lista até o fim', () => {
    const primeiro = pagamentoDe({ idPagamento: 'pag-1', valorAplicado: 1_000 });
    useVendaStore.setState({ pagamentos: [primeiro] });
    renderizarLista();

    expect(scrollTopsAplicados).toEqual([ALTURA_ROLAVEL]);

    const segundo = pagamentoDe({ idPagamento: 'pag-2', valorAplicado: 2_000 });
    act(() => {
      useVendaStore.setState({ pagamentos: [primeiro, segundo] });
    });

    expect(screen.getAllByTestId('pagamento-aplicado')).toHaveLength(2);
    expect(scrollTopsAplicados).toEqual([ALTURA_ROLAVEL, ALTURA_ROLAVEL]);
  });

  it('excluir uma forma não arrasta a lista de volta para o fim', () => {
    const primeiro = pagamentoDe({ idPagamento: 'pag-1', valorAplicado: 1_000 });
    const segundo = pagamentoDe({ idPagamento: 'pag-2', valorAplicado: 2_000 });
    useVendaStore.setState({ pagamentos: [primeiro, segundo] });
    renderizarLista();

    expect(scrollTopsAplicados).toEqual([ALTURA_ROLAVEL]);

    // AD-163: remover não tira o item da lista, marca `EXCLUIDO`. A última forma
    // continua sendo `pag-2`, então nada foi inserido e a lista fica onde o
    // operador a deixou.
    act(() => {
      useVendaStore.getState().removerPagamento('pag-1');
    });

    expect(screen.getByTestId('pagamentos-aplicados')).toBeInTheDocument();
    expect(scrollTopsAplicados).toEqual([ALTURA_ROLAVEL]);
  });

  /**
   * AD-169. Uma forma que veio no documento retomado carrega um valor **já
   * recebido**, gravado no rascunho dentro do ERP — removê-la em silêncio
   * deixaria a NFCe sair sem o pagamento que o cliente fez, num gesto que o
   * operador daria só para corrigir um item. Mesmo freio do "Limpar" do
   * cabeçalho: guardar só um dos dois seria um freio contornável sem perceber.
   */
  describe('forma vinda do documento retomado pede confirmação para sair', () => {
    it('remover pede confirmação, e cancelar mantém a forma na venda', async () => {
      const usuario = userEvent.setup();
      useVendaStore.setState({
        pagamentos: [
          pagamentoDe({ idPagamento: 'pag-doc', valorAplicado: 1_000, veioDeDocumento: true }),
        ],
      });
      renderizarLista();

      await usuario.click(screen.getByTestId('remover-pagamento'));

      const dialogo = screen.getByTestId('confirmar-remocao-documento');
      expect(dialogo).toHaveTextContent('Este valor já foi recebido');
      // A consequência fiscal é a frase que precisa sobreviver à leitura rápida.
      expect(dialogo).toHaveTextContent('a NFCe sai sem o valor que o cliente já pagou');

      await usuario.click(screen.getByTestId('confirmar-remocao-documento-cancelar'));

      expect(screen.queryByTestId('confirmar-remocao-documento')).toBeNull();
      expect(useVendaStore.getState().pagamentos[0]?.status).toBe('APROVADO');
    });

    it('confirmar remove — a saída existe, só não é silenciosa', async () => {
      const usuario = userEvent.setup();
      useVendaStore.setState({
        pagamentos: [
          pagamentoDe({ idPagamento: 'pag-doc', valorAplicado: 1_000, veioDeDocumento: true }),
        ],
      });
      renderizarLista();

      await usuario.click(screen.getByTestId('remover-pagamento'));
      await usuario.click(screen.getByTestId('confirmar-remocao-documento-confirmar'));

      expect(useVendaStore.getState().pagamentos[0]?.status).toBe('EXCLUIDO');
    });

    it('forma lançada pelo operador continua saindo direto, sem diálogo', async () => {
      const usuario = userEvent.setup();
      useVendaStore.setState({
        pagamentos: [
          pagamentoDe({ idPagamento: 'pag-op', valorAplicado: 1_000, veioDeDocumento: false }),
        ],
      });
      renderizarLista();

      await usuario.click(screen.getByTestId('remover-pagamento'));

      expect(screen.queryByTestId('confirmar-remocao-documento')).toBeNull();
      expect(useVendaStore.getState().pagamentos[0]?.status).toBe('EXCLUIDO');
    });
  });
});
