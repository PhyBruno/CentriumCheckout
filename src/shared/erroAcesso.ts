/**
 * Contrato mínimo entre o BFF e a SPA para a falha de entrada.
 *
 * Quando o redirect do CentriumWEB não pode virar sessão (`validationKey`
 * errada, parâmetro faltando, ERP recusando a autenticação), o BFF não devolve
 * mais um JSON cru na tela do operador: redireciona para a SPA com este
 * parâmetro, e a SPA mostra o painel terminal (`AcessoInvalido`).
 *
 * O valor é deliberadamente opaco — não diz **qual** dos motivos ocorreu, para
 * não transformar a tela num oráculo de diagnóstico para quem tentar adivinhar
 * a `validationKey`.
 */
export const PARAM_ERRO_ACESSO = 'erro';
export const VALOR_ERRO_ACESSO = 'sessao';

/**
 * Cookie legível que marca "houve entrada válida pelo CentriumWEB".
 *
 * O nome e o valor moram aqui, lado a lado com o parâmetro de erro, pelo mesmo
 * motivo: quem escreve (BFF) e quem lê (SPA) precisam concordar, e uma segunda
 * definição divergiria em silêncio.
 *
 * A SPA usa isto para decidir **qual** falha oferece "Tentar novamente":
 * repetir só funciona quando os dados chegaram a virar sessão e algo falhou
 * depois. Não é credencial e não autentica nada — ver `ENTRADA_COOKIE_OPTIONS`
 * em `src/server/session/cookie.ts`.
 */
export const COOKIE_ENTRADA = 'cc_entrada';
export const VALOR_COOKIE_ENTRADA = '1';
