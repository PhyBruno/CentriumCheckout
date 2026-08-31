# Implementation Plan: Identificação e Cadastro de Cliente

**Branch**: `005-identificacao-cadastro-cliente` | **Date**: 2026-08-26 | **Spec**: `specs/005-identificacao-cadastro-cliente/spec.md`

**Input**: Feature specification from `specs/005-identificacao-cadastro-cliente/spec.md`, complementada pela especificação de domínio mais detalhada em `.specs/features/identificacao-cadastro-cliente/spec.md` (contratos de API, campos de `PostCliente`, defaults de `GetSessao`), pelo contrato real `Fluxograma - Diagrama - Alinhamentos/APICentriumOAuth.yaml` e pelas decisões arquiteturais já registradas em `.specs/project/STATE.md` (AD-011, AD-023, AD-024, AD-025, AD-026, AD-032, AD-043, AD-050, AD-053, AD-061, AD-091, AD-092, AD-093, AD-094).

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Um slice `cliente`, combinado no mesmo store Zustand+Immer da venda em andamento (`vendaStore`, criado pela feature 001, sem `persist` — AD-006), guarda o cliente atual da venda como uma **cópia snapshot** dos campos relevantes de `ClienteCheckout` — nunca uma referência viva ao cache do TanStack Query, mesma regra de fronteira já usada pelo carrinho (`.specs/codebase/ARCHITECTURE.md`). Ao iniciar uma nova NFCe, o slice é pré-populado com `SessaoUsuario.ClienteDefaultCodigo`/`ClienteDefaultNome` do bootstrap (AD-032) — sem interação do operador — mas **sem** `ListaPreco`/`DescontoConvenio`, porque o contrato não tem como buscar cliente por código (`AD-094`, pendência bloqueante). A busca é dois caminhos distintos mapeados a dois endpoints (`GetCliente` por documento, `GetListaClientes` por termo livre); selecionar um candidato da lista sempre dispara uma chamada a `GetCliente` pelo documento do candidato antes de associar — mesmo padrão "lista só capta, endpoint singular resolve" já ratificado pela feature 003 (AD-091). O cadastro simplificado (`PostCliente`) usa só os 11 campos que a procedure do ERP realmente grava (AD-024) — nunca os campos de crédito, que nem aparecem na tela (AD-026). Trocar o cliente com o carrinho populado dispara um **re-fetch de `GetProduto`** por SKU ativo não congelado (não uma recomputação local pura) — mesmo caminho que a feature 003 já reservou para `TipoPreco = 9` — e fica bloqueado assim que há pagamento aprovado, reaproveitando o mesmo predicado injetado que a feature 003 definiu (`podeMutarCarrinho()`). Três eventos de auditoria (`CLIENTE_SELECIONADO`, `CLIENTE_CRIADO`, `CLIENTE_TROCADO`) são disparados via o dispatcher da feature 001, nunca pela pré-seleção automática do default.

## Technical Context

**Language/Version**: TypeScript `strict`, React 19 + Vite — feature inteiramente client-side. O BFF (feature 002) participa apenas como proxy autenticado em `/api/erp/*`; nenhuma rota nova de servidor é introduzida por esta feature.

**Primary Dependencies**: Zustand + Immer (slice `cliente` combinado no `vendaStore`, sem `persist`); TanStack Query (busca de cliente, cache curto — não é uma entidade que precisa sobreviver com `staleTime: Infinity` como o produto); Zod (validação de fronteira de `ClienteCheckout`/`SDTCheckoutListaClientes`); shadcn/ui + Boneyard (modal de busca com skeleton, mesmo padrão de `.specs/features/identificacao-cadastro-cliente/spec.md`, UI Design) + Goey Toast (aviso de CNPJ não registrável pelo cadastro simplificado, bloqueio pós-pagamento). **Nenhuma lib de máscara externa** — validação de formato de CPF/CEP é checagem de padrão simples (contagem de dígitos + separadores), não checksum, conforme `CLI-04` exige só "validar formato".

**Storage**: N/A para estado de venda — o cliente atual vive só em memória (Constitution VI, AD-006), descartado ao finalizar/suspender e não sobrevive a F5. `SessaoUsuario.ClienteDefaultCodigo`/`ClienteDefaultNome` são **lidos** do bootstrap já persistido em Dexie pela feature 002 — esta feature não grava nada em Dexie.

**Testing**: Vitest + Testing Library. Unitários puros (sem React) para: classificação de documento (CPF vs. CNPJ vs. inválido, base do bloqueio de CNPJ AD-050), validação de máscara de CPF/CEP, e o mapeamento `ClienteCheckout → ClienteVenda` (snapshot). Testes de integração do slice para: transição `CLIENTE_SELECIONADO` → `CLIENTE_TROCADO` (primeira seleção explícita vs. troca subsequente), pré-seleção do default sem evento de auditoria, bloqueio de troca pós-pagamento, disparo do re-fetch de `GetProduto` por SKU ao trocar cliente com carrinho populado. Playwright (E2E) para o fluxo dourado: buscar por documento → buscar por termo livre → selecionar candidato → cadastro simplificado quando não encontrado → trocar cliente com carrinho populado.

**Target Platform**: Navegador (Chrome prioritário), desktop e mobile pelo mesmo estado de venda (`.specs/features/layout-responsivo-mobile/spec.md`).

**Performance Goals**: Busca por termo livre é debounced e só dispara abaixo do piso `SessaoUsuario.QtdMinCharParaConsulta` bloqueado (mesmo padrão já usado pela busca de produto na feature 003, AD-024 — nunca hardcodar o piso). Troca de cliente com carrinho populado dispara até N chamadas paralelas a `GetProduto` (uma por SKU distinto ativo não congelado) — N é a contagem de SKUs distintos de uma venda de PDV (dezenas, não milhares), custo aceitável.

**Constraints**:
- Bloqueio de CNPJ (14 dígitos) no campo de busca é **alerta, não bloqueio duro** da chamada — ver `research.md` D4: um CNPJ pode corresponder a um cliente PJ legítimo já cadastrado fora do Checkout; o que não existe é o caminho de *criação* de PJ pelo cadastro simplificado.
- Payload de `PostCliente` restrito aos 11 campos confirmados por AD-024 (`Empresa, nome, cpf, email, celular, cep, endereco, bairro, numero, cidade, uf`) — `LimiteCredito`/`PermiteVendaCredito` nunca exibidos nem enviados, mesmo presentes no schema `ClienteCheckout` (AD-026).
- Endereço do cadastro simplificado é texto livre, sem validação de IBGE — só a máscara de formato do CEP (AD-023).
- Filtro "Ativo" **não** implementado no modal de busca — contrato não tem campo de status (AD-093).
- Troca de cliente bloqueada a partir de qualquer pagamento aprovado — reaproveita o predicado `podeMutarCarrinho()` já definido pela feature 003 (D8), sem `clienteSlice` importar o slice de pagamento.
- Cliente default pré-selecionado (AD-032) nasce **completo** já no bootstrap: `listaPreco = SessaoUsuario.ListaPrecoDefault` e `descontoConvenio = 0`, sem nenhuma chamada a `GetCliente` (AD-108, 2026-08-31 — fecha o item 31 de `PENDENCIES.md` e supera AD-094). Só o `documento` (CPF/CNPJ) segue indisponível para esse cliente.
- Nenhuma reprecificação automática do default gera evento de auditoria (mesma filosofia da feature 003, D11).

**Scale/Scope**: 1 slice Zustand (`clienteSlice`) + 1 módulo de domínio puro (`documento.ts`, classificação/máscara CPF-CNPJ-CEP) + 1 camada de query (`clienteQueries.ts`: busca, lookup por documento, lookup por código, `postCliente`) + 1 schema Zod de fronteira + 3 superfícies de UI (modal de busca, formulário de cadastro simplificado inline no mesmo modal, campo de cliente na tela principal). Inclui também `fetchClientePorCodigo` (lookup por `CodCliente`, AD-115) e a origem `'DAV'` em `OrigemCliente` (`FR-016`) — pura superfície de serviço/tipo, sem UI própria nesta feature, exposta para consumo direto pela feature 006 (importação de DAV, `specs/006-importacao-dav/contracts/importacao-domain-api.md`). Fora do escopo deste plano: o motor de precificação em si (feature 003 — este plano só dispara o re-fetch, não recalcula preço), a seleção de vendedor (feature 012, mesmo padrão de modal), e a implementação do slice de auditoria (feature 001 — este plano só consome o dispatcher).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Avaliação (pré-Phase 0) | Re-avaliação (pós-Phase 1) |
|---|---|---|
| I. Spec-Driven Development | ✅ Este plano é resultado de `/speckit-plan` sobre `specs/005-identificacao-cadastro-cliente/spec.md`, seguindo a sequência obrigatória. | ✅ Mantido — nenhum artefato de design introduz requisito não rastreável a um `FR-xxx`/`CLI-xx`; duas correções de escopo (filtro Ativo, AD-093), uma pendência nova depois fechada (AD-094 → AD-108) e uma extensão aditiva pedida por outra feature (`fetchClientePorCodigo`/origem `'DAV'`, AD-115, rastreada por `FR-016` desde 2026-08-31, achado do `/speckit-tasks` da feature 006) foram registradas em `.specs/`/`spec.md` antes do respectivo artefato de tasks. |
| II. Arquitetura SOLID | ✅ Planejado com separação estrita: domínio puro (classificação de documento) ↔ slice (orquestração de estado + auditoria) ↔ query (rede) ↔ UI. | ✅ Confirmado em `contracts/cliente-domain-api.md`: o disparo de re-fetch ao trocar cliente reaproveita o serviço de produto já público da feature 003 (`fetchProduto`), sem `clienteSlice` importar `carrinhoSlice` — e o bloqueio pós-pagamento entra pelo mesmo predicado injetado (Dependency Inversion) que a feature 003 já definiu. Nenhuma duplicação de lógica de reprecificação. |
| III. ERP como Fonte Única de Verdade | ✅ O Checkout não reimplementa nenhuma regra de negócio de cliente — busca, cadastro e desconto de convênio vêm sempre do ERP; o Checkout só copia o resultado para dentro do estado da venda. | ✅ Confirmado — os dois achados de contrato desta fase (AD-093, AD-094) foram tratados sem o Checkout inventar dado que o ERP não fornece: um caiu por remoção de escopo (filtro Ativo), o outro virou pendência explícita para a equipe do ERP (dados do cliente default), nunca uma suposição silenciosa. |
| IV. Tipagem Estrita e Validação de Fronteira | ✅ Zod obrigatório nas respostas de `GetCliente`/`GetListaClientes`/`PostCliente`. | ✅ Confirmado em `contracts/erp-cliente-api.md`: o schema Zod cobre `ClienteCheckout` e `SDTCheckoutListaClientes.Clientes_ClientesItem` tal como o contrato real define — sem campo inventado (ex.: sem `Ativo`, que não existe). |
| V. Precisão Monetária Inegociável | ✅ `DescontoConvenio` é percentual (`number`), não um valor de linha — a aplicação monetária em si (centavos, arredondamento) é responsabilidade da feature 003; este plano só transporta o valor. | ✅ Confirmado — nenhuma aritmética monetária nova é introduzida por este plano; o campo é copiado como percentual bruto (`0`-`100`) para dentro do snapshot `ClienteVenda`, sem cálculo de linha aqui. |
| VI. Sem Estado de Venda Persistido no Cliente | ✅ Slice sem `persist`, mesmo ciclo de vida do carrinho e da auditoria. | ✅ Confirmado — nenhum artefato de design introduz gravação em Dexie/localStorage; o cliente default é **lido** do bootstrap já persistido pela feature 002, nunca escrito por esta feature. |

Nenhuma violação identificada em nenhuma das duas avaliações. Nenhuma entrada necessária em "Complexity Tracking".

## Project Structure

### Documentation (this feature)

```text
specs/005-identificacao-cadastro-cliente/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   ├── erp-cliente-api.md      # consumo de GetCliente/GetListaClientes/PostCliente via /api/erp/*
│   └── cliente-domain-api.md   # superfície pública do slice + integração com carrinho (003) e auditoria (001)
├── checklists/
│   └── requirements.md  # gerado por /speckit-specify
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── client/
│   ├── domain/
│   │   └── cliente/
│   │       └── documento.ts                # classifica CPF (11 díg.) / CNPJ (14 díg.) / inválido; máscara de CEP (8 díg.) — puro, sem React/Zustand/Query
│   ├── stores/
│   │   ├── vendaStore.ts                   # store combinado (criado pela feature 001) — passa a combinar o slice abaixo
│   │   └── slices/
│   │       └── clienteSlice.ts             # clienteAtual + selecionarCliente/trocarCliente/cadastrarESelecionarCliente + inicializarClientePadrao + orquestração de re-fetch de preço + auditoria
│   ├── services/
│   │   └── cliente/
│   │       ├── clienteQueries.ts           # useBuscaClientes (GetListaClientes), fetchClientePorDocumento (GetCliente), postCliente (PostCliente)
│   │       └── clienteMapper.ts            # ClienteCheckout validado → ClienteVenda (snapshot)
│   └── features/
│       └── cliente/
│           ├── ModalBuscaCliente.tsx        # busca por documento ou termo livre (Boneyard skeleton), CLI-01/CLI-02, aviso de CNPJ (AD-050)
│           ├── FormCadastroSimplificado.tsx # CLI-03/CLI-04, sem campos de crédito (AD-026), oferecido quando a busca não retorna nada
│           └── CampoClienteVenda.tsx        # exibe o cliente atual da venda, sem indicador de origem (AD-053)
└── shared/
    └── schemas/
        └── cliente.schema.ts                # Zod: ClienteCheckout e SDTCheckoutListaClientes

tests/
├── unit/
│   ├── domain/
│   │   └── cliente/
│   │       └── documento.spec.ts            # CPF/CNPJ/CEP válidos e inválidos, limites de dígito
│   └── services/
│       └── cliente/
│           └── clienteMapper.spec.ts        # ClienteCheckout → ClienteVenda; e SessaoUsuario → ClienteVenda do cliente default (listaPreco = ListaPrecoDefault, descontoConvenio = 0, documento = null — AD-108)
├── integration/
│   └── clienteSlice.spec.ts                 # CLIENTE_SELECIONADO vs. CLIENTE_TROCADO, pré-seleção sem evento, bloqueio pós-pagamento, re-fetch por SKU ao trocar
└── e2e/
    └── identificacao-cliente.spec.ts        # fluxo dourado: documento → termo livre → seleção → cadastro simplificado → troca com carrinho populado
```

**Structure Decision**: Esta é a quarta feature a estender a árvore proposta pela feature 002 (`src/client/`, `src/server/`, `src/shared/`) e mantém os três padrões já estabelecidos: (a) módulos de domínio puro sob `src/client/domain/<assunto>/`, mesmo padrão de `domain/auditoria/` (001) e `domain/precificacao/` (003); (b) slices sob `src/client/stores/slices/`, combinados no `vendaStore.ts` que a feature 001 criou — este plano adiciona `clienteSlice.ts` à mesma combinação que já inclui `auditoriaSlice` (001) e `carrinhoSlice` (003); (c) camada de serviço (`services/<assunto>/`) isolando chamadas de rede da UI, mesmo padrão de `services/produto/` (003). Esta feature **não** adiciona nada a `src/server/` — consome o proxy `/api/erp/*` já definido pela feature 002. A integração com o carrinho (003) acontece só pela camada de serviço (`fetchProduto`, já pública) e pelo domínio de precificação — `clienteSlice` nunca importa `carrinhoSlice`, preservando o Constitution Check II.

## Complexity Tracking

> Nenhuma violação de Constitution Check identificada nesta fase — seção não preenchida.
