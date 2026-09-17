import { isoRelativoAHoje } from '@/components/ui/campo-data';

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
