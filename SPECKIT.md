# Spec Kit — Workflow Obrigatório para CentriumCheckout

**Versão:** 1.0  
**Instalação:** [Spec Kit (GitHub)](https://github.com/github/spec-kit)  
**Referência completa:** Ver seção "Spec-Driven Development" em `CLAUDE.md`

## Quando usar

**TODA** mudança de código segue este workflow:

- ✅ Nova feature
- ✅ Bugfix
- ✅ Refatoração
- ✅ Otimização de performance
- ✅ Mudança de dependência

**NENHUMA exceção.** O workflow é a garantia de rastreabilidade requisito → implementação.

---

## Sequência Obrigatória

### 1️⃣ `/speckit.specify` — Defina o requisito

Crie um arquivo `speckit.json` na raiz do projeto (ou use existente):

```bash
/speckit.specify
```

O comando abre um editor interativo onde você declara:

- **Título** da feature/bug/refator
- **Descrição** do problema ou comportamento esperado
- **Requisitos** (o que deve ser verdade no fim)
- **Invariantes** (o que NUNCA pode mudar)
- **Casos de limite** (edge cases, exceções)
- **Dependências** (outras features/APIs que precisam estar prontas)

**Exemplo — Feature: Suporte a desconto de convênio:**

```
Título: Desconto de convênio na NFCe

Requisitos:
- O ERP retorna % desconto para código de convênio informado
- Precificação recalcula preço total com desconto aplicado
- Desconto não pode tornar preço negativo
- Auditoria registra (usuário, convênio, %, timestamp)

Invariantes:
- Desconto nunca modifica preço unitário do produto
- Desconto é aplicado APÓS impostos, não antes
- Cartão de crédito valida desconto com TEF

Casos de limite:
- Convênio inativo (ERP retorna 0%) → sem desconto
- Desconto > 100% → rejeita, retorna erro 422
- Conexão ERP cai durante cálculo → erro recoverable, retry automático

Dependências:
- AD-023 (ApiCentriumOAuth.yaml com novo endpoint GetDescontoConvenio%)
```

### 2️⃣ `/speckit.tasks` — Gere tarefas em ordem

```bash
/speckit.tasks
```

Spec Kit analisa a especificação e gera tarefas decompostas:

**Fases (topológicas):**

1. **Setup** — Dependências, configuração, tipos TypeScript
2. **Foundational** — Store Zustand, schemas Zod, tipos básicos
3. **Feature** — Componentes React, lógica, integração com ERP
4. **Testing** — Testes unitários, integração, E2E

**Exemplo de saída:**

```
Setup (deve executar primeiro):
  [ ] Task 1: Criar tipos TypeScript para DescontoConvenio (schema Zod + z.infer)
  [ ] Task 2: Atualizar bootstrap do ERP com novo endpoint GetDescontoConvenio%

Foundational:
  [ ] Task 3: Adicionar slice ao store Zustand (desconto.convenioCodigo, desconto.percentual)
  [ ] Task 4: Adicionar regra de precificação com desconto (money-precision)
  [ ] Task 5: Validar % em fronteira (Zod)

Feature:
  [ ] Task 6: Input de código de convênio (componente React)
  [ ] Task 7: Chamada ao ERP (TanStack Query) quando código muda
  [ ] Task 8: Atualizar visor de precificação com desconto
  [ ] Task 9: Fluxo de erro + retry quando ERP falha

Testing:
  [ ] Task 10: Testes unitários de precificação com desconto
  [ ] Task 11: Testes E2E: selecionar convênio → validar preço final
  [ ] Task 12: Security review (OWASP) antes de merge a main
```

Cada tarefa tem **critério de aceitação** testável — será usado em `/speckit.implement`.

### 3️⃣ `/speckit.implement [Task N]` — Execute na ordem

```bash
/speckit.implement
```

Executa **todas** as tarefas em sequência topológica. O agente:

1. Lê a especificação + tarefa atual
2. Ativa skills relevantes conforme tipo:
   - **Setup/Foundacional (tipos, schemas, store)** → `typescript-strict`, `zod-boundary-validation`, `zustand-immer-state`
   - **Feature (componentes, queries, precificação)** → `ecc:react-build`, `ecc:react-review`, `tanstack-query-checkout`, `money-precision`
   - **Testing (unitário, integração, E2E)** → `vitest-testing-library-react`, `ecc:e2e-testing`
   - **Security** → `owasp-security` (obrigatório antes de push a main)
3. Implementa, testa, documenta
4. Avança para próxima tarefa

**Ou implemente tarefa específica:**

```bash
/speckit.implement Task 6: Input de código de convênio
```

---

## Skills Acionadas Automaticamente

| Tipo de Tarefa | Skills Acionadas | Quando |
|---|---|---|
| **TypeScript / Tipos** | `typescript-strict` | Sempre (veto a `any`, `as`, `!` na fronteira) |
| **Zod Schema** | `zod-boundary-validation` | Schemas de entrada de dados |
| **Zustand Store** | `zustand-immer-state` | Quando tarefa cria/modifica store |
| **React Componente** | `ecc:react-build`, `ecc:react-review` | Criação/edição de componentes .tsx |
| **React Hook** | `vitest-testing-library-react` | Se o hook tem testes |
| **Precificação** | `money-precision` | Qualquer cálculo monetário |
| **TanStack Query** | `tanstack-query-checkout` | Queries de produto/pagamento do ERP |
| **Dexie/IndexedDB** | `dexie-bootstrap-cache` | Persistência de bootstrap |
| **Testes Unitários** | `ecc:tdd-workflow` (RED/GREEN/checkpoint) | Dentro de `/speckit.implement` |
| **E2E (Playwright)** | `ecc:e2e-testing` | Testes de fluxo completo |
| **Security (OWASP)** | `owasp-security` | **Obrigatório antes de merge a main** |

**Não são acionadas automaticamente:**

- `ecc:frontend-patterns`, `ecc:docker-patterns`, etc. — Use manualmente se a tarefa exigir
- `superpowers:brainstorming`, `superpowers:test-driven-development` — Use fora de Spec Kit (planejamento)

---

## MCPs Complementares

**Durante `/speckit.specify`:**

- **`genexus`** (user MCP) — Ao descrever requisitos de API, consulte KB GenExus para confirmar endpoints/contracts atuais
- **`context7`** (user MCP) — Ao descrever padrões React/Zod/Zustand, busque docs atuais das versões fixadas

**Durante `/speckit.implement`:**

- **`dual-graph`** (project MCP local) — Injetará padrões já usados no repo ao contexto

---

## Git Workflow (Integrado)

Cada tarefa = **1 commit** (ou fixup se erro):

```bash
# Após Task N completar:
git add .
git commit -m "feat/fix: [Task N] descrição curta

Especificação: <URL de speckit.json ou task ID>
Critério de aceitação: [copiado de Task N]
Co-Authored-By: Claude Haiku <noreply@anthropic.com>"
```

**Antes de merge a `main`:**

1. ✅ `typescript-strict` passou (`npx tsc --noEmit`)
2. ✅ `ecc:code-review` aprovado
3. ✅ `owasp-security` sem findings críticos
4. ✅ Todos os testes passam (`npm test`, `npm run e2e`)
5. ✅ Cobertura >= 80% (exceto UI pura)

---

## Exemplo de Sessão Completa

```bash
# 1. Começar feature
/speckit.specify
  → Define: "Suporte a desconto de convênio"
  → Salva em speckit.json

# 2. Gerar tarefas
/speckit.tasks
  → 12 tarefas criadas (Setup → Foundational → Feature → Testing)

# 3. Implementar
/speckit.implement
  → Task 1: TypeScript/Zod types — `typescript-strict`, `zod-boundary-validation`
  → Task 2: Atualizar bootstrap — [manual: verificar KB GenExus]
  → Task 3: Zustand store — `zustand-immer-state`
  → Task 4: Precificação — `money-precision`
  → Task 5: Validação fronteira — `zod-boundary-validation` (novamente)
  → Task 6: Componente — `ecc:react-build`, `ecc:react-review`
  → Task 7: Query TanStack — `tanstack-query-checkout`
  → Task 8: Visor — `ecc:react-review` (novamente)
  → Task 9: Error handling — `ecc:error-handling`
  → Task 10: Testes unitários — `ecc:tdd-workflow`
  → Task 11: E2E — `ecc:e2e-testing`
  → Task 12: Security — `owasp-security` ← OBRIGATÓRIO

# 4. Review & Merge
git push origin feature/desconto-convenio
→ /code-review da branch
→ /owasp-security ANTES de merge a main
→ Merge + delete branch
```

---

## Troubleshooting

### P: O que fazer se uma tarefa falhar?

R: `/speckit.implement Task N` novamente. O agente reexecuta a tarefa, com contexto de especificação ainda presente.

### P: Posso pular a fase "Setup"?

R: **NÃO.** Setup define tipos/schemas que toda feature seguinte depende. Pular Setup causa bugs de type-safety depois.

### P: Como atualizar especificação no meio da implementação?

R: `/speckit.specify` (novamente). Spec Kit detecta mudanças e regera tarefas conforme necessário. Tarefas já completadas permanecem como estão.

### P: E se a dependência (ex.: AD-023) ainda não existir?

R: Marque-a em `speckit.json` como "Bloqueada por AD-023". `/speckit.tasks` não gera tarefas dependentes até que bloqueador seja removido.

---

## Referência Rápida

| Command | O que faz |
|---|---|
| `/speckit.specify` | Abre editor interativo de especificação |
| `/speckit.tasks` | Gera tarefas topológicas de especificação |
| `/speckit.implement` | Executa todas as tarefas (ou específica) com skills automáticas |
| `/speckit.implement Task N` | Executa somente tarefa N |
| `/speckit.check` | Valida especificação (sem executar) |

**Mais detalhes:** [Spec Kit Docs](https://github.com/github/spec-kit/tree/main/docs)

---

**Mantenha esta página atualizada.** Feedback sobre workflow Spec Kit neste projeto? Abra PR em `rules.md` ou `CLAUDE.md`.
