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
 *
 * As tags saem num **varredura única da esquerda para a direita**, nunca por
 * `String.replace` global: um `replace` reexamina o texto já produzido, então
 * `<scr<script>ipt>` viraria `<script>` — resíduo que a varredura não pode
 * formar, porque o que já foi emitido nunca volta a ser lido.
 */

/** Tag de abertura de um bloco cujo conteúdo inteiro é descartado. */
const ABERTURA_DESCARTADA = /^<(script|style)\b[^>]*>/i;
/** Qualquer tag: `<` (ou `</`) seguido de letra. */
const TAG = /^<\/?([a-z][a-z0-9-]*)\b[^>]*>/i;
/** Tags que viram quebra de linha; as demais somem sem deixar separador. */
const TAGS_DE_BLOCO: ReadonlySet<string> = new Set([
  'div',
  'p',
  'pre',
  'br',
  'li',
  'ul',
  'ol',
  'tr',
  'table',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'section',
  'article',
  'header',
  'footer',
]);
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

/**
 * Posição logo depois do fechamento de `nome` a partir de `inicio`; o fim do
 * texto quando o fechamento não existe — um `<script>` sem `</script>` engole o
 * resto, em vez de devolver o conteúdo do bloco ao operador.
 */
function fimDoBlocoDescartado(valor: string, nome: string, inicio: number): number {
  const fechamento = new RegExp(`</${nome}\\s*>`, 'i').exec(valor.slice(inicio));
  return fechamento === null ? valor.length : inicio + fechamento.index + fechamento[0].length;
}

/** Remove as tags numa varredura só: nada do que é emitido volta a ser lido. */
function removerTags(valor: string): string {
  const partes: string[] = [];
  let posicao = 0;

  while (posicao < valor.length) {
    const abertura = valor.indexOf('<', posicao);
    if (abertura === -1) {
      partes.push(valor.slice(posicao));
      break;
    }
    if (abertura > posicao) partes.push(valor.slice(posicao, abertura));

    const restante = valor.slice(abertura);
    const descartada = ABERTURA_DESCARTADA.exec(restante);
    if (descartada !== null) {
      const nome = descartada[1] ?? '';
      posicao = fimDoBlocoDescartado(valor, nome, abertura + descartada[0].length);
      continue;
    }

    const tag = TAG.exec(restante);
    if (tag !== null) {
      if (TAGS_DE_BLOCO.has((tag[1] ?? '').toLowerCase())) partes.push('\n');
      posicao = abertura + tag[0].length;
      continue;
    }

    partes.push('<');
    posicao = abertura + 1;
  }

  return partes.join('');
}

export function textoSemHtml(valor: string): string {
  const decodificado = removerTags(valor).replace(ENTIDADE, (original, corpo: string) =>
    decodificarEntidade(original, corpo),
  );

  return decodificado
    .split(/\r?\n/)
    .map((linha) => linha.replace(ESPACOS, ' ').trim())
    .filter((linha) => linha !== '')
    .join('\n');
}
