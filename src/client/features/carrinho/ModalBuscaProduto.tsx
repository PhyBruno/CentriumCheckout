import { Box, BoxSearch, CheckCircle, ChevronLeft, ChevronRight, Search, X } from 'reicon-react';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { Skeleton } from 'boneyard-js/react';
import { Button } from '@/components/ui/button';
import { lerDecimalDigitado } from '@/lib/numeroDigitado';
import { cn } from '@/lib/utils';
import { useFocoDeModal } from '@/lib/useFocoDeModal';
import { DURACAO_SAIDA_MODAL_MS, usePresenca } from '@/lib/usePresenca';
import { notificar } from '@/lib/notificar';
import {
  filtrarPorSaldo,
  filtroSaldoAtivo,
  OPERADORES_SALDO,
  type FiltroSaldo,
  type OperadorSaldo,
} from '../../domain/estoque/filtroSaldo';
import {
  formatarSaldo,
  saldoEmMilesimos,
  type SaldoMilesimos,
} from '../../domain/estoque/saldoProduto';
import {
  codigoParaConsulta,
  type ConsultaDeProduto,
} from '../../domain/precificacao/codigoProduto';
import { ITENS_POR_PAGINA } from '../../services/paginacao';
import { useBuscaProdutos } from '../../services/produto/produtoQueries';
import { useQtdMinCharParaConsulta, useTipoCodigoProduto } from './useCarrinho';

/**
 * Um candidato da lista de `GetListaProdutos`, como esta tela o consome.
 *
 * Declarado aqui (e não importado do schema) pelo mesmo motivo de sempre nesta
 * base: a tela depende só do que exibe e do que reenvia, não do SDT inteiro.
 */
interface ProdutoDaBusca {
  readonly CodigoProduto: string;
  readonly Descricao: string;
  readonly Referencia: string;
  readonly CodigoBarras: string;
  readonly UDM: string;
  /** Saldo em milésimos com sinal; ausente quando o ERP não o publica. */
  readonly Estoque?: SaldoMilesimos | undefined;
}

/**
 * Modal de busca de produto por termo livre (T015, `CART-01`) — réplica do
 * frame "PDV Online Web - Modal produto" do Pencil (`design/CentriumCheckout.pen`,
 * nó `UM0Ej`, confirmado via MCP do Pencil).
 *
 * **Coluna "Saldo" e filtro de estoque desde 2026-10-01** (AD-258, pedido do
 * usuário): `GetListaProdutos` devolve `Estoque`, e o filtro do desenho (nó
 * `pTSJu` — `>=`, `<=`, `=` e uma quantidade) age **localmente** sobre a página
 * carregada, porque o endpoint não tem parâmetro de estoque.
 *
 * Seguem omitidos a coluna "Preço" e o filtro de grupo: a lista traz preços
 * crus por faixa, não o preço resolvido para o cliente (AD-091), e não existe
 * parâmetro de grupo no contrato. Mostrá-los exigiria inventar dado.
 *
 * O modal é **só um seletor de código** — não resolve, não revisa e não
 * insere nada sozinho. Escolher um candidato só devolve a consulta
 * (`codigo` + `tipoCodigo`) via `onProdutoSelecionado`; quem faz a chamada a `GetProduto`, decide se o
 * produto é editável/pesável e mostra os campos de revisão é a barra de
 * entrada rápida (`EntradaRapidaProduto`, que também é quem monta este
 * modal) — o mesmo caminho de quando o operador digita o código e aperta TAB.
 * Achado do usuário (2026-09-03): a revisão vivia por engano dentro deste
 * modal (via `EdicaoItemEditavel`), duplicando a UI que já existe na barra.
 */
export interface ModalBuscaProdutoProps {
  readonly aberto: boolean;
  readonly onFechar: () => void;
  readonly onProdutoSelecionado: (consulta: ConsultaDeProduto) => void;
}

/**
 * Espera sem digitar antes de consultar o ERP (achado da revisão de código):
 * sem isto, cada tecla acima do piso de `QtdMinCharParaConsulta` disparava uma
 * chamada real a `GetListaProdutos` — digitar um termo de 18 caracteres virava
 * ~15 requisições. O piso de caracteres (AD-024) continua reagindo à digitação
 * crua, sem debounce — só a chamada de rede espera o operador parar de digitar.
 */
const DEBOUNCE_BUSCA_MS = 300;

/**
 * O modal abre filtrando `saldo >= 0` (pedido do usuário, 2026-10-01, AD-258):
 * o caso comum é procurar o que tem estoque, e os negativos ficam a um apagar
 * de distância. O texto, e não o número, porque é o que o campo exibe.
 */
const FILTRO_SALDO_INICIAL: { readonly operador: OperadorSaldo; readonly quantidade: string } = {
  operador: '>=',
  quantidade: '0',
};

export function ModalBuscaProduto({
  aberto,
  onFechar,
  onProdutoSelecionado,
}: ModalBuscaProdutoProps): ReactElement | null {
  const [termo, setTermo] = useState('');
  const [termoDebounced, setTermoDebounced] = useState('');
  const [pagina, setPagina] = useState(1);
  const [operadorSaldo, setOperadorSaldo] = useState<OperadorSaldo>(FILTRO_SALDO_INICIAL.operador);
  const [quantidadeSaldo, setQuantidadeSaldo] = useState(FILTRO_SALDO_INICIAL.quantidade);
  const qtdMinChar = useQtdMinCharParaConsulta();
  const tipoCodigoProduto = useTipoCodigoProduto();

  // O componente nunca desmonta (`App.tsx` sempre o renderiza, `aberto` só
  // controla se devolve `null`) — sem isto, reabrir o modal reaproveitava o
  // termo/página da consulta anterior em vez de começar do zero. Reseta
  // durante a própria renderização (padrão oficial do React para "ajustar
  // estado quando uma prop muda"), não num `useEffect`: um efeito só rodaria
  // depois do primeiro render com `aberto=true`, e nesse meio-tempo
  // `useBuscaProdutos` já teria dado um flash de busca com o termo antigo.
  const [abertoAnterior, setAbertoAnterior] = useState(aberto);
  if (aberto !== abertoAnterior) {
    setAbertoAnterior(aberto);
    if (aberto) {
      setTermo('');
      setTermoDebounced('');
      setPagina(1);
      setOperadorSaldo(FILTRO_SALDO_INICIAL.operador);
      setQuantidadeSaldo(FILTRO_SALDO_INICIAL.quantidade);
    }
  }

  // O `useEffect` (e não o ajuste-durante-render acima) é obrigatório aqui:
  // debounce é inerentemente assíncrono — não existe "valor calculável agora"
  // para `termoDebounced`, só um efeito colateral (timer) que dispara no futuro.
  useEffect(() => {
    const temporizador = setTimeout(() => {
      setTermoDebounced(termo);
    }, DEBOUNCE_BUSCA_MS);
    return () => {
      clearTimeout(temporizador);
    };
  }, [termo]);

  // Piso vem do ERP (AD-024). Enquanto o bootstrap não chegou, um piso
  // inalcançável mantém a busca desligada — melhor não buscar do que buscar com
  // um mínimo inventado.
  const minimo = qtdMinChar ?? Number.POSITIVE_INFINITY;
  const busca = useBuscaProdutos(termoDebounced, { qtdMinCharParaConsulta: minimo, pagina });

  const { montado, saindo } = usePresenca(aberto, DURACAO_SAIDA_MODAL_MS);
  // Foco inicial declarado, e não `autoFocus` (feature 016): ver
  // `OpcoesFocoDeModal.focoInicial`.
  const campoBusca = useRef<HTMLInputElement>(null);
  const janelaRef = useFocoDeModal<HTMLDivElement>(aberto, { focoInicial: campoBusca });

  // Fechar não desmonta na hora: o overlay fica no DOM pelo tempo da
  // animação de saída (`usePresenca`).
  if (!montado) {
    return null;
  }

  const termoLimpo = termo.trim();
  const abaixoDoMinimo = termoLimpo.length < minimo;

  // Campo vazio desliga o filtro — aqui vazio **não** vale zero, ao contrário
  // da regra de `lerDecimalDigitado`: "saldo >= 0" esconderia os negativos sem
  // o operador ter pedido filtro nenhum. Texto inválido também desliga, e o
  // campo é marcado como inválido.
  const quantidadeDigitada =
    quantidadeSaldo.trim() === '' ? null : lerDecimalDigitado(quantidadeSaldo, 3);
  const quantidadeInvalida = quantidadeSaldo.trim() !== '' && quantidadeDigitada === null;
  const filtroSaldo: FiltroSaldo = {
    operador: operadorSaldo,
    quantidade: quantidadeDigitada === null ? null : saldoEmMilesimos(quantidadeDigitada),
  };
  const produtosDaPagina = busca.data?.Produtos ?? [];
  const produtosFiltrados = filtrarPorSaldo(
    produtosDaPagina,
    (produto) => produto.Estoque ?? null,
    filtroSaldo,
  );

  /**
   * O candidato inteiro entra, **uma consulta** sai — código e o
   * `Tipocodproduto` que o casa (AD-204, revisto por AD-205).
   *
   * A escolha do campo começa pelo `Tipocodproduto` da sessão: com `'B'` o ERP
   * filtra por código de barras, e devolver o reduzido — como se fazia — casava
   * com nada e trazia o SDT vazio. Mas o tipo da sessão é preferência, não
   * trava: quando o candidato não tem aquele campo preenchido (produto sem
   * código de barras numa empresa em `'B'`), `codigoParaConsulta` cai para o
   * próximo campo disponível e devolve o tipo correspondente, que a barra
   * envia nesta chamada. Antes disso o produto aparecia na busca e não entrava
   * por caminho nenhum (correção do usuário, 2026-09-10).
   *
   * `null` só sairia de um candidato com os três campos vazios, o que o ERP não
   * produz — mas se sair, nada é inserido e o modal fica aberto: fechá-lo em
   * silêncio esconderia do operador por que o produto não entrou.
   */
  function selecionar(candidato: ProdutoDaBusca): void {
    const consulta = codigoParaConsulta(candidato, tipoCodigoProduto ?? '');
    if (consulta === null) {
      notificar.erro(
        `"${candidato.Descricao}" não tem código cadastrado no ERP — não é possível inseri-lo.`,
      );
      return;
    }

    onProdutoSelecionado(consulta);
    onFechar();
  }

  return (
    <div
      className={cn(
        // Sem folga no compacto: a janela ocupa a tela inteira (ver a classe
        // dela logo abaixo), então o `p-lg` só encolheria a área útil.
        'fixed inset-0 z-50 flex items-start justify-center bg-black/40 md:p-lg',
        saindo ? 'cc-backdrop-sai' : 'cc-backdrop-entra',
      )}
      data-testid="modal-busca-produto"
      onKeyDown={(evento) => {
        if (evento.key === 'Escape') {
          onFechar();
        }
      }}
    >
      <div
        ref={janelaRef}
        role="dialog"
        aria-modal="true"
        aria-label="Buscar produto"
        className={cn(
          // **Tela cheia no compacto, janela a partir de `md:`** — mesmo padrão
          // dos seletores de cliente e vendedor (pedido do usuário, 2026-09-09).
          // Os três são a mesma superfície com catálogos diferentes; divergir
          // aqui criaria três gramáticas de busca no mesmo produto.
          'flex h-full w-full flex-col overflow-hidden bg-background md:h-auto md:max-h-full md:max-w-3xl md:rounded-3xl md:shadow-lg',
          saindo ? 'cc-modal-sai' : 'cc-modal-entra',
        )}
      >
        <header className="flex items-center justify-between gap-sm border-b border-border px-base py-2.5 md:px-lg md:py-base">
          <div className="flex min-w-0 items-center gap-sm">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary md:size-[42px]">
              <BoxSearch className="size-4.5 text-primary md:size-5" aria-hidden="true" />
            </span>
            <div className="flex min-w-0 flex-col gap-[2px]">
              <h2 className="truncate text-lg font-semibold text-foreground md:text-xl">
                Consultar produto
              </h2>
              {/* O subtítulo some no compacto: em 390px ele empurrava o
                  cabeçalho para duas linhas e repete o placeholder do campo
                  logo abaixo. */}
              <p className="hidden text-sm font-medium text-muted-foreground md:block">
                Busque por código, descrição, SKU ou referência
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="icon-sm"
            className="size-10 shrink-0 rounded-full"
            aria-label="Fechar"
            onClick={onFechar}
          >
            <X className="size-4.5" aria-hidden="true" />
          </Button>
        </header>

        <div className="flex flex-col gap-sm border-b border-border px-base py-2.5 md:px-lg md:py-base">
          {/* Busca e filtro de saldo na mesma linha no desktop (nó `m738u`, vão
              de 10); no compacto o filtro desce para a linha de baixo — em
              390px os dois juntos espremeriam o campo de busca. */}
          <div className="flex flex-col gap-sm md:flex-row md:items-center md:gap-[10px]">
            <label className="flex h-11 items-center gap-sm rounded-full bg-secondary px-base text-sm font-medium text-foreground md:flex-1">
              <Search className="size-4.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="sr-only">Termo de busca</span>
              <input
                className="h-full w-full bg-transparent outline-none placeholder:text-muted-foreground"
                data-testid="campo-busca-produto"
                ref={campoBusca}
                autoComplete="off"
                placeholder="Busque por código, descrição, SKU ou referência"
                value={termo}
                onChange={(evento) => {
                  setTermo(evento.target.value);
                  // Nova busca sempre começa na página 1 — trocar o termo com a
                  // página em 3, por exemplo, não deve reconsultar a página 3 do
                  // resultado novo (que pode nem existir).
                  setPagina(1);
                }}
              />
            </label>
            <FiltroDeSaldo
              operador={operadorSaldo}
              quantidade={quantidadeSaldo}
              invalida={quantidadeInvalida}
              onTrocarOperador={setOperadorSaldo}
              onTrocarQuantidade={setQuantidadeSaldo}
            />
          </div>
          {busca.data === undefined || abaixoDoMinimo ? null : (
            <p className="text-sm font-semibold text-foreground" data-testid="contagem-produtos">
              {filtroSaldoAtivo(filtroSaldo)
                ? `${String(produtosFiltrados.length)} de ${String(produtosDaPagina.length)} produto(s) desta página com saldo ${operadorSaldo} ${quantidadeSaldo.trim()}`
                : `${String(busca.data.TotalRegistros)} produto(s) encontrado(s)`}
            </p>
          )}
        </div>

        <div className="min-h-40 flex-1 overflow-y-auto" aria-live="polite">
          {abaixoDoMinimo ? (
            <p
              className="p-base text-sm text-muted-foreground"
              data-testid="busca-abaixo-do-minimo"
            >
              {qtdMinChar === null
                ? 'Aguardando a configuração do ponto de venda.'
                : `Digite ao menos ${String(qtdMinChar)} caracteres para buscar.`}
            </p>
          ) : busca.isPending || busca.isFetching ? (
            // O shimmer é gerado pelo Boneyard a partir da estrutura real; sem
            // os bones capturados (`npm run bones`), vale o `fallback` estático.
            <Skeleton
              name="busca-produtos"
              loading
              fixture={<EstruturaResultados />}
              fallback={<EstruturaResultados aria-hidden />}
            >
              <EstruturaResultados />
            </Skeleton>
          ) : busca.isError ? (
            <p className="p-base text-sm text-destructive">
              Não foi possível buscar produtos. Tente novamente.
            </p>
          ) : (
            <ResultadosDaBusca
              produtos={produtosFiltrados}
              filtradoPorSaldo={filtroSaldoAtivo(filtroSaldo) && produtosDaPagina.length > 0}
              onSelecionar={(candidato) => {
                selecionar(candidato);
              }}
            />
          )}
        </div>

        {busca.data === undefined || abaixoDoMinimo ? null : (
          <footer
            className="flex items-center justify-between gap-sm border-t border-border px-base py-sm md:px-lg"
            data-testid="paginacao-busca"
          >
            <span className="sr-only">
              Página {busca.data.PaginaAtual} de {busca.data.TotalPaginas} ·{' '}
              {busca.data.TotalRegistros} produto(s)
            </span>
            <div className="flex items-center gap-xs">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="gap-xs rounded-full"
                data-testid="pagina-anterior"
                disabled={pagina <= 1}
                onClick={() => {
                  setPagina((atual) => Math.max(1, atual - 1));
                }}
              >
                <ChevronLeft className="size-3.5" aria-hidden="true" />
                Anterior
              </Button>
              <span className="flex h-9 items-center rounded-full bg-secondary px-sm text-xs font-semibold text-foreground">
                {busca.data.PaginaAtual} de {busca.data.TotalPaginas}
              </span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="gap-xs rounded-full"
                data-testid="pagina-proxima"
                disabled={busca.data.PaginaAtual >= busca.data.TotalPaginas}
                onClick={() => {
                  setPagina((atual) => atual + 1);
                }}
              >
                Próxima
                <ChevronRight className="size-3.5" aria-hidden="true" />
              </Button>
            </div>
          </footer>
        )}
      </div>
    </div>
  );
}

interface FiltroDeSaldoProps {
  readonly operador: OperadorSaldo;
  /** Texto digitado, cru — a leitura numérica é de quem monta o filtro. */
  readonly quantidade: string;
  readonly invalida: boolean;
  readonly onTrocarOperador: (operador: OperadorSaldo) => void;
  readonly onTrocarQuantidade: (texto: string) => void;
}

/** Nome lido em voz alta para cada operador — `>=` sozinho não diz nada a um leitor de tela. */
const NOME_DO_OPERADOR: Readonly<Record<OperadorSaldo, string>> = {
  '>=': 'Saldo maior ou igual a',
  '<=': 'Saldo menor ou igual a',
  '=': 'Saldo igual a',
};

/**
 * Pílula "Saldo" do Pencil (nó `pTSJu`): 36 de altura, `$surface-strong`,
 * ícone `boxes` (o `Box` do reicon) de 15, rótulo Inter 12/600, o grupo de
 * operadores (pílula branca de 30 com três discos de 26 — o ativo em
 * `$cb-blue` com texto branco) e a quantidade num campo branco de 44×26, raio
 * 8, hairline.
 */
function FiltroDeSaldo({
  operador,
  quantidade,
  invalida,
  onTrocarOperador,
  onTrocarQuantidade,
}: FiltroDeSaldoProps): ReactElement {
  return (
    <div
      className="flex h-9 shrink-0 items-center gap-xs self-start rounded-full bg-secondary pr-[10px] pl-sm md:self-auto"
      data-testid="filtro-saldo"
    >
      <Box className="size-[15px] shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="text-sm font-semibold text-foreground">Saldo</span>
      <div
        role="radiogroup"
        aria-label="Comparação do saldo"
        className="flex h-[30px] items-center gap-[2px] rounded-full bg-card p-[2px]"
      >
        {OPERADORES_SALDO.map((opcao) => {
          const ativo = opcao === operador;
          return (
            <button
              key={opcao}
              type="button"
              role="radio"
              aria-checked={ativo}
              aria-label={NOME_DO_OPERADOR[opcao]}
              data-testid={`operador-saldo-${opcao}`}
              className={cn(
                'flex size-[26px] items-center justify-center rounded-full text-sm font-semibold',
                ativo
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent',
              )}
              onClick={() => {
                onTrocarOperador(opcao);
              }}
            >
              {opcao}
            </button>
          );
        })}
      </div>
      <input
        className={cn(
          'h-[26px] w-11 rounded-sm border bg-card px-[6px] text-center font-mono text-sm font-semibold text-foreground outline-none',
          invalida ? 'border-destructive' : 'border-border',
        )}
        data-testid="quantidade-filtro-saldo"
        aria-label={NOME_DO_OPERADOR[operador]}
        aria-invalid={invalida}
        inputMode="decimal"
        autoComplete="off"
        placeholder="—"
        value={quantidade}
        onChange={(evento) => {
          onTrocarQuantidade(evento.target.value);
        }}
      />
    </div>
  );
}

interface ResultadosDaBuscaProps {
  readonly produtos: readonly ProdutoDaBusca[];
  /** A página veio com produtos e o filtro de saldo escondeu todos — muda a frase do vazio. */
  readonly filtradoPorSaldo: boolean;
  /**
   * Recebe o **candidato inteiro**, não um código: qual dos três códigos dele é
   * o utilizável depende do `Tipocodproduto` da sessão, e essa decisão mora em
   * quem tem a sessão (`selecionar`), não na lista (AD-204).
   */
  readonly onSelecionar: (candidato: ProdutoDaBusca) => void;
}

const classeCelulaCabecalho =
  'flex h-full items-center px-sm text-xs font-bold text-muted-foreground';

/** Rótulo que nomeia o campo só no compacto — ver `ModalBuscaCliente`. */
const classeRotuloCompacto = 'font-semibold text-foreground md:hidden';

/**
 * Rótulo que existe nas duas larguras: "Referência" e "EAN" não têm coluna
 * própria na tabela do desktop (moram na sub-linha da descrição), então lá o
 * nome do campo também é a única pista do que é aquele número — só o peso muda,
 * negrito no compacto e normal na sub-linha.
 */
const classeRotuloSempre = 'font-semibold text-foreground md:font-normal md:text-muted-foreground';

/**
 * Tabela no desktop, cartão de três linhas no compacto — mesma grade de duas
 * colunas de `ModalBuscaCliente`/`ModalBuscaVendedor`.
 *
 * A ordem do compacto é a pedida pelo usuário (2026-09-09): descrição na faixa
 * inteira, depois `Cód. Produto | Referência` e `Unidade | EAN`. Ela **não** é a
 * ordem do DOM, que continua sendo a da tabela do desktop (código, descrição,
 * referência, EAN, unidade) — quem reordena é `order` no compacto, zerado no
 * `md:`. É por isso que o EAN leva `order-1`: sem ele a unidade cairia depois do
 * EAN, invertendo a última faixa.
 *
 * Os dois invólucros da coluna "Produto" viram `display: contents` no compacto:
 * assim descrição, referência e EAN participam da grade da linha como células
 * próprias, e no `md:` voltam a ser a caixa em coluna com a sub-linha embaixo da
 * descrição. Sem isso a alternativa seria escrever a linha duas vezes.
 */
function ResultadosDaBusca({
  produtos,
  filtradoPorSaldo,
  onSelecionar,
}: ResultadosDaBuscaProps): ReactElement {
  if (produtos.length === 0) {
    return (
      <p className="p-base text-sm text-muted-foreground" data-testid="busca-sem-resultados">
        {filtradoPorSaldo
          ? 'Nenhum produto desta página atende ao filtro de saldo.'
          : 'Nenhum produto encontrado para o termo informado.'}
      </p>
    );
  }

  return (
    <div data-testid="resultados-busca">
      {/* O cabeçalho de colunas só faz sentido onde há colunas. */}
      <div className="hidden h-9 border-y border-border bg-muted md:flex" aria-hidden="true">
        <span className={cn(classeCelulaCabecalho, 'w-11')} />
        <span className={cn(classeCelulaCabecalho, 'w-32')}>Código</span>
        <span className={cn(classeCelulaCabecalho, 'flex-1')}>Produto</span>
        <span className={cn(classeCelulaCabecalho, 'w-[108px]')}>Saldo</span>
        <span className={cn(classeCelulaCabecalho, 'w-24')}>Unidade</span>
      </div>
      <ul>
        {produtos.map((produto) => (
          <li key={produto.CodigoProduto} className="border-b border-border last:border-b-0">
            <button
              type="button"
              data-testid="candidato-produto"
              data-codigo-produto={produto.CodigoProduto}
              className="grid w-full grid-cols-[minmax(0,auto)_minmax(0,1fr)] items-center gap-x-sm gap-y-0.5 px-base py-2.5 text-left hover:bg-accent md:flex md:h-10 md:gap-0 md:px-0 md:py-0"
              onClick={() => {
                onSelecionar(produto);
              }}
            >
              {/* `circle-check` do Pencil (MCP, nó `UM0Ej`, "Resultado produto
                  ... check"): indica que escolher a linha carrega o código no
                  campo — correção do usuário, 2026-09-03 (era `Circle`). */}
              <span className="hidden w-11 shrink-0 items-center justify-center md:flex">
                <CheckCircle className="size-4 text-muted-foreground/60" aria-hidden="true" />
              </span>
              <span className="min-w-0 truncate text-sm text-muted-foreground md:w-32 md:shrink-0 md:px-sm md:text-foreground">
                <span className={classeRotuloCompacto}>Cód. Produto: </span>
                <span className="font-mono font-bold tabular-nums">{produto.CodigoProduto}</span>
              </span>
              {/* Sem vão entre a descrição e a sub-linha no desktop: a linha
                  tem 40px de altura (dez por página, sem rolagem) e as duas
                  linhas de texto já vêm com o respiro do `line-height`. */}
              <span className="contents md:flex md:min-w-0 md:flex-1 md:flex-col md:px-sm">
                <span className="order-first col-span-2 min-w-0 truncate font-medium md:order-none">
                  {produto.Descricao}
                </span>
                <span className="contents md:flex md:min-w-0 md:gap-xs">
                  <span className="min-w-0 truncate text-sm text-muted-foreground md:text-xs">
                    <span className={classeRotuloSempre}>Referência: </span>
                    <span className="font-mono">{produto.Referencia}</span>
                  </span>
                  <span className="order-1 min-w-0 truncate text-sm text-muted-foreground md:order-none md:text-xs">
                    {/* O ponto separa "Referência" de "EAN" só no desktop, onde
                        os dois dividem a mesma sub-linha da descrição. No
                        compacto eles estão em faixas diferentes da grade e o
                        espaçamento já os separa (correção do usuário,
                        2026-09-09). */}
                    <span className="hidden md:inline" aria-hidden="true">
                      ·{' '}
                    </span>
                    <span className={classeRotuloSempre}>EAN: </span>
                    <span className="font-mono">{produto.CodigoBarras}</span>
                  </span>
                </span>
              </span>
              {/* Saldo (AD-258), Geist Mono como no desenho. No compacto entra
                  depois do EAN (`order-2`), numa faixa própria. */}
              <span
                className="order-2 min-w-0 truncate text-sm text-muted-foreground md:order-none md:w-[108px] md:shrink-0 md:px-sm md:text-foreground"
                data-testid="saldo-candidato"
              >
                <span className={classeRotuloCompacto}>Saldo: </span>
                <span className="font-mono font-semibold tabular-nums">
                  {produto.Estoque === undefined ? '—' : formatarSaldo(produto.Estoque)}
                </span>
              </span>
              <span className="min-w-0 truncate text-sm text-muted-foreground md:w-24 md:shrink-0 md:px-sm md:text-foreground">
                <span className={classeRotuloCompacto}>Unidade: </span>
                <span className="font-medium">{produto.UDM}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Estrutura de layout que o Boneyard fotografa para gerar o shimmer da lista.
 *
 * **Uma linha por item da página, na altura da linha carregada** — não mais seis
 * cartões soltos: assim a área de resultados tem a mesma altura antes e depois
 * de o resultado chegar, e a janela não salta de tamanho no meio da consulta.
 */
function EstruturaResultados(props: { 'aria-hidden'?: boolean }): ReactElement {
  return (
    <ul aria-hidden={props['aria-hidden']}>
      {/* Cabeçalho da tabela no esqueleto (correção do usuário, 2026-09-16) —
          `h-9` e `hidden md:block`, como o real desta janela. */}
      <li className="hidden h-9 border-y border-border bg-muted md:block" aria-hidden="true" />
      {Array.from({ length: ITENS_POR_PAGINA }, (_, indice) => (
        <li
          key={indice}
          className="flex h-[70px] items-center border-b border-border px-base last:border-b-0 md:h-10"
        >
          <div className="h-3.5 rounded-sm bg-secondary" style={{ width: `${80 - indice * 5}%` }} />
        </li>
      ))}
    </ul>
  );
}
