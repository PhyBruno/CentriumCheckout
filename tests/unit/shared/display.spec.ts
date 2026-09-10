import { describe, expect, it } from 'vitest';
import {
  MS_PULSO_DISPLAY,
  MS_SILENCIO_ATE_REPOUSO,
  interpretarMensagemDisplay,
  type MensagemDisplay,
} from '../../../src/shared/display';
import {
  COPIA_E_COLA_SINTETICO,
  QR_CODE_SINTETICO,
  TRN_GUID_SINTETICO,
} from '../../support/display';

/**
 * Protocolo do canal do display (T003, `contracts/canal-display.md` §4).
 *
 * Todos os valores são sintéticos. O ponto destes casos não é "Zod funciona": é
 * que uma aba rodando um bundle antigo depois de um deploy publique um formato
 * que o display novo não conhece, e o display **descarte em silêncio** em vez de
 * virar uma tela em branco na frente do cliente.
 */

const ESTADO_COBRANCA = {
  tela: 'PIX_AGUARDANDO',
  trnGuid: TRN_GUID_SINTETICO,
  valorCentavos: 8740,
  qrCodeFonte: QR_CODE_SINTETICO,
  copiaECola: COPIA_E_COLA_SINTETICO,
};

function mensagemDe(estado: unknown): unknown {
  return {
    tipo: 'ESTADO',
    estado,
    nomeLoja: 'Mercado Aurora',
    origemId: 'aba-3f2a9c',
    emitidoEm: 1789077600000,
  };
}

describe('interpretarMensagemDisplay — mensagem válida', () => {
  it('aceita a cobrança inteira, preservando trnGuid, valor e QR Code', () => {
    const lida = interpretarMensagemDisplay(mensagemDe(ESTADO_COBRANCA));

    expect(lida).not.toBeNull();
    const mensagem = lida as MensagemDisplay & { readonly tipo: 'ESTADO' };
    expect(mensagem.tipo).toBe('ESTADO');
    expect(mensagem.nomeLoja).toBe('Mercado Aurora');
    expect(mensagem.estado).toEqual(ESTADO_COBRANCA);
  });

  it('aceita o repouso, que não carrega nenhum campo da venda', () => {
    const lida = interpretarMensagemDisplay(mensagemDe({ tela: 'BOAS_VINDAS' }));

    expect(lida).not.toBeNull();
    expect((lida as { readonly estado: unknown }).estado).toEqual({ tela: 'BOAS_VINDAS' });
  });

  it('aceita o pagamento aprovado com a duração do contador', () => {
    const lida = interpretarMensagemDisplay(
      mensagemDe({
        tela: 'PIX_APROVADO',
        trnGuid: TRN_GUID_SINTETICO,
        valorCentavos: 8740,
        voltaEmMs: 10_000,
      }),
    );

    expect(lida).not.toBeNull();
  });

  it('aceita SOLICITAR_ESTADO, a única mensagem que o display emite', () => {
    expect(interpretarMensagemDisplay({ tipo: 'SOLICITAR_ESTADO' })).toEqual({
      tipo: 'SOLICITAR_ESTADO',
    });
  });

  it('aceita nomeLoja nulo — empresa sem cadastro não vira linha órfã na tela', () => {
    const lida = interpretarMensagemDisplay({
      ...(mensagemDe({ tela: 'BOAS_VINDAS' }) as Record<string, unknown>),
      nomeLoja: null,
    });

    expect(lida).not.toBeNull();
  });
});

describe('interpretarMensagemDisplay — descarte (contrato §4)', () => {
  it('descarta uma tela desconhecida, que é o caso do bundle mais novo na outra aba', () => {
    expect(interpretarMensagemDisplay(mensagemDe({ tela: 'PIX_EM_ANALISE' }))).toBeNull();
  });

  it('descarta a cobrança sem qrCodeFonte', () => {
    const semQrCode: Record<string, unknown> = { ...ESTADO_COBRANCA };
    delete semQrCode['qrCodeFonte'];
    expect(interpretarMensagemDisplay(mensagemDe(semQrCode))).toBeNull();
  });

  it('descarta valorCentavos fracionário — um double atravessou a fronteira', () => {
    expect(
      interpretarMensagemDisplay(mensagemDe({ ...ESTADO_COBRANCA, valorCentavos: 87.4 })),
    ).toBeNull();
  });

  it('descarta valorCentavos negativo', () => {
    expect(
      interpretarMensagemDisplay(mensagemDe({ ...ESTADO_COBRANCA, valorCentavos: -1 })),
    ).toBeNull();
  });

  it('descarta valorCentavos de tipo errado', () => {
    expect(
      interpretarMensagemDisplay(mensagemDe({ ...ESTADO_COBRANCA, valorCentavos: '8740' })),
    ).toBeNull();
  });

  it('descarta voltaEmMs zerado — a confirmação ficaria invisível (invariante E4)', () => {
    expect(
      interpretarMensagemDisplay(
        mensagemDe({
          tela: 'PIX_APROVADO',
          trnGuid: TRN_GUID_SINTETICO,
          valorCentavos: 8740,
          voltaEmMs: 0,
        }),
      ),
    ).toBeNull();
  });

  it('descarta a mensagem sem tipo', () => {
    expect(interpretarMensagemDisplay({ estado: ESTADO_COBRANCA })).toBeNull();
  });

  it('descarta um tipo de mensagem que não existe no protocolo', () => {
    expect(interpretarMensagemDisplay({ tipo: 'ENCERRAR_VENDA' })).toBeNull();
  });

  it.each([null, undefined, 42, 'ESTADO', []])('descarta %o, que nem objeto é', (lixo) => {
    expect(interpretarMensagemDisplay(lixo)).toBeNull();
  });
});

describe('constantes de tempo', () => {
  // A folga de 3× é o que faz duas mensagens perdidas não derrubarem um QR
  // válido (research D8). Quem mexer em um dos dois precisa preservá-la.
  it('mantém a janela de silêncio em 3× o pulso', () => {
    expect(MS_SILENCIO_ATE_REPOUSO).toBe(MS_PULSO_DISPLAY * 3);
  });
});
