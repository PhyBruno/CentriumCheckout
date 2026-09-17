/**
 * Fronteira de entrada de `POST /api/erp/FaturarNFCe` (T005).
 *
 * Responsabilidade única: transformar o corpo bruto da resposta numa decisão
 * tipada. Não conhece React, Zustand nem `fetch`; recebe o `unknown` já lido e
 * devolve o veredito (`contracts/faturamento-api.md`).
 */

import { textoSemHtml } from '@/lib/textoSemHtml';
import { urlExternaSegura } from '@/lib/urlExterna';
import { recusaDeNegocio } from '../../../shared/schemas/erpJson';
import {
  faturarNFCeOutputSchema,
  faturarNFCeRejeitadaOutputSchema,
  rascunhoGravadoSchema,
  suspenderNFCeOutputSchema,
  type MensagemErp,
  type NotaFiscalRejeitada,
  type NotaFiscalResposta,
} from '../../../shared/schemas/faturarNFCe.schema';
import { ehRecusaDeCenarioTributario } from '../../domain/venda/recusaDoErp';
import type { SuspenderOuFaturar } from '../../domain/venda/montarRetratoVenda';

/**
 * O rascunho que o ERP informou na resposta — `null` em cada campo que não veio.
 *
 * É a identificação do documento para a correção no ERP (AD-239): na rejeição
 * da SEFAZ a nota volta com `NumeroNota: "0"` e `SerieNota: ""` (medido em
 * 2026-09-16), e o par rascunho + série da raiz é o que o operador procura lá.
 */
export interface RascunhoInformado {
  readonly numeroRascunho: number | null;
  readonly serieRascunho: string | null;
}

/**
 * O que o ERP devolveu sobre uma NFCe gravada e não autorizada — estruturado
 * desde o contrato de 2026-09-14 (AD-238, AD-239).
 */
export interface RetornoRejeicao extends RascunhoInformado {
  /** Texto do Fisco (ou de `messages[]`), já sem HTML — nunca inventado. */
  readonly mensagem: string;
  /** `ErroCodigo`, com o `0` do contrato como `null`. */
  readonly codigoErro: number | null;
  /** `RetornoMensagemIA`: texto puro, quebras de linha preservadas. */
  readonly sugestaoIA: string | null;
  /** `UrlChamadas`, só se for `http(s)` absoluta (`urlExternaSegura`). */
  readonly urlChamadas: string | null;
}

export type ResultadoMapeamento =
  | {
      readonly estado: 'ok';
      /** `null` em `SUSPENDER` — suspender não emite documento fiscal. */
      readonly notaFiscal: NotaFiscalResposta | null;
    }
  /**
   * O ERP **gravou** a NFCe e a SEFAZ não a autorizou (correção do usuário,
   * 2026-09-10). A venda **não** pode continuar no caixa: reenviá-la emitiria
   * uma segunda NFCe para a mesma compra.
   */
  | ({ readonly estado: 'rejeitada' } & RetornoRejeicao)
  /**
   * Recusa de validação em `messages` (saldo, regra de NFCe) — não é erro na
   * nota (AD-239). A venda continua no caixa; o rascunho que o ERP já gravou,
   * quando informado, é adotado para o reenvio (AD-235).
   */
  | {
      readonly estado: 'recusada';
      readonly mensagem: string;
      readonly numeroRascunho?: number;
      readonly serieRascunho?: string;
    }
  /**
   * Cenário tributário não encontrado (AD-239): a falha é de cadastro fiscal do
   * ERP e não há o que corrigir no Checkout. A venda sai do caixa.
   */
  | ({ readonly estado: 'cenario-tributario'; readonly mensagem: string } & RascunhoInformado)
  /** 2xx que não descreve desfecho nenhum — falha de fronteira, venda no caixa. */
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
 * Rascunho + série do primeiro nível, com ou sem envelope. `0` é o "sem
 * rascunho" do SDT e vira `null`, como a série vazia.
 */
function rascunhoInformado(corpo: unknown): RascunhoInformado {
  const lido = rascunhoGravadoSchema.safeParse(corpo);
  const numero = lido.success ? lido.data.NumeroRascunho : undefined;
  const serie = lido.success ? textoUtil(lido.data.CadSerieNFCe) : null;
  return {
    numeroRascunho: numero !== undefined && numero > 0 ? numero : null,
    serieRascunho: serie,
  };
}

/**
 * O mesmo par como fragmento opcional — para a recusa de validação, que só
 * ganha as chaves quando há o que adotar.
 */
function rascunhoParaAdotar(corpo: unknown): {
  readonly numeroRascunho?: number;
  readonly serieRascunho?: string;
} {
  const { numeroRascunho, serieRascunho } = rascunhoInformado(corpo);
  return {
    ...(numeroRascunho === null ? {} : { numeroRascunho }),
    ...(serieRascunho === null ? {} : { serieRascunho }),
  };
}

/**
 * Texto que o ERP mandou junto, quando mandou — só o que passou pelo schema, e
 * sem inventar mensagem quando não há nenhuma.
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
 * O retorno da rejeição (AD-238, AD-239).
 *
 * `ErroMensagem` primeiro porque é o campo específico do documento (o texto da
 * SEFAZ, "Rejeicao: …"), com o HTML removido (pendência 50); `messages[]`
 * depois, que é o canal genérico da procedure. O desfecho `N` (outros status de
 * lote) passa pelo mesmo caminho, sem sugestão e sem link.
 */
function retornoDaRejeicao(
  corpo: unknown,
  nota: NotaFiscalRejeitada,
  mensagens: readonly MensagemErp[] | undefined,
): RetornoRejeicao {
  const erroMensagem = textoUtil(nota.ErroMensagem);
  const codigo = nota.ErroCodigo;

  return {
    mensagem:
      (erroMensagem === null ? null : textoUtil(textoSemHtml(erroMensagem))) ??
      mensagemDoErp(mensagens) ??
      MENSAGEM_PADRAO_REJEICAO,
    codigoErro: codigo === undefined || codigo === 0 ? null : codigo,
    ...rascunhoInformado(corpo),
    // Texto puro: as quebras de linha são do conteúdo e ficam; só a string
    // inteiramente em branco vira ausência.
    sugestaoIA:
      textoUtil(nota.RetornoMensagemIA) === null ? null : (nota.RetornoMensagemIA ?? null),
    urlChamadas: urlExternaSegura(nota.UrlChamadas),
  };
}

/**
 * Recusa em `messages` (`Type: 1`): cenário tributário limpa o caixa, qualquer
 * outra é validação e devolve a venda ao operador (AD-239).
 */
function desfechoDaRecusa(corpo: unknown, recusa: string): ResultadoMapeamento {
  if (ehRecusaDeCenarioTributario(recusa)) {
    return { estado: 'cenario-tributario', mensagem: recusa, ...rascunhoInformado(corpo) };
  }
  return { estado: 'recusada', mensagem: recusa, ...rascunhoParaAdotar(corpo) };
}

/**
 * `SUSPENDER` e `FATURAR` têm exigências diferentes na resposta: só a segunda
 * produz documento fiscal (`contracts/faturamento-api.md`, "Efeito colateral em
 * sucesso", passo 5).
 */
export function mapearRespostaFaturamento(
  operacao: SuspenderOuFaturar,
  corpo: unknown,
): ResultadoMapeamento {
  // Envelope primeiro: é o que dá acesso tipado a `messages` mesmo quando a
  // nota fiscal não veio.
  const envelope = suspenderNFCeOutputSchema.safeParse(corpo);
  if (!envelope.success) {
    return {
      estado: 'invalida',
      mensagem: operacao === 'SUSPENDER' ? MENSAGEM_PADRAO_SUSPENDER : MENSAGEM_PADRAO_FATURAR,
    };
  }

  // Recusa de negócio (`messages` com `Type: 1`).
  const recusa = recusaDeNegocio(corpo);

  if (operacao === 'SUSPENDER') {
    // Desde o contrato de 2026-09-14 o ERP valida saldo também na suspensão, e
    // uma recusa lida como sucesso limparia a venda sem ela ter sido suspensa.
    // O bloco `NotaFiscal` que a suspensão real devolve (`Autorizada: 'N'`) não
    // é rejeição: suspender não transmite nada à SEFAZ.
    return recusa === null ? { estado: 'ok', notaFiscal: null } : desfechoDaRecusa(corpo, recusa);
  }

  // `semEnvelope` nos dois schemas: o ERP real entrega `NotaFiscal` na **raiz**,
  // e só o YAML a embrulha em `OutCheckoutFaturarNFCe`.
  const comNotaFiscal = faturarNFCeOutputSchema.safeParse(corpo);
  if (comNotaFiscal.success) {
    return { estado: 'ok', notaFiscal: comNotaFiscal.data.NotaFiscal };
  }

  // Sem PDF/XML, mas **com** o bloco `NotaFiscal`: o ERP gravou o documento e a
  // autorização não saiu.
  const rejeitada = faturarNFCeRejeitadaOutputSchema.safeParse(corpo);
  if (rejeitada.success) {
    const nota = rejeitada.data.NotaFiscal;
    // `Autorizada = 'S'` sem nota para imprimir é resposta contraditória, não
    // rejeição — cai na falha de fronteira abaixo, que preserva a venda.
    // Bloco `NotaFiscal` sem desfecho (`Autorizada` vazio) **e** recusa em
    // `messages` é a validação que recusou antes de emitir, com o SDT em branco
    // — não uma NFCe gravada e rejeitada (AD-235).
    const semDesfecho = textoUtil(nota.Autorizada) === null && recusa !== null;
    if (!foiAutorizada(nota) && !semDesfecho) {
      return {
        estado: 'rejeitada',
        // `messages` vem da **raiz** (`envelope`), não do que `semEnvelope`
        // devolveu.
        ...retornoDaRejeicao(corpo, nota, envelope.data.messages),
      };
    }
  }

  if (recusa !== null) {
    return desfechoDaRecusa(corpo, recusa);
  }

  // Nenhum documento e nenhuma recusa: nada garante que o ERP tenha gravado NFCe
  // (medido em 2026-09-16 no rascunho 6036), então a venda continua aberta.
  return {
    estado: 'invalida',
    mensagem: mensagemDoErp(envelope.data.messages) ?? MENSAGEM_PADRAO_FATURAR,
  };
}
