import '@testing-library/jest-dom/vitest';
import { beforeEach } from 'vitest';
import { useJanelasStore } from '../src/client/stores/janelasStore';

/**
 * `janelasStore` é global e **inerte com janela aberta** (I3 da feature 016):
 * um teste que termina com um modal aberto deixaria o `abrir()` do teste
 * seguinte sem efeito, e a falha apareceria longe de quem a causou.
 *
 * `beforeEach`, e não `afterEach`: antes do teste nada está montado, então
 * zerar aqui não dispara render fora de `act`.
 */
beforeEach(() => {
  useJanelasStore.getState().fechar();
});
