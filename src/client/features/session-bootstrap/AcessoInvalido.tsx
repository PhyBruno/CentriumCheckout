import type { ReactElement } from 'react';
import { PainelMensagem } from './PainelMensagem';
import { INSTRUCAO_REABRIR_PELO_CENTRIUMWEB, MENSAGEM_FALHA_CHECKOUT } from './mensagens';

/**
 * Falha terminal do acesso: o Checkout foi aberto sem dados de sessão válidos
 * (URL digitada à mão, `validationKey` errada, redirect incompleto, sessão já
 * encerrada com carrinho vazio).
 *
 * Mesma tela do `ErrorRetry`, **sem** "Tentar novamente": repetir a chamada com
 * os mesmos dados de acesso daria exatamente o mesmo resultado. O único caminho
 * é um novo redirect a partir do CentriumWEB (pedido do usuário, 2026-09-08).
 */
export function AcessoInvalido(): ReactElement {
  return (
    <PainelMensagem titulo={MENSAGEM_FALHA_CHECKOUT} texto={INSTRUCAO_REABRIR_PELO_CENTRIUMWEB} />
  );
}
