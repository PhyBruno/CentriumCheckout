# CLAUDE.md — CentriumCheckout (CheckoutWEB)

Instruções de projeto para o Claude Code. Estas regras têm precedência sobre o comportamento padrão. Para contexto de produto/arquitetura, ver `ARCHITECTURE.md` (raiz) — documento vivo e fonte de verdade da stack, do fluxo de negócio e das regras do motor de precificação. Para tokens visuais, ver `design/DESIGN-coinbase.md` e `design/CentriumCheckout.pen`.

## 1. Visão geral

PDV web (CheckoutWEB), acessado via redirecionamento do ERP, 100% gerado por IA. Stack fixada: **React 19**, **TypeScript strict**, **Zustand 5** (+Immer), **TanStack Query**, **Dexie.js**, **Zod 4**, **react-hotkeys-hook**, **Vitest + Testing Library + Playwright**, **Docker**. Detalhe completo: `ARCHITECTURE.md`.

Skills de projeto já configuradas em `.claude/skills/` (money-precision, zustand-immer-state, tanstack-query-checkout, dexie-bootstrap-cache, zod-boundary-validation, typescript-strict, react-hotkeys-pdv, vitest-testing-library-react) — consultar `.claude/skills/README.md` antes de tocar nas áreas que cobrem.

## 2. Planejamento: Spec-Driven Development (skill `tlc-spec-driven`)

O projeto usa a estrutura `.specs/` (SDD, profundidade auto-dimensionada por complexidade):

```
.specs/
├── project/    # PROJECT.md, ROADMAP.md, STATE.md (visão, milestones, memória persistente)
├── codebase/   # STACK/ARCHITECTURE/CONVENTIONS/STRUCTURE/TESTING/INTEGRATIONS/CONCERNS.md
│               # gerado por "map codebase" — NUNCA fabricar; só a partir de código real existente
├── features/   # uma pasta por feature especificada (spec.md, context.md, design.md, tasks.md)
└── quick/      # tarefas ad-hoc (≤3 arquivos, escopo de uma frase)
```

As pastas acima existem mas estão **vazias** — nenhum conteúdo de spec foi gerado ainda. Antes de iniciar qualquer feature, invocar a skill `tlc-spec-driven` (Specify → Design → Tasks → Execute, pulando fases que a complexidade não exigir) em vez de implementar direto.

## 3. TDD — obrigatório

- Todo código de produção nasce de um teste que falha primeiro (RED) antes da implementação (GREEN). Ver skill `ecc:tdd-workflow` / `superpowers:test-driven-development`.
- Cobertura mínima: 80%+.
- Nunca enfraquecer, apagar ou pular (`skip`/`disable`/`pending`) um teste para fazê-lo passar. Teste é a especificação — implementação se conforma a ele, não o contrário. Se um teste estiver genuinamente errado, parar e confirmar com o usuário antes de alterá-lo.
- Gate check (build + lint + testes) é o critério objetivo de "pronto" — não a autoavaliação do agente.

## 4. Fluxo de Git — obrigatório

**Regra central: nunca commitar diretamente em `master`.** Todo commit vive em uma branch de fase/feature, empurrada (`git push`) para o remoto `origin`.

1. **Antes do primeiro commit de qualquer fase de implementação** (uma milestone do `ROADMAP.md`, uma feature especificada, ou uma tarefa `quick`), criar uma branch nova a partir de `master` atualizada:
   ```
   git checkout master && git pull && git checkout -b <tipo>/<slug>
   ```
2. **Convenção de nome de branch:**
   - `feature/<slug>` — feature especificada via SDD
   - `phase/<NN>-<slug>` — milestone do ROADMAP.md
   - `fix/<slug>` — correção pontual (modo quick)
   - `chore/<slug>` — manutenção, config, docs
3. **Commits atômicos** dentro da branch, um por tarefa, seguindo Conventional Commits (`feat`, `fix`, `refactor`, `docs`, `test`, `chore`, etc. — ver `implement.md` da skill `tlc-spec-driven` para o formato completo).
4. **Push regular da branch para `origin`** — no mínimo após cada commit atômico relevante ou ao final de cada sessão de trabalho (nunca deixar trabalho só local). Nunca dar push direto em `master`.
5. **Merge em `master` só depois do gate check verde** (build + lint + testes) da fase inteira, e só com confirmação do usuário — não fazer merge/PR automático sem autorização explícita.
6. Force-push, `git reset --hard`, ou qualquer operação destrutiva em `master` ou em branches compartilhadas: sempre pedir confirmação antes, mesmo que pareça necessário para "limpar" o histórico.

## 5. GateGuard — Fact-Forcing Gate (plugin ativo globalmente)

Este repositório roda sob o plugin **GateGuard**, que intercepta chamadas de `Edit`, `Write` e `Bash` e bloqueia a execução até que fatos específicos sejam declarados em texto **antes** da chamada. Isso vale para qualquer sessão do Claude Code neste projeto — documentado aqui para que a regra fique visível independentemente da configuração global de quem estiver operando.

**Antes de qualquer `Update`, `Edit` ou `Write`, declarar em texto:**

1. Todos os arquivos que importam/referenciam o arquivo-alvo (usar `Grep`/`Glob` se necessário).
2. Funções ou classes públicas afetadas pela mudança.
3. Se o arquivo lê ou grava dados externos: nome dos campos, estrutura e formato — usando valores sintéticos, nunca dados reais de produção/tenant.
4. A instrução atual do usuário, citada literalmente (verbatim).

Em seguida, antes de chamar `Edit`: usar `Read` no arquivo-alvo, confirmar que o `old_string` é **idêntico** ao conteúdo em disco (indentação, quebras de linha, caracteres especiais) e só então chamar `Edit`.

**Antes da primeira chamada `Bash` de cada sessão (e sempre que o gate bloquear), declarar em texto:**

1. O pedido atual do usuário em uma frase.
2. O que o comando específico verifica ou produz.

**Se o gate bloquear pedindo fatos adicionais (ex.: confirmar que nenhum arquivo existente já cumpre o mesmo papel), fornecer exatamente o que foi pedido e reenviar a mesma chamada — nunca contornar com `ECC_GATEGUARD=off` ou `ECC_DISABLED_HOOKS` sem autorização explícita do usuário para aquela sessão.**

## 6. Escopo e simplicidade

- Sem features além do pedido, sem abstração para uso único, sem "flexibilidade" não solicitada.
- Mudanças cirúrgicas: não "melhorar" código adjacente, não refatorar o que não está quebrado.
- Toda linha alterada deve rastrear diretamente ao pedido do usuário — achou algo fora de escopo (que não seja bug — ver seção 7)? Registrar em `.specs/project/STATE.md` (Deferred Ideas/Todos) quando esse arquivo existir, e não agir sobre isso na mesma tarefa.

## 7. Bugs identificados — correção obrigatória

Qualquer bug identificado durante o trabalho — de qualquer natureza, mesmo fora do escopo da tarefa atual, mesmo de baixo impacto ou criticidade — deve ser corrigido sempre, no mesmo fluxo de trabalho. Não adiar, não apenas anotar em `STATE.md` como blocker para "resolver depois": corrigir.

Esta regra tem precedência sobre a diretriz de "não mexer fora do escopo" (seção 6) e sobre o scope guardrail padrão do skill `tlc-spec-driven` (que por padrão só registra bugs achados durante a implementação como blocker) — bug identificado é sempre exceção ao escopo.

Melhorias, refino, ou ideias que não sejam bugs continuam seguindo a regra normal da seção 6: registrar em `STATE.md` (Deferred Ideas) e não agir na mesma tarefa.

## 8. Implementação sempre via subagents

Toda tarefa de implementação (escrita/edição de código — não pesquisa, leitura ou planejamento) deve ser delegada a um subagent (tool `Agent`), nunca implementada diretamente na conversa principal. Motivo: mantém o contexto principal limpo (sem ruído de leitura de arquivo/output de teste/build) e melhora a qualidade — o subagent foca só na tarefa, recebe instruções completas (arquivo, abordagem, critério de sucesso) e reporta de volta status, arquivos alterados e resultado do gate check.

- Cada tarefa atômica de `tasks.md` (ou do plano inline do modo Execute) vai para um subagent separado.
- Tarefas `[P]` (paralelas): um subagent por tarefa, rodando em paralelo.
- Tarefas sequenciais sem `[P]`: ainda assim delegar a um subagent, uma de cada vez — mantém os artefatos de implementação fora do contexto principal.
- Exceção: planejamento, criação de `tasks.md`, e relatórios de validação exigem o contexto acumulado completo — essas etapas continuam na conversa principal (mesma regra da seção "Sub-Agent Delegation" do skill `tlc-spec-driven`).
- Modo quick (tarefas triviais ≤3 arquivos): delegar a um subagent também é recomendado, ainda que opcional dado o baixo overhead.
