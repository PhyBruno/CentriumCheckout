import { beforeEach, describe, expect, it } from 'vitest';
import { useJanelasStore } from '../../../../src/client/stores/janelasStore';

/**
 * T004 — invariante I3 da feature 016: nunca há duas janelas, e com uma aberta
 * nenhum pedido de abertura a troca.
 *
 * É o que faz `FR-006` ("a tecla não abre um segundo modal") ser consequência
 * do tipo, e não de uma checagem espalhada pelos call sites.
 */

beforeEach(() => {
  useJanelasStore.getState().fechar();
});

describe('janelasStore', () => {
  it('nasce sem janela aberta', () => {
    expect(useJanelasStore.getState().janela).toBe('nenhuma');
  });

  it('abre a janela pedida quando não há outra', () => {
    useJanelasStore.getState().abrir('cliente');

    expect(useJanelasStore.getState().janela).toBe('cliente');
  });

  it('é inerte com outra janela já aberta (I3)', () => {
    useJanelasStore.getState().abrir('cliente');
    useJanelasStore.getState().abrir('produto');
    useJanelasStore.getState().abrir('dav');

    expect(useJanelasStore.getState().janela).toBe('cliente');
  });

  it('é idempotente com a mesma janela', () => {
    useJanelasStore.getState().abrir('produto');
    const antes = useJanelasStore.getState();
    useJanelasStore.getState().abrir('produto');

    expect(useJanelasStore.getState()).toBe(antes);
  });

  it('substituir troca o seletor pela escolha sem passar por "nenhuma"', () => {
    const vistas: string[] = [];
    const cancelar = useJanelasStore.subscribe((estado) => {
      vistas.push(estado.janela);
    });

    useJanelasStore.getState().abrir('seletor-importacao');
    useJanelasStore.getState().substituir('nfce');
    cancelar();

    // Dois backdrops ou um quadro sem janela entre os dois passos do mesmo gesto
    // são justamente o que a substituição evita.
    expect(vistas).toEqual(['seletor-importacao', 'nfce']);
  });

  it('fechar volta a "nenhuma" e libera a próxima abertura', () => {
    useJanelasStore.getState().abrir('dav');
    useJanelasStore.getState().fechar();
    useJanelasStore.getState().abrir('cliente');

    expect(useJanelasStore.getState().janela).toBe('cliente');
  });
});
