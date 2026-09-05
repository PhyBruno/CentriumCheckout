import { z } from 'zod';

/**
 * Validação de fronteira dos dois endpoints de PIX (T005, Constitution IV,
 * `contracts/erp-pix-api.md` §1/§2).
 *
 * Mesma convenção de `pagamento.schema.ts`/`produto.schema.ts`: `looseObject` —
 * o Checkout valida o que consome e deixa o resto da resposta íntegro
 * (Constitution III).
 *
 * Nenhum `double` de dinheiro atravessa esta fronteira: `TrnValor` só **sai**,
 * no corpo de `GerarPIX`, e as duas respostas trazem apenas strings. Por isso
 * não há `valorEmCentavos` aqui.
 */

/**
 * `GerarPIXOutput` (yaml linhas 733-740).
 *
 * Os três campos são obrigatórios: sem `Trnbase64image` não há QR Code para
 * exibir e sem `Trnbase64text` não há "copia e cola" — uma resposta sem eles não
 * é uma cobrança parcial, é uma cobrança que o operador não consegue apresentar
 * ao cliente. Falhar na fronteira leva ao toast de "Tentar novamente"
 * (`research.md` D12), que é o desfecho correto.
 */
export const gerarPixOutputSchema = z.looseObject({
  TrnGUID: z.string(),
  Trnbase64text: z.string(),
  Trnbase64image: z.string(),
});

/**
 * `StatusPIXOutput` (yaml linhas 742-747).
 *
 * `StatusTransacao` é `string` **livre**, não a união fechada dos dez literais
 * de AD-102 (`research.md` D15). Um `z.enum` aqui rejeitaria um literal novo
 * cadastrado no ERP e derrubaria a tela no meio de uma cobrança em curso; quem
 * decide o significado é `interpretarStatusPix`, que tem o ramo explícito
 * "desconhecido → falha terminal, nunca aprovado" (invariante J2). É o mesmo
 * padrão de resiliência que a feature 008 aplica a `FormaMeioPagtoNFe`.
 *
 * `messages` é o envelope padrão do ERP e chega opcional: nenhum requisito desta
 * feature o consome — o motivo exibido ao operador vem do literal de status, que
 * é o campo que o ERP de fato preenche em todo desfecho.
 */
export const statusPixOutputSchema = z.looseObject({
  StatusTransacao: z.string(),
  messages: z.array(z.unknown()).optional(),
});

export type GerarPixOutput = z.infer<typeof gerarPixOutputSchema>;
export type StatusPixOutput = z.infer<typeof statusPixOutputSchema>;
