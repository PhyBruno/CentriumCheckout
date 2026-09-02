---

description: "Task list template for feature implementation"
---

# Tasks: Importação e Faturamento de DAV

**Input**: Design documents from `specs/006-importacao-dav/` (`plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/erp-dav-api.md`, `contracts/importacao-domain-api.md`, `quickstart.md`)

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Tests**: Incluídos — `plan.md` § Testing define 3 camadas explícitas (domínio puro, integração da orquestração, E2E) com arquivos-alvo nomeados.

**Organization**: Tarefas agrupadas pelas 2 user stories da spec (ambas P1) — US1 (listar/filtrar documentos, DAV-01) e US2 (importar documento completo para o carrinho, DAV-02/03/04).

**⚠️ Ordem de implementação e dependências cruzadas**: esta feature consome diretamente três features já implementadas (têm `tasks.md`) — **002** (scaffolding + proxy autenticado `/api/erp/*`), **003** (`carrinhoSlice.ts`, `LinhaCarrinho`, `podeMutarCarrinho()`, `fetchProduto`/`produtoQueries.ts`) e **005** (`clienteSlice.selecionarCliente`, `fetchClientePorCodigo`). **001** (auditoria) também é consumida diretamente, mas precisou ser estendida durante esta própria fase de tasks: o tipo de evento `DAV_IMPORTADO` não existia no catálogo fechado da 001 — foi acrescentado como tipo #20 (`specs/001-auditoria-acoes-operador/data-model.md`, `tasks.md` T020/T021, AD-114). Da mesma forma, `clienteSlice.selecionarCliente` (005) exigia um `ClienteCheckout` completo, que só era obtível via `GetCliente(CPFCNPJ=...)` — sem caminho de contrato para resolver por `clienteCodigo` (o único dado que o DAV traz). Isso foi resolvido alterando o procedure real do ERP na KB GeneXus (`PCheckout_GetCliente`, novo parâmetro opcional `CodCliente`) e acrescentando `fetchClientePorCodigo`/origem `'DAV'` à feature 005 (`tasks.md` T028/T029, AD-115) — **build completo dessa mudança de KB ainda não confirmado, ver item 37 de `.specs/project/PENDENCIES.md`**. As duas dependências que **não** estão implementadas ainda — **008** (`pagamentoSlice.importarFormasDePagamento`, contrato já definido em `specs/008-pagamento-geral/contracts/pagamento-domain-api.md` §2, só falta ser tasqueada) e **012** (`vendedorSlice.trocarVendedor`, já desenhada em `specs/012-selecao-vendedor/data-model.md` com a assinatura exata que esta feature precisa, só falta ser tasqueada) — entram por **injeção de dependência com stub**, mesmo padrão usado por `specs/004-finalizacao-suspensao-venda/tasks.md` T029 para suas próprias dependências futuras (014/008).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência de tarefas incompletas)
- **[Story]**: A qual user story a tarefa pertence (US1, US2)
- Caminhos de arquivo exatos em cada descrição

## Path Conventions

Sexta feature a estender a árvore proposta pela feature 002 (ver `plan.md` § Structure Decision):

```text
src/client/domain/importacaoVenda/     # mapearVendaExistente.ts — camada pura
src/client/stores/slices/              # carrinhoSlice.ts (003, já existe) — extensão pontual
src/client/services/dav/               # davQueries.ts
src/client/features/dav/               # ModalImportacaoDav.tsx
src/shared/schemas/                    # dav.schema.ts
tests/unit/domain/importacaoVenda/ | tests/integration/ | tests/e2e/
```

**⚠️ Consulta ao Pencil MCP obrigatória para tarefas de UI (CLAUDE.md § "Referência visual (design)")**: toda tarefa desta lista que cria ou altera saída visual (tela, componente, modal, layout, ícone, estado de loading/vazio) está marcada abaixo com "consultar o Pencil MCP antes de implementar" — a fonte de verdade do visual é sempre o Pencil MCP (`get_editor_state(include_schema:true)` → `batch_get`/`get_screenshot`/`get_variables`/`snapshot_layout` sobre o nó real da tela em `design/CentriumCheckout.pen`), nunca o código existente nem senso genérico de design. Tarefas afetadas: T008, T018.

---

## Phase 1: Setup

**Purpose**: Criar os diretórios específicos desta feature sobre a árvore já existente (002/001/003/005).

- [ ] T001 Criar estrutura de diretórios desta feature: `src/client/domain/importacaoVenda/`, `src/client/services/dav/`, `src/client/features/dav/` (`src/client/stores/slices/` e `src/shared/schemas/` já existem, criados pelas features 001/002)

**Checkpoint**: Diretórios prontos — depende de `src/client/` já existir (Fase 1 da 002).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema de fronteira, domínio puro de mapeamento e as duas extensões do `CarrinhoSlice` — usados por ambas as user stories.

**⚠️ CRITICAL**: Nenhuma user story pode começar até esta fase terminar.

- [ ] T002 [P] Implementar `src/shared/schemas/dav.schema.ts` (Zod): `CheckoutListaDAVsResponse` (`DAV[]` com `NumeroDAV/Titulo/DataEmissao/ClienteCodigo/ClienteNome/VendedorCodigo/ValorTotal`, **sem** `VendedorNome`/`Status`/`Ativo`) e `CheckoutFaturarNFCe` (mesmo shape de `CarregarNFCe`/`FaturarNFCe`, AD-057; **sem** `DavNum`, AD-107; `NumeroNota` obrigatório — ausência é erro de fronteira, D8) — exatamente os campos de `contracts/erp-dav-api.md`; reaproveitado sem alteração pela futura feature 011
- [ ] T003 Implementar `src/client/domain/importacaoVenda/mapearVendaExistente.ts`: tipos `VendaImportada`/`LinhaImportada`/`FormaPagamentoImportada` (`data-model.md` §2-4) + função pura `mapearVendaExistente(resposta: CheckoutFaturarNFCe, origemLista: {clienteNome: string} | null): VendaImportada` (`contracts/importacao-domain-api.md` §1) e o helper `paraLinhaCarrinho` (`data-model.md` §3, `origem: 'DAV'`, `precoCongelado: true`) — copia `NumeroNota` intacto (D8/AD-107), `clienteNome` vem de `origemLista` (fallback string vazia), `vendedorNome` sempre `null` (AD-095), nunca lança para dado ausente exceto `clienteCodigo`/`vendedorCodigo`/`NumeroNota` — sem rede, sem Zustand, sem React — depende de T002
- [ ] T004 Estender `CarrinhoSlice` (`src/client/stores/slices/carrinhoSlice.ts`, já existente da feature 003) com `importarLinhasCongeladas(linhas: readonly LinhaImportada[]): void` (`contracts/importacao-domain-api.md` §2): pré-condição `podeMutarCarrinho()`, converte cada linha via `paraLinhaCarrinho` (T003) e adiciona ao array `linhas`, **nunca** chama `repricarSku` — sem evento de auditoria próprio, as actions existentes (`inserirItem`/`editarItem`/`cancelarItem`) permanecem intocadas (Open/Closed) — depende de T003
- [ ] T005 Estender `CarrinhoSlice` com `editarSnapshotDescricao(codigoProduto: string, descricao: string): void` (`contracts/importacao-domain-api.md` §3, passo 8): mutação direta de `snapshot.descricao` de todas as linhas daquele SKU, **não** passa por `editarItem`/`repricarSku` (não altera preço/quantidade) — mesmo arquivo de T004 (sequencial, não paralelo) — depende de T004
- [ ] T006 [P] Unit test `tests/unit/domain/importacaoVenda/mapearVendaExistente.spec.ts`: `CheckoutFaturarNFCe` sintético → `LinhaCarrinho[]` congeladas (`origem:'DAV'`, `precoCongelado:true`) + `NumeroNota` preservado sem `DavNum` (D8/AD-107) + `vendedorNome === null` (AD-095) + `clienteNome` de `origemLista`; casos de borda: documento sem `FormasDePagamento` (array vazio, nunca lança), `clienteCodigo`/`NumeroNota` ausentes do schema já validado lançam erro de contrato — depende de T003

**Checkpoint**: Schema, domínio puro e as duas extensões do `CarrinhoSlice` prontos — nenhuma user story ainda expõe UI ou orquestração de rede.

---

## Phase 3: User Story 1 - Listar e selecionar documento para importação (Priority: P1) 🎯 MVP

**Goal**: Operador abre a janela de importação, vê a lista de DAVs prontos para faturamento, busca por termo livre e filtra por período de emissão.

**Independent Test**: Abrir a janela de importação e confirmar que a lista carrega, com busca e filtro de data funcionando (`quickstart.md` Cenário 1).

### Implementation for User Story 1

- [ ] T007 [P] [US1] Implementar `useListaDavs(filtros: {txtBusca?, dataInicial?, dataFinal?, pagina})` em `src/client/services/dav/davQueries.ts`: `GET /api/erp/ListaDAVs`, valida via T002; declarar o tipo `DavListado` (`data-model.md` §1: `numeroDav/titulo/dataEmissao/clienteCodigo/clienteNome/vendedorCodigo/valorTotal`, sem `Senha`) neste mesmo arquivo, mapeando cada item de `CheckoutListaDAVsResponse.DAV[]`; `Tamanhopagina` **limitado explicitamente no request** (bug de paginação do servidor anula o cap de 50 quando o parâmetro vem preenchido, AD-024) — depende de T002
- [ ] T008 [US1] Implementar `src/client/features/dav/ModalImportacaoDav.tsx` (DAV-01): tabela paginada com skeleton Boneyard (`useListaDavs`, T007), campo de busca livre e filtro de período de data de emissão; desktop-only (AD-046, sem equivalente mobile); **sem** ação de reimpressão por linha (FR-009, AD-035, removida na fase de UI) — depende de T007 — **consultar o Pencil MCP antes de implementar** (`get_editor_state(include_schema: true)`, depois `batch_get`/`get_screenshot`/`get_variables`/`snapshot_layout` sobre o nó real da tela em `design/CentriumCheckout.pen`; nunca inferir o visual do código existente ou de senso genérico de design — CLAUDE.md § "Referência visual (design)")

### Tests for User Story 1

- [ ] T009 [P] [US1] Integration test `tests/integration/importacaoDav.spec.ts`: `useListaDavs` chamado com `Txtbusca`/`Datainicial`/`Datafinal` refletindo exatamente os filtros aplicados; `Tamanhopagina` sempre limitado no request (AD-024) — depende de T007
- [ ] T010 [US1] E2E `tests/e2e/importacao-dav.spec.ts` (quickstart, Cenário 1): abrir janela → lista carrega paginada sem falha de rede; busca livre filtra para o(s) documento(s) correspondente(s); ajustar período para excluir o DAV de teste → não aparece; ajustar de volta → volta a aparecer — depende de T008

**Checkpoint**: User Story 1 completa e testável de forma independente — `FR-001` a `FR-004`, `FR-009`.

---

## Phase 4: User Story 2 - Importar documento completo para o carrinho (Priority: P1)

**Goal**: Ao confirmar a importação de um DAV selecionado, o carrinho é preenchido com itens/formas de pagamento já registrados, preço congelado, cliente e vendedor sobrescritos, e a venda segue o fluxo normal daí em diante.

**Independent Test**: Importar um documento com itens e forma de pagamento já registrados e confirmar que o carrinho reflete exatamente esses dados antes de qualquer edição manual (`quickstart.md` Cenário 2).

### Implementation for User Story 2

- [ ] T011 [US2] Implementar `fetchDav(numeroDav: string)` em `davQueries.ts` (T007): `GET /api/erp/GetDav`, valida via T002 (mesmo schema `CheckoutFaturarNFCe`) — depende de T002
- [ ] T012 [US2] Implementar `importarVendaExistente(numeroDav: string, origemLista: {clienteNome: string}): Promise<void>` em `davQueries.ts` (`contracts/importacao-domain-api.md` §3): `fetchDav` (T011) → `mapearVendaExistente(resposta, origemLista)` (T003) → `carrinhoSlice.importarLinhasCongeladas` (T004) — `origemLista` só carrega `clienteNome` (o único campo que `mapearVendaExistente` lê dele); `clienteCodigo` **não** entra em `origemLista` — vem sempre de `resposta.clienteCodigo` dentro de `mapearVendaExistente` — depende de T003, T004, T011
- [ ] T013 [US2] Wire a sobrescrita de cliente em `importarVendaExistente` (T012): `fetchClientePorCodigo(vendaImportada.clienteCodigo)` (feature 005, `tasks.md` T028, AD-115) → `clienteSlice.selecionarCliente(clienteCompleto, 'DAV')` (feature 005, `tasks.md` T014/T029, AD-115) — sobrescreve incondicionalmente, mesmo com cliente default já selecionado (FR-007); consome diretamente `src/client/services/cliente/clienteQueries.ts`/`src/client/stores/slices/clienteSlice.ts` (005, já implementada), sem stub — depende de T012
- [ ] T014 [US2] Wire dependências injetadas com stub em `importarVendaExistente` (T012): `vendedorSlice.trocarVendedor({codigo: vendaImportada.vendedorCodigo, nome: null})` — stub `() => {}` até a feature 012 fornecer a implementação real (assinatura já desenhada em `specs/012-selecao-vendedor/data-model.md`, sem gap a resolver) — e `pagamentoSlice.importarFormasDePagamento(vendaImportada.formasDePagamento)` — stub `() => {}` até a feature 008 fornecer a implementação real (contrato já definido em `specs/008-pagamento-geral/contracts/pagamento-domain-api.md` §2, só falta ser tasqueada, mesmo padrão de extensão usado nesta própria fase para `DAV_IMPORTADO`/`CodCliente`) — dependência por injeção, não por import (mesmo padrão de `specs/004-.../tasks.md` T029); não bloqueia esta feature — depende de T012
- [ ] T015 [US2] Wire `auditoriaSlice.registrarEventoAuditoria` em `importarVendaExistente` (T012): dispara `DAV_IMPORTADO` (factory de `specs/001-.../eventos.ts`, T020, AD-114) com `{numeroDav, numeroNota: vendaImportada.numeroNota, quantidadeLinhas, quantidadeFormasDePagamento}` — depende de T012
- [ ] T016 [US2] Wire lote best-effort de `GetProduto` em `importarVendaExistente` (T012): `Promise.allSettled`, uma chamada por `codigoProduto` distinto via `fetchProduto` (feature 003, já implementada, `src/client/services/produto/produtoQueries.ts`) — **nunca** para `PrecoVenda`, só `Descricao`/`UDM`; sucesso → `editarSnapshotDescricao` (T005); falha isolada não bloqueia as demais linhas nem a importação (AD-096) — depende de T005, T012
- [ ] T017 [US2] Wire tratamento de erro de importação (D7, AD-052, `FR-010`): falha de `fetchDav` (T011) ou de `importarVendaExistente` (T012) exibe Goey Toast e mantém a janela de importação aberta, **sem** popular o carrinho com dado parcial — `FR-010` (sem mecanismo de bloqueio no Checkout) é satisfeito por omissão: nenhum lock otimista/pessimista é implementado, o Checkout só reage ao erro que o ERP devolver — depende de T012
- [ ] T018 [US2] Wire seleção/confirmação em `ModalImportacaoDav.tsx` (T008): selecionar um DAV captura `clienteNome` da própria linha da lista, antes de `GetDav` responder (D4, `research.md`) — `clienteCodigo` não precisa ser capturado aqui, resolve dentro de `importarVendaExistente` a partir da resposta de `GetDav`; botão de confirmar importação chama `importarVendaExistente(numeroDav, {clienteNome})` (T012-T017); sucesso fecha o modal, erro mantém aberto com toast (T017) — depende de T008, T012, T017 — **consultar o Pencil MCP antes de implementar** (CLAUDE.md § "Referência visual (design)")

### Tests for User Story 2

- [ ] T019 [P] [US2] Integration test `tests/integration/importacaoDav.spec.ts`: `importarVendaExistente` sobrescreve cliente e vendedor mesmo com um cliente/vendedor default já selecionado antes da importação (FR-007) — depende de T013, T014
- [ ] T020 [P] [US2] Integration test `tests/integration/importacaoDav.spec.ts`: nenhum evento de reprecificação (`repricarSku`) nem `PRODUTO_INSERIDO` é emitido pelas linhas importadas via `importarLinhasCongeladas` (`data-model.md` §6) — depende de T004
- [ ] T021 [P] [US2] Integration test `tests/integration/importacaoDav.spec.ts`: `DAV_IMPORTADO` é emitido exatamente uma vez, com `quantidadeLinhas`/`quantidadeFormasDePagamento` corretos — depende de T015
- [ ] T022 [P] [US2] Integration test `tests/integration/importacaoDav.spec.ts`: falha isolada de uma chamada de `GetProduto` (descrição) não bloqueia a importação nem as demais linhas — linha afetada mantém `codigoProduto` como fallback de descrição (AD-096) — depende de T016
- [ ] T023 [US2] E2E `tests/e2e/importacao-dav.spec.ts` (quickstart, Cenários 2-5, mesmo arquivo de T010): itens/preço/cliente/vendedor do carrinho refletem exatamente o DAV (SC-001/SC-002; a parte de **pagamento** do Cenário 2 passo 6 fica limitada a confirmar que `pagamentoSlice.importarFormasDePagamento` foi chamado com os dados corretos via stub — a tela real de pagamento só existe quando a feature 008 for implementada, ver Notes); inserir produto novo depois da importação segue precificação normal enquanto as linhas importadas permanecem congeladas, `FaturarNFCe` chamado uma única vez com `NumeroNota` idêntico ao de `GetDav` e **sem** nenhum campo de DAV (Cenário 3, FR-008); fallback de descrição/vendedor por código (Cenário 4, AD-095/AD-096); tentar importar DAV já faturado exibe toast e não popula carrinho (Cenário 5, D7) — depende de T018, T022

**Checkpoint**: User Stories 1 e 2 funcionam de forma independente e integrada — feature completa (`FR-001` a `FR-010`).

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Gates finais e verificações manuais que o E2E não cobre.

- [ ] T024 Rodar `npx tsc --noEmit` e confirmar zero erros de tipo — gate obrigatório da Constitution (`Development Workflow`)
- [ ] T025 Rodar os 5 cenários de `quickstart.md` e confirmar: `NumeroNota` é o único elo com o DAV reenviado a `FaturarNFCe` (D8/AD-107, nenhum campo de DAV no payload); fallback de vendedor por código e de descrição por `GetProduto` nunca bloqueiam a importação (AD-095/AD-096); ambiente mobile não oferece a janela de importação (AD-046); registrar como pendência de integração ponta a ponta os stubs de `vendedorSlice.trocarVendedor`/`pagamentoSlice.importarFormasDePagamento` (T014) até as features 012/008 fornecerem as implementações reais — não bloqueia o fechamento desta feature

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Depende de 002 (Fase 1) — fora desta feature
- **Foundational (Phase 2)**: Depende do Setup — BLOQUEIA as duas user stories
- **User Stories (Phase 3-4)**: Ambas dependem do Foundational
  - US1 pode começar assim que a Fase 2 terminar — completamente independente de US2 no código (só compartilha `ModalImportacaoDav.tsx` como superfície de UI)
  - US2 depende de T008 (US1, para o botão de confirmação em `ModalImportacaoDav.tsx`) além do Foundational — não é 100% independente de US1 no código, mas testável isoladamente via chamada direta a `importarVendaExistente`
- **Polish (Phase 5)**: Depende das 2 user stories completas

### User Story Dependencies

- **US1 (P1)**: Depende de Foundational (T002); MVP standalone — cobre listar/buscar/filtrar
- **US2 (P1)**: Depende de Foundational (T003, T004, T005) **e** de T008 (US1) para o ponto de entrada da confirmação — implementar depois de US1 ou em paralelo, com T008 como ponto de sincronização

### Within Each User Story

- Domínio puro e extensões de slice antes da camada de serviço; serviço antes da UI
- `carrinhoSlice.ts` é editado sequencialmente entre T004 → T005 (mesmo arquivo)
- `davQueries.ts` é editado sequencialmente entre T007 → T011 → T012 → T013 → T014 → T015 → T016 → T017 (mesmo arquivo, orquestração incremental)
- Testes de integração (T019-T022) podem ser escritos em paralelo entre si, mas cada um depende da tarefa de implementação específica que cobre

### Parallel Opportunities

- T002 (Foundational) não tem dependência — pode começar imediatamente
- T006 (teste unitário) em paralelo com T004/T005 (arquivos diferentes)
- T007, T009 (US1) em paralelo entre si (arquivos/aspectos diferentes)
- T019, T020, T021, T022 (testes US2) em paralelo entre si

---

## Parallel Example: Foundational

```bash
# T002 (schema) não depende de nada; T006 (teste) pode ser escrito assim que T003 existir:
Task: "Implementar dav.schema.ts em src/shared/schemas/dav.schema.ts"
Task: "Unit test mapearVendaExistente.spec.ts em tests/unit/domain/importacaoVenda/mapearVendaExistente.spec.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Completar Phase 1: Setup
2. Completar Phase 2: Foundational (bloqueia tudo)
3. Completar Phase 3: User Story 1
4. **PARAR e VALIDAR**: listagem, busca e filtro de período funcionando isoladamente
5. Nesse ponto o operador já vê os DAVs disponíveis, mas ainda não consegue importar — US2 fecha o fluxo

### Incremental Delivery

1. Setup + Foundational → base pronta (schema, domínio puro, extensões do carrinho)
2. US1 → validar isoladamente (listagem/busca/filtro)
3. US2 → validar isoladamente + em conjunto com US1 (importação completa reaproveitando o ponto de entrada de T008) — feature completa
4. Polish → gates finais e verificações manuais

### Parallel Team Strategy

Com mais de um desenvolvedor: completar Setup + Foundational juntos; depois um desenvolvedor segue com US1 (listagem/busca/filtro), outro prepara a orquestração de importação (T011-T017) em paralelo, sincronizando em T008 (ponto de entrada da UI) antes de fechar T018.

---

## Notes

- `[P]` = arquivos diferentes, sem dependências
- `[Story]` mapeia cada tarefa à user story correspondente para rastreabilidade
- `mapearVendaExistente.ts`/`paraLinhaCarrinho` (T003) são reaproveitados **sem alteração** pela futura feature 011 (recuperação de rascunho de NFCe) — só troca `fetchDav` por `fetchCarregarNFCe`
- Esta fase de tasks encontrou e resolveu dois gaps reais de contrato entre features já implementadas: o catálogo de eventos de auditoria da feature 001 não previa `DAV_IMPORTADO` (AD-114), e a única action pública de troca de cliente da feature 005 exigia um dado (`ClienteCheckout` completo via `GetCliente`) que o contrato do ERP não permitia obter a partir só do código do cliente (AD-115, mudança real no procedure GeneXus `PCheckout_GetCliente`) — ambos documentados em `.specs/project/STATE.md`
- `vendedorSlice.trocarVendedor`/`pagamentoSlice.importarFormasDePagamento` (T014) chegam por injeção de dependência das features 012 e 008 respectivamente — nenhuma delas precisa estar implementada para esta feature ser completada e testada com stubs (contratos de ambas já definidos, só falta tasquear). **Consequência**: a verificação ponta a ponta de "forma de pagamento do DAV aparece já registrada, sem nova cobrança" (`FR-005`, `quickstart.md` Cenário 2 passo 6) só pode ser validada de fato depois que a feature 008 implementar seu próprio call site — T023 cobre só a chamada ao stub, não a tela real
- Build completo da mudança de KB GeneXus (AD-115) ainda não confirmado — item 37 de `.specs/project/PENDENCIES.md`; não bloqueia a geração desta lista de tarefas, mas deve ser verificado antes de considerar T013 pronta para uso em produção
