# Skills de projeto — CentriumCheckout

Índice das skills criadas especificamente para este projeto, complementando as skills globais já instaladas (`ecc:tdd-workflow`, `tlc-spec-driven`, `ecc:e2e-testing`, `ui-ux-pro-max`, etc.). Ver `ARCHITECTURE.md` na raiz do repo para o contexto completo da stack e das regras de negócio referenciadas abaixo.

**Versões fixadas** (confirmadas para este projeto): React 19, Zod 4, Zustand 5. Skills version-specific assumem essas versões (ex.: `useShallow` de `zustand/react/shallow`, breaking changes do Zod 4, React Compiler do React 19).

| Skill | Cobre | Por quê existe como skill de projeto |
|---|---|---|
| `money-precision` | Aritmética monetária (centavos/dinero.js) e o motor de precificação (seção 4 do ARCHITECTURE.md) | Maior risco do projeto; nenhuma skill de mercado equivalente foi encontrada na pesquisa |
| `zustand-immer-state` | Store Zustand+Immer da venda em andamento, regra de `persist`/`partialize`, regra de fronteira com Dexie/TanStack Query | Nenhum candidato externo verificável encontrado |
| `tanstack-query-checkout` | Cache de produto/pagamento, invariante de `staleTime` durante a venda, descarte no fim da venda | Inspirada em `DeckardGer/tanstack-agent-skills`, com o invariante de negócio específico adicionado |
| `dexie-bootstrap-cache` | Persistência do payload de bootstrap (~5MB) no Dexie/IndexedDB, versionamento, fluxo via Web Worker | Inspirada em `devfirexyz/ui-skills` (dexiejs), reescrita localmente |
| `zod-boundary-validation` | Validação de fronteira nos 4 pontos de entrada de dado externo (bootstrap, produto, TEF/PIX, finalização) | Inspirada em `anivar/zod-skill`, adaptada aos pontos de fronteira concretos do projeto |
| `typescript-strict` | Regras de TS `strict` para código gerado por IA: veto a `any`/`as`/`!` na fronteira, tipos derivados de schema Zod (`z.infer`), `import type`, type guards, utility types, interfaces planas | Adaptada de `Gentleman-Programming/Gentleman-Skills` (typescript), reconciliada com a união discriminada da `zod-boundary-validation` |
| `react-hotkeys-pdv` | Convenções de atalho de teclado do PDV, conflito com bipe de código de barras, scopes | Nenhum candidato externo encontrado |
| `vitest-testing-library-react` | Padrões de teste de componente/hook React, MSW, separação de testes da lógica de precificação | Inspirada em `citypaul/.dotfiles` (`react-testing/SKILL.md`), reescrita |

## Skills globais já usadas (não duplicadas aqui)

- `ecc:tdd-workflow` — fluxo TDD (RED/GREEN/checkpoint git), 80%+ cobertura
- `superpowers:test-driven-development` — processo TDD genérico, complementar
- `tlc-spec-driven` — Spec-Driven Development em 4 fases (Specify/Design/Tasks/Execute)
- `ecc:e2e-testing` — Playwright, Page Object Model, CI/CD
- `ecc:frontend-patterns`, `ecc:vite-patterns`, `ecc:coding-standards`, `ecc:error-handling`, `ecc:frontend-a11y` — padrões gerais de React/Vite/TS
- `ui-ux-pro-max` — decisões de design/UX (paletas, tipografia, componentes), camada separada da qualidade de código
- `ecc:docker-patterns` — containerização (seção 9 do ARCHITECTURE.md: dev+produção multi-stage); avaliada como suficiente, sem necessidade de skill de projeto dedicada
- `owasp-security` — OWASP Top 10 (Playwright/TS + ZAP/Python); gate obrigatório antes de deploy em produção, ver `rules.md` na raiz do repo

## MCPs/plugins do Claude Code — quando usar cada um

Diferente das skills acima, estes não são versionados no repo: estão instalados em escopo `user` (perfil global do Claude Code, `~/.claude/`), não em `.claude/settings.local.json` deste projeto. Qualquer dev que clone o repo precisa instalá-los à parte (`claude plugin install <nome>@<marketplace>`) — nada aqui é automático. Lista abaixo cobre só os relevantes para o trabalho neste projeto; MCPs globais sem relação com o Checkout (ex. `pencil`, `n8n`/`n8n-instance`) foram omitidos de propósito.

| MCP/plugin | Escopo | Cobre | Quando usar |
|---|---|---|---|
| `context7` | user | Lookup de documentação atual de bibliotecas/frameworks direto do repositório-fonte (via MCP remoto da Upstash) | Ao integrar ou atualizar dependências com versão fixada neste projeto (React 19, Zod 4, Zustand 5, TanStack Query, Dexie) — confere a API real da versão em vez de depender só do conhecimento estático do modelo |
| `typescript-lsp` | user | Language server TS/JS (diagnósticos, ir-para-definição, referências) | Só é útil depois que o scaffolding existir (`package.json`/`tsconfig.json`); hoje o projeto é pré-código, então ainda não há o que analisar |
| `dual-graph` | project (`http://127.0.0.1:8080/mcp` local) | Indexação semântica do próprio repo para recuperação de contexto | Política de uso obrigatória já documentada na seção "Dual-Graph Context Policy" deste `CLAUDE.md` — não repetir aqui |
| `engram` | user | Memória persistente entre sessões (decisões, bugs, convenções) | Ver `.dual-graph`/memória do projeto — `reference_engram_mcp` cobre binário/config/escopo |
| `genexus` | user | Consulta direta à KB GenExus do ERP Centrium (endpoints, contratos, domains) | Ao verificar/confirmar contratos de API do ERP citados em `.specs/codebase/CONCERNS.md` e `.specs/project/PENDENCIES.md` (ex. AD-023/AD-024) |
| `ecc` (Everything Claude Code) | user | Dezenas de skills/agentes/comandos genéricos (build-fix, code-review, react-patterns, security-review etc.) | Fonte de várias das skills globais já listadas acima com prefixo `ecc:` |
| `superpowers` | user | Skills de processo (brainstorming, TDD, systematic-debugging, writing-plans) | Usado antes de qualquer trabalho criativo/de implementação, conforme `using-superpowers` |
