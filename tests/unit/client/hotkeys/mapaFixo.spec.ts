import { describe, expect, it } from 'vitest';
import { MAPA_FIXO, type TeclaFixa } from '../../../../src/client/hotkeys/mapaFixo';
import { TECLAS_ATALHO } from '../../../../src/client/domain/vendaRapida/tipos';

/**
 * T002 — invariante I1 da feature 016 e as garantias de `contracts` §1.
 *
 * Os dois mapas coexistem na mesma tela e ambos consultam `defaultPrevented`:
 * enquanto os conjuntos forem disjuntos não há interação possível, e no dia em
 * que deixarem de ser a falha seria intermitente e dependente da ordem de
 * montagem. Este teste transforma essa armadilha em erro de suíte (`research.md`
 * D13).
 */

/** Toda `TeclaFixa`, escrita à parte do mapa para o teste não se validar sozinho. */
const TODAS_AS_TECLAS_FIXAS: readonly TeclaFixa[] = ['F1', 'F2', 'F3', 'F4', 'F10'];

describe('MAPA_FIXO', () => {
  it('não compartilha nenhuma tecla com o mapa da venda rápida (I1)', () => {
    const daVendaRapida = new Set<string>(TECLAS_ATALHO);
    const emComum = MAPA_FIXO.filter((entrada) => daVendaRapida.has(entrada.tecla));

    expect(emComum).toEqual([]);
  });

  it('tem exatamente uma entrada por tecla fixa', () => {
    const teclas = MAPA_FIXO.map((entrada) => entrada.tecla);

    expect([...teclas].sort()).toEqual([...TODAS_AS_TECLAS_FIXAS].sort());
    expect(new Set(teclas).size).toBe(teclas.length);
  });

  it('cada comando aparece uma vez só — duas teclas para a mesma ação dividiriam o hábito do operador', () => {
    const comandos = MAPA_FIXO.map((entrada) => entrada.comando);

    expect(new Set(comandos).size).toBe(comandos.length);
  });

  it.each(['F5', 'F11', 'F12'])('não reivindica %s, que fica com o navegador (FR-008)', (tecla) => {
    expect(MAPA_FIXO.some((entrada) => entrada.tecla === tecla)).toBe(false);
  });

  it('toda entrada tem rótulo para a tela de ajuda (FR-009)', () => {
    for (const entrada of MAPA_FIXO) {
      expect(entrada.rotulo.trim()).not.toBe('');
    }
  });
});
