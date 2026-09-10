import { z } from 'zod';
import { inteiroErp, semEnvelope } from './erpJson';

/**
 * Validação de fronteira da resposta de `POST /api/erp/FaturarNFCe` (T003,
 * Constitution IV — `contracts/faturamento-api.md`).
 *
 * **O ERP real responde `FaturarNFCe` SEM envelope** — `NotaFiscal` chega na
 * raiz, ao lado de `produtos`/`FormasDePagamento`/`Log`, e não há `messages`.
 * Medido ao vivo em 2026-09-10 (tenant `c0lj6mvzeh`, emissão fiscal real
 * rejeitada pela SEFAZ), capturando a resposta crua no navegador.
 *
 * Isso **corrige** o que AD-165 registrou. Aquele levantamento classificou
 * `GetDav` e `FaturarNFCe` como os dois endpoints que "mantêm envelope +
 * `messages`", e foi por isso que `semEnvelope` foi aplicado a todos os outros
 * e não a este. A consequência era grave e silenciosa: exigindo
 * `OutCheckoutFaturarNFCe`, **nenhuma** resposta real casava — nem a rejeição
 * (que perdia o motivo) nem o sucesso (uma NFCe autorizada seria reportada como
 * falha de negócio, com a venda presa no caixa). O `ApiCentriumOAuth.yaml`
 * (linha 725) desenha o envelope, o ERP não o entrega.
 *
 * Por isso `semEnvelope`: aceita as duas formas e devolve sempre o conteúdo
 * interno. Não é indulgência — é o que permite ao `erp-mock` e ao YAML
 * coexistirem com o ERP de hoje sem uma segunda árvore de schemas.
 *
 * Objetos `loose` de propósito: `CheckoutFaturarNFCe` é ecoado inteiro na
 * resposta (produtos, formas de pagamento, log) e esta feature só precisa
 * garantir, na fronteira, os dois campos que consome. O resto passa íntegro —
 * o Checkout não reinterpreta dado do ERP (Constitution III).
 */

/** `GeneXus.Common.Messages_Message` (YAML, linha 1046). */
export const mensagemErpSchema = z.looseObject({
  Id: z.string().optional(),
  Type: z.number().int().optional(),
  Description: z.string().optional(),
});

/**
 * `CheckoutFaturarNFCe.NotaFiscal` (YAML, linha 1604), restrito ao que a
 * decisão de impressão consome (`data-model.md` §3/§5).
 *
 * `min(1)` nos dois campos é o ponto do contrato: uma NFCe **não** autorizada
 * volta com `PDFImpressao`/`XMLImpressao` vazios, e uma resposta 2xx nesse
 * estado é falha de negócio — nunca sucesso parcial que chegaria à impressão
 * com um PDF vazio.
 */
export const notaFiscalRespostaSchema = z.looseObject({
  PDFImpressao: z.string().min(1),
  XMLImpressao: z.string().min(1),
});

/**
 * Resposta de `FATURAR`: exige a nota fiscal pronta para apresentação.
 *
 * `messages` não entra aqui: na forma real ele não existe, e na forma do YAML
 * ele fica **ao lado** do envelope — fora do que `semEnvelope` devolve. Quem o
 * lê é `suspenderNFCeOutputSchema`, sobre a raiz, no mapper.
 */
export const faturarNFCeOutputSchema = semEnvelope(
  'OutCheckoutFaturarNFCe',
  z.looseObject({ NotaFiscal: notaFiscalRespostaSchema }),
);

/**
 * A **mesma** `CheckoutFaturarNFCe.NotaFiscal` (YAML, linha 1604) pelos campos
 * que só importam quando a emissão **não** foi autorizada.
 *
 * Existe porque `notaFiscalRespostaSchema` acima reprova exatamente esta
 * resposta — `PDFImpressao`/`XMLImpressao` chegam vazios — e, até 2026-09-10, o
 * `safeParse` reprovado fazia o Checkout descartar `ErroCodigo`/`ErroMensagem`
 * junto com o resto do bloco: a tela mostrava "O ERP respondeu sem a nota
 * fiscal pronta para impressão" quando o ERP tinha dito, ali no corpo, qual foi
 * a rejeição da SEFAZ (correção do usuário, 2026-09-10).
 *
 * Todo campo é opcional porque nenhum deles é o discriminante — quem discrimina
 * é a **presença do bloco `NotaFiscal`** (o ERP só o devolve depois de gravar o
 * documento) somada a `Autorizada !== 'S'`. Um `ErroMensagem` ausente numa
 * rejeição é resposta pobre, não resposta inválida.
 *
 * `inteiroErp` em vez de `z.number()`: `NumeroNota` é `int64` e o ERP real o
 * serializa como string JSON (AD-165).
 */
export const notaFiscalRejeitadaSchema = z.looseObject({
  NumeroNota: inteiroErp.optional(),
  SerieNota: z.string().optional(),
  /**
   * O ERP real devolve **`'R'`** (de "Rejeitada") — não `'N'`, como o nome
   * booleano do campo sugere (medido em 2026-09-10). Por isso quem decide é
   * `foiAutorizada`, comparando com `'S'`: qualquer outro valor é recusa, e o
   * conjunto de valores possíveis não está documentado em lugar nenhum.
   */
  Autorizada: z.string().optional(),
  ErroCodigo: inteiroErp.optional(),
  ErroMensagem: z.string().optional(),
});

/**
 * Resposta de `FATURAR` que **carrega o documento** sem autorizá-lo.
 *
 * O bloco `NotaFiscal` presente é o que separa "o ERP gravou a NFCe e a SEFAZ
 * recusou" de "a chamada nem chegou a virar documento": só o primeiro caso
 * limpa a tela para a próxima venda, porque só nele reenviar a mesma venda
 * duplicaria o documento já gravado.
 */
export const faturarNFCeRejeitadaOutputSchema = semEnvelope(
  'OutCheckoutFaturarNFCe',
  z.looseObject({ NotaFiscal: notaFiscalRejeitadaSchema }),
);

/**
 * Resposta de `SUSPENDER`: **não** exige `NotaFiscal`.
 *
 * Suspender não emite documento fiscal (`FR-002`, `contracts/faturamento-api.md`
 * § "Efeito colateral em sucesso", passo 5) — exigir o mesmo shape de `FATURAR`
 * transformaria toda suspensão bem-sucedida em falha de negócio.
 */
export const suspenderNFCeOutputSchema = z.looseObject({
  messages: z.array(mensagemErpSchema).optional(),
});

export type MensagemErp = z.infer<typeof mensagemErpSchema>;
export type NotaFiscalResposta = z.infer<typeof notaFiscalRespostaSchema>;
export type NotaFiscalRejeitada = z.infer<typeof notaFiscalRejeitadaSchema>;
export type FaturarNFCeOutput = z.infer<typeof faturarNFCeOutputSchema>;
