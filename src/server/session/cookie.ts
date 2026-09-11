import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import type { CookieSerializeOptions } from '@fastify/cookie';

/**
 * Sessão do operador (`data-model.md` § Sessão do Operador).
 *
 * Vive inteiramente cifrada dentro do cookie `HttpOnly` — nunca em
 * `localStorage`/`sessionStorage` e nunca acessível a JavaScript (FR-002).
 * Os nomes dos campos são os nomes reais do contrato do ERP.
 */
export interface SessaoOperador {
  readonly access_token: string;
  readonly tenant: string;
  readonly client_id: string;
  readonly client_secret: string;
  readonly username: string;
  readonly password: string;
  readonly Repository: string;
  readonly codigoEmpresa: string;
  /**
   * Operador logado, como o ERP o identifica (`SessaoUsuario.UsuarioCodigo`).
   *
   * Único campo que não chega pelo redirect: é perguntado a `GetSessao` em
   * `/session/start`, logo depois da troca OAuth, e cifrado aqui junto com o
   * resto. Existe para que o BFF possa reescrever o `UsuarioCodigo` do corpo de
   * `FaturarNFCe`/`ValidarNFCe` — que vem do navegador e seria editável no
   * DevTools — com quem de fato está logado (AD-224).
   *
   * String como todo campo desta sessão, e como o próprio ERP o devolve
   * (`int64` serializado); quem precisa do número converte na fronteira.
   */
  readonly usuarioCodigo: string;
}

export const SESSION_COOKIE_NAME = 'cc_session';

/** Opções do cookie de sessão — FR-002 e `contracts/session-bff-api.md`. */
export const SESSION_COOKIE_OPTIONS: CookieSerializeOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  path: '/',
};

/**
 * Marca de que **houve uma entrada válida** pelo CentriumWEB nesta origem.
 *
 * Existe para a SPA distinguir os dois desfechos de falha sem nunca tocar no
 * cookie de sessão (pedido do usuário, 2026-09-08): repetir só faz sentido
 * quando os dados foram mandados e algo falhou no caminho. Sem entrada
 * nenhuma — alguém abriu o Checkout direto, ou o redirect veio sem os
 * parâmetros — nenhuma repetição vai funcionar, e oferecer "Tentar novamente"
 * convida o operador a um laço.
 *
 * `httpOnly: false` **de propósito**, e é seguro: o valor é a constante `'1'`,
 * não carrega credencial, token nem identificador. Ele responde uma única
 * pergunta — "esta origem já teve uma sessão criada?" —, e é o cookie de sessão
 * (esse sim `HttpOnly`) que continua sendo a única prova de autenticação.
 */
export const ENTRADA_COOKIE_OPTIONS: CookieSerializeOptions = {
  httpOnly: false,
  secure: true,
  sameSite: 'lax',
  path: '/',
};

const FORMAT_VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const KEY_SALT = 'centrium-checkout/session-cookie';

const CAMPOS_OBRIGATORIOS = [
  'access_token',
  'tenant',
  'client_id',
  'client_secret',
  'username',
  'password',
  'Repository',
  'codigoEmpresa',
  'usuarioCodigo',
] as const;

/** Cifra e decifra o cookie de sessão. */
export interface CifradorDeSessao {
  cifrar(sessao: SessaoOperador): string;
  /** Devolve `null` para qualquer valor ausente, adulterado ou ilegível. */
  decifrar(valor: string | undefined): SessaoOperador | null;
}

function ehSessaoValida(valor: unknown): valor is SessaoOperador {
  if (typeof valor !== 'object' || valor === null) {
    return false;
  }
  const registro: Record<string, unknown> = valor as Record<string, unknown>;
  return CAMPOS_OBRIGATORIOS.every((campo) => typeof registro[campo] === 'string');
}

/**
 * Cria o cifrador a partir do `SESSION_SECRET` do ambiente (T008/T010).
 *
 * A chave AES de 256 bits é derivada por scrypt, então o segredo pode ser uma
 * frase legível sem enfraquecer a cifra.
 */
export function criarCifradorDeSessao(sessionSecret: string): CifradorDeSessao {
  const chave = scryptSync(sessionSecret, KEY_SALT, KEY_LENGTH);

  return {
    cifrar(sessao: SessaoOperador): string {
      const iv = randomBytes(IV_LENGTH);
      const cipher = createCipheriv(ALGORITHM, chave, iv);
      const conteudo = Buffer.concat([
        cipher.update(JSON.stringify(sessao), 'utf8'),
        cipher.final(),
      ]);
      const tag = cipher.getAuthTag();

      return [
        FORMAT_VERSION,
        iv.toString('base64url'),
        tag.toString('base64url'),
        conteudo.toString('base64url'),
      ].join('.');
    },

    decifrar(valor: string | undefined): SessaoOperador | null {
      if (valor === undefined || valor === '') {
        return null;
      }

      const partes = valor.split('.');
      const [versao, ivB64, tagB64, conteudoB64] = partes;

      if (
        partes.length !== 4 ||
        versao !== FORMAT_VERSION ||
        ivB64 === undefined ||
        tagB64 === undefined ||
        conteudoB64 === undefined
      ) {
        return null;
      }

      try {
        const decipher = createDecipheriv(ALGORITHM, chave, Buffer.from(ivB64, 'base64url'));
        decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
        const aberto = Buffer.concat([
          decipher.update(Buffer.from(conteudoB64, 'base64url')),
          decipher.final(),
        ]).toString('utf8');

        const sessao: unknown = JSON.parse(aberto);
        return ehSessaoValida(sessao) ? sessao : null;
      } catch {
        // Cookie adulterado, cifrado com outra chave ou corrompido: trata como
        // sessão ausente, nunca como erro de servidor.
        return null;
      }
    },
  };
}
