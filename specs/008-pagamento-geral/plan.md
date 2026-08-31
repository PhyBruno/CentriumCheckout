# Implementation Plan: Pagamento (Geral)

**Branch**: `docs/plan-pagamento-geral` | **Date**: 2026-08-26 | **Spec**: `specs/008-pagamento-geral/spec.md`

**Input**: Feature specification from `specs/008-pagamento-geral/spec.md`, complementada pela especificação de domínio mais detalhada em `.specs/features/pagamento-geral/spec.md` (`PAY-01`..`PAY-10`), pelo contrato real `Fluxograma - Diagrama - Alinhamentos/APICentriumOAuth.yaml` e pelas decisões arquiteturais registradas em `.specs/project/STATE.md` (AD-019, AD-022, AD-023, AD-024, AD-030, AD-036, AD-039, AD-046, AD-048, AD-061, AD-064, AD-071, AD-072, AD-073, AD-074, AD-078, AD-085, e os novos AD-097/AD-098/AD-099 abertos por esta fase de Design).

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

O pagamento é um slice `pagamento` combinado no mesmo store Zustand+Immer da venda em andamento (sem `persist`, AD-006), guardando **uma** condição de pagamento e **N** formas aplicadas — o split de `FR-011` acontece entre formas dentro de uma condição, porque `CheckoutFaturarNFCe.CondicaoPagamentoCodigo` é escalar no contrato enquanto `FormasDePagamento` é array. Toda a matemática (saldo, troco, rateio de desconto de capa, elegibilidade de vale) vive numa **camada de domínio pura** (`src/client/domain/pagamento/`), operando em `Centavos` inteiros reusados da feature 003 (Constitution V, AD-071/AD-072) — o slice apenas orquestra: valida pela função de domínio, aplica a mutação, dispara a integração externa quando houver e registra o evento de auditoria (contrato da feature 001).

O roteamento de integração é uma **função pura de tabela** — `resolverIntegracao(forma, capacidades)` devolve `'TEF' | 'PIX_DINAMICO' | 'NENHUMA'` a partir de `FormaMeioPagtoNFe` (`PAY-08`) e de capacidades **injetadas** (`tefAtivo`, `pixAtivo`, `plataforma`). É o que mantém esta feature independente das features 009 e 010 (ela emite o veredito, elas executam) e o que torna `FR-007` testável: `CartaoCredito` + `TEFAtivo=true` + `MOBILE` → `NENHUMA`, sem exceção (AD-074), enquanto o PIX permanece disponível no mobile. Três achados de contrato desta fase viraram AD novos: as formas de pagamento **não têm endpoint próprio** (vêm de `SessaoUsuario.CondicoesDePagamento[]` em `GetSessao`, AD-097); o rateio do desconto de capa é divisão **igual com clamp e redistribuição**, decidido pelo usuário nesta sessão (AD-098); e `ValidaTicketDevolucaoOutput` **tem** um campo `Valido` que AD-023 dizia não existir, resolvido com fallback e pendência aberta (AD-099, item 32).

## Technical Context

**Language/Version**: TypeScript `strict`, React 19 + Vite — feature inteiramente client-side. O BFF (feature 002) participa apenas como proxy autenticado em `/api/erp/*` e como origem de `/api/bootstrap`; nenhuma rota nova de servidor é introduzida.

**Primary Dependencies**: Zustand + Immer (slice `pagamento` combinado no `vendaStore`, sem `persist`); TanStack Query (catálogo de condições/formas via `/api/bootstrap`, `staleTime` de 30 min — `PAY-01`); Zod (validação de fronteira de `/api/bootstrap` e de `ValidaTicketDevolucao`); shadcn/ui + Boneyard (UI de pagamento e modais) + Goey Toast (bloqueios: segunda forma dinheiro, desconto acima do subtotal, forma inelegível para vale). **Nenhuma biblioteca de dinheiro** — `Centavos` e `distribuirPorMaiorResto` são importados do domínio da feature 003 (AD-071/AD-072), nunca reimplementados.

**Storage**: N/A para estado de pagamento — condição, formas aplicadas, desconto de capa e vale vivem só em memória (Constitution VI, AD-006), descartados ao finalizar/suspender e não sobrevivem a F5. O catálogo é cache em memória do TanStack Query sobre o bootstrap que a feature 002 já persiste em Dexie; esta feature **lê**, nunca grava em Dexie.

**Testing**: Vitest + Testing Library. Unitários puros (sem React) para: tabela de roteamento nas 4 combinações de flags × plataforma (`FR-004`..`FR-007`), saldo/troco (`FR-012`), exclusividade da forma dinheiro (`FR-013`), rateio igual com clamp e redistribuição (`FR-016`, AD-098), elegibilidade e interpretação de ticket (`FR-008`..`FR-010`, AD-099). Integração do slice para as invariantes I1-I10 de `data-model.md`, incluindo o **teste negativo** de duplicata (`FR-018`, AD-064) e a reversibilidade do bloqueio do carrinho (AD-030). Playwright para o fluxo dourado descrito em `quickstart.md`.

**Target Platform**: Navegador (Chrome prioritário), desktop e mobile pelo mesmo estado de venda — com a única divergência de comportamento sendo a exclusão do TEF no mobile (AD-074), expressa como dado (`plataforma`), não como ramo de código duplicado.

**Performance Goals**: Todo o cálculo é síncrono e local sobre unidades e dezenas de elementos (formas aplicadas, linhas do carrinho) — custo desprezível. A meta real é de rede: o catálogo de formas **não** pode gerar chamada por abertura da tela de pagamento (`staleTime` de 30 min), e `ValidaTicketDevolucao` é chamado **exatamente uma vez por vale**, nunca de novo na finalização (`FR-009`).

**Constraints**:
- Nenhuma operação monetária em ponto flutuante (Constitution V) — `double` do ERP vira `Centavos` no schema Zod, na fronteira.
- `Σ FormaValor` do payload é exatamente o total líquido — o troco não existe no contrato e nunca é enviado (`research.md`, D3).
- Uma única condição de pagamento por venda; trocar a condição esvazia as formas aplicadas (I1/I9).
- Uma única forma `Dinheiro` por venda (`FR-013`, AD-036), garantida no domínio e não no componente.
- Pagamento só é registrado após aprovação da integração (`FR-004`/`FR-005`); `PENDENTE_INTEGRACAO` não conta para o saldo nem bloqueia o carrinho.
- Pagamento com integração externa aprovada é irreversível (I6, AD-030) — bloqueio permanente do carrinho; sem integração, o bloqueio é reversível.
- `FormaFpgUtiCar` vazio é **elegível** para vale devolução (AD-048), decisão explícita do usuário contra a recomendação da época.
- Desconto manual sem teto e sem autorização (`FR-014`/`FR-015`, AD-039), limitado apenas por `descontoCapa <= subtotal` (I8), que é o que faz o algoritmo de clamp terminar.
- Desconto de **item** não é implementado aqui — é delegado a `carrinhoSlice.editarItem(..., 'descontoLinha', ...)` da feature 003 (`research.md`, D7).
- Nenhum documento impresso para `DuplicataMercantil` (`FR-018`, AD-064).
- **Toda inserção passa pelo gate da feature 014 antes de mutar o estado** (`FR-019`, AD-109): validações locais primeiro (`FR-020`, sem ida ao ERP quando a recusa é local), depois `validarInsercao`, e só então a mutação e a integração externa — o que garante que nenhuma cobrança PIX/TEF nasça numa venda recusada.
- `removerPagamento` invalida o veredito vigente (`FR-021`, AD-113); e o congelamento da venda com pagamento aplicado passa a abranger cliente, vendedor e desconto de capa, não só o carrinho (`FR-023`, I12).
- O catálogo de formas precisa carregar `FormaEntrada` (`FpgEnt`) além de `FormaFpgUtiCar` (`FR-022`, AD-111) — sem esse campo o ERP calcula crediário zero e o gate aprova o que deveria barrar.

**Scale/Scope**: 1 slice Zustand (`pagamentoSlice`) + 5 módulos de domínio puro (`formaPagamento`, `roteamentoIntegracao`, `saldoPagamento`, `descontoCapa`, `valeDevolucao`) + 1 camada de query (catálogo + validação de ticket) + 2 schemas Zod de fronteira + 4 superfícies de UI (seletor de condição/forma, lista de formas aplicadas com saldo/troco, modal de desconto de capa, modal de vale devolução). Fora do escopo: o fluxo de PIX (feature 009), o de TEF (feature 010), a montagem e o envio de `FaturarNFCe` (feature 004 — esta feature entrega os dados prontos) e a adaptação de layout mobile em si (feature 007 — esta feature só consome `plataforma`).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Avaliação (pré-Phase 0) | Re-avaliação (pós-Phase 1) |
|---|---|---|
| I. Spec-Driven Development | ✅ Este plano é resultado de `/speckit-plan` sobre `specs/008-pagamento-geral/spec.md`, seguindo a sequência obrigatória. | ✅ Mantido — todo artefato rastreia a um `FR-xxx`/`PAY-xx`, e os três achados de contrato viraram AD numerados (AD-097/098/099) em vez de decisão implícita no código. |
| II. Arquitetura SOLID | ✅ Planejado com separação estrita: domínio puro (roteamento, saldo, rateio) ↔ slice (orquestração) ↔ query (rede) ↔ UI. | ✅ Confirmado em `contracts/pagamento-domain-api.md`: `resolverIntegracao` não conhece as features 009/010 — devolve veredito e recebe as capacidades **injetadas** (Dependency Inversion); o slice recebe `subtotalCarrinho`/`linhasRateaveis`/`iniciarIntegracao` por injeção e não importa carrinho, layout, PIX ou TEF. Um novo meio de pagamento acrescenta uma linha na tabela de `roteamentoIntegracao.ts` sem tocar call sites (Open/Closed). |
| III. ERP como Fonte Única de Verdade | ✅ O Checkout não decide localmente quais formas existem nem quais integrações estão ligadas — segue `CondicoesDePagamento[]` e as flags de `GetSessao`. | ✅ Confirmado, e **reforçado** por dois achados: não existe endpoint próprio de formas (AD-097), então o catálogo é necessariamente o do ERP; e um pagamento aprovado por integração externa é irreversível no Checkout (I6), porque estorno é operação do ERP/adquirente. `FormaIntegracaoCartao` é ecoado, não reinterpretado (AD-073/AD-078). |
| IV. Tipagem Estrita e Validação de Fronteira | ✅ Zod obrigatório em `/api/bootstrap` e `ValidaTicketDevolucao`. | ✅ Confirmado em `contracts/erp-pagamento-api.md`: `double` → `Centavos` no schema; `MeioPagtoNFe` é união fechada (valor desconhecido descarta a forma com aviso, sem derrubar a tela); `ResultadoTicket` é união discriminada, impedindo ler `valor` sem checar `valido`; `exigeDocumentoImpresso` tem retorno de tipo literal `false`, o que faz o compilador barrar um ramo de impressão de duplicata. |
| V. Precisão Monetária Inegociável | ✅ Centavos inteiros; rateio pelo maior resto (AD-072), reusado da feature 003. | ✅ Confirmado em `data-model.md`: saldo, troco e rateio são funções puras testáveis isoladamente; `derivarValores` é a única forma de obter `valorAplicado`/`valorRecebido`, tornando I3/I5 inviolávies; o rateio tem pós-condições afirmadas por teste (`Σ === desconto`, nenhuma parcela acima do total da linha). O clamp de AD-098 existe precisamente para impedir `ValorTotal` negativo — falha regulatória, não cosmética. |
| VI. Sem Estado de Venda Persistido no Cliente | ✅ Slice sem `persist`, mesmo ciclo de vida do carrinho e da auditoria. | ✅ Confirmado — nenhum artefato de design grava em Dexie/localStorage; o catálogo é cache em memória sobre o bootstrap que a feature 002 já mantém. `limparPagamentos` é chamado pela feature 004 junto com `limparCarrinho`/`descartarAuditoria`. |

Nenhuma violação identificada em nenhuma das duas avaliações. Nenhuma entrada necessária em "Complexity Tracking".

## Project Structure

### Documentation (this feature)

```text
specs/008-pagamento-geral/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output — D1..D14, origem de AD-097/098/099
├── data-model.md        # Phase 1 output — entidades, invariantes I1-I10, algoritmos
├── quickstart.md        # Phase 1 output — 8 cenários de validação + fluxo dourado
├── contracts/           # Phase 1 output
│   ├── erp-pagamento-api.md        # /api/bootstrap, ValidaTicketDevolucao, parte de FaturarNFCe
│   └── pagamento-domain-api.md     # superfície pública do domínio puro + slice
├── checklists/
│   └── requirements.md  # gerado por /speckit-specify
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── client/
│   ├── domain/
│   │   └── pagamento/                        # camada pura — sem React, Zustand, Query ou fetch
│   │       ├── formaPagamento.ts             # MeioPagtoNFe, predicados (ehDinheiro, geraTroco, ...)
│   │       ├── roteamentoIntegracao.ts       # resolverIntegracao/formaDisponivel (PAY-08, AD-074)
│   │       ├── saldoPagamento.ts             # calcularSaldo, podeAplicarForma, derivarValores
│   │       ├── descontoCapa.ts               # resolverDescontoCapa, ratearDescontoCapa (AD-098)
│   │       └── valeDevolucao.ts              # ehElegivelParaVale (AD-048), interpretarRespostaTicket (AD-101, corrige AD-099)
│   ├── stores/
│   │   ├── vendaStore.ts                     # store combinado (feature 001) — passa a combinar o slice abaixo
│   │   └── slices/
│   │       └── pagamentoSlice.ts             # condição + formas + desconto de capa + vale; expõe podeMutarCarrinho
│   ├── services/
│   │   └── pagamento/
│   │       ├── pagamentoQueries.ts           # useCondicoesPagamento (staleTime 30min), validarTicket
│   │       └── pagamentoMapper.ts            # CondicoesDePagamento[] validado → CondicaoPagamento[] (double → Centavos)
│   └── features/
│       └── pagamento/
│           ├── SeletorCondicaoForma.tsx      # condições/formas disponíveis, FR-001..FR-003
│           ├── ListaPagamentosAplicados.tsx  # formas aplicadas, saldo restante e troco, FR-011/FR-012
│           ├── ModalDescontoCapa.tsx         # percentual ou valor, sem teto, FR-015
│           └── ModalValeDevolucao.tsx        # código do vale, elegibilidade e resultado, FR-008..FR-010
└── shared/
    └── schemas/
        └── pagamento.schema.ts               # Zod: CondicoesDePagamento[] e ValidaTicketDevolucaoOutput

tests/
├── unit/
│   └── domain/
│       └── pagamento/
│           ├── roteamentoIntegracao.spec.ts  # matriz flags × plataforma; mobile nunca TEF (FR-007)
│           ├── saldoPagamento.spec.ts        # troco só p/ dinheiro, segunda forma dinheiro bloqueada
│           ├── descontoCapa.spec.ts          # divisão igual, clamp, redistribuição, soma exata (AD-098)
│           └── valeDevolucao.spec.ts         # FpgUtiCar vazio elegível; validade só por Valido (AD-101)
├── integration/
│   └── pagamentoSlice.spec.ts                # I1-I10: bloqueio reversível/irreversível, duplicata sem impressão
└── e2e/
    └── pagamento-geral.spec.ts               # fluxo dourado de quickstart.md
```

**Structure Decision**: Esta é a quarta feature a estender a árvore proposta pela feature 002 (`src/client/`, `src/server/`, `src/shared/`) e mantém as duas decisões já consolidadas pelas features 001 e 003: (a) módulos de domínio puro sob `src/client/domain/<assunto>/`; (b) slices sob `src/client/stores/slices/`, combinados no `vendaStore.ts`. Não adiciona nada a `src/server/` — consome `/api/bootstrap` e `/api/erp/*` já definidos pela feature 002. A separação `domain/` ↔ `services/` ↔ `features/` é o que sustenta o Constitution Check II aqui em particular: a tabela de roteamento e o algoritmo de rateio — as duas peças de maior risco desta feature — são testáveis sem montar componente, sem store e sem rede.

## Complexity Tracking

> Nenhuma violação de Constitution Check identificada nesta fase — seção não preenchida.

## Emenda de 2026-08-31 — validação prévia da venda (feature 014)

Aplicada **no ponto** em `spec.md` (`FR-019`..`FR-023`), `data-model.md` (I11/I12), `contracts/pagamento-domain-api.md` (injeções e contrato de `aplicarPagamento`/`removerPagamento`) e nas Constraints deste plano. Resumo:

1. **`aplicarPagamento` ganha um gate.** Ordem obrigatória: validações locais puras → `validarInsercao` (feature 014) → mutação → integração externa. Uma recusa encerra sem tocar no estado, e por isso `iniciarIntegracao` nunca é alcançado numa venda recusada — o que satisfaz o requisito de "nenhuma cobrança PIX/TEF em venda recusada" **sem mudar nada nas features 009 e 010**.
2. **Vale para cada forma do split** (`FR-019`): a segunda e as seguintes inserções são validadas de novo, com as formas já aplicadas somadas à candidata. Acrescentar uma forma muda o total de crediário e pode inverter o desfecho.
3. **`removerPagamento` invalida o veredito** (`FR-021`), o que é o que torna seguro não revalidar na finalização (AD-113).
4. **O congelamento pós-pagamento cresceu.** A invariante I7 cobria só o carrinho; agora cliente, vendedor e desconto de capa também ficam congelados enquanto houver pagamento aplicado (I12, `FR-023`). Impacta as features 003, 005 e 012, que consomem o predicado por injeção.
5. **O catálogo passa a carregar `FormaEntrada` (`FpgEnt`)** de `SessaoUsuario.CondicoesDePagamento[]` (`FR-022`, AD-111). Sem esse campo o ERP calcula crediário zero e aprova exatamente o que o gate existe para barrar — é o encerramento da última sub-pendência do item 36 de `PENDENCIES.md`.

O slice recebe `validarInsercao`/`invalidarVeredito` **injetados**: esta feature continua sem importar nada da 014.
