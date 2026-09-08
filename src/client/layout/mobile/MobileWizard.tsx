import { ArrowLeft, ArrowRight, ShoppingCart, UserRound } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { cn } from '@/lib/utils';
import { AcaoCancelarVenda } from '../../features/finalizacao-suspensao/AcoesFinaisVenda';
import { TotalDaVenda } from '../../features/pagamento/TotalDaVenda';
import {
  descreverSessaoAtiva,
  nomeDoOperador,
  tituloDoProduto,
} from '../../domain/sessao/identidadePdv';
import { useSessionStore } from '../../stores/sessionStore';
import { EtapaClienteProdutos } from './EtapaClienteProdutos';
import { EtapaPagamento } from './EtapaPagamento';
import { EtapaRevisao } from './EtapaRevisao';

/**
 * Wizard de 3 etapas do layout compacto (T007/T014) — nós `IQloN`, `DRz06` e
 * `V3SMF` do Pencil.
 *
 * **Todo o estado daqui é de apresentação** (`data-model.md` §2, `research.md`
 * D2): a etapa atual e o conjunto de etapas já visitadas. Nada disso vive no
 * `vendaStore`, e nenhum slice de domínio sabe que este componente existe —
 * "em qual etapa estou" não é um fato sobre a venda. É por isso que trocar de
 * etapa nunca recalcula nem reseta carrinho, cliente, vendedor ou pagamento
 * (I5): a troca só remonta uma sub-árvore de apresentação sobre o mesmo store.
 *
 * **A etapa reinicia em 1 a cada montagem** (I1), inclusive quando a viewport
 * cruza o breakpoint e volta. É o trade-off aceito em D2: a spec exige
 * preservação do estado de **venda** (`FR-002`), nunca da posição de navegação —
 * e essa posição é barata de refazer, enquanto o carrinho não é.
 *
 * **Nenhum atalho de teclado é registrado nesta árvore** (`FR-005`, MOB-05, D6):
 * o único `useHotkeys` do projeto vive em `mapaAtalhos.ts`, chamado só por
 * `DicaAtalhos`, que por sua vez só recebe teclas quando `projetarAtalhos`
 * recebe a plataforma `desktop`. No mobile a lista chega vazia e o mapa não
 * escuta nada.
 */
export type EtapaWizard = 1 | 2 | 3;

interface DescricaoEtapa {
  readonly titulo: string;
  /** Rótulo do botão que **avança** para esta etapa, na etapa anterior. */
  readonly rotuloAvancar: string;
  /** Rótulo do botão que **volta** para esta etapa, na etapa seguinte. */
  readonly rotuloVoltar: string;
}

const ETAPAS: Record<EtapaWizard, DescricaoEtapa> = {
  1: {
    titulo: 'Cliente e produtos',
    rotuloAvancar: 'Cliente e produtos',
    rotuloVoltar: 'Cliente e produtos',
  },
  2: {
    titulo: 'Produtos e pagamento',
    rotuloAvancar: 'Ver produtos e pagamento',
    rotuloVoltar: 'Pagamento',
  },
  3: {
    titulo: 'Revisão e finalização',
    rotuloAvancar: 'Revisar venda',
    rotuloVoltar: 'Revisão e finalização',
  },
};

const ORDEM: readonly EtapaWizard[] = [1, 2, 3];

export function MobileWizard(): ReactElement {
  const [etapaAtual, setEtapaAtual] = useState<EtapaWizard>(1);
  /**
   * Só cresce (I2): nenhum caminho remove uma etapa já visitada. É o que torna
   * `FR-004` verdadeiro por construção — se o conjunto pudesse encolher, uma
   * volta legítima viraria navegação recusada.
   */
  const [etapasVisitadas, setEtapasVisitadas] = useState<ReadonlySet<EtapaWizard>>(
    () => new Set<EtapaWizard>([1]),
  );

  /**
   * Navega para `etapa`, marcando-a como visitada.
   *
   * **Sem validação de campo obrigatório** (I3): voltar a qualquer etapa já
   * visitada é sempre permitido, a qualquer momento antes da finalização.
   * Quem recusa uma operação impossível é o domínio, no gesto em si — o botão
   * de finalizar já não libera sem saldo coberto e sem vendedor (004/008/014).
   * Travar a navegação aqui duplicaria essas regras num segundo lugar, e mal:
   * o operador que precisa **corrigir** o dado que falta é exatamente quem
   * ficaria preso.
   */
  function irPara(etapa: EtapaWizard): void {
    setEtapaAtual(etapa);
    setEtapasVisitadas((visitadas) => {
      if (visitadas.has(etapa)) {
        return visitadas;
      }
      return new Set<EtapaWizard>([...visitadas, etapa]);
    });
  }

  const anterior = etapaAtual > 1 ? ((etapaAtual - 1) as EtapaWizard) : null;
  const proxima = etapaAtual < 3 ? ((etapaAtual + 1) as EtapaWizard) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="mobile-wizard">
      <CabecalhoMobile />

      {/* "Conteúdo operacional mobile" (nós `g2Zz1h`/`wYZ1g`/`JqzlZ`):
          `$surface-soft`, folga 14/16/18/16. Aqui é quem rola — o cabeçalho
          fica fixo, como no desenho. */}
      <div className="flex min-h-0 flex-1 flex-col gap-sm overflow-y-auto px-base pt-3.5 pb-4.5">
        <IndicadorDeEtapa
          etapaAtual={etapaAtual}
          etapasVisitadas={etapasVisitadas}
          onIrPara={irPara}
        />

        {/* O cartão escuro é o mesmo `TotalDaVenda` do cartão de pagamento
            (008): o desenho o repete no topo das três etapas, e reimplementá-lo
            aqui duplicaria a leitura de `saldo()`. */}
        <TotalDaVenda />

        {etapaAtual === 1 && <EtapaClienteProdutos />}
        {etapaAtual === 2 && <EtapaPagamento />}
        {etapaAtual === 3 && <EtapaRevisao />}

        {/* "Navegação etapa N mobile" (nós `HQkFS`/`pW9hW`): altura 50, gap 8.
            Na etapa 3 só resta o voltar — o avanço de lá é finalizar a venda, e
            esse botão pertence a `EtapaRevisao` (004). */}
        <nav className="flex shrink-0 items-center gap-xs" data-testid="navegacao-wizard">
          {anterior !== null && (
            <button
              type="button"
              className="flex h-[50px] shrink-0 items-center justify-center gap-1.5 rounded-full border border-border bg-card px-base text-sm font-bold text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              data-testid="wizard-voltar"
              onClick={() => {
                irPara(anterior);
              }}
            >
              <ArrowLeft className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              {ETAPAS[anterior].rotuloVoltar}
            </button>
          )}

          {proxima !== null && (
            <button
              type="button"
              className="flex h-[50px] min-w-0 flex-1 items-center justify-center gap-xs rounded-full bg-primary px-base text-md font-bold text-primary-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              data-testid="wizard-avancar"
              onClick={() => {
                irPara(proxima);
              }}
            >
              <ArrowRight className="size-4.5 shrink-0" aria-hidden="true" />
              {ETAPAS[proxima].rotuloAvancar}
            </button>
          )}
        </nav>
      </div>
    </div>
  );
}

/**
 * "Cabeçalho mobile" (nó `fA5ib`): `$canvas`, folga 10/16, hairline embaixo.
 *
 * É o equivalente compacto da `BarraSuperior` do desktop, e a diferença não é
 * cosmética: no lugar dos dois botões inertes (display do cliente, menu
 * gerencial — telas de retaguarda, `FR-010`) o desenho põe a lixeira de
 * cancelar a venda (nó `T9VTw`, AD-089), que é a ação que o operador de fato
 * precisa alcançar de qualquer etapa.
 */
function CabecalhoMobile(): ReactElement {
  const sessao = useSessionStore((estado) => estado.registro?.SessaoUsuario);
  const identidade = sessao ?? {};
  const sessaoAtiva = descreverSessaoAtiva(identidade);
  const operador = nomeDoOperador(identidade);

  return (
    <header
      className="flex shrink-0 items-center justify-between gap-xs border-b border-border bg-background px-base py-2.5"
      data-testid="cabecalho-mobile"
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="flex size-[38px] shrink-0 items-center justify-center rounded-full bg-primary">
          <ShoppingCart className="size-[19px] text-primary-foreground" aria-hidden="true" />
        </div>
        <div className="flex min-w-0 flex-col gap-[1px]">
          <h1 className="truncate text-[17px] leading-[1.15] font-bold text-foreground">
            {tituloDoProduto(identidade)}
          </h1>
          {sessaoAtiva !== null && (
            <span className="truncate text-sm leading-[1.2] font-semibold text-muted-foreground">
              {sessaoAtiva}
            </span>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-xs">
        {operador !== null && (
          <div
            className="flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1.5"
            data-testid="operador-da-sessao"
          >
            <UserRound className="size-3.5 text-muted-foreground" aria-hidden="true" />
            <span className="text-sm font-semibold text-foreground">
              <span className="sr-only">Operador: </span>
              {operador}
            </span>
          </div>
        )}

        <AcaoCancelarVenda compacto />
      </div>
    </header>
  );
}

interface IndicadorDeEtapaProps {
  readonly etapaAtual: EtapaWizard;
  readonly etapasVisitadas: ReadonlySet<EtapaWizard>;
  readonly onIrPara: (etapa: EtapaWizard) => void;
}

/**
 * "Etapa N de 3 compacta mobile" (nós `VPzwH`/`HdFux`/`jsXLY`): título, o
 * contador `N/3` e três barras de 5px.
 *
 * As barras das etapas **já visitadas** são botões: é o gesto de navegação livre
 * que `FR-004` pede, e o desenho já as separa visualmente. A barra de uma etapa
 * ainda não visitada continua sendo um traço inerte — não há para onde voltar
 * numa etapa onde o operador nunca esteve.
 */
function IndicadorDeEtapa({
  etapaAtual,
  etapasVisitadas,
  onIrPara,
}: IndicadorDeEtapaProps): ReactElement {
  return (
    <section
      className="flex shrink-0 flex-col gap-xs rounded-[14px] border border-border bg-card px-sm py-2.5"
      data-testid="indicador-etapa"
    >
      <div className="flex items-center justify-between gap-xs">
        <h2 className="text-base font-bold text-foreground">{ETAPAS[etapaAtual].titulo}</h2>
        <span className="font-mono text-xs font-bold tabular-nums text-primary">
          {etapaAtual}/3
        </span>
      </div>

      <div className="flex items-center gap-1">
        {ORDEM.map((etapa) => {
          const visitada = etapasVisitadas.has(etapa);
          const classe = cn(
            'h-[5px] min-w-0 flex-1 rounded-full',
            visitada ? 'bg-primary' : 'bg-secondary',
          );

          if (!visitada || etapa === etapaAtual) {
            return <span key={etapa} className={classe} aria-hidden="true" />;
          }

          return (
            <button
              key={etapa}
              type="button"
              className={cn(classe, 'outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50')}
              data-testid={`ir-para-etapa-${String(etapa)}`}
              aria-label={`Voltar para ${ETAPAS[etapa].titulo}`}
              onClick={() => {
                onIrPara(etapa);
              }}
            />
          );
        })}
      </div>
    </section>
  );
}
