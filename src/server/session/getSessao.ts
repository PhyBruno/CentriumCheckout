import {
  chamarErp,
  type ChamadaAutenticadaDeps,
  type CredenciaisDeChamada,
} from './chamadaAutenticada';
import type { SessaoOperador } from './cookie';

/**
 * O endereço de `GetSessao` e o que se lê dele.
 *
 * Duas rotas fazem essa chamada e por motivos diferentes: `/session/start`
 * pergunta **quem é o operador** para gravá-lo no cookie (AD-224), e
 * `/api/bootstrap` busca a configuração inteira do PDV. Caminho e query vivem
 * aqui porque a ordem dos pares é contrato do ERP, não estética — duas cópias
 * divergiriam no primeiro ajuste.
 */

/** Caminho de `GetSessao` a partir da raiz do host do ERP. */
export const CAMINHO_GET_SESSAO = '/ApiCentriumOAuth/GetSessao';

/** O mínimo para perguntar ao ERP quem é o operador de um login. */
export type CredenciaisGetSessao = CredenciaisDeChamada & Pick<SessaoOperador, 'username'>;

/**
 * Query canônica de `GetSessao`, na ordem que o ERP exige.
 *
 * `Empresa` vai na query **além** do cabeçalho (AD-205) e **antes** de `Login`:
 * o `Event GetSessao.Before` recorta o login de `Login=` até o fim da query
 * string, então `Empresa` depois dele entraria no valor recortado e a sessão
 * voltaria zerada (`UsuarioCodigo: "0"`). `URLSearchParams` preserva a ordem de
 * inserção, então a ordem deste objeto é a ordem enviada.
 */
export function queryGetSessao(
  sessao: Pick<SessaoOperador, 'codigoEmpresa' | 'username'>,
): Record<string, string> {
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
 * conseguiu resolver o login (AD-205). Gravar `0` no cookie faria toda NFCe da
 * sessão sair atribuída a um operador que não existe — trilha de auditoria
 * falsa, que é pior que recusar a entrada.
 */
export function extrairUsuarioCodigo(json: unknown): string | null {
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
  return Number.isSafeInteger(codigo) && codigo > 0 ? String(codigo) : null;
}

/**
 * Pergunta ao ERP qual é o `UsuarioCodigo` do login autenticado.
 *
 * Chamada em `/session/start`, entre a troca OAuth e a gravação do cookie —
 * por isso recebe credenciais soltas e não uma `SessaoOperador`: a sessão ainda
 * não existe, e é justamente este valor que falta para montá-la.
 *
 * Sem renovação de token de propósito: o token acabou de ser emitido. Devolve
 * `null` para qualquer desfecho que não seja um código utilizável — ERP fora,
 * resposta não-JSON, login não resolvido —, e quem chama decide o que fazer.
 */
export async function buscarUsuarioCodigo(
  credenciais: CredenciaisGetSessao,
  deps: ChamadaAutenticadaDeps,
): Promise<string | null> {
  const resposta = await chamarErp(
    credenciais,
    { caminho: CAMINHO_GET_SESSAO, query: queryGetSessao(credenciais) },
    deps,
  );

  if (!resposta.ok) {
    // O corpo não vai para lugar nenhum, mas precisa ser consumido: o undici só
    // devolve a conexão ao pool depois disso.
    await resposta.arrayBuffer().catch(() => undefined);
    return null;
  }

  try {
    return extrairUsuarioCodigo(await resposta.json());
  } catch {
    return null;
  }
}
