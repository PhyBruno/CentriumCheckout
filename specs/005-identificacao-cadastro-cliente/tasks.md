---

description: "Task list template for feature implementation"
---

# Tasks: Identificação e Cadastro de Cliente

**Input**: Design documents from `specs/005-identificacao-cadastro-cliente/` (`plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/erp-cliente-api.md`, `contracts/cliente-domain-api.md`, `quickstart.md`)

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Tests**: Incluídos — `plan.md` § Testing e `quickstart.md` definem 3 camadas explícitas (domínio puro, integração do slice, E2E) com arquivos-alvo nomeados.

**Organization**: Tarefas agrupadas pelas 2 user stories da spec (ambas P1) — US1 (localizar cliente por documento ou busca livre) e US2 (cadastro simplificado quando o cliente não é encontrado).

**⚠️ Ordem de implementação e dependências cruzadas**: esta feature depende de **002** (scaffolding + proxy autenticado `/api/erp/*` + bootstrap com `SessaoUsuario` em Dexie) e **001** (`vendaStore.ts`, slice `auditoria`, `registrarEventoAuditoria`, mesmo call site de `resetarAuditoria` que passa a chamar `inicializarClientePadrao`). A integração com **003** (`carrinhoSlice`, `fetchProduto`, `podeMutarCarrinho()`, `domain/precificacao/dinheiro.ts`) é consumida **diretamente** — não por stub/injeção — porque a feature 003 já está implementada (`specs/003-carrinho-produto-precificacao/tasks.md`); `clienteSlice.ts` nunca importa `carrinhoSlice.ts` como módulo, só lê o estado já combinado do `vendaStore` e chama o serviço de produto já público (`contracts/cliente-domain-api.md`). Esta feature **não** introduz nenhuma dependência por injeção pendente de feature futura.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência de tarefas incompletas)
- **[Story]**: A qual user story a tarefa pertence (US1, US2)
- Caminhos de arquivo exatos em cada descrição

## Path Conventions

Extensão da árvore já proposta pela feature 002 (ver `plan.md` § Structure Decision — quinta feature a estendê-la):

```text
src/client/domain/cliente/           # documento.ts — camada pura
src/client/stores/slices/            # clienteSlice.ts, combinado em vendaStore.ts (feature 001)
src/client/services/cliente/         # clienteQueries.ts, clienteMapper.ts
src/client/features/cliente/         # ModalBuscaCliente.tsx, FormCadastroSimplificado.tsx, CampoClienteVenda.tsx
src/shared/schemas/                  # cliente.schema.ts
tests/unit/domain/cliente/ | tests/unit/services/cliente/ | tests/integration/ | tests/e2e/
```

---

## Phase 1: Setup

**Purpose**: Criar os diretórios específicos desta feature sobre a árvore já existente (002/001/003).

- [ ] T001 Criar estrutura de diretórios desta feature: `src/client/domain/cliente/`, `src/client/services/cliente/`, `src/client/features/cliente/` (`src/client/stores/slices/` e `src/shared/schemas/` já existem, criados pelas features 001/002)

**Checkpoint**: Diretórios prontos — depende de `src/client/` já existir (Fase 1 da 002) e `src/client/stores/vendaStore.ts` já existir (Foundational da 001).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema de fronteira, classificação/máscara de documento, mapeamento cliente→snapshot e o núcleo do slice (estado + pré-seleção do default) — usados por ambas as user stories.

**⚠️ CRITICAL**: Nenhuma user story pode começar até esta fase terminar.

- [ ] T002 [P] Implementar `src/shared/schemas/cliente.schema.ts` (Zod): `ClienteCheckout` (resposta de `GetCliente`/corpo de `PostCliente`) e `SDTCheckoutListaClientes` (resposta de `GetListaClientes`) — exatamente os campos de `contracts/erp-cliente-api.md`, sem inventar `Ativo`/`Status` (AD-093)
- [ ] T003 [P] Implementar `src/client/domain/cliente/documento.ts`: `classificarDocumento(texto): 'CPF'|'CNPJ'|'INVALIDO'` (11/14 dígitos após remover pontuação), `validarFormatoCPF(texto): boolean`, `validarFormatoCEP(texto): boolean` — sem checksum, só contagem de dígitos (`data-model.md` §5, `research.md` D6)
- [ ] T004 [P] Implementar `src/client/services/cliente/clienteMapper.ts`: `mapClienteCheckoutParaVenda(cliente: ClienteCheckout, origem: 'BUSCA_DOCUMENTO'|'BUSCA_LIVRE'|'CADASTRO_SIMPLIFICADO'): ClienteVenda` e `mapClienteDefaultParaVenda(sessaoUsuario: SessaoUsuario): ClienteVenda | null` — o segundo usa `ListaPrecoDefault`/`descontoConvenio = 0`/`documento = null` para `origem = 'DEFAULT'` (AD-108), retorna `null` quando `ClienteDefaultCodigo` é vazio (`data-model.md` §1, `research.md` D3/D10)
- [ ] T005 Implementar `src/client/services/cliente/clienteQueries.ts`: `fetchClientePorDocumento(cpfCnpj: string)` — `GET /api/erp/GetCliente`, valida a resposta via T002 (Constitution IV) — depende de T002
- [ ] T006 Implementar `src/client/stores/slices/clienteSlice.ts`: estado `ClienteState { clienteAtual: ClienteVenda | null; houveEscolhaExplicita: boolean }` (`data-model.md` §2) + `inicializarClientePadrao(sessaoUsuario)` via T004, **sem** chamada de rede — chamado uma única vez no mesmo call site de `resetarAuditoria` (feature 001); combinado em `vendaStore.ts` — depende de T004
- [ ] T007 [P] Unit test `tests/unit/domain/cliente/documento.spec.ts`: 11 dígitos → `CPF`; 14 dígitos → `CNPJ`; outro comprimento → `INVALIDO`; texto com pontuação (`123.456.789-00`) classificado corretamente; `validarFormatoCEP` aceita `12345-678` e `12345678`, rejeita menos/mais dígitos — `CLI-04`, `FR-010`
- [ ] T008 [P] Unit test `tests/unit/services/cliente/clienteMapper.spec.ts`: `ClienteCheckout` → `ClienteVenda` preserva `listaPreco`/`descontoConvenio`/`codigoConvenio` reais; `SessaoUsuario` → `ClienteVenda` do cliente default resulta em `listaPreco = ListaPrecoDefault`, `descontoConvenio = 0`, `documento = null`, `origem = 'DEFAULT'` (AD-108); `ClienteDefaultCodigo` vazio → `null`
- [ ] T009 [P] Integration test `tests/integration/clienteSlice.spec.ts`: `inicializarClientePadrao({ ClienteDefaultCodigo: 42, ClienteDefaultNome: 'Fulano', ListaPrecoDefault: 3 })` produz o snapshot exato do quickstart, **nenhum** evento de auditoria, **nenhuma** chamada a `GetCliente`; `ClienteDefaultCodigo: null` → `clienteAtual === null` — `FR-004`, `FR-005`, `CLI-06`, AD-032, AD-108

**Checkpoint**: Schema, domínio de documento, mapper e núcleo do slice prontos — nenhuma user story ainda expõe UI ou ações de seleção/cadastro.

---

## Phase 3: User Story 1 - Localizar cliente por documento ou busca livre (Priority: P1) 🎯 MVP

**Goal**: Operador busca um cliente por documento ou por termo livre, associa o candidato à venda, e a troca de cliente com carrinho populado atualiza preços dependentes do cliente, exceto quando já há pagamento aprovado.

**Independent Test**: Buscar um cliente conhecido pelo documento e um desconhecido por nome parcial, confirmando que cada caminho retorna o resultado esperado; confirmar que uma venda recém-iniciada já começa com o cliente default associado sem interação do operador.

### Tests for User Story 1

- [ ] T010 [P] [US1] Integration test `tests/integration/clienteSlice.spec.ts`: `selecionarCliente(clienteX, 'BUSCA_DOCUMENTO')` numa venda nova dispara `CLIENTE_SELECIONADO` com `{ codigoCliente, nome }` de `clienteX` — `research.md` D9
- [ ] T011 [P] [US1] Integration test `tests/integration/clienteSlice.spec.ts`: selecionar `clienteX`, depois `selecionarCliente(clienteY, 'BUSCA_LIVRE')` dispara `CLIENTE_TROCADO` com `{ codigoClienteAnterior: X, codigoClienteNovo: Y }` — `research.md` D9
- [ ] T012 [P] [US1] Integration test `tests/integration/clienteSlice.spec.ts`: com `podeMutarCarrinho()` injetado retornando `false`, `selecionarCliente` é no-op — `clienteAtual` inalterado, nenhum evento disparado — `FR-008`, `CLI-07`, AD-043
- [ ] T013 [P] [US1] Integration test `tests/integration/clienteSlice.spec.ts`: carrinho com 2 linhas ativas de SKUs diferentes + 1 linha congelada; trocar cliente → `fetchProduto` chamado exatamente 2 vezes (uma por SKU ativo distinto), nunca para o SKU da linha congelada — `research.md` D7

### Implementation for User Story 1

- [ ] T014 [US1] Implementar `selecionarCliente(cliente, origem)` em `clienteSlice.ts` (T006): consulta `podeMutarCarrinho()` (já público, feature 003) antes de mutar (I4); decide `CLIENTE_SELECIONADO` vs. `CLIENTE_TROCADO` via `houveEscolhaExplicita` (D9); dispara `registrarEventoAuditoria` (feature 001) — depende de T006
- [ ] T015 [US1] Implementar disparo de re-fetch de preço dentro de `selecionarCliente` (T014): para cada `codigoProduto` distinto em linhas ativas não-congeladas do carrinho (lido do `vendaStore` combinado, sem importar `carrinhoSlice`), chama `fetchProduto(codigoProduto, { tipoPreco, codCliente, listaPreco })` (serviço já público da feature 003) e atualiza `snapshot`/`precoUnitario` das linhas correspondentes via `domain/precificacao/dinheiro.ts` — depende de T014
- [ ] T016 [P] [US1] Implementar `useBuscaClientes(txtBusca, pagina)` em `clienteQueries.ts` (T005): `GET /api/erp/GetListaClientes`, `enabled: txtBusca.length >= SessaoUsuario.QtdMinCharParaConsulta` (piso lido da sessão, nunca hardcodado), `staleTime: 0` — depende de T002
- [ ] T017 [US1] Implementar `src/client/features/cliente/ModalBuscaCliente.tsx`: campo de busca por documento (chama `fetchClientePorDocumento`, T005) e campo de busca livre (`useBuscaClientes`, T016, skeleton Boneyard enquanto carrega); selecionar um candidato da lista chama `fetchClientePorDocumento` pelo `CPF` do candidato antes de `selecionarCliente` (T014) — `research.md` D1 — depende de T005, T016, T014
- [ ] T018 [US1] Implementar aviso de CNPJ (Goey Toast) em `ModalBuscaCliente.tsx` (T017): `classificarDocumento(termo) === 'CNPJ'` (T003) numa busca sem resultado **não** oferece o CTA de cadastro simplificado, exibe aviso de que o cadastro simplificado só admite pessoa física; busca por CNPJ **com** resultado segue seleção normal — `FR-010`, `research.md` D4 — depende de T003, T017
- [ ] T019 [P] [US1] Implementar `src/client/features/cliente/CampoClienteVenda.tsx`: exibe `clienteAtual.nome`/`documento`, sem indicador de origem (`FR-006`, AD-053) — depende de T006
- [ ] T020 [US1] E2E `tests/e2e/identificacao-cliente.spec.ts` (quickstart, Camada 3, passos 1, 2, 3, 6, 7, 8): default pré-selecionado sem interação; busca por documento conhecido; busca por termo livre + seleção de candidato dispara `GetCliente`; troca de cliente com carrinho populado (`TipoPreco = 9`) atualiza preço; repetir a troca com pagamento aprovado → bloqueada sem chamada de rede; repetir os passos 2-3 no layout mobile; inserir um produto no carrinho **antes** de qualquer busca/seleção de cliente e confirmar que a inserção não é bloqueada nem exige cliente prévio — `FR-003`

**Checkpoint**: User Story 1 funcional e testável de forma independente — busca, seleção, troca com reprecificação e bloqueio pós-pagamento (`FR-001` a `FR-006`, `FR-008`, `FR-009`, `FR-010`, `FR-015` parcial).

---

## Phase 4: User Story 2 - Cadastro simplificado quando o cliente não é encontrado (Priority: P1)

**Goal**: Quando uma busca não retorna nenhum cliente (e o termo não é um CNPJ), o operador cadastra um cliente pessoa física com dados básicos sem sair do Checkout, e ele fica imediatamente associado à venda.

**Independent Test**: Buscar um documento inexistente, preencher o formulário simplificado e confirmar que o cliente passa a existir e fica associado à venda.

### Tests for User Story 2

- [ ] T021 [P] [US2] Integration test `tests/integration/clienteSlice.spec.ts`: `cadastrarESelecionarCliente(dados)` com mock de `postCliente` retornando sucesso → evento `CLIENTE_CRIADO` (nunca `TROCADO`), `clienteAtual.origem === 'CADASTRO_SIMPLIFICADO'` — `CLI-03`, AD-061; **e** com mock de `postCliente` rejeitando (erro de rede/validação do ERP) → `clienteAtual` inalterado, nenhum evento disparado, erro propagado para a UI tratar (T024) sem deixar o slice em estado inconsistente — `SC-003`

### Implementation for User Story 2

- [ ] T022 [US2] Implementar `postCliente(dados: CadastroSimplificadoInput)` em `clienteQueries.ts` (T005): monta `PostClienteInput.Cliente` com exatamente os 11 campos confirmados (`Empresa, nome, cpf, email, celular, cep, endereco, bairro, numero, cidade, uf` — AD-024, nunca `LimiteCredito`/`PermiteVendaCredito`, AD-026), chama `POST /api/erp/PostCliente`, depois `fetchClientePorDocumento(dados.cpf)` para obter o `ClienteCheckout` completo (`CodCliente` incluso) — depende de T005
- [ ] T023 [US2] Implementar `cadastrarESelecionarCliente(dados)` em `clienteSlice.ts` (T006): chama `postCliente` (T022), aplica o resultado pelo mesmo caminho de `selecionarCliente` (T014) mas sempre dispara `CLIENTE_CRIADO` (nunca `TROCADO`) — depende de T014, T022
- [ ] T024 [US2] Implementar `src/client/features/cliente/FormCadastroSimplificado.tsx`: campos `nome/cpf/email/celular/cep/endereco/bairro/numero/cidade/uf` (sem `LimiteCredito`/`PermiteVendaCredito`, `FR-014`), valida formato de CPF/CEP via T003 antes de habilitar o envio (`FR-012`); oferecido inline em `ModalBuscaCliente.tsx` (T018) quando a busca não retorna nada e o termo não é CNPJ — depende de T003, T018, T023
- [ ] T025 [US2] E2E `tests/e2e/identificacao-cliente.spec.ts` (quickstart, Camada 3, passos 4 e 5, extensão do arquivo de T020): (4) buscar CPF inexistente → sem resultado, cadastro simplificado oferecido; preencher e confirmar → `PostCliente` chamado, cliente passa a existir e é associado (`CLIENTE_CRIADO`); (5) buscar CNPJ sem resultado → cadastro simplificado **não** oferecido, aviso de pessoa física exibido (`FR-010`, `research.md` D4); buscar CNPJ **com** resultado → seleção normal — depende de T020 (mesmo arquivo)

**Checkpoint**: User Stories 1 e 2 funcionam de forma independente e integrada — feature completa (`FR-001` a `FR-015`).

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Gates finais e verificações manuais que o E2E não cobre.

- [ ] T026 Rodar `npx tsc --noEmit` e confirmar zero erros de tipo — gate obrigatório da Constitution (`Development Workflow`)
- [ ] T027 Rodar as 3 camadas de `quickstart.md` (domínio puro, integração, E2E) e confirmar: nenhum fallback inventado para `descontoConvenio`/`listaPreco` (`research.md` D10); ausência visual do chip de filtro "Ativo" no modal de busca (AD-093); F5 no meio da venda descarta o cliente selecionado (Constitution VI)
- [ ] T028 [P] Implementar `fetchClientePorCodigo(codigo: number)` em `clienteQueries.ts` (T005): `GET /api/erp/GetCliente` usando o parâmetro `CodCliente` (novo, AD-115), valida a resposta via T002 — mesma natureza imperativa de `fetchClientePorDocumento`, sem uso próprio nesta feature; consumida pela orquestração de importação da feature 006 (`specs/006-importacao-dav/contracts/importacao-domain-api.md`) — `FR-016` — depende de T002, T005
- [ ] T029 Estender `OrigemCliente` (`data-model.md` §1) com o valor `'DAV'` e a assinatura de `selecionarCliente` em `clienteSlice.ts` (T014) para aceitá-lo — extensão puramente aditiva (AD-115): `houveEscolhaExplicita`/decisão `CLIENTE_SELECIONADO` vs. `CLIENTE_TROCADO` (D9) não muda para essa origem — `FR-016` — depende de T014

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Depende de 002 (Fase 1) e 001 (Foundational, `vendaStore.ts`) — fora desta feature
- **Foundational (Phase 2)**: Depende do Setup — BLOQUEIA as duas user stories
- **User Stories (Phase 3-4)**: Ambas dependem do Foundational
  - US1 pode começar assim que Phase 2 terminar
  - US2 depende de `selecionarCliente` (T014, US1) para reaproveitar o caminho de aplicação do resultado — não é totalmente independente de US1 no código, mas é testável isoladamente via mock de `postCliente`
- **Polish (Phase 5)**: Depende das 2 user stories completas

### User Story Dependencies

- **US1 (P1)**: Depende de Foundational (T004, T006); MVP standalone — cobre busca, seleção, troca e bloqueio
- **US2 (P1)**: Depende de Foundational (T005, T006) **e** de T014 (US1) para `cadastrarESelecionarCliente` reaproveitar a aplicação de resultado — implementar depois de US1 ou, em paralelo, com T014 como ponto de sincronização

### Within Each User Story

- Tests antes da implementação correspondente, onde aplicável
- Domínio puro e camada de serviço antes do slice; slice antes da UI
- `ModalBuscaCliente.tsx` (busca) antes do cadastro simplificado inline (mesmo modal)
- Story completa antes do checkpoint

### Parallel Opportunities

- T002, T003, T004 (Foundational) em paralelo
- T007–T009 (testes Foundational) em paralelo entre si
- T010–T013 (testes US1) em paralelo
- T016, T019 (US1, arquivos independentes de T014/T015/T017) em paralelo
- T021 (teste US2) pode ser escrito em paralelo aos testes de US1

---

## Parallel Example: Foundational

```bash
# Schema Zod, domínio de documento e mapper (arquivos diferentes, sem dependência entre si):
Task: "Implementar cliente.schema.ts em src/shared/schemas/cliente.schema.ts"
Task: "Implementar documento.ts em src/client/domain/cliente/documento.ts"
Task: "Implementar clienteMapper.ts em src/client/services/cliente/clienteMapper.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Completar Phase 1: Setup (pressupõe 002 e 001 já implementadas)
2. Completar Phase 2: Foundational (bloqueia tudo)
3. Completar Phase 3: User Story 1
4. **PARAR e VALIDAR**: busca por documento, busca por termo livre, pré-seleção do default e troca com reprecificação funcionando isoladamente
5. Nesse ponto toda venda tem cliente associado (default ou seleção) — cadastro simplificado (US2) ainda não existe, mas nenhuma venda com cliente já cadastrado fica bloqueada

### Incremental Delivery

1. Setup + Foundational → base pronta (schema, domínio, mapper, núcleo do slice)
2. US1 → validar isoladamente (busca, seleção, troca, bloqueio pós-pagamento)
3. US2 → validar isoladamente + em conjunto com US1 (cadastro simplificado reaproveitando `selecionarCliente`) — feature completa
4. Polish → gates finais e verificações manuais

### Parallel Team Strategy

Com mais de um desenvolvedor: completar Setup + Foundational juntos; depois um desenvolvedor segue com US1 (busca/seleção/troca), outro prepara `FormCadastroSimplificado.tsx`/`postCliente` (US2) em paralelo, sincronizando em T014 (`selecionarCliente`) antes de finalizar `cadastrarESelecionarCliente` (T023).

---

## Notes

- [P] = arquivos diferentes, sem dependências
- [Story] mapeia cada tarefa à user story correspondente para rastreabilidade
- Verificar que os testes falham antes de implementar (TDD onde aplicável) — prioridade no domínio puro (`documento.ts`) e no slice (`clienteSlice.ts`)
- Commit após cada tarefa ou grupo lógico
- Parar em cada checkpoint para validar a story isoladamente
- `podeMutarCarrinho()` e `fetchProduto` (T014/T015) são consumidos diretamente da feature 003, já implementada — sem stub, ao contrário do padrão de injeção usado pela feature 004 para dependências ainda não implementadas (008/014)
- `clienteSlice.ts` nunca importa `carrinhoSlice.ts` como módulo (Constitution II) — só lê o estado combinado do `vendaStore` e chama o serviço de produto já público da feature 003
