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
 * Meios de pagamento do domínio `NFCe_FormaPagto` da KB do ERP, **pelo valor
 * armazenado** — os códigos de dois dígitos da tag `tPag` da NFe (AD-204).
 *
 * O nome é a chave, o código é o valor. O ERP nunca publica o nome: tanto o
 * catálogo de entrada (`SessaoUsuario.CondicoesDePagamento[]
 * .CondicaoFormasDePagamento[].FormaMeioPagtoNFe`, atribuído em
 * `PCheckout_GetSessao` direto de `FpgNfFormaPagamento`) quanto o retrato de
 * saída (`FormasDePagamento[].FormaMeioPagtoNFe`, `formaParaRetrato.ts`) usam
 * o código. Nomear a chave preserva a legibilidade no ponto de uso
 * (`MEIO_PAGTO.Dinheiro` em vez de `'01'`) sem inventar um segundo dialeto.
 *
 * Os 21 pares vêm dos `ControlValues` do domínio (`Character(2)`, lido na KB em
 * 2026-09-10), não da tabela SEFAZ padrão — o domínio é um superset dela, e
 * `91` (`PagamentoPosterior`) não existe na tabela oficial.
 *
 * Ao contrário da redação anterior deste bloco, **não** há typo a reproduzir: o
 * `Progarama` da KB está na *descrição* do enum, não no valor, e o valor é `19`.
 */
export const MEIO_PAGTO = {
  Dinheiro: '01',
  Cheque: '02',
  CartaoCredito: '03',
  CartaoDebito: '04',
  CreditoLoja: '05',
  ValeAlimentacao: '10',
  ValeRefeicao: '11',
  ValePresente: '12',
  ValeCombustivel: '13',
  DuplicataMercantil: '14',
  BoletoBancario: '15',
  DepositoBancario: '16',
  Pix: '17',
  TransferenciaBancaria: '18',
  ProgramaFidelidade: '19',
  PixEstatico: '20',
  CreditoEmLoja: '21',
  PagamentoNaoInformado: '22',
  SemPagamento: '90',
  PagamentoPosterior: '91',
  Outros: '99',
} as const;

/** Nome legível de cada meio, para rótulo e diagnóstico — nunca para comparação. */
export type NomeMeioPagtoNFe = keyof typeof MEIO_PAGTO;

export type MeioPagtoNFe = (typeof MEIO_PAGTO)[NomeMeioPagtoNFe];

/** Todo valor de `MeioPagtoNFe`, para o guard da fronteira Zod. */
export const MEIOS_PAGTO_NFE: readonly MeioPagtoNFe[] = Object.values(MEIO_PAGTO);

const NOME_POR_CODIGO = new Map<string, NomeMeioPagtoNFe>(
  (Object.entries(MEIO_PAGTO) as readonly [NomeMeioPagtoNFe, MeioPagtoNFe][]).map(
    ([nome, codigo]) => [codigo, nome],
  ),
);

/**
 * Código → nome do meio, para **texto lido por gente**: rótulo de tela e
 * detalhe de evento de auditoria.
 *
 * Existe porque a troca do dialeto (AD-204) tornaria ilegível todo lugar que
 * caía no `meioPagtoNFe` como último recurso de rótulo — o log de auditoria
 * passaria a registrar `"tipo": "99"` onde antes dizia `"tipo": "Outros"`, e
 * quem lê a trilha de uma venda recusada não tem a tabela `tPag` na cabeça.
 *
 * **Nunca** para comparação nem para o que sai no payload do ERP: ali vale o
 * código, sempre.
 */
export function nomeDoMeioPagto(meio: MeioPagtoNFe): NomeMeioPagtoNFe {
  // O `??` não é alcançável por `MeioPagtoNFe` bem tipado — cobre só o valor
  // que atravessou uma fronteira sem passar pelo guard.
  return NOME_POR_CODIGO.get(meio) ?? 'Outros';
}

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
  /**
   * `FpgNfTefPos` do ERP: `'1'` = TEF, `'2'` **ou vazio** = POS/avulso (AD-078).
   *
   * **Interpretado desde AD-180 (2026-09-08)**, além de ecoado no payload de
   * faturamento: é a segunda condição de `resolverIntegracao` para cartão —
   * sem `'1'` aqui, cartão nunca chama TEF, mesmo com `tefAtivo` na empresa.
   * A redação anterior ("ecoado, não interpretado", `research.md` D6) descrevia
   * o comportamento até 2026-09-08 e **não vale mais**.
   */
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
  return forma.meioPagtoNFe === MEIO_PAGTO.Dinheiro;
}

export function ehCartao(forma: FormaPagamento): boolean {
  return (
    forma.meioPagtoNFe === MEIO_PAGTO.CartaoCredito ||
    forma.meioPagtoNFe === MEIO_PAGTO.CartaoDebito
  );
}

/** PIX **dinâmico** — `PixEstatico` é outra coisa e nunca integra (`FR-006`). */
export function ehPixDinamico(forma: FormaPagamento): boolean {
  return forma.meioPagtoNFe === MEIO_PAGTO.Pix;
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
