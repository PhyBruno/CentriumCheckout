import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PoliticaSaldo } from '../../../../src/client/domain/estoque/saldoProduto';
import { EntradaRapidaProduto } from '../../../../src/client/features/carrinho/EntradaRapidaProduto';
import { notificar } from '../../../../src/client/lib/notificar';
import { useEdicaoItemStore } from '../../../../src/client/stores/edicaoItemStore';
import { useFocoVendaStore } from '../../../../src/client/stores/focoVendaStore';
import { useJanelasStore } from '../../../../src/client/stores/janelasStore';
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

/**
 * Vendedor da venda em todos os cenários que **não** são sobre vendedor.
 *
 * Desde a correção do usuário de 2026-09-10 nenhuma inserção acontece sem
 * vendedor: sem isto, cada teste de inserção passaria a exercitar, sem querer,
 * a recusa por falta de vendedor. O bloqueio em si tem os seus próprios casos,
 * mais abaixo, que zeram `vendedorAtual` de propósito.
 */
const VENDEDOR_DE_TESTE = { codigo: 21, nome: 'Ana Lima', origem: 'DEFAULT' as const };

function registroDeBootstrap() {
  return {
    tenant: 'acme',
    codigoEmpresa: '1',
    _versionHash: 'hash-teste',
    SessaoUsuario: {
      TipoPreco: 1,
      UsuarioCodigo: 147,
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
    useVendaStore.setState({ linhas: [], vendedorAtual: VENDEDOR_DE_TESTE });
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

  it("produto pesável ('S') só libera a quantidade — preço e desconto ficam desabilitados", async () => {
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

    // `disabled`, não `readonly` (pedido do usuário, 2026-09-11): fora de
    // `'E'` o campo recusa o ponteiro e sai da navegação por TAB.
    await waitFor(() => {
      expect(screen.getByTestId('previa-preco-unitario')).toBeDisabled();
    });
    expect(screen.getByTestId('previa-desconto-item')).toBeDisabled();
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
    useVendaStore.setState({ linhas: [], vendedorAtual: VENDEDOR_DE_TESTE });
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

  /**
   * Pesável escolhido no modal abre a prévia — ao contrário do mesmo produto
   * resolvido por TAB, que entra direto (correção do usuário, 2026-09-11).
   * Quem chegou por descrição ainda não viu o código; a prévia é onde ele
   * confere o pesável antes de somar peso ao carrinho.
   */
  it.each(['S', 'B'])(
    "produto pesável ('%s') escolhido no modal abre a prévia, com preço e desconto desabilitados",
    async (tipo) => {
      stubarFetch(tipo);
      const usuario = userEvent.setup();
      renderBarra();

      await usuario.click(screen.getByTestId('abrir-busca-produto'));
      await usuario.type(screen.getByTestId('campo-busca-produto'), 'caneta');
      await waitFor(() => {
        expect(screen.getByTestId('candidato-produto')).toBeInTheDocument();
      });
      await usuario.click(screen.getByTestId('candidato-produto'));

      await waitFor(() => {
        expect(screen.getByTestId('previa-preco-unitario')).toBeDisabled();
      });
      expect(screen.getByTestId('previa-desconto-item')).toBeDisabled();
      // A quantidade continua ajustável: é o único campo que faz sentido mexer
      // num pesável.
      expect(screen.getByTestId('previa-quantidade')).toBeEnabled();
      expect(useVendaStore.getState().linhas).toHaveLength(0);
    },
  );

  it.each(['S', 'B'])(
    "o mesmo pesável ('%s') resolvido por TAB no código entra direto, sem prévia",
    async (tipo) => {
      stubarFetch(tipo);
      const usuario = userEvent.setup();
      renderBarra();

      await usuario.type(screen.getByTestId('campo-codigo-produto'), '001234');
      await usuario.tab();

      await waitFor(() => {
        expect(useVendaStore.getState().linhas).toHaveLength(1);
      });
      expect(screen.getByTestId('campo-codigo-produto')).toHaveValue('');
    },
  );

  /**
   * Preço zerado no cadastro deixou de virar linha de R$ 0,00 (pedido do
   * usuário, 2026-09-11). Até aqui só a balança recusava, e por acidente da
   * divisão que deriva o peso.
   */
  it('produto sem preço de venda no ERP é recusado, sem criar linha', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              Produto: respostaGetProduto({
                ProdutoPesavelEditavel: '',
                PrecoVenda: '0.0000',
              }),
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
        ),
      ),
    );
    const usuario = userEvent.setup();
    renderBarra();

    await usuario.type(screen.getByTestId('campo-codigo-produto'), '001234{Enter}');

    await waitFor(() => {
      expect(screen.getByTestId('campo-codigo-produto')).toHaveFocus();
    });
    expect(useVendaStore.getState().linhas).toHaveLength(0);
  });

  /**
   * O contraponto do caso acima: em `'E'` o preço da linha é o digitado, e o
   * operador pode alterá-lo de qualquer forma (`FR-014`) — recusar a entrada
   * por causa do cadastro só tiraria dele o caso de uso do tipo, que é preço
   * definido na hora. O cadastro zerado aqui é o cenário mais hostil, não o
   * normal: medido no tenant real (2026-09-11), 80 dos 191 produtos `'E'` têm
   * `PrecoVenda` > 0.
   */
  it("produto editável ('E') com preço zerado no ERP continua abrindo a prévia", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              Produto: respostaGetProduto({
                ProdutoPesavelEditavel: 'E',
                PrecoVenda: '0.0000',
              }),
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
        ),
      ),
    );
    const usuario = userEvent.setup();
    renderBarra();

    await usuario.type(screen.getByTestId('campo-codigo-produto'), '001234');
    await usuario.tab();

    await waitFor(() => {
      expect(screen.getByTestId('previa-preco-unitario')).toBeEnabled();
    });
    expect(useVendaStore.getState().linhas).toHaveLength(0);
  });
});

/**
 * Campos obrigatórios da prévia (pedido do usuário, 2026-09-04): sair de
 * quantidade, preço ou desconto vazio — ou com quantidade/preço zerados — avisa
 * e devolve o foco ao campo. Zero **é** válido no desconto, o estado normal de
 * um item sem desconto (decisão do usuário na mesma data).
 *
 * Os casos usam o lápis (`carregarParaEdicao`) para montar a prévia editável
 * sem `fetch`: é o mesmo estado em que a barra fica ao resolver um produto
 * `'E'` por TAB — `editavel` vem de `pesavelEditavel === 'E'` nos dois
 * caminhos.
 */
describe('EntradaRapidaProduto — campos obrigatórios da prévia (pedido do usuário, 2026-09-04)', () => {
  beforeEach(() => {
    useSessionStore.setState({ estado: 'pronto', registro: registroDeBootstrap() });
    useVendaStore.setState({ linhas: [], vendedorAtual: VENDEDOR_DE_TESTE });
    useVendaStore.getState().resetarAuditoria('NOVA');
    useEdicaoItemStore.setState({ linhaEmEdicao: null });
  });

  async function abrirPreviaEditavel(): Promise<void> {
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
      expect(screen.getByTestId('previa-quantidade')).toHaveFocus();
    });
  }

  it('quantidade vazia não deixa o foco sair do campo', async () => {
    const usuario = userEvent.setup();
    await abrirPreviaEditavel();

    await usuario.clear(screen.getByTestId('previa-quantidade'));
    await usuario.tab();

    // O foco chega a sair (o navegador termina o TAB) e volta em seguida —
    // por isso `waitFor`, e não uma asserção síncrona.
    await waitFor(() => {
      expect(screen.getByTestId('previa-quantidade')).toHaveFocus();
    });
    expect(screen.getByTestId('previa-confirmar')).toHaveAttribute('aria-disabled', 'true');
    // Enter também não insere com o campo vazio, e continua devolvendo o foco.
    await usuario.keyboard('{Enter}');
    expect(useVendaStore.getState().linhas[0]?.quantidade).toBe(2000);
  });

  it('quantidade zerada é recusada como se estivesse vazia', async () => {
    const usuario = userEvent.setup();
    await abrirPreviaEditavel();

    await usuario.clear(screen.getByTestId('previa-quantidade'));
    await usuario.type(screen.getByTestId('previa-quantidade'), '0');
    await usuario.tab();

    await waitFor(() => {
      expect(screen.getByTestId('previa-quantidade')).toHaveFocus();
    });
    expect(screen.getByTestId('previa-confirmar')).toHaveAttribute('aria-disabled', 'true');
  });

  it('preço unitário vazio ou zerado não deixa o foco sair do campo', async () => {
    const usuario = userEvent.setup();
    await abrirPreviaEditavel();

    await usuario.clear(screen.getByTestId('previa-preco-unitario'));
    await usuario.tab();

    await waitFor(() => {
      expect(screen.getByTestId('previa-preco-unitario')).toHaveFocus();
    });

    await usuario.type(screen.getByTestId('previa-preco-unitario'), '0,00');
    await usuario.tab();

    await waitFor(() => {
      expect(screen.getByTestId('previa-preco-unitario')).toHaveFocus();
    });
    expect(screen.getByTestId('previa-confirmar')).toHaveAttribute('aria-disabled', 'true');
    expect(useVendaStore.getState().linhas[0]?.precoUnitario).toBe(1000);
  });

  it('desconto vazio não deixa o foco sair do campo, mas 0,00 é aceito', async () => {
    const usuario = userEvent.setup();
    await abrirPreviaEditavel();

    await usuario.clear(screen.getByTestId('previa-desconto-item'));
    await usuario.tab();

    await waitFor(() => {
      expect(screen.getByTestId('previa-desconto-item')).toHaveFocus();
    });
    expect(screen.getByTestId('previa-confirmar')).toHaveAttribute('aria-disabled', 'true');

    // Zero é o item sem desconto — segue valendo, e confirma normalmente.
    await usuario.type(screen.getByTestId('previa-desconto-item'), '0,00');
    expect(screen.getByTestId('previa-confirmar')).not.toHaveAttribute('aria-disabled', 'true');
    await usuario.keyboard('{Enter}');

    const editada = useVendaStore.getState().linhas.find((linha) => linha.idLinha === 'linha-1');
    expect(editada?.descontoManual).toBe(0);
    expect(useEdicaoItemStore.getState().linhaEmEdicao).toBeNull();
  });
});

describe('EntradaRapidaProduto — TAB no campo de código (pedido do usuário, 2026-09-04)', () => {
  beforeEach(() => {
    useSessionStore.setState({ estado: 'pronto', registro: registroDeBootstrap() });
    useVendaStore.setState({ linhas: [], vendedorAtual: VENDEDOR_DE_TESTE });
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

/**
 * Venda sem vendedor não recebe produto (correção do usuário, 2026-09-10).
 *
 * O que estes casos travam é o **par**: a inserção não acontece **e** o foco
 * vai para o campo do vendedor. Recusar em silêncio, ou recusar sem apontar
 * para onde ir, deixaria o operador batendo no mesmo gesto — que é exatamente
 * o defeito que `lib/bloqueio.ts` existe para evitar.
 *
 * `pedidosDeFocoNoVendedor` é o que se observa em vez do foco real: quem foca é
 * `CampoVendedorVenda`, que não está montado aqui (são irmãos em `TelaDeVenda`,
 * não pai/filho) — o contrato entre os dois é o contador do `focoVendaStore`.
 */
describe('EntradaRapidaProduto — venda sem vendedor (correção do usuário, 2026-09-10)', () => {
  beforeEach(() => {
    useSessionStore.setState({ estado: 'pronto', registro: registroDeBootstrap() });
    useVendaStore.setState({ linhas: [], vendedorAtual: null });
    useVendaStore.getState().resetarAuditoria('NOVA');
    useEdicaoItemStore.setState({ linhaEmEdicao: null });
    useFocoVendaStore.setState({ pedidosDeFocoNoVendedor: 0 });
  });

  it('Enter no código não insere, não consulta o ERP e pede o foco no vendedor', async () => {
    const chamadas = vi.fn();
    vi.stubGlobal('fetch', chamadas);
    const usuario = userEvent.setup();
    renderBarra();

    await usuario.type(screen.getByTestId('campo-codigo-produto'), '001234{Enter}');

    expect(useVendaStore.getState().linhas).toHaveLength(0);
    // A recusa vem **antes** do `GetProduto`: consultar o ERP por um produto
    // que não pode entrar seria trabalho jogado fora.
    expect(chamadas).not.toHaveBeenCalled();
    expect(useFocoVendaStore.getState().pedidosDeFocoNoVendedor).toBe(1);

    vi.unstubAllGlobals();
  });

  it('TAB não chega a resolver o produto e também pede o foco no vendedor', async () => {
    const chamadas = vi.fn();
    vi.stubGlobal('fetch', chamadas);
    const usuario = userEvent.setup();
    renderBarra();

    await usuario.type(screen.getByTestId('campo-codigo-produto'), '001234');
    await usuario.tab();

    expect(chamadas).not.toHaveBeenCalled();
    expect(useVendaStore.getState().linhas).toHaveLength(0);
    expect(useFocoVendaStore.getState().pedidosDeFocoNoVendedor).toBe(1);

    vi.unstubAllGlobals();
  });

  it('o botão de inserir aparece bloqueado, com o motivo no título', () => {
    renderBarra();

    const inserir = screen.getByTestId('previa-confirmar');
    expect(inserir).toHaveAttribute('aria-disabled', 'true');
    expect(inserir).toHaveAttribute('title', expect.stringContaining('vendedor'));
  });

  it('cada tentativa pede o foco de novo — o contador não para no primeiro', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const usuario = userEvent.setup();
    renderBarra();

    const campo = screen.getByTestId('campo-codigo-produto');
    await usuario.type(campo, '001234{Enter}');
    await usuario.clear(campo);
    await usuario.type(campo, '005678{Enter}');

    // Um booleano no `focoVendaStore` não dispararia o efeito na segunda vez, e
    // o operador ficaria sem o foco justamente na tentativa em que insistiu.
    expect(useFocoVendaStore.getState().pedidosDeFocoNoVendedor).toBe(2);

    vi.unstubAllGlobals();
  });

  it('escolhido o vendedor, a mesma bipagem insere normalmente', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({ Produto: respostaGetProduto({ ProdutoPesavelEditavel: '' }) }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
        ),
      ),
    );
    const usuario = userEvent.setup();
    renderBarra();

    act(() => {
      useVendaStore.setState({ vendedorAtual: VENDEDOR_DE_TESTE });
    });
    await usuario.type(screen.getByTestId('campo-codigo-produto'), '001234{Enter}');

    await waitFor(() => {
      expect(useVendaStore.getState().linhas).toHaveLength(1);
    });
    // O botão volta a bloquear pelo motivo de sempre — campo vazio depois da
    // inserção —, e não mais pelo vendedor.
    expect(screen.getByTestId('previa-confirmar')).toHaveAttribute(
      'title',
      expect.not.stringContaining('vendedor'),
    );

    vi.unstubAllGlobals();
  });
});

/**
 * T016 (feature 016) — o modal de busca abre pelo `janelasStore`, e o campo de
 * busca fica focado pelo clique e pelo pedido do F4 (`FR-020`/`FR-021`).
 */
describe('EntradaRapidaProduto — abertura do modal de busca pelo janelasStore (016)', () => {
  beforeEach(() => {
    useSessionStore.setState({ estado: 'pronto', registro: registroDeBootstrap() });
    useVendaStore.setState({ linhas: [], vendedorAtual: VENDEDOR_DE_TESTE });
    useVendaStore.getState().resetarAuditoria('NOVA');
    useEdicaoItemStore.setState({ linhaEmEdicao: null });
  });

  it('o clique na lupa abre o modal com o campo de busca focado', async () => {
    const usuario = userEvent.setup();
    renderBarra();

    await usuario.click(screen.getByTestId('abrir-busca-produto'));

    expect(useJanelasStore.getState().janela).toBe('produto');
    await waitFor(() => {
      expect(screen.getByTestId('campo-busca-produto')).toHaveFocus();
    });
  });

  it('o pedido que chega pelo store — o caminho do F4 — abre o mesmo modal, com o mesmo foco', async () => {
    renderBarra();

    act(() => {
      useJanelasStore.getState().abrir('produto');
    });

    expect(await screen.findByTestId('modal-busca-produto')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('campo-busca-produto')).toHaveFocus();
    });
  });

  it('fechar o modal libera o store para a próxima janela', async () => {
    const usuario = userEvent.setup();
    renderBarra();
    act(() => {
      useJanelasStore.getState().abrir('produto');
    });
    await screen.findByTestId('campo-busca-produto');

    await usuario.keyboard('{Escape}');

    await waitFor(() => {
      expect(useJanelasStore.getState().janela).toBe('nenhuma');
    });
  });
});

/**
 * Saldo de estoque (AD-236): `FaturaProdutoSemSaldo = 'B'` não deixa entrar na
 * venda uma quantidade maior que o saldo — por **nenhum** caminho de inserção —
 * e o produto fica na barra como prévia bloqueada; `'A'` só avisa.
 */
describe('EntradaRapidaProduto — saldo de estoque (AD-236)', () => {
  const MOTIVO_SALDO = /estoque insuficiente/i;

  function comPolitica(politica: PoliticaSaldo) {
    const registro = registroDeBootstrap();
    return {
      ...registro,
      SessaoUsuario: { ...registro.SessaoUsuario, FaturaProdutoSemSaldo: politica },
    };
  }

  /** `GetProduto` com o saldo pedido; registra as URLs chamadas. */
  function stubarProduto(opcoes: { saldo: string; tipo?: string; urls?: string[] }): void {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        opcoes.urls?.push(url);
        if (url.includes('GetListaProdutos')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
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
              }),
              { status: 200, headers: { 'content-type': 'application/json' } },
            ),
          );
        }
        return Promise.resolve(
          new Response(
            JSON.stringify(
              respostaGetProduto({
                ProdutoPesavelEditavel: opcoes.tipo ?? '',
                Saldo: opcoes.saldo,
              }),
            ),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
        );
      }),
    );
  }

  function prepararVenda(politica: PoliticaSaldo): void {
    useSessionStore.setState({ estado: 'pronto', registro: comPolitica(politica) });
    useVendaStore.setState({ linhas: [], vendedorAtual: VENDEDOR_DE_TESTE });
    useVendaStore.getState().resetarAuditoria('NOVA');
    useEdicaoItemStore.setState({ linhaEmEdicao: null });
  }

  async function esperarPreviaBloqueada(): Promise<void> {
    await waitFor(() => {
      expect(screen.getByTestId('previa-descricao-produto')).toHaveTextContent(
        'PRODUTO EXEMPLO 500G',
      );
    });
    const inserir = screen.getByTestId('previa-confirmar');
    expect(inserir).toHaveAttribute('aria-disabled', 'true');
    expect(inserir).toHaveAttribute('title', expect.stringMatching(MOTIVO_SALDO));
    // O motivo fica no botão bloqueado e no toast — **não** numa linha abaixo
    // do nome do produto (pedido do usuário, 2026-09-16; AD-239).
    expect(screen.queryByTestId('previa-aviso-saldo')).not.toBeInTheDocument();
    expect(useVendaStore.getState().linhas).toHaveLength(0);
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("'B': Enter com saldo zero não insere e deixa o produto na barra como prévia bloqueada", async () => {
    prepararVenda('B');
    stubarProduto({ saldo: '0.000' });
    const erro = vi.spyOn(notificar, 'erro');
    const usuario = userEvent.setup();
    renderBarra();

    await usuario.type(screen.getByTestId('campo-codigo-produto'), '001234{Enter}');

    await esperarPreviaBloqueada();
    expect(erro).toHaveBeenCalledWith(expect.stringMatching(MOTIVO_SALDO));

    // Clicar no botão bloqueado explica o motivo e não insere (`lib/bloqueio.ts`).
    erro.mockClear();
    await usuario.click(screen.getByTestId('previa-confirmar'));
    expect(erro).toHaveBeenCalledWith(expect.stringMatching(MOTIVO_SALDO));
    expect(useVendaStore.getState().linhas).toHaveLength(0);
  });

  /**
   * AD-239: a linha de aviso abaixo do nome do produto saiu, e o toast passou a
   * ser o único canal — inclusive em `'B'`, onde antes o bloqueio só se
   * anunciava ao confirmar.
   */
  it("'B': aumentar a quantidade até cruzar o saldo avisa por toast, uma vez só", async () => {
    prepararVenda('B');
    // `'E'` (editável) para a prévia ficar aberta: um produto `''` entraria
    // direto no carrinho pelo TAB e não haveria `+` a exercitar.
    stubarProduto({ saldo: '2.000', tipo: 'E' });
    const erro = vi.spyOn(notificar, 'erro');
    const usuario = userEvent.setup();
    renderBarra();

    await usuario.type(screen.getByTestId('campo-codigo-produto'), '001234');
    await usuario.tab();
    await waitFor(() => {
      expect(screen.getByTestId('previa-quantidade')).toHaveValue('1,000');
    });
    erro.mockClear();

    // 1 → 2 ainda cabe no saldo; 2 → 3 cruza o limite.
    await usuario.click(screen.getByTestId('previa-quantidade-aumentar'));
    expect(erro).not.toHaveBeenCalled();

    await usuario.click(screen.getByTestId('previa-quantidade-aumentar'));
    expect(erro).toHaveBeenCalledTimes(1);
    expect(erro).toHaveBeenCalledWith(expect.stringMatching(MOTIVO_SALDO));

    // O terceiro "+" já está acima do saldo: não repete o toast.
    await usuario.click(screen.getByTestId('previa-quantidade-aumentar'));
    expect(erro).toHaveBeenCalledTimes(1);
  });

  /**
   * AD-239: confirmar com a quantidade bloqueada **reconsulta** o ERP em vez de
   * repetir o motivo antigo — o estoque pode ter sido reposto desde a última
   * consulta, e antes disso o operador precisava bipar o produto de novo.
   */
  it("'B': confirmar com o botão bloqueado reconsulta e insere quando o saldo foi reposto", async () => {
    prepararVenda('B');
    const urls: string[] = [];
    // Primeira consulta sem saldo, segunda (a reconsulta) com o estoque reposto.
    const saldos = ['0.000', '9.000'];
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        urls.push(url);
        return Promise.resolve(
          new Response(
            JSON.stringify(
              respostaGetProduto({
                ProdutoPesavelEditavel: '',
                Saldo: saldos.shift() ?? '9.000',
              }),
            ),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
        );
      }),
    );
    const usuario = userEvent.setup();
    renderBarra();

    await usuario.type(screen.getByTestId('campo-codigo-produto'), '001234{Enter}');
    await esperarPreviaBloqueada();

    await usuario.click(screen.getByTestId('previa-confirmar'));

    await waitFor(() => {
      expect(useVendaStore.getState().linhas).toHaveLength(1);
    });
    // A segunda chamada é a reconsulta por código interno (AD-236).
    expect(urls[1]).toContain('Tipocodproduto=R');
  });

  it("'B': TAB num produto não editável também para na prévia bloqueada", async () => {
    prepararVenda('B');
    stubarProduto({ saldo: '-205.000' });
    const usuario = userEvent.setup();
    renderBarra();

    await usuario.type(screen.getByTestId('campo-codigo-produto'), '001234');
    await usuario.tab();

    await esperarPreviaBloqueada();
  });

  it.each(['S', 'B'])("'B': TAB num pesável ('%s') também para na prévia bloqueada", async (tipo) => {
    prepararVenda('B');
    stubarProduto({ saldo: '0.000', tipo });
    const usuario = userEvent.setup();
    renderBarra();

    await usuario.type(screen.getByTestId('campo-codigo-produto'), '001234');
    await usuario.tab();

    await esperarPreviaBloqueada();
  });

  it("'B': produto não editável escolhido no modal não entra direto", async () => {
    prepararVenda('B');
    stubarProduto({ saldo: '0.000' });
    const usuario = userEvent.setup();
    renderBarra();

    await usuario.click(screen.getByTestId('abrir-busca-produto'));
    await usuario.type(screen.getByTestId('campo-busca-produto'), 'caneta');
    await usuario.click(await screen.findByTestId('candidato-produto'));

    await esperarPreviaBloqueada();
  });

  it("'B': código lido pela câmera não entra direto", async () => {
    prepararVenda('B');
    stubarProduto({ saldo: '0.000' });
    const usuario = userEvent.setup();
    const Wrapper = envolverComQueryClient();
    render(
      <Wrapper>
        <EntradaRapidaProduto
          renderizarCaptura={(aoLerCodigo) => (
            <button
              type="button"
              data-testid="camera-falsa"
              onClick={() => {
                aoLerCodigo('001234');
              }}
            >
              câmera
            </button>
          )}
        />
      </Wrapper>,
    );

    await usuario.click(screen.getByTestId('camera-falsa'));

    await esperarPreviaBloqueada();
  });

  it("'B': diminuir a quantidade para dentro do saldo libera o botão, e a confirmação reconsulta", async () => {
    prepararVenda('B');
    const urls: string[] = [];
    stubarProduto({ saldo: '2.000', urls });
    const usuario = userEvent.setup();
    renderBarra();

    await usuario.type(screen.getByTestId('campo-codigo-produto'), '001234*3{Enter}');
    await esperarPreviaBloqueada();
    expect(screen.getByTestId('previa-quantidade')).toHaveValue('3,000');

    await usuario.click(screen.getByTestId('previa-quantidade-diminuir'));

    expect(screen.getByTestId('previa-confirmar')).not.toHaveAttribute('aria-disabled');
    await usuario.click(screen.getByTestId('previa-confirmar'));

    await waitFor(() => {
      expect(useVendaStore.getState().linhas).toHaveLength(1);
    });
    expect(useVendaStore.getState().linhas[0]?.quantidade).toBe(2000);
    // Reconsulta na confirmação, pelo código interno — nunca pelo tipo da sessão.
    expect(urls).toHaveLength(2);
    expect(urls[1]).toContain('Tipocodproduto=R');
    expect(urls[1]).toContain('Codigoproduto=001234');
  });

  it("'B': aumentar pelo \"+\" além do saldo bloqueia na hora", async () => {
    prepararVenda('B');
    stubarProduto({ saldo: '1.000', tipo: 'E' });
    const usuario = userEvent.setup();
    renderBarra();

    await usuario.type(screen.getByTestId('campo-codigo-produto'), '001234{Enter}');
    await waitFor(() => {
      expect(screen.getByTestId('previa-preco-unitario')).toBeEnabled();
    });
    expect(screen.getByTestId('previa-confirmar')).not.toHaveAttribute('aria-disabled');

    await usuario.click(screen.getByTestId('previa-quantidade-aumentar'));

    expect(screen.getByTestId('previa-confirmar')).toHaveAttribute(
      'title',
      expect.stringMatching(MOTIVO_SALDO),
    );
  });

  it("'A': avisa e insere assim mesmo", async () => {
    prepararVenda('A');
    stubarProduto({ saldo: '0.000' });
    const aviso = vi.spyOn(notificar, 'aviso');
    const usuario = userEvent.setup();
    renderBarra();

    await usuario.type(screen.getByTestId('campo-codigo-produto'), '001234{Enter}');

    await waitFor(() => {
      expect(useVendaStore.getState().linhas).toHaveLength(1);
    });
    expect(aviso).toHaveBeenCalledOnce();
    expect(aviso).toHaveBeenCalledWith(expect.stringMatching(MOTIVO_SALDO));
  });

  it("'A': na prévia editável, o \"+\" que cruza o limite avisa uma vez, sem bloquear", async () => {
    prepararVenda('A');
    stubarProduto({ saldo: '1.000', tipo: 'E' });
    const aviso = vi.spyOn(notificar, 'aviso');
    const usuario = userEvent.setup();
    renderBarra();

    await usuario.type(screen.getByTestId('campo-codigo-produto'), '001234{Enter}');
    await waitFor(() => {
      expect(screen.getByTestId('previa-preco-unitario')).toBeEnabled();
    });
    expect(aviso).not.toHaveBeenCalled();

    await usuario.click(screen.getByTestId('previa-quantidade-aumentar'));
    await usuario.click(screen.getByTestId('previa-quantidade-aumentar'));

    // Cruzou uma vez (1 → 2); ir de 2 para 3 não cruza de novo.
    expect(aviso).toHaveBeenCalledOnce();
    expect(screen.getByTestId('previa-confirmar')).not.toHaveAttribute('aria-disabled');
  });

  it("'': nenhuma consulta extra e nenhum aviso, mesmo com saldo zero", async () => {
    prepararVenda('');
    const urls: string[] = [];
    stubarProduto({ saldo: '0.000', urls });
    const usuario = userEvent.setup();
    renderBarra();

    await usuario.type(screen.getByTestId('campo-codigo-produto'), '001234{Enter}');

    await waitFor(() => {
      expect(useVendaStore.getState().linhas).toHaveLength(1);
    });
    expect(urls).toHaveLength(1);
  });

  it("lápis: aumentar reconsulta o saldo (Tipocodproduto=R) e, em 'B', não altera a linha", async () => {
    prepararVenda('B');
    const urls: string[] = [];
    stubarProduto({ saldo: '1.000', urls });
    const linha = linhaDe({
      idLinha: 'linha-1',
      snapshot: snapshotDe({ pesavelEditavel: 'S', precoBase: 1000 }),
      quantidadeEmUnidades: 1,
    });
    useVendaStore.setState({ linhas: [linha] });
    const usuario = userEvent.setup();
    renderBarra();

    act(() => {
      useEdicaoItemStore.getState().carregarParaEdicao(linha);
    });
    await waitFor(() => {
      expect(screen.getByTestId('previa-quantidade')).toHaveValue('1,000');
    });

    await usuario.click(screen.getByTestId('previa-quantidade-aumentar'));
    await usuario.click(screen.getByTestId('previa-confirmar'));

    await waitFor(() => {
      expect(urls).toHaveLength(1);
    });
    expect(urls[0]).toContain('Tipocodproduto=R');
    expect(urls[0]).toContain('Codigoproduto=001234');
    await waitFor(() => {
      expect(screen.getByTestId('previa-confirmar')).toHaveAttribute(
        'title',
        expect.stringMatching(MOTIVO_SALDO),
      );
    });
    expect(useVendaStore.getState().linhas[0]?.quantidade).toBe(1000);
    // A barra continua com o item carregado para o operador corrigir.
    expect(useEdicaoItemStore.getState().linhaEmEdicao).not.toBeNull();

    // Diminuir de volta libera — a própria linha não conta na soma.
    await usuario.click(screen.getByTestId('previa-quantidade-diminuir'));
    expect(screen.getByTestId('previa-confirmar')).not.toHaveAttribute('aria-disabled');
  });

  it("lápis: diminuir nunca bloqueia, mesmo com a linha acima do saldo em 'B'", async () => {
    prepararVenda('B');
    stubarProduto({ saldo: '1.000' });
    const linha = linhaDe({
      idLinha: 'linha-1',
      snapshot: snapshotDe({ pesavelEditavel: 'S', precoBase: 1000 }),
      quantidadeEmUnidades: 5,
    });
    useVendaStore.setState({ linhas: [linha] });
    const usuario = userEvent.setup();
    renderBarra();

    act(() => {
      useEdicaoItemStore.getState().carregarParaEdicao(linha);
    });
    await waitFor(() => {
      expect(screen.getByTestId('previa-quantidade')).toHaveValue('5,000');
    });

    await usuario.click(screen.getByTestId('previa-quantidade-diminuir'));
    await usuario.click(screen.getByTestId('previa-confirmar'));

    await waitFor(() => {
      expect(useVendaStore.getState().linhas[0]?.quantidade).toBe(4000);
    });
    expect(useEdicaoItemStore.getState().linhaEmEdicao).toBeNull();
  });
});
