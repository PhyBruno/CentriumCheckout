---

description: "Task list template for feature implementation"
---

# Tasks: Recuperação de NFCe

**Input**: Design documents from `specs/011-recuperacao-nfce/` (`plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/erp-recuperacao-api.md`, `contracts/recuperacao-domain-api.md`, `quickstart.md`)

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Tests**: Incluídos — `plan.md` § Testing define 3 camadas explícitas (domínio puro, integração de `retomarRascunho`/`ModalRecuperacaoNFCe`, E2E) com arquivos-alvo nomeados.

**Organization**: A spec lista 2 user stories, ambas P1 (`US1` listar/buscar rascunhos, `US2` retomar rascunho para o carrinho). Ordem de fase segue a ordem natural de construção e a ordem numérica da spec: **US1** (ponto de entrada — sem lista, não há seleção) → **US2** (hidratação do carrinho a partir do rascunho selecionado, o "grosso" desta feature per `plan.md` § Summary).

**⚠️ Ordem de implementação e dependências cruzadas**: esta feature depende de **001** (`resetarAuditoria`/`VENDA_INICIADA`, contrato já fechado em `specs/001-auditoria-acoes-operador/contracts/auditoria-events.md`), **002** (proxy `/api/erp/*`, `SessaoUsuario.CadSerieNFCe`), **003** (`LinhaCarrinho`, `Centavos`/`Milesimos`, e o invariante de que uma linha `precoCongelado=true` fica fora de `repricarSku`/`resolvePrecoUnitario`, AD-067), **004** (slice `identidadeVenda`, cujo setter esta feature implementa — `research.md` D9), **005** (`ClienteVenda`/`GetCliente` para montar o cliente completo a partir de `clienteCodigo`), **006** (schema Zod `src/shared/schemas/dav.schema.ts`, que valida o shape completo `CheckoutFaturarNFCe` e é reaproveitado sem alteração para validar `CarregarNFCeOutput` — `research.md` D3 corrigido, AD-117; **não** `faturarNFCe.schema.ts` da feature 004, que só valida a resposta menor de `FaturarNFCe`), **008** (`PagamentoAplicado`, `condicaoSelecionada`) e **012** (action `trocarVendedor(vendedor, origem: 'RASCUNHO')` do slice `vendedor`, já reservada por `specs/012-selecao-vendedor/data-model.md` §3 para uso desta feature — correção 2026-09-01, auditoria de lacunas). Esta feature **não** introduz nenhum slice novo no `vendaStore` (Constitution VI) — só escreve em slices já existentes de 001/003/004/005/008/012.

**Nota de escopo — `FR-008`**: a transição `CONGELADA → ATIVA` (reinserção manual de um SKU já presente numa linha congelada, disparando recálculo normal de preço) é mecanismo de `carrinho-produto-precificacao` (feature 003, `data-model.md` §6, invariante I6, AD-067) — `research.md` D13 é explícito que 011 não reimplementa nem redefine esse comportamento. A única tarefa desta feature para `FR-008` é um teste de fronteira (T016) que prova que a linha ficou corretamente congelada até o momento da reinserção; o recálculo em si é validado pelos testes já existentes de 003 (`CART-06`/AD-067).

**Nota de escopo — `FR-009`**: a pré-seleção efetiva do vendedor é satisfeita diretamente por T022, que chama `trocarVendedor({ codigo: vendedorCodigo, nome: null }, 'RASCUNHO')` (`specs/012-selecao-vendedor/data-model.md` §3, `research.md` D7) — 012 já reserva essa action para uso de 004/011, com `plan.md`/`data-model.md`/`tasks.md` completos. O acceptance scenario 5 da spec fica satisfeito por esta própria feature, não por uma feature futura consumindo um valor exposto (correção 2026-09-01, auditoria de lacunas — a nota anterior, que tratava 012 como "ainda sem `data-model.md`", ficou desatualizada assim que 012 foi planejada).

**Nota de escopo — dependências declaradas, não aplicadas por este plano**: `research.md` D5 (snapshot parcial — `specs/003-carrinho-produto-precificacao/data-model.md` §2/§3 precisará de um tipo discriminado para `SnapshotPrecoProduto` vs. um `SnapshotOrigemCongelada` parcial) e D6 (`OrigemCliente` — `specs/005-identificacao-cadastro-cliente/data-model.md` §1 precisará de um quinto valor `'RASCUNHO'`) são refinamentos a aplicar quando as features 003/005 forem revisitadas, não tarefas desta feature — mesmo padrão de "dependência declarada" já usado por `specs/004-finalizacao-suspensao-venda/data-model.md`.

---

## ⚠️ Estado da implementação (2026-09-04) — leia antes de usar esta lista

**A feature está implementada, mas não do jeito que os arquivos abaixo descrevem.** Esta lista foi escrita em 2026-08-31; a feature **006** (importação de DAV) só foi implementada em **2026-09-03** e, ao ser implementada, construiu a orquestração inteira que a 011 precisava — pré-condição, carregamento, mapeamento, hidratação dos cinco slices, atomicidade. Quando a 011 foi implementada, a decisão (AD-166, confirmada com o usuário) foi **generalizar o que existia**, não criar um segundo caminho para a mesma regra.

**Consequência prática:** os arquivos `mapearItemParaLinhaCongelada.ts`, `mapearFormaParaPagamentoAplicado.ts`, `mapearRascunhoCarregado.ts`, `retomarRascunho.ts` e `recuperacaoMapper.ts` **não existem e não devem ser criados** — o que eles fariam já é feito por `domain/importacaoVenda/mapearVendaExistente.ts` e `services/importacao/importarVendaExistente.ts`, parametrizados por `FonteDocumento`. As tarefas correspondentes estão marcadas `[X]` por **reuso**, com a nota "(reuso)".

**Onde a implementação mora de verdade:**

| Papel | Arquivo |
|---|---|
| Fronteira Zod da listagem + `CarregarNFCe` | `src/shared/schemas/recuperacaoNFCe.schema.ts` |
| Rede dos dois endpoints + `fonteRascunho` | `src/client/services/recuperacao/recuperacaoQueries.ts` |
| Orquestração (compartilhada com a 006) | `src/client/services/importacao/importarVendaExistente.ts` |
| Ligação com o Zustand (compartilhada) | `src/client/features/importacao/useImportacaoDocumento.ts` |
| Hook da feature | `src/client/features/recuperacao/useRecuperacaoNFCe.ts` |
| Janela de recuperação | `src/client/features/recuperacao/ModalRecuperacaoNFCe.tsx` |
| Seletor de tipo de importação | `src/client/features/importacao/ModalMenuImportacao.tsx` |

**Duas divergências de conteúdo em relação a este plano**, ambas registradas em AD-166:

1. **`data-model.md` J5/J6 estão superados.** Este plano mandava `resetarAuditoria()` + `VENDA_INICIADA` na retomada. Prevalece a decisão da 006 (AD-137): o histórico é preservado e emite-se `NFCE_RECUPERADA`. Motivo — a pré-condição já garante que a venda não foi efetivamente iniciada (sem cliente identificado, item, condição ou forma), então não há histórico a zerar; e `VENDA_INICIADA` afirmaria um início de sessão que aconteceu antes, em `abrirSessaoDeVenda`.
2. **A UI omite o que o contrato não sustenta.** `GetListaNFCes` só aceita `Txtbusca`/`Pagina`/`Tamanhopagina`, então os filtros "Status"/"Vendedor"/"Caixa"/"Série" do Pencil não são desenhados; a coluna "Série" dá lugar a **Emissão** e "Caixa" a **Operador** (campos que existem na linha). Mesmo critério de AD-024/AD-093/AD-095.

**T026 concluída (2026-09-04)** — os 6 cenários do `quickstart.md` viraram verificação executável, e os três critérios de sucesso estão cobertos:

| Cenário | Onde |
|---|---|
| 1. Listar e buscar | `ModalRecuperacaoNFCe.spec.tsx` (esqueleto, listagem, paginação, busca por cliente/vendedor, número da nota sem resultado) + E2E |
| 2. Retomar para o carrinho | `recuperacaoNFCe.spec.ts` § "quickstart Cenário 2" — 2 itens congelados a preço do documento, forma em dinheiro `APROVADO`, cliente/vendedor/identidade |
| 3. Reinserir item já presente | `ModalRecuperacaoNFCe.spec.tsx` (T016) — linha nova a preço de catálogo, congelada intacta |
| 4. Finalizar a venda retomada | `tests/e2e/recuperacao-nfce.spec.ts` — `NumeroNota` do rascunho no payload de `FaturarNFCe` |
| 5. Auditoria da retomada | `recuperacaoNFCe.spec.ts` § "quickstart Cenário 5" |
| 6. Sem lock entre operadores | `recuperacaoNFCe.spec.ts` § "quickstart Cenário 6" — duas retomadas simultâneas, nenhuma chamada de bloqueio |

- **SC-001** (nada é redigitado): itens, pagamento, cliente, vendedor e identidade chegam do documento — Cenário 2.
- **SC-002** (o preço não diverge, exceto após reinserção explícita): Cenário 2 (preços exatos) e Cenário 3 (a reinserção cria linha nova, sem tocar na congelada).
- **SC-003** (venda retomada segue as mesmas regras): o E2E quita pela UI de pagamento e finaliza pelo caminho normal da 004.

**Dois achados do T026, ambos registrados:**

1. **A fixture mandava `FormaMeioPagtoNFe: '01'`** — o código numérico da NFe num campo que o ERP preenche com **nomes** (AD-023). A forma era descartada em silêncio, com aviso no console, então o passo 4 do Cenário 2 nunca havia sido verificado de fato: os testes da 006 usam espião no lugar da action real, o que provava a chamada da porta, não a chegada do pagamento à venda. Corrigido em `tests/support/recuperacao.ts` (`formaDinheiroDoRascunho`), e o Cenário 2 passou a usar a action real do slice. O `erp-mock` do E2E já tinha sido corrigido antes, de outra forma: lá o DAV ficou **sem** forma, porque um DAV é documento pendente de cobrança — um rascunho de NFCe, ao contrário, volta já pago.
2. **J6 não é cumprido à letra:** a hidratação emite `CLIENTE_SELECIONADO` além de `NFCE_RECUPERADA`, e esse evento não carrega a origem — na trilha ele é indistinguível de uma escolha manual. Vem da 006, não é regressão da 011. Não foi suprimido (o cliente de fato mudou); registrado como item 45 de `PENDENCIES.md` e fixado por teste.

**T005, T006 e T016** foram escritas em `tests/integration/ModalRecuperacaoNFCe.spec.tsx` (10 casos): esqueleto do Boneyard durante o carregamento, listagem com os campos reais do contrato, paginação, teto de `Tamanhopagina`, busca por nome de cliente e de vendedor, busca por número da nota devolvendo vazio (limitação real, `research.md` D1), a seleção sendo solta ao trocar a busca, e — para T016 — a retomada deixando a linha congelada e a reinserção manual do mesmo SKU criando **linha nova a preço de catálogo**, sem tocar na congelada (invariante I3/AD-067 da 003). A rede é trocada no `fetch` global, não injetada por prop, para que a validação Zod de fronteira também seja exercitada.

**Verificação:** 784 testes de unidade/integração verdes, 125 E2E verdes, `tsc --noEmit` e ESLint limpos.

---

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência de tarefas incompletas)
- **[Story]**: A qual user story a tarefa pertence (US1, US2)
- Caminhos de arquivo exatos em cada descrição

## Path Conventions

Sexta extensão da árvore proposta pela feature 002 (ver `plan.md` § Structure Decision):

```text
src/client/domain/recuperacao/                # camada pura — mapearItemParaLinhaCongelada, mapearFormaParaPagamentoAplicado, mapearRascunhoCarregado
src/client/services/recuperacao/              # recuperacaoQueries.ts, recuperacaoMapper.ts
src/client/features/venda/retomarRascunho.ts  # orquestrador de efeito
src/client/features/venda/recuperacao/        # ModalRecuperacaoNFCe.tsx
src/shared/schemas/                           # recuperacaoNFCe.schema.ts (diretório já existe, criado pela feature 004)
tests/unit/domain/recuperacao/ | tests/integration/ | tests/e2e/
```

**⚠️ Consulta ao Pencil MCP obrigatória para tarefas de UI (CLAUDE.md § "Referência visual (design)")**: toda tarefa desta lista que cria ou altera saída visual (tela, componente, modal, layout, ícone, estado de loading/vazio) está marcada abaixo com "consultar o Pencil MCP antes de implementar" — a fonte de verdade do visual é sempre o Pencil MCP (`get_editor_state(include_schema:true)` → `batch_get`/`get_screenshot`/`get_variables`/`snapshot_layout` sobre o nó real da tela em `design/CentriumCheckout.pen`), nunca o código existente nem senso genérico de design. Tarefas afetadas: T009, T023.

`domain/recuperacao/` (não `domain/nfce/`) é nome pensado deliberadamente para reuso futuro pela feature 006/DAV (AD-057) — nenhum arquivo desta feature importa ou é importado por código de DAV; a integração real fica para o `/speckit-plan`/`/speckit-tasks` da feature 006.

---

## Phase 1: Setup

**Purpose**: Criar os diretórios específicos desta feature sobre a árvore já existente (001/002/003/004/005/008).

- [X] T001 Criar estrutura de diretórios desta feature: `src/client/domain/recuperacao/`, `src/client/services/recuperacao/`, `src/client/features/venda/recuperacao/`, `tests/unit/domain/recuperacao/` (`src/shared/schemas/`, `tests/integration/` e `tests/e2e/` já existem, criados pelas features 004/008)

**Checkpoint**: Diretórios prontos — depende de `src/client/` já existir (Fase 1 da 002) e dos slices `identidadeVenda`/`carrinho`/`pagamentos`/`cliente`/`auditoria` já existirem (004/003/008/005/001).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: A fronteira Zod da listagem e o módulo de parsing — porque ambas as user stories dependem de dados validados do ERP antes de qualquer UI (Constitution IV).

**⚠️ CRITICAL**: Nenhuma user story pode começar até esta fase terminar.

- [X] T002 [P] Implementar `src/shared/schemas/recuperacaoNFCe.schema.ts` (Zod): valida `GetListaNFCesOutput.CheckoutListaRascunhos` → `RascunhoListado[]` (`PaginaAtual`/`RegistrosPorPagina`/`TotalRegistros`/`TotalPaginas` + `Rascunho[]` com `NumeroNota`/`Cliente`/`Vendedor`/`Operador`/`Emissao` ISO 8601/`Total` convertido para `Centavos`) — `data-model.md` §1, `contracts/erp-recuperacao-api.md` §1
- [X] T003 Implementar `src/client/services/recuperacao/recuperacaoMapper.ts`: `parseGetListaNFCesOutput(json)` via T002 → `RascunhoListado[]`; `parseCarregarNFCeOutput(json)` reaproveitando o schema Zod do shape completo `CheckoutFaturarNFCe` já planejado pela feature 006 (`src/shared/schemas/dav.schema.ts`, valida `produtos[]`/`FormasDePagamento[]`/`clienteCodigo`/`vendedorCodigo`/`CondicaoPagamentoCodigo`/`NumeroNota` — **não** o schema de `FaturarNFCeOutput` da feature 004, `faturarNFCe.schema.ts`, que só valida `NotaFiscal.PDFImpressao`/`XMLImpressao`, a resposta menor de `POST FaturarNFCe`; ver AD-117) → `RascunhoCarregado`, descartando os campos marcados "ignorado" no contrato (`SuspenderOuFaturar`, `DescontoPercentual`, `ValorBruto`, `ValorTotal`, `Log`, `NotaFiscal`, `FormaFpgUtiCar`, `FormaEntrada`) — `data-model.md` §3, `contracts/erp-recuperacao-api.md` — depende de T002, e de `dav.schema.ts` já existir (feature 006)

**Checkpoint**: Fronteira Zod e mapeadores de parsing prontos — nenhuma user story ainda expõe UI.

---

## Phase 3: User Story 1 - Listar e selecionar rascunho para retomada (Priority: P1) 🎯 MVP

**Goal**: Operador abre o modal de recuperação, vê a lista paginada de rascunhos suspensos e filtra por nome de cliente ou vendedor.

**Independent Test**: Abrir a lista de rascunhos e confirmar que ela aparece, com busca por nome de cliente ou vendedor funcionando (quickstart Cenário 1).

### Tests for User Story 1

- [X] T004 [P] [US1] Unit test `tests/unit/domain/recuperacao/recuperacaoMapper.spec.ts` (parte `GetListaNFCes`): `Emissao` (ISO 8601) nunca reinterpretada, só formatada na exibição; `Total` convertido para `Centavos` na fronteira — `FR-001`, `data-model.md` §1 — depende de T002, T003
- [X] T005 [P] [US1] Integration test `tests/integration/ModalRecuperacaoNFCe.spec.tsx`: abrir modal, skeleton Boneyard exibido durante `useListaRascunhos`, lista de rascunhos renderizada e paginada — `FR-001`, quickstart Cenário 1 passos 1-2 — depende de T003
- [X] T006 [P] [US1] Integration test `tests/integration/ModalRecuperacaoNFCe.spec.tsx`: busca por nome de cliente parcial filtra a lista; busca por nome de vendedor parcial filtra a lista; busca por número de nota não retorna nenhum resultado (comportamento esperado, não bug, `research.md` D1) — `FR-002`/`FR-003`, quickstart Cenário 1 passos 3-5 — depende de T003
- [X] T007 [P] [US1] Integration test `tests/integration/ModalRecuperacaoNFCe.spec.tsx`: `Tamanhopagina` enviado ao servidor é sempre `min(solicitado, 50)`, nunca maior mesmo se um valor maior for solicitado (`research.md` D2) — depende de T003

### Implementation for User Story 1

- [X] T008 [US1] Implementar `src/client/services/recuperacao/recuperacaoQueries.ts` (`useListaRascunhos`): `GET /api/erp/GetListaNFCes` com `Tamanhopagina = min(tamanhoSolicitado, 50)` (`research.md` D2), `staleTime` curto (a listagem reflete rascunhos de outros operadores, não deve envelhecer no cache), resposta validada por `parseGetListaNFCesOutput` (T003) → `EstadoListaRascunhos` — `contracts/recuperacao-domain-api.md` §2 — depende de T003
- [X] T009 [US1] Implementar `src/client/features/venda/recuperacao/ModalRecuperacaoNFCe.tsx` (parte listagem): estado `EstadoListaRascunhos` (`data-model.md` §2) local ao componente, campo de busca com debounce (mesmo padrão de busca de cliente/produto/vendedor), chama `useListaRascunhos` (T008), Boneyard skeleton durante carregamento, paginação via `paginaAtual`/`totalPaginas` — frame Pencil "PDV Online Web - Modal Recuperação NFCe" — `FR-001`/`FR-002`/`FR-003`/`FR-004` — depende de T008 — **consultar o Pencil MCP antes de implementar** (`get_editor_state(include_schema: true)`, depois `batch_get`/`get_screenshot`/`get_variables`/`snapshot_layout` sobre o nó real da tela em `design/CentriumCheckout.pen`; nunca inferir o visual do código existente ou de senso genérico de design — CLAUDE.md § "Referência visual (design)")

**Checkpoint**: User Story 1 funcional e testável de forma independente — lista, busca e paginação prontos (seleção de linha ainda não dispara retomada, isso é US2).

---

## Phase 4: User Story 2 - Retomar rascunho para o carrinho (Priority: P1)

**Goal**: Ao confirmar a seleção de um rascunho, o carrinho, os pagamentos, o cliente, o vendedor e a identidade da venda são hidratados exatamente como estavam no rascunho, sem recálculo.

**Independent Test**: Retomar um rascunho com itens e uma forma de pagamento já registrados, confirmando que o carrinho reflete exatamente esses dados sem recálculo, e que a venda finalizada depois mantém a identidade original do rascunho (quickstart Cenário 2).

### Tests for User Story 2

- [X] T010 [P] [US2] Unit test `tests/unit/domain/recuperacao/mapearItemParaLinhaCongelada.spec.ts`: item com `precoUnitario` divergente do catálogo atual vira `LinhaCarrinho` com `idLinha` novo (`crypto.randomUUID()`), snapshot degenerado (só `codigoProduto`/`udm`/`precoBase`; `precosFaixa`/`limiaresFaixa`/`pesavelEditavel` ausentes, `research.md` D5), `precoCongelado=true`, `origem='RASCUNHO'`, `cancelada=false`, `precoUnitario` preservado sem passar por `resolvePrecoUnitario` — `data-model.md` §4, invariantes J1/J2 — depende de T018
- [X] T011 [P] [US2] Unit test `tests/unit/domain/recuperacao/mapearFormaParaPagamentoAplicado.spec.ts`: forma `Dinheiro` → `valorRecebido=valor` (nunca reconstrói troco, `research.md` D8); forma não-`Dinheiro` → `valorRecebido=null`; `status` sempre `'APROVADO'` (J4); `dadosTEF`/`pixGuid` ecoados opacos, sem interpretação — `data-model.md` §5 — depende de T019
- [X] T012 [P] [US2] Unit test `tests/unit/domain/recuperacao/mapearRascunhoCarregado.spec.ts`: orquestra os dois mapeadores acima sem efeito colateral (nenhum import de React/Zustand/`fetch`), devolve `linhas`/`pagamentos`/`condicaoPagamentoCodigo`/`clienteCodigo`/`vendedorCodigo`/`identidadeVenda` — `contracts/recuperacao-domain-api.md` — depende de T018, T019, T020
- [X] T013 [P] [US2] Integration test `tests/integration/retomarRascunho.spec.ts`: ordem exata de efeitos — `resetarAuditoria()` → `setIdentidadeVenda()` → `setLinhasCarrinho()` → `setPagamentos()`+`setCondicao()` → `setCliente(await GetCliente)` (`data-model.md` §6); confirma que o slice `auditoria` é zerado antes de `VENDA_INICIADA` ser emitido (J5) e que `VENDA_INICIADA` é o único evento emitido pela hidratação em si (J6) — depende de T022
- [X] T014 [P] [US2] Integration test `tests/integration/retomarRascunho.spec.ts`: nenhuma chamada a `resolvePrecoUnitario`/`repricarSku` ocorre durante a hidratação (J2); `identidadeVenda.numeroNota` é sempre o `NumeroNota` do rascunho, nunca `0`, inclusive no payload de `FaturarNFCe` enviado numa finalização subsequente (J3, quickstart Cenário 4) — depende de T022
- [X] T015 [P] [US2] Integration test `tests/integration/retomarRascunho.spec.ts`: nenhuma chamada de rede de lock/unlock é feita ao retomar, simulando duas retomadas concorrentes do mesmo `NumeroNota` (J7, quickstart Cenário 6, AD-052) — depende de T022
- [X] T016 [P] [US2] Integration test `tests/integration/ModalRecuperacaoNFCe.spec.tsx`: a partir do carrinho retomado, reinserir manualmente um SKU já presente numa linha congelada dispara o recálculo normal de preço para esse item (mecanismo de `carrinho-produto-precificacao`, feature 003, `research.md` D13) — esta feature só garante que a linha ficou corretamente congelada até este ponto — `FR-008`, quickstart Cenário 3 — depende de T023
- [X] T017 [P] [US2] Integration test `tests/integration/ModalRecuperacaoNFCe.spec.tsx`: `CarregarNFCe` retorna `404` (rascunho já faturado por outro operador ou expirado) → mensagem de erro de negócio exibida ao operador, sem retry automático, carrinho não é populado — `contracts/erp-recuperacao-api.md` — depende de T023

### Implementation for User Story 2

- [X] T018 [P] [US2] Implementar `src/client/domain/recuperacao/mapearItemParaLinhaCongelada.ts` — `data-model.md` §4 (teste T010 deve falhar antes desta implementação)
- [X] T019 [P] [US2] Implementar `src/client/domain/recuperacao/mapearFormaParaPagamentoAplicado.ts` — `data-model.md` §5, `research.md` D8 (teste T011 deve falhar antes desta implementação)
- [X] T020 [US2] Implementar `src/client/domain/recuperacao/mapearRascunhoCarregado.ts` (orquestra T018, T019, ainda sem efeito colateral) — `contracts/recuperacao-domain-api.md` — depende de T018, T019 (teste T012 deve falhar antes desta implementação)
- [X] T021 [US2] Implementar `useCarregarRascunho` em `src/client/services/recuperacao/recuperacaoQueries.ts`: `GET /api/erp/CarregarNFCe` sob demanda (mutation, não query — ação única, não recacheada), `Serienota` sempre `SessaoUsuario.CadSerieNFCe` (`research.md` D4), resposta validada via `parseCarregarNFCeOutput` (T003) → `RascunhoCarregado` — depende de T003
- [X] T022 [US2] Implementar `src/client/features/venda/retomarRascunho.ts`: efeito colateral único, síncrono do ponto de vista do operador, na ordem exata — `resetarAuditoria()` → `setIdentidadeVenda({ origem: 'RASCUNHO', numeroNota })` → `setLinhasCarrinho(linhas)` → `setPagamentos(pagamentos)`+`setCondicao(condicaoPagamentoCodigo)` → `setCliente(await GetCliente(clienteCodigo))` → `trocarVendedor({ codigo: vendedorCodigo, nome: null }, 'RASCUNHO')` (`specs/012-selecao-vendedor/data-model.md` §3, `research.md` D7) — `data-model.md` §6, `research.md` D6/D9/D10 — depende de T020, T021
- [X] T023 [US2] Wire a seleção de rascunho em `ModalRecuperacaoNFCe.tsx` (T009): ao confirmar, chama `useCarregarRascunho` (T021); em sucesso, chama `retomarRascunho` (T022) e fecha o modal; em `404`, exibe toast (Goey Toast) de erro de negócio sem retry automático — `FR-004`/`FR-005`/`FR-006`/`FR-007`/`FR-009` — depende de T009, T021, T022 — **consultar o Pencil MCP antes de implementar** (CLAUDE.md § "Referência visual (design)")

**Checkpoint**: User Stories 1 e 2 completas e testáveis de forma independente — retomada ponta a ponta funcional.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Gate de tipo obrigatório e validação ponta a ponta do fluxo dourado.

- [X] T024 Rodar `npx tsc --noEmit` e confirmar zero erros de tipo — gate obrigatório da Constitution (`Development Workflow`)
- [X] T025 E2E `tests/e2e/recuperacao-nfce.spec.ts` (fluxo dourado do `quickstart.md`, via Playwright, mock de rede não de função): abrir modal → buscar por nome de cliente → selecionar rascunho → confirmar carrinho populado com preço/pagamento/cliente/vendedor do rascunho → finalizar venda → confirmar `NumeroNota` no payload de rede
- [X] T026 Rodar os 6 cenários de `quickstart.md` (listar/buscar, retomar, reinserir item, finalizar venda retomada, auditoria da retomada, sem lock entre operadores) e confirmar `SC-001`/`SC-002`/`SC-003`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Depende de 002 (Fase 1) e dos slices já existentes de 001/003/004/005/008 — fora desta feature
- **Foundational (Phase 2)**: Depende do Setup e de `src/shared/schemas/dav.schema.ts` já existir (feature 006, AD-117) para T003 — BLOQUEIA as 2 user stories
- **User Stories (Phase 3-4)**: Ambas dependem do Foundational
  - US1 pode começar assim que Phase 2 terminar
  - US2 depende do Foundational e, para a UI de seleção (T023), de T009 (US1) — reaproveita o mesmo `ModalRecuperacaoNFCe`, mas os módulos de domínio/query de US2 (T018-T022) são independentes de US1
- **Polish (Phase 5)**: Depende de US1 e US2 completas

### User Story Dependencies

- **US1 (P1)**: Depende de Foundational (T002, T003) — sem dependência de US2
- **US2 (P1)**: Depende de Foundational (T003) e, só para o wiring final (T023), de T009 (US1) — os módulos de domínio puro e a query de carregamento (T018-T022) podem ser construídos em paralelo a US1

### Within Each User Story

- Testes antes da implementação correspondente, onde aplicável (TDD para os módulos de domínio puro)
- Domínio puro (mapeadores) antes do orquestrador (`retomarRascunho`)
- Orquestrador antes do wiring de UI
- Story completa antes do checkpoint

### Parallel Opportunities

- T002 (Foundational) não tem dependência — pode começar imediatamente após Setup
- T004-T007 (testes US1, sem dependência entre si) em paralelo
- T010-T012 (testes unitários dos mapeadores, US2) em paralelo entre si
- T013-T017 (testes de integração US2) em paralelo entre si
- T018, T019 (implementação dos dois mapeadores base, arquivos diferentes) em paralelo
- Os módulos de domínio/query de US2 (T010-T022) podem ser trabalhados em paralelo a toda a Phase 3 (US1), convergindo apenas em T023 (wiring de `ModalRecuperacaoNFCe.tsx`)

---

## Parallel Example: Foundational + início de US2

```bash
# Fronteira Zod (Foundational) e mapeadores de domínio de US2, sem dependência entre si:
Task: "Implementar recuperacaoNFCe.schema.ts em src/shared/schemas/recuperacaoNFCe.schema.ts"
Task: "Implementar mapearItemParaLinhaCongelada.ts em src/client/domain/recuperacao/mapearItemParaLinhaCongelada.ts"
Task: "Implementar mapearFormaParaPagamentoAplicado.ts em src/client/domain/recuperacao/mapearFormaParaPagamentoAplicado.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Completar Phase 1: Setup
2. Completar Phase 2: Foundational
3. Completar Phase 3: User Story 1
4. **PARAR e VALIDAR**: lista, busca e paginação de rascunhos funcionais isoladamente (sem retomada ainda)

### Incremental Delivery

1. Setup + Foundational → fronteira Zod e mapeadores de parsing prontos
2. US1 → validar isoladamente (listar, buscar, paginar) — MVP parcial (visualização, sem ação)
3. US2 → validar isoladamente (retomada completa: carrinho, pagamentos, cliente, vendedor, identidade) — fecha o fluxo funcional completo
4. Polish → gate de tipo, E2E, quickstart

### Parallel Team Strategy

Com mais de um desenvolvedor: completar Setup + Foundational juntos; depois um desenvolvedor segue com US1 (`ModalRecuperacaoNFCe.tsx`, listagem) enquanto outro constrói os módulos de domínio e a query de US2 (T010-T022, sem dependência de US1) — convergindo em T023 (wiring da seleção sobre o modal já existente).

---

## Notes

- [P] = arquivos diferentes, sem dependências
- [Story] mapeia cada tarefa à user story correspondente para rastreabilidade
- Verificar que os testes falham antes de implementar (TDD onde aplicável, especialmente nos 3 módulos de domínio puro)
- Commit após cada tarefa ou grupo lógico
- Parar em cada checkpoint para validar a story isoladamente
- T009 (US1) é reaproveitado sem duplicação por T023 (US2) — um único `ModalRecuperacaoNFCe.tsx`, nunca dois componentes de listagem/seleção
- `research.md` D5 e D6 permanecem como dependências declaradas sobre artefatos de outras features (003, 005), não tarefas desta feature — ver "Nota de escopo" no topo deste arquivo
