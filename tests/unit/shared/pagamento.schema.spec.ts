import { describe, expect, it, vi } from 'vitest';
import {
  bootstrapPagamentoSchema,
  condicoesDePagamentoSchema,
  configuracoesPIXSchema,
  configuracoesTEFSchema,
  filtrarFormasValidas,
  sessaoPagamentoSchema,
  validaTicketDevolucaoOutputSchema,
} from '../../../src/shared/schemas/pagamento.schema';

/** T007 — validação de fronteira do catálogo de pagamento e do vale devolução. */

function formaValida(sobrescritas: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    FormaCodigo: 1,
    FormaDescricao: 'DINHEIRO',
    FormaEntrada: 'S',
    FormaMeioPagtoNFe: 'Dinheiro',
    FormaIntegracaoCartao: '',
    FormaTipoTransacaoTEF: '',
    FormaFpgUtiCar: '',
    ...sobrescritas,
  };
}

function condicaoValida(sobrescritas: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    CondicaoCodigo: 1,
    CondicaoDescricao: 'A VISTA',
    CondicaoPrazo: 0,
    CondicaoMinimoEntrada: 0,
    CondicaoDesconto: 0,
    CondicaoDescontoMaximo: 0,
    CondicaoFormasDePagamento: [formaValida()],
    ...sobrescritas,
  };
}

describe('condicoesDePagamentoSchema — conversão double → Centavos', () => {
  it('converte CondicaoMinimoEntrada de double para Centavos inteiros', () => {
    const [condicao] = condicoesDePagamentoSchema.parse([
      condicaoValida({ CondicaoMinimoEntrada: 25.5 }),
    ]);

    expect(condicao?.CondicaoMinimoEntrada).toBe(2550);
    expect(Number.isInteger(condicao?.CondicaoMinimoEntrada)).toBe(true);
  });

  it('não converte CondicaoDesconto/CondicaoDescontoMaximo — são percentual, não dinheiro', () => {
    const [condicao] = condicoesDePagamentoSchema.parse([
      condicaoValida({ CondicaoDesconto: 12.5, CondicaoDescontoMaximo: 30 }),
    ]);

    expect(condicao?.CondicaoDesconto).toBe(12.5);
    expect(condicao?.CondicaoDescontoMaximo).toBe(30);
  });
});

describe('filtrarFormasValidas / condicoesDePagamentoSchema — FormaMeioPagtoNFe desconhecido', () => {
  it('descarta só a forma com FormaMeioPagtoNFe desconhecido, mantém as demais, sem lançar', () => {
    const espiao = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const [condicao] = condicoesDePagamentoSchema.parse([
      condicaoValida({
        CondicaoFormasDePagamento: [
          formaValida({ FormaCodigo: 1, FormaMeioPagtoNFe: 'Dinheiro' }),
          formaValida({ FormaCodigo: 2, FormaMeioPagtoNFe: 'MeioNovoDoErpAindaNaoMapeado' }),
          formaValida({ FormaCodigo: 3, FormaMeioPagtoNFe: 'Pix' }),
        ],
      }),
    ]);

    expect(condicao?.CondicaoFormasDePagamento).toHaveLength(2);
    expect(condicao?.CondicaoFormasDePagamento.map((f) => f.FormaCodigo)).toEqual([1, 3]);
    expect(espiao).toHaveBeenCalledTimes(1);
    expect(espiao.mock.calls[0]?.[0]).toContain('MeioNovoDoErpAindaNaoMapeado');

    espiao.mockRestore();
  });

  it('não lança quando toda forma da condição tem FormaMeioPagtoNFe desconhecido', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(() =>
      condicoesDePagamentoSchema.parse([
        condicaoValida({
          CondicaoFormasDePagamento: [formaValida({ FormaMeioPagtoNFe: 'AlgoDesconhecido' })],
        }),
      ]),
    ).not.toThrow();

    vi.restoreAllMocks();
  });

  it('filtrarFormasValidas aceita a lista bruta diretamente e produz o mesmo resultado', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const validas = filtrarFormasValidas(
      [
        {
          FormaCodigo: 1,
          FormaDescricao: 'DINHEIRO',
          FormaEntrada: 'S',
          FormaMeioPagtoNFe: 'Dinheiro',
          FormaIntegracaoCartao: '',
          FormaTipoTransacaoTEF: '',
          FormaFpgUtiCar: '',
        },
        {
          FormaCodigo: 2,
          FormaDescricao: 'DESCONHECIDA',
          FormaEntrada: 'N',
          FormaMeioPagtoNFe: 'AlgoDesconhecido',
          FormaIntegracaoCartao: '',
          FormaTipoTransacaoTEF: '',
          FormaFpgUtiCar: '',
        },
      ],
      1,
    );

    expect(validas).toHaveLength(1);
    expect(validas[0]?.FormaCodigo).toBe(1);

    vi.restoreAllMocks();
  });
});

describe('condicoesDePagamentoSchema — FormaIntegracaoCartao/FormaFpgUtiCar', () => {
  it('FormaIntegracaoCartao ausente vira string vazia', () => {
    const bruta = formaValida();
    delete bruta['FormaIntegracaoCartao'];

    const [condicao] = condicoesDePagamentoSchema.parse([
      condicaoValida({ CondicaoFormasDePagamento: [bruta] }),
    ]);

    expect(condicao?.CondicaoFormasDePagamento[0]?.FormaIntegracaoCartao).toBe('');
  });

  it('FormaIntegracaoCartao null vira string vazia', () => {
    const [condicao] = condicoesDePagamentoSchema.parse([
      condicaoValida({
        CondicaoFormasDePagamento: [formaValida({ FormaIntegracaoCartao: null })],
      }),
    ]);

    expect(condicao?.CondicaoFormasDePagamento[0]?.FormaIntegracaoCartao).toBe('');
  });

  it.each(['1', '2'])('aceita FormaIntegracaoCartao = "%s"', (valor) => {
    const [condicao] = condicoesDePagamentoSchema.parse([
      condicaoValida({
        CondicaoFormasDePagamento: [formaValida({ FormaIntegracaoCartao: valor })],
      }),
    ]);

    expect(condicao?.CondicaoFormasDePagamento[0]?.FormaIntegracaoCartao).toBe(valor);
  });

  it('FormaFpgUtiCar ausente vira string vazia (AD-048: vazio = elegível)', () => {
    const bruta = formaValida();
    delete bruta['FormaFpgUtiCar'];

    const [condicao] = condicoesDePagamentoSchema.parse([
      condicaoValida({ CondicaoFormasDePagamento: [bruta] }),
    ]);

    expect(condicao?.CondicaoFormasDePagamento[0]?.FormaFpgUtiCar).toBe('');
  });

  it('FormaFpgUtiCar null vira string vazia', () => {
    const [condicao] = condicoesDePagamentoSchema.parse([
      condicaoValida({
        CondicaoFormasDePagamento: [formaValida({ FormaFpgUtiCar: null })],
      }),
    ]);

    expect(condicao?.CondicaoFormasDePagamento[0]?.FormaFpgUtiCar).toBe('');
  });
});

describe('condicoesDePagamentoSchema — FormaEntrada obrigatório (FR-022/AD-111)', () => {
  it('recusa forma sem FormaEntrada — erro de fronteira, não default silencioso', () => {
    const bruta = formaValida();
    delete bruta['FormaEntrada'];

    expect(() =>
      condicoesDePagamentoSchema.parse([condicaoValida({ CondicaoFormasDePagamento: [bruta] })]),
    ).toThrow();
  });

  it('recusa forma com FormaEntrada null', () => {
    expect(() =>
      condicoesDePagamentoSchema.parse([
        condicaoValida({ CondicaoFormasDePagamento: [formaValida({ FormaEntrada: null })] }),
      ]),
    ).toThrow();
  });
});

describe('configuracoesTEFSchema / configuracoesPIXSchema — bloco ausente', () => {
  it('sessaoPagamentoSchema aceita sessão sem ConfiguracoesTEF nem ConfiguracoesPIX', () => {
    const resultado = sessaoPagamentoSchema.safeParse({
      CondicoesDePagamento: [condicaoValida()],
    });

    expect(resultado.success).toBe(true);
    if (resultado.success) {
      expect(resultado.data.ConfiguracoesTEF).toBeUndefined();
      expect(resultado.data.ConfiguracoesPIX).toBeUndefined();
    }
  });

  it('configuracoesTEFSchema exige TEFAtivo quando o bloco está presente', () => {
    expect(configuracoesTEFSchema.safeParse({ TEFAtivo: true }).success).toBe(true);
    expect(configuracoesTEFSchema.safeParse({}).success).toBe(false);
  });

  it('configuracoesPIXSchema exige UtilizaCentriumPAG quando o bloco está presente', () => {
    expect(
      configuracoesPIXSchema.safeParse({ UtilizaCentriumPAG: true, MinimoPix: 0, TempoEspera: 10 })
        .success,
    ).toBe(true);
    expect(configuracoesPIXSchema.safeParse({}).success).toBe(false);
  });

  it('bootstrapPagamentoSchema aceita o envelope completo do bootstrap sintético', () => {
    const resultado = bootstrapPagamentoSchema.safeParse({
      codigoEmpresa: '1',
      tenant: 'acme',
      SessaoUsuario: {
        CondicoesDePagamento: [condicaoValida()],
        ConfiguracoesTEF: { TEFAtivo: true },
        ConfiguracoesPIX: { UtilizaCentriumPAG: true, MinimoPix: 0, TempoEspera: 10 },
      },
    });

    expect(resultado.success).toBe(true);
  });
});

describe('validaTicketDevolucaoOutputSchema', () => {
  it('converte ValorTicket de double para Centavos inteiros', () => {
    const resultado = validaTicketDevolucaoOutputSchema.parse({
      ValorTicket: 25.5,
      Valido: true,
      Mensagem: 'Ticket Válido',
    });

    expect(resultado.ValorTicket).toBe(2550);
    expect(Number.isInteger(resultado.ValorTicket)).toBe(true);
  });

  it('aceita Valido = false com Mensagem de recusa', () => {
    const resultado = validaTicketDevolucaoOutputSchema.safeParse({
      ValorTicket: 0,
      Valido: false,
      Mensagem: 'Ticket já utilizado',
    });

    expect(resultado.success).toBe(true);
  });

  it('recusa resposta sem Valido — erro de fronteira', () => {
    const resultado = validaTicketDevolucaoOutputSchema.safeParse({
      ValorTicket: 10,
      Mensagem: 'Ticket Válido',
    });

    expect(resultado.success).toBe(false);
  });
});
