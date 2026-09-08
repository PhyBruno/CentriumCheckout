/**
 * Interpretação da resposta de `ValidarNFCe` (T002,
 * `specs/014-validacao-previa-nfce/contracts/validacao-domain-api.md` §1).
 *
 * Domínio puro (Constitution II): sem React, Zustand, TanStack Query nem rede.
 * Recebe o corpo já validado na fronteira e devolve o veredito — total, sem
 * lançar, sem ler relógio.
 *
 * **A regra que este módulo existe para proteger (AD-110):** o bloqueio é
 * decidido **só** por `Valido`. `Type` é severidade de apresentação e nunca
 * entra na decisão. No ERP real, três dos quatro casos de recusa por crédito
 * chegam como `Warning` — e o único caso que **não** bloqueia também chega como
 * `Warning`. Ramificar em `Type` aprovaria a venda que o gate existe para
 * barrar, e recusaria a que ele deveria deixar passar.
 */

import type {
  MensagemValidacaoErp,
  ValidarNFCeOutput,
} from '../../../shared/schemas/validarNFCe.schema';

/**
 * Severidade GeneXus, **apenas** para apresentação (`research.md` D4).
 *
 * `DESCONHECIDA` não é defeito a corrigir: é o destino de qualquer código novo
 * que o ERP passe a mandar. Falhar aqui derrubaria a tela por causa de um campo
 * que não decide nada.
 */
export type SeveridadeERP = 'ERRO' | 'AVISO' | 'INFORMACAO' | 'DESCONHECIDA';

/** Mensagem do ERP já normalizada para o Checkout (`data-model.md` §1). */
export interface MensagemValidacao {
  /** `Id` do ERP — hoje sempre `'9999'`; não é usado em nenhuma decisão. */
  readonly id: string;
  /** Só apresentação. **Não** decide bloqueio (AD-110). */
  readonly severidade: SeveridadeERP;
  /** `Description` repassado íntegro, sem reescrita nem resumo (`FR-007`, I11). */
  readonly texto: string;
}

/** Por que o veredito não pôde ser obtido (`erp-validacao-api.md`, "Erros"). */
export type CausaIndisponibilidade = 'REDE' | 'TIMEOUT' | 'SERVIDOR' | 'RESPOSTA_INVALIDA';

/**
 * Desfecho de uma consulta ao gate.
 *
 * União discriminada, e não um objeto com campos opcionais: é o que impede um
 * call site de ler `avisos` sem antes decidir o desfecho — e, principalmente,
 * de tratar `INDISPONIVEL` como se fosse aceite por descuido de `if`.
 *
 * Homônimo do `Veredito` de `stores/slices/pagamentoSlice.ts` **de propósito
 * separado**: aquele é a porta reduzida que a feature 008 consome (`aceita`
 * sim/não, que é tudo que ela precisa saber — Interface Segregation); este é o
 * tipo completo, que só a 014 manipula.
 */
export type Veredito =
  | { readonly resultado: 'ACEITA'; readonly avisos: readonly MensagemValidacao[] }
  | { readonly resultado: 'RECUSADA'; readonly motivos: readonly MensagemValidacao[] }
  | { readonly resultado: 'INDISPONIVEL'; readonly causa: CausaIndisponibilidade };

/**
 * Recusa sem texto do ERP (`FR-008`).
 *
 * A frase nomeia o que aconteceu e a saída, porque o operador não tem como
 * adivinhar: o ERP recusou sem dizer por quê, e insistir no mesmo pagamento não
 * vai funcionar.
 */
export const MOTIVO_RECUSA_GENERICA =
  'O ERP recusou esta venda, mas não informou o motivo. Revise cliente, condição e formas de pagamento.';

/**
 * Códigos de severidade do GeneXus (`GeneXus.Common.Messages_Message.Type`).
 *
 * Mapeados para exibição apenas. Qualquer outro valor vira `DESCONHECIDA`.
 */
const SEVERIDADE_POR_TIPO: ReadonlyMap<number, SeveridadeERP> = new Map([
  [0, 'INFORMACAO'],
  [1, 'AVISO'],
  [2, 'ERRO'],
]);

function severidadeDe(tipo: number): SeveridadeERP {
  return SEVERIDADE_POR_TIPO.get(tipo) ?? 'DESCONHECIDA';
}

/** Copia o texto do ERP sem reescrever (I11): o mapper só traduz a severidade. */
function normalizar(mensagem: MensagemValidacaoErp): MensagemValidacao {
  return {
    id: mensagem.Id,
    severidade: severidadeDe(mensagem.Type),
    texto: mensagem.Description,
  };
}

/**
 * Traduz a resposta do ERP em veredito.
 *
 * Ramifica **exclusivamente** em `resposta.Valido` (`FR-006`, I3). O `Type` das
 * mensagens só chega ao resultado como `severidade`, para a notificação
 * escolher o estilo.
 */
export function interpretarRespostaValidacao(resposta: ValidarNFCeOutput): Veredito {
  const mensagens = resposta.messages.map(normalizar);

  if (resposta.Valido) {
    return { resultado: 'ACEITA', avisos: mensagens };
  }

  // `FR-008`: recusa sem mensagem ainda precisa dizer alguma coisa ao operador.
  // Um toast vazio seria indistinguível de "nada aconteceu", e o operador
  // repetiria o mesmo gesto até desistir.
  if (mensagens.length === 0) {
    return {
      resultado: 'RECUSADA',
      motivos: [{ id: '', severidade: 'ERRO', texto: MOTIVO_RECUSA_GENERICA }],
    };
  }

  return { resultado: 'RECUSADA', motivos: mensagens };
}

/** Veredito de quem não conseguiu perguntar ao ERP (`FR-009`, I4). */
export function vereditoDeFalha(causa: CausaIndisponibilidade): Veredito {
  return { resultado: 'INDISPONIVEL', causa };
}

/**
 * A venda pode ser emitida? (`FR-015`, I6)
 *
 * `null` — nenhuma consulta bem-sucedida nesta venda — é `false`. Só `ACEITA`
 * autoriza: `INDISPONIVEL` não é "provavelmente ok", é ausência de veredito.
 */
export function autorizaFinalizacao(veredito: Veredito | null): boolean {
  return veredito !== null && veredito.resultado === 'ACEITA';
}
