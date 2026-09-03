/**
 * Roteamento de uma forma de pagamento para a integração que ela deve
 * acionar (T003).
 *
 * Função pura e total sobre `FormaPagamento` + `CapacidadesPagamento`:
 * devolve um veredito, nunca executa integração (`research.md` D5). O que
 * fazer com o veredito `TEF`/`PIX_DINAMICO` é responsabilidade das features
 * 010 e 009, respectivamente — este módulo não as conhece.
 *
 * AD-144 (2026-09-03): `plataforma` **não** é insumo desta decisão. A
 * exclusão de TEF no mobile (AD-074) foi revogada pelo usuário — cartão com
 * `tefAtivo` roteia para TEF em qualquer layout. Por isso `CapacidadesPagamento`
 * só tem `tefAtivo`/`pixAtivo`, e nenhuma função aqui aceita um parâmetro de
 * plataforma. Se uma regra futura vier a depender do layout, o campo volta
 * aqui — até lá, reintroduzi-lo seria implementar um requisito que nenhum
 * `FR-xxx` pede.
 */

import type { FormaPagamento } from './formaPagamento';

export type IntegracaoPagamento = 'NENHUMA' | 'TEF' | 'PIX_DINAMICO';

/** `ConfiguracoesTEF.TEFAtivo` e `ConfiguracoesPIX.UtilizaCentriumPAG` do bootstrap, injetadas — nunca lidas daqui de dentro (Constitution II). */
export interface CapacidadesPagamento {
  readonly tefAtivo: boolean;
  readonly pixAtivo: boolean;
}

/**
 * Tabela de decisão completa (`research.md` D5, AD-144):
 *
 * | `meioPagtoNFe`                    | Condição      | Resultado        |
 * |------------------------------------|---------------|------------------|
 * | `CartaoCredito`, `CartaoDebito`     | `tefAtivo`    | `TEF`            |
 * | `CartaoCredito`, `CartaoDebito`     | caso contrário| `NENHUMA`        |
 * | `Pix`                                | `pixAtivo`    | `PIX_DINAMICO`   |
 * | `Pix`                                | `!pixAtivo`   | `NENHUMA`        |
 * | `PixEstatico`                        | sempre        | `NENHUMA` (`FR-006`) |
 * | qualquer outro                       | sempre        | `NENHUMA`        |
 */
export function resolverIntegracao(
  forma: FormaPagamento,
  capacidades: CapacidadesPagamento,
): IntegracaoPagamento {
  switch (forma.meioPagtoNFe) {
    case 'CartaoCredito':
    case 'CartaoDebito':
      return capacidades.tefAtivo ? 'TEF' : 'NENHUMA';
    case 'Pix':
      return capacidades.pixAtivo ? 'PIX_DINAMICO' : 'NENHUMA';
    default:
      return 'NENHUMA';
  }
}

/**
 * `FR-002`/`FR-003`: uma forma cuja integração está desligada é ocultada ou
 * desabilitada — mas só quando **não existe caminho manual**.
 *
 * Cartão sem TEF continua disponível (vira pagamento manual, sem integração);
 * `Pix` sem `pixAtivo` fica indisponível, porque não há forma de o operador
 * confirmar um PIX dinâmico sem a integração. `PixEstatico` e as demais
 * formas nunca dependem de capacidade, logo estão sempre disponíveis.
 */
export function formaDisponivel(forma: FormaPagamento, capacidades: CapacidadesPagamento): boolean {
  if (forma.meioPagtoNFe === 'Pix') {
    return capacidades.pixAtivo;
  }
  return true;
}
