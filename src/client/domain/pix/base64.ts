/**
 * Decodificação de base64 na fronteira do PIX (pedido do usuário, 2026-09-04).
 *
 * Domínio puro, sem rede e sem React: são três funções que respondem a uma
 * pergunta só — "o ERP mandou isto codificado, e o quê exatamente?". Moram aqui,
 * e não dentro de `pixMapper.ts`, porque a decisão de **quando** decodificar é
 * regra de fronteira testável isoladamente, e porque o mapper deve continuar
 * fazendo uma coisa só: adaptar a resposta à forma do domínio.
 *
 * ---
 *
 * ### Por que "decodifica se for base64", e não "decodifica sempre"
 *
 * `Trnbase64text` é, no ERP atual, `ToBase64(&TrnPixCopiaECola)`. Mas o nome do
 * campo é uma promessa do contrato, não um fato verificável a cada resposta: um
 * ERP mais novo (ou um ambiente de homologação) pode passar a devolver o "copia
 * e cola" já em texto puro. `atob` sobre texto puro ou lança (`InvalidCharacter`)
 * ou — pior — devolve bytes sem sentido que o operador copiaria para o app do
 * banco. Por isso a ordem é: **valida primeiro, decodifica só se for**, e
 * repassa o dado intacto quando não for (instrução literal do usuário no item 6).
 *
 * ### Por que a validação não é só `try { atob() }`
 *
 * `atob` aceita entradas que não são base64 de verdade — ignora espaços e aceita
 * comprimentos que não são múltiplos de 4 em vários motores. Um "copia e cola"
 * BR Code é composto de dígitos e letras, então uma verificação frouxa poderia
 * classificá-lo como base64 e devolver lixo binário no lugar do payload. A
 * validação aqui exige o alfabeto exato, o preenchimento correto e — por último
 * — que o **resultado** seja texto legível. Um BR Code real contém `.` e `*`
 * (`BR.GOV.BCB.PIX`, `***`), que não pertencem ao alfabeto e já o reprovam; a
 * checagem de legibilidade cobre o caso de um payload que, por coincidência de
 * comprimento e alfabeto, passasse pelas duas primeiras.
 */

/** Alfabeto base64 padrão (RFC 4648), com o preenchimento no fim. */
const ALFABETO_BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/** Menor código que não é caractere de controle (espaço). */
const PRIMEIRO_CODIGO_IMPRIMIVEL = 32;

/**
 * Controles tolerados: tabulação, LF e CR.
 *
 * São os únicos que aparecem legitimamente em texto; reprová-los faria uma
 * decodificação correta ser descartada. A verificação é feita por código de
 * caractere, e não por regex, para o arquivo não precisar carregar bytes de
 * controle literais no fonte.
 */
const CONTROLES_TOLERADOS: ReadonlySet<number> = new Set([9, 10, 13]);

/**
 * Assinaturas base64 dos formatos de imagem que o ERP pode devolver.
 *
 * O prefixo em base64 corresponde aos primeiros bytes ("magic number") de cada
 * formato — o de PNG codifica a sequência `89 50 4E 47 0D 0A 1A 0A`, o de JPEG
 * codifica `FF D8 FF`, e assim por diante. Comparar no próprio base64 evita
 * decodificar a imagem inteira só para ler quatro bytes.
 */
const ASSINATURAS_DE_IMAGEM: readonly (readonly [string, string])[] = [
  ['iVBORw0KGgo', 'image/png'],
  ['/9j/', 'image/jpeg'],
  ['R0lGOD', 'image/gif'],
  ['UklGR', 'image/webp'],
  ['PHN2Zw', 'image/svg+xml'],
  ['PD94bWw', 'image/svg+xml'],
  ['Qk0', 'image/bmp'],
];

/**
 * `image/jpeg` continua sendo o palpite de último recurso porque é o que o
 * contrato do ERP documenta (`.specs/features/pagamento-pix/spec.md`, AD-087).
 * Ele só é usado quando nenhuma assinatura casa — antes desta função, era o
 * tipo declarado para **toda** imagem, inclusive os PNG que o
 * `PGetBarCodeImage` do ERP produz.
 */
const TIPO_DE_IMAGEM_PADRAO = 'image/jpeg';

function ehTextoLegivel(valor: string): boolean {
  for (let indice = 0; indice < valor.length; indice += 1) {
    const codigo = valor.charCodeAt(indice);
    if (codigo < PRIMEIRO_CODIGO_IMPRIMIVEL && !CONTROLES_TOLERADOS.has(codigo)) {
      return false;
    }
  }
  return true;
}

export function ehBase64(valor: string): boolean {
  if (valor === '' || valor.length % 4 !== 0) {
    return false;
  }
  if (!ALFABETO_BASE64.test(valor)) {
    return false;
  }
  try {
    atob(valor);
    return true;
  } catch {
    return false;
  }
}

/**
 * Devolve o texto decodificado quando a entrada é base64 de texto legível; caso
 * contrário devolve a entrada **intacta**.
 *
 * Nunca lança e nunca devolve string vazia por falha: um "copia e cola" ausente
 * é problema do ERP, mas um "copia e cola" apagado pelo Checkout tiraria do
 * operador o único meio de cobrar quando o cliente não consegue ler o QR Code.
 */
export function decodificarSeBase64(valor: string): string {
  if (!ehBase64(valor)) {
    return valor;
  }
  const decodificado = atob(valor);
  return ehTextoLegivel(decodificado) ? decodificado : valor;
}

/**
 * Monta a `data:` URL de uma imagem recebida em base64, com o **tipo real**
 * detectado a partir dos primeiros bytes.
 *
 * Antes disto o modal declarava `data:image/jpeg;base64,…` para qualquer
 * conteúdo. O navegador costuma tolerar o tipo errado, mas "costuma" não é
 * contrato: um PNG anunciado como JPEG é recusado por navegadores em modo
 * estrito e por qualquer conversão para PDF do comprovante — e o QR Code é a
 * única coisa na tela que o cliente precisa enxergar.
 *
 * Uma string que **já** é uma `data:` URL volta como está: se o ERP um dia
 * passar a entregar a URL pronta, prefixá-la de novo produziria uma URL
 * inválida.
 */
export function fonteDeImagemBase64(valor: string): string {
  const limpo = valor.trim();
  if (limpo === '') {
    return '';
  }
  if (limpo.startsWith('data:')) {
    return limpo;
  }

  // Quebras de linha são legais em base64 transportado por MIME e ilegais dentro
  // de uma `data:` URL.
  const semQuebras = limpo.replace(/\s+/g, '');
  const tipo =
    ASSINATURAS_DE_IMAGEM.find(([prefixo]) => semQuebras.startsWith(prefixo))?.[1] ??
    TIPO_DE_IMAGEM_PADRAO;

  return `data:${tipo};base64,${semQuebras}`;
}
