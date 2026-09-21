/**
 * Camada de rede do PIX (T007, `contracts/erp-pix-api.md`,
 * `contracts/pix-domain-api.md` §2).
 *
 * Duas chamadas, ambas pelo proxy autenticado `/api/erp/*` da feature 002 —
 * `Authorization` e `Empresa` são injetados no servidor, inclusive o `Empresa`
 * que o contrato do ERP posiciona **dentro** do corpo de `GerarPIX`, não só em
 * query string (AD-019/AD-022). O JS nunca os monta.
 *
 * Esta frase só passou a ser verdade em 2026-09-21 (AD-249): até ali o
 * `SDTCentriumPag_Post` não estava na lista de envelopes do BFF, e o `GerarPIX`
 * chegava ao ERP sem empresa nenhuma.
 *
 * Nenhuma rota nova de BFF: as duas passam pelo proxy genérico já existente.
 */

import { useCallback, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MEIO_PAGTO } from '../../domain/pagamento/formaPagamento';
import type { CobrancaPix, DadosGerarPix } from '../../domain/pix/cobrancaPix';
import type { ResultadoStatusPix } from '../../domain/pix/interpretarStatusPix';
import { gerarPixOutputSchema, statusPixOutputSchema } from '../../../shared/schemas/pix.schema';
import { recusaDeNegocio } from '../../../shared/schemas/erpJson';
import { criarErpClient, type ErpClient } from '../erpClient';
import {
  ErroNegocioErp,
  ErroRedeErp,
  ErroRespostaInvalida,
  ErroSessaoEncerrada,
} from '../errosErp';
import { paraCobrancaPix, paraResultadoStatusPix } from './pixMapper';

const CAMINHO_GERAR_PIX = '/ApiCentriumOAuth/GerarPIX';
const CAMINHO_STATUS_PIX = '/ApiCentriumOAuth/StatusPIX';

const CENTAVOS_POR_REAL = 100;

/** AD-026: intervalo fixo, sem backoff — decisão deliberada, não omissão. */
export const INTERVALO_POLLING_PIX_MS = 10_000;

/**
 * Documento e série de origem da cobrança (AD-251).
 *
 * **Provisórios, e é assim que devem ser lidos.** O ERP exige os dois
 * preenchidos para gerar o QR Code — com eles vazios a resposta é o SDT vazio —,
 * mas a semântica que ele espera ainda não foi definida pelo time do ERP. Na
 * geração do PIX a venda sequer tem número de documento, e o `CadSerieNFCe` da
 * sessão vem vazio no ambiente de teste, então não há de onde derivá-los hoje.
 *
 * São os valores que comprovadamente fizeram a cobrança nascer em 2026-09-21.
 * Quando a semântica for definida, troque aqui — é o único ponto que os produz.
 */
const ORIGEM_DOCUMENTO_PIX = 1;
const ORIGEM_SERIE_PIX = '1';

export interface PixQueriesDeps {
  readonly erpClient?: ErpClient;
  /**
   * Intervalo do polling. Injetável **só** para teste, pelo mesmo motivo de
   * `gerarIdPagamento` no `pagamentoSlice`: um teste que precisasse esperar 10s
   * reais por tick ou manipular o relógio por baixo do TanStack Query mediria o
   * agendador, não o comportamento. O padrão de produção é `AD-026`.
   */
  readonly intervaloMs?: number;
}

/**
 * Fronteira de saída: centavos inteiros → reais decimais.
 *
 * Único ponto deste arquivo em que um valor monetário deixa de ser inteiro, e o
 * resultado nunca volta para dentro de um cálculo (Constitution V) — mesma
 * fronteira de `montarPagamentosParaPayload` na feature 008.
 */
function reaisDeCentavos(valor: number): number {
  return valor / CENTAVOS_POR_REAL;
}

/**
 * `GerarPIX` voltou `200` sem cobrança nenhuma e sem dizer por quê.
 *
 * Continua sendo `ErroRespostaInvalida` — é uma resposta fora do contrato, e
 * `detalhe` guarda a saída do Zod para quem depura —, mas a `message`, que é o
 * que o `ModalPix` mostra, é a frase do caixa. O dump técnico que a tela exibia
 * até AD-249 (`too_small`, `path`, `inclusive`) não dizia ao operador nem que
 * o problema estava no ERP.
 */
export class ErroGeracaoPixVazia extends ErroRespostaInvalida {
  constructor(detalhe: string) {
    super('GerarPIX', detalhe);
    this.message =
      'O ERP não gerou o QR Code desta cobrança. Confira a configuração do PIX da empresa no ERP.';
    this.name = 'ErroGeracaoPixVazia';
  }
}

async function chamarErp(
  cliente: ErpClient,
  caminho: string,
  init: RequestInit,
): Promise<Response> {
  const resultado = await cliente.chamar(caminho, init);

  switch (resultado.estado) {
    case 'erro-de-rede':
      throw new ErroRedeErp();
    case 'sessao-encerrada':
      throw new ErroSessaoEncerrada();
    case 'ok':
      return resultado.resposta;
  }
}

/**
 * Gera uma cobrança e devolve a cobrança já mapeada.
 *
 * Exportada (não só usada pelo hook) pelo mesmo motivo de `fetchProduto`/
 * `fetchCondicoesPagamento`: o teste chama a função direto, sem montar React.
 *
 * **Corpo plano e sem `TrnGUID` desde AD-251 (2026-09-21)**, as duas coisas
 * medidas ao vivo contra o prototype:
 *
 * - **sem o envelope `SDTCentriumPag_Post`.** O `ApiCentriumOAuth.yaml` declara
 *   `GerarPIXInput` envelopado, como todo endpoint de escrita, mas o ERP que
 *   responde hoje só gera a cobrança com o corpo na raiz;
 * - **sem `TrnGUID`.** Quem gera a chave da transação é o ERP, sempre (regra do
 *   usuário); o GUID chega na resposta e é ele que `paraCobrancaPix` guarda.
 *   Antes disso o hook sorteava um `crypto.randomUUID()` por tentativa
 *   (`research.md` D12), que o ERP ignorava — e o polling ficava perguntando
 *   por uma transação inexistente;
 * - **com `TrnOrigemDocumento`, `TrnOrigemSerie` e `TrnTempoExpiracaoPIX`.** A
 *   redação anterior dizia que estes ficavam "ausentes, nunca preenchidos com
 *   um valor sintético" (`research.md` D4/D4-bis). Sem eles o ERP devolvia o SDT
 *   vazio; preenchê-los foi o que fez a cobrança nascer. Continuam ausentes os
 *   campos de boleto/duplicata, `CntGUID` e `TrnStatus`.
 */
export async function gerarCobrancaPix(
  entrada: DadosGerarPix,
  deps: PixQueriesDeps = {},
): Promise<CobrancaPix> {
  const cliente = deps.erpClient ?? criarErpClient();

  const resposta = await chamarErp(cliente, CAMINHO_GERAR_PIX, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      TrnValor: reaisDeCentavos(entrada.valor),
      // `MeioPagtoNFe` da forma aplicada, não um segundo enum paralelo
      // (`research.md` D5): o campo usa o mesmo domínio `NFCe_FormaPagto` que
      // `FormaMeioPagtoNFe`, e portanto o **código** (`'17'`), não o nome
      // (AD-204). Esta feature só existe para PIX dinâmico.
      //
      // Confirmado ao vivo em 2026-09-21: com `'17'` o ERP gerou a cobrança, o
      // que fecha a dúvida que este comentário registrava desde AD-249.
      TrnFormaPagamento: MEIO_PAGTO.Pix,
      FPgCod: entrada.formaCodigo,
      TrnPagadorNome: entrada.pagador.nome,
      TrnPagadorCgc: entrada.pagador.documento,
      TrnPagadorEmail: entrada.pagador.email,
      TrnPagadorFone: entrada.pagador.telefone,
      TrnOrigemDocumento: ORIGEM_DOCUMENTO_PIX,
      TrnOrigemSerie: ORIGEM_SERIE_PIX,
      TrnTempoExpiracaoPIX: entrada.tempoExpiracaoSegundos,
    }),
  });

  if (!resposta.ok) {
    throw new ErroRedeErp();
  }

  const corpo: unknown = await resposta.json();

  // Recusa de negócio antes da validação: o padrão GeneXus é `200` com o SDT
  // zerado e a razão em `messages[]`, e o schema reprovaria o SDT zerado
  // jogando fora a única frase que diz ao operador o que fazer.
  const motivo = recusaDeNegocio(corpo);
  if (motivo !== null) {
    throw new ErroNegocioErp('GerarPIX', motivo);
  }

  const validado = gerarPixOutputSchema.safeParse(corpo);
  if (!validado.success) {
    // O caso real que chega aqui é o SDT **vazio sem `messages`** — `TrnGUID`
    // zerado e os dois base64 em branco, que é o que o ERP devolve quando nem
    // entra no processamento (medido em 2026-09-21, AD-249). O detalhe do Zod
    // continua no erro para depuração, mas a frase que o operador lê é a que
    // ele consegue entender: o dump de `too_small`/`path` que a tela mostrava
    // não dizia nada a quem está no caixa.
    throw new ErroGeracaoPixVazia(validado.error.message);
  }

  return paraCobrancaPix(validado.data, entrada.valor);
}

export async function consultarStatusPix(
  trnGuid: string,
  deps: PixQueriesDeps = {},
): Promise<ResultadoStatusPix> {
  const cliente = deps.erpClient ?? criarErpClient();
  const query = new URLSearchParams({ Trnguid: trnGuid });
  const resposta = await chamarErp(cliente, `${CAMINHO_STATUS_PIX}?${query.toString()}`, {
    method: 'GET',
  });

  if (!resposta.ok) {
    throw new ErroRedeErp();
  }

  const validado = statusPixOutputSchema.safeParse(await resposta.json());
  if (!validado.success) {
    throw new ErroRespostaInvalida('StatusPIX', validado.error.message);
  }

  return paraResultadoStatusPix(validado.data);
}

export type StatusGeracaoPix = 'idle' | 'gerando' | 'erro';

export interface GeracaoPix {
  /** Cada chamada usa um `TrnGUID` **novo** (J4) — inclusive o retry. */
  gerar(entrada: DadosGerarPix): Promise<CobrancaPix>;
  readonly status: StatusGeracaoPix;
  readonly erro: string | null;
}

/**
 * Geração da cobrança — ação imperativa, **sem** `useQuery`.
 *
 * É um comando disparado uma vez por tentativa, não um dado que faça sentido
 * cachear ou refazer em background: cachear a resposta faria o retry devolver a
 * cobrança antiga, que é exatamente o que `research.md` D12 proíbe.
 *
 * A chamada em voo é registrada num `ref` e não em estado: reentrância aqui
 * criaria **duas cobranças reais** no adquirente — o `StrictMode` do React 19
 * monta e desmonta o efeito duas vezes em desenvolvimento, e sem a guarda o
 * operador veria um QR Code enquanto uma segunda transação ficava órfã no ERP,
 * sem nenhum caminho de cancelamento (`research.md` D11).
 */
export function useGerarPix(deps: PixQueriesDeps = {}): GeracaoPix {
  const [status, setStatus] = useState<StatusGeracaoPix>('idle');
  const [erro, setErro] = useState<string | null>(null);
  const emVoo = useRef<Promise<CobrancaPix> | null>(null);

  const gerar = useCallback(
    (entrada: DadosGerarPix): Promise<CobrancaPix> => {
      const pendente = emVoo.current;
      if (pendente !== null) {
        return pendente;
      }

      setStatus('gerando');
      setErro(null);

      // Nenhum GUID é sorteado aqui desde AD-251: a chave da transação é do
      // ERP, e vem na resposta. O `crypto.randomUUID()` por tentativa que
      // `research.md` D12 pedia resolvia um problema que não existe — o valor
      // nunca chegou a identificar nada, porque o ERP sempre gerou o seu.
      const chamada = gerarCobrancaPix(entrada, deps)
        .then((cobranca) => {
          setStatus('idle');
          return cobranca;
        })
        .catch((causa: unknown) => {
          setStatus('erro');
          setErro(causa instanceof Error ? causa.message : 'Falha ao gerar a cobrança PIX.');
          throw causa;
        })
        .finally(() => {
          emVoo.current = null;
        });

      emVoo.current = chamada;
      return chamada;
    },
    // `deps` é um objeto literal no call site e mudaria de identidade a cada
    // render; o que importa são os dois campos que a chamada de fato usa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deps.erpClient],
  );

  return { gerar, status, erro };
}

export interface ConsultaStatusPix {
  /** `null` enquanto a primeira consulta não voltou (ou com o polling desligado). */
  readonly resultado: ResultadoStatusPix | null;
  readonly isLoading: boolean;
}

/**
 * Sondagem ativa do status (`research.md` D9, AD-026 — 10s fixos, sem SSE).
 *
 * `habilitado` é `false` sempre que o modal fechou **ou** o status já resolveu:
 * parar de fato é responsabilidade do call site, na mesma renderização que
 * processa o resultado — nunca do `refetchInterval` "parar sozinho" (J3).
 *
 * `gcTime: 0` faz a entrada sair do cache assim que o último observador some.
 * Sem isso, reabrir o modal para uma cobrança nova poderia exibir por um quadro
 * o último status da cobrança anterior, que é a pior confusão possível numa tela
 * que decide se o dinheiro entrou.
 */
export function useStatusPix(
  trnGuid: string,
  habilitado: boolean,
  deps: PixQueriesDeps = {},
): ConsultaStatusPix {
  const intervalo = deps.intervaloMs ?? INTERVALO_POLLING_PIX_MS;
  const ligado = habilitado && trnGuid !== '';

  const consulta = useQuery({
    queryKey: ['pix', 'status', trnGuid] as const,
    queryFn: () => consultarStatusPix(trnGuid, deps),
    enabled: ligado,
    refetchInterval: ligado ? intervalo : false,
    staleTime: 0,
    gcTime: 0,
    // Um erro de rede numa consulta não encerra a cobrança: o próximo tick
    // tenta de novo. Só o **status devolvido pelo ERP** decide o desfecho
    // (Constitution III) — tratar indisponibilidade como falha terminal
    // abandonaria uma cobrança que o cliente pode ter acabado de pagar.
    retry: false,
  });

  return {
    resultado: consulta.data ?? null,
    // Query desligada nunca sai de `isPending` no TanStack v5 (AD-134): sem o
    // `ligado &&`, o modal ficaria eternamente "carregando" antes da geração.
    isLoading: ligado && consulta.isPending,
  };
}
