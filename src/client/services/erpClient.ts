/**
 * Wrapper de fetch para as chamadas de negócio via `/api/erp/*` (T033/T035, US3).
 *
 * Não implementa retry: a renovação de sessão acontece inteira no BFF, de forma
 * transparente ao JS (FR-005). O cliente só precisa reagir ao `401` **terminal**,
 * que é o único gatilho de logout automático (FR-006).
 */

/**
 * Porta de leitura do carrinho da venda em andamento.
 *
 * A venda em andamento pertence a `vendaStore.ts` (feature 001, estendido pela
 * feature 003) — esta feature apenas **lê** a quantidade de itens para decidir
 * se avisa o operador antes de encerrar a sessão (FR-006), e nunca modifica
 * esse estado. Enquanto a 001/003 não existirem, vale a implementação vazia
 * abaixo; ligá-las é trocar o objeto injetado, sem tocar neste módulo
 * (Dependency Inversion — Constitution II).
 */
export interface LeitorCarrinho {
  quantidadeDeItens(): number;
}

/** Carrinho sempre vazio — default até a feature 001/003 fornecer o real. */
export const leitorCarrinhoVazio: LeitorCarrinho = {
  quantidadeDeItens: () => 0,
};

export type ResultadoChamadaErp =
  | { readonly estado: 'ok'; readonly resposta: Response }
  /** O BFF não conseguiu renovar a sessão: ela acabou (AUTH-06). */
  | { readonly estado: 'sessao-encerrada'; readonly itensNaVenda: number }
  | { readonly estado: 'erro-de-rede' };

export interface ErpClientDeps {
  readonly leitorCarrinho?: LeitorCarrinho;
  readonly fetchImpl?: typeof fetch;
}

export interface ErpClient {
  /**
   * @param caminho Caminho do endpoint do ERP, ex.: `/ApiCentriumOAuth/GetProduto`.
   */
  chamar(caminho: string, init?: RequestInit): Promise<ResultadoChamadaErp>;
}

const PREFIXO_PROXY = '/api/erp';

export function criarErpClient(deps: ErpClientDeps = {}): ErpClient {
  const executarFetch = deps.fetchImpl ?? fetch;
  const leitorCarrinho = deps.leitorCarrinho ?? leitorCarrinhoVazio;

  return {
    async chamar(caminho: string, init: RequestInit = {}): Promise<ResultadoChamadaErp> {
      const url = `${PREFIXO_PROXY}${caminho.startsWith('/') ? caminho : `/${caminho}`}`;

      let resposta: Response;
      try {
        resposta = await executarFetch(url, { credentials: 'same-origin', ...init });
      } catch {
        return { estado: 'erro-de-rede' };
      }

      if (resposta.status === 401) {
        // Leitura pura do carrinho: quem decide a mensagem é quem consome este
        // resultado, e o estado da venda não é alterado aqui.
        return { estado: 'sessao-encerrada', itensNaVenda: leitorCarrinho.quantidadeDeItens() };
      }

      return { estado: 'ok', resposta };
    },
  };
}
