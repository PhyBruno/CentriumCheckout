/**
 * Texto legível a partir de um campo do ERP que pode chegar em HTML
 * (`NotaFiscal.ErroMensagem`, pendência 50, AD-238).
 *
 * **Não é sanitizador**: o resultado é sempre exibido como texto pelo React, e
 * nunca por `dangerouslySetInnerHTML`. O objetivo é só não mostrar tags cruas ao
 * operador. Por isso a função é pura (sem `DOMParser`) e as entidades são
 * decodificadas **depois** de as tags saírem — um `&lt;img&gt;` vira o texto
 * `<img>`, não um elemento.
 *
 * Só conta como tag `<` seguido de letra (ou `</` + letra): um texto puro como
 * `valor < 10` passa intacto.
 */

const BLOCOS_DESCARTADOS = /<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const TAGS_DE_BLOCO =
  /<\/?(?:div|p|pre|br|li|ul|ol|tr|table|h[1-6]|section|article|header|footer)\b[^>]*>/gi;
const QUALQUER_TAG = /<\/?[a-z][a-z0-9-]*\b[^>]*>/gi;
const ENTIDADE = /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi;

/** Espaço não separável (`&nbsp;`), montado por código para não ir cru no fonte. */
const NBSP = String.fromCharCode(0xa0);
/** Espaço, tab e `&nbsp;`, colapsados num espaço só. */
const ESPACOS = new RegExp(`[ \\t${NBSP}]+`, 'g');

const ENTIDADES_NOMEADAS: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: NBSP,
};

function decodificarEntidade(original: string, corpo: string): string {
  if (corpo.startsWith('#')) {
    const hexadecimal = corpo[1] === 'x' || corpo[1] === 'X';
    const codigo = Number.parseInt(corpo.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
    return Number.isFinite(codigo) && codigo > 0 && codigo <= 0x10ffff
      ? String.fromCodePoint(codigo)
      : original;
  }
  return ENTIDADES_NOMEADAS[corpo.toLowerCase()] ?? original;
}

export function textoSemHtml(valor: string): string {
  const semTags = valor
    .replace(BLOCOS_DESCARTADOS, '')
    .replace(TAGS_DE_BLOCO, '\n')
    .replace(QUALQUER_TAG, '');
  const decodificado = semTags.replace(ENTIDADE, (original, corpo: string) =>
    decodificarEntidade(original, corpo),
  );

  return decodificado
    .split(/\r?\n/)
    .map((linha) => linha.replace(ESPACOS, ' ').trim())
    .filter((linha) => linha !== '')
    .join('\n');
}
