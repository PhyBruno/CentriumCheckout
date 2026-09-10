import {
  ArrowSwapHorizontal,
  Ban,
  Banknote,
  Barcode,
  BasketShopping,
  Bank,
  Bill,
  Clock,
  CreditCard,
  FileText,
  ForkKnife,
  Fuel,
  Gift,
  HelpCircle,
  Qr,
  Star,
  Store,
  Ticket,
  Wallet,
  type IconComponent,
} from 'reicon-react';
import {
  MEIO_PAGTO,
  type FormaPagamento,
  type MeioPagtoNFe,
} from '../../domain/pagamento/formaPagamento';
import { ehFormaDeValeDevolucao } from '../../domain/pagamento/valeDevolucao';
import type { PagamentoAplicado } from '../../domain/pagamento/saldoPagamento';

/**
 * Ícone de cada meio de pagamento da NFCe — **um mapa só** para a tela inteira.
 *
 * Quem decide o ícone é o `FormaMeioPagtoNFe` que o ERP publica no catálogo da
 * sessão, nunca a descrição da forma (que é livre, e vem como `"1 - DINHEIRO"`)
 * nem o `FormaCodigo` (que é por empresa). É a mesma chave que o
 * `PagamentoAplicado` congela na aplicação, então a linha do pagamento continua
 * mostrando o ícone certo mesmo que o catálogo mude no meio da venda.
 *
 * **Três vêm do Pencil, o resto é inferido — de propósito.** O desenho só
 * nomeia `qr-code` (PIX), `banknote` (Dinheiro) e `credit-card` (cartão), no nó
 * "Métodos de pagamento rápidos". A versão anterior deste mapa era
 * `Partial<Record<…>>` e deixava os outros 18 meios **sem ícone nenhum**, o que
 * produzia linhas visualmente diferentes na mesma lista sem que a diferença
 * significasse coisa alguma para o operador. Agora o `Record` é total: o
 * compilador exige uma entrada por meio, e um valor novo na união
 * (`formaPagamento.ts`) não passa despercebido.
 *
 * Os ícones inferidos escolhem o **objeto físico** que o caixa reconhece —
 * `Fuel` para vale combustível, `ForkKnife` para vale refeição, `Barcode` para
 * boleto — e não uma abstração financeira, porque a leitura acontece de relance
 * numa faixa de 34px. Os três do desenho ficam intocados.
 */
export const ICONE_POR_MEIO: Record<MeioPagtoNFe, IconComponent> = {
  // --- Do Pencil ---
  [MEIO_PAGTO.Dinheiro]: Banknote,
  [MEIO_PAGTO.CartaoCredito]: CreditCard,
  [MEIO_PAGTO.CartaoDebito]: CreditCard,
  [MEIO_PAGTO.Pix]: Qr,

  // --- Inferidos ---
  /** Mesmo `qr-code` do PIX dinâmico: para o operador é o mesmo gesto. */
  [MEIO_PAGTO.PixEstatico]: Qr,
  [MEIO_PAGTO.Cheque]: Bill,
  /** Crédito da loja e crédito em loja são a mesma ideia em dois cadastros. */
  [MEIO_PAGTO.CreditoLoja]: Store,
  [MEIO_PAGTO.CreditoEmLoja]: Store,
  [MEIO_PAGTO.ValeAlimentacao]: BasketShopping,
  [MEIO_PAGTO.ValeRefeicao]: ForkKnife,
  [MEIO_PAGTO.ValePresente]: Gift,
  [MEIO_PAGTO.ValeCombustivel]: Fuel,
  [MEIO_PAGTO.DuplicataMercantil]: FileText,
  [MEIO_PAGTO.BoletoBancario]: Barcode,
  [MEIO_PAGTO.DepositoBancario]: Bank,
  [MEIO_PAGTO.TransferenciaBancaria]: ArrowSwapHorizontal,
  [MEIO_PAGTO.ProgramaFidelidade]: Star,
  [MEIO_PAGTO.PagamentoNaoInformado]: HelpCircle,
  [MEIO_PAGTO.SemPagamento]: Ban,
  [MEIO_PAGTO.PagamentoPosterior]: Clock,
  [MEIO_PAGTO.Outros]: Wallet,
};

/**
 * O vale devolução é a exceção ao mapa acima — **e precisa ser** (pedido do
 * usuário, 2026-09-04).
 *
 * `FpgUtiCar = 'VDV'` identifica a forma de vale (AD-149), mas o
 * `FormaMeioPagtoNFe` dela é livre no cadastro e costuma ser `'Outros'`. Pelo
 * mapa por meio, o vale herdaria a carteira genérica — o mesmo ícone de
 * "PagamentoNaoInformado" e de qualquer forma exótica —, e o operador perderia
 * de vista justamente a forma que tem uma janela própria e um código a digitar.
 *
 * `Ticket` é o ícone do cabeçalho de `ModalValeDevolucao`: a lista e o combobox
 * passam a mostrar o mesmo desenho que a janela do código, então o operador
 * reconhece o vale antes de abrir e depois de aplicar. Não é `Verified` (o do
 * campo e do botão "Aplicar vale"), que carrega semântica de "validado" e diria
 * algo falso numa forma ainda não inserida.
 */
export const ICONE_VALE_DEVOLUCAO: IconComponent = Ticket;

/** Ícone da forma no catálogo — o do vale vence o mapa por meio. */
export function iconeDaForma(forma: FormaPagamento): IconComponent {
  return ehFormaDeValeDevolucao(forma) ? ICONE_VALE_DEVOLUCAO : ICONE_POR_MEIO[forma.meioPagtoNFe];
}

/**
 * Ícone de um pagamento já aplicado.
 *
 * O marcador aqui é `ticketDevolucao`, não `fpgUtiCar`: `PagamentoAplicado`
 * congela o **meio** e o ticket, nunca o `FpgUtiCar` da forma (`data-model.md`
 * §2, "Regra de fronteira") — e resolver a forma no catálogo depois seria
 * exatamente o que aquela regra proíbe, já que o catálogo pode ter mudado no
 * meio da venda.
 */
export function iconeDoPagamento(pagamento: PagamentoAplicado): IconComponent {
  return pagamento.ticketDevolucao !== null
    ? ICONE_VALE_DEVOLUCAO
    : ICONE_POR_MEIO[pagamento.meioPagtoNFe];
}
