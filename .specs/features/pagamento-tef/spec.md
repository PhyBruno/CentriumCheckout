# Pagamento — TEF — Specification

## Problem Statement

O operador precisa aplicar uma forma de pagamento TEF à venda, cobrada no terminal físico do PDV. Comportamento comum a todas as formas de pagamento (carregamento de formas/condições, ticket devolução) está em `.specs/features/pagamento-geral/spec.md`; PIX está em `.specs/features/pagamento-pix/spec.md`.

## UI Design

TEF: frames `PDV Online Web - Modal TEF` (aguardando) e `PDV Online Web - Modal TEF Aprovado`. Tela principal e área "Pagamento e totais": ver `.specs/features/pagamento-geral/spec.md`.

**Atualização (2026-08-31, AD-104):** a **feature 013 — Venda Rápida por Cenário de Pagamento (`specs/013-venda-rapida-cenario-pagamento/`)** pode acionar este fluxo por atalho de teclado. Se um cenário cadastrado no ERP apontar para uma forma de cartão com integração TEF, a tecla (F6–F9) apenas substitui o gesto de selecionar a forma — **todo o fluxo de TEF especificado aqui vale integralmente**, e o pagamento só é dado por lançado após a aprovação da transação; a finalização automática, quando o cenário a exigir, ocorre depois dela. A restrição já vigente continua valendo sem exceção: `TEFAtivo = false` mantém a forma indisponível, logo o cenário correspondente nunca vira atalho (`FR-005` da 013). **Não há mais restrição por layout** — AD-144 (2026-09-03) revogou a exclusão de TEF no mobile que AD-074 havia fixado; o desktop-only da venda rápida continua existindo, mas é regra própria da 013 (`FR-020`), sem relação com o TEF.

## Bloqueio deliberado

**Protocolo de comunicação com o TEF (2026-08-25, AD-037 em `.specs/project/STATE.md`):** o mecanismo técnico de comunicação com o terminal TEF — protocolo de invocação, formato de mensagem, tratamento de timeout/erro — fica deliberadamente como bloqueio, **não especificado nesta rodada**. Decisão direta do usuário: o parceiro de TEF atual será trocado, então desenhar o contrato para o parceiro atual seria retrabalho. Este documento **não infere nem inventa** esse comportamento — ver item 25 em `.specs/project/PENDENCIES.md`.

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
- WHEN o mecanismo técnico de comunicação com o TEF (protocolo, invocação, timeout/erro) precisa ser especificado THEN este documento SHALL permanecer sem essa especificação. **Bloqueio deliberado (2026-08-25, AD-037):** decisão direta do usuário — parceiro de TEF será trocado, ver seção "Bloqueio deliberado" acima e item 25 de `.specs/project/PENDENCIES.md`.
- WHEN a venda com pagamento TEF já aprovado precisa ser suspensa THEN o sistema SHALL bloquear a suspensão. **Resolvido (2026-08-25, AD-042):** mesma lógica de `CART-09` — TEF aprovado não pode ser removido, logo a venda fica travada para suspensão também. Detalhado em `.specs/features/finalizacao-suspensao-venda/spec.md`.
- WHEN um pagamento TEF é aprovado THEN o sistema SHALL NÃO imprimir nenhum comprovante próprio — o comprovante é emitido pelo terminal físico do TEF. **Resolvido (2026-08-25, AD-064 em `.specs/project/STATE.md`):** decisão direta do usuário, fora de escopo do Checkout.
- WHEN o layout é mobile THEN o sistema SHALL oferecer e chamar a integração TEF exatamente como no desktop, com a disponibilidade decidida só por `ConfiguracoesTEF.TEFAtivo`. **Corrigido (2026-09-03, AD-144 em `.specs/project/STATE.md`):** decisão direta do usuário. AD-074 havia excluído o TEF no mobile partindo da premissa de que o terminal físico não tem equivalente em tablet/celular; o usuário informa que o dispositivo móvel também pode alcançar o terminal, então quem sabe se a integração existe naquele ambiente é o cadastro do ERP, não a largura da tela. **Não existe mais regra de plataforma nesta feature.** PIX segue disponível no mobile como sempre (`.specs/features/pagamento-pix/spec.md`).

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
|---|---|---|---|
| PAY-02 | Ocultar TEF quando `TEFAtivo=false` | - | Verified |

**Coverage:** 1 total, 0 edge cases pendentes de requisito — 1 bloqueio deliberado do usuário (protocolo/timeout do TEF, AD-037, item 25 de `.specs/project/PENDENCIES.md`).

---

## Success Criteria

- [ ] Nenhum TEF já cobrado é removido da venda sem passar pelo terminal físico.
