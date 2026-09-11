import { CheckCircle } from 'reicon-react';
import { useEffect, useState, type ReactElement } from 'react';
import { formatarCentavos, type Centavos } from '../../domain/precificacao/dinheiro';

const MS_POR_SEGUNDO = 1_000;

/**
 * Confirmação do pagamento na tela do cliente (feature 015, FR-007/FR-024).
 *
 * **Sem nó no Pencil** — ver o TSDoc de `TelaBoasVindas`. O vocabulário é o do
 * estado aprovado do `ModalPix`: disco verde com o `CheckCircle` do reicon
 * (AD-201 — nunca `lucide`), valor em Geist Mono, badge `$success-soft`.
 *
 * O contador é **visível** de propósito. Uma tela que troca sozinha sem avisar
 * deixa o cliente sem saber se ainda precisa fazer alguma coisa; dizer quantos
 * segundos faltam transforma o desaparecimento em algo esperado. A duração vem
 * por prop porque quem a define é o checkout (research D6), e é o que faz as
 * duas telas voltarem juntas.
 */
export function TelaPagamentoAprovado({
  valor,
  voltaEmMs,
}: {
  readonly valor: Centavos;
  readonly voltaEmMs: number;
}): ReactElement {
  const [restanteMs, setRestanteMs] = useState(voltaEmMs);

  useEffect(() => {
    setRestanteMs(voltaEmMs);
    const tique = setInterval(() => {
      setRestanteMs((anterior) => Math.max(anterior - MS_POR_SEGUNDO, 0));
    }, MS_POR_SEGUNDO);
    return () => {
      clearInterval(tique);
    };
  }, [voltaEmMs]);

  // `ceil`: aos 9,2 s restantes o cliente ainda lê "10", nunca "9" com o
  // primeiro segundo já comido. Quem decide de fato a volta é o `DisplayCliente`
  // — este número só a anuncia.
  const segundos = Math.ceil(restanteMs / MS_POR_SEGUNDO);

  return (
    // Mesma defesa de zoom das outras duas telas do display (AD-217).
    <section
      className="flex h-full w-full flex-col items-center gap-[clamp(0.5rem,2vh,1.5rem)] overflow-hidden px-xl text-center [justify-content:safe_center]"
      data-testid="display-pagamento-aprovado"
    >
      <span className="flex size-[clamp(3.5rem,12vh,7rem)] shrink-0 items-center justify-center rounded-full bg-[var(--cc-color-up-soft)]">
        <CheckCircle
          className="size-[clamp(2rem,7vh,4rem)] text-[var(--cc-color-up)]"
          aria-hidden="true"
        />
      </span>

      <h1
        className="text-[clamp(1.25rem,4.5vh,2.25rem)] leading-[1.15] font-semibold text-foreground"
        role="status"
      >
        Pagamento confirmado
      </h1>

      <div className="flex shrink-0 flex-col items-center gap-xxs rounded-[20px] bg-[var(--cc-color-surface-dark)] px-[clamp(1rem,4vh,2rem)] py-[clamp(0.25rem,1.2vh,1rem)]">
        <span className="text-[clamp(0.75rem,1.8vh,1.125rem)] text-[var(--cc-color-on-dark-muted)]">
          Valor pago
        </span>
        <span
          className="font-mono text-[clamp(1.5rem,5.5vh,4rem)] leading-[1.05] font-semibold tabular-nums text-[var(--cc-color-on-primary)]"
          data-testid="display-valor-pago"
        >
          {formatarCentavos(valor)}
        </span>
      </div>

      <p className="text-[clamp(0.875rem,2.2vh,1.25rem)] leading-[1.3] text-muted-foreground">
        Obrigado! Esta tela volta em{' '}
        <span className="font-mono font-semibold tabular-nums" data-testid="display-contador">
          {segundos}
        </span>
        s
      </p>
    </section>
  );
}
