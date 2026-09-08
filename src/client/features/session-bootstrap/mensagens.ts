/**
 * Mensagem única de falha do carregamento inicial.
 *
 * Título e detalhe eram duas frases que diziam a mesma coisa ("Não foi possível
 * carregar o ponto de venda" + "Não foi possível carregar a configuração do
 * ponto de venda"); para o operador de caixa isso é ruído — ele só precisa
 * saber que o Checkout não abriu com os dados recebidos (pedido do usuário,
 * 2026-09-08).
 */
export const MENSAGEM_FALHA_CHECKOUT =
  'Não foi possível carregar o checkout com os dados fornecidos';

/**
 * Instrução para o caso terminal: nenhuma tentativa daqui resolve, porque os
 * dados de acesso é que estão ausentes/inválidos — só um novo redirect vale.
 */
export const INSTRUCAO_REABRIR_PELO_CENTRIUMWEB = 'Acesse o Checkout novamente pelo CentriumWEB.';
