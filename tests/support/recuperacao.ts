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

import { documentoDoDav, NUMERO_NOTA } from './dav';

export { NUMERO_NOTA };

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
