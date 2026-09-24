/**
 * Envio da cobrança PIX pelo WhatsApp — `POST /api/erp/EnvioDiretoWhatsapp`
 * (pedido do usuário, 2026-09-21).
 *
 * Função comum, **não** hook nem `useQuery` (mesmo raciocínio de
 * `enviarValidarNFCe` e de `useGerarPix`): é um comando disparado por gesto do
 * operador, cujo resultado vale para aquele instante. Cachear ou refazer em
 * background significaria mandar a mesma mensagem ao cliente de novo — o tipo
 * de efeito que nenhum `refetch` deve poder causar sozinho.
 *
 * **Nunca rejeita a promise**: rede, HTTP de erro, corpo fora do schema e
 * recusa de negócio viram estados do resultado. É o que permite ao modal tratar
 * o desfecho numa expressão só, sem um `catch` esquecido virando "enviado" para
 * o operador.
 *
 * A chamada passa pelo proxy autenticado `/api/erp/*` da feature 002, que
 * injeta `Authorization` e `Empresa` — inclusive a `Empresa` que o contrato
 * deste endpoint pede **dentro** do corpo (AD-019/AD-022, e a mesma razão de
 * segurança de AD-024/AD-224: o corpo vem do navegador e não é fonte confiável
 * de tenant).
 */

import { criarErpClient, type ErpClient } from '../erpClient';
import { primeiroErroDeNegocio } from '../../../shared/schemas/cliente.schema';
import { envioWhatsappOutputSchema } from '../../../shared/schemas/whatsapp.schema';

const CAMINHO_ENVIO_WHATSAPP = '/ApiCentriumOAuth/EnvioDiretoWhatsapp';

export interface DadosEnvioWhatsapp {
  /** `CobrancaPix.trnGuid` — a cobrança que o cliente vai receber. */
  readonly trnGuid: string;
  /** `ClienteVenda.codigoCliente`, inclusive o do cliente default. */
  readonly codigoCliente: number;
  /** Já normalizado por `normalizarTelefoneWhatsapp` (dígitos com DDI). */
  readonly telefone: string;
  /** O que o operador digitou; ver o TSDoc de `whatsapp.schema.ts`. */
  readonly nome: string;
}

export type ResultadoEnvioWhatsapp =
  | { readonly estado: 'enviado' }
  /** O ERP respondeu e recusou, com a frase dele (`messages[].Type === 1`). */
  | { readonly estado: 'recusado'; readonly motivo: string }
  /** Rede, sessão, HTTP de erro ou corpo fora do contrato. */
  | { readonly estado: 'falhou'; readonly motivo: string };

export interface EnvioWhatsappDeps {
  readonly erpClient?: ErpClient;
}

export async function enviarPixPorWhatsapp(
  dados: DadosEnvioWhatsapp,
  deps: EnvioWhatsappDeps = {},
): Promise<ResultadoEnvioWhatsapp> {
  const cliente = deps.erpClient ?? criarErpClient();

  const resultado = await cliente.chamar(CAMINHO_ENVIO_WHATSAPP, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      TrnGUID: dados.trnGuid,
      CliCod: dados.codigoCliente,
      Telefone: dados.telefone,
      Nome: dados.nome,
      // `Empresa` não entra aqui: o BFF a escreve a partir do cookie cifrado.
    }),
  });

  switch (resultado.estado) {
    case 'erro-de-rede':
      return { estado: 'falhou', motivo: 'O ERP não respondeu ao envio.' };

    case 'sessao-encerrada':
      // A feature 002 já derruba a sessão a partir do proxy. Aqui só interessa
      // que nada foi enviado — e o operador precisa saber disso, porque a
      // cobrança PIX continua viva na tela atrás desta janela.
      return { estado: 'falhou', motivo: 'A sessão terminou antes do envio.' };

    case 'ok':
      break;
  }

  if (!resultado.resposta.ok) {
    return { estado: 'falhou', motivo: 'O ERP recusou a chamada de envio.' };
  }

  let corpo: unknown;
  try {
    corpo = await resultado.resposta.json();
  } catch {
    return { estado: 'falhou', motivo: 'O ERP respondeu em formato inesperado.' };
  }

  const validado = envioWhatsappOutputSchema.safeParse(corpo);
  if (!validado.success) {
    return { estado: 'falhou', motivo: 'O ERP respondeu em formato inesperado.' };
  }

  // Recusa de negócio chega como `200` com `Type: 1` (padrão GeneXus, o mesmo
  // de `PostCliente`): sem esta leitura, "número inválido" passaria por envio
  // bem-sucedido e o operador diria ao cliente que a cobrança já foi.
  const erro = primeiroErroDeNegocio(validado.data);
  if (erro !== null) {
    return { estado: 'recusado', motivo: erro.Description };
  }

  return { estado: 'enviado' };
}
