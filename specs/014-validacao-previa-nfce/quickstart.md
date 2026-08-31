# Quickstart — Validação Prévia da Venda no ERP (`ValidarNFCe`)

Cenários de validação desta feature. Cada um é executável de forma independente e mapeia a requisitos e invariantes (`spec.md`, `data-model.md`).

**Pré-requisitos comuns**: sessão carregada (feature 002) com `Empresa` válida; carrinho com pelo menos um item (feature 003); catálogo de condições/formas de `GetSessao` carregado **com `FormaEntrada` preenchido** (feature 008 — sem esse campo o cenário 2 é um falso positivo).

---

## Cenário 1 — Recusa bloqueia a inserção (fluxo principal)

Cliente identificado com crédito bloqueado no ERP (`CliAutCre = 'N'`), condição a prazo.

| Passo | Ação | Resultado esperado |
|---|---|---|
| 1 | selecionar a condição a prazo e uma forma de crediário | nada acontece na venda ainda |
| 2 | confirmar a inserção | consulta a `ValidarNFCe` disparada uma vez |
| 3 | ERP responde `Valido = false` | **nenhum** pagamento na lista; saldo em aberto inalterado |
| 4 | — | notificação de **erro** com o texto do ERP, íntegro |
| 5 | — | evento `VALIDACAO_VENDA_RECUSADA` na trilha de auditoria |
| 6 | tentar finalizar | bloqueado — `podeFinalizar() === false` (I6) |

Cobre `FR-001`, `FR-004`, `FR-007`, `FR-015`, `FR-018`; I1, I6.

---

## Cenário 2 — Aviso não bloqueia

Empresa com `EmpLimCre = 'A'`, cliente com crediário acima do limite.

| Passo | Ação | Resultado esperado |
|---|---|---|
| 1 | confirmar a inserção da forma de crediário | consulta disparada |
| 2 | ERP responde `Valido = true` + mensagem `Warning` "Limite de crédito ultrapassado!" | pagamento **aplicado** normalmente; saldo em aberto reduzido |
| 3 | — | notificação de **aviso**, sem exigir confirmação e sem interromper o fluxo |
| 4 | — | **nenhum** evento na trilha de auditoria referente ao aviso |
| 5 | cobrir o total e finalizar | emissão ocorre normalmente, sem nova consulta |

Cobre `FR-005`, `FR-013`; `research.md` D9.

> **Falso positivo a evitar**: se `FormaEntrada` não estiver sendo enviado no payload, o ERP calcula crediário `0` e responde `Valido = true` **sem** mensagem. O cenário "passa" pelo motivo errado. Verificar o corpo enviado, não só o desfecho.

---

## Cenário 3 — Severidade não decide bloqueio (teste negativo)

Mesma forma do cenário 2, mas com a empresa em `EmpLimCre = 'B'`.

| Passo | Ação | Resultado esperado |
|---|---|---|
| 1 | confirmar a inserção | ERP responde `Valido = false` com mensagem de tipo **`Warning`** |
| 2 | — | tratado como **recusa**: nenhum pagamento aplicado, notificação de erro |

É o cenário que falha se a implementação mapear severidade para bloqueio. Cobre `FR-006`, I3.

---

## Cenário 4 — Falha de comunicação é *fail-closed*

| Passo | Ação | Resultado esperado |
|---|---|---|
| 1 | derrubar a rota `/api/erp/ValidarNFCe` (timeout ou 500) | — |
| 2 | confirmar a inserção | nenhum pagamento aplicado |
| 3 | — | notificação de erro **distinta** da recusa de negócio |
| 4 | — | nenhuma nova tentativa automática (uma única requisição no log de rede) |
| 5 | restabelecer a rota e tentar de novo | consulta refeita, inserção aceita |

Cobre `FR-009`; I4. Repetir com resposta `200` sem o campo `Valido` — deve produzir o mesmo desfecho (`RESPOSTA_INVALIDA`).

---

## Cenário 5 — O atalho de venda rápida passa pelo mesmo gate

Cenário de pagamento em F6, com "encerra a operação" ligado, e venda que o ERP recusa.

| Passo | Ação | Resultado esperado |
|---|---|---|
| 1 | pressionar F6 | consulta disparada, exatamente como no botão da tela |
| 2 | ERP recusa | nenhum pagamento lançado |
| 3 | — | **nenhuma** finalização automática iniciada |
| 4 | — | notificação de erro idêntica à do caminho manual |
| 5 | pressionar F6 duas vezes em sequência rápida | uma única consulta e, no máximo, um pagamento (`FR-011`) |

Cobre `FR-001`, `FR-011`; `spec.md` História 3.

---

## Cenário 6 — Nenhuma cobrança externa em venda recusada

| Passo | Ação | Resultado esperado |
|---|---|---|
| 1 | selecionar forma PIX dinâmico numa venda que o ERP recusa | consulta disparada |
| 2 | ERP recusa | `GerarPIX` **não** é chamado; nenhum QR Code na tela |
| 3 | repetir com forma de cartão e TEF ativo | nenhuma transação iniciada no terminal |
| 4 | corrigir a causa da recusa e repetir | agora sim a integração é acionada, após o aceite |

Cobre `FR-010`; I9.

---

## Cenário 7 — Veredito vigente e sua invalidação

| Passo | Ação | Resultado esperado |
|---|---|---|
| 1 | inserir uma forma aceita | `vereditoVigente` = `ACEITA` |
| 2 | tentar editar item do carrinho, trocar cliente/vendedor ou aplicar desconto de capa | todos bloqueados (I10) |
| 3 | remover a forma aplicada | `vereditoVigente` volta a `null`; carrinho/cliente/desconto voltam a ser editáveis |
| 4 | alterar o carrinho e inserir a forma de novo | **nova** consulta ao ERP |
| 5 | com o total coberto e veredito vigente, finalizar | emissão sem consulta adicional |

Cobre `FR-013`, `FR-014`, `FR-016`; I6, I7, I10.

---

## Cenário 8 — Pagamento dividido: uma consulta por forma

Venda de R$ 300,00, condição a prazo, cliente com limite de crédito de R$ 100,00 em `EmpLimCre = 'B'`.

| Passo | Ação | Resultado esperado |
|---|---|---|
| 1 | inserir R$ 250,00 em dinheiro | 1ª consulta; crediário `0`; `Valido = true`; pagamento aplicado |
| 2 | inserir os R$ 50,00 restantes em crediário | **2ª consulta** (não reaproveita a do passo 1); crediário passa a `50,00` |
| 3 | ERP responde conforme o limite | o desfecho pode ser **diferente** do passo 1 — é exatamente o caso que o gate existe para pegar |
| 4 | contar requisições da venda | duas consultas para duas inserções; nenhuma resposta reaproveitada, agrupada ou cacheada |
| 5 | remover a segunda forma e reinseri-la | **3ª consulta** — remover invalidou o veredito (`FR-014`) |

Cobre `FR-001a`; I2a.

---

## Cenário 9 — Validação local evita ida ao ERP

| Passo | Ação | Resultado esperado |
|---|---|---|
| 1 | com uma forma "dinheiro" já aplicada, tentar aplicar uma segunda | bloqueio local com toast; **nenhuma** requisição de validação |
| 2 | com saldo em aberto zerado, acionar o atalho F6 | recusa local; nenhuma requisição |
| 3 | com carrinho vazio, acionar o atalho | recusa local; nenhuma requisição |

Cobre `FR-012`.

---

## Fluxo dourado (E2E)

Venda comum, cliente identificado, condição à vista, forma dinheiro:

1. Bipar dois produtos.
2. Inserir a forma "dinheiro" cobrindo o total → uma consulta a `ValidarNFCe`, `Valido = true`, sem mensagens, pagamento aplicado, nenhuma notificação.
3. Finalizar → `FaturarNFCe` enviado **sem** nova consulta de validação, com o mesmo retrato de venda que foi validado (I5).
4. Documento fiscal entregue pelo caminho configurado (feature 004).

Uma venda à vista simples paga o custo de **uma** requisição adicional no ciclo inteiro.
