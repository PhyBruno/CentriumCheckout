import { useCallback, useMemo, useRef, useState } from 'react';
import { gooeyToast } from 'goey-toast';
import {
  eventoFaturamentoFalhou,
  eventoVendaFinalizada,
  eventoVendaSuspensa,
} from '../../domain/auditoria/eventos';
import {
  montarRetratoVenda,
  type FormaDePagamentoRetrato,
  type SuspenderOuFaturar,
} from '../../domain/venda/montarRetratoVenda';
import {
  enviarFaturarNFCe,
  type ResultadoFaturamento,
} from '../../services/faturamento/faturarNFCeMutation';
import type { NotaFiscalResposta } from '../../../shared/schemas/faturarNFCe.schema';
import { linhasAtivas, totalVenda } from '../../domain/precificacao/linha';
import { useSessionStore } from '../../stores/sessionStore';
import { abrirSessaoDeVenda, useVendaStore } from '../../stores/vendaStore';
import { useEncerrarVenda } from '../carrinho/useCarrinho';

/**
 * Orquestrador de finalização e suspensão (T008, T017, T024).
 *
 * É a única peça que compõe as quatro camadas: lê os slices do `vendaStore`,
 * monta o retrato pelo domínio puro, dispara a rede e, em sucesso, executa a
 * limpeza. Isso mora num hook — não num slice nem no domínio — porque um slice
 * precisaria conhecer os outros três para poder resetá-los, e o domínio puro
 * não pode depender de rede nem de Zustand (`research.md`, D3).
 *
 * O estado "aguardando confirmação de reenvio" é local do hook, não global:
 * nenhuma outra parte da aplicação precisa saber que há um envio pendente de
 * confirmação — é estado de UI efêmero, mesma categoria que
 * `ARCHITECTURE.md` já reserva para estado local de componente.
 */

/** `data-model.md` §4. */
export type EstadoEnvio =
  | { readonly tipo: 'ocioso' }
  | { readonly tipo: 'enviando'; readonly operacao: SuspenderOuFaturar }
  | {
      readonly tipo: 'sucesso';
      readonly operacao: SuspenderOuFaturar;
      /** `null` em `SUSPENDER`: suspender não emite documento fiscal. */
      readonly notaFiscal: NotaFiscalResposta | null;
    }
  | { readonly tipo: 'falha-negocio'; readonly mensagem: string }
  /** Aguardando confirmação manual do operador — `FR-004`/AD-038. */
  | { readonly tipo: 'falha-rede'; readonly operacao: SuspenderOuFaturar };

/**
 * Dependências que **outras features** possuem e esta só consome
 * (Dependency Inversion — `research.md`, D7). Chegam por injeção, nunca por
 * `import` do slice dono: é isso que permite testar os dois gates sem montar
 * estado de pagamento nem de validação prévia.
 *
 * Os defaults são os stubs de T029, válidos até as features 014, 008 e 012
 * fornecerem as implementações reais — nenhuma delas precisa existir para esta
 * feature ser completa e testável.
 */
export interface FinalizacaoDeps {
  /** Feature 014 — veredito favorável vigente (`FR-014`, AD-113). */
  readonly podeFinalizar?: () => boolean;
  /** Feature 008 — TEF/PIX aprovado bloqueia suspender (`FR-005`, AD-042). */
  readonly temPagamentoNaoRemovivel?: () => boolean;
  /** Feature 008 — formas já aplicadas, repassadas sem interpretar. */
  readonly formasDePagamento?: () => readonly FormaDePagamentoRetrato[];
  /** Feature 008 — condição vigente; escalar, uma por venda. */
  readonly condicaoPagamentoCodigo?: () => number;
  /** Feature 012 — vendedor selecionado, nunca o operador logado (`FR-010`). */
  readonly vendedorCodigo?: () => number;
  readonly avisar?: (mensagem: string) => void;
  /** Confirmação de desfecho bem-sucedido — toast, não texto na tela. */
  readonly notificar?: (mensagem: string) => void;
  /** Injetável para o teste da máquina de estados não tocar a rede. */
  readonly enviar?: (
    retrato: ReturnType<typeof montarRetratoVenda>,
  ) => Promise<ResultadoFaturamento>;
}

export interface ApiFinalizacaoVenda {
  readonly estado: EstadoEnvio;
  /** Bloqueado enquanto houver `falha-rede` pendente de confirmação. */
  finalizar(): Promise<void>;
  suspender(): Promise<void>;
  /** Único caminho de reenvio após `falha-rede` (`FR-004`). */
  confirmarReenvio(): Promise<void>;
  /** Fecha o desfecho corrente e volta a `ocioso`. */
  descartar(): void;
}

const AVISO_VALIDACAO_PENDENTE =
  'A venda ainda não tem validação aprovada do ERP. Revise os pagamentos antes de finalizar.';

const AVISO_SUSPENSAO_BLOQUEADA =
  'Já há pagamento aprovado que não pode ser removido: esta venda não pode mais ser suspensa.';

const ERRO_SEM_CONFIGURACAO =
  'Configuração do ponto de venda indisponível: a venda não pode ser finalizada nem suspensa.';

const AVISO_SEM_VALOR_A_FATURAR =
  'Não há valor a faturar: insira ao menos um item com valor antes de finalizar.';

const MENSAGEM_VENDA_SUSPENSA = 'Venda suspensa. O rascunho continua disponível para retomada.';

const ESTADO_INICIAL: EstadoEnvio = { tipo: 'ocioso' };

/**
 * Há pagamento aprovado por integração externa (TEF/PIX) na venda — feature
 * 008, invariante I6 (AD-030/AD-042).
 *
 * É a mesma condição que torna `removerPagamento` um no-op no slice, lida aqui
 * do estado em vez de por porta injetada porque o pagamento agora faz parte do
 * `vendaStore`. Suspender uma venda nessa situação deixaria dinheiro já
 * movimentado fora do Checkout preso a um rascunho: o estorno é operação do
 * ERP/adquirente, não do caixa.
 */
function temPagamentoIrreversivel(): boolean {
  return useVendaStore
    .getState()
    .pagamentos.some(
      (pagamento) => pagamento.integracao !== 'NENHUMA' && pagamento.status === 'APROVADO',
    );
}

export function useFinalizarOuSuspenderVenda(deps: FinalizacaoDeps = {}): ApiFinalizacaoVenda {
  const [estado, setEstado] = useState<EstadoEnvio>(ESTADO_INICIAL);
  const encerrarVenda = useEncerrarVenda();

  // Espelho do estado para os guards: `finalizar`/`suspender` são assíncronos e
  // podem ser disparados duas vezes antes de um re-render (duplo clique, ou o
  // Enter repetindo enquanto o botão ainda está no DOM). Ler `estado` da
  // closure deixaria passar o segundo disparo — e um segundo `FaturarNFCe` é
  // exatamente o que `FR-004` existe para impedir.
  const estadoRef = useRef<EstadoEnvio>(ESTADO_INICIAL);

  const aplicarEstado = useCallback((proximo: EstadoEnvio): void => {
    estadoRef.current = proximo;
    setEstado(proximo);
  }, []);

  // As dependências injetadas ficam numa ref, não nos arrays de dependência dos
  // callbacks: o call site normalmente monta o objeto `deps` inline, então cada
  // render produziria funções novas e recriaria toda a máquina — inclusive
  // `despachar`, que é o que o `DialogoConfirmarReenvio` mantém em mãos entre
  // renders. A ref é atualizada a cada render, então as chamadas sempre veem a
  // versão corrente.
  const depsRef = useRef<FinalizacaoDeps>(deps);
  depsRef.current = deps;

  /**
   * Envia o retrato recomposto **do estado corrente**.
   *
   * Recompor (em vez de guardar o payload da tentativa anterior) é o que faz o
   * `Log` do reenvio ser estritamente maior que o da tentativa que falhou: ele
   * já inclui o `FATURAMENTO_FALHOU` acrescentado no caminho de erro
   * (`contracts/auditoria-events.md`).
   */
  const despachar = useCallback(
    async (operacao: SuspenderOuFaturar): Promise<void> => {
      const registro = useSessionStore.getState().registro;
      if (registro === null) {
        aplicarEstado({ tipo: 'falha-negocio', mensagem: ERRO_SEM_CONFIGURACAO });
        return;
      }

      const venda = useVendaStore.getState();
      const sessao = registro.SessaoUsuario;
      const injetadas = depsRef.current;

      // A parte de pagamento do retrato vem pronta da feature 008: condição,
      // formas aprovadas e o rateio do desconto de capa (`erp-pagamento-api.md`
      // §3). Montada **uma vez** por despacho porque o rateio é calculado na
      // montagem — chamá-la por campo repetiria o cálculo e, pior, poderia
      // produzir dois rateios diferentes se o carrinho mudasse no meio.
      // As portas injetadas continuam tendo precedência: é o que mantém o teste
      // da máquina de estados independente do slice de pagamento.
      const pagamentosDaVenda = venda.montarPagamentosParaPayload();

      // Stub de T029 até a feature 012 selecionar o vendedor: usa o vendedor do
      // PDV publicado no bootstrap quando ele existe. `VendedorCodigo` ainda não
      // está no schema Zod (é campo da 012), então é lido com narrow explícito —
      // nunca com type assertion.
      const vendedorDoBootstrap = sessao['VendedorCodigo'];
      const vendedorCodigo =
        injetadas.vendedorCodigo?.() ??
        (typeof vendedorDoBootstrap === 'number' ? vendedorDoBootstrap : 0);

      const retrato = montarRetratoVenda(
        {
          linhas: venda.linhas,
          identidade: venda.identidadeVenda,
          cadSerieNFCe: sessao.CadSerieNFCe,
          // O cliente **da venda**, com o default do PDV só como fallback
          // (AD-032). Até aqui o retrato mandava `ClienteDefaultCodigo` sempre:
          // este arquivo é da feature 004, escrita antes de existir slice de
          // cliente, e a 005 não voltou para religar o campo. O efeito era uma
          // NFCe emitida para o consumidor padrão mesmo com o operador tendo
          // identificado outro cliente — silencioso, visível só na nota. Achado
          // pelo E2E da importação de DAV, que exige o cliente do documento no
          // faturamento (`FR-007` da 006), mas o defeito era da 005.
          clienteCodigo: venda.clienteAtual?.codigoCliente ?? sessao.ClienteDefaultCodigo,
          vendedorCodigo,
          condicaoPagamentoCodigo:
            injetadas.condicaoPagamentoCodigo?.() ?? pagamentosDaVenda.CondicaoPagamentoCodigo,
          eventos: venda.eventos,
        },
        operacao,
        injetadas.formasDePagamento?.() ?? pagamentosDaVenda.FormasDePagamento,
        pagamentosDaVenda.rateioDescontoCapa,
      );

      aplicarEstado({ tipo: 'enviando', operacao });

      const enviar = injetadas.enviar;
      const resultado = await (enviar === undefined ? enviarFaturarNFCe(retrato) : enviar(retrato));

      switch (resultado.estado) {
        case 'sucesso':
          // Limpeza na mesma transação de UI, e só aqui (`FR-012`): carrinho +
          // cache de produto (`useEncerrarVenda`, feature 003), pagamento
          // (feature 008), auditoria (feature 001) e identidade da venda
          // (feature 004).
          //
          // `limparPagamentos()` **faltava** aqui, e a ausência era visível:
          // com o carrinho zerado e o desconto de capa ainda de pé, o bloco de
          // totais passava a calcular `0 − desconto` e exibia "Total a pagar"
          // **negativo** logo depois de finalizar (correção do usuário,
          // 2026-09-04). Pior que o sintoma era o silencioso: condição, formas
          // aplicadas e vales de devolução sobreviviam para a venda seguinte.
          encerrarVenda();
          useVendaStore.getState().limparPagamentos();
          useVendaStore.getState().descartarAuditoria();
          useVendaStore.getState().resetarIdentidadeVenda();
          // Abre a próxima sessão no mesmo ponto do descarte. Sem isto o
          // operador digitaria o primeiro item da venda seguinte num histórico
          // vazio, e o `Log` daquela NFCe chegaria ao ERP sem `VENDA_INICIADA`
          // (`FR-002` da feature 001) — foi exatamente o que o E2E desta
          // feature flagrou ao fechar o item 38 de `PENDENCIES.md`.
          abrirSessaoDeVenda('NOVA');
          // Suspender não abre modal nenhum — o desfecho é comunicado por
          // toast (pedido do usuário, 2026-09-02). Texto fixo na tela ficaria
          // preso ao lado do botão até o operador mexer em outra coisa.
          if (operacao === 'SUSPENDER') {
            const notificar = injetadas.notificar;
            if (notificar === undefined) {
              gooeyToast.success(MENSAGEM_VENDA_SUSPENSA);
            } else {
              notificar(MENSAGEM_VENDA_SUSPENSA);
            }
          }
          aplicarEstado({ tipo: 'sucesso', operacao, notaFiscal: resultado.notaFiscal });
          return;

        case 'falha-rede':
          // O histórico **não** é descartado: os eventos da tentativa perdida
          // precisam chegar ao ERP no reenvio (`FR-006` da 001, AUDIT-09).
          useVendaStore.getState().registrarEventoAuditoria(eventoFaturamentoFalhou({ operacao }));
          aplicarEstado({ tipo: 'falha-rede', operacao });
          return;

        case 'falha-negocio':
          // Sem trava de confirmação: o ERP respondeu recusando, então a
          // primeira tentativa provadamente não gerou NFCe (`research.md`, D2).
          aplicarEstado({ tipo: 'falha-negocio', mensagem: resultado.mensagem });
          return;
      }
    },
    [aplicarEstado, encerrarVenda],
  );

  const iniciar = useCallback(
    async (operacao: SuspenderOuFaturar): Promise<void> => {
      const atual = estadoRef.current;
      const injetadas = depsRef.current;
      const avisar = (mensagem: string): void => {
        const aviso = injetadas.avisar;
        if (aviso === undefined) {
          gooeyToast.warning(mensagem);
          return;
        }
        aviso(mensagem);
      };

      // Envio em curso, ou falha de rede aguardando confirmação: nenhum novo
      // disparo passa por aqui — o único caminho a partir de `falha-rede` é
      // `confirmarReenvio` (`FR-004`, AD-038).
      if (atual.tipo === 'enviando' || atual.tipo === 'falha-rede') {
        return;
      }

      // Não há NFCe a emitir sem valor. O botão já nasce desabilitado nesse
      // estado; a guarda aqui cobre o acionamento por teclado ou por código,
      // que não passa pelo `disabled` do DOM.
      if (operacao === 'FATURAR') {
        const { linhas } = useVendaStore.getState();
        if (linhasAtivas(linhas).length === 0 || totalVenda(linhas) <= 0) {
          avisar(AVISO_SEM_VALOR_A_FATURAR);
          return;
        }
      }

      // Gate da validação prévia: só `FATURAR` (`FR-014`); `SUSPENDER` não emite
      // documento fiscal e não passa por ele (`FR-016`). Bloqueado ⇒ nenhuma
      // chamada de rede e nenhuma transição de estado (AD-113).
      if (operacao === 'FATURAR' && (injetadas.podeFinalizar?.() ?? true) === false) {
        avisar(AVISO_VALIDACAO_PENDENTE);
        return;
      }

      // Bloqueio de suspensão por pagamento não removível — mesma regra de
      // `CART-09` (`FR-005`/`FR-006`, AD-030/AD-042). Nunca se aplica a
      // `FATURAR`: finalizar com pagamento aprovado é o caminho normal.
      if (
        operacao === 'SUSPENDER' &&
        (injetadas.temPagamentoNaoRemovivel?.() ?? temPagamentoIrreversivel())
      ) {
        avisar(AVISO_SUSPENSAO_BLOQUEADA);
        return;
      }

      // Evento terminal **antes** do envio: é o que faz o `Log` recebido pelo
      // ERP terminar em `VENDA_FINALIZADA`/`VENDA_SUSPENSA`
      // (`specs/001-auditoria-acoes-operador/quickstart.md`). Registrá-lo depois
      // da resposta seria registrá-lo no histórico que acabou de ser descartado.
      useVendaStore
        .getState()
        .registrarEventoAuditoria(
          operacao === 'FATURAR' ? eventoVendaFinalizada() : eventoVendaSuspensa(),
        );

      await despachar(operacao);
    },
    [despachar],
  );

  const confirmarReenvio = useCallback(async (): Promise<void> => {
    const atual = estadoRef.current;
    if (atual.tipo !== 'falha-rede') {
      return;
    }
    await despachar(atual.operacao);
  }, [despachar]);

  return useMemo(
    () => ({
      estado,
      finalizar: () => iniciar('FATURAR'),
      suspender: () => iniciar('SUSPENDER'),
      confirmarReenvio,
      descartar: () => {
        aplicarEstado(ESTADO_INICIAL);
      },
    }),
    [aplicarEstado, confirmarReenvio, estado, iniciar],
  );
}
