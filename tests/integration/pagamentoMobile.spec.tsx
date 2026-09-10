import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppShell } from '../../src/client/layout/AppShell';
import { useSessionStore } from '../../src/client/stores/sessionStore';
import { useVendaStore } from '../../src/client/stores/vendaStore';
import {
  definirLayoutInicial,
  instalarMatchMediaDeLayout,
  renderizarComProvedores,
} from '../support/layout';
import { MEIO_PAGTO } from '../../src/client/domain/pagamento/formaPagamento';
import { condicaoDe, formaDe } from '../support/pagamento';
import { linhaDe } from '../support/precificacao';
import { registroBootstrapDe } from '../support/sessao';

/**
 * T019 — o mobile oferece as **mesmas** formas e integrações do desktop
 * (`FR-009`, AD-144).
 *
 * **Substitui o teste original desta tarefa**, que afirmava o oposto: que
 * `EtapaPagamento` nunca importaria componente ou serviço de TEF. Aquela regra
 * (AD-074) foi revogada pelo usuário em 2026-09-03 — a premissa era hardware
 * incompatível com tablet/celular, e ela não se sustentou. Hoje o requisito é
 * simétrico: nenhuma disponibilidade de pagamento pode depender do layout, e é
 * isso que se verifica aqui.
 *
 * A comparação é entre as duas árvores reais, com o **mesmo** store: se algum
 * dia alguém filtrasse uma forma por plataforma, os dois conjuntos divergiriam.
 */
const CONDICAO_COM_TEF_E_PIX = condicaoDe(1, 'À VISTA', [
  formaDe({ codigo: 1, descricao: 'DINHEIRO', meioPagtoNFe: MEIO_PAGTO.Dinheiro }),
  // `integracaoCartao: '1'` é exatamente o que manda o cartão ao TEF (AD-180).
  formaDe({
    codigo: 2,
    descricao: 'CARTAO CREDITO',
    meioPagtoNFe: MEIO_PAGTO.CartaoCredito,
    integracaoCartao: '1',
    tipoTransacaoTEF: 'C',
  }),
  formaDe({ codigo: 3, descricao: 'PIX', meioPagtoNFe: MEIO_PAGTO.Pix }),
]);

function renderizarShell(): void {
  renderizarComProvedores(
    <AppShell
      onRecarregarBootstrap={() => {
        /* fora do assunto deste teste */
      }}
    />,
  );
}

/** Todos os `data-testid` dentro do bloco de configuração de pagamento. */
function superficieDePagamento(): readonly string[] {
  const bloco = screen.getByTestId('configuracao-pagamento');
  return [...bloco.querySelectorAll<HTMLElement>('[data-testid]')]
    .map((elemento) => elemento.dataset['testid'] ?? '')
    .sort();
}

beforeAll(() => {
  instalarMatchMediaDeLayout();
});

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('rede desligada no teste')));
  useSessionStore.setState({ estado: 'pronto', registro: registroBootstrapDe() });
  useVendaStore.setState({
    linhas: [linhaDe({ idLinha: 'linha-1', precoUnitario: 10_000, quantidadeEmUnidades: 1 })],
    clienteAtual: null,
    houveEscolhaExplicita: false,
    vendedorAtual: null,
    condicaoSelecionada: CONDICAO_COM_TEF_E_PIX,
    descontoCapa: null,
    pagamentos: [],
  });
  useVendaStore.getState().resetarAuditoria('NOVA');
});

describe('Pagamento no layout mobile', () => {
  it('a etapa 2 monta o painel de pagamento inteiro, não um recorte', async () => {
    const usuario = userEvent.setup();
    definirLayoutInicial('mobile');
    renderizarShell();

    await usuario.click(screen.getByTestId('wizard-avancar'));

    expect(screen.getByTestId('etapa-pagamento')).toBeInTheDocument();
    expect(screen.getByTestId('configuracao-pagamento')).toBeInTheDocument();
    expect(screen.getByTestId('combobox-condicao-pagamento')).toBeInTheDocument();
    expect(screen.getByTestId('combobox-forma-pagamento')).toBeInTheDocument();
    expect(screen.getByTestId('controle-desconto-capa')).toBeInTheDocument();
    expect(screen.getByTestId('entrada-pagamento')).toBeInTheDocument();
    expect(screen.getByTestId('limpar-pagamento')).toBeInTheDocument();
    // A lista de aplicados se omite quando não há pagamento — no mobile pelo
    // mesmo motivo do desktop, que é o ponto: mesma regra, mesmo componente.
    expect(screen.queryByTestId('pagamentos-aplicados')).toBeNull();
  });

  it('oferece exatamente a mesma superfície de pagamento do desktop (FR-009)', async () => {
    const usuario = userEvent.setup();

    definirLayoutInicial('desktop');
    renderizarShell();
    const noDesktop = superficieDePagamento();
    cleanup();

    definirLayoutInicial('mobile');
    renderizarShell();
    await usuario.click(screen.getByTestId('wizard-avancar'));
    const noMobile = superficieDePagamento();

    expect(noMobile).toEqual(noDesktop);
    // Se o conjunto vier vazio nos dois lados, a igualdade acima seria
    // verdadeira e vazia de sentido.
    expect(noMobile.length).toBeGreaterThan(0);
  });

  it('as formas da condição chegam idênticas ao mobile, TEF incluído (AD-144)', async () => {
    const usuario = userEvent.setup();
    definirLayoutInicial('mobile');
    renderizarShell();

    await usuario.click(screen.getByTestId('wizard-avancar'));

    // Quem decide as formas é a condição escolhida — não o layout. O wizard não
    // filtra nada no caminho: o store visto pela etapa 2 é o mesmo de sempre.
    const formas = useVendaStore.getState().condicaoSelecionada?.formas ?? [];
    expect(formas.map((forma) => forma.descricao)).toEqual(['DINHEIRO', 'CARTAO CREDITO', 'PIX']);
    expect(formas.some((forma) => forma.integracaoCartao === '1')).toBe(true);
  });
});
