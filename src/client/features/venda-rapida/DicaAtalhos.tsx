import type { ReactElement } from 'react';
import { cn } from '@/lib/utils';
import { ICONE_POR_MEIO } from '../pagamento/iconePorMeio';
import { useAtalhosDeTeclado } from '../../hotkeys/mapaAtalhos';
import type {
  AtalhoVendaRapida,
  ListaAtalhos,
  TeclaAtalho,
} from '../../domain/vendaRapida/tipos';
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
 * | ícone lucide de 14px | `size-3.5` |
 * | rótulo Inter 12/600 | `text-xs font-semibold` |
 * | 1º botão `#2563EB`/`#FFFFFF` | `bg-primary text-primary-foreground` |
 * | demais `#EEF0F3`/`#0A0B0D`, ícone `#5B616E` | `bg-secondary text-secondary-foreground`, ícone `text-muted-foreground` |
 *
 * **O destaque do primeiro botão é do desenho, não uma regra de negócio.** O
 * Pencil pinta "PIX (F6)" em azul e os outros três em cinza: é hierarquia
 * visual — a faixa tem um método principal e três alternativas —, e não um
 * estado do sistema. Por isso a condição aqui é a posição na lista, e não
 * `encerraOperacao` ou o meio de pagamento: nenhum desses significaria "este é
 * o primeiro botão da faixa", e usá-los inventaria uma semântica que o desenho
 * não tem.
 *
 * **A UI não filtra, não ordena e não reinterpreta nada**
 * (`contracts/venda-rapida-domain-api.md` §6): recebe `ListaAtalhos` pronta.
 * Não há `if (isMobile)` neste arquivo — no mobile `projetarAtalhos` já devolve
 * `[]` (D11/I10), então "não exibe" e "não aciona" são consequência do mesmo
 * fato, decidido num lugar só.
 */

interface BotaoAtalhoProps {
  readonly atalho: AtalhoVendaRapida;
  readonly destacado: boolean;
  readonly onAcionar: () => void;
}

function BotaoAtalho({ atalho, destacado, onAcionar }: BotaoAtalhoProps): ReactElement {
  const Icone = ICONE_POR_MEIO[atalho.meioPagtoNFe];

  return (
    <button
      type="button"
      data-testid={`atalho-venda-rapida-${atalho.tecla}`}
      onClick={onAcionar}
      // O rótulo visível já diz "Nome (F6)"; o acessível explicita o gesto, que
      // é o que um leitor de tela não infere de um parêntese.
      aria-label={`${atalho.nome} — atalho ${atalho.tecla}`}
      title={`${atalho.nome} (${atalho.tecla})`}
      className={cn(
        'flex h-9 min-w-0 flex-1 items-center justify-center gap-[6px] rounded-xl px-2',
        'text-xs font-semibold transition-colors outline-none',
        'focus-visible:ring-[3px] focus-visible:ring-ring/50',
        destacado
          ? 'bg-primary text-primary-foreground hover:bg-[var(--cc-color-primary-active)]'
          : 'bg-secondary text-secondary-foreground hover:bg-secondary-hover',
      )}
    >
      <Icone
        className={cn('size-3.5 shrink-0', destacado ? '' : 'text-muted-foreground')}
        aria-hidden="true"
      />
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
}

/**
 * Presentacional, no mesmo espírito de `BotaoFinalizarVenda`: quem possui o
 * comando é `FaixaAtalhosVendaRapida`, logo abaixo. A separação existe para o
 * componente ser exercitável sem o provider de finalização nem a query do
 * catálogo — e para deixar óbvio, na assinatura, que ele não decide nada.
 */
export function DicaAtalhos({ atalhos, onAcionar }: DicaAtalhosProps): ReactElement | null {
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
      {atalhos.map((atalho, indice) => (
        <BotaoAtalho
          key={atalho.tecla}
          atalho={atalho}
          destacado={indice === 0}
          onAcionar={() => {
            onAcionar(atalho.tecla);
          }}
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

  return (
    <DicaAtalhos
      atalhos={atalhos}
      onAcionar={(tecla) => {
        void acionar(tecla);
      }}
    />
  );
}
