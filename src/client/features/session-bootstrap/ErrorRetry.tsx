import type { ReactElement } from 'react';
import { Button } from '@/components/ui/button';
import { PainelMensagem } from './PainelMensagem';

export interface ErrorRetryProps {
  readonly mensagem: string;
  readonly onTentarNovamente: () => void;
  readonly tentando?: boolean;
}

/**
 * Falha não relacionada a autenticação no carregamento inicial (T026,
 * AUTH-07 / FR-007).
 *
 * Oferece "Tentar novamente" e **nunca** leva a uma tela de login: reautenticar
 * não resolve um `500` ou um timeout do ERP (AD-049).
 */
export function ErrorRetry({
  mensagem,
  onTentarNovamente,
  tentando = false,
}: ErrorRetryProps): ReactElement {
  return (
    <PainelMensagem
      titulo="Não foi possível carregar o ponto de venda"
      texto={mensagem}
      acoes={
        <Button type="button" size="lg" onClick={onTentarNovamente} disabled={tentando}>
          {tentando ? 'Tentando…' : 'Tentar novamente'}
        </Button>
      }
    />
  );
}
