import type { ReactElement } from 'react';
import { Button } from '@/components/ui/button';
import { PainelMensagem } from './PainelMensagem';
import { MENSAGEM_FALHA_CHECKOUT } from './mensagens';

export interface ErrorRetryProps {
  readonly onTentarNovamente: () => void;
  readonly tentando?: boolean;
}

/**
 * Falha não relacionada a autenticação no carregamento inicial (T026,
 * AUTH-07 / FR-007).
 *
 * Oferece "Tentar novamente" e **nunca** leva a uma tela de login: reautenticar
 * não resolve um `500` ou um timeout do ERP (AD-049).
 *
 * A causa técnica não é exibida: uma única mensagem, a mesma da tela terminal
 * (`AcessoInvalido`), porque o operador de caixa não age diferente por saber se
 * o ERP devolveu `500` ou se a rede caiu — o que muda entre as duas telas é só
 * haver, ou não, algo que valha a pena repetir.
 */
export function ErrorRetry({ onTentarNovamente, tentando = false }: ErrorRetryProps): ReactElement {
  return (
    <PainelMensagem
      titulo={MENSAGEM_FALHA_CHECKOUT}
      acoes={
        <Button type="button" size="lg" onClick={onTentarNovamente} disabled={tentando}>
          {tentando ? 'Tentando…' : 'Tentar novamente'}
        </Button>
      }
    />
  );
}
