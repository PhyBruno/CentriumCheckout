import { describe, expect, it } from 'vitest';
import {
  decidirMecanismoImpressao,
  ErroTipoImpressaoDesconhecido,
  type TipoImpressao,
} from '../../../../src/client/domain/finalizacaoVenda/decidirMecanismoImpressao';

/**
 * Decisão do mecanismo de impressão (T010, `FR-008`, AD-082).
 *
 * `quickstart.md` Camada 1. Valores sintéticos.
 */

describe('decidirMecanismoImpressao', () => {
  it("mapeia 'E' para impressão direta pelo serviço local do PDV", () => {
    expect(decidirMecanismoImpressao('E')).toBe('direta');
  });

  it("mapeia 'P' para apresentação do PDF", () => {
    expect(decidirMecanismoImpressao('P')).toBe('pdf');
  });

  it.each(['', 'X', 'e', 'PDF'])(
    'trata %o como erro de fronteira em vez de escolher um mecanismo',
    (valorForaDoContrato) => {
      // O tipo já barra isto em compilação; o teste cobre a entrada que chega de
      // um caller não totalmente tipado — um `SessaoUsuario` corrompido não pode
      // virar um caminho de impressão silencioso (Constitution IV).
      const entrada = valorForaDoContrato as TipoImpressao;

      expect(() => decidirMecanismoImpressao(entrada)).toThrow(ErroTipoImpressaoDesconhecido);
    },
  );
});
