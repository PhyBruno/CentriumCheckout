import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CampoClienteVenda } from '../../../../src/client/features/cliente/CampoClienteVenda';
import { clienteCheckoutDe } from '../../../support/cliente';
import { linhaDe } from '../../../support/precificacao';
import { useFocoVendaStore } from '../../../../src/client/stores/focoVendaStore';
import { useSessionStore } from '../../../../src/client/stores/sessionStore';
import { useVendaStore } from '../../../../src/client/stores/vendaStore';

/**
 * Pedido do usuário (2026-09-04): Shift+TAB no campo de código de produto volta
 * para a identificação do cliente, e não para o botão "Recolhido" do cabeçalho.
 * O gesto chega aqui pelo `focoVendaStore` (os dois cards são irmãos em
 * `TelaDeVenda`, sem relação de pai/filho); este spec cobre a metade que é
 * deste componente — expandir o card e focar o campo.
 */

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

function renderCard() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }): ReactNode =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return render(createElement(Wrapper, null, createElement(CampoClienteVenda)));
}

describe('CampoClienteVenda — foco pedido de fora (pedido do usuário, 2026-09-04)', () => {
  beforeEach(() => {
    useSessionStore.setState({ estado: 'pronto', registro: registroDeBootstrap() });
    useVendaStore.setState({ linhas: [] });
    useVendaStore.getState().resetarAuditoria('NOVA');
    useFocoVendaStore.setState({ pedidosDeFocoNoDocumento: 0 });
  });

  it('expande o card recolhido e foca o campo de código/CPF do cliente', async () => {
    renderCard();

    // Nasce recolhido (pedido do usuário, 2026-09-03): o campo existe no DOM,
    // mas está `inert` — não é alcançável por TAB nem por `focus()`.
    expect(screen.getByTestId('alternar-cliente-expandido')).toHaveAttribute(
      'aria-expanded',
      'false',
    );

    act(() => {
      useFocoVendaStore.getState().focarDocumentoCliente();
    });

    await waitFor(() => {
      expect(screen.getByTestId('campo-documento-cliente')).toHaveFocus();
    });
    expect(screen.getByTestId('alternar-cliente-expandido')).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByTestId('campos-cliente-venda')).not.toHaveAttribute('inert');
  });

  it('um segundo pedido volta a focar o campo — o contador não fica preso no primeiro', async () => {
    renderCard();

    act(() => {
      useFocoVendaStore.getState().focarDocumentoCliente();
    });
    await waitFor(() => {
      expect(screen.getByTestId('campo-documento-cliente')).toHaveFocus();
    });

    act(() => {
      screen.getByTestId('abrir-busca-cliente').focus();
    });
    expect(screen.getByTestId('campo-documento-cliente')).not.toHaveFocus();

    act(() => {
      useFocoVendaStore.getState().focarDocumentoCliente();
    });
    await waitFor(() => {
      expect(screen.getByTestId('campo-documento-cliente')).toHaveFocus();
    });
  });

  /**
   * Achado ao exercitar contra o ERP real (2026-09-10, AD-209).
   *
   * A primeira versão focava a lupa de dentro do próprio `CampoVendedorVenda`,
   * e o spec daquele componente o montava **solto** — fora do card. Com o card
   * recolhido, que é o estado em que ele nasce, o `focus()` cai num subtree
   * `inert` e o navegador o ignora sem erro: a bipagem era recusada com o aviso
   * certo e o foco ficava parado no campo de código.
   *
   * Por isso o caso vive aqui e monta o card de verdade: é o card que possui o
   * `inert`, e é montando-o recolhido que a regressão volta a aparecer.
   */
  it('pedido de foco no vendedor expande o card recolhido e foca a lupa (AD-209)', async () => {
    useFocoVendaStore.setState({ pedidosDeFocoNoVendedor: 0 });
    renderCard();

    expect(screen.getByTestId('alternar-cliente-expandido')).toHaveAttribute(
      'aria-expanded',
      'false',
    );

    act(() => {
      useFocoVendaStore.getState().focarVendedor();
    });

    await waitFor(() => {
      expect(screen.getByTestId('abrir-busca-vendedor')).toHaveFocus();
    });
    expect(screen.getByTestId('alternar-cliente-expandido')).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByTestId('campos-cliente-venda')).not.toHaveAttribute('inert');
  });

  it('cada pedido de foco no vendedor volta a focar a lupa', async () => {
    useFocoVendaStore.setState({ pedidosDeFocoNoVendedor: 0 });
    renderCard();

    act(() => {
      useFocoVendaStore.getState().focarVendedor();
    });
    await waitFor(() => {
      expect(screen.getByTestId('abrir-busca-vendedor')).toHaveFocus();
    });

    act(() => {
      screen.getByTestId('campo-documento-cliente').focus();
    });
    expect(screen.getByTestId('abrir-busca-vendedor')).not.toHaveFocus();

    act(() => {
      useFocoVendaStore.getState().focarVendedor();
    });
    await waitFor(() => {
      expect(screen.getByTestId('abrir-busca-vendedor')).toHaveFocus();
    });
  });
});

/**
 * Correção do usuário (2026-09-08, AD-181): a pílula do cabeçalho lia
 * `SessaoUsuario.VendedorNome` — o default do PDV — e ficava presa nele depois
 * de o operador trocar o vendedor da venda no campo logo abaixo.
 */
describe('CampoClienteVenda — a pílula de vendedor segue o vendedor da venda', () => {
  beforeEach(() => {
    useSessionStore.setState({ estado: 'pronto', registro: registroDeBootstrap() });
    useVendaStore.setState({ linhas: [], vendedorAtual: null });
    useVendaStore.getState().resetarAuditoria('NOVA');
    useFocoVendaStore.setState({ pedidosDeFocoNoDocumento: 0 });
  });

  it('não aparece enquanto a venda não tem vendedor (FR-006)', () => {
    renderCard();

    expect(screen.queryByTestId('pilula-vendedor')).toBeNull();
  });

  it('mostra o vendedor da venda, e acompanha a troca', () => {
    renderCard();

    act(() => {
      useVendaStore.getState().trocarVendedor({ codigo: 21, nome: 'Mariana Alves' }, 'RASCUNHO');
    });
    expect(screen.getByTestId('pilula-vendedor')).toHaveTextContent('Mariana Alves');

    act(() => {
      useVendaStore.getState().selecionarVendedor({ codigo: 35, nome: 'Marta Souza' });
    });
    expect(screen.getByTestId('pilula-vendedor')).toHaveTextContent('Marta Souza');
  });

  it('cai no código quando o vendedor veio sem nome (AD-095)', () => {
    renderCard();

    act(() => {
      useVendaStore.getState().trocarVendedor({ codigo: 12, nome: null }, 'DAV');
    });
    expect(screen.getByTestId('pilula-vendedor')).toHaveTextContent('Vendedor #12');
  });
});

/**
 * Correção do usuário (2026-09-10), duas metades da mesma regra:
 *
 * 1. **Código digitado + sair do campo carrega o cliente novo.** O `onBlur`
 *    identifica desde 2026-09-03 — o que este spec acrescenta é a trava: sem um
 *    caso automatizado, a consulta pelo **código** (e não só pelo CPF) segue
 *    dependendo de alguém repetir o gesto à mão.
 * 2. **Com item na venda, o cliente não muda mais.** A lista de preço já valeu
 *    na precificação de cada linha (`AVISO_CLIENTE_COM_ITEM`).
 */
describe('CampoClienteVenda — troca de cliente (correção do usuário, 2026-09-10)', () => {
  beforeEach(() => {
    useSessionStore.setState({ estado: 'pronto', registro: registroDeBootstrap() });
    useVendaStore.setState({ linhas: [], clienteAtual: null, houveEscolhaExplicita: false });
    useVendaStore.getState().resetarAuditoria('NOVA');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubarGetCliente(): ReturnType<typeof vi.fn> {
    const chamadas = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ Cliente: clienteCheckoutDe({ CodCliente: 2538 }) }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    vi.stubGlobal('fetch', chamadas);
    return chamadas;
  }

  async function abrirCard(usuario: ReturnType<typeof userEvent.setup>): Promise<void> {
    await usuario.click(screen.getByTestId('alternar-cliente-expandido'));
  }

  it('digitar o código e sair do campo carrega o cliente novo', async () => {
    const chamadas = stubarGetCliente();
    const usuario = userEvent.setup();
    renderCard();
    await abrirCard(usuario);

    await usuario.type(screen.getByTestId('campo-documento-cliente'), '2538');
    await usuario.tab();

    await waitFor(() => {
      expect(useVendaStore.getState().clienteAtual?.codigoCliente).toBe(2538);
    });
    // Pelo **código**, não pelo documento: `GetCliente` tem um parâmetro para
    // cada caso, e trocá-los buscaria outro cadastro.
    expect(String(chamadas.mock.calls[0]?.[0])).toContain('CodCliente=2538');
  });

  it('com item na venda, o campo fica bloqueado e o código digitado não troca o cliente', async () => {
    const chamadas = stubarGetCliente();
    const usuario = userEvent.setup();
    renderCard();
    await abrirCard(usuario);

    act(() => {
      useVendaStore.setState({ linhas: [linhaDe({})] });
    });

    const campo = screen.getByTestId('campo-documento-cliente');
    expect(campo).toHaveAttribute('aria-disabled', 'true');
    expect(campo).toHaveAttribute('title', expect.stringContaining('lista de preço'));
    expect(screen.getByTestId('identificar-cliente')).toHaveAttribute('aria-disabled', 'true');

    // Nem o ERP é consultado: trocar o cliente é o que está fechado, e buscar
    // o cadastro só para recusá-lo depois seria uma ida de rede desperdiçada.
    expect(chamadas).not.toHaveBeenCalled();
    expect(useVendaStore.getState().clienteAtual).toBeNull();
  });

  it('o slice recusa a troca mesmo por fora do campo — a regra não mora na UI', async () => {
    useVendaStore.setState({ linhas: [linhaDe({})] });

    const resultado = await useVendaStore
      .getState()
      .selecionarCliente(clienteCheckoutDe({ CodCliente: 2538 }), 'BUSCA_LIVRE');

    expect(resultado).toBe('bloqueado');
    expect(useVendaStore.getState().clienteAtual).toBeNull();
  });

  it('a importação de documento continua podendo associar o cliente por cima das linhas', async () => {
    // `importarVendaExistente` insere as linhas congeladas **antes** de
    // associar o cliente do documento: bloquear `'DAV'`/`'RASCUNHO'` deixaria
    // todo DAV importado com o cliente default, em silêncio.
    useVendaStore.setState({ linhas: [linhaDe({ precoCongelado: true, origem: 'DAV' })] });

    const resultado = await useVendaStore
      .getState()
      .selecionarCliente(clienteCheckoutDe({ CodCliente: 2538 }), 'DAV');

    expect(resultado).toBe('aplicado');
    expect(useVendaStore.getState().clienteAtual?.codigoCliente).toBe(2538);
  });

  /**
   * Correção do usuário (2026-09-10): "se dá erro de cliente não existe, o foco
   * não está voltando para a inserção do código do cliente".
   *
   * O caso é o do ERP real: `GetCliente` não devolve `404` — devolve `200` com
   * o cadastro em branco, que vira `ErroClienteIncompleto` e chega aqui como
   * `situacao: 'recusado'` (AD-204). Esse era o único desfecho de recusa que
   * deixava o foco cair fora do campo, com o número errado ainda em tela.
   */
  it('cadastro em branco do ERP devolve o foco ao campo, sem apagar o que foi digitado', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          // O corpo real do ERP: acha o código, devolve tudo vazio.
          new Response(JSON.stringify({ CodCliente: 1470, nome: '', cpf: '', ListaPreco: 1 }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        ),
      ),
    );
    const usuario = userEvent.setup();
    renderCard();
    await abrirCard(usuario);

    const campo = screen.getByTestId('campo-documento-cliente');
    await usuario.type(campo, '1470');
    await usuario.tab();

    await waitFor(() => {
      expect(screen.getByTestId('campo-documento-cliente')).toHaveFocus();
    });
    // O valor permanece: o caixa corrige o dígito errado, não redigita tudo.
    expect(screen.getByTestId('campo-documento-cliente')).toHaveValue('1470');
    expect(useVendaStore.getState().clienteAtual).toBeNull();
  });

  it('entrada inválida também prende o foco no campo, como a letra (AD-182)', async () => {
    const chamadas = vi.fn();
    vi.stubGlobal('fetch', chamadas);
    const usuario = userEvent.setup();
    renderCard();
    await abrirCard(usuario);

    // 12 dígitos: nem código (até 6) nem CPF (11) — recusado antes do ERP.
    await usuario.type(screen.getByTestId('campo-documento-cliente'), '123456789012');
    await usuario.tab();

    await waitFor(() => {
      expect(screen.getByTestId('campo-documento-cliente')).toHaveFocus();
    });
    expect(chamadas).not.toHaveBeenCalled();
  });

  it('linha cancelada não conta: com o item cancelado o cliente volta a ser trocável', async () => {
    useVendaStore.setState({ linhas: [linhaDe({ cancelada: true })] });

    const resultado = await useVendaStore
      .getState()
      .selecionarCliente(clienteCheckoutDe({ CodCliente: 2538 }), 'BUSCA_LIVRE');

    expect(resultado).toBe('aplicado');
  });
});
