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
 *
 * O nome da loja, ao contrário, **fica** (AD-214): é a única coisa que diz ao
 * cliente a quem ele está pagando, e some-la justamente na hora de escanear
 * deixaria um QR Code anônimo na frente de quem vai transferir dinheiro. Fica
 * preso no topo, fora da coluna centralizada, para não empurrar o QR Code e o
 * valor — o dimensionamento de FR-006 é para leitura a um metro e não sobra
 * altura para dividir.
 */
export function TelaCobrancaPix({
  valor,
  qrCodeFonte,
  nomeLoja,
}: {
  readonly valor: Centavos;
  readonly qrCodeFonte: string;
  /** `null` quando a empresa não está cadastrada — sem linha órfã, como no repouso. */
  readonly nomeLoja: string | null;
}): ReactElement {
  return (
    <section
      className="flex h-full w-full flex-col items-center gap-[clamp(0.25rem,1.6vh,1rem)] overflow-hidden px-xl py-[clamp(0.5rem,2vh,1.5rem)]"
      data-testid="display-cobranca-pix"
    >
      {nomeLoja !== null && (
        <p
          className="shrink-0 text-center text-[clamp(0.875rem,2.2vh,1.25rem)] leading-[1.3] font-semibold text-muted-foreground"
          data-testid="display-nome-loja"
        >
          {nomeLoja}
        </p>
      )}

      {/* `min-h-0`: sem ele a coluna interna adota a altura do conteúdo e o QR
          Code vaza da tela quando a marca ocupa o topo (mesma armadilha do
          AD-164). O `flex-1` é o que mantém o miolo centralizado no que sobra.
          `justify-center` sozinho, porém, transborda para os **dois** lados
          quando o conteúdo não cabe: com zoom do navegador o miolo subia por
          cima do nome da loja e o badge saía por baixo (AD-217). Daí toda
          medida abaixo escalar com `vh` — a tela é um kiosk, não rola.

          `justify-content: safe center` fecha o caso extremo: `center` puro
          transborda **simétrico**, e é isso que punha o miolo por cima da marca;
          o `safe` desiste da centralização quando o conteúdo não cabe e alinha
          ao início, de modo que o excedente sai só por baixo, onde o
          `overflow-hidden` o corta. Centraliza igual enquanto couber. */}
      <div className="flex min-h-0 w-full flex-1 flex-col items-center gap-[clamp(0.25rem,1.4vh,1rem)] overflow-hidden [justify-content:safe_center]">
        <h1 className="text-[clamp(1.125rem,3.4vh,1.875rem)] leading-[1.2] font-semibold text-foreground">
          Pague com PIX
        </h1>
        <p className="max-w-[24ch] text-center text-[clamp(0.875rem,2.2vh,1.25rem)] leading-[1.4] text-muted-foreground">
          Abra o app do seu banco e escaneie o QR Code
        </p>

        {/* Cartão do QR Code, como o `DRKJh` do modal — só que grande o bastante
            para a câmera do celular resolver a um braço de distância. */}
        <div className="flex min-h-0 shrink items-center justify-center rounded-2xl border border-border bg-background p-[clamp(0.25rem,1.2vh,1rem)]">
          <img
            // `min(…, 80vw)`: em tela estreita quem limita é a largura, não a
            // altura — sem isso o cartão empurra as laterais para fora.
            //
            // `max-h-full`/`max-w-full` é o que impede a imagem de **vazar o
            // próprio cartão** quando ele encolhe: com tamanho só em `vh`, o
            // cartão cedia espaço no flex e o QR continuava do tamanho antigo,
            // passando por cima do texto acima e do valor abaixo. Era esta a
            // sobreposição que aparecia com zoom (AD-217). `object-contain`
            // preserva o quadrado do QR ao encolher — um QR deformado não é
            // lido por leitor nenhum.
            className="size-[min(38vh,80vw,380px)] max-h-full max-w-full object-contain"
            data-testid="display-qrcode"
            // `data:` URL pronta, com o MIME já decidido no mapper do checkout a
            // partir dos bytes reais — o display nunca escolhe formato.
            src={qrCodeFonte}
            alt="QR Code do PIX para pagamento"
          />
        </div>

        {/* Bloco escuro `ZgrCz` do modal. O valor é o único número da tela e usa
            a maior escala tipográfica do produto — Geist Mono, como todo valor
            tabular. */}
        <div className="flex shrink-0 flex-col items-center gap-xxs rounded-[20px] bg-[var(--cc-color-surface-dark)] px-[clamp(1rem,4vh,2rem)] py-[clamp(0.25rem,1.2vh,1rem)]">
          <span className="text-[clamp(0.75rem,1.8vh,1.125rem)] text-[var(--cc-color-on-dark-muted)]">
            Valor a pagar
          </span>
          <span
            className="font-mono text-[clamp(1.5rem,5.5vh,4rem)] leading-[1.05] font-semibold tabular-nums text-[var(--cc-color-on-primary)]"
            data-testid="display-valor"
          >
            {formatarCentavos(valor)}
          </span>
        </div>

        <span
          className="flex shrink-0 items-center gap-xs rounded-full bg-[var(--cc-color-up-soft)] px-base py-xs"
          data-testid="display-aguardando"
        >
          <span
            className="size-2.5 shrink-0 rounded-full bg-[var(--cc-color-up)]"
            aria-hidden="true"
          />
          <span className="text-[clamp(0.75rem,1.8vh,1.125rem)] font-semibold whitespace-nowrap text-[var(--cc-color-up-ink)]">
            Aguardando pagamento
          </span>
        </span>
      </div>
    </section>
  );
}
