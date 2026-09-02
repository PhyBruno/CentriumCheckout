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
import type { OrigemLinha, SnapshotPrecoProduto } from '../../domain/precificacao/linha';
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
  /** Caminho da busca: já se conhece o código do candidato escolhido (AD-091). */
  inserirPorSelecao(codigoProduto: string): Promise<ResultadoInsercao>;
  /** Confirma a inserção de um produto `'E'` depois da revisão do operador. */
  confirmarEdicao(
    pendente: PendenteDeEdicao,
    ajustes: { quantidade: Milesimos; precoUnitario: Centavos; descontoManual: Centavos },
  ): void;
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

    inserirPorSelecao: useCallback(
      async (codigoProduto) =>
        // A linha nunca é montada a partir do resultado de `GetListaProdutos`:
        // sempre `GetProduto` para o código selecionado (AD-091, D1).
        inserirResolvido(
          codigoProduto,
          { tipo: 'SIMPLES', codigo: codigoProduto },
          {
            origem: 'BUSCA',
          },
        ),
      [inserirResolvido],
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
