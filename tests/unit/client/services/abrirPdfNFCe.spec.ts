import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  abrirPdfNFCe,
  descartarPdfVigente,
} from '../../../../src/client/services/impressao/abrirPdfNFCe';

/** `%PDF` em base64 — o conteúdo não importa, só precisa decodificar. */
const PDF_BASE64 = 'JVBERg==';

/**
 * AD-247 (achado do usuário, 2026-09-17): a aba abria e o modal dizia "O
 * navegador bloqueou a aba do PDF". Com `noopener` nas features, o
 * `window.open` devolve `null` **sempre** (especificação do HTML), então o
 * `null` não distinguia aba aberta de pop-up recusado.
 */
describe('abrirPdfNFCe', () => {
  afterEach(() => {
    descartarPdfVigente();
    vi.restoreAllMocks();
  });

  function stubarUrl() {
    let criadas = 0;
    const criar = vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
      criadas += 1;
      return `blob:pdf-${String(criadas)}`;
    });
    const revogar = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    return { criar, revogar };
  }

  it('não pede noopener, para o retorno do window.open dizer se a aba abriu', () => {
    stubarUrl();
    const janela = { opener: {} as unknown } as Window;
    const abrirJanela = vi.fn<typeof window.open>(() => janela);

    abrirPdfNFCe(PDF_BASE64, { abrirJanela });

    const features = abrirJanela.mock.calls[0]?.[2] ?? '';
    expect(features).not.toMatch(/noopener/);
  });

  it('aba aberta: responde aberto, corta o opener e mantém a URL viva', () => {
    const { revogar } = stubarUrl();
    const janela = { opener: {} as unknown } as Window;

    const resultado = abrirPdfNFCe(PDF_BASE64, { abrirJanela: () => janela });

    expect(resultado).toEqual({ estado: 'aberto' });
    // Sem `noopener`, a proteção contra a aba mexer nesta é feita à mão.
    expect(janela.opener).toBeNull();
    expect(revogar).not.toHaveBeenCalled();
  });

  /**
   * Correção do usuário, 2026-09-24 (AD-254): com a aba recusada, o link do
   * aviso de pop-up bloqueado do navegador morria na hora, e o botão do modal
   * abria outro link. Os dois precisam ser o mesmo, e os dois válidos.
   */
  it('pop-up recusado: responde bloqueado e a URL continua válida', () => {
    const { revogar } = stubarUrl();

    const resultado = abrirPdfNFCe(PDF_BASE64, { abrirJanela: () => null });

    expect(resultado).toEqual({ estado: 'bloqueado-pelo-navegador' });
    expect(revogar).not.toHaveBeenCalled();
  });

  it('o botão do modal abre o mesmo link que o navegador bloqueou', () => {
    const { criar } = stubarUrl();
    const abrirJanela = vi.fn<typeof window.open>(() => null);

    abrirPdfNFCe(PDF_BASE64, { abrirJanela });
    abrirPdfNFCe(PDF_BASE64, { abrirJanela });

    expect(criar).toHaveBeenCalledTimes(1);
    expect(abrirJanela.mock.calls.map((chamada) => chamada[0])).toEqual([
      'blob:pdf-1',
      'blob:pdf-1',
    ]);
  });

  it('o PDF da venda seguinte revoga o link do anterior', () => {
    const { revogar } = stubarUrl();
    const abrirJanela = vi.fn<typeof window.open>(() => null);

    abrirPdfNFCe(PDF_BASE64, { abrirJanela });
    abrirPdfNFCe('JVBERi0x', { abrirJanela });

    expect(revogar).toHaveBeenCalledTimes(1);
    expect(revogar).toHaveBeenCalledWith('blob:pdf-1');
    expect(abrirJanela.mock.calls[1]?.[0]).toBe('blob:pdf-2');
  });

  it('base64 corrompido: responde pdf-invalido sem abrir aba', () => {
    const abrirJanela = vi.fn<typeof window.open>(() => null);

    const resultado = abrirPdfNFCe('%%%não-é-base64', { abrirJanela });

    expect(resultado).toEqual({ estado: 'pdf-invalido' });
    expect(abrirJanela).not.toHaveBeenCalled();
  });
});
