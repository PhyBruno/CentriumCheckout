import { describe, expect, it } from 'vitest';
import {
  autorizaFinalizacao,
  interpretarRespostaValidacao,
  vereditoDeFalha,
  MOTIVO_RECUSA_GENERICA,
} from '../../../../src/client/domain/validacaoVenda/interpretarVeredito';
import type { ValidarNFCeOutput } from '../../../../src/shared/schemas/validarNFCe.schema';

/**
 * T010 — o teste negativo obrigatório de AD-110.
 *
 * Todas as respostas aqui são sintéticas; nenhum dado de produção. Os códigos de
 * `Type` seguem o GeneXus: `1` é Warning, `2` é Error.
 */

const WARNING = 1;
const ERROR = 2;

function resposta(
  Valido: boolean,
  messages: ValidarNFCeOutput['messages'] = [],
): ValidarNFCeOutput {
  return { Valido, messages };
}

describe('interpretarRespostaValidacao — só `Valido` decide bloqueio (FR-006, I3, AD-110)', () => {
  it('Valido=false com Type=Warning é RECUSADA, não ACEITA', () => {
    // O caso real que motivou a regra: crédito bloqueado e limite estourado com
    // `EmpLimCre='B'` chegam como Warning e **recusam**.
    const veredito = interpretarRespostaValidacao(
      resposta(false, [
        { Id: '9999', Type: WARNING, Description: 'Cliente está com crédito bloqueado.' },
      ]),
    );

    expect(veredito.resultado).toBe('RECUSADA');
    expect(veredito).toEqual({
      resultado: 'RECUSADA',
      motivos: [{ id: '9999', severidade: 'AVISO', texto: 'Cliente está com crédito bloqueado.' }],
    });
  });

  it('Valido=true com Type=Warning é ACEITA com aviso — o outro lado da mesma moeda', () => {
    // `EmpLimCre='A'`: acima do limite, mas a empresa só avisa.
    const veredito = interpretarRespostaValidacao(
      resposta(true, [
        { Id: '9999', Type: WARNING, Description: 'Cliente acima do limite de crédito.' },
      ]),
    );

    expect(veredito).toEqual({
      resultado: 'ACEITA',
      avisos: [{ id: '9999', severidade: 'AVISO', texto: 'Cliente acima do limite de crédito.' }],
    });
  });

  it('Valido=true sem mensagens é ACEITA silenciosa', () => {
    expect(interpretarRespostaValidacao(resposta(true))).toEqual({
      resultado: 'ACEITA',
      avisos: [],
    });
  });

  it('Valido=false sem mensagens vira RECUSADA com a mensagem genérica (FR-008)', () => {
    const veredito = interpretarRespostaValidacao(resposta(false));

    expect(veredito).toEqual({
      resultado: 'RECUSADA',
      motivos: [{ id: '', severidade: 'ERRO', texto: MOTIVO_RECUSA_GENERICA }],
    });
  });

  it('preserva todas as mensagens, na ordem recebida, com o texto íntegro (FR-007, I11)', () => {
    const veredito = interpretarRespostaValidacao(
      resposta(false, [
        { Id: '9999', Type: ERROR, Description: 'Primeira.' },
        { Id: '9999', Type: WARNING, Description: 'Segunda.' },
      ]),
    );

    expect(veredito.resultado === 'RECUSADA' && veredito.motivos.map((m) => m.texto)).toEqual([
      'Primeira.',
      'Segunda.',
    ]);
  });

  it('severidade desconhecida não derruba a interpretação — só a apresentação é neutra', () => {
    const veredito = interpretarRespostaValidacao(
      resposta(true, [{ Id: '9999', Type: 99, Description: 'Código novo do ERP.' }]),
    );

    expect(veredito.resultado === 'ACEITA' && veredito.avisos[0]?.severidade).toBe('DESCONHECIDA');
  });
});

describe('autorizaFinalizacao — só ACEITA autoriza (FR-015, I6)', () => {
  it('null é false: nenhuma consulta bem-sucedida nesta venda', () => {
    expect(autorizaFinalizacao(null)).toBe(false);
  });

  it('RECUSADA é false', () => {
    expect(autorizaFinalizacao({ resultado: 'RECUSADA', motivos: [] })).toBe(false);
  });

  it('INDISPONIVEL é false — ausência de veredito não é aprovação tácita (I4)', () => {
    expect(autorizaFinalizacao(vereditoDeFalha('REDE'))).toBe(false);
  });

  it('ACEITA é true, com ou sem avisos', () => {
    expect(autorizaFinalizacao({ resultado: 'ACEITA', avisos: [] })).toBe(true);
    expect(
      autorizaFinalizacao({
        resultado: 'ACEITA',
        avisos: [{ id: '9999', severidade: 'AVISO', texto: 'Acima do limite.' }],
      }),
    ).toBe(true);
  });
});

describe('vereditoDeFalha', () => {
  it('carrega a causa, para a notificação distinguir rede de recusa de negócio (FR-009)', () => {
    expect(vereditoDeFalha('TIMEOUT')).toEqual({ resultado: 'INDISPONIVEL', causa: 'TIMEOUT' });
  });
});
