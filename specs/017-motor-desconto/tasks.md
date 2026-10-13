---

description: "Task list for feature implementation"
---

# Tasks: Motor de desconto do Checkout (capa e item)

**Input**: Design documents from `/specs/017-motor-desconto/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/motor-desconto-api.md](./contracts/motor-desconto-api.md), [quickstart.md](./quickstart.md)

**Tests**: OBRIGATÓRIOS. A Constitution V exige que toda regra de desconto seja auditável e coberta por teste antes de ser dada por concluída, e a skill de projeto `money-precision` trata precificação como o maior risco do produto. Todo teste marcado ⚠️ deve **falhar** antes de a tarefa de implementação que o satisfaz começar.

**Organization**: tarefas agrupadas por user story, cada uma entregável e testável de forma independente. A Phase 2 existe porque duas mudanças de tipo (`precoMinimo` e `origem`, ambos obrigatórios) quebram o `tsc` em arquivos de teste: elas são varridas **antes** de qualquer tarefa de comportamento.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos distintos, sem dependência pendente)
- **[Story]**: a qual user story a tarefa pertence (US1–US4)

> **Convenções de caminho** (verificadas em 2026-10-13): testes ficam em `tests/unit/**` e `tests/integration/**` com sufixo `.spec.ts(x)` — é o único padrão que o `include` de `vitest.config.ts` executa. Edição de arquivo é sempre com `Read`/`Edit`/`Write`, nunca por script (regra do projeto).

---

## ⚠️ Arquivos tocados em mais de uma fase — nunca paralelizar entre fases

| Arquivo | Fases que o tocam | Consequência |
|---|---|---|
| `src/client/stores/slices/pagamentoSlice.ts` | Foundational, US3, US4 | Foundational grava `origem: 'MANUAL'`; US3 acrescenta teto, evento e capa automática; US4 troca o retorno de `montarPagamentosParaPayload` e lê a chave. **US4 só depois de US3.** |
| `src/client/stores/slices/carrinhoSlice.ts` | US1, US2 | US1 cria `atualizarItem`; US2 acrescenta a guarda do preço mínimo nos três pontos |
| `src/client/features/carrinho/EntradaRapidaProduto.tsx` | US1, US2 | US1 consome o hook; US2 liga o ajuste ao sair do campo e ao confirmar |
| `src/client/features/carrinho/useVinculoPrecoDesconto.ts` | US1, US2 | US1 cria o hook; US2 acrescenta `ajustarAoMinimo` |
| `src/client/domain/precificacao/descontoItem.ts` | US1, US2 | US1 cria o vínculo; US2 acrescenta limite e ajuste |
| `tests/unit/domain/pagamento/descontoCapa.spec.ts` | US3 | Fase única, mas o arquivo asserta o rateio igual (AD-098), que **continua valendo** com a chave desligada |
| `tests/e2e/support/erp-mock.ts` | US2, US3, US4 | Cada fase acrescenta fixtures; sequencial |
| `tests/e2e/carrinho-precificacao.spec.ts` | US1, US2 | US1 ajusta o caso do desconto; US2 acrescenta o mínimo |
| `tests/e2e/pagamento-geral.spec.ts` | US3, US4 | US3 acrescenta a condição; US4 roda o payload com a chave |

---

## Phase 1: Setup

**Purpose**: saber o que já está quebrado antes de mexer, para não atribuir a esta feature uma falha que já existia.

- [ ] T001 Na branch `feat/motor-desconto`, rodar `npx tsc --noEmit` e `npx vitest run` e anotar, em uma linha abaixo deste item em `specs/017-motor-desconto/tasks.md`, o resultado de base (verde, ou a lista de testes já falhando). `venda-rapida.spec.ts:312` é instável sob carga no `master` e não conta como regressão

**Checkpoint**: baseline conhecida.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: as duas mudanças de tipo que quebram a compilação, mais a varredura de fixtures que elas exigem. Nenhum comportamento muda aqui.

**⚠️ CRITICAL**: nenhuma user story começa antes do `tsc` limpo (T009). Se uma fixture ficar para depois, a story seguinte falha por um motivo que não é dela.

- [ ] T002 ⚠️ [P] Em `tests/unit/shared/produto.schema.spec.ts`, escrever os casos de `PrecoMinimo`: `8.5` vira `850` centavos; `0`, ausente e `null` viram `0` ("sem mínimo"); string numérica do ERP (`"8.50000"`) é aceita; valor negativo ou não numérico é recusado na fronteira (Constitution IV)
- [ ] T003 Declarar `PrecoMinimo` em `src/shared/schemas/produto.schema.ts` (`sdtCheckoutGetProdutoSchema`, perto de `PrecoVenda`), convertido para centavos como os demais preços e com padrão `0` quando ausente. Faz T002 passar
- [ ] T004 Acrescentar `precoMinimo: Centavos` (obrigatório, `0` = sem mínimo) a `SnapshotPrecoProduto` em `src/client/domain/precificacao/linha.ts`; mapear em `paraSnapshotPrecoProduto` (`src/client/services/produto/produtoMapper.ts`) e fixar `precoMinimo: centavos(0)` nos dois snapshots literais de `src/client/domain/importacaoVenda/mapearVendaExistente.ts` (linhas ~320-326, linha de DAV/NFCe — o documento já foi aceito pelo ERP). Depende de T003
- [ ] T005 [P] Em `src/client/domain/pagamento/descontoCapa.ts`, exportar `OrigemDescontoCapa = 'CONDICAO' | 'MANUAL'` e acrescentar `readonly origem: OrigemDescontoCapa` (obrigatório) a `DescontoCapa`; em `src/client/stores/slices/pagamentoSlice.ts`, fazer `aplicarDescontoCapa` gravar `origem: 'MANUAL'` — **comportamento idêntico ao atual**, só para o tipo fechar
- [ ] T006 [P] Varrer as fixtures que montam `SnapshotPrecoProduto` literal, acrescentando `precoMinimo`: `tests/support/precificacao.ts` (`linhaDe` e `respostaGetProduto`, que já traz `PrecoMinimo: 8.5` — o snapshot deve refletir esse valor), `tests/unit/domain/precificacao/tabelaPreco.spec.ts` (8 ocorrências), `tests/unit/domain/precificacao/reprecificacao.spec.ts`, `tests/integration/ModalRecuperacaoNFCe.spec.tsx`, `tests/integration/clienteSlice.spec.ts`, `tests/integration/carrinhoSlice.spec.ts`. Depende de T004
- [ ] T007 [P] Varrer as fixtures que montam `DescontoCapa` literal (`valorResolvido:`), acrescentando `origem: 'MANUAL'`: `tests/unit/client/pagamento/ControleDescontoCapa.spec.tsx` (6) e `tests/integration/layoutPreservacaoEstado.spec.tsx` (1). Depende de T005
- [ ] T008 Rodar `grep` por `precosFaixa:` e por `valorResolvido:` em `src/` e `tests/` e confirmar que nenhum literal ficou sem o campo novo (a contagem de T006/T007 foi medida em 2026-10-13: 9 arquivos de snapshot, 3 de capa)
- [ ] T009 Rodar `npx tsc --noEmit` (zero erros) e `npx vitest run` (nenhuma regressão contra a baseline de T001). Depende de T002–T008
- [ ] T010 Commit + push da fase: `feat: precoMinimo no snapshot e origem na capa (017, base)` — mensagem `<tipo>: <descrição>` referenciando a 017

**Checkpoint**: tipos novos no lugar, fixtures varridas, `tsc` limpo, nenhum comportamento alterado. As user stories podem começar.

---

## Phase 3: User Story 1 — Preço e desconto do item andam juntos (Priority: P1) 🎯 MVP

**Goal**: em produto `'E'` com preço de tabela, preço e desconto são a mesma informação vista de dois lados; a edição pelo lápis é atômica.

**Independent Test**: com o produto `'E'` de preço 20,00, digitar `18` no preço (desconto vira `2,00`), apagar o desconto (preço volta a `20,00`), digitar `5` no desconto (preço vira `15,00`), repetir com quantidade 3 — quickstart Q1. **Não exige preço mínimo nem condição de pagamento.**

### Tests for User Story 1 ⚠️

- [ ] T011 [P] [US1] Em `tests/unit/domain/precificacao/dinheiro.spec.ts`, escrever os casos de `dividirPorQuantidade`: divisão exata, meio-centavo arredondado para longe de zero, quantidade fracionária (`1,5`), quantidade zero ou negativa lança, e propriedade de ida-e-volta com `multiplicarPorQuantidade` dentro de 1 centavo por unidade
- [ ] T012 [P] [US1] Criar `tests/unit/domain/precificacao/descontoItem.spec.ts` com: `ehVinculavel` (só `'E'` com `precoBase > 0`; `'S'`, `'B'`, `''` e `precoBase = 0` não); `descontoDoPreco` (20→18 = 2,00; preço ≥ base = 0; qtd 3 → 6,00); `precoDoDesconto` (desconto 5 → 15,00; desconto 0 → 20,00; qtd 3 e desconto 1,00 → 19,67; piso em zero); `consolidarPorPreco` (preço acima do base vira `precoUnitario` com desconto 0); `consolidarPorDesconto` (`precoUnitario = precoBase`); teste de propriedade de I-D2
- [ ] T013 [P] [US1] Criar `tests/unit/client/carrinho/useVinculoPrecoDesconto.spec.tsx` cobrindo o quickstart Q1: passos 2–7, incluindo o caso do **mestre** (qtd 3, desconto `1`, sair do campo de preço **sem mexer**: o desconto continua `1,00`) e o da mudança de quantidade (preço `18`, qtd 3→5: desconto `6,00`→`10,00`); produto não vinculável mantém os campos independentes
- [ ] T014 [P] [US1] Em `tests/integration/carrinhoSlice.spec.ts`, escrever os casos de `atualizarItem`: devolve `true` ao gravar; **atômico** — linha 10 × R$ 10,00 com desconto R$ 50,00, edição para preço R$ 5,00 e desconto R$ 20,00 é recusada **por inteiro**, sem gravar parcial; reprecifica quando a quantidade muda; audita um `PRODUTO_ALTERADO` por campo efetivamente alterado; respeita `carrinhoBloqueado()`

### Implementation for User Story 1

- [ ] T015 [US1] Exportar `dividirPorQuantidade(valor: Centavos, quantidade: Milesimos): Centavos` em `src/client/domain/precificacao/dinheiro.ts`, reusando `dividirArredondando` (hoje privado), conforme `contracts/motor-desconto-api.md` §1.1. Faz T011 passar
- [ ] T016 [US1] Criar `src/client/domain/precificacao/descontoItem.ts` com `ehVinculavel`, `descontoDoPreco`, `precoDoDesconto`, `consolidarPorPreco` e `consolidarPorDesconto` (§1.2 do contrato), sem React nem store e sem ponto flutuante. Faz T012 passar. Depende de T015
- [ ] T017 [US1] Acrescentar `atualizarItem(idLinha, { quantidade, precoUnitario, descontoManual }): boolean` à interface `CarrinhoSlice` e a `criarCarrinhoSlice` em `src/client/stores/slices/carrinhoSlice.ts`: bloqueio do carrinho → monta a linha resultante → reprecifica se a quantidade mudou → `descontoZeraALinha` (recusa e avisa) → `aplicarLinhas` uma única vez → audita por campo alterado. `editarItem` **permanece**. Faz T014 passar
- [ ] T018 [US1] Em `src/client/features/carrinho/useCarrinho.ts`, trocar as três chamadas de `editarItem` de `confirmarEdicaoDeLinha` (linhas ~807-809) por uma de `atualizarItem`; acrescentar `'recusado'` ao tipo `ResultadoConfirmacao` e devolvê-lo quando `atualizarItem` devolver `false`. Depende de T017
- [ ] T019 [US1] Criar `src/client/features/carrinho/useVinculoPrecoDesconto.ts` conforme §3 do contrato: `precoTexto`, `descontoTexto`, `mudarPreco`, `mudarDesconto`, `mudarQuantidade`, `carregar(linha)` e `zerar()`, com o **mestre** (`'PRECO' | 'DESCONTO'`) decidindo qual campo é recalculado — sair de um campo nunca recalcula o campo em que se está saindo (research D4). Em produto não vinculável, os campos seguem independentes. (`ajustarAoMinimo` vem na US2.) Faz T013 passar. Depende de T016
- [ ] T020 [US1] Em `src/client/features/carrinho/EntradaRapidaProduto.tsx`, substituir o estado solto `precoTexto`/`descontoTexto` (linhas ~388-389) e os `onChange` dos campos de preço (~1786-1798), desconto (~1815-1847) e quantidade (~1702-1737) pelo hook de T019; carregar o par derivado ao abrir o lápis; **não** limpar a barra quando `confirmarEdicaoDeLinha` devolver `'recusado'`; para produto vinculável, a inserção envia o par `consolidarPor*` (`precoUnitario`, `descontoManual`). Consultar o Pencil MCP (`get_screenshot` do nó da barra) antes de alterar qualquer elemento visual. Depende de T018, T019
- [ ] T021 [US1] Atualizar `tests/unit/client/carrinho/EntradaRapidaProduto.spec.tsx` (linhas ~127-195, 609-624 e 732, que afirmam preço e desconto independentes) para o vínculo, e **preencher a lacuna** apontada na pesquisa: nenhum teste de UI cobre `descontoZeraItem` nem `AVISO_DESCONTO_ZERA_ITEM` na barra. Depende de T020
- [ ] T022 [US1] Rever `tests/e2e/carrinho-precificacao.spec.ts` (linhas ~231-238: preço 15,00, qtd 2, desconto 2,00 → total 28,00) para o novo vínculo — com `precoBase > 0` o par digitado passa a ser derivado — e acrescentar o roteiro Q1 do quickstart. Depende de T020
- [ ] T023 [US1] Rodar `npx tsc --noEmit` e `npx vitest run`; commit + push da fase: `feat: preço e desconto do item vinculados (017, US1)`

**Checkpoint**: US1 funcional e testável sozinha. É o MVP: elimina a ambiguidade "o desconto foi dado ou não" e a edição parcial do lápis.

---

## Phase 4: User Story 2 — Desconto de item limitado pelo preço mínimo (Priority: P2)

**Goal**: o preço do item nunca fica abaixo do mínimo cadastrado no ERP; o excesso é ajustado automaticamente, com **um** aviso.

**Independent Test**: produto de preço 20,00 e mínimo 8,00 — digitar preço `6` e sair do campo (preço `8,00`, desconto `12,00`, um aviso); desconto `15` (limitado a `12,00`); quantidade 3 e desconto `40` (`36,00`); produto sem mínimo não limita — quickstart Q2.

**Depende da US1** (o limite só existe sobre o desconto vinculado).

### Tests for User Story 2 ⚠️

- [ ] T024 [P] [US2] Em `tests/unit/domain/precificacao/descontoItem.spec.ts`, acrescentar `limiteDeDesconto` (base 20, mínimo 8 → 12,00; qtd 3 → 36,00; mínimo 0 → `null`; mínimo ≥ base → 0) e `ajustarAoPrecoMinimo` (dentro do limite: `ajustado: false`; acima: valor limitado e `ajustado: true`; limite `null`: nunca ajusta). Mesmo arquivo de T012 — executar depois dele
- [ ] T025 [P] [US2] Em `tests/integration/carrinhoSlice.spec.ts`, escrever a guarda do preço mínimo em `inserirItem`, `editarItem` e `atualizarItem`: ajusta o desconto e avisa; **avisa uma única vez** (contar chamadas de `deps.avisar`); dentro do limite não avisa; linha não vinculável, de importação (`pesavelEditavel: ''`) e produto sem mínimo não são tocados; a quantidade reduzida que estoura o limite é ajustada. Mesmo arquivo de T014 — executar depois dele
- [ ] T026 [P] [US2] Em `tests/unit/client/carrinho/useVinculoPrecoDesconto.spec.tsx`, acrescentar `ajustarAoMinimo`: devolve os dois textos ajustados quando excede, `null` quando não há o que ajustar. Mesmo arquivo de T013 — executar depois dele
- [ ] T027 [P] [US2] Em `tests/unit/client/carrinho/EntradaRapidaProduto.spec.tsx`, escrever: sair do campo de preço abaixo do mínimo ajusta e emite `notificar.aviso` **uma vez** com o preço mínimo na frase; confirmar com desconto acima do limite grava o valor ajustado; o `+` usa o valor ajustado e não o do estado anterior. Mesmo arquivo de T021 — executar depois dele

### Implementation for User Story 2

- [ ] T028 [US2] Acrescentar `limiteDeDesconto` e `ajustarAoPrecoMinimo` a `src/client/domain/precificacao/descontoItem.ts`, comparando **totais** e nunca preços unitários (research D7). Faz T024 passar
- [ ] T029 [US2] Em `src/client/stores/slices/carrinhoSlice.ts`, acrescentar a constante `AVISO_PRECO_MINIMO` (frase: "Preço mínimo deste item: R$ X. O desconto foi ajustado automaticamente.", via `formatarCentavos`) ao lado de `AVISO_DESCONTO_ZERA_A_LINHA`, e a guarda do mínimo em `inserirItem`, `editarItem` e `atualizarItem`, no mesmo ponto em que hoje se checa `descontoZeraALinha`. O slice **ajusta** (não recusa) e só avisa se ainda precisou ajustar. Faz T025 passar. Depende de T028
- [ ] T030 [US2] Acrescentar `ajustarAoMinimo()` a `src/client/features/carrinho/useVinculoPrecoDesconto.ts`. Faz T026 passar. Depende de T028
- [ ] T031 [US2] Em `src/client/features/carrinho/EntradaRapidaProduto.tsx`, chamar `ajustarAoMinimo` ao sair dos campos de preço e desconto e dentro de `previaValida()`/`confirmar()`, **usando os valores devolvidos** (não o estado do React, que ainda é o anterior no mesmo quadro); emitir um único `notificar.aviso`; produto não vinculável ou sem mínimo não chama. Faz T027 passar. Depende de T029, T030
- [ ] T032 [US2] Em `tests/e2e/support/erp-mock.ts`, expor três produtos `'E'`: preço 20,00 com `PrecoMinimo` 8,00; preço 20,00 sem mínimo (`PrecoMinimo` 0); preço 0,00 (não vinculável). Em `tests/e2e/carrinho-precificacao.spec.ts`, acrescentar o roteiro Q2 do quickstart (passos 1–6). Depende de T031 e de T022 (mesmo spec)
- [ ] T033 [US2] Rodar `npx tsc --noEmit` e `npx vitest run`; commit + push: `feat: preço mínimo limita o desconto do item (017, US2)`

**Checkpoint**: US1 e US2 funcionam juntas. Nenhum item entra na venda abaixo do preço mínimo por nenhum caminho (SC-002).

---

## Phase 5: User Story 3 — Capa preenchida pela condição de pagamento, com teto (Priority: P2)

**Goal**: escolher a condição preenche a capa com o desconto dela; o operador edita até o teto da condição; acima do teto o valor é ajustado com aviso; teto zero bloqueia.

**Independent Test**: condições A (5%/teto 8%), B (0%/0%) e C (10%/8%) — quickstart Q3: A preenche 5%; digitar `10` ajusta para `8` com aviso; B bloqueia o campo; C aplica 8% e avisa; a capa incide sobre o subtotal **já líquido** dos descontos de item. **Independente de US1 e US2.**

### Tests for User Story 3 ⚠️

- [ ] T034 [P] [US3] Em `tests/unit/domain/pagamento/descontoCapa.spec.ts`, escrever: `tetoDaCapa` (sem condição → `null`; teto 8% de 100,00 → 8,00; teto 0 → 0; teto negativo ou ausente → 0); `resolverCapaComTeto` (abaixo do teto: inalterado; acima: ajusta `entrada` e `valorResolvido`, `ajustadaAoTeto: true`; teto 0: `{ recusa: 'CONDICAO_SEM_DESCONTO' }`; modo `VALOR` e `PERCENTUAL` comparados **em centavos**); e a **base**: 10% de capa com subtotal bruto 120,00 e R$ 20,00 de desconto de item = 10,00, não 12,00 (FR-023)
- [ ] T035 [P] [US3] Em `tests/unit/domain/auditoria/eventos.spec.ts`, escrever `eventoDescontoCapaAplicado` (tipo `'DESCONTO_CAPA_APLICADO'`; detalhes `origem`, `modo`, `entrada`, `valor` em centavos) e a serialização no `Log` do retrato
- [ ] T036 [P] [US3] Em `tests/integration/pagamentoSlice.spec.ts`, escrever: `selecionarCondicao` preenche a capa (`origem: 'CONDICAO'`) **no mesmo `set`** que grava a condição (I-D4); trocar a condição descarta a capa digitada; condição com `desconto 0` deixa a capa vazia; `descontoMaximo 0` com `desconto > 0` não aplica e avisa; `desconto` > `descontoMaximo` aplica limitada ao teto e avisa; capa automática que igualaria o subtotal não aplica e avisa; troca recusada com pagamento vivo mantém a capa; `importarCondicaoPagamento` **não** aplica capa automática; `aplicarDescontoCapa` ajusta ao teto, recusa com teto 0, grava `origem: 'MANUAL'`, emite `DESCONTO_CAPA_APLICADO` só na chamada **não silenciosa** e sem duplicar a mesma capa; sem condição não há teto (FR-022). Estender `condicaoDe` em `tests/support/pagamento.ts` para aceitar `desconto` e `descontoMaximo`
- [ ] T037 [P] [US3] Em `tests/unit/client/pagamento/ControleDescontoCapa.spec.tsx`, escrever: campo preenchido pela condição; texto do teto exibido; bloqueio explicativo com teto 0; digitar `10` com teto 8 e sair do campo → o texto passa a `8` e há **um** aviso; `entrada` 3,25 vinda do ERP é exibida inteira (D9) e só a **digitação** rejeita casas extras; o equivalente financeiro nunca excede o teto

### Implementation for User Story 3

- [ ] T038 [US3] Em `src/client/domain/pagamento/descontoCapa.ts`, acrescentar `tetoDaCapa`, `ResolucaoDaCapa`, `resolverCapaComTeto` e a recusa `'CONDICAO_SEM_DESCONTO'` à união `RecusaDescontoCapa`, conforme §1.3 do contrato; `recusaDoDescontoCapa` não muda de assinatura. Faz T034 passar
- [ ] T039 [P] [US3] Em `src/client/domain/auditoria/eventos.ts`, acrescentar `EventoDescontoCapaAplicado` à união e a factory `eventoDescontoCapaAplicado` (catálogo de 20 → 21 tipos); atualizar o comentário do cabeçalho do arquivo e `specs/001-auditoria-acoes-operador/contracts/auditoria-events.md` e `data-model.md` com o 21º evento. Faz T035 passar
- [ ] T040 [US3] Em `src/client/stores/slices/pagamentoSlice.ts`: (a) em `aplicarDescontoCapa`, consultar o teto da `condicaoSelecionada` via `tetoDaCapa`/`resolverCapaComTeto`, ajustar e avisar (`AVISO_TETO_DA_CONDICAO`), recusar com `AVISO_CONDICAO_SEM_DESCONTO` quando o teto é 0, gravar `origem: 'MANUAL'` e emitir `DESCONTO_CAPA_APLICADO` na chamada não silenciosa, deduplicado contra a última capa auditada (variável de closure); (b) em `selecionarCondicao` (linha ~797), gravar `condicaoSelecionada` **e** `descontoCapa` no mesmo `set` — capa `PERCENTUAL` com `min(desconto, descontoMaximo)`, `origem: 'CONDICAO'`, ou `null` (descarta a digitada, FR-019). Faz T036 passar. Depende de T038, T039
- [ ] T041 [US3] Em `src/client/features/pagamento/ControleDescontoCapa.tsx`: ler `condicaoSelecionada.descontoMaximo`; exibir o teto; bloqueio explicativo (`lib/bloqueio.ts`, `atributosDeBloqueio`) quando o teto é 0; em `aplicar` (linha ~284), depois de uma chamada **não silenciosa**, reescrever `entradaTexto` com a entrada que o store de fato gravou (`textoDoDescontoAplicado`) quando difere da digitada; limitar `resolverEquivalente` ao teto. Consultar o Pencil MCP antes de qualquer elemento visual novo. Faz T037 passar. Depende de T040
- [ ] T042 [P] [US3] Atualizar o TSDoc de `desconto` e `descontoMaximo` em `src/client/domain/pagamento/formaPagamento.ts` (linhas ~140-143), que hoje afirma que eles não alimentam nem limitam a capa, e o do cabeçalho de `ControleDescontoCapa.tsx` ("Sem teto e sem autorização (FR-015/AD-039)"). Reescrever no ponto, não anexar
- [ ] T043 [US3] Em `tests/e2e/support/erp-mock.ts`, expor as condições **A** (`CondicaoDesconto 5`, `CondicaoDescontoMaximo 8`), **B** (`0`, `0`) e **C** (`10`, `8`); em `tests/e2e/pagamento-geral.spec.ts`, acrescentar o roteiro Q3 do quickstart (passos 1–7). Depende de T041
- [ ] T044 [US3] Rodar `npx tsc --noEmit` e `npx vitest run`; commit + push: `feat: capa preenchida pela condição e limitada pelo teto (017, US3)`

**Checkpoint**: a capa tem dono e limite. Com a chave ainda desligada, o envio ao ERP segue idêntico ao anterior.

---

## Phase 6: User Story 4 — Capa vai ao ERP como valor único, sem rateio local (Priority: P3)

**Goal**: atrás de `DESCONTO_CAPA_NO_ERP`, o Checkout envia a capa em `CheckoutFaturarNFCe.DescontoCapaValor` (reais, até 2 casas) e para de ratear; desligada, o corpo é idêntico ao de hoje.

**Independent Test**: com a chave desligada, finalizar venda com capa de R$ 3,00 e três itens produz o corpo anterior (sem `DescontoCapaValor`, parcela de 1,00 em cada `DescontoValor`); ligada, o cabeçalho leva `DescontoCapaValor: 3` e cada item só convênio + manual; validar e suspender têm a mesma forma — quickstart Q4. **Depende de US3 apenas pelo arquivo `pagamentoSlice.ts`** (ver tabela de conflitos).

**Contrato confirmado pelo usuário em 2026-10-13**: o nome é `DescontoCapaValor`; é valor monetário em reais com até 2 casas; a porcentagem, quando a capa é dada em %, é resolvida **pelo Checkout** (`resolverDescontoCapa`/`aplicarPercentual`) e só o valor resolvido viaja. Nenhuma tarefa converte percentual no envio.

### Refactor first (comportamento idêntico)

- [ ] T045 [US4] Refatorar **sem mudar comportamento**: exportar `DescontoCapaNoRetrato` (união `RATEADA` | `NO_CABECALHO`) de `src/client/domain/venda/montarRetratoVenda.ts` e trocar o 4º parâmetro `rateioDescontoCapa: Map` por `descontoCapa: DescontoCapaNoRetrato` (padrão `{ tipo: 'RATEADA', rateio: new Map() }`); em `src/client/stores/slices/pagamentoSlice.ts`, fazer `montarPagamentosParaPayload()` devolver `descontoCapa` (sempre `RATEADA` por ora) no lugar de `rateioDescontoCapa`; repassar em `src/client/stores/slices/validacaoVendaSlice.ts` (`ValidacaoDeps.rateioDescontoCapa` → `descontoCapa`), `src/client/stores/vendaStore.ts` (linha ~351) e `src/client/features/finalizacao-suspensao/useFinalizarOuSuspenderVenda.ts` (linha ~410); remover a cópia local de `reaisDeCentavos` (linha 166) importando a de `dinheiro.ts`. Ajustar as fixtures: `tests/support/pagamento.ts`, `tests/integration/pagamentoSlice.spec.ts`, `tests/integration/validacaoVendaSlice.spec.ts`, `tests/unit/domain/venda/montarRetratoVenda.spec.ts` (19 chamadas; as que omitem o 4º argumento continuam válidas). **A suíte deve ficar verde sem alterar nenhuma asserção de comportamento** — se uma asserção precisar mudar, a refatoração não é neutra. Depende de T040

### Tests for User Story 4 ⚠️

- [ ] T046 [P] [US4] Em `tests/unit/domain/venda/montarRetratoVenda.spec.ts`, escrever: `RATEADA` → o objeto **não tem a chave** `DescontoCapaValor` (`'DescontoCapaValor' in retrato === false`) e o corpo é idêntico ao de antes (SC-007); `NO_CABECALHO` → `DescontoCapaValor` em reais com 2 casas (centavos 300 → `3`; 33 → `0.33`; 1 → `0.01`, sem ruído de ponto flutuante), `0` quando não há capa, `produtos[].DescontoValor` só convênio + manual, `ValorTotal = totalLinha`
- [ ] T047 [P] [US4] Criar `tests/unit/server/config/env.spec.ts`: `loadEnv` com `DESCONTO_CAPA_NO_ERP` ausente → `descontoCapaNoErp: false`; `'true'` → `true`; `'false'` → `false`; qualquer outro valor lança `Configuração de ambiente inválida`
- [ ] T048 [P] [US4] Criar `tests/unit/server/routes/bootstrapRecursos.spec.ts` seguindo `bootstrapUsuarioGam.spec.ts`: `GET /api/bootstrap` devolve `recursos.descontoCapaNoErp` conforme o `Env`; o `ETag` **muda** quando a chave muda (o hash cobre `recursos`) e o `304` não reaproveita o cache da chave anterior
- [ ] T049 [P] [US4] Em `tests/unit/shared/bootstrap.schema.spec.ts` e `tests/integration/bootstrap-cache.spec.ts`, escrever: payload **sem** `recursos` (registro antigo do Dexie) é aceito e vira `{ descontoCapaNoErp: false }`; `recursos.descontoCapaNoErp` não booleano é recusado
- [ ] T050 [P] [US4] Em `tests/integration/pagamentoSlice.spec.ts`, escrever: com a porta `descontoCapaNoErp` ligada, `montarPagamentosParaPayload()` devolve `NO_CABECALHO` com `valorResolvido`; desligada, `RATEADA`; com ela ligada o caso **70/29/1 com 10%** é aceito (não há `ZERA_UM_ITEM`) e `ZERA_A_VENDA` continua recusando. Em `tests/integration/validacaoVendaSlice.spec.ts` e `tests/integration/finalizacaoSuspensao.spec.ts`: validar, suspender e finalizar recebem **a mesma** união (I-D5)

### Implementation for User Story 4

- [ ] T051 [P] [US4] Em `src/server/config/env.ts`, acrescentar `descontoCapaNoErp: boolean` a `Env` e `DESCONTO_CAPA_NO_ERP: z.enum(['true','false']).default('false')` a `envSchema`, mapeando em `loadEnv`; declarar a variável em `.env.example` (com a ordem de virada da spec), `docker-compose.yml` (`${DESCONTO_CAPA_NO_ERP:-false}`), `deploy/beta/docker-stack.yml` e repassá-la em `playwright.config.ts`. Faz T047 passar
- [ ] T052 [US4] Acrescentar `recursos: z.looseObject({ descontoCapaNoErp: z.boolean() }).default({ descontoCapaNoErp: false })` a `bootstrapPayloadSchema` em `src/shared/schemas/bootstrap.schema.ts`, e fazer `src/server/routes/bootstrap.ts` incluir `recursos: { descontoCapaNoErp: deps.env.descontoCapaNoErp }` em `combinado` (linha ~120), **antes** de `calcularVersionHash`. Faz T048 e T049 passarem. Depende de T051
- [ ] T053 [US4] Em `src/client/stores/slices/pagamentoSlice.ts`, acrescentar a porta `descontoCapaNoErp(): boolean` a `PagamentoDeps`; em `src/client/stores/vendaStore.ts`, implementá-la em `pagamentoDepsPadrao` lendo `useSessionStore.getState().registro?.recursos.descontoCapaNoErp`, com `false` quando não há registro — mesmo padrão e mesmo desfecho seguro de `capacidadesDoBootstrap()`. Depende de T052
- [ ] T054 [US4] Em `src/client/stores/slices/pagamentoSlice.ts`: `montarPagamentosParaPayload()` devolve `{ tipo: 'NO_CABECALHO', valor: descontoCapa?.valorResolvido ?? ZERO_CENTAVOS }` quando a porta está ligada, e `RATEADA` quando não; `aplicarDescontoCapa` passa `linhas = []` a `recusaDoDescontoCapa` com a porta ligada (`descontoCapa.ts:109-111` então só avalia `ZERA_A_VENDA`). Depende de T053
- [ ] T055 [US4] Em `src/client/domain/venda/montarRetratoVenda.ts`: o tipo `CheckoutFaturarNFCe` ganha `readonly DescontoCapaValor?: number`; com `NO_CABECALHO`, `itensDoRetrato` omite a parcela de capa (`DescontoValor` só convênio + manual, `ValorTotal = totalLinha`) e o cabeçalho inclui o campo **sempre** (zero sem capa); com `RATEADA`, **nenhuma chave nova**. Faz T046, T050 passarem. Depende de T054
- [ ] T056 [US4] Em `tests/e2e/support/erp-mock.ts`, fazer `FaturarNFCe` e `ValidarNFCe` aceitarem `DescontoCapaValor` e devolverem o total coerente; em `tests/e2e/pagamento-geral.spec.ts`, ramificar a asserção das linhas ~186-197 por `process.env.DESCONTO_CAPA_NO_ERP` (desligada: soma dos `DescontoValor` ≈ capa; ligada: `DescontoCapaValor` igual à capa **e** nenhuma parcela nos itens) e registrar no cabeçalho do spec como rodar as duas variantes. Depende de T055
- [ ] T057 [US4] Rodar `npx tsc --noEmit` e `npx vitest run`; commit + push: `feat: capa enviada ao ERP em DescontoCapaValor atrás de chave (017, US4)`

**Checkpoint**: as quatro histórias completas. Chave nasce desligada: em produção nada muda até alguém ligá-la.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: reescrever as decisões superadas **no ponto** (regra do projeto: nunca anexar a correção ao fim do parágrafo) e fechar os gates.

- [ ] T058 [P] Registrar **AD-279** em `.specs/project/STATE.md` (data 2026-10-13; resumo: vínculo preço↔desconto, preço mínimo, capa pela condição com teto como ajuste, chave `DESCONTO_CAPA_NO_ERP`) e **sinalizar no ponto** que AD-098 (rateio igual local) e AD-151 (`ZERA_UM_ITEM`) deixam de valer **com a chave ligada**, reescrevendo o parágrafo de cada um, não anexando
- [ ] T059 [P] Reescrever em `specs/003-carrinho-produto-precificacao/spec.md` os FR-014/FR-015 e em `data-model.md` os invariantes I8/I9 (linhas ~115-116): desconto deixa de ser independente do preço em produto `'E'` com preço de tabela
- [ ] T060 [P] Reescrever em `specs/008-pagamento-geral/spec.md` os FR-014/FR-015 ("sem teto"), em `data-model.md` as linhas 21-22 (condição não limitava a capa) e em `contracts/erp-pagamento-api.md` o §3 ("`DescontoCapaValor` não existe como campo de cabeçalho")
- [ ] T061 [P] Em `.specs/project/PENDENCIES.md`, registrar: **resolvido em 2026-10-13** — nome (`DescontoCapaValor`) e tipo (reais, até 2 casas, porcentagem resolvida pelo Checkout); **em aberto** — regra de rateio do ERP, cadastro de tetos das condições (maioria `0`), teto zero em condição importada de DAV bloqueando a capa digitada (AD-171), e a atualização dos capítulos de desconto da wiki, que vivem na branch `docs/wiki-operacional` (sem PR) e não existem nesta branch
- [ ] T062 Rodar à mão os roteiros Q1–Q4 de `quickstart.md` contra o dev server (receita da memória `dev-server-local-sem-docker`; derrubar a porta 3100 antes), conferindo o payload de `FaturarNFCe` com a chave desligada e ligada; registrar o resultado em uma linha abaixo deste item
- [ ] T063 Gates: `npx tsc --noEmit` (zero erros), `npx vitest run` (nenhuma regressão contra a baseline de T001) e `npx playwright test carrinho-precificacao pagamento-geral venda-rapida` (usar `--repeat-each` para qualquer falha em `venda-rapida.spec.ts:312` antes de chamá-la de regressão); pagamento-geral rodado **duas vezes**, com a chave desligada e ligada
- [ ] T064 Revisar o diff com as skills de projeto `money-precision`, `zustand-immer-state`, `zod-boundary-validation` e `typescript-strict`, e com `ecc:typescript-reviewer`; conferir que não ficou `any`, `as` ou `!` novo e que nenhum cálculo monetário usa ponto flutuante fora de `aplicarPercentual`
- [ ] T065 Abrir o PR de `feat/motor-desconto` para `master`; **antes do merge**, invocar `/owasp-security` (regra do projeto)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependência
- **Foundational (Phase 2)**: depende da Phase 1 e **bloqueia todas as stories** — sem `tsc` limpo, qualquer falha seguinte é ambígua
- **User Stories (Phase 3+)**: dependem da Phase 2
- **Polish (Phase 7)**: depende das stories desejadas

### User Story Dependencies

- **US1 (P1)** — pode começar após a Phase 2. Sem dependência de outras stories. 🎯 MVP
- **US2 (P2)** — **depende de US1**: o limite só existe sobre o desconto vinculado, e reusa `descontoItem.ts`, `useVinculoPrecoDesconto.ts` e `atualizarItem`
- **US3 (P2)** — **independente de US1 e US2** na lógica (capa e item não se tocam). Compartilha só `erp-mock.ts` e `pagamentoSlice.ts`
- **US4 (P3)** — independente na lógica, mas **sequencial a US3** pelo arquivo `pagamentoSlice.ts` (tabela de conflitos). T045 é um refactor neutro que pode ser feito logo depois de T040

### Within Each User Story

- Testes ⚠️ **falham** antes da implementação que os satisfaz
- Domínio puro → slice → hook → componente → E2E
- Fixtures de `tests/support/*.ts` antes dos specs que as usam
- Commit + push no checkpoint de cada fase

### Parallel Opportunities

- Phase 2: T002, T005, T006, T007 em paralelo (T006 depende de T004; T007 de T005)
- US1: T011, T012, T013 e T014 (testes) em paralelo entre si — arquivos distintos
- US2: T024–T027 em paralelo **só entre si**, e cada um depois do seu arquivo irmão da US1
- US3: T034, T035, T036 e T037 em paralelo; T039 e T042 em paralelo com T038
- US4: T046–T050 em paralelo; T051 em paralelo com os testes
- **US1+US2 e US3 podem ser tocadas em paralelo** por pessoas diferentes; US4 espera US3

---

## Parallel Example: User Story 1

```bash
# Testes da US1 (arquivos distintos):
Task: "dividirPorQuantidade em tests/unit/domain/precificacao/dinheiro.spec.ts"
Task: "descontoItem em tests/unit/domain/precificacao/descontoItem.spec.ts"
Task: "useVinculoPrecoDesconto em tests/unit/client/carrinho/useVinculoPrecoDesconto.spec.tsx"
Task: "atualizarItem em tests/integration/carrinhoSlice.spec.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1 → Phase 2 (tipos, fixtures, `tsc` limpo)
2. Phase 3 (US1)
3. **PARAR E VALIDAR**: quickstart Q1; a edição pelo lápis é atômica
4. Merge como incremento — não depende do ERP nem da chave

### Incremental Delivery

1. Foundational → US1 → **demo** (MVP)
2. US2 → **demo** (preço mínimo)
3. US3 → **demo** (capa pela condição) — com a chave desligada, o envio ao ERP não muda
4. US4 → **só vai a produção depois de o ERP rateá-la** (ver Dependencies da spec); a chave nasce desligada

### Riscos que as tarefas já tratam

- **Fixtures em massa** quebrando o `tsc` → Phase 2 antes de tudo
- **Dois avisos para uma ocorrência** (barra + slice) → T025 conta chamadas de `deps.avisar`; T031 usa os valores devolvidos
- **Refactor que muda comportamento por engano** → T045 exige suíte verde sem alterar asserção
- **Cache velho do Dexie sem `recursos`** → T049 cobre o registro antigo

---

## Notes

- `[P]` = arquivos distintos, sem dependência pendente
- `[USn]` liga a tarefa à história para rastreabilidade
- Commitar no checkpoint de cada fase; nunca `git add` do que não é da tarefa (`.dual-graph/*` já aparece modificado e **fica fora**)
- Antes do primeiro push de uma branch nova, `git push -u origin <branch>`: ela rastreia `origin/master` por padrão
- Evitar: tarefa vaga, conflito de arquivo, dependência cruzada que quebre a independência da story
