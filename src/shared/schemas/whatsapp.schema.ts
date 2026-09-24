import { z } from 'zod';
import { semEnvelope } from './erpJson';
import { mensagemErpSchema } from './cliente.schema';

/**
 * Fronteira de `POST /ApiCentriumOAuth/EnvioDiretoWhatsapp` (envio da cobrança
 * PIX pelo WhatsApp).
 *
 * Contrato de entrada, do `ApiCentriumOAuth.yaml` (atualizado pelo usuário em
 * 2026-09-21) — `EnvioDiretoWhatsappInput`:
 *
 * ```yaml
 * Empresa:  integer int64   # injetada pelo BFF, nunca pelo JS (AD-019/AD-022)
 * TrnGUID:  string          # o GUID da cobrança PIX gerada
 * CliCod:   integer int64
 * Telefone: string
 * ```
 *
 * **O `Nome` que o Checkout envia não está nesse contrato**, e vai assim mesmo
 * por decisão do usuário (2026-09-21): "não tem, mas devemos enviar. O ERP só
 * vai ignorar e fica como melhoria futura". Enquanto o parâmetro não existir do
 * outro lado, o nome que o operador digita para um cliente default não alcança
 * o template — o ERP o resolve pelo `CliCod`. O campo é enviado para que o dia
 * em que a KB o aceitar não exija mexer no cliente.
 *
 * A saída é `GeneXus.Common.Messages_Message`, o mesmo tipo de `PostCliente` —
 * daí o schema da mensagem vir de `cliente.schema.ts`, onde ele nasceu, em vez
 * de ser redeclarado aqui com risco de divergir.
 *
 * **O YAML desenha o array nu; o ERP real embrulha em `{"messages": [...]}`.**
 * Não é suposição: é o que `postClienteOutputSchema` documenta ter medido ao
 * vivo em 2026-09-11 para o endpoint irmão, e é a regra geral de AD-218 — o
 * envelope acompanha a presença de `messages`, não o endpoint. `semEnvelope`
 * aceita as duas formas e entrega sempre o array, o que mantém o `erp-mock` e o
 * YAML válidos sem abrir mão do formato de produção.
 */
export const envioWhatsappOutputSchema = semEnvelope('messages', z.array(mensagemErpSchema));

export type EnvioWhatsappOutput = z.infer<typeof envioWhatsappOutputSchema>;
