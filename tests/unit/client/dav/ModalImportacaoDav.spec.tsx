import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ModalImportacaoDav } from '../../../../src/client/features/dav/ModalImportacaoDav';
import { useSessionStore } from '../../../../src/client/stores/sessionStore';
import { davDaLista, respostaListaDavs } from '../../../support/dav';
import { instalarMatchMediaDeLayout } from '../../../support/layout';
import { registroBootstrapDe } from '../../../support/sessao';

/**
 * Coluna "Documento de Origem" e coluna "Senha" da janela de DAV (AD-258,
 * pedido do usuário em 2026-10-01). As três linhas imitam os três tipos
 * medidos no `ListaDAVs` do prototype — valores sintéticos.
 */

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

beforeAll(() => {
  window.ResizeObserver = ResizeObserverStub;
  instalarMatchMediaDeLayout();
});

const LINHAS = [
  davDaLista({
    NumeroDAV: '0001',
    Titulo: 'PEDIDO',
    DoccumentoOrigemNumero: '1287',
    DocumentoOrigemSerie: '99',
  }),
  davDaLista({
    NumeroDAV: '0002',
    Titulo: 'ORCAMENTO',
    DoccumentoOrigemNumero: '1605',
    DocumentoOrigemSerie: '',
    Senha: '123456',
  }),
  davDaLista({
    NumeroDAV: '0003',
    Titulo: 'ORDEM SERVICO',
    DoccumentoOrigemNumero: '77',
    DocumentoOrigemSerie: '',
  }),
];

function renderJanela(): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }): ReactNode =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  render(
    createElement(
      Wrapper,
      null,
      createElement(ModalImportacaoDav, {
        aberto: true,
        onFechar: () => {
          /* não é o assunto */
        },
      }),
    ),
  );
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(respostaListaDavs(LINHAS)), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    ),
  );
  useSessionStore.setState({ estado: 'pronto', registro: registroBootstrapDe() });
});

describe('ModalImportacaoDav — documento de origem e senha (AD-258)', () => {
  it('rotula a coluna como "Documento de Origem" e acrescenta "Senha"', async () => {
    renderJanela();
    await screen.findAllByTestId('linha-dav');

    expect(screen.getByRole('button', { name: /Documento de Origem/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Senha/ })).toBeInTheDocument();
  });

  it('mostra Numero/Serie seguido da badge do tipo, com uma cor por tipo', async () => {
    renderJanela();
    const linhas = await screen.findAllByTestId('linha-dav');

    const esperado = [
      { texto: '1287/99', rotulo: 'Pedido', tom: 'info' },
      { texto: '1605', rotulo: 'Orçamento', tom: 'aviso' },
      { texto: '77', rotulo: 'O.S', tom: 'sucesso' },
    ];
    linhas.forEach((linha, indice) => {
      const celula = within(linha).getByTestId('documento-origem-dav');
      const badge = within(celula).getByTestId('badge-tipo-documento');
      expect(celula).toHaveTextContent(esperado[indice]?.texto ?? '');
      expect(badge).toHaveTextContent(esperado[indice]?.rotulo ?? '');
      expect(badge).toHaveAttribute('data-tom', esperado[indice]?.tom);
    });
    // Sem série, nada de barra pendurada.
    expect(
      within(linhas[1] as HTMLElement).getByTestId('documento-origem-dav'),
    ).not.toHaveTextContent('1605/');
  });

  it('exibe a senha, e um traço quando o documento não tem', async () => {
    renderJanela();
    const linhas = await screen.findAllByTestId('linha-dav');

    expect(within(linhas[0] as HTMLElement).getByTestId('senha-dav')).toHaveTextContent('—');
    expect(within(linhas[1] as HTMLElement).getByTestId('senha-dav')).toHaveTextContent('123456');
  });

  it('o campo de busca anuncia a busca por senha', async () => {
    renderJanela();
    await screen.findAllByTestId('linha-dav');

    expect(screen.getByTestId('campo-busca-dav')).toHaveAttribute(
      'placeholder',
      expect.stringContaining('senha'),
    );
  });
});
