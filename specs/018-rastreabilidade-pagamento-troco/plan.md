# Implementation Plan: Rastreabilidade de pagamentos cancelados e troco enviado ao ERP

**Branch**: `feat/rastreabilidade-pagamento-troco` | **Date**: 2026-10-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/018-rastreabilidade-pagamento-troco/spec.md`

## Summary

Três ajustes no pagamento já existente (features 008/010/014/001), sem entidade nova:

1. **Auditoria (US1, P1)**: `FORMA_PAGAMENTO_REMOVIDA` ganha `valor`, `motivo` e, quando há, `tefPagId` (`payment_identifier` da SmartTEF) e `pixGuid`. Os detalhes saem de uma função pura única chamada pelas três actions que excluem forma (research D4).
2. **"Limpar" (US2, P2)**: `descartarPagamento` marca como `EXCLUIDO` em vez de esvaziar o array, mantendo as já riscadas; o botão passa a olhar só pagamentos vivos (D3).
3. **Troco (US3, P3)**: `formaParaRetrato` manda `valorRecebido ?? valorAplicado` em `FormaValor`; `FormaCandidata` carrega o recebido para a validação prévia continuar idêntica ao faturamento (I5); a importação reconstrói o troco do dinheiro do documento (D2, D6). Merge bloqueado até confirmar o faturamento no ERP (D1).

## Technical Context

**Language/Version**: TypeScript 5 (`strict`), React 19

**Primary Dependencies**: Zustand 5 + Immer (slice de pagamento), Zod 4 (fronteira, sem mudança de schema nesta feature)

**Storage**: N/A (estado de venda em memória, sem `persist`, Constitution VI)

**Testing**: Vitest + Testing Library (unit/integration), Playwright (e2e) com o mock do ERP

**Target Platform**: SPA no navegador do PDV (desktop e mobile)

**Project Type**: web-app (SPA + BFF mínimo de sessão)

**Performance Goals**: N/A (mudanças O(n) sobre a lista de pagamentos de uma venda)

**Constraints**: retrato validado (014) e emitido (004) idênticos (I5); valores monetários em centavos inteiros (Constitution V)

**Scale/Scope**: ~6 arquivos de `src/`, ~12 arquivos de teste com expectativa alterada (research D7)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Pré-design | Pós-design |
|---|---|---|
| I. Spec-Driven | ✅ spec 018 escrita antes do código | ✅ D3 da 008 e D8 da 011 corrigidas no ponto da decisão (tarefa de docs) |
| II. SOLID | ✅ | ✅ regras novas em funções puras de domínio (`detalhesDaRemocao`, `reconstruirTrocoImportado`); slice só orquestra; `formaParaRetrato` continua produtor único |
| III. ERP fonte de verdade | ✅ o troco passa a ser calculado **pelo ERP** a partir do recebido; o Checkout não inventa troco em documento ambíguo | ✅ |
| IV. Tipagem/fronteira | ✅ nenhum dado externo novo; `motivo` é união literal | ✅ |
| V. Precisão monetária | ✅ centavos inteiros; `reaisDeCentavos` só na saída | ✅ reconstrução do troco com `subtrair`/`somar` de `dinheiro.ts`, coberta por teste unitário |
| VI. Sem estado persistido | ✅ | ✅ |

Sem violações; Complexity Tracking não se aplica.

## Project Structure

### Documentation (this feature)

```text
specs/018-rastreabilidade-pagamento-troco/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── pagamento-domain-api.md
│   └── erp-retrato.md
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
src/client/
├── domain/
│   ├── auditoria/eventos.ts                 # EventoFormaPagamentoRemovida: detalhes ampliados
│   ├── pagamento/
│   │   ├── remocaoPagamento.ts              # NOVO: MotivoRemocao + detalhesDaRemocao
│   │   ├── trocoImportado.ts                # NOVO: reconstruirTrocoImportado
│   │   └── formaParaRetrato.ts              # FormaValor = recebido ?? aplicado
│   └── validacaoVenda/projetarPagamentos.ts # FormaCandidata.valorRecebido
├── stores/slices/pagamentoSlice.ts          # descartarPagamento, removerPagamento,
│                                            # confirmarEstornoTef, importarFormasDePagamento,
│                                            # aplicarNucleo (candidata)
└── features/pagamento/ConfiguracaoPagamento.tsx  # BotaoLimparPagamento: vazio/temPix por vivos

tests/
├── unit/domain/pagamento/{remocaoPagamento,trocoImportado,formaParaRetrato}.spec.ts
├── unit/domain/auditoria/eventos.spec.ts
├── unit/domain/validacaoVenda/projetarPagamentos.spec.ts
├── integration/{pagamentoSlice,validacaoVendaSlice,limparPagamentoDoDocumento,recuperacaoNFCe}.spec.ts(x)
└── e2e/{pagamento-geral,recuperacao-nfce,pagamento-tef}.spec.ts
```

**Structure Decision**: SPA única existente; nenhum diretório novo. Os dois arquivos novos de domínio ficam em `domain/pagamento/`, ao lado de `saldoPagamento.ts` e `formaParaRetrato.ts`, porque operam sobre `PagamentoAplicado`.

## Fases de implementação

1. **US1**: tipo do evento → `detalhesDaRemocao` (TDD) → três actions → testes de slice e e2e de estorno TEF. Entregável sozinho.
2. **US2**: `descartarPagamento` → `BotaoLimparPagamento` → testes de integração e e2e de "Limpar". Depende de US1 só pelo `motivo: 'LIMPAR'`.
3. **US3**: `FormaCandidata`/`projetarPagamentos` → `formaParaRetrato` → `reconstruirTrocoImportado` + importação → testes. **Gate**: homologação com ERP real (quickstart #13) antes do merge. Se o ERP recusar, a fase sai do PR e US1/US2 seguem.
4. **Docs**: corrigir D3 (008) e D8 (011) no ponto da decisão; linha 12 do data-model da 001; ADs novas em `.specs/project/STATE.md` (AD-282 Limpar preserva, AD-283 evento de remoção, AD-284 troco ao ERP).

## Riscos

- **ERP não gera o troco ou recusa a NFCe** (D1): mitigado pela fase isolada e pelo gate de homologação.
- **Documento com desconto de capa no cabeçalho** (D6): o troco pode não ser reconstruído na retomada. Lacuna anterior (a capa não é importada), registrada nas Assumptions.

## Complexity Tracking

Não se aplica.
