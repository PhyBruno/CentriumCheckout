import type { StateCreator } from 'zustand';
import type { VendaState } from '../vendaStore';
import {
  eventoProdutoAlterado,
  eventoProdutoCancelado,
  eventoProdutoInserido,
} from '../../domain/auditoria/eventos';
import {
  paraLinhaCarrinho,
  type LinhaImportada,
} from '../../domain/importacaoVenda/mapearVendaExistente';
import { somar, ZERO_CENTAVOS, type Centavos } from '../../domain/precificacao/dinheiro';
import {
  origemCongelaPreco,
  participaDaPrecificacao,
  type LinhaCarrinho,
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

interface InserirItemInputComum {
  readonly snapshot: SnapshotPrecoProduto;
  readonly quantidade: Milesimos;
  /** Desconto manual informado antes da inserção, em produto `'E'` (`FR-014`). */
  readonly descontoManual?: Centavos;
}

/**
 * `precoUnitario` é **obrigatório** quando `origem` é `'RASCUNHO'` ou `'DAV'`:
 * essas origens trazem o preço já congelado do documento de origem (`FR-017`,
 * AD-067) — usar `snapshot.precoBase` (o preço vivo de hoje) violaria essa
 * invariante em silêncio. A união discriminada por `origem` torna esse estado
 * irrepresentável em tempo de compilação; nas demais origens, quando omitido,
 * o preço sai de `snapshot.precoBase`.
 *
 * `inserirItem` ainda repete a checagem em runtime (ver corpo da action)
 * porque a entrada pode vir de um caller não totalmente tipado — ex.: parse
 * de payload do ERP na importação de DAV (feature 006) ou na retomada de
 * rascunho (feature 004).
 */
export type InserirItemInput =
  | (InserirItemInputComum & {
      readonly origem: 'RASCUNHO' | 'DAV';
      readonly precoUnitario: Centavos;
    })
  | (InserirItemInputComum & {
      readonly origem: 'MANUAL' | 'BUSCA' | 'BALANCA';
      readonly precoUnitario?: Centavos;
    });

export type CampoEditavel = 'quantidade' | 'precoUnitario' | 'descontoManual';

export interface CarrinhoSlice {
  /** Ordem de inserção, **incluindo canceladas** (invariante I1). */
  linhas: LinhaCarrinho[];

  inserirItem(input: InserirItemInput): void;
  editarItem(idLinha: string, campo: CampoEditavel, valor: Centavos | Milesimos): void;
  cancelarItem(idLinha: string): void;
  /** `FR-018` — troca de cliente com carrinho já populado. */
  reprecificarPorTrocaDeCliente(): void;
  limparCarrinho(): void;

  /**
   * Importa em lote as linhas de um documento já existente no ERP (feature
   * 006, `FR-005`/`FR-006`).
   *
   * Action **distinta** de `inserirItem`, não um caso especial dele, por três
   * razões que o `inserirItem` não conseguiria atender juntas: as linhas entram
   * já congeladas e **nunca** passam por `repricarSku`; não geram
   * `PRODUTO_INSERIDO` (importar em lote não é o operador inserindo produto —
   * `data-model.md` §6); e o lote inteiro entra numa única gravação, sem
   * reprecificar N vezes no meio do caminho.
   *
   * Não sabe de onde o documento veio — recebe `LinhaImportada[]` já mapeadas.
   */
  importarLinhasCongeladas(linhas: readonly LinhaImportada[]): void;

  /**
   * Preenche a descrição do snapshot de **todas** as linhas de um SKU (feature
   * 006, AD-096).
   *
   * O documento importado não traz descrição de produto; ela chega depois, por
   * um `GetProduto` best-effort. É metadado de exibição: não altera preço,
   * quantidade nem desconto, então **não** passa por `editarItem` — que
   * descongelaria a linha (invariante I6) e dispararia reprecificação.
   *
   * Pelo mesmo motivo não é barrada por `podeMutarCarrinho()`: com pagamento
   * aprovado a venda não pode mais mudar, mas trocar um código por um nome na
   * tela não é mudar a venda — bloquear aqui deixaria o operador conferindo
   * códigos crus na hora exata em que ele mais precisa ler a grid.
   */
  editarSnapshotDescricao(codigoProduto: string, descricao: string): void;
}

/**
 * Frase única para os dois motivos que `podeMutarCarrinho()` reúne — condição
 * de pagamento escolhida e forma já aprovada (pedido do usuário, 2026-09-04).
 *
 * Nomeia a **saída**, não só o impedimento: o operador precisa saber que existe
 * um caminho de volta ("Limpar" no cartão de pagamento, `descartarPagamento`),
 * senão a única leitura possível é a de que a venda travou. O texto anterior
 * falava só de "pagamento aprovado", que deixou de ser o gatilho mais comum —
 * hoje basta escolher a condição.
 */
const AVISO_CARRINHO_BLOQUEADO =
  'Esta venda já está em pagamento: use "Limpar" no cartão de pagamento para remover a condição e as formas e voltar a editar os itens.';

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

        // Reforço em runtime da invariante que `InserirItemInput` já expressa
        // em tipo: a entrada pode vir de um caller não totalmente tipado (ex.:
        // parse de payload do ERP na importação de DAV/rascunho), então o tipo
        // sozinho não basta — sem esta checagem, uma origem congelada sem
        // `precoUnitario` criaria a linha com o preço vivo de hoje em silêncio.
        if (origemCongelaPreco(input.origem) && input.precoUnitario === undefined) {
          throw new Error(
            `inserirItem: origem '${input.origem}' exige preço congelado (\`precoUnitario\`), mas nenhum foi informado (FR-017, AD-067).`,
          );
        }

        // Invariante I5 por construção: `precoCongelado` é derivado da origem,
        // não informado pelo call site, então não existe estado impossível.
        const precoCongelado = origemCongelaPreco(input.origem);

        const novaLinha: LinhaCarrinho = {
          idLinha: gerarIdLinha(),
          snapshot: input.snapshot,
          quantidade: input.quantidade,
          precoUnitario: input.precoUnitario ?? input.snapshot.precoBase,
          descontoConvenio: ZERO_CENTAVOS,
          descontoManual: input.descontoManual ?? ZERO_CENTAVOS,
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
            desconto: somar(inserida.descontoConvenio, inserida.descontoManual),
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

      importarLinhasCongeladas: (linhas) => {
        if (carrinhoBloqueado()) {
          return;
        }
        if (linhas.length === 0) {
          return;
        }

        // Uma única gravação para o lote inteiro. `repricarSku` não é chamado
        // em nenhum momento: as linhas nascem com `precoCongelado: true`, fora
        // do agregado por SKU desde o primeiro instante (invariante I3), então
        // não há faixa a recalcular nem risco de empurrar as linhas manuais do
        // mesmo SKU para outra faixa (AD-067).
        aplicarLinhas([
          ...get().linhas,
          ...linhas.map((linha) => paraLinhaCarrinho(linha, gerarIdLinha())),
        ]);
      },

      editarSnapshotDescricao: (codigoProduto, descricao) => {
        const atuais = get().linhas;

        let houveMudanca = false;
        const atualizadas = atuais.map((linha) => {
          if (
            linha.snapshot.codigoProduto !== codigoProduto ||
            linha.snapshot.descricao === descricao
          ) {
            return linha;
          }
          houveMudanca = true;
          return { ...linha, snapshot: { ...linha.snapshot, descricao } };
        });

        // Sem mudança real, não grava: o lote de `GetProduto` roda por SKU
        // distinto e pode devolver a descrição que a linha já tinha (linha
        // manual do mesmo SKU). Gravar mesmo assim trocaria a identidade do
        // array e faria a grid inteira re-renderizar à toa.
        if (!houveMudanca) {
          return;
        }

        aplicarLinhas(atualizadas);
      },
    };
  };
}
