# Contract: Domínio + Query + UI — Recuperação de NFCe

**Feature**: `specs/011-recuperacao-nfce/`

## Camada de domínio puro (`src/client/domain/recuperacao/`)

Pasta `recuperacao/`, não `nfce/` — nome pensado para reuso futuro pela feature 006/DAV (AD-057, `research.md` D3), que reaproveitará os mesmos mapeadores sobre a resposta de `GetDAV`.

```ts
// mapearItemParaLinhaCongelada.ts
function mapearItemParaLinhaCongelada(item: ItemRascunho): LinhaCarrinho;
// Pura — data-model.md §4. Nunca chama resolvePrecoUnitario/repricarSku.

// mapearFormaParaPagamentoAplicado.ts
function mapearFormaParaPagamentoAplicado(forma: FormaPagamentoRascunho): PagamentoAplicado;
// Pura — data-model.md §5, research.md D8. status sempre 'APROVADO'.

// mapearRascunhoCarregado.ts (orquestra os dois acima, ainda sem efeito colateral)
function mapearRascunhoCarregado(rascunho: RascunhoCarregado): {
  linhas: LinhaCarrinho[];
  pagamentos: PagamentoAplicado[];
  condicaoPagamentoCodigo: number;
  clienteCodigo: number;
  vendedorCodigo: number;
  identidadeVenda: { origem: 'RASCUNHO'; numeroNota: number };
};
```

Nenhuma dessas funções importa React, TanStack Query, Zustand ou `fetch` — mesma disciplina já aplicada por `interpretarStatusPix` (009) e `resolvePrecoUnitario` (003).

## Camada de query (`src/client/services/recuperacao/`)

```ts
// recuperacaoQueries.ts
function useListaRascunhos(params: { termoBusca: string; pagina: number }): UseQueryResult<EstadoListaRascunhos>;
// GET GetListaNFCes — staleTime curto (a listagem reflete rascunhos de outros operadores, não deve envelhecer no cache)

function useCarregarRascunho(): UseMutationResult<RascunhoCarregado, unknown, { numeroNota: number }>;
// GET CarregarNFCe sob demanda (seleção de linha), não é uma query — ação única, não recacheada
```

```ts
// recuperacaoMapper.ts
function parseGetListaNFCesOutput(json: unknown): RascunhoListado[];      // Zod
function parseCarregarNFCeOutput(json: unknown): RascunhoCarregado;       // mesmo schema de FaturarNFCeOutput
```

## Orquestrador (`src/client/features/venda/retomarRascunho.ts`)

```ts
function retomarRascunho(rascunho: RascunhoCarregado): void;
// Efeito colateral único, síncrono do ponto de vista do operador (data-model.md §6, ordem de aplicação):
// resetarAuditoria() → setIdentidadeVenda() → setLinhasCarrinho() → setPagamentos()+setCondicao()
// → setCliente(await GetCliente) → expõe vendedorCodigo para 012.
// Chamado uma única vez, a partir do modal, ao confirmar a seleção de um rascunho.
```

## Superfície de UI (`src/client/features/venda/recuperacao/`)

```ts
// ModalRecuperacaoNFCe.tsx
// Frame "PDV Online Web - Modal Recuperação NFCe" (design/CentriumCheckout.pen).
// Props: onRetomado: (rascunho: RascunhoCarregado) => void; onFechar: () => void.
// Estado interno: EstadoListaRascunhos (data-model.md §2) + debounce de busca (mesmo padrão
// de busca de cliente/produto/vendedor já usado nas outras telas de listagem).
// Boneyard skeleton durante useListaRascunhos/useCarregarRascunho (mesmo padrão de STACK.md).
```

Botão de abertura do modal é gatilho de UI já mapeado no design (desktop-only, AD-046) — sem tela própria além do modal em si (`FR-001`/`FR-004`).
