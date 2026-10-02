import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ListaPagamentosAplicados } from '../../../../src/client/features/pagamento/ListaPagamentosAplicados';
import { MEIO_PAGTO } from '../../../../src/client/domain/pagamento/formaPagamento';
import { haJanelaAberta } from '../../../../src/client/lib/useFocoDeModal';
import { useSessionStore } from '../../../../src/client/stores/sessionStore';
import { useVendaStore } from '../../../../src/client/stores/vendaStore';
import { pagamentoDe } from '../../../support/pagamento';
import { linhaDe } from '../../../support/precificacao';
import { registroBootstrapDe } from '../../../support/sessao';

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

/**
 * A janela do TEF nasce do estado (feature 010, T022 — AD-158, como o PIX).
 *
 * O `fetch` global está desligado: a janela abre, a criação da cobrança cai em
 * erro de rede e ela fica no painel de erro — o que basta para afirmar **quem**
 * monta a janela e **quando**. O comportamento da cobrança em si é do
 * `ModalTef.spec.tsx`. Valores sintéticos.
 */
describe('ListaPagamentosAplicados — janela do TEF', () => {
  let fetchFalso: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchFalso = vi.fn().mockRejectedValue(new Error('rede desligada no teste'));
    vi.stubGlobal('fetch', fetchFalso);

    useSessionStore.setState({
      estado: 'pronto',
      registro: registroBootstrapDe({ UsuarioGAM: '0f2c9a4e-0000-4000-8000-000000000000' }),
    });
    useVendaStore.setState({
      linhas: [linhaDe({ precoUnitario: 10_000, quantidadeEmUnidades: 1 })],
      condicaoSelecionada: null,
      pagamentos: [],
      descontoCapa: null,
      clienteAtual: {
        codigoCliente: 2538,
        nome: 'MARIA EXEMPLO',
        documento: '12345678909',
        celular: null,
        listaPreco: 1,
        descontoConvenio: 0,
        codigoConvenio: null,
        origem: 'BUSCA_DOCUMENTO',
      },
    });
    useVendaStore.getState().resetarAuditoria('NOVA');
  });

  function renderizarLista(): void {
    const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={cliente}>
        <ListaPagamentosAplicados />
      </QueryClientProvider>,
    );
  }

  function tefPendente(idPagamento: string) {
    return pagamentoDe({
      idPagamento,
      formaCodigo: 12,
      meioPagtoNFe: MEIO_PAGTO.CartaoDebito,
      integracaoCartao: '1',
      integracao: 'TEF',
      status: 'PENDENTE_INTEGRACAO',
      valorAplicado: 5_000,
    });
  }

  function criacoesDeCobranca(): number {
    return fetchFalso.mock.calls.filter(([url]) => String(url).includes('CriarCardPagamento'))
      .length;
  }

  // (a)
  it('pagamento PENDENTE_INTEGRACAO de TEF monta a janela do TEF, e não a do PIX', async () => {
    useVendaStore.setState({ pagamentos: [tefPendente('tef-1')] });
    renderizarLista();

    expect(await screen.findByTestId('modal-tef')).toBeInTheDocument();
    expect(screen.queryByTestId('modal-pix')).toBeNull();
  });

  it('pagamento PENDENTE_INTEGRACAO de PIX continua montando a janela do PIX', async () => {
    useVendaStore.setState({
      pagamentos: [
        pagamentoDe({
          idPagamento: 'pix-1',
          meioPagtoNFe: MEIO_PAGTO.Pix,
          integracao: 'PIX_DINAMICO',
          status: 'PENDENTE_INTEGRACAO',
          valorAplicado: 5_000,
        }),
      ],
    });
    renderizarLista();

    expect(await screen.findByTestId('modal-pix')).toBeInTheDocument();
    expect(screen.queryByTestId('modal-tef')).toBeNull();
  });

  // (b) A janela segue o pagamento exibido durante os 10s do estado aprovado.
  it('a janela continua montada quando o pagamento vira APROVADO', async () => {
    useVendaStore.setState({ pagamentos: [tefPendente('tef-1')] });
    renderizarLista();
    await screen.findByTestId('modal-tef');

    act(() => {
      useVendaStore.setState({
        pagamentos: [{ ...tefPendente('tef-1'), status: 'APROVADO' }],
      });
    });

    expect(screen.getByTestId('modal-tef')).toBeInTheDocument();
  });

  // (c) FR-012: a `key` muda e as travas de "uma criação por montagem" recomeçam.
  it('dois TEFs em sequência abrem duas janelas, cada uma com a sua criação', async () => {
    const usuario = userEvent.setup();
    useVendaStore.setState({ pagamentos: [tefPendente('tef-1')] });
    renderizarLista();

    await screen.findByTestId('erro-criacao-tef');
    expect(criacoesDeCobranca()).toBe(1);

    // Erro de criação: desistir sai sem confirmação, e o pagamento é recusado.
    await usuario.click(screen.getByTestId('desistir-operacao-tef'));
    expect(useVendaStore.getState().pagamentos).toHaveLength(0);
    expect(screen.queryByTestId('modal-tef')).toBeNull();

    act(() => {
      useVendaStore.setState({ pagamentos: [tefPendente('tef-2')] });
    });

    await screen.findByTestId('modal-tef');
    await waitFor(() => {
      expect(criacoesDeCobranca()).toBe(2);
    });
  });

  /**
   * (d) T7: com a janela aberta, nenhuma outra forma entra. O clique em
   * "Adicionar pagamento" cai no backdrop — o jsdom não faz layout para provar
   * isso —, e o atalho de venda rápida (F6–F9) é recusado pelo `mapaAtalhos`
   * quando `haJanelaAberta()`. O que se afirma aqui é a metade verificável: a
   * janela é modal e entra na pilha que o mapa de atalhos consulta.
   */
  /**
   * T029 (US2): cartão que a 008 resolveu como `NENHUMA` — empresa sem TEF ou
   * forma POS — entra aprovado e não abre segundo caminho para o TEF.
   */
  it('cartão sem integração entra APROVADO, sem janela e sem chamada SmartTEF', async () => {
    useVendaStore.setState({
      pagamentos: [
        pagamentoDe({
          idPagamento: 'pos-1',
          meioPagtoNFe: MEIO_PAGTO.CartaoCredito,
          integracaoCartao: '2',
          integracao: 'NENHUMA',
          status: 'APROVADO',
          valorAplicado: 5_000,
        }),
      ],
    });
    renderizarLista();

    expect(screen.getByTestId('pagamento-aplicado')).toHaveAttribute('data-status', 'APROVADO');
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(screen.queryByTestId('modal-tef')).toBeNull();
    expect(
      fetchFalso.mock.calls.filter(([url]) =>
        /CriarCardPagamento|ConsultarStatusCard|EstornarPagamento/.test(String(url)),
      ),
    ).toHaveLength(0);
  });

  describe('remover TEF aprovado = estorno (US3, T032)', () => {
    function tefAprovado() {
      return pagamentoDe({
        idPagamento: 'tef-ok',
        formaCodigo: 12,
        meioPagtoNFe: MEIO_PAGTO.CartaoDebito,
        integracaoCartao: '1',
        integracao: 'TEF',
        status: 'APROVADO',
        valorAplicado: 5_000,
        dadosTEF: {
          pagId: 'pay_exemplo_0001',
          bandeira: 'MASTERCARD',
          nsu: '048291',
          autorizacao: '192837',
          tipoIntegracao: '1',
        },
      });
    }

    // (a) FR-003: o botão não é mais bloqueio; a remoção direta continua
    // proibida no slice, e a saída é a confirmação de estorno.
    it('o remover não está bloqueado e abre a confirmação de estorno', async () => {
      const usuario = userEvent.setup();
      useVendaStore.setState({ pagamentos: [tefAprovado()] });
      renderizarLista();

      const remover = screen.getByTestId('remover-pagamento');
      expect(remover).not.toHaveAttribute('aria-disabled');
      await usuario.click(remover);

      expect(screen.getByTestId('confirmar-estorno-tef')).toHaveTextContent(
        'Estornar o pagamento no cartão?',
      );
    });

    // (b)
    it('cancelar a confirmação não chama nada', async () => {
      const usuario = userEvent.setup();
      useVendaStore.setState({ pagamentos: [tefAprovado()] });
      renderizarLista();

      await usuario.click(screen.getByTestId('remover-pagamento'));
      await usuario.click(screen.getByTestId('confirmar-estorno-tef-cancelar'));

      expect(screen.queryByTestId('janela-estorno-tef')).toBeNull();
      expect(useVendaStore.getState().pagamentos[0]?.status).toBe('APROVADO');
      expect(fetchFalso).not.toHaveBeenCalledWith(
        expect.stringContaining('EstornarPagamento'),
        expect.anything(),
      );
    });

    // (c) A janela recebe o `pagId` do pagamento: é com ele que consulta.
    it('confirmar abre a janela de estorno com o pagId do pagamento', async () => {
      const usuario = userEvent.setup();
      useVendaStore.setState({ pagamentos: [tefAprovado()] });
      renderizarLista();

      await usuario.click(screen.getByTestId('remover-pagamento'));
      await usuario.click(screen.getByTestId('confirmar-estorno-tef-confirmar'));

      expect(await screen.findByTestId('janela-estorno-tef')).toBeInTheDocument();
      await waitFor(() => {
        expect(
          fetchFalso.mock.calls.some(([url]) =>
            String(url).includes('ConsultarStatusCard?SmartTefPaymentIdentifier=pay_exemplo_0001'),
          ),
        ).toBe(true);
      });
    });

    // (d) T5: só o `EST` observado risca a forma.
    it('ao concluir o estorno, a forma fica riscada', async () => {
      const usuario = userEvent.setup();
      fetchFalso.mockImplementation((url: unknown) =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              Sucesso: true,
              CodigoStatusHttp: 200,
              MensagemErro: '',
              RespostaJson: String(url).includes('ConsultarStatusCard')
                ? JSON.stringify([
                    { payment_identifier: 'pay_exemplo_0001', payment_status: 'EST' },
                  ])
                : '[]',
            }),
            { status: 200 },
          ),
        ),
      );
      useVendaStore.setState({ pagamentos: [tefAprovado()] });
      renderizarLista();

      await usuario.click(screen.getByTestId('remover-pagamento'));
      await usuario.click(screen.getByTestId('confirmar-estorno-tef-confirmar'));

      await waitFor(() => {
        expect(useVendaStore.getState().pagamentos[0]?.status).toBe('EXCLUIDO');
      });
      expect(screen.getByTestId('pagamento-aplicado')).toHaveAttribute('data-status', 'EXCLUIDO');
      // A janela fica informando o sucesso (pedido do usuário, 2026-10-02) e
      // sai pelo "Fechar" — ou sozinha em 10s, ou pelo ESC.
      expect(await screen.findByText('Estorno efetuado com sucesso')).toBeInTheDocument();
      await usuario.click(screen.getByTestId('concluir-estorno-tef'));
      expect(screen.queryByTestId('janela-estorno-tef')).toBeNull();
    });

    // (e)
    it('PIX aprovado continua com a confirmação do PIX, não a do estorno', async () => {
      const usuario = userEvent.setup();
      useVendaStore.setState({
        pagamentos: [
          pagamentoDe({
            idPagamento: 'pix-ok',
            meioPagtoNFe: MEIO_PAGTO.Pix,
            integracao: 'PIX_DINAMICO',
            status: 'APROVADO',
            pixGuid: 'guid-exemplo',
            valorAplicado: 5_000,
          }),
        ],
      });
      renderizarLista();

      await usuario.click(screen.getByTestId('remover-pagamento'));

      expect(screen.getByTestId('confirmar-remocao-pix')).toBeInTheDocument();
      expect(screen.queryByTestId('confirmar-estorno-tef')).toBeNull();
    });
  });

  it('a janela é modal e entra na pilha que barra os atalhos de venda rápida', async () => {
    useVendaStore.setState({ pagamentos: [tefPendente('tef-1')] });
    renderizarLista();

    const janela = await screen.findByRole('dialog', { name: 'Pagamento no TEF' });
    expect(janela).toHaveAttribute('aria-modal', 'true');
    expect(haJanelaAberta()).toBe(true);
  });
});
