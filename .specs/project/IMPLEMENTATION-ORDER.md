# Ordem sugerida de implementação das features

> Consolidação das notas **"⚠️ Ordem de implementação e dependências cruzadas"** presentes em cada `specs/NNN-*/tasks.md`. Ordem por milestone (macro): `.specs/project/ROADMAP.md`. Este documento é o grafo fino de dependências **rígidas** (import direto de slice/módulo — bloqueia) entre as 14 features, derivado por leitura direta dos 14 `tasks.md` em 2026-09-01.

Dependência **rígida** = a feature dependente importa/consome diretamente algo criado na Foundational da dependência (bloqueia o início real do trabalho). Dependência **por injeção com stub** = a feature entra com uma implementação-tapa-buraco (`() => true`, no-op) e não bloqueia — é só substituída pela implementação real depois, quando a feature fornecedora existir. Só dependências rígidas determinam a ordem abaixo.

| # | Feature | Pré-requisitos rígidos | Por quê |
|---|---|---|---|
| 1 | `002-autenticacao-sessao-bootstrap` | — | Cria o scaffold do projeto (`package.json`, Vite, Fastify, Docker) na própria Fase 1 (Setup) — nenhuma feature roda sem ela |
| 2 | `001-auditoria-acoes-operador` | 002 (Fases 1-2) | Sua Fase 1 cria subdiretórios dentro de `src/client/`, que só existe após o Setup da 002 |
| 3 | `003-carrinho-produto-precificacao` | 002, 001 | Consome `vendaStore.ts` da 001 (Foundational T003); motor de precificação — feature mais crítica do projeto |
| 4 | `012-selecao-vendedor` | 002, 001 | Não depende de 003 — pode ser implementada em paralelo com ela |
| 5 | `005-identificacao-cadastro-cliente` | 002, 001, 003 | Consome `carrinhoSlice`, `fetchProduto`, `dinheiro.ts` diretamente |
| 6 | `004-finalizacao-suspensao-venda` | 002, 001, 003 | Não depende de 005 — pode ser implementada em paralelo com ela |
| 7 | `008-pagamento-geral` | 001, 002, 003 | Reusa `Centavos`/`distribuirPorMaiorResto` de 003, nunca reimplementa |
| 8 | `014-validacao-previa-nfce` | 002, 003, 005, 012, 004, 008 | Substitui os stubs `podeFinalizar()` (004) e `validarInsercao()` (008) pela implementação real do gate `ValidarNFCe` |
| 9 | `006-importacao-dav` | 002, 003, 005, 001 (estendida) | Consome `clienteSlice`/`carrinhoSlice` direto; dependências de 008/012 entram por stub, não bloqueiam |
| 10 | `009-pagamento-pix` | 002, 003, 005, 008 | Implementa o lado PIX do stub `iniciarIntegracao()` deixado pela 008 |
| 11 | `010-pagamento-tef` | 002, 003, 005, 008 (mesmo padrão da 009) | ⚠️ Ainda só tem `spec.md` — precisa passar por `/speckit-plan` + `/speckit-tasks` antes de entrar de fato nesta ordem |
| 12 | `011-recuperacao-nfce` | 001, 002, 003, 004, 005, 006, 008, 012 | Reusa `dav.schema.ts` da 006 (AD-117) e a action `trocarVendedor(origem:'RASCUNHO')` da 012 |
| 13 | `007-layout-responsivo-mobile` | 003, 004, 005, 006 | Compõe componentes desktop já implementados — por isso exige a 006 (Milestone 2) além do Milestone 1 relevante |
| 14 | `013-venda-rapida-cenario-pagamento` | 002, 008, 004, 001, 007 | Consome a capacidade `plataforma` injetada pela 007 (padrão estreado por AD-074; a regra de TEF que o originou caiu em AD-144, o padrão não) — por isso vem depois dela |

## Desvios em relação à leitura ingênua do `ROADMAP.md` (Milestone 1 → 2 → 3)

- **007** (Milestone 3, mobile) exige que a **006** (Milestone 2, DAV) já esteja implementada — não dá para pular direto do Milestone 1 para o 3.
- **013** exige a **007** pronta (usa a capacidade `plataforma` dela) — inverte a intuição de que atalhos de teclado (desktop-only) viriam antes do layout mobile.

## Fonte

Cada linha reflete a nota "⚠️ Ordem de implementação e dependências cruzadas" (ou equivalente) do respectivo `specs/NNN-*/tasks.md`. Para o raciocínio completo por trás de cada dependência, ler a nota na própria feature — este documento é um resumo, não substitui o `tasks.md`.
