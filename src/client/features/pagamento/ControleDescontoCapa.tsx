import { ArrowRight } from 'reicon-react';
import { useState, type KeyboardEvent, type ReactElement } from 'react';
import { notificar } from '@/lib/notificar';
import { acaoBloqueavel, atributosDeBloqueio, type MotivoBloqueio } from '@/lib/bloqueio';
import { lerCentavosDigitados, lerDecimalDigitado } from '@/lib/numeroDigitado';
import { cn } from '@/lib/utils';
import { resolverDescontoCapa, tetoDaCapa } from '../../domain/pagamento/descontoCapa';
import {
  ZERO_CENTAVOS,
  centavos,
  formatarCentavos,
  reaisDeCentavos,
  type Centavos,
} from '../../domain/precificacao/dinheiro';
import type { DescontoCapa } from '../../domain/pagamento/descontoCapa';
import { totalVenda } from '../../domain/precificacao/linha';
import {
  AVISO_CONDICAO_SEM_DESCONTO,
  AVISO_DESCONTO_COM_PAGAMENTO,
} from '../../stores/slices/pagamentoSlice';
import { useVendaStore } from '../../stores/vendaStore';

type ModoAjuste = 'PERCENTUAL' | 'VALOR';

/**
 * O texto que representa um desconto **já aplicado** — o que o campo mostra
 * quando reabre sobre uma venda que já tem ajuste.
 *
 * Existe porque a feature 007 criou caminhos de remonte que não existiam quando
 * este controle nasceu: no wizard mobile ele só vive na etapa 2, então ir à
 * revisão e voltar o desmonta e remonta, e o mesmo vale para a travessia do
 * breakpoint. Sem isto o campo reabria **vazio** com um desconto de 10% valendo
 * na venda — e, como o `onBlur` trata campo vazio como "desisti do ajuste",
 * bastava o operador tabular por ele para o desconto sumir sem que ninguém o
 * tivesse removido. O TSDoc do `modo` logo abaixo já dizia a regra ("um desconto
 * já aplicado continua mandando"); faltava o número obedecê-la.
 *
 * **A conversão monetária continua fora daqui**: `reaisDeCentavos` é do domínio,
 * o mesmo que o resto da base usa para sair de centavos. O que o componente
 * escolhe é só a vírgula decimal do português, que é apresentação.
 */
function textoDoDescontoAplicado(desconto: DescontoCapa | null): string {
  if (desconto === null) {
    return '';
  }
  if (desconto.modo === 'PERCENTUAL') {
    // `entrada` é o percentual como o operador o digitou — ou como o ERP o
    // cadastrou na condição, que pode ter mais casas (3,25%, 017 D9): exibido
    // inteiro, com a vírgula do português.
    return String(desconto.entrada).replace('.', ',');
  }
  return reaisDeCentavos(centavos(desconto.entrada)).toFixed(2).replace('.', ',');
}

/**
 * `"5"`, `"5,5"`, `",5"` ou `"5.5"` → `5.5`/`0.5`; entrada inválida vira `null`
 * (regras de digitação comuns a todo campo numérico em `lib/numeroDigitado`).
 *
 * **Uma casa decimal, não duas** (pedido do usuário, 2026-09-04): `"99,9"` é o
 * formato do produto. A segunda casa não sobrevive ao arredondamento em nenhum
 * carrinho pequeno — `aplicarPercentual` fecha em centavo inteiro, de modo que
 * `10,25%` e `10,3%` de R$ 40,00 dão o mesmo valor — e prometia uma precisão
 * que o resultado nunca teve.
 */
function lerPercentualDigitado(texto: string): number | null {
  return lerDecimalDigitado(texto, 1);
}

/**
 * A entrada do domínio que o texto representa no modo dado — centavos em
 * `'VALOR'`, percentual em `'PERCENTUAL'` — ou `null` quando o texto não é
 * legível nesse modo. Campo vazio vale zero (`lib/numeroDigitado`).
 */
function lerEntradaDigitada(modo: ModoAjuste, texto: string): number | null {
  return modo === 'VALOR' ? lerCentavosDigitados(texto) : lerPercentualDigitado(texto);
}

const AVISO_FORMATO: Record<ModoAjuste, string> = {
  VALOR: 'Valor inválido: use apenas números, com até duas casas decimais.',
  PERCENTUAL: 'Percentual inválido: use apenas números, com até uma casa decimal.',
};

/**
 * Desconto de capa da venda (T035, `FR-015`/AD-039) — nó `Jup0R` "Desconto e
 * acréscimo" do Pencil (`design/HTML - Pencil/CentriumCheckout.html`, linhas
 * 2513–2666; o MCP do Pencil não conectou nesta sessão, `CONNECTION_CLOSED`).
 *
 * **Desvio consciente do `tasks.md`, e o design venceu.** A tarefa T035 pede um
 * `ModalDescontoCapa.tsx`, mas **não existe modal de desconto de capa no
 * Pencil**: o desenho põe o controle inline no cartão "Pagamento e totais"
 * (`OzP7o`), entre a condição de pagamento (`oGiPa`, `top: 178px`) e a seleção
 * de formas. Como a regra do projeto é que o design é a fonte de verdade
 * (CLAUDE.md § "Referência visual (design)"), o controle nasce inline. Um modal
 * também custaria dois gestos a mais por venda num ajuste que o caixa faz com
 * frequência.
 *
 * O que o desenho monta, e o que cada peça faz:
 *
 * - **Cabeçalho** (`iJ4fT`/`zpr9g`) — Inter 13/600. O desenho o rotula
 *   "Desconto / Acréscimo"; aqui ele é só "Desconto" (ver abaixo).
 * - **"Campo valor ajuste"** (`a2PXo`) — ocupa a linha inteira, 44px, raio
 *   12, `padding: 0 8px`, valor em **Geist Mono 14/600** e, encostado à direita,
 *   o "Toggle unidade ajuste" (`FC8Sd`): dois botões de 28px e raio 8, o inativo
 *   em `$surface-strong`/`$body` e o ativo em `$cb-blue`/branco, rótulos 11/700.
 * - **"Valor calculado ajuste"** (`Zdqgn`) — alinhado à direita: ícone `equal`
 *   de 12px, o "Equivalente financeiro" (`O89FKo`) em **Geist Mono 12/700 na cor
 *   `$warning`** e a legenda "sobre o subtotal" em Inter 11/500.
 *
 * O toggle R$/% é literalmente o `modo` do domínio: `'VALOR'` e `'PERCENTUAL'`
 * de `DescontoCapa` (`domain/pagamento/descontoCapa.ts`). O "Equivalente
 * financeiro" é o `valorResolvido` que o slice já calculou por
 * `resolverDescontoCapa` — o componente **nunca** converte percentual em reais
 * por conta própria; ele formata com `formatarCentavos` o que o domínio
 * resolveu.
 *
 * **"Acréscimo" não existe — nem no domínio, nem no ERP.** O nó `uEPUi`
 * ("Combobox tipo ajuste", 158×44) oferece escolher entre desconto e acréscimo,
 * e a implementação original o reproduziu com a opção "Acréscimo" bloqueada com
 * motivo. Essa leitura caiu em 2026-09-04: `CheckoutFaturarNFCe`
 * (`ApiCentriumOAuth.yaml`, linhas 1462–1553) **não tem nenhum campo de
 * acréscimo** — a única saída monetária de ajuste é `DescontoPercentual`/
 * `DescontoValor` por linha de produto, que é justamente onde o rateio de
 * AD-098 grava. Não existe payload capaz de transportar um acréscimo ao ERP, e
 * `FR-015`/AD-039 tampouco o preveem.
 *
 * Um seletor de um item só não é um seletor: com o acréscimo impossível, o
 * combobox foi **removido** e o bloco virou o que sempre foi — o campo de
 * desconto da capa. Mantê-lo custava 158px da largura do cartão para prometer
 * uma opção que nenhuma camada abaixo consegue cumprir, e era ele que
 * espremia o campo de valor até o toggle R$/% escapar para fora do cartão
 * (o scroll lateral relatado no mesmo dia).
 *
 * **Teto da condição, sem autorização** (017, AD-279 — supera o "sem teto" de
 * `FR-015`/AD-039): escolher a condição preenche a capa com o desconto dela, e o
 * percentual máximo da condição limita a digitação. Quem aplica e ajusta é o
 * slice; aqui o teto é só mostrado, o equivalente nunca passa dele, e o texto é
 * reescrito com o valor que o slice gravou quando ele ajustou. Teto zero
 * bloqueia o campo com a explicação (`lib/bloqueio`). Continua sem pedido de
 * senha, e a guarda I8 (`desconto < subtotal`) segue no slice.
 */
export function ControleDescontoCapa(): ReactElement {
  const descontoCapa = useVendaStore((estado) => estado.descontoCapa);
  const aplicarDescontoCapa = useVendaStore((estado) => estado.aplicarDescontoCapa);
  const removerDescontoCapa = useVendaStore((estado) => estado.removerDescontoCapa);

  /**
   * `'VALOR'` (R$) é o padrão do controle (pedido do usuário, 2026-09-05).
   *
   * O desconto que o caixa negocia na boca do balcão é em reais — "tira dois
   * reais" —, não em porcentagem: abrir em `%` fazia o valor mais comum custar
   * um clique a mais, e um "2" digitado por reflexo virava 2% em vez de R$ 2,00.
   *
   * Um desconto **já aplicado** continua mandando: reabrir a tela com o modo do
   * desconto vigente é o que mantém o campo coerente com o número que está
   * valendo.
   */
  const [modo, setModo] = useState<ModoAjuste>(descontoCapa?.modo ?? 'VALOR');
  /**
   * Inicializado a partir do desconto vigente, pela mesma razão do `modo` acima:
   * o campo tem de reabrir coerente com o número que está valendo na venda. Só
   * na **montagem** — o texto que o operador digita depois nunca é reescrito por
   * este componente (ver o TSDoc do espelho, adiante).
   */
  const [entradaTexto, setEntradaTexto] = useState(() => textoDoDescontoAplicado(descontoCapa));

  /**
   * Equivalente financeiro do que está **no campo agora**, não do que foi
   * aceito (correção do usuário, 2026-09-04).
   *
   * O sintoma relatado: digitar 100% deixava a linha "= R$ …" parada no valor
   * anterior, porque ela lia `descontoCapa.valorResolvido` do store — e um
   * desconto recusado nunca chega ao store. O operador via o número antigo
   * junto do aviso de recusa e não tinha como relacionar os dois.
   *
   * Quem converte percentual em reais continua sendo o domínio
   * (`resolverDescontoCapa`, o mesmo que o slice chama): o componente só
   * escolhe **qual entrada** mostrar resolvida. Enquanto o texto for um
   * percentual legível, é o texto; quando não for (campo vazio, "abc"), cai no
   * valor efetivamente aplicado, que é o que a venda de fato tem.
   */
  const subtotal = useVendaStore((estado) => totalVenda(estado.linhas));
  // Teto da condição escolhida (017): `null` sem condição; zero bloqueia.
  const condicao = useVendaStore((estado) => estado.condicaoSelecionada);
  const teto = tetoDaCapa(condicao, subtotal);
  const percentualDigitado = lerPercentualDigitado(entradaTexto);
  const equivalenteFinanceiro = resolverEquivalente();

  /**
   * Não há o que descontar num carrinho sem valor (pedido do usuário,
   * 2026-09-04). Qualquer número digitado aqui seria recusado pelo slice — o
   * desconto não pode zerar a venda, e sobre um subtotal de R$ 0,00 todo
   * desconto zera —, então o campo recusa antes, em vez de aceitar a digitação
   * para desfazê-la no `blur`.
   */
  //
  // Com forma de pagamento na venda o desconto **congela** (I12/`FR-023`): o
  // slice já recusava a alteração, mas o campo continuava aberto, e a recusa só
  // aparecia ao sair dele — depois de o operador ter apagado ou reescrito o
  // número que segue valendo (correção do usuário, 2026-10-13). O recorte é o
  // de `pagamentosVivos()` no slice e o do combobox de condição: a forma
  // riscada ou recusada não tem dinheiro atribuído e não congela nada (AD-171).
  const temPagamento = useVendaStore((estado) =>
    estado.pagamentos.some(
      (pagamento) => pagamento.status !== 'EXCLUIDO' && pagamento.status !== 'RECUSADO',
    ),
  );
  const bloqueio: MotivoBloqueio = temPagamento
    ? AVISO_DESCONTO_COM_PAGAMENTO
    : subtotal === ZERO_CENTAVOS
      ? 'Insira ao menos um produto na venda antes de aplicar desconto.'
      : teto === ZERO_CENTAVOS
        ? AVISO_CONDICAO_SEM_DESCONTO
        : null;

  function resolverEquivalente(): Centavos {
    const equivalente = resolverEquivalenteSemTeto();
    // O que o slice grava nunca passa do teto; a prévia também não.
    return teto !== null && equivalente > teto ? teto : equivalente;
  }

  function resolverEquivalenteSemTeto(): Centavos {
    // Campo vazio: mostra o desconto que a venda de fato tem — nenhum, na
    // maioria das vezes.
    if (entradaTexto.trim() === '') {
      return descontoCapa?.valorResolvido ?? ZERO_CENTAVOS;
    }

    // Texto que não é um percentual legível ("10,25", "abc") vale **zero**, não
    // o desconto anterior. Cair no anterior reproduzia justamente o defeito que
    // esta linha existe para corrigir: enquanto o operador digitava a segunda
    // casa decimal, a tela mostrava o valor antigo como se fosse o dele.
    if (percentualDigitado === null) {
      return ZERO_CENTAVOS;
    }

    // Texto que corresponde exatamente ao desconto vigente: prefere o
    // `valorResolvido` gravado. Hoje os dois números coincidem — o carrinho não
    // muda enquanto há desconto —, mas ler o store aqui é o que garante que a
    // linha descreva a **venda**, e não uma conta refeita a partir de um
    // subtotal que poderia ser outro.
    if (descontoCapa?.modo === 'PERCENTUAL' && descontoCapa.entrada === percentualDigitado) {
      return descontoCapa.valorResolvido;
    }

    return resolverDescontoCapa('PERCENTUAL', percentualDigitado, subtotal);
  }

  /**
   * O último desconto que **este campo** gravou ou já viu — é o que separa a
   * mudança feita aqui da feita de fora.
   *
   * Desde 2026-10-13 o campo grava a cada tecla, e o espelho antigo ("virou
   * `null`, esvazia o texto") passou a apagar o que o operador digitava: "0,5"
   * passa por "0", que remove o desconto, e o campo se esvaziava no meio da
   * palavra. Por isso toda gravação daqui passa por `gravar`, que registra o
   * resultado, e o espelho só age quando o store mudou **sem** passar por ela —
   * `limparPagamentos` da feature 004, uma importação, o reset da venda. Nesse
   * caso o campo passa a descrever o desconto que vale, inclusive o modo.
   *
   * Sincronizado durante a renderização, e não num efeito, pelo mesmo motivo de
   * `documentoEspelhado` em `CampoClienteVenda.tsx`: é estado derivado de algo
   * que mudou no store, e um efeito daria um quadro com o valor velho em tela.
   */
  const [ultimoAplicado, setUltimoAplicado] = useState(descontoCapa);
  if (descontoCapa !== ultimoAplicado) {
    setUltimoAplicado(descontoCapa);
    setEntradaTexto(textoDoDescontoAplicado(descontoCapa));
    if (descontoCapa !== null) {
      setModo(descontoCapa.modo);
    }
  }

  function gravar(escrita: () => void): void {
    escrita();
    setUltimoAplicado(useVendaStore.getState().descontoCapa);
  }

  /**
   * Faz o desconto da venda ser o que `texto` significa em `modoAlvo` — ou
   * nenhum, quando o texto não significa um desconto aceitável.
   *
   * **Invariante** (correção do usuário, 2026-10-13): o campo e o store nunca
   * divergem. Antes, a aplicação só acontecia ao sair do campo, e entre uma
   * coisa e outra o operador via o campo vazio ao lado de um total ainda
   * descontado; se nesse intervalo uma forma de pagamento entrasse (atalho de
   * teclado, sem tirar o foco), a remoção era recusada e a divergência ficava
   * para sempre. Hoje todo desfecho grava:
   *
   * - texto vazio ou zero **remove** — o desenho não tem botão de remover, e
   *   apagar o número é o gesto de quem desistiu do ajuste;
   * - texto legível e aceito pelo slice **aplica**;
   * - texto ilegível ou recusado pela regra **remove**: um número que a venda
   *   não pode carregar não fica valendo, nem o desconto anterior a ele.
   *
   * `silencioso` é a digitação: o total acompanha cada tecla, mas os avisos
   * esperam o operador sair do campo (ou teclar Enter), quando o número dele
   * está completo. Só ali a recusa **de regra** também esvazia o campo
   * (correção de 2026-09-04: deixar "10" recusado em tela fazia o equivalente
   * recalcular sobre o próximo subtotal como se estivesse valendo). Erro de
   * formato ("10,25", "abc") mantém o texto — ali o operador tem o que corrigir.
   */
  function aplicar(modoAlvo: ModoAjuste, texto: string, silencioso: boolean): void {
    // Sair do campo sem mexer não reaplica (017): a capa automática da condição
    // continuaria sendo dela, e não viraria "digitada" nem seria reauditada; e
    // uma entrada de duas casas vinda do ERP (3,25%, D9) não cairia na regra de
    // digitação, que aceita uma só.
    const vigente = useVendaStore.getState().descontoCapa;
    if (
      vigente !== null &&
      vigente.modo === modoAlvo &&
      texto === textoDoDescontoAplicado(vigente)
    ) {
      return;
    }
    const entrada = lerEntradaDigitada(modoAlvo, texto);
    gravar(() => {
      if (entrada === null) {
        removerDescontoCapa({ silencioso: true });
        if (!silencioso) {
          notificar.aviso(AVISO_FORMATO[modoAlvo]);
        }
        return;
      }
      if (entrada === 0) {
        removerDescontoCapa({ silencioso });
        return;
      }
      if (!aplicarDescontoCapa(modoAlvo, entrada, { silencioso })) {
        removerDescontoCapa({ silencioso: true });
        if (!silencioso) {
          setEntradaTexto('');
        }
        return;
      }
      // Acima do teto o slice grava o teto (017, FR-016): ao sair do campo o
      // texto passa a mostrar o que vale. Durante a digitação o texto fica, e
      // o equivalente já aparece limitado.
      const gravado = useVendaStore.getState().descontoCapa;
      if (!silencioso && gravado !== null && gravado.entrada !== entrada) {
        setEntradaTexto(textoDoDescontoAplicado(gravado));
      }
    });
  }

  function trocarModo(modoAlvo: ModoAjuste): void {
    setModo(modoAlvo);
    // Reaplica no ato: o mesmo "10" significa dez reais ou dez por cento
    // conforme o toggle, e deixar o desconto anterior de pé enquanto a tela já
    // mostra a outra unidade descreveria um ajuste que não é o vigente.
    aplicar(modoAlvo, entradaTexto, false);
  }

  function aoTeclar(evento: KeyboardEvent<HTMLInputElement>): void {
    if (evento.key === 'Enter') {
      evento.preventDefault();
      aplicar(modo, entradaTexto, false);
    }
  }

  return (
    // `gap-xxs` (4px) em vez dos 6px do nó `Jup0R`: com o equivalente
    // financeiro ainda presente no modo percentual, os 6px somados aos 8px da
    // coluna do cartão empurravam a seção de forma de pagamento longe demais do
    // desconto (medido: 43px entre o campo e o rótulo "Forma de pagamento").
    // Pedido do usuário, 2026-09-04.
    <section
      className={cn(
        'flex w-full flex-col gap-xxs',
        // A linha do equivalente financeiro é rodapé do campo, não um bloco
        // próprio: os 8px de `gap-xs` da coluna do cartão a empurravam para
        // longe do "Forma de pagamento" logo abaixo. A margem negativa devolve
        // metade dessa folga e só existe no modo percentual, que é o único em
        // que a linha é renderizada (pedido do usuário, 2026-09-04).
        modo === 'PERCENTUAL' && 'mb-[-4px]',
      )}
      data-testid="controle-desconto-capa"
      aria-label="Desconto da venda"
    >
      <header className="flex w-full items-center justify-between">
        <span className="text-base font-semibold text-foreground">Desconto</span>
        {/* Teto da condição (017). Sem nó no Pencil — a regra é nova e o MCP
            não conectou; segue a tipografia da legenda "sobre o subtotal". */}
        {condicao !== null && condicao.descontoMaximo > 0 ? (
          <span
            className="text-xs font-medium text-muted-foreground"
            data-testid="teto-desconto-capa"
          >
            Máx. {String(condicao.descontoMaximo).replace('.', ',')}%
          </span>
        ) : null}
      </header>

      {/* Uma peça só na linha, sem wrapper de layout: com o combobox de tipo
          removido, o campo é a linha inteira. */}
      <span className="flex h-11 w-full min-w-0 items-center justify-between gap-xs rounded-lg border border-border bg-muted px-xs">
        <input
          className="w-full min-w-0 bg-transparent font-mono text-md font-semibold tabular-nums outline-none aria-disabled:cursor-not-allowed"
          data-testid="campo-valor-ajuste"
          aria-label={modo === 'PERCENTUAL' ? 'Desconto em porcentagem' : 'Desconto em reais'}
          autoComplete="off"
          inputMode="decimal"
          placeholder="0,00"
          value={entradaTexto}
          // `readOnly`, não `disabled` (AD-143): o campo continua alcançável por
          // TAB e o clique **explica** o motivo, em vez de não fazer nada. O
          // cursor é o mesmo do combobox de condição bloqueado.
          readOnly={bloqueio !== null}
          {...atributosDeBloqueio(bloqueio)}
          onClick={acaoBloqueavel(bloqueio, () => {
            /* campo livre: o clique só posiciona o cursor. */
          })}
          // Grava **a cada tecla** (correção do usuário, 2026-10-13): o total a
          // pagar tem de acompanhar o desconto sem o operador sair do campo. A
          // gravação por tecla é silenciosa — sem aviso e sem auditoria; o
          // `DESCONTO_CAPA_APLICADO` (017) e os avisos esperam o `blur` ou o
          // Enter. O rateio é calculado na montagem do payload, nunca guardado.
          onChange={(evento) => {
            if (bloqueio === null) {
              setEntradaTexto(evento.target.value);
              aplicar(modo, evento.target.value, true);
            }
          }}
          onBlur={() => {
            if (bloqueio === null) {
              aplicar(modo, entradaTexto, false);
            }
          }}
          onKeyDown={aoTeclar}
        />

        <span
          className="flex shrink-0 items-center gap-[3px]"
          role="group"
          aria-label="Unidade do desconto"
        >
          <BotaoUnidade
            rotulo="R$"
            ativo={modo === 'VALOR'}
            testId="toggle-ajuste-valor"
            bloqueio={bloqueio}
            aoAcionar={() => {
              trocarModo('VALOR');
            }}
          />
          <BotaoUnidade
            rotulo="%"
            ativo={modo === 'PERCENTUAL'}
            testId="toggle-ajuste-percentual"
            bloqueio={bloqueio}
            aoAcionar={() => {
              trocarModo('PERCENTUAL');
            }}
          />
        </span>
      </span>

      {/* "Valor calculado ajuste" (`Zdqgn`) — **só no modo percentual**, por
          decisão do usuário (2026-09-04). Em reais o equivalente financeiro é
          o próprio número que o operador acabou de digitar, e repeti-lo logo
          abaixo do campo não informa nada: ocupa uma linha e ainda afasta o
          bloco de desconto da seção de forma de pagamento. O desenho mostra a
          linha porque desenha justamente o estado percentual (toggle `%` ativo,
          "2,00" → "R$ 3,29"). */}
      {modo === 'PERCENTUAL' ? (
        <div className="flex w-full items-center justify-end gap-[5px] leading-none">
          <ArrowRight className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
          {/* Resolvido pelo domínio (`resolverDescontoCapa`) e só formatado
              aqui — o componente nunca converte percentual em reais por conta
              própria. Acompanha o texto digitado, inclusive quando a aplicação
              é recusada: ver `equivalenteFinanceiro`. */}
          <strong
            className="font-mono text-sm font-bold tabular-nums text-[var(--cc-color-accent-yellow)]"
            data-testid="equivalente-financeiro-desconto-capa"
          >
            {formatarCentavos(equivalenteFinanceiro)}
          </strong>
          <span className="text-xs font-medium text-muted-foreground">sobre o subtotal</span>
        </div>
      ) : null}
    </section>
  );
}

interface BotaoUnidadeProps {
  readonly rotulo: string;
  readonly ativo: boolean;
  readonly testId: string;
  readonly bloqueio: MotivoBloqueio;
  readonly aoAcionar: () => void;
}

/**
 * Um dos dois botões do "Toggle unidade ajuste" (`FC8Sd`): 28px de altura, raio
 * 8, `padding: 0 9px` e rótulo 11/700 — ativo em `$cb-blue` com texto branco,
 * inativo em `$surface-strong` com texto `$body`.
 *
 * `aria-pressed` em vez de dois estados visuais soltos: para o leitor de tela é
 * um par de botões de alternância, e é assim que ele anuncia qual unidade está
 * valendo. `FR-015` aceita percentual e valor sem restrição, mas o toggle
 * **reaplica** o desconto na outra unidade — é uma alteração do desconto, e
 * fecha junto com o campo (mesmo `bloqueio`, correção de 2026-10-13).
 */
function BotaoUnidade({
  rotulo,
  ativo,
  testId,
  bloqueio,
  aoAcionar,
}: BotaoUnidadeProps): ReactElement {
  return (
    <button
      type="button"
      className={cn(
        'flex h-7 shrink-0 items-center justify-center rounded-md px-[9px] text-xs font-bold aria-disabled:cursor-not-allowed',
        ativo
          ? 'bg-primary text-primary-foreground'
          : 'bg-secondary text-muted-foreground hover:bg-secondary-hover',
      )}
      aria-pressed={ativo}
      data-testid={testId}
      {...atributosDeBloqueio(bloqueio)}
      onClick={acaoBloqueavel(bloqueio, aoAcionar)}
    >
      {rotulo}
    </button>
  );
}
