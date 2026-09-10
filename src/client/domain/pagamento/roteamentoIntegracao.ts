/**
 * Roteamento de uma forma de pagamento para a integração que ela deve
 * acionar (T003).
 *
 * Função pura e total sobre `FormaPagamento` + `CapacidadesPagamento`:
 * devolve um veredito, nunca executa integração (`research.md` D5). O que
 * fazer com o veredito `TEF`/`PIX_DINAMICO` é responsabilidade das features
 * 010 e 009, respectivamente — este módulo não as conhece.
 *
 * AD-180 (2026-09-08): cartão roteia para TEF por **duas** condições, não uma —
 * `tefAtivo` da empresa **e** `integracaoCartao === '1'` no cadastro da forma.
 * Uma empresa com TEF ligado pode cadastrar formas de cartão que passam em
 * maquininha avulsa (POS), e o Checkout não pode mandá-las ao terminal.
 *
 * AD-144 (2026-09-03): `plataforma` **não** é insumo desta decisão. A
 * exclusão de TEF no mobile (AD-074) foi revogada pelo usuário — cartão com
 * `tefAtivo` roteia para TEF em qualquer layout. Por isso `CapacidadesPagamento`
 * só tem `tefAtivo`/`pixAtivo`, e nenhuma função aqui aceita um parâmetro de
 * plataforma. Se uma regra futura vier a depender do layout, o campo volta
 * aqui — até lá, reintroduzi-lo seria implementar um requisito que nenhum
 * `FR-xxx` pede.
 */

import { MEIO_PAGTO, type FormaPagamento } from './formaPagamento';

export type IntegracaoPagamento = 'NENHUMA' | 'TEF' | 'PIX_DINAMICO';

/** `ConfiguracoesTEF.TEFAtivo` e `ConfiguracoesPIX.UtilizaCentriumPAG` do bootstrap, injetadas — nunca lidas daqui de dentro (Constitution II). */
export interface CapacidadesPagamento {
  readonly tefAtivo: boolean;
  readonly pixAtivo: boolean;
}

/**
 * Tabela de decisão completa (`research.md` D5, AD-144, AD-180):
 *
 * | `meioPagtoNFe`                    | Condição                              | Resultado        |
 * |------------------------------------|---------------------------------------|------------------|
 * | `CartaoCredito`, `CartaoDebito`     | `tefAtivo` **e** `integracaoCartao === '1'` | `TEF`      |
 * | `CartaoCredito`, `CartaoDebito`     | caso contrário                        | `NENHUMA`        |
 * | `Pix`                                | `pixAtivo`                            | `PIX_DINAMICO`   |
 * | `Pix`                                | `!pixAtivo`                           | `NENHUMA`        |
 * | `PixEstatico`                        | sempre                                | `NENHUMA` (`FR-006`) |
 * | qualquer outro                       | sempre                                | `NENHUMA`        |
 *
 * As duas condições do cartão respondem a perguntas diferentes, e é por isso
 * que nenhuma delas basta sozinha (AD-180): `tefAtivo` diz que **a empresa**
 * tem TEF; `integracaoCartao` diz que **esta forma** foi cadastrada para
 * passar nele (`'1'`) em vez de em maquininha avulsa/POS (`'2'` ou vazio).
 * Cartão que cai em `NENHUMA` não fica indisponível — vira pagamento avulso,
 * cobrado fora do Checkout e confirmado pelo operador (ver `formaDisponivel`).
 */
export function resolverIntegracao(
  forma: FormaPagamento,
  capacidades: CapacidadesPagamento,
): IntegracaoPagamento {
  switch (forma.meioPagtoNFe) {
    case MEIO_PAGTO.CartaoCredito:
    case MEIO_PAGTO.CartaoDebito:
      return capacidades.tefAtivo && forma.integracaoCartao === '1' ? 'TEF' : 'NENHUMA';
    case MEIO_PAGTO.Pix:
      return capacidades.pixAtivo ? 'PIX_DINAMICO' : 'NENHUMA';
    default:
      return 'NENHUMA';
  }
}

/**
 * `FR-002`/`FR-003`: uma forma cuja integração está desligada é ocultada ou
 * desabilitada — mas só quando **não existe caminho manual**.
 *
 * Cartão sem TEF continua disponível (vira pagamento manual, sem integração) —
 * tanto o caso da empresa sem `tefAtivo` quanto o da forma cadastrada como POS
 * (`integracaoCartao` diferente de `'1'`, AD-180), que é exatamente o pagamento
 * avulso que o lojista escolheu fazer fora do terminal;
 * `Pix` sem `pixAtivo` fica indisponível, porque não há forma de o operador
 * confirmar um PIX dinâmico sem a integração. `PixEstatico` e as demais
 * formas nunca dependem de capacidade, logo estão sempre disponíveis.
 */
export function formaDisponivel(forma: FormaPagamento, capacidades: CapacidadesPagamento): boolean {
  if (forma.meioPagtoNFe === MEIO_PAGTO.Pix) {
    return capacidades.pixAtivo;
  }
  return true;
}
