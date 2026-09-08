import { describe, expect, it } from 'vitest';
import { centavos } from '../../../../src/client/domain/precificacao/dinheiro';
import {
  projetarPagamentos,
  type FormaCandidata,
} from '../../../../src/client/domain/validacaoVenda/projetarPagamentos';
import { pagamentoDe } from '../../../support/pagamento';

/**
 * T011 — a projeção "como a venda ficaria" (`FR-002`, invariantes I2/I2a).
 *
 * Fixtures sintéticas de `tests/support/pagamento.ts`; nenhum dado de produção.
 */

const CANDIDATA: FormaCandidata = {
  formaCodigo: 9,
  meioPagtoNFe: 'Outros',
  valor: centavos(5_000),
  fpgUtiCar: 'CRD',
  entrada: 'N',
  integracaoCartao: '',
  ticketDevolucao: null,
};

describe('projetarPagamentos', () => {
  it('inclui a candidata no fim da lista, depois das já aplicadas (I2)', () => {
    const aplicados = [
      pagamentoDe({ formaCodigo: 1, valorAplicado: 3_000 }),
      pagamentoDe({ formaCodigo: 2, valorAplicado: 2_000 }),
    ];

    const projetado = projetarPagamentos(aplicados, CANDIDATA);

    expect(projetado).toHaveLength(3);
    expect(projetado.map((forma) => forma.FormaCodigo)).toEqual([1, 2, 9]);
  });

  it('não muta a lista de origem — a inserção só acontece depois do veredito', () => {
    const aplicados = [pagamentoDe({ formaCodigo: 1, valorAplicado: 3_000 })];
    const copia = [...aplicados];

    const projetado = projetarPagamentos(aplicados, CANDIDATA);

    expect(aplicados).toEqual(copia);
    expect(aplicados).toHaveLength(1);
    expect(projetado).not.toBe(aplicados as unknown);
  });

  it('leva `FormaFpgUtiCar` e `FormaEntrada` da candidata — sem eles o ERP zera o crediário', () => {
    const projetado = projetarPagamentos([], CANDIDATA);

    expect(projetado[0]).toMatchObject({
      FormaCodigo: 9,
      FormaFpgUtiCar: 'CRD',
      FormaEntrada: 'N',
      // Fronteira de saída: reais decimais, não centavos.
      FormaValor: 50,
    });
  });

  it('leva `FormaFpgUtiCar` também das formas já aplicadas (segunda inserção de uma venda)', () => {
    const projetado = projetarPagamentos(
      [pagamentoDe({ formaCodigo: 1, valorAplicado: 3_000, fpgUtiCar: 'CRD', entrada: 'N' })],
      CANDIDATA,
    );

    expect(projetado[0]).toMatchObject({ FormaFpgUtiCar: 'CRD', FormaEntrada: 'N' });
  });

  it('descarta pendentes e excluídos, como o payload de emissão faz', () => {
    const projetado = projetarPagamentos(
      [
        pagamentoDe({ formaCodigo: 1, status: 'APROVADO' }),
        pagamentoDe({ formaCodigo: 2, status: 'PENDENTE_INTEGRACAO' }),
        pagamentoDe({ formaCodigo: 3, status: 'EXCLUIDO' }),
      ],
      CANDIDATA,
    );

    expect(projetado.map((forma) => forma.FormaCodigo)).toEqual([1, 9]);
  });
});
