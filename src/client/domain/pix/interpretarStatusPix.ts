/**
 * Interpretação de `StatusPIXOutput.StatusTransacao` (T002, `data-model.md` §2,
 * `research.md` D8, **AD-102**).
 *
 * Função pura e **total**: não lança, não conhece React, TanStack Query ou rede.
 * Uma mudança futura no significado dos literais do ERP altera só o `switch`
 * abaixo, num arquivo só (Open/Closed).
 */

/**
 * Os dez literais reais do domínio `VARCHAR(1)` do ERP, confirmados diretamente
 * pelo usuário em 2026-08-27 (AD-102, fecha o item 33 de `PENDENCIES.md`).
 *
 * O tipo é exportado como documentação e como insumo de teste — a **fronteira
 * Zod não o usa**: `StatusTransacao` chega como `string` livre
 * (`research.md` D15), justamente para que um literal novo cadastrado no ERP não
 * derrube a tela do operador. Quem decide o significado é a função abaixo.
 */
export type StatusTransacaoLiteral = 'C' | 'A' | 'G' | 'P' | 'M' | 'X' | 'R' | 'E' | 'F' | 'O';

export type MotivoFalhaPix =
  | 'EXPIRADA'
  | 'RECUSADA'
  | 'ERRO'
  | 'FECHADA'
  | 'ASSOCIACAO_REMOVIDA'
  | 'DESCONHECIDO';

/**
 * União discriminada: o call site nunca lê `motivo` sem antes checar
 * `situacao === 'FALHA_TERMINAL'`, e nunca confunde `PENDENTE` com `APROVADO`
 * por engano de tipo.
 */
export type ResultadoStatusPix =
  | { readonly situacao: 'PENDENTE' }
  | { readonly situacao: 'APROVADO' }
  | { readonly situacao: 'FALHA_TERMINAL'; readonly motivo: MotivoFalhaPix };

/**
 * Tabela de decisão completa (`contracts/erp-pix-api.md` §2):
 *
 * | Literal | Significado no ERP              | Situação                         |
 * |---------|----------------------------------|----------------------------------|
 * | `'C'`   | Criada                           | `PENDENTE`                       |
 * | `'A'`   | Aberta                           | `PENDENTE`                       |
 * | `'G'`   | Aguardando Pagamento             | `PENDENTE`                       |
 * | `'P'`   | Pagamento Recebido               | `APROVADO`                       |
 * | `'M'`   | Pagamento Liberado Manualmente   | `APROVADO`                       |
 * | `'X'`   | Expirada                         | `FALHA_TERMINAL` / `EXPIRADA`    |
 * | `'R'`   | Recusada                         | `FALHA_TERMINAL` / `RECUSADA`    |
 * | `'E'`   | Erro                             | `FALHA_TERMINAL` / `ERRO`        |
 * | `'F'`   | Fechada                          | `FALHA_TERMINAL` / `FECHADA`     |
 * | `'O'`   | Removido Associação PIX          | `FALHA_TERMINAL` / `ASSOCIACAO_REMOVIDA` |
 *
 * `'P'` e `'M'` são tratados de forma **idêntica**: os dois significam que o PIX
 * foi recebido, e `'M'` (liberação manual por um administrador do ERP) não é um
 * caso especial para o Checkout.
 *
 * O ramo `default` é guarda permanente (invariante J2, Constitution IV): um
 * literal novo introduzido pelo ERP no futuro nunca é lido como aprovado por
 * omissão. Falhar terminalmente é o desfecho seguro — o pior erro possível aqui
 * é dar uma venda como paga sem que o dinheiro tenha entrado.
 */
export function interpretarStatusPix(statusTransacao: string): ResultadoStatusPix {
  switch (statusTransacao) {
    case 'P':
    case 'M':
      return { situacao: 'APROVADO' };
    case 'C':
    case 'A':
    case 'G':
      return { situacao: 'PENDENTE' };
    case 'X':
      return { situacao: 'FALHA_TERMINAL', motivo: 'EXPIRADA' };
    case 'R':
      return { situacao: 'FALHA_TERMINAL', motivo: 'RECUSADA' };
    case 'E':
      return { situacao: 'FALHA_TERMINAL', motivo: 'ERRO' };
    case 'F':
      return { situacao: 'FALHA_TERMINAL', motivo: 'FECHADA' };
    case 'O':
      return { situacao: 'FALHA_TERMINAL', motivo: 'ASSOCIACAO_REMOVIDA' };
    default:
      return { situacao: 'FALHA_TERMINAL', motivo: 'DESCONHECIDO' };
  }
}

/**
 * Frase que o operador lê quando a cobrança termina sem pagamento.
 *
 * Vive aqui, junto do motivo que a produz, para que acrescentar um literal novo
 * ao `switch` acima obrigue o compilador a exigir a frase correspondente — um
 * `Record` completo, não um `??` genérico que silenciaria o caso novo.
 *
 * Todas terminam apontando a **saída**: a desassociação da cobrança é feita na
 * Central de Transações PIX do ERP, fora do Checkout (`research.md` D11) — não
 * existe endpoint de cancelamento e o operador precisa saber disso para não
 * ficar procurando um botão que não existe.
 */
export const MENSAGEM_POR_MOTIVO_FALHA: Record<MotivoFalhaPix, string> = {
  EXPIRADA: 'A cobrança PIX expirou sem pagamento.',
  RECUSADA: 'A cobrança PIX foi recusada.',
  ERRO: 'A cobrança PIX terminou em erro no provedor de pagamento.',
  FECHADA: 'A cobrança PIX foi encerrada sem pagamento.',
  ASSOCIACAO_REMOVIDA: 'A cobrança PIX foi desassociada na Central de Transações PIX.',
  DESCONHECIDO: 'A cobrança PIX retornou uma situação desconhecida e não pode ser confirmada.',
};
