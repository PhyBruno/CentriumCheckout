import { describe, expect, it } from 'vitest';
import {
  decodificarSeBase64,
  ehBase64,
  fonteDeImagemBase64,
} from '../../../../src/client/domain/pix/base64';

/**
 * Fronteira de decodificação do PIX (itens 5 e 6 do usuário, 2026-09-04).
 *
 * Todos os valores são sintéticos. O que estes testes travam é a regra que o
 * usuário escreveu literalmente — "faça primeiro a validação se é base64, se não
 * estiver, só transmite o dado" — e o motivo pelo qual ela existe: um `atob`
 * incondicional sobre um "copia e cola" já em texto puro devolveria lixo binário
 * para o operador colar no app do banco.
 */

/** BR Code sintético: mesma **forma** de um payload EMV, sem ser um. */
const COPIA_E_COLA =
  '00020126580014BR.GOV.BCB.PIX0136sintetico-0000-4000-8000-00000000520400005303986540510.005802BR5913CENTRIUM LTDA6009SAO PAULO62070503***6304AB12';

describe('ehBase64', () => {
  it('aceita base64 bem formado', () => {
    expect(ehBase64(btoa('qualquer texto'))).toBe(true);
    expect(ehBase64(btoa(COPIA_E_COLA))).toBe(true);
  });

  it('recusa string vazia e comprimento fora do múltiplo de 4', () => {
    expect(ehBase64('')).toBe(false);
    expect(ehBase64('abcde')).toBe(false);
  });

  it('recusa caracteres fora do alfabeto', () => {
    // `.` e `*` aparecem em todo BR Code real (`BR.GOV.BCB.PIX`, `***`) e são
    // justamente o que impede um payload de ser confundido com base64.
    expect(ehBase64(COPIA_E_COLA)).toBe(false);
    expect(ehBase64('abc$')).toBe(false);
  });
});

describe('decodificarSeBase64', () => {
  it('decodifica quando é base64 de texto', () => {
    expect(decodificarSeBase64(btoa(COPIA_E_COLA))).toBe(COPIA_E_COLA);
  });

  it('devolve o dado intacto quando não é base64 — instrução literal do item 6', () => {
    expect(decodificarSeBase64(COPIA_E_COLA)).toBe(COPIA_E_COLA);
  });

  it('devolve o dado intacto quando o base64 decodifica para bytes ilegíveis', () => {
    // `AAAA` é base64 válido e decodifica para três bytes nulos. Sem a checagem
    // de legibilidade, o operador veria caracteres de controle no lugar do
    // código — pior do que ver o valor original.
    expect(decodificarSeBase64('AAAA')).toBe('AAAA');
  });

  it('nunca esvazia o campo: entrada inválida sai como entrou', () => {
    expect(decodificarSeBase64('')).toBe('');
    expect(decodificarSeBase64('###')).toBe('###');
  });
});

describe('fonteDeImagemBase64', () => {
  it('detecta PNG pela assinatura — o formato que o PGetBarCodeImage do ERP gera', () => {
    expect(fonteDeImagemBase64('iVBORw0KGgoAAAANSUhEUg')).toBe(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg',
    );
  });

  it('detecta JPEG pela assinatura', () => {
    expect(fonteDeImagemBase64('/9j/4AAQSkZJRg')).toBe('data:image/jpeg;base64,/9j/4AAQSkZJRg');
  });

  it('cai em image/jpeg quando nenhuma assinatura casa — o tipo que o contrato documenta', () => {
    expect(fonteDeImagemBase64('c2ludGV0aWNv')).toBe('data:image/jpeg;base64,c2ludGV0aWNv');
  });

  it('não prefixa uma data: URL que já veio pronta', () => {
    const pronta = 'data:image/png;base64,iVBORw0KGgo';
    expect(fonteDeImagemBase64(pronta)).toBe(pronta);
  });

  it('remove quebras de linha, que são legais em base64 MIME e ilegais numa data: URL', () => {
    expect(fonteDeImagemBase64('iVBORw0KGgo\nAAAANSUhEUg')).toBe(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg',
    );
  });

  it('sem imagem devolve string vazia, não uma data: URL quebrada', () => {
    expect(fonteDeImagemBase64('')).toBe('');
    expect(fonteDeImagemBase64('   ')).toBe('');
  });
});
