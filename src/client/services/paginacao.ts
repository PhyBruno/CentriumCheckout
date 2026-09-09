/**
 * Quantos registros cada janela de consulta pede ao ERP por página.
 *
 * **Dez, e não vinte** (pedido do usuário, 2026-09-09): a página inteira tem de
 * caber na altura da janela, sem o operador rolar para ver o resto. Com 20 o
 * operador via metade da página e precisava rolar para descobrir que o restante
 * existia — no caixa, onde a mão sai do teclado para o mouse, isso custa tempo
 * em toda consulta.
 *
 * O número é **a mesma verdade em dois lugares**: ele é o `Tamanhopagina`
 * enviado ao ERP e o número de linhas que o esqueleto de carregamento desenha,
 * para a lista não saltar de altura quando o resultado chega. Por isso mora
 * aqui, e não replicado em cada `*Queries.ts` — que era o estado anterior, com
 * a constante `20` escrita cinco vezes.
 *
 * Casa com a altura de linha de 40px das tabelas de consulta: no frame do
 * Pencil (`Modal Menu DAV`, nó `Hao17`) a janela tem 720px e sobram 416px para
 * as linhas depois de cabeçalho, filtros, cabeçalho de tabela e rodapé —
 * 10 × 40 = 400 cabe com folga, 10 × 52 (a linha do desenho) não caberia.
 */
export const ITENS_POR_PAGINA = 10;
