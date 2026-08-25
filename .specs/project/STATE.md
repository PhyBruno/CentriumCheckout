# State

**Last Updated:** 2026-08-25
**Current Work:** Sessão de grilling (`.specs/project/DECISIONS.md`) materializada em AD-036 a AD-056 — cobre split de pagamento/troco, desconto manual, TEF/impressão local, PIX (`ConfiguracoesPIX`), recuperação de NFCe (nova feature), suspensão com pagamento aprovado, troca de cliente/vendedor com carrinho populado, isolamento de tenant no Dexie, escopo mobile e defaults de cliente/vendedor. Próximo passo sugerido: fase **Design** da feature `carrinho-produto-precificacao` (ver `.specs/project/ROADMAP.md`)

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
- Elegibilidade de `ValidaTicketDevolucao` — confirmado no KB: não há campo booleano; a elegibilidade é indicada comparando `Mensagem` ao literal fixo `'Ticket Válido'` (`PCheckout_ValidaTicketDevolucao` → `PValidaTicketNfCe.Call`).
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
- **`FaturarNFCe.produtos` — trilha de tier de preço:** confirmado, campo a campo, que o array só tem `sequencial, codigoProduto, quantidade, precoUnitario, DescontoPercentual, DescontoValor, UDM, ValorBruto, ValorTotal` — nenhum campo para registrar a faixa de preço aplicada. Continua exigindo decisão de produto (log só no Checkout vs. expandir contrato).

**Reason:** Esgotar a verificação por KB antes de escalar as pendências remanescentes para contato direto com a equipe do ERP — reduzir ao mínimo o que depende de resposta humana.
**Trade-off:** Nenhum.
**Impact:** `.specs/project/PENDENCIES.md`, `.specs/codebase/CONCERNS.md`, `.specs/features/carrinho-produto-precificacao/spec.md`, `.specs/features/pagamento-geral/spec.md` (`PAY-07`), `.specs/features/selecao-vendedor/spec.md`, `.specs/features/identificacao-cadastro-cliente/spec.md`, `.specs/features/importacao-dav/spec.md` e `.specs/features/finalizacao-suspensao-venda/spec.md` atualizados para refletir.

---

### AD-025: Regra de negócio de `TipoPreco`/`EmpDefPre` confirmada diretamente pelo usuário — corrige AD-023 e resolve `usaPrecoPorQuantidade` (2026-08-24)

**Decision:** Diferente de AD-023/AD-024 (inspeção de contrato/KB), esta correção veio de resposta direta do usuário sobre a regra de negócio do domain `EmpDefPre`. `SessaoUsuario.TipoPreco` (via `PTrazEmpDefP.Call`) vai de `1` a `11` e indica **diretamente o preço de venda a aplicar no item** — não é um espelho 0-based de `ListaPreco` como a hipótese de AD-023 chegou a cogitar. De `1` a `5`, é índice direto para `PrecoVenda1`...`PrecoVenda5`. De `6` a `11` são casos especiais, dos quais dois mapeados:
- `TipoPreco = 9` — preço por lista: aplicar a lista de preço do cadastro do cliente (`ClienteCheckout.ListaPreco`/`CliListCod`); sem lista própria, usar a lista padrão da empresa (`SessaoUsuario.listaPrecoPadrao`). `GetProduto` retorna `SDTCheckout_GetProduto.PrecoVendaLista` preenchido nesse caso.
- `TipoPreco = 8` — preço por faixa de quantidade: resolve a pendência de `usaPrecoPorQuantidade` (AD-024) — **não existe flag booleano separado no contrato**, o próprio valor `8` já é o sinal, substituindo a hipótese de inferir via `QtdMinimaPreco2 > 0`.

Semântica de `6`, `7`, `10` e `11` continua sem confirmação — pendência estreitada, não eliminada.

**Reason:** Fechar a lacuna mais crítica do motor de precificação (`carrinho-produto-precificacao`) antes da fase Design — a ambiguidade anterior bloqueava tanto a UI quanto o cálculo de preço.
**Trade-off:** Nenhum.
**Impact:** `.specs/codebase/CONCERNS.md`, `.specs/project/PENDENCIES.md` (itens 1 e 2) e `.specs/features/carrinho-produto-precificacao/spec.md` (Edge Cases, Acceptance Criteria, Requirement Traceability) atualizados para refletir.

---

### AD-026: Quatro pendências de produto resolvidas por decisão direta do usuário — polling de PIX, campo de cancelamento em `FaturarNFCe`, remoção de campos de crédito, URL do menu gerencial (2026-08-24)

**Decision:** Rodada de respostas diretas do usuário fechando quatro pendências de `.specs/project/PENDENCIES.md` que dependiam de decisão de produto (não de KB/contrato):

1. **Intervalo de polling de `StatusPIX` (item 5):** a cada 10 segundos, sem estratégia de backoff documentada. Ver `.specs/features/pagamento-pix/spec.md` (`PAY-04`, Edge Cases).
2. **Trilha de auditoria de cancelamento em `FaturarNFCe` (item 6) e campo de autoria de cancelamento no SDT de produto (item 21) — mesma decisão resolve as duas:** será adicionado o campo `produtoCancelado` (`boolean`, `NULL` equivale a `false`) ao SDT `CheckoutFaturarNFCe`, indicando que um item foi inserido no carrinho e depois cancelado antes da finalização. O contrato **não** ganha campo dedicado para o tier de preço aplicado por item — a expansão de contrato decidida foi só para marcar cancelamento; rastreabilidade de tier, se necessária no futuro, fica só no lado do Checkout (logs). **Campo ainda não implementado no ERP** — mesmo status "PENDÊNCIA DEV" do item 13 (marcação de DAV importado). Ver `.specs/features/finalizacao-suspensao-venda/spec.md` (story "Finalizar a venda", AC2) e `.specs/features/carrinho-produto-precificacao/spec.md` (Edge Cases).
3. **Campos "Limite de crédito"/"Permite venda a crédito" no cadastro simplificado (item 9):** serão removidos da tela — sem tratamento como somente-leitura, sem expansão de contrato pedida ao ERP. Remoção visual no frame `PDV Online Web - Modal cadastro de cliente` (`design/CentriumCheckout.pen`) ainda não aplicada nesta rodada, só o requisito foi corrigido. Ver `.specs/features/identificacao-cadastro-cliente/spec.md` (Edge Cases).
4. **URL da opção "Relatório de resumo de caixa" no menu gerencial (item 12):** mesmo link da opção "Central de movimentação não fiscal" (`WPMovimentoNaoFiscal_Lancamento.aspx`), apesar da descrição de conteúdo distinta no design. Ver `.specs/codebase/ARCHITECTURE.md` (seção Responsividade).

**Reason:** Fechar pendências de produto que não dependiam de nova inspeção de KB/contrato, só de decisão do usuário — reduzindo o índice de `.specs/project/PENDENCIES.md` antes da fase Design de `carrinho-produto-precificacao`.
**Trade-off:** Nenhum.
**Impact:** `.specs/project/PENDENCIES.md` (itens 5, 6, 9, 12 e 21 removidos da seção 1), `.specs/features/pagamento-pix/spec.md`, `.specs/features/finalizacao-suspensao-venda/spec.md`, `.specs/features/carrinho-produto-precificacao/spec.md`, `.specs/features/identificacao-cadastro-cliente/spec.md`, `.specs/codebase/ARCHITECTURE.md` e `.specs/codebase/CONCERNS.md` atualizados para refletir. Duas pendências de implementação ficam abertas para a equipe do ERP: o campo `produtoCancelado` (novo) e a remoção visual dos campos de crédito no Pencil (trabalho de design, não de requisito).

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

**Escopo da resolução:** a decisão do usuário fecha a detecção (comprimento + prefixo). A extração exata dos demais dígitos do código (faixa reservada ao código reduzido do produto vs. faixa reservada ao peso/valor, mais dígito verificador) segue sem confirmação — nenhuma lógica de parse foi localizada na KB (AD-023) e o usuário não detalhou o restante da máscara nesta rodada. Tratado como detalhe de implementação a confirmar na fase Design, não mais como pendência bloqueante de requisito.

**Reason:** Fechar mais uma pendência de produto de `carrinho-produto-precificacao` antes da fase Design, mesmo objetivo de AD-025/AD-026/AD-027.
**Trade-off:** Nenhum na detecção; o parse fino dos dígitos internos ainda pode exigir ajuste quando a equipe do ERP confirmar a máscara completa.
**Impact:** `.specs/project/PENDENCIES.md` (item 3 removido da seção 1), `.specs/codebase/CONCERNS.md` (bullet movido de "sem confirmação" para "resolvido") e `.specs/features/carrinho-produto-precificacao/spec.md` (Edge Cases) atualizados.

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

### AD-031: Semântica de `TipoPreco` = `6`, `7`, `10`, `11` confirmada pelo usuário — decisão de desenvolvimento de não suportar esses valores (2026-08-25)

**Decision:** Fecha a última lacuna de semântica de `SessaoUsuario.TipoPreco` (domain `EmpDefPre`, ver AD-025) por resposta direta do usuário:
- `TipoPreco = 6` — Preço de Custo.
- `TipoPreco = 7` — Preço da última venda.
- `TipoPreco = 10` — Preço Cliente x Produto (`PRM0241`).
- `TipoPreco = 11` — Preço por Índice.

**Decisão de desenvolvimento:** apesar da semântica agora conhecida, **nenhum desses quatro valores será suportado pelo Checkout** — decisão explícita do usuário de não implementar tratamento para `6`, `7`, `10` nem `11`. O motor de precificação (`CART-04`/`CART-05`) continua cobrindo só `1`-`5` (índice fixo) e `8`/`9` (faixa de quantidade / lista, AD-025). Não é mais uma pendência de requisito — é escopo deliberadamente fechado.
**Reason:** Decisão direta do usuário — os quatro casos especiais não ocorrem na operação real dos tenants do Checkout, não há necessidade de implementar suporte a eles.
**Trade-off:** Se um tenant algum dia configurar `TipoPreco` para um desses quatro valores, o comportamento do Checkout nesse cenário fica indefinido/não tratado — aceito deliberadamente, não é considerado um caso a cobrir.
**Impact:** `.specs/project/PENDENCIES.md` (item 1 removido da seção 1), `.specs/codebase/CONCERNS.md` e `.specs/features/carrinho-produto-precificacao/spec.md` (Edge Cases) atualizados para refletir.

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

**Decision:** O operador pode aplicar desconto de duas formas: diretamente no item do carrinho, ou na capa da nota (seção de pagamentos), afetando o total da venda. Desconto de capa pode ser expresso em porcentagem ou em valor fixo, à escolha do operador. Não há teto de valor nem exigência de senha/autorização para aplicar desconto (item ou capa) — decisão tomada nesta sessão. Na montagem do JSON de `FaturarNFCe`, o valor do desconto de capa SHALL ser rateado igualmente entre os itens da venda; quando o rateio não fecha em centavos exatos, o centavo remanescente SHALL ser adicionado a um dos itens (não há fração de centavo). Esse mesmo padrão de arredondamento monetário — centavos inteiros, arredondamento por linha, sobra de centavo atribuída a um item — SHALL ser aplicado de forma geral em todo cálculo monetário do Checkout, não só no rateio de desconto de capa.
**Reason:** Decisão direta do usuário — flexibiliza desconto (item ou capa, percentual ou fixo) sem burocracia de autorização, e generaliza a regra de arredondamento (já necessária para o rateio de desconto) para manter consistência monetária em toda a aplicação.
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
3. **Filtro "Ativo" pré-marcado** — nos modais de listagem de cliente e de vendedor, o filtro "Ativo" vem pré-marcado por padrão (em vez de listar todos os registros, incluindo inativos, por padrão).
**Reason:** Decisão direta do usuário — mantém o mesmo comportamento defensivo já adotado em AD-032 (nunca deixar o campo travado num estado inválido) mesmo na origem "nunca configurado"; simplifica a UI não exigindo indicador visual extra; reduz ruído na listagem pré-filtrando por registros ativos.
**Trade-off:** Sem indicador visual, o operador não tem como saber, só olhando a tela, se o cliente/vendedor atual é o default da empresa ou foi selecionado manualmente — aceito deliberadamente.
**Impact:** Atualiza `.specs/features/identificacao-cadastro-cliente/spec.md` e `.specs/features/selecao-vendedor/spec.md` (Edge Cases — default vazio tratado igual a AD-032, sem indicador visual, filtro "Ativo" pré-marcado nos modais).

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
- [ ] Confirmar com a equipe do ERP o formato de código de barras pesável (`ProdutoPesavel`/`DavMatProdPes`) — **Atualizado (2026-08-21, AD-024):** achado adicional (o `Default('E')` de `wManutencaoImplantacaoProdutos` está comentado/inativo) não muda a conclusão de AD-023: segue sem lógica de parse localizável via KB. Ver `.specs/features/carrinho-produto-precificacao/spec.md` (Edge Cases).
- [x] ~~Confirmar com a equipe do ERP/produto se o Checkout pode inferir `usaPrecoPorQuantidade` localmente a partir de `QtdMinimaPreco2 > 0`, já que nenhum flag equivalente existe no contrato ou na KB (2026-08-21, AD-024)~~ — **Resolvido (2026-08-24, AD-025):** não é inferência — `SessaoUsuario.TipoPreco = 8` é o sinal oficial de preço por faixa de quantidade, confirmado por regra de negócio direta do usuário. Ver `.specs/features/carrinho-produto-precificacao/spec.md` (Edge Cases).
- [ ] **Definir protocolo/timeout do TEF** (2026-08-25, AD-037) — bloqueio deliberado: parceiro de TEF será trocado, não vale desenhar contrato para o parceiro atual. Ver `.specs/features/pagamento-tef/spec.md`.
- [ ] Confirmar com a equipe do ERP o contrato técnico completo do serviço de impressão local (porta, rota, formato de resposta) e pedir um indicativo no `GetSessao` de qual mecanismo de impressão o tenant/máquina usa (2026-08-25, AD-037). Ver `.specs/features/finalizacao-suspensao-venda/spec.md`.
- [ ] Confirmar com a equipe do ERP o timing de chamada de `GetStatusSistema` no fluxo (2026-08-25, AD-051) — distinto da pendência já existente sobre a semântica dos códigos de retorno. Ver `.specs/features/finalizacao-suspensao-venda/spec.md`.
- [ ] Confirmar `UtilizaEncurtador`/`UtilizaLinkExterno` (2026-08-25, AD-047) — assunção de baixa confiança do usuário ("eu acho") de que o endpoint sempre retorna QR base64, sem UI de link. Ver `.specs/features/pagamento-pix/spec.md`.
