/**
 * Abre o PDF da NFCe numa aba nova (pedido do usuário, 2026-09-02).
 *
 * **Nunca baixa o arquivo.** O operador de caixa precisa conferir o cupom na
 * hora, não acumular arquivos na pasta de downloads do PDV — que é
 * compartilhado entre turnos.
 *
 * O PDF vira `Blob` + `blob:` URL em vez de ir direto como `data:` URI porque
 * o Chrome **bloqueia navegação de topo para `data:`** (proteção contra
 * phishing): `window.open('data:application/pdf;base64,…')` abre uma aba em
 * branco e falha em silêncio.
 *
 * **Um PDF, um link** (correção do usuário, 2026-09-24, AD-254). Quando o
 * navegador recusa a aba, ele próprio oferece o link recusado no aviso de
 * pop-up bloqueado — e o modal oferece o botão "Abrir o PDF em outra aba".
 * Antes, a URL era revogada no instante da recusa, então o link do aviso já
 * nascia morto; e cada clique no botão criava **outra** URL. Agora a URL do
 * documento é criada uma vez e reaproveitada por todas as tentativas: os dois
 * caminhos abrem o mesmo endereço, e os dois funcionam.
 *
 * **Revogada só quando outro PDF a substitui.** Revogar por prazo (60s, até
 * então) matava o link de quem demorou a clicar no aviso; nunca revogar
 * acumularia um PDF por venda na memória da aba durante o turno inteiro.
 * Manter só o último cobre o caso real — o operador abrindo o cupom da venda
 * que acabou de fechar — com um arquivo só na memória.
 */

export interface AberturaPdfDeps {
  readonly abrirJanela?: typeof window.open;
}

/** O PDF cujo link está valendo — ver "Um PDF, um link" no cabeçalho. */
let vigente: { readonly base64: string; readonly url: string } | null = null;

/**
 * Revoga o link do PDF vigente. Chamado quando outro PDF o substitui; exportado
 * para o teste começar cada caso sem link herdado do anterior.
 */
export function descartarPdfVigente(): void {
  if (vigente !== null) {
    URL.revokeObjectURL(vigente.url);
    vigente = null;
  }
}

/** A URL do documento: a mesma de antes quando o PDF é o mesmo. Lança se o base64 não decodifica. */
function urlDoPdf(pdfBase64: string): string {
  if (vigente?.base64 === pdfBase64) {
    return vigente.url;
  }
  const url = URL.createObjectURL(blobDoBase64(pdfBase64));
  descartarPdfVigente();
  vigente = { base64: pdfBase64, url };
  return url;
}

export type ResultadoAberturaPdf =
  | { readonly estado: 'aberto' }
  /**
   * O navegador recusou a aba — `window.open` devolveu `null` de verdade.
   * Acontece quando a chamada sai fora da janela de gesto do usuário, que é o
   * caso do `TipoImpressao = 'P'`: abre depois de a resposta do ERP chegar. Não
   * é erro do PDF, e o chamador oferece um botão para o operador abrir com um
   * clique de verdade.
   */
  | { readonly estado: 'bloqueado-pelo-navegador' }
  /** Base64 corrompido — o ERP mandou algo que não é um PDF. */
  | { readonly estado: 'pdf-invalido' };

function blobDoBase64(base64: string): Blob {
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) {
    bytes[i] = binario.charCodeAt(i);
  }
  return new Blob([bytes], { type: 'application/pdf' });
}

export function abrirPdfNFCe(pdfBase64: string, deps: AberturaPdfDeps = {}): ResultadoAberturaPdf {
  const abrirJanela = deps.abrirJanela ?? window.open.bind(window);

  let url: string;
  try {
    url = urlDoPdf(pdfBase64);
  } catch {
    return { estado: 'pdf-invalido' };
  }

  /**
   * **Sem `noopener` nas features** (correção do usuário, 2026-09-17, AD-247).
   *
   * Com ele, a especificação do HTML manda o `window.open` devolver `null`
   * **sempre** — a aba abria e mesmo assim o retorno dizia `null`, então todo
   * PDF aberto era anunciado como "O navegador bloqueou a aba do PDF", e a URL
   * do blob ainda era revogada na hora, podendo esvaziar a aba recém-aberta.
   * Sem `noopener`, `null` volta a significar só uma coisa: pop-up recusado.
   *
   * A proteção que o `noopener` dava é refeita à mão logo abaixo
   * (`janela.opener = null`), e o destino aqui é um `blob:` da própria origem —
   * conteúdo que este código acabou de gerar, não uma página de terceiro.
   */
  const janela = abrirJanela(url, '_blank');

  // Recusada, a URL **fica viva**: é ela que o aviso de pop-up bloqueado do
  // navegador oferece, e é ela que o botão do modal vai abrir.
  if (janela === null) {
    return { estado: 'bloqueado-pelo-navegador' };
  }

  // Equivalente ao que `noopener` faria, sem custar o retorno da chamada.
  // `try`: um navegador pode recusar a escrita em janela de outra origem.
  try {
    janela.opener = null;
  } catch {
    /* a aba abriu, que é o que importa para o desfecho */
  }

  return { estado: 'aberto' };
}
