# Contract: API dos atalhos fixos

**Feature**: 016 | **Date**: 2026-09-15 | **Plan**: [../plan.md](../plan.md)

Contrato dos módulos criados e das assinaturas alteradas. O Checkout não expõe API externa nesta feature — os contratos abaixo são internos, entre camadas.

---

## §1 `src/client/hotkeys/mapaFixo.ts` *(novo)*

Constante de produto. Sem React, sem estado, sem dependência de store.

```ts
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
  /** Descrição curta para eventual tela de ajuda (FR-009). */
  readonly rotulo: string;
}

/** O mapa completo, na ordem das teclas. Único lugar onde uma tecla é nomeada. */
export const MAPA_FIXO: readonly ComandoFixo[];
```

**Garantias**
- `MAPA_FIXO` tem exatamente uma entrada por `TeclaFixa`.
- Nenhuma entrada para F5, F11 ou F12 (FR-008) — são do navegador, e as duas últimas são incapturáveis.
- Nenhum elemento em comum com `TECLAS_ATALHO` da feature 013 (invariante I1).

---

## §2 `src/client/hotkeys/mapaAtalhos.ts` *(alterado — ganha um export)*

`useAtalhosDeTeclado` permanece **inalterado** em assinatura e comportamento.

```ts
/** O que o call site fornece para um comando do mapa fixo. */
export interface AcaoFixa {
  /** O comando pode rodar agora? Devolve o motivo da recusa, ou null. */
  readonly indisponivel: () => string | null;
  /** Executa. Só é chamada quando `indisponivel()` devolveu null. */
  readonly executar: () => void;
}

/**
 * Registra o mapa fixo inteiro. Chamado UMA vez na árvore (invariante I6).
 * A posse da tecla é incondicional: não há parâmetro capaz de desligá-la.
 */
export function useTeclasFixas(acoes: Readonly<Record<IdComando, AcaoFixa>>): void;
```

**Garantias**
- Toda tecla de `MAPA_FIXO` é registrada com `preventDefault`, com `enabled` literalmente `true`.
- O registro não consulta query, store de sessão, cadastro nem plataforma.
- `enableOnFormTags` e `enableOnContentEditable` ligados; `ignoreEventWhen` restrito a `defaultPrevented`.
- `evento.repeat` e "há janela aberta" suprimem a **ação**, nunca o `preventDefault` (estágio 2 do `data-model.md`).
- `indisponivel()` é consultada **no momento da pressionada**, nunca em tempo de render.
- O parâmetro `acoes` é exaustivo sobre `IdComando`: um comando novo no mapa não compila até ter ação.

---

## §3 `src/client/stores/janelasStore.ts` *(novo)*

Store Zustand de coordenação de UI. Sem `persist` (Constitution VI), sem Immer (o estado é um enum).

```ts
export type JanelaAberta =
  | 'nenhuma' | 'seletor-importacao' | 'dav' | 'nfce' | 'cliente' | 'produto';

export interface JanelasState {
  readonly janela: JanelaAberta;
  /** Sem efeito quando já há janela aberta (invariante I3). */
  readonly abrir: (janela: Exclude<JanelaAberta, 'nenhuma'>) => void;
  /** Usada pelo seletor de importação: troca a janela sem passar por 'nenhuma'. */
  readonly substituir: (janela: 'dav' | 'nfce') => void;
  readonly fechar: () => void;
}
```

**Garantias**
- Nunca representa duas janelas abertas.
- `abrir` é idempotente com a mesma janela e inerte com outra já aberta.
- Não guarda parâmetro de abertura (D8) — termo de busca e item em edição continuam locais.

---

## §4 `src/client/lib/useFocoDeModal.ts` *(alterado)*

```ts
export interface OpcoesFocoDeModal<T extends HTMLElement> {
  /** Elemento que recebe o foco ao abrir. Tipicamente o campo de busca. */
  readonly focoInicial?: RefObject<HTMLElement | null>;
}

export function useFocoDeModal<T extends HTMLElement>(
  aberto: boolean,
  opcoes?: OpcoesFocoDeModal<T>,
): RefObject<T | null>;

/** Há alguma janela na pilha? Consulta síncrona, sem React. */
export function haJanelaAberta(): boolean;
```

**Garantias**
- `focoInicial` é aplicado **depois** de a janela deixar de ser inerte — um `focus()` em subtree `inert` é ignorado em silêncio.
- O foco inicial não depende de como a janela foi aberta (FR-021).
- Ao fechar, o foco volta ao elemento que o detinha antes (comportamento atual, preservado).
- `haJanelaAberta()` reflete a pilha real, inclusive janelas que não passam pelo `janelasStore`.

---

## §5 `src/client/domain/vendaRapida/projetarAtalhos.ts` *(alterado — breaking)*

```ts
// ANTES
export function projetarAtalhos(
  cenarios: readonly CenarioPagamentoBruto[],
  catalogo: readonly CondicaoPagamento[],
  plataforma: PlataformaVendaRapida,
): ListaAtalhos;

// DEPOIS
export function projetarAtalhos(
  cenarios: readonly CenarioPagamentoBruto[],
  catalogo: readonly CondicaoPagamento[],
): ListaAtalhos;
```

**Garantias**
- A projeção deixa de conhecer plataforma (FR-011). Demais etapas (E3–E6, normalização, empate por ordem do ERP, teto de quatro) **inalteradas**.
- A condição de exibição da faixa migra para o componente que a renderiza (FR-012).
- `PlataformaVendaRapida` deixa de ser parâmetro de domínio; se não sobrar consumidor, o tipo sai junto.

**Chamadores a atualizar**: `useAtalhosVendaRapida`, suíte de testes de `projetarAtalhos`.

---

## §6 `src/client/domain/auditoria/eventos.ts` *(alterado)*

As teclas fixas **não** entram em `TeclaVendaRapida` (D12) — aquela união descreve a venda rápida e não deve aceitar tecla que ela nunca emite. O mapa fixo recebe vocabulário próprio, e a origem do acionamento segue o padrão já usado por `trocarVendedor`.

```ts
export type OrigemAcionamento = 'CLIQUE' | 'TECLADO';
```

**Garantias**
- Toda ação de `MAPA_FIXO` executada registra evento de auditoria com `origem: 'TECLADO'`.
- Nenhum mecanismo novo de auditoria é introduzido (FR-019).
