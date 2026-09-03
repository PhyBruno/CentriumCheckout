import { useEffect, useRef, useState } from 'react';

/**
 * Mantém um elemento montado durante a animação de saída.
 *
 * O padrão dos modais desta base é `if (!aberto) return null` — ao fechar, o
 * nó some do DOM no mesmo quadro e não há o que animar. Este hook adia a
 * desmontagem pelo tempo da animação, expondo em `saindo` qual das duas
 * animações o componente deve aplicar (pedido do usuário, 2026-09-03).
 *
 * Não usa `<dialog>`/`popover` nem biblioteca de transição: os modais já estão
 * escritos como overlay próprio, e trocar o mecanismo de montagem para ganhar
 * uma animação de saída mudaria o comportamento de foco e de ESC que os testes
 * E2E já travam.
 */
export interface Presenca {
  /** O elemento deve estar no DOM — `true` durante toda a saída. */
  readonly montado: boolean;
  /** A saída está em curso: aplique a animação de saída, não a de entrada. */
  readonly saindo: boolean;
}

export function usePresenca(aberto: boolean, duracaoSaidaMs: number): Presenca {
  const [montado, setMontado] = useState(aberto);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (aberto) {
      // Reabrir durante a saída cancela a desmontagem pendente: sem isto, o
      // temporizador antigo dispararia e apagaria o modal que acabou de abrir.
      if (temporizador.current !== null) {
        clearTimeout(temporizador.current);
        temporizador.current = null;
      }
      setMontado(true);
      return;
    }

    if (!montado) {
      return;
    }

    temporizador.current = setTimeout(() => {
      temporizador.current = null;
      setMontado(false);
    }, duracaoSaidaMs);

    return () => {
      if (temporizador.current !== null) {
        clearTimeout(temporizador.current);
        temporizador.current = null;
      }
    };
  }, [aberto, montado, duracaoSaidaMs]);

  return { montado, saindo: montado && !aberto };
}

/**
 * Espelha `--cc-motion-rapido` (`global.css`), a duração da saída do cartão.
 *
 * Vive em TS porque `setTimeout` não lê custom property; um valor a mais que o
 * CSS evita desmontar antes do último quadro da animação — o corte apareceria
 * como um piscar.
 */
export const DURACAO_SAIDA_MODAL_MS = 160;
