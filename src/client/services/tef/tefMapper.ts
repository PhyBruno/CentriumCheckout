/**
 * Respostas SmartTEF validadas em dois estágios → tipos do domínio de TEF
 * (T013, `contracts/erp-tef-api.md` §4).
 *
 * ```text
 * corpo ── respostaSmartTefSchema ── falha ──► ErroRespostaInvalida
 *            │ Sucesso === false ──► ErroNegocioErp(MensagemErro || frase padrão)
 *            ▼
 * JSON.parse(RespostaJson) ── lança ──► ErroRespostaInvalida
 *            ▼
 * schema interno da operação ── falha ──► ErroRespostaInvalida
 *            ▼
 * domínio
 * ```
 *
 * Uma responsabilidade só: adaptar o que o ERP devolveu. Nenhuma regra de
 * negócio mora aqui — quem interpreta o `payment_status` é o domínio, por fase
 * (`domain/tef/interpretarStatusTef.ts`). Mesmo papel de `pixMapper.ts`, sem
 * importá-lo.
 */

import type { CobrancaTef, ConsultaTef } from '../../domain/tef/cobrancaTef';
import type { Centavos } from '../../domain/precificacao/dinheiro';
import {
  consultaCardRespSchema,
  criarCardRespSchema,
  estornoRespSchema,
  respostaSmartTefSchema,
} from '../../../shared/schemas/tef.schema';
import { ErroNegocioErp, ErroRespostaInvalida } from '../errosErp';

/** Frase quando o ERP recusa sem dizer por quê (`MensagemErro` vazia). */
export const MENSAGEM_RECUSA_SMARTTEF_PADRAO = 'A SmartTEF recusou a operação.';

/**
 * Primeiro estágio: o envelope de transporte e o `JSON.parse` do texto de
 * dentro. Devolve o JSON interno **ainda sem schema** — o segundo estágio é de
 * cada operação, porque cada uma tem um SDT diferente.
 *
 * `Sucesso: false` é recusa de negócio, não resposta malformada: a frase do ERP
 * vai íntegra para o operador (Constitution III). É o padrão de recusa destes
 * três métodos, que não declaram `messages[]`.
 */
export function lerRespostaSmartTef(endpoint: string, corpo: unknown): unknown {
  const envelope = respostaSmartTefSchema.safeParse(corpo);
  if (!envelope.success) {
    throw new ErroRespostaInvalida(endpoint, envelope.error.message);
  }

  if (!envelope.data.Sucesso) {
    const mensagem = envelope.data.MensagemErro.trim();
    throw new ErroNegocioErp(
      endpoint,
      mensagem === '' ? MENSAGEM_RECUSA_SMARTTEF_PADRAO : mensagem,
    );
  }

  try {
    return JSON.parse(envelope.data.RespostaJson) as unknown;
  } catch {
    throw new ErroRespostaInvalida(endpoint, 'RespostaJson não é JSON');
  }
}

/**
 * `CriarCardPagamento` → `CobrancaTef`. O `valor` vem do call site: o que a
 * SmartTEF devolve como valor é texto e nunca é lido (Constitution V).
 */
export function paraCobrancaTef(interno: unknown, valor: Centavos): CobrancaTef {
  const lido = criarCardRespSchema.safeParse(interno);
  if (!lido.success) {
    throw new ErroRespostaInvalida('CriarCardPagamento', lido.error.message);
  }
  return {
    paymentIdentifier: lido.data.payment_identifier,
    valor,
    statusInicial: lido.data.payment_status,
  };
}

/**
 * `ConsultarStatusCard` → o item do identificador consultado.
 *
 * A resposta é lista (`research.md` D11). Item ausente ou lista vazia viram
 * `status: ''`, que as duas fases leem como **pendente** — nunca como desfecho.
 */
export function paraConsultaTef(interno: unknown, paymentIdentifier: string): ConsultaTef {
  const lido = consultaCardRespSchema.safeParse(interno);
  if (!lido.success) {
    throw new ErroRespostaInvalida('ConsultarStatusCard', lido.error.message);
  }

  const item = lido.data.find((candidato) => candidato.payment_identifier === paymentIdentifier);
  if (item === undefined) {
    return { status: '', bandeira: '', nsu: '', autorizacao: '', motivo: '' };
  }
  return {
    status: item.payment_status,
    bandeira: item.card_brand,
    nsu: item.nsu_host,
    autorizacao: item.autorization_code,
    motivo: item.reason,
  };
}

/** `EstornarPagamento` → o `payment_status` do pedido (normalmente `SOL_EST`). */
export function paraStatusEstorno(interno: unknown): string {
  const lido = estornoRespSchema.safeParse(interno);
  if (!lido.success) {
    throw new ErroRespostaInvalida('EstornarPagamento', lido.error.message);
  }
  return lido.data.payment_status;
}
