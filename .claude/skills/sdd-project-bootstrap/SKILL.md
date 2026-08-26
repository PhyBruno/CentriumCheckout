---
name: sdd-project-bootstrap
description: Bootstraps a repository (new or already in progress) to Bruno's standard spec-driven-development workflow — creates the .specs/ SDD folder skeleton (project/codebase/features/quick), adds the git-workflow section to rules.md, injects the Spec-Driven-Development / Pre-Production-Security / Agent-skills sections into CLAUDE.md, drops in docs/agents/fluxo-ia.md, and checks/installs the required Claude Code plugins (engram, context7, typescript-lsp, ecc, superpowers, mattpocock-skills, ui-ux-pro-max). Use this whenever starting a brand-new repository, when a project is missing its .specs/ structure or its CLAUDE.md process sections, or when the user asks to "aplicar o fluxo padrão", "bootstrap SDD", "montar a estrutura de specs", "configurar o CLAUDE.md" for a project, or to check/install the required plugins and skills. Everything the script touches is idempotent — safe to re-run on a project that already has some of the pieces.
---

# SDD Project Bootstrap

Aplica o fluxo padrão de desenvolvimento com IA (documentado em `docs/agents/fluxo-ia.md` do repo `CentriumCheckout`) a um projeto — novo ou já em andamento.

## Por que isso existe

Todo projeto novo do usuário passa pela mesma sequência: pastas `.specs/` no padrão SDD, `CLAUDE.md`/`rules.md` com as seções de processo (Spec Kit, gate de segurança pré-produção, git workflow), e o mesmo conjunto de plugins/skills instalados. Fazer isso manualmente a cada projeto é repetitivo e sujeito a esquecimento — esta skill automatiza a parte mecânica e sinaliza claramente o que precisa de revisão humana.

**Tudo que o script cria é um ponto de partida, não um produto final.** Placeholders `{{...}}` e blocos `TODO:` precisam ser preenchidos com o contexto real do projeto — não deixe isso para depois, ou o `CLAUDE.md` fica com lixo de template.

## Como usar

1. Confirme com o usuário qual é o `ProjectRoot` (repositório alvo) se não estiver óbvio pelo diretório de trabalho atual.
2. Rode primeiro em modo de simulação para mostrar o que vai mudar, sem tocar em nada:

   ```powershell
   powershell -NoProfile -File "<skill-dir>/scripts/bootstrap.ps1" -ProjectRoot "<caminho-do-projeto>" -WhatIf
   ```

3. Mostre a saída ao usuário. Se estiver de acordo, rode sem `-WhatIf`:

   ```powershell
   powershell -NoProfile -File "<skill-dir>/scripts/bootstrap.ps1" -ProjectRoot "<caminho-do-projeto>"
   ```

   Use `-SkipPlugins` se o usuário só quiser a estrutura de pastas/docs, sem tocar em plugins instalados globalmente (instalar plugin é uma mudança de escopo `user`, fora do repo — sinalize isso antes de rodar sem `-SkipPlugins` num ambiente que não seja a própria máquina do usuário).

4. Depois de rodar, leia o `CLAUDE.md`/`rules.md` resultantes com o usuário e substitua junto com ele:
   - `{{PROJECT_NAME}}`, `{{REPO_DIR_NAME}}` em `rules.md`
   - O `TODO: descrever o projeto...` no topo do `CLAUDE.md` (se ele foi criado do zero)
   - O `TODO: descrever onde as issues...` na seção "Issue tracker" de `Agent skills`, e criar `docs/agents/issue-tracker.md`/`docs/agents/domain.md` se o projeto quiser esse nível de detalhe (ver os equivalentes em `CentriumCheckout` como referência)
   - A tabela de stack e a seção "Reaproveitamento" em `docs/agents/fluxo-ia.md`, que veio copiada literalmente do `CentriumCheckout`

## O que o script faz (`scripts/bootstrap.ps1`)

Todas as etapas são **idempotentes**: se o arquivo/pasta já existe, o script pula e informa — nunca sobrescreve conteúdo existente. Isso é o que permite rodar a skill tanto num projeto vazio quanto num que já tem parte da estrutura.

1. **`.specs/{project,codebase,features,quick}`** — cria as quatro pastas com `.gitkeep`, se ainda não existirem.
2. **`rules.md`** — se não existir, cria a partir de `assets/rules.md.template` (regras de branch/worktree, commit+push obrigatório, gates). Se já existir, não mexe — o usuário pode ter regras específicas do projeto.
3. **`CLAUDE.md`** — se não existir, cria um mínimo com uma linha de `Project Context` a preencher. Em seguida, verifica três marcadores de seção (`## Spec-Driven Development (Obrigatório)`, `# Pre-Production Security Requirements`, `## Agent skills`) e **só anexa a seção correspondente se o marcador não estiver presente** — evita duplicar seções em projetos que já têm parte do processo documentado.
4. **`docs/agents/fluxo-ia.md`** — copia de `assets/fluxo-ia.md` (o fluxo padrão do usuário) se ainda não existir no projeto.
5. **Plugins obrigatórios** (a menos que `-SkipPlugins`) — roda `claude plugin list --json`, compara com a lista fixa de 7 plugins obrigatórios (ver tabela em `docs/agents/fluxo-ia.md`). Para cada um: se já habilitado, pula; se instalado mas desabilitado, habilita (`claude plugin enable`); se ausente, adiciona a marketplace correspondente (quando não for `claude-plugins-official`, que já vem por padrão) e instala em escopo `user` com `claude plugin install <id> -y --scope user`.
6. **Skills fora do marketplace** — `tlc-spec-driven` e `owasp-security` não têm um caminho de instalação via `claude plugin install` confirmado (a primeira vem de https://skills.rest/skill/tlc-spec-driven, a segunda foi instalada manualmente como `~/.claude/commands/owasp-security/SKILL.md`). O script só **verifica presença** e avisa se faltar — não tenta instalar sozinho, para não inventar um mecanismo que pode não existir. Reporte esse aviso ao usuário e peça para ele instalar manualmente se aparecer.

## Limitações conhecidas

- A instalação de plugins altera o `~/.claude/settings.json` **global** do usuário, não só o projeto atual — isso afeta qualquer outro projeto aberto na mesma máquina. É baixo risco (reversível via `claude plugin disable`/`uninstall`), mas avise o usuário antes de rodar sem `-SkipPlugins`.
- O script não sabe reescrever o bloco de política do dual-graph (o comentário `<!-- dgc-policy-v11 -->` no topo do `CLAUDE.md`) — esse bloco é gerado/versionado pela própria ferramenta `dual-graph`, não por este script. Se o projeto usa dual-graph, deixe a ferramenta gerenciar esse bloco; não copie manualmente de outro repo.
- `docs/agents/issue-tracker.md` e `docs/agents/domain.md` **não** são criados automaticamente — variam demais entre projetos (tracker diferente, layout de specs diferente). O script só deixa o placeholder na seção "Agent skills" do `CLAUDE.md` lembrando de criá-los.
