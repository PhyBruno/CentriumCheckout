import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppShell } from '../../src/client/layout/AppShell';
import { useSessionStore } from '../../src/client/stores/sessionStore';
import { useVendaStore } from '../../src/client/stores/vendaStore';
import {
  cruzarBreakpointPara,
  definirLayoutInicial,
  instalarMatchMediaDeLayout,
  renderizarComProvedores,
} from '../support/layout';
import { linhaDe } from '../support/precificacao';
import { registroBootstrapDe } from '../support/sessao';

/**
 * T027 — `FR-008`/`FR-010`: importação de documento (006), recuperação de NFCe
 * (011) e telas de retaguarda ficam **fora** da árvore mobile.
 *
 * "Fora" no sentido forte que AD-046 pede: ausência estrutural, não uma flag de
 * "oculto". A verificação é dupla e de propósito — a estática impede que alguém
 * importe o módulo (mesmo sem renderizá-lo hoje), e a de DOM impede que ele
 * chegue à tela por um caminho indireto que a análise de import não veria.
 *
 * A primeira geração deste `tasks.md` deixava isso como conferência manual; um
 * requisito de ausência é justamente o que ninguém repara ao quebrar.
 */
const RAIZ_MOBILE = join(process.cwd(), 'src/client/layout/mobile');

/** Módulos que a árvore mobile nunca pode importar. */
const PROIBIDOS = [
  'ModalImportacaoDav',
  'BotaoMenuImportacao',
  'ModalMenuImportacao',
  'useImportacaoDav',
  'useImportacaoDocumento',
  'ModalRecuperacaoNFCe',
  'useRecuperacaoNFCe',
  'recuperacaoQueries',
  'BarraAtalhosVenda',
] as const;

function arquivosDaArvoreMobile(): readonly string[] {
  return readdirSync(RAIZ_MOBILE).filter((nome) => nome.endsWith('.ts') || nome.endsWith('.tsx'));
}

function importsDe(conteudo: string): readonly string[] {
  return [...conteudo.matchAll(/^\s*import[^;]*?from\s*'([^']+)';/gm)].map(
    (encontro) => encontro[1] ?? '',
  );
}

function renderizarShell(): void {
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

describe('Ausência estrutural na árvore mobile (FR-008/FR-010)', () => {
  it('a pasta mobile existe e tem arquivos a inspecionar', () => {
    // Sem isto, os testes abaixo passariam varrendo uma lista vazia.
    expect(arquivosDaArvoreMobile().length).toBeGreaterThan(0);
  });

  it('nenhum arquivo de layout/mobile importa importação de DAV, recuperação de NFCe ou retaguarda', () => {
    const violacoes: string[] = [];

    for (const arquivo of arquivosDaArvoreMobile()) {
      const conteudo = readFileSync(join(RAIZ_MOBILE, arquivo), 'utf8');
      for (const especificador of importsDe(conteudo)) {
        const proibido = PROIBIDOS.find((nome) => especificador.includes(nome));
        if (proibido !== undefined) {
          violacoes.push(`${arquivo} importa ${proibido} (${especificador})`);
        }
      }
    }

    expect(violacoes).toEqual([]);
  });

  it('nenhuma etapa do wizard oferece importação de documento ou recuperação de NFCe', async () => {
    const usuario = userEvent.setup();
    renderizarShell();

    for (const etapa of [1, 2, 3]) {
      expect(screen.queryByTestId('botao-menu-importacao')).toBeNull();
      expect(screen.queryByTestId('modal-menu-importacao')).toBeNull();
      expect(screen.queryByTestId('modal-recuperacao-nfce')).toBeNull();
      // Os atalhos da venda são a faixa que hospeda o menu de importação no
      // desktop; ela não existe no compacto.
      expect(screen.queryByTestId('atalhos-venda')).toBeNull();

      if (etapa < 3) {
        await usuario.click(screen.getByTestId('wizard-avancar'));
      }
    }
  });

  it('no desktop, ao contrário, o menu de importação continua acessível', () => {
    definirLayoutInicial('desktop');
    renderizarShell();

    expect(screen.getByTestId('botao-menu-importacao')).toBeInTheDocument();
    expect(screen.getByTestId('atalhos-venda')).toBeInTheDocument();
  });

  it('nem por caminho indireto: o módulo de ações finais entra no mobile sem trazer o menu junto', async () => {
    const usuario = userEvent.setup();
    renderizarShell();

    // `AcoesFinaisVenda.tsx` é o caso concreto que a checagem de import não
    // pega: a árvore mobile o importa duas vezes de propósito (a lixeira do
    // cabeçalho e o botão de finalizar da etapa 3) e o **mesmo módulo** exporta
    // `BarraAtalhosVenda`, que hospeda o `BotaoMenuImportacao`. Importar o
    // módulo é legítimo; montar aquela faixa não é, e só o DOM sabe a
    // diferença.
    expect(screen.getByTestId('botao-cancelar-venda')).toBeInTheDocument();
    expect(screen.queryByTestId('botao-menu-importacao')).toBeNull();

    await usuario.click(screen.getByTestId('wizard-avancar'));
    await usuario.click(screen.getByTestId('wizard-avancar'));
    expect(screen.getByTestId('botao-finalizar-venda')).toBeInTheDocument();
    expect(screen.queryByTestId('botao-menu-importacao')).toBeNull();
    expect(screen.queryByTestId('modal-recuperacao-nfce')).toBeNull();
  });

  it('a travessia do breakpoint não deixa a retaguarda montada do lado compacto', () => {
    definirLayoutInicial('desktop');
    renderizarShell();

    expect(screen.getByTestId('botao-menu-importacao')).toBeInTheDocument();
    // A barra superior é onde vive o botão inerte de menu gerencial (AD-020/
    // AD-026), a "retaguarda" de `FR-010`.
    expect(screen.getByTestId('barra-superior')).toBeInTheDocument();

    cruzarBreakpointPara('mobile');

    // Montagem condicional, não `display: none`: as duas superfícies precisam
    // sumir do DOM, senão continuam alcançáveis por TAB e por leitor de tela —
    // que é o modo de "estar oculto" que AD-046 recusa.
    expect(screen.queryByTestId('botao-menu-importacao')).toBeNull();
    expect(screen.queryByTestId('barra-superior')).toBeNull();
  });
});

describe('Nenhum atalho de teclado nasce na árvore mobile (FR-005)', () => {
  it('nenhum arquivo de layout/mobile importa o mapa de atalhos nem a biblioteca de hotkeys', () => {
    // O teste de teclado do `appShell.spec.tsx` prova que as teclas de hoje não
    // fazem nada; este impede que as de amanhã cheguem aqui. `FR-005` é sobre a
    // árvore não escutar o teclado — e o jeito de garantir isso ao longo do
    // tempo é a árvore não ter como registrar tecla nenhuma.
    const proibidos = ['react-hotkeys-hook', 'mapaAtalhos', 'useAtalhosDeTeclado', 'DicaAtalhos'];
    const violacoes: string[] = [];

    for (const arquivo of arquivosDaArvoreMobile()) {
      const conteudo = readFileSync(join(RAIZ_MOBILE, arquivo), 'utf8');
      for (const especificador of importsDe(conteudo)) {
        const proibido = proibidos.find((nome) => especificador.includes(nome));
        if (proibido !== undefined) {
          violacoes.push(`${arquivo} importa ${proibido} (${especificador})`);
        }
      }
    }

    expect(violacoes).toEqual([]);
  });
});
