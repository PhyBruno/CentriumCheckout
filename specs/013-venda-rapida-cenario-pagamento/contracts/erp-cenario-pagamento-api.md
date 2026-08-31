# Contrato de fronteira — `SessaoUsuario.CenarioPagamento`

**Feature**: 013 — Venda Rápida por Cenário de Pagamento
**Origem verificada**: KB GeneXus `CentriumDEVU6` (procedure `PCheckout_GetSessao`, tabela `TCenarioPagamento`) e `ApiCentriumOAuth.yaml` versão `20260827192357`, linha 903.
**Data da verificação**: 2026-08-31

---

## 1. Declaração no contrato OpenAPI

```yaml
# components/schemas/SessaoUsuario (trecho)
CenarioPagamento:
  description: "Cenario Pagamento"
  type: "string"
```

O contrato declara **apenas** `string`. Toda a estrutura interna descrita abaixo é convenção do ERP, verificada no código-fonte da procedure — não é validada pelo contrato e, portanto, **precisa ser validada pelo Checkout na fronteira** (Constitution IV).

## 2. Como o ERP monta o valor

```
&CenarioPagamento = new()                              // coleção de character

For each Order CPgEmpCod CPgFpgCod
    where CPgEmpCod = &Empresa
    &Mensagem = CPgFpgCod + ';' + CPgFpgDes + ';' + CPgPraCod + ';' + CPgPraDes
              + ';' + CPgNome + ';' + CPgIsEncerraOperacao + ';' + CPgTeclaAtalho
    &CenarioPagamento.add(&Mensagem)
endfor

&SessaoUsuario.CenarioPagamento = &CenarioPagamento.ToJson()
```

Consequências diretas, todas tratadas no parser:

1. O valor é um **array JSON serializado em string** — exige dois níveis de parse.
2. O `For each` **não filtra** por tecla preenchida: cenários sem atalho vêm junto, com o último campo vazio.
3. Não há limite de quantidade nem restrição de tecla no lado do ERP.
4. Os campos de texto livre (`CPgFpgDes`, `CPgPraDes`, `CPgNome`) ficam **no meio** da sequência, o que tornaria um item com `;` extra genuinamente ambíguo. Por decisão do usuário (2026-08-31, AD-105), o ERP **garante que esses campos não conterão `;`** — o parser mantém o descarte por contagem de campos como defesa contra dado inesperado, não como tratamento de caso esperado (ver seção 7).

## 3. Forma esperada (exemplo sintético)

```json
"[\"1;DINHEIRO;1;A VISTA;Dinheiro à vista;True;F6\",\"3;CARTAO DEB;1;A VISTA;Débito à vista;True;F7\",\"7;CREDIARIO;30;30 DIAS;Crediário 30 dias;False;\"]"
```

Após o parse, o terceiro item é descartado (tecla vazia) e os dois primeiros viram atalhos em F6 e F7.

## 4. Schema de fronteira (Zod)

Contrato da validação, não sua implementação:

| Elemento | Regra | Falha ⇒ |
|---|---|---|
| campo `CenarioPagamento` | `string`, opcional, aceita ausente e vazio | catálogo vazio, sem erro (`FR-007`) |
| conteúdo | JSON válido representando `string[]` | catálogo vazio, sem erro (`FR-007`) |
| item | exatamente 7 partes ao separar por `;` | item descartado (`FR-004`) |
| parte 0, parte 2 | inteiro | item descartado |
| parte 4 (`nome`) | não vazia após `trim` | item descartado |
| parte 5 (`encerraOperacao`) | `true` só para `true\|1\|s\|sim\|y\|yes` (sem distinção de caixa, após `trim`) | qualquer outro valor ⇒ `false` (`FR-018`) |
| parte 6 (`tecla`) | após `trim` e caixa alta, ∈ `{F6,F7,F8,F9}` | item descartado (`FR-003`) |

Nenhuma dessas falhas propaga exceção: o parser é total, e o pior desfecho possível é uma lista de atalhos vazia.

## 5. Referência cruzada com o catálogo de pagamento

Antes de virar atalho, o par `(condicaoCodigo, formaCodigo)` é confrontado com `SessaoUsuario.CondicoesDePagamento[]` do mesmo payload:

- `condicaoCodigo` deve existir como `CondicoesDePagamento[].CondicaoCodigo`;
- `formaCodigo` deve existir como `CondicoesDePagamento[].CondicaoFormasDePagamento[].FormaCodigo` **dentro daquela condição**.

Sem essa checagem, um cenário legado apontando para uma forma desativada produziria um pagamento que o caminho manual recusaria (`FR-005`).

## 6. O que o Checkout **não** faz com este contrato

- Não chama nenhum endpoint de cenários — ele não existe (`research.md`, D1).
- Não usa `PCenarioPagamento_BuscaPorTeclaAtalho`: é procedure interna da KB, não exposta na API REST.
- Não grava, corrige nem reordena cenários no ERP; a leitura é estritamente unidirecional (Constitution III).

## 7. Pontos fechados com o ERP (sem pendência aberta)

Ambos resolvidos por decisão direta do usuário em 2026-08-31 — este contrato é definitivo:

| Ponto | Decisão | Consequência no parser |
|---|---|---|
| Formato delimitado (AD-105) | Serialização estruturada **não é viável**; o formato com `;` é definitivo, e em contrapartida os campos de texto do cadastro **não conterão `;`** | o descarte por contagem de campos ≠ 7 **permanece**, agora como defesa contra dado inesperado — não se espera que descarte cenário legítimo |
| Literal do booleano (AD-106) | O conjunto fechado de literais é a solução **definitiva**, não provisória | o conjunto aceito (`true`/`1`/`s`/`sim`/`y`/`yes`, sem distinção de caixa) **não será estreitado**; o padrão `false` na dúvida é permanente |

Não há nada a confirmar com a equipe do ERP sobre este campo.
