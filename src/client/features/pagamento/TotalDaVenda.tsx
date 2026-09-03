import type { ReactElement } from 'react';
import { cn } from '@/lib/utils';
import { formatarCentavos } from '../../domain/precificacao/dinheiro';
import type { Centavos } from '../../domain/precificacao/dinheiro';
import { useVendaStore } from '../../stores/vendaStore';

/**
 * Bloco escuro "Total da venda" do cartão de pagamento — réplica do nó `LcGwh`
 * do Pencil (`design/HTML - Pencil/CentriumCheckout.html`, linhas 2925–3002),
 * filho do cartão "Pagamento e totais" (`OzP7o`).
 *
 * Estrutura do nó: coluna de 360px, fundo `$surface-dark`, raio 20,
 * `padding: 14px`, `gap: 8px`. Dentro dela, "Linha total" (`XOhWa`) com o rótulo
 * "Total a pagar" (Inter 13/600 em `#DDE3EA`, `HBR0z`) e a moeda "BRL" (Geist
 * Mono 12/600 em `#8E99A8`, `X227y`); o "Valor total" (`Gbx9F`) em Geist Mono
 * 32/600, `line-height` 34, branco; e "Métricas pagamento" (`ZwhZ1`, row, gap 8)
 * com dois cartões `flex: 1` de fundo `$surface-dark-elevated`, raio 14,
 * `padding: 9px`, `gap: 4px` — rótulo Inter 12/**400** em `#8E99A8` e valor
 * Geist Mono 15/600 (`C4iSu`/`Hk9A7`/`VgwEQ` e `pysG9`/`I8ZFCW`/`p58ay`).
 *
 * **Nenhum cálculo mora aqui.** Total líquido, recebido, saldo restante e troco
 * saem inteiros de `saldo()` — o seletor puro do slice, que por sua vez chama
 * `calcularSaldo` (`domain/pagamento/saldoPagamento.ts`). Este componente só
 * escolhe qual das duas faces do segundo cartão mostrar e formata os `Centavos`.
 *
 * **Uma decisão sem nó correspondente**: o desenho modela um único instante — o
 * segundo cartão aparece rotulado "Faltante", com o saldo em aberto. O nó,
 * porém, se chama "Métrica Troco", e a venda tem os dois desfechos. O cartão
 * exibe portanto a face que existe no momento: "Faltante" com o saldo restante
 * enquanto houver saldo, "Troco" com o troco depois de coberto (`FR-012`: só
 * dinheiro gera troco, e é `calcularSaldo` quem decide isso). A cor `$danger` do
 * nó `p58ay` vale para as duas: nos dois casos há um valor pendente de ação do
 * operador — cobrar o restante ou devolver o troco.
 */
export function TotalDaVenda(): ReactElement {
  // Um seletor por campo, em vez de um `estado.saldo()` só: `saldo()` monta um
  // objeto novo a cada chamada, e devolvê-lo inteiro daria uma referência
  // diferente por render — o Zustand v5 leria isso como mudança e o componente
  // entraria em laço. Cada campo é um primitivo, comparado por valor.
  const totalLiquido = useVendaStore((estado) => estado.saldo().totalLiquido);
  const totalAplicado = useVendaStore((estado) => estado.saldo().totalAplicado);
  const saldoRestante = useVendaStore((estado) => estado.saldo().saldoRestante);
  const troco = useVendaStore((estado) => estado.saldo().troco);

  const emAberto = saldoRestante > 0;

  return (
    <section
      className="flex w-full flex-col gap-xs rounded-[20px] bg-[var(--cc-color-surface-dark)] p-[14px]"
      data-testid="total-da-venda"
    >
      <div className="flex w-full items-center justify-between">
        <span className="text-base font-semibold text-[var(--cc-color-on-dark-strong)]">
          Total a pagar
        </span>
        {/* "BRL" é Geist Mono no nó `X227y` — é uma etiqueta de moeda, e no
            vocabulário desta base todo dado tabular/monetário é mono. */}
        <span className="font-mono text-sm font-semibold text-[var(--cc-color-on-dark-muted)]">
          BRL
        </span>
      </div>

      <p
        className="font-mono text-2xl leading-[34px] font-semibold tabular-nums text-[var(--cc-color-on-dark)]"
        data-testid="total-a-pagar"
      >
        {formatarCentavos(totalLiquido)}
      </p>

      <div className="flex w-full items-start gap-xs">
        <MetricaPagamento
          rotulo="Recebido"
          valor={totalAplicado}
          testId="metrica-recebido"
          destacado={false}
        />
        {emAberto ? (
          <MetricaPagamento
            rotulo="Faltante"
            valor={saldoRestante}
            testId="metrica-faltante"
            destacado
          />
        ) : (
          <MetricaPagamento rotulo="Troco" valor={troco} testId="metrica-troco" destacado />
        )}
      </div>
    </section>
  );
}

interface MetricaPagamentoProps {
  readonly rotulo: string;
  readonly valor: Centavos;
  readonly testId: string;
  /** `$danger` do nó `p58ay` — o valor que ainda pede ação do operador. */
  readonly destacado: boolean;
}

/** Um dos dois cartões de "Métricas pagamento" (nós `C4iSu`/`pysG9`). */
function MetricaPagamento({
  rotulo,
  valor,
  testId,
  destacado,
}: MetricaPagamentoProps): ReactElement {
  return (
    <div
      className="flex flex-1 flex-col items-start gap-xxs rounded-[14px] bg-[var(--cc-color-surface-dark-elevated)] p-[9px]"
      data-testid={testId}
    >
      {/* Peso 400, não 600: os rótulos das métricas são o único texto leve do
          bloco (nós `Hk9A7`/`I8ZFCW`) — é o que faz o valor logo abaixo
          dominar a leitura. */}
      <span className="text-sm font-normal text-[var(--cc-color-on-dark-muted)]">{rotulo}</span>
      <span
        className={cn(
          'font-mono text-[15px] font-semibold tabular-nums',
          destacado ? 'text-destructive' : 'text-[var(--cc-color-on-dark-strong)]',
        )}
      >
        {formatarCentavos(valor)}
      </span>
    </div>
  );
}
