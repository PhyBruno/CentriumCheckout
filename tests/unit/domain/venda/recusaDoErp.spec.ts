import { describe, expect, it } from 'vitest';
import { ehRecusaDeCenarioTributario } from '../../../../src/client/domain/venda/recusaDoErp';

/**
 * AD-239 — o `Id` de `messages` é o genérico `9999` em **todas** as recusas
 * medidas, então o texto é a única coisa que separa "a venda precisa de ajuste"
 * de "o cadastro fiscal do ERP está incompleto". Os dois desfechos são opostos
 * na tela: um devolve a venda ao caixa, o outro a limpa.
 */
describe('ehRecusaDeCenarioTributario', () => {
  it('reconhece a frase exata do ERP (medida em 2026-09-16)', () => {
    expect(
      ehRecusaDeCenarioTributario(
        'Busca realizada pelo seguinte Cenário Tributário não foi Encontrada\r\n' +
          '[ Empresa: 0, Classificação Fiscal: , Regime Especial: NORMAL, UF Origem: SC ]',
      ),
    ).toBe(true);
  });

  it('reconhece a mesma frase sem acento', () => {
    expect(ehRecusaDeCenarioTributario('Cenario tributario nao encontrado')).toBe(true);
  });

  it.each([
    'Quantidade maior que o Saldo do produto: 18 - PLACA DE VIDEO! Quantidade: 16. Saldo: 15',
    'Condição de Pagamento 0 não Localizada',
    'Erro - Item Liberado: S, Pedido Liberado: S, Status Digitação: N',
    '',
  ])('não confunde com outra recusa: %s', (mensagem) => {
    expect(ehRecusaDeCenarioTributario(mensagem)).toBe(false);
  });

  it('reconhece a variante do contrato de outubro, sem "tributário" (AD-258)', () => {
    expect(
      ehRecusaDeCenarioTributario(
        'Cenário não encontrado!\r\nCenário pesquisado: Empresa=1, UF Destino=SC',
      ),
    ).toBe(true);
  });

  it('o critério é a palavra "cenário", com ou sem acento e em qualquer caixa', () => {
    expect(ehRecusaDeCenarioTributario('CENÁRIO inválido')).toBe(true);
    expect(ehRecusaDeCenarioTributario('cenario invalido')).toBe(true);
  });
});
