import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { SnapshotPrecoProduto } from '../../../../src/client/domain/precificacao/linha';
import type { Milesimos } from '../../../../src/client/domain/precificacao/quantidade';
import { useVinculoPrecoDesconto } from '../../../../src/client/features/carrinho/useVinculoPrecoDesconto';
import { linhaDe, snapshotDe, unidades } from '../../../support/precificacao';

/**
 * Barra de entrada com preço e desconto vinculados (017, US1, quickstart Q1).
 * Produto `'E'` com preço de tabela R$ 20,00.
 */

const vinteReais = snapshotDe({ pesavelEditavel: 'E', precoBase: 2000 });

function montar(snapshot: SnapshotPrecoProduto = vinteReais, quantidade = 1) {
  const resultado = renderHook(
    (props: { snapshot: SnapshotPrecoProduto; quantidade: Milesimos | null }) =>
      useVinculoPrecoDesconto(props),
    { initialProps: { snapshot, quantidade: unidades(quantidade) } },
  );
  act(() => {
    resultado.result.current.iniciar(snapshot);
  });
  return resultado;
}

describe('useVinculoPrecoDesconto — vínculo (Q1)', () => {
  it('começa no preço de tabela, sem desconto', () => {
    const { result } = montar();

    expect(result.current.vinculavel).toBe(true);
    expect(result.current.precoTexto).toBe('20,00');
    expect(result.current.descontoTexto).toBe('0,00');
  });

  it('digitar o preço calcula o desconto, e zerar o desconto devolve o preço', () => {
    const { result } = montar();

    act(() => result.current.mudarPreco('18'));
    expect(result.current.descontoTexto).toBe('2,00');

    act(() => result.current.mudarDesconto('0'));
    expect(result.current.precoTexto).toBe('20,00');
  });

  it('digitar o desconto calcula o preço', () => {
    const { result } = montar();

    act(() => result.current.mudarDesconto('5'));

    expect(result.current.precoTexto).toBe('15,00');
  });

  it('o desconto é sobre o total da linha', () => {
    const { result } = montar(vinteReais, 3);

    act(() => result.current.mudarPreco('18'));

    expect(result.current.descontoTexto).toBe('6,00');
  });

  it('mudar a quantidade mantém o preço e recalcula o desconto (FR-004)', () => {
    const { result, rerender } = montar(vinteReais, 3);
    act(() => result.current.mudarPreco('18'));

    act(() => result.current.mudarQuantidade(unidades(5)));
    rerender({ snapshot: vinteReais, quantidade: unidades(5) });

    expect(result.current.precoTexto).toBe('18');
    expect(result.current.descontoTexto).toBe('10,00');
  });

  it('preço acima da tabela zera o desconto, e o desconto seguinte parte da tabela', () => {
    const { result } = montar();

    act(() => result.current.mudarPreco('25'));
    expect(result.current.descontoTexto).toBe('0,00');
    expect(result.current.consolidar()).toEqual({ precoUnitario: 2500, descontoManual: 0 });

    act(() => result.current.mudarDesconto('5'));
    expect(result.current.precoTexto).toBe('15,00');
  });

  it('o mestre preserva o desconto digitado na divisão não exata (D4)', () => {
    const { result } = montar(vinteReais, 3);

    act(() => result.current.mudarDesconto('1'));

    // Sair do campo de preço sem mexer não dispara nada: o desconto continua 1,00.
    expect(result.current.precoTexto).toBe('19,67');
    expect(result.current.descontoTexto).toBe('1');
    expect(result.current.consolidar()).toEqual({ precoUnitario: 2000, descontoManual: 100 });
  });

  it('consolidar pelo preço grava referência + desconto', () => {
    const { result } = montar(vinteReais, 3);

    act(() => result.current.mudarPreco('18'));

    expect(result.current.consolidar()).toEqual({ precoUnitario: 2000, descontoManual: 600 });
  });
});

describe('useVinculoPrecoDesconto — lápis', () => {
  it('carrega o preço praticado, não o de referência', () => {
    const { result } = montar();

    act(() =>
      result.current.carregar(
        linhaDe({ snapshot: vinteReais, quantidadeEmUnidades: 3, descontoManual: 100 }),
      ),
    );

    expect(result.current.precoTexto).toBe('19,67');
    expect(result.current.descontoTexto).toBe('1,00');
    // Confirmar sem mexer regrava o mesmo desconto.
    expect(result.current.consolidar()).toEqual({ precoUnitario: 2000, descontoManual: 100 });
  });

  it('linha com preço acima da tabela continua com ele', () => {
    const { result } = montar();

    act(() => result.current.carregar(linhaDe({ snapshot: vinteReais, precoUnitario: 2500 })));

    expect(result.current.precoTexto).toBe('25,00');
    expect(result.current.consolidar()).toEqual({ precoUnitario: 2500, descontoManual: 0 });
  });
});

/** 017, US2 (T029) — preço de tabela R$ 20,00 e mínimo R$ 8,00 (quickstart Q2). */
describe('useVinculoPrecoDesconto — ajustarAoMinimo', () => {
  const comMinimo = snapshotDe({ pesavelEditavel: 'E', precoBase: 2000, precoMinimo: 800 });

  it('preço abaixo do mínimo sobe ao mínimo e devolve os textos ajustados', () => {
    const { result } = montar(comMinimo);
    act(() => result.current.mudarPreco('6'));

    let ajuste: ReturnType<typeof result.current.ajustarAoMinimo> = null;
    act(() => {
      ajuste = result.current.ajustarAoMinimo();
    });

    expect(ajuste).toEqual({ precoTexto: '8,00', descontoTexto: '12,00' });
    expect(result.current.precoTexto).toBe('8,00');
    expect(result.current.descontoTexto).toBe('12,00');
    expect(result.current.consolidar()).toEqual({ precoUnitario: 2000, descontoManual: 1200 });
  });

  it('o limite é sobre o total da linha', () => {
    const { result } = montar(comMinimo, 3);
    act(() => result.current.mudarDesconto('40'));

    act(() => {
      result.current.ajustarAoMinimo();
    });

    expect(result.current.descontoTexto).toBe('36,00');
  });

  it('dentro do limite, ou sem mínimo, não há o que ajustar', () => {
    const { result } = montar(comMinimo);
    act(() => result.current.mudarDesconto('12'));
    expect(result.current.ajustarAoMinimo()).toBeNull();

    const semMinimo = montar(vinteReais);
    act(() => semMinimo.result.current.mudarDesconto('19'));
    expect(semMinimo.result.current.ajustarAoMinimo()).toBeNull();
  });
});

describe('useVinculoPrecoDesconto — fora do vínculo (FR-005/FR-006)', () => {
  it('preço de tabela zero mantém os campos independentes', () => {
    const semPreco = snapshotDe({ pesavelEditavel: 'E', precoBase: 0 });
    const { result } = montar(semPreco);

    act(() => result.current.mudarPreco('18'));
    act(() => result.current.mudarDesconto('5'));

    expect(result.current.vinculavel).toBe(false);
    expect(result.current.precoTexto).toBe('18');
    expect(result.current.descontoTexto).toBe('5');
    expect(result.current.consolidar()).toBeNull();
  });

  it('texto inválido no preço não mexe no desconto', () => {
    const { result } = montar();
    act(() => result.current.mudarPreco('18'));

    act(() => result.current.mudarPreco('18,x'));

    expect(result.current.descontoTexto).toBe('2,00');
  });
});
