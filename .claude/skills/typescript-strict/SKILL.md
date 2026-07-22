---
name: typescript-strict
description: Use ao escrever ou revisar qualquer TypeScript no CentriumCheckout, especialmente tipos e contratos nas fronteiras de dado (resposta do ERP, TEF/PIX, finalização). Garante TS strict como defesa contra alucinação de campos em código gerado por IA — proibição de `any`/`as` na fronteira, `import type`, type guards, utility types e tipos derivados do schema Zod.
metadata:
  origin: "Adaptada de Gentleman-Programming/Gentleman-Skills (curated/typescript, Apache-2.0/MIT), reconciliada com as regras de fronteira do CentriumCheckout"
---

# TypeScript strict — CentriumCheckout

## Por que esta skill existe

O `ARCHITECTURE.md` (seção 2) chama o TypeScript `strict` de **"principal defesa
contra alucinação de campos/contratos em código gerado por IA"**. Como 100% do
código do projeto é gerado por IA, o compilador é a rede de segurança mais barata
que existe — mas só funciona se o código não abrir buracos nela (`any`, `as`, `!`).
Esta skill torna essas regras explícitas e verificáveis em revisão.

## Regra 1 — `any` proibido; use `unknown` + narrowing

Nunca `any`. Para dado genuinamente desconhecido, use `unknown` e estreite com um
type guard antes de tocar a lógica de negócio:

```ts
// Errado (NUNCA):
function processar(entrada: any) { /* ... */ }

// Certo — unknown + narrowing explícito:
function processar(entrada: unknown): Produto {
  if (isProduto(entrada)) return entrada;
  throw new Error("Contrato de produto inválido");
}
```

## Regra 2 — `as` e `!` são proibidos na fronteira de dados do ERP

Type assertion (`as Tipo`) e non-null assertion (`!`) sobre dado vindo do ERP, do
TEF ou da API de PIX **removem exatamente a defesa que o projeto precisa** — são a
mesma classe de risco que a `money-precision` e a `zod-boundary-validation`
sinalizam. Na fronteira, o tipo tem que vir de `z.infer` do schema Zod que validou
o dado, nunca de uma asserção que "confia" na resposta de rede.

```ts
// Errado (NUNCA na fronteira):
const produto = (await resp.json()) as ProdutoResposta;

// Certo — tipo derivado do schema que de fato validou o dado:
const parsed = ProdutoRespostaSchema.safeParse(await resp.json());
if (!parsed.success) { /* trata como evento de 1a classe */ }
const produto = parsed.data; // tipo = z.infer<typeof ProdutoRespostaSchema>
```

`as`/`!` fora da fronteira (ex.: `as const`, estreitamento comprovadamente seguro)
são aceitáveis, mas exigem justificativa em comentário quando não óbvios.

## Regra 3 — Tipos de fronteira derivam do schema Zod (`z.infer`), nunca escritos à mão

Um `type ProdutoResposta = { ... }` escrito à mão em paralelo ao
`ProdutoRespostaSchema` pode divergir silenciosamente do schema quando um dos dois
mudar — e código gerado por IA erra nesse tipo de duplicação. A fonte única do tipo
de qualquer dado externo é o schema Zod:

```ts
export const ProdutoRespostaSchema = z.object({ /* ... */ });
export type ProdutoResposta = z.infer<typeof ProdutoRespostaSchema>;
```

Ver `zod-boundary-validation` para os 4 pontos de fronteira concretos do projeto.

## Regra 4 — Uniões discriminadas de literais são bem-vindas (reconciliação)

> Nota de adaptação: a skill de origem (Gentleman-Skills) prega "sempre const-object,
> nunca union type direto". **Neste projeto essa regra é relaxada**: uniões
> discriminadas de literais são o padrão recomendado onde não há necessidade de um
> valor em runtime — em particular no `TefPixRespostaSchema`, que a
> `zod-boundary-validation` modela como união discriminada por `status`.

```ts
// Certo — união discriminada obriga tratar os três casos no consumidor:
type TefPixResultado =
  | { status: "aprovado"; nsu: string }
  | { status: "negado"; motivo: string }
  | { status: "pendente" };
```

Use **const-object + tipo derivado** apenas quando precisar do valor em runtime
(ex.: iterar as opções, exibir num select), não como regra universal:

```ts
const FORMA_PAGAMENTO = { DINHEIRO: "dinheiro", PIX: "pix", CARTAO: "cartao" } as const;
type FormaPagamento = (typeof FORMA_PAGAMENTO)[keyof typeof FORMA_PAGAMENTO];
```

## Regra 5 — `import type` para imports de tipo

Separe imports de tipo dos de valor — deixa explícito o que é apagado na compilação
e evita ciclos de import acidentais:

```ts
import type { ProdutoResposta } from "./schemas/produto";
import { fetchProdutoBySku, type QueryConfig } from "./api/produto";
```

## Regra 6 — Type guards nomeados para estreitar `unknown`

```ts
function isProduto(v: unknown): v is Produto {
  return typeof v === "object" && v !== null && "sku" in v && "precos" in v;
}
```

Em fronteira de rede, prefira o `safeParse` do Zod ao type guard manual — o schema
já é o guard. Type guard manual é para estreitamentos internos que não passam pela
fronteira.

## Regra 7 — Utility types em vez de redigitar formas

`Pick` / `Omit` / `Partial` / `Required` / `Readonly` / `Record` / `ReturnType` /
`Parameters` / `NonNullable` — reaproveite em vez de reescrever uma forma quase
igual (fonte comum de divergência em código gerado por IA). Ex.: a linha do carrinho
copia só um subconjunto do produto → `Pick<Produto, "sku" | "precos" | "faixasQuantidade">`
como base, em vez de redeclarar os campos.

## Regra 8 — Interfaces planas (um nível), aninhado vira interface dedicada

Formas aninhadas inline dificultam a revisão de diffs gerados por IA. Extraia:

```ts
// Errado — inline aninhado:
interface Venda { cliente: { id: string; nome: string } }

// Certo — referência a interface dedicada:
interface Cliente { id: string; nome: string }
interface Venda { cliente: Cliente }
```

## Relação com outras skills

- `zod-boundary-validation` — a fonte dos tipos de fronteira (`z.infer`); Regras 2–4.
- `money-precision` — o mesmo veto a `any`/`as`/`!` aplicado à área de maior risco.
- `zustand-immer-state` — tipagem do estado da venda; ver o shape de `CartLine`.

## Origem e atribuição

Adaptada da skill `curated/typescript` de `Gentleman-Programming/Gentleman-Skills`
(licença permissiva — frontmatter declara Apache-2.0, repositório anuncia MIT; ambas
exigem apenas atribuição). O conteúdo aqui foi reescrito para o contexto do
CentriumCheckout e **reconciliado** com as regras de fronteira do projeto — em
especial a Regra 4, que relaxa a orientação anti-union da fonte para preservar as
uniões discriminadas usadas na validação Zod do TEF/PIX.
