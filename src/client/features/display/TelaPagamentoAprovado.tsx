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
    <section
      className="flex h-full w-full flex-col items-center justify-center gap-md px-xl text-center"
      data-testid="display-pagamento-aprovado"
    >
      <span className="flex size-28 items-center justify-center rounded-full bg-[var(--cc-color-up-soft)]">
        <CheckCircle className="size-16 text-[var(--cc-color-up)]" aria-hidden="true" />
      </span>

      <h1 className="text-4xl leading-[1.15] font-semibold text-foreground" role="status">
        Pagamento confirmado
      </h1>

      <div className="flex flex-col items-center gap-xxs rounded-[20px] bg-[var(--cc-color-surface-dark)] px-xl py-base">
        <span className="text-lg text-[var(--cc-color-on-dark-muted)]">Valor pago</span>
        <span
          className="font-mono text-[clamp(2.5rem,6vh,4rem)] leading-[1.05] font-semibold tabular-nums text-[var(--cc-color-on-primary)]"
          data-testid="display-valor-pago"
        >
          {formatarCentavos(valor)}
        </span>
      </div>

      <p className="text-xl leading-[1.3] text-muted-foreground">
        Obrigado! Esta tela volta em{' '}
        <span className="font-mono font-semibold tabular-nums" data-testid="display-contador">
          {segundos}
        </span>
        s
      </p>
    </section>
  );
}
