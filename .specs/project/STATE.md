# State

**Last Updated:** 2026-08-31
**Current Work:** **2026-08-31 (AD-108) — o cliente default deixa de ser um snapshot parcial:** decisão direta do usuário fecha o **item 31** de `PENDENCIES.md` e a sub-pendência `ListaPrecoDefault` do **item 36**. Quando a venda corre com o cliente default (`origem = 'DEFAULT'`, AD-032), o Checkout **não** chama `GetCliente`, usa `SessaoUsuario.ListaPrecoDefault` como lista de preço (parâmetro `Listapreco` de `GetProduto` quando `TipoPreco = 9`) e trata esse cliente como **sem desconto de convênio** (`descontoConvenio = 0`). `ClienteVenda` de origem `DEFAULT` deixa de ter `listaPreco`/`descontoConvenio` em `null` — só `documento` continua `null` (AD-100 segue válida). AD-094 fica **superada no ponto** e a feature 005 perde sua única limitação conhecida; artefatos de 003, 005 e 013 atualizados. Próximo passo sugerido: `/speckit-tasks` na feature 005 ou 003. Anteriormente: Fases **Specify** (`/speckit-specify`) e **Design** (`/speckit-plan`) da feature nova `013-venda-rapida-cenario-pagamento` concluídas — artefatos em `specs/013-venda-rapida-cenario-pagamento/` (`spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/erp-cenario-pagamento-api.md`, `contracts/venda-rapida-domain-api.md`, `quickstart.md`, `checklists/requirements.md`), worktree/branch `worktree-013-venda-rapida-cenario-pagamento`. Venda rápida por teclas F6–F9: o ERP publica cenários de pagamento (condição + forma + tecla + indicador de encerramento) no campo `SessaoUsuario.CenarioPagamento` do `GetSessao`, e o Checkout os transforma em até 4 atalhos que lançam o saldo em aberto integral e, quando o cenário indicar, finalizam a venda sem confirmação. Origem e formato confirmados por inspeção direta da KB GeneXus (`PCheckout_GetSessao`, `TCenarioPagamento`, `PCenarioPagamento_RevisaTeclasAtalho`) — três achados viraram AD-104 (campo embutido na sessão, sem endpoint dedicado), AD-105 (formato delimitado definitivo — serialização estruturada inviável no ERP, mas com garantia de que os textos do cadastro não conterão `;`; item com nº de campos ≠ 7 segue descartado como defesa) e AD-106 (booleano de encerramento por conjunto fechado de literais, `false` como fail-safe, solução definitiva). Ambos fechados por decisão direta do usuário em 2026-08-31 — os itens 34 e 35 de `PENDENCIES.md` foram removidos, sem pendência remanescente com o ERP. Decisões diretas do usuário nesta sessão: valor lançado = saldo em aberto integral; finalização automática sem diálogo; cenários com TEF/PIX seguem elegíveis; atalhos ativos em qualquer momento da venda; feature restrita ao desktop. Ajustes correlatos aplicados em 002 (`contracts/session-bff-api.md`, `.specs/features/autenticacao-sessao-bootstrap/spec.md`) e 008 (`.specs/features/pagamento-geral/spec.md`). Cinco mudanças colaterais do contrato `20260827192357` ficaram registradas no item 36 de `PENDENCIES.md` para as features às quais pertencem; a remoção de `DavNum` de `CheckoutFaturarNFCe` **já foi resolvida em 2026-08-31 (AD-107) e não bloqueia a feature 006** — o ERP identifica sozinho que a NFCe faturada veio de um DAV, restando quatro mudanças abertas no item 36. Próximo passo sugerido: `/speckit-tasks` na feature 013. Anteriormente: fase **Design** (`/speckit-plan`) da feature `012-selecao-vendedor` concluída — artefatos gerados em `specs/012-selecao-vendedor/` (`plan.md`, `research.md`, `data-model.md`, `contracts/erp-vendedor-api.md`, `contracts/vendedor-domain-api.md`, `quickstart.md`), branch `docs/plan-selecao-vendedor`. Um achado de contrato levantado nesta fase, fechado por decisão de design (mesma lacuna já corrigida para cliente em AD-093): `GetListaVendedores` não tem parâmetro de status nem campo `Ativo`/`Status` na resposta, nem campo de função/cargo — filtro "Ativo" e coluna de subtítulo removidos do design (AD-103), corrigindo `.specs/features/selecao-vendedor/spec.md` e `specs/012-selecao-vendedor/spec.md` no ponto (FR-002/FR-003, VEND-03/VEND-08). Diferente do cliente (AD-094), o vendedor default não tem nenhum campo indisponível — `SessaoUsuario.VendedorCodigo`/`VendedorNome` já vêm completos do bootstrap. A action pública `vendedorSlice.trocarVendedor({ codigo, nome })`, já reservada por `specs/006-importacao-dav/contracts/importacao-domain-api.md`, é formalizada neste plano e cobre também a retomada de rascunho via `CarregarNFCe` (feature 004/011, ainda não desenhada), que só devolve `vendedorCodigo` sem nome — mesmo fallback "Vendedor #<código>" já decidido para DAV em AD-095. Próximo passo sugerido: `/speckit-tasks` na feature 012, ou `/speckit-plan` em 004/008 antes disso, para fechar a superfície de integração que este plano hoje só reserva (`podeMutarCarrinho()`, call site de `trocarVendedor` a partir de `CarregarNFCe`). Anteriormente: fase **Design** (`/speckit-plan`) da feature `007-layout-responsivo-mobile` concluída — artefatos gerados em `specs/007-layout-responsivo-mobile/` (`plan.md`, `research.md`, `data-model.md`, `contracts/layout-domain-api.md`, `quickstart.md`), branch `docs/plan-layout-responsivo-mobile`. Nenhum achado de contrato novo — a feature é presentation-only (`AppShell`/`useIsMobile` decidem entre `DesktopLayout` e `MobileWizard` de 3 etapas, ambos lendo o mesmo `vendaStore`), sem chamada de rede própria. Único ponto técnico decidido nesta fase: detecção do botão "Scanner" via `BarcodeDetector in window` **+** UA Chrome/Android (não só capacidade), para respeitar a restrição explícita de escopo já fixada em AD-086/AD-090. Dependência registrada como constraint (não pendência bloqueante): as features 004 (finalização/suspensão) e 012 (seleção de vendedor) ainda não passaram por `/speckit-plan` — este plano referencia os requisitos `FIN-*`/`VEND-*` já aprovados nos specs delas, sem redesenhar essas features. Próximo passo sugerido: `/speckit-tasks` na feature 007, ou `/speckit-plan` em 004/008/012 antes disso, para fechar a superfície de integração que 007 hoje só reserva. Anteriormente: fase **Design** (`/speckit-plan`) da feature `006-importacao-dav` concluída — artefatos em `specs/006-importacao-dav/` (`plan.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`). Dois achados de contrato levantados durante esta fase, ambos resolvidos por decisão de design (não pendência bloqueante): `ListaDAVs`/`GetDav` nunca retornam `VendedorNome` (só `VendedorCodigo`), corrigindo uma nota desatualizada em `.specs/features/selecao-vendedor/spec.md` (AD-095); `CheckoutFaturarNFCe.produtos` (retorno de `GetDav`, mesmo shape de `CarregarNFCe`) não traz descrição do produto, resolvido por busca best-effort via `GetProduto` só para exibição, sem tocar no preço congelado (AD-096). Anteriormente: fase **Design** da feature `005-identificacao-cadastro-cliente` concluída — artefatos em `specs/005-identificacao-cadastro-cliente/` (`plan.md`, `research.md`, `data-model.md`, `contracts/erp-cliente-api.md`, `contracts/cliente-domain-api.md`, `quickstart.md`). Dois achados de contrato levantados durante a fase: filtro "Ativo" removido do modal de cliente por falta de campo de status (AD-093, fechado por decisão direta do usuário); `GetCliente` sem forma de buscar por código, bloqueando dados completos (`ListaPreco`/`DescontoConvenio`) do cliente default para `TipoPreco=9` (AD-094, registrado como pendência bloqueante, item 31 de `PENDENCIES.md`, não impede a implementação). Próximo passo sugerido: `/speckit-tasks` na feature 005. Anteriormente: fase **Design** (`/speckit-plan`) da feature `003-carrinho-produto-precificacao` concluída — artefatos em `specs/003-carrinho-produto-precificacao/` (`plan.md`, `research.md`, `data-model.md`, `contracts/erp-produto-api.md`, `contracts/precificacao-domain-api.md`, `quickstart.md`), branch `docs/plan-carrinho-produto-precificacao`. A inspeção do `ApiCentriumOAuth.yaml` durante o Design levantou dois achados de contrato, ambos fechados por decisão direta do usuário no mesmo dia: **AD-091** (`GetProduto` é o único endpoint que resolve a linha do carrinho; `GetListaProdutos` só capta/seleciona) e **AD-092** (não existe lista de preço padrão da empresa; `TipoPreco = 9` usa sempre a lista do cliente, e `SessaoUsuario.listaPrecoPadrao` nunca existiu). Próximo passo sugerido: `/speckit-tasks` na feature 003. Antes disso, esta sessão continuava o trabalho descrito a seguir. Sessão de grilling (`mattpocock-skills:grilling`) auditando os 20 documentos de `.specs/` em busca de contradições e ambiguidades residuais. Sete decisões novas (AD-067 a AD-073) fecham: escopo de `repriceSku` sobre linha congelada de rascunho/DAV (AD-067); reclassificação do parse fino do código de barras pesável para pendência bloqueante, corrigindo AD-028 (AD-068); fechamento sem pendência nova da trilha de tier em `FaturarNFCe.produtos` e de `DavMatProdPes`, corrigindo AD-024/AD-063 (AD-069); confirmação estrutural da exclusividade pesável/editável, corrigindo AD-063 (AD-070); aritmética monetária em centavos inteiros e BFF em Fastify, fechando `STACK.md` (AD-071); método do maior resto para resto de arredondamento, corrigindo AD-039 (AD-072); e manutenção da regra de roteamento TEF com nova pendência não-bloqueante sobre "cartão avulso" (AD-073). Em seguida, mais sete decisões (AD-075 a AD-081), várias confirmadas por inspeção direta da KB real do GeneXus (`CentriumDEVU6`) via MCP: semântica de retorno + polling de 60s de `GetStatusSistema` (AD-075, itens 7/23, **corrigida por AD-080** — é `numeric` com limiar `0`/`>=1`, não `boolean`); parse completo do código de barras de balança e fórmula de quantidade, **resolve a pendência bloqueante item 29/AD-068** (AD-076); filtro de data real no modal de DAVs (AD-077, item 10); `FormaIntegracaoCartao` confirmado em `GetSessao` (AD-078, item 30); achado sobre o QR Code do PIX — a imagem já é gerada/persistida pelo ERP, só falta expor no contrato de `GerarPIX` (AD-079, item 24, corrige a suposição de baixa confiança de AD-047); e confirmação de que a equipe do ERP vai atualizar os endpoints pendentes dos itens 10 e 24 (AD-081). Em seguida, AD-082: `GetSessao` retorna `TipoImpressao` (`'E'`=direta, `'P'`=PDF), resolvendo a metade de AD-037 sobre o indicativo de mecanismo de impressão. E AD-083: usuário forneceu o `Impressao.js` real do PDV atual, resolvendo por completo a outra metade — contrato técnico do serviço de impressão local (host/porta via `CadMaqHost`, default `127.0.0.1:4545`, `POST` para a raiz, `text/plain`, corpo = `XMLImpressao` cru, sem validação de resposta) — **item 22 de `PENDENCIES.md` fechado, sem depender do ERP**. Próximo passo sugerido: fase **Design** da feature `carrinho-produto-precificacao` (ver `.specs/project/ROADMAP.md`)

---

## Recent Decisions (Last 60 days)

### AD-001: Responsividade mobile via wizard de 3 etapas (2026-07-22) — MIGRADO

Requisito de comportamento de feature, não decisão arquitetural — migrado para `.specs/features/layout-responsivo-mobile/spec.md` como requisitos `MOB-01` a `MOB-05`. Rationale e trade-off completos preservados no spec da feature.

---

### AD-002: Login via troca de credenciais na URL, sem token pronto do ERP (2026-07-22)

**Decision:** O ERP não injeta `access_token` pronto na URL de abertura do Checkout. Em vez disso, o ERP envia `tenant`, `client_id`, `client_secret`, `username`, `password`, `Repository` e `codigoEmpresa` como query parameters. `tenant` identifica o cliente e compõe o host da API do ERP daquele cliente — usado em **todas** as chamadas à API. Com os demais campos, o Checkout chama `POST /oauth/access_token` e obtém seu próprio `access_token`. Credenciais originais, **incluindo `codigoEmpresa`**, são armazenadas para permitir reautenticação automática silenciosa quando o token expirar e para popular o campo `Empresa`, exigido em praticamente todos os endpoints do contrato (`ApiCentriumOAuth.yaml`) — ver correção em AD-019. Documentado em `.specs/features/autenticacao-sessao-bootstrap/spec.md` (requisitos `AUTH-01`, `AUTH-06`).
**Reason:** O ERP delega a obtenção/renovação do token ao próprio Checkout em vez de gerenciar esse ciclo de vida centralmente — reduz acoplamento entre a sessão do ERP e a sessão do Checkout. O roteamento por `tenant` reflete que cada cliente tem sua própria instância/host de API.
**Trade-off:** Checkout precisa armazenar credenciais sensíveis (`client_id`, `client_secret`, `password`) durante toda a sessão, não só o token.
**Impact:** Pendência de contrato quanto a host por tenant (bloco `servers:`) permanece registrada em `.specs/codebase/CONCERNS.md`; mapeamento de `codigoEmpresa` → campo `Empresa` e decisão sobre `refresh_token` (não utilizado) já confirmados (AD-019).
**Atualização (2026-08-21):** corrigido por AD-022 — o Checkout deixa de processar esses query params diretamente no JS da SPA; um BFF mínimo (novo componente de servidor) passa a receber o redirect do ERP e fazer a troca por `access_token`, nunca expondo `client_secret`/`password`/`access_token` ao navegador. O conjunto de campos enviados pelo ERP continua o mesmo descrito aqui, mais o novo campo `validationKey` (AD-022).

---

### AD-003: Domínio base da API do ERP via variável de ambiente Docker (2026-07-22)

**Decision:** O host completo da API do ERP é montado prefixando o `tenant` a um domínio base fixo (ex.: `apps.centrium.inf.br`). Esse domínio base **não** vem do ERP — é fornecido ao Checkout via variável de ambiente Docker chamada `baseDomain` (AD-019). Documentado em `.specs/codebase/ARCHITECTURE.md` (seção Containerização) e `.specs/codebase/INTEGRATIONS.md`.
**Reason:** O domínio base muda por ambiente de implantação (dev/staging/produção), não por tenant.
**Trade-off:** Nenhum trade-off relevante identificado — forma padrão de configurar valores que variam por ambiente em aplicação containerizada.
**Impact:** Nenhuma pendência nova — nome da variável definido em AD-019.

---

### AD-004: Bootstrap automático via GetSessao logo após o login (2026-07-22)

**Decision:** Imediatamente após obter o `access_token` (AD-002), o Checkout chama automaticamente `GET /ApiCentriumOAuth/GetSessao` — header `Authorization`, header `Empresa` (`codigoEmpresa`), query `Login` (`username`). Retorna o payload de até ~5MB com as configurações gerais de uso. Documentado em `.specs/features/autenticacao-sessao-bootstrap/spec.md` (requisito `AUTH-03`).
**Reason:** Fecha o vínculo entre autenticação e carga de configuração.
**Trade-off:** Nenhum trade-off novo.
**Impact:** Nenhuma pendência nova — request e resposta já confirmados integralmente contra o contrato yaml.

---

### AD-005: Tela de carregamento bloqueante durante login/bootstrap (2026-07-22)

**Decision:** Entre o clique no ERP e a tela principal do PDV aparecer, o Checkout exibe uma tela de carregamento ("montando a sessão"), cobrindo obtenção do token, `GetSessao` e parse/validação do payload de bootstrap. **Explícito:** enquanto esse carregamento ocorre, a tela pode ser exibida em formato skeleton, usando Boneyard (lib de skeletons adicionada em AD-007). Só após esse processamento terminar com sucesso o operador é redirecionado. Documentado em `.specs/features/autenticacao-sessao-bootstrap/spec.md` (requisito `AUTH-05`).
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
**Atualização (2026-08-21):** corrigido por AD-022 — esta decisão não definia **quem** seta o cookie `HttpOnly` nem como o JS acessaria `codigoEmpresa` ou dispararia renovação de sessão sem acesso ao token, o que a tornava irrealizável (um cookie `HttpOnly` só pode ser setado por resposta de servidor, e a arquitetura documentada era "SPA sem backend próprio"). AD-022 introduz o BFF mínimo que resolve isso: ele seta o cookie (cifrado, não só `HttpOnly`) e expõe `/api/bootstrap` para os dados não sensíveis.

---

### AD-011: Cadastro de cliente simplificado existe no Checkout (2026-08-20) — MIGRADO

Requisito de comportamento de feature, não decisão arquitetural — migrado para `.specs/features/identificacao-cadastro-cliente/spec.md` como requisitos `CLI-03`, `CLI-04`. Rationale e trade-off completos preservados no spec da feature.

**Atualização (2026-08-21):** design visual concluído — frame `PDV Online Web - Modal cadastro de cliente` criado em `design/CentriumCheckout.pen`. Removida a pendência de design que constava em `.specs/features/identificacao-cadastro-cliente/spec.md` (seção UI Design).

---

### AD-012: Status de PIX não é via SSE (2026-08-20) — MIGRADO

Requisito de comportamento de feature, não decisão arquitetural — migrado para `.specs/features/pagamento-pix/spec.md` como requisito `PAY-04`. Rationale e trade-off completos preservados no spec da feature.

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

**Atualização (2026-08-21):** levantamento preliminar do usuário reduziu a lacuna das duas telas. `Modal vendedor` fará `GET` em um endpoint ainda não confirmado com o ERP, para carregar a listagem de vendedores disponíveis para seleção na empresa — o campo indica quem atendeu o cliente final, não necessariamente o operador de caixa. `Modal menu gerencial` não é uma tela própria do Checkout: apenas aponta (redirect) para `TENANT + baseDomain + /WPMovimentoNaoFiscal_Lancamento.aspx`, URL do sistema legado do ERP. Fase Specify formal disparada via subagente dedicado.
**Reason:** Cruzar design visual com requisitos formais antes de qualquer implementação evita codificar telas sem base de requisito acordada, e corrige o rastreamento de progresso do ROADMAP.
**Trade-off:** Nenhum.
**Impact:** `Modal vendedor` precisa de fase Specify completa (endpoint pendente de confirmação com o ERP) — registrado em `.specs/codebase/CONCERNS.md` e no `ROADMAP.md`. `Modal menu gerencial`, por ser um simples redirect, provavelmente não precisa de spec de feature completo — só de nota em `.specs/codebase/ARCHITECTURE.md`.

---

### AD-018: Boneyard, Goey Toast e shadcn/ui serão instalados como dependências npm reais, não como skills adaptadas (2026-08-20)

**Decision:** Ao contrário do precedente do `Gentleman-Programming/Gentleman-Skills` (ver `.claude/skills/typescript-strict/SKILL.md`), Boneyard, Goey Toast e shadcn/ui (AD-007) serão instalados como **dependências npm reais** do projeto quando o scaffold (`package.json`) for criado — não colhidas/adaptadas como skill de projeto. Usuário confirmou preferência explícita por usar algo já consolidado em vez de reimplementar. Instalação em si **ainda não executada**: o projeto não tem `package.json`/scaffold hoje.
**Reason:** Decisão do usuário — preferência por dependência consolidada sobre reimplementação via skill, ao contrário do caso do TypeScript-strict (onde a licença/formato da fonte favoreceu adaptação).
**Trade-off:** Nenhuma skill de projeto dedicada será criada para essas 3 libs (diferente de `typescript-strict`); documentação de uso ficará a cargo da doc oficial de cada lib.
**Impact:** **Ressalva de segurança** — durante a verificação dos repositórios, `anl331/goey-toast` e `0xGF/boneyard` mostraram conter arquivos `SKILL.md`/`CLAUDE.md` embutidos voltados especificamente a agentes de IA (padrão atípico para lib de UI, compatível com ataque de supply-chain via prompt injection). Usuário confirmou serem de sua autoria/confiança. **Registrado como lembrete para quem for instalar**: não executar/seguir instruções desses arquivos embutidos sem revisão manual do conteúdo bruto primeiro — ver `.specs/codebase/CONCERNS.md`.

---

### AD-019: Pendências de contrato/config resolvidas — `codigoEmpresa`↔`Empresa`, `refresh_token`, `baseDomain` (2026-08-21)

**Decision:** Três pendências registradas em `.specs/codebase/CONCERNS.md` ("Contrato de API incompleto" e "Nome da variável de ambiente") são resolvidas: (1) `codigoEmpresa`, recebido do ERP via query parameter na URL de abertura, **corrige AD-002** — que erroneamente o excluía do conjunto de credenciais persistidas. Ele DEVE ficar salvo junto das demais, pois é reenviado como campo `Empresa` em praticamente todos os endpoints de `ApiCentriumOAuth.yaml` — mapeamento do contrato confirma que o campo já existia, só sob outro nome. (2) `refresh_token` confirmado que **não será utilizado** — reautenticação segue via novo `password` grant (reforça AD-002). (3) A variável de ambiente Docker do domínio base (AD-003) se chama `baseDomain`.
**Reason:** Mapeamento fino do usuário contra o contrato yaml e confirmação direta das pendências em aberto.
**Trade-off:** Nenhum.
**Impact:** De três pendências do contrato, resta só uma real: host por tenant sem bloco `servers:` formal — ver `.specs/codebase/CONCERNS.md`. `.specs/features/autenticacao-sessao-bootstrap/spec.md` (requisitos `AUTH-01`, `AUTH-06`, edge cases) atualizado para refletir.

---

### AD-020: Fase Specify concluída para `Modal vendedor` e `Modal menu gerencial` (2026-08-21)

**Decision:** As duas telas sem requisito formal identificadas em AD-017 tiveram a fase Specify concluída. `Modal vendedor` virou `.specs/features/selecao-vendedor/spec.md` — inclui o requisito `VEND-01` (listagem de vendedores por empresa via `GET`) explicitamente marcado como pendência bloqueante, já que nenhum endpoint de *listagem* de vendedores existe em `ApiCentriumOAuth.yaml` (só campos pontuais em `GetSessao`, `FaturarNFCe`, `ListaDAVs` e `CarregarNFCe` — nenhum candidato plausível de endpoint de listagem foi encontrado ao inspecionar o contrato; correção 2026-08-21, revisão cruzada encontrou a ocorrência em `CarregarNFCe` que a primeira varredura havia deixado passar) — e reforça, no Problem Statement e nos critérios de aceite, que o vendedor selecionado (quem atendeu o cliente final) é semanticamente distinto do operador de caixa logado. `Modal menu gerencial` **não** virou spec de feature completo — decisão foi expandir a nota já existente em `.specs/codebase/ARCHITECTURE.md` (seção "Responsividade"), por ser um menu de dois links estáticos para telas legadas do ERP, sem estado ou lógica própria do Checkout. Ao inspecionar o design (frame `viV0S`), confirmou-se que o modal tem duas opções — "Central de movimentação não fiscal" (URL confirmada: `WPMovimentoNaoFiscal_Lancamento.aspx`) e "Relatório de resumo de caixa" (URL **não confirmada** — não presumir que é a mesma da primeira opção, o conteúdo descrito é distinto).
**Reason:** Fechar a lacuna registrada em AD-017/`CONCERNS.md` antes de qualquer código, mantendo a proporcionalidade do artefato de Specify ao tamanho real de cada tela — `selecao-vendedor` tem lógica de busca/filtro/seleção reaproveitando o padrão de `Modal cliente`, já `menu gerencial` é só navegação.
**Trade-off:** Nenhum.
**Impact:** `.specs/project/ROADMAP.md` (Milestone 1, itens 8 e 9) e `.specs/codebase/CONCERNS.md` ("Telas desenhadas sem spec de requisito") atualizados para refletir a conclusão. Duas pendências reais permanecem, agora rastreadas nos documentos específicos (não mais como pendência genérica de "tela sem spec"): endpoint de listagem de vendedores (`.specs/features/selecao-vendedor/spec.md`, `VEND-01`) e URL da segunda opção do menu gerencial (`.specs/codebase/ARCHITECTURE.md`).

---

### AD-021: Revisão cruzada de toda a documentação `.specs/` (2026-08-21)

**Decision:** Rodada de revisão com um subagente por documento (15 arquivos de `.specs/`), cruzando cada um contra os demais, contra `ApiCentriumOAuth.yaml` e contra o design real no Pencil. Correções aplicadas: (1) `GetListaClientes` e `ListaNFCEs` rebaixados de "resolvido" para pendência — não existem no contrato apesar de registrados como confirmados com o ERP em 2026-08-20 (decisão do usuário: manter rebaixado até reconfirmação, não presumir que o yaml está desatualizado); `StatusPIX` idem; `ValidaTicketDevolucao`/`PAY-07` também tiveram claims específicos (campo de valor, campo de elegibilidade) rebaixados por não terem respaldo no contrato. (2) `FaturarNFCe`/`FIN-01` (`.specs/features/finalizacao-suspensao-venda/spec.md`) passou a exigir `vendedorCodigo` e `Empresa` no payload, fechando lacuna com `selecao-vendedor/spec.md` (`VEND-05`). (3) Inventário de ocorrências de `vendedorCodigo` no contrato corrigido (faltava `CarregarNFCe`). (4) "Modal menu gerencial" confirmado como desktop-only — decisão do usuário, registrado em `.specs/features/layout-responsivo-mobile/spec.md`. (5) Diversos ajustes de precisão/completude em `PROJECT.md`, `ROADMAP.md`, `STACK.md`, `ARCHITECTURE.md`, `INTEGRATIONS.md`, `CONCERNS.md` e nos specs de `carrinho-produto-precificacao`, `pagamento`, `importacao-dav`, `identificacao-cadastro-cliente`, `selecao-vendedor`.
**Reason:** A sequência de edições de AD-017 a AD-020 introduziu pequenas inconsistências entre documentos que só uma revisão cruzada dedicada pegaria — comum quando muitos arquivos interligados são editados em sequência rápida.
**Trade-off:** Nenhum.
**Impact:** Nenhuma pendência nova além das já listadas em `.specs/codebase/CONCERNS.md`. Documentação `.specs/` considerada consistente entre si e com o contrato/design reais nesta data.

---

### AD-022: Introdução de um BFF mínimo de sessão/autenticação — corrige AD-002/AD-010 (2026-08-21)

**Decision:** Corrige AD-002 e AD-010: a premissa "SPA sem backend próprio" não se sustenta para o fluxo de autenticação, porque um cookie `HttpOnly` só pode ser setado por uma resposta de servidor — nenhuma decisão anterior definia quem seta esse cookie nem como o JS acessaria `codigoEmpresa` ou dispararia a renovação de sessão (`AUTH-06`) sem acesso ao token. Introduz-se um BFF (Backend for Frontend) mínimo — sem banco de dados, sem lógica de negócio, o ERP continua sendo a única fonte de verdade — rodando no mesmo processo/container Node que hoje serve os assets estáticos da SPA (ver Containerização em `.specs/codebase/ARCHITECTURE.md`), com três rotas:

- `GET /session/start` — recebe o redirect do ERP com os mesmos query params de AD-002, mais o novo campo `validationKey`: uma credencial fixa por ambiente (variável de ambiente Docker), igual para todos os tenants, que só confirma que a chamada partiu de uma configuração legítima do ERP — separada e ortogonal das credenciais OAuth por operador. O BFF valida `validationKey`, chama `POST /oauth/access_token`, cifra `access_token` + as credenciais originais com uma chave de servidor (variável de ambiente Docker `SESSION_SECRET`) e devolve isso em `Set-Cookie` (`HttpOnly`, `Secure`, `SameSite=Lax`), depois redireciona para a URL limpa da SPA.
- `GET /api/bootstrap` — decifra o cookie no servidor e devolve ao JS só os campos não sensíveis (`codigoEmpresa`, `tenant`), combinados com a resposta do `GetSessao` (AD-004) numa única chamada.
- `/api/erp/*` — proxy de toda chamada de negócio subsequente (produto, cliente, pagamento, NFCe); o BFF decifra o cookie, injeta `Authorization`/`Empresa` e repassa ao ERP. Em caso de `401`, renova o token sozinho repetindo o `password` grant — `AUTH-06` passa a ser lógica 100% de servidor, nunca exposta ao JS nem à aba Network do navegador.

Cifrado, não só assinado: `HttpOnly` impede leitura via JavaScript, mas não impede o próprio operador inspecionar o cookie pelas DevTools do navegador — cifrar garante que mesmo assim `client_secret`/`password` não fiquem legíveis.

**Reason:** Sem essa peça, AD-010 (cookie `HttpOnly`) era irrealizável como estava documentada — o próprio objetivo da decisão (impedir acesso do JS ao token) ficava sem mecanismo que o sustentasse. Decisão do usuário, após levantar a contradição diretamente.
**Trade-off:** O Checkout deixa de ser "SPA sem backend próprio" — ganha um componente de servidor novo para manter/deployar, ainda que sem banco de dados nem lógica de negócio. Em troca, o objetivo real de segurança de AD-010 passa a ser alcançável de fato.
**Impact:** `.specs/codebase/ARCHITECTURE.md` (Pattern, High-Level Structure, Autenticação e segurança, Containerização), `.specs/codebase/STACK.md` (seção Backend), `.specs/codebase/INTEGRATIONS.md` (Implementation da API do ERP) e `.specs/features/autenticacao-sessao-bootstrap/spec.md` (`AUTH-01` a `AUTH-06`, Edge Cases) atualizados para refletir. AD-002 e AD-010 permanecem como registro histórico da decisão original, com nota de correção apontando para esta.

---

### AD-023: Revisão do `ApiCentriumOAuth.yaml` atualizado — fecha a maioria das pendências de API (2026-08-21)

**Decision:** O usuário disponibilizou uma nova versão do `ApiCentriumOAuth.yaml` (`info.version: 20260821131003`, agora com bloco `servers:`, 16 endpoints e schemas completos). Revisão cruzada contra `.specs/codebase/CONCERNS.md`/`INTEGRATIONS.md` e as specs de feature, complementada por verificação direta do usuário e por um subagente que inspecionou o objeto `APICentriumOAuth` e procedures relacionadas na KB real do GenExus (`mcp__genexus__*`). Resultado:

**Resolvidos (contrato ou resposta direta do usuário):**
- `GetListaClientes`, `StatusPIX` e `GetListaNFCes` (nome real do antigo "`ListaNFCEs`") confirmados presentes no contrato — `CLI-02`/`PAY-04` promovidos a Verified.
- Novo endpoint `GetListaVendedores` (mesmo padrão paginado de `GetListaClientes`) — resolve `VEND-01`, pendência bloqueante de `selecao-vendedor/spec.md`. Novo endpoint `GerarPIX` também presente, sem spec associada ainda.
- Host por tenant: decisão do usuário — ambiente local de dev não tem tenant, o bloco `servers:` do contrato é só a URL de dev do GeneXus; o padrão `TENANT.<domínio-base>` (AD-003/AD-019) permanece correto e não precisa de formalização adicional no contrato.
- `DescontoConvenio` é percentual — confirmado no KB (`PGeraPedidoVenda`: `&ConvDsc = (1 - CliConvDsc / 100)`).
- `FormaMeioPagtoNFe` — confirmado domain `NFCe_FormaPagto` no KB, com lista completa de valores (superset da tabela SEFAZ padrão).
- Elegibilidade de `ValidaTicketDevolucao` — **⚠️ superado em 2026-08-27 por AD-101, leia lá antes de implementar.** A afirmação original desta linha ("não há campo booleano; a elegibilidade é indicada comparando `Mensagem` ao literal fixo `'Ticket Válido'`", confirmada no KB em `PCheckout_ValidaTicketDevolucao` → `PValidaTicketNfCe.Call`) **está incorreta quanto à ausência do campo**: `ValidaTicketDevolucaoOutput` tem sim um campo `Valido: boolean` no contrato (`ApiCentriumOAuth.yaml`, linhas 668-676), e a AD-101 confirmou por nova inspeção da mesma procedure que ela **preenche `&Valido` explicitamente** em ambos os ramos (`true`/`false`). A regra vigente é a de AD-101 — usar só `Valido`, sem fallback de `Mensagem`. Item 32 de `.specs/project/PENDENCIES.md` resolvido.
- Origem do `NumeroNota` em `FaturarNFCe` — confirmado no KB: `= 0` gera nota nova (100% Checkout, via `PNFeSerializaRascunhoNota`), `<> 0` usa nota pré-existente/importada (`AtualizarCapa`).
- Estorno de TEF — resposta direta do usuário: depois de cobrado, o TEF não pode mais ser removido da venda (não é uma questão de endpoint, é regra de UI/negócio do Checkout).
- Validação de IBGE no cadastro simplificado — decisão do usuário: campo de endereço fica livre, sem validação.
- Mecanismo de "marcar DAV como importado" — resposta direta do usuário: não há endpoint próprio; tratado via `FaturarNFCe` com um campo do SDT `CheckoutFaturarNFCe` ainda não definido (fica como pendência de implementação, não de documentação).

**Correção de hipótese:** `TipoPreco` (config padrão da empresa, `SessaoUsuario`, via `PTrazEmpDefP`) e `ListaPreco` (lista de preço do cliente, `CliListCod`, via `PCheckout_GetCliente`) são conceitos **distintos** — a hipótese inicial de correlação com `PrecoVenda1`...`PrecoVenda5` não foi confirmada; nenhum dos dois tem enum de valores válidos no KB. **→ Corrigido em AD-025 (2026-08-24):** `TipoPreco` foi caracterizado por completo via regra de negócio confirmada pelo usuário.

**Continua pendente (precisa de contato direto com a equipe do ERP):** formato de código de barras pesável (`ProdutoPesavel`/`DavMatProdPes`) — nenhuma lógica de parse encontrada em ~6% do KB varrido; achado lateral (`wManutencaoImplantacaoProdutos`) sugere código multi-valor (default `'E'`), não um simples `S`/`N`.

**Reason:** Fechar o máximo possível das pendências de contrato antes de iniciar a fase Design de `carrinho-produto-precificacao`, evitando que decisões de UI dependam de suposições sobre a API.
**Trade-off:** Nenhum.
**Impact:** `.specs/codebase/CONCERNS.md`, `.specs/codebase/INTEGRATIONS.md`, `.specs/features/selecao-vendedor/spec.md` (`VEND-01`), `.specs/features/pagamento-pix/spec.md` (`PAY-04`), `.specs/features/pagamento-geral/spec.md` (`PAY-05`), `.specs/features/pagamento-tef/spec.md` (edge case de forma de pagamento TEF), `.specs/features/identificacao-cadastro-cliente/spec.md` (`CLI-02`, IBGE, `DescontoConvenio`), `.specs/features/finalizacao-suspensao-venda/spec.md` (edge case de `NumeroNota`), `.specs/features/carrinho-produto-precificacao/spec.md` (`TipoPreco`/`ListaPreco`, `DescontoConvenio`, `ProdutoPesavel`) e `.specs/features/importacao-dav/spec.md` (marcação de DAV importado) atualizados para refletir.

---

### AD-024: Verificação direta na KB GenExus (`mcp__genexus__*`) das pendências remanescentes pós-AD-023 (2026-08-21)

**Decision:** Diferente de AD-023 (revisão do arquivo de contrato `ApiCentriumOAuth.yaml`), esta rodada leu diretamente os objetos reais da KB GenExus (`CentriumDEVU6`, GeneXus 18.0.10) via `mcp__genexus__genexus_read`/`genexus_search_source`/`genexus_analyze`: a procedure `PCheckout_GetSessao` e a SDT `SessaoUsuario` completas, `PCheckout_GetProduto`, `PCheckout_FaturarNFCe` (fonte completa, 814 linhas), `PCheckout_CarregarNFCe`, `PCheckout_PostCliente`, `PCheckout_GetStatusSistema`, `PCheckout_GetDav`, o objeto API `APICentriumOAuth` (eventos + rotas) e o DataProvider `DpCheckout_GetDavs`. Resultado:

**Resolvidos (confirmados no código-fonte real do ERP, não só no contrato):**
- **`QtdMinCharParaConsulta`:** `PCheckout_GetSessao` já aplica o piso de 3 no próprio ERP (`iif(&QtdMinChar <= 2, 3, &QtdMinChar)`). O Checkout deve usar o valor retornado diretamente — nunca hardcodar 3 — porque o servidor já garante o mínimo. Pendência de `carrinho-produto-precificacao/spec.md` fechada.
- **`PAY-07` (`FpgUtiCar`):** o campo **existe** — `SessaoUsuario.CondicoesDePagamento.CondicaoFormasDePagamento.FormaFpgUtiCar` está na SDT da KB e também já está em `ApiCentriumOAuth.yaml` (linhas 893-916, `FormaFpgUtiCar: type string`). A pendência registrada em `PENDENCIES.md`/`pagamento/spec.md` estava desatualizada. Ressalva encontrada: `PCheckout_GetSessao` só preenche esse campo no branch de "regra de forma de pagamento dinâmica definida" — no branch de fallback ("sem regra, puxa todos"), o campo fica vazio. Documentar essa ressalva, não é mais pendência bloqueante.
- **Pré-seleção de vendedor em `CarregarNFCe`:** confirmado — `PCheckout_CarregarNFCe` retorna `vendedorCodigo = RepCod` (o vendedor salvo no rascunho). O frontend deve pré-selecionar automaticamente esse vendedor ao carregar um rascunho. Pendência de `selecao-vendedor/spec.md` fechada.
- **Impressão pós-autorização (`finalizacao-suspensao-venda`):** confirmado — a sub-rotina `SuspenderOuFaturar` de `PCheckout_FaturarNFCe` já lê o PDF gerado em disco (`PNfePasta_WEB.Udp`) e devolve o conteúdo em base64 (`NotaFiscal.PDFImpressao`, junto de `NotaFiscal.XMLImpressao`) na própria resposta de `FaturarNFCe`. Não existe "impressão direta pelo servidor" nem opção separada de PDF — o Checkout sempre recebe o arquivo pronto embutido na resposta e decide como apresentá-lo/imprimi-lo no cliente.
- **`ListaDAVs` — filtros:** o endpoint **aceita `TxtBusca`** (`DpCheckout_GetDavs`: busca em `DavNum` OR `DavTit` OR `DavCliNom` — número, título e nome do cliente), não só `Pagina`/`TamanhoPagina` como constava. Porém dois dos 6 filtros do design **nunca serão parametrizáveis nesse endpoint**: `DavDatEmi = &Today` e `DavSta = 'A'` estão hardcoded na query do DataProvider — a listagem sempre é "hoje" + status aberto, não é uma questão de o contrato aceitar ou não esses parâmetros. Filtros de vendedor/tipo/origem continuam genuinamente não suportados. Achado lateral: bug de paginação no ERP — `&TamanhoPaginaAuxiliar` é limitado a 50 e depois **sobrescrito sem o teto** quando `&TamanhoPagina` não é vazio (duas atribuições em sequência, a segunda anula o cap da primeira) — o Checkout não deve confiar no servidor para limitar o tamanho de página, deve limitar no próprio request.
- **`PostCliente` — "Limite de crédito"/"Permite venda a crédito":** confirmado ausente diretamente no código-fonte da procedure (não só no schema) — `PCheckout_PostCliente` só usa `Empresa, cpf, nome, email, celular, cep, endereco, bairro, numero, cidade, uf`. Achados laterais: `CliTip` é hardcoded `'F'` (o cadastro simplificado do Checkout só cria pessoa física, nunca jurídica); e quando a empresa tem `UtilizaSegundoNivelDeEnderecos = 'S'`, o mesmo payload é roteado para criar um registro de `Endereco` separado em vez de gravar os campos direto no cliente — transparente para o Checkout (mesmo payload), mas relevante caso o tenant tenha essa config ligada.

**Reforçados como pendência real (não resolvida, mas com evidência mais forte de que não há solução só de nomenclatura):**
- **`usaPrecoPorQuantidade`:** lido o SDT `SessaoUsuario` por completo — o campo não existe sob nenhum nome. Também não existe em `SDTCheckout_GetProduto` (`PCheckout_GetProduto`) — só os limiares `QtdMinimaPreco2..5` (`MatQtMiPV2..5`). Não há, em lugar nenhum do contrato, um booleano/flag equivalente. Hipótese a validar com o time: o Checkout pode inferir "modo por faixa" localmente (`QtdMinimaPreco2 > 0` ⇒ tiered) em vez de esperar um flag explícito — precisa confirmação de que essa inferência é segura. **→ Resolvido em AD-025 (2026-08-24):** não é inferido por `QtdMinimaPreco2` — o modo por faixa é indicado por `SessaoUsuario.TipoPreco = 8`.
- **`ProdutoPesavel`/`DavMatProdPes`:** confirmado que é o mesmo conceito em dois contextos (`MatProdPes` no produto, `DavMatProdPes` no item de DAV). Novo detalhe: em `wManutencaoImplantacaoProdutos`, a linha `Default(&sdtDefaultProdutos.MatProdPes,'E')` está **comentada** (`//`, inativa) — o "default 'E'" documentado em AD-023 não está de fato em vigor nesse WebPanel; e a validação de campo obrigatório trata o valor via `.IsEmpty()` (texto, não booleano `S`/`N`), reforçando a hipótese de código multi-valor. Segue sem lógica de parse de código de barras pesável encontrada — precisa da equipe do ERP.
- **`CheckoutFaturarNFCe` → campo de vínculo com DAV:** lida a SDT completa — não existe nenhum campo (nem `NumeroDav`, nem equivalente) em `CheckoutFaturarNFCe` hoje. Rodada adicional de `genexus_analyze(mode=impact)` em `DavDocFNum` (campo que a DAV usa para registrar o documento fiscal gerado) não encontrou nenhuma procedure do Checkout escrevendo nele. Ou seja, a pendência não é só "falta nomear o campo" — hoje **não existe nenhum caminho de código, em lugar nenhum da KB, que marque a DAV como faturada a partir do fluxo do Checkout**. É mudança de KB do ERP, não só de nomenclatura de contrato.
- **`GetStatusSistema`:** confirmado que a procedure só repassa o valor bruto do atributo `CadStatus` (`NUMERIC(4)`, tabela de cadastro de máquina) sem nenhuma transformação — e `CadStatus` não tem `Documentation`/`Help` preenchidos na KB. A semântica dos códigos é uma lacuna de documentação do próprio ERP, não algo recuperável via KB — precisa mesmo de contato direto com a equipe.
- **`FaturarNFCe.produtos` — trilha de tier de preço:** confirmado, campo a campo, que o array só tem `sequencial, codigoProduto, quantidade, precoUnitario, DescontoPercentual, DescontoValor, UDM, ValorBruto, ValorTotal` — nenhum campo para registrar a faixa de preço aplicada. **→ Resolvido em AD-069 (2026-08-26):** satisfeito pelo evento `PRODUTO_ALTERADO` do log de auditoria geral (AD-061) — log fica só no Checkout, sem expandir o contrato de `FaturarNFCe`.

**Reason:** Esgotar a verificação por KB antes de escalar as pendências remanescentes para contato direto com a equipe do ERP — reduzir ao mínimo o que depende de resposta humana.
**Trade-off:** Nenhum.
**Impact:** `.specs/project/PENDENCIES.md`, `.specs/codebase/CONCERNS.md`, `.specs/features/carrinho-produto-precificacao/spec.md`, `.specs/features/pagamento-geral/spec.md` (`PAY-07`), `.specs/features/selecao-vendedor/spec.md`, `.specs/features/identificacao-cadastro-cliente/spec.md`, `.specs/features/importacao-dav/spec.md` e `.specs/features/finalizacao-suspensao-venda/spec.md` atualizados para refletir.

---

### AD-025: Regra de negócio de `TipoPreco`/`EmpDefPre` confirmada diretamente pelo usuário — corrige AD-023 e resolve `usaPrecoPorQuantidade` (2026-08-24; campo de leitura corrigido em 2026-08-25, ver AD-059)

**Decision:** Diferente de AD-023/AD-024 (inspeção de contrato/KB), esta correção veio de resposta direta do usuário sobre a regra de negócio do domain `EmpDefPre`. `SessaoUsuario.TipoPreco` (via `PTrazEmpDefP.Call`) vai de `1` a `11` e indica **diretamente o preço de venda a aplicar no item** — não é um espelho 0-based de `ListaPreco` como a hipótese de AD-023 chegou a cogitar. Para **todo `TipoPreco` diferente de `8`** — o que inclui `1` a `5` e também `9` (preço por lista) — o valor a aplicar é o **campo único `PrecoVenda`**, retornado por `GetProduto` (e **somente** por ele — ver AD-091): o ERP já resolve internamente qual regra vale (índice `1`-`5` ou lista do cliente) e devolve o valor final pronto nesse campo; o Checkout não indexa `PrecoVenda1`...`PrecoVenda5` nem lê `PrecoVendaLista` para nenhum desses casos. `6`, `7`, `10` e `11` são casos especiais, dos quais dois mapeados:
- `TipoPreco = 9` — preço por lista: aplicar **sempre** a lista de preço do cadastro do cliente (`ClienteCheckout.ListaPreco`/`CliListCod`; quando a venda corre com o **cliente default**, essa mesma lista chega pronta em `SessaoUsuario.ListaPrecoDefault` e o Checkout não chama `GetCliente` — AD-108). **Não existe lista de preço padrão da empresa** e não há fallback — `TipoPreco = 9` significa exatamente "o preço vem da lista do cliente" (ver AD-092). O valor final já vem resolvido no campo `PrecoVenda` de `GetProduto` — o Checkout não lê `SDTCheckout_GetProduto.PrecoVendaLista` para aplicar o preço.
- `TipoPreco = 8` — preço por faixa de quantidade: resolve a pendência de `usaPrecoPorQuantidade` (AD-024) — **não existe flag booleano separado no contrato**, o próprio valor `8` já é o sinal, substituindo a hipótese de inferir via `QtdMinimaPreco2 > 0`. É o **único caso** em que o Checkout usa os campos `PrecoVenda1`...`PrecoVenda5` em vez do campo único `PrecoVenda`, porque a faixa depende da quantidade agregada do SKU no carrinho da venda em curso — estado que o ERP não conhece numa chamada isolada de `GetProduto`.

Semântica de `6`, `7`, `10` e `11` foi confirmada em seguida (AD-031, corrigida por AD-060, 2026-08-25): os quatro valores estão no escopo do Checkout e são tratados pela mesma regra geral acima — leem o campo único `PrecoVenda`, sem lógica adicional.

**Reason:** Fechar a lacuna mais crítica do motor de precificação (`carrinho-produto-precificacao`) antes da fase Design — a ambiguidade anterior bloqueava tanto a UI quanto o cálculo de preço.
**Trade-off:** Nenhum.
**Impact:** `.specs/codebase/CONCERNS.md`, `.specs/project/PENDENCIES.md` (itens 1 e 2) e `.specs/features/carrinho-produto-precificacao/spec.md` (Edge Cases, Acceptance Criteria, Requirement Traceability) atualizados para refletir.

---

### AD-026: Quatro pendências de produto resolvidas por decisão direta do usuário — polling de PIX, campo de cancelamento em `FaturarNFCe`, remoção de campos de crédito, URL do menu gerencial (2026-08-24; item 2 corrigido em 2026-08-25 pela AD-062 — campo `produtoCancelado` removido do escopo, substituído pelo log de auditoria geral)

**Decision:** Rodada de respostas diretas do usuário fechando quatro pendências de `.specs/project/PENDENCIES.md` que dependiam de decisão de produto (não de KB/contrato):

1. **Intervalo de polling de `StatusPIX` (item 5):** a cada 10 segundos, sem estratégia de backoff documentada. Ver `.specs/features/pagamento-pix/spec.md` (`PAY-04`, Edge Cases).
2. **[CORRIGIDO em 2026-08-25 pela AD-062 — a solução abaixo NÃO é implementada; ver a frase em negrito ao final deste item para o mecanismo atual]** Trilha de auditoria de cancelamento em `FaturarNFCe` (item 6) e campo de autoria de cancelamento no SDT de produto (item 21) — mesma decisão resolve as duas: a proposta original (2026-08-24) era adicionar o campo `produtoCancelado` (`boolean`, `NULL` equivale a `false`) ao SDT `CheckoutFaturarNFCe`, indicando que um item foi inserido no carrinho e depois cancelado antes da finalização; o contrato não ganharia campo dedicado para tier de preço, só para marcar cancelamento. **Mecanismo atual (AD-062, 2026-08-25): esse campo dedicado NÃO é implementado — cancelamento de item é rastreado só pelo evento `PRODUTO_CANCELADO` no log de auditoria geral da venda (campo `Log`, ver `.specs/features/auditoria-acoes-operador/spec.md`).** Ver `.specs/features/finalizacao-suspensao-venda/spec.md` (`FIN-02`/`FIN-12`) e `.specs/features/carrinho-produto-precificacao/spec.md` (`CART-08`, Edge Cases) para o comportamento vigente.
3. **Campos "Limite de crédito"/"Permite venda a crédito" no cadastro simplificado (item 9):** serão removidos da tela — sem tratamento como somente-leitura, sem expansão de contrato pedida ao ERP. Remoção visual no frame `PDV Online Web - Modal cadastro de cliente` (`design/CentriumCheckout.pen`) ainda não aplicada nesta rodada, só o requisito foi corrigido. Ver `.specs/features/identificacao-cadastro-cliente/spec.md` (Edge Cases).
4. **URL da opção "Relatório de resumo de caixa" no menu gerencial (item 12):** mesmo link da opção "Central de movimentação não fiscal" (`WPMovimentoNaoFiscal_Lancamento.aspx`), apesar da descrição de conteúdo distinta no design. Ver `.specs/codebase/ARCHITECTURE.md` (seção Responsividade).

**Reason:** Fechar pendências de produto que não dependiam de nova inspeção de KB/contrato, só de decisão do usuário — reduzindo o índice de `.specs/project/PENDENCIES.md` antes da fase Design de `carrinho-produto-precificacao`.
**Trade-off:** Nenhum.
**Impact:** `.specs/project/PENDENCIES.md` (itens 5, 6, 9, 12 e 21 removidos da seção 1), `.specs/features/pagamento-pix/spec.md`, `.specs/features/finalizacao-suspensao-venda/spec.md`, `.specs/features/carrinho-produto-precificacao/spec.md`, `.specs/features/identificacao-cadastro-cliente/spec.md`, `.specs/codebase/ARCHITECTURE.md` e `.specs/codebase/CONCERNS.md` atualizados para refletir. Duas pendências de implementação ficam abertas para a equipe do ERP: o campo `produtoCancelado` (**removido do escopo em 2026-08-25 pela AD-062 — não é mais implementado, ver ponto 2 acima**) e a remoção visual dos campos de crédito no Pencil (trabalho de design, não de requisito).

---

### AD-027: Mecanismo de editabilidade de produto ao TAB na grid confirmado por decisão do usuário — estreita pendência #4 (2026-08-24)

**Decision:** A flag de editabilidade do cadastro do produto decide se o TAB no campo de código insere a linha ou não — não é sobre campos ficarem somente-leitura depois de já inseridos (duas redações anteriores desta mesma decisão, no mesmo dia, erraram esse ponto). Especificamente:
- Produto **não editável** → TAB insere a linha diretamente na grid nesse mesmo momento, com `preço`, `unidade de medida`, `quantidade` e `desconto` somente-leitura (mesmo fluxo de `CART-01`/`CART-02`).
- Produto **editável** → TAB **não** insere a linha; o foco pula para os campos `preço`, `unidade de medida`, `quantidade` e `desconto`, liberando edição desses valores. A linha só entra efetivamente na grid quando o operador aciona o botão `+` já previsto na UI — não há inserção automática ao fim da edição.

**Verificação na KB real do GenExus (MCP `genexus`, KB `CentriumDEVU6`):** lido `SDTCheckout_GetProduto` (estrutura completa) e `PCheckout_GetProduto` (source, que popula o SDT a partir da tabela `Materiais`, atributos `Mat*` como `MatCodRed`/`MatPreVen1-5`/`MatUniVen`/`MatProdPes`). Buscas por `MatEdit*`, `MatBloq*` e `MatPermite*` na KB não retornaram nenhum atributo. **Confirmado: não existe hoje nenhum campo de editabilidade no contrato nem na origem** — não é falta de mapeamento no SDT, é lacuna real de dado no ERP.
**Reason:** Fechar mais uma pendência de UI de `carrinho-produto-precificacao` antes da fase Design, mesmo objetivo de AD-025/AD-026.
**Trade-off:** Nenhum.
**Impact:** `.specs/project/PENDENCIES.md` (item 4, categoria realinhada de "comportamento de UI não desenhado" para "pergunta de contrato/KB", com achado de KB anexado) e `.specs/features/carrinho-produto-precificacao/spec.md` (Edge Cases) atualizados. Falta ao ERP criar o campo de editabilidade no contrato — mesmo status "PENDÊNCIA DEV" do item 13 (`.specs/project/PENDENCIES.md`).

---

### AD-028: Formato de código de barras pesável confirmado por decisão direta do usuário — resolve pendência #3 (2026-08-24)

**Decision:** Um código de barras bipado identifica um produto pesável (gerado por balança) quando tem **13 dígitos** e **começa com `2`**. Essa é a condição completa de detecção no lado do Checkout — não depende de nenhum campo do contrato (`ProdutoPesavel`/`MatProdPes`/`DavMatProdPes` continuam servindo só para o cadastro saber que o produto *pode* ser pesado, não para o parse do código bipado em si). O formato confirma a hipótese de padrão EAN-13 de balança levantada em AD-023, descartando a alternativa de sintaxe `código*quantidade`.

**Escopo da resolução:** a decisão do usuário fecha a detecção (comprimento + prefixo). A extração exata dos demais dígitos do código (faixa reservada ao código reduzido do produto vs. faixa reservada ao peso/valor, mais dígito verificador) segue sem confirmação — nenhuma lógica de parse foi localizada na KB (AD-023) e o usuário não detalhou o restante da máscara nesta rodada. **Corrigido em AD-068 (2026-08-26):** essa lacuna volta a ser pendência bloqueante de requisito — sem a máscara completa, a story P1 "Inserção direta por código conhecido" não é implementável para produtos pesáveis; a classificação original como "detalhe de implementação não bloqueante" subestimava o impacto.

**Reason:** Fechar mais uma pendência de produto de `carrinho-produto-precificacao` antes da fase Design, mesmo objetivo de AD-025/AD-026/AD-027.
**Trade-off:** Nenhum na detecção; o parse fino dos dígitos internos ainda pode exigir ajuste quando a equipe do ERP confirmar a máscara completa.
**Impact:** `.specs/project/PENDENCIES.md` (item 3 removido da seção 1), `.specs/codebase/CONCERNS.md` (bullet movido de "sem confirmação" para "resolvido") e `.specs/features/carrinho-produto-precificacao/spec.md` (Edge Cases) atualizados. **Reaberto como item 29 (bloqueante) por AD-068.**

---

### AD-029: Sintaxe `código*quantidade` e inserção via Enter confirmadas por decisão direta do usuário — complementa CART-02 (2026-08-24)

**Decision:** No fluxo de inserção direta por código conhecido (`CART-02`), quando o operador **digita** (não bipa) o código e pressiona Enter:
- Se digitar só o código → o sistema carrega o produto (`GetProduto`) e insere a linha na grid com quantidade `1` (padrão).
- Se digitar no formato `código*quantidade` (ex.: `12345*3`) → o sistema carrega o produto pela parte antes do `*` e aplica o valor após o `*` diretamente ao campo de quantidade do item, inserindo a linha já com essa quantidade.

**Distinção de AD-028:** este é um mecanismo de **digitação manual** via teclado, não de leitura de código de barras **bipado** (scanner). AD-028 resolveu como o Checkout reconhece um código de barras *bipado* de produto pesável (13 dígitos, prefixo `2`, sem `*`); esta decisão (AD-029) é ortogonal — trata de um atalho de teclado para informar quantidade na hora de digitar qualquer código de produto, pesável ou não.

**Reason:** Fechar detalhe de comportamento da story `P1: Inserção direta por código conhecido`, ainda não coberto pelas Acceptance Criteria existentes.
**Trade-off:** Nenhum.
**Impact:** `.specs/features/carrinho-produto-precificacao/spec.md` (nova AC3 na story de inserção direta, Independent Test estendido).

---

### AD-030: `CART-09`/`CART-10` resolvidos por decisão direta do usuário — remove os últimos bloqueios deliberados de `carrinho-produto-precificacao` (2026-08-24)

**Decision:** Duas pendências marcadas como "não resolver ainda" (itens 14/15 de `.specs/project/PENDENCIES.md`) fecham nesta rodada:

1. **`CART-09` — bloqueio de edição/cancelamento pós-pagamento:** qualquer forma de pagamento aprovada na venda bloqueia edição e cancelamento de item do carrinho. Se o pagamento aprovado for **TEF ou PIX**, a remoção do pagamento **não é permitida** — ambos chamam apps externos e não existe fluxo de cancelamento dessas transações — logo o bloqueio se torna permanente para o restante da venda. Se o pagamento aprovado for **cartão fora do fluxo TEF** (entrada manual, não integrada) ou **dinheiro**, a remoção do pagamento **é permitida**, o que reabilita a edição/cancelamento de item.
2. **`CART-10` — validação de saldo/estoque na inserção de produto:** o Checkout **não implementa** nenhuma validação de saldo/estoque ao inserir produto no carrinho — é regra de controle exclusiva do ERP.

**Reason:** Fechar os dois últimos bloqueios deliberados de `carrinho-produto-precificacao`, item pendente desde a Specify inicial (2026-08-20), liberando a feature para prosseguir sem exceções na fase Design.
**Trade-off:** Nenhum. Para `CART-09`, o efeito colateral aceito é que uma venda com pagamento TEF/PIX aprovado fica definitivamente travada para edição/cancelamento de item pelo resto do atendimento — não há caminho de escape, por design.
**Impact:** `.specs/project/PENDENCIES.md` (itens 14 e 15 removidos da seção 3), `.specs/features/carrinho-produto-precificacao/spec.md` (Edge Cases + Requirement Traceability, `CART-09`/`CART-10` de "em análise"/"em aberto" para `Verified`) e `.specs/project/ROADMAP.md` (nota do Milestone 1 sobre bloqueio deliberado removida) atualizados.

---

### AD-031: Semântica de `TipoPreco` = `6`, `7`, `10`, `11` confirmada pelo usuário — todos no escopo, tratados via `PrecoVenda` (2026-08-25; corrigido em 2026-08-25 pela AD-060 — a redação original desta AD declarava esses quatro valores fora de escopo, decisão revertida pelo usuário)

**Decision:** Fecha a última lacuna de semântica de `SessaoUsuario.TipoPreco` (domain `EmpDefPre`, ver AD-025) por resposta direta do usuário:
- `TipoPreco = 6` — Preço de Custo.
- `TipoPreco = 7` — Preço da última venda.
- `TipoPreco = 10` — Preço Cliente x Produto (`PRM0241`).
- `TipoPreco = 11` — Preço por Índice.

Os quatro valores **estão no escopo do Checkout** e são tratados exatamente como `1`-`5`/`9`: o cálculo da regra é feito inteiramente no backend (ERP), que devolve o valor final já resolvido no mesmo campo único `PrecoVenda` (`GetProduto`, único endpoint que traz esse campo — ver AD-059 e AD-091). Não há, e nunca houve, necessidade de nenhuma lógica adicional no Checkout para esses quatro casos — eles se encaixam sem exceção na regra geral de AD-059 ("todo `TipoPreco` diferente de `8` → ler `PrecoVenda`"). O motor de precificação (`CART-04`/`CART-05`) cobre `1`-`11` uniformemente, com `8` (faixa de quantidade, via `PrecoVenda1`...`PrecoVenda5`) como único caso especial.
**Reason:** Decisão direta do usuário — como o cálculo de todas as regras de `TipoPreco` é feito no backend (ERP) e devolvido sempre no mesmo campo `PrecoVenda`, não existe motivo técnico para excluir `6`, `7`, `10` ou `11` do escopo do Checkout; a redação original desta AD (2026-08-25) declarava esses valores fora de escopo por engano, corrigido no mesmo dia pela AD-060.
**Trade-off:** Nenhum — tratar `6`, `7`, `10` e `11` como os demais casos não-`8` não introduz lógica nova nem custo adicional, já que a leitura de `PrecoVenda` já é feita para `1`-`5` e `9`.
**Impact:** `.specs/project/PENDENCIES.md` (nota do item 1 corrigida), `.specs/codebase/CONCERNS.md` e `.specs/features/carrinho-produto-precificacao/spec.md` (Edge Cases, Acceptance Criteria, Requirement Traceability, Coverage) atualizados para refletir — ver também AD-060.

---

### AD-032: Vendedor e cliente pré-selecionados por padrão ao iniciar uma nova NFCe, a partir de `GetSessao` — decisão direta do usuário (2026-08-25)

**Decision:** Ao iniciar uma nova NFCe, antes (ou na ausência) de qualquer seleção manual do operador:
- O vendedor pré-selecionado por padrão é `SessaoUsuario.VendedorCodigo`/`VendedorNome` (retornados por `GetSessao`, já persistidos no bootstrap via Dexie — ver `.specs/features/autenticacao-sessao-bootstrap/spec.md`) — são os valores configurados como default da empresa, não uma suposição do Checkout. Vendedor é campo obrigatório em `FaturarNFCe` (`.specs/features/finalizacao-suspensao-venda/spec.md`, `FIN-07`).
- O cliente pré-selecionado por padrão é `SessaoUsuario.ClienteDefaultCodigo`/`ClienteDefaultNome` (mesma origem/persistência). Cliente é sempre obrigatório em toda NFCe — nunca fica vazio.
- Em ambos os casos, o operador pode substituir o default selecionando outro vendedor/cliente através dos respectivos modais (`.specs/features/selecao-vendedor/spec.md`, `.specs/features/identificacao-cadastro-cliente/spec.md`) — o default é só o valor inicial do campo, não um valor travado.

**Reconciliação com decisões anteriores (confirmado pelo usuário nesta rodada):**
- `selecao-vendedor` já tinha, como decisão confirmada, que o Checkout **nunca deve associar automaticamente vendedor = operador logado** (Out of Scope) e que `FaturarNFCe` deve receber o vendedor **"explicitamente selecionado"**, nunca **"inferido automaticamente da sessão"** (Success Criteria). Essa regra continua valendo para o valor final enviado — a pré-seleção de `GetSessao` é só o ponto de partida do campo (satisfaz a obrigatoriedade desde o início da venda, sem o operador precisar abrir o modal); manter o default sem trocá-lo já conta como "selecionado", não é uma inferência silenciosa que o operador não pode ver/mudar.
- `identificacao-cadastro-cliente` descrevia cliente como **"[Não é obrigatório]"** no Problem Statement. Isso descrevia a UX (operador não precisa abrir o modal de busca para a venda prosseguir), não a regra de negócio — cliente é sempre obrigatório para o ERP; o Checkout nunca deixa o campo vazio porque pré-preenche com o default da empresa desde o início da venda.

**Reason:** Decisão direta do usuário — Vendedor e Cliente são campos obrigatórios de toda NFCe; sem um default, a venda nasceria em estado inválido até o operador interagir com os modais de busca.
**Trade-off:** Nenhum identificado — o default é sempre substituível pelo operador, e os endpoints/campos já estavam confirmados no contrato (`ApiCentriumOAuth.yaml`, schema `SessaoUsuario`).
**Impact:** Resolve a pendência #8 de `.specs/project/PENDENCIES.md` (comportamento quando `GetListaVendedores` retorna vazio — nunca bloqueia, pois já existe vendedor default desde o início da venda). Atualiza `.specs/features/selecao-vendedor/spec.md` (Problem Statement, Out of Scope, Acceptance Criteria, Edge Cases, Success Criteria, Requirement Traceability) e `.specs/features/identificacao-cadastro-cliente/spec.md` (Problem Statement, Acceptance Criteria, Requirement Traceability).

---

### AD-033: `GetProduto` sempre envia `Tipocodproduto` = `SessaoUsuario.UsuarioTipoCodigoProduto` — clarificação de processo do usuário (2026-08-25)

**Decision:** Toda chamada a `GET /ApiCentriumOAuth/GetProduto` (inserção direta por código conhecido, `CART-02`) SHALL enviar o parâmetro `Tipocodproduto` preenchido com o valor de `SessaoUsuario.UsuarioTipoCodigoProduto` (retornado por `GetSessao`, já persistido no bootstrap). Confirmado no contrato (`ApiCentriumOAuth.yaml`): `GetProduto` tem o parâmetro `Tipocodproduto` (`query`, `string`); `SessaoUsuario.UsuarioTipoCodigoProduto` (`string`) existe na resposta de `GetSessao`.
**Escopo:** aplica-se só a `GetProduto` — `GetListaProdutos` (busca via modal, `CART-01`) não tem esse parâmetro no contrato (só `Empresa`/`Txtbusca`/`Pagina`/`Tamanhopagina`), então não é afetado por esta decisão.
**Reason:** Clarificação de processo do usuário — o tipo de código de produto (ex.: código de barras vs. código interno) que o operador digita/bipa é definido pela configuração do usuário/empresa, exposta em `GetSessao`; não é um valor a inferir ou perguntar por chamada.
**Trade-off:** Nenhum identificado — é um valor já disponível desde o bootstrap, sem chamada adicional.
**Impact:** Atualiza `.specs/features/carrinho-produto-precificacao/spec.md` (`CART-02`, Acceptance Criteria e Requirement Traceability).

---

### AD-034: `FaturarNFCe` sempre envia `CadSerieNFCe` = `SessaoUsuario.CadSerieNFCe` — clarificação de processo do usuário (2026-08-25)

**Decision:** Toda chamada a `POST /ApiCentriumOAuth/FaturarNFCe` (finalização `FATURAR` e suspensão `SUSPENDER`, `.specs/features/finalizacao-suspensao-venda/spec.md`) SHALL enviar o campo `CadSerieNFCe` preenchido com o valor de `SessaoUsuario.CadSerieNFCe` (retornado por `GetSessao`, já persistido no bootstrap). Confirmado no contrato (`ApiCentriumOAuth.yaml`): `CheckoutFaturarNFCe` (corpo de `FaturarNFCe`) tem o campo `CadSerieNFCe` (`string`); `SessaoUsuario.CadSerieNFCe` (`string`) existe na resposta de `GetSessao`.
**Reason:** Clarificação de processo do usuário — a série de NFCe a utilizar é definida pela configuração do próprio usuário/máquina (não é escolhida pelo operador nem inferida pelo Checkout), exposta em `GetSessao`.
**Trade-off:** Nenhum identificado — é um valor já disponível desde o bootstrap, sem chamada adicional.
**Impact:** Atualiza `.specs/features/finalizacao-suspensao-venda/spec.md` (Acceptance Criteria de Finalizar/Suspender e Requirement Traceability).

---

### AD-035: Ação de reimpressão por linha no Modal DAV não será implementada — decisão direta do usuário (2026-08-25)

**Decision:** A ação de reimpressão por linha presente no design do Modal DAV (frame `PDV Online Web - Modal DAV`, `design/CentriumCheckout.pen`) **não será implementada** pelo Checkout. Se o operador precisar reimprimir um DAV, deve fazer isso diretamente pelo ERP — não há requisito/critério de aceite correspondente no Checkout.
**Reason:** Decisão direta do usuário — reimpressão de documentos já existe no ERP e não precisa ser replicada no Checkout, seguindo a mesma lógica já aplicada à reimpressão de NFCe (fora de escopo, `.specs/features/finalizacao-suspensao-venda/spec.md`).
**Trade-off:** Nenhum identificado — o operador continua podendo reimprimir o DAV, só que fora do Checkout, pelo próprio ERP.
**Impact:** Resolve a pendência #11 de `.specs/project/PENDENCIES.md` (removida da seção 1). Atualiza `.specs/features/importacao-dav/spec.md` (UI Design, Out of Scope, Edge Cases e Requirement Traceability/Coverage).

---

### AD-036: Split de pagamento e regra de troco confirmados por decisão direta do usuário (2026-08-25)

**Decision:** O Checkout SHALL suportar múltiplas formas de pagamento na mesma venda (split de pagamento/split tender) — confirmado por resposta direta do usuário. Troco (dinheiro recebido acima do total da venda) é calculado e exibido pelo Checkout somente quando a forma de pagamento é dinheiro — cartão e PIX nunca geram troco. Só é possível inserir uma única forma de pagamento "dinheiro" por venda; WHEN o operador tenta inserir uma segunda forma "dinheiro" THEN o sistema SHALL exibir um toast de notificação avisando que já existe uma forma "dinheiro" aplicada, bloqueando a segunda inserção.
**Reason:** Decisão direta do usuário — múltiplas formas de pagamento (split) já são operação comum no PDV físico; o cálculo de troco só faz sentido para dinheiro, já que cartão/PIX são sempre cobrados no valor exato/autorizado.
**Trade-off:** Nenhum identificado — restringir dinheiro a uma única entrada por venda simplifica o cálculo de troco sem perder capacidade operacional (o operador soma o valor total recebido em dinheiro numa única entrada).
**Impact:** Atualiza `.specs/features/pagamento-geral/spec.md` (nova story formal de split de pagamento, cálculo de troco restrito a dinheiro, exclusividade de uma forma "dinheiro" por venda, e Requirement Traceability).

---

### AD-037: TEF fica como bloqueio deliberado (parceiro será trocado); serviço de impressão local confirmado, com fallback para PDF (2026-08-25)

**Decision:** Duas decisões sobre integrações locais (fora do container, na máquina do PDV):
1. **TEF** — o mecanismo técnico de comunicação (protocolo de invocação, timeout/erro) fica deliberadamente como bloqueio, não será desenhado nesta rodada: o parceiro de TEF atual será trocado, então especificar o contrato do parceiro atual seria retrabalho. Registrado como pendência.
2. **Serviço de impressão local** — é um serviço local sem autenticação, rodando em porta fixa (número ainda não informado), que recebe o `XMLImpressao` já retornado embutido na resposta de `FaturarNFCe` (ver AD-024). WHEN o serviço de impressão local não responde THEN o sistema SHALL informar ao operador que não foi possível imprimir diretamente e perguntar se deseja imprimir o PDF (fallback), em vez de falhar silenciosamente ou travar a operação. Falta, em qualquer lugar do contrato hoje, um indicativo (idealmente um novo campo em `GetSessao`) de qual mecanismo de impressão o tenant/máquina deve usar (serviço local vs. PDF) — registrado como pendência a levar à equipe do ERP.
**Reason:** Decisão direta do usuário — TEF depende de uma troca de parceiro já decidida, então não vale desenhar contrato para o parceiro atual; o fallback de impressão evita bloquear a operação de caixa quando o serviço local não está disponível.
**Trade-off:** Sem o indicativo de mecanismo de impressão no `GetSessao`, o Checkout precisa de alguma configuração/heurística provisória até o campo existir — não definida nesta rodada.
**Impact:** Atualiza `.specs/features/pagamento-tef/spec.md` (registra bloqueio deliberado, sem inventar comportamento de protocolo/timeout) e `.specs/features/finalizacao-suspensao-venda/spec.md` (mecanismo de impressão local, fallback para PDF). Adiciona dois itens novos a `.specs/project/PENDENCIES.md`: contrato técnico completo do serviço de impressão local (porta, rota, formato de resposta) e indicativo faltante de mecanismo de impressão no `GetSessao`.

---

### AD-038: Falha de rede em `FaturarNFCe` exige confirmação manual antes de reenvio — decisão direta do usuário (2026-08-25)

**Decision:** WHEN o Checkout envia `POST /ApiCentriumOAuth/FaturarNFCe` e a chamada falha por problema de rede (nenhuma resposta recebida, não um erro de negócio) THEN o sistema SHALL NÃO reenviar automaticamente — o operador SHALL confirmar manualmente que uma solicitação de emissão já foi feita e não teve retorno, antes de permitir um novo envio. Reenviar sem essa confirmação arrisca duplicar a nota fiscal.
**Reason:** Decisão direta do usuário — mitigar risco de NFCe duplicada em caso de falha de rede não determinística (não se sabe se o ERP processou a solicitação ou não).
**Trade-off:** Fluxo de recuperação de erro fica mais lento (depende de confirmação humana) em troca de eliminar o risco de duplicidade de NFCe.
**Impact:** Atualiza `.specs/features/finalizacao-suspensao-venda/spec.md` (Edge Cases — confirmação manual antes de reenvio de `FaturarNFCe`).

---

### AD-039: Desconto manual (item e capa) e padrão de arredondamento monetário generalizado — decisão direta do usuário (2026-08-25)

**Decision:** O operador pode aplicar desconto de duas formas: diretamente no item do carrinho, ou na capa da nota (seção de pagamentos), afetando o total da venda. Desconto de capa pode ser expresso em porcentagem ou em valor fixo, à escolha do operador. Não há teto de valor nem exigência de senha/autorização para aplicar desconto (item ou capa) — decisão tomada nesta sessão. Na montagem do JSON de `FaturarNFCe`, o valor do desconto de capa SHALL ser rateado igualmente entre os itens da venda; quando o rateio não fecha em centavos exatos, o centavo remanescente SHALL ser distribuído pelo **método do maior resto** (`AD-072`, 2026-08-26): cada item arredondado para baixo, e a diferença total distribuída 1 centavo por vez aos itens com maior parte fracionária descartada, do maior resto para o menor, até zerar (não há fração de centavo). Esse mesmo padrão de arredondamento monetário — centavos inteiros, arredondamento por linha, sobra distribuída pelo método do maior resto — SHALL ser aplicado de forma geral em todo cálculo monetário do Checkout, não só no rateio de desconto de capa.
**Reason:** Decisão direta do usuário — flexibiliza desconto (item ou capa, percentual ou fixo) sem burocracia de autorização, e generaliza a regra de arredondamento (já necessária para o rateio de desconto) para manter consistência monetária em toda a aplicação. **Critério de distribuição do resto detalhado em AD-072** (a redação original aqui dizia só "atribuída a um dos itens", sem especificar qual nem o critério).
**Trade-off:** Sem teto/senha, a aplicação de desconto fica inteiramente sob responsabilidade operacional do usuário do caixa — nenhuma trava de sistema evita desconto excessivo.
**Impact:** Atualiza `.specs/features/pagamento-geral/spec.md` (nova story de desconto manual — item e capa — com rateio no JSON de `FaturarNFCe`) e `.specs/features/carrinho-produto-precificacao/spec.md` (padrão geral de arredondamento monetário, generalizado a partir do desconto de capa).

---

### AD-040: PIX pendente — fechamento de modal com aviso de desassociação manual; falha em `POST GerarPIX` com retry (2026-08-25)

**Decision:** Duas decisões sobre o fluxo de PIX:
1. **Fechamento do modal com PIX pendente** — o operador pode fechar o modal PIX mesmo com uma transação pendente; ao fazer isso, o sistema SHALL exibir um aviso informando que será necessário desassociar o PIX manualmente na Central de Transações PIX. O Checkout SHALL remover a forma de pagamento PIX da venda local e permitir aplicar outra forma no lugar — mas SHALL NÃO enviar nenhuma solicitação de cancelamento de PIX ao ERP/CentriumPag. O PIX não expira em um tempo curto (sem teto de 10-15min de polling).
2. **Falha na própria chamada `POST /ApiCentriumOAuth/GerarPIX`** (erro de rede/validação, distinto de falha no polling de `StatusPIX` depois de gerado) — o sistema SHALL exibir erro simples e oferecer a opção de tentar novamente.
**Reason:** Decisão direta do usuário — desassociação de PIX abandonado é responsabilidade manual do operador na Central de Transações PIX, não automatizada pelo Checkout; falha simples na geração do PIX só precisa de retry, sem tratamento especial.
**Trade-off:** Sem cancelamento automático, um PIX pendente abandonado pode ficar "aberto" até desassociação manual — aceito deliberadamente.
**Impact:** Atualiza `.specs/features/pagamento-pix/spec.md` (Edge Cases — fechamento de modal com PIX pendente e aviso de desassociação manual, falha em `GerarPIX` com retry).

---

### AD-041: Nova feature — Recuperação de NFCe (2026-08-25)

**Decision:** Nova feature formal — recuperação/retomada de rascunho de NFCe. Listagem via `GET /ApiCentriumOAuth/GetListaNFCes` (DataProvider real `DpCheckout_RascunhosLista`, confirmado via KB do GenExus — Fato F2 de `.specs/project/DECISIONS.md`): `TxtBusca` filtra só por nome de cliente (`CliNom`) ou nome de vendedor (`NfcRepNom`) — **não** por número da nota; a listagem é hardcoded para `NfcStatus = '0'` (só rascunhos) e `NfcDatEmi >= Today - 30` (só últimos 30 dias), nenhum dos dois é parametrizável; mesmo bug de paginação de cap-50 anulado já encontrado em `ListaDAVs` (AD-024) — o Checkout deve limitar `TamanhoPagina` no próprio request, não confiar no servidor. Retomada via `GET /ApiCentriumOAuth/CarregarNFCe`, preservando o campo `NumeroNota` para reenvio em `FaturarNFCe`. O preço de cada item é sempre preservado/congelado do valor salvo no rascunho (reflete que o preço pode ter sido alterado manualmente pelo operador na inserção original), exceto quando o operador reinsere um item que já está no carrinho retomado — isso dispara recálculo normal pelo motor de precificação de `carrinho-produto-precificacao`. UI de referência já existe no Pencil: frame "PDV Online Web - Modal Recuperação NFCe". Feature é desktop-only.
**Reason:** Decisão direta do usuário — recuperação de rascunho de NFCe é fluxo real do produto, precisa de fase Specify formal própria (mesmo padrão de `importacao-dav`).
**Trade-off:** Nenhum identificado — recuperação de rascunho reaproveita o motor de precificação e o fluxo normal de carrinho/pagamento/finalização já especificados.
**Impact:** Cria `.specs/features/recuperacao-nfce/spec.md` (nova feature). Atualiza `.specs/features/carrinho-produto-precificacao/spec.md` (Edge Cases — nota sobre preço preservado exceto reinserção). Atualiza `.specs/project/PROJECT.md` (seção Scope) e `.specs/project/ROADMAP.md` (novo milestone).

---

### AD-042: Suspender venda — bloqueado com TEF/PIX aprovado, permitido com pagamento removível (persiste ao retomar) (2026-08-25)

**Decision:** WHEN a venda em digitação tem uma forma de pagamento TEF ou PIX já aprovada THEN o sistema SHALL NÃO permitir suspender a venda — mesma lógica de bloqueio permanente já confirmada para edição/cancelamento de item (`CART-09`, AD-030), já que nenhuma dessas duas formas pode ser removida da venda. WHEN a venda tem só pagamento(s) removível(is) já aplicado(s) — dinheiro ou cartão manual fora do fluxo TEF — THEN o sistema SHALL permitir suspender a venda normalmente; esse estado persiste ao retomar o rascunho depois (o pagamento removível continua associado quando a venda é recarregada via `CarregarNFCe`).
**Reason:** Decisão direta do usuário — consistente com a regra já estabelecida para `CART-09`: TEF/PIX aprovados travam a venda por não terem fluxo de cancelamento, enquanto pagamentos removíveis mantêm a venda flexível mesmo suspensa.
**Trade-off:** Nenhum identificado — segue a mesma lógica já aplicada a `CART-09`.
**Impact:** Atualiza `.specs/features/finalizacao-suspensao-venda/spec.md` (Edge Cases — bloqueio de suspensão com TEF/PIX aprovado, permissão com pagamento removível persistindo ao retomar).

---

### AD-043: Troca de cliente/vendedor com carrinho populado — decisão direta do usuário (2026-08-25)

**Decision:** Duas decisões sobre troca de cliente/vendedor depois que o carrinho já tem itens:
1. **Cliente** — a troca de cliente com carrinho já populado É permitida (ao contrário da recomendação inicial de bloquear pelo gatilho de `CART-09`); ao trocar, o sistema SHALL disparar o recálculo de preço para `TipoPreco = 9` (preço por lista, AD-025), já que a lista de preço pode mudar com o novo cliente. Essa troca deixa de ser permitida (SHALL ser bloqueada) quando já existe pagamento aprovado na venda — mesmo gatilho de bloqueio de `CART-09` (AD-030).
2. **Vendedor** — a troca de vendedor com carrinho já populado é permitida, exceto após pagamento aprovado (mesmo gatilho de `CART-09`).
**Reason:** Decisão direta do usuário — troca de cliente/vendedor no meio da venda é operação legítima até o ponto em que a venda tem pagamento aprovado, quando o bloqueio geral de `CART-09` já se aplica.
**Trade-off:** Trocar cliente após itens já inseridos exige recálculo de preço em tempo real (`TipoPreco = 9`), acoplando essa troca ao motor de precificação.
**Impact:** Atualiza `.specs/features/identificacao-cadastro-cliente/spec.md` (nova Acceptance Criteria — troca de cliente com carrinho populado, recálculo de `TipoPreco=9`, bloqueio pós-pagamento), `.specs/features/selecao-vendedor/spec.md` (troca de vendedor com carrinho populado, bloqueio pós-pagamento) e `.specs/features/carrinho-produto-precificacao/spec.md` (referência cruzada a `CART-09`).

---

### AD-044: Aviso ao operador quando renovação silenciosa de token falha com venda em digitação (2026-08-25)

**Decision:** WHEN a renovação silenciosa de token (`AUTH-06`) falha enquanto existe uma venda em digitação (carrinho com itens) THEN o sistema SHALL exibir ao operador um aviso equivalente ao diálogo nativo de `beforeunload` (mesmo padrão já usado para proteger contra F5/fechamento acidental, AD-006), avisando que a sessão será encerrada e a venda em andamento pode ser perdida.
**Reason:** Decisão direta do usuário — reforça a mesma proteção de perda de venda já adotada para reload acidental (AD-006), agora também no caso de falha de reautenticação.
**Trade-off:** Nenhum identificado — reaproveita padrão de UX já decidido.
**Impact:** Atualiza `.specs/features/autenticacao-sessao-bootstrap/spec.md` (`AUTH-06`, Edge Cases — aviso ao operador quando a renovação falha com venda em digitação).

---

### AD-045: Isolamento de tenant na chave do Dexie e hash calculado localmente (2026-08-25)

**Decision:** Duas decisões sobre o cache Dexie/IndexedDB (`AUTH-04`):
1. O `tenant` SHALL ser incluído na chave do banco Dexie, isolando o cache entre tenants diferentes que possam compartilhar o mesmo navegador/máquina.
2. O hash/versão usado para decidir se o cache Dexie precisa ser invalidado/re-baixado SHALL ser calculado localmente pelo Checkout — não é um campo retornado por `GetSessao`.
**Reason:** Decisão direta do usuário — isolamento por tenant evita vazamento de configuração entre lojas/clientes diferentes no mesmo dispositivo; o hash local evita depender de um campo que o ERP não expõe.
**Trade-off:** Nenhum identificado.
**Impact:** Atualiza `.specs/features/autenticacao-sessao-bootstrap/spec.md` (`AUTH-04` — chave do Dexie inclui `tenant`, hash calculado localmente).

---

### AD-046: Escopo mobile confirmado — DAV e recuperação de NFCe desktop-only; cadastro de cliente e pagamento precisam de adaptação (2026-08-25)

**Decision:** Confirmações de escopo mobile:
- Modal de importação de DAV é desktop-only (já documentado em `layout-responsivo-mobile`).
- Modal de recuperação de NFCe (nova feature, AD-041) também é desktop-only.
- Cadastro de cliente (`identificacao-cadastro-cliente`, cadastro simplificado) DEVE existir no mobile — precisa de adaptação de layout na fase Design de `layout-responsivo-mobile`.
- Fluxo de pagamento no mobile precisa de adaptação de layout, inferida pela IA na fase Design (sem detalhamento adicional nesta rodada).
**Reason:** Decisão direta do usuário — confirma quais fluxos existem no mobile e quais ficam restritos ao desktop, fechando lacuna de escopo antes da fase Design de `layout-responsivo-mobile`.
**Trade-off:** Nenhum identificado.
**Impact:** Atualiza `.specs/features/layout-responsivo-mobile/spec.md` (confirma DAV e recuperação de NFCe como desktop-only; cadastro de cliente e pagamento precisam de adaptação mobile). Referência cruzada em `.specs/features/importacao-dav/spec.md`, `.specs/features/recuperacao-nfce/spec.md`, `.specs/features/identificacao-cadastro-cliente/spec.md` e `.specs/features/pagamento-geral/spec.md`.

---

### AD-047: Fato F3 — campos de PIX (`ConfiguracoesPIX`, `TrnTempoExpiracaoPIX`) resolvidos por decisão direta do usuário (2026-08-25)

**Decision:** A partir do Fato F3 de `.specs/project/DECISIONS.md` (campos de PIX não documentados até então, encontrados lendo `SessaoUsuario` por completo: `ConfiguracoesPIX { UtilizaCentriumPAG, MinimoPix, TempoEspera, UtilizaEncurtador, UtilizaLinkExterno }` e `SDTCentriumPag_Post.TrnTempoExpiracaoPIX`), quatro decisões:
1. `TrnTempoExpiracaoPIX` SHALL NÃO ser enviado pelo Checkout ao chamar `GerarPIX`.
2. `ConfiguracoesPIX.MinimoPix` SHALL ser validado no lado do Checkout (client-side) — bloqueando a geração de PIX abaixo desse mínimo.
3. `GerarPIX` SHALL usar o saldo residual da venda (valor ainda não coberto por outras formas de pagamento já aplicadas em split), não o total cheio da venda.
4. `UtilizaEncurtador`/`UtilizaLinkExterno` são tratados como configurações internas do CentriumPag — a assunção é que o endpoint sempre retorna o QR Code em base64, sem necessidade de UI adicional de link. **Nota de baixa confiança:** a resposta do usuário reconheceu incerteza própria ("eu acho") — tratar como best-effort a confirmar depois, não como fato definitivo.
**Reason:** Fato F3 revelou campos de PIX não cobertos por `pagamento-pix/spec.md` até esta sessão; as decisões do usuário fecham o comportamento esperado de cada um.
**Trade-off:** O ponto 4 carrega incerteza reconhecida pelo próprio usuário — se `UtilizaEncurtador`/`UtilizaLinkExterno` afetarem o formato de resposta, pode ser necessário revisitar.
**Impact:** Atualiza `.specs/features/pagamento-pix/spec.md` (`TrnTempoExpiracaoPIX` não enviado, `MinimoPix` validado client-side, saldo residual em split, nota de baixa confiança sobre `UtilizaEncurtador`/`UtilizaLinkExterno`). Adiciona item de baixa confiança a `.specs/project/PENDENCIES.md`.

---

### AD-048: `FormaFpgUtiCar` vazio — permitir aplicar ticket devolução otimisticamente (2026-08-25)

**Decision:** WHEN `CondicaoFormasDePagamento[].FormaFpgUtiCar` vem vazio (branch de fallback do ERP, sem regra dinâmica configurada — ver AD-024) THEN o sistema SHALL permitir aplicar o ticket devolução otimisticamente, tratando a ausência de informação como elegibilidade, e não como inelegibilidade. Decisão contrária à recomendação apresentada (que sugeria esconder por segurança) — o usuário optou explicitamente por permitir.
**Reason:** Decisão direta do usuário, indo contra a recomendação — priorizar não bloquear a operação de caixa por ausência de dado, mesmo que isso implique aceitar ticket em uma forma que talvez não devesse.
**Trade-off:** Risco aceito de aplicar ticket devolução numa forma de pagamento que, se a regra dinâmica existisse, não seria elegível — aceito deliberadamente pelo usuário.
**Impact:** Atualiza `.specs/features/pagamento-geral/spec.md` (`PAY-07`, Edge Cases — `FormaFpgUtiCar` vazio tratado como elegível, permitindo aplicação otimista).

---

### AD-049: Falha não-401 no bootstrap inicial — tela de erro com "Tentar novamente" (2026-08-25)

**Decision:** WHEN o bootstrap inicial (`GET /api/bootstrap` / `GetSessao`) falha com um erro que não é `401` (ex.: `500`, timeout do ERP) THEN o sistema SHALL exibir uma tela de erro com um botão "Tentar novamente", em vez de assumir necessidade de novo login.
**Reason:** Decisão direta do usuário — distingue falha transitória de infraestrutura (retry simples) de falha de autenticação (que já tem tratamento próprio, `AUTH-06`).
**Trade-off:** Nenhum identificado.
**Impact:** Atualiza `.specs/features/autenticacao-sessao-bootstrap/spec.md` (Edge Cases — falha não-401 no bootstrap, botão "Tentar novamente").

---

### AD-050: `CliTip='F'` fixo — bloquear/alertar entrada de CNPJ na busca de cliente (2026-08-25)

**Decision:** Como o cadastro simplificado do Checkout só cria cliente pessoa física (`CliTip` hardcoded `'F'` em `PCheckout_PostCliente`, confirmado em AD-024), a busca de cliente (`GetCliente`/`GetListaClientes`) SHALL bloquear ou alertar quando o operador digitar um CNPJ (14 dígitos) no campo de documento, já que o cadastro simplificado nunca poderia criar esse cliente como pessoa jurídica.
**Reason:** Decisão direta do usuário — evita que o operador tente cadastrar um CNPJ pelo cadastro simplificado, que sempre falharia silenciosamente ao gravar como pessoa física.
**Trade-off:** Nenhum identificado.
**Impact:** Atualiza `.specs/features/identificacao-cadastro-cliente/spec.md` (Edge Cases — bloqueio/alerta de CNPJ na busca, reforça `CliTip='F'` fixo já documentado em AD-024).

---

### AD-051: `GetStatusSistema` — timing de chamada permanece pendência (não resolvido nesta sessão) (2026-08-25)

**Decision:** O timing de quando `GetStatusSistema` é chamado no fluxo do Checkout (ex.: uma vez no bootstrap, polling periódico, antes de cada finalização) segue como pendência — não resolvido nesta sessão. Distinto da pendência já registrada (semântica dos códigos de retorno, `CadStatus`, AD-024) — esta é sobre o gatilho de chamada, não o significado do valor retornado.
**Reason:** O usuário não respondeu a este ponto nesta rodada de grilling — registrado como pendência explícita, não como decisão.
**Trade-off:** Não aplicável — item permanece em aberto.
**Impact:** Novo item em `.specs/project/PENDENCIES.md` (seção "Pendências de confirmação com a equipe do ERP"), distinto do item já existente sobre semântica de `GetStatusSistema`. Nota em `.specs/features/finalizacao-suspensao-venda/spec.md` (Edge Cases).

---

### AD-052: Concorrência entre operadores no mesmo DAV/rascunho de NFCe — ERP resolve, sem lock no Checkout (2026-08-25)

**Decision:** WHEN dois operadores acessam concorrentemente o mesmo DAV ou o mesmo rascunho de NFCe suspenso THEN o Checkout SHALL NÃO implementar nenhum mecanismo de lock otimista/pessimista — a resolução de conflito fica inteiramente a cargo do próprio ERP.
**Reason:** Decisão direta do usuário — simplifica o Checkout, delegando controle de concorrência à mesma camada que já é fonte de verdade dos dados (o ERP).
**Trade-off:** Se dois operadores editarem o mesmo rascunho/DAV simultaneamente, o comportamento de qual alteração "vence" depende inteiramente do ERP, sem feedback antecipado do Checkout.
**Impact:** Atualiza `.specs/features/importacao-dav/spec.md` e `.specs/features/recuperacao-nfce/spec.md` (Edge Cases — concorrência entre operadores, sem lock no Checkout).

---

### AD-053: Default vazio no `GetSessao`, sem indicador visual, filtro "Ativo" pré-marcado (2026-08-25)

**Decision:** Três decisões relacionadas aos modais de cliente/vendedor:
1. **Default vazio no `GetSessao`** — quando o próprio tenant nunca configurou um cliente/vendedor default (`ClienteDefaultCodigo`/`VendedorCodigo` vêm vazios no `GetSessao`, distinto de uma lista de busca vazia no modal, já resolvida em AD-032), o campo correspondente nasce vazio na venda e exige seleção manual do operador antes de finalizar — mesmo tratamento dado ao caso já coberto por AD-032, só que aplicado à origem "nunca configurado" em vez de "lista de busca vazia".
2. **Sem indicador visual** — não há necessidade de distinguir visualmente, no campo de cliente/vendedor, se o valor atual veio do default (`GetSessao`) ou de seleção manual do operador.
3. **Filtro "Ativo" pré-marcado** — nos modais de listagem de cliente e de vendedor, o filtro "Ativo" vem pré-marcado por padrão (em vez de listar todos os registros, incluindo inativos, por padrão). **Corrigido para o modal de cliente em 2026-08-26 pela AD-093 — ver AD-093 abaixo: não existe campo `Ativo`/`Status` no contrato para o cliente, o filtro foi removido do design/spec dessa tela.** **Corrigido para o modal de vendedor em 2026-08-27 pela AD-103 — ver AD-103 abaixo: mesmo achado, sem campo `Ativo`/`Status` no contrato de `GetListaVendedores` — o filtro foi removido do design/spec dessa tela também.**
**Reason:** Decisão direta do usuário — mantém o mesmo comportamento defensivo já adotado em AD-032 (nunca deixar o campo travado num estado inválido) mesmo na origem "nunca configurado"; simplifica a UI não exigindo indicador visual extra; reduz ruído na listagem pré-filtrando por registros ativos.
**Trade-off:** Sem indicador visual, o operador não tem como saber, só olhando a tela, se o cliente/vendedor atual é o default da empresa ou foi selecionado manualmente — aceito deliberadamente.
**Impact:** Atualiza `.specs/features/identificacao-cadastro-cliente/spec.md` e `.specs/features/selecao-vendedor/spec.md` (Edge Cases — default vazio tratado igual a AD-032, sem indicador visual, filtro "Ativo" pré-marcado nos modais — **ressalva do cliente, ver AD-093**).

---

### AD-054: Múltiplas abas com cookie compartilhado — comportamento aceito como está (2026-08-25)

**Decision:** WHEN o mesmo operador abre múltiplas abas do Checkout com o mesmo cookie de sessão compartilhado (ex.: uma aba pode invalidar/renovar o cookie de forma que afeta a outra) THEN o sistema SHALL aceitar esse comportamento como está — não será implementado nenhum mecanismo de coordenação entre abas.
**Reason:** Decisão direta do usuário — aceitar o comportamento conhecido de cookies compartilhados entre abas do mesmo navegador, sem investir em coordenação (ex.: `BroadcastChannel`) nesta fase.
**Trade-off:** Uma aba pode, em teoria, invalidar a sessão de outra aba do mesmo operador — aceito deliberadamente.
**Impact:** Atualiza `.specs/features/autenticacao-sessao-bootstrap/spec.md` (Edge Cases — múltiplas abas com cookie compartilhado, comportamento aceito como está).

---

### AD-055: Importação de DAV sempre sobrescreve cliente/vendedor default (2026-08-25)

**Decision:** WHEN um DAV é importado (`.specs/features/importacao-dav/spec.md`) THEN o sistema SHALL sempre sobrescrever o cliente e o vendedor default (pré-selecionados via `GetSessao`, AD-032) pelos dados de cliente/vendedor trazidos no próprio DAV — nunca preservar o default anterior nesse caso.
**Reason:** Decisão direta do usuário — o DAV já tem cliente/vendedor próprios, gravados no ERP; preservar o default da venda em vez de usar os dados do DAV importado geraria inconsistência.
**Trade-off:** Nenhum identificado.
**Impact:** Atualiza `.specs/features/importacao-dav/spec.md` (Edge Cases — importação sempre sobrescreve cliente/vendedor default).

---

### AD-056: Fato F1 — `VendedorCodigo`/`UsuarioCodigo` confirmados como campos distintos, sem contradição com AD-032 (2026-08-25)

**Decision:** Verificação direta no contrato (`ApiCentriumOAuth.yaml`, SDT `SessaoUsuario`) confirma que `UsuarioCodigo` (linha 785) e `VendedorCodigo`/`VendedorNome` (linhas 802-808) são campos genuinamente distintos no schema — não há contradição entre AD-032 (vendedor default = `SessaoUsuario.VendedorCodigo`) e a regra de `selecao-vendedor` de nunca associar vendedor = operador logado. Achado de um dos 4 forks de revisão desta sessão, descartado como contradição real após verificação direta no contrato.
**Reason:** Checagem de fato, não decisão de produto — registrada para encerrar formalmente a dúvida levantada pelo fork de revisão.
**Trade-off:** Não aplicável.
**Impact:** Nota em `.specs/features/selecao-vendedor/spec.md` confirmando que AD-032 permanece correto, sem necessidade de correção.

---

### AD-057: `GetDAV` gera automaticamente um rascunho de NFCe no ERP — JSON de retorno é o mesmo de `CarregarNFCe`, import de DAV reusa o fluxo de recuperação de NFCe (2026-08-25)

**Decision:** WHEN o Checkout chama `GET /ApiCentriumOAuth/GetDAV` THEN o sistema SHALL tratar o JSON retornado como um rascunho de NFCe idêntico ao retornado por `CarregarNFCe` (`OutCheckoutFaturarNFCe`/`CheckoutFaturarNFCe`) — não como o `SDTDav` (com `DavItemStruct`/`DavForPagamento`) hoje documentado em `ApiCentriumOAuth.yaml`. O ERP, ao processar `GetDAV`, gera automaticamente um rascunho de NFCe a partir do DAV, e é esse rascunho — não a estrutura bruta do DAV — que é devolvido e deve ser importado para a NFCe em digitação. Consequentemente, a importação de DAV (`.specs/features/importacao-dav/spec.md`) SHALL reusar exatamente o mesmo mecanismo de import/mapeamento já usado para retomar um rascunho de NFCe (`.specs/features/recuperacao-nfce/spec.md`), incluindo preservação de `NumeroNota` (reenviado em `FaturarNFCe`, já consistente com o comportamento de `AtualizarCapa` descrito em `.specs/codebase/CONCERNS.md`) e preço de item preservado/congelado sem disparar o motor de precificação — não uma lógica de mapeamento própria a partir de `DavItemStruct`/`DavForPagamento`.
**Reason:** Esclarecimento direto do usuário sobre o comportamento real do ERP — o efeito colateral de `GetDAV` gerar o rascunho antes de devolver o JSON é intencional, e o formato de saída é deliberadamente o mesmo de `CarregarNFCe`, para permitir reuso total do fluxo de importação/carregamento de venda.
**Trade-off:** O contrato `ApiCentriumOAuth.yaml` está desatualizado nesse ponto — ainda documenta `GetDavOutput` como `{ Dav: SDTDav }` (linhas 675-679), não como `{ OutCheckoutFaturarNFCe: CheckoutFaturarNFCe }` (mesmo shape de `CarregarNFCeOutput`, linhas 697-706). Usuário confirmou que vai atualizar o yaml; até lá, isso é um concern registrado, não um bloqueio de requisito. Fica em aberto uma pergunta não resolvida aqui: se o efeito colateral de `GetDAV` (gerar o rascunho) já é, na prática, o mecanismo que falta para "marcar DAV como importado/em faturamento" (pendência #13/#26, "PENDÊNCIA DEV") — não confirmado nesta decisão, não tratar como resolução automática dessa pendência.
**Impact:** Atualiza `.specs/features/importacao-dav/spec.md` (Acceptance Criteria da story "Importar DAV completo para o carrinho", Requirement Traceability), `.specs/features/recuperacao-nfce/spec.md` (nota cruzada), `.specs/codebase/CONCERNS.md` (novo item: yaml desatualizado quanto a `GetDavOutput`) e `.specs/project/PENDENCIES.md` (novo item 26).

---

### AD-058: Pendência #13 resolvida — o ERP fecha a DAV automaticamente ao identificar que o rascunho vinculado foi faturado via `FaturarNFCe` (2026-08-25)

**Decision:** WHEN um DAV importado é faturado via `POST /ApiCentriumOAuth/FaturarNFCe` THEN o sistema SHALL confiar que o próprio ERP fecha/marca a DAV como faturada automaticamente — o rascunho de NFCe gerado por `GetDAV` (AD-057) já fica vinculado internamente à DAV de origem, e o ERP identifica esse vínculo ao processar o faturamento. O Checkout **não** precisa enviar nenhum campo adicional em `CheckoutFaturarNFCe` para isso acontecer.
**Reason:** Confirmação direta do usuário — resolve definitivamente a pendência #13 (campo em `CheckoutFaturarNFCe` para marcar DAV como importada/faturada, marcada "PENDÊNCIA DEV" em AD-023/AD-024) e a pergunta deixada em aberto em AD-057.
**Trade-off:** Nenhum identificado. Nota técnica: o achado anterior de KB (AD-024, `genexus_analyze(mode=impact)` em `DavDocFNum` sem nenhuma escrita vinda do Checkout) continua correto — só não era o caminho relevante. O vínculo é interno ao ERP, criado a partir do rascunho gerado em `GetDAV`, não uma escrita explícita feita pelo Checkout via `CheckoutFaturarNFCe`.
**Impact:** Atualiza `.specs/features/importacao-dav/spec.md` (Edge Cases, Requirement Traceability/Coverage), `.specs/codebase/CONCERNS.md` (resolve os itens "Mecanismo de marcar DAV como importado/em faturamento" e "Vínculo `CheckoutFaturarNFCe` ↔ DAV importado") e `.specs/project/PENDENCIES.md` (remove item 13 da seção 2).

### AD-059: Campo de preço aplicado corrigido para `PrecoVenda` em todos os casos exceto `TipoPreco = 8` — corrige AD-025 (2026-08-25)

**Decision:** WHEN `SessaoUsuario.TipoPreco` for **diferente de `8`** (inclui `1`-`5` e `9`, preço por lista) THEN o sistema SHALL aplicar o valor do campo único `PrecoVenda`, retornado por `GetProduto` (único endpoint que traz esse campo — ver AD-091) — o ERP já resolve internamente qual regra de preço vale (índice `1`-`5` ou lista do cliente) e devolve o valor final pronto nesse campo, sem o Checkout precisar indexar `PrecoVenda1`...`PrecoVenda5` nem ler `PrecoVendaLista` separadamente. WHEN `TipoPreco = 8` THEN o sistema SHALL continuar usando `PrecoVenda1`...`PrecoVenda5` (não `PrecoVenda`) — único caso em que o motor de precificação do Checkout precisa decidir a faixa no cliente, porque a quantidade agregada do SKU é estado do carrinho da venda em curso, que o ERP não conhece numa chamada isolada de `GetProduto`.
**Reason:** Decisão direta do usuário — corrige a leitura anterior (AD-025) de que os índices `1`-`5` mapeavam para `PrecoVenda1`...`PrecoVenda5` e de que `TipoPreco = 9` retornava `PrecoVendaLista`. `PrecoVendaLista` deixa de ser referenciado nesta documentação.
**Trade-off:** Nenhum identificado — simplifica o motor de precificação do Checkout, que deixa de replicar a lógica de índice/lista já resolvida pelo ERP, restringindo lógica própria ao único caso (`8`) que depende de estado do carrinho.
**Impact:** Atualiza `.specs/features/carrinho-produto-precificacao/spec.md` (Nomenclatura, CART-04, Edge Cases, Requirement Traceability), `.specs/codebase/CONCERNS.md` (seção "Pendências de campos/semântica do contrato") e `.specs/codebase/ARCHITECTURE.md` (tabela de persistência, linha "Produto").

---

### AD-060: Reversão da AD-031 — `TipoPreco = 6, 7, 10, 11` estão no escopo do Checkout, sem tratamento especial (2026-08-25)

**Decision:** A decisão registrada em AD-031 (2026-08-25) de que `TipoPreco = 6` (Preço de Custo), `7` (Preço da última venda), `10` (Preço Cliente x Produto, `PRM0241`) e `11` (Preço por Índice) **não seriam suportados pelo Checkout** estava errada e é **revertida**. Confirmação direta do usuário: os quatro valores **estão no escopo** do Checkout. O cálculo de cada uma dessas regras é feito inteiramente no backend (ERP) — o Checkout nunca precisa replicar a lógica de "preço de custo", "última venda", "cliente x produto" ou "preço por índice" — e o valor final de venda volta sempre no **mesmo campo único `PrecoVenda`** já usado para `1`-`5` e `9` (AD-059). Ou seja: não existe, e nunca existiu, necessidade de tratamento especial para `6`, `7`, `10` ou `11` no Checkout — eles se encaixam sem exceção na regra geral de AD-059 ("todo `TipoPreco` diferente de `8` → ler `PrecoVenda`"). A "pendência"/"escopo fechado" registrada em AD-031 nunca precisava existir. O texto da própria AD-031 foi reescrito no lugar (não só anexada esta nota) para refletir a regra corrigida.
**Reason:** O usuário identificou que a decisão de "não suportar" em AD-031 partiu de uma leitura equivocada — como a resolução de cada `TipoPreco` é responsabilidade do backend e o contrato já devolve um único campo de saída (`PrecoVenda`) para todo caso não-`8`, não havia nenhuma razão técnica para excluir `6`, `7`, `10` e `11` do escopo do Checkout.
**Trade-off:** Nenhum — reverter a exclusão não introduz lógica nova; o Checkout já lia `PrecoVenda` para `1`-`5`/`9`, e passa a fazer o mesmo, sem alteração de código, para `6`, `7`, `10` e `11`.
**Impact:** Reescreve `.specs/project/STATE.md` (AD-031, corpo principal, e nota na AD-025), `.specs/codebase/CONCERNS.md` (seção "Pendências de campos/semântica do contrato"), `.specs/features/carrinho-produto-precificacao/spec.md` (Acceptance Criteria `CART-04`, Edge Cases, Requirement Traceability, Coverage) e `.specs/project/PENDENCIES.md` (nota do item 1 e "Última atualização") para não afirmarem mais, isoladamente, que esses quatro valores são fora de escopo ou têm comportamento indefinido.

---

### AD-061: Nova feature — Auditoria de ações do operador, entregue ao ERP no campo `Log` de `FaturarNFCe` (2026-08-25)

**Decision:** Toda ação relevante do operador durante a venda (identificação/criação/troca de cliente, seleção/troca de vendedor, inserção/alteração/cancelamento de produto, aplicação/remoção de forma de pagamento, uso de vale devolução, falhas de pagamento, finalização/suspensão) passa a ser registrada como evento tipado com timestamp (ISO 8601 completo, com segundos — não só precisão de minuto) num novo slice de estado `auditoria` (Zustand, sem `persist`, mesmo ciclo de vida do carrinho — AD-006). O array acumulado é serializado (`JSON.stringify`) e enviado no campo `Log` (string) de `CheckoutFaturarNFCe`, tanto em `SuspenderOuFaturar = "FATURAR"` quanto em `"SUSPENDER"` — decisão direta do usuário de cobrir os dois casos, não só finalização efetiva. Falhas de ações relevantes (pagamento recusado, falha de rede em `FaturarNFCe`, AD-038) também geram evento — decisão direta do usuário, ampliando o escopo inicial de "só ações bem-sucedidas". WHEN `FaturarNFCe` falha por rede THEN o slice `auditoria` NÃO é descartado — o log completo (incluindo o evento de falha) é reenviado íntegro na tentativa seguinte. WHEN uma venda é retomada (rascunho, DAV, recuperação de NFCe) THEN o log local começa vazio — não reconstrói histórico já entregue ao ERP numa suspensão/importação anterior.

Documentado em nova spec dedicada `.specs/features/auditoria-acoes-operador/spec.md` (`AUDIT-01` a `AUDIT-10`), com referência cruzada nas specs de feature que originam cada tipo de evento (`carrinho-produto-precificacao`, `identificacao-cadastro-cliente`, `selecao-vendedor`, `pagamento-geral`, `finalizacao-suspensao-venda`).

**Verificação de contrato:** o `APICentriumOAuth.yaml` mais recente (`info.version: 20260825172440`) já traz o campo `Log` (junto de um novo `DavNum`, não coberto por esta decisão) no bloco `CheckoutFaturarNFCe` (linha 1397) — única definição desse schema no arquivo, sem duplicidade. **Correção (2026-08-25):** esta AD chegou a registrar aqui uma suposta chave `CheckoutFaturarNFCe` duplicada no yaml (com um segundo bloco sem `Log`/`DavNum`) — engano de leitura da IA durante a investigação, corrigido após reverificação; não há duplicidade real, e a nota correspondente em `.specs/codebase/CONCERNS.md` e o item 27 de `.specs/project/PENDENCIES.md` foram removidos.

**Reason:** Decisão de produto do usuário — rastreabilidade completa da venda no ERP, não só o resultado final. Abordagem de eventos explícitos por ação de negócio (não middleware genérico de interceptação de estado, nem log no BFF) escolhida em brainstorming por produzir eventos semânticos utilizáveis pelo ERP, em vez de diffs de estado crus — o BFF (AD-022) não tem lógica de negócio nem visibilidade de ações puramente locais (abrir modal, editar campo antes de confirmar).
**Trade-off:** Cada feature de negócio precisa disparar explicitamente seu evento de auditoria (disciplina adicional, mesmo padrão já exigido pela "Regra de fronteira" em `.specs/codebase/ARCHITECTURE.md`) — em troca, o log entregue ao ERP tem exatamente os campos semânticos relevantes por tipo de ação, não um diff genérico de estado.
**Impact:** Nova spec `.specs/features/auditoria-acoes-operador/spec.md`. Atualiza `.specs/project/ROADMAP.md` (nova linha no Milestone 1), `.specs/codebase/ARCHITECTURE.md` (tabela de persistência, novo slice `auditoria`) e, com uma linha de referência cruzada cada, `.specs/features/carrinho-produto-precificacao/spec.md`, `.specs/features/identificacao-cadastro-cliente/spec.md`, `.specs/features/selecao-vendedor/spec.md`, `.specs/features/pagamento-geral/spec.md` e `.specs/features/finalizacao-suspensao-venda/spec.md` (esta última ganha também o requisito `FIN-12` para o envio do campo `Log`). Ver também AD-062 (remove `produtoCancelado`, superado por esta feature).

---

### AD-062: Remove o campo `produtoCancelado` do escopo — cancelamento de item passa a ser rastreado só pelo log de auditoria — corrige AD-026 (2026-08-25)

**Decision:** O campo dedicado `produtoCancelado` (`boolean`, `NULL` equivale a `false`), decidido em AD-026 para o SDT `CheckoutFaturarNFCe`, é **removido do escopo**. Decisão direta do usuário: com a feature de auditoria geral (AD-061) já cobrindo cancelamento de item via evento `PRODUTO_CANCELADO` no campo `Log`, um campo booleano por item dedicado só a esse propósito fica redundante. O item cancelado continua com o mesmo comportamento de UI já documentado (linha mantida riscada na grid, excluída dos cálculos — `CART-08`) — só a forma de comunicar isso ao ERP muda, de um campo de payload por item para um evento no log geral da venda.
**Reason:** Evitar dois mecanismos paralelos fazendo a mesma coisa (campo dedicado + log geral) — decisão do usuário de consolidar em um único caminho de auditoria, mais simples e mais amplo (o log já cobre toda ação relevante, não só cancelamento de produto).
**Trade-off:** O campo `produtoCancelado`, que já estava "PENDÊNCIA DEV" sem implementação no ERP, deixa de precisar ser desenvolvido — reduz o pedido de mudança de contrato ao time do ERP. Em troca, a informação de cancelamento passa a viver dentro de uma string JSON livre (`Log`), não mais um campo estruturado/tipado do contrato — leitura pelo lado do ERP fica dependente do parse do JSON, não de um campo boolean direto.
**Impact:** Reescreve `.specs/project/STATE.md` (nota em AD-026), `.specs/features/finalizacao-suspensao-venda/spec.md` (AC2 da story "Finalizar a venda", `FIN-02`), `.specs/features/carrinho-produto-precificacao/spec.md` (Edge Cases, `CART-08`) e `.specs/project/PENDENCIES.md` (nota dos itens 6/21) para não referenciarem mais `produtoCancelado` como campo de contrato a implementar.

---

### AD-063: Campo `ProdutoPesavelEditavel` confirmado — resolve simultaneamente a semântica de produto pesável e a flag de editabilidade ao TAB (item 4) (2026-08-25)

**Decision:** `SDTCheckout_GetProduto` (retornado por `GetProduto` — e só por ele, ver AD-091) tem o campo `ProdutoPesavelEditavel` (string, confirmado em `ApiCentriumOAuth.yaml`, linha 1331, `description: "Material Pesável"`) — informação nova, não localizada nas rodadas anteriores de investigação de KB (AD-023/AD-024), que buscavam nomes como `ProdutoPesavel`/`MatProdPes`/`DavMatProdPes` e não encontravam enum de valores. Valores confirmados diretamente pelo usuário:

| Valor | Significado |
|---|---|
| `'S'` | Produto pesável, leitura do peso na etiqueta |
| `'B'` | Produto pesável, leitura do preço na balança |
| `''` (vazio) | Produto não pesável e não editável |
| `'E'` | Produto não pesável, mas editável |

Esse único campo resolve duas pendências que antes pareciam não relacionadas: (1) a semântica de "produto pesável" que AD-023/AD-024 não conseguiram fechar via KB (`ProdutoPesavel`/`MatProdPes`) — hoje confirmado que o nome real exposto no contrato é `ProdutoPesavelEditavel`, com `'S'`/`'B'` distinguindo o mecanismo de leitura (etiqueta vs. balança); e (2) o item 4 de `.specs/project/PENDENCIES.md` (flag de editabilidade ao TAB, `.specs/features/carrinho-produto-precificacao/spec.md`, AD-027) — AD-027 havia confirmado via KB que **nenhum** campo de editabilidade existia em `SDTCheckout_GetProduto`/`PCheckout_GetProduto`, buscando por `MatBloq*`/`MatEdit*`/`MatPermite*`; a busca não cobria `ProdutoPesavelEditavel`, que não tem nome sugestivo de editabilidade nem de pesável isoladamente — daí ter passado despercebido nas rodadas anteriores.

**Exclusividade pesável/editável — garantida pela estrutura do campo (corrigido em AD-070, 2026-08-26):** produto pesável (`'S'` ou `'B'`) não é simultaneamente editável. Isso deixou de ser interpretação/suposição — `ProdutoPesavelEditavel` é um único campo string com exatamente 4 valores discretos (`'S'`, `'B'`, `''`, `'E'`), não dois booleanos independentes combináveis; por construção, o campo não pode representar os dois estados ao mesmo tempo. Produto pesável tem preço/peso resolvido pela etiqueta/balança, fora do fluxo de edição manual de `preço`/`unidade de medida`/`quantidade`/`desconto` descrito em `CART-01`/`AD-027`; o mecanismo de TAB de `AD-027` (inserir direto vs. pular para edição) se aplica só à distinção `''` (não editável) vs. `'E'` (editável), ambos não pesáveis.

**Escopo de `DavMatProdPes` — fechado sem pendência nova (corrigido em AD-069, 2026-08-26):** `DavMatProdPes` (nome de atributo visto em KB para o contexto de item de DAV, `.specs/features/importacao-dav/spec.md`) não aparece em `ApiCentriumOAuth.yaml` sob nenhum nome, mas isso não é mais pendência separada — um item de DAV carregado via `GetDAV` já vem com o produto inserido e o preço congelado (mesma regra de linha congelada de AD-067); a caracterização pesável/editável só entra em jogo se a linha for reinserida/editada, momento em que passa pelo fluxo normal de `GetProduto` (ver AD-091), já coberto por `ProdutoPesavelEditavel` acima. Não existe cenário em que o Checkout precise ler uma flag equivalente diretamente do payload de `GetDAV`.
**Reason:** Resposta direta do usuário identificando um campo do contrato que as buscas anteriores por nome (`MatBloq*`/`MatEdit*`/`MatPermite*`/`ProdutoPesavel`/`MatProdPes`) não tinham encontrado, por não conter esses termos no próprio nome do campo.
**Trade-off:** Nenhum identificado — só fecha lacunas de contrato já documentadas como pendentes.
**Impact:** Atualiza `.specs/project/PENDENCIES.md` (remove item 4), `.specs/codebase/CONCERNS.md` (bullet `ProdutoPesavel`/`DavMatProdPes`) e `.specs/features/carrinho-produto-precificacao/spec.md` (Edge Cases de TAB/editabilidade e de código de barras pesável, Requirement Traceability/Coverage).

---

### AD-064: Comprovante de TEF e de duplicata não são impressos pelo Checkout (2026-08-25)

**Decision:** O Checkout SHALL imprimir apenas a NFCe (DANFE), via `XMLImpressao` retornado embutido na resposta de `FaturarNFCe` (`FIN-10`, AD-024/AD-037). O sistema NÃO SHALL imprimir comprovante de pagamento TEF nem gerar/imprimir qualquer documento para pagamento em duplicata (`FormaMeioPagtoNFe = DuplicataMercantil`). Fecha, por decisão explícita, os casos de uso "Impressão Comprovantes" e "Impressão Duplicatas" do diagrama de casos de uso em `Fluxograma - Diagrama - Alinhamentos\FLUXOS-MERMAID.md`, que não tinham spec correspondente em nenhuma feature.
**Reason:** Decisão direta do usuário — o comprovante de TEF já é emitido pelo próprio terminal físico da maquininha, fora do Checkout; duplicata não gera documento de impressão neste produto.
**Trade-off:** Nenhum identificado.
**Impact:** Atualiza `.specs/features/finalizacao-suspensao-venda/spec.md` (Out of Scope), `.specs/features/pagamento-tef/spec.md` (Edge Cases) e `.specs/features/pagamento-geral/spec.md` (Edge Cases, referência a `DuplicataMercantil`).

---

### AD-065: Cancelamento de item não exige aprovação de supervisor; sem modal de reautenticação no Checkout (2026-08-25)

**Decision:** O Checkout SHALL NÃO implementar nenhum mecanismo de aprovação de supervisor para cancelamento de item do carrinho, nem um modal de login/reautenticação de supervisor dentro da aplicação. Decisão direta do usuário: "nesse momento, não faremos essa restrição no checkout". O único bloqueio de cancelamento de item continua sendo o já documentado em `CART-09` (pagamento aprovado, AD-030) — não há bloqueio adicional condicionado a configuração de supervisor. Esta decisão fecha, sem implementar, o comportamento descrito nos fluxogramas antigos "Cancelar Produtos" e "Aprovar Cancelamento"/"Aprovar Desconto" de `Fluxograma - Diagrama - Alinhamentos\FLUXOS-MERMAID.md` — o caso simétrico de desconto sem aprovação de supervisor já estava coberto por AD-039; esta decisão fecha o caso de cancelamento e encerra a pergunta em aberto sobre o mecanismo de reautenticação levantada naquele arquivo.
**Reason:** Decisão direta do usuário.
**Trade-off:** Nenhum controle de dupla checagem para cancelamento de item — mesmo trade-off já aceito para desconto manual em AD-039.
**Impact:** Atualiza `.specs/features/carrinho-produto-precificacao/spec.md` (Out of Scope, Edge Cases próximo a `CART-09`).

---

### AD-066: Display secundário (tela voltada ao cliente) — gap de escopo registrado como pendência (2026-08-25)

**Decision:** O recurso de "display secundário" (segunda tela voltada ao cliente — propaganda, QR Code do PIX, agradecimento pela compra — descrito no fluxograma "Tela do cliente" de `Fluxograma - Diagrama - Alinhamentos\FLUXOS-MERMAID.md`) é confirmado pelo usuário como gap real de escopo: não existe hoje em `PROJECT.md`, `ARCHITECTURE.md` nem `ROADMAP.md`. Diferente das demais decisões desta sessão, aqui não há resolução — fica registrado formalmente como pendência de expansão de escopo, que vai exigir UI própria no Pencil e uma fase Specify dedicada antes de entrar no roadmap.
**Reason:** Usuário confirmou que é gap real, sem decisão de incluir ou excluir ainda — só registro formal da pendência.
**Trade-off:** Não aplicável — nada decidido ainda.
**Impact:** Novo item em `.specs/project/PENDENCIES.md` (seção 4, Pendências de design).

---

### AD-067: Escopo de `repriceSku` (`CART-06`) exclui explicitamente linha congelada de rascunho/DAV até reinserção/edição — fecha ambiguidade de auditoria de grilling (2026-08-26)

**Decision:** `repriceSku(sku)` (`CART-06`) nunca atinge uma linha de carrinho com origem em rascunho retomado (`.specs/features/recuperacao-nfce/spec.md`, `NFCE-03`) ou DAV importado (`.specs/features/importacao-dav/spec.md`, `DAV-02`) enquanto essa linha permanecer com o preço congelado tal como veio do ERP. O "todas as linhas ativas daquele SKU" de `CART-06` SHALL ser lido como "todas as linhas ativas daquele SKU que não estão congeladas por origem de rascunho/DAV". A linha congelada só entra no escopo normal de reprecificação no momento em que o operador a reinsere como linha nova ou a edita explicitamente — a partir daí ela deixa de ser tratada como congelada e passa a se comportar como qualquer linha normal do carrinho (`NFCE-04`).
**Reason:** Auditoria de grilling (2026-08-26) identificou que a redação literal de `CART-06` colidia com a regra de preço congelado já documentada em `recuperacao-nfce`/`importacao-dav` — especificamente para `TipoPreco = 8` (faixa de quantidade), uma linha congelada nunca recebeu `faixasQuantidade`/`precos` (só vêm de `GetProduto`/`GetListaProdutos`, não de `CarregarNFCe`/`GetDAV`), então incluí-la num recálculo agregado quebraria por falta de dado. Resposta direta do usuário confirma a exclusão como leitura correta.
**Trade-off:** Nenhum — só formaliza um comportamento que já estava implícito nas duas specs, evitando ambiguidade de implementação.
**Impact:** Atualiza `.specs/features/carrinho-produto-precificacao/spec.md` (`CART-06`, Edge Cases) e `.specs/features/recuperacao-nfce/spec.md` (cross-reference).

---

### AD-068: Parse fino do código de barras pesável reclassificado como pendência bloqueante — corrige AD-028 (2026-08-26)

**Decision:** A extração dos dígitos internos do código de barras bipado de produto pesável (13 dígitos, prefixo `2`, ver AD-028) — qual faixa é o código reduzido do produto, qual é peso/valor, e o dígito verificador — SHALL ser tratada como pendência bloqueante de requisito, não como "detalhe de implementação a confirmar na fase Design" (redação original de AD-028). Sem essa máscara, o Checkout não tem como saber qual substring do código enviar a `GetProduto` — a story P1 "Inserção direta por código conhecido" não é implementável para produtos pesáveis sem essa confirmação.
**Reason:** Auditoria de grilling (2026-08-26) apontou que tratar isso como não-bloqueante impediria a fase Design/Tasks de gerar tarefas completas para a story de inserção direta; a redação original de AD-028 subestimou o impacto. Decisão direta do usuário confirma a reclassificação.
**Trade-off:** Nenhum — só corrige a severidade atribuída à pendência; o que já foi confirmado (detecção por 13 dígitos + prefixo `2`) continua válido.
**Impact:** Atualiza `.specs/project/PENDENCIES.md` (novo item 29, seção 1, marcado bloqueante) e `.specs/features/carrinho-produto-precificacao/spec.md` (Edge Cases, Coverage).

---

### AD-069: `FaturarNFCe.produtos` sem trilha de tier e `DavMatProdPes` fecham sem pendência nova — corrige AD-024 e AD-063 (2026-08-26)

**Decision:** Duas pendências de contrato levantadas em rodadas anteriores fecham nesta auditoria sem exigir mudança de contrato do ERP:
1. **Trilha de tier de preço em `FaturarNFCe.produtos` (AD-024):** a ausência de campo dedicado no array de itens para registrar a faixa de preço aplicada (`TipoPreco = 8`) é satisfeita pelo evento `PRODUTO_ALTERADO` do log de auditoria geral da venda (`.specs/features/auditoria-acoes-operador/spec.md`, AD-061), que já registra campo alterado + valor anterior/novo. Decisão direta do usuário: log fica só no Checkout, via auditoria — não expande o contrato de `FaturarNFCe`.
2. **`DavMatProdPes` (contexto de item de DAV, AD-063):** não precisa de campo/pendência separada. Um item de DAV carregado (`GetDAV`) já vem com o produto inserido e o preço congelado, mesma regra de linha congelada de AD-067 — a caracterização pesável/editável só entra em jogo se a linha for reinserida ou editada, momento em que passa pelo fluxo normal de `GetProduto` (ver AD-091), já coberto por `ProdutoPesavelEditavel` (AD-063). Não existe cenário em que o Checkout precise ler uma flag equivalente diretamente do payload de `GetDAV`.
**Reason:** Auditoria de grilling (2026-08-26); ambas as respostas vieram diretamente do usuário.
**Trade-off:** Nenhum.
**Impact:** Corrige em `.specs/project/STATE.md` a nota de `AD-024` (bullet `FaturarNFCe.produtos`) e a nota "Escopo não coberto" de `AD-063` (ambas reescritas in-place). Nenhum item novo necessário em `.specs/project/PENDENCIES.md`. Atualiza `.specs/codebase/CONCERNS.md`.

---

### AD-070: Exclusividade pesável/editável de `ProdutoPesavelEditavel` confirmada pela estrutura do campo — corrige AD-063 (2026-08-26)

**Decision:** A interpretação de que produto pesável (`'S'`/`'B'`) e editável (`'E'`) são mutuamente exclusivos deixa de ser tratada como suposição a confirmar. `ProdutoPesavelEditavel` é um único campo string com exatamente 4 valores discretos (`'S'`, `'B'`, `''`, `'E'`) — não dois booleanos independentes combináveis. Por construção, o campo não pode representar "pesável e editável" simultaneamente: é garantia estrutural, não interpretação de negócio.
**Reason:** Auditoria de grilling (2026-08-26); o próprio usuário apontou que a lista de valores já fornecida (na resposta que originou AD-063) já resolvia a questão.
**Trade-off:** Nenhum.
**Impact:** Corrige `.specs/project/STATE.md` (AD-063) e `.specs/features/carrinho-produto-precificacao/spec.md` (Edge Cases, bullet `ProdutoPesavelEditavel`).

---

### AD-071: Aritmética monetária em centavos inteiros e BFF em Fastify — fecha últimas decisões técnicas em aberto de `STACK.md` (2026-08-26)

**Decision:** Duas alternativas técnicas que seguiam com "ou" em `STACK.md` fecham por decisão direta do usuário: (1) **Aritmética monetária:** centavos inteiros, sem lib externa (`dinero.js` descartado) — suficiente para as regras de preço já mapeadas. (2) **Framework do BFF:** Fastify — schema/validation nativo, alinhado à escolha já feita de Zod na camada de validação de fronteira.
**Reason:** Auditoria de grilling (2026-08-26) — decisões técnicas simples sem dono, com o projeto prestes a entrar em Design/scaffold.
**Trade-off:** Nenhum identificado para nenhuma das duas.
**Impact:** Atualiza `.specs/codebase/STACK.md` (seções Validação e Backend).

---

### AD-072: Método do maior resto formalizado para distribuição de resto de centavo — corrige AD-039 (2026-08-26)

**Decision:** O padrão de arredondamento monetário generalizado (AD-039: centavos inteiros, sobra de centavo "atribuída a um dos itens") ganha regra explícita de distribuição: **método do maior resto** (largest remainder) — cada item é arredondado para baixo (floor) ao ratear um valor (ex.: desconto de capa entre itens); a diferença total em centavos entre a soma arredondada e o valor exato é distribuída, 1 centavo por vez, aos itens com a maior parte fracionária descartada no arredondamento, do maior resto para o menor, até a diferença zerar. Substitui a redação vaga "atribuída a um dos itens" de AD-039, que não especificava qual item nem o critério de escolha.
**Reason:** Auditoria de grilling (2026-08-26) apontou que "um dos itens" era ambíguo o suficiente para gerar implementações divergentes; o usuário considerou primeiro "sempre o último item inserido" e depois confirmou preferência pelo método do maior resto, por ser mais justo (evita concentrar sempre no mesmo item) e determinístico/auditável.
**Trade-off:** Levemente mais complexo de implementar que "sempre o último item", mas evita viés sistemático.
**Impact:** Corrige `.specs/project/STATE.md` (AD-039) e `.specs/features/pagamento-geral/spec.md` (`PAY-10`, AC3 e Independent Test) e `.specs/features/carrinho-produto-precificacao/spec.md` (Edge Cases, padrão de arredondamento generalizado) — todos reescritos in-place.

---

### AD-073: Roteamento de TEF mantém a regra confirmada; distinção de forma de pagamento avulsa registrada como pendência não-bloqueante (2026-08-26)

**Decision:** `PAY-08` continua valendo exatamente como documentado: cartão (`FormaMeioPagtoNFe` ∈ {`CartaoCredito`, `CartaoDebito`}) + `ConfiguracoesTEF.TEFAtivo = true` roteia para a integração TEF. Auditoria de grilling levantou que, na prática operacional, `TEFAtivo` é uma configuração geral do estabelecimento — nem toda forma de pagamento do tipo cartão necessariamente chama o TEF quando ativo (pode existir uma forma cadastrada como "cartão avulso", cobrada em maquininha standalone fora do fluxo TEF). Investigação na KB real do GenExus (`CentriumDEVU6`) não encontrou nenhum campo/endpoint por-forma-de-pagamento que sinalize essa distinção — só existe o enum genérico `FormaMeioPagtoNFe` (SEFAZ) e a flag geral `TEFAtivo`; não é lacuna de documentação, é regra de negócio ainda não modelada no contrato do ERP. Por decisão direta do usuário, isso **não** bloqueia nem muda a regra já implementada de `PAY-08` — vira pendência não-bloqueante, a revisitar com a equipe do ERP quando/se a distinção for modelada no contrato.
**Reason:** Auditoria de grilling (2026-08-26); usuário confirmou manter a regra vigente e registrar só a dúvida.
**Trade-off:** Enquanto a pendência não é resolvida, o Checkout roteia para TEF todo cartão com `TEFAtivo=true`, mesmo que exista uma forma "avulsa" no cadastro do ERP — aceito deliberadamente pelo usuário.
**Impact:** Atualiza `.specs/project/PENDENCIES.md` (novo item 30, seção 1, não-bloqueante) e `.specs/features/pagamento-geral/spec.md` (Edge Cases, nota de cross-reference sem mudar a regra).

---

### AD-074: Escopo mobile — funcionalidades normais confirmadas e TEF excluído (PIX permanece) — complementa AD-046 (2026-08-26)

**Decision:** Confirmação adicional de escopo mobile, complementando AD-046 (que já cobria DAV, recuperação de NFCe, cadastro de cliente e menu gerencial):
- O checkout mobile permite normalmente busca e cadastro de cliente, inserção/edição/exclusão de item normal, identificação de vendedor e seleção de condição/forma de pagamento — mesmo fluxo do desktop, sujeito só à adaptação de layout já prevista em `layout-responsivo-mobile`.
- O checkout mobile **não** chama TEF — nenhuma forma de pagamento tipo cartão roteia para a integração TEF local quando o layout é mobile, independentemente de `ConfiguracoesTEF.TEFAtivo`.
- **Exceção:** PIX continua disponível e chamável normalmente no mobile.
**Reason:** Decisão direta do usuário — TEF depende de terminal físico conectado ao PDV, cenário que não se aplica a uso em tablet/celular; PIX não tem essa dependência de hardware, por isso permanece disponível.
**Trade-off:** Nenhum identificado.
**Impact:** Atualiza `.specs/features/layout-responsivo-mobile/spec.md` (Escopo mobile confirmado / Out of Scope) e `.specs/features/pagamento-tef/spec.md` e `.specs/features/pagamento-geral/spec.md` (roteamento TEF/PIX exclui TEF no mobile).

---

### AD-075: `GetStatusSistema` — retorno `numeric` com limiar (`0` = nada mudou, `>= 1` = mudou) + polling de 60s só entre vendas — resolve itens 7 e 23 (corrigido em 2026-08-26 por AD-080)

**Decision:** Complementa AD-024 (semântica dos códigos, sem resposta até então, item 7) e AD-051 (timing da chamada, sem resposta até então, item 23). Decisão direta do usuário: o endpoint `GetStatusSistema` (contrato **pendente de atualização pelo próprio ERP**) passa a expor um retorno **`numeric`** (não `boolean` — **correção em AD-080**) com semântica de limiar: `0` indica que nada do que foi enviado em `GetSessao` mudou desde a última captura das informações pelo Checkout; `>= 1` indica mudança, e nesse caso o Checkout SHALL rechamar `GetSessao` por completo para atualizar o `SessaoUsuario` local. O polling desse endpoint acontece a cada 60 segundos, e SHALL ocorrer **só entre vendas** — nunca durante uma "venda ativa" (carrinho com pelo menos 1 item OU cliente já identificado/selecionado).
**Reason:** Decisão direta do usuário, fechando duas pendências que dependiam de contato com a equipe do ERP.
**Trade-off:** Verificado agora na KB real do GeneXus (`PCheckout_GetStatusSistema`) que o endpoint **ainda retorna `CadStatus` bruto** (`NUMERIC`, sem transformação) — a semântica de limiar agora definida é o desenho-alvo para quando o ERP atualizar o contrato, não o comportamento atual. Até lá, o polling não pode ser implementado de fato pelo Checkout.
**Impact:** Atualiza `.specs/project/PENDENCIES.md` (itens 7 e 23 — resposta obtida, endpoint segue pendente do lado ERP) e `.specs/features/finalizacao-suspensao-venda/spec.md` (Edge Cases, `GetStatusSistema`).

---

### AD-076: Parse completo do código de barras de balança e fórmula de quantidade confirmados na KB do GX — resolve a pendência bloqueante item 29 (AD-068) (2026-08-26)

**Decision:** Confirmado por inspeção direta do código-fonte do ERP na KB (`CentriumDEVU6`, via MCP GeneXus) o parse completo do código de barras EAN-13 gerado por balança (prefixo `2`, formato já confirmado em AD-028). A procedure `PAnalisaCodigoProduto` extrai: (a) código reduzido do produto = posições 2 a 7 do código (6 dígitos); (b) valor da etiqueta = posições 8 a 12 (5 dígitos), convertido para numérico e dividido por 100 (os 2 últimos dígitos são centavos). A posição 13 é o dígito verificador do EAN-13, validado à parte por `PEAN13` — não é extraído como dado de negócio. Confirmado também, no evento `Enter` de `WWPNFCE` (~linha 478), o cálculo de quantidade a partir desses valores: `&TmpNfcQtd = trunc(valorEtiqueta / precoVendaDoProduto, 5)`, seguido de `&NfcQtd = round(&TmpNfcQtd, 3)` — ou seja, **quantidade = preço da etiqueta ÷ preço de venda do produto no ERP**, truncado em 5 casas e arredondado para 3 casas decimais. Confirma tanto a fórmula quanto o limite de 3 casas decimais informados pelo usuário.
**Reason:** Decisão/confirmação direta do usuário, verificada em código-fonte real da KB do GeneXus (não mais inferência).
**Trade-off:** A condição real do ERP (`WWPNFCE`) exige adicionalmente que o produto já seja conhecido como pesável — `MatProdPes = 'S'` (ou, se vazio, um parâmetro geral `IdentificaQuantidadeProdutoNaoPesavel = 'S'`) — antes de aplicar essa fórmula; ou seja, o parse de balança só vale quando o cadastro do produto já indica pesável (mesma linha de raciocínio do campo `ProdutoPesavelEditavel` do Checkout, AD-063 — a detecção pelo código bipado é uma checagem independente da leitura do cadastro, mas as duas precisam bater). Se o preço de venda do produto não estiver informado no ERP, a inserção é bloqueada com mensagem de erro — o Checkout SHALL replicar essa validação (não inserir o item, avisar o operador).
**Impact:** Resolve por completo a pendência **bloqueante** item 29 de `.specs/project/PENDENCIES.md` (AD-068) — remove o bloqueio da story P1 "Inserção direta por código conhecido" para produtos pesáveis. Atualiza `.specs/features/carrinho-produto-precificacao/spec.md` (Edge Cases + Requirement Traceability).

---

### AD-077: Filtro de data real no modal de lista de DAVs — decisão de produto tomada, endpoint segue pendente (item 10) (2026-08-26)

**Decision:** Decisão direta do usuário: não haverá restrição fixa de "hoje" — o modal de lista de DAVs no Checkout terá um filtro de data real, ajustável pelo operador, substituindo a janela fixa "hoje + status aberto" hoje hardcoded no `DataProvider` do ERP (`DavDatEmi = Today`, `DavSta = 'A'`, confirmado em AD-024). O endpoint `ListaDAVs` (`DpCheckout_GetDavs`) também precisa ser atualizado pelo ERP para aceitar um parâmetro de data real, deixando de ser hardcoded.
**Reason:** Decisão direta do usuário.
**Trade-off:** Até o endpoint ser atualizado pelo lado do ERP (pendência ainda não fechada, sem achado novo na KB), o filtro de data não pode ser implementado de fato no Checkout — esta decisão define a direção (filtro real, não janela fixa), não resolve o bloqueio de contrato.
**Impact:** Atualiza `.specs/project/PENDENCIES.md` (item 10 — nota atualizada: decisão de produto tomada, falta só o endpoint) e `.specs/features/importacao-dav/spec.md` (UI Design + Edge Cases).

---

### AD-078: `FormaIntegracaoCartao` confirmado em `GetSessao` — campo que distingue TEF (1) de POS (2) por forma de pagamento (item 30) (2026-08-26)

**Decision:** Confirmado no código-fonte do ERP (`PCheckout_GetSessao`, KB `CentriumDEVU6`) que o campo `SessaoUsuario.CondicoesDePagamento[].CondicaoFormasDePagamento[].FormaIntegracaoCartao` **já é retornado** por `GetSessao` — vem do atributo `FpgNfTefPos` (domínio `NFCe_tpIntegra`, descrição "Tipo de Integração para pagamento"), já usado internamente pelo próprio `PCheckout_GetSessao` para decidir `ConfiguracoesTEF.TEFAtivo` (`if FormaMeioPagtoNFe = CartaoCredito and FpgNfTefPos = NFCe_tpIntegra.PagtoIntegrado then PossuiTEF = true`). O valor `1` (enum `PagtoIntegrado`) = TEF; o valor `2` é o *fallback* explícito usado no XML da NFCe (tag `tpIntegra`) quando o campo vem vazio, e corresponde a POS (pagamento não integrado) — confirma a regra `1`=TEF/`2`=POS informada pelo usuário.
**Reason:** Decisão/confirmação direta do usuário, verificada em código-fonte real da KB do GeneXus.
**Trade-off:** Nenhum identificado — o campo já existe no contrato hoje, sem necessidade de mudança no ERP.
**Impact:** Resolve, com evidência de KB, o item 30 de `.specs/project/PENDENCIES.md` (antes registrado como pendência não-bloqueante em AD-073) — o Checkout pode usar `FormaIntegracaoCartao` (não só a combinação `FormaMeioPagtoNFe` + `TEFAtivo` geral) para distinguir cartão TEF de "cartão avulso"/POS por forma de pagamento individual, se essa distinção granular vier a ser necessária no roteamento (`PAY-08`). Atualiza `.specs/features/pagamento-geral/spec.md` (Edge Cases, `PAY-08`).

---

### AD-079: QR Code do PIX — imagem já é gerada e persistida pelo ERP; falta só expor no contrato de `GerarPIX` — corrige AD-047 (item 24) (2026-08-26)

**Decision:** Investigação na KB real do GeneXus mostra que a suposição anterior (AD-047, "eu acho que retorna base64 da imagem", nota de baixa confiança) estava **parcialmente incorreta como o contrato está hoje**: `PCheckout_GerarPIX` (e `GerarPIXOutput` em `ApiCentriumOAuth.yaml`) só devolve `TrnGUID` e `Trnbase64text` — e `Trnbase64text` é o base64 do **texto** "copia e cola" (`ToBase64(&TrnPixCopiaECola)`), não uma imagem. A imagem do QR Code (`Trnbase64image`) **já é gerada pelo próprio ERP nesse mesmo fluxo** — `PTransacao_CentriumPag_Post` chama `PGetBarCodeImage.Udp(BarCodeQRCode, copiaECola)` e grava o resultado em base64 na tabela `Transacao` — mas fica descartada antes de retornar ao Checkout. Confirmado que esse valor já persistido é lido hoje pela tela legada do próprio ERP (`WPTransacao_LapseStatus`, sub `CarregarQRCode`), que busca `Trnbase64image` diretamente da tabela `Transacao` (não da resposta de um endpoint) e a decodifica para exibir a imagem — grava em arquivo temporário e carrega como `Bitmap`, padrão específico de Web Panel GX Web, não aplicável a uma SPA. Decisão do usuário: seguir o mesmo padrão já usado pelo ERP — reaproveitar o `Trnbase64image` já computado e persistido, só que devolvido diretamente ao Checkout (sem a etapa de arquivo temporário, desnecessária numa SPA — o Checkout decodifica o base64 direto num `<img src="data:image/jpeg;base64,...">`).
**Reason:** Decisão direta do usuário, a partir de achado verificado na KB real do GeneXus — corrige AD-047, que tratava a questão como suposição de baixa confiança ("eu acho").
**Trade-off:** Exige que o ERP atualize o `parm()` de saída de `PCheckout_GerarPIX` para incluir `Trnbase64image` (valor já calculado e persistido pela mesma chamada, só não exposto hoje) — pendência de contrato, não de nova lógica de negócio. Até lá, o Checkout só recebe o texto "copia e cola", sem imagem pronta para exibir.
**Impact:** Atualiza `.specs/project/PENDENCIES.md` (item 24 — nota corrigida: não é mais assunção "eu acho", é achado confirmado com direção de implementação definida — pedir ao ERP para expor `Trnbase64image`) e `.specs/features/pagamento-pix/spec.md` (Edge Cases, UI Design).

---

### AD-080: Correção de AD-075 — `GetStatusSistema` retorna `numeric` com limiar, não `boolean` (2026-08-26)

**Decision:** Corrige AD-075, registrada mais cedo no mesmo dia com semântica `boolean` (`true`/`false`). Decisão direta do usuário: o retorno de `GetStatusSistema` é **`numeric`**, com a seguinte regra de limiar — `0` indica que nada mudou desde a última captura de `GetSessao` (Checkout NÃO precisa rechamar `GetSessao`); qualquer valor **`>= 1`** indica mudança (Checkout SHALL rechamar `GetSessao`). O restante de AD-075 (polling a cada 60s, só entre vendas) continua valendo sem alteração.
**Reason:** Correção direta do usuário, momentos depois do registro original — a especificação de tipo estava errada (boolean em vez de numeric com limiar).
**Trade-off:** Nenhum novo — mesma ressalva de AD-075 permanece: `PCheckout_GetStatusSistema` ainda retorna `CadStatus` bruto hoje, então essa semântica (agora com o tipo certo) segue sendo o desenho-alvo, pendente de implementação pelo ERP.
**Impact:** Reescreve AD-075 in-place (não apenas anexa a correção no fim) e `.specs/features/finalizacao-suspensao-venda/spec.md` (Edge Cases, `GetStatusSistema`) — nenhum outro documento referenciava a semântica boolean antes desta correção.

---

### AD-081: Itens 10 e 24 — equipe do ERP confirmou que vai atualizar os endpoints pendentes (2026-08-26)

**Decision:** Usuário confirmou diretamente que a equipe do ERP vai atualizar tanto `ListaDAVs`/`DpCheckout_GetDavs` (item 10 — para aceitar filtro de data real, AD-077) quanto `PCheckout_GerarPIX` (item 24 — para expor `Trnbase64image`, AD-079). Os dois deixam de ser pendências em aberto sem direção — a atualização já está encaminhada pelo lado do ERP, só falta ser feita.
**Reason:** Confirmação direta do usuário.
**Trade-off:** Nenhum novo — o Checkout continua sem poder implementar o filtro de data real de DAVs nem exibir a imagem do QR Code do PIX até essas atualizações saírem, mas a incerteza sobre "se" o ERP vai atualizar deixa de existir.
**Impact:** Atualiza `.specs/project/PENDENCIES.md` (itens 10 e 24 — nota de que a atualização já foi encaminhada pela equipe do ERP) e `.specs/features/importacao-dav/spec.md` / `.specs/features/pagamento-pix/spec.md` (Edge Cases).

---

### AD-082: `GetSessao` retorna `TipoImpressao` (`'E'` = direta, `'P'` = PDF) — resolve o indicativo faltante de AD-037 (2026-08-26)

**Decision:** Decisão direta do usuário: `GetSessao` passa a enviar o campo `TipoImpressao`, indicando qual mecanismo de impressão o Checkout SHALL usar após a autorização da NFCe — `'E'` = impressão direta (serviço de impressão local, ver AD-037), `'P'` = PDF. Resolve a parte de AD-037/item 22 de `.specs/project/PENDENCIES.md` que pedia "um indicativo faltante no `GetSessao` de qual mecanismo de impressão o tenant/máquina deve usar". O comportamento de fallback já definido em AD-037 permanece sem alteração: WHEN a impressão direta (`TipoImpressao = 'E'`) falhar (serviço de impressão local não responde) THEN o sistema SHALL perguntar ao operador se deseja imprimir o PDF, em vez de falhar silenciosamente.
**Reason:** Decisão direta do usuário, fechando a metade de AD-037 que dependia de um campo novo em `GetSessao`.
**Trade-off:** Não resolve a outra metade de AD-037 — o contrato técnico completo do serviço de impressão local (porta fixa, rota/método HTTP, formato de resposta) segue sem definição, ainda a levar à equipe do ERP.
**Impact:** Atualiza `.specs/project/PENDENCIES.md` (item 22 — escopo reduzido só ao contrato técnico do serviço local; indicativo do `GetSessao` resolvido) e `.specs/features/finalizacao-suspensao-venda/spec.md` (Edge Cases, `FIN-10`, Coverage).

---

### AD-083: Contrato técnico do serviço de impressão local confirmado — replica `Impressao.js` do PDV atual do Centrium — resolve por completo o item 22 (2026-08-26)

**Decision:** Usuário forneceu o código-fonte real do arquivo `Impressao.js`, hoje carregado no PDV atual do ERP e responsável por enviar a NFCe ao serviço de impressão local — resolve por completo a metade remanescente de AD-037/item 22 (a outra metade, o indicativo `TipoImpressao` em `GetSessao`, já tinha sido resolvida em AD-082). Confirmado, a partir do código real:
- **Host/porta:** vem de `SessaoUsuario.CadMaqHost` (já retornado por `GetSessao`, confirmado em `PCheckout_GetSessao`) como uma única string `host:porta`. WHEN `CadMaqHost` estiver vazio THEN o sistema SHALL usar o default `127.0.0.1:4545` — mesmo valor hardcoded do PDV atual (avisando o operador que está usando o default, como o PDV atual faz via `alert`). Não é uma porta globalmente fixa: é configurável por máquina via `CadMaqHost`, com esse fallback fixo.
- **Rota/método:** `POST` para a raiz do host (`http://{CadMaqHost}`), sem path/rota adicional — não é um endpoint REST com rota própria.
- **Headers:** `Content-Type: text/plain`.
- **Corpo:** o `XMLImpressao` (já recebido na resposta de `FaturarNFCe`) enviado cru, como texto puro — não é JSON, não é envelope estruturado.
- **Resposta:** o cliente atual (`Impressao.js`) **não lê nem valida a resposta** — só trata falha via `catch` da própria chamada `fetch` (erro de rede/conexão recusada, já que não há nada escutando na porta quando o serviço não está disponível). Não existe formato de resposta a validar; sucesso = a requisição não lançou exceção. Confirma e detalha o fallback já definido em AD-037 (perguntar se quer PDF quando a chamada falhar).
**Reason:** Decisão direta do usuário — em vez de desenhar um contrato novo do zero (ou esperar confirmação da equipe do ERP), o Checkout replica exatamente o mecanismo já usado e testado em produção pelo PDV atual.
**Trade-off:** Nenhum novo — resolve item 22 por completo sem exigir nenhuma ação da equipe do ERP; o Checkout só precisa ter acesso de rede ao `host:porta` do PDV (mesma rede local), igual ao PDV atual já tem.
**Impact:** Atualiza `.specs/project/PENDENCIES.md` (remove item 22 da tabela — resolvido) e `.specs/features/finalizacao-suspensao-venda/spec.md` (Edge Cases, `FIN-10`, Coverage).

---

### AD-084: Revisão do conteúdo bruto de `SKILL.md`/`CLAUDE.md` embutidos em `goey-toast`/`boneyard` concluída — nenhum conteúdo malicioso encontrado; instalação real segue pendente do scaffold (2026-08-26)

**Decision:** Adiantada a etapa de revisão manual prevista em AD-018 (ler o conteúdo bruto dos arquivos voltados a agentes de IA antes de seguir qualquer instrução neles) — via GitHub API, sem clonar nem instalar nada. Revisados: `anl331/goey-toast` (`skills/goey-toast/SKILL.md`, `bin/cli.mjs`, `package.json`) e `0xGF/boneyard` (`CLAUDE.md`, `.claude/skills/boneyard/SKILL.md`, `packages/boneyard/package.json` — o pacote publicado de fato como `boneyard-js`). Achados:
- **goey-toast:** `SKILL.md` contém só documentação de uso (instalação, API, recipes) — nenhuma instrução suspeita (sem exfiltração, sem comando destrutivo, sem tentativa de "ignorar instruções anteriores"). `bin/cli.mjs` só copia o próprio `SKILL.md` para `.claude/skills/goey-toast/` e, opcionalmente, anexa um bloco a `AGENTS.md` — I/O local, sem rede — e só roda se alguém executar explicitamente `npx goey-toast add-skill`. `package.json` não tem script `postinstall`/`preinstall`: um `npm install goey-toast` normal não dispara nada disso.
- **boneyard:** `CLAUDE.md` e `.claude/skills/boneyard/SKILL.md` contêm documentação de arquitetura/uso/debug da lib — mesma conclusão, nada malicioso. O `SKILL.md` declara `allowed-tools: Bash Read Edit Write Glob Grep Agent` no frontmatter (autoconcessão de permissões amplas a um agente de IA) — padrão atípico, mas não há, dentro do arquivo, nenhuma instrução que abuse dessa permissão (é só metadado declarativo do formato de skill). `packages/boneyard/package.json` (pacote publicado como `boneyard-js`) também não tem `postinstall`/`preinstall` — só `prepublishOnly`, que roda no `npm publish` do mantenedor, não no `npm install` do consumidor.
- **Achado lateral (operacional, não é risco de supply-chain):** `boneyard-js` declara `playwright ^1.58.2` como dependency real (usado pelo CLI para navegar/tirar screenshot da página de dev). O `playwright` tem seu próprio `postinstall` que baixa binários de browser (~300MB) no `npm install` — isso precisa entrar na conta da imagem Docker (dev/build) quando a instalação real acontecer, dado que o projeto é 100% Docker (`.specs/codebase/STACK.md`).

**Reason:** Reduzir o risco residual do lembrete de segurança de AD-018 adiantando a parte da revisão que não depende do scaffold existir, em vez de deixá-la só para o momento da instalação real.
**Trade-off:** Nenhum novo. A instalação real (`npm install goey-toast boneyard-js`, quando o scaffold existir) continua não executada — decisão do usuário de não criar o scaffold agora só para isso. O item 20 de `PENDENCIES.md` permanece na tabela (não é removido): o lembrete de reler o conteúdo bruto no momento da instalação real continua válido, já que os pacotes podem publicar novas versões até lá — esta revisão cobre o estado dos repositórios em 2026-08-26.
**Impact:** Atualiza `.specs/codebase/CONCERNS.md` (seção `goey-toast`/`boneyard`) e `.specs/project/PENDENCIES.md` (nota do item 20, seção "Riscos/lembretes de segurança").

---

### AD-085: Código deve seguir arquitetura SOLID (2026-08-26)

**Decision:** Fixado como exigência de projeto que a implementação do Checkout (componentes React, hooks, camada de acesso à API do ERP, state management) SHALL seguir os cinco princípios SOLID (Single Responsibility, Open/Closed, Liskov Substitution, Interface Segregation, Dependency Inversion). É uma constraint de design de código, não uma decisão de stack/arquitetura de sistema (essas continuam em `.specs/codebase/ARCHITECTURE.md`/`STACK.md`).
**Reason:** Decisão explícita do usuário, registrada antes de existir código real para não deixar a exigência implícita ou dependente de memória entre sessões.
**Trade-off:** Nenhum trade-off técnico avaliado nesta decisão — é uma diretriz de qualidade/manutenibilidade a ser detalhada (com exemplos concretos do próprio código) quando `CONVENTIONS.md` for gerado via brownfield mapping, conforme `.specs/project/ROADMAP.md`.
**Impact:** Atualiza `.specs/project/ROADMAP.md` (nota sobre `CONVENTIONS.md` ainda não gerado) e `CLAUDE.md` (seção "Convenções e regras de código"), apontando para este AD como exigência já decidida a ser incorporada quando o scaffolding existir.

---

### AD-086: Leitura de código de barras via câmera no mobile, restrita a Chrome no Android (2026-08-26)

**Decision:** O botão "Scanner" já previsto no design mobile (etapa de produtos do wizard) ativa a câmera do dispositivo para leitura de código de barras usando a API nativa `BarcodeDetector` (Shape Detection API), sem biblioteca de decodificação externa (ex.: ZXing). Essa funcionalidade **só funciona em Chrome no Android** — não há fallback para outros navegadores/plataformas (Safari/iOS, desktop) nesta decisão.
**Reason:** Decisão explícita do usuário — restringir a Chrome/Android elimina a necessidade de biblioteca de decodificação em JS/WASM (mais pesada, exigiria Web Worker) e de tratar suporte cross-browser, em troca de não cobrir iOS/Safari.
**Trade-off:** Se o parque de dispositivos do PDV precisar incluir iPad/Safari ou outro navegador no futuro, a base de decodificação via `BarcodeDetector` não tem fallback incremental — exigiria reescrever o mecanismo de decodificação (ex.: introduzir ZXing), não apenas estendê-lo.
**Impact:** Atualiza `.specs/project/PROJECT.md` (Scope) e `.specs/features/layout-responsivo-mobile/spec.md` (novo requisito `MOB-06`, escopo mobile confirmado e Edge Cases — comportamento fora de Chrome/Android permanece indefinido, registrado como edge case em aberto).

---

### AD-087: Contrato atualizado (`info.version: 20260826163735`) — `ListaDAVs` ganha `Datainicial`/`Datafinal` (resolve item 10) e `GerarPIXOutput` ganha `Trnbase64image` (resolve item 24) (2026-08-26)

**Decision:** Usuário atualizou `ApiCentriumOAuth.yaml` com três mudanças de contrato, confirmando compromissos que a equipe do ERP havia assumido em AD-081:
- `GET /ApiCentriumOAuth/ListaDAVs` ganhou os parâmetros de query `Datainicial`/`Datafinal` (`string`, `format: date`, ambos opcionais) — entrega a atualização prometida em AD-081 e efetiva a decisão de produto de AD-077 (filtro de data real no modal de DAVs, sem restrição fixa de "hoje"). Resolve por completo o item 10 de `PENDENCIES.md`; `status`/vendedor/tipo/origem seguem sem suporte, mas nunca fizeram parte do escopo prometido.
- `GerarPIXOutput` ganhou o campo `Trnbase64image` (`string`), ao lado do `Trnbase64text` já existente — entrega a atualização prometida em AD-081 para expor a imagem do QR Code do PIX (achado de AD-079). Resolve por completo o item 24 de `PENDENCIES.md`.
- `SessaoUsuario` ganhou o campo `TipoImpressao` (`string`) — formaliza no contrato o indicativo de mecanismo de impressão (`'E'`/`'P'`) já assumido por AD-082 a partir de resposta direta do usuário; não havia pendência aberta associada, é só a confirmação escrita no yaml do que já estava documentado.

**Reason:** Fechar no contrato formal os dois compromissos que a equipe do ERP havia assumido em AD-081, eliminando a dependência de "aguardar atualização" nos dois itens.
**Trade-off:** Nenhum novo — ambas as mudanças são estritamente aditivas ao contrato (novos campos/parâmetros opcionais), sem quebra de compatibilidade com o que já estava documentado.
**Impact:** Atualiza `.specs/project/PENDENCIES.md` (remove itens 10 e 24 da tabela — resolvidos), `.specs/features/importacao-dav/spec.md` (UI Design, Edge Cases, Coverage — e corrige de passagem uma referência esquecida ao item 26, já resolvido em AD-057) e `.specs/features/pagamento-pix/spec.md` (UI Design, Edge Cases, Coverage).

---

### AD-088: `GetStatusSistema` — semântica de limiar confirmada em produção e parâmetro `Cadmaqcod` esclarecido (`SessaoUsuario.CadMaqCod`) — resolve por completo o item 7 (2026-08-26)

**Decision:** Usuário confirmou diretamente, fechando por completo a pendência de contrato remanescente sobre `GET /ApiCentriumOAuth/GetStatusSistema`:
- O endpoint já implementa a semântica de limiar decidida em AD-075 (corrigida por AD-080): `0` = nada do que foi enviado em `GetSessao` mudou desde a última captura pelo Checkout (nada a fazer); qualquer valor `>= 1` = mudou, exige rechamar `GetSessao` por completo. O significado específico de valores acima de `1` não importa para essa decisão binária — supera o achado de KB (AD-024 e nova checagem em 2026-08-26) de que a procedure ainda repassava `CadStatus` bruto sem transformação.
- O contrato (`ApiCentriumOAuth.yaml`) já retorna o tipo correto (`integer` puro, sem wrapper) — confirmado sem necessidade de nenhuma mudança no yaml.
- Informação nova, não documentada antes: o parâmetro `Cadmaqcod` (já presente no contrato como query param opcional) deve ser enviado com o valor de `SessaoUsuario.CadMaqCod`, recebido em `GetSessao` — não é um valor arbitrário/fixo do cliente.

**Reason:** Decisão/confirmação direta do usuário, fechando a lacuna de documentação do ERP que nem inspeção de KB (AD-024) conseguia resolver.
**Trade-off:** Nenhum — não exige mudança de contrato, só implementação no Checkout usando o valor de `CadMaqCod` já disponível em `SessaoUsuario`.
**Impact:** Atualiza `.specs/project/PENDENCIES.md` (remove item 7 da tabela — resolvido), `.specs/features/finalizacao-suspensao-venda/spec.md` (Edge Cases, Coverage) e `.specs/codebase/CONCERNS.md` (nota sobre `GetStatusSistema`).

---

### AD-089: Gatilhos de UI de finalização/suspensão confirmados — desktop com botões dedicados, mobile com ícone de lixeira no menu superior — resolve por completo o item 18 (2026-08-26)

**Decision:** Usuário confirmou diretamente o mecanismo de UI que aciona `FaturarNFCe` (`FATURAR`/`SUSPENDER`), fechando a pendência sobre a ausência de frame desktop dedicado:
- **Desktop:** existe um botão "Cancelar Venda" (aciona `SuspenderOuFaturar = "SUSPENDER"`) e um botão "Finalizar Venda" (aciona `SuspenderOuFaturar = "FATURAR"`), dentro da própria tela principal (`Fundo PDV Online Web`) — não há modal dedicado para essa ação, confirmando a suposição já registrada em `.specs/features/finalizacao-suspensao-venda/spec.md`.
- **Mobile:** existe um ícone de lixeira no menu superior direito, presente em **todas** as telas do wizard mobile (`PDV Mobile 01`, `02` e `03`) — não só na etapa final — que aciona a suspensão (`SUSPENDER`); e um botão "Finalizar Venda" (`FATURAR`), já previsto na etapa 03 (`PDV Mobile 03 - Revisão e Finalização`).

**Reason:** Decisão/confirmação direta do usuário — fecha a lacuna de UI Design que impedia detalhar os requisitos `FIN-01`/`FIN-05` com o gatilho real de interface.
**Trade-off:** Nenhum — é só documentação do mecanismo de UI já existente no design; não muda contrato de API nem regra de negócio.
**Impact:** Atualiza `.specs/project/PENDENCIES.md` (remove item 18 da tabela — resolvido) e `.specs/features/finalizacao-suspensao-venda/spec.md` (UI Design, Coverage).

---

### AD-090: Botão "Scanner" fica oculto fora de Chrome/Android — resolve o edge case deixado em aberto por AD-086 (2026-08-26)

**Decision:** Quando o navegador/dispositivo em uso não suporta a leitura de código de barras via câmera (ou seja, fora de Chrome no Android, conforme restrição já fixada em AD-086), o botão "Scanner" **não é exibido** na etapa de produtos do wizard mobile. Não há versão desabilitada nem mensagem de indisponibilidade — a opção simplesmente está ausente da interface nesses casos.
**Reason:** Decisão explícita do usuário, resolvendo a pendência que AD-086 havia deixado registrada como edge case em aberto (aquela decisão só cobria o caminho feliz em Chrome/Android). Esconder evita expor ao operador uma funcionalidade que ele não pode usar, sem exigir copy adicional de indisponibilidade.
**Trade-off:** Nenhum novo — é a opção mais simples de implementar (checagem de suporte antes de renderizar o botão). O operador num dispositivo não suportado não tem nenhuma pista visual de que a funcionalidade existe, o que é aceitável já que a inserção manual/por leitor físico continua disponível como caminho principal.
**Impact:** Atualiza `.specs/features/layout-responsivo-mobile/spec.md` (Edge Cases, User Story de leitura por câmera) e `specs/007-layout-responsivo-mobile/spec.md` (resolve o marcador `[NEEDS CLARIFICATION]` em Edge Cases, novo requisito funcional, checklist de qualidade).

---

### AD-091: `GetProduto` é o único endpoint que resolve a linha do carrinho — `GetListaProdutos` serve só para captar/selecionar produtos (2026-08-26)

**Decision:** O modal de busca de produto usa `GET /ApiCentriumOAuth/GetListaProdutos` **apenas** para captar a lista de produtos e permitir a seleção. Assim que o operador seleciona um candidato, o sistema chama `GET /ApiCentriumOAuth/GetProduto` para o `CodigoProduto` escolhido — mesmo caminho da inserção direta por código bipado/digitado (`CART-02`) — e é o retorno de `GetProduto` que alimenta a linha do carrinho. `GetProduto` devolve `PrecoVenda` e `ProdutoPesavelEditavel`, e aceita os parâmetros `Tipocodproduto`, `Tipopreco`, `Codcliente` e `Listapreco`.

**Reason:** Decisão direta do usuário, confirmando um achado da fase Design da feature 003 (`/speckit-plan`, `specs/003-carrinho-produto-precificacao/research.md`, decisão D1): o schema de retorno de `GetListaProdutos` (`CheckoutListaProdutos.Produtos_Produtos` em `ApiCentriumOAuth.yaml`) **não possui** os campos `PrecoVenda` nem `ProdutoPesavelEditavel`, e o endpoint aceita somente `Empresa`/`Txtbusca`/`Pagina`/`Tamanhopagina`. Montar a linha a partir da busca produziria preço errado para todo `TipoPreco` fora de `1`-`5` e quebraria o fluxo de produto pesável/editável por falta da flag. Redações anteriores em `.specs/` que afirmavam que `PrecoVenda` vinha "de `GetProduto`/`GetListaProdutos`" estavam erradas e foram corrigidas no ponto do texto.

**Trade-off:** Uma chamada de rede adicional por item selecionado no modal de busca — custo desprezível, já que o resultado é cacheado por SKU com `staleTime: Infinity` durante toda a venda (`CART-03`), e o caminho de bipagem (o mais frequente no PDV) já fazia essa chamada de qualquer forma.

**Impact:** `.specs/features/carrinho-produto-precificacao/spec.md` (User Story de busca AC2, `CART-04` AC1, Edge Cases de `TipoPreco` e de `ProdutoPesavelEditavel`, tabela de Requirement Traceability), `.specs/codebase/CONCERNS.md` e AD-025 acima corrigidos no ponto. Os artefatos de Design da feature 003 (`plan.md`, `research.md`, `contracts/erp-produto-api.md`, `quickstart.md`) já refletem esta decisão.

---

### AD-092: Não existe lista de preço padrão da empresa — `TipoPreco = 9` usa sempre a lista do cliente (2026-08-26)

**Decision:** `SessaoUsuario.TipoPreco = 9` indica que o tipo de preço é **por lista**, e a lista a aplicar é **sempre** a configurada no cadastro do cliente (`ClienteCheckout.ListaPreco`/`CliListCod`), enviada no parâmetro `Listapreco` de `GetProduto`. Não existe lista de preço padrão da empresa, e portanto não existe nenhum fallback para o caso de o cliente não ter lista própria. **Precisão (2026-08-31, AD-108):** o campo `SessaoUsuario.ListaPrecoDefault`, acrescentado ao contrato em `20260827192357`, **não** contradiz esta decisão — ele não é uma lista da empresa, é a lista do **cliente default** (o `CliListCod` dele, com fallback `1` aplicado pelo próprio ERP), publicada na sessão justamente para que o Checkout não precise chamar `GetCliente` nesse caso.

**Reason:** Decisão direta do usuário, respondendo a um achado da fase Design da feature 003 (`specs/003-carrinho-produto-precificacao/research.md`, decisão D10): redações anteriores em `.specs/codebase/CONCERNS.md` e em AD-025 mandavam usar "a lista padrão da empresa, carregada em `SessaoUsuario.listaPrecoPadrao`" quando o cliente não tivesse lista própria — mas esse campo **nunca existiu** no `ApiCentriumOAuth.yaml` (schema `SessaoUsuario`), e o conceito de lista padrão da empresa não existe no domínio. A regra correta é mais simples do que a documentada: `9` = preço por lista = lista do cliente.

**Trade-off:** Nenhum. Remove um ramo de código que teria sido escrito para um fallback inexistente.

**Impact:** `.specs/features/carrinho-produto-precificacao/spec.md` (Edge Case de `TipoPreco = 9`), `.specs/codebase/CONCERNS.md` e AD-025 acima corrigidos no ponto, com a referência a `listaPrecoPadrao` removida da especificação. Nenhum item novo em `.specs/project/PENDENCIES.md` — o achado A2 registrado durante o Design fica fechado sem virar pendência com a equipe do ERP. Os artefatos de Design da feature 003 (`research.md`, `contracts/erp-produto-api.md`, `quickstart.md`) atualizados.

---

### AD-093: Filtro "Ativo" removido do modal de busca de cliente — não existe campo de status no contrato (2026-08-26)

**Decision:** Corrige o ponto 3 de AD-053 para o modal de cliente: o filtro "Ativo" **não** será implementado na busca de cliente (`GetListaClientes`/`GetCliente`). O modal não exibe esse chip/filtro, e `FR-007` (`.specs/features/identificacao-cadastro-cliente/spec.md`) deixa de exigir restrição a clientes ativos por padrão.

**Reason:** Decisão direta do usuário, respondendo a um achado da fase Design da feature 005 (`/speckit-plan`, `specs/005-identificacao-cadastro-cliente/research.md`): inspeção direta de `Fluxograma - Diagrama - Alinhamentos/APICentriumOAuth.yaml` confirma que `GetListaClientes` aceita somente `Empresa`, `Txtbusca`, `Pagina`, `Tamanhopagina` (sem parâmetro de status) e que nem `SDTCheckoutListaClientes.Clientes_ClientesItem` nem `ClienteCheckout` (retorno de `GetCliente`) têm campo `Ativo`/`Status`. Diferente de outras pendências de contrato deste projeto (ex.: filtros de `ListaDAVs` em AD-077, que existem no design mas o servidor ignora), aqui o dado nem chega ao Checkout — não há como filtrar nem exibir localmente. AD-053 presumia esse campo existir para os dois modais (cliente e vendedor); o achado desta rodada só cobre o de cliente.

**Trade-off:** A busca de cliente pode listar clientes inativos junto dos ativos, sem indicação visual de status — aceito deliberadamente em vez de simular um filtro que não tem dado real por trás.

**Impact:** `.specs/features/identificacao-cadastro-cliente/spec.md` (`FR-007` removido/corrigido, Acceptance Criteria e Edge Cases atualizados no ponto do texto, não por nota anexada — ver `docs/agents/domain.md`), AD-053 acima (ponto 3, ressalva adicionada). **Não** atualiza `.specs/features/selecao-vendedor/spec.md` — o mesmo problema de contrato ainda não foi verificado para `GetListaVendedores`; permanece como está até a fase Design daquela feature. Nenhum item novo em `.specs/project/PENDENCIES.md` — resolvido por decisão de produto (remoção de escopo), não por pendência aguardando resposta do ERP.

---

### AD-094: `GetCliente` não tem como buscar por código — bloqueava dados completos do cliente default (`TipoPreco=9`) sem interação do operador (2026-08-26; **resolvido em 2026-08-31 por AD-108**)

**Decision:** ⚠️ **Superado em 2026-08-31 por AD-108 — leia lá antes de implementar.** A lacuna descrita aqui **não existe mais** e o item 31 de `.specs/project/PENDENCIES.md` está **fechado**: com o cliente default, a lista de preço vem de `SessaoUsuario.ListaPrecoDefault` (`GetSessao`) e o desconto de convênio é inexistente por regra de negócio, de modo que o Checkout nunca precisa resolver esse cliente por código nem chamar `GetCliente`. Redação original (2026-08-26): registrado como **pendência bloqueante** (item 31 de `.specs/project/PENDENCIES.md`), não resolvido naquela rodada — decisão direta do usuário foi sobre **como tratar** o achado, não sobre a lacuna em si. `GetCliente` aceita somente `Empresa` e `CPFCNPJ` como parâmetros (confirmado em `ApiCentriumOAuth.yaml`) — não existe `CodCliente`/`CodigoCliente`; isso continua verdadeiro, apenas deixou de importar. `GetSessao.SessaoUsuario` devolve `ClienteDefaultCodigo`/`ClienteDefaultNome` (código + nome), sem CPF.

**Reason:** Achado da fase Design da feature 005 (`/speckit-plan`, `specs/005-identificacao-cadastro-cliente/research.md`). Diferente de AD-091/AD-092/AD-093 (achados fechados no mesmo dia por decisão direta do usuário), este depende de mudança de contrato pela equipe do ERP — não há forma de contornar só com decisão de produto, porque o dado (CPF do cliente default) genuinamente não está disponível em nenhum payload que o Checkout recebe hoje.

**Trade-off:** **Não se aplica mais desde AD-108 (2026-08-31).** Redação original: até a resolução, o plano da feature 005 documentava o cliente default como parcialmente resolvido — código e nome disponíveis desde `GetSessao`, `ListaPreco`/`DescontoConvenio` indisponíveis sem o operador abrir o modal e reselecionar (ainda que fosse o mesmo cliente). Isso não bloqueava a venda (o campo cliente nunca fica vazio, AD-032 continua válido), mas podia produzir preço incorreto em `TipoPreco = 9`.

**Impact:** **Substituído por AD-108 (2026-08-31)** — o item 31 saiu de `.specs/project/PENDENCIES.md` e todos os arquivos citados abaixo foram reescritos no ponto para a regra nova (cliente default com `listaPreco = ListaPrecoDefault` e `descontoConvenio = 0`). Redação original: `.specs/features/identificacao-cadastro-cliente/spec.md` (Edge Cases), `.specs/project/PENDENCIES.md` (item 31, seção 1). `specs/005-identificacao-cadastro-cliente/` (`research.md`, `plan.md` — Technical Context/Constraints) documentam o limite. Referenciado também pela feature 003 (`.specs/features/carrinho-produto-precificacao/spec.md`, D9/D10 de `specs/003-carrinho-produto-precificacao/research.md`), que consome `ListaPreco`/`DescontoConvenio` do cliente selecionado.

---

### AD-095: `ListaDAVs`/`GetDav` nunca retornam `VendedorNome` — corrige nota desatualizada em `selecao-vendedor/spec.md` (2026-08-26)

**Decision:** Ao inspecionar `Fluxograma - Diagrama - Alinhamentos/APICentriumOAuth.yaml` (`info.version: 20260826163735`) durante a fase Design da feature 006 (importação de DAV), confirmado que `CheckoutListaDAVs.DAV_DAV` (retorno de `ListaDAVs`) traz `VendedorCodigo` mas **não** `VendedorNome` — ao contrário do que uma nota de `.specs/features/selecao-vendedor/spec.md` (Edge Cases, escrita em 2026-08-21) afirmava. `CheckoutFaturarNFCe` (retorno de `GetDav`, mesmo shape usado por `CarregarNFCe`, AD-057) também não tem nenhum campo de nome de cliente/vendedor — só `clienteCodigo`/`vendedorCodigo`. Decisão de design: ao importar um DAV, o vendedor sobrescrito (`FR-007`) é exibido só pelo código (`Vendedor #<código>`) até o operador reabrir o modal de seleção de vendedor (`.specs/features/selecao-vendedor/spec.md`) e resolver o nome por busca — não há tentativa de resolver o nome automaticamente via `GetListaVendedores`, porque esse endpoint busca por texto/status, não por código exato, e inventar uma correspondência arriscaria mostrar o vendedor errado. O cliente sobrescrito, ao contrário, mantém o nome: `ClienteNome` já está disponível na própria linha da lista (`ListaDAVs`) no momento em que o operador seleciona o DAV, antes de chamar `GetDav` — o Checkout carrega esse nome do estado local da listagem, pareado ao `clienteCodigo` que `GetDav` confirma.
**Reason:** Achado de contrato da fase Design da feature 006 (`/speckit-plan`, `specs/006-importacao-dav/research.md`) — impacto é só de exibição (o valor efetivamente gravado na venda é sempre `vendedorCodigo`, nunca o nome), não afeta a corretude fiscal/de preço da importação.
**Trade-off:** Vendedor importado aparece sem nome até o operador interagir com o modal — aceito, porque é preferível a inventar uma correspondência não garantida ou tentar buscar por texto usando o código como termo.
**Impact:** `.specs/features/selecao-vendedor/spec.md` (Edge Cases — trecho "VendedorCodigo/VendedorNome na resposta de ListaDAVs" corrigido no ponto, não anexado ao final). `specs/006-importacao-dav/` (`research.md`, `data-model.md`, `plan.md`) documentam o fallback. Nenhum item novo em `.specs/project/PENDENCIES.md` — resolvido por decisão de design desta fase, não pendência aguardando o ERP.

---

### AD-096: `CheckoutFaturarNFCe.produtos` (retorno de `GetDav`/`CarregarNFCe`) não traz descrição do produto — resolvido por busca best-effort via `GetProduto` (2026-08-26)

**Decision:** `CheckoutFaturarNFCe.produtos_produtosItem` (schema usado tanto por `GetDav` quanto por `CarregarNFCe`, AD-057) tem `codigoProduto, quantidade, precoUnitario, DescontoPercentual, DescontoValor, UDM, ValorBruto, ValorTotal` — sem nenhum campo de descrição/nome do produto, ao contrário de `SDTCheckout_GetProduto` (retorno de `GetProduto`, usado pela inserção manual, `.specs/features/carrinho-produto-precificacao/spec.md`), que tem `Descricao`. Sem esse campo, uma linha de carrinho importada de um DAV não teria nome de produto para exibir. Decisão de design: ao importar, o Checkout dispara, em paralelo, uma chamada `GetProduto` **por `codigoProduto` distinto** do documento importado — só para capturar `Descricao` (e conferir `UDM`) para exibição, nunca para sobrescrever `precoUnitario`/`quantidade`/`DescontoValor`, que continuam vindo exclusivamente do DAV (preço congelado, AD-057/AD-067 continuam valendo). Mesmo padrão de N chamadas paralelas por SKU distinto já usado pela feature 005 na troca de cliente (`specs/005-identificacao-cadastro-cliente/plan.md`, Performance Goals).
**Reason:** Achado de contrato da fase Design da feature 006 — sem esse dado, a UI do carrinho importado ficaria com linhas sem nome de produto, inaceitável para revisão pelo operador antes de finalizar (`FR-002`/`SC-001` da spec).
**Trade-off:** Import de um DAV com N SKUs distintos dispara N chamadas `GetProduto` extras (custo aceitável, mesma ordem de grandeza da troca de cliente da feature 005 — dezenas, não milhares, por venda de PDV). Se uma dessas chamadas falhar para um SKU específico, a linha permanece importada e congelada, exibida com `codigoProduto` no lugar da descrição — falha isolada não bloqueia a importação do restante do documento.
**Impact:** `specs/006-importacao-dav/data-model.md` e `contracts/importacao-domain-api.md` documentam o mecanismo. Reaproveitado sem alteração pela feature 011 (recuperação de NFCe) quando sua fase Design ocorrer, já que `CarregarNFCe` retorna o mesmo shape. Nenhum item novo em `.specs/project/PENDENCIES.md` — resolvido por decisão de design.

---

### AD-097: Não existe endpoint de formas/condições de pagamento — o catálogo vem de `GetSessao` (2026-08-26)

**Decision:** As condições e formas de pagamento **não** têm endpoint próprio no contrato do ERP. Elas chegam embutidas no payload de sessão, em `SessaoUsuario.CondicoesDePagamento[]` (`ApiCentriumOAuth.yaml`, linhas 865-938, nível `x-gx-level: "SessaoUsuario"`), consumido pelo Checkout através de `GET /api/bootstrap` (BFF, AD-022). A camada de acesso é um hook TanStack Query sobre `/api/bootstrap` com `staleTime` de 30 minutos — o número que `PAY-01` já fixava. O Dexie continua sendo a persistência do bootstrap (feature 002), mas não é a fonte de frescor: `staleTime` é semântica de cache de servidor, não de armazenamento local.
**Reason:** Achado de contrato da fase Design da feature 008. A varredura completa do yaml não encontra nenhum path do tipo `/GetFormasPagamento` ou `/GetCondicoesPagamento` — os únicos endpoints de pagamento são `ValidaTicketDevolucao`, `GerarPIX`, `StatusPIX` e `FaturarNFCe`. A redação anterior de `PAY-01` ("buscar formas/condições via TanStack Query") descrevia o mecanismo de cache correto sem nomear a origem, o que poderia levar a implementação a inventar um endpoint inexistente.
**Trade-off:** Nenhum. O dado já chega no bootstrap que a feature 002 busca de qualquer forma — a mudança é de redação, não de comportamento.
**Impact:** Corrige in-place `PAY-01` em `.specs/features/pagamento-geral/spec.md` (AC1 e Requirement Traceability). Documentado em `specs/008-pagamento-geral/research.md` (D1) e `contracts/erp-pagamento-api.md` (§1). Nenhum item novo em `.specs/project/PENDENCIES.md`.

---

### AD-098: Rateio do desconto de capa — divisão igual com clamp e redistribuição (2026-08-26)

**Decision:** O desconto de capa é dividido **igualmente** entre os itens ativos da venda, com o resto de centavo pelo método do maior resto (AD-072), acrescido de **clamp e redistribuição**: toda linha cuja parcela exceda seu próprio total líquido tem a parcela fixada nesse teto e sai do conjunto elegível, e o excedente acumulado é redividido igualmente entre as linhas restantes, repetindo até não haver mais estouro. Uma guarda de entrada exige `descontoCapa <= subtotal da venda` (acima disso a aplicação é bloqueada com toast), o que é o que garante a terminação do laço. Invariantes verificadas por teste: `Σ parcelas === descontoCapa` e `parcela_i <= totalLiquido_i` para toda linha. O rateio é materializado **apenas na montagem do payload** de `FaturarNFCe`; no estado, o desconto de capa continua sendo um valor único e removível.
**Reason:** Decisão direta do usuário (2026-08-26), na fase Design da feature 008. A alternativa **proporcional ao valor da linha** foi apresentada como recomendação — é o padrão fiscal de rateio de desconto de capa em NF-e e dispensa clamp — mas o usuário optou pela divisão igual, que é a redação literal de `PAY-10` AC3. O clamp é a adição mínima que impede o modo de falha real: com 3 itens de `70,00 / 29,00 / 1,00` e desconto de `10,00`, a divisão igual ingênua daria `3,34 / 3,33 / 3,33` e deixaria a terceira linha com `ValorTotal = -2,33`, rejeitada pela SEFAZ. Com clamp, o resultado é `4,50 / 4,50 / 1,00`.
**Trade-off:** Implementação iterativa (laço de redistribuição) em vez de um cálculo de passada única, e a divisão igual concentra proporcionalmente mais desconto nos itens baratos que a alternativa proporcional — aceito deliberadamente pelo usuário em favor da fidelidade à redação de `PAY-10`.
**Impact:** Formaliza `PAY-10` AC3 em `.specs/features/pagamento-geral/spec.md`, reescrito in-place. Algoritmo completo em `specs/008-pagamento-geral/data-model.md` (§5) e contrato em `contracts/pagamento-domain-api.md` (`ratearDescontoCapa`). Reusa `distribuirPorMaiorResto` da feature 003 (AD-072), sem reimplementar o método do maior resto.

---

### AD-099: `ValidaTicketDevolucaoOutput` **tem** o campo `Valido` — corrige AD-023 e abre o item 32 (2026-08-26; corrigido em 2026-08-27 pela AD-101 — o fallback para `Mensagem` definido aqui como obrigatório foi confirmado desnecessário e removido, item 32 resolvido)

**Decision:** ⚠️ **Superado em 2026-08-27 por AD-101 — leia lá antes de implementar.** Redação original (2026-08-26): a validade do ticket devolução era decidida usando `resposta.Valido` quando o campo viesse presente, com fallback para a comparação `resposta.Mensagem === 'Ticket Válido'` quando ausente/`undefined`; o valor aplicado é sempre `ValorTicket`. O fallback era tratado como **obrigatório** e vedado de remoção enquanto o item 32 de `.specs/project/PENDENCIES.md` estivesse aberto — item que a AD-101 resolve, eliminando o fallback.
**Reason:** Achado de contrato da fase Design da feature 008, resolvido por decisão direta do usuário. Há contradição real entre as fontes: `ApiCentriumOAuth.yaml` (linhas 668-676) declara `ValidaTicketDevolucaoOutput` com **três** campos — `ValorTicket`, `Valido: boolean` e `Mensagem: string` — enquanto **AD-023 afirmava que "não existe campo booleano de validade"** e fixava a comparação de `Mensagem` ao literal, a partir de inspeção da KB (`PCheckout_ValidaTicketDevolucao` → `PValidaTicketNfCe.Call`). As duas leituras são compatíveis se o campo existir no contrato mas não for preenchido pelo procedure — daí o fallback. As alternativas "só `Mensagem`" (frágil a mudança de texto, inclusive acentuação) e "exigir os dois (AND)" (bloqueia a operação se o ERP preencher só um) foram apresentadas e rejeitadas.
**Trade-off:** Dois caminhos de decisão em vez de um, ambos cobertos por teste, até o ERP confirmar o comportamento real do campo. **Superado por AD-101 (2026-08-27):** a confirmação chegou por inspeção direta da KB, não pela equipe do ERP; o segundo caminho (fallback) foi removido.
**Impact:** **Corrige AD-023 in-place** (a afirmação "não existe campo booleano de validade" está superada — ver acima) e reescreve `PAY-05` em `.specs/features/pagamento-geral/spec.md`. Abre o **item 32** em `.specs/project/PENDENCIES.md` (seção 1, não-bloqueante): confirmar com a equipe do ERP se `PCheckout_ValidaTicketDevolucao` efetivamente preenche `Valido`. Documentado em `specs/008-pagamento-geral/research.md` (D9) e `contracts/erp-pagamento-api.md` (§2). **Item 32 resolvido em 2026-08-27 pela AD-101** — ver lá para o impacto atualizado em cada arquivo.

---

### AD-100: Dados do pagador em `GerarPIX` — cliente identificado, ou o cliente default da venda (2026-08-27)

**Decision:** Ao chamar `POST /GerarPIX`, os campos `TrnPagadorNome`/`TrnPagadorCgc` do `SDTCentriumPag_Post` recebem `nome`/`documento` do cliente **atual** da venda (`ClienteVenda`, feature 005) — o cliente identificado explicitamente pelo operador, ou, na ausência de seleção explícita, o cliente default da empresa (a mesma fonte já pré-selecionada desde o início da venda por AD-032; nunca um valor vazio "sem cliente"). Quando o cliente atual tem `documento = null` (só ocorre para `origem = 'DEFAULT'`, já que `GetSessao` não devolve CPF/CNPJ do cliente default), `TrnPagadorCgc` é enviado como string vazia. `TrnPagadorEmail`/`TrnPagadorFone` são enviados vazios nesta versão — o snapshot `ClienteVenda` (feature 005) não retém e-mail/celular, nem para clientes de origem `CADASTRO_SIMPLIFICADO` (que os capturam no formulário mas não os persistem no estado da venda).
**Reason:** Decisão direta do usuário (2026-08-27, fase Design da feature 009, via pergunta direta) — "preencher com o cliente identificado, sem cliente identificado (ou seja, só o cliente default), os dados a serem enviados são os do cliente Default".
**Trade-off:** `TrnPagadorEmail`/`TrnPagadorFone` ficam sistematicamente vazios até que a feature 005 seja estendida para reter e-mail/celular no snapshot da venda — gap aceito, não depende do ERP, então não abre item em `PENDENCIES.md`.
**Impact:** Atualiza `.specs/features/pagamento-pix/spec.md` (Edge Cases — dados do pagador). Documentado em `specs/009-pagamento-pix/research.md` (D7) e `contracts/erp-pix-api.md` (§1).

---

### AD-101: `PCheckout_ValidaTicketDevolucao` confirma preenchimento de `Valido` — resolve o item 32, corrige AD-099 (2026-08-27)

**Decision:** `interpretarRespostaTicket` usa **apenas** `resposta.Valido` para decidir a validade do ticket devolução — o fallback para a comparação `Mensagem === 'Ticket Válido'`, introduzido por AD-099 como medida defensiva, é **removido**. O valor aplicado continua sendo sempre `ValorTicket`.
**Reason:** Nova inspeção direta do código-fonte real de `PCheckout_ValidaTicketDevolucao` na KB do GeneXus (`CentriumDEVU6`, via MCP) — diferente da inspeção de AD-023 (2026-08-21), que só tinha olhado a comparação de `Mensagem` dentro de `PValidaTicketNfCe.Call` sem notar a atribuição de `&Valido` no procedure chamador. O código completo do procedure é:
```
PValidaTicketNfCe.Call(&Empresa, 0, '', 'validar', &ticketDevolucao, &ValorTicket, &retorno, &msgPadrao)

if &retorno = 0
	&Mensagem = &msgPadrao
	&Valido = false
else
	&Mensagem = 'Ticket Válido'
	&Valido = true
endif
```
`&Valido` é atribuído explicitamente nos dois ramos (`if`/`else`) — nunca fica indefinido. O campo é preenchido de fato, encerrando a dúvida do item 32 sem depender de resposta da equipe do ERP, seguindo o mesmo padrão de resolução por KB já usado em AD-076/AD-078/AD-088.
**Trade-off:** Nenhum — remover o fallback simplifica `interpretarRespostaTicket` para um único caminho de decisão, sem perda de robustez (o campo é garantidamente preenchido pelo procedure).
**Impact:** Corrige AD-099 e o achado original de AD-023 in-place (ambos com marcação no início do parágrafo apontando para esta AD). Fecha o **item 32** em `.specs/project/PENDENCIES.md` — removido da tabela de pendências, nota adicionada em Notas. Atualiza `PAY-05` em `.specs/features/pagamento-geral/spec.md` (Acceptance Criteria e Requirement Traceability, de "Verified com pendência" para Verified). Atualiza `specs/008-pagamento-geral/research.md` (D9), `contracts/erp-pagamento-api.md` (§2), `contracts/pagamento-domain-api.md`, `data-model.md`, `quickstart.md` (Cenário 5) e `plan.md`, todos removendo a referência ao fallback. Atualiza `.specs/codebase/CONCERNS.md` (achado original de elegibilidade).

---

### AD-102: Literais reais de `StatusTransacao` (`StatusPIXOutput`) confirmados diretamente pelo usuário — resolve o item 33, corrige a leitura parcial de AD-100/D8 (2026-08-27)

**Decision:** `StatusPIXOutput.StatusTransacao` (domain `VARCHAR(1)`) tem exatamente dez literais possíveis:

| Literal | Significado | Situação para o Checkout |
|---|---|---|
| `'C'` | Criada | Pendente |
| `'A'` | Aberta | Pendente |
| `'G'` | Aguardando Pagamento | Pendente |
| `'P'` | Pagamento Recebido | **Aprovado** |
| `'M'` | Pagamento Liberado Manualmente | **Aprovado** |
| `'X'` | Expirada | Falha terminal |
| `'R'` | Recusada | Falha terminal |
| `'E'` | Erro | Falha terminal |
| `'F'` | Fechada | Falha terminal |
| `'O'` | Removido Associação PIX | Falha terminal |

`'P'` e `'M'` SHALL ser tratados de forma idêntica pelo Checkout — ambos indicam que o pagamento PIX foi recebido e o checkout pode dar continuidade (registrar o pagamento, prosseguir para finalização). Os cinco literais de falha terminal (`'X'`/`'R'`/`'E'`/`'F'`/`'O'`) SHALL reaproveitar o mesmo fluxo de UX já decidido para fechamento manual do modal PIX (AD-040) — aviso de desassociação manual, remoção do pagamento local, nenhuma chamada de cancelamento — nunca um segundo mecanismo de estado.
**Reason:** Decisão direta do usuário (2026-08-27), fornecendo a lista completa e definitiva. Corrige a fase inicial de Design da feature 009 (mais cedo no mesmo dia), que havia confirmado só cinco *nomes* de estado (`Aguardando`, `PagamentoRecebido`, `Expirada`, `Recusada`, `Erro`, mais o literal `'G'`) lendo o código-fonte do ERP via KB GeneXus — alta confiança nos nomes, mas sem os literais exatos, e sem visibilidade de quatro estados adicionais (`'C'`, `'A'`, `'F'`, `'O'`) que a busca na KB não havia revelado.
**Trade-off:** Nenhum — a lista fornecida é definitiva; a fronteira Zod continua aceitando qualquer `string` (não uma união fechada), com `interpretarStatusPix` mantendo um ramo `default`/`DESCONHECIDO` como guarda defensiva permanente contra um literal futuro ainda não documentado (Constitution IV).
**Impact:** Fecha o **item 33** em `.specs/project/PENDENCIES.md` — removido da tabela de pendências. Corrige in-place `specs/009-pagamento-pix/research.md` (D8, D9), `data-model.md` (§2, invariante J2), `contracts/erp-pix-api.md` (§2) e `plan.md` (Summary, Constitution Check, Testing, Project Structure). Atualiza `.specs/features/pagamento-pix/spec.md` (Edge Cases — interpretação de `StatusTransacao`) e `quickstart.md` (Cenários 1 e 4, literais reais nos mocks).

---

### AD-103: Filtro "Ativo" removido do modal de busca de vendedor — não existe campo de status no contrato (2026-08-27)

**Decision:** Corrige o ponto 3 de AD-053 para o modal de vendedor: o filtro "Ativo" **não** será implementado na busca de vendedor (`GetListaVendedores`). O modal não exibe esse chip/filtro, e `FR-002`/`FR-003` (`.specs/features/selecao-vendedor/spec.md`) deixam de exigir filtro/restrição por status.

**Reason:** Achado da fase Design da feature 012 (`/speckit-plan`, `specs/012-selecao-vendedor/research.md`): inspeção direta de `Fluxograma - Diagrama - Alinhamentos/ApiCentriumOAuth.yaml` confirma que `GetListaVendedores` aceita somente `Empresa`, `Txtbusca`, `Pagina`, `Tamanhopagina` (sem parâmetro de status) e que `CheckoutListaVendedores.Vendedores_Vendedores` (item de resposta) só tem `VendedorCodigo`, `VendedorNome`, `VendedorCGC`, `VendedorFone` — nenhum campo `Ativo`/`Status`. Mesmo achado já confirmado para `GetListaClientes`/`GetCliente` em AD-093 — AD-053 (ponto 3) já registrava essa verificação como pendente especificamente para o modal de vendedor até esta fase Design.

**Trade-off:** A busca de vendedor pode listar vendedores inativos junto dos ativos, sem indicação visual de status — aceito deliberadamente, mesma decisão já tomada para cliente em AD-093.

**Impact:** `.specs/features/selecao-vendedor/spec.md` (UI Design — linhas "Filtro adicional" e "Colunas da tabela" corrigidas, a segunda removendo também o "subtítulo de função" sem campo correspondente no contrato; Acceptance Criteria 3 e 8 corrigidas no ponto, não por nota anexada — ver `docs/agents/domain.md`; Requirement Traceability — VEND-03/VEND-08 corrigidos). `specs/012-selecao-vendedor/spec.md` (FR-002/FR-003 removidos/corrigidos no ponto; Edge Cases — filtro padrão corrigido). AD-053 acima (ponto 3, ressalva adicionada). Nenhum item novo em `.specs/project/PENDENCIES.md` — resolvido por decisão de design (remoção de escopo), não pendência aguardando o ERP.

---

### AD-104: Cenários de pagamento (venda rápida F6–F9) vêm embutidos em `SessaoUsuario.CenarioPagamento` — não existe endpoint dedicado (2026-08-31)

**Decision:** O catálogo de cenários de pagamento que alimenta a venda rápida por teclas F6–F9 é lido exclusivamente do campo `SessaoUsuario.CenarioPagamento`, entregue no payload de bootstrap já existente (`GET /api/bootstrap` → `GET /ApiCentriumOAuth/GetSessao`). O campo é declarado apenas como `string` no contrato e contém, por dentro, um **array JSON de strings**, cada uma com **7 campos posicionais separados por `;`** na ordem `CPgFpgCod;CPgFpgDes;CPgPraCod;CPgPraDes;CPgNome;CPgIsEncerraOperacao;CPgTeclaAtalho`. Nenhuma chamada nova ao ERP é introduzida pela feature 013.

**Reason:** Inspeção direta da KB GeneXus (`CentriumDEVU6`) via MCP nesta data: `PCheckout_GetSessao` percorre `TCenarioPagamento` (`Order CPgEmpCod CPgFpgCod`), concatena os sete campos com `';'`, acumula numa coleção e atribui `&CenarioPagamento.ToJson()` ao campo da sessão. `ApiCentriumOAuth.yaml` versão `20260827192357`, linha 903, declara `CenarioPagamento: {type: string}`. Não existe path de cenários no contrato. Mesmo padrão já registrado em AD-097 para formas/condições de pagamento — reconhecê-lo evita que a implementação invente um endpoint inexistente.

**Trade-off:** A estrutura interna não é validada pelo contrato OpenAPI, o que transfere integralmente ao Checkout a responsabilidade de validação de fronteira (Constitution IV). A procedure `PCenarioPagamento_BuscaPorTeclaAtalho`, usada pelo PDV atual para resolver a tecla no servidor, foi descartada por não estar exposta na API REST e por exigir uma ida ao servidor por tecla pressionada.

**Impact:** `specs/013-venda-rapida-cenario-pagamento/` (`spec.md` — Contexto e `FR-001`; `research.md` D1–D2; `contracts/erp-cenario-pagamento-api.md`; `plan.md`). `.specs/features/autenticacao-sessao-bootstrap/spec.md` (payload do bootstrap passa a incluir o campo). `.specs/features/pagamento-geral/spec.md` (referência cruzada à feature 013). Nenhum item novo em `PENDENCIES.md` por este AD.

---

### AD-105: Item de `CenarioPagamento` com número de campos diferente de 7 é descartado, sem heurística de recuperação (2026-08-31)

**Decision:** No parse de `SessaoUsuario.CenarioPagamento`, um item cujo `split(';')` não produza **exatamente 7 partes** é descartado silenciosamente, sem erro ao operador e sem interromper o processamento dos demais itens. Nenhuma tentativa de reconstrução por ancoragem de cauda ou por truncamento é feita.

**Reason:** Três dos sete campos — `CPgFpgDes` (VARCHAR 16), `CPgPraDes` (VARCHAR 128) e `CPgNome` (VARCHAR 60) — são texto livre digitado no cadastro do ERP e podem conter o próprio separador `;`. Como os três ficam **no meio** da sequência (índices 1, 3 e 4), um item com 8 partes é genuinamente ambíguo: não há como determinar qual campo recebeu o separador extra e, portanto, não há como localizar com certeza o código da condição de pagamento.

**Garantia do ERP (2026-08-31, decisão direta do usuário — fecha o ponto):** serialização estruturada **não é viável** no ERP, e o formato delimitado por `;` é definitivo; em contrapartida, fica garantido que os campos de texto do cadastro de cenários **não conterão o separador `;`**. Portanto a ambiguidade descrita acima não deve ocorrer na prática, e o descarte por contagem de campos **permanece implementado como defesa** contra dado inesperado — não como tratamento de um caso esperado. Não há pendência aberta com o ERP neste ponto (item 34 de `PENDENCIES.md` removido na mesma data).

**Trade-off:** Caso um `;` chegue apesar da garantia, o cenário afetado perde o atalho até o cadastro ser corrigido. Aceito deliberadamente: numa feature que lança pagamento e pode finalizar a venda sozinha, um parse "provavelmente certo" é pior que nenhum atalho — descartar produz a ausência visível de um botão, adivinhar produz um pagamento na condição errada. A alternativa de ancorar pelos campos estruturados (primeiro e dois últimos) foi rejeitada por deixar `CPgPraCod` ambíguo exatamente no caso em que `CPgFpgDes` contém o separador.

**Impact:** `specs/013-venda-rapida-cenario-pagamento/` (`FR-004`; `research.md` D3; `data-model.md` E2/I3; `contracts/erp-cenario-pagamento-api.md`). Nenhum item aberto em `.specs/project/PENDENCIES.md`.

---

### AD-106: `CPgIsEncerraOperacao` interpretado por conjunto fechado de literais, com `false` como padrão fail-safe (2026-08-31)

**Decision:** O campo de encerramento automático da venda rápida é interpretado como verdadeiro **apenas** para os literais `true`, `1`, `s`, `sim`, `y`, `yes` (comparação sem distinção de caixa, após `trim`). Qualquer outro valor — incluindo string vazia e valores inesperados — é tratado como **falso**, ou seja, o cenário lança o pagamento mas **não** finaliza a venda.

**Reason:** `CPgIsEncerraOperacao` é `Boolean` em `TCenarioPagamento` e chega ao campo de sessão via `.ToString()`, cuja representação exata depende do gerador da KB (`True`, `true` e `1` são todas plausíveis). A KB não permite determinar o literal sem observar uma resposta real do endpoint — e presumir seria adivinhar num ponto de alto impacto. **Confirmado como solução definitiva em 2026-08-31 (decisão direta do usuário):** aceitar um conjunto de literais é a abordagem escolhida, não uma tolerância provisória à espera do literal exato — não há confirmação pendente com o ERP e o conjunto **não** será estreitado depois (item 35 de `PENDENCIES.md` removido na mesma data).

**Trade-off:** A assimetria é deliberada, pelo princípio de menor dano: interpretar erroneamente como **falso** custa ao operador um clique a mais em "Finalizar Venda"; interpretar erroneamente como **verdadeiro** finaliza uma venda que o operador não mandou finalizar — e finalização emite NFCe, que o Checkout não consegue reverter. Por isso a regra rejeitada foi "qualquer valor não vazio é verdadeiro", que transformaria um literal `False` em `true`.

**Impact:** `specs/013-venda-rapida-cenario-pagamento/` (`FR-018`; `research.md` D4; `data-model.md` I11; `contracts/erp-cenario-pagamento-api.md`). Nenhum item aberto em `.specs/project/PENDENCIES.md`.

### AD-107: A remoção de `DavNum` de `CheckoutFaturarNFCe` não afeta a feature 006 — o ERP identifica sozinho que a NFCe faturada veio de um DAV (2026-08-31)

**Decision:** O Checkout **não** informa ao ERP o DAV de origem da NFCe em nenhum ponto do fluxo de importação (feature 006). O próprio ERP identifica, ao faturar, que aquela NFCe nasceu de um DAV. Consequentemente: o campo `DavNum` — removido de `CheckoutFaturarNFCe` no contrato `20260827192357` — **não** deve ser preservado, modelado nem reenviado; `VendaImportada` não tem `davNum`, e `mapearVendaExistente` preserva apenas `NumeroNota`.
**Reason:** Confirmação direta do usuário (2026-08-31), respondendo ao achado colateral levantado no Design da feature 013 (item 36 de `PENDENCIES.md`), que classificava a remoção de `DavNum` como **bloqueante** para a 006. Não é bloqueio: é a mesma mecânica já estabelecida em AD-058 — o vínculo DAV ↔ NFCe é interno ao ERP, criado a partir do rascunho gerado por `GetDav` (AD-057), e não depende de nenhum campo enviado pelo Checkout. A remoção do campo do contrato apenas elimina uma redundância que o Checkout nunca precisou preencher.
**Trade-off:** Nenhum identificado. Perde-se a possibilidade de o Checkout auditar localmente qual DAV originou a NFCe — irrelevante, já que a trilha de auditoria própria (feature 001) registra o evento `DAV_IMPORTADO` com o número do DAV selecionado, independentemente do payload de faturamento.
**Impact:** Fecha a sub-pendência `DavNum` do item 36 de `.specs/project/PENDENCIES.md` (as outras quatro seguiam abertas naquele momento; hoje são três — `ListaPrecoDefault` saiu do item em AD-108) e **desbloqueia a feature 006**. Remove `davNum`/`DavNum` de `specs/006-importacao-dav/` (`data-model.md`, `contracts/erp-dav-api.md`, `contracts/importacao-domain-api.md`, `plan.md`) e de `specs/011-recuperacao-nfce/contracts/erp-recuperacao-api.md`. **Consequência registrada na revisão de impacto (2026-08-31):** `NumeroNota` passa a ser o **único** elo com o DAV de origem — deve ser reenviado intacto em `FaturarNFCe`, e sua ausência é erro de contrato, não dado opcional; registrado como decisão D8 em `specs/006-importacao-dav/research.md` e verificado no Cenário 3 do `quickstart.md`. Reforça, sem alterar, AD-057 e AD-058.

---

### AD-108: Cliente default usa `SessaoUsuario.ListaPrecoDefault` como lista de preço e não tem desconto de convênio — resolve o item 31 e corrige AD-094 (2026-08-31)

**Decision:** Quando a venda corre com o **cliente default** (`origem = 'DEFAULT'`, pré-selecionado por AD-032, sem o operador abrir o modal de busca), o Checkout:

1. **não** chama `GetCliente` para esse cliente — nem tenta resolvê-lo por nome, código ou qualquer heurística;
2. usa `SessaoUsuario.ListaPrecoDefault` (`GetSessao`, contrato `20260827192357`) como a lista de preço dele — é esse o valor enviado no parâmetro `Listapreco` de `GetProduto` quando `TipoPreco = 9`;
3. trata o desconto de convênio como **inexistente** para esse cliente: `descontoConvenio = 0`, sem nenhum fator de convênio aplicado à venda.

Com isso, `ClienteVenda` de origem `DEFAULT` deixa de ter campos "indisponíveis": `listaPreco` e `descontoConvenio` passam a ser **valores conhecidos** (`ListaPrecoDefault` e `0`), não `null`. Continua `null` apenas `documento` — `GetSessao` não devolve CPF/CNPJ do cliente default, o que **não muda** AD-100 (que já envia `TrnPagadorCgc` vazio nesse caso).

**Reason:** Decisão direta do usuário (2026-08-31). O contrato `20260827192357` acrescentou `ListaPrecoDefault` (`integer`/`int64`) ao schema `SessaoUsuario`, populado por `PCheckout_GetSessao` a partir do `CliListCod` do cliente default (com fallback `1`) — achado colateral levantado no Design da feature 013 e registrado no item 36 de `PENDENCIES.md`. Esse campo entrega exatamente o dado que faltava, sem nenhuma chamada de rede extra; e a regra de negócio de que o cliente default não tem convênio elimina a segunda metade da lacuna. Juntos, os dois pontos resolvem a pendência inteira sem depender de mudança nova no ERP.

**Trade-off:** O Checkout passa a confiar na lista publicada pela sessão em vez de reler o cadastro do cliente. Se o cadastro do cliente default trocar de lista durante a sessão, o Checkout só verá a mudança no próximo bootstrap — aceito, é o mesmo ciclo de vida de todos os demais campos de `SessaoUsuario`. E um cliente default que **tenha** convênio cadastrado no ERP terá esse convênio ignorado enquanto for usado como default: é a regra de negócio decidida, não um efeito colateral. Selecionar explicitamente o mesmo cliente pelo modal continua trazendo o cadastro completo por `GetCliente` (aí com convênio, se houver) — os dois caminhos podem produzir preços diferentes para o mesmo cliente, e isso é intencional.

**Impact:** **Fecha o item 31** de `.specs/project/PENDENCIES.md` e a sub-pendência `ListaPrecoDefault` do **item 36** (restam três mudanças abertas nesse item). **Corrige AD-094 no ponto** — aquela AD deixa de ser pendência bloqueante. **Não contradiz AD-092**: continua não existindo "lista de preço padrão da empresa"; `ListaPrecoDefault` é a lista **do cliente default**, entregue pela sessão em vez de por `GetCliente`. Atualiza `.specs/features/identificacao-cadastro-cliente/spec.md` e `.specs/features/carrinho-produto-precificacao/spec.md` (Edge Cases), `.specs/codebase/CONCERNS.md` e AD-025 acima, e os artefatos de Design das features 005 (`research.md` D3/D10 e achados, `data-model.md`, `plan.md`, `quickstart.md`, `spec.md`, `contracts/erp-cliente-api.md`), 003 (`research.md` D9/D10 e achados, `contracts/erp-produto-api.md`, `quickstart.md`) e 013 (`research.md`, `plan.md`).

---

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
- [x] ~~Alinhar com a equipe do ERP as 12 dúvidas operacionais sobre endpoints registradas originalmente em `ARCHITECTURE.md` seção 7 (2026-07-23)~~ — **Atualizado (2026-08-20)**: itens 3 (`ValidaTicketDevolucao`), 4 (`SuspenderOuFaturar`) e 6 (`GetPDFNota` — sem reimpressão) resolvidos. Itens 2 (`TipoPreco`/`ListaPreco`) e 8 (classificação de forma de pagamento) parcialmente resolvidos. **Correção (2026-08-21):** itens 1 (`GetListaClientes`) e 5 (`ListaNFCEs`, mas não `CarregarNFCe` — esse existe no contrato) rebaixados de volta a pendência — revisão cruzada da documentação encontrou que esses dois nomes não existem em `ApiCentriumOAuth.yaml`, apesar de terem sido registrados como "resolvidos" em conversa com o ERP; ver `.specs/codebase/CONCERNS.md`.
- [x] ~~Alinhar com a equipe do ERP as dúvidas operacionais ainda em aberto~~ — **Atualizado (2026-08-21, AD-023):** `DescontoConvenio` (percentual), classificação de forma de pagamento (`FormaMeioPagtoNFe`), estorno de TEF, origem do `NumeroNota` e validação de IBGE resolvidos (contrato + KB GenExus + resposta direta do usuário). Seguem em aberto, agora rastreados por feature: `TipoPreco`/`ListaPreco` fora do valor `0` (conceitos distintos, ainda sem enum) e `QtdMinCharParaConsulta`/"produto editável ao dar TAB" → `.specs/features/carrinho-produto-precificacao/spec.md`; formato de código de barras pesável → idem; contrato de `GetStatusSistema` (forma confirmada, semântica dos códigos ainda não) e modelo de impressão pós-autorização → `.specs/features/finalizacao-suspensao-venda/spec.md`.
- [x] ~~Analisar bloqueios de edição pós-pagamento~~ (2026-08-20) — ver `.specs/features/carrinho-produto-precificacao/spec.md`, requisito `CART-09`. **Resolvido (2026-08-24, AD-030):** qualquer pagamento aprovado bloqueia edição/cancelamento de item; se o pagamento for TEF ou PIX, o bloqueio é permanente (sem fluxo de cancelamento dessas transações); se for cartão manual fora do TEF ou dinheiro, a remoção do pagamento é permitida e reabilita a edição.
- [x] ~~Confirmar validação de saldo/estoque na inserção de produto~~ (2026-08-20) — ver `.specs/features/carrinho-produto-precificacao/spec.md`, requisito `CART-10`. **Resolvido (2026-08-24, AD-030):** o Checkout não implementa nenhuma validação de saldo/estoque na inserção de produto — é regra de controle exclusiva do ERP.
- [ ] Confirmar com a equipe do ERP o endpoint/mecanismo de "marcar DAV como importado/em faturamento" — **Atualizado (2026-08-21, AD-024):** confirmado via KB que não é só nomenclatura — não existe hoje nenhum caminho de código que escreva em `DavDocFNum`/status do DAV a partir do Checkout; é mudança de KB do ERP a ser priorizada, não resposta simples. Ver `.specs/features/importacao-dav/spec.md` (Edge Cases).
- [ ] Confirmar com a equipe do ERP a semântica dos códigos de retorno de `GetStatusSistema` (`CadStatus`) — **Atualizado (2026-08-21, AD-024):** confirmado que o próprio ERP não documenta esses códigos na KB (`Documentation`/`Help` vazios); não é recuperável por inspeção de KB, só por conversa direta. Ver `.specs/features/finalizacao-suspensao-venda/spec.md` (Edge Cases).
- [ ] Confirmar com a equipe do ERP o formato de código de barras pesável (`ProdutoPesavel`/`DavMatProdPes`) — **Atualizado (2026-08-21, AD-024):** achado adicional (o `Default('E')` de `wManutencaoImplantacaoProdutos` está comentado/inativo) não muda a conclusão de AD-023: segue sem lógica de parse localizável via KB. **Detecção (13 dígitos, prefixo `2`) resolvida em 2026-08-24 (AD-028); parse fino dos dígitos internos reaberto como pendência bloqueante em 2026-08-26 (AD-068, item 29 de `.specs/project/PENDENCIES.md`).** Ver `.specs/features/carrinho-produto-precificacao/spec.md` (Edge Cases).
- [x] ~~Confirmar com a equipe do ERP/produto se o Checkout pode inferir `usaPrecoPorQuantidade` localmente a partir de `QtdMinimaPreco2 > 0`, já que nenhum flag equivalente existe no contrato ou na KB (2026-08-21, AD-024)~~ — **Resolvido (2026-08-24, AD-025):** não é inferência — `SessaoUsuario.TipoPreco = 8` é o sinal oficial de preço por faixa de quantidade, confirmado por regra de negócio direta do usuário. Ver `.specs/features/carrinho-produto-precificacao/spec.md` (Edge Cases).
- [ ] **Definir protocolo/timeout do TEF** (2026-08-25, AD-037) — bloqueio deliberado: parceiro de TEF será trocado, não vale desenhar contrato para o parceiro atual. Ver `.specs/features/pagamento-tef/spec.md`.
- [x] ~~Confirmar com a equipe do ERP o contrato técnico completo do serviço de impressão local~~ — **resolvido (2026-08-26, AD-083):** usuário forneceu o `Impressao.js` real do PDV atual — host/porta vem de `CadMaqHost` (default `127.0.0.1:4545`), `POST` para a raiz do host, `Content-Type: text/plain`, corpo = `XMLImpressao` cru, sem validação de resposta. O indicativo de mecanismo de impressão no `GetSessao` já tinha sido resolvido em AD-082 — campo `TipoImpressao` (`'E'`/`'P'`). Ver `.specs/features/finalizacao-suspensao-venda/spec.md`.
- [ ] Confirmar com a equipe do ERP o timing de chamada de `GetStatusSistema` no fluxo (2026-08-25, AD-051) — distinto da pendência já existente sobre a semântica dos códigos de retorno. Ver `.specs/features/finalizacao-suspensao-venda/spec.md`.
- [ ] Confirmar `UtilizaEncurtador`/`UtilizaLinkExterno` (2026-08-25, AD-047) — assunção de baixa confiança do usuário ("eu acho") de que o endpoint sempre retorna QR base64, sem UI de link. Ver `.specs/features/pagamento-pix/spec.md`.
