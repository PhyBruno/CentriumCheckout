import type { ReactElement } from 'react';
import { formatarCentavos, type Centavos } from '../../domain/precificacao/dinheiro';

/**
 * A cobrança PIX na tela virada ao cliente (feature 015, FR-004/005/006).
 *
 * **Sem nó no Pencil** — ver o TSDoc de `TelaBoasVindas`. O vocabulário visual
 * é o do `ModalPix` já implementado (cartão do QR Code com hairline e raio,
 * bloco escuro do valor, badge `$success-soft` com o ponto), reescalado para a
 * distância: aquela janela é lida a 40 cm por quem opera, esta é lida a cerca de
 * um metro por quem paga.
 *
 * Duas ausências são requisito, não esquecimento:
 *
 * - **Não** há "copia e cola" nem botão de copiar (FR-005). A tela do cliente
 *   não tem teclado nem apontador, então 130 caracteres ali seriam ruído — e um
 *   botão que ninguém pode clicar é pior que nada.
 * - **Não** há nada da venda além do valor desta cobrança: nem item, nem total,
 *   nem nome, nem documento (FR-003).
 */
export function TelaCobrancaPix({
  valor,
  qrCodeFonte,
}: {
  readonly valor: Centavos;
  readonly qrCodeFonte: string;
}): ReactElement {
  return (
    <section
      className="flex h-full w-full flex-col items-center justify-center gap-md px-xl py-lg"
      data-testid="display-cobranca-pix"
    >
      <h1 className="text-3xl leading-[1.2] font-semibold text-foreground">Pague com PIX</h1>
      <p className="max-w-[24ch] text-center text-xl leading-[1.4] text-muted-foreground">
        Abra o app do seu banco e escaneie o QR Code
      </p>

      {/* Cartão do QR Code, como o `DRKJh` do modal — só que grande o bastante
          para a câmera do celular resolver a um braço de distância. */}
      <div className="flex items-center justify-center rounded-2xl border border-border bg-background p-base">
        <img
          className="size-[min(46vh,380px)]"
          data-testid="display-qrcode"
          // `data:` URL pronta, com o MIME já decidido no mapper do checkout a
          // partir dos bytes reais — o display nunca escolhe formato.
          src={qrCodeFonte}
          alt="QR Code do PIX para pagamento"
        />
      </div>

      {/* Bloco escuro `ZgrCz` do modal. O valor é o único número da tela e usa a
          maior escala tipográfica do produto — Geist Mono, como todo valor
          tabular. */}
      <div className="flex flex-col items-center gap-xxs rounded-[20px] bg-[var(--cc-color-surface-dark)] px-xl py-base">
        <span className="text-lg text-[var(--cc-color-on-dark-muted)]">Valor a pagar</span>
        <span
          className="font-mono text-[clamp(2.5rem,6vh,4rem)] leading-[1.05] font-semibold tabular-nums text-[var(--cc-color-on-primary)]"
          data-testid="display-valor"
        >
          {formatarCentavos(valor)}
        </span>
      </div>

      <span
        className="flex items-center gap-xs rounded-full bg-[var(--cc-color-up-soft)] px-base py-xs"
        data-testid="display-aguardando"
      >
        <span
          className="size-2.5 shrink-0 rounded-full bg-[var(--cc-color-up)]"
          aria-hidden="true"
        />
        <span className="text-lg font-semibold whitespace-nowrap text-[var(--cc-color-up-ink)]">
          Aguardando pagamento
        </span>
      </span>
    </section>
  );
}
