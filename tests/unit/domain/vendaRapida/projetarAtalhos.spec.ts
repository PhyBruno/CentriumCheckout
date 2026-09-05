import { describe, expect, it } from 'vitest';
import { ZERO_CENTAVOS } from '../../../../src/client/domain/precificacao/dinheiro';
import type { CondicaoPagamento } from '../../../../src/client/domain/pagamento/formaPagamento';
import { parsearCenarios } from '../../../../src/client/domain/vendaRapida/parsearCenarios';
import {
  buscarAtalho,
  projetarAtalhos,
} from '../../../../src/client/domain/vendaRapida/projetarAtalhos';
import type { CenarioPagamentoBruto } from '../../../../src/client/domain/vendaRapida/tipos';
import { formaDe } from '../../../support/pagamento';

/**
 * Projeção de atalhos (T005) — invariantes I1, I2, I5 e I10 de
 * `specs/013-venda-rapida-cenario-pagamento/data-model.md`.
 *
 * Puro: nenhum React, nenhum store. `plataforma` é parâmetro, o que torna I10
 * verificável sem renderizar nada.
 */

/* ------------------------------------------------------------------ *
 * Fixtures sintéticas de catálogo
 * ------------------------------------------------------------------ */

const DINHEIRO = formaDe({ codigo: 1, descricao: 'DINHEIRO', meioPagtoNFe: 'Dinheiro' });
const DEBITO = formaDe({ codigo: 3, descricao: 'CARTAO DEB', meioPagtoNFe: 'CartaoDebito' });
const PIX = formaDe({ codigo: 4, descricao: 'PIX', meioPagtoNFe: 'Pix' });

function condicaoDe(codigo: number, formas: readonly ReturnType<typeof formaDe>[]) {
  return {
    codigo,
    descricao: `CONDICAO ${String(codigo)}`,
    prazo: 0,
    minimoEntrada: ZERO_CENTAVOS,
    desconto: 0,
    descontoMaximo: 0,
    formas,
  } satisfies CondicaoPagamento;
}

/** À vista (1) tem dinheiro, débito e PIX; 30 dias (30) não tem forma alguma útil. */
const CATALOGO: readonly CondicaoPagamento[] = [
  condicaoDe(1, [DINHEIRO, DEBITO, PIX]),
  condicaoDe(30, [formaDe({ codigo: 7, descricao: 'CREDIARIO', meioPagtoNFe: 'Outros' })]),
];

function cenarioDe(opcoes: Partial<CenarioPagamentoBruto> = {}): CenarioPagamentoBruto {
  return {
    formaCodigo: opcoes.formaCodigo ?? 1,
    formaDescricao: opcoes.formaDescricao ?? 'DINHEIRO',
    condicaoCodigo: opcoes.condicaoCodigo ?? 1,
    condicaoDescricao: opcoes.condicaoDescricao ?? 'A VISTA',
    nome: opcoes.nome ?? 'Dinheiro à vista',
    encerraOperacao: opcoes.encerraOperacao ?? false,
    teclaAtalho: opcoes.teclaAtalho ?? 'F6',
  };
}

/* ------------------------------------------------------------------ *
 * I1 — faixa e normalização da tecla (E3)
 * ------------------------------------------------------------------ */

describe('projetarAtalhos — E3: só F6..F9, depois de normalizar (I1)', () => {
  it.each(['F6', 'F7', 'F8', 'F9', 'f7 ', ' f9', '  F8  ', 'f6'])(
    'aceita a tecla %s',
    (teclaAtalho) => {
      const atalhos = projetarAtalhos([cenarioDe({ teclaAtalho })], CATALOGO, 'desktop');

      expect(atalhos).toHaveLength(1);
      expect(atalhos[0]?.tecla).toBe(teclaAtalho.trim().toUpperCase());
    },
  );

  it.each(['', ' ', 'F5', 'F10', 'F', 'ENTER', 'SHIFT+F6', 'F6+', '6'])(
    'descarta a tecla %s',
    (teclaAtalho) => {
      expect(projetarAtalhos([cenarioDe({ teclaAtalho })], CATALOGO, 'desktop')).toEqual([]);
    },
  );
});

/* ------------------------------------------------------------------ *
 * I2 — teto de 4 e uma tecla por atalho (E3 + E5)
 * ------------------------------------------------------------------ */

describe('projetarAtalhos — E5: teto de quatro e desempate estável (I2)', () => {
  it('seis cenários válidos produzem no máximo quatro atalhos, um por tecla', () => {
    const cenarios = [
      cenarioDe({ teclaAtalho: 'F6', nome: 'Um' }),
      cenarioDe({ teclaAtalho: 'F7', nome: 'Dois', formaCodigo: 3 }),
      cenarioDe({ teclaAtalho: 'F8', nome: 'Três', formaCodigo: 4 }),
      cenarioDe({ teclaAtalho: 'F9', nome: 'Quatro' }),
      cenarioDe({ teclaAtalho: 'F6', nome: 'Cinco', formaCodigo: 3 }),
      cenarioDe({ teclaAtalho: 'F7', nome: 'Seis', formaCodigo: 4 }),
    ];

    const atalhos = projetarAtalhos(cenarios, CATALOGO, 'desktop');

    expect(atalhos).toHaveLength(4);
    expect(atalhos.map((atalho) => atalho.tecla)).toEqual(['F6', 'F7', 'F8', 'F9']);
  });

  it('na colisão de tecla vence o primeiro da ordem do ERP, e o resultado é estável', () => {
    const cenarios = [
      cenarioDe({ teclaAtalho: 'F6', nome: 'Primeiro', formaCodigo: 1 }),
      cenarioDe({ teclaAtalho: 'F6', nome: 'Segundo', formaCodigo: 3 }),
    ];

    const primeira = projetarAtalhos(cenarios, CATALOGO, 'desktop');
    const segunda = projetarAtalhos(cenarios, CATALOGO, 'desktop');

    expect(primeira[0]?.nome).toBe('Primeiro');
    expect(primeira[0]?.formaCodigo).toBe(1);
    expect(segunda).toEqual(primeira);
  });

  it('ordena pela tecla, não pela ordem do ERP — a faixa é lida de relance', () => {
    const cenarios = [
      cenarioDe({ teclaAtalho: 'F9', nome: 'PIX', formaCodigo: 4 }),
      cenarioDe({ teclaAtalho: 'F6', nome: 'Dinheiro', formaCodigo: 1 }),
    ];

    expect(projetarAtalhos(cenarios, CATALOGO, 'desktop').map((a) => a.tecla)).toEqual([
      'F6',
      'F9',
    ]);
  });
});

/* ------------------------------------------------------------------ *
 * I5 — o par (condição, forma) existe na sessão (E4)
 * ------------------------------------------------------------------ */

describe('projetarAtalhos — E4: cruzamento com o catálogo da sessão (I5)', () => {
  it('descarta cenário cuja condição não existe na sessão', () => {
    const cenarios = [cenarioDe({ condicaoCodigo: 999, teclaAtalho: 'F6' })];

    expect(projetarAtalhos(cenarios, CATALOGO, 'desktop')).toEqual([]);
  });

  it('descarta cenário cuja forma existe, mas em outra condição', () => {
    // Forma 1 (dinheiro) existe na condição 1, não na 30.
    const cenarios = [cenarioDe({ condicaoCodigo: 30, formaCodigo: 1, teclaAtalho: 'F6' })];

    expect(projetarAtalhos(cenarios, CATALOGO, 'desktop')).toEqual([]);
  });

  it('descarta tudo quando o catálogo da sessão está vazio', () => {
    expect(projetarAtalhos([cenarioDe()], [], 'desktop')).toEqual([]);
  });

  it('copia o meio de pagamento do catálogo, para a dica visual não reinterpretar nada', () => {
    const atalhos = projetarAtalhos(
      [cenarioDe({ formaCodigo: 4, teclaAtalho: 'F9', nome: 'PIX à vista' })],
      CATALOGO,
      'desktop',
    );

    expect(atalhos[0]?.meioPagtoNFe).toBe('Pix');
  });
});

/* ------------------------------------------------------------------ *
 * I10 — mobile não tem venda rápida (E6)
 * ------------------------------------------------------------------ */

describe('projetarAtalhos — E6: plataforma (I10, FR-020)', () => {
  const cenarios = [
    cenarioDe({ teclaAtalho: 'F6' }),
    cenarioDe({ teclaAtalho: 'F9', formaCodigo: 4 }),
  ];

  it('a mesma sessão produz atalhos no desktop e nenhum no mobile', () => {
    expect(projetarAtalhos(cenarios, CATALOGO, 'desktop')).toHaveLength(2);
    expect(projetarAtalhos(cenarios, CATALOGO, 'mobile')).toEqual([]);
  });
});

/* ------------------------------------------------------------------ *
 * Pipeline completo sobre a fixture de `quickstart.md` (C3)
 * ------------------------------------------------------------------ */

describe('pipeline completo — a fixture do quickstart produz exatamente F6, F7 e F9 (C3)', () => {
  const CATALOGO_QUICKSTART = JSON.stringify([
    '1;DINHEIRO;1;A VISTA;Dinheiro à vista;True;F6',
    '3;CARTAO DEB;1;A VISTA;Débito à vista;False;f7 ',
    '7;CREDIARIO;30;30 DIAS;Crediário;False;',
    '9;VALE;1;A VISTA;Vale;Ops; promo;True;F8',
    '4;PIX;1;A VISTA;PIX à vista;True;F9',
  ]);

  it('descarta o sem tecla e o de 8 campos, sem tocar nos válidos', () => {
    const atalhos = projetarAtalhos(parsearCenarios(CATALOGO_QUICKSTART), CATALOGO, 'desktop');

    expect(atalhos.map((atalho) => atalho.tecla)).toEqual(['F6', 'F7', 'F9']);
    expect(atalhos.map((atalho) => atalho.nome)).toEqual([
      'Dinheiro à vista',
      'Débito à vista',
      'PIX à vista',
    ]);
    expect(atalhos.map((atalho) => atalho.encerraOperacao)).toEqual([true, false, true]);
  });
});

describe('buscarAtalho', () => {
  const atalhos = projetarAtalhos(
    [cenarioDe({ teclaAtalho: 'F6' }), cenarioDe({ teclaAtalho: 'F9', formaCodigo: 4 })],
    CATALOGO,
    'desktop',
  );

  it('devolve o atalho da tecla', () => {
    expect(buscarAtalho(atalhos, 'F6')?.nome).toBe('Dinheiro à vista');
  });

  it('devolve undefined para tecla sem atalho', () => {
    expect(buscarAtalho(atalhos, 'F7')).toBeUndefined();
  });
});
