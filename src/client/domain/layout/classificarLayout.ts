/**
 * Classificação de layout pelo ponteiro disponível, com a largura como piso
 * (T002, `data-model.md` §1).
 *
 * **Quem decide é o toque** (AD-198): a tela em etapas existe para o dedo, não
 * para a tela pequena. Um desktop de 1280px com mouse é desktop — a largura só
 * entra depois, como o piso abaixo do qual a tela única não cabe em monitor
 * nenhum.
 *
 * `any-pointer: fine` — "existe **algum** ponteiro preciso disponível", não "o
 * primário é preciso" — é o que separa os casos reais: o monitor *touch* de
 * balcão com mouse ligado e o notebook de tela sensível continuam desktop
 * (exatamente o que a decisão original da 007 protegia), enquanto o tablet
 * operado só com o dedo cai no compacto em qualquer largura, inclusive no iPad
 * Pro 12.9 deitado, que dá 1366px e não tem F6/F7 nem alvo para 5px.
 *
 * **Isto revoga a premissa original da 007** ("o critério de troca é
 * exclusivamente a largura, nunca a capacidade do dispositivo", `spec.md`
 * Assumptions e a linha "Detecção de capacidade touch" da tabela de fora de
 * escopo). A revogação é do usuário (2026-09-09) e está registrada como AD-198;
 * o texto da spec foi reescrito, não anotado no rodapé.
 *
 * Pura de propósito: sem `window`, sem React. Quem lê o navegador é a casca
 * (`useIsMobile` via `matchMedia`, `obterPlataforma` via `window.innerWidth` +
 * `matchMedia`), e o critério mora num lugar só — duas cópias criariam uma
 * faixa de aparelhos em que os consumidores discordariam sobre qual árvore está
 * montada.
 */
export type ModoLayout = 'DESKTOP' | 'MOBILE';

/**
 * Piso de MOB-01: `1024px` — a menor largura em que a tela única ainda cabe.
 *
 * **É um piso, não o critério.** Quase todo aparelho estreito já cai no
 * compacto por não ter ponteiro preciso; isto só cobre o que sobra, como a
 * janela de navegador arrastada para 700px num desktop. `1024` é o mínimo do
 * Windows e o menor monitor que existe na prática — abaixo disso não há tela
 * única possível, com ou sem mouse.
 *
 * **Era 768px até 2026-09-09**, e o número estava errado por medição: a coluna
 * de pagamento é fixa em `w-[392px]` (`PainelPagamentoETotais`) e, com os 20px
 * de intervalo e os 24px de folga lateral do `DesktopLayout`, sobra
 * `largura − 436` para todo o resto. Em 768px isso dá 332px — menos que um
 * celular. Pior: `EntradaRapidaProduto` trocava `min-w-[9.5rem]` por
 * `md:min-w-0` a partir do limiar, então os campos **paravam de quebrar linha
 * exatamente onde deixavam de caber**, e o resultado era rótulo sobreposto e
 * valor cortado em toda a faixa de tablet (medido no navegador em 820px e
 * 1024px). Esse `md:min-w-0` foi removido junto com esta mudança: a barra
 * quebra em duas linhas quando falta largura, em vez de se espremer, que é o
 * que permite ao desktop chegar a 1024 sem estourar.
 *
 * `1024` **exato conta como desktop** (I2) — a média equivalente é
 * `max-width: 1023.98px`, e não `max-width: 1024px`, para não deixar buraco em
 * telas de largura fracionária (`research.md` D1).
 */
export const LARGURA_MINIMA_DESKTOP_PX = 1024;

export interface CapacidadesDeTela {
  readonly larguraViewportPx: number;
  /**
   * Existe **algum** ponteiro preciso disponível — mouse, trackpad ou caneta?
   *
   * Equivale a `any-pointer: fine`. Quando o navegador não sabe responder (um
   * ambiente de teste sem `matchMedia`, por exemplo), a casca passa `true`: a
   * ausência de informação não pode rebaixar um desktop legítimo para o wizard.
   */
  readonly temPonteiroFino: boolean;
}

export function classificarLayout({
  larguraViewportPx,
  temPonteiroFino,
}: CapacidadesDeTela): ModoLayout {
  if (!temPonteiroFino) {
    return 'MOBILE';
  }

  return larguraViewportPx < LARGURA_MINIMA_DESKTOP_PX ? 'MOBILE' : 'DESKTOP';
}
