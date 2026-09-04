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
 * dinheiro gera troco, e é `calcularSaldo` quem decide isso).
 *
 * **Três tons, um por significado** (correções do usuário, 2026-09-04):
 * vermelho (`$danger`, o do nó `p58ay`) **só** no "Faltante", porque nesta tela
 * ele significa venda que ainda não fecha; verde (`$up`) no troco **maior que
 * zero**, que é dinheiro a devolver — desfecho que deu certo e ainda pede um
 * gesto; neutro no resto, inclusive no troco zerado. A implementação original
 * pintava os dois desfechos de vermelho, gastando o único sinal de alarme da
 * tela justamente no caso em que está tudo certo.
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
        <MetricaPagamento rotulo="Recebido" valor={totalAplicado} testId="metrica-recebido" />
        {emAberto ? (
          <MetricaPagamento
            rotulo="Faltante"
            valor={saldoRestante}
            testId="metrica-faltante"
            tom="alerta"
          />
        ) : (
          <MetricaPagamento
            rotulo="Troco"
            valor={troco}
            testId="metrica-troco"
            // Verde **só quando há troco de verdade**: é dinheiro na gaveta a
            // devolver, e o verde marca o desfecho que deu certo. Zero volta ao
            // neutro — pintar de verde um troco inexistente anunciaria uma ação
            // que não existe (correção do usuário, 2026-09-04).
            tom={troco > 0 ? 'sucesso' : 'neutro'}
          />
        )}
      </div>
    </section>
  );
}

/**
 * - `neutro` — informação, sem ação pendente (o padrão).
 * - `alerta` — `$danger` do nó `p58ay`, reservado ao saldo que impede a venda
 *   de fechar.
 * - `sucesso` — `$up`, o verde da família semântica já usada nos modais de
 *   desfecho aprovado.
 */
type TomMetrica = 'neutro' | 'alerta' | 'sucesso';

const CLASSE_POR_TOM: Record<TomMetrica, string> = {
  neutro: 'text-[var(--cc-color-on-dark-strong)]',
  alerta: 'text-destructive',
  sucesso: 'text-[var(--cc-color-up)]',
};

interface MetricaPagamentoProps {
  readonly rotulo: string;
  readonly valor: Centavos;
  readonly testId: string;
  readonly tom?: TomMetrica;
}

/** Um dos dois cartões de "Métricas pagamento" (nós `C4iSu`/`pysG9`). */
function MetricaPagamento({
  rotulo,
  valor,
  testId,
  tom = 'neutro',
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
      <span className={cn('font-mono text-[15px] font-semibold tabular-nums', CLASSE_POR_TOM[tom])}>
        {formatarCentavos(valor)}
      </span>
    </div>
  );
}
