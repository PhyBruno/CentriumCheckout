import { useState, type ReactElement } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EtapaClienteProdutos } from '../../src/client/layout/mobile/EtapaClienteProdutos';
import { ScannerCamera } from '../../src/client/layout/mobile/ScannerCamera';
import { useEdicaoItemStore } from '../../src/client/stores/edicaoItemStore';
import { useSessionStore } from '../../src/client/stores/sessionStore';
import { useVendaStore } from '../../src/client/stores/vendaStore';
import { instalarMatchMediaDeLayout, renderizarComProvedores } from '../support/layout';
import { linhaDe, respostaGetProduto } from '../support/precificacao';
import { registroBootstrapDe } from '../support/sessao';

/**
 * T025 — o código lido pela câmera produz **exatamente** o mesmo item que a
 * mesma string digitada na barra (`FR-007`, D5).
 *
 * É a verificação de que existe um caminho de inserção só. Se o scanner
 * resolvesse o produto por conta própria — chamando `GetProduto` direto, por
 * exemplo — os dois itens poderiam divergir em preço, origem ou unidade sem que
 * nenhum outro teste percebesse, e a divergência só apareceria na conferência
 * fiscal.
 */
const CODIGO_LIDO = '7890000000001';

/** UA sintética de Chrome/Android — o único ambiente em que o botão existe. */
const UA_CHROME_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';

class ResizeObserverStub implements ResizeObserver {
  observe(): void {
    /* sem medição */
  }
  unobserve(): void {
    /* nada a fazer */
  }
  disconnect(): void {
    /* nada a fazer */
  }
}

function definirUserAgent(valor: string): void {
  Object.defineProperty(window.navigator, 'userAgent', { configurable: true, value: valor });
}

/**
 * `BarcodeDetector` falso que devolve sempre o mesmo código.
 *
 * O `detect` real recebe um quadro de vídeo; aqui a fonte é irrelevante — o que
 * este teste exercita é o que acontece **depois** da decodificação.
 */
function instalarBarcodeDetector(codigo: string): void {
  class DetectorFalso {
    detect(): Promise<readonly { rawValue: string }[]> {
      return Promise.resolve([{ rawValue: codigo }]);
    }
  }
  Object.defineProperty(window, 'BarcodeDetector', {
    configurable: true,
    writable: true,
    value: DetectorFalso,
  });
}

/**
 * `BarcodeDetector` cuja decodificação **fica pendente** até o teste resolvê-la.
 *
 * Existe para exercitar a janela real entre "a API já foi chamada" e "a resposta
 * chegou": é dentro dela que o operador fecha a janela ou sai da etapa, e é o
 * único jeito de provar que a leitura tardia não insere produto nenhum. Um
 * `Promise.resolve` imediato nunca abre essa janela.
 */
function instalarBarcodeDetectorPendente(codigo: string): { resolver: () => void } {
  let liberar = (): void => {
    /* substituído no primeiro `detect` */
  };

  class DetectorPendente {
    detect(): Promise<readonly { rawValue: string }[]> {
      return new Promise((resolve) => {
        liberar = () => {
          resolve([{ rawValue: codigo }]);
        };
      });
    }
  }
  Object.defineProperty(window, 'BarcodeDetector', {
    configurable: true,
    writable: true,
    value: DetectorPendente,
  });

  return {
    resolver: () => {
      liberar();
    },
  };
}

function removerBarcodeDetector(): void {
  Reflect.deleteProperty(window as unknown as Record<string, unknown>, 'BarcodeDetector');
}

/** O que a câmera falsa registrou desde a última instalação. */
interface CameraFalsa {
  readonly getUserMedia: ReturnType<typeof vi.fn>;
  /** Quantas trilhas de vídeo tiveram `stop()` chamado. */
  trilhasEncerradas(): number;
}

/**
 * Câmera falsa **reinstalada a cada caso**, e não uma só para o arquivo inteiro.
 *
 * As contagens (`getUserMedia`, trilhas encerradas) são a prova de dois
 * requisitos que só se enxergam contando: a câmera não pode reiniciar sozinha, e
 * não pode sobreviver ao componente. Um duplo compartilhado entre casos
 * acumularia chamadas de um teste no outro e transformaria as duas contagens em
 * ruído.
 */
function instalarCameraFalsa(falhar = false): CameraFalsa {
  let encerradas = 0;
  const getUserMedia = vi.fn().mockImplementation(() => {
    if (falhar) {
      // O nome real que o Chrome lança quando o operador nega a permissão.
      return Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
    }
    return Promise.resolve({
      getTracks: () => [
        {
          stop: () => {
            encerradas += 1;
          },
        },
      ],
    } as unknown as MediaStream);
  });

  Object.defineProperty(window.navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia },
  });
  // jsdom não implementa `HTMLMediaElement.play`.
  Object.defineProperty(window.HTMLMediaElement.prototype, 'play', {
    configurable: true,
    value: vi.fn().mockResolvedValue(undefined),
  });

  return { getUserMedia, trilhasEncerradas: () => encerradas };
}

/**
 * Um pai que repinta sob comando, entregando um `onCodigoLido` de identidade
 * nova a cada render — exatamente o que `EntradaRapidaProduto` faz ao montar o
 * slot com uma arrow inline.
 *
 * Um `rerender` do RTL não serviria aqui: trocar o elemento raiz desmonta e
 * remonta o scanner, e o teste mediria o desmonte em vez do re-render.
 */
function PaiQueRepinta(): ReactElement {
  const [repintes, setRepintes] = useState(0);

  return (
    <>
      <button
        type="button"
        data-testid="repintar-pai"
        onClick={() => {
          setRepintes((anterior) => anterior + 1);
        }}
      >
        Repintar ({repintes})
      </button>
      <ScannerCamera
        onCodigoLido={() => {
          /* irrelevante: o assunto aqui é a câmera, não a inserção */
        }}
      />
    </>
  );
}

function stubarGetProduto(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ Produto: respostaGetProduto() }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    ),
  );
}

const uaOriginal = window.navigator.userAgent;

let camera: CameraFalsa;

beforeAll(() => {
  instalarMatchMediaDeLayout();
  window.ResizeObserver = ResizeObserverStub;
});

beforeEach(() => {
  camera = instalarCameraFalsa();
  stubarGetProduto();
  useSessionStore.setState({ estado: 'pronto', registro: registroBootstrapDe() });
  useVendaStore.setState({ linhas: [], clienteAtual: null, houveEscolhaExplicita: false });
  useVendaStore.getState().resetarAuditoria('NOVA');
  useEdicaoItemStore.setState({ linhaEmEdicao: null });
});

afterEach(() => {
  definirUserAgent(uaOriginal);
  removerBarcodeDetector();
});

describe('ScannerCamera — disponibilidade (FR-011)', () => {
  it('não aparece fora de Chrome/Android, nem desabilitado nem com aviso', () => {
    definirUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    );
    instalarBarcodeDetector(CODIGO_LIDO);

    renderizarComProvedores(<EtapaClienteProdutos />);

    expect(screen.queryByTestId('abrir-scanner-camera')).toBeNull();
    // Nem botão apagado, nem mensagem: a opção fica inteiramente ausente.
    expect(screen.queryByText(/scanner/i)).toBeNull();
  });

  it('não aparece em Chrome/Android sem a API de detecção', () => {
    definirUserAgent(UA_CHROME_ANDROID);
    removerBarcodeDetector();

    renderizarComProvedores(<EtapaClienteProdutos />);

    expect(screen.queryByTestId('abrir-scanner-camera')).toBeNull();
  });

  it('aparece em Chrome/Android com a API disponível', () => {
    definirUserAgent(UA_CHROME_ANDROID);
    instalarBarcodeDetector(CODIGO_LIDO);

    renderizarComProvedores(<EtapaClienteProdutos />);

    expect(screen.getByTestId('abrir-scanner-camera')).toBeInTheDocument();
  });
});

describe('ScannerCamera — inserção pelo mesmo caminho da barra (FR-007)', () => {
  it('o código lido pela câmera insere o mesmo item que a digitação da mesma string', async () => {
    const usuario = userEvent.setup();

    // 1) Caminho de sempre: digitar o código e confirmar com Enter.
    definirUserAgent(uaOriginal);
    renderizarComProvedores(<EtapaClienteProdutos />);
    await usuario.type(screen.getByTestId('campo-codigo-produto'), `${CODIGO_LIDO}{Enter}`);
    await waitFor(() => {
      expect(useVendaStore.getState().linhas).toHaveLength(1);
    });
    const linhaDigitada = useVendaStore.getState().linhas[0];
    cleanup();

    // 2) Mesma string, agora vinda da câmera.
    useVendaStore.setState({ linhas: [] });
    useVendaStore.getState().resetarAuditoria('NOVA');
    definirUserAgent(UA_CHROME_ANDROID);
    instalarBarcodeDetector(CODIGO_LIDO);
    renderizarComProvedores(<EtapaClienteProdutos />);

    await usuario.click(screen.getByTestId('abrir-scanner-camera'));
    await waitFor(() => {
      expect(useVendaStore.getState().linhas).toHaveLength(1);
    });
    const linhaLida = useVendaStore.getState().linhas[0];

    expect(linhaDigitada).toBeDefined();
    expect(linhaLida).toBeDefined();
    // Tudo o que descreve a linha, menos o id (gerado por inserção).
    expect(linhaLida?.snapshot).toEqual(linhaDigitada?.snapshot);
    expect(linhaLida?.precoUnitario).toBe(linhaDigitada?.precoUnitario);
    expect(linhaLida?.quantidade).toBe(linhaDigitada?.quantidade);
    expect(linhaLida?.descontoManual).toBe(linhaDigitada?.descontoManual);
    // Mesma origem: a câmera não inventa uma proveniência própria.
    expect(linhaLida?.origem).toBe(linhaDigitada?.origem);
  });

  it('fecha a janela da câmera assim que o primeiro código é lido', async () => {
    const usuario = userEvent.setup();
    definirUserAgent(UA_CHROME_ANDROID);
    instalarBarcodeDetector(CODIGO_LIDO);

    renderizarComProvedores(<EtapaClienteProdutos />);
    await usuario.click(screen.getByTestId('abrir-scanner-camera'));

    await waitFor(() => {
      expect(screen.queryByTestId('scanner-camera')).toBeNull();
    });
    // Uma leitura, um item: o laço não continua rodando depois do primeiro
    // código, que duplicaria a linha.
    expect(useVendaStore.getState().linhas).toHaveLength(1);
  });

  it('o mesmo código presente em vários quadros ainda insere uma linha só', async () => {
    const usuario = userEvent.setup();
    definirUserAgent(UA_CHROME_ANDROID);
    // O detector devolve o código em **toda** chamada, como a câmera real faz
    // enquanto a etiqueta continua no enquadramento: são dezenas de quadros por
    // segundo com o mesmo valor. É a leitura dupla que `jaLeuRef` existe para
    // impedir, e ela não aparece num duplo que responde uma vez só.
    instalarBarcodeDetector(CODIGO_LIDO);

    renderizarComProvedores(<EtapaClienteProdutos />);
    await usuario.click(screen.getByTestId('abrir-scanner-camera'));

    await waitFor(() => {
      expect(useVendaStore.getState().linhas).toHaveLength(1);
    });
    // Dá tempo para qualquer quadro remanescente do laço se resolver antes de
    // afirmar que ele parou: sem a trava, o segundo já teria entrado aqui.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(useVendaStore.getState().linhas).toHaveLength(1);
  });
});

/**
 * Ciclo de vida da câmera (`FR-006`, AD-086).
 *
 * A câmera é o único recurso de hardware que esta base liga, e os três modos de
 * errar com ela são invisíveis na tela: deixá-la ligada depois que o componente
 * saiu, religá-la sozinha a cada render do pai, e aceitar uma leitura que chegou
 * depois de a janela fechar. Nenhum deles quebra um teste de composição — o LED
 * do aparelho fica aceso e um produto entra sem que ninguém tenha apontado a
 * etiqueta para nada.
 */
describe('ScannerCamera — ciclo de vida da câmera', () => {
  it('desliga a trilha de vídeo quando a etapa sai de cena', async () => {
    const usuario = userEvent.setup();
    definirUserAgent(UA_CHROME_ANDROID);
    // Pendente: sem isto o primeiro quadro já fecharia a janela e o teste
    // mediria o encerramento da leitura, não o do desmonte.
    instalarBarcodeDetectorPendente(CODIGO_LIDO);

    const { unmount } = renderizarComProvedores(<EtapaClienteProdutos />);
    await usuario.click(screen.getByTestId('abrir-scanner-camera'));
    await waitFor(() => {
      expect(camera.getUserMedia).toHaveBeenCalledTimes(1);
    });
    expect(camera.trilhasEncerradas()).toBe(0);

    // Avançar para a etapa 2, cruzar o breakpoint para o desktop ou recarregar o
    // bootstrap: todos desmontam esta árvore, e nenhum passa por um "fechar".
    unmount();

    expect(camera.trilhasEncerradas()).toBe(1);
  });

  it('desliga a trilha de vídeo ao fechar a janela pelo X', async () => {
    const usuario = userEvent.setup();
    definirUserAgent(UA_CHROME_ANDROID);
    instalarBarcodeDetectorPendente(CODIGO_LIDO);

    renderizarComProvedores(<EtapaClienteProdutos />);
    await usuario.click(screen.getByTestId('abrir-scanner-camera'));
    await waitFor(() => {
      expect(camera.getUserMedia).toHaveBeenCalledTimes(1);
    });

    await usuario.click(screen.getByTestId('fechar-scanner-camera'));

    expect(screen.queryByTestId('scanner-camera')).toBeNull();
    expect(camera.trilhasEncerradas()).toBe(1);
  });

  it('não religa a câmera quando o pai recria a callback de leitura', async () => {
    const usuario = userEvent.setup();
    definirUserAgent(UA_CHROME_ANDROID);
    instalarBarcodeDetectorPendente(CODIGO_LIDO);

    // O pai re-renderiza **sem** desmontar o scanner, que é o caso real: a
    // câmera aberta e `EntradaRapidaProduto` repintando por qualquer motivo
    // seu. O slot é montado lá como `renderizarCaptura?.((codigo) => ...)`, uma
    // função nova por render — se ela participar das dependências do efeito, a
    // trilha de vídeo se encerra e `getUserMedia` é chamado de novo no meio da
    // mira do operador.
    renderizarComProvedores(<PaiQueRepinta />);
    await usuario.click(screen.getByTestId('abrir-scanner-camera'));
    await waitFor(() => {
      expect(camera.getUserMedia).toHaveBeenCalledTimes(1);
    });

    await usuario.click(screen.getByTestId('repintar-pai'));
    await usuario.click(screen.getByTestId('repintar-pai'));

    expect(camera.getUserMedia).toHaveBeenCalledTimes(1);
    expect(camera.trilhasEncerradas()).toBe(0);
    // E a janela continua na tela: o operador não viu a imagem piscar.
    expect(screen.getByTestId('scanner-camera')).toBeInTheDocument();
  });

  it('a leitura que chega depois do fechamento não entrega código nenhum', async () => {
    const usuario = userEvent.setup();
    definirUserAgent(UA_CHROME_ANDROID);
    const detector = instalarBarcodeDetectorPendente(CODIGO_LIDO);
    const lidos: string[] = [];

    renderizarComProvedores(
      <ScannerCamera
        onCodigoLido={(codigo) => {
          lidos.push(codigo);
        }}
      />,
    );
    await usuario.click(screen.getByTestId('abrir-scanner-camera'));
    await waitFor(() => {
      expect(camera.getUserMedia).toHaveBeenCalledTimes(1);
    });

    // O operador desiste **enquanto** o quadro já está em análise: fechar
    // cancela o próximo `requestAnimationFrame`, mas não a promessa que a API já
    // devolveu. Sem uma guarda no desfecho dela, esse código vira produto no
    // carrinho depois de a janela ter sumido da tela.
    await usuario.click(screen.getByTestId('fechar-scanner-camera'));
    detector.resolver();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(lidos).toEqual([]);
  });

  it('a leitura que chega depois do desmonte não entrega código nenhum', async () => {
    const usuario = userEvent.setup();
    definirUserAgent(UA_CHROME_ANDROID);
    const detector = instalarBarcodeDetectorPendente(CODIGO_LIDO);
    const lidos: string[] = [];

    const { unmount } = renderizarComProvedores(
      <ScannerCamera
        onCodigoLido={(codigo) => {
          lidos.push(codigo);
        }}
      />,
    );
    await usuario.click(screen.getByTestId('abrir-scanner-camera'));
    await waitFor(() => {
      expect(camera.getUserMedia).toHaveBeenCalledTimes(1);
    });

    unmount();
    detector.resolver();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(lidos).toEqual([]);
  });
});

describe('ScannerCamera — permissão negada (FR-006)', () => {
  it('explica a falha e devolve o operador ao campo de código, que nunca deixou de existir', async () => {
    const usuario = userEvent.setup();
    camera = instalarCameraFalsa(true);
    definirUserAgent(UA_CHROME_ANDROID);
    instalarBarcodeDetector(CODIGO_LIDO);

    renderizarComProvedores(<EtapaClienteProdutos />);
    await usuario.click(screen.getByTestId('abrir-scanner-camera'));

    await waitFor(() => {
      expect(screen.getByTestId('erro-scanner-camera')).toBeInTheDocument();
    });
    // Sem vídeo, e sem trilha para desligar: a câmera nunca chegou a abrir.
    expect(screen.queryByTestId('video-scanner')).toBeNull();
    expect(camera.trilhasEncerradas()).toBe(0);

    // A saída declarada no próprio texto do erro: fechar e digitar. O campo
    // segue montado e habilitado — a recusa da câmera não pode travar a venda.
    await usuario.click(screen.getByTestId('fechar-scanner-camera'));
    const campo = screen.getByTestId('campo-codigo-produto');
    expect(campo).toBeEnabled();

    await usuario.type(campo, `${CODIGO_LIDO}{Enter}`);
    await waitFor(() => {
      expect(useVendaStore.getState().linhas).toHaveLength(1);
    });
  });

  it('uma segunda tentativa parte do zero, sem o erro da primeira na tela', async () => {
    const usuario = userEvent.setup();
    camera = instalarCameraFalsa(true);
    definirUserAgent(UA_CHROME_ANDROID);
    instalarBarcodeDetectorPendente(CODIGO_LIDO);

    renderizarComProvedores(<EtapaClienteProdutos />);
    await usuario.click(screen.getByTestId('abrir-scanner-camera'));
    await waitFor(() => {
      expect(screen.getByTestId('erro-scanner-camera')).toBeInTheDocument();
    });
    await usuario.click(screen.getByTestId('fechar-scanner-camera'));

    // O operador concede a permissão nas configurações do navegador e tenta de
    // novo: a mensagem da tentativa anterior não pode sobreviver à nova.
    camera = instalarCameraFalsa();
    await usuario.click(screen.getByTestId('abrir-scanner-camera'));

    await waitFor(() => {
      expect(camera.getUserMedia).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByTestId('erro-scanner-camera')).toBeNull();
    expect(screen.getByTestId('video-scanner')).toBeInTheDocument();
  });
});

/**
 * A câmera é o **único** caminho de entrada que não passa pelo campo de código,
 * e o campo fica desabilitado justamente nos dois estados abaixo — prévia
 * resolvida e item carregado pelo lápis. Enquanto ninguém verificou isso, o
 * botão "Scanner" seguiu ativo por cima dos dois (revisão da 007, 2026-09-09):
 * a leitura era descartada em silêncio num caso e inseria produto por cima de
 * uma edição em curso no outro.
 *
 * A política verificada aqui é a de `capturarPorCamera`, a mesma de
 * `selecionarDaBusca`: a leitura nova **vence** o que estava pendente. Recusar
 * seria pior — a única forma de cancelar uma prévia é `Escape`, e no layout
 * compacto, o único onde a câmera existe, não há teclado.
 */
describe('ScannerCamera — leitura com prévia ou edição pendente (revisão da 007)', () => {
  /**
   * `fetch` que devolve um produto diferente a cada chamada: o primeiro abre a
   * prévia (`ProdutoPesavelEditavel: 'E'`), o segundo entra direto no carrinho.
   * Com um único produto para as duas chamadas não daria para distinguir "a
   * leitura substituiu a prévia" de "a leitura foi descartada".
   */
  function stubarGetProdutoEmSequencia(respostas: readonly Record<string, unknown>[]): void {
    let chamada = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => {
        const produto = respostas[Math.min(chamada, respostas.length - 1)];
        chamada += 1;
        return Promise.resolve(
          new Response(JSON.stringify({ Produto: produto }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        );
      }),
    );
  }

  it('a leitura substitui a prévia resolvida em vez de ser descartada', async () => {
    const usuario = userEvent.setup();
    stubarGetProdutoEmSequencia([
      respostaGetProduto({ ProdutoPesavelEditavel: 'E', CodigoBarras: '7890000000009' }),
      respostaGetProduto(),
    ]);
    definirUserAgent(UA_CHROME_ANDROID);
    instalarBarcodeDetector(CODIGO_LIDO);

    renderizarComProvedores(<EtapaClienteProdutos />);

    // Produto `'E'`: não entra no carrinho, abre a revisão na barra e desabilita
    // o campo de código — o estado em que a câmera não tinha como entrar.
    await usuario.type(screen.getByTestId('campo-codigo-produto'), '7890000000009{Enter}');
    await waitFor(() => {
      expect(screen.getByTestId('campo-codigo-produto')).toBeDisabled();
    });
    expect(useVendaStore.getState().linhas).toHaveLength(0);

    await usuario.click(screen.getByTestId('abrir-scanner-camera'));

    // Antes da correção nada acontecia aqui: `confirmarEntradaRapida` voltava
    // cedo por `resolvido !== null`, e o campo — ainda desabilitado — passava a
    // exibir um código que não correspondia ao produto na prévia.
    await waitFor(() => {
      expect(useVendaStore.getState().linhas).toHaveLength(1);
    });
    expect(screen.getByTestId('campo-codigo-produto')).not.toBeDisabled();
  });

  it('a leitura descarta o item carregado pelo lápis e não o deixa em edição', async () => {
    const usuario = userEvent.setup();
    const linhaExistente = linhaDe({ idLinha: 'linha-em-edicao', quantidadeEmUnidades: 2 });
    useVendaStore.setState({ linhas: [linhaExistente] });
    useEdicaoItemStore.setState({ linhaEmEdicao: linhaExistente });
    definirUserAgent(UA_CHROME_ANDROID);
    instalarBarcodeDetector(CODIGO_LIDO);

    renderizarComProvedores(<EtapaClienteProdutos />);
    expect(screen.getByTestId('campo-codigo-produto')).toBeDisabled();

    await usuario.click(screen.getByTestId('abrir-scanner-camera'));

    await waitFor(() => {
      expect(useVendaStore.getState().linhas).toHaveLength(2);
    });
    // O ponto da regressão: antes a linha nova entrava **e** a barra continuava
    // em modo de edição da outra linha — contorno pulsante, campos da linha
    // antiga, campo de código travado sobre um carrinho que acabou de mudar.
    expect(useEdicaoItemStore.getState().linhaEmEdicao).toBeNull();
    expect(screen.getByTestId('campo-codigo-produto')).not.toBeDisabled();
  });
});
