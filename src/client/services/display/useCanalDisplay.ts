import { useCallback, useEffect, useRef } from 'react';
import type { EstadoDisplay } from '../../../shared/display';
import { nomeDaLoja } from '../../domain/sessao/identidadePdv';
import { useSessionStore } from '../../stores/sessionStore';
import { criarCanalDisplay, type CanalDisplay, type DepsCanalDisplay } from './canalDisplay';
import {
  criarAnuncianteIdentidadeDisplay,
  type AnuncianteIdentidadeDisplay,
} from './identidadeDisplay';

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

/**
 * Mantém a identidade da loja anunciada à tela do cliente durante toda a vida
 * da aba de checkout (correção do usuário, 2026-09-15).
 *
 * Chamado **uma vez**, em `App`, e não junto do PIX: o nome precisa estar na
 * tela do cliente antes de existir qualquer cobrança. Aqui o `sessionStore` é
 * assinado por selector, ao contrário de `useCanalDisplay`: a mudança do nome —
 * a sessão terminando de carregar — é justamente o evento que precisa ir ao
 * canal. O selector devolve texto, então nada re-renderiza à toa.
 */
export function useIdentidadeNoDisplay(deps?: DepsCanalDisplay): void {
  const nomeLoja = useSessionStore((estado) => nomeDaLoja(estado.registro?.SessaoUsuario ?? {}));
  const anuncianteRef = useRef<AnuncianteIdentidadeDisplay | null>(null);
  const depsRef = useRef(deps);
  depsRef.current = deps;

  // Declarado antes do efeito de anúncio: efeitos rodam na ordem, e o canal
  // precisa existir quando o primeiro nome for anunciado.
  useEffect(() => {
    const anunciante = criarAnuncianteIdentidadeDisplay(depsRef.current);
    anuncianteRef.current = anunciante;
    return () => {
      anunciante.encerrar();
      anuncianteRef.current = null;
    };
  }, []);

  useEffect(() => {
    anuncianteRef.current?.anunciar(nomeLoja);
  }, [nomeLoja]);
}
