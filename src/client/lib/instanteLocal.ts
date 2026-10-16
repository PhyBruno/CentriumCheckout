/**
 * O instante dado no **fuso do navegador**, em ISO 8601 com milissegundos e o
 * deslocamento explícito — `2026-10-16T10:23:45.123-03:00` (pedido do usuário,
 * 2026-10-16: "Log tem que ser no horário do navegador").
 *
 * Existe porque `toISOString()` sempre escreve em UTC (`…T13:23:45.123Z`): quem
 * lia o `Log` da venda no ERP via a hora de Greenwich e precisava descontar o
 * fuso de cabeça para casar o evento com o relógio do caixa. Aqui a parte de
 * data/hora é a da parede do PDV, e o sufixo `±hh:mm` mantém o texto um
 * instante absoluto — `new Date(texto)` devolve o mesmo momento que
 * `toISOString()` devolveria, então nada que compare ou ordene instantes perde
 * precisão.
 *
 * Mesmo motivo de `dataHoraUtc.ts` para seguir o fuso **da máquina**, e não um
 * `-03:00` fixo: o Brasil tem quatro fusos, e o PDV pode estar em qualquer um.
 */

function doisDigitos(valor: number): string {
  return String(valor).padStart(2, '0');
}

/** `-180` (UTC−3, como `getTimezoneOffset` o devolve) → `-03:00`. */
function deslocamento(minutosAOesteDeUtc: number): string {
  const minutosALeste = -minutosAOesteDeUtc;
  const sinal = minutosALeste >= 0 ? '+' : '-';
  const absoluto = Math.abs(minutosALeste);
  return `${sinal}${doisDigitos(Math.floor(absoluto / 60))}:${doisDigitos(absoluto % 60)}`;
}

export function instanteLocalIso(instante: Date = new Date()): string {
  const data = `${String(instante.getFullYear())}-${doisDigitos(instante.getMonth() + 1)}-${doisDigitos(instante.getDate())}`;
  const hora = `${doisDigitos(instante.getHours())}:${doisDigitos(instante.getMinutes())}:${doisDigitos(instante.getSeconds())}`;
  const milissegundos = String(instante.getMilliseconds()).padStart(3, '0');
  return `${data}T${hora}.${milissegundos}${deslocamento(instante.getTimezoneOffset())}`;
}
