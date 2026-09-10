/**
 * Os dois destinos do Menu gerencial, compartilhados entre BFF e SPA.
 *
 * Aqui ficam só os **rótulos**. O caminho `.aspx` de cada tela legada mora no
 * servidor (`src/server/routes/gerencial.ts`), junto do host montado a partir
 * de `baseDomain` e do `tenant` do cookie cifrado. O navegador nunca vê nem
 * escolhe caminho de ERP: ele pede um rótulo deste conjunto fechado e o BFF
 * responde `302`.
 *
 * O módulo é compartilhado em vez de duplicado dos dois lados para que
 * renomear um destino quebre a compilação, e não vire um 404 silencioso.
 */
export const DESTINOS_GERENCIAIS = ['movimento-nao-fiscal', 'resumo-caixa'] as const;

export type DestinoGerencial = (typeof DESTINOS_GERENCIAIS)[number];

/**
 * URL, na origem do próprio Checkout, que redireciona para a tela do ERP.
 *
 * É relativa de propósito: o BFF que responde por ela é o mesmo processo que
 * serve a SPA, então não há host a montar aqui.
 */
export function urlDaTelaGerencial(destino: DestinoGerencial): string {
  return `/gerencial/${destino}`;
}
