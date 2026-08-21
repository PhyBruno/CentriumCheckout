# Regras de processo — CentriumCheckout

Regras de fluxo de trabalho (git) e gates obrigatórios deste repositório. Convenções de código (lint, estilo, testes) continuam pendentes até o scaffolding existir — ver `CLAUDE.md` e `.specs/project/ROADMAP.md`.

## Git: branch/worktree por alteração, nunca commitar direto em `master`

- **Toda alteração** (feature, fix, doc, chore) deve acontecer em uma branch dedicada, nunca commitada diretamente em `master`. Nomeie a branch pela natureza da mudança (ex.: `docs/ad-025-tooling`, `feat/carrinho-precificacao`).
- Para isolar trabalho em paralelo (ex.: uma feature enquanto outra está em revisão), use `git worktree` em vez de trocar de branch no mesmo diretório de trabalho — evita perder estado não commitado. Ver skill `superpowers:using-git-worktrees`.
- Merge em `master` só via PR revisado — **não** via push direto, mesmo por conveniência.
- **Atenção:** hoje (2026-08-21) a branch `master` não tem proteção configurada no GitHub (confirmado via `gh api .../branches/master/protection` → `404 Branch not protected`). Ou seja, nada tecnicamente impede um push direto — esta regra depende de disciplina até que a proteção seja habilitada nas configurações do repositório no GitHub.
- Mensagens de commit seguem o padrão já usado no histórico: `<tipo>: <descrição>` (`docs:`, `chore:`, `feat:`, `fix:`), referenciando o AD-NNN relevante quando a mudança decorre de uma decisão registrada em `.specs/project/STATE.md`.

## Início de trabalho: verificar/criar branch e worktree

- Antes de tocar em qualquer arquivo para uma tarefa nova, verificar a branch/worktree atual (`git status`, `git worktree list`). Se o diretório de trabalho estiver em `master` (ou numa branch de outra tarefa), criar uma branch e um **worktree dedicado** para a tarefa (`git worktree add ../CentriumCheckout-<nome-da-tarefa> -b <tipo>/<nome-da-tarefa>`) antes de editar.
- Exceção: trabalho que já está em andamento no diretório principal (ex.: continuação de uma tarefa iniciada antes desta regra existir) pode ser fechado com uma branch simples (`git checkout -b`) no próprio diretório, sem precisar migrar para worktree — a regra de worktree vale para o **início** de tarefas novas, não para reorganizar trabalho já em progresso.

## Fim de tarefa: commit + push obrigatórios

- Ao concluir uma tarefa coerente (não a cada edição individual de arquivo), commitar e dar push na branch da tarefa. Não deixar trabalho concluído sem commit.
- Mudanças não relacionadas encontradas no working tree (ex.: pendências de sessões anteriores) não são arrastadas para o commit da tarefa atual — ficam de fora, registradas como pendência separada, a menos que o usuário peça explicitamente para tratá-las junto.
- Push de branch de tarefa é seguro por padrão: `master` está protegida (ver seção anterior), então o push nunca aterrissa direto em produção — só abre a branch para PR.

## Gates obrigatórios

- **`/owasp-security`** — obrigatório antes de qualquer deploy em produção, push de imagem para registry de produção, ou migração de banco em produção (detalhado em `CLAUDE.md`, seção "Pre-Production Security Requirements"). Skill instalada em escopo `user` (`~/.claude/commands/owasp-security/SKILL.md`), listada em `.claude/skills/README.md`.
