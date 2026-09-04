import { Equal } from 'lucide-react';
import { useState, type KeyboardEvent, type ReactElement } from 'react';
import { gooeyToast } from 'goey-toast';
import { cn } from '@/lib/utils';
import { resolverDescontoCapa } from '../../domain/pagamento/descontoCapa';
import { ZERO_CENTAVOS, formatarCentavos } from '../../domain/precificacao/dinheiro';
import { totalVenda } from '../../domain/precificacao/linha';
import { useVendaStore } from '../../stores/vendaStore';
import { lerCentavosDigitados } from './EntradaPagamento';

type ModoAjuste = 'PERCENTUAL' | 'VALOR';

/**
 * `"5"`, `"5,5"` ou `"5.5"` → `5.5`; entrada inválida vira `null`.
 *
 * **Uma casa decimal, não duas** (pedido do usuário, 2026-09-04): `"99,9"` é o
 * formato do produto. A segunda casa não sobrevive ao arredondamento em nenhum
 * carrinho pequeno — `aplicarPercentual` fecha em centavo inteiro, de modo que
 * `10,25%` e `10,3%` de R$ 40,00 dão o mesmo valor — e prometia uma precisão
 * que o resultado nunca teve.
 */
function lerPercentualDigitado(texto: string): number | null {
  const normalizado = texto.trim().replace(',', '.');
  if (normalizado === '' || !/^\d+(\.\d)?$/.test(normalizado)) {
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
  const percentualDigitado = lerPercentualDigitado(entradaTexto);
  const equivalenteFinanceiro =
    percentualDigitado === null
      ? (descontoCapa?.valorResolvido ?? ZERO_CENTAVOS)
      : resolverDescontoCapa('PERCENTUAL', percentualDigitado, subtotal);

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
      gooeyToast.warning('Percentual inválido: use apenas números, com até uma casa decimal.');
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
      </header>

      {/* Uma peça só na linha, sem wrapper de layout: com o combobox de tipo
          removido, o campo é a linha inteira. */}
      <span className="flex h-11 w-full min-w-0 items-center justify-between gap-xs rounded-lg border border-border bg-muted px-xs">
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

      {/* "Valor calculado ajuste" (`Zdqgn`) — **só no modo percentual**, por
          decisão do usuário (2026-09-04). Em reais o equivalente financeiro é
          o próprio número que o operador acabou de digitar, e repeti-lo logo
          abaixo do campo não informa nada: ocupa uma linha e ainda afasta o
          bloco de desconto da seção de forma de pagamento. O desenho mostra a
          linha porque desenha justamente o estado percentual (toggle `%` ativo,
          "2,00" → "R$ 3,29"). */}
      {modo === 'PERCENTUAL' ? (
        <div className="flex w-full items-center justify-end gap-[5px] leading-none">
          <Equal className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
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
