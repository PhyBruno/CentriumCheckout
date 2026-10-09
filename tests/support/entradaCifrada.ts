import { createCipheriv } from 'node:crypto';

/**
 * O lado do ERP da entrada cifrada (AD-276), para os testes: o BFF só decifra,
 * então quem cifra o redirect sintético é este arquivo — com o mesmo algoritmo
 * do `SymmetricCipher` do GeneXus (AES-256, CBC, PKCS7, saída em base64).
 *
 * Chave e IV são sintéticos. Nenhum deles é o de um ambiente real.
 */
export const ENTRADA_AES_KEY = '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f';
export const ENTRADA_AES_IV = 'f0e1d2c3b4a5968778695a4b3c2d1e0f';

/** Outra chave válida — a entrada cifrada com ela tem que ser recusada. */
export const ENTRADA_AES_KEY_DE_OUTRO_AMBIENTE =
  'ffeeddccbbaa99887766554433221100ffeeddccbbaa99887766554433221100';

/** As duas variáveis de ambiente que todo `loadEnv` de teste precisa informar. */
export const ENV_DA_ENTRADA = { ENTRADA_AES_KEY, ENTRADA_AES_IV } as const;

/** Cifra o texto como o ERP faz e devolve o base64 que vai depois do `?`. */
export function cifrarEntrada(
  textoEmClaro: string,
  chaveHex: string = ENTRADA_AES_KEY,
  ivHex: string = ENTRADA_AES_IV,
): string {
  const cipher = createCipheriv(
    'aes-256-cbc',
    Buffer.from(chaveHex, 'hex'),
    Buffer.from(ivHex, 'hex'),
  );
  return Buffer.concat([cipher.update(textoEmClaro, 'utf8'), cipher.final()]).toString('base64');
}
