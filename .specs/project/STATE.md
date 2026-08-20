# State

**Last Updated:** 2026-08-20
**Current Work:** Nenhuma feature em execução — discussão de arquitetura em andamento

---

## Recent Decisions (Last 60 days)

### AD-001: Responsividade mobile via wizard de 3 etapas (2026-07-22)

**Decision:** CheckoutWEB será responsivo. Breakpoint por largura de viewport (`< 768px`) alterna entre layout desktop (tela única) e layout mobile (wizard de 3 etapas: 1. identificação de cliente + adição de produtos → 2. conferência de produtos + forma/condição de pagamento → 3. revisão final e finalização). Navegação livre entre etapas já visitadas. Atalhos de teclado (react-hotkeys-hook) desativados no mobile. Documentado em `ARCHITECTURE.md` seção 6.
**Reason:** Operador pode usar o PDV em tablet/celular, onde uma tela única com todas as áreas simultâneas não cabe com usabilidade aceitável; dividir em etapas sequenciais resolve o espaço sem duplicar lógica de negócio.
**Trade-off:** Dois layouts de apresentação para manter (desktop de tela única + wizard mobile), ambos consumindo o mesmo estado (Zustand) — mais superfície de UI para testar, mas nenhuma duplicação de regra de negócio.
**Impact:** Ainda não implementado — apenas decisão de arquitetura registrada. Ver Deferred Ideas abaixo para o item de implementação.

---

### AD-002: Login via troca de credenciais na URL, sem token pronto do ERP (2026-07-22)

**Decision:** O ERP não injeta `access_token` pronto na URL de abertura do Checkout (corrigindo suposição anterior do documento). Em vez disso, o ERP envia `tenant`, `client_id`, `client_secret`, `username`, `password`, `Repository` e `codigoEmpresa` como query parameters. `tenant` identifica o cliente e compõe o host da API do ERP daquele cliente (ex.: `TENANT.apps.centrium.inf.br`) — usado em **todas** as chamadas à API, não só na autenticação. Com os demais campos, o Checkout chama `POST /oauth/access_token` (contrato em `ApiCentriumOAuth.yaml`) e obtém seu próprio `access_token`. Credenciais originais (exceto `codigoEmpresa`) são armazenadas para permitir reautenticação automática silenciosa quando o token expirar durante o uso, sem derrubar a sessão do operador a menos que a reautenticação falhe. Documentado em `ARCHITECTURE.md` seção 10.
**Reason:** O ERP delega a obtenção/renovação do token ao próprio Checkout em vez de gerenciar esse ciclo de vida centralmente — reduz acoplamento entre a sessão do ERP e a sessão do Checkout, e permite renovar o token sem round-trip pelo ERP. O roteamento por `tenant` reflete que cada cliente tem sua própria instância/host de API.
**Trade-off:** Checkout precisa armazenar credenciais sensíveis (`client_id`, `client_secret`, `password`) durante toda a sessão, não só o token — superfície de dados sensíveis maior no cliente do que um modelo de token único repassado pelo ERP.
**Impact:** Três questões em aberto registradas em `ARCHITECTURE.md` seção 7: (1) `codigoEmpresa` ainda não está no contrato `ApiCentriumOAuth.yaml`; (2) o host por `tenant` também não está formalizado em contrato (`ApiCentriumOAuth.yaml` não tem bloco `servers:`); (3) o contrato retorna `refresh_token`, mas o fluxo descrito reautentica via `password` grant novamente — não confirmado se `refresh_token` deveria ser usado no lugar.

---

### AD-003: Domínio base da API do ERP via variável de ambiente Docker (2026-07-22)

**Decision:** O host completo da API do ERP é montado prefixando o `tenant` (recebido do ERP na URL de abertura, ver AD-002) a um domínio base fixo (ex.: `apps.centrium.inf.br`, formando `TENANT.apps.centrium.inf.br`). Esse domínio base **não** vem do ERP — é fornecido ao Checkout via variável de ambiente Docker (nome ainda não definido — ver Pontos em aberto). Documentado em `ARCHITECTURE.md` seções 9 e 10.
**Reason:** O domínio base muda por ambiente de implantação (dev/staging/produção), não por tenant — cada ambiente do Checkout aponta para uma API do ERP diferente (ex.: ambiente de homologação vs. produção), então esse valor precisa ser configurável por deploy, não hardcoded nem enviado pelo ERP a cada sessão.
**Trade-off:** Nenhum trade-off relevante identificado — é a forma padrão de configurar valores que variam por ambiente em uma aplicação containerizada.
**Impact:** Novo item em `ARCHITECTURE.md` seção 7 (Pontos em aberto): nome da variável de ambiente ainda não definido.

---

### AD-004: Bootstrap automático via GetSessao logo após o login (2026-07-22)

**Decision:** Imediatamente após obter o `access_token` (AD-002), o Checkout chama automaticamente `GET /ApiCentriumOAuth/GetSessao` — header `Authorization` com o `access_token`, header `Empresa` com o `codigoEmpresa` recebido do ERP, query `Login` com o `username` já recebido e usado na obtenção do token. É essa chamada que retorna o payload de até ~5MB com as configurações gerais de uso (condições de pagamento, formas de pagamento, configurações de TEF/PIX etc.) já referenciado no restante do documento. Documentado em `ARCHITECTURE.md` seções 5 (item 2) e 10 (passo 5).
**Reason:** Fecha o vínculo entre autenticação e carga de configuração — o endpoint específico do payload de bootstrap era citado de forma genérica ("`GET` na API do ERP") antes desta conversa; agora está nomeado e com o request completo confirmado contra o contrato `ApiCentriumOAuth.yaml`.
**Trade-off:** Nenhum trade-off novo — apenas nomeia e amarra um passo que já era previsto no fluxo geral (seção 5).
**Impact:** Nenhuma pendência nova — request e resposta já confirmados integralmente contra o contrato yaml.

---

### AD-005: Tela de carregamento bloqueante durante login/bootstrap (2026-07-22)

**Decision:** Entre o operador clicar no botão do ERP e a tela principal do PDV aparecer, o Checkout exibe uma tela de carregamento com indicador de "montando a sessão" (ou equivalente), cobrindo obtenção do `access_token`, chamada ao `GetSessao` e parse/validação completo do payload de bootstrap. Só após esse processamento terminar com sucesso o operador é redirecionado à tela principal — não existe carregamento parcial da tela principal. Documentado em `ARCHITECTURE.md` seção 10.
**Reason:** Evita expor uma tela principal do PDV com configurações ainda incompletas (condições de pagamento, formas de pagamento, dados da empresa/usuário) — o operador só deve começar a operar quando toda a base necessária já estiver carregada e validada.
**Trade-off:** Login inicial parece mais lento ao operador (tela de espera única) em vez de a tela principal aparecer progressivamente — troca aceita em favor de nunca expor um PDV com dados parciais/inconsistentes.
**Impact:** Nenhuma pendência nova.

---

### AD-006: Venda em andamento não sobrevive a F5 (2026-08-20)

**Decision:** Removida a persistência do carrinho via `persist(localStorage)` do Zustand. O estado da venda em andamento passa a viver só em memória (Zustand sem `persist`), sem sobreviver a reload/F5. Como proteção contra perda acidental, ao tentar recarregar/fechar a aba com venda em andamento a aplicação usa o diálogo nativo do navegador (`beforeunload`) pedindo confirmação. Documentado em `ARCHITECTURE.md` seções 2, 3, 4 e 5.
**Reason:** Decisão do usuário — simplifica o modelo de estado (sem sincronização entre memória e `localStorage`, sem lógica de reidratação/reprecificação pós-F5) em troca de aceitar perda de venda em um reload não confirmado.
**Trade-off:** Antes, um F5 acidental recuperava a venda do `localStorage`; agora, confirmando a saída no diálogo do navegador, a venda é perdida e precisa ser refeita do zero. Reduz complexidade de estado em troca de menor tolerância a reload acidental (mitigada pela confirmação nativa).
**Impact:** Supersede o desenho anterior (persistência em `localStorage`) registrado na tabela de stack original de `ARCHITECTURE.md` seção 2/3. A "Regra de fronteira" da seção 3 (dados do produto copiados para a linha do carrinho na inserção) continua válida, mas agora vale só dentro da mesma sessão de venda, não entre reloads (seção 4 atualizada).

---

### AD-007: Boneyard, Goey Toast e shadcn/ui adicionados à stack (2026-08-20)

**Decision:** Três novas bibliotecas de UI entram na stack tecnológica: Boneyard (skeletons exibidos ao abrir modais que carregam dados da API, ex.: busca de produto), Goey Toast (toasts eventuais de sucesso/erro/aviso) e shadcn/ui (base dos componentes de design system, seguindo o design system aprovado no Pencil). Documentado em `ARCHITECTURE.md` seção 2.
**Reason:** Cobrir lacunas de UI ainda não resolvidas por nenhuma lib já presente na stack (skeleton de carregamento, notificação toast, biblioteca de componentes base).
**Trade-off:** Mais dependências de terceiros para manter atualizadas; em contrapartida, evita reimplementar skeleton/toast/componentes do zero.
**Impact:** Nenhuma pendência nova. Registrado também que alterações pontuais de UI podem ser feitas por inferência da IA, desde que respeitem os tokens/componentes do design system (Pencil + shadcn/ui) — não é necessário que toda alteração visual passe primeiro pelo Pencil.

---

### AD-008: Busca de produto via `GetListaProdutos` (paginado) vs. inserção direta via `GetProduto` (2026-08-20)

**Decision:** Dois endpoints distintos conforme o caminho do operador: busca via modal de pesquisa (termo livre, sem código conhecido) usa `GET /ApiCentriumOAuth/GetListaProdutos`, paginado; inserção direta quando o código já é conhecido (código de barras bipado ou código de produto digitado) usa `GET /ApiCentriumOAuth/GetProduto`. Documentado em `ARCHITECTURE.md` seção 5, item 3.
**Reason:** São necessidades diferentes — listar candidatos para seleção vs. buscar um produto específico já identificado — e o ERP expõe endpoints separados para cada caso.
**Trade-off:** Nenhum — apenas mapeamento correto de cada caso de uso ao endpoint certo do contrato.
**Impact:** Nenhuma pendência nova.

---

### AD-009: Finalização e suspensão de venda via `FaturarNFCe` + `SuspenderOuFaturar` (2026-08-20)

**Decision:** Finalização chama `POST /ApiCentriumOAuth/FaturarNFCe` com `SuspenderOuFaturar = "FATURAR"`. Cancelamento da venda em digitação (antes de finalizada) chama o mesmo endpoint com `SuspenderOuFaturar = "SUSPENDER"` — **existe rascunho de venda no lado do servidor**, e cancelar não é mais operação 100% local: envia a suspensão ao ERP, além de limpar o carrinho (Zustand) e o cache de produtos (TanStack Query) localmente. `NumeroNota` é enviado preenchido quando a venda foi carregada de um rascunho existente no ERP (via `CarregarNFCe`), ou `0` quando criada do zero no Checkout — regra válida tanto para faturar quanto para suspender. Não haverá cancelamento de NFCe já autorizada pelo Checkout. Documentado em `ARCHITECTURE.md` seção 5 ("Cancelamento da venda em andamento") e seção 7, itens 4 e 5.
**Reason:** Corrige o entendimento inicial da equipe de desenvolvimento (cancelamento 100% local, sem chamada ao ERP) — confirmado com a equipe do ERP que a suspensão de uma NFCe em digitação sempre chama a API.
**Trade-off:** Cancelamento deixa de ser instantâneo/offline-tolerante (depende de round-trip ao ERP), mas mantém o rascunho consistente entre Checkout e ERP.
**Impact:** Resolve os itens 4 e 5 das "Dúvidas operacionais" em `ARCHITECTURE.md` seção 7 — remover da lista de blockers de alinhamento com a equipe do ERP (ver Todos abaixo).

---

### AD-010: Credenciais do ERP armazenadas em cookie `HttpOnly` (2026-08-20)

**Decision:** O `access_token` e as credenciais originais recebidas do ERP (`tenant`, `client_id`, `client_secret`, `username`, `password`, `Repository`) são armazenados em cookie `HttpOnly`, não em `localStorage`/`sessionStorage`. Documentado em `ARCHITECTURE.md` seção 10, passos 4 e 6.
**Reason:** Cookie `HttpOnly` é inacessível a JavaScript no navegador, mitigando exfiltração dessas credenciais sensíveis via XSS — relevante dado que 100% do código é gerado por IA (seção 1 de `ARCHITECTURE.md`).
**Trade-off:** Nenhum trade-off relevante identificado — é a prática padrão de segurança para dados de sessão sensíveis em aplicações web.
**Impact:** Nenhuma pendência nova.

---

### AD-011: Cadastro de cliente simplificado existe no Checkout (2026-08-20)

**Decision:** Confirmado que o Checkout **terá** cadastro de cliente — simplificado, não o cadastro completo com todas as validações de `Regras.md`. Ocorre quando a busca de cliente (`GetCliente`/`GetListaClientes`) não localiza ninguém: o operador informa dados básicos, o Checkout valida máscaras de CPF/CEP e envia via `POST /ApiCentriumOAuth/PostCliente`. Documentado em `ARCHITECTURE.md` seção 5, item 3.
**Reason:** Supersede o entendimento anterior (seção 7, item 11) de que não haveria cadastro de cliente pelo Checkout — confirmado pelo usuário a partir da varredura dos diagramas de sequência do ERP, que já mostravam esse fluxo.
**Trade-off:** Nenhum trade-off novo identificado além do já conhecido (superfície adicional de escrita no ERP a partir do Checkout).
**Impact:** Resolve o item 11 de "Dúvidas operacionais" em `ARCHITECTURE.md` seção 7. Fica em aberto a extensão exata do cadastro "simplificado" (quais campos, se inclui validação de CEP/IBGE).

---

### AD-012: Status de PIX não é via SSE (2026-08-20)

**Decision:** Confirmado que o Checkout **não** usará Server-Sent Events (SSE) para saber quando um pagamento PIX foi aprovado — usa o endpoint `StatusPIX` (seção 7, item 7), consultado ativamente pelo Checkout. Documentado em `ARCHITECTURE.md` seção 5, item 8.
**Reason:** Um diagrama de referência do ERP ("Adiciona Pagamentos") mencionava SSE como mecanismo de notificação; o usuário corrigiu explicitamente que não será esse o modelo adotado.
**Trade-off:** Nenhum trade-off novo — mantém o modelo de consulta ativa já previsto.
**Impact:** Nenhuma pendência nova.

---

### AD-013: Importação e faturamento de DAV é fluxo suportado pelo Checkout (2026-08-20)

**Decision:** O Checkout suporta importar um DAV (Documento Auxiliar de Venda) existente no ERP e faturá-lo: lista DAVs prontos para faturamento via `GET /ApiCentriumOAuth/ListaDAVs` (paginado), o operador de caixa seleciona um, o Checkout carrega o DAV completo via `GET /ApiCentriumOAuth/GetDAV?NumeroDAV=...` (itens em `DavItemStruct`, pagamentos em `DavForPagamento`), e a partir daí segue o fluxo normal de carrinho/pagamento/finalização. Documentado em `ARCHITECTURE.md` seção 5 ("Importação e faturamento de DAV").
**Reason:** Descoberto na varredura dos diagramas de sequência do ERP ("Importação e Faturamento DAV.drawio") — fluxo inteiro que não estava em nenhum lugar de `ARCHITECTURE.md` até então. Usuário confirmou que deve entrar na arquitetura.
**Trade-off:** Amplia o escopo do Checkout além da venda direta — precisa de UI própria (janela de importação/lista de DAVs) e de tratamento dos dados importados (itens e pagamentos já definidos, não inseridos manualmente).
**Impact:** Novo ponto em aberto: o contrato `ApiCentriumOAuth.yaml` não expõe endpoint explícito de "marcar DAV como importado/em faturamento" — mecanismo exato pendente de confirmação com a equipe do ERP.

---

### AD-014: Conceito de "produto pai" não se aplica ao Checkout (2026-08-20)

**Decision:** Confirmado que os endpoints do ERP consumidos pelo Checkout não retornam dados de "produto pai" (conceito presente em alguns diagramas de referência do ERP, ex.: filtro "produtos pai" na busca, bloqueio de inserção de "produto pai"). O Checkout não precisa implementar nenhuma lógica para esse caso. Documentado em `ARCHITECTURE.md` seção 5, item 4.
**Reason:** Esclarecido pelo usuário após a varredura dos diagramas — o conceito existe na lógica geral do ERP, mas está fora do contrato (`ApiCentriumOAuth.yaml`) que o Checkout consome.
**Trade-off:** Nenhum.
**Impact:** Nenhuma pendência nova — item descartado, não fica em aberto.

---

### AD-015: Cancelamento de item do carrinho mantém a linha, riscada (2026-08-20)

**Decision:** Ao cancelar/remover um item do carrinho, a linha **não é apagada** do estado — fica marcada como cancelada e exibida riscada na grid, preservada para auditoria (usuário que cancelou, data/hora). O motor de precificação (seção 4) passa a excluir linhas canceladas do cálculo de quantidade agregada e totais, mas sem removê-las do array. Documentado em `ARCHITECTURE.md` seções 4 e 5.
**Reason:** Confirmado pelo usuário a partir do diagrama "Cancelar produto" do ERP, que já mostrava esse comportamento (produto riscado na grid, não removido).
**Trade-off:** Estado do carrinho carrega itens cancelados durante toda a venda (não é liberado até finalizar/suspender) — necessário para trilha de auditoria, mas aumenta o tamanho do estado em memória.
**Impact:** Nenhuma pendência nova.

---

### AD-016: Confirmado — sem tela de login manual no Checkout (2026-08-20)

**Decision:** Reafirmado que o Checkout não tem tela de login com campos de usuário/senha digitados pelo operador — as credenciais chegam prontas via query parameters no redirecionamento do ERP (AD-002). Um diagrama de referência do ERP (`Diagrama de sequencia/Login.drawio`) mostra um fluxo de login manual que **não** reflete o comportamento real do Checkout. Documentado em `ARCHITECTURE.md` seção 10.
**Reason:** Encontrada divergência entre o diagrama de referência do ERP e a decisão já confirmada em AD-002; usuário confirmou que AD-002 prevalece.
**Trade-off:** Nenhum — apenas confirmação/reforço de decisão já tomada.
**Impact:** Nenhuma pendência nova.

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

- [ ] Implementar o layout responsivo mobile (wizard de 3 etapas) definido em AD-001 / `ARCHITECTURE.md` seção 6 — requer spec própria (breakpoint, componentes de layout separados por dispositivo, hook `useIsMobile`, etc.) antes de codar. — Captured during: discussão de arquitetura (2026-07-22)

---

## Todos

Capture in-progress thoughts and action items that don't fit in active tasks.

- [ ] Quando o PROJECT.md/ROADMAP.md do projeto forem criados (via "initialize project"), promover o item acima de Deferred Ideas para uma feature/milestone formal no ROADMAP.md.
- [x] ~~Alinhar com a equipe do ERP as 12 dúvidas operacionais sobre endpoints registradas em `ARCHITECTURE.md` seção 7 (2026-07-23)~~ — **Atualizado (2026-08-20)**: itens 1 (busca de cliente → `GetListaClientes`), 3 (`ValidaTicketDevolucao`), 4 (`SuspenderOuFaturar`), 5 (`CarregarNFCe`/`ListaNFCEs`) e 6 (`GetPDFNota` — sem reimpressão) resolvidos (ver AD-009 e `ARCHITECTURE.md` seção 7). Itens 2 (`TipoPreco`/`ListaPreco`) e 8 (classificação de forma de pagamento) parcialmente resolvidos.
- [ ] Alinhar com a equipe do ERP as dúvidas operacionais ainda em aberto em `ARCHITECTURE.md` seção 7, itens 2 (parte), 8 (parte), 9-10, 12-16: diferenciação completa de `TipoPreco`/`ListaPreco` fora do valor `0`, classificação completa de forma de pagamento (dinheiro/cartão/TEF/duplicata) além do enum `FpgUtiCar`, origem do `NumeroNota`, contrato de `GetStatusSistema`, extensão do cadastro simplificado de cliente/validação de IBGE no CEP, `QtdMinCharParaConsulta` vs. mínimo fixo, formato de código de barras pesável, "produto editável ao dar TAB", e estorno de TEF após rejeição.
- [ ] **Analisar bloqueios de edição pós-pagamento** (2026-08-20, `ARCHITECTURE.md` seção 7, item 17): definir como/onde travar inserção de produto, cancelamento de item, troca de condição de pagamento e desconto/acréscimo assim que a primeira forma de pagamento é adicionada à venda. Não implementar até essa análise ser concluída (pedido explícito do usuário).
- [ ] **Confirmar validação de saldo/estoque na inserção de produto** (2026-08-20, `ARCHITECTURE.md` seção 7, item 18): se é sempre ativa ou condicionada a flag do `GetSessao`, e o comportamento exato quando o saldo é insuficiente. Deixado propositalmente em aberto por ora (pedido explícito do usuário).
- [ ] Confirmar com a equipe do ERP o endpoint/mecanismo de "marcar DAV como importado/em faturamento" ao importar um DAV via `GetDAV` (2026-08-20, ver AD-013 e `ARCHITECTURE.md` seção 5, "Importação e faturamento de DAV") — não exposto explicitamente em `ApiCentriumOAuth.yaml`.
