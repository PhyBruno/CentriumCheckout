/**
 * Tipos da cobrança PIX (T002–T007, `data-model.md` §1/§3).
 *
 * Domínio puro: só os tipos e os seus invariantes documentados. Mora num módulo
 * próprio, e não dentro de `pixMapper.ts` ou de `ModalPix.tsx`, pelo mesmo
 * motivo de `domain/cliente/clienteVenda.ts` (feature 005): o mapper
 * (`services/pix/`) e a UI (`features/pagamento/pix/`) precisam do mesmo tipo, e
 * declará-lo em um dos dois criaria um ciclo de importação type-only entre eles.
 *
 * Toda grandeza monetária é `Centavos`, importado da feature 003 — nunca
 * redefinido aqui (Constitution V).
 *
 * ---
 *
 * ### Divergência consciente do `data-model.md` §1: sem `idPagamento`
 *
 * O data-model declara `CobrancaPix.idPagamento` "para correlacionar com
 * `PagamentoAplicado`". O campo **não existe** aqui porque nenhum ponto do
 * desenho consegue preenchê-lo: `ModalPixProps`
 * (`contracts/pix-domain-api.md` §3) não recebe `idPagamento`, e
 * `useGerarPix().gerar({ formaCodigo, valor, pagador })` também não — o mapper
 * monta a cobrança a partir da resposta do ERP, onde esse dado não trafega.
 *
 * A correlação existe e é mais forte do que um campo copiado: quem monta o
 * modal (`ListaPagamentosAplicados`, feature 008) fecha `idPagamento` dentro dos
 * callbacks `onAprovado`/`onAbandonado`. Guardá-lo também aqui seria uma segunda
 * cópia do mesmo vínculo, capaz de divergir da primeira em silêncio.
 */

import type { Centavos } from '../precificacao/dinheiro';

/**
 * Cobrança viva na tela — estado **efêmero** do modal (Constitution VI).
 *
 * Nunca entra no `vendaStore`: fechar o modal a descarta, e o que sobrevive é
 * apenas o `PagamentoAplicado` da feature 008. Existe no máximo uma por vez
 * (invariante J1) — o modal é modal, e não há como o operador gerar duas.
 */
export interface CobrancaPix {
  /** Gerado no cliente a cada tentativa, nunca reaproveitado (J4, `research.md` D3/D12). */
  readonly trnGuid: string;
  /** `GerarPIXOutput.Trnbase64image` — vai direto para `<img src="data:image/jpeg;base64,…">`. */
  readonly qrCodeImagemBase64: string;
  /** `GerarPIXOutput.Trnbase64text` já decodificado (`atob`) — o "copia e cola". */
  readonly copiaECola: string;
  /** Valor cobrado, congelado no instante da geração (`research.md` D6). */
  readonly valor: Centavos;
}

/**
 * Dados do pagador enviados em `GerarPIX` (`research.md` D7, AD-100).
 *
 * Os quatro campos são `string` **não anulável** de propósito: o contrato do ERP
 * espera texto, e um `null` bruto no JSON seria um valor que o SDT não sabe ler.
 * Ausência vira `''`, sempre — ver `montarDadosPagador`.
 */
export interface DadosPagadorPix {
  readonly nome: string;
  /** `''` quando `ClienteVenda.documento` é `null` (só ocorre em `origem: 'DEFAULT'`). */
  readonly documento: string;
  /** Sempre `''` nesta versão — gap de escopo documentado, não omissão (`research.md` D7). */
  readonly email: string;
  /** Sempre `''` nesta versão, mesmo motivo de `email`. */
  readonly telefone: string;
}

/** Entrada de `useGerarPix().gerar` (`contracts/pix-domain-api.md` §2). */
export interface DadosGerarPix {
  /** `PagamentoAplicado.formaCodigo` — vira `FPgCod` no corpo do SDT. */
  readonly formaCodigo: number;
  /** Sempre o valor **desta** cobrança, nunca o subtotal cheio (J6). */
  readonly valor: Centavos;
  readonly pagador: DadosPagadorPix;
}
