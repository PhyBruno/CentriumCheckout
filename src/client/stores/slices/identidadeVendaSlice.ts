import type { StateCreator } from 'zustand';
import type { VendaState } from '../vendaStore';
import type { OrigemVenda } from '../../domain/auditoria/eventos';

/**
 * Slice da identidade da venda no ERP (feature 004, `data-model.md` §1).
 *
 * Combinado no `vendaStore` (Zustand+Immer, **sem `persist`**) para ter o mesmo
 * ciclo de vida do carrinho e da auditoria (AD-006, Constitution VI): nada aqui
 * sobrevive a um F5.
 *
 * Responsabilidade única (Constitution II): responder "**quem** é esta venda
 * para o ERP" — nada mais. As linhas da venda são do `carrinho` (003) e o
 * histórico é da `auditoria` (001); os três mudam por razões diferentes (o
 * carrinho a cada item, a identidade só ao carregar um rascunho/DAV), e é por
 * isso que `numeroRascunho` não mora dentro do carrinho (`research.md`, D1).
 */
export interface IdentidadeVenda {
  readonly origem: OrigemVenda;
  /**
   * Rascunho de NFCe desta venda no ERP (AD-235, que renomeou o antigo
   * `numeroNota` junto com o contrato de 2026-09-14):
   *
   * - `0` para venda criada do zero no Checkout e ainda não gravada no ERP;
   * - o número devolvido por `GetDav`/`CarregarNFCe` quando a venda veio de um
   *   documento (AD-023);
   * - o número devolvido por `FaturarNFCe` quando um envio foi recusado com o
   *   rascunho já gravado (`adotarRascunhoGravado`) — inclusive numa venda de
   *   origem `NOVA`.
   *
   * Enviado como `NumeroRascunho` sem transformação em `SUSPENDER`, `FATURAR` e
   * `VALIDAR` — o Checkout nunca calcula nem infere esse número (Constitution
   * III). Não é a nota fiscal: essa é `NotaFiscal.NumeroNota`, na resposta.
   */
  readonly numeroRascunho: number;
}

/**
 * Dependências do slice na composição do `vendaStore` (Dependency Inversion).
 *
 * `podeMutarCarrinho` é **o mesmo** predicado do carrinho e do cliente, não um
 * terceiro: os três slices compartilham a regra de "a venda ainda pode ser
 * mutada" e duas fontes de verdade sobre ela poderiam divergir em silêncio
 * (AD-043). Quem liga o predicado real é a feature 008; até lá vale o stub
 * `() => true` de `carrinhoDepsPadrao`.
 */
export interface IdentidadeVendaDeps {
  /** Implementado pela feature 008 (pagamento); `CART-09`/AD-030. */
  podeMutarCarrinho(): boolean;
  /** Aviso ao operador. Injetado para o slice não importar a lib de toast. */
  avisar?: (mensagem: string) => void;
}

export interface IdentidadeVendaSlice {
  readonly identidadeVenda: IdentidadeVenda;

  /**
   * Abre a identidade de uma **nova sessão de venda**. Deliberadamente **não**
   * guardada por `podeMutarCarrinho()`.
   *
   * Chamada no **mesmo call site** de `resetarAuditoria(origem)` (feature 001)
   * — o início de uma venda toca os dois slices no mesmo ponto de código, nunca
   * um sem o outro (`research.md`, D1) —, e esse call site é `abrirSessaoDeVenda`
   * e só ele.
   *
   * Fica fora da guarda pelo mesmo motivo que `limparCarrinho` (003),
   * `descartarAuditoria` (001) e `inicializarClientePadrao` (005) já ficam:
   * `abrirSessaoDeVenda` roda **depois** de `FaturarNFCe` retornar sucesso
   * (`useFinalizarOuSuspenderVenda.ts`), exatamente o instante em que existe
   * pagamento aprovado. Guardá-la faria a abertura da venda seguinte virar um
   * no-op silencioso assim que a feature 008 ligasse o predicado real — a venda
   * nova herdaria a identidade da anterior e a NFCe sairia contra o
   * `NumeroRascunho` errado. A limpeza de fim de venda nunca é bloqueada pelo estado
   * que ela existe para limpar.
   */
  iniciarIdentidadeVenda(identidade: IdentidadeVenda): void;

  /**
   * Troca a identidade de uma venda **em andamento** para a de um documento do
   * ERP — importação de DAV (006) e retomada de rascunho (011).
   *
   * Guardada por `podeMutarCarrinho()`: **no-op com aviso, nunca exceção**,
   * igual a `inserirItem` (003) e `selecionarCliente` (005). Sem a guarda,
   * qualquer call site presente ou futuro repontaria uma venda com pagamento já
   * aprovado para o rascunho de outro documento mantendo o próprio conteúdo, e
   * `FaturarNFCe` fecharia o documento errado — sem erro nem aviso (AD-139).
   *
   * É a **mudança de identidade** que a guarda protege, não o início da sessão:
   * quem inicia uma venda usa `iniciarIdentidadeVenda`.
   */
  definirIdentidadeVenda(identidade: IdentidadeVenda): void;

  /**
   * Grava o rascunho que o ERP devolveu numa **recusa** de `FaturarNFCe`
   * (AD-235), mantendo a `origem`.
   *
   * `PCheckout_FaturarNFCe` grava o rascunho antes de validar a venda, então
   * uma recusa de saldo ou de regra de NFCe já deixou o documento do lado do
   * ERP. Reenviar com `0` criaria um segundo rascunho da mesma compra; reenviar
   * com o número devolvido atualiza o existente (decisão do usuário).
   *
   * **Não** é guardada por `podeMutarCarrinho()`: a recusa chega com pagamento
   * em curso, e o número é o da própria venda — não a troca para outro
   * documento que `definirIdentidadeVenda` protege. Ignora silenciosamente o
   * que não for inteiro positivo (`0` é o "sem rascunho" do SDT) e é
   * idempotente.
   */
  adotarRascunhoGravado(numeroRascunho: number): void;

  /**
   * Volta à identidade de venda nova. Só pode ser chamado depois de
   * `FaturarNFCe` retornar sucesso (`FR-012`), junto com a limpeza de
   * carrinho/cache/auditoria — nunca após uma falha, senão o `NumeroRascunho`
   * do rascunho retomado ou adotado se perderia antes do reenvio.
   *
   * **Não** é guardada, pela mesma razão de `iniciarIdentidadeVenda`: é a
   * limpeza que roda com pagamento aprovado em tela.
   */
  resetarIdentidadeVenda(): void;
}

/** Venda nova, ainda não faturada — estado inicial e alvo do reset. */
export const IDENTIDADE_VENDA_NOVA: IdentidadeVenda = { origem: 'NOVA', numeroRascunho: 0 };

/** `numeroRascunho` fora do domínio representável (não inteiro ou negativo). */
export class ErroIdentidadeVendaInvalida extends Error {
  constructor(numeroRascunho: number) {
    super(
      `NumeroRascunho precisa ser inteiro não-negativo; recebido ${String(numeroRascunho)} (data-model.md §1).`,
    );
    this.name = 'ErroIdentidadeVendaInvalida';
  }
}

const AVISO_IDENTIDADE_BLOQUEADA =
  'Já há pagamento aprovado nesta venda: ela não pode mais apontar para outro documento.';

/**
 * Falha alto em vez de normalizar: um `numeroRascunho` fracionário ou negativo
 * chegando aqui significa que um payload do ERP atravessou a fronteira sem
 * validação, e enviar esse número a `FaturarNFCe` faturaria contra o rascunho
 * errado — ou contra nenhum — em silêncio (Constitution IV).
 *
 * Roda **antes** da guarda de pagamento: um número impossível é defeito de
 * contrato, não estado legítimo da venda, e engolir isso como no-op esconderia o
 * bug exatamente onde ele importa.
 */
function exigirNumeroRascunhoValido(identidade: IdentidadeVenda): void {
  if (!Number.isSafeInteger(identidade.numeroRascunho) || identidade.numeroRascunho < 0) {
    throw new ErroIdentidadeVendaInvalida(identidade.numeroRascunho);
  }
}

export function criarIdentidadeVendaSlice(
  deps: IdentidadeVendaDeps,
): StateCreator<VendaState, [['zustand/immer', never]], [], IdentidadeVendaSlice> {
  /** Bloqueio pós-pagamento: no-op com aviso, nunca exceção (AD-043/AD-139). */
  function identidadeBloqueada(): boolean {
    if (deps.podeMutarCarrinho()) {
      return false;
    }
    deps.avisar?.(AVISO_IDENTIDADE_BLOQUEADA);
    return true;
  }

  return (set) => ({
    identidadeVenda: IDENTIDADE_VENDA_NOVA,

    iniciarIdentidadeVenda: (identidade) => {
      exigirNumeroRascunhoValido(identidade);
      set((state) => {
        state.identidadeVenda = identidade;
      });
    },

    definirIdentidadeVenda: (identidade) => {
      exigirNumeroRascunhoValido(identidade);
      if (identidadeBloqueada()) {
        return;
      }

      set((state) => {
        state.identidadeVenda = identidade;
      });
    },

    adotarRascunhoGravado: (numeroRascunho) => {
      // Sem exceção aqui, ao contrário das duas acima: o número já passou pela
      // fronteira Zod (`inteiroErp`), e o que sobra fora do domínio é o `0` de
      // "o ERP não informou rascunho" — ausência legítima, não defeito.
      if (!Number.isSafeInteger(numeroRascunho) || numeroRascunho <= 0) {
        return;
      }
      set((state) => {
        state.identidadeVenda.numeroRascunho = numeroRascunho;
      });
    },

    resetarIdentidadeVenda: () =>
      set((state) => {
        state.identidadeVenda = IDENTIDADE_VENDA_NOVA;
      }),
  });
}
