# Phase 1 — Data Model: Carrinho, Busca/Inserção de Produto e Motor de Precificação

**Feature**: `specs/003-carrinho-produto-precificacao/` | **Date**: 2026-08-26

Todas as estruturas abaixo vivem **em memória**, no slice `carrinho` do `vendaStore` (Zustand + Immer, sem `persist` — Constitution VI / AD-006). Nada aqui é gravado em Dexie, `localStorage` ou IndexedDB, e nada sobrevive a F5.

---

## 1. Tipos primitivos do domínio

```ts
// src/client/domain/precificacao/dinheiro.ts
export type Centavos = number & { readonly __brand: 'Centavos' };

// src/client/domain/precificacao/quantidade.ts
export type Milesimos = number & { readonly __brand: 'Milesimos' };
```

| Tipo | Unidade | Origem | Regra de conversão |
|---|---|---|---|
| `Centavos` | 1/100 de real, **inteiro** | `number/double` do ERP | `Math.round(valor * 100)`, aplicado **no schema Zod**, na fronteira |
| `Milesimos` | 1/1000 de unidade, **inteiro** | quantidade digitada ou calculada | `Math.round(qtd * 1000)` — 3 casas cobrem a precisão de `round(..., 3)` de AD-076 |

**Invariante monetária**: nenhum valor de preço, desconto ou total existe como `double` dentro do domínio. Um `double` de preço só existe entre a resposta HTTP e o `.transform()` do Zod.

**Fórmula do total de linha**:

```
totalLinhaCentavos = arredondar(precoUnitarioCentavos × quantidadeMilesimos ÷ 1000)
```

**Distribuição de resto** (AD-072): quando um rateio (desconto de capa, desconto de convênio sobre múltiplas linhas) não fecha em centavos exatos, cada linha é arredondada **para baixo**, e a diferença total em centavos é distribuída 1 centavo por vez às linhas com maior parte fracionária descartada, do maior resto para o menor, até zerar. Nunca fração de centavo.

---

## 2. `SnapshotPrecoProduto`

A cópia dos dados de preço do produto, feita **no momento da inserção** e guardada dentro da própria linha. É o que torna `repricarSku` independente do cache do TanStack Query (`CART-05`, AC5).

```ts
export interface SnapshotPrecoProduto {
  readonly codigoProduto: string;      // SDTCheckout_GetProduto.CodigoProduto
  readonly descricao: string;          // .Descricao
  readonly unidadeMedida: string;      // .UDM
  readonly precoBase: Centavos;        // .PrecoVenda — usado para TipoPreco ≠ 8
  readonly precosFaixa: readonly [Centavos, Centavos, Centavos, Centavos, Centavos];
                                       // .PrecoVenda1 .. .PrecoVenda5 — usado só quando TipoPreco = 8
  readonly limiaresFaixa: readonly [Milesimos, Milesimos, Milesimos, Milesimos];
                                       // .QtdMinimaPreco2 .. .QtdMinimaPreco5
  readonly pesavelEditavel: PesavelEditavel; // .ProdutoPesavelEditavel
}

export type PesavelEditavel = 'S' | 'B' | '' | 'E';
```

| Valor de `pesavelEditavel` | Significado (AD-063 / AD-070) |
|---|---|
| `'S'` | Pesável, leitura na etiqueta |
| `'B'` | Pesável, leitura na balança |
| `''` | Não pesável, não editável — insere direto, campos somente-leitura |
| `'E'` | Não pesável, editável — abre edição, insere só no botão `+` |

Os quatro valores são **mutuamente exclusivos por construção do campo** (AD-070) — modelados como união exaustiva, com `never` no ramo default.

**Nota de origem**: este snapshot só pode ser montado a partir de `SDTCheckout_GetProduto` (retorno de `GetProduto`). O retorno de `GetListaProdutos` não possui `PrecoVenda` nem `ProdutoPesavelEditavel` — ver `research.md`, D1.

---

## 3. `LinhaCarrinho`

```ts
export interface LinhaCarrinho {
  readonly idLinha: string;              // crypto.randomUUID() — identidade própria, ver research.md D12
  readonly snapshot: SnapshotPrecoProduto;
  quantidade: Milesimos;
  precoUnitario: Centavos;               // resultado corrente de resolvePrecoUnitario
  descontoUnitario: Centavos;            // desconto aplicado por unidade (convênio ou manual em produto 'E')
  cancelada: boolean;                    // CART-08 — linha nunca sai do array
  readonly precoCongelado: boolean;      // true quando origem é rascunho de NFCe ou DAV (AD-067)
  readonly origem: OrigemLinha;
}

export type OrigemLinha = 'MANUAL' | 'BUSCA' | 'BALANCA' | 'RASCUNHO' | 'DAV';
```

### Invariantes

| # | Invariante | Requisito |
|---|---|---|
| I1 | Uma linha nunca é removida do array — cancelar apenas seta `cancelada = true` | `FR-009`, `CART-08` |
| I2 | Linha com `cancelada = true` é excluída da quantidade agregada e de todos os totais | `FR-009` |
| I3 | Linha com `precoCongelado = true` é excluída de `repricarSku` **e** da quantidade agregada | AD-067 + `research.md` D3 |
| I4 | Todas as linhas ativas não-congeladas do mesmo `codigoProduto` têm sempre o mesmo `precoUnitario` | `SC-001` |
| I5 | `precoCongelado` só é `true` quando `origem ∈ {'RASCUNHO', 'DAV'}` | `FR-017` |
| I6 | `precoCongelado` nunca vira `false` por reprecificação automática — só por reinserção ou edição explícita do operador | `FR-017`, `NFCE-04` |
| I7 | `quantidade > 0` em toda linha ativa | — |

---

## 4. Estado do slice

```ts
export interface CarrinhoState {
  readonly linhas: LinhaCarrinho[];    // ordem de inserção, incluindo canceladas
}
```

Derivações (seletores, nunca campos armazenados — evitam estado redundante que possa divergir):

| Seletor | Definição |
|---|---|
| `linhasAtivas` | `linhas.filter(l => !l.cancelada)` |
| `quantidadeAgregada(sku)` | soma de `quantidade` das linhas ativas **não-congeladas** com aquele `codigoProduto` |
| `totalVenda` | soma de `totalLinha` de todas as linhas ativas (congeladas incluídas, com o preço que trouxeram) |

---

## 5. Resolução de preço

```ts
resolvePrecoUnitario(
  tipoPreco: number,                 // SessaoUsuario.TipoPreco, 1..11
  snapshot: SnapshotPrecoProduto,
  quantidadeAgregada: Milesimos,
): Centavos
```

| `tipoPreco` | Resultado |
|---|---|
| `1`–`7`, `9`, `10`, `11` | `snapshot.precoBase` (campo `PrecoVenda`, já resolvido pelo ERP — AD-059/AD-060) |
| `8` | faixa resolvida abaixo |

### Resolução de faixa (`tipoPreco = 8`)

Modelo de **limiar único (flat)**, não progressivo: atingida a faixa, **todas** as unidades do SKU na venda valem o preço dela.

```
seja L = [limiarFaixa2, limiarFaixa3, limiarFaixa4, limiarFaixa5]   // QtdMinimaPreco2..5
seja P = [preco1, preco2, preco3, preco4, preco5]                   // PrecoVenda1..5

faixa = o maior i em {2,3,4,5} tal que L[i] > 0 e quantidadeAgregada >= L[i]
        (se nenhum satisfizer, faixa = 1)
precoUnitario = P[faixa]
```

Limiar com valor `0` é tratado como **faixa não configurada** e ignorado — o ERP devolve `0` nos `QtdMinimaPreco` não usados pelo produto.

#### Exemplo (valores sintéticos)

Produto com `PrecoVenda1 = 1000` centavos, `PrecoVenda2 = 900`, `QtdMinimaPreco2 = 5000` milésimos (5 unidades), demais limiares `0`:

| Evento | Qtd. agregada | Faixa | Preço aplicado a **todas** as linhas ativas do SKU |
|---|---|---|---|
| Insere 3 un. | 3000 | 1 | 1000 |
| Insere +3 un. (2ª linha) | 6000 | 2 | 900 — **as duas linhas** recalculam |
| Cancela a 2ª linha (3 un.) | 3000 | 1 | 1000 — a linha remanescente volta à faixa inferior |

Isso é exatamente o `Independent Test` da User Story 3 da spec.

---

## 6. Transições de estado da linha

```
                    inserir (CART-02 / CART-01)
                              │
                              ▼
   ┌──────────────────► ATIVA ◄──────────────────┐
   │                      │                      │
   │  editar quantidade   │  cancelar            │  reinserir / editar
   │  (dispara repricar)  │  (CART-08)           │  explicitamente (FR-017)
   │                      ▼                      │
   │                  CANCELADA ──────────┐      │
   │                  (permanece no       │      │
   │                   array, riscada)    │      │
   │                                      │      │
   └──────────── CONGELADA ───────────────┴──────┘
                (origem RASCUNHO/DAV;
                 fora de repricar e
                 fora do agregado)
```

- `ATIVA → CANCELADA`: permitida apenas enquanto `podeMutarCarrinho()` for `true` (`FR-010`, AD-030). Não exige supervisor nem reautenticação (`FR-012`, AD-065).
- `CANCELADA` é terminal — a spec não define reativação de linha cancelada; o operador insere uma linha nova.
- `CONGELADA → ATIVA`: apenas por ação explícita do operador (reinserção ou edição), nunca por reprecificação automática (I6).

---

## 7. Entradas de código do operador

```ts
type EntradaCodigo =
  | { readonly tipo: 'SIMPLES';  readonly codigo: string }
  | { readonly tipo: 'COM_QTD';  readonly codigo: string; readonly quantidade: Milesimos }
  | { readonly tipo: 'BALANCA';  readonly codigoReduzido: string; readonly valorEtiqueta: Centavos };
```

Ordem de classificação (`research.md`, D6): `*` → balança → simples.

### Máscara do código de balança (AD-076, confirmada em `PAnalisaCodigoProduto`)

Para um EAN-13 iniciado em `2` com DV válido — exemplo sintético `2` `001234` `01500` `7`:

| Posições | Conteúdo | Exemplo | Interpretação |
|---|---|---|---|
| 1 | Prefixo | `2` | Marcador de código gerado por balança |
| 2–7 | Código reduzido do produto | `001234` | Código a enviar em `GetProduto` |
| 8–12 | Valor da etiqueta | `01500` | `1500` centavos (2 últimos dígitos = centavos) |
| 13 | Dígito verificador EAN-13 | `7` | Validado à parte; não é dado de negócio |

**Quantidade do produto pesável** (AD-076):

```
quantidade = round(trunc(valorEtiqueta / precoVendaDoProduto, 5), 3)
```

Quando `PrecoVenda` do produto não está informado no ERP, a inserção é **bloqueada** com aviso ao operador (`FR-013`) — nunca inserida com quantidade indefinida.

---

## 8. Eventos de auditoria emitidos

Consumidos via o contrato da feature 001 (`specs/001-auditoria-acoes-operador/contracts/auditoria-events.md`). Detalhamento e regra de "reprecificação não gera evento" em `research.md`, D11.

| Ação do operador | Evento | `detalhes` |
|---|---|---|
| Linha efetivamente inserida | `PRODUTO_INSERIDO` | `{ codigoProduto, quantidade, precoUnitario, desconto }` |
| Campo de linha editado | `PRODUTO_ALTERADO` | `{ codigoProduto, campo, valorAnterior, valorNovo }` |
| Linha cancelada | `PRODUTO_CANCELADO` | `{ codigoProduto }` |
