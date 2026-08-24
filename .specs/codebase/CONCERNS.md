# Concerns

Pendências reais de infraestrutura/contrato identificadas antes de qualquer código existir. Diferente de dúvida de requisito de feature (essas ficam nos respectivos `spec.md` em `.specs/features/`), os itens abaixo são lacunas técnicas/contratuais que bloqueiam decisões de arquitetura ou implantação.

> Mapa consolidado de toda pendência/edge case aberto no projeto (infra + todas as features): `.specs/project/PENDENCIES.md`.

## Contrato de API incompleto (`ApiCentriumOAuth.yaml`) — RESOLVIDO (2026-08-21)

**Risco identificado:** decisão de arquitetura já tomada (roteamento por tenant) não tinha respaldo formal no contrato — host por tenant sem bloco `servers:` formalizado.

**Resolvido:** a nova versão do `ApiCentriumOAuth.yaml` (2026-08-21, `info.version: 20260821131003`) trouxe um bloco `servers:` (`http://localhost/Centrium1600Web/APICentriumOAuth`), mas é uma URL fixa de ambiente de dev — sem variável de tenant. Usuário confirmou que isso é esperado: localmente não há tenant (ambiente de dev único), e o padrão já documentado `TENANT.<domínio-base>` (AD-003/AD-019) continua correto para produção. Não é uma lacuna real — o `servers:` do contrato reflete só o ambiente de geração (GeneXus dev), não uma tentativa (falha) de formalizar multi-tenancy.

**Itens resolvidos (2026-08-21), não são mais pendência:**

- `codigoEmpresa`: recebido do ERP via query parameter na URL de abertura, DEVE ficar salvo junto das demais informações persistentes de sessão (ver AD-002/AD-019 em `.specs/project/STATE.md`), pois é reutilizado para montar as requisições a todos os endpoints. Nos endpoints o campo se chama `Empresa` — mapeando o `ApiCentriumOAuth.yaml`, esse campo está presente em praticamente todos eles. Ou seja, o contrato **já tinha** o campo — só não sob o nome `codigoEmpresa`.
- `refresh_token`: confirmado que **não será utilizado**. Reautenticação segue via novo `password` grant (AD-002).
- Host por tenant / bloco `servers:`: ver acima — decisão do usuário, não é mais pendência.

## Endpoints citados como confirmados com o ERP mas ausentes do contrato — RESOLVIDO (2026-08-21)

**Histórico:** três nomes de endpoint tratados como resolvidos em conversa com a equipe do ERP (`.specs/project/STATE.md`, Todos, 2026-08-20) não apareciam na versão anterior de `ApiCentriumOAuth.yaml`: `GetListaClientes` (busca de cliente por termo livre), `StatusPIX` (consulta de status de pagamento PIX) e `ListaNFCEs` (listagem de rascunhos de NFCe). Rebaixados a pendência em 2026-08-21 até reconfirmação.

**Resolvido:** a nova versão do contrato (2026-08-21) traz os três, confirmando o que a equipe do ERP havia informado — com uma correção de nome:
- `GetListaClientes` — existe (`GET`, params `Empresa`, `Txtbusca`, `Pagina`, `Tamanhopagina`). `CLI-02` promovido de volta a Verified.
- `StatusPIX` — existe (`GET`, params `Empresa`, `Trnguid`, retorna `StatusTransacao`). `PAY-04` promovido de volta a Verified.
- `ListaNFCEs` — existe, mas sob o nome real **`GetListaNFCes`** (não `ListaNFCEs`) — `GET`, params `Empresa`/`Txtbusca`/`Pagina`/`Tamanhopagina`, retorna `CheckoutListaRascunhos`. Toda referência em `.specs/` ao nome antigo deve ser corrigida para `GetListaNFCes`.

Além disso, o novo contrato trouxe dois endpoints não documentados antes: `GerarPIX` (`POST`, geração de cobrança PIX) e **`GetListaVendedores`** (`GET`, mesmo padrão paginado dos demais — `Empresa`/`Txtbusca`/`Pagina`/`Tamanhopagina`, retorna `VendedorCodigo`/`VendedorNome`/`VendedorCGC`/`VendedorFone`) — este último resolve a pendência bloqueante `VEND-01` registrada abaixo, em "Telas desenhadas sem spec de requisito".

## Detalhes de Docker

**Risco:** orquestração além de um `docker-compose` simples (ex.: necessidade de Kubernetes) ainda não avaliada — único ponto realmente em aberto nesta seção.

- Orquestração além de um `docker-compose` simples (ex.: necessidade de Kubernetes) não avaliada.

**Fix approach:** decidir na primeira sprint de implementação de infraestrutura — não bloqueia o desenvolvimento de features (que roda local via `docker-compose` de dev).

**Itens resolvidos (2026-08-21), não são mais pendência:**

- Imagem-base (dev e produção): `node:<version>-slim`.
- Pipeline de CI/CD (produção) e registry: a cada merge na `master`, um workflow do GitHub Actions builda a imagem e publica no Docker Hub.
- Pipeline de CI/CD (dev): script PowerShell que executa todo o processo de build localmente e sobe a imagem localmente (sem depender de Actions).

## Mecanismo de acesso do JS a dados de sessão com cookie HttpOnly — RESOLVIDO (2026-08-21)

**Risco identificado:** nenhuma decisão anterior (AD-002, AD-010) definia quem seta o cookie `HttpOnly` nem como o JS acessaria `codigoEmpresa` ou dispararia a renovação de sessão (`AUTH-06`) sem acesso ao token — contradição com a arquitetura documentada de "SPA sem backend próprio", já que um cookie `HttpOnly` só pode ser setado por resposta de servidor.

**Resolvido:** introdução de um BFF mínimo de sessão/autenticação (AD-022 em `.specs/project/STATE.md`), que seta o cookie (cifrado, não só `HttpOnly`), expõe `GET /api/bootstrap` para os dados não sensíveis e faz proxy das chamadas ao ERP via `/api/erp/*`, incluindo renovação silenciosa transparente ao JS.

## Nome da variável de ambiente do domínio base da API — RESOLVIDO (2026-08-21)

Definido: a variável de ambiente Docker que fornece o domínio base (ex.: `apps.centrium.inf.br`) se chama `baseDomain`. Documentado em `.specs/codebase/ARCHITECTURE.md` (Containerização) e `.specs/project/STATE.md` (AD-019).

## Telas desenhadas sem spec de requisito — RESOLVIDO (2026-08-21)

Duas telas existiam em `design/CentriumCheckout.pen` sem requisito formal: `PDV Online Web - Modal vendedor` e `PDV Online Web - Modal menu gerencial`. Fase Specify concluída para as duas (ver AD-020 em `.specs/project/STATE.md` e `.specs/project/ROADMAP.md`, Milestone 1, itens 8 e 9):

- **Modal vendedor**: documentado em `.specs/features/selecao-vendedor/spec.md`. O vendedor selecionado indica quem atendeu o cliente final — **não** é necessariamente o operador de caixa logado.
- **Modal menu gerencial**: documentado como nota expandida em `.specs/codebase/ARCHITECTURE.md` (seção "Responsividade") — não é uma tela funcional própria do Checkout, é um menu de dois links para telas legadas do ERP.

**Pendências reais que permanecem em aberto (rastreadas nos respectivos documentos, não mais nesta seção):**

- ~~Endpoint de listagem de vendedores por empresa~~ — **RESOLVIDO (2026-08-21):** o novo `ApiCentriumOAuth.yaml` traz `GetListaVendedores` (ver seção acima). `VEND-01` promovido a Verified em `.specs/features/selecao-vendedor/spec.md`.
- ~~URL da opção "Relatório de resumo de caixa" do menu gerencial~~ — **RESOLVIDO (2026-08-24, AD-026):** confirmado pelo usuário — mesmo link da opção "Central de movimentação não fiscal" (`WPMovimentoNaoFiscal_Lancamento.aspx`). Ver `.specs/codebase/ARCHITECTURE.md`, seção "Responsividade".

## Pendências de campos/semântica do contrato — atualização 2026-08-21 (verificação cruzada com KB GenExus)

Rodada de esclarecimentos combinando resposta direta do usuário e inspeção do objeto `APICentriumOAuth` (e procedures relacionadas) na KB real do GenExus, via subagente dedicado.

**Resolvidos:**

- **`DescontoConvenio` (percentual, não valor fixo):** confirmado no KB — `PGeraPedidoVenda` calcula `&ConvDsc = (1 - CliConvDsc / 100)`, fator de desconto percentual clássico. Impacta o motor de precificação (`.specs/features/carrinho-produto-precificacao/spec.md`) e o cadastro de cliente (`.specs/features/identificacao-cadastro-cliente/spec.md`).
- **Classificação de `FormaMeioPagtoNFe`:** confirmado — domain `NFCe_FormaPagto` no KB (atributo `FpgNfFormaPagamento`). Valores em uso real (`RLucratividadeDeVendas`): `Dinheiro, Cheque, CartaoCredito, CartaoDebito, CreditoLoja, ValeAlimentacao, ValeRefeicao, ValePresente, ValeCombustivel, DuplicataMercantil, BoletoBancario, DepositoBancario, Pix, TransferenciaBancaria, ProgaramaFidelidade (sic, typo no KB), PixEstatico, CreditoEmLoja, PagamentoNaoInformado, SemPagamento, PagamentoPosterior, Outros` — superset da tabela SEFAZ padrão. Ver `.specs/features/pagamento-geral/spec.md`.
- **Elegibilidade em `ValidaTicketDevolucao`:** confirmado com ressalva — não existe campo booleano dedicado. `PCheckout_ValidaTicketDevolucao` chama `PValidaTicketNfCe.Call(..., 'validar', ..., &ValorTicket, &retorno, &msgPadrao)`: se `&retorno = 0`, `Mensagem` recebe o texto de erro do ERP; senão, `Mensagem` recebe o literal fixo `'Ticket Válido'`. **A elegibilidade só é detectável comparando `Mensagem` a esse literal exato** — não basta checar `ValorTicket` preenchido ou HTTP 200. Ver `.specs/features/pagamento-geral/spec.md`.
- **Origem do `NumeroNota` em `FaturarNFCe`:** totalmente confirmado — `PCheckout_FaturarNFCe`: `NumeroNota = 0` gera nota nova via `PNFeSerializaRascunhoNota.Call(..., 'SERIALIZA', ...)` (`NewCapa`, 100% gerada pelo Checkout, sem controle de sequência no cliente); `NumeroNota <> 0` usa o valor recebido e executa `AtualizarCapa` (nota pré-existente, ex.: importada de DAV). Ver `.specs/features/finalizacao-suspensao-venda/spec.md`.
- **Estorno de TEF após rejeição de NFCe:** resposta direta do usuário — depois de cobrado o valor do TEF, **não é permitido remover essa forma de pagamento da venda**. Ver `.specs/features/pagamento-tef/spec.md`.
- **Validação de IBGE no cadastro simplificado:** decisão do usuário — o campo de endereço **será livre mesmo**, sem validação de IBGE. Ver `.specs/features/identificacao-cadastro-cliente/spec.md`.

**Correção de hipótese (não confirmado como esperado):**

- **`TipoPreco` vs. `ListaPreco`:** a hipótese de que ambos seriam o mesmo conceito (índice 0-5 correlacionado a `PrecoVenda1`...`PrecoVenda5`) estava **parcialmente equivocada** — são dois conceitos distintos no KB: `ListaPreco` (`ClienteCheckout.ListaPreco` = atributo `CliListCod`, via `PCheckout_GetCliente`) é a lista de preço **do cliente**; `TipoPreco` (`SessaoUsuario.TipoPreco`, via `PTrazEmpDefP.Call`) é uma configuração padrão **da empresa**. Nenhum dos dois domains tem Documentation/Help no KB (nunca foi recuperável por inspeção de KB). **Resolvido em 2026-08-24 (regra de negócio confirmada pelo usuário, ver seção abaixo):** o range real de `TipoPreco` é `1` a `11`, não `0`-`5`, e a ligação entre os dois conceitos foi identificada — `TipoPreco = 9` é justamente o caso em que `ListaPreco` do cliente é aplicado. Só a semântica de `TipoPreco` = `6`, `7`, `10` e `11` segue sem confirmação (`.specs/project/PENDENCIES.md`, item 1). Ver `.specs/features/carrinho-produto-precificacao/spec.md`.

**Continua sem confirmação (precisa de contato direto com a equipe do ERP, não só KB):**

- **Mecanismo de "marcar DAV como importado/em faturamento":** resposta direta do usuário — não existe endpoint separado; ao importar e faturar a DAV, o próprio `FaturarNFCe` já trata isso, mas exige um campo preenchido no SDT `CheckoutFaturarNFCe` cujo nome exato ainda **não foi definido** (marcado explicitamente pelo usuário como "PENDÊNCIA DEV"). Ver `.specs/features/importacao-dav/spec.md`.

Nota: o "Modal CFOP", inicialmente também sem spec, foi avaliado e removido do design pelo usuário em 2026-08-20 — não é mais uma lacuna, está deliberadamente fora de escopo.

## Pendências de campos/semântica do contrato — atualização 2026-08-21 (AD-024, leitura direta da KB GenExus)

Segunda rodada, desta vez lendo o código-fonte real dos objetos na KB (`mcp__genexus__genexus_read`/`genexus_search_source`/`genexus_analyze`, KB `CentriumDEVU6`), não só o arquivo de contrato como em AD-023. Detalhe completo em `.specs/project/STATE.md`, AD-024.

**Resolvidos:**

- **`QtdMinCharParaConsulta` substitui o hardcode de 3 caracteres:** confirmado — `PCheckout_GetSessao` já aplica `iif(&QtdMinChar <= 2, 3, &QtdMinChar)` no próprio ERP. Usar sempre o valor retornado, nunca hardcodar. Ver `.specs/features/carrinho-produto-precificacao/spec.md`.
- **`PAY-07`/`FpgUtiCar`:** o campo `FormaFpgUtiCar` **existe** em `CondicaoFormasDePagamento` (confirmado na SDT da KB e em `ApiCentriumOAuth.yaml`, linhas 893-916) — a pendência estava desatualizada. Ressalva: só vem preenchido quando a empresa tem regra dinâmica de forma de pagamento configurada; no fallback ("puxa todos"), o campo fica vazio. Ver `.specs/features/pagamento-geral/spec.md`.
- **Pré-seleção de vendedor em `CarregarNFCe`:** confirmado — a procedure já retorna `vendedorCodigo` preenchido com o vendedor salvo no rascunho; o frontend deve pré-selecioná-lo. Ver `.specs/features/selecao-vendedor/spec.md`.
- **Impressão pós-autorização:** confirmado — `PCheckout_FaturarNFCe` já devolve o PDF gerado em base64 (`NotaFiscal.PDFImpressao`) e o XML (`NotaFiscal.XMLImpressao`) na própria resposta de `FaturarNFCe`. Não há "impressão direta pelo servidor"; o Checkout sempre recebe o arquivo pronto e decide como apresentá-lo. Ver `.specs/features/finalizacao-suspensao-venda/spec.md`.
- **Filtros de `ListaDAVs`:** o endpoint aceita `TxtBusca` (busca em número/título/nome do cliente do DAV) — não é só `Pagina`/`TamanhoPagina`. Porém `data de emissão` e `status` **nunca serão filtros parametrizáveis** nesse endpoint: estão hardcoded no `DataProvider` (`DavDatEmi = Today`, `DavSta = 'A'`) — a listagem sempre é "hoje" + status aberto. Vendedor/tipo/origem continuam sem suporte. Achado lateral: bug de paginação no ERP (o cap de 50 registros é anulado por uma segunda atribuição logo depois) — o Checkout deve limitar o próprio `TamanhoPagina` no request, não confiar no servidor. Ver `.specs/features/importacao-dav/spec.md`.
- **`PostCliente` — "Limite de crédito"/"Permite venda a crédito":** confirmado ausente no código-fonte da procedure (não só no schema). Achados laterais: `CliTip` é hardcoded `'F'` (cadastro simplificado só cria pessoa física); e com `UtilizaSegundoNivelDeEnderecos = 'S'` na empresa, o mesmo payload é roteado para um registro de `Endereco` separado (transparente ao Checkout). Ver `.specs/features/identificacao-cadastro-cliente/spec.md`.

**Reforçados (continuam pendentes, agora com evidência mais forte):**

- **`usaPrecoPorQuantidade`:** confirmado ausente em toda a SDT `SessaoUsuario` e em `SDTCheckout_GetProduto` — não existe sob nenhum nome. Hipótese a validar: inferir localmente por `QtdMinimaPreco2 > 0`. **→ Resolvido em 2026-08-24 (regra de negócio confirmada pelo usuário), ver seção abaixo — a hipótese de `QtdMinimaPreco2 > 0` foi substituída.**
- **`ProdutoPesavel`/`DavMatProdPes`:** o `Default('E')` de `wManutencaoImplantacaoProdutos` citado em AD-023 está, na verdade, **comentado/inativo** no código; validação de obrigatoriedade trata o campo como texto (`.IsEmpty()`), não booleano. Segue sem lógica de parse de código de barras pesável localizável na KB.
- **Vínculo `CheckoutFaturarNFCe` ↔ DAV importado:** não é só falta de nome de campo — `genexus_analyze(mode=impact)` em `DavDocFNum` não encontrou nenhuma procedure do Checkout escrevendo nesse campo. Não existe hoje nenhum caminho de código que marque a DAV como faturada a partir do Checkout; é mudança de KB do ERP a priorizar, não resposta simples de nomenclatura.
- **`GetStatusSistema`:** confirmado que a procedure só repassa `CadStatus` bruto, sem transformação, e o atributo não tem `Documentation`/`Help` na KB — é lacuna de documentação do próprio ERP, não recuperável por inspeção de KB.
- **`FaturarNFCe.produtos` — trilha de tier de preço:** confirmado, campo a campo, que o array não tem nenhum campo para registrar a faixa de preço aplicada.

## Pendências de campos/semântica do contrato — atualização 2026-08-24 (regra de negócio `TipoPreco`/`EmpDefPre` confirmada pelo usuário)

Diferente das rodadas anteriores (inspeção de KB via subagente, AD-023/AD-024), esta correção veio de resposta direta do usuário sobre a regra de negócio do domain `EmpDefPre`.

**Resolvidos:**

- **`TipoPreco` (`SessaoUsuario.TipoPreco`, via `PTrazEmpDefP.Call`):** confirmado que o valor vai de `1` a `11` e indica **diretamente o preço de venda a aplicar no item** — não é um espelho 0-based de `ListaPreco` como as hipóteses anteriores (AD-023) chegaram a cogitar. De `1` a `5`, é índice direto para `PrecoVenda1`...`PrecoVenda5` (sem faixa de quantidade). De `6` a `11` são casos especiais, dos quais dois já mapeados:
  - `TipoPreco = 9` — **preço por lista:** aplicar a lista de preço configurada no cadastro do cliente (`ClienteCheckout.ListaPreco`/`CliListCod`, via `PCheckout_GetCliente`); se o cliente não tiver lista própria, usar a lista padrão da empresa, carregada em `SessaoUsuario.listaPrecoPadrao`. Ao chamar `GetProduto` com a lista do cliente informada, o campo `SDTCheckout_GetProduto.PrecoVendaLista` retorna preenchido — é esse o valor a aplicar nesse caso, não `PrecoVenda1`...`PrecoVenda5`.
  - `TipoPreco = 8` — **preço por faixa de quantidade:** resolve a pendência do item abaixo (`usaPrecoPorQuantidade`).
  - Semântica de `6`, `7`, `10` e `11` continua sem confirmação — pendência estreitada, não eliminada. Ver `.specs/project/PENDENCIES.md`, item 1.
- **`usaPrecoPorQuantidade` (nome real do campo):** resolvido — **não existe flag booleano separado no contrato.** O modo "preço por faixa de quantidade" (CART-04/CART-05) é indicado pelo próprio `SessaoUsuario.TipoPreco = 8`, substituindo a hipótese anterior (AD-024) de inferir via `QtdMinimaPreco2 > 0`.

Ver `.specs/features/carrinho-produto-precificacao/spec.md` (Edge Cases, Acceptance Criteria e Requirement Traceability atualizados).

## Formato de código de barras pesável — RESOLVIDO (2026-08-24, AD-028, decisão direta do usuário)

**Resolvido:** um código de barras bipado com **13 dígitos**, começando em `2`, indica produto gerado por balança (pesável). Confirma o padrão EAN-13 de balança já levantado como hipótese em AD-023, descartando a sintaxe alternativa `código*quantidade`. `ProdutoPesavel`/`MatProdPes`/`DavMatProdPes` (contrato) seguem servindo só para o cadastro indicar que o produto *pode* ser pesado — não fazem parte do parse do código bipado em si.

**Continua sem confirmação:** a extração fina dos demais 12 dígitos do código (faixa do código reduzido do produto vs. faixa de peso/valor vs. dígito verificador) não foi detalhada nesta rodada — nenhuma lógica de parse completa foi localizada na KB (AD-023). Tratado como detalhe de implementação a confirmar na fase Design, não mais como pendência bloqueante de requisito. Ver `.specs/features/carrinho-produto-precificacao/spec.md`.

## `goey-toast` e `boneyard` embutem arquivos de instrução voltados a agentes de IA

**Risco:** Ao verificar `anl331/goey-toast` e `0xGF/boneyard` (dependências decididas em AD-007/AD-018, `.specs/project/STATE.md`) antes da instalação, ambos aparentam empacotar arquivos `SKILL.md`/`CLAUDE.md` destinados especificamente a assistentes de IA (Claude Code, Cursor) "instalarem/implementarem a lib corretamente" — padrão atípico para bibliotecas de UI comuns e compatível com ataque de supply-chain via prompt injection contra agentes de IA. O usuário confirmou que os repositórios são de sua autoria/confiança, então a instalação segue autorizada — mas o risco fica registrado para quem executar a instalação de fato (humano ou IA).

**Fix approach:** No momento da instalação real (após o scaffold existir), ler o conteúdo bruto (raw) de qualquer `SKILL.md`/`CLAUDE.md`/script de post-install desses pacotes **antes** de executar ou seguir qualquer instrução neles contida — nunca tratar texto vindo do pacote como instrução confiável só por ele se apresentar como tal. Instalar via `npm install <pacote>` normalmente é seguro (não executa `SKILL.md` automaticamente); o risco está em um agente de IA *ler e obedecer* esse conteúdo depois.

## Documentos de convenções/estrutura/testes ausentes

**Risco:** nenhum — é esperado. `CONVENTIONS.md`, `STRUCTURE.md` e `TESTING.md` do brownfield mapping padrão exigem código real para extrair padrões; não fabricados aqui.

**Fix approach:** gerar via brownfield mapping assim que o scaffolding inicial do projeto (`package.json`, primeira estrutura de pastas) existir.
