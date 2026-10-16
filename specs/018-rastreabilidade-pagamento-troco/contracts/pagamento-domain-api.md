# Contract: deltas na API de domínio do pagamento (008/010/014/001)

Só o que muda. O contrato base continua em `specs/008-pagamento-geral/contracts/pagamento-domain-api.md`.

## Slice de pagamento

| Action | Pré-condição | Efeito | Eventos |
|---|---|---|---|
| `descartarPagamento()` | sem TEF `APROVADO` (senão no-op + `AVISO_TEF_IRREVERSIVEL`); há pagamento vivo, condição ou capa (senão no-op silencioso) | vivos → `EXCLUIDO`; `EXCLUIDO` permanece; `condicaoSelecionada`, `descontoCapa` = `null`; `valesDevolucao` = `[]`; `invalidarVeredito()` | `FORMA_PAGAMENTO_REMOVIDA` com `motivo: 'LIMPAR'`, um por forma que **era** viva |
| `removerPagamento(id)` | inalterada | inalterado | `FORMA_PAGAMENTO_REMOVIDA` com `motivo: 'OPERADOR'` e detalhes completos |
| `confirmarEstornoTef(id)` | inalterada | inalterado | `FORMA_PAGAMENTO_REMOVIDA` com `motivo: 'ESTORNO_TEF'` e `tefPagId` |
| `importarFormasDePagamento(formas)` | inalterada | antes de gravar, `reconstruirTrocoImportado(importados, deps.subtotalCarrinho())` | nenhum (inalterado) |
| `limparPagamentos()` | inalterada | **inalterado**: esvazia tudo | nenhum |
| `registrarIdentificadorIntegracao(id, { tefPagId?, pixGuid? })` (US4) | forma em `PENDENTE_INTEGRACAO`; no-op fora disso | guarda o identificador da cobrança recém-criada; não muda o status nem entra no payload | nenhum |
| `recusarPagamentoIntegrado(id, motivo)` (US4) | forma em `PENDENTE_INTEGRACAO` | com identificador guardado ou `motivo === MOTIVO_DESISTENCIA_DO_OPERADOR`: forma vira `EXCLUIDO` e fica na lista; senão, sai da lista | `PAGAMENTO_RECUSADO`, com `formaPagamento`, `valor`, `tefPagId?` e `pixGuid?` quando a forma fica riscada |

## Funções puras novas (`src/client/domain/pagamento/`)

```ts
// Definido em `domain/auditoria/eventos.ts`, junto do evento que ele descreve.
// `domain/pagamento` importa da auditoria, nunca o contrário.
type MotivoRemocaoPagamento = 'OPERADOR' | 'ESTORNO_TEF' | 'LIMPAR';

/** Detalhes de `FORMA_PAGAMENTO_REMOVIDA` para um pagamento — FR-010 a FR-014. */
function detalhesDaRemocao(
  pagamento: PagamentoAplicado,
  rotulo: string,
  motivo: MotivoRemocaoPagamento,
): EventoFormaPagamentoRemovida['detalhes'];

/** Reconstrói o troco do dinheiro de um documento retomado — FR-020/FR-021. */
function reconstruirTrocoImportado(
  pagamentos: readonly PagamentoAplicado[],
  totalLiquido: Centavos,
): PagamentoAplicado[];
```

## Retrato (`formaParaRetrato`)

`FormaValor = reaisDeCentavos(pagamento.valorRecebido ?? pagamento.valorAplicado)`. Nenhum outro campo muda.

## Validação prévia (`projetarPagamentos`)

`FormaCandidata.valorRecebido: Centavos | null` (novo), copiado por `candidataComoPagamento`.

## UI

- `BotaoLimparPagamento` (`ConfiguracaoPagamento.tsx`): `vazio` e `temPix` passam a considerar só pagamentos vivos (`pagamentoVivo`).
- `ListaPagamentosAplicados.tsx`: sem mudança de código. As linhas riscadas pelo "Limpar" usam o tratamento de `EXCLUIDO` que já existe.
