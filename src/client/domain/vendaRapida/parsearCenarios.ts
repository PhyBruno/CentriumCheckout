/**
 * Parser de fronteira do catálogo de cenários de pagamento (feature 013, T006).
 *
 * Etapas E1 e E2 de `data-model.md` §2. Domínio **puro** e função **total**:
 * nenhuma entrada do ERP lança exceção, e o pior desfecho possível é uma lista
 * vazia (I4). Este módulo não sabe o que é tecla útil, catálogo de condições ou
 * plataforma — isso é a projeção (`projetarAtalhos.ts`).
 *
 * ### Por que o descarte é por contagem de campos, sem heurística (AD-105)
 *
 * O ERP monta cada item concatenando sete campos com `;`, e três deles são
 * texto livre **no meio** da sequência (`CPgFpgDes`, `CPgPraDes`, `CPgNome`).
 * Um `;` extra num desses textos tornaria o item genuinamente ambíguo: não há
 * como saber, olhando o resultado, se `"Vale;Ops"` é um nome com ponto e
 * vírgula ou dois campos deslocados. Em pagamento, "provavelmente certo" é pior
 * do que ausente — um cenário reconstruído por palpite lançaria a venda na
 * condição errada, em silêncio.
 *
 * Por decisão do usuário (2026-08-31) o ERP garante que esses textos **não**
 * conterão `;`, então o descarte deixou de ser tratamento de caso esperado e
 * passou a ser defesa contra dado inesperado. A defesa fica.
 */

import { parsearListaDeCenarios } from '../../../shared/schemas/cenarioPagamento.schema';
import type { CenarioPagamentoBruto } from './tipos';

/** Sete campos posicionais, exatamente (`erp-cenario-pagamento-api.md` §2). */
const CAMPOS_POR_CENARIO = 7;

const INDICE_FORMA_CODIGO = 0;
const INDICE_FORMA_DESCRICAO = 1;
const INDICE_CONDICAO_CODIGO = 2;
const INDICE_CONDICAO_DESCRICAO = 3;
const INDICE_NOME = 4;
const INDICE_ENCERRA_OPERACAO = 5;
const INDICE_TECLA = 6;

/** Mesmo formato numérico de `erpJson.ts`: `"3"`, `"3.00000"`, `" 30 "`. */
const TEXTO_NUMERICO = /^\s*[+-]?\d+(?:\.\d+)?\s*$/;

/**
 * Conjunto **fechado** de literais que significam "sim" em
 * `CPgIsEncerraOperacao` (D4/AD-106).
 *
 * A interpretação é assimétrica de propósito: qualquer valor fora desta lista
 * — inclusive vazio, `"talvez"` ou um literal novo que o ERP passe a emitir —
 * vira `false`. Errar para `false` custa um clique ao operador; errar para
 * `true` emite uma NFCe que ele não pediu. Por AD-106 este conjunto é
 * definitivo, não provisório, e **não** será estreitado.
 */
const LITERAIS_VERDADEIROS = new Set(['true', '1', 's', 'sim', 'y', 'yes']);

export function interpretarEncerraOperacao(bruto: string): boolean {
  return LITERAIS_VERDADEIROS.has(bruto.trim().toLowerCase());
}

/**
 * Código inteiro do ERP, ou `null` quando o campo não é numérico.
 *
 * `null` (e não `0`) porque `0` é um código plausível: converter lixo em zero
 * produziria um atalho apontando para uma forma que não existe, e E4 o
 * descartaria por outro motivo — mascarando a causa real.
 */
function inteiroOuNulo(bruto: string): number | null {
  if (!TEXTO_NUMERICO.test(bruto)) {
    return null;
  }
  const valor = Number(bruto);
  return Number.isInteger(valor) ? valor : null;
}

/**
 * E2 — um item do array em `CenarioPagamentoBruto`, ou `null` para descarte.
 *
 * Exportada para o teste de tabela poder exercitar item a item sem montar o
 * JSON inteiro em volta.
 */
export function parsearItemDeCenario(item: string): CenarioPagamentoBruto | null {
  const partes = item.split(';');
  if (partes.length !== CAMPOS_POR_CENARIO) {
    return null;
  }

  const formaCodigo = inteiroOuNulo(partes[INDICE_FORMA_CODIGO] ?? '');
  const condicaoCodigo = inteiroOuNulo(partes[INDICE_CONDICAO_CODIGO] ?? '');
  if (formaCodigo === null || condicaoCodigo === null) {
    return null;
  }

  // Um atalho sem rótulo não é exibível (`FR-016`): a dica visual mostraria uma
  // pílula em branco, e o operador não teria como saber o que a tecla lança.
  const nome = (partes[INDICE_NOME] ?? '').trim();
  if (nome === '') {
    return null;
  }

  return {
    formaCodigo,
    formaDescricao: partes[INDICE_FORMA_DESCRICAO] ?? '',
    condicaoCodigo,
    condicaoDescricao: partes[INDICE_CONDICAO_DESCRICAO] ?? '',
    nome,
    encerraOperacao: interpretarEncerraOperacao(partes[INDICE_ENCERRA_OPERACAO] ?? ''),
    // Crua de propósito: normalizar a tecla é E3, na projeção.
    teclaAtalho: partes[INDICE_TECLA] ?? '',
  };
}

/**
 * E1 + E2: `SessaoUsuario.CenarioPagamento` → cenários brutos válidos.
 *
 * Um item fora do padrão é omitido **sem interromper os demais** (I3): o
 * catálogo do ERP mistura cenários de anos diferentes, e um cadastro legado no
 * meio da lista não pode apagar os atalhos que funcionam.
 */
export function parsearCenarios(campo: unknown): readonly CenarioPagamentoBruto[] {
  const brutos: CenarioPagamentoBruto[] = [];

  for (const item of parsearListaDeCenarios(campo)) {
    const cenario = parsearItemDeCenario(item);
    if (cenario !== null) {
      brutos.push(cenario);
    }
  }

  return brutos;
}
