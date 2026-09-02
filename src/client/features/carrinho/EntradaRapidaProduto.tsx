import { Barcode, Minus, Plus, Search } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent, type ReactElement } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { rotuloTipoCodigoProduto } from '../../domain/precificacao/codigoProduto';
import {
  ZERO_CENTAVOS,
  calcularTotalLinha,
  centavos,
  formatarCentavos,
  type Centavos,
} from '../../domain/precificacao/dinheiro';
import {
  MILESIMOS_POR_UNIDADE,
  formatarQuantidade,
  milesimos,
  milesimosDeUnidades,
  somarQuantidades,
  type Milesimos,
} from '../../domain/precificacao/quantidade';
import { ModalBuscaProduto } from './ModalBuscaProduto';
import { useContextoPrecificacao, useInsercaoDeProduto, type RevisaoProduto } from './useCarrinho';

const CENTAVOS_POR_REAL = 100;
const UMA_UNIDADE = milesimos(MILESIMOS_POR_UNIDADE);
const QUANTIDADE_INICIAL = milesimosDeUnidades(1);

/** `"12,34"` e `"12.34"` → `1234` centavos; entrada inválida vira `null`. */
function lerCentavos(texto: string): Centavos | null {
  const normalizado = texto.trim().replace(',', '.');
  if (normalizado === '' || !/^\d+(\.\d{1,2})?$/.test(normalizado)) {
    return null;
  }
  return centavos(Math.round(Number(normalizado) * CENTAVOS_POR_REAL));
}

function paraTextoDecimal(valorEmCentavos: number): string {
  return (valorEmCentavos / CENTAVOS_POR_REAL).toFixed(2).replace('.', ',');
}

/** `"3"`, `"3,5"` ou `"3.5"` → `Milesimos`; inválida ou não positiva vira `null`. */
function lerQuantidadeTexto(texto: string): Milesimos | null {
  const normalizado = texto.trim().replace(',', '.');
  if (normalizado === '' || !/^\d+(\.\d{1,3})?$/.test(normalizado)) {
    return null;
  }
  const unidades = Number(normalizado);
  return unidades > 0 ? milesimosDeUnidades(unidades) : null;
}

/**
 * Barra de entrada rápida de produto (T021, `CART-02`) — réplica fiel do frame
 * "Entrada rápida de produto" do Pencil (`design/CentriumCheckout.pen`,
 * confirmado via MCP do Pencil): **um único cartão sempre com todas as
 * células visíveis** (código, quantidade, unidade, preço, desconto, total,
 * nome do produto abaixo, botão de inserir) — nunca colapsa a só o campo de
 * código, mesmo sem nenhum produto resolvido ainda.
 *
 * Enter no campo de código é a tecla de **inserção rápida**: confirma a
 * entrada e insere direto, sem exibir revisão (produto pesável/simples/balança
 * — `'S'`/`'B'`/`''`). TAB é a tecla de **revisão**: carrega o produto via
 * `GetProduto` (`revisarPorCodigo`) e preenche todas as células com os dados
 * reais.
 *
 * Quantidade, unidade, preço e desconto são sempre `<input>` de verdade — não
 * só texto — para participarem da navegação por TAB. Unidade é **sempre**
 * somente leitura (vem do cadastro, nunca editável no PDV, nem em produto
 * `'E'`). Preço e desconto só ficam editáveis quando
 * `ProdutoPesavelEditavel = 'E'` (`FR-014`); nos demais casos ficam somente
 * leitura, e o foco ao resolver via TAB vai direto para o botão "+" (nada
 * mais a decidir). Em produto `'E'`, o foco ao resolver vai para a
 * **quantidade** — nunca para o botão de inserir — e o próximo TAB segue a
 * ordem natural do DOM (quantidade → unidade → preço → desconto → "+"),
 * pedido direto do usuário (2026-09-03): o operador revisa e ajusta cada
 * campo digitando, sem precisar do mouse.
 *
 * Não registra atalho global de teclado: um `hotkey` de escopo de documento
 * competiria com a própria bipagem, que chega como digitação rápida neste input.
 *
 * Dono do modal de busca por termo livre (`ModalBuscaProduto`, T015,
 * `CART-01`): o modal é **só um seletor de código** — escolher um candidato
 * só devolve o `CodigoProduto` (`onProdutoSelecionado`), nunca resolve nem
 * insere nada sozinho. É esta barra que carrega o código escolhido no campo,
 * chama `GetProduto` e mostra a revisão — o mesmo caminho de TAB no código
 * digitado. Achado do usuário (2026-09-03): a revisão vivia por engano
 * dentro do modal, duplicando esta UI.
 */
export function EntradaRapidaProduto(): ReactElement {
  const { inserirPorCodigo, confirmarEdicao, revisarPorCodigo, confirmarPrevia } =
    useInsercaoDeProduto();
  const [buscaAberta, setBuscaAberta] = useState(false);
  // Rótulo do campo depende de `SessaoUsuario.UsuarioTipoCodigoProduto`
  // (`GetSessao`) — é configuração da empresa, nunca um texto fixo (mesmo
  // valor que `Tipocodproduto` leva em toda chamada a `GetProduto`, AD-033).
  const contextoPrecificacao = useContextoPrecificacao();
  const rotuloCampoCodigo =
    contextoPrecificacao === null
      ? 'Código do produto'
      : rotuloTipoCodigoProduto(contextoPrecificacao.tipoCodProduto);

  const [texto, setTexto] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [resolvido, setResolvido] = useState<RevisaoProduto | null>(null);
  const [quantidadeTexto, setQuantidadeTexto] = useState(() =>
    formatarQuantidade(QUANTIDADE_INICIAL, 3),
  );
  const [precoTexto, setPrecoTexto] = useState('');
  const [descontoTexto, setDescontoTexto] = useState('0,00');

  const campoCodigo = useRef<HTMLInputElement>(null);
  const campoQuantidade = useRef<HTMLInputElement>(null);
  const botaoConfirmar = useRef<HTMLButtonElement>(null);

  const editavel = resolvido?.editavel ?? false;
  const semResolucao = resolvido === null;
  const quantidadeLida = lerQuantidadeTexto(quantidadeTexto);
  const precoLido = editavel ? lerCentavos(precoTexto) : (resolvido?.snapshot.precoBase ?? null);
  const descontoLido = editavel ? lerCentavos(descontoTexto) : ZERO_CENTAVOS;

  // Foco automático ao resolver (TAB): produto editável pousa na quantidade —
  // primeiro campo da sequência de revisão, nunca no botão de inserir; não
  // editável não tem nada a decidir além do que o stepper já resolve, então
  // pousa direto no "+" (Enter já insere, sem exigir mouse).
  useEffect(() => {
    if (resolvido === null) {
      return;
    }
    if (resolvido.editavel) {
      campoQuantidade.current?.focus();
      campoQuantidade.current?.select();
    } else {
      botaoConfirmar.current?.focus();
    }
  }, [resolvido]);

  function resetar(): void {
    setResolvido(null);
    setTexto('');
    setQuantidadeTexto(formatarQuantidade(QUANTIDADE_INICIAL, 3));
    setPrecoTexto('');
    setDescontoTexto('0,00');
    campoCodigo.current?.focus();
  }

  function alterarQuantidade(delta: number): void {
    const atual = quantidadeLida ?? QUANTIDADE_INICIAL;
    const proxima = delta > 0 ? somarQuantidades(atual, UMA_UNIDADE) : atual - UMA_UNIDADE;
    setQuantidadeTexto(formatarQuantidade(milesimos(Math.max(UMA_UNIDADE, proxima)), 3));
  }

  async function confirmarEntradaRapida(): Promise<void> {
    const entrada = texto.trim();
    if (entrada === '' || ocupado || resolvido !== null) {
      return;
    }

    setOcupado(true);
    try {
      const resultado = await inserirPorCodigo(entrada);

      if (resultado.situacao === 'edicao') {
        // Produto `'E'`: a linha não entra ainda; vira revisão editável,
        // mesmo caminho de quando o TAB resolve um produto `'E'` (`FR-014`).
        setResolvido({
          situacao: 'revisao',
          snapshot: resultado.snapshot,
          quantidade: resultado.quantidade,
          origem: 'MANUAL',
          editavel: true,
        });
        setQuantidadeTexto(formatarQuantidade(resultado.quantidade, 3));
        setPrecoTexto(paraTextoDecimal(resultado.snapshot.precoBase));
        setDescontoTexto('0,00');
        // O código digitado permanece visível no campo (só desabilitado)
        // enquanto o operador revisa — é o que o Pencil mostra (`data-icon-name`
        // "Código digitado" convive com o resto da linha já resolvida).
        return;
      }

      if (resultado.situacao === 'inserido') {
        setTexto('');
      }
      // Em recusa o texto permanece: o operador corrige o que digitou.
      campoCodigo.current?.focus();
    } finally {
      setOcupado(false);
    }
  }

  /**
   * Núcleo compartilhado por TAB (`revisarEntrada`, usa `texto` digitado) e
   * pela seleção no modal de busca (`selecionarDaBusca`, usa o código
   * escolhido direto) — os dois caminhos terminam no mesmo lugar: `GetProduto`
   * via `revisarPorCodigo` e a revisão aparece na barra, nunca inserindo
   * sozinho.
   */
  async function resolverEExibir(codigo: string, origemForcada?: 'BUSCA'): Promise<void> {
    setOcupado(true);
    try {
      const resultado = await revisarPorCodigo(codigo, origemForcada);
      if (resultado.situacao === 'recusado') {
        campoCodigo.current?.focus();
        return;
      }
      setResolvido(resultado);
      setQuantidadeTexto(formatarQuantidade(resultado.quantidade, 3));
      setPrecoTexto(paraTextoDecimal(resultado.snapshot.precoBase));
      setDescontoTexto('0,00');
      // Mesma razão do caminho rápido: o código digitado fica visível durante
      // a revisão, só `resetar()` (confirmar/cancelar) o limpa.
    } finally {
      setOcupado(false);
    }
  }

  async function revisarEntrada(): Promise<void> {
    const entrada = texto.trim();
    if (entrada === '' || ocupado || resolvido !== null) {
      return;
    }
    await resolverEExibir(entrada);
  }

  /**
   * Candidato escolhido no modal de busca (`CART-01`) — o modal só devolve o
   * `CodigoProduto`; carregar no campo, resolver via `GetProduto` e mostrar a
   * revisão (quantidade/unidade/preço/desconto, foco na quantidade ou no "+"
   * conforme `pesavelEditavel`) é responsabilidade desta barra, não do modal.
   */
  async function selecionarDaBusca(codigoProduto: string): Promise<void> {
    if (ocupado) {
      return;
    }
    setTexto(codigoProduto);
    await resolverEExibir(codigoProduto, 'BUSCA');
  }

  function confirmar(): void {
    if (resolvido === null) {
      void confirmarEntradaRapida();
      return;
    }
    if (quantidadeLida === null) {
      return;
    }
    if (resolvido.editavel) {
      if (precoLido === null || descontoLido === null) {
        return;
      }
      confirmarEdicao(
        { situacao: 'edicao', snapshot: resolvido.snapshot, quantidade: quantidadeLida },
        { quantidade: quantidadeLida, precoUnitario: precoLido, descontoManual: descontoLido },
      );
    } else {
      confirmarPrevia(resolvido, quantidadeLida);
    }
    resetar();
  }

  function aoTeclarNoCodigo(evento: KeyboardEvent<HTMLInputElement>): void {
    if (evento.key === 'Enter') {
      evento.preventDefault();
      void confirmarEntradaRapida();
      return;
    }
    if (evento.key === 'Tab') {
      // TAB não sai do campo: no PDV ele é a tecla de revisão, não de
      // navegação (AD-027/AD-063).
      evento.preventDefault();
      void revisarEntrada();
    }
  }

  const podeConfirmar =
    resolvido === null
      ? !ocupado && texto.trim() !== ''
      : quantidadeLida !== null && precoLido !== null && descontoLido !== null;

  const classeRotulo = 'font-semibold text-muted-foreground';
  // Sem `flex`: um `<input>` é elemento substituído — `display:flex` nele
  // produz alinhamento inconsistente entre navegadores. A altura fixa
  // (`h-11.5`) já centraliza o texto verticalmente sozinha.
  const classeCampoValor =
    'h-11.5 w-full min-w-0 rounded-xl border border-border bg-muted px-sm font-mono text-md tabular-nums outline-none read-only:cursor-default';

  const precoExibido = editavel
    ? precoTexto
    : formatarCentavos(resolvido === null ? ZERO_CENTAVOS : resolvido.snapshot.precoBase);
  const descontoExibido = editavel ? descontoTexto : formatarCentavos(ZERO_CENTAVOS);

  return (
    <div
      className="flex flex-col gap-xs rounded-3xl border border-border bg-background p-base"
      data-testid="entrada-rapida-produto"
      onKeyDown={(evento) => {
        if (evento.key === 'Escape' && resolvido !== null) {
          resetar();
        }
      }}
    >
      <div className="flex items-end gap-sm" data-testid="previa-insercao-produto">
        <label className="flex min-w-0 flex-1 flex-col gap-xxs text-sm">
          <span className="flex items-center gap-xs font-semibold text-muted-foreground">
            <Barcode className="size-4" aria-hidden="true" />
            {rotuloCampoCodigo}
          </span>
          <input
            ref={campoCodigo}
            className="h-11.5 w-full rounded-xl border border-border bg-muted px-3 font-mono"
            data-testid="campo-codigo-produto"
            autoComplete="off"
            autoFocus
            placeholder="Bipe ou digite (use * p/ quantidade)"
            value={texto}
            disabled={resolvido !== null}
            onChange={(evento) => {
              setTexto(evento.target.value);
            }}
            onKeyDown={aoTeclarNoCodigo}
          />
        </label>

        <Button
          type="button"
          variant="secondary"
          size="icon-sm"
          className="size-11.5 shrink-0 rounded-full"
          aria-label="Buscar produto"
          data-testid="abrir-busca-produto"
          onClick={() => {
            setBuscaAberta(true);
          }}
        >
          <Search className="size-4.5" aria-hidden="true" />
        </Button>

        <label className="flex min-w-0 flex-1 flex-col gap-xxs text-sm">
          <span className={classeRotulo}>Quantidade</span>
          <div className="flex h-11.5 items-center justify-between gap-xs rounded-xl border border-border bg-muted px-xs">
            <Button
              type="button"
              variant="secondary"
              size="icon-sm"
              className="size-8 shrink-0 rounded-full bg-background"
              aria-label="Diminuir quantidade"
              data-testid="previa-quantidade-diminuir"
              onClick={() => {
                alterarQuantidade(-1);
              }}
            >
              <Minus className="size-4" aria-hidden="true" />
            </Button>
            <input
              ref={campoQuantidade}
              className="h-full w-full min-w-0 bg-transparent text-center font-mono text-lg tabular-nums outline-none"
              inputMode="decimal"
              data-testid="previa-quantidade"
              value={quantidadeTexto}
              onChange={(evento) => {
                setQuantidadeTexto(evento.target.value);
              }}
            />
            <Button
              type="button"
              variant="secondary"
              size="icon-sm"
              className="size-8 shrink-0 rounded-full bg-background"
              aria-label="Aumentar quantidade"
              data-testid="previa-quantidade-aumentar"
              onClick={() => {
                alterarQuantidade(1);
              }}
            >
              <Plus className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </label>

        <label className="flex min-w-0 flex-1 flex-col gap-xxs text-sm">
          <span className={classeRotulo}>Unidade</span>
          <input
            className={cn(classeCampoValor, semResolucao && 'text-muted-foreground')}
            data-testid="previa-unidade"
            readOnly
            value={resolvido?.snapshot.unidadeMedida ?? 'UN'}
          />
        </label>

        <label className="flex min-w-0 flex-1 flex-col gap-xxs text-sm">
          <span className={classeRotulo}>Preço unitário</span>
          <input
            className={cn(classeCampoValor, 'text-right', semResolucao && 'text-muted-foreground')}
            inputMode="decimal"
            data-testid="previa-preco-unitario"
            readOnly={!editavel}
            value={precoExibido}
            onChange={(evento) => {
              if (editavel) {
                setPrecoTexto(evento.target.value);
              }
            }}
          />
        </label>

        <label className="flex min-w-0 flex-1 flex-col gap-xxs text-sm">
          <span className={classeRotulo}>Desconto do item</span>
          <input
            className={cn(classeCampoValor, 'text-right', semResolucao && 'text-muted-foreground')}
            inputMode="decimal"
            data-testid="previa-desconto-item"
            readOnly={!editavel}
            value={descontoExibido}
            onChange={(evento) => {
              if (editavel) {
                setDescontoTexto(evento.target.value);
              }
            }}
          />
        </label>

        <label className="flex min-w-0 flex-1 flex-col gap-xxs text-sm">
          <span className={classeRotulo}>Total item</span>
          <strong
            className={cn(
              'flex h-11.5 items-center rounded-xl bg-secondary px-sm font-mono text-lg tabular-nums',
              semResolucao ? 'text-muted-foreground' : 'text-primary',
            )}
            data-testid="previa-total-item"
          >
            {quantidadeLida === null || precoLido === null || descontoLido === null
              ? formatarCentavos(ZERO_CENTAVOS)
              : formatarCentavos(calcularTotalLinha(precoLido, quantidadeLida, descontoLido))}
          </strong>
        </label>

        <Button
          ref={botaoConfirmar}
          type="button"
          className="h-11.5 w-[70px] shrink-0 rounded-full"
          aria-label="Adicionar item à venda"
          data-testid="previa-confirmar"
          disabled={!podeConfirmar}
          onClick={confirmar}
        >
          <Plus className="size-5" aria-hidden="true" />
        </Button>
      </div>

      <p className="text-sm font-medium text-foreground" data-testid="previa-descricao-produto">
        {resolvido?.snapshot.descricao ?? ' '}
      </p>

      <ModalBuscaProduto
        aberto={buscaAberta}
        onFechar={() => {
          setBuscaAberta(false);
        }}
        onProdutoSelecionado={(codigoProduto) => {
          void selecionarDaBusca(codigoProduto);
        }}
      />
    </div>
  );
}
