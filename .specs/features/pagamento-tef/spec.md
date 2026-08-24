# Pagamento — TEF — Specification

## Problem Statement

O operador precisa aplicar uma forma de pagamento TEF à venda, cobrada no terminal físico do PDV. Comportamento comum a todas as formas de pagamento (carregamento de formas/condições, ticket devolução) está em `.specs/features/pagamento-geral/spec.md`; PIX está em `.specs/features/pagamento-pix/spec.md`.

## UI Design

TEF: frames `PDV Online Web - Modal TEF` (aguardando) e `PDV Online Web - Modal TEF Aprovado`. Tela principal e área "Pagamento e totais": ver `.specs/features/pagamento-geral/spec.md`.

---

## User Stories

### P1: Ocultar TEF quando não configurado ⭐ MVP

**User Story**: Como operador de caixa, não quero ver a opção de TEF quando o tenant não a utiliza.

**Why P1**: Evita oferecer uma forma de pagamento indisponível.

**Acceptance Criteria**:

1. WHEN `ConfiguracoesTEF.TEFAtivo` é `false` THEN o sistema SHALL ocultar/desabilitar o recurso de TEF.

**Independent Test**: Mockar `GetSessao` com `TEFAtivo=false` e confirmar que TEF não aparece na tela de pagamento. Faz parte do mesmo teste combinado descrito em `.specs/features/pagamento-geral/spec.md` (Story P1, `PAY-01`).

---

## Edge Cases

- WHEN uma forma de pagamento TEF já foi cobrada na venda THEN o sistema SHALL impedir a remoção dessa forma de pagamento. **Resolvido (2026-08-21, AD-023):** resposta direta do usuário — depois de inserido e cobrado o valor do TEF, não é permitido remover essa forma de pagamento da venda. Isso implica que não existe um fluxo de "estorno automático pelo Checkout": como a forma não pode ser removida da UI, qualquer reversão de um TEF já aprovado (ex.: NFCe rejeitada após o pagamento) é tratada fora do Checkout, diretamente no terminal físico pelo operador.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
|---|---|---|---|
| PAY-02 | Ocultar TEF quando `TEFAtivo=false` | - | Verified |

**Coverage:** 1 total, 0 edge cases pendentes.

---

## Success Criteria

- [ ] Nenhum TEF já cobrado é removido da venda sem passar pelo terminal físico.
