import type { RegistroBootstrap, RepositorioBootstrap } from '../db/bootstrapDb';
import { normalizarEtag } from '../../shared/etag';
import type { RequisicaoWorker, RespostaWorker } from './bootstrapWorkerProtocol';

/**
 * Carrega a configuração do ponto de venda (T023, US2).
 *
 * Responsabilidade única: orquestrar rede → worker → Dexie e decidir entre
 * reaproveitar o registro existente e gravar um novo (FR-008). Não conhece
 * React nem o estado de UI.
 */

export type ResultadoBootstrap =
  | {
      readonly estado: 'pronto';
      readonly registro: RegistroBootstrap;
      /** `true` quando nada mudou desde o último carregamento (FR-008). */
      readonly reaproveitado: boolean;
    }
  /** Renovação de sessão falhou — aciona AUTH-06. */
  | { readonly estado: 'sessao-encerrada' }
  /** Falha não-401: tela "Tentar novamente", sem novo login (AUTH-07/FR-007). */
  | { readonly estado: 'erro-recuperavel'; readonly mensagem: string }
  /**
   * O analisador foi encerrado no meio do carregamento (desmontagem do
   * componente, remontagem do StrictMode). Não há estado de UI a atualizar.
   */
  | { readonly estado: 'cancelado' };

/**
 * `encerrar()` foi chamado com uma análise ainda em voo.
 *
 * Existe para que a promise de `analisar()` **termine** em vez de ficar
 * pendurada para sempre: `postMessage` num worker já terminado é um no-op
 * silencioso, então sem isto o carregamento abandonado nunca reportaria nem
 * sucesso nem erro.
 */
export class AnalisadorCanceladoError extends Error {
  constructor() {
    super('Análise do bootstrap cancelada: o worker foi encerrado');
    this.name = 'AnalisadorCanceladoError';
  }
}

/** Porta do parse/validação — implementada pelo Web Worker (T022). */
export interface AnalisadorBootstrap {
  analisar(texto: string): Promise<RespostaWorker>;
  encerrar(): void;
}

export interface BootstrapClientDeps {
  readonly repositorio: RepositorioBootstrap;
  readonly analisador: AnalisadorBootstrap;
  readonly fetchImpl?: typeof fetch;
}

const ROTA_BOOTSTRAP = '/api/bootstrap';

interface AnalisePendente {
  readonly resolver: (resposta: RespostaWorker) => void;
  readonly rejeitar: (erro: unknown) => void;
}

/** Cria o analisador apoiado no Web Worker de `bootstrapWorker.ts`. */
export function criarAnalisadorViaWorker(): AnalisadorBootstrap {
  const worker = new Worker(new URL('./bootstrapWorker.ts', import.meta.url), { type: 'module' });

  // Um único listener para todas as chamadas: a correlação é pelo `id`, não
  // pela ordem de chegada.
  const pendentes = new Map<string, AnalisePendente>();

  const aoResponder = (evento: MessageEvent<RespostaWorker>): void => {
    const pendente = pendentes.get(evento.data.id);

    // Resposta de uma chamada que já terminou (ou foi cancelada): ignorar.
    if (pendente === undefined) {
      return;
    }

    pendentes.delete(evento.data.id);
    pendente.resolver(evento.data);
  };

  worker.addEventListener('message', aoResponder);

  return {
    async analisar(texto: string): Promise<RespostaWorker> {
      const id = crypto.randomUUID();

      return new Promise<RespostaWorker>((resolver, rejeitar) => {
        pendentes.set(id, { resolver, rejeitar });
        const requisicao: RequisicaoWorker = { id, texto };
        worker.postMessage(requisicao);
      });
    },

    encerrar(): void {
      // Terminar o worker sem isto deixaria toda análise em voo pendurada para
      // sempre — o `postMessage` já foi feito, mas a resposta nunca virá.
      for (const pendente of pendentes.values()) {
        pendente.rejeitar(new AnalisadorCanceladoError());
      }
      pendentes.clear();

      worker.removeEventListener('message', aoResponder);
      worker.terminate();
    },
  };
}

export async function carregarBootstrap(deps: BootstrapClientDeps): Promise<ResultadoBootstrap> {
  const executarFetch = deps.fetchImpl ?? fetch;

  const buscar = async (hashesConhecidos: readonly string[]): Promise<Response> =>
    executarFetch(ROTA_BOOTSTRAP, {
      credentials: 'same-origin',
      headers:
        hashesConhecidos.length > 0
          ? { 'If-None-Match': hashesConhecidos.map((hash) => `"${hash}"`).join(', ') }
          : {},
    });

  let resposta: Response;
  try {
    resposta = await buscar(await deps.repositorio.listarVersionHashes());
  } catch {
    return { estado: 'erro-recuperavel', mensagem: 'Não foi possível falar com o servidor.' };
  }

  // Nada mudou desde o último carregamento: o payload não é retransmitido.
  if (resposta.status === 304) {
    const hash = normalizarEtag(resposta.headers.get('ETag'));
    const registro = hash === null ? undefined : await deps.repositorio.obterPorVersionHash(hash);

    if (registro !== undefined) {
      return { estado: 'pronto', registro, reaproveitado: true };
    }

    // O cache local sumiu entre a listagem e a leitura: refaz sem condicional.
    try {
      resposta = await buscar([]);
    } catch {
      return { estado: 'erro-recuperavel', mensagem: 'Não foi possível falar com o servidor.' };
    }
  }

  if (resposta.status === 401) {
    return { estado: 'sessao-encerrada' };
  }

  if (!resposta.ok) {
    return {
      estado: 'erro-recuperavel',
      mensagem: 'Não foi possível carregar a configuração do ponto de venda.',
    };
  }

  let analise: RespostaWorker;
  try {
    analise = await deps.analisador.analisar(await resposta.text());
  } catch (erro) {
    // O componente desmontou durante o carregamento: encerrar em silêncio.
    if (erro instanceof AnalisadorCanceladoError) {
      return { estado: 'cancelado' };
    }
    throw erro;
  }

  if (!analise.ok) {
    return { estado: 'erro-recuperavel', mensagem: analise.erro };
  }

  const existente = await deps.repositorio.obterPorTenant(analise.payload.tenant);

  // FR-008: hash igual ao já persistido → não regrava os ~5MB no IndexedDB.
  if (existente !== undefined && existente._versionHash === analise.versionHash) {
    return { estado: 'pronto', registro: existente, reaproveitado: true };
  }

  const registro: RegistroBootstrap = { ...analise.payload, _versionHash: analise.versionHash };
  await deps.repositorio.salvar(registro);

  return { estado: 'pronto', registro, reaproveitado: false };
}
