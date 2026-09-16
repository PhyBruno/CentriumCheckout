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

/** Rascunho no ERP, como o operador o procura lá. */
export interface RascunhoDaVenda {
  readonly numeroRascunho: number | null | undefined;
  readonly serieRascunho: string | null | undefined;
}

/**
 * `Rascunho 6037 · série R01` — ou `null` quando o ERP não informou nenhum dos
 * dois (AD-239).
 *
 * Separado de `identificacaoDaNota` porque nomeia outro documento: a **nota
 * fiscal** só existe quando autorizada, e na rejeição ela volta zerada. O que
 * sobrevive à recusa, e é o que o operador digita na busca do ERP, é o rascunho.
 */
export function identificacaoDoRascunho(rascunho: RascunhoDaVenda | undefined): string | null {
  const numero = rascunho?.numeroRascunho;
  // **O número manda**: série sozinha não identifica documento nenhum — a série
  // do PDV acompanha todas as notas, e anunciá-la sem número mandaria o operador
  // procurar no ERP por um dado que não filtra nada.
  if (numero === null || numero === undefined || numero === 0) {
    return null;
  }

  const serie = (rascunho?.serieRascunho ?? '').trim();
  const rotulo = `Rascunho ${String(numero)}`;
  return serie === '' ? rotulo : `${rotulo} · série ${serie}`;
}
