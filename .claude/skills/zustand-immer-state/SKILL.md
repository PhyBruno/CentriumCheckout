---
name: zustand-immer-state
description: Use ao criar ou revisar qualquer store Zustand do CentriumCheckout (estado da venda em andamento — carrinho, cliente, totais). Garante uso do middleware Immer, `partialize` correto no `persist(localStorage)`, e a regra de fronteira que impede o carrinho de referenciar dados ao vivo do Dexie/TanStack Query.
---

# Estado da venda com Zustand + Immer

## Quando usar

Sempre que uma tarefa envolver criar, estender ou revisar um store Zustand
relacionado à venda em andamento (carrinho, cliente selecionado, descontos,
totais) ou a qualquer estado de UI efêmero do PDV (modais, loading, resultados
de busca).

## Regra 1 — Immer é obrigatório para updates imutáveis

Todo store que tenha mais de um campo aninhado ou que faça update de itens de
array (ex.: alterar a quantidade de uma linha do carrinho) deve usar o
middleware `immer` do Zustand. Código gerado por IA erra com frequência ao
fazer spread manual de estado aninhado (`{...state, cart: {...state.cart, items: [...]}}`);
o Immer elimina essa classe de bug ao permitir mutação direta dentro do
`set`:

```ts
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

const useSaleStore = create<SaleState>()(
  immer((set) => ({
    items: [],
    updateQuantity: (lineId, quantity) =>
      set((state) => {
        const line = state.items.find((i) => i.lineId === lineId);
        if (line) line.quantity = quantity;
      }),
  })),
);
```

Nunca aceite um store que faça spread manual profundo "à mão" quando o Immer
já está disponível no projeto — isso é o principal ponto de revisão desta
skill.

## Regra 2 — `persist` + `partialize`: só a fatia da venda

O `persist(localStorage)` deve envolver **apenas** os campos que representam a
venda em andamento. Estado de UI efêmero nunca entra no `partialize` — ele
não deve sobreviver a um F5, e não faz sentido reidratar um modal aberto ou
um resultado de busca antigo.

```ts
persist(
  immer((set) => ({ /* ... */ })),
  {
    name: "sale-in-progress",
    partialize: (state) => ({
      items: state.items,
      customer: state.customer,
      discounts: state.discounts,
      // NUNCA incluir: isModalOpen, isLoading, searchResults, etc.
    }),
  },
)
```

Se o campo que está sendo adicionado ao store é efêmero (loading, modal,
resultado de busca), ele deve ficar em um store Zustand **separado, sem
persist**, ou em estado local de componente — nunca no mesmo store persistido
misturado via `partialize` seletivo linha a linha. Dois stores (um persistido,
um não) é mais seguro para revisão do que um `partialize` com lista de
exclusões crescente.

## Regra 3 — Regra de fronteira: carrinho nunca referencia dados ao vivo

Ao inserir um item no carrinho, os campos necessários do produto (preços por
faixa, faixas de quantidade) são **copiados** para dentro da linha do
carrinho no momento da inserção — o carrinho nunca guarda uma referência ou
lookup vivo para o cache do Dexie ou do TanStack Query. Isso garante que o
`localStorage` fique autocontido e que a reprecificação após um F5 funcione
mesmo com o cache em memória do TanStack Query já perdido.

Shape de linha do carrinho que respeita a regra (valores sintéticos):

```ts
type CartLine = {
  lineId: string;
  sku: string;
  quantity: number;
  // Copiados do produto na inserção — nunca um lookup vivo. Mesma forma
  // retornada pelo ERP e validada pelo ProdutoRespostaSchema (Zod):
  precos: number[];               // 5 preços em centavos, precos[1..5] (ver ARCHITECTURE.md seção 4)
  faixasQuantidade: Record<number, number>; // tier → quantidade agregada mínima que o ativa
  precoAplicado: number;          // recalculado por repriceSku, mas lido sempre daqui
  tierAplicado: number;           // índice do preço/faixa aplicado (1..5)
};
```

Ao revisar um PR, sinalize qualquer `action` de store que leia `useProductQuery(sku)`
ou acesse o Dexie diretamente para montar ou atualizar uma linha já inserida —
isso viola a regra de fronteira. A única leitura de dados "ao vivo" acontece
no momento da inserção; depois disso, tudo vem da própria linha persistida.

## Regra 4 — Limpeza total ao finalizar ou cancelar a venda

Ao finalizar a venda (sucesso) ou cancelar a venda em andamento, o store da
venda deve ser resetado por completo — carrinho, cliente, descontos — e o
`localStorage` correspondente limpo junto. A próxima venda sempre começa do
zero; nenhuma action de finalização/cancelamento deve deixar resíduo de
estado (ex.: cliente selecionado da venda anterior).

```ts
resetSale: () =>
  set((state) => {
    state.items = [];
    state.customer = null;
    state.discounts = [];
  }),
```

Teste este comportamento explicitamente (ver Regra 5) — é o tipo de regra que
some silenciosamente quando alguém adiciona um novo campo ao estado da venda
e esquece de zerá-lo aqui.

## Regra 5 — TDD para stores Zustand

Stores Zustand são testáveis como funções puras, sem precisar montar
componente React ou Testing Library:

```ts
import { useSaleStore } from "./sale-store";

test("updateQuantity atualiza apenas a linha alvo", () => {
  useSaleStore.setState({ items: [lineA, lineB] });
  useSaleStore.getState().updateQuantity(lineA.lineId, 3);
  expect(useSaleStore.getState().items[0].quantity).toBe(3);
  expect(useSaleStore.getState().items[1]).toEqual(lineB);
});

test("partialize exclui estado de UI efêmero", () => {
  const persisted = partializeConfig.partialize(useSaleStore.getState());
  expect(persisted).not.toHaveProperty("isModalOpen");
});

test("resetSale limpa carrinho, cliente e descontos", () => {
  useSaleStore.setState({ items: [lineA], customer: fakeCustomer, discounts: [fakeDiscount] });
  useSaleStore.getState().resetSale();
  const state = useSaleStore.getState();
  expect(state.items).toEqual([]);
  expect(state.customer).toBeNull();
  expect(state.discounts).toEqual([]);
});
```

Escreva esses testes **antes** de implementar a action correspondente
(RED/GREEN), conforme o fluxo de TDD do projeto.

## Regra 6 — Consumo no React: seletores estreitos (Zustand 5)

Criar o store certo é metade do trabalho; consumi-lo errado no componente reintroduz
re-renders desnecessários — crítico num PDV que reprecifica o carrinho a cada bipe.

- **Nunca** consumir o store inteiro num componente (`const s = useSaleStore()`):
  isso re-renderiza a cada mudança de qualquer campo. Selecione só o que o componente
  usa:
  ```tsx
  const total = useSaleStore((s) => s.total);
  ```
- Para **múltiplos campos**, use `useShallow` (Zustand 5, de `zustand/react/shallow`)
  — sem ele, o objeto novo retornado a cada render quebra a igualdade referencial e
  força re-render:
  ```tsx
  import { useShallow } from "zustand/react/shallow";
  const { items, customer } = useSaleStore(
    useShallow((s) => ({ items: s.items, customer: s.customer })),
  );
  ```
- **Fora de componentes React** (handlers utilitários, código não-hook), acesse via
  `useSaleStore.getState()` / `.setState()` e observe com `.subscribe()` — nunca
  chame o hook fora de um componente. Atenção: o **motor de precificação continua
  função pura** e não deve ler o store (ver Regra 3 e `ARCHITECTURE.md` seção 3); ele
  recebe os dados por parâmetro.
- **Ordem dos middlewares** (Zustand 5): `devtools(persist(immer(...)))` — `immer` é
  sempre o mais interno; `devtools` (só útil em desenvolvimento) o mais externo. E,
  com qualquer middleware, `create` é **curried**: `create<SaleState>()(...)` com os
  parênteses vazios, exigência que o TS strict do projeto reforça.
