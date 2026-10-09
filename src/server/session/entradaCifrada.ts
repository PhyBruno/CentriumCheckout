import { createDecipheriv } from 'node:crypto';

/**
 * Entrada cifrada do redirect do ERP (AD-276).
 *
 * O CentriumWEB não manda mais as credenciais do operador em claro na URL:
 * manda `/session/start?<base64>`, em que o base64 é a query string de antes
 * (`tenant=…&client_id=…&…&codigoEmpresa=…`) cifrada pelo `SymmetricCipher` do
 * GeneXus — AES, CBC, PKCS7, chave de 256 bits e IV fixos por ambiente.
 *
 * Este módulo só abre o envelope. Dizer se o que saiu dele é uma entrada válida
 * continua sendo do schema Zod da rota.
 */

const ALGORITMO = 'aes-256-cbc';
const TAMANHO_DO_BLOCO_BYTES = 16;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/** Abre a query cifrada de `/session/start`. */
export interface DecifradorDeEntrada {
  /**
   * Recebe a query **bruta** (o que vem depois do `?`, sem interpretar) e
   * devolve o texto em claro, ou `null` para qualquer valor que não seja uma
   * entrada cifrada com a chave deste ambiente.
   */
  decifrar(queryBruta: string): string | null;
}

/**
 * Recupera o base64 como o ERP o escreveu.
 *
 * A query não pode passar pelo parser de query string: ele trocaria todo `+`
 * do base64 por espaço e trataria o `=` do padding como separador de chave e
 * valor. Por isso a rota entrega o texto bruto, e aqui só se desfaz o que pode
 * ter acontecido no caminho — percent-encoding (`%2B`, `%2F`, `%3D`) e o `+`
 * que algum intermediário já tenha convertido em espaço.
 */
function base64DaQuery(queryBruta: string): string | null {
  let texto: string;
  try {
    texto = decodeURIComponent(queryBruta);
  } catch {
    return null;
  }

  const base64 = texto.replaceAll(' ', '+');
  return BASE64.test(base64) ? base64 : null;
}

/**
 * Cria o decifrador a partir de `ENTRADA_AES_KEY` e `ENTRADA_AES_IV` do
 * ambiente, ambos em hexadecimal — o mesmo formato em que o ERP os declara.
 */
export function criarDecifradorDeEntrada(chaveHex: string, ivHex: string): DecifradorDeEntrada {
  const chave = Buffer.from(chaveHex, 'hex');
  const iv = Buffer.from(ivHex, 'hex');
  // `fatal`: bytes que não formam UTF-8 são texto aberto com a chave errada
  // que, por acaso, terminou num padding válido — não uma entrada.
  const utf8 = new TextDecoder('utf-8', { fatal: true });

  return {
    decifrar(queryBruta: string): string | null {
      const base64 = base64DaQuery(queryBruta);
      if (base64 === null) {
        return null;
      }

      const cifrado = Buffer.from(base64, 'base64');
      if (cifrado.length === 0 || cifrado.length % TAMANHO_DO_BLOCO_BYTES !== 0) {
        return null;
      }

      try {
        const decipher = createDecipheriv(ALGORITMO, chave, iv);
        return utf8.decode(Buffer.concat([decipher.update(cifrado), decipher.final()]));
      } catch {
        // Padding inválido ou texto ilegível: cifrado com outra chave, truncado
        // ou adulterado. É entrada recusada, nunca erro de servidor.
        return null;
      }
    },
  };
}
