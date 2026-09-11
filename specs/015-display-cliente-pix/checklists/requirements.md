# Specification Quality Checklist: Display do cliente — espelho do QR Code PIX em segunda tela

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-10
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- Validação executada em uma iteração, sem `[NEEDS CLARIFICATION]` pendente: o design
  aprovado (`design.md`, 2026-09-10) já registra as seis decisões do usuário — abertura por
  botão + endereço fixo, checkout como fonte única de verdade do status, conteúdo do repouso,
  contador de 10 s, base da branch e processo Spec Kit completo. O que o design não fixava
  explicitamente foi resolvido por padrão razoável e está declarado em **Assumptions**
  (só PIX é espelhado; propaganda fora de escopo; mesma máquina de PDV; sem som; sem interação).

- Fronteira mantida entre spec e design: o `design.md` descreve o **como** (canal entre abas,
  validação de fronteira, rota, arquivos novos e alterados). O `spec.md` descreve apenas o
  **quê** e o **porquê** observáveis. Duas regras que parecem técnicas foram mantidas na spec por
  serem consequências observáveis de negócio, não escolhas de implementação:
  - **FR-013/FR-014** (a tela do cliente não gera nem consulta cobrança) — uma segunda cobrança
    seria real, órfã e sem endpoint de cancelamento no contrato do ERP (invariante J5).
  - **FR-018/FR-019/FR-020** (silêncio da tela de checkout em repouso, reconfirmação e queda para
    repouso em 15 s) — o risco concreto é um QR Code obsoleto preso na tela e o cliente seguinte
    pagar a cobrança do anterior.

- Divergência consciente registrada em **Assumptions**: o fluxograma original "Tela do cliente"
  (`FLUXOS-MERMAID.md`) e o item 28 de `.specs/project/PENDENCIES.md` mencionam propaganda/imagem
  no estado de repouso. Esta versão não a inclui, por decisão do usuário (2026-09-10).

- Exceção autorizada à regra de referência visual: não há nó desta tela no Pencil; o usuário
  autorizou derivar o visual do modal PIX existente. Registrado em **Assumptions** para que
  `/speckit-plan` e `/speckit-tasks` não marquem tarefas de UI como dependentes do Pencil MCP.
