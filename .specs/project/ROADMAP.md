# Roadmap — CheckoutWEB

> Mapa consolidado de toda pendência/edge case aberto (todas as features + infra): `.specs/project/PENDENCIES.md`.

Nenhuma implementação começou ainda (repositório sem código-fonte). As features abaixo já passaram por uma extensa rodada de alinhamento de requisitos (ver histórico em `.specs/project/STATE.md`), documentado agora como specs formais em `.specs/features/`. "Specify" quase concluído em todas — a maior parte dos pontos em aberto listados em cada spec são perguntas operacionais pendentes com a equipe do ERP, não ambiguidade de produto.

## Milestone 1 — Fluxo de venda mínimo (desktop)

| # | Feature | Status | Spec |
|---|---|---|---|
| 1 | Autenticação, sessão e bootstrap | Specify feito | `.specs/features/autenticacao-sessao-bootstrap/spec.md` |
| 2 | Identificação e cadastro de cliente | Specify feito | `.specs/features/identificacao-cadastro-cliente/spec.md` |
| 3 | Carrinho, busca/inserção de produto e motor de precificação | Specify feito (Design recomendado — motor de precificação é lógica de domínio isolada e crítica; `CART-09`/`CART-10` resolvidos em 2026-08-24, AD-030, sem bloqueio remanescente) | `.specs/features/carrinho-produto-precificacao/spec.md` |
| 4 | Pagamento (formas/condições, PIX, TEF) | Specify feito | `.specs/features/pagamento-geral/spec.md`, `.specs/features/pagamento-pix/spec.md`, `.specs/features/pagamento-tef/spec.md` |
| 5 | Finalização e suspensão da venda (NFCe) | Specify feito | `.specs/features/finalizacao-suspensao-venda/spec.md` |
| 8 | Seleção de vendedor (modal) | Specify feito (endpoint `GetListaVendedores` confirmado, AD-023; default de vendedor via `GetSessao` ao iniciar NFCe resolvido em 2026-08-25, AD-032, sem bloqueio remanescente) | `.specs/features/selecao-vendedor/spec.md` |
| 9 | Menu gerencial (redirect para telas legadas do ERP) | Specify feito (nota arquitetural — sem spec de feature completo, é só link/navegação); URLs das duas opções confirmadas (AD-026) | `.specs/codebase/ARCHITECTURE.md` (seção Responsividade) |
| 11 | Auditoria de ações do operador (trilha de log enviada no campo `Log` de `FaturarNFCe`) | Specify feito (2026-08-25, AD-061) — mecanismo transversal, sem tela própria; campo `Log` já confirmado no contrato | `.specs/features/auditoria-acoes-operador/spec.md` |

## Milestone 2 — Caminhos alternativos de entrada na venda

| # | Feature | Status | Spec |
|---|---|---|---|
| 6 | Importação e faturamento de DAV | Specify feito (pendência: endpoint de "marcar DAV como importado" não confirmado) | `.specs/features/importacao-dav/spec.md` |
| 10 | Recuperação e retomada de rascunho de NFCe | Specify feito (2026-08-25, AD-041) — desktop-only, sem pendência bloqueante (busca restrita a nome de cliente/vendedor, limitação conhecida do `DataProvider` do ERP) | `.specs/features/recuperacao-nfce/spec.md` |

## Milestone 3 — Mobile

| # | Feature | Status | Spec |
|---|---|---|---|
| 7 | Layout responsivo (wizard mobile) | Specify feito. **Design visual concluído** (3 telas completas em `design/CentriumCheckout.pen`) — falta só Design técnico (breakpoint, componentes de layout React, hook `useIsMobile`) | `.specs/features/layout-responsivo-mobile/spec.md` |

## Infraestrutura (não é feature de usuário — tratado em `.specs/codebase/`)

- Stack tecnológica → `.specs/codebase/STACK.md`
- Arquitetura e divisão de responsabilidades → `.specs/codebase/ARCHITECTURE.md`
- Integrações locais (TEF, impressão) e API do ERP → `.specs/codebase/INTEGRATIONS.md`
- Débito técnico e pendências de infraestrutura (Docker, contrato de API) → `.specs/codebase/CONCERNS.md`

## Ainda não gerados (dependem de código existir)

`.specs/codebase/CONVENTIONS.md`, `STRUCTURE.md` e `TESTING.md` requerem amostras de código real (padrões de nomenclatura, árvore de diretórios, testes existentes) — serão gerados via brownfield mapping assim que o scaffolding inicial do projeto existir. Não fabricados agora para evitar documentar convenções inexistentes. **Exceção já decidida:** `CONVENTIONS.md`, quando gerado, deve incorporar a exigência de arquitetura SOLID já fixada em `.specs/project/STATE.md` (AD-085) — não é uma convenção a ser inferida do código, é uma constraint definida antes do scaffolding existir.

## Referência visual

`design/CentriumCheckout.pen` (Pencil) é a fonte de verdade visual do produto — todas as telas web e mobile já desenhadas vivem lá. `design/DESIGN-coinbase.md` é uma referência de estilo/tokens usada como precedente de design (não é o design final do Checkout). O mapeamento tela ↔ feature está registrado na seção "UI Design" de cada `spec.md` em `.specs/features/`.

## Próximo passo sugerido

Milestone 1, feature 3 (`carrinho-produto-precificacao`) é a mais crítica e complexa — vale rodar a fase **Design** nela antes de decompor em tasks, dado que envolve lógica de domínio pura com várias regras de cascata (ver spec).
