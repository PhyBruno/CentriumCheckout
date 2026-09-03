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
 * isso que `numeroNota` não mora dentro do carrinho (`research.md`, D1).
 */
export interface IdentidadeVenda {
  readonly origem: OrigemVenda;
  /**
   * `0` para venda criada do zero no Checkout (nunca faturada); o número real
   * do rascunho/DAV quando a venda foi retomada (AD-023).
   *
   * Enviado como `NumeroNota` sem transformação — o Checkout nunca calcula nem
   * infere esse número (Constitution III).
   */
  readonly numeroNota: number;
}

export interface IdentidadeVendaSlice {
  readonly identidadeVenda: IdentidadeVenda;

  /**
   * Define a identidade no início/retomada de uma sessão de venda.
   *
   * Chamado no **mesmo call site** de `resetarAuditoria(origem)` (feature 001)
   * — o início de uma venda toca os dois slices no mesmo ponto de código, nunca
   * um sem o outro (`research.md`, D1). As features 006 (DAV) e 011 (retomada
   * de rascunho) são os call sites que passam `numeroNota` diferente de `0`.
   */
  definirIdentidadeVenda(identidade: IdentidadeVenda): void;

  /**
   * Volta à identidade de venda nova. Só pode ser chamado depois de
   * `FaturarNFCe` retornar sucesso (`FR-012`), junto com a limpeza de
   * carrinho/cache/auditoria — nunca após uma falha, senão o `NumeroNota` do
   * rascunho retomado se perderia antes do reenvio.
   */
  resetarIdentidadeVenda(): void;
}

/** Venda nova, ainda não faturada — estado inicial e alvo do reset. */
export const IDENTIDADE_VENDA_NOVA: IdentidadeVenda = { origem: 'NOVA', numeroNota: 0 };

/** `numeroNota` fora do domínio representável (não inteiro ou negativo). */
export class ErroIdentidadeVendaInvalida extends Error {
  constructor(numeroNota: number) {
    super(
      `NumeroNota precisa ser inteiro não-negativo; recebido ${String(numeroNota)} (data-model.md §1).`,
    );
    this.name = 'ErroIdentidadeVendaInvalida';
  }
}

export const criarIdentidadeVendaSlice: StateCreator<
  VendaState,
  [['zustand/immer', never]],
  [],
  IdentidadeVendaSlice
> = (set) => ({
  identidadeVenda: IDENTIDADE_VENDA_NOVA,

  definirIdentidadeVenda: (identidade) => {
    // Falha alto em vez de normalizar: um `numeroNota` fracionário ou negativo
    // chegando aqui significa que um payload do ERP atravessou a fronteira sem
    // validação, e enviar esse número a `FaturarNFCe` faturaria contra a nota
    // errada — ou contra nenhuma — em silêncio (Constitution IV).
    if (!Number.isSafeInteger(identidade.numeroNota) || identidade.numeroNota < 0) {
      throw new ErroIdentidadeVendaInvalida(identidade.numeroNota);
    }

    set((state) => {
      state.identidadeVenda = identidade;
    });
  },

  resetarIdentidadeVenda: () =>
    set((state) => {
      state.identidadeVenda = IDENTIDADE_VENDA_NOVA;
    }),
});
