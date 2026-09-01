# Implementation Plan: Validação Prévia da Venda no ERP (`ValidarNFCe`)

**Branch**: `014-validacao-previa-nfce` | **Date**: 2026-08-31 | **Spec**: `specs/014-validacao-previa-nfce/spec.md`

**Input**: Feature specification from `specs/014-validacao-previa-nfce/spec.md`, o contrato real `Fluxograma - Diagrama - Alinhamentos/ApiCentriumOAuth.yaml` (`20260827192357`), o código-fonte de `PCheckout_ValidarNFCe` lido diretamente na KB GeneXus (`CentriumDEVU6`, via MCP) e as decisões arquiteturais de `.specs/project/STATE.md` (AD-030, AD-036, AD-048, AD-061, AD-074, AD-085, AD-097, AD-098, AD-101, AD-104, AD-108, e os novos AD-109 a AD-113 abertos por esta fase).

## Summary

A validação prévia é um **gate transversal sem UI própria**: antes de efetivar qualquer inserção de forma/condição de pagamento, o Checkout pergunta ao ERP se a venda — **já contando a forma candidata** — é aceitável, e só muta o estado se a resposta for favorável. O endpoint `ValidarNFCe` recebe o mesmo `CheckoutFaturarNFCe` da emissão e devolve `Valido` + `messages`; a leitura do código real mostrou que **a severidade das mensagens não prediz bloqueio** (três dos quatro casos de recusa por crédito chegam como `Warning`, e o único caso que aceita também é `Warning`), de modo que `Valido` é o único discriminante (AD-110).

A feature existe separada da 008 por três razões que `research.md` D1 desenvolve: o insumo (`CheckoutFaturarNFCe`) é escopo da 004, o gatilho não é exclusivo da tela de pagamento (a 013 lança por tecla), e o consumidor do veredito é a finalização. O custo de integração é concentrado: a 008 recebe **duas dependências injetadas** (`validarInsercao`, `invalidarVeredito`) e nenhuma outra feature importa esta. As features 009 e 010 não mudam — continuam reagindo ao roteamento da 008, que agora só é alcançado depois do aceite, o que satisfaz `FR-010` sem tocar nelas.

Duas decisões do usuário moldam o resto: falha de comunicação é **recusa** (*fail-closed*, AD-112), e **não há revalidação na finalização** (AD-113) — o veredito da última inserção aceita é a licença de emissão, o que só é seguro porque, depois do primeiro pagamento aplicado, carrinho, cliente, vendedor e desconto de capa ficam congelados; para mexer em qualquer um deles é preciso remover a forma, gesto que derruba o veredito. Esse congelamento é **mais amplo** que a invariante I7 que a 008 já tinha (que cobria só o carrinho) e é a principal emenda que esta feature impõe a outra.

## Technical Context

**Language/Version**: TypeScript `strict`, React 19 + Vite — feature inteiramente client-side. O BFF (feature 002) participa apenas como proxy autenticado em `/api/erp/*`; nenhuma rota nova de servidor.

**Primary Dependencies**: Zustand + Immer (novo slice `validacaoVenda` combinado no `vendaStore`, sem `persist`); TanStack Query como **mutation** (não query — sem cache, sem refetch, `retry: 0`); Zod (validação de fronteira de `ValidarNFCeOutput`); Goey Toast (única superfície de UI desta feature). Nenhuma biblioteca nova.

**Storage**: N/A. Veredito e flag de exclusão mútua vivem só em memória, descartados com a venda (Constitution VI). Nada em Dexie, nada em `localStorage`.

**Testing**: Vitest + Testing Library. Unitários puros para `interpretarRespostaValidacao` (com **teste negativo** obrigatório: `Valido = false` + `Type = Warning` ⇒ recusa, AD-110), `projetarPagamentos` e a equivalência dos dois retratos produzidos por `montarRetratoVenda` (I5). Integração do slice para I1–I9, incluindo o caminho de indisponibilidade (I4) e a exclusão mútua (I8). Playwright para os cenários 1, 5 e 6 de `quickstart.md` — em especial o que prova que **nenhuma cobrança PIX é gerada** numa venda recusada.

**Target Platform**: Navegador (Chrome prioritário), desktop e mobile — o gate vale igualmente nos dois (`FR-019`), sem ramo de plataforma.

**Performance Goals**: uma requisição por gesto de inserção aceito ou recusado; zero requisições quando a recusa é local (`FR-012`). Uma venda à vista comum paga **uma** requisição adicional no ciclo inteiro. O desfecho deve aparecer ao operador em menos de 2 s (SC-006), o que fixa o timeout da mutation como decisão de implementação e não de infraestrutura.

**Constraints**:
- Nenhuma regra de negócio do ERP é reimplementada localmente (Constitution III, `FR-020`) — o Checkout não sabe o que é limite de crédito, só transporta o veredito.
- O retrato validado e o retrato emitido **precisam** ser produzidos pela mesma função (I5) — divergência entre eles é o pior modo de falha desta feature.
- `FormaEntrada` (`FpgEnt`) é insumo obrigatório de cada forma no payload; sem ele o ERP calcula crediário `0` e o gate aprova o que deveria barrar (AD-111).
- Falha de comunicação nunca efetiva inserção e nunca tem retry automático (AD-112).
- Nenhuma integração externa (TEF/PIX) pode ser acionada antes do aceite (I9).
- O texto das mensagens do ERP é repassado íntegro, sem reescrita, tradução ou resumo (`FR-007`).
- Avisos não entram na trilha de auditoria; recusas entram (AD-113/`research.md` D9).

**Scale/Scope**: 1 slice Zustand (`validacaoVendaSlice`) + 3 módulos de domínio puro (`projetarPagamentos`, `interpretarVeredito`, e o compartilhado `montarRetratoVenda`, generalizado a partir da feature 004) + 1 módulo de serviço (mutation) + 1 schema Zod + 1 módulo de notificação. **Fora do escopo**: a UI de pagamento (008), a emissão (004), os fluxos de PIX/TEF (009/010) e qualquer interpretação semântica do texto das mensagens do ERP.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Avaliação (pré-Phase 0) | Re-avaliação (pós-Phase 1) |
|---|---|---|
| I. Spec-Driven Development | ✅ Resultado de `/speckit-specify` → `/speckit-plan` sobre `specs/014-validacao-previa-nfce/spec.md`. | ✅ Mantido — todo artefato rastreia a um `FR-xxx`, e os cinco achados desta fase viraram AD numerados (AD-109 a AD-113) em vez de decisão implícita. |
| II. Arquitetura SOLID | ✅ Planejado com domínio puro (interpretação, projeção, montagem) ↔ serviço (rede) ↔ slice (orquestração) ↔ notificação (UI). | ✅ Confirmado em `contracts/validacao-domain-api.md`: a 008 recebe `validarInsercao`/`invalidarVeredito` **injetados** e não importa esta feature (Dependency Inversion, mesmo padrão de `iniciarIntegracao`); `interpretarRespostaValidacao` é função pura e total, testável sem rede; uma regra nova do ERP não altera nenhuma linha do Checkout, porque o veredito é transportado, não reinterpretado (Open/Closed levado ao limite). |
| III. ERP como Fonte Única de Verdade | ✅ É a materialização mais direta deste princípio: o Checkout deixa de presumir que a venda é válida e passa a perguntar. | ✅ Confirmado e reforçado por AD-112 — sem resposta do ERP, o Checkout **não assume autoridade** para aceitar o pagamento. Nenhuma das oito regras que o ERP avalia tem contrapartida local. |
| IV. Tipagem Estrita e Validação de Fronteira | ✅ Zod obrigatório em `ValidarNFCeOutput`. | ✅ Confirmado em `contracts/erp-validacao-api.md`: `Valido` **sem default** (ausência ⇒ `RESPOSTA_INVALIDA`, nunca aceite presumido); `Veredito` é união discriminada, o que impede um call site de ler `avisos` sem antes decidir o desfecho; `montarRetratoVenda` tem `OperacaoVenda` como união literal fechada. |
| V. Precisão Monetária Inegociável | ✅ N/A — nenhuma aritmética monetária nova; os valores já chegam prontos do carrinho e do pagamento. | ✅ N/A confirmado. O único cuidado é de **transporte**: `FormaValor` vai ao ERP na mesma conversão que a emissão já usa, porque é a mesma função de montagem (I5). |
| VI. Sem Estado de Venda Persistido no Cliente | ✅ Slice sem `persist`, mesmo ciclo de vida da venda. | ✅ Confirmado — `vereditoVigente` morre com a venda; `limparPagamentos` (feature 004) o zera junto com o resto. Um F5 não recupera veredito, o que é correto: a venda também não é recuperada. |

Nenhuma violação em nenhuma das duas avaliações. Nenhuma entrada necessária em "Complexity Tracking".

## Project Structure

### Documentation (this feature)

```text
specs/014-validacao-previa-nfce/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 — D1..D10 + achados de contrato, origem de AD-109..AD-113
├── data-model.md        # Phase 1 — entidades, invariantes I1-I11, fluxo de estados
├── quickstart.md        # Phase 1 — 8 cenários de validação + fluxo dourado
├── contracts/           # Phase 1
│   ├── erp-validacao-api.md        # POST /api/erp/ValidarNFCe, matriz real de respostas, Zod
│   └── validacao-domain-api.md     # domínio puro + slice + injeções + notificação
├── checklists/
│   └── requirements.md  # gerado por /speckit-specify
└── tasks.md             # Phase 2 (/speckit-tasks — NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── client/
│   ├── domain/
│   │   ├── venda/
│   │   │   └── montarRetratoVenda.ts          # COMPARTILHADO — generaliza montarPayloadFaturarNFCe da 004 (AD-111)
│   │   └── validacaoVenda/                    # camada pura — sem React, Zustand, Query ou fetch
│   │       ├── projetarPagamentos.ts          # aplicados + candidata (FR-002)
│   │       └── interpretarVeredito.ts         # Valido decide; Type é só apresentação (AD-110)
│   ├── stores/
│   │   ├── vendaStore.ts                      # store combinado — passa a combinar o slice abaixo
│   │   └── slices/
│   │       └── validacaoVendaSlice.ts         # vereditoVigente + emValidacao; expõe podeFinalizar()
│   ├── services/
│   │   └── validacao/
│   │       └── validarNFCeMutation.ts         # POST /api/erp/ValidarNFCe, retry 0, timeout, nunca rejeita
│   └── features/
│       └── validacao/
│           └── notificarVeredito.ts           # Goey Toast: erro para recusa/indisponível, aviso para avisos
└── shared/
    └── schemas/
        └── validarNFCe.schema.ts              # Zod: ValidarNFCeOutput (Valido sem default)

tests/
├── unit/
│   └── domain/
│       ├── venda/
│       │   └── montarRetratoVenda.spec.ts     # I5: retrato VALIDAR ≡ retrato FATURAR exceto SuspenderOuFaturar
│       └── validacaoVenda/
│           ├── projetarPagamentos.spec.ts     # candidata presente, lista original não mutada
│           └── interpretarVeredito.spec.ts    # TESTE NEGATIVO: Valido=false + Warning ⇒ recusa (AD-110)
├── integration/
│   └── validacaoVendaSlice.spec.ts            # I1-I9: recusa não muta, indisponível não muta, exclusão mútua, invalidação
└── e2e/
    └── validacao-previa.spec.ts               # quickstart cenários 1, 5 e 6 (nenhuma cobrança PIX em venda recusada)
```

**Structure Decision**: mantém as convenções já consolidadas pelas features 001/003/004/008 — domínio puro em `src/client/domain/<assunto>/`, slices em `src/client/stores/slices/`. A única novidade estrutural é `src/client/domain/venda/`, pasta para o que pertence à **venda como um todo** e não a um fluxo específico: hoje só o montador do retrato, que precisa ser único (I5). Nada é acrescentado a `src/server/`.

## Phase 0 — Research

Concluída. Ver `research.md`: 10 decisões (D1–D10) e quatro achados de contrato, todos obtidos por leitura do código-fonte real do ERP, não por inferência a partir do nome do endpoint.

Nenhum `NEEDS CLARIFICATION` restou: as quatro questões abertas na especificação (onde mora o mecanismo, comportamento em falha de rede, revalidação na finalização, apresentação dos avisos) foram resolvidas por decisão direta do usuário em 2026-08-31.

## Phase 1 — Design & Contracts

Concluída. Artefatos: `data-model.md`, `contracts/erp-validacao-api.md`, `contracts/validacao-domain-api.md`, `quickstart.md`.

## Decisões arquiteturais abertas por esta fase

| AD | Conteúdo | Onde |
|---|---|---|
| **AD-109** | `ValidarNFCe` é gate de **inserção de pagamento**, não de finalização, e vira feature própria (014) em vez de emenda à 008 — corrige o destino provisório "feature 004" registrado no item 36 de `PENDENCIES.md` | `research.md` D1 |
| **AD-110** | Só `Valido` decide bloqueio; `messages[].Type` é apresentação — no ERP real há `Warning` que bloqueia e `Warning` que não | `research.md` D4, `contracts/erp-validacao-api.md` |
| **AD-111** | O retrato enviado inclui a forma candidata e é produzido pelo montador **compartilhado** `montarRetratoVenda` (generaliza `montarPayloadFaturarNFCe` da 004); `FormaEntrada` é insumo obrigatório — **fecha a sub-pendência `FormaEntrada` do item 36** | `research.md` D2/D3 e achado 1 |
| **AD-112** | Falha de comunicação com `ValidarNFCe` é recusa (*fail-closed*), sem retry automático | `research.md` D5 |
| **AD-113** | Não há revalidação na finalização: vale o veredito da última inserção aceita, e a venda fica **congelada** (carrinho, cliente, vendedor e desconto de capa) enquanto houver pagamento aplicado — estende a invariante I7 da feature 008 | `research.md` D6 |

## Emendas que esta feature impõe a outras

| Feature | Emenda | Artefatos afetados |
|---|---|---|
| **008 — pagamento** | `aplicarPagamento` passa pelo gate antes de mutar; `removerPagamento` invalida o veredito; catálogo passa a carregar `FormaEntrada`; congelamento estendido a cliente/vendedor/desconto (AD-113) | `spec.md`, `plan.md`, `data-model.md` (I7), `contracts/` |
| **004 — finalização** | `montarPayloadFaturarNFCe` vira `montarRetratoVenda` compartilhado; emissão condicionada a `podeFinalizar()` | `spec.md`, `plan.md`, `contracts/faturamento-api.md` |
| **013 — venda rápida** | O atalho herda o gate via `aplicarPagamento`; recusa aborta a finalização automática | `spec.md`, `plan.md` |
| **009 — PIX** | Nenhuma mudança de mecanismo: registra apenas que `GerarPIX` só é alcançado após o aceite | `spec.md`, `plan.md` |
| **001 — auditoria** | Novo tipo de evento `VALIDACAO_VENDA_RECUSADA` | `contracts/auditoria-events.md`, `data-model.md` |

## Complexity Tracking

*Nenhuma violação de princípio da Constitution exigiu justificativa nesta feature.*
