import { gooeyToast } from 'goey-toast';
import {
  ErroImportacaoRecusada,
  importarVendaExistente,
  recusaDeImportacao,
  type DavListado,
  type EstadoVendaParaImportacao,
  type ImportacaoVendaDeps,
  type MotivoRecusaImportacao,
} from '../../services/dav/davQueries';
import {
  ErroClienteNaoEncontrado,
  fetchClientePorCodigo,
} from '../../services/cliente/clienteQueries';
import { ErroRespostaInvalida, ErroSessaoEncerrada } from '../../services/errosErp';
import { fetchProduto, type ContextoPrecificacao } from '../../services/produto/produtoQueries';
import { ErroDocumentoImportadoInvalido } from '../../domain/importacaoVenda/mapearVendaExistente';
import { linhasAtivas } from '../../domain/precificacao/linha';
import { useSessionStore } from '../../stores/sessionStore';
import { carrinhoDepsPadrao, useVendaStore } from '../../stores/vendaStore';

/**
 * Liga a orquestração de importação (`services/dav/davQueries.ts`) ao estado
 * real da venda.
 *
 * Mora aqui, e não no serviço, pelo mesmo motivo de `useCliente.ts`: o serviço
 * declara **portas** (`ImportacaoVendaDeps`) e não conhece Zustand; é este hook
 * que resolve cada porta contra o `vendaStore`/`sessionStore` e contra as
 * chamadas de rede das outras features. Trocar um stub pela implementação real
 * (012/008) é editar este arquivo, nunca o serviço.
 */

/**
 * Contexto de `GetProduto` para a resolução best-effort de descrição.
 *
 * Lido no momento da chamada, não na montagem do hook: a importação acabou de
 * trocar o cliente da venda, e a descrição precisa ser buscada sob o cliente do
 * documento. `null` quando o bootstrap ou o cliente ainda não existem — aí a
 * linha simplesmente segue exibindo o código (AD-096).
 */
function contextoPrecificacaoAtual(): ContextoPrecificacao | null {
  const registro = useSessionStore.getState().registro;
  const cliente = useVendaStore.getState().clienteAtual;
  if (registro === null || cliente === null) {
    return null;
  }
  return {
    tipoCodProduto: registro.SessaoUsuario.UsuarioTipoCodigoProduto,
    tipoPreco: registro.SessaoUsuario.TipoPreco,
    codigoCliente: cliente.codigoCliente,
    listaPreco: cliente.listaPreco,
  };
}

/**
 * Retrato da venda para `recusaDeImportacao`, lido do store no momento da
 * checagem.
 *
 * `houveEscolhaExplicita` é o que distingue "o operador identificou um cliente"
 * do default pré-selecionado no início da venda (AD-032) — sem essa distinção a
 * importação seria recusada sempre, porque a tela nasce com o default aplicado.
 */
function estadoDaVendaAtual(): EstadoVendaParaImportacao {
  const venda = useVendaStore.getState();
  return {
    numeroNota: venda.identidadeVenda.numeroNota,
    // O **mesmo** predicado que carrinho e cliente usam, lido da composição real
    // do `vendaStore` — não uma segunda regra de "quando a venda pode mudar",
    // que poderia divergir em silêncio (AD-043).
    podeMutar: carrinhoDepsPadrao.podeMutarCarrinho(),
    itensAtivos: linhasAtivas(venda.linhas).length,
    clienteIdentificado: venda.houveEscolhaExplicita,
  };
}

function mensagemDeErro(erro: unknown): string {
  // A recusa já vem com o texto que o operador precisa ler — quem a lança sabe
  // o motivo exato, e reescrevê-lo aqui afastaria a mensagem da regra que a
  // produziu.
  if (erro instanceof ErroImportacaoRecusada) {
    return erro.message;
  }
  if (erro instanceof ErroSessaoEncerrada) {
    return 'A sessão do operador foi encerrada. Reabra o Checkout pelo ERP.';
  }
  if (erro instanceof ErroClienteNaoEncontrado) {
    return 'O cliente deste documento não foi encontrado no ERP. Nada foi importado.';
  }
  if (erro instanceof ErroDocumentoImportadoInvalido || erro instanceof ErroRespostaInvalida) {
    return 'O ERP devolveu este documento em formato inesperado. Nada foi importado.';
  }
  // Cobre o caso central de D7/AD-052: o DAV já foi faturado por outro
  // operador. O Checkout não implementa lock nenhum (`FR-010`) — só reage ao
  // erro que o ERP devolveu.
  return 'Não foi possível importar este documento. Ele pode já ter sido faturado.';
}

/**
 * Portas fixas desta feature — as que não dependem de nenhum estado de React.
 *
 * `trocarVendedor` e `importarFormasDePagamento` são **stubs** até as features
 * 012 e 008 existirem (mesmo padrão da 004 para as suas dependências futuras).
 * As assinaturas já são as definitivas, desenhadas por aquelas features: ligar
 * as reais é substituir o corpo, sem tocar em `davQueries.ts` nem na UI.
 */
function stubsDeFeaturesFuturas(): Pick<
  ImportacaoVendaDeps,
  'trocarVendedor' | 'importarFormasDePagamento'
> {
  return {
    trocarVendedor: () => {
      /* feature 012 — `vendedorSlice.trocarVendedor({ codigo, nome })`. */
    },
    importarFormasDePagamento: () => {
      /* feature 008 — `pagamentoSlice.importarFormasDePagamento(formas)`. */
    },
  };
}

export interface ApiImportacaoDav {
  /**
   * Por que a venda em curso não aceita importar um documento, ou `null`
   * quando aceita.
   *
   * Existe para a UI recusar **no clique do atalho**, com a notificação de
   * erro, em vez de deixar o operador escolher um documento e só então falhar
   * (pedido do usuário, 2026-09-03). A mesma regra é reaplicada dentro de
   * `importarVendaExistente`, que é o que fecha qualquer outro call site.
   */
  recusaAtual(): MotivoRecusaImportacao | null;
  /**
   * Importa o documento selecionado. Devolve `true` no sucesso e `false`
   * quando nada foi alterado — a janela de importação usa isso para decidir se
   * fecha ou permanece aberta com o erro já exibido (D7).
   */
  importar(dav: DavListado): Promise<boolean>;
}

export function useImportacaoDav(
  sobrescritas: Partial<ImportacaoVendaDeps> = {},
): ApiImportacaoDav {
  // Sem `useCallback`: `sobrescritas` é um objeto novo a cada render (é o
  // default de parâmetro, e o call site também passa um literal), então a
  // memoização nunca valeria — devolveria uma função nova de qualquer forma.
  // Nada depende da identidade referencial de `importar` (achado da revisão).
  const importar = async (dav: DavListado): Promise<boolean> => {
    const venda = useVendaStore.getState();

    const deps: ImportacaoVendaDeps = {
      estadoDaVenda: estadoDaVendaAtual,
      definirIdentidadeVenda: venda.definirIdentidadeVenda,
      importarLinhasCongeladas: venda.importarLinhasCongeladas,
      editarSnapshotDescricao: venda.editarSnapshotDescricao,
      resolverCliente: (codigo) => fetchClientePorCodigo(codigo),
      // A origem `'DAV'` é fixada aqui, não pelo serviço: é a única coisa que
      // distingue esta seleção de cliente das outras três da feature 005.
      selecionarCliente: (cliente) => venda.selecionarCliente(cliente, 'DAV'),
      registrarEventoAuditoria: venda.registrarEventoAuditoria,
      buscarDescricaoProduto: async (codigoProduto) => {
        const contexto = contextoPrecificacaoAtual();
        if (contexto === null) {
          return '';
        }
        // Só `descricao` é lida da resposta. `PrecoVenda` **nunca** volta para
        // a linha: o preço da linha importada é o do documento (`FR-006`).
        const snapshot = await fetchProduto(codigoProduto, contexto);
        return snapshot.descricao;
      },
      ...stubsDeFeaturesFuturas(),
      ...sobrescritas,
    };

    try {
      await importarVendaExistente(dav.numeroDav, { clienteNome: dav.clienteNome }, deps);
      return true;
    } catch (erro) {
      // Toda a rede acontece antes da primeira mutação (`davQueries.ts`), então
      // chegar aqui significa que o carrinho está exatamente como estava.
      gooeyToast.error(mensagemDeErro(erro));
      return false;
    }
  };

  return {
    recusaAtual: () => recusaDeImportacao(estadoDaVendaAtual()),
    importar,
  };
}
