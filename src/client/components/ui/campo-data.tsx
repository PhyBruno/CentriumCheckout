import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

/**
 * Campo de data com calendário próprio (pedido do usuário, 2026-09-03).
 *
 * Substitui o `<input type="date">` nativo, cujo calendário só abre pelo ícone
 * do navegador — o operador clicava no meio do campo e nada acontecia. Aqui
 * **qualquer** clique no campo abre o calendário, e a digitação direta em
 * `DD/MM/AAAA` continua valendo para quem prefere o teclado.
 *
 * Construído à mão, sem dependência nova: a base não tem `react-day-picker`
 * nem biblioteca de data, e um calendário de mês é aritmética de `Date` —
 * instalar um pacote para isso ampliaria a superfície de supply-chain do
 * projeto (mesma cautela já registrada para as libs de UI).
 *
 * O calendário é renderizado em **portal para o `<body>`** (correção do usuário,
 * 2026-09-03): ancorado ao campo por posição fixa calculada, ele escapa do
 * recorte de quem o hospeda. Dentro da janela de importação — que é
 * `overflow-hidden` para manter os cantos arredondados — o popover era cortado
 * assim que passava da borda; fora dela, a folha inteira aparece.
 *
 * O valor de fronteira é sempre `YYYY-MM-DD`, que é o que `ListaDAVs` espera em
 * `Datainicial`/`Datafinal`; a exibição em `DD/MM/AAAA` fica confinada aqui.
 * Toda a aritmética usa os componentes **locais** de `Date` (`getFullYear`,
 * `getMonth`, `getDate`) — `toISOString()` converteria para UTC e deslocaria o
 * dia para quem está a oeste de Greenwich, que é o caso do Brasil inteiro.
 */

const DIAS_DA_SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'] as const;

const MESES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
] as const;

function doisDigitos(valor: number): string {
  return String(valor).padStart(2, '0');
}

/** `Date` para `YYYY-MM-DD` no fuso local. */
export function isoLocal(data: Date): string {
  return `${data.getFullYear()}-${doisDigitos(data.getMonth() + 1)}-${doisDigitos(data.getDate())}`;
}

/**
 * `YYYY-MM-DD` de hoje deslocado em dias — `isoRelativoAHoje(-7)` é o piso
 * padrão do filtro de emissão.
 */
export function isoRelativoAHoje(dias: number, hoje: Date = new Date()): string {
  return isoLocal(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + dias));
}

/** `YYYY-MM-DD` para `Date` local, ou `null` se a data não existe no calendário. */
function paraData(iso: string): Date | null {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (partes === null) {
    return null;
  }
  const [, ano, mes, dia] = partes;
  const data = new Date(Number(ano), Number(mes) - 1, Number(dia));
  // Rejeita 31/02 e afins: o `Date` normaliza silenciosamente para março.
  return data.getMonth() === Number(mes) - 1 && data.getDate() === Number(dia) ? data : null;
}

/** `YYYY-MM-DD` para `DD/MM/AAAA`; string vazia quando não há valor. */
function paraExibicao(iso: string): string {
  const data = paraData(iso);
  if (data === null) {
    return '';
  }
  return `${doisDigitos(data.getDate())}/${doisDigitos(data.getMonth() + 1)}/${data.getFullYear()}`;
}

/** `DD/MM/AAAA` digitado para `YYYY-MM-DD`, ou `null` enquanto está incompleto. */
function paraIso(texto: string): string | null {
  const partes = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto.trim());
  if (partes === null) {
    return null;
  }
  const [, dia, mes, ano] = partes;
  const iso = `${ano}-${mes}-${dia}`;
  return paraData(iso) === null ? null : iso;
}

/** Primeiro dia do mês que o calendário deve mostrar ao abrir. */
function mesDoValor(iso: string): Date {
  const data = paraData(iso) ?? new Date();
  return new Date(data.getFullYear(), data.getMonth(), 1);
}

export interface CampoDataProps {
  /** `YYYY-MM-DD`; string vazia = sem data. */
  readonly valor: string;
  readonly onChange: (iso: string) => void;
  /** Texto acessível do campo (o rótulo visível é a pílula que o contém). */
  readonly rotulo: string;
  readonly testId?: string;
}

export function CampoData({ valor, onChange, rotulo, testId }: CampoDataProps): ReactElement {
  const [texto, setTexto] = useState(() => paraExibicao(valor));
  const [valorAnterior, setValorAnterior] = useState(valor);
  const [aberto, setAberto] = useState(false);
  const [mesVisivel, setMesVisivel] = useState(() => mesDoValor(valor));
  // O campo âncora fica em estado, não em `ref`: o calendário mora em outro
  // ponto da árvore do DOM (portal) e precisa medir o elemento já montado para
  // se posicionar — um `ref` não avisaria a renderização de que ele existe.
  const [campo, setCampo] = useState<HTMLInputElement | null>(null);
  const raiz = useRef<HTMLDivElement>(null);
  const popover = useRef<HTMLDivElement>(null);

  // Valor trocado por fora (reset do modal, seleção no calendário): o texto
  // digitado acompanha. Padrão de estado derivado do React 19 — um `useEffect`
  // aqui só provocaria uma segunda renderização com o campo desatualizado.
  if (valor !== valorAnterior) {
    setValorAnterior(valor);
    setTexto(paraExibicao(valor));
  }

  useEffect(() => {
    if (!aberto) {
      return;
    }
    const aoClicarFora = (evento: MouseEvent): void => {
      const alvo = evento.target as Node;
      // O calendário está **fora** da raiz do campo (portal): sem checá-lo
      // também, o `mousedown` sobre um dia fecharia o popover antes do `click`
      // e a seleção se perderia.
      const dentro =
        (raiz.current !== null && raiz.current.contains(alvo)) ||
        (popover.current !== null && popover.current.contains(alvo));
      if (!dentro) {
        setAberto(false);
      }
    };
    document.addEventListener('mousedown', aoClicarFora);
    return () => {
      document.removeEventListener('mousedown', aoClicarFora);
    };
  }, [aberto]);

  function abrir(): void {
    setMesVisivel(mesDoValor(valor));
    setAberto(true);
  }

  return (
    <div
      className="flex items-center"
      ref={raiz}
      onKeyDown={(evento) => {
        // Escape com o calendário aberto fecha **só** o calendário: o modal que
        // hospeda o campo escuta a mesma tecla em `window` para se fechar, e
        // sem esta parada as duas coisas sumiriam de uma vez.
        if (evento.key === 'Escape' && aberto) {
          evento.stopPropagation();
          setAberto(false);
        }
      }}
    >
      <input
        ref={setCampo}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        aria-label={rotulo}
        aria-expanded={aberto}
        placeholder="DD/MM/AAAA"
        className="w-[92px] bg-transparent text-center font-mono outline-none placeholder:text-muted-foreground"
        {...(testId === undefined ? {} : { 'data-testid': testId })}
        value={texto}
        onChange={(evento) => {
          setTexto(evento.target.value);
          const iso = paraIso(evento.target.value);
          if (iso !== null) {
            onChange(iso);
            setMesVisivel(mesDoValor(iso));
          }
        }}
        onFocus={abrir}
        onClick={abrir}
        onBlur={() => {
          // Digitação incompleta ou impossível volta ao último valor válido —
          // um campo com "31/02/20" pendurado mentiria sobre o filtro aplicado.
          setTexto(paraExibicao(valor));
        }}
      />

      {aberto && campo !== null ? (
        <CalendarioFlutuante
          ancora={campo}
          refCaixa={popover}
          mesVisivel={mesVisivel}
          selecionado={valor}
          onTrocarMes={setMesVisivel}
          onSelecionar={(iso) => {
            onChange(iso);
            setAberto(false);
          }}
        />
      ) : null}
    </div>
  );
}

/** Folga entre o campo e o calendário; margem mínima até a borda da janela. */
const FOLGA_DO_CAMPO = 10;
const MARGEM_DA_JANELA = 8;

interface CalendarioDoMesProps {
  readonly mesVisivel: Date;
  readonly selecionado: string;
  readonly onTrocarMes: (mes: Date) => void;
  readonly onSelecionar: (iso: string) => void;
}

interface CalendarioFlutuanteProps extends CalendarioDoMesProps {
  /** Campo ao qual o calendário se ancora — medido a cada reposicionamento. */
  readonly ancora: HTMLElement;
  /** Exposto ao campo para o clique-fora reconhecer o popover portalizado. */
  readonly refCaixa: RefObject<HTMLDivElement | null>;
}

/**
 * Moldura do calendário: portal para o `<body>` e posição fixa calculada a
 * partir do campo. Fora da árvore do modal, nenhum `overflow-hidden` de
 * ancestral o recorta; em troca o posicionamento deixa de ser automático e
 * passa a ser refeito aqui a cada scroll, redimensionamento e troca de mês —
 * um mês de seis semanas é mais alto que um de cinco e pode inverter o lado
 * em que o calendário cabe.
 */
function CalendarioFlutuante({
  ancora,
  refCaixa,
  ...conteudo
}: CalendarioFlutuanteProps): ReactElement {
  // Invisível até a primeira medição: sem isto o calendário pisca no canto
  // superior esquerdo da janela antes de achar o lugar certo.
  const [estilo, setEstilo] = useState<CSSProperties>({ top: 0, left: 0, visibility: 'hidden' });

  useLayoutEffect(() => {
    function reposicionar(): void {
      const caixa = refCaixa.current;
      if (caixa === null) {
        return;
      }
      const campo = ancora.getBoundingClientRect();
      const { width: largura, height: altura } = caixa.getBoundingClientRect();
      const centralizado = campo.left + campo.width / 2 - largura / 2;
      const limiteDireito = window.innerWidth - largura - MARGEM_DA_JANELA;
      const abaixo = campo.bottom + FOLGA_DO_CAMPO;
      // Abre para cima quando não sobra altura sob o campo — o caso da janela
      // de importação esticada até perto do rodapé da tela.
      const cabeAbaixo = abaixo + altura <= window.innerHeight - MARGEM_DA_JANELA;
      setEstilo({
        left: Math.max(MARGEM_DA_JANELA, Math.min(centralizado, limiteDireito)),
        top: cabeAbaixo ? abaixo : Math.max(MARGEM_DA_JANELA, campo.top - FOLGA_DO_CAMPO - altura),
        visibility: 'visible',
      });
    }

    reposicionar();
    // Captura (`true`): o scroll que desloca o campo é o de algum contêiner
    // interno, e evento de scroll de elemento não borbulha até `window`.
    window.addEventListener('scroll', reposicionar, true);
    window.addEventListener('resize', reposicionar);
    return () => {
      window.removeEventListener('scroll', reposicionar, true);
      window.removeEventListener('resize', reposicionar);
    };
  }, [ancora, refCaixa, conteudo.mesVisivel]);

  return createPortal(
    <div
      ref={refCaixa}
      style={estilo}
      // `mousedown` no calendário não pode tirar o foco do campo antes do
      // `click` do dia: sem isto o `onBlur` do input fecharia o popover no meio
      // do gesto e o clique se perderia.
      onMouseDown={(evento) => {
        evento.preventDefault();
      }}
      className={cn(
        // `z-[60]` fica acima do backdrop do modal (`z-50`) — o portal é irmão
        // da aplicação no `<body>`, não descendente da janela.
        'fixed z-[60] w-[252px]',
        'rounded-xl border border-border bg-card p-sm shadow-lg',
      )}
      data-testid="calendario"
    >
      <CalendarioDoMes {...conteudo} />
    </div>,
    document.body,
  );
}

function CalendarioDoMes({
  mesVisivel,
  selecionado,
  onTrocarMes,
  onSelecionar,
}: CalendarioDoMesProps): ReactElement {
  const ano = mesVisivel.getFullYear();
  const mes = mesVisivel.getMonth();
  const diasNoMes = new Date(ano, mes + 1, 0).getDate();
  const vazias = new Date(ano, mes, 1).getDay();
  const hoje = isoLocal(new Date());

  return (
    <>
      <div className="flex items-center justify-between gap-xs pb-xs">
        <button
          type="button"
          aria-label="Mês anterior"
          className="flex size-7 items-center justify-center rounded-full text-foreground hover:bg-secondary"
          onClick={() => {
            onTrocarMes(new Date(ano, mes - 1, 1));
          }}
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
        </button>
        <span className="text-sm font-semibold text-foreground" aria-live="polite">
          {MESES[mes]} {ano}
        </span>
        <button
          type="button"
          aria-label="Próximo mês"
          className="flex size-7 items-center justify-center rounded-full text-foreground hover:bg-secondary"
          onClick={() => {
            onTrocarMes(new Date(ano, mes + 1, 1));
          }}
        >
          <ChevronRight className="size-4" aria-hidden="true" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-[2px]" aria-hidden="true">
        {DIAS_DA_SEMANA.map((dia, indice) => (
          <span
            key={indice}
            className="flex h-6 items-center justify-center text-xs font-bold text-muted-foreground"
          >
            {dia}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-[2px]">
        {Array.from({ length: vazias }, (_, indice) => (
          <span key={`vazia-${String(indice)}`} />
        ))}
        {Array.from({ length: diasNoMes }, (_, indice) => {
          const dia = indice + 1;
          const iso = `${String(ano)}-${doisDigitos(mes + 1)}-${doisDigitos(dia)}`;
          const ativo = iso === selecionado;
          return (
            <button
              key={iso}
              type="button"
              data-dia={iso}
              aria-label={paraExibicao(iso)}
              aria-pressed={ativo}
              className={cn(
                'flex h-8 items-center justify-center rounded-full font-mono text-xs font-semibold',
                'outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                ativo
                  ? 'bg-primary text-primary-foreground'
                  : cn(
                      'text-foreground hover:bg-secondary',
                      iso === hoje ? 'border border-primary' : '',
                    ),
              )}
              onClick={() => {
                onSelecionar(iso);
              }}
            >
              {dia}
            </button>
          );
        })}
      </div>
    </>
  );
}
