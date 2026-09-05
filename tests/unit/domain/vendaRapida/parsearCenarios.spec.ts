import { describe, expect, it, vi } from 'vitest';
import {
  interpretarEncerraOperacao,
  parsearCenarios,
  parsearItemDeCenario,
} from '../../../../src/client/domain/vendaRapida/parsearCenarios';

/**
 * Parser de fronteira da venda rápida (T004) — invariantes I3, I4 e I11 de
 * `specs/013-venda-rapida-cenario-pagamento/data-model.md`.
 *
 * I1 (normalização e faixa da tecla) é exercitada em `projetarAtalhos.spec.ts`:
 * a etapa que decide tecla é E3, na projeção, e o parser guarda o campo cru de
 * propósito. Aqui só se afirma que ele **não** interpreta a tecla.
 *
 * A fixture é a de `quickstart.md`, sintética — nenhum dado de produção.
 */

/** Fixture de `quickstart.md`: cinco itens, três deles viram atalho. */
const CATALOGO_QUICKSTART = JSON.stringify([
  '1;DINHEIRO;1;A VISTA;Dinheiro à vista;True;F6',
  '3;CARTAO DEB;1;A VISTA;Débito à vista;False;f7 ',
  '7;CREDIARIO;30;30 DIAS;Crediário;False;',
  '9;VALE;1;A VISTA;Vale;Ops; promo;True;F8',
  '4;PIX;1;A VISTA;PIX à vista;True;F9',
]);

describe('parsearCenarios — E1: entrada ilegível degrada para lista vazia (I4)', () => {
  it.each([
    ['campo ausente', undefined],
    ['string vazia', ''],
    ['só espaços', '   '],
    ['JSON malformado', '{não é json'],
    ['JSON válido que não é array', '{"a":1}'],
    ['array de números', '[1,2,3]'],
    ['campo que não é string', 42],
  ])('%s → [] sem lançar', (_rotulo, campo) => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(() => parsearCenarios(campo)).not.toThrow();
    expect(parsearCenarios(campo)).toEqual([]);
  });
});

describe('parsearItemDeCenario — E2: contagem de campos (I3, AD-105)', () => {
  it('aceita exatamente 7 campos', () => {
    const cenario = parsearItemDeCenario('1;DINHEIRO;1;A VISTA;Dinheiro à vista;True;F6');

    expect(cenario).toEqual({
      formaCodigo: 1,
      formaDescricao: 'DINHEIRO',
      condicaoCodigo: 1,
      condicaoDescricao: 'A VISTA',
      nome: 'Dinheiro à vista',
      encerraOperacao: true,
      teclaAtalho: 'F6',
    });
  });

  it.each([
    ['8 campos (`;` extra no nome)', '9;VALE;1;A VISTA;Vale;Ops; promo;True;F8'],
    ['6 campos', '1;DINHEIRO;1;A VISTA;Dinheiro;True'],
    ['string vazia', ''],
    ['forma não numérica', 'X;DINHEIRO;1;A VISTA;Dinheiro;True;F6'],
    ['condição não numérica', '1;DINHEIRO;A;A VISTA;Dinheiro;True;F6'],
    ['forma fracionária', '1.5;DINHEIRO;1;A VISTA;Dinheiro;True;F6'],
    ['nome vazio', '1;DINHEIRO;1;A VISTA;;True;F6'],
    ['nome só com espaços', '1;DINHEIRO;1;A VISTA;   ;True;F6'],
  ])('descarta: %s', (_rotulo, item) => {
    expect(parsearItemDeCenario(item)).toBeNull();
  });

  it('aceita o inteiro serializado com casas decimais, como o ERP real faz (AD-165)', () => {
    const cenario = parsearItemDeCenario('1.00000;DINHEIRO;30.00000;30 DIAS;Crediário;False;F9');

    expect(cenario?.formaCodigo).toBe(1);
    expect(cenario?.condicaoCodigo).toBe(30);
  });

  it('não interpreta a tecla — normalizar é E3, na projeção', () => {
    expect(parsearItemDeCenario('3;CARTAO;1;A VISTA;Débito;False;f7 ')?.teclaAtalho).toBe('f7 ');
    expect(parsearItemDeCenario('7;CRED;30;30 DIAS;Crediário;False;')?.teclaAtalho).toBe('');
    expect(parsearItemDeCenario('7;CRED;30;30 DIAS;Crediário;False;SHIFT+F2')?.teclaAtalho).toBe(
      'SHIFT+F2',
    );
  });
});

describe('interpretarEncerraOperacao — E2: conjunto fail-safe fechado (I11, AD-106)', () => {
  it.each(['True', 'true', 'TRUE', '1', 's', 'Sim', 'y', 'YES', ' true '])(
    '%s → true',
    (literal) => {
      expect(interpretarEncerraOperacao(literal)).toBe(true);
    },
  );

  it.each(['False', 'false', '0', '', '   ', 'talvez', 'N', 'não', '2', 'verdadeiro'])(
    '%s → false (na dúvida, não finaliza)',
    (literal) => {
      expect(interpretarEncerraOperacao(literal)).toBe(false);
    },
  );
});

describe('parsearCenarios — o item fora do padrão não interrompe os demais (I3)', () => {
  it('a fixture do quickstart devolve 4 cenários, sem o item de 8 campos', () => {
    const cenarios = parsearCenarios(CATALOGO_QUICKSTART);

    // O item com `;` extra no nome (`Vale;Ops; promo`) sai; os quatro restantes
    // ficam, **inclusive** o sem tecla — descartá-lo é E3, não E2.
    expect(cenarios.map((cenario) => cenario.nome)).toEqual([
      'Dinheiro à vista',
      'Débito à vista',
      'Crediário',
      'PIX à vista',
    ]);
  });

  it('preserva a ordem em que o ERP devolveu — E5 depende dela para o desempate', () => {
    const cenarios = parsearCenarios(
      JSON.stringify([
        '1;A;1;A VISTA;Primeiro;True;F6',
        'lixo',
        '2;B;1;A VISTA;Segundo;False;F6',
      ]),
    );

    expect(cenarios.map((cenario) => cenario.formaCodigo)).toEqual([1, 2]);
  });
});
