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
| Server-Sent Events (SSE) para status de PIX | Confirmado (2026-08-20, AD-012 em `.specs/project/STATE.md`): não será usado — apesar de diagrama de referência do ERP mencionar SSE, o Checkout opta por consulta ativa (polling), mais simples de operar sem exigir que o BFF mínimo (AD-022) — hoje só responsável por sessão/proxy — passe a manter conexões persistentes |

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

1. WHEN um pagamento PIX é gerado (QR Code exibido) THEN o sistema SHALL consultar ativamente `GET /ApiCentriumOAuth/StatusPIX` (params `Empresa`, `Trnguid`, retorna `StatusTransacao`) — nunca via SSE. **Resolvido (2026-08-21, AD-023):** endpoint confirmado no `ApiCentriumOAuth.yaml` atualizado.

**Independent Test**: Mockar `StatusPIX` alternando entre pendente e aprovado; confirmar que o polling detecta a mudança.

---

### P2: Ticket devolução na condição de pagamento

**User Story**: Como operador de caixa, quero aplicar um ticket devolução em uma forma de pagamento elegível, sem validação redundante na finalização.

**Why P2**: Cenário frequente, mas não bloqueia o fluxo mínimo de venda com pagamento normal.

**Acceptance Criteria**:

1. WHEN o operador aplica um ticket devolução THEN o sistema SHALL chamar `POST /ApiCentriumOAuth/ValidaTicketDevolucao`, que retorna `ValorTicket: number` e `Mensagem: string`. **Resolvido (2026-08-21, AD-023):** o contrato atualizado já retorna o valor (`ValorTicket`) — não existe campo booleano de validade; a KB do GenExus confirma que a **elegibilidade é indicada comparando `Mensagem` ao literal fixo `'Ticket Válido'`** (`PCheckout_ValidaTicketDevolucao` → `PValidaTicketNfCe.Call`) — qualquer outro texto em `Mensagem` indica ticket inválido/inelegível. O frontend deve implementar essa comparação de string explicitamente, não assumir "HTTP 200 = válido".
2. WHEN a venda é finalizada THEN o sistema SHALL **não** revalidar o ticket devolução novamente — ele é sempre consumido em `FaturarNFCe`.
3. WHEN uma forma de pagamento específica não aceita ticket devolução THEN o sistema SHALL usar o campo `FormaFpgUtiCar` de `CondicaoFormasDePagamento[]`. **Resolvido (2026-08-21, AD-024):** confirmado — `FormaFpgUtiCar` existe tanto na SDT `SessaoUsuario` da KB quanto em `ApiCentriumOAuth.yaml` (linhas 893-916). Ressalva: `PCheckout_GetSessao` só preenche esse campo quando a empresa tem uma regra dinâmica de forma de pagamento configurada para a condição; no branch de fallback (sem regra definida, "puxa todos"), o campo vem vazio — o frontend deve tratar `FormaFpgUtiCar` vazio como "sem informação", não como "não elegível".

**Independent Test**: Aplicar ticket em forma elegível e em forma não elegível; confirmar bloqueio apenas na segunda.

---

## Edge Cases

- WHEN o Checkout precisa classificar uma forma de pagamento (dinheiro/cartão/TEF/duplicata) para regras de troco/crédito THEN o sistema SHALL usar `FormaMeioPagtoNFe` (domínio `NFCe_FormaPagto`) e `FormaFpgUtiCar` (indica vale devolução `VDV`, campo do contrato mapeado de `FpgUtiCar` no KB). **Resolvido (2026-08-21, AD-023):** classificação completa confirmada na KB do GenExus — domain `NFCe_FormaPagto` tem os valores `Dinheiro, Cheque, CartaoCredito, CartaoDebito, CreditoLoja, ValeAlimentacao, ValeRefeicao, ValePresente, ValeCombustivel, DuplicataMercantil, BoletoBancario, DepositoBancario, Pix, TransferenciaBancaria, ProgaramaFidelidade (sic, typo no KB), PixEstatico, CreditoEmLoja, PagamentoNaoInformado, SemPagamento, PagamentoPosterior, Outros` — superset da tabela SEFAZ padrão. **(2026-08-21, AD-024):** `FormaFpgUtiCar` confirmado presente no contrato (ver Story P2/PAY-07) — só vazio quando a empresa não tem regra dinâmica de pagamento configurada.
- WHEN o intervalo de polling de `StatusPIX` precisa ser definido THEN ⚠️ pendente: estratégia/intervalo ainda não definidos na implementação.
- WHEN uma forma de pagamento TEF já foi cobrada na venda THEN o sistema SHALL impedir a remoção dessa forma de pagamento. **Resolvido (2026-08-21, AD-023):** resposta direta do usuário — depois de inserido e cobrado o valor do TEF, não é permitido remover essa forma de pagamento da venda. Isso implica que não existe um fluxo de "estorno automático pelo Checkout": como a forma não pode ser removida da UI, qualquer reversão de um TEF já aprovado (ex.: NFCe rejeitada após o pagamento) é tratada fora do Checkout, diretamente no terminal físico pelo operador.
- WHEN qualquer um dos endpoints de pagamento é chamado (`GerarPIX`, `ValidaTicketDevolucao`, `FaturarNFCe`) THEN o sistema SHALL enviar `Empresa` (`codigoEmpresa` persistido, ver AD-019 em `.specs/project/STATE.md`), exigido pelo contrato.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
|---|---|---|---|
| PAY-01 | Carregar formas/condições (cache 30min) | - | Verified |
| PAY-02 | Ocultar TEF quando `TEFAtivo=false` | - | Verified |
| PAY-03 | Ocultar PIX quando `UtilizaCentriumPAG=false` | - | Verified |
| PAY-04 | Consulta ativa de status de PIX (sem SSE) | - | Verified (2026-08-21, AD-023 — endpoint `StatusPIX` confirmado no contrato atualizado) |
| PAY-05 | Ticket devolução — valor via `ValidaTicketDevolucao` | - | Verified (2026-08-21, AD-023 — `ValorTicket` confirmado; elegibilidade via comparação de `Mensagem` a `'Ticket Válido'`) |
| PAY-06 | Ticket devolução — sem revalidação na finalização | - | Verified |
| PAY-07 | Ticket devolução — elegibilidade por forma de pagamento (`FormaFpgUtiCar`) | - | Verified (2026-08-21, AD-024 — campo confirmado no contrato e na KB, com ressalva de poder vir vazio no fallback sem regra dinâmica) |

**Coverage:** 7 total, 1 edge case pendente de confirmação com equipe do ERP (intervalo de polling de `StatusPIX`).

---

## Success Criteria

- [ ] Nenhuma venda finalizada sem confirmação ativa de PIX quando aplicável.
- [ ] Ticket devolução nunca bloqueia finalização por revalidação redundante.
