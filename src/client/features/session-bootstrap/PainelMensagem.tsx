import type { ReactElement, ReactNode } from 'react';
import './PainelMensagem.css';

export interface PainelMensagemProps {
  readonly titulo: string;
  readonly texto: string;
  readonly variante?: 'informacao' | 'alerta';
  readonly acoes?: ReactNode;
}

/**
 * Painel central de mensagem em tela cheia — componente puramente
 * apresentacional, sem nenhuma regra de sessão. Quem decide o que mostrar são
 * `ErrorRetry` (AUTH-07) e `SessionExpiredWarning` (AUTH-06).
 */
export function PainelMensagem({
  titulo,
  texto,
  variante = 'informacao',
  acoes,
}: PainelMensagemProps): ReactElement {
  return (
    <div className="cc-painel-fundo">
      <section className="cc-painel" role="alert">
        <div
          className={
            variante === 'alerta' ? 'cc-painel__marca cc-painel__marca--alerta' : 'cc-painel__marca'
          }
        />
        <h1 className="cc-painel__titulo">{titulo}</h1>
        <p className="cc-painel__texto">{texto}</p>
        {acoes !== undefined && <div className="cc-painel__acoes">{acoes}</div>}
      </section>
    </div>
  );
}
