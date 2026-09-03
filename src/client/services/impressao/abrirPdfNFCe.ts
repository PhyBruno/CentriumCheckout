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
 */

/** Tempo de sobrevida da URL: revogar na hora quebraria a aba recém-aberta. */
const MS_ATE_REVOGAR = 60_000;

export interface AberturaPdfDeps {
  readonly abrirJanela?: typeof window.open;
  readonly agendarRevogacao?: (revogar: () => void) => void;
}

export type ResultadoAberturaPdf =
  | { readonly estado: 'aberto' }
  /**
   * O navegador recusou a aba. Acontece quando o `window.open` sai fora da
   * janela de gesto do usuário — é o caso do `TipoImpressao = 'P'`, que abre
   * depois de a resposta do ERP chegar. Não é erro do PDF: o chamador oferece
   * um botão para o operador abrir com um clique de verdade.
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
  const agendarRevogacao =
    deps.agendarRevogacao ??
    ((revogar: () => void) => {
      setTimeout(revogar, MS_ATE_REVOGAR);
    });

  let url: string;
  try {
    url = URL.createObjectURL(blobDoBase64(pdfBase64));
  } catch {
    return { estado: 'pdf-invalido' };
  }

  const janela = abrirJanela(url, '_blank', 'noopener');

  if (janela === null) {
    URL.revokeObjectURL(url);
    return { estado: 'bloqueado-pelo-navegador' };
  }

  agendarRevogacao(() => {
    URL.revokeObjectURL(url);
  });
  return { estado: 'aberto' };
}
