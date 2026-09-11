import { createHash } from 'node:crypto';
import type { Env } from '../config/env';
import { chamarErpComRenovacao } from './chamadaAutenticada';
import type { SessaoOperador } from './cookie';

/**
 * Quem é o operador da sessão, decidido **no servidor**.
 *
 * AD-221 passou a mandar `UsuarioCodigo` no corpo de `FaturarNFCe`/`ValidarNFCe`
 * para que a nota diga quem a emitiu. O valor, porém, era montado no navegador
 * a partir do bootstrap: um operador autenticado que editasse o payload no
 * DevTools emitiria nota atribuída a outro operador — exatamente a atribuição
 * que AD-221 existe para garantir. O ERP não valida o campo contra o token
 * (achado do gate `/owasp-security`, item 53 de `.specs/project/PENDENCIES.md`,
 * OWASP A01/A09).
 *
 * A correção não cabia numa linha porque o cookie de sessão
 * (`SessaoOperador`) guarda `access_token`, `username` e `codigoEmpresa`, mas
 * **não** o `UsuarioCodigo` — ele só existe na resposta de `GetSessao`. Este
 * módulo é a peça que faltava: dado o cookie cifrado, devolve o
 * `UsuarioCodigo` que o ERP associa àquele `Login`, e o proxy reescreve o campo
 * do corpo com ele, do mesmo jeito que já faz com `Cliente.Empresa`.
 *
 * Não é um novo campo de sessão de propósito: persistir o código no cookie
 * invalidaria toda sessão já aberta no momento do deploy e criaria uma segunda
 * fonte de verdade a manter em sincronia. O `Login` que já está lá basta — é
 * ele que o ERP usa para responder quem é o operador.
 */

/** Caminho do `GetSessao` no ERP, compartilhado com `GET /api/bootstrap`. */
export const CAMINHO_GET_SESSAO = '/ApiCentriumOAuth/GetSessao';

/**
 * Query canônica de `GetSessao`, na ordem que o ERP exige.
 *
 * `Empresa` vai na query **além** do cabeçalho (AD-205) e **antes** de `Login`:
 * o `Event GetSessao.Before` recorta o login de `Login=` até o fim da query
 * string, então `Empresa` depois dele entraria no valor recortado e a sessão
 * voltaria zerada (`UsuarioCodigo: "0"`). `URLSearchParams` preserva a ordem de
 * inserção, então a ordem deste objeto é a ordem enviada.
 */
export function queryGetSessao(sessao: SessaoOperador): Record<string, string> {
  return { Empresa: sessao.codigoEmpresa, Login: sessao.username };
}

/**
 * Lê `UsuarioCodigo` de uma resposta de `GetSessao`.
 *
 * Aceita as duas formas que o endpoint assume: os campos na raiz, como o ERP
 * real devolve (AD-165), e sob a chave `SessaoUsuario`, como o `erp-mock` e o
 * YAML desenham. O valor chega como string no ERP real (`int64` serializado) e
 * como número no mock, então os dois são aceitos.
 *
 * `0` é recusado, não aceito como código: é o que o ERP devolve quando não
 * conseguiu resolver o login (AD-205). Atribuir a nota ao usuário `0` seria
 * pior que recusar a emissão — cria trilha de auditoria falsa.
 */
export function extrairUsuarioCodigo(json: unknown): number | null {
  if (typeof json !== 'object' || json === null) {
    return null;
  }

  const corpo = json as Record<string, unknown>;
  const envelope = corpo['SessaoUsuario'];
  const sessao: Record<string, unknown> =
    typeof envelope === 'object' && envelope !== null && !Array.isArray(envelope)
      ? (envelope as Record<string, unknown>)
      : corpo;

  const bruto = sessao['UsuarioCodigo'];
  if (typeof bruto !== 'string' && typeof bruto !== 'number') {
    return null;
  }

  const codigo = Number(bruto);
  return Number.isSafeInteger(codigo) && codigo > 0 ? codigo : null;
}

export interface OperadorDaSessao {
  /** `null` quando o ERP não identificou o operador — o chamador deve recusar. */
  readonly usuarioCodigo: number | null;
  /** Preenchido só quando houve renovação de token; o chamador regrava o cookie. */
  readonly sessaoRenovada: SessaoOperador | null;
}

export interface UsuarioDaSessao {
  /**
   * Guarda o código já resolvido por outro caminho — hoje, o `GET /api/bootstrap`,
   * que chama `GetSessao` de qualquer forma. Deixa o caminho de faturamento sem
   * nenhuma chamada extra ao ERP no fluxo normal.
   */
  registrar(sessao: SessaoOperador, usuarioCodigo: number): void;
  /** Resolve o operador, usando o cache quente quando houver. */
  resolver(sessao: SessaoOperador): Promise<OperadorDaSessao>;
}

export interface UsuarioDaSessaoDeps {
  readonly env: Env;
  readonly fetchImpl?: typeof fetch;
  /** Validade do cache, em milissegundos. Existe para os testes encurtarem. */
  readonly ttlMs?: number;
  /** Relógio injetável — os testes avançam o tempo sem esperar. */
  readonly agora?: () => number;
}

const TTL_PADRAO_MS = 5 * 60 * 1000;

interface EntradaDeCache {
  readonly usuarioCodigo: number;
  readonly expiraEm: number;
}

/**
 * Identifica o operador sem guardar segredo em memória: a chave deriva de
 * `tenant`/`codigoEmpresa`/`username`, nunca de `access_token` ou `password`.
 *
 * A empresa entra na chave porque vai na query de `GetSessao` — o mesmo login
 * em empresas diferentes é uma pergunta diferente ao ERP.
 */
function chaveDeCache(sessao: SessaoOperador): string {
  return createHash('sha256')
    .update(`${sessao.tenant}:${sessao.codigoEmpresa}:${sessao.username}`)
    .digest('hex');
}

/**
 * Cria o resolvedor com cache por operador.
 *
 * O BFF roda em processo Node único (`.specs/codebase/ARCHITECTURE.md`), então
 * um `Map` de instância basta — não há coordenação entre réplicas a fazer. A
 * instância vive em `buildApp`, e não no módulo, para que cada teste tenha o
 * seu próprio cache frio.
 */
export function criarUsuarioDaSessao(deps: UsuarioDaSessaoDeps): UsuarioDaSessao {
  const ttlMs = deps.ttlMs ?? TTL_PADRAO_MS;
  const agora = deps.agora ?? Date.now;

  const cache = new Map<string, EntradaDeCache>();
  /**
   * Resoluções em andamento, uma por operador (single-flight).
   *
   * Sem isto, N chamadas concorrentes com o cache frio disparariam N
   * `GetSessao` — cada um com ~5MB de resposta — para responder à mesma
   * pergunta. Mesmo padrão da renovação de token em `chamadaAutenticada.ts`.
   */
  const emVoo = new Map<string, Promise<OperadorDaSessao>>();

  async function consultarErp(sessao: SessaoOperador): Promise<OperadorDaSessao> {
    const resultado = await chamarErpComRenovacao(
      sessao,
      { caminho: CAMINHO_GET_SESSAO, query: queryGetSessao(sessao) },
      { env: deps.env, ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}) },
    );

    const { sessaoRenovada } = resultado;

    if (!resultado.resposta.ok) {
      // O corpo não vai para lugar nenhum, mas precisa ser consumido: o undici
      // só devolve a conexão ao pool depois disso.
      await resultado.resposta.arrayBuffer().catch(() => undefined);
      return { usuarioCodigo: null, sessaoRenovada };
    }

    let json: unknown;
    try {
      json = await resultado.resposta.json();
    } catch {
      return { usuarioCodigo: null, sessaoRenovada };
    }

    const usuarioCodigo = extrairUsuarioCodigo(json);
    if (usuarioCodigo !== null) {
      cache.set(chaveDeCache(sessao), { usuarioCodigo, expiraEm: agora() + ttlMs });
    }

    return { usuarioCodigo, sessaoRenovada };
  }

  return {
    registrar(sessao: SessaoOperador, usuarioCodigo: number): void {
      if (Number.isSafeInteger(usuarioCodigo) && usuarioCodigo > 0) {
        cache.set(chaveDeCache(sessao), { usuarioCodigo, expiraEm: agora() + ttlMs });
      }
    },

    async resolver(sessao: SessaoOperador): Promise<OperadorDaSessao> {
      const chave = chaveDeCache(sessao);

      const quente = cache.get(chave);
      if (quente !== undefined && quente.expiraEm > agora()) {
        return { usuarioCodigo: quente.usuarioCodigo, sessaoRenovada: null };
      }
      cache.delete(chave);

      const jaEmVoo = emVoo.get(chave);
      if (jaEmVoo !== undefined) {
        return jaEmVoo;
      }

      const consulta = consultarErp(sessao).finally(() => {
        // Sucesso ou falha: a próxima chamada precisa poder tentar de novo.
        emVoo.delete(chave);
      });

      emVoo.set(chave, consulta);
      return consulta;
    },
  };
}
