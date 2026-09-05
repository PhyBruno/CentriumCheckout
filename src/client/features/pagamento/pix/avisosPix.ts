/**
 * Frases que o operador lê sobre uma cobrança PIX que precisa ser resolvida
 * fora do Checkout.
 *
 * Módulo próprio, e não constantes dentro de `ModalPix.tsx`, porque os quatro
 * pontos que as usam estão em features diferentes — a janela do PIX (009), a
 * lista de pagamentos aplicados e o botão "Limpar" (008) e o "Cancelar venda"
 * da finalização (004). Importar `ModalPix` só para ler um texto criaria
 * dependência de um componente pesado a partir de features que não montam
 * janela nenhuma.
 *
 * **Por que o texto é único.** As quatro telas descrevem o mesmo fato — o
 * Checkout não cancela cobrança PIX — e quatro redações do mesmo fato divergem
 * com o tempo até uma delas prometer um cancelamento automático que não existe.
 */

/**
 * O Checkout nunca chama cancelamento de PIX: não existe endpoint para isso no
 * contrato (invariante J5, `research.md` D11 da feature 009). A frase termina
 * apontando **onde** resolver porque, sem essa indicação, o operador procuraria
 * na própria tela um botão que não existe.
 *
 * Reescrita em 2026-09-04 (itens 2 e 3 do usuário): a versão anterior falava só
 * em "desassociar na Central de Transações PIX do ERP". O usuário corrigiu — a
 * cobrança que já recebeu dinheiro se resolve **no banco**, e a Central do ERP
 * só desfaz a associação com o documento. Omitir o banco fazia o operador
 * acreditar que a Central bastava para devolver o valor ao cliente.
 */
export const AVISO_DESASSOCIACAO_MANUAL =
  'O Checkout não cancela a cobrança PIX: se ela já foi registrada, o cancelamento ou o estorno precisa ser feito diretamente no banco, e a desassociação do documento na Central de Transações PIX do ERP.';

/** Chamada curta do diálogo de confirmação — o que o operador está prestes a fazer. */
export const CHAMADA_PIX_NAO_E_CANCELADO = 'O PIX não é cancelado por aqui';

/**
 * Destaque em caixa dos diálogos. É a única frase que precisa sobreviver a uma
 * leitura apressada: descreve a consequência, não a ação.
 */
export const DESTAQUE_PIX_SEGUE_NO_BANCO =
  'Remover a forma daqui não devolve o dinheiro ao cliente. A cobrança continua existindo no banco até você resolvê-la lá.';
