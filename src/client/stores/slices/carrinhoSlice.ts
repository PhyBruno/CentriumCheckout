import type { StateCreator } from 'zustand';
import type { VendaState } from '../vendaStore';
import {
  eventoProdutoAlterado,
  eventoProdutoCancelado,
  eventoProdutoInserido,
} from '../../domain/auditoria/eventos';
import { ZERO_CENTAVOS, type Centavos } from '../../domain/precificacao/dinheiro';
import {
  origemCongelaPreco,
  participaDaPrecificacao,
  type LinhaCarrinho,
  type OrigemLinha,
  type SnapshotPrecoProduto,
} from '../../domain/precificacao/linha';
import type { Milesimos } from '../../domain/precificacao/quantidade';
import { repricarSku, repricarTodosOsSkus } from '../../domain/precificacao/reprecificacao';

/**
 * Slice do carrinho da venda em andamento (feature 003).
 *
 * Combinado no `vendaStore` (Zustand+Immer, **sem `persist`**): o carrinho morre
 * num F5 por decisão de arquitetura (AD-006, Constitution VI).
 *
 * Responsabilidade única (Constitution II): **orquestrar**. Toda a matemática de
 * preço vive no domínio puro (`domain/precificacao/`) — este slice aplica a
 * mutação, chama `repricarSku` e registra o evento de auditoria. Nenhuma regra
 * de faixa, arredondamento ou parse de código de barras mora aqui.
 */

/** Dados do cliente que influenciam preço — origem é a feature 005. */
export interface ClienteDaVenda {
  readonly codigo: number;
  /** Só usada quando `TipoPreco = 9` (AD-092/AD-108). */
  readonly listaPreco: number | null;
  /** Percentual de convênio; o cliente default é sempre `0` (AD-108). */
  readonly descontoConvenio: number;
}

/**
 * Dependências injetadas na composição do `vendaStore` (Dependency Inversion).
 *
 * O carrinho **não importa** o slice de pagamento nem o de cliente. É isso que
 * permite testar o bloqueio pós-pagamento injetando `() => false`, sem montar
 * estado de pagamento (`research.md`, D8).
 */
export interface CarrinhoDeps {
  /** Implementado pela feature 008 (pagamento); `CART-09`/AD-030. */
  podeMutarCarrinho(): boolean;
  /** `SessaoUsuario.TipoPreco`, do bootstrap (feature 002). */
  tipoPrecoAtual(): number;
  /** Cliente atual da venda (feature 005); `null` antes de qualquer identificação. */
  clienteAtual(): ClienteDaVenda | null;
  /** Aviso ao operador. Injetado para o slice não importar a lib de toast. */
  avisar?: (mensagem: string) => void;
  /** Injetável para tornar `idLinha` determinístico em teste. */
  gerarIdLinha?: () => string;
}

export interface InserirItemInput {
  readonly snapshot: SnapshotPrecoProduto;
  readonly quantidade: Milesimos;
  readonly origem: OrigemLinha;
  /**
   * Preço a preservar. Obrigatório na prática para `RASCUNHO`/`DAV`, que trazem
   * o preço congelado do documento de origem (`FR-017`, AD-067); nas demais
   * origens, quando omitido, o preço sai de `resolvePrecoUnitario`.
   */
  readonly precoUnitario?: Centavos;
  /** Desconto manual informado antes da inserção, em produto `'E'` (`FR-014`). */
  readonly descontoLinha?: Centavos;
}

export type CampoEditavel = 'quantidade' | 'precoUnitario' | 'descontoLinha';

export interface CarrinhoSlice {
  /** Ordem de inserção, **incluindo canceladas** (invariante I1). */
  linhas: LinhaCarrinho[];

  inserirItem(input: InserirItemInput): void;
  editarItem(idLinha: string, campo: CampoEditavel, valor: Centavos | Milesimos): void;
  cancelarItem(idLinha: string): void;
  /** `FR-018` — troca de cliente com carrinho já populado. */
  reprecificarPorTrocaDeCliente(): void;
  limparCarrinho(): void;
}

const AVISO_CARRINHO_BLOQUEADO =
  'Já há pagamento aprovado nesta venda: os itens não podem mais ser alterados.';

function idAleatorio(): string {
  return crypto.randomUUID();
}

export function criarCarrinhoSlice(
  deps: CarrinhoDeps,
): StateCreator<VendaState, [['zustand/immer', never]], [], CarrinhoSlice> {
  const gerarIdLinha = deps.gerarIdLinha ?? idAleatorio;

  /** `0` quando não há cliente ou o cliente não tem convênio (AD-108). */
  function descontoConvenioPercentual(): number {
    return deps.clienteAtual()?.descontoConvenio ?? 0;
  }

  /** Bloqueio pós-pagamento: no-op com aviso, nunca exceção (`FR-010`). */
  function carrinhoBloqueado(): boolean {
    if (deps.podeMutarCarrinho()) {
      return false;
    }
    deps.avisar?.(AVISO_CARRINHO_BLOQUEADO);
    return true;
  }

  return (set, get) => {
    /**
     * Reprecifica fora do `set` e só então grava.
     *
     * O domínio recebe o array plano de `get()`, nunca o draft do Immer: manter
     * as funções puras livres de qualquer noção de draft é o que as deixa
     * testáveis sem montar store (Constitution II). Por isso a gravação usa a
     * forma de **substituição parcial** do `set`, e não um recipe de rascunho:
     * o array já vem pronto do domínio, com as linhas inalteradas preservadas
     * por identidade.
     */
    function aplicarLinhas(linhas: readonly LinhaCarrinho[]): void {
      set({ linhas: [...linhas] });
    }

    function reprecificarSku(linhas: readonly LinhaCarrinho[], codigoProduto: string) {
      return repricarSku(
        linhas,
        codigoProduto,
        deps.tipoPrecoAtual(),
        descontoConvenioPercentual(),
      );
    }

    return {
      linhas: [],

      inserirItem: (input) => {
        if (carrinhoBloqueado()) {
          return;
        }

        // Invariante I5 por construção: `precoCongelado` é derivado da origem,
        // não informado pelo call site, então não existe estado impossível.
        const precoCongelado = origemCongelaPreco(input.origem);

        const novaLinha: LinhaCarrinho = {
          idLinha: gerarIdLinha(),
          snapshot: input.snapshot,
          quantidade: input.quantidade,
          precoUnitario: input.precoUnitario ?? input.snapshot.precoBase,
          descontoLinha: input.descontoLinha ?? ZERO_CENTAVOS,
          cancelada: false,
          precoCongelado,
          origem: input.origem,
        };

        const codigoProduto = input.snapshot.codigoProduto;
        const linhas = reprecificarSku([...get().linhas, novaLinha], codigoProduto);
        aplicarLinhas(linhas);

        // A auditoria registra o preço **após** a reprecificação: é o valor que
        // de fato entrou na venda (`research.md`, D11).
        const inserida = linhas.find((linha) => linha.idLinha === novaLinha.idLinha) ?? novaLinha;
        get().registrarEventoAuditoria(
          eventoProdutoInserido({
            codigoProduto,
            quantidade: inserida.quantidade,
            precoUnitario: inserida.precoUnitario,
            desconto: inserida.descontoLinha,
          }),
        );
      },

      editarItem: (idLinha, campo, valor) => {
        if (carrinhoBloqueado()) {
          return;
        }

        const atuais = get().linhas;
        const alvo = atuais.find((linha) => linha.idLinha === idLinha);
        if (alvo === undefined || alvo.cancelada) {
          return;
        }

        const valorAnterior = alvo[campo];
        if (valorAnterior === valor) {
          return;
        }

        const estavaCongelada = alvo.precoCongelado;
        // Edição explícita **descongela** a linha (`FR-017`, invariante I6): a
        // partir daqui ela volta a participar do agregado e do recálculo.
        const editada: LinhaCarrinho = { ...alvo, [campo]: valor, precoCongelado: false };

        const comEdicao = atuais.map((linha) => (linha.idLinha === idLinha ? editada : linha));

        // Reprecifica na mudança de quantidade (`FR-007`) e no descongelamento,
        // que altera o agregado do SKU. A exceção é o operador ter acabado de
        // digitar o próprio `precoUnitario`: recalcular desfaria a edição dele.
        const deveReprecificar =
          campo === 'quantidade' || (estavaCongelada && campo !== 'precoUnitario');

        aplicarLinhas(
          deveReprecificar ? reprecificarSku(comEdicao, alvo.snapshot.codigoProduto) : comEdicao,
        );

        get().registrarEventoAuditoria(
          eventoProdutoAlterado({
            codigoProduto: alvo.snapshot.codigoProduto,
            campo,
            valorAnterior,
            valorNovo: valor,
          }),
        );
      },

      cancelarItem: (idLinha) => {
        // Cancelar **não** exige supervisor nem reautenticação (`FR-012`,
        // AD-065): o único bloqueio é `podeMutarCarrinho()`.
        if (carrinhoBloqueado()) {
          return;
        }

        const atuais = get().linhas;
        const alvo = atuais.find((linha) => linha.idLinha === idLinha);
        if (alvo === undefined || alvo.cancelada) {
          return;
        }

        // A linha nunca sai do array (invariante I1, `CART-08`); reprecificar
        // pode derrubar as remanescentes para a faixa inferior (`FR-008`).
        const comCancelamento = atuais.map((linha) =>
          linha.idLinha === idLinha ? { ...linha, cancelada: true } : linha,
        );

        aplicarLinhas(reprecificarSku(comCancelamento, alvo.snapshot.codigoProduto));

        get().registrarEventoAuditoria(
          eventoProdutoCancelado({ codigoProduto: alvo.snapshot.codigoProduto }),
        );
      },

      reprecificarPorTrocaDeCliente: () => {
        const atuais = get().linhas;
        if (!atuais.some(participaDaPrecificacao)) {
          return;
        }

        // Sem evento próprio: a troca de cliente é auditada pela feature 005
        // como `CLIENTE_TROCADO`, e reprecificação automática nunca gera evento
        // (`research.md`, D11).
        aplicarLinhas(
          repricarTodosOsSkus(atuais, deps.tipoPrecoAtual(), descontoConvenioPercentual()),
        );
      },

      limparCarrinho: () => {
        set({ linhas: [] });
      },
    };
  };
}
