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
