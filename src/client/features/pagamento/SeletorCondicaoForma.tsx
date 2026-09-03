import { ChevronDown, CreditCard, Layers } from 'lucide-react';
import {
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { acaoBloqueavel, atributosDeBloqueio, type MotivoBloqueio } from '@/lib/bloqueio';
import { cn } from '@/lib/utils';
import type { CondicaoPagamento, FormaPagamento } from '../../domain/pagamento/formaPagamento';
import { formaDisponivel } from '../../domain/pagamento/roteamentoIntegracao';
import { useCondicoesPagamento } from '../../services/pagamento/pagamentoQueries';
import { useVendaStore } from '../../stores/vendaStore';

/**
 * Comboboxes de **condição** e **forma** de pagamento do cartão "Pagamento e
 * totais" (T019, `FR-001`..`FR-003`).
 *
 * Fonte visual: `design/HTML - Pencil/CentriumCheckout.html` (export estático do
 * `.pen`; o MCP do Pencil não conectou nesta sessão — `CONNECTION_CLOSED`),
 * nós `oGiPa` "Condição de pagamento" (linhas 2451–2512) e `uZUQX` "Seleção de
 * pagamentos" (linhas 2667–2728), os dois filhos do cartão `OzP7o`.
 *
 * **Duas superfícies, um catálogo.** O catálogo do ERP é hierárquico —
 * `SessaoUsuario.CondicoesDePagamento[].CondicaoFormasDePagamento[]` —, então a
 * lista de formas **não** é uma segunda consulta: são as `formas` da condição
 * escolhida. É por isso que o combobox de forma fica bloqueado enquanto não há
 * condição: sem ela não existe conjunto de formas a oferecer, e inventar um
 * (por exemplo, a união das formas de todas as condições) ofereceria ao operador
 * uma forma que a condição da venda não aceita.
 *
 * **Nenhuma regra de disponibilidade mora aqui** (Constitution II / SOLID): quem
 * decide se a forma pode ser oferecida é `formaDisponivel(forma, capacidades)`
 * em `domain/pagamento/roteamentoIntegracao.ts`. O componente só traduz o `false`
 * em bloqueio explicativo.
 */

/** Uma linha da lista aberta do combobox. */
export interface OpcaoCombobox {
  readonly chave: string;
  readonly texto: string;
  readonly selecionada: boolean;
  /** `null` = escolhível; texto = frase que o operador lê ao tentar escolher. */
  readonly bloqueio: MotivoBloqueio;
  readonly aoEscolher: () => void;
}

export interface ComboboxPagamentoProps {
  /** Sempre obrigatório — é o nome acessível do controle, visível ou não. */
  readonly rotulo: string;
  /** `false` quando o bloco já tem um cabeçalho próprio (caso do tipo de ajuste). */
  readonly rotuloVisivel?: boolean;
  readonly icone: ReactNode;
  readonly textoSelecionado: string | null;
  readonly placeholder: string;
  readonly opcoes: readonly OpcaoCombobox[];
  /** Bloqueio do combobox inteiro (catálogo carregando, sem condição escolhida…). */
  readonly bloqueio: MotivoBloqueio;
  /** Borda 1.5px em `--primary`, como o Pencil desenha o combobox de condição. */
  readonly destacado?: boolean;
  readonly classeTrigger?: string;
  readonly classeTexto?: string;
  readonly testId: string;
  readonly idOpcao: (chave: string) => string;
}

/**
 * Combobox do cartão de pagamento — compartilhado pelos dois seletores deste
 * arquivo e pelo tipo de ajuste de `ControleDescontoCapa.tsx`.
 *
 * **Não é um `<select>` nativo.** Um `<option disabled>` é inerte e silencioso,
 * exatamente o que `lib/bloqueio.ts` proíbe: a forma indisponível (Pix sem
 * `pixAtivo`) precisa **explicar por que** ao ser clicada, e no nativo o clique
 * nem chega ao JavaScript. Daí o par `<button role="combobox">` +
 * `<ul role="listbox">` com cada opção passando por `acaoBloqueavel`.
 *
 * **A lista aberta é decisão de implementação, não leitura do design**: o
 * export do Pencil só modela o combobox fechado — não existe nó de estado
 * aberto em nenhuma das telas. Os valores usados (raio 12, borda `$hairline`,
 * fundo `$canvas`, linhas de 44px, realce `$surface-strong`) são os mesmos
 * tokens do controle fechado, para a lista não introduzir vocabulário visual
 * que o produto não tem.
 */
export function ComboboxPagamento({
  rotulo,
  rotuloVisivel = true,
  icone,
  textoSelecionado,
  placeholder,
  opcoes,
  bloqueio,
  destacado = false,
  classeTrigger = '',
  classeTexto = 'text-md',
  testId,
  idOpcao,
}: ComboboxPagamentoProps): ReactElement {
  const [aberto, setAberto] = useState(false);
  const idRotulo = useId();
  const idLista = useId();
  const trigger = useRef<HTMLButtonElement>(null);

  function fecharEDevolverFoco(): void {
    setAberto(false);
    trigger.current?.focus();
  }

  function aoTeclar(evento: KeyboardEvent<HTMLDivElement>): void {
    if (evento.key === 'Escape' && aberto) {
      evento.preventDefault();
      fecharEDevolverFoco();
    }
  }

  return (
    <div
      className="relative flex w-full flex-col gap-[6px]"
      onKeyDown={aoTeclar}
      // Fecha ao sair do conjunto (TAB para fora, clique em outro controle) sem
      // ouvinte global de documento: `relatedTarget` já diz para onde o foco
      // foi, e um listener em `document` fecharia a lista também quando o foco
      // apenas passeia entre as próprias opções.
      onBlur={(evento) => {
        const proximo = evento.relatedTarget;
        if (!(proximo instanceof Node) || !evento.currentTarget.contains(proximo)) {
          setAberto(false);
        }
      }}
    >
      {rotuloVisivel ? (
        <span className="text-base font-semibold text-foreground" id={idRotulo}>
          {rotulo}
        </span>
      ) : null}

      <button
        ref={trigger}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={aberto}
        aria-controls={idLista}
        {...(rotuloVisivel ? { 'aria-labelledby': idRotulo } : { 'aria-label': rotulo })}
        className={cn(
          'flex h-11 w-full items-center justify-between gap-xs rounded-lg bg-muted px-[14px] text-left',
          destacado ? 'border-[1.5px] border-primary' : 'border border-border',
          classeTrigger,
        )}
        data-testid={testId}
        {...atributosDeBloqueio(bloqueio)}
        onClick={acaoBloqueavel(bloqueio, () => {
          setAberto((atual) => !atual);
        })}
      >
        <span className="flex min-w-0 items-center gap-[9px]">
          <span className="shrink-0" aria-hidden="true">
            {icone}
          </span>
          <span
            className={cn(
              'truncate font-semibold',
              classeTexto,
              textoSelecionado === null ? 'text-muted-foreground' : 'text-foreground',
            )}
          >
            {textoSelecionado ?? placeholder}
          </span>
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>

      {aberto ? (
        <ul
          id={idLista}
          role="listbox"
          aria-label={rotulo}
          className="absolute top-full right-0 left-0 z-10 mt-[6px] max-h-[264px] overflow-y-auto rounded-lg border border-border bg-card p-[4px] shadow-lg"
          data-testid={`${testId}-lista`}
        >
          {opcoes.length === 0 ? (
            <li className="px-sm py-[10px] text-base text-muted-foreground">
              Nenhuma opção disponível.
            </li>
          ) : (
            opcoes.map((opcao) => (
              // `role="presentation"` no `<li>` e `role="option"` no `<button>`:
              // o filho de um `listbox` precisa ser `option`, e a opção precisa
              // ser um controle real para receber foco por TAB e chegar ao
              // handler mesmo bloqueada (`aria-disabled`, nunca `disabled`).
              <li key={opcao.chave} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={opcao.selecionada}
                  className={cn(
                    'flex h-11 w-full items-center rounded-md px-sm text-left text-base font-semibold text-foreground',
                    'hover:bg-secondary aria-disabled:cursor-not-allowed aria-disabled:opacity-50',
                    opcao.selecionada && 'bg-secondary',
                  )}
                  data-testid={idOpcao(opcao.chave)}
                  {...atributosDeBloqueio(opcao.bloqueio)}
                  onClick={acaoBloqueavel(opcao.bloqueio, () => {
                    opcao.aoEscolher();
                    fecharEDevolverFoco();
                  })}
                >
                  <span className="truncate">{opcao.texto}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * Combobox de condição de pagamento (nó `oGiPa`): rótulo Inter 13/600, controle
 * de 44px com raio 12, fundo `$surface-soft` e **borda de 1.5px em `$cb-blue`**,
 * ícone lucide `layers` de 16px na cor primária, texto 14/600 e `chevron-down`
 * de 16px em `$body`.
 *
 * A borda primária é constante, como o desenho a traz: no cartão ela marca a
 * condição como o **primeiro passo** do pagamento, não um estado de foco — os
 * outros comboboxes da mesma tela (forma, tipo de ajuste) aparecem com a borda
 * `$hairline` de 1px mesmo já tendo valor escolhido, então a diferença não é
 * "preenchido × vazio".
 *
 * Estado sem escolha: o único ponto em que o desenho não ajuda (ele mostra só
 * "2x sem juros"). O controle exibe o placeholder em `$body`, mesmo tratamento
 * que o campo de contato do card de cliente dá à ausência de dado.
 */
export function SeletorCondicaoPagamento(): ReactElement {
  const catalogo = useCondicoesPagamento();
  const condicaoSelecionada = useVendaStore((estado) => estado.condicaoSelecionada);
  const selecionarCondicao = useVendaStore((estado) => estado.selecionarCondicao);

  const condicoes = catalogo.data?.condicoes ?? [];

  const bloqueio: MotivoBloqueio = catalogo.isPending
    ? 'Aguarde: o catálogo de condições de pagamento ainda está carregando.'
    : catalogo.isError
      ? 'Catálogo de pagamento indisponível: recarregue a tela de venda.'
      : condicoes.length === 0
        ? 'Nenhuma condição de pagamento cadastrada para este ponto de venda.'
        : null;

  return (
    <ComboboxPagamento
      rotulo="Condição de pagamento"
      icone={<Layers className="size-4 text-primary" />}
      textoSelecionado={condicaoSelecionada?.descricao ?? null}
      placeholder={catalogo.isPending ? 'Carregando condições…' : 'Selecione a condição'}
      opcoes={condicoes.map((condicao: CondicaoPagamento) => ({
        chave: String(condicao.codigo),
        texto: condicao.descricao,
        selecionada: condicao.codigo === condicaoSelecionada?.codigo,
        bloqueio: null,
        aoEscolher: () => {
          selecionarCondicao(condicao);
        },
      }))}
      bloqueio={bloqueio}
      destacado
      testId="combobox-condicao-pagamento"
      idOpcao={(chave) => `opcao-condicao-${chave}`}
    />
  );
}

export interface SeletorFormaPagamentoProps {
  readonly formaSelecionada: FormaPagamento | null;
  readonly onSelecionarForma: (forma: FormaPagamento) => void;
}

/**
 * Combobox de forma de pagamento (nó `uZUQX` "Seleção de pagamentos"): rótulo
 * "Forma de pagamento" Inter 13/600 e controle de 44px, raio 12, fundo
 * `$surface-soft`, borda `$hairline` de 1px, ícone `credit-card` de 16px em
 * `$body` e texto 14/600.
 *
 * **Controlado por props, não pelo store** — de propósito. A forma escolhida é
 * um rascunho da próxima inserção, não estado da venda: o que o
 * `pagamentoSlice` guarda é a lista de `PagamentoAplicado` já aplicados
 * (`contracts/pagamento-domain-api.md` §2, que não tem campo de forma
 * corrente). Guardá-la no store criaria estado que sobrevive à venda sem
 * nenhuma action responsável por limpá-lo. Quem a segura é o cartão que compõe
 * este seletor com `EntradaPagamento` — os dois precisam da mesma forma, e o
 * pai comum é o lugar natural dela.
 *
 * `formaDisponivel` **desabilita, não oculta** (`FR-002`/`FR-003`): sumir com o
 * PIX faria o operador procurar por uma forma que o cadastro tem e a tela não
 * mostra; bloqueada com motivo, o clique ensina que falta a integração PIX
 * neste PDV.
 */
export function SeletorFormaPagamento({
  formaSelecionada,
  onSelecionarForma,
}: SeletorFormaPagamentoProps): ReactElement {
  const catalogo = useCondicoesPagamento();
  const condicaoSelecionada = useVendaStore((estado) => estado.condicaoSelecionada);

  const capacidades = catalogo.data?.capacidades ?? null;
  const formas = condicaoSelecionada?.formas ?? [];

  const bloqueio: MotivoBloqueio = catalogo.isPending
    ? 'Aguarde: o catálogo de formas de pagamento ainda está carregando.'
    : condicaoSelecionada === null
      ? 'Escolha primeiro a condição de pagamento: as formas disponíveis vêm dela.'
      : formas.length === 0
        ? 'Esta condição de pagamento não tem nenhuma forma cadastrada.'
        : null;

  return (
    <ComboboxPagamento
      rotulo="Forma de pagamento"
      icone={<CreditCard className="size-4 text-muted-foreground" />}
      textoSelecionado={formaSelecionada?.descricao ?? null}
      placeholder="Selecione a forma"
      opcoes={formas.map((forma) => ({
        chave: String(forma.codigo),
        texto: forma.descricao,
        selecionada: forma.codigo === formaSelecionada?.codigo,
        // `capacidades === null` só acontece com o catálogo ainda em voo, e aí o
        // combobox inteiro já está bloqueado — a opção não chega a ser clicável.
        bloqueio:
          capacidades !== null && !formaDisponivel(forma, capacidades)
            ? motivoDeIndisponibilidade(forma)
            : null,
        aoEscolher: () => {
          onSelecionarForma(forma);
        },
      }))}
      bloqueio={bloqueio}
      testId="combobox-forma-pagamento"
      idOpcao={(chave) => `opcao-forma-${chave}`}
    />
  );
}

/**
 * Por que a forma está indisponível — a frase que o operador lê ao clicar nela.
 *
 * Hoje `formaDisponivel` recusa **um** caso: `Pix` com `pixAtivo: false`
 * (`roteamentoIntegracao.ts`) — não há caminho manual para confirmar um PIX
 * dinâmico sem a integração. A frase nomeia essa causa porque é a única que
 * existe; se o domínio passar a recusar outra forma, o motivo precisa acompanhar
 * nos dois lugares, e é para isso que a função é separada e citada aqui.
 */
function motivoDeIndisponibilidade(forma: FormaPagamento): string {
  return `${forma.descricao} indisponível: a integração PIX não está ativa neste ponto de venda.`;
}
