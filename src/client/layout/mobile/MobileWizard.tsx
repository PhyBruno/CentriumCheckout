import { ArrowLeft, ArrowRight, ShoppingCart, UserRound } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { cn } from '@/lib/utils';
import { AcaoCancelarVenda } from '../../features/finalizacao-suspensao/AcoesFinaisVenda';
import { TotalDaVenda } from '../../features/pagamento/TotalDaVenda';
import {
  NOME_DO_PRODUTO,
  descreverSessaoAtiva,
  nomeDoOperador,
} from '../../domain/sessao/identidadePdv';
import { useSessionStore } from '../../stores/sessionStore';
import { useVendaStore } from '../../stores/vendaStore';
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
   * A venda seguinte começa na etapa 1 (I1), mesmo sem desmonte.
   *
   * `data-model.md` §2 supunha que finalizar trocaria de tela e remontaria o
   * wizard — não é o que acontece: `useFinalizarOuSuspenderVenda` zera o
   * carrinho e chama `abrirSessaoDeVenda('NOVA')` **na mesma árvore**, que
   * segue montada. Sem este reinício o operador terminava a venda e ficava
   * parado na "Revisão e finalização" de uma venda vazia, com o campo de código
   * do próximo cliente uma etapa atrás — e com atalhos para etapas visitadas
   * numa venda que nunca as viu.
   *
   * A identidade da sessão é o `VENDA_INICIADA` que abre o histórico: um objeto
   * novo a cada `resetarAuditoria` e o **mesmo** durante toda a venda, por mais
   * eventos que entrem depois dele. Pendurar isto no tamanho do histórico
   * jogaria o operador de volta à etapa 1 a cada bipagem.
   *
   * Comparação durante o render, e não `useEffect`, pelo mesmo motivo de
   * `ConfiguracaoPagamento`: o reinício acontece antes da pintura, sem um quadro
   * intermediário exibindo a etapa da venda anterior.
   */
  const sessaoDeVenda = useVendaStore((estado) => estado.eventos[0] ?? null);
  const [sessaoAnterior, setSessaoAnterior] = useState(sessaoDeVenda);
  if (sessaoDeVenda !== sessaoAnterior) {
    setSessaoAnterior(sessaoDeVenda);
    setEtapaAtual(1);
    setEtapasVisitadas(new Set<EtapaWizard>([1]));
  }

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
          fica fixo, como no desenho.

          `overflow-x-hidden` junto do `overflow-y-auto`, nunca sozinho: pelo
          CSS, `overflow-x: visible` ao lado de um `overflow-y` não-visível é
          **computado como `auto`**, e foi exatamente o que aconteceu aqui — o
          card de cliente expandido media 655px sobre 390px de viewport e esta
          coluna virou uma barra de rolagem lateral, arrastando a tela inteira
          para o lado ao abrir um modal (achado em 2026-09-08). As origens do
          estouro foram corrigidas uma a uma; o corte fica como rede de
          segurança, e não come anel de foco nenhum porque os 16px de `px-base`
          são folga de sobra para os 3px de `focus-visible`. */}
      <div className="flex min-h-0 flex-1 flex-col gap-sm overflow-x-hidden overflow-y-auto px-base pt-3.5 pb-4.5">
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
            esse botão pertence a `EtapaRevisao` (004).

            Os dois botões encolhem (`min-w-0` + `truncate` no rótulo) em vez de
            estourar a lateral: na etapa 2 eles somam "Cliente e produtos" e
            "Ver produtos e pagamento" na mesma linha de 358px úteis, e o
            `shrink-0` que o voltar tinha empurrava o par para fora da tela
            assim que um rótulo crescesse. Cortar o texto é o desfecho certo
            aqui — a seta e a posição já dizem para onde o botão leva. */}
        <nav className="flex shrink-0 items-center gap-xs" data-testid="navegacao-wizard">
          {anterior !== null && (
            <button
              type="button"
              className="flex h-[50px] min-w-0 shrink items-center justify-center gap-1.5 rounded-full border border-border bg-card px-base text-sm font-bold text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              data-testid="wizard-voltar"
              onClick={() => {
                irPara(anterior);
              }}
            >
              <ArrowLeft className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="truncate">{ETAPAS[anterior].rotuloVoltar}</span>
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
              <span className="truncate">{ETAPAS[proxima].rotuloAvancar}</span>
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
      {/* `flex-1` na marca e `shrink` (não `shrink-0`) nas ações: as duas metades
          do cabeçalho disputam 358px, e enquanto só a marca encolhia sobrava
          espaço de menos para o título enquanto a pílula do operador não cedia
          um pixel (achado em 2026-09-08). Agora as duas cortam, cada uma com o
          seu `truncate`. */}
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <div className="flex size-[38px] shrink-0 items-center justify-center rounded-full bg-primary">
          <ShoppingCart className="size-[19px] text-primary-foreground" aria-hidden="true" />
        </div>
        <div className="flex min-w-0 flex-col gap-[1px]">
          {/* **Só o nome do produto**, e não `tituloDoProduto` — que é o do
              desktop e acrescenta a empresa. É o que o Pencil escreve no nó
              `YXaRZ`, e o motivo aparece medindo: com a empresa junto, o título
              real ("Centrium Checkout - Organizações Tabajara") virava
              "Centrium …" em 390px, custando **as duas** informações de uma vez.
              Encolher a pílula do operador não resolveu porque não havia largura
              a redistribuir. A empresa continua na barra do desktop; aqui ela
              cede lugar ao que o operador não pode perder — saber em que
              programa está e, na linha de baixo, em qual caixa/PDV. */}
          <h1 className="truncate text-[17px] leading-[1.15] font-bold text-foreground">
            {NOME_DO_PRODUTO}
          </h1>
          {sessaoAtiva !== null && (
            <span className="truncate text-sm leading-[1.2] font-semibold text-muted-foreground">
              {sessaoAtiva}
            </span>
          )}
        </div>
      </div>

      <div className="flex min-w-0 shrink items-center gap-xs">
        {operador !== null && (
          <div
            className="flex min-w-0 items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1.5"
            data-testid="operador-da-sessao"
          >
            <UserRound className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            {/* Teto de largura só no compacto (`md:max-w-none` devolve o
                desktop). Sem ele as duas metades do cabeçalho encolhem juntas e
                o flex tira mais de quem é maior — o título —, então um
                `UsuarioNome` longo ("Operador de Teste") ficava inteiro
                enquanto "Centrium Checkout" virava "Centrium …" (medido no
                navegador em 390px, 2026-09-09). A prioridade correta é a
                inversa: o operador reconhece o próprio nome pelo começo, e
                `title` guarda o valor inteiro; já o nome do programa truncado
                não diz nada a ninguém. O desenho supõe um nome curto no chip
                (`fdw9t` mostra "Bruno"), o que este teto reproduz para
                qualquer tamanho de cadastro. */}
            <span
              className="max-w-[5rem] truncate text-sm font-semibold text-foreground md:max-w-none"
              title={operador}
            >
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

      {/* As barras têm 5px de altura por desenho (nó `WUzPm`), e 5px é um alvo
          impossível para o dedo. `cc-alvo-toque` (`global.css`) cresce só a área
          **sensível** para 44px com um pseudo-elemento transparente, sem mover
          nem engordar um pixel do traço que o Pencil especifica. */}
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
              className={cn(
                classe,
                'cc-alvo-toque outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
              )}
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
