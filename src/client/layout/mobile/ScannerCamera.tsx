import { Scan, X } from 'reicon-react';
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { suportaScannerCamera } from '../../domain/layout/suportaScannerCamera';

/**
 * Leitura de código de barras pela câmera (T023, `US3`).
 *
 * **Ausente, não desabilitado** (`FR-011`, AD-090): fora de Chrome/Android o
 * componente devolve `null` — sem botão apagado, sem mensagem de
 * indisponibilidade. Quem opera num aparelho sem suporte simplesmente não vê
 * que a opção existe, que é o pedido literal da spec.
 *
 * **Nunca insere nada por conta própria** (`contracts/layout-domain-api.md` §3):
 * devolve a string decodificada por `onCodigoLido` e é o componente de etapa
 * que a entrega ao mesmo `EntradaCodigo` do leitor físico/digitação. Resolver o
 * produto aqui duplicaria a orquestração que `carrinhoSlice`/`produtoQueries`
 * (003) já fazem.
 *
 * `BarcodeDetector` no próprio quadro de vídeo, via `requestAnimationFrame`, sem
 * Web Worker (AD-086): a decisão de não trazer biblioteca/WASM externo existe
 * justamente para não precisar dessa complexidade.
 */

/**
 * Tipos mínimos da Shape Detection API — o TypeScript ainda não os traz no
 * `lib.dom`. Declarados aqui, e não num `.d.ts` global, porque este é o único
 * lugar do projeto que fala com a API: um tipo global anunciaria a existência
 * de `BarcodeDetector` em toda a base, inclusive nos navegadores em que ele não
 * existe.
 */
interface CodigoDetectado {
  readonly rawValue: string;
}

interface DetectorDeCodigo {
  detect(fonte: CanvasImageSource): Promise<readonly CodigoDetectado[]>;
}

type ConstrutorDeDetector = new (opcoes?: { formats?: readonly string[] }) => DetectorDeCodigo;

function construtorDeDetector(): ConstrutorDeDetector | null {
  const candidato = (window as unknown as { BarcodeDetector?: ConstrutorDeDetector })
    .BarcodeDetector;
  return candidato ?? null;
}

export interface ScannerCameraProps {
  /** Chamado com o texto decodificado; quem insere é o chamador (D5). */
  onCodigoLido(codigo: string): void;
}

export function ScannerCamera({ onCodigoLido }: ScannerCameraProps): ReactElement | null {
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const quadroRef = useRef<number | null>(null);
  /**
   * O primeiro código vence e encerra a leitura.
   *
   * Numa `ref`, não em estado: o laço de `requestAnimationFrame` já está em voo
   * quando a leitura acontece, e um `setState` só valeria no próximo render —
   * tempo suficiente para o mesmo código ser detectado duas vezes e inserir o
   * produto em duplicidade.
   */
  const jaLeuRef = useRef(false);
  /**
   * A callback de entrega, sempre na versão mais recente — mas **fora** das
   * dependências do efeito que liga a câmera.
   *
   * O chamador real a recria a cada render: `EntradaRapidaProduto` monta o slot
   * como `renderizarCaptura?.((codigo) => ...)`, uma função nova por render seu.
   * Com ela nas dependências, qualquer re-render do pai enquanto a janela está
   * aberta — uma query que assenta, um item que entra na lista — derrubava o
   * efeito e o remontava: a trilha de vídeo era encerrada e `getUserMedia`
   * chamado de novo, apagando a imagem no meio da mira do operador. Ler pela
   * `ref` mantém a entrega correta sem amarrar o hardware à identidade da
   * função.
   */
  const aoLerRef = useRef(onCodigoLido);
  aoLerRef.current = onCodigoLido;

  const encerrar = useCallback((): void => {
    if (quadroRef.current !== null) {
      cancelAnimationFrame(quadroRef.current);
      quadroRef.current = null;
    }
    streamRef.current?.getTracks().forEach((trilha) => {
      trilha.stop();
    });
    streamRef.current = null;
  }, []);

  // A câmera nunca sobrevive ao componente: sair da etapa 1 (ou trocar para o
  // layout desktop, que desmonta a árvore inteira) desliga a trilha de vídeo.
  useEffect(() => encerrar, [encerrar]);

  useEffect(() => {
    if (!aberto) {
      return;
    }

    const Detector = construtorDeDetector();
    if (Detector === null) {
      return;
    }

    let cancelado = false;
    const detector = new Detector({ formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'itf'] });

    async function iniciar(): Promise<void> {
      try {
        // `environment`: a câmera traseira é a que o operador aponta para a
        // etiqueta. Sem isto o Android abre a frontal em boa parte dos casos.
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        if (cancelado) {
          stream.getTracks().forEach((trilha) => {
            trilha.stop();
          });
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video !== null) {
          video.srcObject = stream;
          await video.play();
        }
        procurar();
      } catch {
        // Permissão negada ou câmera indisponível: a janela **permanece
        // aberta** e troca o vídeo pela frase — quem a fecha é o operador, pelo
        // X do cabeçalho. Fechá-la sozinha esconderia o motivo antes de ele ser
        // lido, e a saída que a frase indica (o campo de código) nunca deixou
        // de existir atrás dela.
        setErro('Não foi possível abrir a câmera. Use o campo de código.');
      }
    }

    function procurar(): void {
      quadroRef.current = requestAnimationFrame(() => {
        const video = videoRef.current;
        if (cancelado || video === null || jaLeuRef.current) {
          return;
        }
        void detector
          .detect(video)
          .then((codigos) => {
            // A checagem se repete aqui, e não é redundância com a de cima: o
            // `cancelamento` acontece **enquanto** este quadro está em análise.
            // Fechar a janela ou desmontar a etapa cancela o próximo
            // `requestAnimationFrame`, nunca a promessa que a API já devolveu —
            // sem esta guarda, um código decodificado depois do gesto de sair
            // virava produto no carrinho de uma tela que não estava mais lá.
            if (cancelado || jaLeuRef.current) {
              return;
            }
            const primeiro = codigos[0];
            if (primeiro === undefined || primeiro.rawValue === '') {
              procurar();
              return;
            }
            jaLeuRef.current = true;
            encerrar();
            setAberto(false);
            aoLerRef.current(primeiro.rawValue);
          })
          .catch(() => {
            // Quadro que a API não conseguiu analisar (foco, luz): tenta o
            // próximo em vez de derrubar a leitura inteira — a menos que a
            // janela já tenha saído de cena, quando insistir só agendaria um
            // quadro que ninguém mais cancela.
            if (cancelado) {
              return;
            }
            procurar();
          });
      });
    }

    void iniciar();

    return () => {
      cancelado = true;
      encerrar();
    };
    // `onCodigoLido` **não** entra aqui de propósito (lido por `aoLerRef`): quem
    // liga e desliga a câmera é a abertura da janela, nunca a identidade de uma
    // função que o pai recria a cada render.
  }, [aberto, encerrar]);

  // Avaliado a cada render, mas estável na prática: nem a UA nem a presença da
  // API mudam dentro de uma mesma sessão de navegador (`data-model.md` §3).
  if (!suportaScannerCamera(navigator.userAgent, 'BarcodeDetector' in window)) {
    return null;
  }

  return (
    <>
      {/* Nó `QIJKL` do Pencil: pílula `$surface-strong` de 30px de altura, folga
          lateral 10, gap 6, ícone `scan-line` de 14px e rótulo 11/800 na cor da
          marca.

          `cc-alvo-toque` (`global.css`) porque 30px de altura é o alvo mais
          apertado da etapa 1 — e este botão é o único controle do produto que
          existe **exclusivamente** no layout do dedo, onde não há mouse para
          compensar a mira. O pseudo-elemento leva a área sensível a 44px sem
          mover nem engordar um pixel da pílula que o desenho fixa. */}
      <button
        type="button"
        className="cc-alvo-toque flex h-[30px] shrink-0 items-center justify-center gap-1.5 rounded-full bg-secondary px-2.5 text-xs font-bold text-primary hover:bg-secondary-hover outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        data-testid="abrir-scanner-camera"
        onClick={() => {
          jaLeuRef.current = false;
          setErro(null);
          setAberto(true);
        }}
      >
        <Scan className="size-3.5 shrink-0" aria-hidden="true" />
        Scanner
      </button>

      {aberto && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-[var(--cc-color-surface-dark)]"
          data-testid="scanner-camera"
        >
          <header className="flex shrink-0 items-center justify-between px-base py-sm">
            <span className="text-base font-semibold text-[var(--cc-color-on-dark)]">
              Aponte para o código de barras
            </span>
            <button
              type="button"
              className="flex size-9 items-center justify-center rounded-full bg-[var(--cc-color-surface-dark-elevated)] text-[var(--cc-color-on-dark)]"
              aria-label="Fechar scanner"
              data-testid="fechar-scanner-camera"
              onClick={() => {
                encerrar();
                setAberto(false);
              }}
            >
              <X className="size-4.5" aria-hidden="true" />
            </button>
          </header>

          {erro === null ? (
            // `muted` e `playsInline` não são decoração: sem eles o iOS/Android
            // recusa o autoplay e a leitura nunca começa.
            <video
              ref={videoRef}
              className="min-h-0 flex-1 object-cover"
              data-testid="video-scanner"
              muted
              playsInline
            />
          ) : (
            <p
              className="flex min-h-0 flex-1 items-center justify-center px-lg text-center text-base text-[var(--cc-color-on-dark-strong)]"
              data-testid="erro-scanner-camera"
            >
              {erro}
            </p>
          )}
        </div>
      )}
    </>
  );
}
