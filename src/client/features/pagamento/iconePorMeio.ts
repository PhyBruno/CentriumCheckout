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
  Utensils,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { MeioPagtoNFe } from '../../domain/pagamento/formaPagamento';

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
