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

### P2: Cancelar uma transação TEF já aprovada, pelo ERP

**User Story**: Como operador de caixa, quero poder cancelar uma transação TEF que já foi aprovada, sabendo que o Checkout confirma o cancelamento com o ERP antes de liberar a venda.

**Why P2**: Sem isto, um TEF aprovado por engano (valor errado, cliente desistiu) trava a venda para sempre — a única saída seria abandoná-la sem documento fiscal algum.

**Acceptance Criteria**:

1. WHEN o operador solicita o cancelamento de uma transação TEF aprovada THEN o sistema SHALL chamar um endpoint do ERP dedicado a esse cancelamento — **não** um cancelamento feito só no terminal físico.
2. WHEN o cancelamento é solicitado THEN o sistema SHALL sondar ativamente um segundo endpoint do ERP para confirmar que a transação foi de fato cancelada, com a **mesma mecânica de polling** já usada pelo PIX (`.specs/features/pagamento-pix/spec.md`, `PAY-04`): intervalo fixo, sem SSE, sem backoff.
3. WHEN a confirmação de cancelamento chega THEN a forma TEF SHALL sair da venda, liberando-a para receber outra forma de pagamento ou ser suspensa.
4. WHEN a transação TEF ainda não foi cancelada (confirmada pelo ERP) THEN a forma SHALL permanecer irremovível e a venda SHALL permanecer bloqueada para suspensão — mesma regra dos Edge Cases abaixo.

**Definido (2026-09-04, AD-162):** decisão direta do usuário — corrige a leitura de AD-023 abaixo, que concluía não existir nenhum caminho de reversão pelo Checkout. Os **nomes e contratos dos dois endpoints não estão especificados** nesta rodada — ver item 41 de `.specs/project/PENDENCIES.md`. O mecanismo técnico de comunicação com o terminal físico (protocolo de invocação da própria operação de venda) continua bloqueado por AD-037, na seção "Bloqueio deliberado" abaixo — são pontos distintos: este item é sobre o Checkout falar com o **ERP**, não com o terminal.

**Independent Test**: Bloqueado até a feature 010 (TEF) e os dois endpoints existirem no contrato — ver item 41 de `.specs/project/PENDENCIES.md`.

---

## Edge Cases

- WHEN uma forma de pagamento TEF já foi cobrada na venda THEN o sistema SHALL impedir a remoção **direta** dessa forma de pagamento — não existe um clique isolado de "remover" que a tire da lista. **Resolvido (2026-08-21, AD-023); corrigido (2026-09-04, AD-162):** a leitura original concluía que, como a forma não pode ser removida pela UI, "qualquer reversão de um TEF já aprovado é tratada fora do Checkout, diretamente no terminal físico" — **essa conclusão estava errada**. O usuário informa que existe um caminho de cancelamento pelo **ERP**: o Checkout solicita o cancelamento a um endpoint dedicado e sonda outro até a confirmação, com a mesma mecânica de polling do PIX (ver a Story P2 acima, `PAY-12`). O que continua valendo de AD-023 é só a parte concreta — a forma não some por um "remover" direto, sem esse fluxo — não a premissa de que a reversão é sempre externa ao Checkout.
- WHEN o mecanismo técnico de comunicação com o TEF (protocolo, invocação, timeout/erro) precisa ser especificado THEN este documento SHALL permanecer sem essa especificação. **Bloqueio deliberado (2026-08-25, AD-037):** decisão direta do usuário — parceiro de TEF será trocado, ver seção "Bloqueio deliberado" acima e item 25 de `.specs/project/PENDENCIES.md`. **Continua distinto do cancelamento via ERP da Story P2 (AD-162):** este bloqueio é sobre como o Checkout fala com o **terminal físico**; o cancelamento fala com o **ERP**, contrato ainda não especificado (item 41 de `.specs/project/PENDENCIES.md`), mas sem o bloqueio de parceiro-a-trocar.
- WHEN a venda com pagamento TEF já aprovado precisa ser suspensa THEN o sistema SHALL bloquear a suspensão, **até que o cancelamento pelo ERP (Story P2) seja confirmado**. **Resolvido (2026-08-25, AD-042); reafirmado com a ordem explícita (2026-09-04, AD-162, item 1.2 do usuário — "o cancelamento do TEF precisa ser feito antes de cancelar" a venda):** mesma lógica de `CART-09` — TEF aprovado não pode ser removido, logo a venda fica travada para suspensão também, e a única saída passa a ser cancelar a transação primeiro. Detalhado em `.specs/features/finalizacao-suspensao-venda/spec.md`.
- WHEN um pagamento TEF é aprovado THEN o sistema SHALL NÃO imprimir nenhum comprovante próprio — o comprovante é emitido pelo terminal físico do TEF. **Resolvido (2026-08-25, AD-064 em `.specs/project/STATE.md`):** decisão direta do usuário, fora de escopo do Checkout.
- WHEN o layout é mobile THEN o sistema SHALL oferecer e chamar a integração TEF exatamente como no desktop, com a disponibilidade decidida só por `ConfiguracoesTEF.TEFAtivo`. **Corrigido (2026-09-03, AD-144 em `.specs/project/STATE.md`):** decisão direta do usuário. AD-074 havia excluído o TEF no mobile partindo da premissa de que o terminal físico não tem equivalente em tablet/celular; o usuário informa que o dispositivo móvel também pode alcançar o terminal, então quem sabe se a integração existe naquele ambiente é o cadastro do ERP, não a largura da tela. **Não existe mais regra de plataforma nesta feature.** PIX segue disponível no mobile como sempre (`.specs/features/pagamento-pix/spec.md`).

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
|---|---|---|---|
| PAY-02 | Ocultar TEF quando `TEFAtivo=false` | - | Verified |
| PAY-12 | Cancelar transação TEF aprovada via endpoint do ERP, com polling de confirmação | - | Design (2026-09-04, AD-162) — bloqueada por dois endpoints ainda não especificados no contrato (item 41 de `.specs/project/PENDENCIES.md`) |

**Coverage:** 2 total, 1 verificado e 1 em Design — 2 bloqueios deliberados do usuário: protocolo/timeout do TEF com o terminal físico (AD-037, item 25 de `.specs/project/PENDENCIES.md`) e os endpoints de cancelamento/confirmação com o ERP (AD-162, item 41 de `.specs/project/PENDENCIES.md`) — os dois distintos entre si, ver Edge Cases.

---

## Success Criteria

- [ ] Nenhum TEF já cobrado é removido da venda sem passar pelo fluxo de cancelamento (terminal físico **e** confirmação do ERP, `PAY-12`).
