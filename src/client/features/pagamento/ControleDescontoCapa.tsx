import { ArrowUpDown, Equal } from 'lucide-react';
import { useState, type KeyboardEvent, type ReactElement } from 'react';
import { gooeyToast } from 'goey-toast';
// Só o tipo: quem aplica `atributosDeBloqueio`/`acaoBloqueavel` sobre cada
// opção é o `ComboboxPagamento` — o motivo é decidido aqui e consumido lá.
import type { MotivoBloqueio } from '@/lib/bloqueio';
import { cn } from '@/lib/utils';
import { ZERO_CENTAVOS, formatarCentavos } from '../../domain/precificacao/dinheiro';
import { useVendaStore } from '../../stores/vendaStore';
import { lerCentavosDigitados } from './EntradaPagamento';
import { ComboboxPagamento } from './SeletorCondicaoForma';

type ModoAjuste = 'PERCENTUAL' | 'VALOR';

/** Motivo fixo do tipo "Acréscimo" — ver o TSDoc do componente. */
const MOTIVO_ACRESCIMO_INDISPONIVEL =
  'Acréscimo não existe no Checkout: o ajuste de capa da venda só aplica desconto.';

/** `"5"`, `"5,5"` ou `"5.5"` → `5.5`; entrada inválida vira `null`. */
function lerPercentualDigitado(texto: string): number | null {
  const normalizado = texto.trim().replace(',', '.');
  if (normalizado === '' || !/^\d+(\.\d{1,2})?$/.test(normalizado)) {
    return null;
  }
  return Number(normalizado);
}

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
 * - **Cabeçalho** (`iJ4fT`/`zpr9g`) — "Desconto / Acréscimo", Inter 13/600.
 * - **"Combobox tipo ajuste"** (`uEPUi`) — 158×44, raio 12, fundo
 *   `$surface-soft`, borda `$hairline`, ícone lucide `arrow-up-down` de 15px em
 *   `$body`, texto 13/600 e `chevron-down` de 16px.
 * - **"Campo valor ajuste"** (`a2PXo`) — preenche o resto da linha, 44px, raio
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
 * **"Acréscimo" existe no desenho e não no domínio.** Nem `FR-015` nem o
 * contrato do slice (`aplicarDescontoCapa(modo, entrada)`,
 * `contracts/pagamento-domain-api.md` §2) preveem acréscimo de capa, e o
 * componente não pode inventar a regra. A opção aparece na lista, como o Pencil
 * a nomeia, mas **bloqueada com motivo** (`lib/bloqueio.ts`): clicar explica que
 * o Checkout só desconta. Suprimi-la deixaria o operador procurando por um item
 * que o rótulo do bloco anuncia; deixá-la escolhível prometeria um efeito que
 * nada implementa.
 *
 * **Sem teto e sem autorização** (`FR-015`/AD-039): não há limite máximo nem
 * pedido de senha. A única guarda é I8 (`desconto <= subtotal`), e ela vive no
 * slice — que é onde o subtotal corrente existe — recusando com toast. O
 * componente não a repete.
 */
export function ControleDescontoCapa(): ReactElement {
  const descontoCapa = useVendaStore((estado) => estado.descontoCapa);
  const aplicarDescontoCapa = useVendaStore((estado) => estado.aplicarDescontoCapa);
  const removerDescontoCapa = useVendaStore((estado) => estado.removerDescontoCapa);

  const [modo, setModo] = useState<ModoAjuste>(descontoCapa?.modo ?? 'PERCENTUAL');
  const [entradaTexto, setEntradaTexto] = useState('');

  /**
   * Espelho do desconto aplicado, para o campo acompanhar quem o zerou de fora
   * — `limparPagamentos` da feature 004, por exemplo. Sincronizado durante a
   * renderização, e não num efeito, pelo mesmo motivo de `documentoEspelhado`
   * em `CampoClienteVenda.tsx`: é estado derivado de algo que mudou no store, e
   * um efeito daria um quadro com o valor velho em tela.
   *
   * Só o caminho "virou `null`" reescreve o campo. O texto que o operador
   * digitou **não** é reformatado depois de aplicado: normalizar `"5"` para
   * `"5,00"` por conta própria mexeria no que ele escreveu, e reconstruir o
   * texto a partir de `entrada` exigiria dividir centavos por 100 aqui dentro —
   * conversão monetária que não pertence a um componente.
   */
  const [ultimoAplicado, setUltimoAplicado] = useState(descontoCapa);
  if (descontoCapa !== ultimoAplicado) {
    setUltimoAplicado(descontoCapa);
    if (descontoCapa === null) {
      setEntradaTexto('');
    }
  }

  /**
   * Aplica (ou remove) o desconto de capa a partir do texto corrente.
   *
   * Campo vazio e valor zero **removem** o desconto, em vez de aplicarem zero:
   * o desenho não tem botão de remover, e apagar o número é o gesto natural de
   * quem desistiu do ajuste. `removerDescontoCapa()` existe justamente para
   * esse desfecho e ficaria inalcançável de outro modo.
   */
  function aplicar(modoAlvo: ModoAjuste, texto: string): void {
    const bruto = texto.trim();
    if (bruto === '') {
      removerDescontoCapa();
      return;
    }

    if (modoAlvo === 'VALOR') {
      const valor = lerCentavosDigitados(bruto);
      if (valor === null) {
        gooeyToast.warning('Valor inválido: use apenas números, com até duas casas decimais.');
        return;
      }
      if (valor === ZERO_CENTAVOS) {
        removerDescontoCapa();
        return;
      }
      aplicarDescontoCapa('VALOR', valor);
      return;
    }

    const percentual = lerPercentualDigitado(bruto);
    if (percentual === null) {
      gooeyToast.warning('Percentual inválido: use apenas números, com até duas casas decimais.');
      return;
    }
    if (percentual === 0) {
      removerDescontoCapa();
      return;
    }
    aplicarDescontoCapa('PERCENTUAL', percentual);
  }

  function trocarModo(modoAlvo: ModoAjuste): void {
    setModo(modoAlvo);
    // Reaplica no ato: o mesmo "10" significa dez reais ou dez por cento
    // conforme o toggle, e deixar o desconto anterior de pé enquanto a tela já
    // mostra a outra unidade descreveria um ajuste que não é o vigente.
    aplicar(modoAlvo, entradaTexto);
  }

  function aoTeclar(evento: KeyboardEvent<HTMLInputElement>): void {
    if (evento.key === 'Enter') {
      evento.preventDefault();
      aplicar(modo, entradaTexto);
    }
  }

  /** `null` para "Desconto"; "Acréscimo" é sempre bloqueado (ver TSDoc). */
  function bloqueioDoTipo(tipo: 'DESCONTO' | 'ACRESCIMO'): MotivoBloqueio {
    return tipo === 'ACRESCIMO' ? MOTIVO_ACRESCIMO_INDISPONIVEL : null;
  }

  return (
    <section
      className="flex w-full flex-col gap-[6px]"
      data-testid="controle-desconto-capa"
      aria-label="Desconto da venda"
    >
      <header className="flex w-full items-center justify-between">
        <span className="text-base font-semibold text-foreground">Desconto / Acréscimo</span>
      </header>

      <div className="flex h-11 w-full items-center gap-xs">
        <ComboboxPagamento
          rotulo="Tipo de ajuste"
          rotuloVisivel={false}
          icone={<ArrowUpDown className="size-[15px] text-muted-foreground" />}
          textoSelecionado="Desconto"
          placeholder="Desconto"
          opcoes={[
            {
              chave: 'DESCONTO',
              texto: 'Desconto',
              selecionada: true,
              bloqueio: bloqueioDoTipo('DESCONTO'),
              aoEscolher: () => {
                // Já é o único tipo vigente — escolher de novo não muda nada, e
                // reaplicar aqui repetiria o desconto sem o operador ter mexido
                // no valor.
              },
            },
            {
              chave: 'ACRESCIMO',
              texto: 'Acréscimo',
              selecionada: false,
              bloqueio: bloqueioDoTipo('ACRESCIMO'),
              aoEscolher: () => {
                // Inalcançável: `acaoBloqueavel` intercepta e explica o motivo.
              },
            },
          ]}
          bloqueio={null}
          classeTrigger="w-[158px] shrink-0 px-sm"
          classeTexto="text-base"
          testId="combobox-tipo-ajuste"
          idOpcao={(chave) => `opcao-tipo-ajuste-${chave.toLowerCase()}`}
        />

        <span className="flex h-full min-w-0 flex-1 items-center justify-between gap-xs rounded-lg border border-border bg-muted px-xs">
          <input
            className="w-full min-w-0 bg-transparent font-mono text-md font-semibold tabular-nums outline-none"
            data-testid="campo-valor-ajuste"
            aria-label={modo === 'PERCENTUAL' ? 'Desconto em porcentagem' : 'Desconto em reais'}
            autoComplete="off"
            inputMode="decimal"
            placeholder="0,00"
            value={entradaTexto}
            onChange={(evento) => {
              setEntradaTexto(evento.target.value);
            }}
            // Aplica ao sair do campo e no Enter, nunca a cada tecla: digitar
            // "10" passaria por "1" no caminho, e cada passagem seria um
            // desconto aplicado de verdade (com auditoria e rateio) por engano.
            onBlur={() => {
              aplicar(modo, entradaTexto);
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
              aoAcionar={() => {
                trocarModo('VALOR');
              }}
            />
            <BotaoUnidade
              rotulo="%"
              ativo={modo === 'PERCENTUAL'}
              testId="toggle-ajuste-percentual"
              aoAcionar={() => {
                trocarModo('PERCENTUAL');
              }}
            />
          </span>
        </span>
      </div>

      <div className="flex w-full items-center justify-end gap-[5px]">
        <Equal className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
        {/* O valor em reais do desconto vigente, seja ele percentual ou não:
            é `valorResolvido`, calculado pelo domínio (`resolverDescontoCapa`)
            e só formatado aqui. */}
        <strong
          className="font-mono text-sm font-bold tabular-nums text-[var(--cc-color-accent-yellow)]"
          data-testid="equivalente-financeiro-desconto-capa"
        >
          {formatarCentavos(descontoCapa?.valorResolvido ?? ZERO_CENTAVOS)}
        </strong>
        <span className="text-xs font-medium text-muted-foreground">sobre o subtotal</span>
      </div>
    </section>
  );
}

interface BotaoUnidadeProps {
  readonly rotulo: string;
  readonly ativo: boolean;
  readonly testId: string;
  readonly aoAcionar: () => void;
}

/**
 * Um dos dois botões do "Toggle unidade ajuste" (`FC8Sd`): 28px de altura, raio
 * 8, `padding: 0 9px` e rótulo 11/700 — ativo em `$cb-blue` com texto branco,
 * inativo em `$surface-strong` com texto `$body`.
 *
 * `aria-pressed` em vez de dois estados visuais soltos: para o leitor de tela é
 * um par de botões de alternância, e é assim que ele anuncia qual unidade está
 * valendo. Não usa `atributosDeBloqueio`: nenhum dos dois modos é bloqueável —
 * `FR-015` aceita percentual e valor sem restrição.
 */
function BotaoUnidade({ rotulo, ativo, testId, aoAcionar }: BotaoUnidadeProps): ReactElement {
  return (
    <button
      type="button"
      className={cn(
        'flex h-7 shrink-0 items-center justify-center rounded-md px-[9px] text-xs font-bold',
        ativo
          ? 'bg-primary text-primary-foreground'
          : 'bg-secondary text-muted-foreground hover:bg-secondary-hover',
      )}
      aria-pressed={ativo}
      data-testid={testId}
      onClick={aoAcionar}
    >
      {rotulo}
    </button>
  );
}
