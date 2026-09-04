/**
 * Camada de rede do PIX (T007, `contracts/erp-pix-api.md`,
 * `contracts/pix-domain-api.md` §2).
 *
 * Duas chamadas, ambas pelo proxy autenticado `/api/erp/*` da feature 002 —
 * `Authorization` e `Empresa` são injetados no servidor, inclusive o `Empresa`
 * que o contrato do ERP posiciona **dentro** do corpo de `GerarPIX`, não só em
 * query string (AD-019/AD-022). O JS nunca os monta.
 *
 * Nenhuma rota nova de BFF: as duas passam pelo proxy genérico já existente.
 */

import { useCallback, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { CobrancaPix, DadosGerarPix } from '../../domain/pix/cobrancaPix';
import type { ResultadoStatusPix } from '../../domain/pix/interpretarStatusPix';
import { gerarPixOutputSchema, statusPixOutputSchema } from '../../../shared/schemas/pix.schema';
import { criarErpClient, type ErpClient } from '../erpClient';
import { ErroRedeErp, ErroRespostaInvalida, ErroSessaoEncerrada } from '../errosErp';
import { paraCobrancaPix, paraResultadoStatusPix } from './pixMapper';

const CAMINHO_GERAR_PIX = '/ApiCentriumOAuth/GerarPIX';
const CAMINHO_STATUS_PIX = '/ApiCentriumOAuth/StatusPIX';

const CENTAVOS_POR_REAL = 100;

/** AD-026: intervalo fixo, sem backoff — decisão deliberada, não omissão. */
export const INTERVALO_POLLING_PIX_MS = 10_000;

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
 * `trnGuid` é **parâmetro**, não gerado aqui dentro: quem decide gerar um GUID
 * novo é o hook, a cada tentativa (J4/`research.md` D12) — uma função que o
 * gerasse por conta própria não teria como um teste afirmar que duas tentativas
 * usaram valores diferentes.
 *
 * Só o subconjunto de `SDTCentriumPag_Post` relevante ao PIX é enviado
 * (`research.md` D4/D4-bis): os campos de boleto/duplicata, `CntGUID`,
 * `TrnOrigemDocumento`/`TrnOrigemSerie`, `TrnStatus` e `TrnTempoExpiracaoPIX`
 * ficam ausentes — nunca preenchidos com um valor sintético.
 */
export async function gerarCobrancaPix(
  entrada: DadosGerarPix,
  trnGuid: string,
  deps: PixQueriesDeps = {},
): Promise<CobrancaPix> {
  const cliente = deps.erpClient ?? criarErpClient();

  const resposta = await chamarErp(cliente, CAMINHO_GERAR_PIX, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      SDTCentriumPag_Post: {
        TrnGUID: trnGuid,
        TrnValor: reaisDeCentavos(entrada.valor),
        // `MeioPagtoNFe` da forma aplicada, não um segundo enum paralelo
        // (`research.md` D5): o campo usa o mesmo domínio `Nfce_FormaPagto` que
        // `FormaMeioPagtoNFe`. Esta feature só existe para `'Pix'`.
        TrnFormaPagamento: 'Pix',
        FPgCod: entrada.formaCodigo,
        TrnPagadorNome: entrada.pagador.nome,
        TrnPagadorCgc: entrada.pagador.documento,
        TrnPagadorEmail: entrada.pagador.email,
        TrnPagadorFone: entrada.pagador.telefone,
      },
    }),
  });

  if (!resposta.ok) {
    throw new ErroRedeErp();
  }

  const validado = gerarPixOutputSchema.safeParse(await resposta.json());
  if (!validado.success) {
    throw new ErroRespostaInvalida('GerarPIX', validado.error.message);
  }

  return paraCobrancaPix(validado.data, trnGuid, entrada.valor);
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

      // GUID novo a cada tentativa, inclusive quando a anterior falhou: o ERP
      // pode ter criado a linha apesar do erro reportado ao cliente, e reusar o
      // valor colidiria com ela (`research.md` D12).
      const chamada = gerarCobrancaPix(entrada, crypto.randomUUID(), deps)
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
