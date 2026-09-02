# Contract: consumo dos endpoints de produto do ERP

Contrato de **consumo**, não de exposição — o Checkout não publica API própria. Todas as chamadas passam pelo proxy autenticado `/api/erp/*` do BFF (feature 002), que injeta `Authorization` e `Empresa` no servidor. O frontend nunca chama o ERP diretamente nem manipula `access_token`.

Fonte dos campos: `Fluxograma - Diagrama - Alinhamentos/APICentriumOAuth.yaml`.

---

## 1. `GET /api/erp/GetListaProdutos` — busca por termo livre (`CART-01`)

### Parâmetros aceitos pelo contrato

| Parâmetro | Tipo | Origem no Checkout |
|---|---|---|
| `Empresa` | int64 | injetado pelo BFF |
| `Txtbusca` | string | termo digitado pelo operador |
| `Pagina` | int32 | paginação do modal |
| `Tamanhopagina` | int64 | paginação do modal |

**Não existem** os parâmetros `Tipocodproduto`, `Tipopreco`, `Codcliente` ou `Listapreco` neste endpoint.

### Guarda de disparo

A chamada só é feita quando `Txtbusca.length >= SessaoUsuario.QtdMinCharParaConsulta` (AD-024). O valor vem do `GetSessao` já com piso de 3 aplicado pelo próprio ERP (`PCheckout_GetSessao`) — **nunca hardcodar 3** no Checkout.

### Resposta — `CheckoutListaProdutos`

```jsonc
{
  "ListaProdutos": {
    "PaginaAtual": 1,
    "RegistrosPorPagina": 20,
    "TotalRegistros": 137,
    "TotalPaginas": 7,
    "Produtos": [
      {
        "CodigoProduto": "001234",
        "Descricao": "PRODUTO EXEMPLO 500G",
        "Referencia": "REF-EX",
        "CodigoBarras": "7890000000001",
        "PrecoVenda1": 10.00, "PrecoVenda2": 9.00,
        "PrecoVenda3": 0, "PrecoVenda4": 0, "PrecoVenda5": 0,
        "Estoque": 42.0,
        "CodigoGrupo": 1, "DescricaoGrupo": "GRUPO EXEMPLO",
        "CodigoSubgrupo": 1, "DescricaoSubgrupo": "SUBGRUPO EXEMPLO",
        "Aplicacao": "", "GTINTributavel": "7890000000001",
        "QtdMinimaPreco2": 5, "QtdMinimaPreco3": 0,
        "QtdMinimaPreco4": 0, "QtdMinimaPreco5": 0,
        "UDM": "UN"
      }
    ]
  }
}
```

> Valores sintéticos, não dados de produção.

### Uso permitido da resposta

**Apenas para exibir e escolher.** Campos consumidos: `CodigoProduto`, `Descricao`, `Referencia`, `CodigoBarras`, `UDM`, e os campos de paginação.

**Proibido montar `LinhaCarrinho` a partir desta resposta** — o schema não traz `PrecoVenda` (preço já resolvido pelo ERP, obrigatório para todo `TipoPreco ≠ 8`) nem `ProdutoPesavelEditavel` (decide o fluxo de inserção). Ao selecionar um candidato, o Checkout chama `GetProduto` com o `CodigoProduto` escolhido. Confirmado por decisão direta do usuário em AD-091 — ver `research.md`, D1, e `.specs/project/STATE.md`.

---

## 2. `GET /api/erp/GetProduto` — resolução do produto (`CART-02`)

Chamado em **todos** os caminhos de inserção: código bipado, código digitado, `codigo*quantidade`, código de balança e seleção no modal de busca.

### Parâmetros enviados

| Parâmetro | Tipo | Regra |
|---|---|---|
| `Empresa` | int64 | injetado pelo BFF |
| `Codigoproduto` | string | código digitado/bipado, ou o código reduzido extraído do EAN-13 de balança, ou o `CodigoProduto` do candidato selecionado na busca |
| `Tipocodproduto` | string | **sempre** `SessaoUsuario.UsuarioTipoCodigoProduto` (AD-033) — nunca inferido por chamada |
| `Tipopreco` | int32 | `SessaoUsuario.TipoPreco` |
| `Codcliente` | int64 | código do cliente atual da venda (feature 005) — inclusive o cliente default (`SessaoUsuario.ClienteDefaultCodigo`), que existe desde o início da venda (AD-032) |
| `Listapreco` | int64 | **só quando `TipoPreco = 9`**. Para um cliente selecionado explicitamente, `ClienteCheckout.ListaPreco`; para o **cliente default** (`origem = 'DEFAULT'`), `SessaoUsuario.ListaPrecoDefault`, sem chamar `GetCliente` (AD-108). Para `TipoPreco ≠ 9`, o parâmetro é **omitido**. Não existe lista de preço padrão da empresa e não há fallback (AD-092) |

### Resposta — `SDTCheckout_GetProduto`

```jsonc
{
  "CodigoProduto": "001234",
  "Descricao": "PRODUTO EXEMPLO 500G",
  "Referencia": "REF-EX",
  "CodigoBarras": "7890000000001",
  "PrecoVenda": 10.00,            // preço já resolvido pelo ERP — usado para todo TipoPreco ≠ 8
  "PrecoVenda1": 10.00, "PrecoVenda2": 9.00,
  "PrecoVenda3": 0, "PrecoVenda4": 0, "PrecoVenda5": 0,
  "PrecoMinimo": 8.50,
  "Estoque": 42.0,
  "CodigoGrupo": 1, "DescricaoGrupo": "GRUPO EXEMPLO",
  "CodigoSubgrupo": 1, "DescricaoSubgrupo": "SUBGRUPO EXEMPLO",
  "Aplicacao": "", "GTINTributavel": "7890000000001",
  "QtdMinimaPreco2": 5, "QtdMinimaPreco3": 0,
  "QtdMinimaPreco4": 0, "QtdMinimaPreco5": 0,
  "UDM": "UN",
  "ProdutoPesavelEditavel": ""    // 'S' | 'B' | '' | 'E'
}
```

> Valores sintéticos, não dados de produção.

### Validação de fronteira (Zod) — `src/shared/schemas/produto.schema.ts`

Obrigatória (Constitution IV). O schema faz três coisas além de validar o shape:

1. **Converte preços para `Centavos` inteiros** — `z.number().transform(v => Math.round(v * 100) as Centavos)`. Nenhum `double` de preço passa para dentro do domínio.
2. **Converte limiares para `Milesimos`** — `QtdMinimaPreco2..5` chegam como `int64` de unidades inteiras; viram `valor * 1000`.
3. **Restringe `ProdutoPesavelEditavel`** a `z.enum(['S', 'B', '', 'E'])` — um valor fora desses quatro é erro de fronteira, não um quinto comportamento silencioso.

O resultado da validação é mapeado para `SnapshotPrecoProduto` (`data-model.md`, §2) por `src/client/services/produto/produtoMapper.ts`.

### Erros

| Situação | Comportamento |
|---|---|
| `404` (produto não encontrado) | Toast de erro, nenhuma linha inserida, foco permanece no campo de entrada |
| `401` | Tratado no BFF (renovação silenciosa, feature 002) — invisível ao carrinho |
| Falha de validação Zod | Erro de fronteira: toast, nenhuma linha inserida — nunca inserir com dado parcial |
| Produto pesável com `PrecoVenda` ausente/zero | Inserção **bloqueada** com aviso ao operador (`FR-013`, AD-076) |

---

## 3. Cache (TanStack Query)

```ts
queryKey: ['produto', codigoProduto, tipoCodProduto, tipoPreco, listaPreco ?? null]
staleTime: Infinity

// Leitura imperativa (fora de componente reativo), no caminho de inserção:
queryClient.query({ ...opcoesProduto(codigoProduto, contexto), staleTime: 'static' })
```

- `staleTime: Infinity` durante toda a venda — reinserir o mesmo SKU não gera nova chamada (`CART-03`) e o mesmo SKU nunca produz linhas de tabelas divergentes.
- A inserção resolve o produto **imperativamente**, não por `useQuery`: quem dispara é uma bipagem ou um clique, não um render. Na v5 do TanStack Query isso é `queryClient.query({ ..., staleTime: 'static' })` — `fetchQuery` e `ensureQueryData` estão `@deprecated` (AD-121). `staleTime: 'static'` é o "nunca considerar obsoleto enquanto estiver em cache", que é literalmente a garantia que `CART-03` pede.
- `listaPreco` faz parte da chave porque trocar o cliente em `TipoPreco = 9` muda o preço do mesmo código (`FR-018`, AD-043).
- Invalidação total (`removeQueries({ queryKey: ['produto'] })`) em exatamente dois momentos: finalização e suspensão da venda.
- O cache é otimização de rede. `repricarSku` **nunca** o consulta — opera sobre o snapshot copiado para dentro da linha (`CART-05`, AC5).
