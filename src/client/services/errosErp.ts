/**
 * Erros de transporte das chamadas ao ERP via `/api/erp/*`.
 *
 * Declarados uma única vez, e não por serviço: `useCarrinho.ts` decide a
 * mensagem ao operador por `instanceof`, e duas classes homônimas declaradas em
 * módulos diferentes (uma no serviço de produto, outra no de cliente) falhariam
 * silenciosamente nesse teste — o operador veria a mensagem genérica no lugar
 * da específica. Criados pela feature 003 dentro de `produto/produtoQueries.ts`
 * e extraídos aqui pela 005, que passou a precisar dos mesmos.
 *
 * `produtoQueries.ts` reexporta as três para não quebrar quem já as importa
 * de lá.
 */

export class ErroRedeErp extends Error {
  constructor() {
    super('Não foi possível falar com o ERP.');
    this.name = 'ErroRedeErp';
  }
}

export class ErroSessaoEncerrada extends Error {
  constructor() {
    super('A sessão do operador foi encerrada.');
    this.name = 'ErroSessaoEncerrada';
  }
}

/** Resposta que não passou na validação de fronteira (Constitution IV). */
export class ErroRespostaInvalida extends Error {
  constructor(
    endpoint: string,
    readonly detalhe: string,
  ) {
    super(`Resposta inválida de ${endpoint}: ${detalhe}`);
    this.name = 'ErroRespostaInvalida';
  }
}
