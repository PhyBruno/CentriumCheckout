import type { StateCreator } from 'zustand';
import type { VendaState } from '../vendaStore';
import {
  eventoClienteCriado,
  eventoClienteSelecionado,
  eventoClienteTrocado,
} from '../../domain/auditoria/eventos';
import type {
  CadastroSimplificadoInput,
  ClienteVenda,
  OrigemSelecaoCliente,
} from '../../domain/cliente/clienteVenda';
import {
  participaDaPrecificacao,
  type SnapshotPrecoProduto,
} from '../../domain/precificacao/linha';
import type { ClienteCheckout } from '../../../shared/schemas/cliente.schema';
import type { SessaoUsuario } from '../../../shared/schemas/bootstrap.schema';
import {
  mapClienteCheckoutParaVenda,
  mapClienteDefaultParaVenda,
} from '../../services/cliente/clienteMapper';

/**
 * Slice do cliente da venda em andamento (feature 005).
 *
 * Combinado no `vendaStore` (Zustand+Immer, **sem `persist`**): o cliente
 * selecionado morre num F5, como o carrinho (AD-006, Constitution VI).
 *
 * Responsabilidade única (Constitution II): **orquestrar** a identificação do
 * cliente — aplicar o snapshot, decidir o evento de auditoria e disparar a
 * reprecificação. Nenhuma regra de preço mora aqui (é do domínio da 003) e
 * nenhuma chamada de rede é construída aqui (é da camada de serviço, injetada
 * por `ClienteDeps`).
 *
 * Este slice **não importa `carrinhoSlice.ts`**: lê `linhas` do estado já
 * combinado e chama `reprecificarPorTrocaDeCliente`, que é a superfície pública
 * que a 003 expõe. É o que preserva a separação exigida pela Constitution II.
 */

export interface ClienteState {
  /** `null` só quando não há cliente default configurado e nada foi escolhido (I1). */
  readonly clienteAtual: ClienteVenda | null;
  /**
   * Interno: decide `CLIENTE_SELECIONADO` vs. `CLIENTE_TROCADO`
   * (`research.md` D9). A pré-seleção automática do default nunca o altera (I3).
   */
  readonly houveEscolhaExplicita: boolean;
}

export interface ClienteDeps {
  /**
   * Mesmo predicado injetado no carrinho (feature 003, D8) — não um segundo.
   * Duas fontes de verdade sobre "quando a venda pode ser mutada" poderiam
   * divergir em silêncio (`research.md` D8, AD-043).
   */
  podeMutarCarrinho(): boolean;
  /**
   * Re-fetch de `GetProduto` para um SKU sob o novo cliente (`research.md` D7).
   *
   * Injetado, e não importado: trocar o cliente muda `Codcliente`/`Listapreco`,
   * parâmetros que só fazem sentido numa nova chamada ao ERP — recalcular
   * localmente reimplementaria a seleção de lista de preço do ERP e violaria a
   * Constitution III.
   */
  buscarSnapshotProduto(
    codigoProduto: string,
    cliente: ClienteVenda,
  ): Promise<SnapshotPrecoProduto>;
  /** Aviso ao operador. Injetado para o slice não importar a lib de toast. */
  avisar?: (mensagem: string) => void;
}

export interface ClienteSlice extends ClienteState {
  /**
   * Pré-seleção automática do cliente default (`FR-004`, AD-032).
   *
   * Roda **sem chamada de rede** (AD-108) e **sem evento de auditoria** (I3):
   * não é ação do operador. Chamada uma única vez, no mesmo call site de
   * `resetarAuditoria` (`abrirSessaoDeVenda`).
   */
  inicializarClientePadrao(sessaoUsuario: SessaoUsuario): void;

  /**
   * Associa um cliente já cadastrado à venda (`CLI-01`/`CLI-02`, e `'DAV'` pela
   * importação da feature 006 — AD-115, extensão aditiva sem caso especial).
   *
   * Devolve `Promise<void>`, e não o `void` do rascunho de
   * `contracts/cliente-domain-api.md`: a troca com carrinho populado dispara um
   * re-fetch por SKU (D7), inerentemente assíncrono. Com `void`, uma falha de
   * rede nessa etapa ficaria sem dono — o carrinho seguiria com o preço do
   * cliente anterior sem ninguém para avisar o operador.
   */
  selecionarCliente(cliente: ClienteCheckout, origem: OrigemSelecaoCliente): Promise<void>;

  /**
   * Cadastro simplificado confirmado (`CLI-03`). Dispara **sempre**
   * `CLIENTE_CRIADO`, nunca `CLIENTE_TROCADO`: criar é ação distinta de
   * substituir (`research.md` D9, AD-061).
   *
   * Uma falha de `postCliente` propaga o erro para a UI tratar e **não** muda
   * `clienteAtual` nem registra evento — o slice nunca fica num estado que
   * afirme um cadastro que o ERP não gravou (`SC-003`).
   */
  cadastrarESelecionarCliente(
    dados: CadastroSimplificadoInput,
    criar: (dados: CadastroSimplificadoInput) => Promise<ClienteCheckout>,
  ): Promise<void>;
}

const AVISO_CLIENTE_BLOQUEADO =
  'Já há pagamento aprovado nesta venda: o cliente não pode mais ser trocado.';

const AVISO_REPRECIFICACAO_FALHOU =
  'O cliente foi trocado, mas os preços do carrinho não puderam ser atualizados. Verifique antes de finalizar.';

export function criarClienteSlice(
  deps: ClienteDeps,
): StateCreator<VendaState, [['zustand/immer', never]], [], ClienteSlice> {
  /** Bloqueio pós-pagamento: no-op com aviso, nunca exceção (I4). */
  function clienteBloqueado(): boolean {
    if (deps.podeMutarCarrinho()) {
      return false;
    }
    deps.avisar?.(AVISO_CLIENTE_BLOQUEADO);
    return true;
  }

  return (set, get) => {
    /**
     * Repõe o preço de cada SKU vivo do carrinho sob o novo cliente.
     *
     * Uma chamada por SKU **distinto**, e só de linhas ativas não-congeladas:
     * linha cancelada saiu da venda e linha congelada (rascunho/DAV) traz o
     * preço do documento de origem, que a troca de cliente não pode alterar
     * (invariantes I2/I3 da feature 003).
     */
    async function reprecificarSob(cliente: ClienteVenda): Promise<void> {
      const vivas = get().linhas.filter(participaDaPrecificacao);
      const skus = [...new Set(vivas.map((linha) => linha.snapshot.codigoProduto))];
      if (skus.length === 0) {
        return;
      }

      let snapshots: SnapshotPrecoProduto[];
      try {
        snapshots = await Promise.all(skus.map((sku) => deps.buscarSnapshotProduto(sku, cliente)));
      } catch {
        // O cliente já trocou e a troca é o que o operador pediu — desfazê-la
        // seria pior. O que não pode acontecer em silêncio é o carrinho seguir
        // com o preço do cliente anterior.
        deps.avisar?.(AVISO_REPRECIFICACAO_FALHOU);
        return;
      }

      const porSku = new Map(snapshots.map((snapshot) => [snapshot.codigoProduto, snapshot]));

      // Substituição parcial, não recipe de rascunho — mesmo motivo do
      // `aplicarLinhas` do carrinho: `SnapshotPrecoProduto` é `readonly` de
      // ponta a ponta (Centavos/Milesimos em tuplas fixas), e o draft do Immer
      // exigiria uma versão mutável do tipo só para gravá-lo.
      set({
        linhas: get().linhas.map((linha) => {
          const novo = participaDaPrecificacao(linha)
            ? porSku.get(linha.snapshot.codigoProduto)
            : undefined;
          return novo === undefined ? linha : { ...linha, snapshot: novo };
        }),
      });

      // A fórmula de preço/desconto de convênio não é reimplementada aqui: o
      // carrinho reaproveita `repricarTodosOsSkus` do domínio puro da 003.
      get().reprecificarPorTrocaDeCliente();
    }

    async function aplicar(
      novo: ClienteVenda,
      registrar: (anterior: ClienteVenda | null) => void,
    ): Promise<void> {
      const anterior = get().clienteAtual;

      set((state) => {
        state.clienteAtual = novo;
        state.houveEscolhaExplicita = true;
      });

      registrar(anterior);
      await reprecificarSob(novo);
    }

    return {
      clienteAtual: null,
      houveEscolhaExplicita: false,

      inicializarClientePadrao: (sessaoUsuario) => {
        set((state) => {
          state.clienteAtual = mapClienteDefaultParaVenda(sessaoUsuario);
          state.houveEscolhaExplicita = false;
        });
      },

      selecionarCliente: async (cliente, origem) => {
        if (clienteBloqueado()) {
          return;
        }

        const novo = mapClienteCheckoutParaVenda(cliente, origem);
        const primeiraEscolha = !get().houveEscolhaExplicita;

        await aplicar(novo, (anterior) => {
          // Sem escolha explícita anterior, o que existia era o default
          // silencioso (ou nada): a primeira interação do operador é uma
          // *seleção*, não uma troca (D9).
          if (primeiraEscolha || anterior === null) {
            get().registrarEventoAuditoria(
              eventoClienteSelecionado({ codigoCliente: novo.codigoCliente, nome: novo.nome }),
            );
            return;
          }
          get().registrarEventoAuditoria(
            eventoClienteTrocado({
              codigoClienteAnterior: anterior.codigoCliente,
              codigoClienteNovo: novo.codigoCliente,
            }),
          );
        });
      },

      cadastrarESelecionarCliente: async (dados, criar) => {
        if (clienteBloqueado()) {
          return;
        }

        // Fora de qualquer `set`: enquanto o ERP não confirmar a criação, o
        // estado da venda não muda (`SC-003`). Um erro aqui sobe para a UI.
        const criado = await criar(dados);
        const novo = mapClienteCheckoutParaVenda(criado, 'CADASTRO_SIMPLIFICADO');

        await aplicar(novo, () => {
          get().registrarEventoAuditoria(
            eventoClienteCriado({ codigoCliente: novo.codigoCliente, nome: novo.nome }),
          );
        });
      },
    };
  };
}
