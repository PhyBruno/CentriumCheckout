# Auditoria de Ações do Operador — Specification

## Problem Statement

Toda ação relevante que o operador toma durante uma venda no Checkout (identificação/cadastro de cliente, seleção de vendedor, inserção/edição/cancelamento de produto, aplicação de condição/forma de pagamento, uso de vale devolução, falhas de pagamento/faturamento, finalização/suspensão) precisa ficar rastreável no ERP, com data/hora — não só o resultado final da venda. Diferente das demais features, esta não é uma tela nova: é um mecanismo transversal que roda por trás de todas as etapas da venda, coletando eventos localmente e entregando-os ao ERP no momento da finalização/suspensão.

**Decisão de arquitetura (2026-08-25, AD-061 em `.specs/project/STATE.md`):** implementado como um slice dedicado de estado (`auditoria`), no mesmo Zustand store da venda em andamento — cada ação de negócio já prevista nas specs abaixo dispara explicitamente um evento tipado para esse slice, seguindo o mesmo padrão de disciplina da "Regra de fronteira" já documentada em `.specs/codebase/ARCHITECTURE.md`. Não é um novo passo visível no wizard nem uma interceptação genérica de mutações de estado.

## UI Design

Não se aplica — mecanismo de bastidor, sem tela própria. Nenhuma tela existente precisa de alteração visual para esta feature.

## Goals

- [ ] Toda ação de negócio relevante da venda gera um evento de auditoria com timestamp, sem exigir interação extra do operador.
- [ ] O log acumulado da venda é entregue ao ERP no campo `Log` de `FaturarNFCe`, tanto ao finalizar quanto ao suspender.
- [ ] Falhas de ações relevantes (pagamento recusado, falha de rede em `FaturarNFCe`) também ficam registradas, não só sucessos.

## Out of Scope

| Feature | Reason |
|---|---|
| Tela de revisão do log pelo operador | Não solicitado — o log é só para consumo do ERP, não para leitura do operador dentro do Checkout |
| Reconstrução de histórico de vendas anteriores | O log de uma venda retomada (rascunho/DAV/recuperação de NFCe) começa vazio — histórico anterior já foi entregue ao ERP numa suspensão prévia e vive só lá |
| Middleware genérico de interceptação de todas as mutações Zustand | Descartado no brainstorming — produziria diffs de estado crus em vez de eventos semânticos (ver rationale em `.specs/project/STATE.md`, AD-061) |

---

## User Stories

### P1: Registrar evento de auditoria a cada ação relevante da venda ⭐ MVP

**User Story**: Como operador de caixa, ao realizar qualquer ação relevante da venda (cliente, vendedor, produto, pagamento, finalização), quero que ela fique automaticamente registrada com data/hora, sem precisar de nenhuma ação extra minha.

**Why P1**: Rastreabilidade completa da venda é o objetivo central desta feature — sem isso, o campo `Log` de `FaturarNFCe` fica vazio.

**Acceptance Criteria**:

1. WHEN uma nova venda começa (do zero, ou início de retomada de rascunho/DAV/NFCe recuperada) THEN o sistema SHALL zerar o slice `auditoria` e registrar o evento `VENDA_INICIADA` (`detalhes.origem`: `NOVA` | `RASCUNHO` | `DAV`).
2. WHEN o operador seleciona, cria ou troca o cliente da venda THEN o sistema SHALL registrar `CLIENTE_SELECIONADO`, `CLIENTE_CRIADO` ou `CLIENTE_TROCADO` (ver `.specs/features/identificacao-cadastro-cliente/spec.md`).
3. WHEN o operador seleciona ou troca o vendedor da venda THEN o sistema SHALL registrar `VENDEDOR_SELECIONADO` ou `VENDEDOR_TROCADO` (ver `.specs/features/selecao-vendedor/spec.md`).
4. WHEN um produto é inserido, alterado ou cancelado no carrinho THEN o sistema SHALL registrar `PRODUTO_INSERIDO` (`codigoProduto`, `quantidade`, `precoUnitario`, `desconto`), `PRODUTO_ALTERADO` (campo alterado, valor anterior/novo) ou `PRODUTO_CANCELADO` (`codigoProduto`) — ver `.specs/features/carrinho-produto-precificacao/spec.md`.
5. WHEN uma condição ou forma de pagamento é aplicada ou removida, ou um vale devolução é usado THEN o sistema SHALL registrar `CONDICAO_PAGAMENTO_APLICADA`, `FORMA_PAGAMENTO_APLICADA`, `FORMA_PAGAMENTO_REMOVIDA` ou `VALE_DEVOLUCAO_USADO` (ver `.specs/features/pagamento-geral/spec.md`).
6. WHEN uma forma de pagamento é recusada (TEF, PIX ou cartão manual) THEN o sistema SHALL registrar `PAGAMENTO_RECUSADO` (tipo, motivo quando disponível).
7. WHEN o operador confirma finalizar ou suspender a venda THEN o sistema SHALL registrar `VENDA_FINALIZADA` ou `VENDA_SUSPENSA` como último evento antes de montar o payload.
8. WHEN uma chamada a `FaturarNFCe` (`FATURAR` ou `SUSPENDER`) falha por problema de rede (sem resposta, ver `.specs/features/finalizacao-suspensao-venda/spec.md`, AD-038) THEN o sistema SHALL registrar `FATURAMENTO_FALHOU` (`detalhes.operacao`: `FATURAR` | `SUSPENDER`) e **não** descartar o slice `auditoria` — o evento de falha entra no log reenviado na tentativa seguinte.

**Independent Test**: Rodar uma venda completa (trocar cliente, inserir 2 produtos, aplicar pagamento, finalizar) e verificar que o array de eventos tem, **na ordem de inserção** (ordem autoritativa — `timestamp` é não-decrescente, não estritamente crescente, por causa da resolução de milissegundo, ver `specs/001-auditoria-acoes-operador/data-model.md`, "Regras de estado"): `VENDA_INICIADA`, `CLIENTE_*`, 2× `PRODUTO_INSERIDO`, `FORMA_PAGAMENTO_APLICADA`, `VENDA_FINALIZADA`.

---

### P1: Serializar e enviar o log no campo `Log` de `FaturarNFCe` ⭐ MVP

**User Story**: Como Checkout, quero enviar o log acumulado da venda ao ERP sempre que finalizar ou suspender, para que a rastreabilidade não dependa de nenhum armazenamento local persistente.

**Why P1**: É o único ponto de entrega do log ao ERP — sem isso, o mecanismo de coleta de eventos não tem efeito nenhum fora do Checkout.

**Acceptance Criteria**:

1. WHEN o Checkout monta o payload de `POST /ApiCentriumOAuth/FaturarNFCe` (`SuspenderOuFaturar = "FATURAR"` ou `"SUSPENDER"`) THEN o sistema SHALL serializar o array de eventos acumulado (`JSON.stringify`) e enviá-lo no campo `Log` (string) de `CheckoutFaturarNFCe` — sibling de `NumeroNota`/`CadSerieNFCe`/`vendedorCodigo`. **Confirmado (2026-08-25):** o campo já existe no contrato exportado mais recente (`APICentriumOAuth.yaml`, `info.version: 20260825172440`, linha 1432), única definição do schema no arquivo.
2. WHEN `FaturarNFCe` retorna sucesso (`FATURAR` ou `SUSPENDER`) THEN o sistema SHALL descartar o slice `auditoria` junto com o carrinho e o cache de produtos (mesmo padrão de `FIN-04`/`FIN-06`).

**Independent Test**: Finalizar uma venda e inspecionar o payload de rede — `Log` deve ser uma string JSON válida, parseável de volta para o mesmo array de eventos observado no estado local antes do envio. Suspender uma venda e confirmar o mesmo comportamento.

---

## Edge Cases

- WHEN uma venda é retomada a partir de um rascunho (recuperação de NFCe) ou de um DAV importado (`.specs/features/recuperacao-nfce/spec.md`, `.specs/features/importacao-dav/spec.md`) THEN o sistema SHALL iniciar o slice `auditoria` **vazio** — não tenta reconstruir o histórico de eventos de uma suspensão/importação anterior, que já foi entregue ao ERP naquele momento. Só eventos gerados nesta sessão do Checkout, a partir da retomada, entram no próximo envio de `Log`.
- WHEN `FaturarNFCe` falha por problema de rede (AD-038, sem resposta recebida) THEN o sistema SHALL manter o slice `auditoria` intacto (mais o evento `FATURAMENTO_FALHOU` anexado) até uma tentativa bem-sucedida — múltiplas tentativas acumulam no mesmo array, nunca reiniciado por uma falha.
- Nenhum campo de operador é gravado por evento — a identidade do operador é implícita à sessão autenticada (um `access_token` = um operador); trocas de vendedor/cliente são o próprio conteúdo do evento, não metadado de autoria.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
|---|---|---|---|
| AUDIT-01 | Evento `VENDA_INICIADA` ao começar/retomar venda, slice zerado | - | Verified (2026-08-25, AD-061) |
| AUDIT-02 | Eventos de cliente (`CLIENTE_SELECIONADO`/`CRIADO`/`TROCADO`) | - | Verified (2026-08-25, AD-061) |
| AUDIT-03 | Eventos de vendedor (`VENDEDOR_SELECIONADO`/`TROCADO`) | - | Verified (2026-08-25, AD-061) |
| AUDIT-04 | Eventos de produto (`PRODUTO_INSERIDO`/`ALTERADO`/`CANCELADO`) | - | Verified (2026-08-25, AD-061) |
| AUDIT-05 | Eventos de pagamento (aplicação/remoção/vale devolução) | - | Verified (2026-08-25, AD-061) |
| AUDIT-06 | Eventos de falha (`PAGAMENTO_RECUSADO`, `FATURAMENTO_FALHOU`) | - | Verified (2026-08-25, AD-061 — decisão direta do usuário de incluir falhas) |
| AUDIT-07 | Eventos `VENDA_FINALIZADA`/`VENDA_SUSPENSA` | - | Verified (2026-08-25, AD-061) |
| AUDIT-08 | Serialização em `Log` (string) de `CheckoutFaturarNFCe`, enviado em `FATURAR` e `SUSPENDER` | - | Verified (2026-08-25, AD-061 — decisão direta do usuário de enviar em ambos) |
| AUDIT-09 | Descarte do slice junto com carrinho/cache em sucesso; preservado em falha de rede | - | Verified (2026-08-25, AD-061) |
| AUDIT-10 | Retomada de rascunho/DAV/NFCe recuperada inicia log vazio | - | Verified (2026-08-25, AD-061) |

**Coverage:** 10 total, 0 pendências bloqueantes de requisito. Campo `Log` já confirmado no contrato (`ApiCentriumOAuth.yaml`).

---

## Success Criteria

- [ ] Nenhuma venda finalizada ou suspensa sai sem o campo `Log` preenchido com os eventos daquela sessão.
- [ ] Nenhum evento de auditoria é perdido por falha de rede antes de uma tentativa bem-sucedida de `FaturarNFCe`.
- [ ] O log nunca mistura eventos de mais de uma venda (zerado a cada início/retomada).
