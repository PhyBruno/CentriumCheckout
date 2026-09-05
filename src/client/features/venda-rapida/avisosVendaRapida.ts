/**
 * Frases que o atalho de venda rápida diz ao operador quando recusa (feature
 * 013).
 *
 * Módulo próprio pelo mesmo motivo de `avisosPagamentoDoDocumento.ts` e
 * `pix/avisosPix.ts`: o texto é reusado por teste e por composição, e uma
 * string literal repetida em dois lugares diverge no dia em que só um deles for
 * revisado.
 *
 * Todas seguem a regra desta base: **nomear a causa e a saída**. O operador de
 * caixa está com o cliente na frente; uma frase que só diz "não foi possível" o
 * deixa tentando de novo o gesto que nunca vai funcionar.
 */

/**
 * O atalho só lança em venda **sem pagamento iniciado** (decisão do usuário,
 * 2026-09-05).
 *
 * A frase nomeia a regra que o operador não pode adivinhar — uma condição por
 * venda — e aponta o botão que desfaz, porque insistir na tecla é exatamente o
 * que ele tentaria sozinho. É irmã de `AVISO_CONDICAO_COM_PAGAMENTO` (008), que
 * diz o equivalente para a troca manual de condição.
 */
export const AVISO_PAGAMENTO_JA_INICIADO =
  'Esta venda já tem pagamento iniciado: o atalho lança a condição e a forma dele, e cada venda aceita uma condição só. Use "Limpar" no cartão de pagamento para recomeçar.';

/** `FR-009`: sem item lançado não há o que cobrar. */
export const AVISO_ATALHO_SEM_ITENS =
  'Não há itens nesta venda: bipe ao menos um produto antes de usar o atalho de pagamento.';

/**
 * `FR-009`, saldo já zerado.
 *
 * Distinta de `AVISO_PAGAMENTO_JA_INICIADO` de propósito: aqui a venda pode nem
 * ter condição escolhida — é o caso do desconto de capa que zerou o total, ou
 * do documento retomado já quitado. Dizer "já tem pagamento iniciado" mandaria
 * o operador procurar uma forma que talvez não exista.
 */
export const AVISO_ATALHO_SEM_SALDO =
  'Esta venda não tem saldo em aberto: não há valor para o atalho lançar.';
