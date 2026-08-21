# State

**Last Updated:** 2026-08-21
**Current Work:** Contrato `ApiCentriumOAuth.yaml` atualizado pelo usuário revisado contra toda `.specs/` (AD-023) — maioria das pendências de API fechadas. Próximo passo sugerido: fase **Design** da feature `carrinho-produto-precificacao` (ver `.specs/project/ROADMAP.md`)

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

**Correção de hipótese:** `TipoPreco` (config padrão da empresa, `SessaoUsuario`, via `PTrazEmpDefP`) e `ListaPreco` (lista de preço do cliente, `CliListCod`, via `PCheckout_GetCliente`) são conceitos **distintos** — a hipótese inicial de correlação com `PrecoVenda1`...`PrecoVenda5` não foi confirmada; nenhum dos dois tem enum de valores válidos no KB.

**Continua pendente (precisa de contato direto com a equipe do ERP):** formato de código de barras pesável (`ProdutoPesavel`/`DavMatProdPes`) — nenhuma lógica de parse encontrada em ~6% do KB varrido; achado lateral (`wManutencaoImplantacaoProdutos`) sugere código multi-valor (default `'E'`), não um simples `S`/`N`.

**Reason:** Fechar o máximo possível das pendências de contrato antes de iniciar a fase Design de `carrinho-produto-precificacao`, evitando que decisões de UI dependam de suposições sobre a API.
**Trade-off:** Nenhum.
**Impact:** `.specs/codebase/CONCERNS.md`, `.specs/codebase/INTEGRATIONS.md`, `.specs/features/selecao-vendedor/spec.md` (`VEND-01`), `.specs/features/pagamento/spec.md` (`PAY-04`, `PAY-05`, edge cases de forma de pagamento/TEF), `.specs/features/identificacao-cadastro-cliente/spec.md` (`CLI-02`, IBGE, `DescontoConvenio`), `.specs/features/finalizacao-suspensao-venda/spec.md` (edge case de `NumeroNota`), `.specs/features/carrinho-produto-precificacao/spec.md` (`TipoPreco`/`ListaPreco`, `DescontoConvenio`, `ProdutoPesavel`) e `.specs/features/importacao-dav/spec.md` (marcação de DAV importado) atualizados para refletir.

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
- [ ] **Analisar bloqueios de edição pós-pagamento** (2026-08-20) — ver `.specs/features/carrinho-produto-precificacao/spec.md`, requisito `CART-09` (em análise, não implementar até conclusão — pedido explícito do usuário).
- [ ] **Confirmar validação de saldo/estoque na inserção de produto** (2026-08-20) — ver `.specs/features/carrinho-produto-precificacao/spec.md`, requisito `CART-10` (em aberto, propositalmente não resolvido — pedido explícito do usuário).
- [ ] Confirmar com a equipe do ERP o endpoint/mecanismo de "marcar DAV como importado/em faturamento" — ver `.specs/features/importacao-dav/spec.md` (Edge Cases).
