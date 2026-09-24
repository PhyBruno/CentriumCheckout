import { isoLocal, isoRelativoAHoje } from '@/components/ui/campo-data';

/**
 * Período de emissão pré-aplicado ao abrir as duas janelas de importação —
 * DAV (006, pedido do usuário de 2026-09-03) e NFCe (011, AD-237): dos últimos
 * 7 dias até hoje.
 *
 * Um módulo só para as duas janelas, para que não divirjam no número de dias.
 *
 * O teto é o **dia** de hoje, não um instante: `Datainicial`/`Datafinal` são
 * `format: date` no contrato (`YYYY-MM-DD`), então "hoje" já inclui tudo o que
 * foi emitido até as 23:59 — não há horário a enviar nem a exibir.
 *
 * Quem abre a janela recalcula a cada abertura, não só na montagem: o Checkout
 * fica aberto o turno inteiro, e uma janela montada ontem ofereceria o período
 * de ontem.
 */
export const DIAS_DO_PERIODO_PADRAO = 7;

export interface PeriodoDeBusca {
  /** `YYYY-MM-DD`. */
  readonly inicial: string;
  /** `YYYY-MM-DD`. */
  readonly final: string;
}

export function periodoPadrao(hoje: Date = new Date()): PeriodoDeBusca {
  return {
    inicial: isoRelativoAHoje(-DIAS_DO_PERIODO_PADRAO, hoje),
    final: isoRelativoAHoje(0, hoje),
  };
}

/**
 * **O período nunca passa de um ano** (pedido do usuário, 2026-09-24: "tem que
 * limitar a um ano sempre, não pode selecionar mais que isso"). Vale para as
 * duas janelas, pelo mesmo motivo de `periodoPadrao` morar aqui.
 *
 * Um ano vai do dia até o **mesmo dia** do ano vizinho, inclusive: de
 * 24/09/2025 a 24/09/2026 é permitido, e 23/09/2025 já passa. Quem limita é
 * cada campo, a partir da outra data: a inicial não recua mais que um ano
 * antes da final, e a final não avança mais que um ano depois da inicial.
 */
export const MOTIVO_PERIODO_MAIOR_QUE_UM_ANO = 'O período de busca é de no máximo um ano.';

/** Data mais antiga que a inicial pode ter, dada a final; `undefined` sem data válida. */
export function umAnoAntes(iso: string): string | undefined {
  return deslocarUmAno(iso, -1);
}

/** Data mais recente que a final pode ter, dada a inicial; `undefined` sem data válida. */
export function umAnoDepois(iso: string): string | undefined {
  return deslocarUmAno(iso, 1);
}

/**
 * O mesmo dia no ano vizinho. 29 de fevereiro vira 28 no ano que não o tem:
 * o `Date` levaria para 1º de março em silêncio, e o limite passaria um dia.
 */
function deslocarUmAno(iso: string, anos: 1 | -1): string | undefined {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (partes === null) {
    return undefined;
  }
  const ano = Number(partes[1]);
  const mes = Number(partes[2]);
  const dia = Number(partes[3]);
  const original = new Date(ano, mes - 1, dia);
  if (original.getMonth() !== mes - 1 || original.getDate() !== dia) {
    return undefined;
  }

  const ultimoDiaDoMes = new Date(ano + anos, mes, 0).getDate();
  return isoLocal(new Date(ano + anos, mes - 1, Math.min(dia, ultimoDiaDoMes)));
}
