/**
 * Fixtures sintéticas dos payloads de `GetListaNFCes` e `CarregarNFCe`
 * (feature 011), compartilhadas pelos testes unitários e de integração.
 *
 * Todos os valores são inventados — nenhum dado de produção. Os números vêm em
 * **reais**, exatamente como o ERP devolve (`double`): a conversão para
 * centavos é responsabilidade do schema Zod, e é isso que os testes exercitam.
 *
 * O corpo do documento é `documentoDoDav` (`tests/support/dav.ts`), importado e
 * **não** copiado: `CarregarNFCe` devolve o mesmo `CheckoutFaturarNFCe` de
 * `GetDav` (AD-057/AD-117), e uma segunda fixture divergiria da primeira no
 * primeiro campo que o contrato ganhasse.
 */

import { documentoDoDav, formaDePagamentoDoDav, produtoDoDav, NUMERO_NOTA } from './dav';

export { NUMERO_NOTA };

/** Segundo SKU do rascunho — preço bem distante do catálogo desta suíte. */
export const SKU_SEGUNDO_ITEM = '007777';

/**
 * Forma de pagamento **válida** de um rascunho retomado.
 *
 * `FormaMeioPagtoNFe: 'Dinheiro'`, e não o `'01'` de `tests/support/dav.ts`: o
 * domínio `Nfce_FormaPagto` do ERP usa **nomes**, os mesmos que `GetSessao`
 * devolve no catálogo (AD-023). Com o código numérico da NFe a forma é
 * descartada como meio desconhecido, com aviso no console — foi o que escondeu
 * o passo 4 do Cenário 2 do `quickstart.md` até 2026-09-04.
 *
 * Ao contrário do DAV, cuja fixture E2E deixa `FormasDePagamento` vazio de
 * propósito (um DAV é documento pendente de cobrança), **um rascunho de NFCe
 * carrega pagamento já aprovado** — é uma venda que foi suspensa depois de
 * cobrada. Congelar a venda ao retomar (I7) é o comportamento correto aqui.
 */
export function formaDinheiroDoRascunho(
  sobrescritas: Record<string, unknown> = {},
): Record<string, unknown> {
  return formaDePagamentoDoDav({
    FormaMeioPagtoNFe: 'Dinheiro',
    FormaValor: 93.5,
    ...sobrescritas,
  });
}

/**
 * Documento do `quickstart.md`: **2 itens** com preço divergente do catálogo
 * corrente e **1 forma em dinheiro**.
 *
 * Total: 2 × 10,00 − 1,50 = 18,50 mais 3 × 25,00 = 75,00 ⇒ 93,50.
 */
export function documentoDeRascunhoCompleto(
  sobrescritas: Record<string, unknown> = {},
): Record<string, unknown> {
  return documentoDoDav({
    produtos: [
      produtoDoDav(),
      produtoDoDav({
        sequencial: 2,
        codigoProduto: SKU_SEGUNDO_ITEM,
        quantidade: 3,
        precoUnitario: 25.0,
        DescontoValor: 0,
        ValorBruto: 75.0,
        ValorTotal: 75.0,
      }),
    ],
    FormasDePagamento: [formaDinheiroDoRascunho()],
    ...sobrescritas,
  });
}

/** `CarregarNFCe` devolvendo o documento completo do `quickstart.md`. */
export function respostaRascunhoCompleto(
  sobrescritas: Record<string, unknown> = {},
): Record<string, unknown> {
  return { OutCheckoutFaturarNFCe: documentoDeRascunhoCompleto(sobrescritas) };
}

/** `Emissao` — `format: date-time` do contrato, ISO 8601 sem fuso. */
export const EMISSAO_RASCUNHO = '2026-09-01T14:32:00';

/** `SessaoUsuario.CadSerieNFCe` — série do PDV, sempre do bootstrap (D4). */
export const SERIE_NFCE = 'R01';

export function rascunhoDaLista(
  sobrescritas: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    NumeroNota: NUMERO_NOTA,
    Cliente: 'CLIENTE TESTE 01',
    // Este contrato devolve o vendedor por **nome**, ao contrário de
    // `ListaDAVs`, que só traz o código (AD-095).
    Vendedor: 'MARIANA ALVES',
    Operador: 'CAIXA 03',
    Emissao: EMISSAO_RASCUNHO,
    Total: 18.5,
    ...sobrescritas,
  };
}

export function respostaListaNFCes(
  itens: readonly Record<string, unknown>[] = [rascunhoDaLista()],
  sobrescritas: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    CheckoutListaRascunhos: {
      PaginaAtual: 1,
      RegistrosPorPagina: 20,
      TotalRegistros: itens.length,
      TotalPaginas: 1,
      Rascunho: itens,
      ...sobrescritas,
    },
  };
}

/** Resposta de `CarregarNFCe` — mesmo envelope nomeado de `GetDav` no YAML. */
export function respostaCarregarNFCe(
  sobrescritas: Record<string, unknown> = {},
): Record<string, unknown> {
  return { OutCheckoutFaturarNFCe: documentoDoDav(sobrescritas) };
}
