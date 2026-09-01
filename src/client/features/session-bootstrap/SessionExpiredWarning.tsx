import type { ReactElement } from 'react';
import { PainelMensagem } from './PainelMensagem';

export interface SessionExpiredWarningProps {
  /** Quantidade de itens na venda em digitação, para dimensionar o aviso. */
  readonly itensNaVenda: number;
  readonly onEncerrar: () => void;
}

/**
 * Aviso antes de encerrar uma sessão que tem venda em digitação
 * (T034, AUTH-06 / FR-006).
 *
 * Reaproveita o padrão do diálogo nativo de `beforeunload` já usado para
 * proteger contra F5/fechamento acidental (AD-044/AD-006): a mesma promessa ao
 * operador — nada é descartado sem que ele veja o aviso primeiro.
 *
 * Só aparece quando a renovação automática falhou **e** há itens no carrinho;
 * com carrinho vazio a sessão é encerrada direto, sem este aviso.
 */
export function SessionExpiredWarning({
  itensNaVenda,
  onEncerrar,
}: SessionExpiredWarningProps): ReactElement {
  const plural = itensNaVenda === 1 ? '1 item' : `${itensNaVenda} itens`;

  return (
    <PainelMensagem
      variante="alerta"
      titulo="A sessão será encerrada"
      texto={
        `Não foi possível renovar a sessão do operador. A venda em digitação, com ${plural}, ` +
        'pode ser perdida. Reabra o Checkout a partir do ERP para começar de novo.'
      }
      acoes={
        <button type="button" className="cc-botao cc-botao--primario" onClick={onEncerrar}>
          Entendi, encerrar sessão
        </button>
      }
    />
  );
}
