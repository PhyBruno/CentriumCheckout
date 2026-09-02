import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { gooeyToast } from 'goey-toast';
import {
  ErroPrecoIndisponivelParaPesagem,
  interpretarEntradaCodigo,
  quantidadePesavel,
  type EntradaCodigo,
} from '../../domain/precificacao/codigoProduto';
import type { Centavos } from '../../domain/precificacao/dinheiro';
import type {
  LinhaCarrinho,
  OrigemLinha,
  SnapshotPrecoProduto,
} from '../../domain/precificacao/linha';
import { milesimosDeUnidades, type Milesimos } from '../../domain/precificacao/quantidade';
import {
  ErroProdutoNaoEncontrado,
  ErroRespostaInvalida,
  invalidarCacheDeProduto,
  opcoesProduto,
  type ContextoPrecificacao,
} from '../../services/produto/produtoQueries';
import { useSessionStore } from '../../stores/sessionStore';
import { useVendaStore } from '../../stores/vendaStore';

/**
 * Orquestração de inserção de produto, compartilhada pelos dois caminhos de
 * entrada — modal de busca (US1) e código direto (US2).
 *
 * Fica num hook, e não em cada componente, porque a decisão de fluxo por
 * `ProdutoPesavelEditavel` (`research.md` D7) é a mesma nos dois: duplicá-la
 * criaria dois caminhos de inserção com semânticas divergentes, exatamente o
 * que AD-091 rejeitou.
 */

/** `TipoPreco` em que a lista de preço do cliente entra na chamada (AD-092). */
const TIPO_PRECO_POR_LISTA = 9;

const QUANTIDADE_PADRAO = 1;

/**
 * Contexto de precificação da sessão + cliente atual.
 *
 * `Codcliente` sai de `SessaoUsuario.ClienteDefaultCodigo` enquanto a feature
 * 005 não trocar o cliente: o cliente default existe desde o início da venda
 * (AD-032) e nunca tem convênio nem exige `GetCliente` (AD-108).
 */
export function useContextoPrecificacao(): ContextoPrecificacao | null {
  const registro = useSessionStore((estado) => estado.registro);
  if (registro === null) {
    return null;
  }

  const sessao = registro.SessaoUsuario;
  return {
    tipoCodProduto: sessao.UsuarioTipoCodigoProduto,
    tipoPreco: sessao.TipoPreco,
    codigoCliente: sessao.ClienteDefaultCodigo,
    listaPreco: sessao.TipoPreco === TIPO_PRECO_POR_LISTA ? sessao.ListaPrecoDefault : null,
  };
}

/** Piso de caracteres para a busca — vem do ERP, nunca hardcoded (AD-024). */
export function useQtdMinCharParaConsulta(): number | null {
  return useSessionStore((estado) => estado.registro?.SessaoUsuario.QtdMinCharParaConsulta ?? null);
}

/** O produto exige revisão do operador antes de entrar na venda (`FR-014`). */
export interface PendenteDeEdicao {
  readonly situacao: 'edicao';
  readonly snapshot: SnapshotPrecoProduto;
  readonly quantidade: Milesimos;
}

export type ResultadoInsercao =
  { readonly situacao: 'inserido' } | { readonly situacao: 'recusado' } | PendenteDeEdicao;

/**
 * Produto resolvido para revisão sob demanda (TAB no campo de código, barra de
 * entrada rápida) — nunca insere sozinho, ao contrário de `inserirPorCodigo`.
 * `editavel` espelha `ProdutoPesavelEditavel = 'E'` e decide, no componente, se
 * preço/desconto podem ser ajustados (`EdicaoItemEditavel`) ou só a quantidade
 * (`PreviaInsercaoProduto`).
 */
export interface RevisaoProduto {
  readonly situacao: 'revisao';
  readonly snapshot: SnapshotPrecoProduto;
  readonly quantidade: Milesimos;
  readonly origem: OrigemInsercaoViva;
  readonly editavel: boolean;
}

export type ResultadoRevisao = RevisaoProduto | { readonly situacao: 'recusado' };

/**
 * Origens que este caminho de inserção pode produzir — nunca as congeladas
 * (`'RASCUNHO'`/`'DAV'`, `InserirItemInput` em `carrinhoSlice.ts`), que exigem
 * `precoUnitario` obrigatório e entram por um caminho dedicado ainda não
 * implementado (retomada de rascunho da feature 004, importação de DAV da
 * feature 006) — nunca por `useInsercaoDeProduto`.
 */
type OrigemInsercaoViva = Exclude<OrigemLinha, 'RASCUNHO' | 'DAV'>;

export interface OpcoesInsercao {
  readonly origem?: OrigemInsercaoViva;
  readonly quantidade?: Milesimos;
}

function mensagemDeErro(erro: unknown): string {
  if (erro instanceof ErroProdutoNaoEncontrado) {
    return `Produto ${erro.codigoProduto} não encontrado.`;
  }
  if (erro instanceof ErroRespostaInvalida) {
    return 'O ERP devolveu um produto em formato inesperado. Nada foi inserido.';
  }
  if (erro instanceof ErroPrecoIndisponivelParaPesagem) {
    return 'Produto pesável sem preço cadastrado no ERP. Nada foi inserido.';
  }
  return 'Não foi possível consultar o produto. Tente novamente.';
}

/**
 * Quantidade e origem derivadas da classificação da entrada.
 *
 * Em produto pesável (`'S'`/`'B'`) o valor da etiqueta serve **exclusivamente**
 * para derivar a quantidade; o total da linha é recalculado depois por
 * `preço × quantidade`, como em qualquer outra linha (`data-model.md` §1).
 */
function quantidadeEOrigem(
  entrada: EntradaCodigo,
  snapshot: SnapshotPrecoProduto,
): { quantidade: Milesimos; origem: OrigemInsercaoViva } {
  if (entrada.tipo === 'BALANCA') {
    return {
      quantidade: quantidadePesavel(entrada.valorEtiqueta, snapshot.precoBase),
      origem: 'BALANCA',
    };
  }
  if (entrada.tipo === 'COM_QTD') {
    return { quantidade: entrada.quantidade, origem: 'MANUAL' };
  }
  return { quantidade: milesimosDeUnidades(QUANTIDADE_PADRAO), origem: 'MANUAL' };
}

export interface ApiInsercao {
  /** Resolve o produto por código e decide o fluxo pelo `ProdutoPesavelEditavel`. */
  inserirPorCodigo(texto: string): Promise<ResultadoInsercao>;
  /** Confirma a inserção de um produto `'E'` depois da revisão do operador. */
  confirmarEdicao(
    pendente: PendenteDeEdicao,
    ajustes: { quantidade: Milesimos; precoUnitario: Centavos; descontoManual: Centavos },
  ): void;
  /**
   * TAB no campo de código (ou seleção no modal de busca, que carrega o
   * código no campo e chama isto do mesmo jeito): resolve o produto **sem
   * inserir**, para a barra de entrada rápida mostrar a prévia (nome,
   * unidade, preço, total) antes de confirmar — nunca insere sozinho, ao
   * contrário de `inserirPorCodigo`.
   *
   * `origemForcada` existe só para o caminho da busca (`CART-01`, AD-091):
   * o texto resolvido é sempre um código simples digitado pela própria
   * barra, então `quantidadeEOrigem` classificaria como `'MANUAL'` — sem o
   * override a proveniência "veio da busca" se perderia da linha inserida.
   */
  revisarPorCodigo(texto: string, origemForcada?: 'BUSCA'): Promise<ResultadoRevisao>;
  /** Confirma a prévia de um produto **não editável** — só a quantidade é ajustável. */
  confirmarPrevia(revisao: RevisaoProduto, quantidade: Milesimos): void;
}

/**
 * Encerramento da venda (T040): esvazia o carrinho e descarta o cache de
 * produto, nos dois — e **apenas** nos dois — momentos permitidos, finalização e
 * suspensão (`research.md`, D5).
 *
 * Fora daqui, `staleTime` precisa valer: invalidar o cache no meio da venda
 * permitiria que o mesmo SKU produzisse linhas de tabelas divergentes.
 *
 * A auditoria **não** é descartada aqui: `descartarAuditoria` só pode ser
 * chamado depois de `FaturarNFCe` retornar sucesso (FR-007 da feature 001), e
 * quem sabe disso é a feature 004.
 */
export function useEncerrarVenda(): () => void {
  const queryClient = useQueryClient();
  const limparCarrinho = useVendaStore((estado) => estado.limparCarrinho);

  return useCallback(() => {
    limparCarrinho();
    invalidarCacheDeProduto(queryClient);
  }, [limparCarrinho, queryClient]);
}

export function useInsercaoDeProduto(): ApiInsercao {
  const queryClient = useQueryClient();
  const contexto = useContextoPrecificacao();
  const inserirItem = useVendaStore((estado) => estado.inserirItem);

  /**
   * `queryClient.query` (e não `fetchProduto` direto) é o que garante `CART-03`:
   * reinserir um SKU já presente na venda resolve pelo cache, sem nova chamada.
   * `staleTime: 'static'` é o "nunca refetch enquanto o dado estiver em cache"
   * do TanStack Query v5 — a única fronteira de frescor é o fim da venda, quando
   * `invalidarCacheDeProduto` descarta tudo (`research.md`, D5).
   */
  const resolverProduto = useCallback(
    async (codigoProduto: string): Promise<SnapshotPrecoProduto> => {
      if (contexto === null) {
        throw new Error('Configuração do ponto de venda ainda não carregada.');
      }
      return queryClient.query({
        ...opcoesProduto(codigoProduto, contexto),
        staleTime: 'static',
      });
    },
    [contexto, queryClient],
  );

  const inserirResolvido = useCallback(
    async (
      codigoProduto: string,
      entrada: EntradaCodigo,
      opcoes: OpcoesInsercao = {},
    ): Promise<ResultadoInsercao> => {
      let snapshot: SnapshotPrecoProduto;
      try {
        snapshot = await resolverProduto(codigoProduto);
      } catch (erro) {
        gooeyToast.error(mensagemDeErro(erro));
        return { situacao: 'recusado' };
      }

      let quantidade: Milesimos;
      let origem: OrigemInsercaoViva;
      try {
        const derivado = quantidadeEOrigem(entrada, snapshot);
        quantidade = opcoes.quantidade ?? derivado.quantidade;
        origem = opcoes.origem ?? derivado.origem;
      } catch (erro) {
        // Produto pesável sem `PrecoVenda`: inserção bloqueada com aviso, nenhuma
        // linha criada, foco permanece no campo (`FR-013`, AD-076).
        gooeyToast.error(mensagemDeErro(erro));
        return { situacao: 'recusado' };
      }

      // `'E'` não insere agora: o foco vai para os campos editáveis e a linha só
      // entra no botão `+` (`FR-014`). `'S'`, `'B'` e `''` inserem direto.
      switch (snapshot.pesavelEditavel) {
        case 'E':
          return { situacao: 'edicao', snapshot, quantidade };
        case 'S':
        case 'B':
        case '':
          inserirItem({ snapshot, quantidade, origem });
          return { situacao: 'inserido' };
      }
    },
    [inserirItem, resolverProduto],
  );

  /**
   * Mesma resolução de `inserirResolvido` (cache por SKU, quantidade/origem
   * derivadas da entrada), mas devolve a prévia em vez de inserir — para
   * **qualquer** `pesavelEditavel`, ao contrário de `inserirResolvido` (que só
   * pausa em `'E'`). É o que a barra usa para decidir se mostra preço/desconto
   * editáveis (`editavel`) ou só a quantidade.
   */
  const revisarResolvido = useCallback(
    async (
      codigoProduto: string,
      entrada: EntradaCodigo,
      origemForcada?: 'BUSCA',
    ): Promise<ResultadoRevisao> => {
      let snapshot: SnapshotPrecoProduto;
      try {
        snapshot = await resolverProduto(codigoProduto);
      } catch (erro) {
        gooeyToast.error(mensagemDeErro(erro));
        return { situacao: 'recusado' };
      }

      try {
        const { quantidade, origem } = quantidadeEOrigem(entrada, snapshot);
        return {
          situacao: 'revisao',
          snapshot,
          quantidade,
          origem: origemForcada ?? origem,
          editavel: snapshot.pesavelEditavel === 'E',
        };
      } catch (erro) {
        gooeyToast.error(mensagemDeErro(erro));
        return { situacao: 'recusado' };
      }
    },
    [resolverProduto],
  );

  return {
    inserirPorCodigo: useCallback(
      async (texto) => {
        const entrada = interpretarEntradaCodigo(texto);
        const codigo = entrada.tipo === 'BALANCA' ? entrada.codigoReduzido : entrada.codigo;
        if (codigo === '') {
          return { situacao: 'recusado' };
        }
        return inserirResolvido(codigo, entrada);
      },
      [inserirResolvido],
    ),

    revisarPorCodigo: useCallback(
      async (texto, origemForcada) => {
        const entrada = interpretarEntradaCodigo(texto);
        const codigo = entrada.tipo === 'BALANCA' ? entrada.codigoReduzido : entrada.codigo;
        if (codigo === '') {
          return { situacao: 'recusado' };
        }
        return revisarResolvido(codigo, entrada, origemForcada);
      },
      [revisarResolvido],
    ),

    confirmarPrevia: useCallback(
      (revisao, quantidade) => {
        inserirItem({ snapshot: revisao.snapshot, quantidade, origem: revisao.origem });
      },
      [inserirItem],
    ),

    confirmarEdicao: useCallback(
      (pendente, ajustes) => {
        inserirItem({
          snapshot: pendente.snapshot,
          quantidade: ajustes.quantidade,
          origem: 'MANUAL',
          precoUnitario: ajustes.precoUnitario,
          descontoManual: ajustes.descontoManual,
        });
      },
      [inserirItem],
    ),
  };
}

export interface ApiEdicaoItem {
  /**
   * Aplica ajustes de quantidade/preço/desconto manual a uma linha **já
   * inserida** — caminho novo da barra de entrada rápida quando o operador
   * clica no lápis de uma linha da grid/lista mobile (correção do usuário,
   * 2026-09-03), em vez de editar só a quantidade inline
   * (`EdicaoQuantidadeItem`, removido).
   *
   * Cada campo passa por `editarItem`, que já é idempotente (no-op quando o
   * valor não mudou, `carrinhoSlice.ts`) e audita por campo — chamar os três
   * incondicionalmente é seguro mesmo quando só a quantidade mudou (produto
   * pesável, `'S'`/`'B'`: preço e desconto chegam inalterados).
   */
  confirmarEdicaoDeLinha(
    linha: LinhaCarrinho,
    ajustes: { quantidade: Milesimos; precoUnitario: Centavos; descontoManual: Centavos },
  ): void;
}

export function useEdicaoDeItemExistente(): ApiEdicaoItem {
  const editarItem = useVendaStore((estado) => estado.editarItem);

  return {
    confirmarEdicaoDeLinha: useCallback(
      (linha, ajustes) => {
        editarItem(linha.idLinha, 'quantidade', ajustes.quantidade);
        editarItem(linha.idLinha, 'precoUnitario', ajustes.precoUnitario);
        editarItem(linha.idLinha, 'descontoManual', ajustes.descontoManual);
      },
      [editarItem],
    ),
  };
}
