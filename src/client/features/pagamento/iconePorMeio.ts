import {
  ArrowLeftRight,
  Ban,
  Banknote,
  Barcode,
  CalendarClock,
  CircleDashed,
  CreditCard,
  FileText,
  Fuel,
  Gift,
  Landmark,
  QrCode,
  ScrollText,
  ShoppingBasket,
  Star,
  Store,
  Ticket,
  Utensils,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { FormaPagamento, MeioPagtoNFe } from '../../domain/pagamento/formaPagamento';
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
 * `fuel` para vale combustível, `utensils` para vale refeição, `barcode` para
 * boleto — e não uma abstração financeira, porque a leitura acontece de relance
 * numa faixa de 34px. Os três do desenho ficam intocados.
 */
export const ICONE_POR_MEIO: Record<MeioPagtoNFe, LucideIcon> = {
  // --- Do Pencil ---
  Dinheiro: Banknote,
  CartaoCredito: CreditCard,
  CartaoDebito: CreditCard,
  Pix: QrCode,

  // --- Inferidos ---
  /** Mesmo `qr-code` do PIX dinâmico: para o operador é o mesmo gesto. */
  PixEstatico: QrCode,
  Cheque: ScrollText,
  /** Crédito da loja e crédito em loja são a mesma ideia em dois cadastros. */
  CreditoLoja: Store,
  CreditoEmLoja: Store,
  ValeAlimentacao: ShoppingBasket,
  ValeRefeicao: Utensils,
  ValePresente: Gift,
  ValeCombustivel: Fuel,
  DuplicataMercantil: FileText,
  BoletoBancario: Barcode,
  DepositoBancario: Landmark,
  TransferenciaBancaria: ArrowLeftRight,
  /** Typo reproduzido do domínio do ERP — ver `formaPagamento.ts`. */
  ProgaramaFidelidade: Star,
  PagamentoNaoInformado: CircleDashed,
  SemPagamento: Ban,
  PagamentoPosterior: CalendarClock,
  Outros: Wallet,
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
 * reconhece o vale antes de abrir e depois de aplicar. Não é `TicketCheck` (o do
 * campo e do botão "Aplicar vale"), que carrega semântica de "validado" e diria
 * algo falso numa forma ainda não inserida.
 */
export const ICONE_VALE_DEVOLUCAO: LucideIcon = Ticket;

/** Ícone da forma no catálogo — o do vale vence o mapa por meio. */
export function iconeDaForma(forma: FormaPagamento): LucideIcon {
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
export function iconeDoPagamento(pagamento: PagamentoAplicado): LucideIcon {
  return pagamento.ticketDevolucao !== null
    ? ICONE_VALE_DEVOLUCAO
    : ICONE_POR_MEIO[pagamento.meioPagtoNFe];
}
