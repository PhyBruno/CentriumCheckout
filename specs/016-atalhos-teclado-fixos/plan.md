# Implementation Plan: Atalhos de teclado fixos do Checkout

**Branch**: `docs/spec-atalhos-teclado-fixos` | **Date**: 2026-09-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/016-atalhos-teclado-fixos/spec.md`

## Summary

A feature adiciona cinco atalhos fixos (F1, F2, F3, F4, F10) ao PDV, mas o requisito que decide o desenho é FR-001/FR-005: **posse permanente da tecla**, independente de dado remoto, de plataforma e do foco corrente.

A abordagem tem três movimentos, nesta ordem de dependência:

1. **Separar posse de disponibilidade no mapa central.** Um segundo registro, `useTeclasFixas`, ao lado do `useAtalhosDeTeclado` existente. Ele registra o conjunto fixo de teclas **uma vez, sempre habilitado**, com `preventDefault` incondicional, e decide *dentro do handler* se executa a ação ou apenas engole a tecla. O `useAtalhosDeTeclado` atual continua servindo F6–F9 sem mudança de comportamento.
2. **Dar um dono único e alcançável às janelas.** O estado "qual janela está aberta" hoje mora em três componentes-folha (`BotaoMenuImportacao`, `CampoClienteVenda`, `EntradaRapidaProduto`), abaixo da bifurcação de layout — inalcançável a partir de um atalho registrado na raiz. Sobe para um store pequeno (`janelasStore`), no precedente já existente de `edicaoItemStore` e `focoVendaStore`.
3. **Registrar na raiz da tela de venda.** `AppShell` é o único ponto montado durante toda a venda e **acima** da bifurcação desktop/mobile — é o que satisfaz FR-004 (um dono por tecla) e FR-010 (independência de plataforma) por construção, sem nenhuma checagem condicional.

Nenhuma regra de negócio é escrita nesta feature. As cinco ações já existem e são acionáveis por clique; o atalho passa pelos mesmos pontos de entrada (FR-018).

## Technical Context

**Language/Version**: TypeScript 5.x `strict`, React 19

**Primary Dependencies**: `react-hotkeys-hook` 5.3.3 (já é dependência de produção, AD-176), Zustand 5 + Immer, TanStack Query

**Storage**: N/A — nenhum estado novo persistido. O store introduzido é de UI em memória, sem `persist` (Constitution VI)

**Testing**: Vitest + Testing Library (`user-event`), E2E Playwright

**Target Platform**: Navegador do PDV (Chrome/Edge), desktop e tela de toque

**Project Type**: SPA React (frontend único, sem backend de domínio)

**Performance Goals**: o acionamento é percebido como instantâneo; nenhuma consulta nova ao ERP é introduzida

**Constraints**:
- A tecla **nunca** pode alcançar o navegador nos cinco casos reservados, em nenhum estado da aplicação (FR-001, FR-002, FR-005)
- Nenhuma tecla pode ser registrada em dois pontos (FR-004) — `eventoIgnorado` consulta `defaultPrevented`, então dois donos se anulariam conforme a ordem de montagem
- O leitor de código de barras é um teclado rápido emitindo dígitos, letras e `Enter`; nenhum atalho global pode usar tecla alfanumérica

**Scale/Scope**: 5 teclas novas + ajuste em 4 teclas existentes; ~6 arquivos de produção alterados, 2 criados

## Constitution Check

*GATE: avaliado antes da Phase 0 e reavaliado após a Phase 1.*

| Princípio | Veredito | Justificativa |
|---|---|---|
| **I. Spec-Driven Development** | ✅ Passa | Sequência respeitada: `/speckit-specify` (spec.md) → este plano. Nenhum código escrito antes. |
| **II. Arquitetura SOLID** | ✅ Passa | O desenho existe *por causa* de SRP: posse da tecla e disponibilidade da ação são duas razões de mudança distintas e hoje estão fundidas em `enabled`. O `janelasStore` tira de três componentes-folha uma responsabilidade que não é deles. `useTeclasFixas` é aberto para extensão (tecla nova entra no mapa) e fechado para modificação (o hook não muda). |
| **III. ERP como fonte única de verdade** | ✅ Passa | Nenhuma regra de negócio é reimplementada. FR-018 exige o mesmo ponto de entrada do clique, e a recusa de importação continua vindo de `useRecusaDeImportacao`/`mensagemDeRecusa`. Nenhuma chamada nova ao ERP. |
| **IV. Tipagem estrita e validação de fronteira** | ✅ Passa | Nenhum dado externo novo entra. O mapa de teclas é uma constante literal do produto, com união fechada — sem `any`, sem `as`. |
| **V. Precisão monetária** | ➖ N/A | A feature não calcula valor. F10 aciona suspensão, que não recalcula nada. |
| **VI. Sem estado de venda persistido** | ✅ Passa | `janelasStore` guarda qual janela está aberta — estado de UI, em memória, sem `persist`, descartado no reload junto com a venda. Não é estado de venda. |
| **Branch por alteração** | ✅ Passa | `docs/spec-atalhos-teclado-fixos`, PR obrigatório. |
| **Gates antes de push** | ⏳ Pendente | `npx tsc --noEmit` antes de qualquer push; `/owasp-security` antes de merge a `master`. |

**Resultado (pré-Phase 0)**: nenhuma violação. Seção "Complexity Tracking" omitida.

**Reavaliação pós-Phase 1**: mantida sem violação. O desenho fechado em `research.md` e `data-model.md` **reforça** II e III em vez de tensioná-los — a máquina de três estágios separa posse, elegibilidade do evento e disponibilidade da ação em responsabilidades que hoje estão fundidas no `enabled`, e a tabela de disponibilidade (`data-model.md` §5) documenta que toda regra continua vindo de onde já vinha. Os dois módulos novos (`mapaFixo.ts`, `janelasStore.ts`) somam um tipo e um enum, sem lógica de negócio. VI permanece satisfeito: `janelasStore` é estado de UI em memória, sem `persist`.

## Project Structure

### Documentation (this feature)

```text
specs/016-atalhos-teclado-fixos/
├── plan.md              # Este arquivo
├── research.md          # Phase 0 — 11 decisões de pesquisa
├── data-model.md        # Phase 1 — mapa de teclas, estado de janela, máquina de decisão
├── quickstart.md        # Phase 1 — 10 cenários de validação
├── contracts/
│   └── atalhos-fixos-api.md   # Contrato dos módulos novos e dos alterados
├── checklists/
│   └── requirements.md  # Gate de qualidade da spec (sem pendências)
└── tasks.md             # Phase 2 — NÃO criado por /speckit-plan
```

### Source Code (repository root)

```text
src/client/
├── hotkeys/
│   ├── mapaAtalhos.ts          # ALTERADO — ganha useTeclasFixas ao lado de useAtalhosDeTeclado
│   └── mapaFixo.ts             # NOVO — a constante do mapa fixo (tecla, comando, rótulo)
├── stores/
│   └── janelasStore.ts         # NOVO — qual janela está aberta; dono único
├── layout/
│   └── AppShell.tsx            # ALTERADO — único call site do registro das teclas fixas
├── domain/
│   ├── vendaRapida/
│   │   ├── projetarAtalhos.ts  # ALTERADO — perde o curto-circuito de plataforma (FR-011)
│   │   └── tipos.ts            # ALTERADO — plataforma sai da projeção
│   └── auditoria/
│       └── eventos.ts          # ALTERADO — origem 'TECLADO' para as ações novas (FR-019)
├── features/
│   ├── importacao/
│   │   └── BotaoMenuImportacao.tsx   # ALTERADO — JanelaAberta local sobe para o store
│   ├── cliente/
│   │   └── CampoClienteVenda.tsx     # ALTERADO — abertura do modal passa pelo store
│   ├── carrinho/
│   │   └── EntradaRapidaProduto.tsx  # ALTERADO — idem
│   └── venda-rapida/
│       └── DicaAtalhos.tsx           # ALTERADO — faixa visual assume a condição de plataforma
└── lib/
    └── useFocoDeModal.ts       # ALTERADO — foco inicial declarado + consulta "há janela aberta"
```

**Structure Decision**: SPA React de projeto único (`src/client`), sem backend de domínio. A feature não cria camada nova: usa as três que já existem — domínio puro (`domain/`), estado (`stores/`), e borda React (`hotkeys/`, `features/`, `layout/`). O único módulo novo de infraestrutura é `hotkeys/mapaFixo.ts`, que é constante de produto, não lógica.

## Riscos conhecidos

| Risco | Impacto | Mitigação planejada |
|---|---|---|
| Subir a abertura do modal de produto e de cliente para o store pode arrastar estado vizinho (termo de busca pré-preenchido, item em edição) que hoje vive junto do `useState` local | Refatoração maior que o previsto em `EntradaRapidaProduto.tsx` e `CampoClienteVenda.tsx` | O store guarda **apenas** qual janela está aberta; qualquer parâmetro de abertura continua local. Tarefa de investigação dedicada antes da alteração, com a decisão registrada em `research.md` D8 |
| `useFocoDeModal` hoje trata armadilha de foco, não foco inicial; modais não desmontam ao fechar (ficam ocultos) | Um `focus()` disparado cedo demais em subtree `inert` é ignorado **em silêncio** | Foco inicial passa a ser responsabilidade declarada do próprio `useFocoDeModal`, aplicado um render depois de a janela deixar de ser inerte — um lugar só, quatro modais atendidos (FR-020/FR-021) |
| Remover `plataforma` de `projetarAtalhos` muda a assinatura de uma função de domínio puro com testes existentes | Testes da 013 quebram em massa | A remoção é o objetivo (FR-011); os testes de plataforma migram para `DicaAtalhos`, onde a condição passa a viver (FR-012) |
| `defaultPrevented` cruzado entre os dois registros | Um mapa anularia o outro | Os conjuntos de teclas são disjuntos por construção (F1–F4/F10 contra F6–F9) e o `data-model.md` declara a disjunção como invariante testável |
