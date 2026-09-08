import { z } from 'zod';

/**
 * Validação de fronteira de `SessaoUsuario.CenarioPagamento` (feature 013,
 * T003, Constitution IV, `contracts/erp-cenario-pagamento-api.md` §4).
 *
 * O contrato OpenAPI declara o campo apenas como `string` (AD-104): por dentro
 * ele é um **array JSON serializado** de strings com sete campos posicionais
 * separados por `;`. `bootstrap.schema.ts` repassa a string íntegra, sem
 * interpretar — este módulo é o primeiro a olhar para dentro dela.
 *
 * **Escopo deliberadamente estreito.** O Zod aqui garante só duas coisas: que o
 * campo é uma string opcional e que, quando presente, o conteúdo é JSON de
 * `string[]`. A validação campo a campo (7 partes, tipos, tecla) fica no parser
 * (`domain/vendaRapida/parsearCenarios.ts`), **não** aqui — porque um item
 * malformado deve ser **descartado sozinho**, não fazer o schema inteiro
 * falhar (`FR-004`). Um `z.array` com refinamento por item reprovaria o
 * catálogo todo por causa de um cenário legado, e o operador perderia os
 * atalhos que funcionam.
 *
 * Nenhuma falha aqui propaga exceção: `parsearListaDeCenarios` devolve `[]` e o
 * pior desfecho possível é "nenhum atalho disponível" (`FR-007`, I4).
 */

/**
 * O campo como ele chega: `string`, opcional, aceitando ausente e vazio.
 *
 * `optional()` apesar de `bootstrap.schema.ts` exigir a `string`: aquele schema
 * descreve o payload que a feature 002 valida hoje, este descreve o que **esta**
 * feature tolera. Depender da obrigatoriedade do outro faria I4 ("catálogo
 * ausente ⇒ lista vazia, sem erro") depender de um schema de outra feature.
 */
export const campoCenarioPagamentoSchema = z.string().optional();

/** O conteúdo do campo, depois do `JSON.parse`: um array de strings. */
export const listaCenariosSerializadaSchema = z.array(z.string());

/**
 * Primeiro nível de parse (E1 — `parseJsonDeStrings` de `data-model.md` §2).
 *
 * Função **total**: campo ausente, vazio, JSON malformado ou JSON que não
 * representa `string[]` produzem `[]`. Falha de parse não é erro de aplicação e
 * não gera aviso ao operador — só registro técnico (`FR-007`).
 */
export function parsearListaDeCenarios(campo: unknown): readonly string[] {
  const bruto = campoCenarioPagamentoSchema.safeParse(campo);
  if (!bruto.success || bruto.data === undefined || bruto.data.trim() === '') {
    return [];
  }

  let conteudo: unknown;
  try {
    conteudo = JSON.parse(bruto.data);
  } catch {
    // Catálogo ilegível degrada para "sem atalhos" — nunca derruba a venda.
    console.warn('[cenarioPagamento] CenarioPagamento não é JSON válido: nenhum atalho disponível.');
    return [];
  }

  const lista = listaCenariosSerializadaSchema.safeParse(conteudo);
  if (!lista.success) {
    console.warn(
      '[cenarioPagamento] CenarioPagamento não é um array de strings: nenhum atalho disponível.',
    );
    return [];
  }

  return lista.data;
}
