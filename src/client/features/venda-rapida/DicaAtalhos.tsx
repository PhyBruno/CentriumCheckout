import type { ReactElement } from 'react';
import { acaoBloqueavel, atributosDeBloqueio, type MotivoBloqueio } from '@/lib/bloqueio';
import { cn } from '@/lib/utils';
import { ICONE_POR_MEIO } from '../pagamento/iconePorMeio';
import { useAtalhosDeTeclado } from '../../hotkeys/mapaAtalhos';
import type { AtalhoVendaRapida, ListaAtalhos, TeclaAtalho } from '../../domain/vendaRapida/tipos';
import { useVendaStore } from '../../stores/vendaStore';
import { AVISO_ATALHO_SEM_ITENS } from './avisosVendaRapida';
import { useAcionarCenario } from './useAcionarCenario';

/**
 * Faixa "Métodos de pagamento rápidos" do Pencil (nó `I10H4d` de
 * `design/CentriumCheckout.pen`, export em
 * `design/HTML - Pencil/CentriumCheckout.html`): linha de 36px no **topo** do
 * cartão "Pagamento e totais" (`OzP7o`), acima do cabeçalho — `top: 16`, antes
 * do `top: 60` do título.
 *
 * Tradução fiel do desenho, com os tokens equivalentes de `global.css` (nenhum
 * hex solto):
 *
 * | Pencil | Aqui |
 * |---|---|
 * | linha 36px, `gap: 8`, botões `flex: 1 1 0` | `h-9`, `gap-[8px]`, `flex-1` |
 * | raio 12, gap interno 6, conteúdo centralizado | `rounded-xl gap-[6px] justify-center` |
 * | ícone de 14px (reicon, ver AD-201) | `size-3.5` |
 * | rótulo Inter 12/600 | `text-xs font-semibold` |
 * | todos `#EEF0F3`/`#0A0B0D`, ícone `#5B616E` | `bg-secondary text-secondary-foreground`, ícone `text-muted-foreground` |
 *
 * **Divergência deliberada do Pencil: todos os botões são cinza.** O desenho
 * pinta o primeiro ("PIX (F6)") em azul e os outros três em cinza, e a primeira
 * implementação reproduziu isso destacando o primeiro da lista. **Corrigido a
 * pedido do usuário (2026-09-05).** O desenho fixou um mockup com métodos
 * conhecidos, em que o azul dizia "este é o principal"; aqui a faixa é
 * populada pelo cadastro do ERP, e a ordem é a das teclas — o primeiro da lista
 * é só quem calhou de estar em F6. Pintá-lo de azul afirmaria uma hierarquia
 * que nenhum dado sustenta, e o operador leria como "o recomendado".
 *
 * **A UI não filtra, não ordena e não reinterpreta nada**
 * (`contracts/venda-rapida-domain-api.md` §6): recebe `ListaAtalhos` pronta.
 * Não há `if (isMobile)` neste arquivo — no mobile `projetarAtalhos` já devolve
 * `[]` (D11/I10), então "não exibe" e "não aciona" são consequência do mesmo
 * fato, decidido num lugar só.
 */

interface BotaoAtalhoProps {
  readonly atalho: AtalhoVendaRapida;
  readonly onAcionar: () => void;
  /** `null` = acionável; texto = frase que o operador lê ao clicar. */
  readonly bloqueio: MotivoBloqueio;
}

function BotaoAtalho({ atalho, onAcionar, bloqueio }: BotaoAtalhoProps): ReactElement {
  const Icone = ICONE_POR_MEIO[atalho.meioPagtoNFe];

  return (
    <button
      type="button"
      data-testid={`atalho-venda-rapida-${atalho.tecla}`}
      {...atributosDeBloqueio(bloqueio)}
      onClick={acaoBloqueavel(bloqueio, onAcionar)}
      // O rótulo visível já diz "Nome (F6)"; o acessível explicita o gesto, que
      // é o que um leitor de tela não infere de um parêntese.
      aria-label={`${atalho.nome} — atalho ${atalho.tecla}`}
      // Bloqueado, o `title` é o **motivo** — é a informação de que o operador
      // precisa, e o rótulo do atalho já está escrito no próprio botão. Depois
      // do spread de propósito: `atributosDeBloqueio` também traz `title`, e a
      // ordem inversa devolveria o nome do atalho por cima do motivo.
      title={bloqueio ?? `${atalho.nome} (${atalho.tecla})`}
      className={cn(
        'flex h-9 min-w-0 flex-1 items-center justify-center gap-[6px] rounded-xl px-2',
        'text-xs font-semibold transition-colors outline-none',
        'focus-visible:ring-[3px] focus-visible:ring-ring/50',
        'bg-secondary text-secondary-foreground hover:bg-secondary-hover',
        // Mesmo tratamento das opções bloqueadas do combobox de pagamento
        // (`SeletorCondicaoForma`): apagado e com o cursor recusando, sem sumir
        // da faixa — o operador precisa continuar vendo quais cenários existem.
        'aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:bg-secondary',
      )}
    >
      <Icone className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="truncate">
        {atalho.nome} ({atalho.tecla})
      </span>
    </button>
  );
}

export interface DicaAtalhosProps {
  /** Já projetada (T007): a faixa não filtra, ordena nem reinterpreta nada. */
  readonly atalhos: ListaAtalhos;
  /** O **mesmo** comando da tecla e do clique — não há caminho alternativo. */
  readonly onAcionar: (tecla: TeclaAtalho) => void;
  /**
   * Motivo pelo qual a faixa inteira está bloqueada, ou `null`.
   *
   * Chega por prop, e não é lido do store aqui, pelo mesmo motivo de `atalhos`:
   * este componente não decide nada. Quem responde é `FaixaAtalhosVendaRapida`.
   *
   * Vale para os quatro botões de uma vez porque a única causa hoje — venda sem
   * item — é da venda, não de um cenário: não existe atalho que funcione numa
   * venda vazia.
   */
  readonly bloqueio?: MotivoBloqueio;
}

/**
 * Presentacional, no mesmo espírito de `BotaoFinalizarVenda`: quem possui o
 * comando é `FaixaAtalhosVendaRapida`, logo abaixo. A separação existe para o
 * componente ser exercitável sem o provider de finalização nem a query do
 * catálogo — e para deixar óbvio, na assinatura, que ele não decide nada.
 */
export function DicaAtalhos({
  atalhos,
  onAcionar,
  bloqueio = null,
}: DicaAtalhosProps): ReactElement | null {
  // Registro das teclas no mapa central: a **mesma** função do clique, nunca um
  // segundo caminho de lançamento (`US3`, cenário 3). Desligado quando não há
  // atalho — a faixa não escuta o teclado à toa, e um F6 sem cenário volta a ser
  // do navegador.
  useAtalhosDeTeclado(
    atalhos.map((atalho) => ({
      tecla: atalho.tecla,
      aoAcionar: () => {
        onAcionar(atalho.tecla);
      },
    })),
    atalhos.length > 0,
  );

  // Sem atalho, a área inteira é omitida (`FR-016`) — nada de faixa vazia nem
  // de mensagem de erro: catálogo ausente é um desfecho normal (I4).
  if (atalhos.length === 0) {
    return null;
  }

  return (
    <div
      className="flex h-9 w-full shrink-0 items-center gap-[8px]"
      data-testid="dica-atalhos-venda-rapida"
    >
      {atalhos.map((atalho) => (
        <BotaoAtalho
          key={atalho.tecla}
          atalho={atalho}
          onAcionar={() => {
            onAcionar(atalho.tecla);
          }}
          bloqueio={bloqueio}
        />
      ))}
    </div>
  );
}

/**
 * A faixa ligada à venda: lista da sessão + comando real. É este componente que
 * `PainelPagamentoETotais` monta no topo do cartão.
 */
export function FaixaAtalhosVendaRapida(): ReactElement | null {
  const { atalhos, acionar } = useAcionarCenario();

  /**
   * Item **ativo** no grid: linha cancelada não conta (correção do usuário,
   * 2026-09-10).
   *
   * É a mesma leitura de `vendaTemItens` em `criarDepsPadrao` — a guarda G3 de
   * `acionarCenario`, que já recusava com `AVISO_ATALHO_SEM_ITENS`. O que
   * faltava era a faixa **parecer** bloqueada antes do gesto: os botões
   * seguiam com o mesmo azul-cinza dos acionáveis, e o operador só descobria a
   * regra ao clicar. Aqui a leitura devolve um booleano, então o seletor não
   * recria referência a cada render.
   *
   * A frase é a mesma constante que o comando usa ao recusar: duas redações do
   * mesmo motivo divergiriam no dia em que só uma fosse revisada.
   */
  const semItemAtivo = useVendaStore((estado) => !estado.linhas.some((linha) => !linha.cancelada));

  return (
    <DicaAtalhos
      atalhos={atalhos}
      onAcionar={(tecla) => {
        void acionar(tecla);
      }}
      bloqueio={semItemAtivo ? AVISO_ATALHO_SEM_ITENS : null}
    />
  );
}
