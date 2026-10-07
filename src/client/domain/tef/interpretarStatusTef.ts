/**
 * Interpretação de `payment_status` da SmartTEF (T004, `research.md` D4,
 * `data-model.md` §2.1–§2.3, AD-259).
 *
 * Funções puras e **totais**: não lançam, não conhecem React, TanStack Query nem
 * rede. Mesmo papel de `domain/pix/interpretarStatusPix.ts` — padrão copiado,
 * não importado: os dois contratos não têm um literal em comum.
 *
 * **Duas funções, uma por fase**, e não uma só com um parâmetro de fase. O
 * mesmo literal quer dizer coisas opostas conforme o que a janela espera: `CNC`
 * é a aprovação que a cobrança procura e, na janela de estorno, é o estado
 * "ainda não estornado". Um `switch` por fase deixa cada tabela legível de uma
 * vez e faz um literal novo mudar uma linha em cada (Open/Closed).
 */

/**
 * Os literais de status do card da SmartTEF (`payment_status`; `print_status`
 * para impressão).
 *
 * Os nove primeiros são o domínio `SmartTefStatusPagamento` (`CHARACTER(10)`) da
 * KB `CentriumDEVU6`, lidos em 2026-10-02 (AD-259). `REJ`, `PROC` e `IMP` vêm da
 * lista que o usuário colou em 2026-10-07 (AD-268) e não estavam na KB:
 *
 * | Literal | Significado |
 * |---|---|
 * | `PDT` | Pendente |
 * | `PROC_PAG` / `PROC_EST` / `PROC` | Processando pagamento / estorno / (genérico) |
 * | `CNC` | Concluído — **a aprovação** |
 * | `REJ_PAG` | O operador da maquininha **não aceitou** a cobrança |
 * | `REJ_EST` | O operador da maquininha **não aceitou** o estorno |
 * | `REJ` | O cartão **não passou** nesta tentativa — o cliente pode tentar de novo |
 * | `CAN_ERP` | Cancelado pelo ERP |
 * | `SOL_EST` / `EST` | Estorno solicitado / concluído |
 * | `IMP` | Impresso — só de impressão, não esperado num pagamento |
 *
 * Documentação e insumo de teste — a **fronteira Zod não o usa**:
 * `payment_status` chega como `string` livre, e o estreitamento acontece só
 * aqui. Um `z.enum` derrubaria a janela no meio de uma cobrança se a SmartTEF
 * passasse a mandar um literal novo.
 */
export type StatusSmartTef =
  | 'PDT'
  | 'PROC_PAG'
  | 'CNC'
  | 'CAN_ERP'
  | 'REJ_PAG'
  | 'SOL_EST'
  | 'PROC_EST'
  | 'EST'
  | 'REJ_EST'
  | 'REJ'
  | 'PROC'
  | 'IMP';

export type MotivoFalhaTef =
  'PAGAMENTO_REJEITADO' | 'CANCELADO_NO_ERP' | 'ESTORNADO_FORA_DO_CHECKOUT';

export type ResultadoCobrancaTef =
  | { readonly situacao: 'PENDENTE' }
  /**
   * O cartão não passou nesta tentativa (`REJ`). **Não é desfecho**: a janela
   * segue esperando e consultando, porque o cliente pode tentar de novo e a
   * mesma cobrança chegar a `CNC`. Existe separado de `PENDENTE` só para a
   * tela avisar o operador, em vez de girar sem dizer nada.
   */
  | { readonly situacao: 'TENTATIVA_RECUSADA' }
  | { readonly situacao: 'APROVADO' }
  | { readonly situacao: 'FALHA'; readonly motivo: MotivoFalhaTef };

export type ResultadoEstornoTef =
  | { readonly situacao: 'ESTORNO_PENDENTE' }
  | { readonly situacao: 'ESTORNADO' }
  | { readonly situacao: 'ESTORNO_REJEITADO' };

/**
 * Fase de **cobrança** (janela `ModalTef`).
 *
 * | Literal | Na KB | Situação |
 * |---|---|---|
 * | `PDT`, `PROC_PAG`, `PROC`, `IMP` | Pendente, processando (`IMP` não é esperado) | `PENDENTE` |
 * | `REJ` | O cartão não passou nesta tentativa | `TENTATIVA_RECUSADA` (**não** é desfecho) |
 * | `CNC` | Concluído | **`APROVADO`** |
 * | `CAN_ERP` | Cancelado pelo ERP | `FALHA` / `CANCELADO_NO_ERP` |
 * | `REJ_PAG` | O operador da maquininha não aceitou a cobrança | `FALHA` / `PAGAMENTO_REJEITADO` |
 * | `SOL_EST`, `PROC_EST`, `EST`, `REJ_EST` | ciclo do estorno | `FALHA` / `ESTORNADO_FORA_DO_CHECKOUT` |
 *
 * **Só `CNC` aprova**, e não por leitura do nome: é o único status que
 * `PCheckout_FaturarNFCe` aceita. O `For Each` sobre `TransacaoTEF` filtra
 * `TEFSmartSt = SmartTefStatusPagamento.CNC` e, sem achar, recusa a nota com
 * "Pagamento SmartTEF … não Localizada". Dar por aprovado qualquer outro
 * literal produziria uma venda que o ERP recusa na finalização.
 *
 * Um literal de estorno durante a cobrança significa que alguém estornou a
 * transação **fora** do Checkout antes de ela ser confirmada aqui: é terminal.
 *
 * O `default` é guarda permanente (invariante T1), e é **pendente**, não falha
 * — ao contrário do PIX. Um literal novo da SmartTEF não pode abandonar uma
 * cobrança que o cliente talvez já tenha pago no cartão; o operador continua com
 * a saída manual ("Desistir da operação"), que avisa para conferir no terminal.
 */
export function interpretarStatusCobrancaTef(status: string): ResultadoCobrancaTef {
  switch (status) {
    case 'CNC':
      return { situacao: 'APROVADO' };
    case 'PDT':
    case 'PROC_PAG':
    case 'PROC':
    case 'IMP':
      return { situacao: 'PENDENTE' };
    case 'REJ':
      return { situacao: 'TENTATIVA_RECUSADA' };
    case 'CAN_ERP':
      return { situacao: 'FALHA', motivo: 'CANCELADO_NO_ERP' };
    case 'REJ_PAG':
      return { situacao: 'FALHA', motivo: 'PAGAMENTO_REJEITADO' };
    case 'SOL_EST':
    case 'PROC_EST':
    case 'EST':
    case 'REJ_EST':
      return { situacao: 'FALHA', motivo: 'ESTORNADO_FORA_DO_CHECKOUT' };
    default:
      return { situacao: 'PENDENTE' };
  }
}

/**
 * Fase de **estorno** (janela `JanelaEstornoTef`, `research.md` D14).
 *
 * | Literal | Situação |
 * |---|---|
 * | `EST` | **`ESTORNADO`** |
 * | `REJ_EST`, `CAN_ERP`, `REJ_PAG` | `ESTORNO_REJEITADO` |
 * | `CNC`, `PDT`, `PROC_PAG`, `SOL_EST`, `PROC_EST`, `PROC`, `REJ`, `IMP` | `ESTORNO_PENDENTE` |
 *
 * `REJ` aqui não é desfecho, como na cobrança: a janela continua consultando.
 * Só `REJ_EST` (o operador não aceitou o estorno) rejeita.
 *
 * **Só `EST` estorna.** `Sucesso: true` de `EstornarPagamento` é só o pedido
 * aceito (`SOL_EST`); riscar a forma antes do `EST` declararia devolvido um
 * dinheiro cujo estorno ainda pode ser rejeitado.
 *
 * `CAN_ERP`/`REJ_PAG` aqui não deveriam ocorrer — a forma estava aprovada —,
 * mas, se ocorrerem, o estorno não vai acontecer: rejeitado, e o TEF segue
 * aprovado na venda para o operador decidir (T6).
 *
 * O `default` espera, pelo mesmo motivo da cobrança (T1).
 */
export function interpretarStatusEstornoTef(status: string): ResultadoEstornoTef {
  switch (status) {
    case 'EST':
      return { situacao: 'ESTORNADO' };
    case 'REJ_EST':
    case 'CAN_ERP':
    case 'REJ_PAG':
      return { situacao: 'ESTORNO_REJEITADO' };
    case 'CNC':
    case 'PDT':
    case 'PROC_PAG':
    case 'SOL_EST':
    case 'PROC_EST':
    case 'PROC':
    case 'REJ':
    case 'IMP':
      return { situacao: 'ESTORNO_PENDENTE' };
    default:
      return { situacao: 'ESTORNO_PENDENTE' };
  }
}

/**
 * Frase que o operador lê quando a cobrança termina sem aprovação.
 *
 * `Record` completo, não `??` genérico: um motivo novo no tipo obriga o
 * compilador a exigir a frase (mesma escolha de `MENSAGEM_POR_MOTIVO_FALHA` do
 * PIX). Todas terminam mandando conferir o terminal, porque é lá que o operador
 * descobre se o cliente foi cobrado.
 */
export const MENSAGEM_POR_MOTIVO_FALHA_TEF: Readonly<Record<MotivoFalhaTef, string>> = {
  PAGAMENTO_REJEITADO:
    'O operador da maquininha não aceitou a cobrança, e nada foi cobrado do cliente. Escolha outra forma de pagamento ou cobre de novo.',
  CANCELADO_NO_ERP:
    'O ERP cancelou a cobrança antes de ela ser aprovada. Confira na maquininha antes de cobrar de outro jeito.',
  ESTORNADO_FORA_DO_CHECKOUT:
    'A cobrança foi estornada fora do Checkout antes de ser confirmada aqui. Confira na maquininha antes de cobrar de outro jeito.',
};
