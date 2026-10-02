import { AlertTriangle, Check, CreditCard, Refresh, X } from 'reicon-react';
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { notificar } from '@/lib/notificar';
import { Button } from '@/components/ui/button';
import { acaoBloqueavel, atributosDeBloqueio, type MotivoBloqueio } from '@/lib/bloqueio';
import { useFocoDeModal } from '@/lib/useFocoDeModal';
import type { ClienteVenda } from '../../../domain/cliente/clienteVenda';
import type { MeioPagtoNFe } from '../../../domain/pagamento/formaPagamento';
import type { DadosTEF } from '../../../domain/pagamento/saldoPagamento';
import { formatarCentavos, type Centavos } from '../../../domain/precificacao/dinheiro';
import type { CobrancaTef } from '../../../domain/tef/cobrancaTef';
import {
  interpretarStatusCobrancaTef,
  MENSAGEM_POR_MOTIVO_FALHA_TEF,
} from '../../../domain/tef/interpretarStatusTef';
import type { PagadorTef } from '../../../domain/tef/pagadorTef';
import { parcelasDoTef } from '../../../domain/tef/parcelasDoTef';
import {
  ErroTefSemUsuarioGam,
  exigirPagadorTef,
  useCriarCardTef,
  useStatusTef,
  type TefQueriesDeps,
} from '../../../services/tef/tefQueries';
import { DialogoConfirmacaoDestrutiva } from '../DialogoConfirmacaoDestrutiva';
import {
  AVISO_TRANSACAO_EM_VOO,
  CHAMADA_TEF_NAO_E_CANCELADO,
  DESTAQUE_TEF_SEGUE_NA_MAQUININHA,
  MOTIVO_JANELA_TEF_TRAVADA,
} from './avisosTef';
import {
  BadgeTef,
  BlocoValorTef,
  DetalhesTransacaoTef,
  LinhaDetalheTef,
  MolduraJanelaTef,
} from './molduraTef';

/**
 * Janela de cobrança no TEF (T026, `contracts/tef-domain-api.md` §3,
 * `data-model.md` §4.1) — réplica dos frames "PDV Online Web - Modal TEF"
 * (`Y0ka3` → modal `uHAyW`, aguardando) e "Modal TEF Aprovado" (`xWrzX` →
 * `A9MNZI`), lidos pelo MCP do Pencil em 2026-10-02.
 *
 * Nó a nó, aguardando: cartão de 480px, raio 24, hairline; cabeçalho `H4DCf`
 * de 78px com o disco `$info-soft` de 42px e o ícone `credit-card` de 20px em
 * `$cb-blue` (o `CreditCard` do reicon, AD-201), "Pagamento no TEF" (20/600) e
 * "Operação em andamento" (13/500); corpo com 32/24 de folga e `gap: 24`, com o
 * anel `xObO3` de 96px (traço 6, 270° de arco, `$cb-blue`) ao redor do mesmo
 * ícone em 40px, a badge `hEB6G` "Processando" em `$info-soft`, "Aguardando
 * retorno do TEF" (18/600), a instrução `ELWs2` (13/400, centralizada), o bloco
 * escuro `SJmhL` "Valor a cobrar" (Geist Mono 32/600) e o skeleton `CDhv3`
 * "Detalhes da transação"; rodapé `Ttsy4` de 60px com o botão pílula `mz2gp`.
 *
 * Aprovado (`A9MNZI`): disco do cabeçalho em `$success-soft` com `check`,
 * "Pagamento aprovado" / "Transação concluída com sucesso" (`$success-ink`);
 * disco de 96px com `check` de 56px no lugar do anel; badge "Aprovado"; "Valor
 * pago"; as linhas NSU / Autorização / Bandeira (`I0iWy`, `HGR9S`, `ean78`) no
 * lugar do skeleton; botão "Fechar" `xpon7` em `$success`.
 *
 * **Três desvios conscientes do `.pen`:**
 *
 * 1. O rodapé diz **"Desistir da operação"**, não "Cancelar operação"
 *    (`research.md` D12): o Checkout não cancela a transação em voo — a API não
 *    expõe isso —, e um botão que promete cancelar e não cancela é o pior falso
 *    positivo num caixa. Mesma decisão do usuário já aplicada ao PIX.
 * 2. O cabeçalho tem um `X`, que o desenho não tem: travado (com motivo)
 *    enquanto não aprova, e o gesto óbvio de saída depois. Mesmo arranjo do
 *    `ModalPix`.
 * 3. NSU e autorização saem em Geist Mono, não Inter como no nó: são códigos, e
 *    a regra de fontes do produto põe todo valor tabular em mono (`CLAUDE.md`).
 *
 * **Estados sem nó** (item 66 de `PENDENCIES.md`): "enviando para a
 * maquininha" usa o próprio layout de espera com o título trocado, e o erro de
 * criação troca o anel por um painel de alerta — a moldura não muda.
 *
 * ---
 *
 * ### Comportamento (`research.md` D10–D13)
 *
 * - A cobrança é criada **uma vez por montagem** (`criacaoIniciada`, T2): duas
 *   chamadas seriam duas cobranças reais na maquininha.
 * - `ConsultarStatusCard` a cada 10s. Só `CNC` aprova, e `onAprovado` é chamado
 *   no tick do `CNC` (T3), antes de a janela trocar de tela — o saldo da venda
 *   não pode mentir pelos 10s do estado aprovado.
 * - Desistência confirmada e falha terminal convergem num único `abandonar()`.
 *   **Nenhum** caminho chama cancelamento (T4): o aviso diz para conferir a
 *   maquininha.
 * - Sem `UsuarioGAM` ou sem cliente, a janela abandona **antes** da rede, com o
 *   motivo explicado (`FR-014`).
 *
 * Não importa `vendaStore` (Constitution II): tudo chega por prop.
 */
export interface ModalTefProps {
  /** `PagamentoAplicado.formaCodigo` — vira `FPgCod`. */
  readonly formaCodigo: number;
  /** Decide as parcelas: só o crédito parcela (`parcelasDoTef`). */
  readonly meioPagtoNFe: MeioPagtoNFe;
  /** `PagamentoAplicado.valorAplicado`. */
  readonly valor: Centavos;
  /** `condicaoSelecionada.prazo` — o `CondicaoPrazo` (= `PraNumPar`). */
  readonly prazoDaCondicao: number;
  readonly clienteAtual: ClienteVenda | null;
  /** O `GetSessao` publicou `UsuarioGAM` não vazio. O valor em si fica no BFF. */
  readonly usuarioGamPresente: boolean;
  /** → `confirmarPagamentoIntegrado(idPagamento, { dadosTEF })`. */
  readonly onAprovado: (dados: DadosTEF) => void;
  /** → `recusarPagamentoIntegrado(idPagamento, motivo)`. */
  readonly onAbandonado: (motivo: string) => void;
  readonly onFechar: () => void;
  /** Injetável só para teste. */
  readonly deps?: TefQueriesDeps;
  /** Só teste; o padrão é `MS_FECHAMENTO_APOS_APROVACAO_TEF`. */
  readonly atrasoFechamentoMs?: number;
}

/** Motivos registrados em `PAGAMENTO_RECUSADO` — códigos, não frases. */
export const MOTIVO_TEF_DESISTENCIA = 'FECHADO_PELO_OPERADOR';
export const MOTIVO_TEF_SEM_USUARIO_GAM = 'SEM_USUARIO_GAM';
export const MOTIVO_TEF_SEM_CLIENTE = 'SEM_CLIENTE';

/** Mesmo intervalo do PIX, pedido pelo usuário (`research.md` D13). */
export const MS_FECHAMENTO_APOS_APROVACAO_TEF = 10_000;

const DEPS_VAZIAS: TefQueriesDeps = {};

type PreCondicao =
  | { readonly ok: true; readonly pagador: PagadorTef }
  | { readonly ok: false; readonly motivo: string; readonly mensagem: string };

/** Avaliada **uma vez**, na montagem: a venda não troca de cliente com pagamento pendente (AD-209). */
function avaliarPreCondicao(
  cliente: ClienteVenda | null,
  usuarioGamPresente: boolean,
): PreCondicao {
  try {
    return { ok: true, pagador: exigirPagadorTef(cliente, usuarioGamPresente) };
  } catch (causa) {
    return {
      ok: false,
      motivo:
        causa instanceof ErroTefSemUsuarioGam ? MOTIVO_TEF_SEM_USUARIO_GAM : MOTIVO_TEF_SEM_CLIENTE,
      mensagem: causa instanceof Error ? causa.message : 'Não foi possível cobrar no TEF.',
    };
  }
}

export function ModalTef({
  formaCodigo,
  meioPagtoNFe,
  valor,
  prazoDaCondicao,
  clienteAtual,
  usuarioGamPresente,
  onAprovado,
  onAbandonado,
  onFechar,
  deps = DEPS_VAZIAS,
  atrasoFechamentoMs = MS_FECHAMENTO_APOS_APROVACAO_TEF,
}: ModalTefProps): ReactElement | null {
  const [preCondicao] = useState(() => avaliarPreCondicao(clienteAtual, usuarioGamPresente));
  const [cobranca, setCobranca] = useState<CobrancaTef | null>(null);
  /** Desliga o polling na **mesma** renderização que processa o desfecho (J3). */
  const [resolvido, setResolvido] = useState(false);
  /** O que foi aprovado — preenchido no tick do `CNC`, e é o que a tela mostra. */
  const [aprovado, setAprovado] = useState<DadosTEF | null>(null);
  const [confirmandoDesistencia, setConfirmandoDesistencia] = useState(false);
  const janelaRef = useFocoDeModal<HTMLDivElement>(true);

  /** Um desfecho por montagem — a auditoria não pode registrar dois eventos. */
  const desfechoEmitido = useRef(false);
  /** Uma criação por montagem — o `StrictMode` executa o efeito duas vezes (T2). */
  const criacaoIniciada = useRef(false);

  const { criar, status, erro } = useCriarCardTef(deps);
  const { consulta } = useStatusTef(
    cobranca?.paymentIdentifier ?? '',
    cobranca !== null && !resolvido,
    deps,
  );

  const emErro = status === 'erro' && cobranca === null;
  const criando = cobranca === null && !emErro;

  const criarCobranca = useCallback((): void => {
    if (!preCondicao.ok) {
      return;
    }
    void criar({
      formaCodigo,
      valor,
      parcelas: parcelasDoTef(meioPagtoNFe, prazoDaCondicao),
      pagador: preCondicao.pagador,
    })
      .then(setCobranca)
      .catch(() => {
        // O motivo já está em `erro` e vira o painel; engolir aqui impede o
        // `unhandledrejection` — o desfecho de uma criação recusada é tela.
        notificar.erro('Não foi possível criar a cobrança no TEF.');
      });
  }, [criar, formaCodigo, valor, meioPagtoNFe, prazoDaCondicao, preCondicao]);

  /** Desistência confirmada e falha terminal: **um** caminho de código. */
  const abandonar = useCallback(
    (motivo: string, mensagem: string): void => {
      if (desfechoEmitido.current) {
        return;
      }
      desfechoEmitido.current = true;
      setResolvido(true);
      notificar.aviso(mensagem);
      onAbandonado(motivo);
      onFechar();
    },
    [onAbandonado, onFechar],
  );

  // `FR-014`: sem `UsuarioGAM` (ou sem cliente) a cobrança é recusada antes de
  // qualquer rede. O pagamento pendente sai da venda pelo mesmo caminho da
  // desistência — deixá-lo travaria a venda num `PENDENTE_INTEGRACAO` órfão.
  useEffect(() => {
    if (!preCondicao.ok) {
      abandonar(preCondicao.motivo, preCondicao.mensagem);
    }
  }, [preCondicao, abandonar]);

  useEffect(() => {
    if (!preCondicao.ok || criacaoIniciada.current) {
      return;
    }
    criacaoIniciada.current = true;
    criarCobranca();
  }, [preCondicao, criarCobranca]);

  // Cada consulta passa por `interpretarStatusCobrancaTef`; `PENDENTE` (inclusive
  // o literal desconhecido, T1) só espera o próximo tick.
  useEffect(() => {
    if (consulta === null || cobranca === null || desfechoEmitido.current) {
      return;
    }
    const resultado = interpretarStatusCobrancaTef(consulta.status);
    if (resultado.situacao === 'PENDENTE') {
      return;
    }
    if (resultado.situacao === 'APROVADO') {
      desfechoEmitido.current = true;
      setResolvido(true);
      const dados: DadosTEF = {
        pagId: cobranca.paymentIdentifier,
        bandeira: consulta.bandeira,
        nsu: consulta.nsu,
        autorizacao: consulta.autorizacao,
        tipoIntegracao: '1',
      };
      setAprovado(dados);
      // Na hora, não depois dos 10s: o saldo da venda abate agora (T3).
      onAprovado(dados);
      return;
    }
    abandonar(resultado.motivo, MENSAGEM_POR_MOTIVO_FALHA_TEF[resultado.motivo]);
  }, [consulta, cobranca, onAprovado, abandonar]);

  /**
   * Fechamento automático 10s depois da aprovação (pedido do usuário).
   *
   * O prazo conta **do instante da aprovação**, e só dele. `onFechar` chega do
   * pai como função nova a cada render (`useTefPendente`); com ele nas
   * dependências, cada re-render da lista cancelava o temporizador e começava
   * outro de 10s, e uma lista que re-renderiza com frequência deixava a janela
   * aberta indefinidamente (correção do usuário, 2026-10-02). A referência
   * mantém a função atual sem reabrir o efeito.
   */
  const onFecharRef = useRef(onFechar);
  onFecharRef.current = onFechar;
  useEffect(() => {
    if (aprovado === null) {
      return;
    }
    const temporizador = setTimeout(
      () => {
        onFecharRef.current();
      },
      Math.max(atrasoFechamentoMs, 0),
    );
    return () => {
      clearTimeout(temporizador);
    };
  }, [aprovado, atrasoFechamentoMs]);

  // ESC só fecha **depois** de aprovado: com a cobrança aberta na maquininha, a
  // tecla reflexa de "sai daqui" é o gesto que mais facilmente deixaria uma
  // transação em voo sem ninguém olhando.
  useEffect(() => {
    const aoTeclar = (evento: globalThis.KeyboardEvent): void => {
      if (evento.key === 'Escape' && aprovado !== null) {
        onFechar();
      }
    };
    window.addEventListener('keydown', aoTeclar);
    return () => {
      window.removeEventListener('keydown', aoTeclar);
    };
  }, [aprovado, onFechar]);

  const desistir = useCallback((): void => {
    setConfirmandoDesistencia(false);
    // Erro de criação: nada chegou à maquininha, e o aviso sobre a transação em
    // voo mandaria o operador procurar uma cobrança que não existe.
    if (cobranca === null && !criando) {
      if (!desfechoEmitido.current) {
        desfechoEmitido.current = true;
        onAbandonado(MOTIVO_TEF_DESISTENCIA);
        onFechar();
      }
      return;
    }
    abandonar(
      MOTIVO_TEF_DESISTENCIA,
      `Pagamento no TEF encerrado sem aprovação. ${AVISO_TRANSACAO_EM_VOO}`,
    );
  }, [cobranca, criando, abandonar, onAbandonado, onFechar]);

  /**
   * Pede confirmação sempre que pode existir cobrança na maquininha — inclusive
   * **enquanto ela está sendo criada**: a resposta do ERP pode chegar depois de
   * a SmartTEF já ter aberto a transação.
   */
  const pedirDesistencia = useCallback((): void => {
    if (cobranca === null && !criando) {
      desistir();
      return;
    }
    setConfirmandoDesistencia(true);
  }, [cobranca, criando, desistir]);

  if (!preCondicao.ok) {
    return null;
  }

  const bloqueioDoFechar: MotivoBloqueio = aprovado === null ? MOTIVO_JANELA_TEF_TRAVADA : null;

  return (
    <MolduraJanelaTef
      testId="modal-tef"
      titulo={aprovado === null ? 'Pagamento no TEF' : 'Pagamento aprovado'}
      subtitulo={
        aprovado !== null
          ? 'Transação concluída com sucesso'
          : emErro
            ? 'Falha ao criar a cobrança'
            : 'Operação em andamento'
      }
      tom={aprovado === null ? 'info' : 'sucesso'}
      icone={
        aprovado === null ? (
          <CreditCard className="size-5 text-primary" aria-hidden="true" />
        ) : (
          <Check className="size-5 text-[var(--cc-color-up)]" aria-hidden="true" />
        )
      }
      janelaRef={janelaRef}
      botaoFechar={
        <Button
          type="button"
          variant="secondary"
          size="icon-sm"
          className="shrink-0 rounded-full"
          data-testid="fechar-modal-tef"
          aria-label="Fechar"
          {...atributosDeBloqueio(bloqueioDoFechar)}
          onClick={acaoBloqueavel(bloqueioDoFechar, onFechar)}
        >
          <X className="size-4 text-muted-foreground" aria-hidden="true" />
        </Button>
      }
      rodape={
        <>
          {emErro && (
            <Button
              type="button"
              className="h-9 gap-xs rounded-full px-base text-base font-semibold"
              data-testid="tentar-novamente-tef"
              onClick={criarCobranca}
            >
              <Refresh className="size-3.5" aria-hidden="true" />
              Tentar novamente
            </Button>
          )}
          {aprovado !== null ? (
            // `xpon7`: instância do `Button` com `$success` e o ícone `x`.
            <Button
              type="button"
              className="h-9 gap-xs rounded-full bg-[var(--cc-color-up)] px-base text-base font-semibold text-[var(--cc-color-on-primary)] hover:bg-[var(--cc-color-up-ink)]"
              data-testid="concluir-tef"
              onClick={onFechar}
            >
              <X className="size-4" aria-hidden="true" />
              Fechar
            </Button>
          ) : (
            <Button
              type="button"
              variant="secondary"
              className="h-9 gap-xs rounded-full px-base text-base font-semibold"
              data-testid="desistir-operacao-tef"
              onClick={pedirDesistencia}
            >
              <X className="size-[15px] text-muted-foreground" aria-hidden="true" />
              Desistir da operação
            </Button>
          )}
        </>
      }
      sobreposicao={
        confirmandoDesistencia && (
          <DialogoConfirmacaoDestrutiva
            testId="confirmar-desistencia-tef"
            titulo="Desistir do pagamento no TEF?"
            subtitulo="A cobrança pode já estar na maquininha"
            chamada={CHAMADA_TEF_NAO_E_CANCELADO}
            explicacao={AVISO_TRANSACAO_EM_VOO}
            destaque={DESTAQUE_TEF_SEGUE_NA_MAQUININHA}
            rotuloConfirmar="Desistir mesmo assim"
            rotuloCancelar="Continuar aguardando"
            onConfirmar={desistir}
            onCancelar={() => {
              setConfirmandoDesistencia(false);
            }}
          />
        )
      }
    >
      {emErro ? (
        <div
          className="flex w-full flex-col gap-xs rounded-lg bg-[var(--cc-color-warning-soft)] px-sm py-sm"
          data-testid="erro-criacao-tef"
          role="alert"
        >
          <div className="flex items-start gap-xs">
            <AlertTriangle
              className="mt-[2px] size-4.5 shrink-0 text-[var(--cc-color-accent-yellow)]"
              aria-hidden="true"
            />
            <p className="text-base font-semibold text-foreground">
              Não foi possível criar a cobrança no TEF.
            </p>
          </div>
          <p className="text-sm font-medium text-muted-foreground">
            {erro ?? 'O ERP não respondeu à criação da cobrança.'}
          </p>
        </div>
      ) : aprovado !== null ? (
        <>
          {/* Disco `PbBiX` — 96px, `$success-soft`, `check` de 56px. */}
          <span className="flex size-[96px] shrink-0 items-center justify-center rounded-full bg-[var(--cc-color-up-soft)]">
            <Check className="size-14 text-[var(--cc-color-up)]" aria-hidden="true" />
          </span>
          <BadgeTef tom="sucesso" testId="tef-badge-status">
            Aprovado
          </BadgeTef>
          <h3 className="text-[18px] leading-[1.2] font-semibold text-foreground">
            Pagamento aprovado
          </h3>
          <p className="w-full text-center text-base leading-[1.4] text-muted-foreground">
            Transação concluída.
          </p>
          <BlocoValorTef rotulo="Valor pago" valor={formatarCentavos(valor)} />
          <DetalhesTransacaoTef>
            <LinhaDetalheTef rotulo="NSU" valor={aprovado.nsu} mono testId="tef-nsu" />
            <LinhaDetalheTef
              rotulo="Autorização"
              valor={aprovado.autorizacao}
              mono
              testId="tef-autorizacao"
            />
            <LinhaDetalheTef rotulo="Bandeira" valor={aprovado.bandeira} testId="tef-bandeira" />
          </DetalhesTransacaoTef>
        </>
      ) : (
        <>
          {/* Anel `xObO3`: 96px, traço 6, um quarto aberto — gira enquanto se espera. */}
          <span
            className="relative flex size-[96px] shrink-0 items-center justify-center"
            role="status"
          >
            <span
              className="cc-giro absolute inset-0 rounded-full border-[6px] border-primary border-r-transparent"
              aria-hidden="true"
            />
            <CreditCard className="size-10 text-primary" aria-hidden="true" />
            <span className="sr-only">Aguardando o TEF</span>
          </span>
          <BadgeTef tom="info" testId="tef-badge-status">
            Processando
          </BadgeTef>
          <h3 className="text-[18px] leading-[1.2] font-semibold text-foreground">
            {criando ? 'Enviando para a maquininha…' : 'Aguardando retorno do TEF'}
          </h3>
          <p className="w-full text-center text-base leading-[1.4] text-muted-foreground">
            Não feche esta tela nem desligue a maquininha durante a operação.
          </p>
          <BlocoValorTef rotulo="Valor a cobrar" valor={formatarCentavos(valor)} />
          {/* Skeleton `CDhv3`: as larguras são as dos retângulos do nó. */}
          <DetalhesTransacaoTef>
            {[
              [72, 48],
              [104, 40],
              [60, 56],
            ].map(([rotulo, valorSkeleton], indice) => (
              <div
                key={indice}
                className="flex w-full items-center justify-between"
                aria-hidden="true"
              >
                <span className="h-3 rounded-[4px] bg-secondary" style={{ width: rotulo }} />
                <span className="h-3 rounded-[4px] bg-secondary" style={{ width: valorSkeleton }} />
              </div>
            ))}
          </DetalhesTransacaoTef>
        </>
      )}
    </MolduraJanelaTef>
  );
}
