# Quickstart — Validação da feature 008 (Pagamento Geral)

**Feature**: `008-pagamento-geral` | **Date**: 2026-08-26 | **Plan**: `specs/008-pagamento-geral/plan.md`

Guia de validação: como provar que a feature funciona ponta a ponta. Não contém código de implementação — os contratos estão em `contracts/` e o modelo em `data-model.md`.

---

## Pré-requisitos

| # | Requisito | De onde vem |
|---|---|---|
| 1 | Scaffolding React+Vite+TS rodando em Docker | feature 002 (ainda não implementada) |
| 2 | BFF respondendo `/api/bootstrap` e `/api/erp/*` | feature 002 |
| 3 | `vendaStore` (Zustand+Immer) com o slice `auditoria` combinado | feature 001 |
| 4 | Slice `carrinho` com `linhas`, `subtotal` e `editarItem` | feature 003 |
| 5 | Módulos `domain/precificacao/dinheiro.ts` (`Centavos`, `distribuirPorMaiorResto`) | feature 003 |

As features 009 (PIX) e 010 (TEF) **não** são pré-requisito: esta feature é validada com um duplo de `iniciarIntegracao`, por construção (`research.md`, D5/D14).

---

## Comandos

```bash
docker compose up -d                              # sobe dev com hot-reload
npm run test -- tests/unit/domain/pagamento       # unitários do domínio puro
npm run test -- tests/integration/pagamentoSlice  # invariantes do slice
npm run test:e2e -- pagamento-geral               # fluxo dourado (Playwright)
npx tsc --noEmit                                  # gate obrigatório antes de qualquer push
```

---

## Cenário 1 — Catálogo e disponibilidade por flag (`FR-001`..`FR-003`)

**Setup**: mockar `GET /api/bootstrap` com uma condição contendo as formas `Dinheiro`, `CartaoCredito`, `Pix` e `PixEstatico` (payload de exemplo em `contracts/erp-pagamento-api.md`, §1).

| Passo | Flags | Esperado |
|---|---|---|
| 1 | `TEFAtivo: true`, `UtilizaCentriumPAG: true` | as 4 formas aparecem habilitadas |
| 2 | `TEFAtivo: false` | cartão continua **disponível** (vira pagamento manual, sem TEF) |
| 3 | `UtilizaCentriumPAG: false` | `Pix` fica oculto/desabilitado; `PixEstatico` continua disponível |
| 4 | recarregar a tela dentro de 30 min | nenhuma nova requisição de rede (`staleTime`, `PAY-01`) |

**Prova de que não há endpoint fantasma**: o painel de rede mostra `GET /api/bootstrap` e **nenhuma** chamada a um endpoint de formas de pagamento — não existe (`research.md`, D1).

---

## Cenário 2 — Roteamento de integração (`FR-004`..`FR-007`)

Teste unitário puro sobre `resolverIntegracao`, sem montar componente. Matriz mínima:

A matriz não tem mais eixo de plataforma (AD-144, 2026-09-03): o veredito é o mesmo no desktop e no mobile, inclusive para cartão com TEF ativo — a linha que esperava `NENHUMA` no mobile foi removida.

| `FormaMeioPagtoNFe` | `tefAtivo` | `pixAtivo` | Esperado |
|---|---|---|---|
| `CartaoCredito` | `true` | — | `TEF` (em qualquer layout) |
| `CartaoDebito` | `false` | — | `NENHUMA` |
| `Pix` | — | `true` | `PIX_DINAMICO` (em qualquer layout) |
| `Pix` | — | `false` | forma indisponível |
| `PixEstatico` | — | `true` | `NENHUMA` ← `FR-006` |
| `Dinheiro` | `true` | `true` | `NENHUMA` |

**A linha que mais importa**: `PixEstatico` + `pixAtivo: true` → `NENHUMA`. Se essa falhar, `FR-006` está violado — o Checkout tentaria gerar cobrança dinâmica para um QR estático, que não tem ciclo de confirmação.

> **Não existe mais linha de plataforma nesta matriz.** Até 2026-09-03 a linha crítica era `CartaoCredito` + `tefAtivo: true` + `MOBILE` → `NENHUMA`, redação de `FR-007` sob AD-074. **AD-144 revogou** essa exclusão: cartão com TEF ativo roteia para `TEF` em qualquer layout, e `resolverIntegracao` não recebe plataforma nenhuma. Um teste que ainda espere `NENHUMA` no mobile está afirmando o comportamento **errado**.

---

## Cenário 3 — Split e troco (`FR-011`..`FR-013`)

**Setup**: carrinho com total de `100,00`.

| Passo | Ação | Esperado |
|---|---|---|
| 1 | aplicar `CartaoCredito` de `70,00` (desktop, `tefAtivo: false`) | `saldoRestante = 30,00`; pagamento `APROVADO` |
| 2 | aplicar `Dinheiro` com `valorRecebido = 50,00` | `valorAplicado = 30,00`, `troco = 20,00`, `saldoRestante = 0` |
| 3 | tentar aplicar uma segunda forma `Dinheiro` | bloqueado, toast "já existe uma forma dinheiro aplicada"; a lista continua com 2 pagamentos |
| 4 | inspecionar o payload montado | `Σ FormaValor === 100,00` — o troco de `20,00` **não** aparece em lugar nenhum |
| 5 | aplicar `Pix` com valor acima do saldo | `valorAplicado` limitado ao saldo; `troco` permanece `0` (`FR-012`) |

---

## Cenário 4 — Desconto de capa com clamp (`FR-015`/`FR-016`, AD-098)

**Setup**: carrinho com 3 itens — `70,00`, `29,00` e `1,00` (total `100,00`).

| Passo | Ação | Esperado |
|---|---|---|
| 1 | aplicar desconto de capa em valor: `10,00` | `totalLiquido = 90,00` |
| 2 | inspecionar o rateio na montagem do payload | `4,50 / 4,50 / 1,00` — soma exata de `10,00`, nenhum item negativo |
| 3 | aplicar desconto de capa em percentual: `10%` | mesmo resultado do passo 2 |
| 4 | tentar aplicar desconto de `150,00` | bloqueado com toast (I8) — o desconto nunca excede o subtotal |
| 5 | remover o desconto de capa | `totalLiquido` volta a `100,00`; nenhum item guarda resíduo do rateio |

**Por que o passo 2 é o teste-chave**: a divisão igual ingênua daria `3,34 / 3,33 / 3,33`, e a terceira linha ficaria com `ValorTotal = -2,33` — rejeitada pela SEFAZ. O clamp é o que impede isso (`data-model.md`, §5).

---

## Cenário 5 — Vale devolução (`FR-008`..`FR-010`)

| Passo | Mock de `ValidaTicketDevolucao` | `FormaFpgUtiCar` | Esperado |
|---|---|---|---|
| 1 | `{ ValorTicket: 25.50, Valido: true, Mensagem: "Ticket Válido" }` | `"VDV"` | vale aplicado, `25,50` abatidos, evento `VALE_DEVOLUCAO_USADO` |
| 2 | mesma resposta | `""` (vazio) | vale aplicado — vazio é elegível (AD-048) |
| 3 | mesma resposta | valor explicitamente não-vale | bloqueado com toast, sem chamada de rede |
| 4 | `{ ValorTicket: 0, Valido: false, Mensagem: "Ticket já utilizado" }` | `""` | recusado, toast com a mensagem do ERP, evento `PAGAMENTO_RECUSADO` |
| 5 | finalizar a venda depois do passo 1 | — | **nenhuma** chamada a `ValidaTicketDevolucao` no painel de rede (`FR-009`) |

O passo 5 é a prova de `SC-001`: o vale nunca bloqueia a finalização por revalidação. **Removido em 2026-08-27 (AD-101):** o cenário anterior (passo 5, `Valido` ausente na resposta) testava o fallback introduzido por AD-099 — confirmado por inspeção da KB que o campo é sempre preenchido pelo procedure, o cenário deixou de ser um caso real e foi retirado.

---

## Cenário 6 — Bloqueio do carrinho (`CART-09`/AD-030, `research.md` D11)

| Passo | Ação | Esperado |
|---|---|---|
| 1 | aplicar `Dinheiro` de `100,00` | `podeMutarCarrinho() === false`; editar/cancelar item vira no-op com toast |
| 2 | remover esse pagamento | `podeMutarCarrinho() === true` — bloqueio reversível |
| 3 | aplicar cartão via TEF e confirmar a aprovação (duplo) | `podeMutarCarrinho() === false` |
| 4 | tentar remover o pagamento do passo 3 | no-op com toast — irreversível (I6) |

---

## Cenário 7 — Duplicata não imprime nada (`FR-018`/AD-064)

Aplicar uma forma com `FormaMeioPagtoNFe = 'DuplicataMercantil'` e afirmar que o duplo do serviço de impressão local **não recebeu nenhuma chamada**, e que a UI não oferece ação de imprimir/gerar documento. Teste negativo obrigatório (`research.md`, D12).

---

## Cenário 8 — Auditoria (`FR-017`)

Executar os cenários 3, 5 e 6 numa mesma venda e inspecionar o array de auditoria ao final. Deve conter, nesta ordem de posição no array — que é a ordem autoritativa: `CONDICAO_PAGAMENTO_APLICADA`, `FORMA_PAGAMENTO_APLICADA` (×N), `FORMA_PAGAMENTO_REMOVIDA`, `VALE_DEVOLUCAO_USADO` e `PAGAMENTO_RECUSADO`. Não afirmar `timestamp` estritamente crescente entre eventos consecutivos: o carimbo tem resolução de milissegundo, então duas ações no mesmo milissegundo real empatam sem que isso seja erro (ver `specs/001-auditoria-acoes-operador/contracts/auditoria-events.md`, "Dispatcher"). Serializado por `serializarLogAuditoria`, o resultado é round-trip parseável (contrato da feature 001).

---

## Fluxo dourado (E2E)

`tests/e2e/pagamento-geral.spec.ts`, desktop com `tefAtivo: false`:

```text
carrinho com 3 itens (100,00)
  → selecionar condição "A VISTA"
  → aplicar desconto de capa 10% (total 90,00)
  → aplicar CartaoCredito 60,00
  → aplicar Dinheiro recebido 40,00  (aplicado 30,00, troco 10,00)
  → saldo zerado, botão "Finalizar Venda" habilitado
  → payload: Σ FormaValor = 90,00; DescontoValor por item soma 10,00; sem campo de troco
```

---

## Critérios de aceite da feature

| Critério | Cenário que prova |
|---|---|
| `SC-001` — vale nunca bloqueia a finalização | 5, passo 6 |
| `SC-002` — troco só para dinheiro excedente | 3, passos 2 e 5 |
| `SC-003` — nunca mais de uma forma dinheiro | 3, passo 3 |
| Gate `typescript-strict` | `npx tsc --noEmit` limpo antes de qualquer push |
| Gate `/owasp-security` | obrigatório antes de merge em `master` (Constitution, Development Workflow) |
