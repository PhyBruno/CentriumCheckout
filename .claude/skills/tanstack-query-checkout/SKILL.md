---
name: tanstack-query-checkout
description: Use ao implementar ou revisar queries/mutations do TanStack Query para busca de produto ou formas/condições de pagamento no CentriumCheckout. Garante os invariantes de cache específicos da venda (staleTime infinito para produto durante venda aberta, 30min para pagamento, descarte total ao finalizar/cancelar).
metadata:
  origin: "Inspirado em DeckardGer/tanstack-agent-skills, adaptado com os invariantes de negócio do CentriumCheckout"
---

# TanStack Query — CentriumCheckout

## Quando usar

Sempre que a tarefa envolver: buscar produto por SKU/código de barras no ERP, buscar formas/condições de pagamento, ou qualquer uso de `useQuery`/`useMutation`/`queryClient` no fluxo de venda do PDV.

## Padrões gerais (boas práticas TanStack Query)

- **Query keys estruturadas e hierárquicas**, nunca strings soltas:
  ```ts
  const productKeys = {
    all: ['product'] as const,
    bySku: (sku: string) => ['product', sku] as const,
  };
  const paymentKeys = {
    methods: ['payment-methods'] as const,
  };
  ```
- **`gcTime` (antigo `cacheTime`) vs `staleTime`**: `staleTime` controla quando o dado é considerado velho (dispara refetch em background); `gcTime` controla quanto tempo o dado fica em memória depois que não há mais observers. Não confundir os dois — o invariante do projeto (próxima seção) é sobre `staleTime`, não sobre `gcTime`.
- Mutations (finalizar venda, etc.) devem usar `useMutation` com `onSuccess`/`onError` explícitos; nunca side-effects escondidos dentro do `queryFn`.
- Nunca deixe o carrinho (Zustand) ler o cache do TanStack Query "ao vivo" — ver regra de fronteira abaixo.

## Invariante do projeto: produto tem `staleTime` efetivamente infinito durante a venda

Diferente do padrão comum (staleTime curto + refetch em background), aqui:

- **Produto**: `staleTime: Infinity` enquanto a venda estiver aberta. **Sem refetch automático em background.** Motivo: se o mesmo SKU for reinserido na mesma venda, ele *precisa* reusar exatamente os mesmos `precos[1..5]` e `faixasQuantidade` já usados nas linhas existentes — um refetch no meio da venda poderia trazer dados diferentes do ERP e gerar linhas do mesmo SKU com preços de tabelas divergentes (ver seção 3 do `ARCHITECTURE.md`, "Regra de consistência do cache de produto").
- **Formas/condições de pagamento**: `staleTime` de 30 minutos — aqui o padrão comum de refetch periódico é aceitável, pois não há risco de divergência de preço entre linhas do carrinho.

```ts
useQuery({
  queryKey: productKeys.bySku(sku),
  queryFn: () => fetchProductBySku(sku),
  staleTime: Infinity, // nunca refaz fetch em background durante a venda
  gcTime: Infinity,    // não descarta do cache sozinho — só via removeQueries explícito (ver abaixo)
});

useQuery({
  queryKey: paymentKeys.methods,
  queryFn: fetchPaymentMethods,
  staleTime: 30 * 60 * 1000,
});
```

**Regra de fronteira**: ao inserir um item no carrinho, copie os campos necessários do produto (`precos`, `faixasQuantidade`) para dentro da linha do carrinho (Zustand). O carrinho nunca deve ler o cache do TanStack Query "ao vivo" depois da inserção — ele opera só sobre o que já foi copiado.

## Regra de descarte: fim da venda limpa o cache de produto por completo

A única fronteira de frescor do cache de produto é o **fim da venda** (finalização ou cancelamento) — nunca tempo decorrido. Ao finalizar ou cancelar:

```ts
function onSaleEnded(queryClient: QueryClient) {
  // Remove todo o cache de produto da venda — a próxima venda começa vazia,
  // nunca reaproveitando dados de produto de uma venda anterior.
  queryClient.removeQueries({ queryKey: productKeys.all });
}
```

Chame isso tanto no fluxo de finalização (após o `POST` de finalização da venda ter sucesso) quanto no fluxo de cancelamento (que é 100% local, sem chamada ao ERP).

## TDD — o que testar

1. **Reuso de dados durante a venda**: inserir o mesmo SKU duas vezes na mesma venda (com `vi.useFakeTimers()` avançando o tempo além de qualquer `staleTime` comum) e afirmar que **nenhum novo fetch** ocorre e que ambas as linhas usam exatamente os mesmos `precos`/`faixasQuantidade` do primeiro fetch.
2. **Ausência de refetch em background**: com a query montada e tempo avançado, disparar um evento de foco de janela (`window.dispatchEvent(new Event('focus'))`) ou reconexão de rede e afirmar que `queryFn` não foi chamada de novo — comportamento típico do TanStack Query (`refetchOnWindowFocus`) deve estar desabilitado ou ser inofensivo dado `staleTime: Infinity`.
3. **Descarte no fim da venda**: após finalizar (ou cancelar) a venda, afirmar que `queryClient.getQueryData(productKeys.bySku(sku))` retorna `undefined` — ou seja, o cache foi de fato removido, não apenas marcado como stale.
4. **Início limpo da próxima venda**: iniciar uma nova venda logo após o descarte e reinserir o mesmo SKU; afirmar que um **novo** fetch é disparado (prova de que não sobrou cache da venda anterior).

## Proveniência

Estrutura de query keys, `staleTime`/`gcTime` e padrões de `useMutation` inspirados em `DeckardGer/tanstack-agent-skills` (GitHub, ~199★). O invariante de staleTime infinito por venda e a regra de descarte total no fim da venda são específicos do CentriumCheckout e não constam na fonte original.
