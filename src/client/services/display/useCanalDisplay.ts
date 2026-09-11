import { useCallback, useEffect, useRef } from 'react';
import type { EstadoDisplay } from '../../../shared/display';
import { nomeDaLoja } from '../../domain/sessao/identidadePdv';
import { useSessionStore } from '../../stores/sessionStore';
import { criarCanalDisplay, type CanalDisplay, type DepsCanalDisplay } from './canalDisplay';

/**
 * Ponte React do publicador (feature 015, `contracts/canal-display.md` §6).
 *
 * É o **único** lugar que conhece ao mesmo tempo React, o store e o canal — as
 * três coisas que nem o `ModalPix` nem o publicador devem conhecer. Devolve uma
 * função estável, pronta para virar a prop `onEstadoDisplay` do modal.
 *
 * O `nomeLoja` é lido de `useSessionStore.getState()` no instante de publicar,
 * e não por selector: quem publica não precisa **re-renderizar** quando a sessão
 * muda, e assinar o store aqui obrigaria a lista de pagamentos inteira a
 * renderizar de novo por um rótulo que só viaja no payload.
 */
export function useCanalDisplay(deps?: DepsCanalDisplay): (estado: EstadoDisplay) => void {
  const canalRef = useRef<CanalDisplay | null>(null);
  const depsRef = useRef(deps);
  depsRef.current = deps;

  /**
   * Criação preguiçosa, e não no `useEffect`: os efeitos do **filho** rodam
   * antes dos do pai, então o `ModalPix` publica o primeiro estado antes de um
   * efeito daqui chegar a executar — e o estado inicial se perderia. Sob
   * `StrictMode`, o cleanup do primeiro ciclo zera a referência e a próxima
   * publicação simplesmente abre outro canal.
   */
  const publicar = useCallback((estado: EstadoDisplay): void => {
    canalRef.current ??= criarCanalDisplay(depsRef.current);
    canalRef.current.publicar(
      estado,
      nomeDaLoja(useSessionStore.getState().registro?.SessaoUsuario ?? {}),
    );
  }, []);

  useEffect(() => {
    return () => {
      canalRef.current?.encerrar();
      canalRef.current = null;
    };
  }, []);

  return publicar;
}
