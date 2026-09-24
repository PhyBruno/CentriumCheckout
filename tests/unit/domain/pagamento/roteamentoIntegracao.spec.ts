import { describe, expect, it } from 'vitest';
import {
  formaDisponivel,
  resolverIntegracao,
} from '../../../../src/client/domain/pagamento/roteamentoIntegracao';
import { MEIO_PAGTO } from '../../../../src/client/domain/pagamento/formaPagamento';
import { formaDe } from '../../../support/pagamento';

describe('resolverIntegracao — tabela de decisão (research.md D5)', () => {
  it('CartaoCredito com TEF ativo e forma marcada como TEF roteia para TEF', () => {
    expect(
      resolverIntegracao(
        formaDe({ meioPagtoNFe: MEIO_PAGTO.CartaoCredito, integracaoCartao: '1' }),
        {
          tefAtivo: true,
          pixAtivo: false,
        },
      ),
    ).toBe('TEF');
  });

  it('CartaoDebito sem TEF ativo não roteia', () => {
    expect(
      resolverIntegracao(
        formaDe({ meioPagtoNFe: MEIO_PAGTO.CartaoDebito, integracaoCartao: '1' }),
        {
          tefAtivo: false,
          pixAtivo: false,
        },
      ),
    ).toBe('NENHUMA');
  });

  it('Pix com PIX ativo roteia para PIX_DINAMICO', () => {
    expect(
      resolverIntegracao(formaDe({ meioPagtoNFe: MEIO_PAGTO.Pix }), {
        tefAtivo: false,
        pixAtivo: true,
      }),
    ).toBe('PIX_DINAMICO');
  });

  it('PixEstatico nunca integra, mesmo com PIX ativo (FR-006)', () => {
    expect(
      resolverIntegracao(formaDe({ meioPagtoNFe: MEIO_PAGTO.PixEstatico }), {
        tefAtivo: true,
        pixAtivo: true,
      }),
    ).toBe('NENHUMA');
  });

  it('Dinheiro nunca integra', () => {
    expect(
      resolverIntegracao(formaDe({ meioPagtoNFe: MEIO_PAGTO.Dinheiro }), {
        tefAtivo: true,
        pixAtivo: true,
      }),
    ).toBe('NENHUMA');
  });
});

describe('AD-180 (2026-09-08) — `integracaoCartao` decide TEF junto com `tefAtivo`', () => {
  const EMPRESA_COM_TEF = { tefAtivo: true, pixAtivo: false };

  it.each(['2', ''] as const)(
    'cartão cadastrado como POS (integracaoCartao = "%s") não chama TEF, mesmo com tefAtivo',
    (integracaoCartao) => {
      // A empresa usa TEF, mas escolheu cobrar esta forma em maquininha avulsa.
      expect(
        resolverIntegracao(formaDe({ meioPagtoNFe: MEIO_PAGTO.CartaoCredito, integracaoCartao }), {
          ...EMPRESA_COM_TEF,
        }),
      ).toBe('NENHUMA');
    },
  );

  it('débito cadastrado como TEF chama TEF quando a empresa tem TEF', () => {
    expect(
      resolverIntegracao(
        formaDe({ meioPagtoNFe: MEIO_PAGTO.CartaoDebito, integracaoCartao: '1' }),
        EMPRESA_COM_TEF,
      ),
    ).toBe('TEF');
  });

  it('forma marcada como TEF em empresa sem TEF continua sem integração', () => {
    // As duas condições são necessárias; nenhuma delas basta sozinha.
    expect(
      resolverIntegracao(
        formaDe({ meioPagtoNFe: MEIO_PAGTO.CartaoCredito, integracaoCartao: '1' }),
        {
          tefAtivo: false,
          pixAtivo: false,
        },
      ),
    ).toBe('NENHUMA');
  });

  it('PIX com `integracaoCartao` vazio segue no CentriumPAG', () => {
    // A leitura de AD-180 era que num PIX este campo fosse padding do GeneXus;
    // AD-250 mostrou que não é — ele também decide o PIX. O que permanece
    // verdadeiro é só o desfecho de `''`/`'2'`: cobrança pelo CentriumPAG.
    expect(
      resolverIntegracao(formaDe({ meioPagtoNFe: MEIO_PAGTO.Pix, integracaoCartao: '' }), {
        tefAtivo: true,
        pixAtivo: true,
      }),
    ).toBe('PIX_DINAMICO');
  });

  it('cartão POS continua disponível — vira pagamento avulso, não some da tela', () => {
    expect(
      formaDisponivel(
        formaDe({ meioPagtoNFe: MEIO_PAGTO.CartaoCredito, integracaoCartao: '2' }),
        EMPRESA_COM_TEF,
      ),
    ).toBe(true);
  });
});

describe('AD-250 (2026-09-21) — PIX cadastrado como TEF vai ao terminal, não ao QR Code', () => {
  const PIX_TEF = { meioPagtoNFe: MEIO_PAGTO.Pix, integracaoCartao: '1' } as const;

  it('gera TEF, e não QR Code, mesmo com o CentriumPAG ligado', () => {
    // O ponto da regra: `pixAtivo` não desempata. Uma forma de PIX cadastrada
    // como TEF cobra pelo terminal, e gerar a cobrança no CentriumPAG criaria
    // um segundo QR Code para um dinheiro que o TEF já está cobrando.
    expect(resolverIntegracao(formaDe(PIX_TEF), { tefAtivo: true, pixAtivo: true })).toBe('TEF');
  });

  it('roteia para TEF também com o CentriumPAG desligado', () => {
    expect(resolverIntegracao(formaDe(PIX_TEF), { tefAtivo: true, pixAtivo: false })).toBe('TEF');
  });

  it.each(['2', ''] as const)(
    'PIX cadastrado como POS (integracaoCartao = "%s") continua gerando QR Code',
    (integracaoCartao) => {
      expect(
        resolverIntegracao(formaDe({ meioPagtoNFe: MEIO_PAGTO.Pix, integracaoCartao }), {
          tefAtivo: true,
          pixAtivo: true,
        }),
      ).toBe('PIX_DINAMICO');
    },
  );

  it('em empresa sem TEF, o PIX marcado como TEF volta à regra normal do PIX', () => {
    // Mesmas duas condições do cartão (AD-180): `tefAtivo` diz que a empresa
    // tem terminal; sem ele não há para onde mandar, e o CentriumPAG assume.
    expect(resolverIntegracao(formaDe(PIX_TEF), { tefAtivo: false, pixAtivo: true })).toBe(
      'PIX_DINAMICO',
    );
  });

  it('sem TEF na empresa e sem CentriumPAG não sobra integração nenhuma', () => {
    expect(resolverIntegracao(formaDe(PIX_TEF), { tefAtivo: false, pixAtivo: false })).toBe(
      'NENHUMA',
    );
  });

  it('PixEstatico marcado como TEF continua sem integrar (FR-006)', () => {
    // `FR-006` é sobre o meio, não sobre o cadastro: PIX estático não tem
    // cobrança a acionar em lugar nenhum.
    expect(
      resolverIntegracao(formaDe({ meioPagtoNFe: MEIO_PAGTO.PixEstatico, integracaoCartao: '1' }), {
        tefAtivo: true,
        pixAtivo: true,
      }),
    ).toBe('NENHUMA');
  });

  it('PIX-TEF fica disponível sem CentriumPAG — o caminho é o terminal', () => {
    expect(formaDisponivel(formaDe(PIX_TEF), { tefAtivo: true, pixAtivo: false })).toBe(true);
  });

  it('PIX-TEF sem TEF na empresa e sem CentriumPAG fica indisponível', () => {
    expect(formaDisponivel(formaDe(PIX_TEF), { tefAtivo: false, pixAtivo: false })).toBe(false);
  });
});

describe('formaDisponivel — FR-002/FR-003', () => {
  it('Pix com PIX inativo fica indisponível — não há caminho manual', () => {
    expect(
      formaDisponivel(formaDe({ meioPagtoNFe: MEIO_PAGTO.Pix }), {
        tefAtivo: true,
        pixAtivo: false,
      }),
    ).toBe(false);
  });

  it('cartão continua disponível sem TEF ativo — vira pagamento manual', () => {
    expect(
      formaDisponivel(formaDe({ meioPagtoNFe: MEIO_PAGTO.CartaoCredito }), {
        tefAtivo: false,
        pixAtivo: false,
      }),
    ).toBe(true);
  });

  it('PixEstatico está sempre disponível', () => {
    expect(
      formaDisponivel(formaDe({ meioPagtoNFe: MEIO_PAGTO.PixEstatico }), {
        tefAtivo: false,
        pixAtivo: false,
      }),
    ).toBe(true);
  });
});

describe('AD-144 (2026-09-03) — o veredito não depende de layout', () => {
  it('resolverIntegracao só aceita forma + capacidades, sem parâmetro de plataforma', () => {
    // Mudar isso silenciosamente reintroduziria o campo de layout que
    // AD-144 removeu do contrato.
    expect(resolverIntegracao.length).toBe(2);
  });

  it('cartão com TEF ativo roteia para TEF independente do layout, mobile incluído', () => {
    // `CapacidadesPagamento` não tem campo de plataforma — este objeto é
    // exatamente o shape do contrato, e o resultado não muda conforme onde a
    // tela roda (a exclusão de TEF no mobile de AD-074 foi revogada).
    const capacidadesSemPlataforma = { tefAtivo: true, pixAtivo: false };
    expect(
      resolverIntegracao(
        formaDe({ meioPagtoNFe: MEIO_PAGTO.CartaoCredito, integracaoCartao: '1' }),
        capacidadesSemPlataforma,
      ),
    ).toBe('TEF');
  });
});
