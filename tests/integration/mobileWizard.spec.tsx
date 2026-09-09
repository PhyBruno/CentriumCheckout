import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { AppShell } from '../../src/client/layout/AppShell';
import { useFocoVendaStore } from '../../src/client/stores/focoVendaStore';
import { useSessionStore } from '../../src/client/stores/sessionStore';
import { abrirSessaoDeVenda, useVendaStore } from '../../src/client/stores/vendaStore';
import {
  definirLayoutInicial,
  instalarMatchMediaDeLayout,
  renderizarComProvedores,
} from '../support/layout';
import { pagamentoDe } from '../support/pagamento';
import { linhaDe } from '../support/precificacao';
import { registroBootstrapDe } from '../support/sessao';

/**
 * T018 — navegação em etapas no mobile (`US2`, `quickstart.md` §3).
 *
 * O cenário do quickstart inteiro: avançar até a etapa 3, voltar à 1, alterar um
 * dado e conferir que a alteração aparece na revisão. É o que separa "wizard" de
 * "três telas que se lembram de nada": as etapas são janelas sobre o **mesmo**
 * `vendaStore`, nunca cópias tiradas na entrada de cada etapa.
 */
function renderizarWizard(): void {
  renderizarComProvedores(
    <AppShell
      onRecarregarBootstrap={() => {
        /* fora do assunto deste teste */
      }}
    />,
  );
}

/**
 * Deixa o saldo da venda coberto — pré-condição para **entrar na etapa 3**
 * desde 2026-09-09 (pedido do usuário: não se revisa uma venda que ainda não
 * fecha).
 *
 * A venda destes cenários vale R$ 100,00 (`beforeEach`); quem acrescenta item
 * passa o valor maior. Um pagamento `APROVADO` em dinheiro é o mínimo que
 * `calcularSaldo` aceita como cobertura — pagar a mais também serve, porque o
 * saldo restante nunca fica negativo.
 */
function cobrirSaldo(valorAplicado = 10_000): void {
  act(() => {
    useVendaStore.setState({ pagamentos: [pagamentoDe({ valorAplicado })] });
  });
}

beforeAll(() => {
  instalarMatchMediaDeLayout();
});

beforeEach(() => {
  definirLayoutInicial('mobile');
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('rede desligada no teste')));
  useSessionStore.setState({ estado: 'pronto', registro: registroBootstrapDe() });
  useVendaStore.setState({
    linhas: [linhaDe({ idLinha: 'linha-1', precoUnitario: 10_000, quantidadeEmUnidades: 1 })],
    clienteAtual: null,
    houveEscolhaExplicita: false,
    vendedorAtual: null,
    condicaoSelecionada: null,
    descontoCapa: null,
    pagamentos: [],
  });
  useVendaStore.getState().resetarAuditoria('NOVA');
});

describe('MobileWizard — navegação', () => {
  it('começa sempre na etapa 1 (I1)', () => {
    renderizarWizard();

    expect(screen.getByTestId('etapa-cliente-produtos')).toBeInTheDocument();
    expect(screen.getByTestId('indicador-etapa')).toHaveTextContent('1/3');
  });

  it('avança 1 → 2 → 3 e volta livremente a qualquer etapa já visitada (FR-004)', async () => {
    const usuario = userEvent.setup();
    cobrirSaldo();
    renderizarWizard();

    await usuario.click(screen.getByTestId('wizard-avancar'));
    expect(screen.getByTestId('etapa-pagamento')).toBeInTheDocument();
    expect(screen.getByTestId('indicador-etapa')).toHaveTextContent('2/3');

    await usuario.click(screen.getByTestId('wizard-avancar'));
    expect(screen.getByTestId('etapa-revisao')).toBeInTheDocument();
    expect(screen.getByTestId('indicador-etapa')).toHaveTextContent('3/3');

    // Salto direto da 3 para a 1, sem passar pela 2: é isso que "livremente"
    // quer dizer — não há validação de campo obrigatório barrando o retorno.
    await usuario.click(screen.getByTestId('ir-para-etapa-1'));
    expect(screen.getByTestId('etapa-cliente-produtos')).toBeInTheDocument();
    expect(screen.getByTestId('indicador-etapa')).toHaveTextContent('1/3');
  });

  it('não oferece atalho para uma etapa nunca visitada', () => {
    renderizarWizard();

    // Da etapa 1, ninguém esteve na 2 nem na 3: as barras delas são traço, não
    // botão. O caminho para frente é o "avançar", que marca a visita.
    expect(screen.queryByTestId('ir-para-etapa-2')).toBeNull();
    expect(screen.queryByTestId('ir-para-etapa-3')).toBeNull();
  });

  it('a alteração feita na etapa 1 aparece na revisão (quickstart §3)', async () => {
    const usuario = userEvent.setup();
    // R$ 125,00 já cobertos: o cenário acrescenta um item de R$ 25,00 no meio
    // do caminho e volta à etapa 3, que desde 2026-09-09 exige saldo zerado.
    // Pagar o total final desde o começo mantém as duas entradas na revisão
    // liberadas sem inventar um segundo gesto de pagamento no meio do teste.
    cobrirSaldo(12_500);
    renderizarWizard();

    await usuario.click(screen.getByTestId('wizard-avancar'));
    await usuario.click(screen.getByTestId('wizard-avancar'));
    expect(screen.getByTestId('conferencia-produtos')).toHaveTextContent('1 item');

    await usuario.click(screen.getByTestId('ir-para-etapa-1'));

    // Um item a mais, pelo mesmo store que o carrinho já usa — a alteração não
    // passa pelo wizard, e é justamente esse o ponto.
    act(() => {
      useVendaStore.setState((estado) => ({
        linhas: [
          ...estado.linhas,
          linhaDe({ idLinha: 'linha-2', precoUnitario: 2_500, quantidadeEmUnidades: 1 }),
        ],
      }));
    });

    await usuario.click(screen.getByTestId('ir-para-etapa-3'));

    expect(screen.getByTestId('conferencia-produtos')).toHaveTextContent('2 itens');
    expect(screen.getByTestId('conferencia-produtos')).toHaveTextContent('R$ 125,00');
  });

  it('trocar de etapa nunca mexe no estado da venda (I5)', async () => {
    const usuario = userEvent.setup();
    renderizarWizard();

    const antes = useVendaStore.getState();

    await usuario.click(screen.getByTestId('wizard-avancar'));
    await usuario.click(screen.getByTestId('wizard-avancar'));
    await usuario.click(screen.getByTestId('ir-para-etapa-1'));

    const depois = useVendaStore.getState();
    expect(depois.linhas).toBe(antes.linhas);
    expect(depois.clienteAtual).toBe(antes.clienteAtual);
    expect(depois.pagamentos).toBe(antes.pagamentos);
    expect(depois.eventos).toBe(antes.eventos);
  });
});

describe('MobileWizard — invariantes de navegação (data-model §2)', () => {
  it('etapasVisitadas só cresce: voltar não apaga o atalho para onde já se esteve (I2)', async () => {
    const usuario = userEvent.setup();
    cobrirSaldo();
    renderizarWizard();

    await usuario.click(screen.getByTestId('wizard-avancar'));
    await usuario.click(screen.getByTestId('wizard-avancar'));
    await usuario.click(screen.getByTestId('ir-para-etapa-1'));

    // De volta à etapa 1, os atalhos para 2 e 3 continuam de pé. Se o conjunto
    // encolhesse ao sair de uma etapa, a segunda ida ao pagamento viraria
    // navegação recusada — e `FR-004` deixaria de valer no gesto mais comum de
    // todos, que é corrigir um item e voltar a cobrar.
    expect(screen.getByTestId('ir-para-etapa-2')).toBeInTheDocument();
    expect(screen.getByTestId('ir-para-etapa-3')).toBeInTheDocument();

    await usuario.click(screen.getByTestId('ir-para-etapa-3'));
    expect(screen.getByTestId('etapa-revisao')).toBeInTheDocument();
    // E a barra da etapa em que se está nunca é botão: não há para onde ir.
    expect(screen.queryByTestId('ir-para-etapa-3')).toBeNull();
  });

  it('voltar é permitido com a venda incompleta — cliente e vendedor não barram o retorno (I3)', async () => {
    const usuario = userEvent.setup();
    // Sem cliente, sem vendedor e sem condição: a venda mais incompleta que
    // ainda tem item e saldo coberto. É exatamente o operador que **precisa**
    // circular entre as etapas para completá-la que uma validação prenderia.
    //
    // O pagamento entra porque a etapa 3 passou a exigir saldo zerado
    // (2026-09-09) — o que I3 continua garantindo é que nenhum **campo de
    // cadastro** (cliente, vendedor, condição) barra a navegação.
    act(() => {
      useVendaStore.setState({
        clienteAtual: null,
        vendedorAtual: null,
        condicaoSelecionada: null,
        pagamentos: [pagamentoDe({ valorAplicado: 10_000 })],
      });
    });
    renderizarWizard();

    await usuario.click(screen.getByTestId('wizard-avancar'));
    await usuario.click(screen.getByTestId('wizard-avancar'));
    expect(screen.getByTestId('etapa-revisao')).toBeInTheDocument();
    // A revisão admite os vazios em texto, em vez de recusar a etapa.
    expect(screen.getByTestId('conferencia-cliente')).toHaveTextContent('Não identificado');
    expect(screen.getByTestId('conferencia-vendedor')).toHaveTextContent('Não selecionado');

    await usuario.click(screen.getByTestId('ir-para-etapa-1'));
    expect(screen.getByTestId('etapa-cliente-produtos')).toBeInTheDocument();
    await usuario.click(screen.getByTestId('ir-para-etapa-3'));
    expect(screen.getByTestId('etapa-revisao')).toBeInTheDocument();
  });

  it('a venda seguinte começa na etapa 1, e não onde a anterior terminou (I1)', async () => {
    const usuario = userEvent.setup();
    cobrirSaldo();
    renderizarWizard();

    await usuario.click(screen.getByTestId('wizard-avancar'));
    await usuario.click(screen.getByTestId('wizard-avancar'));
    expect(screen.getByTestId('etapa-revisao')).toBeInTheDocument();

    // O desfecho de `useFinalizarOuSuspenderVenda` no caminho feliz: carrinho
    // zerado e uma sessão de venda nova aberta **na mesma tela**, sem trocar de
    // rota e sem desmontar o wizard. `data-model.md` §2 supunha um desmonte que
    // não acontece — e sem ele o operador ficava parado na "Revisão e
    // finalização" de uma venda vazia, com o campo de código uma etapa atrás.
    act(() => {
      useVendaStore.setState({
        linhas: [],
        clienteAtual: null,
        houveEscolhaExplicita: false,
        vendedorAtual: null,
        condicaoSelecionada: null,
        descontoCapa: null,
        pagamentos: [],
      });
      abrirSessaoDeVenda('NOVA');
    });

    expect(screen.getByTestId('etapa-cliente-produtos')).toBeInTheDocument();
    expect(screen.getByTestId('indicador-etapa')).toHaveTextContent('1/3');
    // E as visitas da venda anterior não sobrevivem a ela: não há para onde
    // "voltar" numa venda que acabou de nascer.
    expect(screen.queryByTestId('ir-para-etapa-2')).toBeNull();
    expect(screen.queryByTestId('ir-para-etapa-3')).toBeNull();
  });

  it('a etapa não se reinicia no meio da venda em andamento', async () => {
    const usuario = userEvent.setup();
    renderizarWizard();

    await usuario.click(screen.getByTestId('wizard-avancar'));
    expect(screen.getByTestId('etapa-pagamento')).toBeInTheDocument();

    // Eventos de auditoria continuam entrando durante a venda (cada item, cada
    // troca de cliente). Se o reinício se pendurasse no histórico em vez de na
    // identidade da sessão, o operador seria jogado de volta à etapa 1 a cada
    // bipagem.
    act(() => {
      useVendaStore.setState((estado) => ({
        linhas: [
          ...estado.linhas,
          linhaDe({ idLinha: 'linha-2', precoUnitario: 2_500, quantidadeEmUnidades: 1 }),
        ],
      }));
    });

    expect(screen.getByTestId('etapa-pagamento')).toBeInTheDocument();
    expect(screen.getByTestId('indicador-etapa')).toHaveTextContent('2/3');
  });
});

/**
 * As duas recusas de navegação pedidas pelo usuário em 2026-09-09.
 *
 * São de **navegação**, não de finalização: o que elas evitam é o passo em
 * falso — abrir o pagamento de uma venda vazia, ou a conferência de uma venda
 * que ainda não fecha. Quem recusa faturar continua sendo `AcoesFinaisVenda`.
 */
describe('MobileWizard — recusa de avanço', () => {
  it('sem produto ativo, avançar é recusado e o foco volta ao código (item 1)', async () => {
    const usuario = userEvent.setup();
    // Carrinho com a linha **cancelada**: é o caso relatado ("todos deletados").
    // A linha permanece no array por rastreabilidade (`CART-08`), então contar
    // `linhas` em vez de `linhasAtivas` deixaria este cenário passar.
    act(() => {
      useVendaStore.setState({
        linhas: [linhaDe({ idLinha: 'linha-1', precoUnitario: 10_000, cancelada: true })],
      });
    });
    renderizarWizard();

    const pedidosAntes = useFocoVendaStore.getState().pedidosDeFocoNoCodigo;
    const avancar = screen.getByTestId('wizard-avancar');
    expect(avancar).toHaveAttribute('aria-disabled', 'true');
    expect(avancar).toHaveAttribute(
      'title',
      'Insira ao menos um produto na venda antes de avançar para o pagamento.',
    );

    await usuario.click(avancar);

    // Continua na etapa 1 — e o foco foi pedido de volta para a barra de
    // entrada, que é o único lugar onde o operador resolve a recusa.
    expect(screen.getByTestId('etapa-cliente-produtos')).toBeInTheDocument();
    expect(useFocoVendaStore.getState().pedidosDeFocoNoCodigo).toBe(pedidosAntes + 1);
  });

  it('com saldo em aberto, revisar é recusado (item 2)', async () => {
    const usuario = userEvent.setup();
    renderizarWizard();

    // Etapa 2 está liberada: há produto. É só a revisão que espera o pagamento.
    await usuario.click(screen.getByTestId('wizard-avancar'));
    expect(screen.getByTestId('etapa-pagamento')).toBeInTheDocument();

    const revisar = screen.getByTestId('wizard-avancar');
    expect(revisar).toHaveAttribute('aria-disabled', 'true');
    expect(revisar).toHaveAttribute(
      'title',
      'Adicione formas de pagamento que cubram todo o valor da venda antes de revisar.',
    );

    await usuario.click(revisar);
    expect(screen.getByTestId('etapa-pagamento')).toBeInTheDocument();
    expect(screen.queryByTestId('etapa-revisao')).toBeNull();
  });

  it('pagar a mais libera a revisão: o troco fecha a venda igual ao valor exato', async () => {
    const usuario = userEvent.setup();
    // R$ 150,00 recebidos numa venda de R$ 100,00 — `calcularSaldo` nunca deixa
    // o saldo restante negativo, então a cobertura é a mesma.
    cobrirSaldo(15_000);
    renderizarWizard();

    await usuario.click(screen.getByTestId('wizard-avancar'));
    await usuario.click(screen.getByTestId('wizard-avancar'));

    expect(screen.getByTestId('etapa-revisao')).toBeInTheDocument();
  });
});

describe('MobileWizard — cabeçalho', () => {
  it('põe o cancelamento da venda no cabeçalho, e não no rodapé (AD-089)', () => {
    renderizarWizard();

    const cabecalho = screen.getByTestId('cabecalho-mobile');
    expect(cabecalho).toContainElement(screen.getByTestId('botao-cancelar-venda'));
    // O paliativo da 004 (`AcoesVendaCompactas`) saiu com esta feature.
    expect(screen.queryByTestId('acoes-venda-compactas')).toBeNull();
  });

  it('mostra o operador da sessão, como a barra superior do desktop', () => {
    renderizarWizard();

    expect(screen.getByTestId('operador-da-sessao')).toHaveTextContent('Bruno');
  });

  it('traz o nome do produto sozinho, sem a empresa (nó `YXaRZ`)', () => {
    renderizarWizard();

    const cabecalho = screen.getByTestId('cabecalho-mobile');

    // O desktop mostra "Centrium Checkout - Organizações Tabajara"; aqui a
    // empresa fica de fora **por desenho**, e não por corte. É o que impede o
    // título de virar "Centrium …" em 390px, perdendo as duas informações de
    // uma vez.
    expect(cabecalho).toHaveTextContent('Centrium Checkout');
    expect(cabecalho).not.toHaveTextContent('Organizações Tabajara');

    // A segunda linha continua respondendo "qual caixa, qual PDV".
    // `rotularPdv` normaliza `CadMaqCod: 'PDV01'` para "PDV 01".
    expect(cabecalho).toHaveTextContent('Caixa 03 • PDV 01');
  });
});
