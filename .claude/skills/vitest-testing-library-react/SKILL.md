---
name: vitest-testing-library-react
description: Use ao escrever ou revisar testes unitários/de componente React no CentriumCheckout (Vitest + Testing Library). Cobre queries acessíveis, mock de rede com MSW, teste de hooks com Zustand/TanStack Query, e a separação obrigatória entre testes do motor de precificação (função pura) e testes de componente.
metadata:
  type: project-testing
---

# Vitest + Testing Library (React) — CentriumCheckout

Escopo: testes unitários e de componente React (Vitest + Testing Library). Testes ponta a ponta ficam com Playwright (skill separada). TDD geral (RED/GREEN/checkpoint) fica com `ecc:tdd-workflow`.

## 1. Queries acessíveis primeiro

Ordem de preferência ao selecionar elementos, do melhor para o pior:

1. `getByRole` (com `name`) — reflete o que o operador do PDV realmente percebe (leitor de tela, navegação por teclado).
2. `getByLabelText` — para campos de formulário (ex.: busca de produto, quantidade).
3. `getByText` — para conteúdo estático não interativo.
4. `getByTestId` — último recurso; exige justificativa em comentário no teste (ex.: elemento sem role/label semântico razoável).

**Nunca teste detalhe de implementação**: não afirme sobre estado interno de componente, nomes de classe CSS, ou contagem de re-renders. Se o teste só passa a quebrar quando você refatora sem mudar comportamento, ele está testando a coisa errada.

## 2. Mock de rede com MSW, não mock de `fetch`/TanStack Query

Todas as chamadas ao ERP (busca de produto, formas de pagamento, finalização), ao TEF local e à API de PIX devem ser simuladas via **MSW** (Mock Service Worker) nos testes de componente/hook — nunca mockando `fetch` diretamente ou substituindo o client do TanStack Query.

Por quê: mockar no nível de rede mantém o teste próximo do comportamento real (serialização, status HTTP, timing de resposta), e evita que o teste continue passando depois de uma mudança que quebra a integração real com o ERP.

Coloque os handlers MSW por domínio (ex.: `mocks/handlers/produto.ts`, `mocks/handlers/pagamento.ts`, `mocks/handlers/finalizacao.ts`) para reuso entre testes.

## 3. Testando hooks que combinam Zustand + TanStack Query

Hooks customizados que leem da store Zustand (carrinho) e do cache do TanStack Query (produto, pagamento) ao mesmo tempo devem ser testados com `renderHook`, envolvendo um wrapper que:

- Cria um `QueryClient` novo por teste (nunca reutilize entre testes — cache vazando entre casos mascara bugs de invalidação).
- Reseta a store Zustand para o estado inicial antes de cada teste (não dependa de ordem de execução).

```tsx
function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
```

## 4. Motor de precificação: testes unitários separados, sem componente

O motor de precificação (função pura, sem dependência de React/Zustand/Query — ver seção 3 do ARCHITECTURE.md) **nunca** deve ser testado através de render de componente. Ele é testável como qualquer função pura: entrada → saída, sem setup de DOM, sem `render()`, sem Testing Library.

```ts
// domain/pricing.test.ts — sem @testing-library/react, sem render
test('aplica preco2 quando quantidade agregada atinge a faixa', () => {
  const resultado = calcularPrecoAplicado({ usaPrecoPorQuantidade: true, produto, quantidadeAgregadaDoSKU: 12 });
  expect(resultado).toEqual({ precoAplicado: produto.precos[2], tierAplicado: 2 });
});
```

Testes de componente podem existir *além* disso para verificar que a UI reage à reprecificação (ex.: valor exibido muda após inserir item), mas não substituem a cobertura unitária da função pura.

## 5. Meta de cobertura

- Baseline geral do projeto: 80%+ (conforme `ecc:tdd-workflow`).
- Motor de precificação e demais funções de domínio da seção 4 do ARCHITECTURE.md (regras de faixa, reprecificação em cascata, agregação por SKU): mirar cobertura **próxima de 100%** — é a lógica com maior risco financeiro do projeto (100% do código é gerado por IA, sem essa rede de segurança um erro de tier ou de cascata na remoção vira prejuízo direto em caixa).

## Origem

Adaptada e reescrita a partir de práticas descritas no arquivo avulso `react-testing/SKILL.md` do repositório `citypaul/.dotfiles` (não é um pacote de skill instalável — arquivo de referência pessoal); conteúdo aqui é original, ajustado às regras específicas do CentriumCheckout.
