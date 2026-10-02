import { AlertTriangle, Check, CreditCard, X } from 'reicon-react';
import { useCallback, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { notificar } from '@/lib/notificar';
import { Button } from '@/components/ui/button';
import { acaoBloqueavel, atributosDeBloqueio, type MotivoBloqueio } from '@/lib/bloqueio';
import { useFocoDeModal } from '@/lib/useFocoDeModal';
import { formatarCentavos, type Centavos } from '../../../domain/precificacao/dinheiro';
import { interpretarStatusEstornoTef } from '../../../domain/tef/interpretarStatusTef';
import {
  consultarStatusTef,
  estornarTef,
  mensagemDeErroTef,
  useStatusTef,
  type TefQueriesDeps,
} from '../../../services/tef/tefQueries';
import { DialogoConfirmacaoDestrutiva } from '../DialogoConfirmacaoDestrutiva';
import {
  AVISO_ESTORNO_REJEITADO,
  AVISO_ESTORNO_SOLICITADO,
  CHAMADA_ESTORNO_EM_CURSO,
  DESTAQUE_ESTORNO_EM_CURSO,
  MOTIVO_JANELA_ESTORNO_TRAVADA,
} from './avisosTef';
import { BadgeTef, BlocoValorTef, MolduraJanelaTef } from './molduraTef';

/**
 * Janela de estorno de um TEF aprovado (T034, `contracts/tef-domain-api.md` §3,
 * `data-model.md` §4.2, `research.md` D14).
 *
 * **Sem nó no Pencil** (item 66 de `PENDENCIES.md`): reusa a moldura do modal
 * TEF — cabeçalho `H4DCf`, bloco de valor `SJmhL`, rodapé `Ttsy4`, lidos pelo
 * MCP em 2026-10-02 — com título e estados próprios do estorno.
 *
 * ```text
 * montada ── consulta inicial ──► EST ─────────────────────────────► ESTORNADO
 *                              ├─► SOL_EST | PROC_EST ──► AGUARDANDO (polling)
 *                              └─► CNC | outro ──► SOLICITANDO
 * SOLICITANDO ── EstornarPagamento ── recusa / rede ──► ERRO (TEF segue aprovado)
 *                  ├─ EST ───────────────────────────────────────► ESTORNADO
 *                  └─ outro ──► AGUARDANDO
 * AGUARDANDO ── EST ──► ESTORNADO
 *            ── REJ_EST | CAN_ERP | REJ_PAG ──► REJEITADO (TEF segue aprovado)
 *            ── "Desistir de esperar" ──► confirmação ──► fecha (TEF segue aprovado)
 * ```
 *
 * **A consulta vem antes do pedido** para o fluxo ser idempotente sem depender
 * de como a SmartTEF responde a um segundo estorno: quem desistiu de esperar e
 * clica "Remover" de novo cai direto no `EST` ou no polling, sem pedir outra vez.
 *
 * **Só `EST` efetiva** (T5): `Sucesso: true` do pedido é só o estorno aceito, e
 * riscar a forma ali declararia devolvido um dinheiro cujo estorno ainda pode ser
 * rejeitado. Toda saída que não é `EST` deixa o TEF aprovado e a venda travada
 * para suspensão (T6).
 *
 * Um pedido de estorno por montagem (`pedidoFeito`) e um desfecho por montagem
 * (`desfechoEmitido`). Não importa `vendaStore`: `onEstornado` é o único contato.
 */
export interface JanelaEstornoTefProps {
  /** `PagamentoAplicado.dadosTEF.pagId`. */
  readonly paymentIdentifier: string;
  readonly valor: Centavos;
  /** → `confirmarEstornoTef(idPagamento)`. Só depois do `EST`. */
  readonly onEstornado: () => void;
  /** Fecha a janela — depois do estorno, ou sem mutação nenhuma (TEF segue aprovado). */
  readonly onFechar: () => void;
  readonly deps?: TefQueriesDeps;
  /** Só teste; o padrão é `MS_FECHAMENTO_APOS_ESTORNO_TEF`. */
  readonly atrasoFechamentoMs?: number;
}

type FaseEstorno =
  'CONSULTANDO' | 'SOLICITANDO' | 'AGUARDANDO' | 'ESTORNADO' | 'ERRO' | 'REJEITADO';

/**
 * Pedido do usuário (2026-10-02): concluído o estorno, a janela informa o
 * sucesso e fecha sozinha em 10s, ou antes, pelo ESC, pelo `X` ou pelo botão —
 * o mesmo que a janela de cobrança faz depois de aprovar.
 */
export const MS_FECHAMENTO_APOS_ESTORNO_TEF = 10_000;

const DEPS_VAZIAS: TefQueriesDeps = {};

export function JanelaEstornoTef({
  paymentIdentifier,
  valor,
  onEstornado,
  onFechar,
  deps = DEPS_VAZIAS,
  atrasoFechamentoMs = MS_FECHAMENTO_APOS_ESTORNO_TEF,
}: JanelaEstornoTefProps): ReactElement {
  const [fase, setFase] = useState<FaseEstorno>('CONSULTANDO');
  const [mensagemErro, setMensagemErro] = useState<string | null>(null);
  const [motivoRejeicao, setMotivoRejeicao] = useState('');
  const [confirmandoDesistencia, setConfirmandoDesistencia] = useState(false);
  const janelaRef = useFocoDeModal<HTMLDivElement>(true);

  const inicioFeito = useRef(false);
  const pedidoFeito = useRef(false);
  const desfechoEmitido = useRef(false);

  const { consulta } = useStatusTef(paymentIdentifier, fase === 'AGUARDANDO', deps);

  /**
   * `EST` observado: a forma é riscada **agora** (`onEstornado`), e a janela
   * fica na tela mostrando o sucesso até o fechamento automático — o saldo da
   * venda não espera os 10s, só a janela.
   */
  const concluir = useCallback((): void => {
    if (desfechoEmitido.current) {
      return;
    }
    desfechoEmitido.current = true;
    setFase('ESTORNADO');
    onEstornado();
  }, [onEstornado]);

  const falhar = useCallback((causa: unknown): void => {
    setMensagemErro(mensagemDeErroTef(causa, 'Não foi possível estornar no TEF.'));
    setFase('ERRO');
  }, []);

  /** Interpreta um status na fase de estorno e decide o próximo passo. */
  const seguir = useCallback(
    (status: string, motivo: string): void => {
      const resultado = interpretarStatusEstornoTef(status);
      if (resultado.situacao === 'ESTORNADO') {
        concluir();
        return;
      }
      if (resultado.situacao === 'ESTORNO_REJEITADO') {
        setMotivoRejeicao(motivo);
        setFase('REJEITADO');
        return;
      }
      setFase('AGUARDANDO');
    },
    [concluir],
  );

  const solicitar = useCallback((): void => {
    if (pedidoFeito.current) {
      return;
    }
    pedidoFeito.current = true;
    setFase('SOLICITANDO');
    estornarTef(paymentIdentifier, deps).then((status) => {
      seguir(status, '');
    }, falhar);
    // `deps` é objeto literal no call site; o que importa é o cliente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentIdentifier, deps.erpClient, seguir, falhar]);

  // Consulta inicial — uma por montagem, inclusive em `StrictMode`.
  useEffect(() => {
    if (inicioFeito.current) {
      return;
    }
    inicioFeito.current = true;
    consultarStatusTef(paymentIdentifier, deps).then((inicial) => {
      // Já estornado, ou com estorno em andamento: não pede de novo.
      if (['EST', 'SOL_EST', 'PROC_EST'].includes(inicial.status)) {
        seguir(inicial.status, inicial.motivo);
        return;
      }
      solicitar();
    }, falhar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentIdentifier, deps.erpClient, seguir, solicitar, falhar]);

  // Polling: só na fase `AGUARDANDO`, que o hook usa como chave de ligar.
  useEffect(() => {
    if (consulta === null || fase !== 'AGUARDANDO' || desfechoEmitido.current) {
      return;
    }
    seguir(consulta.status, consulta.motivo);
  }, [consulta, fase, seguir]);

  const esperando = fase === 'CONSULTANDO' || fase === 'SOLICITANDO' || fase === 'AGUARDANDO';
  const estornado = fase === 'ESTORNADO';

  // Fechamento automático depois do estorno. Pela referência, e não com
  // `onFechar` nas dependências, pelo mesmo motivo do `ModalTef`: o pai recria a
  // função a cada render, e cada re-render empurraria o prazo para frente.
  const onFecharRef = useRef(onFechar);
  onFecharRef.current = onFechar;
  useEffect(() => {
    if (!estornado) {
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
  }, [estornado, atrasoFechamentoMs]);

  // ESC fecha só fora da espera: com o estorno em curso, a saída é o botão do
  // rodapé, que avisa que o pedido segue na SmartTEF.
  useEffect(() => {
    const aoTeclar = (evento: globalThis.KeyboardEvent): void => {
      if (evento.key === 'Escape' && !esperando) {
        onFechar();
      }
    };
    window.addEventListener('keydown', aoTeclar);
    return () => {
      window.removeEventListener('keydown', aoTeclar);
    };
  }, [esperando, onFechar]);

  const desistirDeEsperar = useCallback((): void => {
    setConfirmandoDesistencia(false);
    desfechoEmitido.current = true;
    notificar.aviso(AVISO_ESTORNO_SOLICITADO);
    onFechar();
  }, [onFechar]);

  /** Antes do pedido não há o que avisar; depois dele, confirma. */
  const pedirDesistencia = useCallback((): void => {
    if (!pedidoFeito.current && fase === 'CONSULTANDO') {
      onFechar();
      return;
    }
    setConfirmandoDesistencia(true);
  }, [fase, onFechar]);

  const bloqueioDoFechar: MotivoBloqueio = esperando ? MOTIVO_JANELA_ESTORNO_TRAVADA : null;
  const falhou = fase === 'ERRO' || fase === 'REJEITADO';

  return (
    <MolduraJanelaTef
      testId="janela-estorno-tef"
      titulo="Estorno no TEF"
      subtitulo={
        estornado
          ? 'Estorno concluído com sucesso'
          : fase === 'ERRO'
            ? 'Falha ao pedir o estorno'
            : fase === 'REJEITADO'
              ? 'Estorno rejeitado'
              : fase === 'CONSULTANDO'
                ? 'Consultando a transação'
                : 'Estorno em andamento'
      }
      tom={estornado ? 'sucesso' : falhou ? 'alerta' : 'info'}
      icone={
        estornado ? (
          <Check className="size-5 text-[var(--cc-color-up)]" aria-hidden="true" />
        ) : falhou ? (
          <AlertTriangle
            className="size-5 text-[var(--cc-color-accent-yellow)]"
            aria-hidden="true"
          />
        ) : (
          <CreditCard className="size-5 text-primary" aria-hidden="true" />
        )
      }
      janelaRef={janelaRef}
      botaoFechar={
        <Button
          type="button"
          variant="secondary"
          size="icon-sm"
          className="shrink-0 rounded-full"
          data-testid="fechar-janela-estorno-tef"
          aria-label="Fechar"
          {...atributosDeBloqueio(bloqueioDoFechar)}
          onClick={acaoBloqueavel(bloqueioDoFechar, onFechar)}
        >
          <X className="size-4 text-muted-foreground" aria-hidden="true" />
        </Button>
      }
      rodape={
        esperando ? (
          <Button
            type="button"
            variant="secondary"
            className="h-9 gap-xs rounded-full px-base text-base font-semibold"
            data-testid="desistir-estorno-tef"
            onClick={pedirDesistencia}
          >
            <X className="size-[15px] text-muted-foreground" aria-hidden="true" />
            Desistir de esperar
          </Button>
        ) : estornado ? (
          // Mesmo botão do `xpon7` da janela aprovada: `$success` com o ícone `x`.
          <Button
            type="button"
            className="h-9 gap-xs rounded-full bg-[var(--cc-color-up)] px-base text-base font-semibold text-[var(--cc-color-on-primary)] hover:bg-[var(--cc-color-up-ink)]"
            data-testid="concluir-estorno-tef"
            onClick={onFechar}
          >
            <X className="size-4" aria-hidden="true" />
            Fechar
          </Button>
        ) : (
          <Button
            type="button"
            className="h-9 gap-xs rounded-full px-base text-base font-semibold"
            data-testid="concluir-estorno-tef"
            onClick={onFechar}
          >
            <Check className="size-4" aria-hidden="true" />
            Fechar
          </Button>
        )
      }
      sobreposicao={
        confirmandoDesistencia && (
          <DialogoConfirmacaoDestrutiva
            testId="confirmar-desistencia-estorno-tef"
            titulo="Desistir de esperar o estorno?"
            subtitulo="O estorno já foi pedido ao TEF"
            chamada={CHAMADA_ESTORNO_EM_CURSO}
            explicacao={AVISO_ESTORNO_SOLICITADO}
            destaque={DESTAQUE_ESTORNO_EM_CURSO}
            rotuloConfirmar="Desistir de esperar"
            rotuloCancelar="Continuar aguardando"
            onConfirmar={desistirDeEsperar}
            onCancelar={() => {
              setConfirmandoDesistencia(false);
            }}
          />
        )
      }
    >
      {estornado ? (
        <>
          {/* Mesma anatomia do estado aprovado (`A9MNZI`): disco `$success-soft`
              de 96px com `check` de 56px, badge, título e instrução. */}
          <span className="flex size-[96px] shrink-0 items-center justify-center rounded-full bg-[var(--cc-color-up-soft)]">
            <Check className="size-14 text-[var(--cc-color-up)]" aria-hidden="true" />
          </span>
          <BadgeTef tom="sucesso" testId="tef-estorno-badge">
            Estornado
          </BadgeTef>
          <h3 className="text-[18px] leading-[1.2] font-semibold text-foreground" role="status">
            Estorno efetuado com sucesso
          </h3>
          <p className="w-full text-center text-base leading-[1.4] text-muted-foreground">
            O valor volta para o cartão do cliente. Esta janela fecha sozinha em instantes.
          </p>
        </>
      ) : fase === 'ERRO' ? (
        <PainelAlertaEstorno testId="erro-estorno-tef" titulo="Não foi possível pedir o estorno.">
          {mensagemErro ?? 'O ERP não respondeu ao pedido de estorno.'} O pagamento continua
          aprovado na venda.
        </PainelAlertaEstorno>
      ) : fase === 'REJEITADO' ? (
        <PainelAlertaEstorno testId="estorno-rejeitado-tef" titulo={AVISO_ESTORNO_REJEITADO}>
          {motivoRejeicao === '' ? 'A SmartTEF não informou o motivo.' : motivoRejeicao}
        </PainelAlertaEstorno>
      ) : (
        <>
          <span
            className="relative flex size-[96px] shrink-0 items-center justify-center"
            role="status"
          >
            <span
              className="cc-giro absolute inset-0 rounded-full border-[6px] border-primary border-r-transparent"
              aria-hidden="true"
            />
            <CreditCard className="size-10 text-primary" aria-hidden="true" />
            <span className="sr-only">Aguardando o estorno</span>
          </span>
          <BadgeTef tom="info" testId="tef-estorno-badge">
            Estornando
          </BadgeTef>
          <h3 className="text-[18px] leading-[1.2] font-semibold text-foreground">
            {fase === 'CONSULTANDO'
              ? 'Consultando a transação no TEF'
              : 'Aguardando a confirmação do estorno'}
          </h3>
          <p className="w-full text-center text-base leading-[1.4] text-muted-foreground">
            Não feche esta tela nem desligue a maquininha até a confirmação.
          </p>
        </>
      )}
      <BlocoValorTef
        rotulo={estornado ? 'Valor estornado' : 'Valor a estornar'}
        valor={formatarCentavos(valor)}
      />
    </MolduraJanelaTef>
  );
}

function PainelAlertaEstorno({
  testId,
  titulo,
  children,
}: {
  readonly testId: string;
  readonly titulo: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div
      className="flex w-full flex-col gap-xs rounded-lg bg-[var(--cc-color-warning-soft)] px-sm py-sm"
      data-testid={testId}
      role="alert"
    >
      <div className="flex items-start gap-xs">
        <AlertTriangle
          className="mt-[2px] size-4.5 shrink-0 text-[var(--cc-color-accent-yellow)]"
          aria-hidden="true"
        />
        <p className="text-base font-semibold text-foreground">{titulo}</p>
      </div>
      <p className="text-sm font-medium text-muted-foreground">{children}</p>
    </div>
  );
}
