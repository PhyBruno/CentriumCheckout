/**
 * Mapa fixo de teclas do produto (feature 016, T001).
 *
 * **Constante de produto, não configuração**: o operador decora estas teclas, e
 * elas precisam fazer a mesma coisa em toda instalação, com ou sem cadastro no
 * ERP, em qualquer plataforma. É o oposto do mapa F6–F9 da feature 013, cujo
 * conteúdo vem de `CenarioPagamento` e varia por operador — por isso os dois
 * vivem em uniões separadas e a disjunção entre eles é verificada por suíte
 * (`tests/unit/client/hotkeys/mapaFixo.spec.ts`, invariante I1).
 *
 * **Único lugar onde uma tecla fixa é nomeada** (`FR-009`, `SC-006`): o registro
 * (`useTeclasFixas`) percorre este array, e o call site só fornece a ação de
 * cada `IdComando`. Uma tecla nova é uma decisão de produto que passa por spec —
 * a união fechada existe para que ela não entre como string solta num
 * componente.
 *
 * **F5, F11 e F12 não aparecem aqui, e não devem aparecer** (`FR-008`). F5 ficou
 * com o navegador por decisão do usuário (2026-09-15). F11 e F12 são
 * incapturáveis: a saída de tela cheia é incancelável por especificação e as
 * ferramentas de desenvolvedor são resolvidas antes de a página receber o
 * evento. Registrá-las só criaria a impressão de que o Checkout as controla.
 *
 * Sem React, sem estado, sem dependência de store.
 */

export type TeclaFixa = 'F1' | 'F2' | 'F3' | 'F4' | 'F10';

export type IdComando =
  | 'IMPORTAR_DAV'
  | 'IMPORTAR_NFCE'
  | 'IDENTIFICAR_CLIENTE'
  | 'IDENTIFICAR_PRODUTO'
  | 'SUSPENDER_VENDA';

export interface ComandoFixo {
  readonly tecla: TeclaFixa;
  readonly comando: IdComando;
  /** Descrição curta para uma futura tela de ajuda de atalhos (`FR-009`). */
  readonly rotulo: string;
}

/** O mapa completo, na ordem das teclas. */
export const MAPA_FIXO: readonly ComandoFixo[] = [
  { tecla: 'F1', comando: 'IMPORTAR_DAV', rotulo: 'Importar DAV' },
  { tecla: 'F2', comando: 'IMPORTAR_NFCE', rotulo: 'Importar NFCe' },
  { tecla: 'F3', comando: 'IDENTIFICAR_CLIENTE', rotulo: 'Identificar cliente' },
  { tecla: 'F4', comando: 'IDENTIFICAR_PRODUTO', rotulo: 'Identificar produto' },
  { tecla: 'F10', comando: 'SUSPENDER_VENDA', rotulo: 'Suspender venda' },
];
