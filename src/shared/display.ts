import { z } from 'zod';

/**
 * Protocolo do canal entre a aba de checkout e a tela do cliente (feature 015,
 * `contracts/canal-display.md`).
 *
 * É o **primeiro canal entre abas do projeto** (research D2): até aqui não havia
 * `BroadcastChannel`, `SharedWorker`, ouvinte de `storage`, SSE nem WebSocket em
 * `src/`. Por isso o vocabulário é explícito — quem publica, quem só escuta, e o
 * que acontece com uma mensagem que não valida.
 *
 * Mora em `src/shared/` pelo mesmo motivo de `gerencial.ts`: é vocabulário comum
 * às duas pontas, e centralizá-lo faz um rename quebrar a compilação em vez de
 * virar erro silencioso em runtime.
 *
 * **Papéis, fixos:** a aba de checkout **publica**; a aba de display **escuta**.
 * A única mensagem que o display emite é `SOLICITAR_ESTADO`, que não carrega
 * dado nenhum. O display nunca publica estado, nunca gera cobrança e nunca
 * consulta o ERP (FR-013/014/015).
 */

/** Nome do `BroadcastChannel`. Mesma origem, mesmo navegador. */
export const NOME_CANAL_DISPLAY = 'centrium-checkout-display';

/**
 * Nome da janela em `window.open` — é o que faz o segundo clique reaproveitar a
 * tela já aberta em vez de criar outra (FR-028).
 */
export const NOME_JANELA_DISPLAY = 'centrium-checkout-display';

/** Rota da tela do cliente. */
export const ROTA_DISPLAY = '/display';

/** Pulso do checkout enquanto há cobrança na tela (FR-019). */
export const MS_PULSO_DISPLAY = 5_000;

/**
 * Silêncio a partir do qual o display volta ao repouso (FR-020).
 *
 * É 3× `MS_PULSO_DISPLAY` **de propósito**: duas mensagens perdidas não derrubam
 * um QR válido (research D8). Quem mexer em um dos dois precisa preservar essa
 * folga — há teste afirmando a razão.
 */
export const MS_SILENCIO_ATE_REPOUSO = MS_PULSO_DISPLAY * 3;

/**
 * O que a tela do cliente deve desenhar. União discriminada por `tela`: é a
 * única coisa que o display sabe sobre o mundo (FR-002, FR-012).
 *
 * `BOAS_VINDAS` não tem campo nenhum, e isso é a garantia de tipo de que o
 * repouso não expõe dado da venda ou do cliente (FR-003, invariante E2).
 */
export type EstadoDisplay =
  | { readonly tela: 'BOAS_VINDAS' }
  | {
      readonly tela: 'PIX_AGUARDANDO';
      /** Identidade da cobrança, espelhada de `CobrancaPix.trnGuid`. */
      readonly trnGuid: string;
      /**
       * Inteiro cru, **sem** a marca `Centavos` (research D5): uma marca é de
       * compilação e não sobrevive ao clone estrutural do canal. O display o
       * reconverte com `centavos()` na fronteira antes de formatar.
       */
      readonly valorCentavos: number;
      /** `data:` URL pronta para o `src` de uma `<img>`; o MIME já veio decidido. */
      readonly qrCodeFonte: string;
      /**
       * Viaja no payload mas **não é renderizado** (FR-005): a tela do cliente
       * não tem teclado nem apontador, então 130 caracteres ali seriam ruído.
       */
      readonly copiaECola: string;
    }
  | {
      readonly tela: 'PIX_APROVADO';
      readonly trnGuid: string;
      readonly valorCentavos: number;
      /**
       * Duração do contador, enviada pelo checkout (research D6) para que as
       * duas telas voltem juntas sem o display importar nada de `features/`.
       */
      readonly voltaEmMs: number;
    };

/** O que trafega no canal. Duas mensagens, discriminadas por `tipo`. */
export type MensagemDisplay =
  | {
      readonly tipo: 'ESTADO';
      readonly estado: EstadoDisplay;
      /** Resultado de `nomeDaLoja(sessao)` — **nunca** `tituloDoProduto` (research D1). */
      readonly nomeLoja: string | null;
      /** Identifica a aba que publicou. Diagnóstico; não decide nada. */
      readonly origemId: string;
      /** Epoch ms da emissão. Não ordena nada — o canal já entrega em ordem. */
      readonly emitidoEm: number;
    }
  | { readonly tipo: 'SOLICITAR_ESTADO' };

/**
 * `valorCentavos` inteiro e não negativo: fração aqui significa que um `double`
 * atravessou a fronteira, e `centavos()` lançaria adiante — melhor descartar a
 * mensagem do que pintar um valor errado na tela do cliente (invariante E3).
 */
const valorCentavosSchema = z.number().int().min(0);

const estadoDisplaySchema = z.discriminatedUnion('tela', [
  z.object({ tela: z.literal('BOAS_VINDAS') }),
  z.object({
    tela: z.literal('PIX_AGUARDANDO'),
    trnGuid: z.string(),
    valorCentavos: valorCentavosSchema,
    qrCodeFonte: z.string(),
    copiaECola: z.string(),
  }),
  z.object({
    tela: z.literal('PIX_APROVADO'),
    trnGuid: z.string(),
    valorCentavos: valorCentavosSchema,
    // Positivo: um zero deixaria a confirmação invisível (invariante E4).
    voltaEmMs: z.number().int().positive(),
  }),
]);

const mensagemDisplaySchema = z.discriminatedUnion('tipo', [
  z.object({
    tipo: z.literal('ESTADO'),
    estado: estadoDisplaySchema,
    nomeLoja: z.string().nullable(),
    origemId: z.string(),
    emitidoEm: z.number(),
  }),
  z.object({ tipo: z.literal('SOLICITAR_ESTADO') }),
]);

/**
 * Fronteira de entrada do display (FR-022, Constitution IV): devolve a mensagem
 * validada, ou `null` para **descartar em silêncio**.
 *
 * Descartar não é o mesmo que voltar ao repouso, e a diferença importa: depois
 * de um deploy, uma aba aberta há horas continua rodando o bundle antigo e pode
 * publicar um formato que esta ponta não conhece — o que não é evidência
 * nenhuma de que a cobrança acabou. Quem tira um QR obsoleto da tela é sempre o
 * corte por silêncio (`MS_SILENCIO_ATE_REPOUSO`), nunca a validação.
 *
 * Nenhum descarte produz toast, alerta ou texto de erro: a tela é virada ao
 * cliente (FR-011).
 */
export function interpretarMensagemDisplay(dado: unknown): MensagemDisplay | null {
  const resultado = mensagemDisplaySchema.safeParse(dado);
  return resultado.success ? resultado.data : null;
}

/**
 * Evento de mensagem reduzido ao **único** campo que este protocolo lê.
 *
 * Não é o `MessageEvent` do DOM de propósito: depender só do que se usa é o que
 * permite o dublê de teste ser três linhas (contrato §5).
 */
export interface EventoMensagem {
  readonly data: unknown;
}

/**
 * Fatia mínima da API de canal usada pelo publicador — `postMessage`,
 * `addEventListener('message')` e `close`. `BroadcastChannel` a satisfaz
 * estruturalmente; um objeto de teste também (Dependency Inversion,
 * Constitution II).
 */
export interface CanalBruto {
  postMessage(mensagem: unknown): void;
  addEventListener(tipo: 'message', ouvinte: (evento: EventoMensagem) => void): void;
  removeEventListener(tipo: 'message', ouvinte: (evento: EventoMensagem) => void): void;
  close(): void;
}

/** Cobrança viva na tela do cliente — o que liga pulso e handshake (C2, C3). */
export function ehCobrancaAtiva(estado: EstadoDisplay): boolean {
  return estado.tela !== 'BOAS_VINDAS';
}
