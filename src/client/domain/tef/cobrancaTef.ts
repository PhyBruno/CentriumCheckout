/**
 * Tipos da cobrança TEF (T007, `data-model.md` §2.6–§2.7,
 * `contracts/tef-domain-api.md` §1).
 *
 * Domínio puro: só tipos. Moram aqui, e não em `tefMapper.ts` ou `ModalTef.tsx`,
 * pelo mesmo motivo de `domain/pix/cobrancaPix.ts`: o mapper (`services/tef/`)
 * e a UI (`features/pagamento/tef/`) precisam deles, e declará-los num dos dois
 * criaria um ciclo de importação type-only.
 */

import type { Centavos } from '../precificacao/dinheiro';
import type { PagadorTef } from './pagadorTef';

/**
 * Cobrança viva na maquininha — estado **efêmero** da janela (Constitution VI).
 *
 * Sem `idPagamento`, pela mesma escolha de `CobrancaPix`: quem monta a janela
 * fecha o `id` nos callbacks, e uma segunda cópia do vínculo poderia divergir
 * da primeira em silêncio.
 */
export interface CobrancaTef {
  /**
   * `payment_identifier` devolvido pela SmartTEF via ERP (`research.md` D5) —
   * a chave da consulta, do estorno e do `TEFPagId` da NFCe. O Checkout nunca
   * gera esse valor.
   */
  readonly paymentIdentifier: string;
  /** O `valorAplicado` cobrado — o bloco "Valor a cobrar" da janela. */
  readonly valor: Centavos;
  /** `payment_status` da criação; normalmente `PDT`. */
  readonly statusInicial: string;
}

/**
 * Entrada de `criarCardTef` — o que o **navegador** sabe da cobrança.
 *
 * **Não tem `EmpCod` nem `UsuarioGAM`, e isso é a regra, não omissão**
 * (invariante T8, AD-224). Os dois decidem de quem é a cobrança e em qual
 * maquininha ela aparece (`PSmartTEF` escolhe o `serial_pos` pelo `UsuarioGAM`).
 * Como o corpo vem do navegador e o ERP não o confere contra o token, um valor
 * forjado no DevTools mandaria a cobrança para o terminal de outro operador. O
 * BFF os insere a partir do cookie cifrado (`corpoComOperadorTef`); o tipo é o
 * que impede o JS de montá-los por engano.
 */
export interface DadosCriarCardTef {
  /** `PagamentoAplicado.formaCodigo` — vira `FPgCod`. */
  readonly formaCodigo: number;
  /** Vira `PagamentoValor` em reais, só na fronteira (T10). */
  readonly valor: Centavos;
  /** `parcelasDoTef` — vira `PagamentoParcelas`. */
  readonly parcelas: number;
  /** Vira `PagamentoCpfCliente` e `PagamentoNomeCliente`. */
  readonly pagador: PagadorTef;
}

/** O item da consulta, já reduzido ao que a tela e o retrato usam. */
export interface ConsultaTef {
  /**
   * `payment_status` **cru**. Quem interpreta é o chamador, pela fase em que
   * está — cobrança ou estorno —, porque o mesmo literal significa coisas
   * opostas nas duas (`interpretarStatusTef.ts`). `''` quando a lista não trouxe
   * o item consultado, o que as duas fases leem como pendente.
   */
  readonly status: string;
  /** `card_brand`, `''` se ausente. */
  readonly bandeira: string;
  /** `nsu_host`, `''` se ausente. */
  readonly nsu: string;
  /** `autorization_code` — grafia da SmartTEF, sem o "h". `''` se ausente. */
  readonly autorizacao: string;
  /** `reason`, `''` se ausente. */
  readonly motivo: string;
}
