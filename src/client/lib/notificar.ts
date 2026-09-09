import { gooeyToast } from 'goey-toast';
import { obterPlataforma } from '../layout/obterPlataforma';

/**
 * Notificações do Checkout — **toda** frase que o operador lê num toast passa
 * por aqui, e nenhum arquivo fora deste chama `gooeyToast` direto.
 *
 * **A apresentação é uma no desktop e outra no mobile**, e é este módulo que
 * escolhe (correção do usuário, 2026-09-09: "no desktop a notificação do goey
 * tem que ser como era antes, o mobile pode manter como está").
 *
 * **Desktop — a frase é o título, como sempre foi.** Lá sobra largura: a faixa
 * compacta do goey nasce `width: fit-content` e cresce com o texto, sem
 * esbarrar em borda de tela, então `gooeyToast.error(frase)` desenha a pílula
 * de uma linha só que o operador já conhecia. Nada a corrigir, nada a
 * enfeitar.
 *
 * **Mobile — a frase vai em `description`.** Foi lá, e só lá, que a mesma
 * chamada quebrava (achado do usuário, 2026-09-09: "tem algumas em branco e
 * outras não"): o título do goey é uma pílula de linha única — `dist/index.css`
 * declara `white-space: nowrap` com reticências, e o componente fixa a altura
 * do toast compacto em `PH = 34px` (`dist/index.js`), recortando por
 * `overflow: hidden` tudo o que passar disso. Numa frase de PDV — "Insira ao
 * menos um produto na venda antes de escolher a condição de pagamento." — o
 * resultado era uma pílula branca **só com o ícone**: o `global.css` deixava o
 * título quebrar em várias linhas para não estourar os 390px da tela, e as
 * linhas quebradas caíam fora dos 34px de recorte. Medido no navegador em
 * 2026-09-09: título de 448px e 71px de altura dentro de um recorte de 34px.
 *
 * A saída não é brigar com o recorte por CSS — a bolha branca continuaria
 * desenhada com 34px e o texto sobraria por fora dela. É usar o campo que a
 * biblioteca reserva para frase inteira: `description`, que renderiza no corpo
 * expandido (`.gooey-contentExpanded`, largura medida e altura animada). O
 * título fica com o rótulo curto do tipo, que é justamente o que cabe numa
 * linha.
 *
 * Um lugar só, e não a correção repetida em cada `gooeyToast.*`: a regra vale
 * para a biblioteca inteira, não para nenhuma feature, e espalhá-la por 19
 * arquivos garantiria que a próxima chamada nova nascesse errada de novo — e
 * que o desvio desktop×mobile precisasse ser reescrito 19 vezes.
 */

/**
 * Rótulo curto que ocupa o título **no mobile** — o único texto que cabe na
 * linha da pílula quando a frase inteira desce para `description`.
 *
 * Genérico de propósito: o que o operador precisa ler é a frase, que vai
 * embaixo, inteira. Um título específico por chamada duplicaria a informação e
 * voltaria a correr o risco de não caber.
 */
const TITULO_POR_TIPO = {
  erro: 'Erro',
  aviso: 'Atenção',
  sucesso: 'Pronto',
} as const;

/**
 * Devolve à frase a aparência que ela tinha enquanto era o título (correção do
 * usuário, 2026-09-09: "está com fonte padrão e preta").
 *
 * O corpo expandido do pacote nasce como texto de leitura — `.gooey-description`
 * é 13px/400 em `#444` —, enquanto o título é 12px/**700** e recebe a **cor do
 * tipo** (`.gooey-titleError` etc.), a mesma do ícone ao lado. Ao mudar a frase
 * de campo, ela herdou o tratamento de corpo e passou a destoar do ícone que a
 * anuncia. As classes abaixo estão em `global.css` e repõem os dois — peso e
 * cor —, mantendo a família tipográfica que o pacote já aplica no wrapper.
 *
 * Só o mobile as usa: no desktop a frase volta a ser o título, e quem pinta o
 * título é o próprio pacote.
 */
const CLASSE_DA_FRASE = {
  erro: 'cc-toast-frase cc-toast-frase-erro',
  aviso: 'cc-toast-frase cc-toast-frase-aviso',
  sucesso: 'cc-toast-frase cc-toast-frase-sucesso',
} as const;

/**
 * A tremida do toast no mobile (pedido do usuário, 2026-09-09: "logo após
 * exibir a mensagem do erro/aviso, dá uma 'tremida'").
 *
 * **Só recusa e alerta tremem.** Sacudir é o gesto de "não", e a animação
 * existe para chamar de volta um olhar que já saiu da tela — o operador de
 * caixa lê o produto que bipou, não o canto onde o toast nasce. Um `sucesso`
 * tremendo diria com o corpo o contrário do que diz com a palavra, então o
 * `undefined` abaixo é decisão, não esquecimento: o mapa é completo de
 * propósito para que um tipo novo precise escolher um lado.
 *
 * Vai no `wrapper`, não no `content`: o pacote desenha a bolha num SVG
 * posicionado em absoluto dentro do wrapper (`.gooey-blobSvg`), e sacudir só o
 * conteúdo descolaria o texto do próprio balão. O atraso que sincroniza a
 * tremida com a frase é da animação, em `global.css` — aqui só se diz *quem*
 * treme.
 */
const CLASSE_DO_WRAPPER = {
  erro: 'cc-toast-tremida',
  aviso: 'cc-toast-tremida',
  sucesso: undefined,
} as const;

type TipoNotificacao = keyof typeof TITULO_POR_TIPO;

/**
 * O toast desta chamada, montado para o layout que está na tela.
 *
 * `obterPlataforma` (largura da viewport, sem React) em vez de `useIsMobile`:
 * `notificar` é chamado de stores, hooks e handlers — não é componente e não
 * pode obedecer às regras de hooks. É a mesma porta que o `pagamentoSlice` já
 * usa, e o limiar continua morando só em `classificarLayout`.
 */
function montarToast(
  tipo: TipoNotificacao,
  mensagem: string,
): { readonly titulo: string; readonly opcoes: Parameters<typeof gooeyToast.error>[1] } {
  if (obterPlataforma() === 'DESKTOP') {
    return { titulo: mensagem, opcoes: undefined };
  }

  return {
    titulo: TITULO_POR_TIPO[tipo],
    opcoes: {
      description: mensagem,
      classNames: { wrapper: CLASSE_DO_WRAPPER[tipo], description: CLASSE_DA_FRASE[tipo] },
    },
  };
}

function emitir(tipo: TipoNotificacao, mensagem: string): void {
  const { titulo, opcoes } = montarToast(tipo, mensagem);

  if (tipo === 'erro') {
    gooeyToast.error(titulo, opcoes);
    return;
  }
  if (tipo === 'aviso') {
    gooeyToast.warning(titulo, opcoes);
    return;
  }
  gooeyToast.success(titulo, opcoes);
}

export const notificar = {
  /** Recusa: o gesto não aconteceu e o operador precisa mudar alguma coisa. */
  erro(mensagem: string): void {
    emitir('erro', mensagem);
  },
  /** O gesto aconteceu (ou é possível), mas há algo que o operador deve saber. */
  aviso(mensagem: string): void {
    emitir('aviso', mensagem);
  },
  /** Desfecho concluído — usado com parcimônia: o caminho feliz costuma se dizer sozinho. */
  sucesso(mensagem: string): void {
    emitir('sucesso', mensagem);
  },
} as const;

/**
 * Adaptador para `notificarVeredito` (feature 014), que declara a superfície
 * mínima `{ warning, error }` para não amarrar o domínio a uma lib de UI.
 *
 * Fica aqui, e não repetido em cada chamador, pelo mesmo motivo do resto do
 * módulo: é a tradução entre um contrato e o outro, não uma decisão de feature.
 */
export const notificadorDeVeredito = {
  warning: notificar.aviso,
  error: notificar.erro,
} as const;
