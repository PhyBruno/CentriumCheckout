# Specification Quality Checklist: Motor de desconto do Checkout (capa e item)

**Purpose**: Validar completude e qualidade da especificação antes de seguir para o planejamento

**Created**: 2026-10-13

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

- Validação em 2026-10-13, 2 iterações. A 1ª encontrou vocabulário de implementação em FR-009 e FR-012 ("guardá-lo junto dos dados do produto", "camada de dados da venda") e um cenário ambíguo em US3 (o que fica aplicado após a recusa por teto); os três foram reescritos.
- Os nomes de campos do ERP (`CondicaoDesconto`, `CondicaoDescontoMaximo`, `PrecoMinimo`, `CheckoutFaturarNFCe.DescontoCapaValor`) aparecem só em **Input** e em **Dependencies**, porque são o contrato que o ERP entrega ou vai criar, não escolha de implementação. O corpo dos requisitos descreve comportamento.
- Zero marcadores `[NEEDS CLARIFICATION]`: os quatro pontos de maior impacto (desconto sobre o total ou por unidade, desconto automático da condição, teto zero, virada com o ERP) foram decididos com o usuário durante o plano e estão em **Assumptions** e nos requisitos.
- Pendências que **não** bloqueiam o planejamento, mas precisam de resposta antes de ligar a chave em produção: nome e tipo exatos do campo de capa no ERP, e revisão do cadastro de tetos das condições (maioria hoje vem com teto zero).
- Próxima fase: `/speckit-plan` (a constitution manda `specify → plan → tasks → implement`).
