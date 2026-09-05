import type { StateCreator } from 'zustand';
import type { VendaState } from '../vendaStore';
import { eventoVendedorSelecionado, eventoVendedorTrocado } from '../../domain/auditoria/eventos';
import type { SessaoUsuario } from '../../../shared/schemas/bootstrap.schema';

/**
 * Slice do vendedor da venda em andamento (feature 012).
 *
 * Combinado no `vendaStore` (Zustand+Immer, **sem `persist`**): o vendedor
 * escolhido morre num F5, como o carrinho e o cliente (AD-006, Constitution VI).
 *
 * Responsabilidade única (Constitution II): **orquestrar** qual vendedor está
 * associado à venda e qual evento de auditoria isso produz. Não há domínio puro
 * nesta feature — não existe nada a calcular: vendedor não participa de nenhum
 * `TipoPreco` (AD-059/AD-060), e por isso trocá-lo com o carrinho populado
 * **não** dispara reprecificação, ao contrário da troca de cliente (`FR-012`).
 *
 * Este slice **não importa** `carrinhoSlice`/`clienteSlice`/`pagamentoSlice`: o
 * bloqueio pós-pagamento entra pelo mesmo predicado `podeMutarCarrinho()`
 * injetado que carrinho (003) e cliente (005) já usam (`research.md` D5,
 * AD-043).
 */

/** De onde veio o vendedor que está na venda (`data-model.md` §1). */
export type OrigemVendedor = 'DEFAULT' | 'BUSCA' | 'RASCUNHO' | 'DAV';

/**
 * Snapshot do vendedor atual da venda — cópia dos dois campos que a venda
 * consome, nunca uma referência viva ao cache do TanStack Query (mesma regra de
 * fronteira de produto e cliente).
 */
export interface VendedorVenda {
  /** `VendedorCodigo` do item da lista, ou `SessaoUsuario.VendedorCodigo`. */
  readonly codigo: number;
  /**
   * `null` **só** nas origens `RASCUNHO`/`DAV`: `CheckoutFaturarNFCe` — o schema
   * devolvido por `CarregarNFCe` e `GetDav` — traz `vendedorCodigo` e nenhum
   * campo de nome (`research.md` D4, AD-095). Em `DEFAULT`/`BUSCA` o nome sempre
   * acompanha o código.
   */
  readonly nome: string | null;
  readonly origem: OrigemVendedor;
}

export interface VendedorState {
  /** `null` só quando a empresa não configurou default e nada foi escolhido (I1). */
  readonly vendedorAtual: VendedorVenda | null;
  /**
   * Interno: decide `VENDEDOR_SELECIONADO` vs. `VENDEDOR_TROCADO`
   * (`research.md` D6). Nem a pré-seleção do default nem a sobrescrita
   * programática de rascunho/DAV o alteram (I3).
   *
   * O nome carrega o sufixo `DeVendedor` — e não o `houveEscolhaExplicita` que
   * `data-model.md` escreve — porque `VendaState` é a **interseção** dos slices:
   * `clienteSlice` já publica `houveEscolhaExplicita` no mesmo objeto, e duas
   * flags homônimas viraram uma só, com cliente e vendedor sobrescrevendo a
   * decisão de auditoria um do outro em silêncio.
   */
  readonly houveEscolhaExplicitaDeVendedor: boolean;
}

export interface VendedorDeps {
  /**
   * Mesmo predicado injetado no carrinho (003) e no cliente (005) — não um
   * terceiro. Duas fontes de verdade sobre "quando a venda pode ser mutada"
   * poderiam divergir em silêncio (`research.md` D5, AD-043).
   */
  podeMutarCarrinho(): boolean;
  /** Aviso ao operador. Injetado para o slice não importar a lib de toast. */
  avisar?: (mensagem: string) => void;
}

export interface VendedorSlice extends VendedorState {
  /**
   * Pré-seleção automática do vendedor do PDV (`FR-005`, AD-032).
   *
   * Roda **sem chamada de rede** e **sem evento de auditoria** (I3): não é ação
   * do operador. `SessaoUsuario.VendedorCodigo`/`VendedorNome` já são exatamente
   * os dois campos que a venda precisa, então o snapshot nasce completo
   * (`research.md` D3). Chamada uma única vez, no mesmo call site de
   * `resetarAuditoria`/`inicializarClientePadrao` (`abrirSessaoDeVenda`).
   *
   * `VendedorCodigo` ausente ou zero ⇒ `vendedorAtual = null`: a empresa não
   * configurou default e a venda exige seleção manual (`FR-006`/`VEND-07`).
   */
  inicializarVendedorPadrao(sessaoUsuario: SessaoUsuario): void;

  /**
   * Escolha do operador no modal de busca (`VEND-01`/`VEND-02`).
   *
   * Aplica `podeMutarCarrinho()` antes de mutar — no-op com aviso quando há
   * pagamento aprovado (I4, `FR-013`). Dispara `VENDEDOR_SELECIONADO` na
   * primeira escolha desta sessão e `VENDEDOR_TROCADO` nas seguintes
   * (`research.md` D6).
   */
  selecionarVendedor(vendedor: { readonly codigo: number; readonly nome: string }): void;

  /**
   * Sobrescrita programática, para as origens que não passam pelo modal:
   * importação de DAV (006, usa o default `'DAV'`) e retomada de rascunho (011,
   * MUST passar `'RASCUNHO'` explicitamente).
   *
   * Sobrescreve **incondicionalmente**, inclusive com `podeMutarCarrinho()`
   * falso: nesse momento a venda inteira está sendo substituída pelo conteúdo do
   * documento, e não há "pagamento aprovado desta venda" a proteger — `VEND-09`
   * trata de trocar vendedor **no meio** de uma venda em digitação
   * (`contracts/vendedor-domain-api.md`).
   *
   * Nunca dispara evento e nunca altera `houveEscolhaExplicitaDeVendedor` (I3):
   * o vendedor já vinha gravado no documento, não é escolha desta sessão.
   *
   * `origem` é o segundo parâmetro **opcional** para preservar sem alteração a
   * chamada de 2 argumentos que a feature 006 já reservou.
   */
  trocarVendedor(
    vendedor: { readonly codigo: number; readonly nome: string | null },
    origem?: 'RASCUNHO' | 'DAV',
  ): void;
}

const AVISO_VENDEDOR_BLOQUEADO =
  'Já há pagamento aprovado nesta venda: o vendedor não pode mais ser trocado.';

/** `VendedorCodigo` `0`/ausente é o "vazio" do campo — `int64` não anulável. */
function semVendedorDefault(sessaoUsuario: SessaoUsuario): boolean {
  const codigo = sessaoUsuario.VendedorCodigo;
  return codigo === undefined || codigo <= 0;
}

export function criarVendedorSlice(
  deps: VendedorDeps,
): StateCreator<VendaState, [['zustand/immer', never]], [], VendedorSlice> {
  return (set, get) => ({
    vendedorAtual: null,
    houveEscolhaExplicitaDeVendedor: false,

    inicializarVendedorPadrao: (sessaoUsuario) => {
      set((state) => {
        state.vendedorAtual = semVendedorDefault(sessaoUsuario)
          ? null
          : {
              // Narrow acima garante o `number`; o `?? 0` nunca roda e existe
              // só porque `VendedorCodigo` é opcional no schema.
              codigo: sessaoUsuario.VendedorCodigo ?? 0,
              // `VendedorNome` é opcional no bootstrap pelo mesmo motivo dos
              // demais rótulos (um cadastro sem nome não derruba o bootstrap).
              // Ausente, cai no mesmo fallback por código de AD-095.
              nome: sessaoUsuario.VendedorNome ?? null,
              origem: 'DEFAULT',
            };
        state.houveEscolhaExplicitaDeVendedor = false;
      });
    },

    selecionarVendedor: (vendedor) => {
      if (!deps.podeMutarCarrinho()) {
        deps.avisar?.(AVISO_VENDEDOR_BLOQUEADO);
        return;
      }

      const anterior = get().vendedorAtual;

      // Reescolher quem já está na venda não é troca: registrar
      // `VENDEDOR_TROCADO` com anterior === novo mandaria ao ERP, no `Log` de
      // `FaturarNFCe`, uma troca que não aconteceu.
      if (anterior?.codigo === vendedor.codigo) {
        return;
      }

      const primeiraEscolha = !get().houveEscolhaExplicitaDeVendedor;

      set((state) => {
        state.vendedorAtual = { codigo: vendedor.codigo, nome: vendedor.nome, origem: 'BUSCA' };
        state.houveEscolhaExplicitaDeVendedor = true;
      });

      // Sem escolha explícita anterior, o que existia era o default silencioso
      // (ou nada): a primeira interação do operador é uma *seleção*, não uma
      // troca (`research.md` D6).
      if (primeiraEscolha || anterior === null) {
        get().registrarEventoAuditoria(
          eventoVendedorSelecionado({ codigoVendedor: vendedor.codigo, nome: vendedor.nome }),
        );
        return;
      }

      get().registrarEventoAuditoria(
        eventoVendedorTrocado({
          codigoVendedorAnterior: anterior.codigo,
          codigoVendedorNovo: vendedor.codigo,
        }),
      );
    },

    trocarVendedor: (vendedor, origem = 'DAV') => {
      set((state) => {
        state.vendedorAtual = { codigo: vendedor.codigo, nome: vendedor.nome, origem };
      });
    },
  });
}
