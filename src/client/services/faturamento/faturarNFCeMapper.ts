/**
 * Fronteira de entrada de `POST /api/erp/FaturarNFCe` (T005).
 *
 * Responsabilidade única: transformar o corpo bruto da resposta numa decisão
 * tipada — nota fiscal válida ou erro de fronteira. Não conhece React, Zustand
 * nem `fetch`; recebe o `unknown` já lido e devolve o veredito
 * (`contracts/faturamento-api.md`).
 */

import {
  faturarNFCeOutputSchema,
  suspenderNFCeOutputSchema,
  type MensagemErp,
  type NotaFiscalResposta,
} from '../../../shared/schemas/faturarNFCe.schema';
import type { SuspenderOuFaturar } from '../../domain/venda/montarRetratoVenda';

export type ResultadoMapeamento =
  | {
      readonly estado: 'ok';
      /** `null` em `SUSPENDER` — suspender não emite documento fiscal. */
      readonly notaFiscal: NotaFiscalResposta | null;
    }
  /** 2xx que não descreve uma venda concluída — tratado como falha de negócio. */
  | { readonly estado: 'invalida'; readonly mensagem: string };

const MENSAGEM_PADRAO_FATURAR =
  'O ERP respondeu sem a nota fiscal pronta para impressão. A venda não foi emitida.';
const MENSAGEM_PADRAO_SUSPENDER =
  'O ERP respondeu em formato inesperado. A venda não foi suspensa.';

/**
 * Texto que o ERP mandou junto, quando mandou.
 *
 * A recusa de negócio do ERP chega em `messages[]`
 * (`GeneXus.Common.Messages_Message`, YAML linha 1046), não como HTTP 4xx —
 * ignorá-la deixaria o operador com "erro inesperado" quando o ERP explicou
 * exatamente o que faltou. Lido de forma defensiva: só o que passou pelo
 * schema, e sem inventar mensagem quando não há nenhuma.
 */
function mensagemDoErp(mensagens: readonly MensagemErp[] | undefined): string | null {
  if (mensagens === undefined) {
    return null;
  }

  const textos = mensagens
    .map((mensagem) => mensagem.Description)
    .filter((texto): texto is string => texto !== undefined && texto.trim() !== '');

  return textos.length === 0 ? null : textos.join(' ');
}

/**
 * `SUSPENDER` e `FATURAR` têm exigências diferentes na resposta: só a segunda
 * produz documento fiscal (`contracts/faturamento-api.md`, "Efeito colateral em
 * sucesso", passo 5). Validar as duas com o mesmo schema transformaria toda
 * suspensão bem-sucedida em falha de negócio.
 */
export function mapearRespostaFaturamento(
  operacao: SuspenderOuFaturar,
  corpo: unknown,
): ResultadoMapeamento {
  // Envelope primeiro: é o que dá acesso tipado a `messages` mesmo quando a
  // nota fiscal não veio — sem isso, a explicação do ERP só seria alcançável
  // por type assertion sobre o corpo bruto, que é justamente o que a tipagem
  // estrita deste projeto proíbe na fronteira.
  const envelope = suspenderNFCeOutputSchema.safeParse(corpo);
  if (!envelope.success) {
    return {
      estado: 'invalida',
      mensagem: operacao === 'SUSPENDER' ? MENSAGEM_PADRAO_SUSPENDER : MENSAGEM_PADRAO_FATURAR,
    };
  }

  if (operacao === 'SUSPENDER') {
    return { estado: 'ok', notaFiscal: null };
  }

  const comNotaFiscal = faturarNFCeOutputSchema.safeParse(corpo);
  if (!comNotaFiscal.success) {
    // A recusa de negócio do ERP costuma vir como 2xx com `messages` e sem
    // `PDFImpressao`/`XMLImpressao` — é aqui que ela é reconhecida.
    return {
      estado: 'invalida',
      mensagem: mensagemDoErp(envelope.data.messages) ?? MENSAGEM_PADRAO_FATURAR,
    };
  }

  return { estado: 'ok', notaFiscal: comNotaFiscal.data.OutCheckoutFaturarNFCe.NotaFiscal };
}
