import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { AppShell } from '../../src/client/layout/AppShell';
import { useSessionStore } from '../../src/client/stores/sessionStore';
import { abrirSessaoDeVenda, useVendaStore } from '../../src/client/stores/vendaStore';
import {
  definirLayoutInicial,
  instalarMatchMediaDeLayout,
  renderizarComProvedores,
} from '../support/layout';
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

  it('voltar é permitido com a venda incompleta — nenhum campo obrigatório barra o retorno (I3)', async () => {
    const usuario = userEvent.setup();
    // Sem cliente, sem vendedor, sem condição e sem pagamento: a venda mais
    // incompleta que ainda tem um item. É exatamente o operador que **precisa**
    // circular entre as etapas para completá-la que uma validação prenderia.
    act(() => {
      useVendaStore.setState({
        clienteAtual: null,
        vendedorAtual: null,
        condicaoSelecionada: null,
        pagamentos: [],
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
