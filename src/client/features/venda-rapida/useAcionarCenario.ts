import { useCallback } from 'react';
import { gooeyToast } from 'goey-toast';
import { eventoVendaRapidaAcionada } from '../../domain/auditoria/eventos';
import type { CondicaoPagamento } from '../../domain/pagamento/formaPagamento';
import { ZERO_CENTAVOS, type Centavos } from '../../domain/precificacao/dinheiro';
import { buscarAtalho } from '../../domain/vendaRapida/projetarAtalhos';
import type {
  AtalhoVendaRapida,
  ListaAtalhos,
  MotivoRecusa,
  ResultadoAcionamento,
  TeclaAtalho,
} from '../../domain/vendaRapida/tipos';
import { useVendaStore } from '../../stores/vendaStore';
import { useFinalizacaoVenda } from '../finalizacao-suspensao/AcoesFinaisVenda';
import { aplicarFormaComIntegracao } from './aplicarFormaComIntegracao';
import {
  AVISO_ATALHO_SEM_ITENS,
  AVISO_ATALHO_SEM_SALDO,
  AVISO_PAGAMENTO_JA_INICIADO,
} from './avisosVendaRapida';
import { useAtalhosVendaRapida, useCatalogoDeCondicoes } from './useAtalhosVendaRapida';

/**
 * Comando de acionamento da venda rápida (feature 013, T013 + T019).
 *
 * **Responsabilidade única: orquestrar o gesto.** Toda a matemática de dinheiro
 * e toda a regra de finalização chegam por porta injetada
 * (`contracts/venda-rapida-domain-api.md` §4) — este módulo não calcula valor,
 * não decide o que valida uma NFCe e não conhece PIX, TEF nem layout. O atalho
 * substitui o **gesto** do operador, jamais as regras.
 *
 * O fluxo é o G1–P7 de `data-model.md` §3, na ordem exata.
 */

/**
 * Portas injetadas. A 013 define a interface; 008, 004 e 001 fornecem as
 * implementações (Dependency Inversion, Constitution II).
 *
 * `resolverIntegracao` **não** está aqui, embora o contrato a liste: desde a
 * correção C1 de `/speckit-analyze` o acionamento não decide nada com base no
 * veredito de integração — quem espera o desfecho é `aplicarForma`, e perguntar
 * o roteamento aqui daria a esta camada um insumo que nenhuma das suas decisões
 * usa.
 */
export interface AcionarCenarioDeps {
  /** 008 — saldo em aberto do instante, em `Centavos` inteiros. */
  obterSaldoEmAberto(): Centavos;
  /** 003/008 — há item lançado na venda. */
  vendaTemItens(): boolean;
  /** 008 — condição vigente da venda, ou `null` se ainda não há. */
  condicaoDaVenda(): number | null;
  /**
   * 008 — há forma de pagamento **viva** na venda (nem recusada, nem excluída).
   *
   * Leitura separada da condição, e não derivada dela: `importarFormasDePagamento`
   * (006/011) insere as formas de um DAV/rascunho **sem** tocar em
   * `condicaoSelecionada`, então uma venda retomada já paga tem pagamento sem
   * condição. Olhar só a condição deixaria o atalho lançar por cima de um valor
   * que o cliente já pagou e que está gravado no documento dentro do ERP.
   */
  vendaTemFormaAplicada(): boolean;
  /** 008 — garante que a venda está na etapa de pagamento (`FR-019`). */
  irParaEtapaPagamento(): void;
  /** 008 — seleciona a condição do cenário. */
  selecionarCondicao(codigo: number): void;
  /**
   * 008 — aplica a forma pelo valor dado e resolve **depois** de o pagamento
   * estar de fato aplicado, inclusive aguardando confirmação de TEF/PIX.
   * `false` = nada entrou na venda.
   */
  aplicarForma(codigo: number, valor: Centavos): Promise<boolean>;
  /** 004 — finalização completa, com todas as validações daquela feature. */
  finalizarVenda(): Promise<void>;
  /** 001 — trilha de auditoria. */
  registrarEvento(atalho: AtalhoVendaRapida, valor: Centavos, finalizou: boolean): void;
  /** 008 — guard de acionamento único (I9), compartilhado tecla ↔ clique. */
  acionamentoEmAndamento(): boolean;
  marcarAcionamento(emAndamento: boolean): void;
  /**
   * Aviso ao operador. Injetado para o comando não importar a lib de toast —
   * mesmo padrão de `PagamentoDeps.avisar` (008).
   *
   * `FR-009` exige que uma recusa **informe**: um atalho que não faz nada e não
   * diz nada é indistinguível de uma tecla que o PDV não escuta, e o operador
   * fica batendo nela com o cliente esperando.
   */
  avisar(mensagem: string): void;
}

/**
 * A frase de cada recusa, ou `null` para as que não devem falar.
 *
 * `ACIONAMENTO_EM_ANDAMENTO` cala porque o primeiro acionamento **está
 * acontecendo**: avisar no segundo toque encheria a tela de alertas durante uma
 * espera de TEF/PIX que pode passar de um minuto.
 *
 * `LANCAMENTO_FALHOU` cala porque quem recusou já falou — o `pagamentoSlice`
 * exibe o motivo exato (forma fora da condição, saldo coberto, veredito da 014,
 * ERP indisponível), e um segundo toast genérico por cima só apagaria o
 * específico.
 *
 * `ATALHO_INEXISTENTE` cala porque o mapa central só registra teclas que estão
 * na `ListaAtalhos`: para chegar aqui, ou a lista mudou no meio do gesto, ou o
 * chamador é código. Nos dois casos não há nada que o operador possa fazer.
 */
const AVISO_POR_MOTIVO: Readonly<Record<MotivoRecusa, string | null>> = {
  ACIONAMENTO_EM_ANDAMENTO: null,
  ATALHO_INEXISTENTE: null,
  PLATAFORMA_NAO_SUPORTADA: null,
  LANCAMENTO_FALHOU: null,
  PAGAMENTO_JA_INICIADO: AVISO_PAGAMENTO_JA_INICIADO,
  SEM_ITENS: AVISO_ATALHO_SEM_ITENS,
  SEM_SALDO_EM_ABERTO: AVISO_ATALHO_SEM_SALDO,
};

/** Recusa com a frase certa, num lugar só — a tabela acima decide se fala. */
function recusar(deps: AcionarCenarioDeps, motivo: MotivoRecusa): ResultadoAcionamento {
  const aviso = AVISO_POR_MOTIVO[motivo];
  if (aviso !== null) {
    deps.avisar(aviso);
  }
  return { tipo: 'RECUSADO', motivo };
}

/**
 * Executa G1–P7 e **nunca lança** para o chamador: um atalho que derruba a tela
 * do caixa é pior do que um atalho que recusa e explica.
 *
 * Pode levar de instantâneo a dezenas de segundos quando a forma exige TEF/PIX
 * — o chamador não deve tratá-lo como síncrono.
 */
export async function acionarCenario(
  tecla: TeclaAtalho,
  atalhos: ListaAtalhos,
  deps: AcionarCenarioDeps,
): Promise<ResultadoAcionamento> {
  // G1 — um acionamento por vez (I9). O guard vive no slice de pagamento, então
  // a tecla e o clique na faixa disputam o **mesmo** booleano.
  if (deps.acionamentoEmAndamento()) {
    return recusar(deps, 'ACIONAMENTO_EM_ANDAMENTO');
  }

  // G2 — `buscarAtalho` é a fonte única. No mobile a lista já vem vazia (I10),
  // então a resposta ali também é `ATALHO_INEXISTENTE`; `PLATAFORMA_NAO_SUPORTADA`
  // permanece no tipo por completude do contrato, sem caminho que o produza.
  const atalho = buscarAtalho(atalhos, tecla);
  if (atalho === undefined) {
    return recusar(deps, 'ATALHO_INEXISTENTE');
  }

  // G3/G4/G5 — recusas que **não tocam na venda** (`FR-009`, I8).
  if (!deps.vendaTemItens()) {
    return recusar(deps, 'SEM_ITENS');
  }

  // G5 — a venda ainda não começou a ser paga por **outro** par (AD-174,
  // decisão do usuário em 2026-09-05).
  //
  // O atalho carrega um par (condição, forma) e cada venda aceita uma condição
  // só. Sobre uma venda que já começou a ser paga por outra condição, a única
  // alternativa a esta recusa seria reconciliar par a par — e errar essa
  // reconciliação lança o pagamento na condição errada, em silêncio. Recusar é
  // o desfecho barato; o outro só aparece na conferência fiscal.
  //
  // **Duas checagens, não uma.** Qualquer forma viva na venda bloqueia, mesmo
  // sob a mesma condição: é o que impede o atalho de dividir o pagamento e de
  // lançar por cima de um documento retomado já pago. A condição, por sua vez,
  // só bloqueia quando é **outra** — a condição igual é o caso de um atalho que
  // falhou depois do P3 (TEF recusado, veredito da 014) e está sendo repetido
  // pelo operador. Ali não há ambiguidade nenhuma: é o mesmo par, e travá-lo
  // faria o próprio atalho envenenar a sua retentativa, exigindo um "Limpar"
  // para desfazer um estado que o operador nunca escolheu.
  const condicaoDaVenda = deps.condicaoDaVenda();
  const conflitaComOutroPar =
    deps.vendaTemFormaAplicada() ||
    (condicaoDaVenda !== null && condicaoDaVenda !== atalho.condicaoCodigo);

  // **Vem antes do saldo** de propósito: as duas recusas coincidem numa venda
  // já quitada, e das duas frases esta é a única que nomeia a saída ("Limpar").
  // Dizer "não há saldo em aberto" a quem acabou de escolher a condição errada
  // descreveria o sintoma e esconderia o gesto que resolve.
  if (conflitaComOutroPar) {
    return recusar(deps, 'PAGAMENTO_JA_INICIADO');
  }

  const saldoEmAberto = deps.obterSaldoEmAberto();
  if (saldoEmAberto <= ZERO_CENTAVOS) {
    return recusar(deps, 'SEM_SALDO_EM_ABERTO');
  }

  // P1 — a partir daqui o guard está ligado e **precisa** ser desligado em
  // qualquer saída, inclusive por exceção: daí o `try/finally`.
  deps.marcarAcionamento(true);
  try {
    // P2 — `FR-019`: o atalho vale durante toda a venda, então pode chegar com o
    // operador ainda no carrinho.
    deps.irParaEtapaPagamento();

    // P3 — condição do cenário.
    deps.selecionarCondicao(atalho.condicaoCodigo);

    // P4 — **um único** `await`, pelo saldo em aberto integral em `Centavos`
    // (`FR-008`, I6). O valor é o retorno de `obterSaldoEmAberto` repassado sem
    // transformação: esta feature não soma, não divide e não arredonda dinheiro
    // (Constitution V).
    let lancou: boolean;
    try {
      lancou = await deps.aplicarForma(atalho.formaCodigo, saldoEmAberto);
    } catch (erro) {
      // Rejeição da porta é o mesmo desfecho de uma recusa: nada foi lançado.
      // Registrar no console, e não ao operador, porque quem recusa já avisou
      // (o slice da 008 exibe o motivo).
      console.error('[venda-rápida] a aplicação da forma do cenário rejeitou.', erro);
      lancou = false;
    }

    // Falha em P4 — inclusive TEF/PIX recusado e recusa do gate `ValidarNFCe`
    // da 014 — aborta antes de P5, preserva o estado anterior da venda e **não**
    // gera evento de auditoria (`FR-011`/`FR-022`, I8, I12).
    if (!lancou) {
      return recusar(deps, 'LANCAMENTO_FALHOU');
    }

    // O valor efetivamente lançado é o saldo que existia antes de P4: o slice
    // aplica exatamente o que recebeu, e reler o saldo agora devolveria o que
    // **falta**, não o que entrou.
    const valorLancado = saldoEmAberto;

    // P5 — finalização automática (`FR-010`). As duas condições são
    // obrigatórias: sem saldo zerado a venda **nunca** é finalizada (I7), nem
    // quando o cenário manda encerrar (comportamento anômalo do lançamento).
    const saldoRestante = deps.obterSaldoEmAberto();
    const finalizacaoIniciada = saldoRestante <= ZERO_CENTAVOS && atalho.encerraOperacao;
    if (finalizacaoIniciada) {
      try {
        await deps.finalizarVenda();
      } catch (erro) {
        // A finalização é da 004 e trata os próprios desfechos; uma rejeição
        // aqui é bug de composição. O pagamento já entrou, então o evento de
        // auditoria continua reportando a finalização que o atalho disparou.
        console.error('[venda-rápida] a finalização automática rejeitou.', erro);
      }
    }

    // P6 — **depois** de P5, para `finalizacaoAutomatica` refletir o desfecho
    // real (correção F3 de `/speckit-analyze`). Exatamente um evento por
    // acionamento que alterou a venda (I12).
    deps.registrarEvento(atalho, valorLancado, finalizacaoIniciada);

    return { tipo: 'LANCADO', valorLancado, finalizacaoIniciada };
  } finally {
    // P7 — sempre, inclusive em falha.
    deps.marcarAcionamento(false);
  }
}

/**
 * Composição real das portas (`vendaStore` + máquina de finalização da 004).
 *
 * Exportada para o teste de integração poder montar o comando sobre o store
 * real trocando só uma porta.
 */
export function criarDepsPadrao(
  condicoes: readonly CondicaoPagamento[],
  finalizarVenda: () => Promise<void>,
): AcionarCenarioDeps {
  return {
    obterSaldoEmAberto: () => useVendaStore.getState().saldo().saldoRestante,
    // Linha cancelada **não** conta aqui: o atalho lança dinheiro, e o que
    // importa é existir valor a cobrar — que G4 confirma logo em seguida.
    vendaTemItens: () => useVendaStore.getState().linhas.some((linha) => !linha.cancelada),
    condicaoDaVenda: () => useVendaStore.getState().condicaoSelecionada?.codigo ?? null,
    // `RECUSADO`/`EXCLUIDO` ficam de fora: já saíram do fluxo e não deveriam
    // travar um atalho — a mesma exclusão que `podeAplicarForma` faz.
    vendaTemFormaAplicada: () =>
      useVendaStore
        .getState()
        .pagamentos.some(
          (pagamento) => pagamento.status !== 'RECUSADO' && pagamento.status !== 'EXCLUIDO',
        ),
    irParaEtapaPagamento: () => {
      /**
       * No layout desktop — o único onde a venda rápida existe (`FR-020`) — o
       * cartão "Pagamento e totais" está sempre montado ao lado do carrinho:
       * não há etapa a navegar, e a exigência de `FR-019` é satisfeita pela
       * própria estrutura da tela. A porta permanece no contrato porque o
       * `MobileWizard` da feature 007 vai ter etapas de verdade, e é ela que a
       * 007 preencherá sem tocar no comando.
       */
    },
    selecionarCondicao: (codigo) => {
      const condicao = condicoes.find((candidata) => candidata.codigo === codigo);
      if (condicao === undefined) {
        // Projeção e catálogo saíram do mesmo payload, então isto não deveria
        // acontecer. Se acontecer, seguir sem selecionar é o caminho seguro:
        // `aplicarForma` recusa a forma fora da condição logo adiante.
        return;
      }
      useVendaStore.getState().selecionarCondicao(condicao);
    },
    aplicarForma: (codigo, valor) => aplicarFormaComIntegracao(useVendaStore, codigo, valor),
    finalizarVenda,
    registrarEvento: (atalho, valor, finalizou) => {
      useVendaStore.getState().registrarEventoAuditoria(
        eventoVendaRapidaAcionada({
          tecla: atalho.tecla,
          cenarioNome: atalho.nome,
          condicaoCodigo: atalho.condicaoCodigo,
          formaCodigo: atalho.formaCodigo,
          valorLancado: valor,
          finalizacaoAutomatica: finalizou,
        }),
      );
    },
    acionamentoEmAndamento: () => useVendaStore.getState().acionamentoEmAndamento,
    marcarAcionamento: (emAndamento) => {
      useVendaStore.getState().marcarAcionamentoEmAndamento(emAndamento);
    },
    avisar: (mensagem) => {
      gooeyToast.warning(mensagem);
    },
  };
}

export interface ApiVendaRapida {
  readonly atalhos: ListaAtalhos;
  acionar(tecla: TeclaAtalho): Promise<ResultadoAcionamento>;
}

/**
 * O comando pronto para a tela: a lista de atalhos da sessão e a função que os
 * aciona — a **mesma** para a tecla e para o clique (`US3`, cenário 3).
 */
export function useAcionarCenario(): ApiVendaRapida {
  const atalhos = useAtalhosVendaRapida();
  const condicoes = useCatalogoDeCondicoes();
  const { finalizar } = useFinalizacaoVenda();

  const acionar = useCallback(
    (tecla: TeclaAtalho) => acionarCenario(tecla, atalhos, criarDepsPadrao(condicoes, finalizar)),
    [atalhos, condicoes, finalizar],
  );

  return { atalhos, acionar };
}
