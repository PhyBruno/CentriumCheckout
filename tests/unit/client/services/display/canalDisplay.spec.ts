import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { criarCanalDisplay } from '../../../../../src/client/services/display/canalDisplay';
import {
  MS_PULSO_DISPLAY,
  NOME_CANAL_DISPLAY,
  type MensagemDisplay,
} from '../../../../../src/shared/display';
import {
  criarBarramentoFalso,
  QR_CODE_SINTETICO,
  COPIA_E_COLA_SINTETICO,
  TRN_GUID_SINTETICO,
  type BarramentoFalso,
} from '../../../../support/display';

/**
 * Publicador do display (T005, `contracts/canal-display.md` §5).
 *
 * O canal é **injetado** (`deps.criarCanal`): o `BroadcastChannel` do jsdom não
 * entrega entre contextos, então depender dele testaria o ambiente, não o
 * contrato (research D13). Valores sintéticos em toda parte.
 */

const COBRANCA = {
  tela: 'PIX_AGUARDANDO',
  trnGuid: TRN_GUID_SINTETICO,
  valorCentavos: 8740,
  qrCodeFonte: QR_CODE_SINTETICO,
  copiaECola: COPIA_E_COLA_SINTETICO,
} as const;

const REPOUSO = { tela: 'BOAS_VINDAS' } as const;

function estadosPublicados(barramento: BarramentoFalso): readonly unknown[] {
  return barramento.publicadas
    .filter((mensagem): mensagem is MensagemDisplay & { readonly tipo: 'ESTADO' } => {
      return (mensagem as { readonly tipo?: unknown }).tipo === 'ESTADO';
    })
    .map((mensagem) => mensagem.estado);
}

describe('criarCanalDisplay — C1: publica e memoriza', () => {
  it('abre o canal com o nome do contrato', () => {
    const barramento = criarBarramentoFalso();
    criarCanalDisplay({ criarCanal: barramento.criarCanal });

    expect(barramento.nomes).toEqual([NOME_CANAL_DISPLAY]);
  });

  it('emite o estado, o nome da loja e o instante da emissão', () => {
    const barramento = criarBarramentoFalso();
    const canal = criarCanalDisplay({
      criarCanal: barramento.criarCanal,
      agora: () => 1_789_077_600_000,
    });

    canal.publicar(COBRANCA, 'Mercado Aurora');

    expect(barramento.publicadas).toHaveLength(1);
    expect(barramento.publicadas[0]).toMatchObject({
      tipo: 'ESTADO',
      estado: COBRANCA,
      nomeLoja: 'Mercado Aurora',
      emitidoEm: 1_789_077_600_000,
    });
    // `origemId` identifica a aba: existe e não é vazio, mas o valor é opaco.
    expect((barramento.publicadas[0] as { readonly origemId: string }).origemId).not.toBe('');

    canal.encerrar();
  });

  it('publica também o repouso — é o que devolve a tela do cliente ao estado neutro', () => {
    const barramento = criarBarramentoFalso();
    const canal = criarCanalDisplay({ criarCanal: barramento.criarCanal });

    canal.publicar(COBRANCA, 'Mercado Aurora');
    canal.publicar(REPOUSO, 'Mercado Aurora');

    expect(estadosPublicados(barramento)).toEqual([COBRANCA, REPOUSO]);

    canal.encerrar();
  });

  it('aceita nomeLoja nulo, para a empresa sem cadastro não virar linha órfã', () => {
    const barramento = criarBarramentoFalso();
    const canal = criarCanalDisplay({ criarCanal: barramento.criarCanal });

    canal.publicar(REPOUSO, null);

    expect(barramento.publicadas[0]).toMatchObject({ nomeLoja: null });

    canal.encerrar();
  });
});

describe('criarCanalDisplay — C2: handshake seletivo (T021)', () => {
  it('responde SOLICITAR_ESTADO quando há cobrança ativa', () => {
    const barramento = criarBarramentoFalso();
    const canal = criarCanalDisplay({ criarCanal: barramento.criarCanal });

    canal.publicar(COBRANCA, 'Mercado Aurora');
    barramento.emitirDeFora({ tipo: 'SOLICITAR_ESTADO' });

    // Duas publicações: a original e a resposta ao pedido do display.
    expect(estadosPublicados(barramento)).toEqual([COBRANCA, COBRANCA]);

    canal.encerrar();
  });

  /**
   * FR-018 / research D7 — a regra mais contra-intuitiva da feature, e a mais
   * fácil de quebrar numa refatoração: se a aba em repouso respondesse
   * `BOAS_VINDAS`, o handshake de um display aberto no meio de uma cobrança
   * apagaria o QR que a **outra** aba de checkout acabou de publicar.
   */
  it('fica calada em repouso, para não apagar o QR publicado por outra aba', () => {
    const barramento = criarBarramentoFalso();
    const canal = criarCanalDisplay({ criarCanal: barramento.criarCanal });

    canal.publicar(COBRANCA, 'Mercado Aurora');
    canal.publicar(REPOUSO, 'Mercado Aurora');
    const antes = barramento.publicadas.length;

    barramento.emitirDeFora({ tipo: 'SOLICITAR_ESTADO' });

    expect(barramento.publicadas).toHaveLength(antes);

    canal.encerrar();
  });

  it('fica calada quando ainda não publicou nada — repouso é o estado inicial', () => {
    const barramento = criarBarramentoFalso();
    const canal = criarCanalDisplay({ criarCanal: barramento.criarCanal });

    barramento.emitirDeFora({ tipo: 'SOLICITAR_ESTADO' });

    expect(barramento.publicadas).toHaveLength(0);

    canal.encerrar();
  });

  it('ignora uma mensagem de estado alheia — o publicador não é ouvinte de estado', () => {
    const barramento = criarBarramentoFalso();
    const canal = criarCanalDisplay({ criarCanal: barramento.criarCanal });

    canal.publicar(COBRANCA, 'Mercado Aurora');
    const antes = barramento.publicadas.length;

    barramento.emitirDeFora({
      tipo: 'ESTADO',
      estado: REPOUSO,
      nomeLoja: null,
      origemId: 'outra-aba',
      emitidoEm: 1,
    });

    expect(barramento.publicadas).toHaveLength(antes);

    canal.encerrar();
  });

  it('para de responder depois de encerrado', () => {
    const barramento = criarBarramentoFalso();
    const canal = criarCanalDisplay({ criarCanal: barramento.criarCanal });

    canal.publicar(COBRANCA, 'Mercado Aurora');
    canal.encerrar();
    barramento.emitirDeFora({ tipo: 'SOLICITAR_ESTADO' });

    expect(estadosPublicados(barramento)).toEqual([COBRANCA]);
  });
});

describe('criarCanalDisplay — C3: pulso enquanto há cobrança (T033)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('republica a cada MS_PULSO_DISPLAY enquanto a cobrança está de pé', () => {
    const barramento = criarBarramentoFalso();
    const canal = criarCanalDisplay({ criarCanal: barramento.criarCanal });

    canal.publicar(COBRANCA, 'Mercado Aurora');
    vi.advanceTimersByTime(MS_PULSO_DISPLAY * 3);

    // A publicação original mais três pulsos.
    expect(estadosPublicados(barramento)).toEqual([COBRANCA, COBRANCA, COBRANCA, COBRANCA]);

    canal.encerrar();
  });

  it('desliga o pulso ao voltar ao repouso — repouso não precisa ser reafirmado', () => {
    const barramento = criarBarramentoFalso();
    const canal = criarCanalDisplay({ criarCanal: barramento.criarCanal });

    canal.publicar(COBRANCA, 'Mercado Aurora');
    vi.advanceTimersByTime(MS_PULSO_DISPLAY);
    canal.publicar(REPOUSO, 'Mercado Aurora');
    const antes = barramento.publicadas.length;

    vi.advanceTimersByTime(MS_PULSO_DISPLAY * 5);

    expect(barramento.publicadas).toHaveLength(antes);

    canal.encerrar();
  });

  it('encerrar mata o pulso — nenhuma publicação depois disso', () => {
    const barramento = criarBarramentoFalso();
    const canal = criarCanalDisplay({ criarCanal: barramento.criarCanal });

    canal.publicar(COBRANCA, 'Mercado Aurora');
    canal.encerrar();
    const antes = barramento.publicadas.length;

    vi.advanceTimersByTime(MS_PULSO_DISPLAY * 5);

    expect(barramento.publicadas).toHaveLength(antes);
  });

  it('trocar de cobrança não acumula temporizadores', () => {
    const barramento = criarBarramentoFalso();
    const canal = criarCanalDisplay({ criarCanal: barramento.criarCanal });

    canal.publicar(COBRANCA, 'Mercado Aurora');
    canal.publicar({ ...COBRANCA, trnGuid: 'outra' }, 'Mercado Aurora');
    const antes = barramento.publicadas.length;

    vi.advanceTimersByTime(MS_PULSO_DISPLAY);

    // Exatamente **um** pulso, não dois: um temporizador por canal, sempre.
    expect(barramento.publicadas).toHaveLength(antes + 1);

    canal.encerrar();
  });
});

describe('criarCanalDisplay — C4: pagehide devolve a tela ao repouso (T034)', () => {
  it('publica BOAS_VINDAS antes de a aba morrer (FR-021)', () => {
    const barramento = criarBarramentoFalso();
    const canal = criarCanalDisplay({ criarCanal: barramento.criarCanal });

    canal.publicar(COBRANCA, 'Mercado Aurora');
    window.dispatchEvent(new Event('pagehide'));

    expect(estadosPublicados(barramento).at(-1)).toEqual(REPOUSO);

    canal.encerrar();
  });

  it('remove o ouvinte em encerrar — uma aba encerrada não fala mais', () => {
    const barramento = criarBarramentoFalso();
    const canal = criarCanalDisplay({ criarCanal: barramento.criarCanal });

    canal.publicar(COBRANCA, 'Mercado Aurora');
    canal.encerrar();
    const antes = barramento.publicadas.length;

    window.dispatchEvent(new Event('pagehide'));

    expect(barramento.publicadas).toHaveLength(antes);
  });
});

describe('criarCanalDisplay — C5: encerrar é idempotente', () => {
  it('fecha o canal e sobrevive a uma segunda chamada (StrictMode desmonta duas vezes)', () => {
    const barramento = criarBarramentoFalso();
    const canal = criarCanalDisplay({ criarCanal: barramento.criarCanal });

    canal.encerrar();
    expect(barramento.canaisAbertos()).toBe(0);

    expect(() => {
      canal.encerrar();
    }).not.toThrow();
    expect(barramento.canaisAbertos()).toBe(0);
  });

  it('não publica mais nada depois de encerrado', () => {
    const barramento = criarBarramentoFalso();
    const canal = criarCanalDisplay({ criarCanal: barramento.criarCanal });

    canal.encerrar();
    canal.publicar(COBRANCA, 'Mercado Aurora');

    expect(barramento.publicadas).toHaveLength(0);
  });
});
