# Roadmap — CheckoutWEB

Nenhuma implementação começou ainda (repositório sem código-fonte). As features abaixo já passaram por uma extensa rodada de alinhamento de requisitos (ver histórico em `.specs/project/STATE.md`), documentado agora como specs formais em `.specs/features/`. "Specify" quase concluído em todas — a maior parte dos pontos em aberto listados em cada spec são perguntas operacionais pendentes com a equipe do ERP, não ambiguidade de produto.

## Milestone 1 — Fluxo de venda mínimo (desktop)

| # | Feature | Status | Spec |
|---|---|---|---|
| 1 | Autenticação, sessão e bootstrap | Specify feito | `.specs/features/autenticacao-sessao-bootstrap/spec.md` |
| 2 | Identificação e cadastro de cliente | Specify feito | `.specs/features/identificacao-cadastro-cliente/spec.md` |
| 3 | Carrinho, busca/inserção de produto e motor de precificação | Specify feito (Design recomendado — motor de precificação é lógica de domínio isolada e crítica) | `.specs/features/carrinho-produto-precificacao/spec.md` |
| 4 | Pagamento (formas/condições, PIX) | Specify feito | `.specs/features/pagamento/spec.md` |
| 5 | Finalização e suspensão da venda (NFCe) | Specify feito | `.specs/features/finalizacao-suspensao-venda/spec.md` |

## Milestone 2 — Caminhos alternativos de entrada na venda

| # | Feature | Status | Spec |
|---|---|---|---|
| 6 | Importação e faturamento de DAV | Specify feito (pendência: endpoint de "marcar DAV como importado" não confirmado) | `.specs/features/importacao-dav/spec.md` |

## Milestone 3 — Mobile

| # | Feature | Status | Spec |
|---|---|---|---|
| 7 | Layout responsivo (wizard mobile) | Specify feito. **Design visual concluído** (3 telas completas em `design/CentriumCheckout.pen`) — falta só Design técnico (breakpoint, componentes de layout React, hook `useIsMobile`) | `.specs/features/layout-responsivo-mobile/spec.md` |

Descoberto via design (2026-08-20): telas `Modal vendedor` (seleção de vendedor) e `Modal menu gerencial` (central de movimentação não fiscal + relatório de resumo de caixa) existem no Pencil sem nenhum spec de requisito — Specify pendente antes de implementar (ver `.specs/codebase/CONCERNS.md`).

## Infraestrutura (não é feature de usuário — tratado em `.specs/codebase/`)

- Stack tecnológica → `.specs/codebase/STACK.md`
- Arquitetura e divisão de responsabilidades → `.specs/codebase/ARCHITECTURE.md`
- Integrações locais (TEF, impressão) e API do ERP → `.specs/codebase/INTEGRATIONS.md`
- Débito técnico e pendências de infraestrutura (Docker, contrato de API) → `.specs/codebase/CONCERNS.md`

## Ainda não gerados (dependem de código existir)

`.specs/codebase/CONVENTIONS.md`, `STRUCTURE.md` e `TESTING.md` requerem amostras de código real (padrões de nomenclatura, árvore de diretórios, testes existentes) — serão gerados via brownfield mapping assim que o scaffolding inicial do projeto existir. Não fabricados agora para evitar documentar convenções inexistentes.

## Referência visual

`design/CentriumCheckout.pen` (Pencil) é a fonte de verdade visual do produto — todas as telas web e mobile já desenhadas vivem lá. `design/DESIGN-coinbase.md` é uma referência de estilo/tokens usada como precedente de design (não é o design final do Checkout). O mapeamento tela ↔ feature está registrado na seção "UI Design" de cada `spec.md` em `.specs/features/`.

## Próximo passo sugerido

Milestone 1, feature 3 (`carrinho-produto-precificacao`) é a mais crítica e complexa — vale rodar a fase **Design** nela antes de decompor em tasks, dado que envolve lógica de domínio pura com várias regras de cascata (ver spec).
