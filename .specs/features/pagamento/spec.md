# Pagamento — Specification

## Problem Statement

O operador precisa aplicar uma ou mais formas/condições de pagamento à venda, incluindo PIX (com confirmação de status) e ticket devolução, sem depender de eventos push do ERP.

## UI Design

Tela principal: frame `Fundo PDV Online Web`, área "Pagamento e totais". Estado de valor faltante: frame `PDV Online Web - Valor Faltante`. TEF: frames `PDV Online Web - Modal TEF` (aguardando) e `PDV Online Web - Modal TEF Aprovado`. PIX: frame `PDV Online Web - Modal PIX` (QR Code, copia e cola, badge de status). Fluxo mobile: frame `PDV Mobile 02 - Produtos e Pagamento`, seção "Configuração pagamento".

## Goals

- [ ] Formas/condições de pagamento sempre disponíveis com dados atualizados (cache de 30 min).
- [ ] Status de PIX confirmado de forma confiável via consulta ativa, sem SSE.

## Out of Scope

| Feature | Reason |
|---|---|
| Server-Sent Events (SSE) para status de PIX | Confirmado (2026-08-20, AD-012 em `.specs/project/STATE.md`): não será usado — apesar de diagrama de referência do ERP mencionar SSE, o Checkout opta por consulta ativa (polling), mais simples de operar num SPA sem backend próprio e sem depender de conexão persistente |

---

## User Stories

### P1: Carregar formas e condições de pagamento ⭐ MVP

**User Story**: Como operador de caixa, quero ver as formas e condições de pagamento disponíveis para o tenant, para aplicar na venda.

**Why P1**: Sem isso a venda não pode ser finalizada.

**Acceptance Criteria**:

1. WHEN a tela de pagamento é aberta THEN o sistema SHALL buscar formas/condições via TanStack Query, cacheadas em memória com `staleTime` de 30 minutos.
2. WHEN `ConfiguracoesTEF.TEFAtivo` é `false` THEN o sistema SHALL ocultar/desabilitar o recurso de TEF.
3. WHEN `ConfiguracoesPIX.UtilizaCentriumPAG` é `false` THEN o sistema SHALL ocultar/desabilitar o recurso de PIX.

**Independent Test**: Mockar `GetSessao` com as duas flags desligadas e confirmar que TEF/PIX não aparecem na tela de pagamento.

---

### P1: Consulta ativa de status de PIX ⭐ MVP

**User Story**: Como operador de caixa, quero saber quando o pagamento PIX foi aprovado, sem depender de notificação push do servidor.

**Why P1**: Sem confirmação, a venda não pode ser finalizada com segurança.

**Acceptance Criteria**:

1. WHEN um pagamento PIX é gerado (QR Code exibido) THEN o sistema SHALL consultar ativamente um endpoint de status — nunca via SSE. ⚠️ Pendente: `GET /ApiCentriumOAuth/StatusPIX`, citado historicamente, não foi localizado em `ApiCentriumOAuth.yaml` — nome do endpoint real pendente de reconfirmação com a equipe do ERP (ver `.specs/codebase/CONCERNS.md`).

**Independent Test**: Mockar `StatusPIX` alternando entre pendente e aprovado; confirmar que o polling detecta a mudança.

---

### P2: Ticket devolução na condição de pagamento

**User Story**: Como operador de caixa, quero aplicar um ticket devolução em uma forma de pagamento elegível, sem validação redundante na finalização.

**Why P2**: Cenário frequente, mas não bloqueia o fluxo mínimo de venda com pagamento normal.

**Acceptance Criteria**:

1. WHEN o operador aplica um ticket devolução THEN o sistema SHALL chamar `POST /ApiCentriumOAuth/ValidaTicketDevolucao`, que retorna `valido: boolean` e `mensagem: string` — ⚠️ pendente: o contrato **não** retorna um valor monetário/saldo do ticket nessa resposta; fonte real do saldo a confirmar com a equipe do ERP.
2. WHEN a venda é finalizada THEN o sistema SHALL **não** revalidar o ticket devolução novamente — ele é sempre consumido em `FaturarNFCe`.
3. WHEN uma forma de pagamento específica não aceita ticket devolução THEN ⚠️ pendente: `CondicaoFormasDePagamento[]` (`ApiCentriumOAuth.yaml`) não tem campo de elegibilidade a ticket devolução nem o campo `FpgUtiCar` citado no Edge Case abaixo — mecanismo real de restrição por forma de pagamento não confirmado.

**Independent Test**: Aplicar ticket em forma elegível e em forma não elegível; confirmar bloqueio apenas na segunda.

---

## Edge Cases

- WHEN o Checkout precisa classificar uma forma de pagamento (dinheiro/cartão/TEF/duplicata) para regras de troco/crédito THEN o sistema SHALL usar `FormaMeioPagtoNFe` (domínio `NFCe_FormaPagto`) e `FpgUtiCar` (indica vale devolução `VDV`) — ⚠️ pendente: classificação completa cobrindo todos os tipos citados em `Regras.md` ainda não fechada.
- WHEN o intervalo de polling de `StatusPIX` precisa ser definido THEN ⚠️ pendente: estratégia/intervalo ainda não definidos na implementação.
- WHEN a NFCe é rejeitada e há pagamento TEF aprovado THEN ⚠️ pendente: não confirmado se o Checkout dispara o estorno automaticamente contra a API local do TEF, ou apenas orienta o operador a estornar manualmente no terminal.
- WHEN qualquer um dos endpoints de pagamento é chamado (`GerarPIX`, `ValidaTicketDevolucao`, `FaturarNFCe`) THEN o sistema SHALL enviar `Empresa` (`codigoEmpresa` persistido, ver AD-019 em `.specs/project/STATE.md`), exigido pelo contrato.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
|---|---|---|---|
| PAY-01 | Carregar formas/condições (cache 30min) | - | Verified |
| PAY-02 | Ocultar TEF quando `TEFAtivo=false` | - | Verified |
| PAY-03 | Ocultar PIX quando `UtilizaCentriumPAG=false` | - | Verified |
| PAY-04 | Consulta ativa de status de PIX (sem SSE) | - | ⚠️ Pendente — endpoint `StatusPIX` não confirmado em `ApiCentriumOAuth.yaml` |
| PAY-05 | Ticket devolução — valor via `ValidaTicketDevolucao` | - | ⚠️ Pendente — contrato não retorna campo de valor/saldo |
| PAY-06 | Ticket devolução — sem revalidação na finalização | - | Verified |
| PAY-07 | Ticket devolução — elegibilidade por forma de pagamento | - | ⚠️ Pendente — contrato não tem campo de elegibilidade correspondente |

**Coverage:** 7 total, 3 requisitos (`PAY-04`, `PAY-05`, `PAY-07`) e 4 edge cases pendentes de confirmação com equipe do ERP.

---

## Success Criteria

- [ ] Nenhuma venda finalizada sem confirmação ativa de PIX quando aplicável.
- [ ] Ticket devolução nunca bloqueia finalização por revalidação redundante.
