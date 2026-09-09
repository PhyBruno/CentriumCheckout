import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppShell } from '../../src/client/layout/AppShell';
import { useEdicaoItemStore } from '../../src/client/stores/edicaoItemStore';
import { useSessionStore } from '../../src/client/stores/sessionStore';
import { useVendaStore } from '../../src/client/stores/vendaStore';
import {
  cruzarBreakpointPara,
  definirLayoutInicial,
  instalarMatchMediaDeLayout,
  renderizarComProvedores,
} from '../support/layout';
import { condicaoDe, emCentavos, formaDe, pagamentoDe } from '../support/pagamento';
import { linhaDe } from '../support/precificacao';
import { registroBootstrapDe } from '../support/sessao';

/**
 * `FR-002`/`SC-003` nas situações que `appShell.spec.tsx` não alcança.
 *
 * Aquele arquivo prova o caso simples — carrinho, cliente e vendedor atravessam
 * o breakpoint intactos. O que **não** estava coberto é justamente o que dói
 * mais caro: a venda com dinheiro já lançado, o desconto de capa negociado com o
 * cliente na frente do caixa, e os dois estados de meio-de-gesto (um item
 * carregado na barra para edição, um modal de busca aberto). São os momentos em
 * que o operador vira o tablet e a venda tem mais a perder.
 *
 * A afirmação central é sempre a mesma e é deliberadamente por **identidade de
 * referência**: o valor pode continuar "igual" e ainda assim ter sido
 * reconstruído, e é a reconstrução — não a diferença numérica — que apagaria a
 * auditoria e reabriria decisões já tomadas.
 */
const CONDICAO = condicaoDe(1, 'À VISTA', [
  formaDe({ codigo: 1, descricao: 'DINHEIRO', meioPagtoNFe: 'Dinheiro' }),
]);

const CLIENTE_IDENTIFICADO = {
  codigoCliente: 42,
  nome: 'Cliente de Teste',
  documento: '11144477735',
  celular: null,
  listaPreco: 3,
  descontoConvenio: 0,
  codigoConvenio: null,
  origem: 'BUSCA_DOCUMENTO' as const,
};

class ResizeObserverStub implements ResizeObserver {
  observe(): void {
    /* sem medição */
  }
  unobserve(): void {
    /* nada a fazer */
  }
  disconnect(): void {
    /* nada a fazer */
  }
}

function renderizarShell(): void {
  renderizarComProvedores(
    <AppShell
      onRecarregarBootstrap={() => {
        /* o polling não é o assunto deste arquivo */
      }}
    />,
  );
}

/**
 * Uma venda no ponto mais adiantado que ainda admite edição: itens, cliente
 * identificado por documento, condição escolhida, desconto de capa aplicado e
 * uma forma já lançada.
 */
function popularVendaAdiantada(): void {
  useVendaStore.setState({
    linhas: [
      linhaDe({ idLinha: 'linha-1', precoUnitario: 7_000, quantidadeEmUnidades: 1 }),
      linhaDe({ idLinha: 'linha-2', precoUnitario: 2_900, quantidadeEmUnidades: 1 }),
    ],
    clienteAtual: CLIENTE_IDENTIFICADO,
    houveEscolhaExplicita: true,
    vendedorAtual: { codigo: 7, nome: 'Vendedor de Teste', origem: 'BUSCA' },
    condicaoSelecionada: CONDICAO,
    // 10% sobre os 99,00 das duas linhas, já resolvido em centavos — é assim
    // que o slice o grava, e é o valor que a travessia tem de preservar.
    descontoCapa: { modo: 'PERCENTUAL', entrada: 10, valorResolvido: emCentavos(990) },
    // R$ 89,10 = os 99,00 das duas linhas menos os 10% de capa: o saldo fica
    // zerado, que é o que a etapa 3 do wizard passou a exigir para ser
    // alcançada (2026-09-09). A venda "adiantada" deste cenário é justamente a
    // que já percorreu o fluxo inteiro, então cobri-la é o estado coerente —
    // e a recusa em si é exercitada em `mobileWizard.spec.tsx`.
    pagamentos: [pagamentoDe({ idPagamento: 'pag-1', valorAplicado: 8_910, valorRecebido: 8_910 })],
  });
}

beforeAll(() => {
  instalarMatchMediaDeLayout();
  window.ResizeObserver = ResizeObserverStub;
});

beforeEach(() => {
  definirLayoutInicial('desktop');
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('rede desligada no teste')));
  useSessionStore.setState({ estado: 'pronto', registro: registroBootstrapDe() });
  useVendaStore.setState({
    linhas: [],
    clienteAtual: null,
    houveEscolhaExplicita: false,
    vendedorAtual: null,
    condicaoSelecionada: null,
    descontoCapa: null,
    pagamentos: [],
  });
  useVendaStore.getState().resetarAuditoria('NOVA');
  useEdicaoItemStore.setState({ linhaEmEdicao: null });
});

describe('Travessia do breakpoint com a venda adiantada (FR-002)', () => {
  it('pagamento aplicado, desconto de capa e cliente identificado atravessam sem recálculo', () => {
    popularVendaAdiantada();
    renderizarShell();

    const antes = useVendaStore.getState();

    cruzarBreakpointPara('mobile');

    const depois = useVendaStore.getState();
    expect(screen.getByTestId('mobile-wizard')).toBeInTheDocument();
    expect(depois.pagamentos).toBe(antes.pagamentos);
    // O desconto de capa é o caso mais delicado dos três: `valorResolvido` é
    // derivado do subtotal, então um remonte que o recalculasse produziria um
    // objeto novo — e, com o subtotal na mesma casa decimal, um valor idêntico.
    // Só a identidade denuncia o recálculo.
    expect(depois.descontoCapa).toBe(antes.descontoCapa);
    expect(depois.condicaoSelecionada).toBe(antes.condicaoSelecionada);
    expect(depois.clienteAtual).toBe(antes.clienteAtual);
    expect(depois.houveEscolhaExplicita).toBe(true);

    cruzarBreakpointPara('desktop');

    const deVolta = useVendaStore.getState();
    expect(deVolta.pagamentos).toBe(antes.pagamentos);
    // Nem duplicação: a volta não relança a forma já aplicada.
    expect(deVolta.pagamentos).toHaveLength(1);
    expect(deVolta.descontoCapa).toBe(antes.descontoCapa);
    expect(deVolta.clienteAtual).toBe(antes.clienteAtual);
  });

  it('o pagamento já lançado aparece na etapa de pagamento do wizard, não só no store', async () => {
    const usuario = userEvent.setup();
    popularVendaAdiantada();
    renderizarShell();

    // No desktop ele está no cartão da direita.
    expect(screen.getAllByTestId('pagamento-aplicado')).toHaveLength(1);

    cruzarBreakpointPara('mobile');

    // No mobile, a etapa 1 não mostra pagamento — é preciso avançar. O ponto do
    // teste é que o dado sobreviveu **e** continua alcançável: um estado
    // preservado que a nova árvore não exibe seria indistinguível de perdido
    // para quem está operando.
    await usuario.click(screen.getByTestId('wizard-avancar'));
    expect(screen.getByTestId('etapa-pagamento')).toBeInTheDocument();
    expect(screen.getAllByTestId('pagamento-aplicado')).toHaveLength(1);

    // E a revisão da etapa 3 lê o mesmo desconto, sem recontá-lo.
    await usuario.click(screen.getByTestId('wizard-avancar'));
    expect(screen.getByTestId('conferencia-ajuste')).toHaveTextContent('Desconto 10%');
    expect(screen.getByTestId('conferencia-cliente')).toHaveTextContent('Cliente de Teste');
  });

  it('o desconto de capa continua editável do outro lado, com a entrada do operador intacta', async () => {
    const usuario = userEvent.setup();
    popularVendaAdiantada();
    renderizarShell();

    // No desktop o controle de ajuste está sempre à vista, no cartão da direita.
    expect(screen.getByTestId('campo-valor-ajuste')).toHaveValue('10');

    cruzarBreakpointPara('mobile');
    await usuario.click(screen.getByTestId('wizard-avancar'));

    // É o mesmo componente da 008 nas duas árvores; o que se verifica aqui é que
    // ele reabre exibindo o que o operador digitou, e não um campo zerado que o
    // convidaria a negociar o desconto uma segunda vez com o cliente na frente.
    expect(screen.getByTestId('campo-valor-ajuste')).toHaveValue('10');
    expect(useVendaStore.getState().descontoCapa?.valorResolvido).toBe(990);

    cruzarBreakpointPara('desktop');

    expect(screen.getByTestId('campo-valor-ajuste')).toHaveValue('10');
    expect(useVendaStore.getState().descontoCapa?.valorResolvido).toBe(990);
  });
});

describe('Ida e volta entre etapas com desconto aplicado (I5)', () => {
  it('o campo de desconto reabre com o número que está valendo, não vazio', async () => {
    const usuario = userEvent.setup();
    popularVendaAdiantada();
    definirLayoutInicial('mobile');
    renderizarShell();

    await usuario.click(screen.getByTestId('wizard-avancar'));
    expect(screen.getByTestId('campo-valor-ajuste')).toHaveValue('10');

    // Revisar e voltar para corrigir a forma de pagamento é o caminho normal da
    // etapa 3 — e desmonta a etapa 2 inteira no meio de uma venda com desconto.
    await usuario.click(screen.getByTestId('wizard-avancar'));
    expect(screen.getByTestId('etapa-revisao')).toBeInTheDocument();
    await usuario.click(screen.getByTestId('ir-para-etapa-2'));

    expect(screen.getByTestId('campo-valor-ajuste')).toHaveValue('10');
  });

  it('tabular pelo campo de desconto depois da volta não apaga o desconto', async () => {
    const usuario = userEvent.setup();
    popularVendaAdiantada();
    definirLayoutInicial('mobile');
    renderizarShell();

    await usuario.click(screen.getByTestId('wizard-avancar'));
    await usuario.click(screen.getByTestId('wizard-avancar'));
    await usuario.click(screen.getByTestId('ir-para-etapa-2'));

    // O `onBlur` do campo trata texto vazio como "desisti do ajuste" e chama
    // `removerDescontoCapa()`. Com o campo reabrindo vazio, passar o foco por
    // ele — um TAB, um toque fora — apagava um desconto de 10% que ninguém
    // pediu para remover, e sem nenhum aviso.
    const campo = screen.getByTestId('campo-valor-ajuste');
    await usuario.click(campo);
    await usuario.tab();

    expect(useVendaStore.getState().descontoCapa).not.toBeNull();
    expect(useVendaStore.getState().descontoCapa?.entrada).toBe(10);
    expect(useVendaStore.getState().descontoCapa?.valorResolvido).toBe(990);
  });
});

describe('Travessia do breakpoint no meio de um gesto', () => {
  it('o item carregado na barra para edição continua carregado do outro lado', () => {
    const linha = linhaDe({ idLinha: 'linha-1', precoUnitario: 7_000, quantidadeEmUnidades: 2 });
    useVendaStore.setState({ linhas: [linha], houveEscolhaExplicita: false });
    // O gesto do lápis (AD-124): a linha já inserida volta para a barra de
    // entrada rápida por um store irmão, fora do `vendaStore`.
    useEdicaoItemStore.setState({ linhaEmEdicao: linha });
    renderizarShell();

    expect(screen.getByTestId('campo-codigo-produto')).toHaveValue(linha.snapshot.codigoProduto);

    cruzarBreakpointPara('mobile');

    // A barra é remontada pela árvore mobile, mas o sinal de edição vive num
    // store: se ele fosse estado local do componente, o operador atravessaria o
    // breakpoint e a edição sumiria — com a linha original ainda no carrinho e
    // nada indicando que ela estava sendo corrigida.
    expect(useEdicaoItemStore.getState().linhaEmEdicao).toBe(linha);
    expect(screen.getByTestId('campo-codigo-produto')).toHaveValue(linha.snapshot.codigoProduto);
    // E o carrinho não ganhou uma cópia: a edição continua sendo edição.
    expect(useVendaStore.getState().linhas).toHaveLength(1);
  });

  it('o modal de busca aberto some na travessia sem levar nada da venda junto', async () => {
    const usuario = userEvent.setup();
    popularVendaAdiantada();
    renderizarShell();

    await usuario.click(screen.getByTestId('abrir-busca-produto'));
    expect(screen.getByTestId('modal-busca-produto')).toBeInTheDocument();

    const antes = useVendaStore.getState();
    cruzarBreakpointPara('mobile');

    // O modal é estado local de apresentação, do mesmo tipo que a etapa do
    // wizard: perdê-lo na travessia é o comportamento aceito (`research.md` D2).
    // O que não pode acontecer é ele levar a venda junto — nem deixar a barra
    // presa num estado de "busca em andamento" que o operador não consiga sair.
    expect(screen.queryByTestId('modal-busca-produto')).toBeNull();
    expect(useVendaStore.getState().linhas).toBe(antes.linhas);
    expect(useVendaStore.getState().pagamentos).toBe(antes.pagamentos);

    const campo = screen.getByTestId('campo-codigo-produto');
    expect(campo).toBeEnabled();
    await waitFor(() => {
      expect(screen.getByTestId('abrir-busca-produto')).toBeInTheDocument();
    });
  });
});
