/**
 * Meios de pagamento da NFCe e predicados sobre a forma cadastrada (T002).
 *
 * Núcleo de tipos do domínio de pagamento (feature 008): todos os demais
 * módulos de `domain/pagamento/` e o `pagamentoSlice` partem daqui. Domínio
 * puro — sem React, Zustand, TanStack Query ou rede (Constitution II).
 *
 * Nenhuma decisão de roteamento mora neste arquivo: quem traduz
 * `meioPagtoNFe` + capacidades em veredito de integração é
 * `roteamentoIntegracao.ts` (`research.md` D5). Aqui ficam só as perguntas que
 * dependem **exclusivamente** da forma.
 */

import type { Centavos } from '../precificacao/dinheiro';

/**
 * União fechada sobre o domínio `NFCe_FormaPagto` da KB do ERP (AD-023,
 * `data-model.md` §1).
 *
 * O typo `ProgaramaFidelidade` é reproduzido **tal como existe no ERP** — o
 * valor corrigido nunca casaria com o que o `GetSessao` devolve, e a forma
 * seria descartada do catálogo em silêncio.
 */
export type MeioPagtoNFe =
  | 'Dinheiro'
  | 'Cheque'
  | 'CartaoCredito'
  | 'CartaoDebito'
  | 'CreditoLoja'
  | 'ValeAlimentacao'
  | 'ValeRefeicao'
  | 'ValePresente'
  | 'ValeCombustivel'
  | 'DuplicataMercantil'
  | 'BoletoBancario'
  | 'DepositoBancario'
  | 'Pix'
  | 'TransferenciaBancaria'
  | 'ProgaramaFidelidade'
  | 'PixEstatico'
  | 'CreditoEmLoja'
  | 'PagamentoNaoInformado'
  | 'SemPagamento'
  | 'PagamentoPosterior'
  | 'Outros';

/** Todo valor de `MeioPagtoNFe`, para o guard da fronteira Zod. */
export const MEIOS_PAGTO_NFE = [
  'Dinheiro',
  'Cheque',
  'CartaoCredito',
  'CartaoDebito',
  'CreditoLoja',
  'ValeAlimentacao',
  'ValeRefeicao',
  'ValePresente',
  'ValeCombustivel',
  'DuplicataMercantil',
  'BoletoBancario',
  'DepositoBancario',
  'Pix',
  'TransferenciaBancaria',
  'ProgaramaFidelidade',
  'PixEstatico',
  'CreditoEmLoja',
  'PagamentoNaoInformado',
  'SemPagamento',
  'PagamentoPosterior',
  'Outros',
] as const satisfies readonly MeioPagtoNFe[];

/**
 * Forma de pagamento do catálogo da condição
 * (`SessaoUsuario.CondicoesDePagamento[].CondicaoFormasDePagamento[]`).
 *
 * Imutável dentro de uma venda: o que a aplicação de um pagamento faz é
 * **copiar** os campos de que precisa para o `PagamentoAplicado`, nunca guardar
 * uma referência ao catálogo vivo (`data-model.md` §2, "Regra de fronteira").
 */
export interface FormaPagamento {
  readonly codigo: number;
  readonly descricao: string;
  /**
   * `FpgEnt` do ERP — ecoado no payload, nunca interpretado aqui (`FR-022`,
   * AD-111). Sem ele o ERP calcula crediário zero e a validação prévia aprova
   * exatamente o que existe para barrar.
   */
  readonly entrada: string;
  /** Fonte de verdade do roteamento (`PAY-08`). */
  readonly meioPagtoNFe: MeioPagtoNFe;
  /** `1` = TEF, `2` = POS/avulso (AD-078); ecoado, não interpretado (D6). */
  readonly integracaoCartao: '1' | '2' | '';
  /** Consumido pela feature 010; transportado como opaco. */
  readonly tipoTransacaoTEF: string;
  /** Elegibilidade de vale devolução; **vazio = elegível** (AD-048). */
  readonly fpgUtiCar: string;
}

/** Condição de pagamento do catálogo; escalar na venda (I1, `research.md` D2). */
export interface CondicaoPagamento {
  readonly codigo: number;
  readonly descricao: string;
  /** Dias; não usado pela 008, preservado para a 004. */
  readonly prazo: number;
  /** `CondicaoMinimoEntrada`, convertido de `double` na fronteira Zod. */
  readonly minimoEntrada: Centavos;
  /** Percentual da condição — **não** é o desconto manual de capa. */
  readonly desconto: number;
  /** Teto da condição — **não** limita o desconto manual (`FR-015` é sem teto). */
  readonly descontoMaximo: number;
  readonly formas: readonly FormaPagamento[];
}

export function ehDinheiro(forma: FormaPagamento): boolean {
  return forma.meioPagtoNFe === 'Dinheiro';
}

export function ehCartao(forma: FormaPagamento): boolean {
  return forma.meioPagtoNFe === 'CartaoCredito' || forma.meioPagtoNFe === 'CartaoDebito';
}

/** PIX **dinâmico** — `PixEstatico` é outra coisa e nunca integra (`FR-006`). */
export function ehPixDinamico(forma: FormaPagamento): boolean {
  return forma.meioPagtoNFe === 'Pix';
}

/**
 * Alias semântico de `ehDinheiro`, de propósito: o call site do troco pergunta
 * pela **capacidade** ("esta forma gera troco?"), não pelo meio de pagamento, o
 * que deixa `FR-012` legível no ponto de uso.
 */
export function geraTroco(forma: FormaPagamento): boolean {
  return ehDinheiro(forma);
}

/**
 * Nenhuma forma exige documento impresso — `DuplicataMercantil` inclusive
 * (`FR-018`/AD-064).
 *
 * O retorno é o **tipo literal `false`**, não `boolean`: assim o compilador
 * barra um `if (exigeDocumentoImpresso(forma))` com corpo de impressão antes de
 * ele existir. A conformidade também é afirmada por teste negativo (I10, D12) —
 * um `MUST NOT` sem teste é indistinguível de um requisito esquecido.
 */
export function exigeDocumentoImpresso(_forma: FormaPagamento): false {
  return false;
}
