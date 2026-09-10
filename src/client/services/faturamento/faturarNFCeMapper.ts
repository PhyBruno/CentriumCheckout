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
  faturarNFCeRejeitadaOutputSchema,
  suspenderNFCeOutputSchema,
  type MensagemErp,
  type NotaFiscalRejeitada,
  type NotaFiscalResposta,
} from '../../../shared/schemas/faturarNFCe.schema';
import type { SuspenderOuFaturar } from '../../domain/venda/montarRetratoVenda';

export type ResultadoMapeamento =
  | {
      readonly estado: 'ok';
      /** `null` em `SUSPENDER` — suspender não emite documento fiscal. */
      readonly notaFiscal: NotaFiscalResposta | null;
    }
  /**
   * O ERP **gravou** a NFCe e ela não foi autorizada (correção do usuário,
   * 2026-09-10).
   *
   * Categoria própria, e não um `invalida` com texto melhor, porque o desfecho
   * na tela é oposto: aqui a venda **não** pode continuar no caixa. O documento
   * já existe do lado do ERP, então reenviar a mesma venda emitiria uma
   * segunda NFCe para a mesma compra.
   */
  | {
      readonly estado: 'rejeitada';
      /** O que o ERP disse, nunca texto inventado por nós. */
      readonly mensagem: string;
      /** `NotaFiscal.NumeroNota` — por onde o operador acha a nota no ERP. */
      readonly numeroNota: number | null;
      readonly serieNota: string | null;
    }
  /** 2xx que não descreve uma venda concluída — tratado como falha de negócio. */
  | { readonly estado: 'invalida'; readonly mensagem: string };

const MENSAGEM_PADRAO_FATURAR =
  'O ERP respondeu sem a nota fiscal pronta para impressão. A venda não foi emitida.';
const MENSAGEM_PADRAO_SUSPENDER =
  'O ERP respondeu em formato inesperado. A venda não foi suspensa.';
const MENSAGEM_PADRAO_REJEICAO =
  'O ERP registrou a NFCe como não autorizada, mas não informou o motivo.';

/** `NotaFiscal.Autorizada` — só `'S'` autoriza; o resto é rejeição. */
function foiAutorizada(nota: NotaFiscalRejeitada): boolean {
  return (nota.Autorizada ?? '').trim().toUpperCase() === 'S';
}

/** Descarta `undefined`, string vazia e string só de espaços numa tacada. */
function textoUtil(valor: string | undefined): string | null {
  const limpo = (valor ?? '').trim();
  return limpo === '' ? null : limpo;
}

/**
 * O motivo da rejeição, na ordem em que o ERP costuma preenchê-lo.
 *
 * `ErroMensagem` primeiro porque é o campo específico do documento (traz o texto
 * da SEFAZ, "Rejeicao: …"); `messages[]` depois, que é o canal genérico da
 * procedure. `ErroCodigo` vai junto do texto quando existe: é por ele que o
 * suporte pesquisa a rejeição, e sozinho ele não diz nada ao operador.
 */
function motivoDaRejeicao(
  nota: NotaFiscalRejeitada,
  mensagens: readonly MensagemErp[] | undefined,
): string {
  const texto =
    textoUtil(nota.ErroMensagem) ?? mensagemDoErp(mensagens) ?? MENSAGEM_PADRAO_REJEICAO;
  const codigo = nota.ErroCodigo;

  // `0` é o "sem erro" do contrato: exibi-lo ao lado de uma rejeição só
  // confundiria quem for pesquisar o código.
  return codigo === undefined || codigo === 0 ? texto : `${texto} (erro ${String(codigo)})`;
}

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
  if (comNotaFiscal.success) {
    return { estado: 'ok', notaFiscal: comNotaFiscal.data.OutCheckoutFaturarNFCe.NotaFiscal };
  }

  // Sem PDF/XML, mas **com** o bloco `NotaFiscal`: o ERP chegou a gravar o
  // documento e a autorização não saiu. É o caso que o operador vê como "NFCe
  // rejeitada", e é o único em que a venda não pode continuar no caixa.
  const rejeitada = faturarNFCeRejeitadaOutputSchema.safeParse(corpo);
  if (rejeitada.success) {
    const nota = rejeitada.data.OutCheckoutFaturarNFCe.NotaFiscal;
    // `Autorizada = 'S'` sem nota para imprimir é resposta contraditória, não
    // rejeição: o ERP afirma que autorizou e não entrega o documento. Cai no
    // caminho de falha de fronteira abaixo, que preserva a venda no caixa —
    // descartá-la aqui apagaria uma venda com base numa resposta que o próprio
    // contrato não sustenta.
    if (!foiAutorizada(nota)) {
      return {
        estado: 'rejeitada',
        mensagem: motivoDaRejeicao(nota, rejeitada.data.messages),
        numeroNota: nota.NumeroNota ?? null,
        serieNota: textoUtil(nota.SerieNota),
      };
    }
  }

  // Nenhum documento no corpo: a recusa veio só em `messages[]` (ou o corpo não
  // descreve venda nenhuma). Nada garante que o ERP tenha gravado NFCe, então a
  // venda continua aberta para o operador corrigir e reenviar.
  return {
    estado: 'invalida',
    mensagem: mensagemDoErp(envelope.data.messages) ?? MENSAGEM_PADRAO_FATURAR,
  };
}
