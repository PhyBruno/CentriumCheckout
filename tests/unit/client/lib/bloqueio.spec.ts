import { describe, expect, it, vi } from 'vitest';
import { acaoBloqueavel, atributosDeBloqueio } from '../../../../src/client/lib/bloqueio';

/**
 * `aria-disabled`, ao contrário de `disabled`, não tira o botão da ordem de
 * TAB sozinho — por isso `atributosDeBloqueio` também devolve `tabIndex: -1`
 * quando bloqueado (pedido do usuário, 2026-09-08): sem isso, o teclado
 * passaria pelo "Menu Importação"/"Limpar"/qualquer campo bloqueado como se
 * estivessem ativos.
 */
describe('atributosDeBloqueio', () => {
  it('sem bloqueio, não produz nenhum atributo', () => {
    expect(atributosDeBloqueio(null)).toEqual({});
  });

  it('bloqueado, marca aria-disabled, tira da ordem de TAB e explica o motivo no title', () => {
    expect(atributosDeBloqueio('motivo do bloqueio')).toEqual({
      'aria-disabled': true,
      tabIndex: -1,
      title: 'motivo do bloqueio',
    });
  });
});

describe('acaoBloqueavel', () => {
  it('bloqueado, não executa a ação', () => {
    const acao = vi.fn();
    acaoBloqueavel('motivo', acao)();
    expect(acao).not.toHaveBeenCalled();
  });

  it('sem bloqueio, executa a ação', () => {
    const acao = vi.fn();
    acaoBloqueavel(null, acao)();
    expect(acao).toHaveBeenCalledOnce();
  });
});
