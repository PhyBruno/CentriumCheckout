import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EtapaClienteProdutos } from '../../src/client/layout/mobile/EtapaClienteProdutos';
import { useEdicaoItemStore } from '../../src/client/stores/edicaoItemStore';
import { useSessionStore } from '../../src/client/stores/sessionStore';
import { useVendaStore } from '../../src/client/stores/vendaStore';
import { instalarMatchMediaDeLayout, renderizarComProvedores } from '../support/layout';
import { respostaGetProduto } from '../support/precificacao';
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

function removerBarcodeDetector(): void {
  Reflect.deleteProperty(window as unknown as Record<string, unknown>, 'BarcodeDetector');
}

function instalarCameraFalsa(): void {
  Object.defineProperty(window.navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi.fn().mockResolvedValue({
        getTracks: () => [{ stop: vi.fn() }],
      } as unknown as MediaStream),
    },
  });
  // jsdom não implementa `HTMLMediaElement.play`.
  Object.defineProperty(window.HTMLMediaElement.prototype, 'play', {
    configurable: true,
    value: vi.fn().mockResolvedValue(undefined),
  });
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

beforeAll(() => {
  instalarMatchMediaDeLayout();
  window.ResizeObserver = ResizeObserverStub;
  instalarCameraFalsa();
});

beforeEach(() => {
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
});
