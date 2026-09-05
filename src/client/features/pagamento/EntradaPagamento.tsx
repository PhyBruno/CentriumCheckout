import { CornerDownLeft, Plus } from 'lucide-react';
import { useRef, useState, type KeyboardEvent, type ReactElement } from 'react';
import { Button } from '@/components/ui/button';
import { acaoBloqueavel, atributosDeBloqueio, type MotivoBloqueio } from '@/lib/bloqueio';
import type { FormaPagamento } from '../../domain/pagamento/formaPagamento';
import { ehFormaDeValeDevolucao } from '../../domain/pagamento/valeDevolucao';
import { ZERO_CENTAVOS, centavos, type Centavos } from '../../domain/precificacao/dinheiro';
import { useVendaStore } from '../../stores/vendaStore';

const CENTAVOS_POR_REAL = 100;

/**
 * `"12,34"` e `"12.34"` → `1234` centavos; entrada inválida vira `null`.
 *
 * Cópia deliberada de `lerCentavos` em
 * `features/carrinho/EntradaRapidaProduto.tsx`: é **leitura de texto digitado**,
 * a fronteira onde o número do operador vira `Centavos`, não cálculo monetário
 * — daí ela viver na camada de entrada, e não no domínio, que já opera só sobre
 * inteiros. Exportada porque `ControleDescontoCapa.tsx` lê o mesmo formato no
 * modo `'VALOR'`, e o cartão de pagamento não pode ganhar um arquivo novo só
 * para uma função de três linhas (escopo fechado da tarefa).
 */
export function lerCentavosDigitados(texto: string): Centavos | null {
  const normalizado = texto.trim().replace(',', '.');
  if (normalizado === '' || !/^\d+(\.\d{1,2})?$/.test(normalizado)) {
    return null;
  }
  return centavos(Math.round(Number(normalizado) * CENTAVOS_POR_REAL));
}

export interface EntradaPagamentoProps {
  /**
   * Forma escolhida em `SeletorFormaPagamento` — rascunho da próxima inserção,
   * segurado pelo cartão que compõe os dois (ver o TSDoc daquele componente).
   */
  readonly forma: FormaPagamento | null;
}

/**
 * "Campo valor recebido" do cartão de pagamento — nó `J3Y1L` do Pencil
 * (`design/HTML - Pencil/CentriumCheckout.html`, linhas 2729–2829; o MCP do
 * Pencil não conectou nesta sessão, `CONNECTION_CLOSED`).
 *
 * Três peças, exatamente como o desenho as monta:
 *
 * 1. **Cabeçalho** (`YxI3T`) — rótulo "Valor recebido" Inter 13/600 à esquerda e,
 *    à direita, a pílula "Enter adiciona" (`DZpJ5`): fundo `$surface-strong`,
 *    raio 100, `padding: 5px 8px`, ícone lucide `corner-down-left` de 14px e
 *    texto 11/600.
 * 2. **Campo digitado** (`f9twX8`) — 48px de altura, raio 12, fundo
 *    `$surface-soft`, borda `$hairline`, `padding: 0 14px`, com "R$" Inter 13/700
 *    em `$body` à esquerda e o valor em **Geist Mono 20/600** à direita.
 * 3. **Botão "Adicionar pagamento"** (`z2dvm4`) — 166×48, raio 12, `$cb-blue`,
 *    ícone `plus` de 18px e texto 12/700 em branco.
 *
 * O valor fica **alinhado à direita** porque o desenho põe os dois filhos do
 * campo em `justify-content: space-between` — "R$" encostado na borda esquerda e
 * o número na direita. Não é o mesmo caso do preço do item na barra de produto,
 * onde o `text-right` foi corrigido em AD-136: lá os frames de valor são
 * `flex-start` e o texto de fato começa na esquerda.
 *
 * O "R$" é elemento próprio, **fora** do `<input>` — mesma razão de
 * `SimboloReal` em `EntradaRapidaProduto.tsx`: dentro do campo ele viraria
 * máscara, o cursor esbarraria num prefixo protegido e `lerCentavosDigitados`
 * receberia texto sujo.
 *
 * **Enter é o botão.** A pílula do desenho anuncia o atalho, e o
 * `onKeyDown` do campo faz exatamente o que o clique faz — no ritmo do caixa o
 * valor é digitado e confirmado sem passar pelo mouse. Nenhum atalho global de
 * teclado é registrado: o Enter só vale com o foco neste campo, para não
 * competir com a bipagem de produto (mesma decisão da barra de entrada rápida).
 *
 * Nenhuma regra de pagamento mora aqui (SOLID): duplicidade de dinheiro, saldo
 * já coberto, teto do valor aplicado, troco e roteamento de integração são todos
 * do `pagamentoSlice`/domínio (`podeAplicarForma`, `derivarValores`,
 * `resolverIntegracao`). O componente só entrega `{ forma, valorInformado }`.
 */
export function EntradaPagamento({ forma }: EntradaPagamentoProps): ReactElement {
  const aplicarPagamento = useVendaStore((estado) => estado.aplicarPagamento);
  /**
   * Venda sem valor a cobrar (pedido do usuário, 2026-09-04). A mesma guarda
   * existe no slice (`AVISO_VENDA_SEM_VALOR`) e é ela que decide de verdade;
   * aqui o motivo aparece antes do clique, para o operador não digitar um valor
   * que já se sabe recusado.
   */
  const totalLiquido = useVendaStore((estado) => estado.saldo().totalLiquido);

  const [valorTexto, setValorTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const campo = useRef<HTMLInputElement>(null);

  const valorLido = lerCentavosDigitados(valorTexto);

  /**
   * Por que "Adicionar pagamento" está bloqueado — a frase que o operador lê ao
   * clicar nele bloqueado (padrão de `lib/bloqueio.ts`).
   *
   * Os motivos espelham, na mesma ordem, as guardas de `adicionar()`: uma lista
   * que divergisse da função diria uma coisa e o bloqueio responderia outra.
   */
  /**
   * Os dois motivos que travam a **digitação** — ver o comentário no `<input>`.
   *
   * `forma === null` passou a bloquear aqui (correção do usuário, 2026-09-04,
   * revoga a decisão anterior). Antes só a venda sem valor travava o campo, de
   * propósito: "escolha a forma antes" impedia *adicionar*, não digitar, para
   * não obrigar uma ordem rígida de gestos. O usuário decidiu o contrário — sem
   * forma escolhida não há para onde os centavos digitados irem, e o campo não
   * deveria aceitar um número que a venda ainda não sabe a quem atribuir.
   */
  const bloqueioDoCampo: MotivoBloqueio =
    totalLiquido === ZERO_CENTAVOS
      ? 'Esta venda não tem valor a cobrar: insira produtos ou revise o desconto antes de informar o valor recebido.'
      : forma === null
        ? 'Escolha a forma de pagamento antes de informar o valor recebido.'
        : null;

  const bloqueioDeInsercao: MotivoBloqueio = enviando
    ? 'Aguarde: o pagamento anterior ainda está sendo processado.'
    : totalLiquido === ZERO_CENTAVOS
      ? 'Esta venda não tem valor a cobrar: revise o desconto de capa ou os itens antes de adicionar um pagamento.'
      : forma === null
        ? 'Escolha a forma de pagamento antes de adicionar o valor recebido.'
        : // O valor de um vale devolução é o do ticket, decidido pelo ERP
          // (`DevValTot`) e baixado inteiro — não existe uso parcial. Deixar o
          // campo aceitar um número aqui prometeria um controle que o operador
          // não tem sobre esse valor.
          ehFormaDeValeDevolucao(forma)
          ? 'O valor do vale devolução vem do ticket: informe o código na janela do vale.'
          : valorTexto.trim() === ''
            ? 'Informe o valor recebido para adicionar o pagamento.'
            : valorLido === null
              ? 'Valor inválido: use apenas números, com no máximo duas casas decimais.'
              : valorLido === ZERO_CENTAVOS
                ? 'O valor recebido precisa ser maior que zero.'
                : null;

  async function adicionar(): Promise<void> {
    // Guarda repetida no clique, não só na renderização: o estado pode mudar
    // entre um e outro (mesma razão de `acaoBloqueavel` reavaliar o motivo).
    if (enviando || forma === null || valorLido === null || valorLido === ZERO_CENTAVOS) {
      return;
    }

    setEnviando(true);
    try {
      await aplicarPagamento({ forma, valorInformado: valorLido });
    } finally {
      setEnviando(false);
    }

    // O campo é esvaziado mesmo quando o slice recusa a inserção (dinheiro
    // duplicado, saldo coberto, veredito da 014): a recusa já chegou ao
    // operador por toast, e manter o valor antigo faria o próximo Enter
    // repetir a mesma tentativa. O foco volta para cá porque o gesto seguinte
    // do caixa é informar o próximo valor.
    setValorTexto('');
    campo.current?.focus();
  }

  function aoTeclar(evento: KeyboardEvent<HTMLInputElement>): void {
    if (evento.key === 'Enter') {
      evento.preventDefault();
      acaoBloqueavel(bloqueioDeInsercao, () => {
        void adicionar();
      })();
    }
  }

  return (
    <section
      className="flex w-full flex-col gap-[6px]"
      data-testid="entrada-pagamento"
      aria-label="Valor recebido"
    >
      <header className="flex w-full items-center justify-between">
        <label className="text-base font-semibold text-foreground" htmlFor="campo-valor-recebido">
          Valor recebido
        </label>
        <span
          className="flex shrink-0 items-center gap-[6px] rounded-full bg-secondary px-xs py-[5px] text-xs font-semibold whitespace-nowrap text-foreground"
          data-testid="atalho-adicionar-pagamento"
        >
          <CornerDownLeft className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          Enter adiciona
        </span>
      </header>

      <div className="flex h-12 w-full items-center gap-xs">
        <span className="flex h-full min-w-0 flex-1 items-center gap-xs rounded-lg border border-border bg-muted px-[14px]">
          <span className="shrink-0 text-base font-bold text-muted-foreground" aria-hidden="true">
            R$
          </span>
          <input
            ref={campo}
            id="campo-valor-recebido"
            className="w-full min-w-0 bg-transparent text-right font-mono text-xl font-semibold tabular-nums outline-none aria-disabled:cursor-not-allowed"
            data-testid="campo-valor-recebido"
            autoComplete="off"
            inputMode="decimal"
            placeholder="0,00"
            value={valorTexto}
            // Bloqueado por venda sem valor **ou** forma ainda não escolhida
            // (`bloqueioDoCampo`) — não pelos demais motivos de
            // `bloqueioDeInsercao` (dinheiro duplicado, vale devolução etc.),
            // que só impedem *adicionar*, não digitar.
            //
            // `readOnly`, não `disabled` (AD-143): segue alcançável por TAB e o
            // clique explica o motivo, com o mesmo cursor do combobox de
            // condição bloqueado.
            readOnly={bloqueioDoCampo !== null}
            {...atributosDeBloqueio(bloqueioDoCampo)}
            onClick={acaoBloqueavel(bloqueioDoCampo, () => {
              /* campo livre: o clique só posiciona o cursor. */
            })}
            onChange={(evento) => {
              if (bloqueioDoCampo === null) {
                setValorTexto(evento.target.value);
              }
            }}
            onKeyDown={aoTeclar}
          />
        </span>

        <Button
          type="button"
          className="h-12 w-[166px] shrink-0 gap-xs rounded-lg text-sm font-bold"
          data-testid="adicionar-pagamento"
          {...atributosDeBloqueio(bloqueioDeInsercao)}
          onClick={acaoBloqueavel(bloqueioDeInsercao, () => {
            void adicionar();
          })}
        >
          <Plus className="size-[18px]" aria-hidden="true" />
          Adicionar pagamento
        </Button>
      </div>
    </section>
  );
}
