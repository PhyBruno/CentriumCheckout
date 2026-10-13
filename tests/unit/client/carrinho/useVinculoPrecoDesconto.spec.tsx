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
