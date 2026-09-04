import { Copy, QrCode, RefreshCw, TriangleAlert, X } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
} from 'react';
import { gooeyToast } from 'goey-toast';
import { Button } from '@/components/ui/button';
import type { ClienteVenda } from '../../../domain/cliente/clienteVenda';
import type { CobrancaPix } from '../../../domain/pix/cobrancaPix';
import { MENSAGEM_POR_MOTIVO_FALHA } from '../../../domain/pix/interpretarStatusPix';
import { montarDadosPagador } from '../../../domain/pix/montarDadosPagador';
import { validarValorMinimoPix } from '../../../domain/pix/validarValorMinimoPix';
import { formatarCentavos, type Centavos } from '../../../domain/precificacao/dinheiro';
import { useGerarPix, useStatusPix, type PixQueriesDeps } from '../../../services/pix/pixQueries';

/**
 * Janela de cobrança PIX (T016–T018, T021–T022) — réplica do frame
 * "PDV Online Web - Modal PIX" (`design/CentriumCheckout.pen`, nó `j3pJA`).
 *
 * **O MCP do Pencil não conectou nesta sessão** (`CONNECTION_CLOSED`); a leitura
 * foi feita direto no `.pen`, que é JSON legível e é a mesma fonte que o MCP
 * serve (alternativa já registrada em 2026-09-03). Nenhum valor visual abaixo
 * foi escolhido por conta própria.
 *
 * Estrutura do nó, item a item: cartão de 480px, raio 24, `$canvas`, hairline de
 * 1px; cabeçalho (`lSsvw`) de 78px com borda inferior, disco `$success-soft` de
 * 42px com o ícone lucide `qr-code` de 20px em `$success`, título "Pagamento via
 * PIX" (Inter 20/600) e subtítulo "Aguardando pagamento" (Inter 13/500); corpo
 * (`r6UdER`) com 28px de folga vertical, 24px lateral e `gap: 20`, contendo o
 * cartão do QR Code (`DRKJh`, raio 16, hairline, 16px de folga, imagem de
 * 200×200), a instrução centralizada (`v2iVz`, Inter 13/400, `line-height` 1.4),
 * a faixa "copia e cola" (`HVY3r`, `$surface-soft`, raio 12, hairline, `padding:
 * 10px 12px`) com o código em **Geist Mono 11/400** e o botão circular de 32px
 * com o ícone `copy` de 16px, o bloco escuro "Valor a cobrar" (`ZgrCz`,
 * `$surface-dark`, raio 20, rótulo 13/400 em `#8E99A8` e valor em **Geist Mono
 * 32/600** branco) e a badge `$success-soft` (`hKvqW`) com o ponto de 7px e o
 * texto "Aguardando confirmação" em `$success-ink`; rodapé (`N4kBap`) de 60px
 * com borda superior e o botão pílula "Cancelar operação" (`nl8xt`, 36px de
 * altura, `$surface-strong`, ícone `x` de 15px).
 *
 * **Três estados sem nó correspondente no `.pen`.** O desenho modela um único
 * instante — a cobrança já gerada, aguardando pagamento. Os outros dois existem
 * de fato e precisam de tela:
 *
 * 1. **Gerando** — o corpo mostra o mesmo cartão do QR Code com o shimmer já
 *    usado no skeleton de carregamento (`cc-shimmer`), e não um spinner novo: a
 *    caixa que vai receber o QR Code é a que precisa comunicar espera, e assim o
 *    layout não salta quando a imagem chega.
 * 2. **Erro de geração** (`research.md` D12) — painel de alerta no lugar do QR
 *    Code, com "Tentar novamente" no rodapé. O toast anuncia a falha; o painel é
 *    o que mantém o motivo na tela depois que o toast some.
 * 3. **Valor abaixo do mínimo** (`FR-009`) — a janela **não chega a aparecer**:
 *    avisa por toast e devolve o desfecho na mesma passagem, sem tocar a rede.
 *
 * **Nenhuma chamada de cancelamento é feita, em nenhum caminho** (invariante J5,
 * `research.md` D11): não existe endpoint para isso no contrato. Fechar a janela
 * com a cobrança pendente — ou receber uma falha terminal do ERP — apenas remove
 * o pagamento local e avisa o operador de que a desassociação, se necessária, é
 * feita na Central de Transações PIX do ERP.
 *
 * **Fechamento manual e falha terminal convergem no mesmo call site** (T022,
 * `data-model.md` §4): `abandonar()` é uma função só, acionada por dois gatilhos
 * diferentes. Dois caminhos de código para o mesmo desfecho divergiriam com o
 * tempo — e o desfecho aqui é o que decide se a venda fica com um pagamento
 * órfão em `PENDENTE_INTEGRACAO`.
 *
 * Não importa `vendaStore` (Dependency Inversion, Constitution II): tudo chega
 * por prop, e `onAprovado`/`onAbandonado` são os únicos pontos de contato com o
 * resto da aplicação.
 */
export interface ModalPixProps {
  /** `PagamentoAplicado.formaCodigo` — vira `FPgCod` no corpo de `GerarPIX`. */
  readonly formaCodigo: number;
  /**
   * Valor **desta** cobrança, em centavos.
   *
   * Divergência consciente de `contracts/pix-domain-api.md` §3, que nomeia a
   * prop `saldoRestante`: quem chega aqui é `PagamentoAplicado.valorAplicado`,
   * já limitado ao saldo por `derivarValores` (feature 008). Nos cenários do
   * quickstart os dois números coincidem — é o mesmo `60,00` do Cenário 6 —, mas
   * eles se separam num split em que o operador cobra **parte** do saldo por
   * PIX: aí o correto é o valor da forma inserida, não o resto todo da venda.
   * Manter o nome antigo prometeria um número que a prop não carrega.
   */
  readonly valor: Centavos;
  /** `ConfiguracoesPIX.MinimoPix` já em centavos (`research.md` D13). */
  readonly minimoPix: Centavos;
  readonly clienteAtual: ClienteVenda | null;
  /** Chama `confirmarPagamentoIntegrado(idPagamento, { pixGuid })` (feature 008). */
  readonly onAprovado: (pixGuid: string) => void;
  /** Chama `recusarPagamentoIntegrado(idPagamento, motivo)` (feature 008). */
  readonly onAbandonado: (motivo: string) => void;
  readonly onFechar: () => void;
  /** Injetável só para teste — ver `PixQueriesDeps.intervaloMs`. */
  readonly deps?: PixQueriesDeps;
}

export const MOTIVO_FECHADO_PELO_OPERADOR = 'FECHADO_PELO_OPERADOR';
export const MOTIVO_ABAIXO_DO_MINIMO = 'VALOR_ABAIXO_DO_MINIMO';

/**
 * A frase termina apontando **onde** resolver, porque o Checkout não tem como
 * desfazer a cobrança: sem essa indicação o operador procuraria na própria tela
 * um botão de cancelar que não existe (`research.md` D11).
 */
export const AVISO_DESASSOCIACAO_MANUAL =
  'Se a cobrança tiver sido registrada, será necessário desassociá-la manualmente na Central de Transações PIX do ERP.';

const DEPS_VAZIAS: PixQueriesDeps = {};

export function ModalPix({
  formaCodigo,
  valor,
  minimoPix,
  clienteAtual,
  onAprovado,
  onAbandonado,
  onFechar,
  deps = DEPS_VAZIAS,
}: ModalPixProps): ReactElement | null {
  const [cobranca, setCobranca] = useState<CobrancaPix | null>(null);
  /** Desliga o polling na **mesma renderização** que processa o desfecho (J3). */
  const [resolvido, setResolvido] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const refDialogo = useRef<HTMLDivElement>(null);

  /**
   * Um desfecho por cobrança. Sem esta trava, a aprovação detectada num tick
   * poderia ser reprocessada no render seguinte e `confirmarPagamentoIntegrado`
   * seria chamada duas vezes — o slice já ignora a segunda (só
   * `PENDENTE_INTEGRACAO` transiciona), mas a auditoria registraria dois eventos
   * `FORMA_PAGAMENTO_APLICADA` para um pagamento só.
   */
  const desfechoEmitido = useRef(false);
  /**
   * Uma geração por montagem. O `StrictMode` do React 19 executa o efeito duas
   * vezes em desenvolvimento; sem a trava, o operador veria um QR Code enquanto
   * uma **segunda cobrança real** ficasse órfã no adquirente, sem caminho de
   * cancelamento.
   */
  const geracaoIniciada = useRef(false);

  const { gerar, status, erro } = useGerarPix(deps);
  const { resultado } = useStatusPix(
    cobranca?.trnGuid ?? '',
    cobranca !== null && !resolvido,
    deps,
  );

  const abaixoDoMinimo = !validarValorMinimoPix(valor, minimoPix).ok;

  const gerarCobranca = useCallback((): void => {
    void gerar({ formaCodigo, valor, pagador: montarDadosPagador(clienteAtual) })
      .then(setCobranca)
      .catch(() => {
        // O motivo já está em `erro` e vira painel + toast abaixo. Engolir aqui
        // é o que impede a rejeição de virar `unhandledrejection` — o desfecho
        // dela é uma tela, não uma exceção.
        gooeyToast.error('Não foi possível gerar a cobrança PIX. Tente novamente.');
      });
  }, [gerar, formaCodigo, valor, clienteAtual]);

  /** Fechamento manual e falha terminal: **um** caminho de código (T022). */
  const abandonar = useCallback(
    (motivo: string, mensagem: string): void => {
      if (desfechoEmitido.current) {
        return;
      }
      desfechoEmitido.current = true;
      setResolvido(true);
      gooeyToast.warning(mensagem);
      onAbandonado(motivo);
      onFechar();
    },
    [onAbandonado, onFechar],
  );

  // `FR-009`: o bloqueio acontece **antes** de qualquer rede, e a janela não
  // chega a ser desenhada. O pagamento pendente que a feature 008 acabou de
  // inserir precisa sair junto — deixá-lo na lista travaria a venda num
  // `PENDENTE_INTEGRACAO` que nada mais resolveria.
  useEffect(() => {
    if (!abaixoDoMinimo || desfechoEmitido.current) {
      return;
    }
    desfechoEmitido.current = true;
    gooeyToast.warning(
      `O valor mínimo para cobrança PIX é ${formatarCentavos(minimoPix)}. Escolha outra forma de pagamento.`,
    );
    onAbandonado(MOTIVO_ABAIXO_DO_MINIMO);
    onFechar();
  }, [abaixoDoMinimo, minimoPix, onAbandonado, onFechar]);

  useEffect(() => {
    if (abaixoDoMinimo || geracaoIniciada.current) {
      return;
    }
    geracaoIniciada.current = true;
    gerarCobranca();
  }, [abaixoDoMinimo, gerarCobranca]);

  // Cada resultado do polling passa por `interpretarStatusPix` (já aplicado no
  // mapper). `PENDENTE` não faz nada — aguarda o próximo tick (`FR-001`).
  useEffect(() => {
    if (resultado === null || cobranca === null || desfechoEmitido.current) {
      return;
    }
    if (resultado.situacao === 'PENDENTE') {
      return;
    }
    if (resultado.situacao === 'APROVADO') {
      desfechoEmitido.current = true;
      setResolvido(true);
      onAprovado(cobranca.trnGuid);
      onFechar();
      return;
    }
    abandonar(
      resultado.motivo,
      `${MENSAGEM_POR_MOTIVO_FALHA[resultado.motivo]} ${AVISO_DESASSOCIACAO_MANUAL}`,
    );
  }, [resultado, cobranca, onAprovado, onFechar, abandonar]);

  const fecharManualmente = useCallback((): void => {
    // Sem cobrança gerada não há o que desassociar: o erro de geração é o caso
    // em que nada chegou ao ERP, e avisar sobre a Central de Transações ali
    // mandaria o operador procurar uma cobrança inexistente.
    if (cobranca === null) {
      if (!desfechoEmitido.current) {
        desfechoEmitido.current = true;
        onAbandonado(MOTIVO_FECHADO_PELO_OPERADOR);
        onFechar();
      }
      return;
    }
    abandonar(
      MOTIVO_FECHADO_PELO_OPERADOR,
      `Cobrança PIX encerrada sem confirmação de pagamento. ${AVISO_DESASSOCIACAO_MANUAL}`,
    );
  }, [cobranca, abandonar, onAbandonado, onFechar]);

  // Ouvinte de `window`, como nos demais modais desta base: um `onKeyDown` no
  // backdrop só dispara com o foco dentro do modal, e um clique no fundo faria a
  // tecla parar de funcionar.
  useEffect(() => {
    const aoTeclar = (evento: globalThis.KeyboardEvent): void => {
      if (evento.key === 'Escape') {
        fecharManualmente();
      }
    };
    window.addEventListener('keydown', aoTeclar);
    return () => {
      window.removeEventListener('keydown', aoTeclar);
    };
  }, [fecharManualmente]);

  if (abaixoDoMinimo) {
    return null;
  }

  async function copiarCodigo(): Promise<void> {
    if (cobranca === null || cobranca.copiaECola === '') {
      return;
    }
    try {
      await navigator.clipboard.writeText(cobranca.copiaECola);
      setCopiado(true);
    } catch {
      // Área de transferência negada pelo navegador (contexto inseguro, permissão
      // recusada). O código continua visível e selecionável na tela — dizer o que
      // aconteceu é melhor do que um botão que não responde.
      gooeyToast.error('Não foi possível copiar o código. Selecione e copie manualmente.');
    }
  }

  /**
   * Prende o foco no diálogo — mesmo `prenderFoco` de `ModalValeDevolucao`. Sem
   * isto o foco escapa para a tela de venda por baixo, que está inerte.
   */
  function prenderFoco(evento: KeyboardEvent<HTMLDivElement>): void {
    if (evento.key !== 'Tab') {
      return;
    }
    const raiz = refDialogo.current;
    if (raiz === null) {
      return;
    }
    const focaveis = raiz.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    const primeiro = focaveis[0];
    const ultimo = focaveis[focaveis.length - 1];
    if (primeiro === undefined || ultimo === undefined) {
      return;
    }
    if (evento.shiftKey && document.activeElement === primeiro) {
      evento.preventDefault();
      ultimo.focus();
      return;
    }
    if (!evento.shiftKey && document.activeElement === ultimo) {
      evento.preventDefault();
      primeiro.focus();
    }
  }

  const emErro = status === 'erro' && cobranca === null;

  return (
    <div
      className="cc-backdrop-entra fixed inset-0 z-50 flex items-start justify-center bg-[color-mix(in_srgb,var(--cc-color-ink)_40%,transparent)] px-lg pt-9"
      data-testid="modal-pix"
    >
      <div
        ref={refDialogo}
        role="dialog"
        aria-modal="true"
        aria-label="Pagamento via PIX"
        className="cc-modal-entra flex max-h-full w-full max-w-[480px] flex-col overflow-hidden rounded-3xl border border-border bg-background shadow-lg"
        onKeyDown={prenderFoco}
      >
        {/* Cabeçalho `lSsvw`. O desenho **não** tem botão de fechar aqui — a
            única saída é "Cancelar operação", no rodapé. Acrescentar um segundo
            gesto de fechar daria ao operador dois caminhos para a mesma decisão
            irreversível (a cobrança fica pendurada no ERP), e o desenho é
            explícito em oferecer um só. */}
        <header className="flex h-[78px] shrink-0 items-center gap-sm border-b border-border px-lg">
          <span className="flex size-[42px] shrink-0 items-center justify-center rounded-full bg-[var(--cc-color-up-soft)]">
            <QrCode className="size-5 text-[var(--cc-color-up)]" aria-hidden="true" />
          </span>
          <div className="flex flex-col gap-[2px]">
            <h2 className="text-xl leading-[1.2] font-semibold text-foreground">
              Pagamento via PIX
            </h2>
            <p className="text-base leading-[1.2] font-medium text-muted-foreground">
              {emErro ? 'Falha ao gerar a cobrança' : 'Aguardando pagamento'}
            </p>
          </div>
        </header>

        <div className="flex flex-col items-center gap-md overflow-y-auto px-lg py-7">
          {emErro ? (
            <div
              className="flex w-full flex-col gap-xs rounded-lg bg-[var(--cc-color-warning-soft)] px-sm py-sm"
              data-testid="erro-geracao-pix"
              role="alert"
            >
              <div className="flex items-start gap-xs">
                <TriangleAlert
                  className="mt-[2px] size-4.5 shrink-0 text-[var(--cc-color-accent-yellow)]"
                  aria-hidden="true"
                />
                <p className="text-base font-semibold text-foreground">
                  Não foi possível gerar a cobrança PIX.
                </p>
              </div>
              <p className="text-sm font-medium text-muted-foreground">
                {erro ?? 'O ERP não respondeu à geração da cobrança.'}
              </p>
            </div>
          ) : (
            <>
              {/* Cartão `DRKJh` — 200×200 é a medida do nó `g8F3HF`. */}
              <div className="flex items-center justify-center rounded-2xl border border-border bg-background p-base">
                {cobranca === null ? (
                  <div
                    className="cc-shimmer size-[200px] rounded-md"
                    data-testid="pix-qrcode-carregando"
                    aria-label="Gerando o QR Code do PIX"
                    role="status"
                  />
                ) : (
                  <img
                    className="size-[200px]"
                    data-testid="pix-qrcode"
                    src={`data:image/jpeg;base64,${cobranca.qrCodeImagemBase64}`}
                    alt="QR Code do PIX para pagamento"
                  />
                )}
              </div>

              <p className="w-full text-center text-base leading-[1.4] text-muted-foreground">
                Abra o app do seu banco e escaneie o QR Code para concluir o pagamento.
              </p>

              {/* Faixa `HVY3r`. O código fica em Geist Mono, como todo valor
                  tabular do produto, e quebra em vez de estourar a caixa: o
                  "copia e cola" tem ~130 caracteres e o desenho o mostra inteiro. */}
              <div className="flex w-full items-center gap-xs rounded-lg border border-border bg-muted px-sm py-[10px]">
                <span
                  className="min-w-0 flex-1 font-mono text-xs leading-[1.3] break-all text-[var(--cc-color-muted)]"
                  data-testid="pix-copia-e-cola"
                >
                  {cobranca?.copiaECola ?? ''}
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon-sm"
                  className="shrink-0 rounded-full"
                  data-testid="copiar-codigo-pix"
                  aria-label="Copiar código PIX"
                  onClick={() => {
                    void copiarCodigo();
                  }}
                >
                  <Copy className="size-4 text-foreground" aria-hidden="true" />
                </Button>
              </div>
              {/* Confirmação do copiar: o desenho não a modela, e sem ela o
                  clique no botão não produz retorno visível nenhum — num PDV o
                  operador repetiria o gesto sem saber se funcionou. */}
              {copiado && (
                <p className="sr-only" role="status" data-testid="pix-codigo-copiado">
                  Código PIX copiado.
                </p>
              )}

              {/* Bloco escuro `ZgrCz` — o valor é o único número da tela e usa a
                  maior escala tipográfica do produto. */}
              <div className="flex w-full flex-col items-center gap-[6px] rounded-[20px] bg-[var(--cc-color-surface-dark)] p-base">
                <span className="text-base text-[var(--cc-color-on-dark-muted)]">
                  Valor a cobrar
                </span>
                <span
                  className="font-mono text-2xl leading-[1.05] font-semibold tabular-nums text-[var(--cc-color-on-primary)]"
                  data-testid="pix-valor-a-cobrar"
                >
                  {formatarCentavos(valor)}
                </span>
              </div>

              {/* Badge `hKvqW` no estado `$success-soft` do nó `uwg5J`. */}
              <span
                className="flex items-center gap-[6px] rounded-full bg-[var(--cc-color-up-soft)] px-sm py-[5px]"
                data-testid="pix-badge-status"
              >
                <span
                  className="size-[7px] shrink-0 rounded-full bg-[var(--cc-color-up)]"
                  aria-hidden="true"
                />
                <span className="text-sm font-semibold whitespace-nowrap text-[var(--cc-color-up-ink)]">
                  Aguardando confirmação
                </span>
              </span>
            </>
          )}
        </div>

        <footer className="flex h-[60px] shrink-0 items-center justify-center gap-[10px] border-t border-border px-lg">
          {emErro && (
            <Button
              type="button"
              className="h-9 gap-xs rounded-full px-base text-base font-semibold"
              data-testid="tentar-novamente-pix"
              onClick={() => {
                gerarCobranca();
              }}
            >
              <RefreshCw className="size-3.5" aria-hidden="true" />
              Tentar novamente
            </Button>
          )}
          <Button
            type="button"
            variant="secondary"
            className="h-9 gap-xs rounded-full px-base text-base font-semibold"
            data-testid="cancelar-operacao-pix"
            onClick={fecharManualmente}
          >
            <X className="size-[15px] text-muted-foreground" aria-hidden="true" />
            Cancelar operação
          </Button>
        </footer>
      </div>
    </div>
  );
}
