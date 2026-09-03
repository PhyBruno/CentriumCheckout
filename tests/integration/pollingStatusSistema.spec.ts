import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { ErpClient, ResultadoChamadaErp } from '../../src/client/services/erpClient';
import {
  INTERVALO_STATUS_SISTEMA_MS,
  usePollingStatusSistema,
  type StatusSistemaDeps,
} from '../../src/client/services/statusSistema/pollingStatusSistema';

/**
 * Polling de `GetStatusSistema` (T028, `FR-013`, AD-088).
 *
 * Cobre a guarda de "entre vendas", a decisão binária sobre a resposta e o
 * silêncio em falha de rede. Valores sintéticos.
 */

interface ClienteFalso {
  readonly erpClient: ErpClient;
  readonly caminhos: string[];
}

function clienteQueResponde(
  respostas: readonly ResultadoChamadaErp[] | (() => ResultadoChamadaErp),
): ClienteFalso {
  const caminhos: string[] = [];

  return {
    caminhos,
    erpClient: {
      chamar: (caminho) => {
        caminhos.push(caminho);
        const resposta =
          typeof respostas === 'function'
            ? respostas()
            : (respostas[caminhos.length - 1] ?? respostas[respostas.length - 1]);
        if (resposta === undefined) {
          throw new Error('nenhuma resposta sintética configurada');
        }
        return Promise.resolve(resposta);
      },
    },
  };
}

function respostaComStatus(status: number): ResultadoChamadaErp {
  return { estado: 'ok', resposta: new Response(String(status), { status: 200 }) };
}

/** Deixa o microtask do `fetch` simulado resolver depois do tick do intervalo. */
async function avancarUmCiclo(): Promise<void> {
  await act(async () => {
    vi.advanceTimersByTime(INTERVALO_STATUS_SISTEMA_MS);
    await Promise.resolve();
    await Promise.resolve();
  });
}

function renderizar(deps: Partial<StatusSistemaDeps>, erpClient: ErpClient) {
  const completo: StatusSistemaDeps = {
    cadMaqCod: () => 'PDV01',
    vendaAtiva: () => false,
    recarregarBootstrap: () => undefined,
    erpClient,
    ...deps,
  };
  return renderHook(() => {
    usePollingStatusSistema(completo);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('guarda de disparo (FR-013)', () => {
  it('consulta a cada 60s enquanto não há venda em andamento', async () => {
    const cliente = clienteQueResponde([respostaComStatus(0)]);

    renderizar({}, cliente.erpClient);
    await avancarUmCiclo();

    expect(cliente.caminhos).toHaveLength(1);
    expect(cliente.caminhos[0]).toContain('Cadmaqcod=PDV01');
    // `Empresa` é injetado pelo BFF como header (AD-019/AD-118) — não vai na query.
    expect(cliente.caminhos[0]).not.toContain('Empresa');
  });

  it('não faz chamada nenhuma quando há venda em digitação', async () => {
    const cliente = clienteQueResponde([respostaComStatus(0)]);

    renderizar({ vendaAtiva: () => true }, cliente.erpClient);
    await avancarUmCiclo();
    await avancarUmCiclo();

    expect(cliente.caminhos).toHaveLength(0);
  });

  it('não dispara antes do bootstrap ter CadMaqCod', async () => {
    const cliente = clienteQueResponde([respostaComStatus(0)]);

    renderizar({ cadMaqCod: () => null }, cliente.erpClient);
    await avancarUmCiclo();

    expect(cliente.caminhos).toHaveLength(0);
  });
});

describe('decisão sobre a resposta (AD-088)', () => {
  it('não faz nada quando o ERP responde 0', async () => {
    const recarregarBootstrap = vi.fn();
    const cliente = clienteQueResponde([respostaComStatus(0)]);

    renderizar({ recarregarBootstrap }, cliente.erpClient);
    await avancarUmCiclo();

    expect(recarregarBootstrap).not.toHaveBeenCalled();
  });

  it.each([1, 2, 7])('recarrega o bootstrap quando o ERP responde %i', async (status) => {
    const recarregarBootstrap = vi.fn();
    const cliente = clienteQueResponde([respostaComStatus(status)]);

    renderizar({ recarregarBootstrap }, cliente.erpClient);
    await avancarUmCiclo();

    expect(recarregarBootstrap).toHaveBeenCalledTimes(1);
  });

  it('ignora corpo fora do contrato em vez de recarregar por engano', async () => {
    const recarregarBootstrap = vi.fn();
    const cliente = clienteQueResponde([
      { estado: 'ok', resposta: new Response('"mudou"', { status: 200 }) },
    ]);

    renderizar({ recarregarBootstrap }, cliente.erpClient);
    await avancarUmCiclo();

    expect(recarregarBootstrap).not.toHaveBeenCalled();
  });
});

describe('falha de rede é silenciosa e não interrompe o ciclo', () => {
  it('não recarrega nada e tenta de novo no próximo intervalo', async () => {
    const recarregarBootstrap = vi.fn();
    let chamada = 0;
    const cliente = clienteQueResponde(() => {
      chamada += 1;
      return chamada === 1 ? { estado: 'erro-de-rede' } : respostaComStatus(1);
    });

    renderizar({ recarregarBootstrap }, cliente.erpClient);

    await avancarUmCiclo();
    expect(recarregarBootstrap).not.toHaveBeenCalled();

    await avancarUmCiclo();
    expect(cliente.caminhos).toHaveLength(2);
    expect(recarregarBootstrap).toHaveBeenCalledTimes(1);
  });

  it('trata sessão encerrada como ciclo sem ação (o BFF já cuida do 401)', async () => {
    const recarregarBootstrap = vi.fn();
    const cliente = clienteQueResponde([{ estado: 'sessao-encerrada', itensNaVenda: 0 }]);

    renderizar({ recarregarBootstrap }, cliente.erpClient);
    await avancarUmCiclo();

    expect(recarregarBootstrap).not.toHaveBeenCalled();
  });
});
