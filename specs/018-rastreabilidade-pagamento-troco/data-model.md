# Data Model: Rastreabilidade de pagamentos cancelados e troco enviado ao ERP

Deltas sobre `specs/008-pagamento-geral/data-model.md`, `specs/001-auditoria-acoes-operador/data-model.md` e `specs/014-validacao-previa-nfce/contracts/validacao-domain-api.md`. Nada aqui é entidade nova: são campos e transições a mais em entidades existentes.

---

## 1. `PagamentoAplicado` — um campo novo (`tefPagId`, US4)

Estados inalterados (`saldoPagamento.ts`). **Campo novo da US4:** `tefPagId: string | null`, o `payment_identifier` da cobrança TEF **criada**, guardado antes da aprovação ao lado de `dadosTEF` (que só existe depois do `CNC`). `pixGuid` já existia e passa a ser preenchido na geração da cobrança, não só na aprovação; só a forma `APROVADO` vai ao payload, então o valor guardado numa forma pendente nunca chega a `FormaPixGUID`/`TEFPagId`. Muda **quem** leva um pagamento a `EXCLUIDO`:

| Transição | Antes | Depois |
|---|---|---|
| `APROVADO`/`PENDENTE_INTEGRACAO` → `EXCLUIDO` por `removerPagamento` | sim (exceto TEF aprovado) | sim, inalterado |
| TEF `APROVADO` → `EXCLUIDO` por `confirmarEstornoTef` | sim | sim, inalterado |
| vivo → **retirado do array** por `descartarPagamento` | sim | **não** |
| vivo → `EXCLUIDO` por `descartarPagamento` | não | **sim** (FR-002) |
| `EXCLUIDO` → retirado do array por `descartarPagamento` | sim | **não**, permanece (FR-003) |
| qualquer → retirado do array por `limparPagamentos` (pós-finalização) | sim | sim, inalterado (FR-009) |
| qualquer → substituído por `importarFormasDePagamento` | sim | sim, inalterado |

**Invariantes mantidas**:
- I3 (`valorRecebido !== null` ⇔ dinheiro): mantida, inclusive na reconstrução de troco da importação (§4).
- `EXCLUIDO` é terminal. `confirmarPagamentoIntegrado` só transiciona `PENDENTE_INTEGRACAO`.
- Toda regra de "há pagamento?" usa `pagamentoVivo` ou `status === 'APROVADO'`, então formas riscadas pelo "Limpar" ficam fora de saldo, payload, congelamento e guardas (FR-008).

**Invariante nova (I-18.1)**: depois de `descartarPagamento` aceito, `pagamentos.filter(pagamentoVivo)` é vazio e `pagamentos.length` é igual ao de antes da chamada.

**Transições da US4** (`recusarPagamentoIntegrado`, só a partir de `PENDENTE_INTEGRACAO`):

| Situação | Antes | Depois |
|---|---|---|
| desistência do operador (`FECHADO_PELO_OPERADOR`) | retirada do array | `EXCLUIDO`, na lista, riscada |
| falha de cobrança já criada (identificador guardado) | retirada do array | `EXCLUIDO`, na lista, riscada |
| recusa sem cobrança e sem desistência (sem cliente, sem GAM, PIX abaixo do mínimo) | retirada do array | retirada do array (inalterado, FR-024) |

`registrarIdentificadorIntegracao` só age em `PENDENTE_INTEGRACAO`. **Invariante nova (I-18.2)**: um identificador guardado numa forma pendente nunca chega a `FormasDePagamento` (só `APROVADO` vai ao payload).

O evento é `PAGAMENTO_RECUSADO` com `formaPagamento`, `valor`, `tefPagId?` e `pixGuid?` quando a forma fica riscada.

---

## 2. `FormaCandidata` — campo novo

```ts
interface FormaCandidata {
  // ...campos atuais
  /** O que o cliente entregou: só dinheiro, `null` nas demais (I3). */
  readonly valorRecebido: Centavos | null;
}
```

- Preenchido em `aplicarNucleo` com o `valorRecebido` de `derivarValores`.
- `candidataComoPagamento` copia o campo para o `PagamentoAplicado` projetado, em vez de fixar `null`.
- **Invariante I5 (014), reafirmada**: para os mesmos pagamentos, `projetarPagamentos(...)` e `montarPagamentosParaPayload().FormasDePagamento` produzem o mesmo `FormaValor` em dinheiro (FR-018).

---

## 3. `FormaDePagamentoRetrato.FormaValor` — regra nova

| Forma | Antes | Depois |
|---|---|---|
| Dinheiro | `reais(valorAplicado)` | `reais(valorRecebido ?? valorAplicado)` |
| Demais | `reais(valorAplicado)` | inalterado (`valorRecebido` é `null`) |

**Invariante revogada**: `Σ FormaValor == total líquido` (D3 da 008). **Substituída por**: `Σ FormaValor == total líquido + troco`, onde `troco` é o que `calcularSaldo` já exibe.

---

## 4. Importação de documento — reconstrução do troco

`reconstruirTrocoImportado(pagamentos, totalLiquido): PagamentoAplicado[]`, função pura.

| Condição | Resultado |
|---|---|
| `Σ valorAplicado ≤ totalLiquido` | lista intacta (FR-021) |
| excedente > 0 e exatamente 1 dinheiro com `valorAplicado ≥ excedente` | nesse dinheiro: `valorRecebido = valor original`, `valorAplicado = valor original − excedente` |
| excedente > 0 sem dinheiro, com 2+ dinheiros, ou com excedente maior que o dinheiro | lista intacta (sem inventar troco) |

Exemplo: total R$ 87,00, documento com dinheiro R$ 100,00 → `valorAplicado` 8700, `valorRecebido` 10000, troco exibido R$ 13,00.

---

## 5. Evento `FORMA_PAGAMENTO_REMOVIDA` — detalhes ampliados

Delta da linha 12 de `specs/001-auditoria-acoes-operador/data-model.md`:

| Campo | Tipo | Obrigatório | Origem |
|---|---|---|---|
| `formaPagamento` | `string` | sim | rótulo da forma, resolvido antes de qualquer `set` (inalterado) |
| `valor` | `number` (centavos inteiros) | sim | `valorRecebido ?? valorAplicado` |
| `motivo` | `MotivoRemocaoPagamento` = `'OPERADOR' \| 'ESTORNO_TEF' \| 'LIMPAR'` | sim | a action que excluiu |
| `tefPagId` | `string` | só se há `dadosTEF` ou `tefPagId` guardado na criação da cobrança (US4) | `dadosTEF?.pagId ?? tefPagId` (`payment_identifier` da SmartTEF) |
| `pixGuid` | `string` | só se `pixGuid !== null` (a cobrança PIX foi gerada; desde a US4 vale também para o pendente) | `pixGuid` |

| Action | `motivo` |
|---|---|
| `removerPagamento` | `OPERADOR` |
| `confirmarEstornoTef` | `ESTORNO_TEF` |
| `descartarPagamento` | `LIMPAR` (uma vez por forma viva; nenhum evento para forma já `EXCLUIDO`) |
