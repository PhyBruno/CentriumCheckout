/**
 * Frases que o operador lê sobre o TEF (T009, `contracts/tef-domain-api.md` §3).
 *
 * Módulo próprio, e não constantes dentro de `ModalTef.tsx`, pelo mesmo motivo
 * de `pix/avisosPix.ts`: a janela de cobrança, a de estorno e a lista de
 * pagamentos aplicados descrevem os mesmos fatos, e três redações do mesmo fato
 * divergem até uma delas prometer o que o Checkout não faz.
 *
 * Não importa nada de `pix/`: as duas features compartilham padrão, não código
 * (`plan.md` § Structure Decision da 010).
 */

/**
 * Desistência com a cobrança já criada na maquininha (`FR-010`, `research.md`
 * D12).
 *
 * A API do ERP não expõe cancelamento de transação em voo, e o usuário pediu o
 * aviso explícito. A frase manda conferir o terminal porque é lá que o
 * operador descobre se o cliente chegou a passar o cartão.
 */
export const AVISO_TRANSACAO_EM_VOO =
  'O Checkout não cancela automaticamente a transação em voo no TEF. Se o cliente ainda passar o cartão, ela pode ser aprovada na maquininha: confira no terminal antes de cobrar de outro jeito.';

/** Chamada curta da confirmação de desistência. */
export const CHAMADA_TEF_NAO_E_CANCELADO = 'A transação não é cancelada por aqui';

/** Destaque em caixa da confirmação de desistência — a consequência. */
export const DESTAQUE_TEF_SEGUE_NA_MAQUININHA =
  'Desistir tira o pagamento da venda, mas a cobrança continua aberta na maquininha até expirar ou ser concluída.';

/**
 * Frase do `X` travado enquanto o pagamento não é aprovado. Diz o que falta
 * acontecer e qual é a saída — o botão do rodapé.
 */
export const MOTIVO_JANELA_TEF_TRAVADA =
  'Aguarde o retorno do TEF. Se o cliente desistiu, use "Desistir da operação".';

/** Motivo do `X` travado na janela de estorno. */
export const MOTIVO_JANELA_ESTORNO_TRAVADA =
  'Aguarde a confirmação do estorno. Para sair sem esperar, use "Desistir de esperar".';

/*
 * As três recusas que acontecem **antes** ou **no lugar** de uma cobrança —
 * operador sem `UsuarioGAM` (`FR-014`), venda sem cliente e criação respondida
 * sem identificador (`research.md` D10) — não estão aqui: a frase de cada uma é
 * a `message` da classe de erro correspondente em `services/tef/tefQueries.ts`
 * (`ErroTefSemUsuarioGam`, `ErroTefSemCliente`, `ErroCobrancaTefIlegivel`),
 * mesmo arranjo do `ErroPixSemCliente`. Repeti-las aqui criaria duas redações.
 */

/* ------------------------------------------------------------------ *
 * Estorno (US3, `research.md` D14)
 * ------------------------------------------------------------------ */

/** Título da confirmação aberta pelo "Remover" de um TEF aprovado. */
export const TITULO_CONFIRMAR_ESTORNO = 'Estornar o pagamento no cartão?';

export const CHAMADA_ESTORNO = 'O valor volta para o cartão do cliente';

export const EXPLICACAO_ESTORNO =
  'O Checkout pede o estorno ao TEF e espera a confirmação. A forma só sai da venda quando o estorno for concluído; se ele for rejeitado, o pagamento continua aprovado.';

export const DESTAQUE_ESTORNO =
  'Mantenha a maquininha ligada até a confirmação. O estorno não pode ser desfeito pelo Checkout.';

/**
 * Desistir de **esperar** um estorno já pedido: o pedido segue na SmartTEF e
 * pode se concluir sem o Checkout ver. A forma fica aprovada na venda, e um
 * novo "Remover" consulta o status antes de pedir de novo.
 */
export const AVISO_ESTORNO_SOLICITADO =
  'O estorno foi solicitado e pode se concluir na maquininha sem o Checkout ver. O pagamento continua aprovado na venda: use "Remover" de novo para conferir o status.';

export const AVISO_ESTORNO_REJEITADO =
  'O estorno foi rejeitado pelo TEF. O pagamento continua aprovado na venda.';
