/**
 * Normalização de `ETag` / `If-None-Match` (FR-008, AD-045).
 *
 * O valor trafega entre BFF e SPA sempre entre aspas, e um proxy no caminho
 * pode marcá-lo como fraco (`W/"..."`). Os dois lados precisam comparar o mesmo
 * texto cru para decidir o `304`, por isso a normalização vive em
 * `src/shared/` — ao lado de `versionHash.ts`, que produz o valor comparado.
 */

/** Devolve o hash cru: sem espaços em volta, sem prefixo `W/` e sem aspas. */
export function normalizarEtag(etag: string | null): string | null {
  if (etag === null) {
    return null;
  }
  return etag.trim().replace(/^W\//, '').replace(/^"|"$/g, '');
}
