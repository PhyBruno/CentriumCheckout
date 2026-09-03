/**
 * Modo de operação da NFCe, exibido na barra superior.
 *
 * A fonte é `GET /ApiCentriumOAuth/GetStatusSistema` — o mesmo polling que a
 * feature 004 já usa para "detectar contingência do ERP" (`FR-013`, AD-088).
 * O endpoint devolve um inteiro puro com semântica de limiar: `0` significa
 * que nada mudou desde a última captura de `GetSessao` (a máquina segue
 * emitindo normalmente) e qualquer valor `>= 1` significa que o estado mudou —
 * é a condição que obriga o Checkout a rechamar `GetSessao` e é o que o
 * operador vê como contingência.
 */
export type StatusOperacaoNFCe = 'ONLINE' | 'CONTINGENCIA' | 'DESCONHECIDO';

/** `null` = ainda não houve leitura (ou a última falhou); não é "online". */
export function interpretarStatusSistema(valor: number | null): StatusOperacaoNFCe {
  if (valor === null) {
    return 'DESCONHECIDO';
  }
  return valor === 0 ? 'ONLINE' : 'CONTINGENCIA';
}

/** Rótulo da pílula, como no nó `swUNN` do Pencil. */
export function rotularStatusOperacao(status: StatusOperacaoNFCe): string {
  switch (status) {
    case 'ONLINE':
      return 'Online';
    case 'CONTINGENCIA':
      return 'Contingência';
    case 'DESCONHECIDO':
      return 'Verificando…';
  }
}
