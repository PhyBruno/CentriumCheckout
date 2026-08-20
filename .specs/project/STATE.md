# State

**Last Updated:** 2026-08-20
**Current Work:** Reorganização de `.specs/` para conformidade com SDD concluída — próximo passo sugerido: fase **Design** da feature `carrinho-produto-precificacao` (ver `.specs/project/ROADMAP.md`)

---

## Recent Decisions (Last 60 days)

### AD-001: Responsividade mobile via wizard de 3 etapas (2026-07-22) — MIGRADO

Requisito de comportamento de feature, não decisão arquitetural — migrado para `.specs/features/layout-responsivo-mobile/spec.md` como requisitos `MOB-01` a `MOB-05`. Rationale e trade-off completos preservados no spec da feature.

---

### AD-002: Login via troca de credenciais na URL, sem token pronto do ERP (2026-07-22)

**Decision:** O ERP não injeta `access_token` pronto na URL de abertura do Checkout. Em vez disso, o ERP envia `tenant`, `client_id`, `client_secret`, `username`, `password`, `Repository` e `codigoEmpresa` como query parameters. `tenant` identifica o cliente e compõe o host da API do ERP daquele cliente — usado em **todas** as chamadas à API. Com os demais campos, o Checkout chama `POST /oauth/access_token` e obtém seu próprio `access_token`. Credenciais originais (exceto `codigoEmpresa`) são armazenadas para permitir reautenticação automática silenciosa quando o token expirar. Documentado em `.specs/features/autenticacao-sessao-bootstrap/spec.md` (requisitos `AUTH-01`, `AUTH-06`).
**Reason:** O ERP delega a obtenção/renovação do token ao próprio Checkout em vez de gerenciar esse ciclo de vida centralmente — reduz acoplamento entre a sessão do ERP e a sessão do Checkout. O roteamento por `tenant` reflete que cada cliente tem sua própria instância/host de API.
**Trade-off:** Checkout precisa armazenar credenciais sensíveis (`client_id`, `client_secret`, `password`) durante toda a sessão, não só o token.
**Impact:** Pendências de contrato (`codigoEmpresa`, host por tenant, `refresh_token` vs. reautenticação) registradas em `.specs/codebase/CONCERNS.md`.

---

### AD-003: Domínio base da API do ERP via variável de ambiente Docker (2026-07-22)

**Decision:** O host completo da API do ERP é montado prefixando o `tenant` a um domínio base fixo (ex.: `apps.centrium.inf.br`). Esse domínio base **não** vem do ERP — é fornecido ao Checkout via variável de ambiente Docker (nome ainda não definido). Documentado em `.specs/codebase/ARCHITECTURE.md` (seção Containerização) e `.specs/codebase/INTEGRATIONS.md`.
**Reason:** O domínio base muda por ambiente de implantação (dev/staging/produção), não por tenant.
**Trade-off:** Nenhum trade-off relevante identificado — forma padrão de configurar valores que variam por ambiente em aplicação containerizada.
**Impact:** Nome da variável de ambiente ainda pendente — ver `.specs/codebase/CONCERNS.md`.

---

### AD-004: Bootstrap automático via GetSessao logo após o login (2026-07-22)

**Decision:** Imediatamente após obter o `access_token` (AD-002), o Checkout chama automaticamente `GET /ApiCentriumOAuth/GetSessao` — header `Authorization`, header `Empresa` (`codigoEmpresa`), query `Login` (`username`). Retorna o payload de até ~5MB com as configurações gerais de uso. Documentado em `.specs/features/autenticacao-sessao-bootstrap/spec.md` (requisito `AUTH-03`).
**Reason:** Fecha o vínculo entre autenticação e carga de configuração.
**Trade-off:** Nenhum trade-off novo.
**Impact:** Nenhuma pendência nova — request e resposta já confirmados integralmente contra o contrato yaml.

---

### AD-005: Tela de carregamento bloqueante durante login/bootstrap (2026-07-22)

**Decision:** Entre o clique no ERP e a tela principal do PDV aparecer, o Checkout exibe uma tela de carregamento ("montando a sessão"), cobrindo obtenção do token, `GetSessao` e parse/validação do payload de bootstrap. Só após esse processamento terminar com sucesso o operador é redirecionado. Documentado em `.specs/features/autenticacao-sessao-bootstrap/spec.md` (requisito `AUTH-05`).
**Reason:** Evita expor uma tela principal do PDV com configurações ainda incompletas.
**Trade-off:** Login inicial parece mais lento (tela de espera única) em troca de nunca expor um PDV com dados parciais/inconsistentes.
**Impact:** Nenhuma pendência nova.

---

### AD-006: Venda em andamento não sobrevive a F5 (2026-08-20)

**Decision:** Removida a persistência do carrinho via `persist(localStorage)` do Zustand. O estado da venda em andamento vive só em memória (Zustand sem `persist`), sem sobreviver a reload/F5. Como proteção contra perda acidental, a aplicação usa o diálogo nativo do navegador (`beforeunload`) pedindo confirmação. Documentado em `.specs/codebase/ARCHITECTURE.md` (Divisão de responsabilidades) e `.specs/codebase/STACK.md`.
**Reason:** Decisão do usuário — simplifica o modelo de estado em troca de aceitar perda de venda em um reload não confirmado.
**Trade-off:** Antes, um F5 acidental recuperava a venda do `localStorage`; agora, confirmando a saída, a venda é perdida e precisa ser refeita.
**Impact:** A "Regra de fronteira" (dados do produto copiados para a linha do carrinho na inserção, ver `.specs/codebase/ARCHITECTURE.md`) continua válida, mas vale só dentro da mesma sessão de venda.

---

### AD-007: Boneyard, Goey Toast e shadcn/ui adicionados à stack (2026-08-20)

**Decision:** Três novas bibliotecas de UI entram na stack: Boneyard (skeletons), Goey Toast (toasts) e shadcn/ui (base do design system, seguindo o design aprovado no Pencil). Documentado em `.specs/codebase/STACK.md`.
**Reason:** Cobrir lacunas de UI ainda não resolvidas por nenhuma lib já presente na stack.
**Trade-off:** Mais dependências de terceiros para manter atualizadas, em troca de não reimplementar skeleton/toast/componentes do zero.
**Impact:** Nenhuma pendência nova. Alterações pontuais de UI podem ser feitas por inferência da IA, desde que respeitem os tokens/componentes do design system (Pencil + shadcn/ui).

---

### AD-008: Busca de produto via `GetListaProdutos` vs. inserção direta via `GetProduto` (2026-08-20) — MIGRADO

Requisito de comportamento de feature, não decisão arquitetural — migrado para `.specs/features/carrinho-produto-precificacao/spec.md` como requisitos `CART-01`, `CART-02`. Rationale e trade-off completos preservados no spec da feature.

---

### AD-009: Finalização e suspensão de venda via `FaturarNFCe` + `SuspenderOuFaturar` (2026-08-20) — MIGRADO

Requisito de comportamento de feature, não decisão arquitetural — migrado para `.specs/features/finalizacao-suspensao-venda/spec.md` como requisitos `FIN-01` a `FIN-06`. Rationale e trade-off completos preservados no spec da feature.

---

### AD-010: Credenciais do ERP armazenadas em cookie `HttpOnly` (2026-08-20)

**Decision:** O `access_token` e as credenciais originais recebidas do ERP são armazenados em cookie `HttpOnly`, não em `localStorage`/`sessionStorage`. Documentado em `.specs/codebase/ARCHITECTURE.md` (Autenticação e segurança) e `.specs/features/autenticacao-sessao-bootstrap/spec.md` (requisito `AUTH-02`).
**Reason:** Cookie `HttpOnly` é inacessível a JavaScript no navegador, mitigando exfiltração via XSS — relevante dado que 100% do código é gerado por IA.
**Trade-off:** Nenhum trade-off relevante identificado — prática padrão de segurança para dados de sessão sensíveis.
**Impact:** Nenhuma pendência nova.

---

### AD-011: Cadastro de cliente simplificado existe no Checkout (2026-08-20) — MIGRADO

Requisito de comportamento de feature, não decisão arquitetural — migrado para `.specs/features/identificacao-cadastro-cliente/spec.md` como requisitos `CLI-03`, `CLI-04`. Rationale e trade-off completos preservados no spec da feature.

---

### AD-012: Status de PIX não é via SSE (2026-08-20) — MIGRADO

Requisito de comportamento de feature, não decisão arquitetural — migrado para `.specs/features/pagamento/spec.md` como requisito `PAY-04`. Rationale e trade-off completos preservados no spec da feature.

---

### AD-013: Importação e faturamento de DAV é fluxo suportado pelo Checkout (2026-08-20) — MIGRADO

Requisito de comportamento de feature, não decisão arquitetural — migrado para `.specs/features/importacao-dav/spec.md` como requisitos `DAV-01` a `DAV-03`. Rationale e trade-off completos preservados no spec da feature.

---

### AD-014: Conceito de "produto pai" não se aplica ao Checkout (2026-08-20) — MIGRADO

Requisito de comportamento de feature, não decisão arquitetural — migrado para `.specs/features/carrinho-produto-precificacao/spec.md` (seção Out of Scope). Rationale completo preservado no spec da feature.

---

### AD-015: Cancelamento de item do carrinho mantém a linha, riscada (2026-08-20) — MIGRADO

Requisito de comportamento de feature, não decisão arquitetural — migrado para `.specs/features/carrinho-produto-precificacao/spec.md` como requisito `CART-08`. Rationale e trade-off completos preservados no spec da feature.

---

### AD-016: Confirmado — sem tela de login manual no Checkout (2026-08-20) — MIGRADO

Requisito de comportamento de feature, não decisão arquitetural — migrado para `.specs/features/autenticacao-sessao-bootstrap/spec.md` (seção Out of Scope, reforça `AUTH-01`). Rationale completo preservado no spec da feature.

---

### AD-017: Mapeamento fino do design (Pencil) contra os specs de feature (2026-08-20)

**Decision:** Todas as 16 telas de `design/CentriumCheckout.pen` foram mapeadas contra os specs de `.specs/features/`. Confirmado que o design visual do wizard mobile já está 100% concluído (3 telas completas) — corrige o `ROADMAP.md`, que registrava incorretamente "Design não iniciado". Identificadas 2 telas sem spec de requisito (`Modal vendedor`, `Modal menu gerencial`) — ver `.specs/codebase/CONCERNS.md`. O "Modal CFOP", inicialmente também sem spec, foi removido do Pencil pelo usuário durante esta sessão — não é mais uma pendência.
**Reason:** Cruzar design visual com requisitos formais antes de qualquer implementação evita codificar telas sem base de requisito acordada, e corrige o rastreamento de progresso do ROADMAP.
**Trade-off:** Nenhum.
**Impact:** `Modal vendedor` e `Modal menu gerencial` precisam de fase Specify antes de virar tasks — registrado como pendência em `.specs/codebase/CONCERNS.md` e no `ROADMAP.md`.

---

### AD-018: Boneyard, Goey Toast e shadcn/ui serão instalados como dependências npm reais, não como skills adaptadas (2026-08-20)

**Decision:** Ao contrário do precedente do `Gentleman-Programming/Gentleman-Skills` (ver `.claude/skills/typescript-strict/SKILL.md`), Boneyard, Goey Toast e shadcn/ui (AD-007) serão instalados como **dependências npm reais** do projeto quando o scaffold (`package.json`) for criado — não colhidas/adaptadas como skill de projeto. Usuário confirmou preferência explícita por usar algo já consolidado em vez de reimplementar. Instalação em si **ainda não executada**: o projeto não tem `package.json`/scaffold hoje.
**Reason:** Decisão do usuário — preferência por dependência consolidada sobre reimplementação via skill, ao contrário do caso do TypeScript-strict (onde a licença/formato da fonte favoreceu adaptação).
**Trade-off:** Nenhuma skill de projeto dedicada será criada para essas 3 libs (diferente de `typescript-strict`); documentação de uso ficará a cargo da doc oficial de cada lib.
**Impact:** **Ressalva de segurança** — durante a verificação dos repositórios, `anl331/goey-toast` e `0xGF/boneyard` mostraram conter arquivos `SKILL.md`/`CLAUDE.md` embutidos voltados especificamente a agentes de IA (padrão atípico para lib de UI, compatível com ataque de supply-chain via prompt injection). Usuário confirmou serem de sua autoria/confiança. **Registrado como lembrete para quem for instalar**: não executar/seguir instruções desses arquivos embutidos sem revisão manual do conteúdo bruto primeiro — ver `.specs/codebase/CONCERNS.md`.

---

## Active Blockers

_Nenhum blocker ativo no momento._

---

## Lessons Learned

_Nenhuma lição registrada ainda._

---

## Quick Tasks Completed

| #   | Description | Date | Commit | Status |
| --- | ------------ | ---- | ------ | ------ |

---

## Deferred Ideas

Ideas captured during work that belong in future features or phases. Prevents scope creep while preserving good ideas.

_Nenhuma ideia adiada no momento — o item de layout mobile (antes registrado aqui como "requer spec própria antes de codar") foi promovido para `.specs/features/layout-responsivo-mobile/spec.md` (Specify concluído; falta a fase Design, ver `.specs/project/ROADMAP.md`)._

---

## Todos

Capture in-progress thoughts and action items that don't fit in active tasks.

- [x] Criar `.specs/project/PROJECT.md` e `.specs/project/ROADMAP.md`, e reorganizar `ARCHITECTURE.md`/`STATE.md` em conformidade com SDD (2026-08-20) — ver `.specs/project/ROADMAP.md` e `.specs/codebase/`.
- [x] ~~Alinhar com a equipe do ERP as 12 dúvidas operacionais sobre endpoints registradas originalmente em `ARCHITECTURE.md` seção 7 (2026-07-23)~~ — **Atualizado (2026-08-20)**: itens 1 (busca de cliente → `GetListaClientes`), 3 (`ValidaTicketDevolucao`), 4 (`SuspenderOuFaturar`), 5 (`CarregarNFCe`/`ListaNFCEs`) e 6 (`GetPDFNota` — sem reimpressão) resolvidos. Itens 2 (`TipoPreco`/`ListaPreco`) e 8 (classificação de forma de pagamento) parcialmente resolvidos.
- [ ] Alinhar com a equipe do ERP as dúvidas operacionais ainda em aberto, agora rastreadas por feature (Edge Cases de cada spec): `TipoPreco`/`ListaPreco` fora do valor `0`, `QtdMinCharParaConsulta`, formato de código de barras pesável, "produto editável ao dar TAB" → `.specs/features/carrinho-produto-precificacao/spec.md`; classificação completa de forma de pagamento, estorno de TEF após rejeição → `.specs/features/pagamento/spec.md`; origem do `NumeroNota`, contrato de `GetStatusSistema`, modelo de impressão pós-autorização → `.specs/features/finalizacao-suspensao-venda/spec.md`; extensão do cadastro simplificado de cliente/validação de IBGE, `DescontoConvenio` percentual ou fixo → `.specs/features/identificacao-cadastro-cliente/spec.md`.
- [ ] **Analisar bloqueios de edição pós-pagamento** (2026-08-20) — ver `.specs/features/carrinho-produto-precificacao/spec.md`, requisito `CART-09` (em análise, não implementar até conclusão — pedido explícito do usuário).
- [ ] **Confirmar validação de saldo/estoque na inserção de produto** (2026-08-20) — ver `.specs/features/carrinho-produto-precificacao/spec.md`, requisito `CART-10` (em aberto, propositalmente não resolvido — pedido explícito do usuário).
- [ ] Confirmar com a equipe do ERP o endpoint/mecanismo de "marcar DAV como importado/em faturamento" — ver `.specs/features/importacao-dav/spec.md` (Edge Cases).
