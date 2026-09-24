import { centavos, type Centavos } from '../domain/precificacao/dinheiro';

const CENTAVOS_POR_REAL = 100;

/**
 * Leitura do número que o operador **digita** num campo de valor, quantidade,
 * desconto ou percentual — a fronteira onde o texto vira número.
 *
 * Mora na camada de entrada, e não no domínio, pelo mesmo motivo que as cópias
 * locais que substitui (`lerCentavos` na barra de produto, `lerCentavosDigitados`
 * no cartão de pagamento, `lerPercentualDigitado` no desconto de capa): o
 * domínio já opera só sobre inteiros, e o que se decide aqui é o que um texto
 * **quer dizer**. As quatro cópias existiam porque cada tarefa tinha escopo
 * fechado; a correção de 2026-09-24 mudou a regra das quatro ao mesmo tempo, e
 * mantê-las separadas seria garantir que a próxima mudança esqueça uma delas.
 *
 * Duas regras de digitação rápida (pedido do usuário, 2026-09-24), valendo em
 * todo campo numérico:
 *
 * - **Separador sem parte inteira vale zero à esquerda:** `,8` é `0,8`. O
 *   operador digita o que fala — "vírgula oito" — e recusar o valor o obrigava
 *   a voltar ao campo só para acrescentar um `0` que não muda nada.
 * - **Campo vazio vale zero.** Sair de um campo apagado é o gesto de quem não
 *   quer valor ali; exigir que ele volte e digite `0` era cobrar uma tecla sem
 *   informação. Onde zero não é aceito (quantidade, preço, valor recebido), a
 *   recusa continua sendo a de quem digitou `0`, com a mesma frase.
 *
 * O separador pode ser `,` ou `.` — o teclado numérico do PDV e o do celular
 * variam —, e um separador solto no fim (`8,`) é lido como `8`: é o instante
 * entre a vírgula e a primeira casa, não um número diferente.
 */
function normalizar(texto: string): string {
  let normalizado = texto.trim().replace(',', '.');
  if (normalizado === '') {
    return '0';
  }
  if (normalizado.startsWith('.')) {
    normalizado = `0${normalizado}`;
  }
  if (normalizado.endsWith('.')) {
    normalizado = normalizado.slice(0, -1);
  }
  return normalizado;
}

/**
 * `"3"`, `"3,5"`, `",5"` ou `""` → `3`, `3.5`, `0.5` ou `0`; texto com letra,
 * sinal ou mais casas que `casasDecimais` vira `null`.
 *
 * O limite de casas é de quem chama, porque é regra do campo: duas no dinheiro,
 * três na quantidade (milésimos), uma no percentual de capa.
 */
export function lerDecimalDigitado(texto: string, casasDecimais: number): number | null {
  const normalizado = normalizar(texto);
  const padrao = new RegExp(`^\\d+(\\.\\d{1,${String(casasDecimais)}})?$`);
  return padrao.test(normalizado) ? Number(normalizado) : null;
}

/** `"12,34"`, `"12.34"`, `",5"` ou `""` → `1234`, `1234`, `50` ou `0` centavos. */
export function lerCentavosDigitados(texto: string): Centavos | null {
  const reais = lerDecimalDigitado(texto, 2);
  return reais === null ? null : centavos(Math.round(reais * CENTAVOS_POR_REAL));
}
