import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { AppShell } from '../../src/client/layout/AppShell';
import { notificar } from '../../src/client/lib/notificar';
import { useEtapaVendaStore } from '../../src/client/stores/etapaVendaStore';
import { useFocoVendaStore } from '../../src/client/stores/focoVendaStore';
import { useSessionStore } from '../../src/client/stores/sessionStore';
import { abrirSessaoDeVenda, useVendaStore } from '../../src/client/stores/vendaStore';
import {
  definirLayoutInicial,
  instalarMatchMediaDeLayout,
  renderizarComProvedores,
} from '../support/layout';
import { motivoCarrinhoBloqueado } from '../../src/client/stores/slices/carrinhoSlice';
import { condicaoDe, pagamentoDe } from '../support/pagamento';
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

  it('com a venda ainda editável, volta livremente para a etapa 1 (FR-004)', async () => {
    const usuario = userEvent.setup();
    renderizarWizard();

    await usuario.click(screen.getByTestId('wizard-avancar'));
    expect(screen.getByTestId('etapa-pagamento')).toBeInTheDocument();
    expect(screen.getByTestId('indicador-etapa')).toHaveTextContent('2/3');

    // Sem condição, sem desconto e sem forma aprovada: nenhum campo de cadastro
    // incompleto barra o retorno, que é o que `FR-004` sempre quis dizer.
    await usuario.click(screen.getByTestId('ir-para-etapa-1'));
    expect(screen.getByTestId('etapa-cliente-produtos')).toBeInTheDocument();
    expect(screen.getByTestId('indicador-etapa')).toHaveTextContent('1/3');
  });

  it('avança 1 → 2 → 3 e volta da revisão para o pagamento', async () => {
    const usuario = userEvent.setup();
    cobrirSaldo();
    renderizarWizard();

    await usuario.click(screen.getByTestId('wizard-avancar'));
    expect(screen.getByTestId('etapa-pagamento')).toBeInTheDocument();
    expect(screen.getByTestId('indicador-etapa')).toHaveTextContent('2/3');

    await usuario.click(screen.getByTestId('wizard-avancar'));
    expect(screen.getByTestId('etapa-revisao')).toBeInTheDocument();
    expect(screen.getByTestId('indicador-etapa')).toHaveTextContent('3/3');

    // A venda já está cobrada, e a volta que resta é para o pagamento — onde
    // fica o "Limpar" que a destrava. O retorno à etapa 1 é assunto do describe
    // "venda em cobrança" abaixo (2026-09-15).
    await usuario.click(screen.getByTestId('ir-para-etapa-2'));
    expect(screen.getByTestId('etapa-pagamento')).toBeInTheDocument();
    expect(screen.getByTestId('indicador-etapa')).toHaveTextContent('2/3');
  });

  // Correção do usuário, 2026-09-24 (AD-254): voltar apaga a barra da etapa
  // deixada para trás — o azul é o progresso, não o histórico —, e ela segue
  // sendo o atalho para ir de novo.
  it('ao voltar, a barra da etapa à frente apaga e continua levando até ela', async () => {
    const usuario = userEvent.setup();
    renderizarWizard();
    const barrasAzuis = (): number =>
      screen.getByTestId('indicador-etapa').querySelectorAll('.bg-primary').length;

    expect(barrasAzuis()).toBe(1);
    await usuario.click(screen.getByTestId('wizard-avancar'));
    expect(barrasAzuis()).toBe(2);

    await usuario.click(screen.getByTestId('ir-para-etapa-1'));
    expect(barrasAzuis()).toBe(1);
    expect(screen.getByTestId('ir-para-etapa-2')).toHaveAccessibleName(/^Ir para/);

    await usuario.click(screen.getByTestId('ir-para-etapa-2'));
    expect(screen.getByTestId('etapa-pagamento')).toBeInTheDocument();
    expect(barrasAzuis()).toBe(2);
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
    renderizarWizard();

    // A ordem do cenário mudou em 2026-09-15, e a razão é a regra nova: o item
    // entra **antes** de a venda ser cobrada, porque com pagamento aprovado a
    // etapa 1 deixa de ser alcançável. Continua sendo o mesmo ponto — as etapas
    // são janelas sobre o **mesmo** `vendaStore`, e a alteração não passa pelo
    // wizard.
    await usuario.click(screen.getByTestId('wizard-avancar'));
    expect(screen.getByTestId('etapa-pagamento')).toBeInTheDocument();

    await usuario.click(screen.getByTestId('ir-para-etapa-1'));
    act(() => {
      useVendaStore.setState((estado) => ({
        linhas: [
          ...estado.linhas,
          linhaDe({ idLinha: 'linha-2', precoUnitario: 2_500, quantidadeEmUnidades: 1 }),
        ],
      }));
    });

    // R$ 125,00: a etapa 3 exige saldo zerado desde 2026-09-09.
    cobrirSaldo(12_500);
    await usuario.click(screen.getByTestId('ir-para-etapa-2'));
    await usuario.click(screen.getByTestId('wizard-avancar'));

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
    renderizarWizard();

    await usuario.click(screen.getByTestId('wizard-avancar'));
    await usuario.click(screen.getByTestId('ir-para-etapa-1'));

    // De volta à etapa 1, o atalho para a 2 continua de pé. Se o conjunto
    // encolhesse ao sair de uma etapa, a segunda ida ao pagamento viraria
    // navegação recusada — e a volta livre deixaria de valer no gesto mais comum
    // de todos, que é corrigir um item e voltar a cobrar.
    expect(screen.getByTestId('ir-para-etapa-2')).toBeInTheDocument();

    cobrirSaldo();
    await usuario.click(screen.getByTestId('ir-para-etapa-2'));
    await usuario.click(screen.getByTestId('wizard-avancar'));
    expect(screen.getByTestId('etapa-revisao')).toBeInTheDocument();

    // E a barra da etapa em que se está nunca é botão: não há para onde ir.
    expect(screen.queryByTestId('ir-para-etapa-3')).toBeNull();
    // As outras duas seguem no conjunto — a da etapa 1 inclusive, agora
    // anunciada como bloqueada pela cobrança em vez de sumir. Uma barra que
    // desaparecesse contaria ao operador que ele nunca esteve lá.
    expect(screen.getByTestId('ir-para-etapa-2')).toBeInTheDocument();
    expect(screen.getByTestId('ir-para-etapa-1')).toBeInTheDocument();
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

    // A volta e a ida de novo: o que I3 garante é que nenhum **campo de
    // cadastro** vazio recusa a navegação. A etapa escolhida aqui é a 2, e não a
    // 1, porque esta venda já está cobrada — a recusa que ela encontraria na
    // etapa 1 é a da cobrança (2026-09-15), não a de um cadastro incompleto, e
    // misturar as duas faria este caso vigiar a regra errada.
    await usuario.click(screen.getByTestId('ir-para-etapa-2'));
    expect(screen.getByTestId('etapa-pagamento')).toBeInTheDocument();
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

/**
 * A venda em cobrança não volta à etapa 1 (pedido do usuário, 2026-09-15).
 *
 * A regra de negócio não é nova — `carrinhoSlice` recusa inserir, editar e
 * apagar item com condição escolhida ou forma aprovada desde 2026-09-04. O que
 * estes casos travam é a **antecipação**: antes, o operador voltava para a etapa
 * 1, encontrava a barra de entrada rápida e a lista de itens aparentemente vivas
 * e só descobria a trava ao bipar. A frase é a mesma dos dois lados de
 * propósito; um texto próprio aqui divergiria do slice na primeira mudança de
 * regra.
 */
describe('MobileWizard — venda em cobrança não volta à etapa 1', () => {
  /** A frase vem do slice, nunca copiada: é o que impede as duas divergirem. */
  const AVISO_EM_COBRANCA = motivoCarrinhoBloqueado(false, false);

  it('com forma aprovada, a etapa 1 é recusada com a frase do carrinho travado', async () => {
    const usuario = userEvent.setup();
    const avisar = vi.spyOn(notificar, 'erro');
    cobrirSaldo();
    renderizarWizard();

    await usuario.click(screen.getByTestId('wizard-avancar'));
    expect(screen.getByTestId('etapa-pagamento')).toBeInTheDocument();

    const voltar = screen.getByTestId('wizard-voltar');
    // Anunciado antes do gesto, e clicável mesmo assim (AD-143): é o clique que
    // ensina a saída, e `disabled` nativo nunca chegaria a dizê-la.
    expect(voltar).toHaveAttribute('aria-disabled', 'true');
    expect(voltar).toHaveAttribute('title', AVISO_EM_COBRANCA);

    await usuario.click(voltar);

    expect(screen.getByTestId('etapa-pagamento')).toBeInTheDocument();
    expect(screen.queryByTestId('etapa-cliente-produtos')).toBeNull();
    expect(avisar).toHaveBeenCalledWith(AVISO_EM_COBRANCA);
    avisar.mockRestore();
  });

  it('com a condição escolhida e nenhuma forma aplicada, a recusa é a mesma', async () => {
    const usuario = userEvent.setup();
    // O "pagamento em andamento" do relato: a condição já congela a venda, e
    // uma forma pendente de integração só existe depois dela.
    act(() => {
      useVendaStore.setState({ condicaoSelecionada: condicaoDe(1, 'À VISTA') });
    });
    renderizarWizard();

    await usuario.click(screen.getByTestId('wizard-avancar'));
    await usuario.click(screen.getByTestId('wizard-voltar'));

    expect(screen.getByTestId('etapa-pagamento')).toBeInTheDocument();
  });

  it('descartado o pagamento, a volta à etapa 1 funciona de novo', async () => {
    const usuario = userEvent.setup();
    cobrirSaldo();
    renderizarWizard();

    await usuario.click(screen.getByTestId('wizard-avancar'));
    await usuario.click(screen.getByTestId('wizard-voltar'));
    expect(screen.getByTestId('etapa-pagamento')).toBeInTheDocument();

    // É a saída que a própria frase nomeia — o "Limpar" do cartão de pagamento.
    // Sem este caso, a recusa poderia ser permanente sem ninguém perceber.
    act(() => {
      useVendaStore.getState().descartarPagamento();
    });

    await usuario.click(screen.getByTestId('wizard-voltar'));
    expect(screen.getByTestId('etapa-cliente-produtos')).toBeInTheDocument();
  });

  it('a barra da etapa 1 continua no indicador, anunciada como bloqueada', async () => {
    const usuario = userEvent.setup();
    cobrirSaldo();
    renderizarWizard();

    await usuario.click(screen.getByTestId('wizard-avancar'));

    const barra = screen.getByTestId('ir-para-etapa-1');
    expect(barra).toHaveAttribute('aria-disabled', 'true');
    expect(barra).toHaveAttribute('title', AVISO_EM_COBRANCA);

    await usuario.click(barra);
    expect(screen.getByTestId('etapa-pagamento')).toBeInTheDocument();
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

/**
 * Pedidos de etapa vindos da venda rápida (feature 016, pendência 55).
 *
 * F6–F9 acionam no compacto desde a 016, e o comando pede duas navegações: a
 * etapa de pagamento antes de lançar — é lá que a janela do PIX existe — e a
 * revisão ao fim, para a venda que continuou aberta chegar ao "Finalizar"
 * (correção do usuário, 2026-09-15). O wizard atende pela mesma regra dos
 * botões, **sem aviso** quando recusa: quem falou com o operador foi o atalho.
 */
describe('MobileWizard — pedidos de etapa da venda rápida (016, pendência 55)', () => {
  it('pedido de pagamento leva à etapa 2', () => {
    renderizarWizard();

    act(() => {
      useEtapaVendaStore.getState().pedirPagamento();
    });

    expect(screen.getByTestId('etapa-pagamento')).toBeInTheDocument();
  });

  it('pedido de revisão, com produto e saldo coberto, leva à etapa 3 com o "Finalizar"', () => {
    cobrirSaldo();
    renderizarWizard();

    act(() => {
      useEtapaVendaStore.getState().pedirRevisao();
    });

    expect(screen.getByTestId('etapa-revisao')).toBeInTheDocument();
    expect(screen.getByTestId('botao-finalizar-venda')).toBeInTheDocument();
    // Chegou pela etapa de pagamento: as duas ficam visitadas para o indicador.
    expect(screen.getByTestId('ir-para-etapa-2')).toBeInTheDocument();
  });

  it('pedido de revisão sem saldo coberto não navega nem avisa', () => {
    const erro = vi.spyOn(notificar, 'erro');
    renderizarWizard();

    act(() => {
      useEtapaVendaStore.getState().pedirRevisao();
    });

    expect(screen.getByTestId('etapa-cliente-produtos')).toBeInTheDocument();
    expect(erro).not.toHaveBeenCalled();
    erro.mockRestore();
  });

  it('venda já finalizada — sem produto — fica na etapa 1 da venda nova', () => {
    act(() => {
      useVendaStore.setState({ linhas: [] });
    });
    renderizarWizard();

    act(() => {
      useEtapaVendaStore.getState().pedirRevisao();
    });

    expect(screen.getByTestId('etapa-cliente-produtos')).toBeInTheDocument();
  });

  it('um pedido anterior à montagem não é atendido — o wizard que monta começa na etapa 1', () => {
    cobrirSaldo();
    act(() => {
      useEtapaVendaStore.getState().pedirRevisao();
    });

    renderizarWizard();

    expect(screen.getByTestId('etapa-cliente-produtos')).toBeInTheDocument();
  });
});
