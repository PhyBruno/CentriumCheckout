import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BootstrapDb,
  criarRepositorioBootstrap,
  type RepositorioBootstrap,
} from '../../src/client/db/bootstrapDb';
import {
  carregarBootstrap,
  type AnalisadorBootstrap,
} from '../../src/client/services/bootstrapClient';
import { bootstrapPayloadSchema } from '../../src/shared/schemas/bootstrap.schema';
import { calcularVersionHash } from '../../src/shared/versionHash';

/**
 * Reuso de cache por hash (Cenário 2, passo 4) e isolamento por tenant
 * (Cenário 3, FR-009) — T028.
 */

/**
 * Analisador síncrono equivalente ao Web Worker, sem depender de Worker no Node.
 *
 * O `id` do protocolo só serve para correlacionar mensagens do worker real;
 * aqui, sem canal compartilhado, um valor fixo basta.
 */
const analisador: AnalisadorBootstrap = {
  async analisar(texto: string) {
    const id = 'analisador-sincrono';
    const validado = bootstrapPayloadSchema.safeParse(JSON.parse(texto));
    if (!validado.success) {
      return { id, ok: false, erro: 'fora do contrato' };
    }
    return {
      id,
      ok: true,
      payload: validado.data,
      versionHash: calcularVersionHash(validado.data),
    };
  },
  encerrar() {
    /* nada a liberar */
  },
};

function payload(tenant: string, cadMaqCod = 'PDV01'): Record<string, unknown> {
  return {
    tenant,
    codigoEmpresa: '1',
    SessaoUsuario: {
      TipoPreco: 1,
      CadMaqCod: cadMaqCod,
      ListaPrecoDefault: 3,
      CenarioPagamento: '["1;DINHEIRO;1;A VISTA;Dinheiro à vista;True;F6"]',
      QtdMinCharParaConsulta: 3,
      UsuarioTipoCodigoProduto: 'I',
      ClienteDefaultCodigo: 1,
      CadSerieNFCe: '1',
      CadMaqHost: '127.0.0.1:4545',
      TipoImpressao: 'E',
    },
  };
}

/** Simula o BFF, inclusive o `304` quando o hash enviado já é conhecido. */
function criarFetchFalso(corpo: Record<string, unknown>): {
  fetchImpl: typeof fetch;
  chamadas: () => { total: number; corposEnviados: number };
} {
  let total = 0;
  let corposEnviados = 0;

  const fetchImpl = vi.fn<typeof fetch>(async (_url, init) => {
    total += 1;
    const hash = calcularVersionHash(bootstrapPayloadSchema.parse(corpo));
    const cabecalho =
      (init?.headers as Record<string, string> | undefined)?.['If-None-Match'] ?? '';

    if (cabecalho.includes(hash)) {
      return new Response(null, { status: 304, headers: { ETag: `"${hash}"` } });
    }

    corposEnviados += 1;
    return new Response(JSON.stringify(corpo), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ETag: `"${hash}"` },
    });
  });

  return { fetchImpl, chamadas: () => ({ total, corposEnviados }) };
}

let db: BootstrapDb;
let repositorio: RepositorioBootstrap;

beforeEach(async () => {
  db = new BootstrapDb(`teste-${Math.random().toString(36).slice(2)}`);
  await db.open();
  repositorio = criarRepositorioBootstrap(db);
});

describe('cache de bootstrap no Dexie', () => {
  it('grava o registro chaveado por tenant no primeiro carregamento', async () => {
    const { fetchImpl } = criarFetchFalso(payload('acme'));

    const resultado = await carregarBootstrap({ repositorio, analisador, fetchImpl });

    expect(resultado.estado).toBe('pronto');
    if (resultado.estado !== 'pronto') return;

    expect(resultado.reaproveitado).toBe(false);
    expect(resultado.registro.tenant).toBe('acme');
    expect(resultado.registro._versionHash).toHaveLength(16);

    const persistido = await repositorio.obterPorTenant('acme');
    expect(persistido?.SessaoUsuario.CadMaqCod).toBe('PDV01');
  });

  it('reaproveita o cache quando nada mudou, sem retransmitir o payload (FR-008)', async () => {
    const { fetchImpl, chamadas } = criarFetchFalso(payload('acme'));

    await carregarBootstrap({ repositorio, analisador, fetchImpl });
    const segunda = await carregarBootstrap({ repositorio, analisador, fetchImpl });

    expect(segunda.estado).toBe('pronto');
    if (segunda.estado !== 'pronto') return;

    expect(segunda.reaproveitado).toBe(true);
    // O payload de ~5MB só foi transmitido no primeiro carregamento.
    expect(chamadas().corposEnviados).toBe(1);
    expect(chamadas().total).toBe(2);
  });

  it('regrava quando o payload muda', async () => {
    const primeiro = criarFetchFalso(payload('acme', 'PDV01'));
    await carregarBootstrap({ repositorio, analisador, fetchImpl: primeiro.fetchImpl });

    const segundo = criarFetchFalso(payload('acme', 'PDV02'));
    const resultado = await carregarBootstrap({
      repositorio,
      analisador,
      fetchImpl: segundo.fetchImpl,
    });

    expect(resultado.estado).toBe('pronto');
    if (resultado.estado !== 'pronto') return;

    expect(resultado.reaproveitado).toBe(false);
    expect((await repositorio.obterPorTenant('acme'))?.SessaoUsuario.CadMaqCod).toBe('PDV02');
  });

  it('isola tenants diferentes no mesmo navegador (FR-009, Cenário 3)', async () => {
    await carregarBootstrap({
      repositorio,
      analisador,
      fetchImpl: criarFetchFalso(payload('acme', 'PDV01')).fetchImpl,
    });
    await carregarBootstrap({
      repositorio,
      analisador,
      fetchImpl: criarFetchFalso(payload('beta', 'PDV99')).fetchImpl,
    });

    const acme = await repositorio.obterPorTenant('acme');
    const beta = await repositorio.obterPorTenant('beta');

    expect(acme?.SessaoUsuario.CadMaqCod).toBe('PDV01');
    expect(beta?.SessaoUsuario.CadMaqCod).toBe('PDV99');
    // O registro de um tenant nunca sobrescreve o do outro.
    expect(acme?._versionHash).not.toBe(beta?._versionHash);
    expect(await db.bootstrap.count()).toBe(2);
  });

  it('nunca reaproveita o cache de outro tenant via 304 (FR-009)', async () => {
    await carregarBootstrap({
      repositorio,
      analisador,
      fetchImpl: criarFetchFalso(payload('acme')).fetchImpl,
    });

    // O hash inclui o tenant, então o hash de `acme` não casa com o de `beta`.
    const beta = criarFetchFalso(payload('beta'));
    const resultado = await carregarBootstrap({
      repositorio,
      analisador,
      fetchImpl: beta.fetchImpl,
    });

    expect(resultado.estado).toBe('pronto');
    if (resultado.estado !== 'pronto') return;

    expect(resultado.registro.tenant).toBe('beta');
    expect(beta.chamadas().corposEnviados).toBe(1);
  });

  it('trata 401 como sessão encerrada', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 401 }));

    const resultado = await carregarBootstrap({ repositorio, analisador, fetchImpl });

    expect(resultado.estado).toBe('sessao-encerrada');
  });

  it('trata erro não-401 como recuperável, sem apagar o cache (AUTH-07)', async () => {
    await carregarBootstrap({
      repositorio,
      analisador,
      fetchImpl: criarFetchFalso(payload('acme')).fetchImpl,
    });

    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 500 }));
    const resultado = await carregarBootstrap({ repositorio, analisador, fetchImpl });

    expect(resultado.estado).toBe('erro-recuperavel');
    expect(await repositorio.obterPorTenant('acme')).toBeDefined();
  });

  it('trata falha de rede como recuperável', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new Error('offline'));

    const resultado = await carregarBootstrap({ repositorio, analisador, fetchImpl });

    expect(resultado.estado).toBe('erro-recuperavel');
  });
});
