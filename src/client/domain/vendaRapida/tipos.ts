/**
 * Tipos da venda rápida por cenário de pagamento (feature 013, T002).
 *
 * Domínio puro: sem React, Zustand, rede ou Zod — só as entidades de
 * `data-model.md` §1.1–1.4. Os três tipos abaixo existem para tornar estados
 * inválidos **inconstruíveis** (Constitution IV):
 *
 * - `TeclaAtalho` é união fechada, então um atalho com tecla fora de F6–F9 não
 *   chega a ser criado;
 * - `AtalhoVendaRapida` só existe válido — não há variante "atalho inválido"
 *   que alguém possa esquecer de tratar;
 * - `ResultadoAcionamento` é união discriminada, o que impede o chamador de ler
 *   `valorLancado` sem antes checar o desfecho.
 */

import type { Centavos } from '../precificacao/dinheiro';
import type { MeioPagtoNFe } from '../pagamento/formaPagamento';

/** As quatro teclas aceitas (`FR-003`). Qualquer outra já foi descartada em E3. */
export type TeclaAtalho = 'F6' | 'F7' | 'F8' | 'F9';

/** Ordem canônica de exibição — a do teclado, não a que o ERP devolveu. */
export const TECLAS_ATALHO = ['F6', 'F7', 'F8', 'F9'] as const satisfies readonly TeclaAtalho[];

const TECLAS_CONHECIDAS = new Set<string>(TECLAS_ATALHO);

/** Guard da fronteira: `string` livre do ERP → união fechada (E3). */
export function ehTeclaAtalho(valor: string): valor is TeclaAtalho {
  return TECLAS_CONHECIDAS.has(valor);
}

/**
 * Onde a venda rápida está disponível (`FR-020`/D11).
 *
 * Recebido como **parâmetro** por `projetarAtalhos`, nunca lido de `window`
 * dentro do domínio: é o que torna I10 testável sem renderizar nada, no mesmo
 * padrão de capacidade injetada estreado por AD-074.
 */
export type PlataformaVendaRapida = 'desktop' | 'mobile';

/**
 * Um item do array que vem serializado em `SessaoUsuario.CenarioPagamento`,
 * já convertido campo a campo (`data-model.md` §1.1).
 *
 * Existe **só na fronteira**: é produzido pelo parser e consumido pela
 * projeção; nenhuma camada acima dele o enxerga. `teclaAtalho` ainda é a string
 * crua do ERP — a normalização para `TeclaAtalho` acontece em E3.
 */
export interface CenarioPagamentoBruto {
  readonly formaCodigo: number;
  /** Texto livre do cadastro; não exibido (D9). */
  readonly formaDescricao: string;
  readonly condicaoCodigo: number;
  /** Texto livre do cadastro; não exibido (D9). */
  readonly condicaoDescricao: string;
  /** Rótulo exibido ao operador — nunca vazio (E2 descarta). */
  readonly nome: string;
  /** Já interpretado pelo conjunto fail-safe de D4/AD-106. */
  readonly encerraOperacao: boolean;
  /** Ainda **não** normalizada: `"f7 "` é um valor possível aqui. */
  readonly teclaAtalho: string;
}

/**
 * Projeção validada de um `CenarioPagamentoBruto` que passou por todos os
 * filtros (`data-model.md` §1.2).
 *
 * `meioPagtoNFe` **não** está no `data-model.md` original e foi acrescentado
 * aqui de propósito: o desenho da faixa "Métodos de pagamento rápidos" (nó
 * `I10H4d` do Pencil) mostra um ícone por método ao lado do rótulo, e o
 * contrato da UI (`contracts/venda-rapida-domain-api.md` §6) proíbe o
 * componente de reinterpretar cenários — sem este campo, `DicaAtalhos` teria de
 * ir ao catálogo resolver a forma por conta própria, que é exatamente a regra
 * de negócio que não pode morar no componente. A projeção (E4) já tem a
 * `FormaPagamento` em mãos para checar existência; copiar o meio dali custa
 * nada e mantém a UI burra.
 */
export interface AtalhoVendaRapida {
  readonly tecla: TeclaAtalho;
  /** Rótulo do operador, não vazio. */
  readonly nome: string;
  /** Existe em `CondicoesDePagamento[]` da sessão (E4). */
  readonly condicaoCodigo: number;
  /** Existe entre as formas daquela condição (E4). */
  readonly formaCodigo: number;
  /** Copiado do catálogo em E4 — só para o ícone da dica visual. */
  readonly meioPagtoNFe: MeioPagtoNFe;
  readonly encerraOperacao: boolean;
}

/**
 * Conjunto ativo da sessão: no máximo 4 elementos, no máximo um por tecla
 * (`data-model.md` §1.3). Derivada, imutável durante a sessão (D7).
 */
export type ListaAtalhos = readonly AtalhoVendaRapida[];

/** Por que um acionamento não alterou a venda (`data-model.md` §1.4). */
export type MotivoRecusa =
  | 'SEM_ITENS'
  | 'SEM_SALDO_EM_ABERTO'
  | 'ACIONAMENTO_EM_ANDAMENTO'
  | 'ATALHO_INEXISTENTE'
  /**
   * A venda já tem condição escolhida ou forma aplicada (decisão do usuário,
   * 2026-09-05, AD-174).
   *
   * O atalho carrega **um par** (condição, forma) e cada venda aceita uma
   * condição só. Sobre uma venda que já começou a ser paga por outra condição,
   * a única alternativa a esta recusa seria reconciliar par a par — e o desfecho
   * de errar essa reconciliação é um pagamento lançado na condição errada, em
   * silêncio.
   */
  | 'PAGAMENTO_JA_INICIADO'
  /**
   * Permanece no tipo por completude do contrato, mas **nunca é produzido**:
   * no mobile `projetarAtalhos` já devolve `[]` (I10), então G2 responde
   * `ATALHO_INEXISTENTE` antes de qualquer checagem de plataforma
   * (`tasks.md`, nota de `/speckit-analyze` sobre G2).
   */
  | 'PLATAFORMA_NAO_SUPORTADA'
  | 'LANCAMENTO_FALHOU';

/**
 * Desfecho do acionamento — união discriminada, nunca "sucesso parcial
 * ambíguo" (`data-model.md` §1.4).
 *
 * Não existe variante `AGUARDANDO_INTEGRACAO`: a porta `aplicarForma` só
 * resolve depois que o pagamento está de fato aplicado, inclusive quando
 * depende de confirmação de TEF/PIX (correção C1 de `/speckit-analyze`,
 * 2026-08-31).
 */
export type ResultadoAcionamento =
  | {
      readonly tipo: 'LANCADO';
      readonly valorLancado: Centavos;
      /** Reflete `FR-010`: o cenário encerrou a operação sozinho. */
      readonly finalizacaoIniciada: boolean;
    }
  | { readonly tipo: 'RECUSADO'; readonly motivo: MotivoRecusa };
