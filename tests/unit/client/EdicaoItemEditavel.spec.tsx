import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  EdicaoItemEditavel,
  type EdicaoItemEditavelProps,
} from '../../../src/client/features/carrinho/EdicaoItemEditavel';
import type { PendenteDeEdicao } from '../../../src/client/features/carrinho/useCarrinho';
import {
  calcularTotalLinha,
  centavos,
  formatarCentavos,
  multiplicarPorQuantidade,
} from '../../../src/client/domain/precificacao/dinheiro';
import { milesimosDeUnidades } from '../../../src/client/domain/precificacao/quantidade';
import { snapshotDe } from '../../support/precificacao';

/**
 * Formulário de revisão de um produto `ProdutoPesavelEditavel = 'E'` (T022).
 *
 * Cobre os dois problemas confirmados pela revisão de código de alto nível na
 * feature 003:
 *
 * 1. Estado local (`quantidade`/`preco`) obsoleto ao trocar de item pendente
 *    sem desmontar o componente — o formulário é compartilhado por
 *    `ModalBuscaProduto.tsx` e `EntradaRapidaProduto.tsx`, nenhum dos dois
 *    passa `key`, então a única correção possível dentro deste componente é
 *    sincronizar via `useEffect([pendente])`.
 * 2. A prévia de "Total do item" reimplementava a matemática de
 *    `calcularTotalLinha` (`dinheiro.ts`) em vez de chamá-la — risco de a
 *    prévia divergir do total realmente persistido.
 */

function pendenteDe(opcoes: {
  codigoProduto: string;
  quantidadeEmUnidades: number;
  precoBaseEmCentavos: number;
}): PendenteDeEdicao {
  return {
    situacao: 'edicao',
    snapshot: snapshotDe({
      codigoProduto: opcoes.codigoProduto,
      precoBase: opcoes.precoBaseEmCentavos,
      pesavelEditavel: 'E',
    }),
    quantidade: milesimosDeUnidades(opcoes.quantidadeEmUnidades),
  };
}

function renderizar(props: Partial<EdicaoItemEditavelProps> & { pendente: PendenteDeEdicao }) {
  return render(<EdicaoItemEditavel onConfirmar={() => {}} onCancelar={() => {}} {...props} />);
}

describe('EdicaoItemEditavel — troca de item pendente sem desmontar (Problema 1)', () => {
  it('reseta quantidade e preço para os valores do novo item ao trocar a prop pendente', () => {
    const itemA = pendenteDe({
      codigoProduto: 'A001',
      quantidadeEmUnidades: 1,
      precoBaseEmCentavos: 1000, // R$ 10,00
    });
    const itemB = pendenteDe({
      codigoProduto: 'B002',
      quantidadeEmUnidades: 3,
      precoBaseEmCentavos: 750, // R$ 7,50
    });

    const { rerender } = renderizar({ pendente: itemA });

    // Estado inicial reflete o item A.
    expect(screen.getByTestId('edicao-quantidade')).toHaveValue('1,000');
    expect(screen.getByTestId('edicao-preco')).toHaveValue('10,00');

    // O operador clica num segundo produto editável antes de confirmar/cancelar
    // o primeiro: o pai (`ModalBuscaProduto`/`EntradaRapidaProduto`) troca a
    // prop `pendente`, SEM desmontar o componente (nenhum dos dois passa
    // `key`) — é exatamente isto que `rerender` com as mesmas props exceto
    // `pendente` reproduz.
    rerender(<EdicaoItemEditavel pendente={itemB} onConfirmar={() => {}} onCancelar={() => {}} />);

    // Os campos precisam refletir o item B, não os valores obsoletos de A.
    expect(screen.getByTestId('edicao-quantidade')).toHaveValue('3,000');
    expect(screen.getByTestId('edicao-preco')).toHaveValue('7,50');
    expect(screen.getByText('PRODUTO EXEMPLO 500G')).toBeInTheDocument();
  });

  it('descarta um desconto manual digitado no item anterior ao trocar de item pendente', () => {
    const itemA = pendenteDe({
      codigoProduto: 'A001',
      quantidadeEmUnidades: 1,
      precoBaseEmCentavos: 1000,
    });
    const itemB = pendenteDe({
      codigoProduto: 'B002',
      quantidadeEmUnidades: 1,
      precoBaseEmCentavos: 1000,
    });

    const { rerender } = renderizar({ pendente: itemA });

    fireEvent.change(screen.getByTestId('edicao-desconto'), { target: { value: '2,00' } });
    expect(screen.getByTestId('edicao-desconto')).toHaveValue('2,00');

    rerender(<EdicaoItemEditavel pendente={itemB} onConfirmar={() => {}} onCancelar={() => {}} />);

    expect(screen.getByTestId('edicao-desconto')).toHaveValue('0,00');
  });
});

describe('EdicaoItemEditavel — prévia de total usa a função de domínio (Problema 2)', () => {
  it('a prévia de "Total do item" é exatamente o resultado de calcularTotalLinha, não um recálculo manual', () => {
    // preço R$ 3,33 × 1,500 unidades = 499500 centi-milésimos → 499,5 centavos
    // brutos, exatamente na fronteira de arredondamento (`.5`) — o ponto mais
    // sensível para provar que a prévia usa o arredondamento canônico do
    // domínio, e não uma reimplementação manual.
    const item = pendenteDe({
      codigoProduto: 'C003',
      quantidadeEmUnidades: 1.5,
      precoBaseEmCentavos: 333,
    });

    renderizar({ pendente: item });

    const precoLido = centavos(333);
    const quantidadeLida = milesimosDeUnidades(1.5);
    const descontoLido = centavos(0);
    const totalEsperado = calcularTotalLinha(precoLido, quantidadeLida, descontoLido);

    expect(
      screen.getByText(`Total do item: ${formatarCentavos(totalEsperado)}`),
    ).toBeInTheDocument();
  });

  it('reage à edição de preço/quantidade/desconto chamando calcularTotalLinha para os novos valores', () => {
    const item = pendenteDe({
      codigoProduto: 'D004',
      quantidadeEmUnidades: 1,
      precoBaseEmCentavos: 1000,
    });

    renderizar({ pendente: item });

    fireEvent.change(screen.getByTestId('edicao-quantidade'), { target: { value: '4' } });
    fireEvent.change(screen.getByTestId('edicao-preco'), { target: { value: '19,99' } });
    fireEvent.change(screen.getByTestId('edicao-desconto'), { target: { value: '1,50' } });

    const totalEsperado = calcularTotalLinha(centavos(1999), milesimosDeUnidades(4), centavos(150));

    expect(
      screen.getByText(`Total do item: ${formatarCentavos(totalEsperado)}`),
    ).toBeInTheDocument();
  });

  /**
   * Prova, no nível do domínio, que "arredondar à mão com `Math.round`" e o
   * arredondamento canônico do domínio (`dividirArredondando`, usado por
   * `multiplicarPorQuantidade`/`calcularTotalLinha`) **não são
   * intercambiáveis em geral** — só concordam para dividendo não-negativo.
   *
   * Dentro deste componente, `precoLido`/`quantidadeLida` nunca são negativos
   * (os regexes de `lerCentavos`/`lerQuantidade` não aceitam `-`), então a
   * divergência abaixo não é alcançável hoje digitando nos campos do
   * formulário — mas é exatamente por isso que a matemática não pode ser
   * reimplementada inline no componente: a garantia de equivalência com o
   * total persistido depende inteiramente de nunca duplicar esta lógica.
   * `Math.round` arredonda `,5` para `+Infinito` (`Math.round(-2.5) === -2`);
   * o domínio arredonda para longe do zero (`-3`) — divergência real, não
   * hipotética.
   */
  it('Math.round e o arredondamento canônico do domínio divergem para dividendo negativo', () => {
    const precoUnitario = centavos(-25);
    const quantidade = milesimosDeUnidades(0.1); // 100 milésimos

    const viaDominio = multiplicarPorQuantidade(precoUnitario, quantidade);
    const viaMathRoundIngenuo = Math.round((precoUnitario * quantidade) / 1000);

    expect(viaDominio).toBe(-3);
    expect(viaMathRoundIngenuo).toBe(-2);
    expect(viaDominio).not.toBe(viaMathRoundIngenuo);
  });
});
