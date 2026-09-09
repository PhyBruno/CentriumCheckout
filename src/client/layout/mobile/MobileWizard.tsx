import { ArrowLeft, ArrowRight, ShoppingCart, UserRound } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { atributosDeBloqueio, type MotivoBloqueio } from '@/lib/bloqueio';
import { notificar } from '@/lib/notificar';
import { cn } from '@/lib/utils';
import { AcaoCancelarVenda } from '../../features/finalizacao-suspensao/AcoesFinaisVenda';
import { TotalDaVenda } from '../../features/pagamento/TotalDaVenda';
import {
  NOME_DO_PRODUTO,
  descreverSessaoAtiva,
  nomeDoOperador,
} from '../../domain/sessao/identidadePdv';
import { linhasAtivas } from '../../domain/precificacao/linha';
import { useFocoVendaStore } from '../../stores/focoVendaStore';
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

/**
 * Frases das duas recusas de navegação (pedido do usuário, 2026-09-09).
 *
 * São as mesmas em todas as superfícies que navegam — botão "avançar" e as
 * barrinhas do indicador —, porque a regra é uma só: o texto mora aqui para que
 * mudar a regra não deixe uma segunda redação para trás.
 */
const MOTIVO_SEM_PRODUTO = 'Insira ao menos um produto na venda antes de avançar para o pagamento.';
const MOTIVO_SALDO_EM_ABERTO =
  'Adicione formas de pagamento que cubram todo o valor da venda antes de revisar.';

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
   * Há mercadoria de fato na venda? — `linhasAtivas`, não `linhas`.
   *
   * A linha cancelada permanece no array por rastreabilidade (`CART-08`), e é
   * exatamente o caso que o usuário relatou ("todos deletados"): contá-la aqui
   * deixaria passar para o pagamento uma venda sem nada a cobrar.
   */
  const temProduto = useVendaStore((estado) => linhasAtivas(estado.linhas).length > 0);
  /**
   * Primitivo, não o objeto de `saldo()`: o seletor monta um objeto novo a cada
   * chamada e o Zustand v5 leria a referência nova como mudança, pondo o
   * componente em laço (mesma razão de `TotalDaVenda` e `useVendaTemValorAFaturar`).
   *
   * `saldoRestante === 0` é a **mesma** condição que libera o "Finalizar"
   * (`AcoesFinaisVenda`), e por isso cobre o troco de graça: `calcularSaldo`
   * nunca deixa o restante negativo, então pagar a mais fecha a venda igual a
   * pagar exato.
   */
  const saldoRestante = useVendaStore((estado) => estado.saldo().saldoRestante);
  const focarCodigoProduto = useFocoVendaStore((estado) => estado.focarCodigoProduto);

  /**
   * Por que entrar em `etapa` está barrado — a frase que o operador lê, ou
   * `null` quando o caminho está livre (padrão de `lib/bloqueio.ts`).
   *
   * **A etapa 1 nunca barra**: ela é o lugar onde se corrige o que falta, e
   * prender o operador longe dela seria o único desfecho sem saída. Voltar é
   * sempre permitido (`FR-004`).
   *
   * A regra aqui é de **navegação**, não de finalização: quem recusa faturar
   * continua sendo `AcoesFinaisVenda` (saldo, vendedor, veredito da 014). O que
   * esta função evita é o passo em falso — abrir o pagamento de uma venda vazia
   * (item 1 do usuário, 2026-09-09) ou a conferência de uma venda que ainda não
   * fecha (item 2). Isso revoga a decisão anterior de não validar navegação
   * (I3): o custo de descobrir o problema uma tela adiante é maior que o de
   * ouvir o motivo no gesto.
   */
  function motivoParaEntrarNaEtapa(etapa: EtapaWizard): MotivoBloqueio {
    if (etapa === 1) {
      return null;
    }
    if (!temProduto) {
      return MOTIVO_SEM_PRODUTO;
    }
    if (etapa === 3 && saldoRestante > 0) {
      return MOTIVO_SALDO_EM_ABERTO;
    }
    return null;
  }

  /**
   * Navega para `etapa`, marcando-a como visitada — ou recusa com o motivo.
   *
   * A recusa mora aqui, e não em `acaoBloqueavel` no botão, porque as duas
   * superfícies de navegação (o botão de avançar e as barrinhas do indicador)
   * chamam esta função: distribuir a checagem pelos dois `onClick` criaria dois
   * pontos para manter iguais. A reavaliação no gesto é a mesma política de
   * `acaoBloqueavel` — o estado pode mudar entre a renderização e o clique.
   *
   * **Sem produto, o operador é levado de volta à etapa 1 e o foco vai para o
   * campo de código** (pedido do usuário, 2026-09-09): a barra de entrada
   * rápida só existe lá, e mandar "insira um produto" deixando o caixa numa
   * tela onde não há onde inserir seria um aviso sem saída.
   */
  function irPara(etapa: EtapaWizard): void {
    const motivo = motivoParaEntrarNaEtapa(etapa);
    if (motivo !== null) {
      notificar.erro(motivo);
      if (motivo === MOTIVO_SEM_PRODUTO) {
        setEtapaAtual(1);
        focarCodigoProduto();
      }
      return;
    }

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
  const bloqueioDeAvanco = proxima === null ? null : motivoParaEntrarNaEtapa(proxima);

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
      <div className="flex min-h-0 flex-1 flex-col gap-xs overflow-x-hidden overflow-y-auto px-base pt-2.5 pb-2.5">
        <IndicadorDeEtapa
          etapaAtual={etapaAtual}
          etapasVisitadas={etapasVisitadas}
          bloqueioDaEtapa={motivoParaEntrarNaEtapa}
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
            // Apagado e anunciado como desabilitado, **sem `disabled`**
            // (`lib/bloqueio.ts`, AD-143): o `disabled` nativo não dispara
            // clique nenhum, e o motivo — que é a informação de que o operador
            // precisa — nunca chegaria a ele. Aqui o clique passa, `irPara`
            // recusa e a frase aparece. As classes de opacidade e cursor vêm
            // escritas à mão porque este é um `<button>` cru, fora do
            // `components/ui/button.tsx` que as traz no `cva`.
            <button
              type="button"
              className="flex h-[50px] min-w-0 flex-1 items-center justify-center gap-xs rounded-full bg-primary px-base text-md font-bold text-primary-foreground outline-none aria-disabled:cursor-not-allowed aria-disabled:opacity-50 focus-visible:ring-[3px] focus-visible:ring-ring/50"
              data-testid="wizard-avancar"
              {...atributosDeBloqueio(bloqueioDeAvanco)}
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
            {/* Teto de largura só na tela **estreita de verdade** — `sm:` são
                640px de largura real, uma consulta de mídia comum, ao contrário
                de `md:`, que desde AD-198 significa "estou na árvore desktop" e
                não uma largura. A distinção importa aqui: o teto foi medido em
                390px, e prendê-lo a `md:` o manteria ativo em toda a árvore
                compacta — inclusive num tablet de 820px sem mouse, onde há
                folga de sobra —, deixando "Operador d…" truncado à toa.

                Sem ele as duas metades do cabeçalho encolhem juntas e
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
              className="max-w-[5rem] truncate text-sm font-semibold text-foreground sm:max-w-none"
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
  /**
   * Por que a etapa está barrada agora — só para **anunciar** (`aria-disabled`,
   * `title`). Quem recusa de fato continua sendo `onIrPara`, que reavalia no
   * gesto; uma barrinha visitada pode deixar de ser alcançável entre a
   * renderização e o toque (o operador apaga o último item, por exemplo).
   */
  readonly bloqueioDaEtapa: (etapa: EtapaWizard) => MotivoBloqueio;
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
  bloqueioDaEtapa,
  onIrPara,
}: IndicadorDeEtapaProps): ReactElement {
  return (
    <section
      className="flex shrink-0 flex-col gap-1.5 rounded-[14px] border border-border bg-card px-sm py-2"
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
              {...atributosDeBloqueio(bloqueioDaEtapa(etapa))}
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
