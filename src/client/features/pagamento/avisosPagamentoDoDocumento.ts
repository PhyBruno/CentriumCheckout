/**
 * Frases que o operador lê antes de descartar um pagamento que **veio com o
 * documento** — um DAV importado ou, o caso comum, um rascunho de NFCe
 * retomado (AD-169).
 *
 * Módulo próprio pelo mesmo motivo de `pix/avisosPix.ts`: há dois pontos que
 * chegam ao mesmo desfecho — "Limpar", no cabeçalho do cartão de pagamento, e
 * "Remover", na faixa de uma forma aplicada — e duas redações do mesmo fato
 * divergem com o tempo até uma delas amenizar o que a outra avisa.
 *
 * **O fato que estas frases carregam** é diferente do das frases de PIX. Lá o
 * Checkout não consegue desfazer uma cobrança que ele mesmo criou; aqui ele
 * está prestes a apagar o registro de um dinheiro que **outro operador já
 * recebeu**, numa venda que foi cobrada e depois suspensa. O estrago não é uma
 * cobrança pendurada: é a NFCe sair sem o pagamento que o cliente fez.
 */

/** Chamada curta do diálogo — o fato que o operador precisa aceitar. */
export const CHAMADA_VALOR_JA_RECEBIDO = 'Este valor já foi recebido';

/**
 * Por que o Checkout não resolve sozinho.
 *
 * Nomeia **onde** o pagamento está gravado (no documento, dentro do ERP) porque
 * sem isso a leitura natural é a de que o valor "some" junto com a forma — e
 * some mesmo, mas só desta tela.
 */
export const AVISO_PAGAMENTO_DO_DOCUMENTO =
  'Este pagamento veio junto com o documento retomado e está registrado nele dentro do ERP. Descartá-lo aqui não estorna nem devolve nada ao cliente: apaga só o registro desta tela.';

/**
 * Destaque em caixa. É a única frase que precisa sobreviver a uma leitura
 * apressada, então descreve a **consequência fiscal**, não o gesto.
 */
export const DESTAQUE_NFCE_SAI_SEM_O_VALOR =
  'Se a venda for finalizada assim, a NFCe sai sem o valor que o cliente já pagou.';
