/**
 * Data/hora que o ERP devolve **em UTC**, convertida para o fuso do navegador
 * (AD-258).
 *
 * `GetListaNFCes.Emissao` chega como `2026-09-29T19:30:30` — ISO 8601 **sem**
 * sufixo de fuso, mas gravado em UTC (informado pelo usuário em 2026-10-01: a
 * janela de recuperação mostrava a emissão 3h à frente do horário de Brasília).
 * Ler o texto cru, como se fazia, exibia o relógio de Greenwich ao operador.
 *
 * O destino é o fuso **do navegador**, e não um `-03:00` fixo: o Checkout roda
 * em PDV de qualquer estado, e Brasil tem quatro fusos (e já teve horário de
 * verão). `getHours()` e companhia aplicam o fuso da máquina do caixa, que é a
 * hora que o operador tem na parede.
 *
 * Um texto que já traga fuso (`Z` ou `±hh:mm`) é respeitado como veio; um texto
 * fora do formato volta cru na data, sem hora — o Checkout não esconde o que o
 * ERP mandou (Constitution III).
 */

/** `YYYY-MM-DDTHH:mm[:ss[.fff]]`, com fuso opcional no fim. */
const ISO_DATA_HORA =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;

export interface DataHoraLocal {
  /** `DD/MM/AAAA` no fuso do navegador. */
  readonly data: string;
  /** `HH:mm` no fuso do navegador; `''` quando o texto não pôde ser lido. */
  readonly hora: string;
}

function doisDigitos(valor: number): string {
  return String(valor).padStart(2, '0');
}

function instanteDe(iso: string): Date | null {
  const partes = ISO_DATA_HORA.exec(iso.trim());
  if (partes === null) {
    return null;
  }
  const [, ano, mes, dia, hora, minuto, segundo = '0', fuso] = partes;
  const instante =
    fuso === undefined
      ? new Date(
          Date.UTC(
            Number(ano),
            Number(mes) - 1,
            Number(dia),
            Number(hora),
            Number(minuto),
            Number(segundo),
          ),
        )
      : new Date(iso.trim());
  return Number.isNaN(instante.getTime()) ? null : instante;
}

export function dataHoraUtcParaLocal(iso: string): DataHoraLocal {
  const instante = instanteDe(iso);
  if (instante === null) {
    return { data: iso, hora: '' };
  }
  return {
    data: `${doisDigitos(instante.getDate())}/${doisDigitos(instante.getMonth() + 1)}/${String(instante.getFullYear())}`,
    hora: `${doisDigitos(instante.getHours())}:${doisDigitos(instante.getMinutes())}`,
  };
}
