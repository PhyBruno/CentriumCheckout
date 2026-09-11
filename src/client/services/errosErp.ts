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

/**
 * O ERP recusou por regra de negócio, e disse por quê.
 *
 * Distinto de `ErroRespostaInvalida`, que vem logo abaixo: ali o ERP respondeu
 * algo que o Checkout não sabe ler; aqui ele respondeu **exatamente** o que
 * devia — `200` com o SDT zerado e a razão em `messages[].Description`, o padrão
 * GeneXus de recusa. Separá-los é o que permite mostrar ao operador "Série é
 * obrigatório" ou "Pedido Liberado: S, Status Digitação: N" em vez de "formato
 * inesperado", que era o que ele lia até 2026-09-11 para **toda** recusa de
 * importação de DAV e de rascunho de NFCe.
 *
 * `motivo` é o texto do ERP, íntegro: quem exibe não reescreve nem interpreta
 * (Constitution III). O Checkout não tenta mapear a frase para uma taxonomia
 * própria — o conjunto de recusas possíveis é do ERP e muda sem aviso.
 */
export class ErroNegocioErp extends Error {
  constructor(
    endpoint: string,
    readonly motivo: string,
  ) {
    super(`O ERP recusou a chamada a ${endpoint}: ${motivo}`);
    this.name = 'ErroNegocioErp';
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
