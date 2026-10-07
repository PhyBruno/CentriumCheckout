/**
 * Camada de rede do TEF (T014, `contracts/tef-domain-api.md` §2,
 * `contracts/erp-tef-api.md` §1–§3, AD-259).
 *
 * Três chamadas, todas pelo proxy autenticado `/api/erp/*` da feature 002.
 * `Empresa`, `EmpCod` e `UsuarioGAM` **nunca** saem daqui: o BFF os insere a
 * partir do cookie cifrado (`erp-proxy.ts`, invariante T8). Nenhuma rota nova de
 * BFF.
 *
 * Mesmo arranjo de `services/pix/pixQueries.ts` — comando imperativo para criar,
 * `useQuery` com intervalo fixo para sondar —, copiado e **não** importado: os
 * dois contratos não têm um campo em comum, e o TEF estorna, o PIX não
 * (`plan.md` § Structure Decision).
 *
 * **Formas medidas ao vivo em 2026-10-07** (AD-267, C0, POS simulado): o corpo
 * de `CriarCardPagamento` sai plano e com `FPgCod`, e o ERP o aceita; a consulta
 * devolve lista, e o estorno devolve `SOL_EST`, com o `EST` chegando pela
 * consulta. Ver `contracts/erp-tef-api.md`.
 */

import { useCallback, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ClienteVenda } from '../../domain/cliente/clienteVenda';
import type { CobrancaTef, ConsultaTef, DadosCriarCardTef } from '../../domain/tef/cobrancaTef';
import { montarPagadorTef, type PagadorTef } from '../../domain/tef/pagadorTef';
import { reaisDeCentavos } from '../../domain/precificacao/dinheiro';
import { criarErpClient, type ErpClient } from '../erpClient';
import {
  ErroNegocioErp,
  ErroRedeErp,
  ErroRespostaInvalida,
  ErroSessaoEncerrada,
} from '../errosErp';
import {
  lerRespostaSmartTef,
  paraCobrancaTef,
  paraConsultaTef,
  paraStatusEstorno,
} from './tefMapper';

const CAMINHO_CRIAR_CARD = '/ApiCentriumOAuth/CriarCardPagamento';
const CAMINHO_CONSULTAR_STATUS = '/ApiCentriumOAuth/ConsultarStatusCard';
const CAMINHO_ESTORNAR = '/ApiCentriumOAuth/EstornarPagamento';

/** AD-026: intervalo fixo, sem backoff — o mesmo do PIX. */
export const INTERVALO_POLLING_TEF_MS = 10_000;

export interface TefQueriesDeps {
  readonly erpClient?: ErpClient;
  /** Injetável **só** para teste — mesmo motivo de `PixQueriesDeps.intervaloMs`. */
  readonly intervaloMs?: number;
}

/**
 * O operador não tem `UsuarioGAM` no `GetSessao` (`FR-014`, item 64 de
 * `PENDENCIES.md`). Recusado antes da rede: o ERP responderia "Serial do POS …
 * nao localizado" depois de uma viagem inútil, e a frase dele não diz ao
 * operador que o problema é o cadastro do próprio usuário.
 */
export class ErroTefSemUsuarioGam extends Error {
  constructor() {
    super(
      'Este operador não tem usuário do TEF vinculado no ERP: peça ao administrador para vincular a maquininha ao seu usuário, ou escolha outra forma de pagamento.',
    );
    this.name = 'ErroTefSemUsuarioGam';
  }
}

/**
 * A venda não tem cliente. Rede de segurança: a ordem da venda (AD-209) já
 * garante um cliente antes do pagamento.
 */
export class ErroTefSemCliente extends Error {
  constructor() {
    super('Identifique o cliente da venda antes de cobrar no TEF.');
    this.name = 'ErroTefSemCliente';
  }
}

/**
 * `CriarCardPagamento` respondeu `Sucesso: true` sem um identificador legível
 * (`research.md` D10).
 *
 * Continua sendo `ErroRespostaInvalida` — é resposta fora do contrato —, mas a
 * frase é a do caixa, e ela é diferente de uma falha comum: a SmartTEF disse
 * "2xx", então **pode** existir cobrança criada na maquininha. "Tentar de novo"
 * sem conferir o terminal criaria a segunda.
 */
export class ErroCobrancaTefIlegivel extends ErroRespostaInvalida {
  constructor(detalhe: string) {
    super('CriarCardPagamento', detalhe);
    this.message =
      'O ERP respondeu sem identificar a cobrança: ela pode ter sido criada na maquininha. Confira no terminal antes de tentar de novo.';
    this.name = 'ErroCobrancaTefIlegivel';
  }
}

/**
 * Pré-condições locais da cobrança: `UsuarioGAM` e cliente.
 *
 * Exportada para a janela checar **antes** de qualquer requisição (`FR-014`):
 * sem `UsuarioGAM` a recusa vem primeiro, porque é a causa que o operador não
 * resolve no caixa.
 */
export function exigirPagadorTef(
  cliente: ClienteVenda | null,
  usuarioGamPresente: boolean,
): PagadorTef {
  if (!usuarioGamPresente) {
    throw new ErroTefSemUsuarioGam();
  }
  const pagador = montarPagadorTef(cliente);
  if (pagador === null) {
    throw new ErroTefSemCliente();
  }
  return pagador;
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
      if (!resultado.resposta.ok) {
        throw new ErroRedeErp();
      }
      return resultado.resposta;
  }
}

/** Corpo JSON da resposta; corpo ilegível é resposta fora do contrato. */
async function corpoJson(endpoint: string, resposta: Response): Promise<unknown> {
  try {
    return (await resposta.json()) as unknown;
  } catch {
    throw new ErroRespostaInvalida(endpoint, 'corpo não é JSON');
  }
}

/**
 * O único ponto que conhece a forma do corpo de `CriarCardPagamento`.
 *
 * **Plano**, como o precedente medido mais recente para um `POST` de SDT único
 * (`GerarPIX`, AD-251), e com a grafia `FPgCod` da KB — os dois **confirmados**
 * em 2026-10-07 (AD-267): o ERP aceita o corpo assim e a forma entra. O BFF
 * ainda injeta `EmpCod`/`UsuarioGAM` também dentro de `CriarCardReq`, que ficou
 * sem uso.
 *
 * `PagamentoValor` é a fronteira de saída `Centavos → reais`: o único ponto em
 * que o valor deixa de ser inteiro, e ele nunca volta para um cálculo (T10).
 * `CNPJAdquirente` e o tipo (`CREDIT`/`DEBIT`/`PIX`) não vão: o ERP os resolve
 * pela forma.
 */
export function montarCorpoCriarCard(entrada: DadosCriarCardTef): Record<string, unknown> {
  return {
    PagamentoValor: reaisDeCentavos(entrada.valor),
    PagamentoParcelas: entrada.parcelas,
    PagamentoCpfCliente: entrada.pagador.cpf,
    PagamentoNomeCliente: entrada.pagador.nome,
    FPgCod: entrada.formaCodigo,
  };
}

/**
 * `POST CriarCardPagamento` — cria a cobrança na maquininha.
 *
 * Exportada, e não só usada pelo hook, para o teste chamá-la sem React.
 */
export async function criarCardTef(
  entrada: DadosCriarCardTef,
  deps: TefQueriesDeps = {},
): Promise<CobrancaTef> {
  const cliente = deps.erpClient ?? criarErpClient();
  const resposta = await chamarErp(cliente, CAMINHO_CRIAR_CARD, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(montarCorpoCriarCard(entrada)),
  });

  const interno = lerRespostaSmartTefDaCriacao(await corpoJson('CriarCardPagamento', resposta));
  try {
    return paraCobrancaTef(interno, entrada.valor);
  } catch (causa) {
    throw new ErroCobrancaTefIlegivel(causa instanceof Error ? causa.message : String(causa));
  }
}

/**
 * Primeiro estágio da criação, com uma diferença: `RespostaJson` ilegível
 * depois de `Sucesso: true` vira `ErroCobrancaTefIlegivel`, porque ali a
 * cobrança **pode** existir. Envelope fora do contrato e recusa de negócio
 * seguem como nas demais chamadas.
 */
function lerRespostaSmartTefDaCriacao(corpo: unknown): unknown {
  try {
    return lerRespostaSmartTef('CriarCardPagamento', corpo);
  } catch (causa) {
    if (causa instanceof ErroRespostaInvalida && causa.detalhe === 'RespostaJson não é JSON') {
      throw new ErroCobrancaTefIlegivel(causa.detalhe);
    }
    throw causa;
  }
}

/**
 * `GET ConsultarStatusCard` — o status da cobrança **e** do estorno.
 *
 * `Empresa` entra na query pelo BFF, como primeiro par (AD-205). A consulta não
 * é só para a tela: é ela que grava o status na `TransacaoTEF` do ERP
 * (`PSmartTEF_AtualizaRetorno`, `research.md` D11).
 */
export async function consultarStatusTef(
  paymentIdentifier: string,
  deps: TefQueriesDeps = {},
): Promise<ConsultaTef> {
  const cliente = deps.erpClient ?? criarErpClient();
  const query = new URLSearchParams({ SmartTefPaymentIdentifier: paymentIdentifier });
  const resposta = await chamarErp(cliente, `${CAMINHO_CONSULTAR_STATUS}?${query.toString()}`, {
    method: 'GET',
  });

  const interno = lerRespostaSmartTef(
    'ConsultarStatusCard',
    await corpoJson('ConsultarStatusCard', resposta),
  );
  return paraConsultaTef(interno, paymentIdentifier);
}

/**
 * `POST EstornarPagamento` — **pede** o estorno.
 *
 * `Sucesso: true` é o pedido aceito, não o estorno concluído: quem decide é o
 * `payment_status` devolvido aqui (`EST` já concluído) ou o polling
 * (`research.md` D14). `Empresa` vai na raiz do corpo pelo BFF
 * (`CAMINHOS_COM_EMPRESA_NA_RAIZ`).
 */
export async function estornarTef(
  paymentIdentifier: string,
  deps: TefQueriesDeps = {},
): Promise<string> {
  const cliente = deps.erpClient ?? criarErpClient();
  const resposta = await chamarErp(cliente, CAMINHO_ESTORNAR, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ SmartTefPaymentIdentifier: paymentIdentifier }),
  });

  const interno = lerRespostaSmartTef(
    'EstornarPagamento',
    await corpoJson('EstornarPagamento', resposta),
  );
  return paraStatusEstorno(interno);
}

/**
 * Texto que a janela mostra para uma falha. A recusa do ERP vai **íntegra** —
 * "Serial do POS … nao localizado" diz ao operador o que fazer —, sem o prefixo
 * técnico de `ErroNegocioErp.message`.
 */
export function mensagemDeErroTef(causa: unknown, padrao: string): string {
  if (causa instanceof ErroNegocioErp) {
    return causa.motivo;
  }
  return causa instanceof Error ? causa.message : padrao;
}

export type StatusCriacaoTef = 'idle' | 'criando' | 'erro';

export interface CriacaoTef {
  criar(entrada: DadosCriarCardTef): Promise<CobrancaTef>;
  readonly status: StatusCriacaoTef;
  readonly erro: string | null;
}

/**
 * Criação da cobrança — comando imperativo, **sem** `useQuery`
 * (`research.md` D10).
 *
 * A chamada em voo fica num `ref`, e a reentrância devolve a **mesma** promessa
 * (invariante T2): duas chamadas de `CriarCardPagamento` são duas cobranças
 * reais na maquininha, e aqui é pior que no PIX — o cliente pode passar o
 * cartão nas duas. Cada "Tentar novamente" depois de um erro é uma chamada nova,
 * o que só é seguro porque o erro, por definição, não devolveu identificador.
 */
export function useCriarCardTef(deps: TefQueriesDeps = {}): CriacaoTef {
  const [status, setStatus] = useState<StatusCriacaoTef>('idle');
  const [erro, setErro] = useState<string | null>(null);
  const emVoo = useRef<Promise<CobrancaTef> | null>(null);

  const criar = useCallback(
    (entrada: DadosCriarCardTef): Promise<CobrancaTef> => {
      const pendente = emVoo.current;
      if (pendente !== null) {
        return pendente;
      }

      setStatus('criando');
      setErro(null);

      const chamada = criarCardTef(entrada, deps)
        .then((cobranca) => {
          setStatus('idle');
          return cobranca;
        })
        .catch((causa: unknown) => {
          setStatus('erro');
          setErro(mensagemDeErroTef(causa, 'Falha ao criar a cobrança no TEF.'));
          throw causa;
        })
        .finally(() => {
          emVoo.current = null;
        });

      emVoo.current = chamada;
      return chamada;
    },
    // `deps` é objeto literal no call site e muda de identidade a cada render;
    // o que a chamada usa é o cliente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deps.erpClient],
  );

  return { criar, status, erro };
}

export interface ConsultaStatusTef {
  /** `null` enquanto a primeira consulta não voltou (ou com o polling desligado). */
  readonly consulta: ConsultaTef | null;
  readonly isLoading: boolean;
}

/**
 * Sondagem do status — compartilhada pela janela de cobrança e pela de estorno
 * (`research.md` D11/D14). 10s fixos (AD-026).
 *
 * `habilitado = false` desliga na **mesma** renderização que processa um
 * desfecho (J3 da 009): parar é responsabilidade do call site. `gcTime: 0`
 * descarta a entrada quando a janela fecha, para a próxima janela do mesmo
 * identificador — a de estorno, depois da de cobrança — não começar mostrando
 * um status antigo por um quadro.
 *
 * Erro de rede numa consulta não encerra nada: `retry: false` e o próximo tick
 * tenta de novo. Só o status devolvido pelo ERP decide o desfecho.
 */
export function useStatusTef(
  paymentIdentifier: string,
  habilitado: boolean,
  deps: TefQueriesDeps = {},
): ConsultaStatusTef {
  const intervalo = deps.intervaloMs ?? INTERVALO_POLLING_TEF_MS;
  const ligado = habilitado && paymentIdentifier !== '';

  const consulta = useQuery({
    queryKey: ['tef', 'status', paymentIdentifier] as const,
    queryFn: () => consultarStatusTef(paymentIdentifier, deps),
    enabled: ligado,
    refetchInterval: ligado ? intervalo : false,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });

  return {
    consulta: consulta.data ?? null,
    // Query desligada nunca sai de `isPending` no TanStack v5 (AD-134).
    isLoading: ligado && consulta.isPending,
  };
}
