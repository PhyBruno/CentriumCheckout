import { bootstrapPayloadSchema } from '../../shared/schemas/bootstrap.schema';
import { calcularVersionHash } from '../../shared/versionHash';
import type { RequisicaoWorker, RespostaWorker } from './bootstrapWorkerProtocol';

/**
 * Web Worker de parse e validação do bootstrap (T022, AUTH-04).
 *
 * Faz `JSON.parse`, validação Zod e cálculo do hash de versão do payload
 * (~5MB) fora da thread principal, para o skeleton de carregamento continuar
 * respondendo enquanto isso.
 */

interface EscopoWorker {
  addEventListener(
    tipo: 'message',
    ouvinte: (evento: MessageEvent<RequisicaoWorker>) => void,
  ): void;
  postMessage(mensagem: RespostaWorker): void;
}

// O `lib: DOM` do tsconfig tipa `self` como `Window`; dentro de um worker ele é
// um `DedicatedWorkerGlobalScope`. A conversão marca essa fronteira de ambiente
// de execução — é o único ponto do módulo que precisa dela.
const escopo = self as unknown as EscopoWorker;

function analisar(texto: string): RespostaWorker {
  let json: unknown;
  try {
    json = JSON.parse(texto);
  } catch {
    return { ok: false, erro: 'Configuração do ponto de venda não é JSON válido' };
  }

  // Validação de fronteira antes de entrar no domínio da aplicação
  // (Constitution IV) — nada é gravado no Dexie sem passar por aqui.
  const validado = bootstrapPayloadSchema.safeParse(json);
  if (!validado.success) {
    return { ok: false, erro: 'Configuração do ponto de venda fora do contrato esperado' };
  }

  return {
    ok: true,
    payload: validado.data,
    versionHash: calcularVersionHash(validado.data),
  };
}

escopo.addEventListener('message', (evento) => {
  escopo.postMessage(analisar(evento.data.texto));
});
