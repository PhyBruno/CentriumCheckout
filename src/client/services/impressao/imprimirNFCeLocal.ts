/**
 * Impressão direta pelo serviço local do PDV (T016,
 * `contracts/impressao-local-api.md`).
 *
 * É a **única** chamada de rede desta feature que não passa pelo proxy do BFF:
 * vai do navegador direto ao `CadMaqHost`, na rede local do PDV
 * (`research.md`, D4). O BFF roda em container e não tem, necessariamente,
 * acesso de rede a essa máquina — proxiar aqui pressuporia uma topologia que a
 * arquitetura não garante (AD-006).
 *
 * O protocolo replica o `Impressao.js` já em produção no PDV atual (AD-083):
 * `POST` na raiz do host, `text/plain`, corpo = XML cru. **Não existe formato
 * de resposta a validar** — sucesso é a requisição não ter lançado erro de
 * rede. Essa é uma exceção documentada à Constitution IV, não uma omissão: não
 * há shape a verificar do outro lado.
 */

/** Default do PDV atual, usado quando `CadMaqHost` vem vazio. */
export const HOST_IMPRESSAO_PADRAO = '127.0.0.1:4545';

export type CausaFalhaImpressao =
  /** Porta fechada / serviço não está rodando na máquina do PDV. */
  | 'servico-indisponivel'
  /** Local Network Access ou Mixed Content barrados pela política do navegador. */
  | 'bloqueio-navegador';

export type ResultadoImpressao =
  | { readonly estado: 'impresso'; readonly usouHostPadrao: boolean }
  | {
      readonly estado: 'falha';
      readonly causa: CausaFalhaImpressao;
      readonly mensagem: string;
      readonly usouHostPadrao: boolean;
    };

export interface ImpressaoDeps {
  readonly fetchImpl?: typeof fetch;
  /** Protocolo da página; injetável para o teste não depender da URL do jsdom. */
  readonly protocoloDaPagina?: string;
}

const MENSAGEM_SERVICO_INDISPONIVEL =
  'Não foi possível imprimir diretamente: o serviço de impressão da máquina não respondeu.';

const MENSAGEM_BLOQUEIO_NAVEGADOR =
  'O navegador bloqueou a comunicação com o serviço de impressão local. ' +
  'É configuração de navegador/política de TI (LocalNetworkAccessAllowedForUrls e ' +
  'InsecureContentAllowedForUrls), não uma falha da impressora.';

/**
 * Marcadores do bloqueio de Local Network Access no Chrome. A mensagem do
 * `TypeError` é o único sinal disponível — não há código de erro próprio.
 */
const MARCADORES_BLOQUEIO = ['local network', 'private network', 'mixed content', 'insecure'];

/**
 * Mixed Content é decidível **antes** de tentar: página em `https:` chamando
 * `http:` é bloqueada pelo navegador por definição.
 *
 * Vale a pena separar essa causa da genérica porque as remediações são
 * completamente diferentes — "o serviço não está rodando, verifique a máquina"
 * versus "a política de TI não liberou este site para a rede local", que o
 * operador de caixa não resolve sozinho (`research.md`, D5).
 */
function haMixedContent(protocoloDaPagina: string): boolean {
  return protocoloDaPagina === 'https:';
}

function ehBloqueioDeNavegador(erro: unknown): boolean {
  if (!(erro instanceof TypeError)) {
    return false;
  }
  const texto = erro.message.toLowerCase();
  return MARCADORES_BLOQUEIO.some((marcador) => texto.includes(marcador));
}

/**
 * @param xmlImpressao `NotaFiscal.XMLImpressao` da resposta de `FaturarNFCe`.
 * @param cadMaqHost `SessaoUsuario.CadMaqHost` (`host:porta`); vazio cai no default.
 */
export async function imprimirNFCeLocal(
  xmlImpressao: string,
  cadMaqHost: string,
  deps: ImpressaoDeps = {},
): Promise<ResultadoImpressao> {
  const executarFetch = deps.fetchImpl ?? fetch;
  const protocoloDaPagina = deps.protocoloDaPagina ?? window.location.protocol;

  const host = cadMaqHost.trim();
  const usouHostPadrao = host === '';
  const alvo = usouHostPadrao ? HOST_IMPRESSAO_PADRAO : host;

  if (haMixedContent(protocoloDaPagina)) {
    // Nem tenta: a requisição seria descartada pelo navegador e a falha
    // apareceria como "erro de conexão" genérico, mandando o operador procurar
    // um problema de impressora que não existe.
    return {
      estado: 'falha',
      causa: 'bloqueio-navegador',
      mensagem: MENSAGEM_BLOQUEIO_NAVEGADOR,
      usouHostPadrao,
    };
  }

  try {
    await executarFetch(`http://${alvo}`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: xmlImpressao,
    });
  } catch (erro) {
    return {
      estado: 'falha',
      causa: ehBloqueioDeNavegador(erro) ? 'bloqueio-navegador' : 'servico-indisponivel',
      mensagem: ehBloqueioDeNavegador(erro)
        ? MENSAGEM_BLOQUEIO_NAVEGADOR
        : MENSAGEM_SERVICO_INDISPONIVEL,
      usouHostPadrao,
    };
  }

  // Status HTTP **não** é consultado de propósito: o serviço local não define
  // formato nem código de resposta (AD-083). Inventar uma checagem de `ok` aqui
  // faria uma impressão bem-sucedida virar fallback de PDF conforme o humor do
  // servidor embarcado.
  return { estado: 'impresso', usouHostPadrao };
}
