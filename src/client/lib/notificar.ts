import { gooeyToast } from 'goey-toast';

/**
 * Notificações do Checkout — **toda** frase que o operador lê num toast passa
 * por aqui, e nenhum arquivo fora deste chama `gooeyToast` direto.
 *
 * **Existe porque a frase ia no lugar errado da API do goey-toast** (achado do
 * usuário, 2026-09-09: "tem algumas em branco e outras não"). `gooeyToast.error(frase)`
 * põe a frase no **título**, e o título do goey é uma pílula de linha única:
 * `dist/index.css` declara `white-space: nowrap` com reticências, e o
 * componente fixa a altura do toast compacto em `PH = 34px`
 * (`dist/index.js`), recortando por `overflow: hidden` tudo o que passar disso.
 * Numa frase de PDV — "Insira ao menos um produto na venda antes de escolher a
 * condição de pagamento." — o resultado era uma pílula branca **só com o
 * ícone**: o `global.css` deixava o título quebrar em várias linhas para não
 * estourar os 390px da tela, e as linhas quebradas caíam fora dos 34px de
 * recorte. Medido no navegador em 2026-09-09: título de 448px e 71px de altura
 * dentro de um recorte de 34px.
 *
 * A saída não é brigar com o recorte por CSS — a bolha branca continuaria
 * desenhada com 34px e o texto sobraria por fora dela. É usar o campo que a
 * biblioteca reserva para frase inteira: `description`, que renderiza no corpo
 * expandido (`.gooey-contentExpanded`, largura medida e altura animada). O
 * título fica com o rótulo curto do tipo, que é justamente o que cabe numa
 * linha.
 *
 * Um lugar só, e não a correção repetida em cada `gooeyToast.*`: a regra "frase
 * vai em `description`" é da biblioteca, não de nenhuma feature, e espalhá-la
 * por 16 arquivos garantiria que a próxima chamada nova nascesse errada de novo.
 */

/**
 * Rótulo curto que ocupa o título — o único texto que cabe na linha da pílula.
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

type TipoNotificacao = keyof typeof TITULO_POR_TIPO;

function emitir(tipo: TipoNotificacao, mensagem: string): void {
  const titulo = TITULO_POR_TIPO[tipo];
  if (tipo === 'erro') {
    gooeyToast.error(titulo, { description: mensagem });
    return;
  }
  if (tipo === 'aviso') {
    gooeyToast.warning(titulo, { description: mensagem });
    return;
  }
  gooeyToast.success(titulo, { description: mensagem });
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
