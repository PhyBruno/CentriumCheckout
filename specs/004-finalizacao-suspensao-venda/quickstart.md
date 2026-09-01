# Quickstart — Validação de Finalização e Suspensão da Venda

**Feature**: `specs/004-finalizacao-suspensao-venda/` | **Date**: 2026-08-26

Guia de validação: como provar que a feature funciona ponta a ponta. Não contém código de implementação — os detalhes de contrato estão em `contracts/` e a modelagem em `data-model.md`.

---

## Pré-requisitos

| # | Pré-requisito | Origem |
|---|---|---|
| 1 | Scaffolding do projeto criado (`package.json`, Vite, TypeScript `strict`, Docker) | feature 002 |
| 2 | BFF respondendo `/api/erp/FaturarNFCe` e `/api/erp/GetStatusSistema` | feature 002 |
| 3 | `vendaStore` com os slices `carrinho` (com itens), `auditoria` e o novo `identidadeVenda` combinados | features 001, 003 e este plano |
| 4 | Sessão do ERP válida, com `SessaoUsuario.CadSerieNFCe`, `CadMaqHost`, `CadMaqCod` e `TipoImpressao` no bootstrap | feature 002 |
| 5 | Predicado `temPagamentoNaoRemovivel()` disponível (mesmo predicado de `CART-09`) e `vendedorCodigo` selecionado | features 008 e 012 (dependências declaradas, `data-model.md`) |
| 6 | Ambiente de teste com um cenário de pagamento TEF/PIX aprovado e outro com pagamento removível (dinheiro/cartão manual) aplicado | ambiente ERP de dev |

O projeto roda 100% em Docker (`.specs/codebase/ARCHITECTURE.md`). Comandos abaixo assumem o container de desenvolvimento em execução.

---

## Camada 1 — Domínio puro

```bash
npm test -- tests/unit/domain/venda tests/unit/domain/finalizacaoVenda
```

| Arquivo | Cenários mínimos | Requisito |
|---|---|---|
| `montarRetratoVenda.spec.ts` (em `tests/unit/domain/venda/` — Emenda de 2026-08-31, substitui o antigo `montarPayloadFaturarNFCe.spec.ts`) | `NumeroNota = 0` para venda `origem: 'NOVA'`; `NumeroNota` preenchido para `'RASCUNHO'`/`'DAV'`; `CadSerieNFCe` e `vendedorCodigo` sempre presentes, nunca vazios; `Log` é o resultado de `serializarLogAuditoria` aplicado ao array corrente, round-trip parseável; retrato `'VALIDAR'` ≡ retrato `'FATURAR'` exceto `SuspenderOuFaturar` (I5 da feature 014) | `FR-001` a `FR-003`, `FR-010`, `FR-011`, `FR-015` |
| `decidirMecanismoImpressao.spec.ts` (em `tests/unit/domain/finalizacaoVenda/`) | `'E'` → `'direta'`; `'P'` → `'pdf'`; valor fora de `{'E','P'}` lança erro de fronteira | `FR-008`, AD-082 |

---

## Camada 2 — Integração (máquina de estados de envio)

```bash
npm test -- tests/integration/finalizacaoSuspensao.spec.ts
```

| Cenário | Como montar | Esperado | Requisito |
|---|---|---|---|
| Falha de rede não reenvia sozinha | mockar `fetch` rejeitando sem resposta | estado vai a `falha-rede`; nenhuma segunda chamada é feita sem ação do operador; evento `FATURAMENTO_FALHOU` é anexado ao log | `FR-004`, AD-038 |
| Confirmação manual libera reenvio | a partir de `falha-rede`, disparar a confirmação do operador | novo envio ocorre, com o `Log` já incluindo o evento de falha anterior | `FR-004`, AD-038 |
| Falha de negócio permite reenvio livre | mockar resposta HTTP de erro do ERP | estado vai a `falha-negocio`; reenvio subsequente não exige confirmação extra | `research.md`, D2 |
| Sucesso limpa tudo | mockar resposta 2xx válida | `carrinho`, cache de produto (`['produto']`), `auditoria` e `identidadeVenda` são todos descartados na mesma transação | `FR-012` |
| Bloqueio de suspensão com TEF/PIX | `temPagamentoNaoRemovivel` retorna `true`, acionar `SUSPENDER` | nenhuma chamada de rede é feita; UI comunica o bloqueio | `FR-005`, AD-042 |
| Suspensão permitida com pagamento removível | `temPagamentoNaoRemovivel` retorna `false` | `SUSPENDER` prossegue normalmente | `FR-006`, AD-042 |

---

## Camada 3 — E2E (fluxo dourado)

```bash
npx playwright test tests/e2e/finalizacao-suspensao.spec.ts
```

Com o serviço de impressão local **stubado** (a chamada real depende da rede local do PDV, fora do alcance do CI — ver `contracts/impressao-local-api.md`):

1. Iniciar uma venda nova, inserir itens, finalizar → payload enviado com `NumeroNota = 0`; resposta com `NotaFiscal` válida; documento fiscal apresentado conforme `TipoImpressao` do ambiente de teste.
2. Retomar um rascunho existente (`CarregarNFCe`), finalizar → payload enviado com o `NumeroNota` do rascunho, não `0`.
3. Suspender uma venda com pagamento removível já aplicado → chamada com `SUSPENDER`; carrinho/cache/auditoria/identidade limpos; retomar o mesmo rascunho depois confirma que o pagamento removível persiste.
4. Tentar suspender uma venda com pagamento TEF/PIX aprovado → bloqueado, sem chamada de rede.
5. Simular falha de rede em `FaturarNFCe` → UI exige confirmação manual antes de permitir novo envio; confirmar → reenvio ocorre.
6. Com `TipoImpressao = 'E'` e o stub do serviço local retornando erro de conexão → sistema oferece o PDF como fallback, sem falhar silenciosamente.
7. Repetir o passo 1 no layout mobile (mesmo estado de venda, layout condicional) → mesmo resultado, botão "Finalizar Venda" na etapa 03 e ícone de lixeira disponível em todas as etapas (AD-089).

### Verificações manuais que o E2E não cobre

- **Bloqueio real de Local Network Access/Mixed Content**: exige um navegador real com as políticas de Chrome Enterprise não configuradas — confirmar que a mensagem exibida aponta para configuração de navegador, não "erro de conexão" genérico (`contracts/impressao-local-api.md`).
- **Polling de `GetStatusSistema` em produção**: confirmar visualmente (Network tab) que a chamada só ocorre a cada 60s quando o carrinho está vazio e nenhum cliente está identificado, e que ela para assim que o primeiro item é inserido.
- **F5 no meio de uma tentativa de envio**: o navegador pede confirmação (`beforeunload`, AD-006); ao confirmar, nenhum estado de `identidadeVenda`/envio sobrevive — nada foi persistido.

---

## Gates antes de considerar a feature pronta

| Gate | Comando | Quando |
|---|---|---|
| TypeScript `strict` sem erro | `npx tsc --noEmit` | antes de **qualquer** `git push` (Constitution, Development Workflow) |
| Suíte unitária do domínio verde | `npm test -- tests/unit/domain/venda tests/unit/domain/finalizacaoVenda` | antes do push |
| Suíte de integração verde | `npm test -- tests/integration/finalizacaoSuspensao.spec.ts` | antes do push |
| `/owasp-security` | skill | antes de merge para `master`/deploy de produção |

---

## Achados de contrato levantados no Design

Nenhum achado novo — `.specs/features/finalizacao-suspensao-venda/spec.md` já tinha 12/12 requisitos `Verified` e 0 pendências abertas antes desta fase. As decisões tomadas em `research.md` (D1–D7) são de arquitetura de código, não de descoberta de contrato de API.
