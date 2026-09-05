import { gooeyToast } from 'goey-toast';
import {
  ErroImportacaoRecusada,
  importarVendaExistente,
  recusaDeImportacao,
  type EstadoVendaParaImportacao,
  type FonteDocumento,
  type ImportacaoVendaDeps,
  type MotivoRecusaImportacao,
} from '../../services/importacao/importarVendaExistente';
import {
  ErroClienteNaoEncontrado,
  fetchClientePorCodigo,
} from '../../services/cliente/clienteQueries';
import { ErroRespostaInvalida, ErroSessaoEncerrada } from '../../services/errosErp';
import { fetchProduto, type ContextoPrecificacao } from '../../services/produto/produtoQueries';
import { ErroDocumentoImportadoInvalido } from '../../domain/importacaoVenda/mapearVendaExistente';
import type { OrigemSelecaoCliente } from '../../domain/cliente/clienteVenda';
import { useSessionStore } from '../../stores/sessionStore';
import { carrinhoDepsPadrao, useVendaStore, type VendaState } from '../../stores/vendaStore';

/**
 * Liga a orquestração de importação (`services/importacao/importarVendaExistente.ts`)
 * ao estado real da venda.
 *
 * Mora aqui, e não no serviço, pelo mesmo motivo de `useCliente.ts`: o serviço
 * declara **portas** (`ImportacaoVendaDeps`) e não conhece Zustand; é este hook
 * que resolve cada porta contra o `vendaStore`/`sessionStore` e contra as
 * chamadas de rede das outras features. Trocar um stub pela implementação real
 * foi sempre editar este arquivo, nunca o serviço — foi assim com
 * `importarFormasDePagamento` (008) e com `trocarVendedor` (012), a última
 * porta que ainda era stub.
 *
 * É **genérico quanto à procedência** (AD-166): nasceu como `useImportacaoDav`
 * e passou a servir também a recuperação de rascunho de NFCe, porque a ligação
 * com o store é idêntica nas duas — o mesmo retrato da venda, as mesmas portas,
 * a mesma tradução de erro. O que varia entra por parâmetro: a origem gravada
 * no cliente e, no momento da ação, a `FonteDocumento`.
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
 *
 * Mas ele **sozinho** não descreve a venda: `limparCliente()` (recusa de pessoa
 * jurídica, AD-133) zera `clienteAtual` de propósito **sem** mexer na flag, para
 * que a próxima identificação válida ainda conte como primeira escolha (D9 da
 * 005). Depois desse caminho a venda fica sem cliente nenhum e a flag continua
 * `true` — a importação era recusada com "Esta venda já tem um cliente
 * identificado" olhando para um campo de cliente vazio (AD-139). O que a regra
 * quer saber é se **há** um cliente escolhido na venda agora, e é isso que a
 * conjunção abaixo responde.
 */
export function estadoParaImportacao(venda: VendaState): EstadoVendaParaImportacao {
  return {
    numeroNota: venda.identidadeVenda.numeroNota,
    // O **mesmo** predicado que carrinho e cliente usam, lido da composição real
    // do `vendaStore` — não uma segunda regra de "quando a venda pode mudar",
    // que poderia divergir em silêncio (AD-043). Cobre condição de pagamento
    // escolhida e forma aprovada, dois dos quatro critérios de "venda não
    // efetivamente iniciada" (pedido do usuário, 2026-09-04).
    podeMutar: carrinhoDepsPadrao.podeMutarCarrinho(),
    // **Todas** as linhas, canceladas inclusive (pedido do usuário,
    // 2026-09-03): uma linha cancelada é venda digitada, e o documento
    // importado não pode entrar por cima dela.
    linhasNaVenda: venda.linhas.length,
    clienteIdentificado: venda.houveEscolhaExplicita && venda.clienteAtual !== null,
  };
}

/** O mesmo retrato, lido do store global no momento da checagem. */
function estadoDaVendaAtual(): EstadoVendaParaImportacao {
  return estadoParaImportacao(useVendaStore.getState());
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
  // Cobre o caso central de AD-052: o documento já foi faturado por outro
  // operador. O Checkout não implementa lock nenhum — só reage ao erro que o
  // ERP devolveu, inclusive o `404` de `CarregarNFCe`.
  return 'Não foi possível carregar este documento. Ele pode já ter sido faturado.';
}

/**
 * Origem gravada no `vendedorAtual` quando o documento importado traz vendedor.
 *
 * Deriva da origem já escolhida para o cliente pelo hook da feature — as duas
 * descrevem a mesma procedência do mesmo documento, e um segundo parâmetro só
 * criaria a chance de elas divergirem. `'RASCUNHO'` é a retomada de NFCe (011,
 * que MUST passar essa origem explicitamente — `contracts/vendedor-domain-api.md`);
 * qualquer outra procedência é a importação de DAV (006), que usa o default
 * `'DAV'` da própria action.
 */
function origemDoVendedorImportado(origemCliente: OrigemSelecaoCliente): 'RASCUNHO' | 'DAV' {
  return origemCliente === 'RASCUNHO' ? 'RASCUNHO' : 'DAV';
}

export interface ApiImportacaoDocumento {
  /**
   * Por que a venda em curso não aceita importar um documento, ou `null`
   * quando aceita — **reativo**: recalculado a cada mudança do `vendaStore`.
   *
   * É o que desabilita o atalho "Menu Importação" assim que a venda começa
   * (pedido do usuário, 2026-09-03). A leitura precisa ser por subscrição, e
   * não por `getState()` dentro do clique: nada re-renderizaria o botão quando
   * o primeiro item entra no carrinho, e ele continuaria clicável.
   */
  readonly recusa: MotivoRecusaImportacao | null;
  /**
   * A mesma regra lida sob demanda, fora de render — usada pelos call sites
   * que precisam do estado no instante da ação. A regra é reaplicada dentro de
   * `importarVendaExistente`, que é o que fecha qualquer outro caminho.
   */
  recusaAtual(): MotivoRecusaImportacao | null;
  /**
   * Importa o documento da fonte indicada. Devolve `true` no sucesso e `false`
   * quando nada foi alterado — a janela usa isso para decidir se fecha ou
   * permanece aberta com o erro já exibido.
   */
  importar(fonte: FonteDocumento): Promise<boolean>;
}

/**
 * Só a regra de recusa, sem montar as portas de importação.
 *
 * É o que o atalho "Menu Importação" consome: ele decide se abre o seletor, e
 * nesse momento ainda não existe procedência escolhida — pedir uma origem de
 * cliente ali seria inventar uma resposta antes da pergunta. A regra é a mesma
 * para DAV e para NFCe, então um hook só serve os dois (AD-166).
 */
export function useRecusaDeImportacao(): Pick<ApiImportacaoDocumento, 'recusa' | 'recusaAtual'> {
  // O seletor devolve `string | null`, não um objeto: com a comparação padrão
  // do Zustand, um retrato novo a cada render provocaria re-render infinito.
  const recusa = useVendaStore((venda) => recusaDeImportacao(estadoParaImportacao(venda)));

  return {
    recusa,
    recusaAtual: () => recusaDeImportacao(estadoDaVendaAtual()),
  };
}

/**
 * @param origemCliente Como o cliente do documento entra na venda — `'DAV'`
 * (006) ou `'RASCUNHO'` (011). Fixado pelo hook da feature, e não pelo serviço:
 * é a única coisa que distingue esta seleção de cliente das outras da 005.
 */
export function useImportacaoDocumento(
  origemCliente: OrigemSelecaoCliente,
  sobrescritas: Partial<ImportacaoVendaDeps> = {},
): ApiImportacaoDocumento {
  const { recusa, recusaAtual } = useRecusaDeImportacao();

  // Sem `useCallback`: `sobrescritas` é um objeto novo a cada render (é o
  // default de parâmetro, e o call site também passa um literal), então a
  // memoização nunca valeria — devolveria uma função nova de qualquer forma.
  // Nada depende da identidade referencial de `importar` (achado da revisão).
  const importar = async (fonte: FonteDocumento): Promise<boolean> => {
    const venda = useVendaStore.getState();

    const deps: ImportacaoVendaDeps = {
      estadoDaVenda: estadoDaVendaAtual,
      definirIdentidadeVenda: venda.definirIdentidadeVenda,
      importarLinhasCongeladas: venda.importarLinhasCongeladas,
      editarSnapshotDescricao: venda.editarSnapshotDescricao,
      resolverCliente: (codigo) => fetchClientePorCodigo(codigo),
      selecionarCliente: (cliente) => venda.selecionarCliente(cliente, origemCliente),
      // Feature 012, ligada ao slice real: sobrescreve `vendedorAtual` com o
      // vendedor do documento, sem evento de auditoria e sem consultar
      // `podeMutarCarrinho()` — é o início de uma venda diferente sendo montada,
      // não uma troca no meio da digitação (`contracts/vendedor-domain-api.md`).
      trocarVendedor: (vendedor) =>
        venda.trocarVendedor(vendedor, origemDoVendedorImportado(origemCliente)),
      registrarEventoAuditoria: venda.registrarEventoAuditoria,
      importarFormasDePagamento: venda.importarFormasDePagamento,
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
      ...sobrescritas,
    };

    try {
      await importarVendaExistente(fonte, deps);
      return true;
    } catch (erro) {
      // Toda a rede acontece antes da primeira mutação
      // (`importarVendaExistente`), então chegar aqui significa que o carrinho
      // está exatamente como estava.
      gooeyToast.error(mensagemDeErro(erro));
      return false;
    }
  };

  return { recusa, recusaAtual, importar };
}
