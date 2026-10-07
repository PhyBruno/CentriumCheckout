import { z } from 'zod';
import { inteiroErp, semEnvelope } from './erpJson';

/**
 * Fronteira dos três endpoints SmartTEF (T010, `data-model.md` §3,
 * `contracts/erp-tef-api.md` §4, AD-259).
 *
 * **Dois estágios.** `CriarCardPagamento`, `ConsultarStatusCard` e
 * `EstornarPagamento` devolvem o mesmo envelope de transporte,
 * `SDTSmartTefResposta`, e o dado da SmartTEF chega dentro dele como **texto**
 * JSON (`RespostaJson`). Validar só o envelope deixaria entrar sem schema o campo
 * que decide o dinheiro (`payment_status`) — mesmo erro que
 * `corpo-da-nfce-viaja-envelopado` registrou para o retrato. Quem encadeia os
 * dois estágios é `services/tef/tefMapper.ts`.
 *
 * **Formas medidas ao vivo em 2026-10-07** (AD-267, C0, POS simulado): envelope
 * plano com `CodigoStatusHttp` numérico (`201`), `RespostaJson` em **lista** na
 * consulta e em objeto único no estorno. Os schemas seguem aceitando as duas
 * formas onde a KB admitia as duas (envelope nomeado, objeto único na consulta):
 * a tolerância é barata e outra versão do ERP pode ainda mandá-las.
 */

/**
 * `SDTSmartTefResposta`.
 *
 * - `Sucesso` é "a SmartTEF respondeu 2xx" — **não** é veredito de pagamento. A
 *   recusa de negócio chega por `Sucesso: false` + `MensagemErro`, e não por
 *   `messages[]`: nenhum dos três métodos declara `out:&Messages`.
 * - `CodigoStatusHttp` é `0` quando a chamada nem saiu (recusa local do
 *   `PSmartTEF`, como "Serial do POS … nao localizado"). Número ou texto, como
 *   todo número do GeneXus (`inteiroErp`).
 * - Envelope `{ RespostaSmartTEF: … }` ou plano: **medido plano**, aceitos os
 *   dois (`semEnvelope`, regra de AD-218).
 */
export const respostaSmartTefSchema = semEnvelope(
  'RespostaSmartTEF',
  z.looseObject({
    Sucesso: z.boolean(),
    CodigoStatusHttp: inteiroErp,
    MensagemErro: z.string(),
    RespostaJson: z.string(),
  }),
);

/** Chaves em que um detalhe em forma de objeto costuma trazer a frase legível. */
const CHAVES_DE_FRASE = [
  'message',
  'mensagem',
  'description',
  'descricao',
  'reason',
  'error',
  'detail',
  'msg',
] as const;

/**
 * Qualquer valor que a SmartTEF mande num campo de detalhe, como texto.
 *
 * - ausente e `null` → `''`; texto → ele mesmo; número e booleano → `String`;
 * - **objeto** → a primeira frase não vazia em `message`/`description`/…, e, se
 *   não houver, o próprio JSON — o operador vê a forma real em vez de nada;
 * - lista → JSON.
 *
 * Total e sem lançar: o objeto é o caso real de `reason` numa rejeição
 * (`REJ_EST`/`REJ_PAG`, 2026-10-07), que antes reprovava a resposta **inteira** e
 * escondia o status — o `REJ_EST` nunca chegava a ser interpretado.
 */
function textoDeDetalhe(valor: unknown): string {
  if (valor === null || valor === undefined) {
    return '';
  }
  if (typeof valor === 'string') {
    return valor;
  }
  if (typeof valor === 'number' || typeof valor === 'boolean') {
    return String(valor);
  }
  if (typeof valor === 'object' && !Array.isArray(valor)) {
    const registro = valor as Record<string, unknown>;
    let chaveDeFraseVazia = false;
    for (const chave of CHAVES_DE_FRASE) {
      const frase = registro[chave];
      if (typeof frase === 'string') {
        if (frase.trim() !== '') {
          return frase;
        }
        chaveDeFraseVazia = true;
      }
    }
    // Forma conhecida, sem frase: o `{"msg":""}` que o `REJ_PAG` real manda
    // (2026-10-07). Vazio, e não o JSON — a tela mostra "—", como para `null`.
    if (chaveDeFraseVazia) {
      return '';
    }
  }
  try {
    return JSON.stringify(valor);
  } catch {
    return '';
  }
}

/**
 * Campo de detalhe da SmartTEF que o Checkout só **exibe**. A tela mostra "—"
 * para vazio, e nada aqui entra em cálculo — o valor cobrado é sempre o do
 * Checkout (Constitution V). **Nunca reprova a resposta**: um campo que só se
 * mostra não pode esconder o `payment_status`, que é o que decide o dinheiro.
 */
const detalheTexto = z.unknown().transform(textoDeDetalhe).default('');

/**
 * `JSON.parse(RespostaJson)` de `CriarCardPagamento` (`SDTSmartTefCriarCardResp`).
 *
 * `payment_identifier` não vazio: é a chave da consulta, do estorno e do
 * `TEFPagId` da NFCe. Sem ele não existe cobrança que o Checkout consiga
 * acompanhar, e a resposta é tratada como fora do contrato.
 */
export const criarCardRespSchema = z.looseObject({
  payment_identifier: z.string().min(1),
  payment_status: z.string(),
});

/**
 * Um item de `ConsultarStatusCard` (`SDTSmartTefConsultaCard`, 40 campos na KB).
 *
 * `payment_status` é `string` livre: o estreitamento é das funções de domínio
 * (`interpretarStatusTef.ts`), cada uma com ramo `default` (T1).
 * `autorization_code` é a grafia da SmartTEF, sem o "h".
 */
export const consultaCardItemSchema = z.looseObject({
  payment_identifier: z.string(),
  payment_status: z.string(),
  card_brand: detalheTexto,
  nsu_host: detalheTexto,
  autorization_code: detalheTexto,
  reason: detalheTexto,
});

/**
 * `RespostaJson` de `ConsultarStatusCard`: **lista** na KB (`.Count` em
 * `PSmartTEF`) e **medida lista** em 2026-10-07. Objeto único também é aceito e
 * normalizado para lista — quem consome escolhe o item pelo `payment_identifier`.
 */
export const consultaCardRespSchema = z.union([
  z.array(consultaCardItemSchema),
  consultaCardItemSchema.transform((item) => [item]),
]);

/**
 * `RespostaJson` de `EstornarPagamento` (`SDTSmartTefCancelamentoResp`, objeto
 * único). `payment_status` normalmente `SOL_EST`, às vezes já `EST`
 * (`research.md` D14).
 */
export const estornoRespSchema = z.looseObject({
  payment_identifier: z.string(),
  payment_status: z.string(),
});

export type RespostaSmartTef = z.infer<typeof respostaSmartTefSchema>;
export type CriarCardResp = z.infer<typeof criarCardRespSchema>;
export type ConsultaCardItem = z.infer<typeof consultaCardItemSchema>;
export type EstornoResp = z.infer<typeof estornoRespSchema>;
