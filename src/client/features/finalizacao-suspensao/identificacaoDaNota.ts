/** Número e série de uma NFCe, como o ERP mandou — cada um pode faltar. */
export interface DocumentoDaNota {
  readonly numeroNota: number | null | undefined;
  readonly serieNota: string | null | undefined;
}

/**
 * `NFCe 9001 · série 1`, com o que o ERP tiver mandado — ou `null`.
 *
 * Compartilhado pelos dois diálogos de desfecho do `FaturarNFCe`: o da nota
 * rejeitada (AD-207) e o da nota emitida (AD-238). `0` é o "sem número" do
 * contrato e é omitido — anunciá-lo mandaria o operador procurar uma nota que não
 * existe com esse número no ERP. Série vazia também é omitida.
 */
export function identificacaoDaNota(documento: DocumentoDaNota | undefined): string | null {
  if (documento === undefined) {
    return null;
  }

  const partes: string[] = [];
  const { numeroNota, serieNota } = documento;
  if (numeroNota !== null && numeroNota !== undefined && numeroNota !== 0) {
    partes.push(`NFCe ${String(numeroNota)}`);
  }
  const serie = (serieNota ?? '').trim();
  if (serie !== '') {
    partes.push(`série ${serie}`);
  }

  return partes.length === 0 ? null : partes.join(' · ');
}
