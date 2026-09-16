/**
 * Protocolos que podem virar `href` de um link vindo do ERP (AD-238).
 *
 * Lista de **permissão**, não de bloqueio: `javascript:`, `data:`, `vbscript:`,
 * `file:` e qualquer esquema futuro ficam de fora sem precisar ser nomeados.
 */
const PROTOCOLOS_PERMITIDOS: ReadonlySet<string> = new Set(['https:', 'http:']);

/**
 * `UrlChamadas` (e qualquer outro link que o ERP mande) → URL absoluta
 * normalizada, ou `null` quando não pode ser oferecida ao operador.
 *
 * `new URL()` **sem base**: relativa ou só `//host` não tem origem conhecida e é
 * recusada, em vez de ser resolvida contra o próprio Checkout. Devolve `href`
 * normalizado pelo parser — é ele que vai ao atributo, nunca o texto cru.
 */
export function urlExternaSegura(valor: string | null | undefined): string | null {
  const texto = (valor ?? '').trim();
  if (texto === '') {
    return null;
  }
  try {
    const url = new URL(texto);
    return PROTOCOLOS_PERMITIDOS.has(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
