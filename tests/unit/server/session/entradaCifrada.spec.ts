import { describe, expect, it } from 'vitest';
import { criarDecifradorDeEntrada } from '../../../../src/server/session/entradaCifrada';
import {
  cifrarEntrada,
  ENTRADA_AES_IV,
  ENTRADA_AES_KEY,
  ENTRADA_AES_KEY_DE_OUTRO_AMBIENTE,
} from '../../../support/entradaCifrada';

/**
 * A query de `/session/start` chega cifrada pelo ERP (AD-276): AES-256, CBC,
 * PKCS7, base64. O decifrador só abre o envelope — e devolve `null`, nunca
 * erro, para tudo que não foi cifrado com a chave deste ambiente.
 *
 * Todos os valores são sintéticos.
 */

const decifrador = criarDecifradorDeEntrada(ENTRADA_AES_KEY, ENTRADA_AES_IV);

const ENTRADA =
  'tenant=tenantdemo&client_id=id-sintetico&client_secret=segredo-sintetico' +
  '&username=operador.teste&password=senha-sintetica&Repository=repo-sintetico&codigoEmpresa=1';

/**
 * Um texto cujo base64 cifrado tenha `+`, `/` e `=` — os três caracteres que
 * uma URL pode estragar. Procurado, e não fixo, para o teste não depender de
 * um cifrado decorado.
 */
function entradaComBase64Delicado(): { texto: string; base64: string } {
  for (let sufixo = 0; sufixo < 5000; sufixo += 1) {
    const texto = `${ENTRADA}&n=${sufixo}`;
    const base64 = cifrarEntrada(texto);
    if (base64.includes('+') && base64.includes('/') && base64.endsWith('=')) {
      return { texto, base64 };
    }
  }
  throw new Error('nenhum texto sintético gerou base64 com +, / e =');
}

describe('decifrador da entrada — abre o que o ERP cifrou', () => {
  it('devolve a query em claro', () => {
    expect(decifrador.decifrar(cifrarEntrada(ENTRADA))).toBe(ENTRADA);
  });

  it('preserva acentuação (UTF-8)', () => {
    const texto = 'username=joão.operação&password=señha';

    expect(decifrador.decifrar(cifrarEntrada(texto))).toBe(texto);
  });

  it('aceita o base64 cru, com +, / e = como o ERP o escreve na URL', () => {
    const { texto, base64 } = entradaComBase64Delicado();

    expect(decifrador.decifrar(base64)).toBe(texto);
  });

  it('aceita o base64 com percent-encoding', () => {
    const { texto, base64 } = entradaComBase64Delicado();

    expect(decifrador.decifrar(encodeURIComponent(base64))).toBe(texto);
  });

  it('aceita o base64 cujo + virou espaço no caminho', () => {
    const { texto, base64 } = entradaComBase64Delicado();

    expect(decifrador.decifrar(base64.replaceAll('+', ' '))).toBe(texto);
    expect(decifrador.decifrar(base64.replaceAll('+', '%20'))).toBe(texto);
  });
});

describe('decifrador da entrada — recusa o que não é deste ambiente', () => {
  it('query vazia', () => {
    expect(decifrador.decifrar('')).toBeNull();
  });

  it('query em claro, no formato antigo', () => {
    expect(decifrador.decifrar(ENTRADA)).toBeNull();
  });

  it('entrada cifrada com a chave de outro ambiente', () => {
    const base64 = cifrarEntrada(ENTRADA, ENTRADA_AES_KEY_DE_OUTRO_AMBIENTE);

    expect(decifrador.decifrar(base64)).toBeNull();
  });

  it('base64 truncado, que não fecha um bloco AES', () => {
    const base64 = cifrarEntrada(ENTRADA);

    expect(decifrador.decifrar(base64.slice(0, -8))).toBeNull();
  });

  it('percent-encoding malformado', () => {
    expect(decifrador.decifrar('%E0%A4%A')).toBeNull();
  });
});
