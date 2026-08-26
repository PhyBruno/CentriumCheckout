## Spec-Driven Development (Obrigatório)

Este projeto usa o **CLI real do [Spec Kit](https://github.com/github/spec-kit)** como framework de desenvolvimento orientado por especificação. Instale com `uvx --from git+https://github.com/github/spec-kit.git specify init --here --integration claude` (gera `.specify/` + skills `speckit-*`). Toda nova feature, bugfix, ou refatoração deve começar com a sequência de skills obrigatória (invocadas como `/speckit-nome`, com hífen — não `/speckit.nome`):

1. **`/speckit-specify`** — Defina requisitos formais, comportamentos esperados, invariantes e casos de limite **antes** de qualquer implementação
2. **`/speckit-tasks`** — Gere tarefas decompostas em dependência topológica (Setup → Foundational → Feature → Testing)
3. **`/speckit-implement`** — Execute tarefas na ordem, com contexto de especificação injetado em cada passo

**Por quê:** Spec Kit garante que toda implementação futura mantenha a rastreabilidade entre requisito-design-implementação, reduzindo ambiguidade e retrabalho.

**📖 Guia operacional completo:** Ver `SPECKIT.md` na raiz do repo para sequência exata, exemplos e troubleshooting.

**Combinação com outras skills:**

- **Ao especificar:** `tlc-spec-driven` (skill global) cobre o processo genérico de planejamento SDD (Specify → Design → Tasks → Execute); `/speckit-specify` é sua materialização declarativa neste projeto.
- **Ao gerar tarefas:** `/speckit-tasks` gera `tasks.md` a partir de `spec.md`/`plan.md` da feature — puro sequenciamento de dependência, não aciona outras skills.
- **Ao implementar (`/speckit-implement`):** acionar as skills relevantes conforme o tipo de tarefa (componente de UI, lógica de domínio sensível, state management, validação de entrada, etc. — mapear para as skills de projeto/plugins disponíveis conforme a stack escolhida).
- **Antes de qualquer merge para a branch principal ou deploy:** `owasp-security` (ver seção "Pre-Production Security Requirements").
