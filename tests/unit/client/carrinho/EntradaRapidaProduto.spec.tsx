import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EntradaRapidaProduto } from '../../../../src/client/features/carrinho/EntradaRapidaProduto';
import { useEdicaoItemStore } from '../../../../src/client/stores/edicaoItemStore';
import { useFocoVendaStore } from '../../../../src/client/stores/focoVendaStore';
import { useSessionStore } from '../../../../src/client/stores/sessionStore';
import { useVendaStore } from '../../../../src/client/stores/vendaStore';
import { linhaDe, respostaGetProduto, snapshotDe } from '../../../support/precificacao';

/**
 * Correções do usuário (2026-09-03):
 *
 * 1. Lápis da grid/lista mobile carrega o item já inserido de volta para esta
 *    barra (`useEdicaoItemStore`), preservando quantidade/unidade/preço/
 *    desconto/total, e só libera preço/desconto quando `'E'` — pesável
 *    (`'S'`/`'B'`) mantém só a quantidade ajustável.
 * 2. Produto identificado como **não editável** (`''`) ao selecionar no modal
 *    de busca insere direto no grid, sem exigir confirmação extra.
 */

function registroDeBootstrap() {
  return {
    tenant: 'acme',
    codigoEmpresa: '1',
    _versionHash: 'hash-teste',
    SessaoUsuario: {
      TipoPreco: 1,
      CadMaqCod: 'PDV01',
      ListaPrecoDefault: 3,
      CenarioPagamento: '[]',
      QtdMinCharParaConsulta: 3,
      UsuarioTipoCodigoProduto: 'I',
      ClienteDefaultCodigo: 1,
      CadSerieNFCe: '1',
      CadMaqHost: '127.0.0.1:4545',
      TipoImpressao: 'E' as const,
    },
  };
}

function envolverComQueryClient(): (props: { children: ReactNode }) => ReactNode {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }) => createElement(QueryClientProvider, { client: queryClient }, children);
}

function renderBarra() {
  const Wrapper = envolverComQueryClient();
  return render(createElement(Wrapper, null, createElement(EntradaRapidaProduto)));
}

/** jsdom não implementa `ResizeObserver`, observado pelo `<Skeleton>` do
 * modal de busca enquanto `GetListaProdutos` está pendente — mesmo stub de
 * `tests/unit/client/LoadingSkeleton.spec.tsx`. */
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
  // Boneyard enxerga (mesma nota de `LoadingSkeleton.spec.tsx`).
  window.ResizeObserver = ResizeObserverStub;
  window.matchMedia = criarMatchMediaStub;
});

describe('EntradaRapidaProduto — editar item já inserido (correção do usuário, 2026-09-03)', () => {
  beforeEach(() => {
    useSessionStore.setState({ estado: 'pronto', registro: registroDeBootstrap() });
    useVendaStore.setState({ linhas: [] });
    useVendaStore.getState().resetarAuditoria('NOVA');
    useEdicaoItemStore.setState({ linhaEmEdicao: null });
  });

  it("carrega quantidade/preço/desconto/total da linha editável ('E') e aplica os três ajustes ao confirmar", async () => {
    const usuario = userEvent.setup();
    const linha = linhaDe({
      idLinha: 'linha-1',
      snapshot: snapshotDe({ pesavelEditavel: 'E', precoBase: 1000 }),
      quantidadeEmUnidades: 2,
      precoUnitario: 1000,
      descontoManual: 50,
    });
    useVendaStore.setState({ linhas: [linha] });
    renderBarra();

    act(() => {
      useEdicaoItemStore.getState().carregarParaEdicao(linha);
    });

    await waitFor(() => {
      expect(screen.getByTestId('campo-codigo-produto')).toHaveValue('001234');
    });
    expect(screen.getByTestId('previa-quantidade')).toHaveValue('2,000');
    expect(screen.getByTestId('previa-preco-unitario')).toHaveValue('10,00');
    expect(screen.getByTestId('previa-desconto-item')).toHaveValue('0,50');
    expect(screen.getByTestId('previa-preco-unitario')).toBeEnabled();
    // Unidade vem do cadastro, nunca editável (correção do usuário,
    // 2026-09-03) — `disabled`, não só `readOnly`.
    expect(screen.getByTestId('previa-unidade')).toBeDisabled();
    // Contorno pulsante sinaliza que a barra está com um item carregado para
    // edição (correção do usuário, 2026-09-03).
    expect(screen.getByTestId('entrada-rapida-produto')).toHaveClass('cc-pulso-edicao');

    // O "R$" é elemento próprio, ao lado do campo (correção do usuário,
    // 2026-09-03): sobrevive a esvaziar o campo e a digitar por cima, porque
    // nunca esteve dentro do `value`.
    expect(screen.getByTestId('previa-preco-unitario-simbolo')).toHaveTextContent('R$');
    await usuario.clear(screen.getByTestId('previa-preco-unitario'));
    expect(screen.getByTestId('previa-preco-unitario')).toHaveValue('');
    expect(screen.getByTestId('previa-preco-unitario-simbolo')).toBeVisible();
    await usuario.type(screen.getByTestId('previa-preco-unitario'), '12,00');
    expect(screen.getByTestId('previa-preco-unitario')).toHaveValue('12,00');
    expect(screen.getByTestId('previa-preco-unitario-simbolo')).toBeVisible();
    await usuario.click(screen.getByTestId('previa-quantidade-aumentar'));
    // Enter em QUALQUER campo confirma (correção do usuário, 2026-09-03) —
    // aqui a partir do campo de desconto, não de um clique no "+".
    await usuario.click(screen.getByTestId('previa-desconto-item'));
    await usuario.keyboard('{Enter}');

    const editada = useVendaStore.getState().linhas.find((linha) => linha.idLinha === 'linha-1');
    expect(editada?.quantidade).toBe(3000);
    // A prova de que o símbolo visível não contaminou `lerCentavos`: 12,00
    // digitado vira 1200 centavos, não `null` nem outro valor.
    expect(editada?.precoUnitario).toBe(1200);
    expect(editada?.descontoManual).toBe(50);
    // Volta ao estado vazio e libera a linha do store de coordenação.
    expect(useEdicaoItemStore.getState().linhaEmEdicao).toBeNull();
    expect(screen.getByTestId('campo-codigo-produto')).toHaveValue('');
    // Foco volta pro código pro operador poder inserir o próximo item sem
    // tocar no mouse (achado do usuário, 2026-09-03: antes o campo ainda
    // estava `disabled` no instante do `.focus()`, dentro do mesmo handler
    // síncrono que confirma — o navegador ignorava a chamada em silêncio).
    await waitFor(() => {
      expect(screen.getByTestId('campo-codigo-produto')).toHaveFocus();
    });
  });

  it("produto pesável ('S') só libera a quantidade — preço e desconto ficam somente leitura", async () => {
    const usuario = userEvent.setup();
    const linha = linhaDe({
      idLinha: 'linha-1',
      snapshot: snapshotDe({ pesavelEditavel: 'S', precoBase: 1000 }),
      quantidadeEmUnidades: 2,
      precoUnitario: 1000,
      descontoConvenio: 30,
    });
    useVendaStore.setState({ linhas: [linha] });
    renderBarra();

    act(() => {
      useEdicaoItemStore.getState().carregarParaEdicao(linha);
    });

    await waitFor(() => {
      expect(screen.getByTestId('previa-preco-unitario')).toHaveAttribute('readonly');
    });
    // Desconto exibido é o real da linha (convênio, já que não há manual) —
    // não `0,00` fixo, que era o comportamento de uma inserção nova. O "R$"
    // vive fora do campo, então o `value` carrega só o número (correção do
    // usuário, 2026-09-03).
    expect(screen.getByTestId('previa-desconto-item')).toHaveValue('0,30');
    expect(screen.getByTestId('previa-desconto-item-simbolo')).toHaveTextContent('R$');

    await usuario.click(screen.getByTestId('previa-quantidade-aumentar'));
    await usuario.click(screen.getByTestId('previa-confirmar'));

    const editada = useVendaStore.getState().linhas.find((linha) => linha.idLinha === 'linha-1');
    expect(editada?.quantidade).toBe(3000);
    expect(editada?.precoUnitario).toBe(1000);
    // Mudar a quantidade reprecifica (`carrinhoSlice.editarItem`, campo
    // `'quantidade'`) — `repricarSku` recalcula `descontoConvenio` do zero a
    // cada chamada (`reprecificacao.ts`), e o `useVendaStore` global deste
    // teste não tem cliente com convênio (`carrinhoDepsPadrao.clienteAtual`
    // devolve `null`), então o `30` inicial (artificial, só para a asserção
    // de exibição acima) não sobrevive — é o comportamento real do sistema,
    // não um efeito colateral do lápis.
    expect(editada?.descontoConvenio).toBe(0);
  });

  it('Escape cancela a edição sem alterar a linha', async () => {
    const usuario = userEvent.setup();
    const linha = linhaDe({
      idLinha: 'linha-1',
      snapshot: snapshotDe({ pesavelEditavel: 'E' }),
      quantidadeEmUnidades: 2,
    });
    useVendaStore.setState({ linhas: [linha] });
    renderBarra();

    act(() => {
      useEdicaoItemStore.getState().carregarParaEdicao(linha);
    });
    await waitFor(() => {
      expect(screen.getByTestId('campo-codigo-produto')).toHaveValue('001234');
    });

    await usuario.keyboard('{Escape}');

    expect(useVendaStore.getState().linhas[0]?.quantidade).toBe(2000);
    expect(useEdicaoItemStore.getState().linhaEmEdicao).toBeNull();
  });
});

describe('EntradaRapidaProduto — seleção no modal de busca (correção do usuário, 2026-09-03)', () => {
  beforeEach(() => {
    useSessionStore.setState({ estado: 'pronto', registro: registroDeBootstrap() });
    useVendaStore.setState({ linhas: [] });
    useVendaStore.getState().resetarAuditoria('NOVA');
    useEdicaoItemStore.setState({ linhaEmEdicao: null });
  });

  function stubarFetch(produtoPesavelEditavel: string): void {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('GetListaProdutos')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                ListaProdutos: {
                  PaginaAtual: 1,
                  RegistrosPorPagina: 20,
                  TotalRegistros: 1,
                  TotalPaginas: 1,
                  Produtos: [
                    {
                      CodigoProduto: '001234',
                      Descricao: 'PRODUTO EXEMPLO 500G',
                      Referencia: 'REF-EX',
                      CodigoBarras: '7890000000001',
                      UDM: 'UN',
                    },
                  ],
                },
              }),
              { status: 200, headers: { 'content-type': 'application/json' } },
            ),
          );
        }
        return Promise.resolve(
          new Response(
            JSON.stringify({
              Produto: respostaGetProduto({ ProdutoPesavelEditavel: produtoPesavelEditavel }),
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
        );
      }),
    );
  }

  it('produto não editável escolhido no modal insere direto no grid, sem prévia', async () => {
    stubarFetch('');
    const usuario = userEvent.setup();
    renderBarra();

    await usuario.click(screen.getByTestId('abrir-busca-produto'));
    await usuario.type(screen.getByTestId('campo-busca-produto'), 'caneta');
    await waitFor(() => {
      expect(screen.getByTestId('candidato-produto')).toBeInTheDocument();
    });
    await usuario.click(screen.getByTestId('candidato-produto'));

    await waitFor(() => {
      expect(useVendaStore.getState().linhas).toHaveLength(1);
    });
    expect(useVendaStore.getState().linhas[0]?.origem).toBe('BUSCA');
    // Nenhuma prévia ficou pendente: a barra volta ao estado vazio.
    expect(screen.getByTestId('campo-codigo-produto')).toHaveValue('');
    // `aria-disabled`, não `disabled`: o botão bloqueado continua clicável para
    // explicar o motivo (`lib/bloqueio.ts`), e o `toBeDisabled` do jest-dom só
    // enxerga o atributo nativo.
    expect(screen.getByTestId('previa-confirmar')).toHaveAttribute('aria-disabled', 'true');
  });

  it("produto editável ('E') escolhido no modal continua exigindo revisão — não insere sozinho", async () => {
    stubarFetch('E');
    const usuario = userEvent.setup();
    renderBarra();

    await usuario.click(screen.getByTestId('abrir-busca-produto'));
    await usuario.type(screen.getByTestId('campo-busca-produto'), 'caneta');
    await waitFor(() => {
      expect(screen.getByTestId('candidato-produto')).toBeInTheDocument();
    });
    await usuario.click(screen.getByTestId('candidato-produto'));

    await waitFor(() => {
      expect(screen.getByTestId('previa-preco-unitario')).toBeEnabled();
    });
    expect(useVendaStore.getState().linhas).toHaveLength(0);
  });
});

describe('EntradaRapidaProduto — TAB no campo de código (pedido do usuário, 2026-09-04)', () => {
  beforeEach(() => {
    useSessionStore.setState({ estado: 'pronto', registro: registroDeBootstrap() });
    useVendaStore.setState({ linhas: [] });
    useVendaStore.getState().resetarAuditoria('NOVA');
    useEdicaoItemStore.setState({ linhaEmEdicao: null });
  });

  it('com o campo vazio, TAB navega para a lupa de busca em vez de tentar revisar', async () => {
    const usuario = userEvent.setup();
    renderBarra();

    await waitFor(() => {
      expect(screen.getByTestId('campo-codigo-produto')).toHaveFocus();
    });

    await usuario.tab();

    expect(screen.getByTestId('abrir-busca-produto')).toHaveFocus();
  });

  it('Shift+TAB pede o foco no cliente em vez de voltar para o cabeçalho "Recolhido"', async () => {
    const usuario = userEvent.setup();
    useFocoVendaStore.setState({ pedidosDeFocoNoDocumento: 0 });
    renderBarra();

    await waitFor(() => {
      expect(screen.getByTestId('campo-codigo-produto')).toHaveFocus();
    });

    await usuario.tab({ shift: true });

    // O foco não saiu do campo por conta do navegador: quem o move é o
    // `CampoClienteVenda`, que expande o card ao receber o pedido (o card não
    // existe nesta árvore de teste — ver o spec dele).
    expect(useFocoVendaStore.getState().pedidosDeFocoNoDocumento).toBe(1);

    // Vale também com código digitado: Shift+TAB nunca é revisão.
    await usuario.type(screen.getByTestId('campo-codigo-produto'), '001234');
    await usuario.tab({ shift: true });
    expect(useFocoVendaStore.getState().pedidosDeFocoNoDocumento).toBe(2);
    expect(useVendaStore.getState().linhas).toHaveLength(0);
  });

  it('com código digitado, TAB continua sendo revisão — o foco não sai para a lupa', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({ Produto: respostaGetProduto({ ProdutoPesavelEditavel: 'E' }) }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
        ),
      ),
    );
    const usuario = userEvent.setup();
    renderBarra();

    await usuario.type(screen.getByTestId('campo-codigo-produto'), '001234');
    await usuario.tab();

    // Revisão carregada (produto `'E'` abre a prévia editável) e nenhuma linha
    // inserida — o TAB não virou navegação.
    await waitFor(() => {
      expect(screen.getByTestId('previa-preco-unitario')).toBeEnabled();
    });
    expect(screen.getByTestId('abrir-busca-produto')).not.toHaveFocus();
    expect(useVendaStore.getState().linhas).toHaveLength(0);

    vi.unstubAllGlobals();
  });
});
