/**
 * Hash de versão do payload de bootstrap (FR-008, AD-045).
 *
 * Calculado **localmente pelo Checkout** — o `GetSessao` do ERP não devolve
 * campo de versão (AD-045). Serve só para decidir se o payload mudou desde o
 * último carregamento; não é um mecanismo de segurança.
 *
 * A mesma função roda no BFF (para responder `304`) e no Web Worker da SPA
 * (para decidir reuso do registro no Dexie) — precisa ser idêntica nos dois
 * lados, por isso vive em `src/shared/`.
 */

/**
 * Serializa de forma canônica: chaves de objeto em ordem alfabética, para que
 * duas respostas equivalentes com ordem de campos diferente gerem o mesmo hash.
 */
function serializarCanonico(valor: unknown): string {
  if (valor === null || typeof valor !== 'object') {
    return JSON.stringify(valor) ?? 'null';
  }

  if (Array.isArray(valor)) {
    return `[${valor.map(serializarCanonico).join(',')}]`;
  }

  const registro = valor as Record<string, unknown>;
  const partes = Object.keys(registro)
    .sort()
    .map((chave) => `${JSON.stringify(chave)}:${serializarCanonico(registro[chave])}`);

  return `{${partes.join(',')}}`;
}

const FNV_OFFSET_BASIS_32 = 0x811c9dc5;
const FNV_PRIME_32 = 0x01000193;

/** FNV-1a de 32 bits — barato o bastante para ~5MB dentro do worker. */
function fnv1a32(texto: string): number {
  let hash = FNV_OFFSET_BASIS_32;
  for (let i = 0; i < texto.length; i += 1) {
    hash ^= texto.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME_32);
  }
  return hash >>> 0;
}

/**
 * Devolve o hash de versão do payload.
 *
 * Combina dois FNV-1a (direto e sobre a string invertida em blocos) para
 * reduzir colisão em payloads grandes e parecidos, mantendo custo linear.
 */
export function calcularVersionHash(payload: unknown): string {
  const canonico = serializarCanonico(payload);
  const direto = fnv1a32(canonico);
  const alternado = fnv1a32(
    `${canonico.length}:${canonico.slice(-4096)}:${canonico.slice(0, 4096)}`,
  );

  return `${direto.toString(16).padStart(8, '0')}${alternado.toString(16).padStart(8, '0')}`;
}
