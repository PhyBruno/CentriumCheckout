/**
 * Projeção de cenários brutos em atalhos utilizáveis (feature 013, T007).
 *
 * Etapas E3–E6 de `data-model.md` §2. Domínio **puro**, idempotente e
 * determinístico: mesma entrada ⇒ mesma saída, sempre na mesma ordem (I2, I5,
 * I10). Não lança pagamento e não conhece o estado da venda.
 *
 * As duas restrições que este módulo aplica — faixa `F6..F9` e teto de quatro
 * atalhos — são regra **do Checkout**, não do ERP: `CPgTeclaAtalho` é
 * `VARCHAR(40)` sem domínio e a consulta do ERP nem sequer filtra cenários sem
 * tecla (`erp-cenario-pagamento-api.md` §2). Atribuí-las ao ERP seria descrever
 * errado a fonte de verdade (Constitution III).
 */

import type { CondicaoPagamento } from '../pagamento/formaPagamento';
import {
  ehTeclaAtalho,
  TECLAS_ATALHO,
  type AtalhoVendaRapida,
  type CenarioPagamentoBruto,
  type ListaAtalhos,
  type PlataformaVendaRapida,
  type TeclaAtalho,
} from './tipos';

/**
 * E3 — `trim` + caixa alta, comparados contra o conjunto fechado `{F6..F9}`
 * (`FR-003`).
 *
 * A normalização existe porque o campo é digitado no cadastro do ERP: `"f7 "`
 * é o mesmo atalho que `"F7"` na cabeça de quem cadastrou, e descartá-lo
 * deixaria o operador sem uma tecla que a tela do ERP mostra como configurada.
 */
function normalizarTecla(bruta: string): TeclaAtalho | null {
  const normalizada = bruta.trim().toUpperCase();
  return ehTeclaAtalho(normalizada) ? normalizada : null;
}

/**
 * E4 — o par (condição, forma) precisa existir **na sessão**, e a forma precisa
 * pertencer àquela condição (`FR-005`).
 *
 * É o filtro que impede o atalho de lançar um pagamento que o caminho manual
 * recusaria: um cenário legado apontando para uma forma desativada some da
 * faixa em vez de virar um erro no meio da cobrança.
 */
function localizarNoCatalogo(
  cenario: CenarioPagamentoBruto,
  catalogo: readonly CondicaoPagamento[],
): { readonly condicao: CondicaoPagamento; readonly forma: CondicaoPagamento['formas'][number] } | null {
  const condicao = catalogo.find((candidata) => candidata.codigo === cenario.condicaoCodigo);
  if (condicao === undefined) {
    return null;
  }

  const forma = condicao.formas.find((candidata) => candidata.codigo === cenario.formaCodigo);
  if (forma === undefined) {
    return null;
  }

  return { condicao, forma };
}

/**
 * E3 → E6: cenários brutos, catálogo da sessão e plataforma ⇒ `ListaAtalhos`.
 *
 * A ordem do resultado é a das **teclas** (`F6..F9`), não a que o ERP devolveu:
 * a faixa de atalhos é lida em relance, e uma ordem que mudasse conforme o
 * cadastro obrigaria o operador a reler os rótulos toda vez. O empate de tecla
 * (E5) continua resolvido pela ordem do ERP, que é estável
 * (`Order CPgEmpCod CPgFpgCod`) — o primeiro cenário de cada tecla vence, e o
 * resultado é idêntico entre recarregamentos da mesma sessão (`FR-006`, D6).
 */
export function projetarAtalhos(
  cenarios: readonly CenarioPagamentoBruto[],
  catalogo: readonly CondicaoPagamento[],
  plataforma: PlataformaVendaRapida,
): ListaAtalhos {
  // E6 primeiro, como curto-circuito: sendo a última etapa do pipeline no
  // desenho, avaliá-la aqui não muda o resultado (mobile ⇒ `[]` de qualquer
  // forma) e evita percorrer o catálogo à toa. "Não exibe" e "não aciona"
  // continuam sendo consequência do mesmo fato (`FR-020`/D11, I10).
  if (plataforma !== 'desktop') {
    return [];
  }

  const porTecla = new Map<TeclaAtalho, AtalhoVendaRapida>();

  for (const cenario of cenarios) {
    const tecla = normalizarTecla(cenario.teclaAtalho);
    if (tecla === null) {
      continue;
    }

    // E5: o primeiro na ordem do ERP vence. Um `set` incondicional deixaria o
    // último vencer, e o atalho passaria a lançar outra forma sem nenhum aviso.
    if (porTecla.has(tecla)) {
      continue;
    }

    const encontrado = localizarNoCatalogo(cenario, catalogo);
    if (encontrado === null) {
      continue;
    }

    porTecla.set(tecla, {
      tecla,
      nome: cenario.nome,
      condicaoCodigo: encontrado.condicao.codigo,
      formaCodigo: encontrado.forma.codigo,
      meioPagtoNFe: encontrado.forma.meioPagtoNFe,
      encerraOperacao: cenario.encerraOperacao,
    });
  }

  // Teto de quatro sai de graça: `TECLAS_ATALHO` tem quatro elementos e o mapa
  // guarda no máximo um atalho por tecla (I2).
  const atalhos: AtalhoVendaRapida[] = [];
  for (const tecla of TECLAS_ATALHO) {
    const atalho = porTecla.get(tecla);
    if (atalho !== undefined) {
      atalhos.push(atalho);
    }
  }

  return atalhos;
}

/** Consulta pura sobre a lista já projetada (`venda-rapida-domain-api.md` §3). */
export function buscarAtalho(
  atalhos: ListaAtalhos,
  tecla: TeclaAtalho,
): AtalhoVendaRapida | undefined {
  return atalhos.find((atalho) => atalho.tecla === tecla);
}
