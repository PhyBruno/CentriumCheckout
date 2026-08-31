# Implementation Plan: Venda Rápida por Cenário de Pagamento (F6–F9)

**Branch**: `013-venda-rapida-cenario-pagamento` | **Date**: 2026-08-31 | **Spec**: `specs/013-venda-rapida-cenario-pagamento/spec.md`

**Input**: Feature specification from `specs/013-venda-rapida-cenario-pagamento/spec.md`, complementada pela inspeção direta da KB GeneXus do ERP (objetos `PCheckout_GetSessao`, `TCenarioPagamento`, `PCenarioPagamento_RevisaTeclasAtalho`, `PCenarioPagamento_BuscaPorTeclaAtalho`), pelo contrato `Fluxograma - Diagrama - Alinhamentos/ApiCentriumOAuth.yaml` versão `20260827192357` e pelas decisões arquiteturais de `.specs/project/STATE.md` (AD-006, AD-030, AD-036, AD-071, AD-072, AD-074, AD-085, AD-097, e os novos AD-104/AD-105/AD-106 abertos por esta fase de Design).

## Summary

O ERP passou a expor, no payload de sessão, um catálogo de **cenários de pagamento** — combinações nomeadas de condição + forma com uma tecla de atalho associada. Esta feature transforma esse catálogo em até quatro atalhos (F6–F9) que lançam o pagamento inteiro da venda de uma vez e, quando o cenário assim indicar, finalizam a venda sem confirmação.

O desenho é deliberadamente **fino**: a feature 013 não implementa pagamento nem finalização — ela é uma camada de comando sobre o domínio já existente das features 008 e 004, com todas as dependências injetadas por porta (`contracts/venda-rapida-domain-api.md`). O valor lançado é o saldo em aberto integral em `Centavos` vindo do domínio da 008, nunca um cálculo novo (Constitution V), e a finalização reaproveita integralmente as validações da 004 — o atalho substitui o gesto do operador, jamais as regras.

O peso real do trabalho está na **fronteira**. `SessaoUsuario.CenarioPagamento` é declarado como `string` no OpenAPI e, por dentro, é um array JSON de strings com sete campos posicionais separados por `;` (AD-104). O ERP não impõe nenhuma das restrições que a feature precisa: não limita a quatro cenários, não restringe a tecla a F6–F9 (`CPgTeclaAtalho` é `VARCHAR(40)` sem domínio), e nem sequer filtra cenários sem atalho na consulta. Pior, três dos sete campos são texto livre e podem conter o próprio delimitador, tornando itens malformados genuinamente ambíguos (AD-105). O plano responde com um pipeline de normalização total de seis etapas puras, no qual todo item duvidoso é descartado em silêncio e o pior desfecho possível é "nenhum atalho disponível" — nunca um pagamento na condição errada. A interpretação do booleano de encerramento é assimétrica de propósito (AD-106): na dúvida, **não** finaliza, porque errar para "false" custa um clique e errar para "true" emite uma NFCe que o operador não pediu.

## Technical Context

**Language/Version**: TypeScript `strict`, React 19 + Vite — feature inteiramente client-side. Nenhuma rota nova de servidor; o BFF da feature 002 participa apenas como origem do payload de bootstrap já existente.

**Primary Dependencies**: Zod (validação de fronteira do campo `CenarioPagamento`); `react-hotkeys-hook` pelo mapa central de atalhos exigido pela skill de projeto `react-hotkeys-pdv`; Zustand + Immer (um único campo booleano de guard no slice de pagamento); shadcn/ui + Boneyard (dica visual dos atalhos). **Nenhuma biblioteca de dinheiro** — `Centavos` vem do domínio das features 003/008 (AD-071/AD-072).

**Storage**: N/A. O catálogo é lido do payload de sessão que a feature 002 já persiste em Dexie; esta feature **lê**, nunca grava. O único estado novo (`acionamentoEmAndamento`) vive em memória e morre com a venda (Constitution VI, AD-006).

**Testing**: Vitest + Testing Library. Unitários puros (sem React) para parser e projeção — cobrindo I1–I5 e I10–I11 de `data-model.md` por tabela de entradas. Integração do comando sobre o slice real de pagamento para I6–I9 e I12, incluindo o teste negativo de acionamento concorrente. Playwright para o fluxo dourado de `quickstart.md` (C1) e para a não colisão com bipagem (C8).

**Target Platform**: Navegador desktop (Chrome prioritário). O layout mobile é explicitamente excluído (`FR-020`) — não por limitação técnica, mas por decisão de produto do usuário; a exclusão é expressa como capacidade `plataforma` injetada, no mesmo padrão de AD-074.

**Performance Goals**: O parse do catálogo ocorre **uma vez por sessão**, sobre dezenas de itens — custo desprezível e fora do caminho crítico da venda. O acionamento é síncrono e local até o ponto em que uma integração externa entra em cena, atendendo `SC-002` (< 1s) para cenários sem TEF/PIX. Nenhuma chamada nova ao ERP é introduzida.

**Constraints**:
- Parser **total**: nenhuma entrada do ERP pode lançar exceção; catálogo ilegível degrada para "sem atalhos" (I4).
- Item com número de campos diferente de 7 é descartado, sem heurística de recuperação (AD-105) — em pagamento, "provavelmente certo" é pior que ausente.
- `encerraOperacao` indeterminado ⇒ `false` (AD-106).
- Valor lançado é sempre o saldo em aberto **integral**, em `Centavos` inteiros, não editável no ato (`FR-008`).
- Finalização automática sem diálogo de confirmação (`FR-010`), mas **jamais** com saldo em aberto ou após falha de lançamento (I7, I8).
- Cenários com forma que exige TEF/PIX permanecem elegíveis; a finalização automática espera a aprovação da integração (`FR-013`, D10).
- Atalhos ativos durante toda a venda (`FR-019`), o que torna a não colisão com digitação e bipagem requisito de correção, não higiene (`FR-014`).
- No máximo um lançamento por acionamento, garantido por guard de estado e não por debounce (I9).

**Scale/Scope**: 1 parser de fronteira + 1 projeção pura + 1 comando de acionamento + 1 campo de estado + 1 superfície de UI (dica de atalhos) + 1 tipo de evento de auditoria. Fora do escopo: aplicação de pagamento (008), fluxo de PIX (009) e de TEF (010), finalização (004), layout mobile (007) e o cadastro dos cenários (ERP).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Avaliação (pré-Phase 0) | Re-avaliação (pós-Phase 1) |
|---|---|---|
| I. Spec-Driven Development | ✅ Resultado de `/speckit-specify` + `/speckit-plan` sobre `spec.md`, na sequência obrigatória. | ✅ Mantido — todo artefato rastreia a um `FR-xxx`; os três achados de contrato viraram AD numerados (AD-104/105/106) e duas pendências de ERP (itens 34 e 35), em vez de decisão implícita no código. |
| II. Arquitetura SOLID | ✅ Planejado em camadas com responsabilidade única: parser ↔ projeção ↔ comando ↔ UI. | ✅ Confirmado em `contracts/venda-rapida-domain-api.md`: o comando recebe saldo, aplicação de forma, roteamento, finalização e auditoria como **portas injetadas** (Dependency Inversion) e não importa PIX, TEF, layout nem componentes. A UI recebe `ListaAtalhos` pronta e não filtra nada — qualquer regra que apareça no componente é violação explícita do contrato. |
| III. ERP como Fonte Única de Verdade | ✅ O Checkout não decide quais cenários existem — lê o que o ERP publicou na sessão. | ✅ Confirmado e reforçado: leitura estritamente unidirecional, sem gravação nem correção de cenários no ERP. As restrições que o ERP não impõe (faixa de tecla, teto de 4) são reconhecidas como regra **do Checkout** e documentadas como tal, em vez de atribuídas erroneamente ao ERP. |
| IV. Tipagem Estrita e Validação de Fronteira | ✅ Zod obrigatório sobre `CenarioPagamento`, campo declarado apenas como `string` no OpenAPI. | ✅ Confirmado: `TeclaAtalho` é união fechada, então um atalho com tecla inválida é inconstruível; `ResultadoAcionamento` é união discriminada, impedindo ler `valorLancado` sem checar o desfecho; `AtalhoVendaRapida` só existe válido — não há estado "atalho inválido" para alguém esquecer de tratar. |
| V. Precisão Monetária Inegociável | ✅ Nenhum cálculo monetário novo; `Centavos` inteiros reusados de 003/008. | ✅ Confirmado em `data-model.md` (I6): o valor lançado é o retorno de `obterSaldoEmAberto` repassado sem transformação. A feature não soma, não divide e não arredonda dinheiro — literalmente não há aritmética monetária a auditar aqui, o que é o resultado desejado. |
| VI. Sem Estado de Venda Persistido no Cliente | ✅ Único estado novo é um booleano de guard, sem `persist`. | ✅ Confirmado: o catálogo é projeção derivada do bootstrap (D7), fora do `vendaStore`, respeitando a fronteira da skill `zustand-immer-state`; nada desta feature grava em Dexie ou localStorage. |

Nenhuma violação identificada em nenhuma das duas avaliações. Nenhuma entrada necessária em "Complexity Tracking".

## Project Structure

### Documentation (this feature)

```text
specs/013-venda-rapida-cenario-pagamento/
├── plan.md              # Este arquivo (/speckit-plan)
├── research.md          # Phase 0 — D1..D13 + achados colaterais de contrato
├── data-model.md        # Phase 1 — entidades, pipeline E1–E6, fluxo G1–P7, invariantes I1–I12
├── quickstart.md        # Phase 1 — cenários de validação C1–C11
├── contracts/           # Phase 1
│   ├── erp-cenario-pagamento-api.md    # fronteira: campo CenarioPagamento + schema Zod
│   └── venda-rapida-domain-api.md      # camadas, portas injetadas, evento de auditoria
├── checklists/
│   └── requirements.md  # checklist de qualidade da spec (16/16)
└── tasks.md             # Phase 2 — gerado por /speckit-tasks, NÃO por este comando
```

### Source Code (repository root)

Projeto ainda em pré-código (`.specs/project/STATE.md`); a árvore abaixo é o alvo desta feature dentro da estrutura já assumida pelas features 003/008.

```text
src/client/
├── domain/vendaRapida/
│   ├── parsearCenarios.ts        # E1–E2 (parser total)
│   ├── projetarAtalhos.ts        # E3–E6 (projeção pura)
│   └── tipos.ts                  # TeclaAtalho, AtalhoVendaRapida, ResultadoAcionamento
├── schemas/cenarioPagamento.ts   # schema Zod de fronteira
├── features/vendaRapida/
│   ├── useAcionarCenario.ts      # comando G1–P7, dependências injetadas
│   └── DicaAtalhos.tsx           # superfície de UI (desktop)
└── hotkeys/mapaAtalhos.ts        # registro de F6–F9 (arquivo já existente)

tests/
├── unit/vendaRapida/             # I1–I5, I10–I11
├── integration/vendaRapida/      # I6–I9, I12
└── e2e/venda-rapida.spec.ts      # C1, C8
```

## Phase 0 — Research

Concluída. Ver `research.md`: 13 decisões (D1–D13) e cinco achados de contrato colaterais que **não** pertencem a esta feature (novo endpoint `ValidarNFCe`, remoção de `DavNum`, `ListaPrecoDefault`, `FormaEntrada`, e a confirmação da ressalva de AD-048 sobre `FormaFpgUtiCar`), registrados para tratamento nas features 004, 005/003, 006 e 008.

Nenhum `NEEDS CLARIFICATION` restou: as três questões abertas na especificação foram resolvidas por decisão direta do usuário em 2026-08-31 (elegibilidade de formas com TEF/PIX, acionamento em qualquer momento da venda, exclusividade de desktop).

## Phase 1 — Design & Contracts

Concluída. Artefatos: `data-model.md`, `contracts/erp-cenario-pagamento-api.md`, `contracts/venda-rapida-domain-api.md`, `quickstart.md`.

## Decisões arquiteturais abertas por esta fase

| AD | Conteúdo | Onde |
|---|---|---|
| **AD-104** | O catálogo de cenários de pagamento vem embutido em `SessaoUsuario.CenarioPagamento` (string com array JSON de 7 campos delimitados por `;`), **não** existe endpoint dedicado — mesmo padrão de AD-097 | `research.md` D1–D2 |
| **AD-105** | Item do catálogo com número de campos diferente de 7 é descartado sem heurística de recuperação; pedido ao ERP de serialização estruturada fica como pendência (item 34) | `research.md` D3 |
| **AD-106** | `CPgIsEncerraOperacao` é interpretado por conjunto fechado de literais, com `false` como padrão fail-safe; literal exato a confirmar contra resposta real (item 35) | `research.md` D4 |

## Pendências abertas em `.specs/project/PENDENCIES.md`

| Item | Conteúdo | Bloqueia? |
|---|---|---|
| 34 | Pedir ao ERP serialização estruturada de `CenarioPagamento` (ou proibição de `;` nos textos do cadastro) | Não — o descarte cobre o caso |
| 35 | Confirmar o literal exato de `CPgIsEncerraOperacao` em resposta real de homologação | Não — o padrão fail-safe cobre o caso |
| 36 | Tratar os cinco achados colaterais de contrato nas features 004, 005/003, 006 e 008 | Não para esta feature; **sim** para a 006 (`DavNum` removido) |

## Próximo passo

`/speckit-tasks` para gerar `tasks.md` em ordem topológica. A ordem natural é: tipos e schema de fronteira → parser → projeção → comando → registro de atalhos → UI → e2e; os testes de I1–I5 podem ser escritos antes do parser (RED/GREEN via `ecc:tdd-workflow`), já que dependem apenas de `data-model.md`.
