import { afterEach, describe, expect, it, vi } from 'vitest';
import { abrirPdfNFCe } from '../../../../src/client/services/impressao/abrirPdfNFCe';

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
    vi.restoreAllMocks();
  });

  function stubarUrl() {
    const criar = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:pdf-1');
    const revogar = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    return { criar, revogar };
  }

  it('não pede noopener, para o retorno do window.open dizer se a aba abriu', () => {
    stubarUrl();
    const janela = { opener: {} as unknown } as Window;
    const abrirJanela = vi.fn<typeof window.open>(() => janela);

    abrirPdfNFCe(PDF_BASE64, { abrirJanela, agendarRevogacao: () => undefined });

    const features = abrirJanela.mock.calls[0]?.[2] ?? '';
    expect(features).not.toMatch(/noopener/);
  });

  it('aba aberta: responde aberto, corta o opener e só revoga a URL depois', () => {
    const { revogar } = stubarUrl();
    const janela = { opener: {} as unknown } as Window;
    const agendada: (() => void)[] = [];

    const resultado = abrirPdfNFCe(PDF_BASE64, {
      abrirJanela: () => janela,
      agendarRevogacao: (fn) => {
        agendada.push(fn);
      },
    });

    expect(resultado).toEqual({ estado: 'aberto' });
    // Sem `noopener`, a proteção contra a aba mexer nesta é feita à mão.
    expect(janela.opener).toBeNull();
    expect(revogar).not.toHaveBeenCalled();
    agendada.forEach((fn) => {
      fn();
    });
    expect(revogar).toHaveBeenCalledWith('blob:pdf-1');
  });

  it('pop-up recusado (retorno null): responde bloqueado e revoga a URL', () => {
    const { revogar } = stubarUrl();

    const resultado = abrirPdfNFCe(PDF_BASE64, {
      abrirJanela: () => null,
      agendarRevogacao: () => undefined,
    });

    expect(resultado).toEqual({ estado: 'bloqueado-pelo-navegador' });
    expect(revogar).toHaveBeenCalledWith('blob:pdf-1');
  });

  it('base64 corrompido: responde pdf-invalido sem abrir aba', () => {
    const abrirJanela = vi.fn<typeof window.open>(() => null);

    const resultado = abrirPdfNFCe('%%%não-é-base64', { abrirJanela });

    expect(resultado).toEqual({ estado: 'pdf-invalido' });
    expect(abrirJanela).not.toHaveBeenCalled();
  });
});
