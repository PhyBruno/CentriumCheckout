# Phase 0 — Research: Validação Prévia da Venda no ERP (`ValidarNFCe`)

**Feature**: `specs/014-validacao-previa-nfce/` | **Data**: 2026-08-31

Fonte primária desta fase: leitura direta do código-fonte de `PCheckout_ValidarNFCe` na KB real do GeneXus (`CentriumDEVU6`, via MCP) e do contrato `Fluxograma - Diagrama - Alinhamentos/ApiCentriumOAuth.yaml` (`info.version: 20260827192357`). Nenhuma decisão desta fase foi inferida do nome do endpoint.

---

## D1 — O gate é feature própria, não um requisito dentro da 008

**Decision**: A validação prévia vira a feature 014, transversal e sem UI própria, e as features 004, 008, 009 e 013 recebem emendas de call site. Não vira um bloco de requisitos dentro de `008-pagamento-geral`.

**Rationale**: três razões independentes, qualquer uma delas suficiente:

1. **O insumo pertence à 004.** `ValidarNFCe` recebe `CheckoutFaturarNFCe` — o retrato completo da venda, cuja montagem é escopo declarado da feature 004 (`montarPayloadFaturarNFCe`), explicitamente listado como **fora do escopo** no `plan.md` da 008. Pôr o gate na 008 obrigaria a 008 a montar o payload de faturamento, invertendo uma fronteira já desenhada.
2. **O gatilho não é exclusivo da 008.** A feature 013 lança pagamento por tecla de função sem passar pela UI da 008, e pode encadear a finalização. Um gate que morasse no componente/ação da 008 seria contornável por qualquer novo caminho de inserção.
3. **O consumidor do veredito é a 004.** A licença de finalização (`FR-013`/`FR-015`) é lida pelo fluxo de emissão, não pelo de pagamento.

**Alternatives considered**:
- *Emenda à 008* — rejeitada pelas três razões acima; concentraria em uma feature já desenhada um mecanismo cujas duas pontas (payload e finalização) moram fora dela.
- *Emenda à 004* — coloca o gate onde o payload é montado, mas o gatilho principal (inserir forma) fica numa feature sem a tela de pagamento, invertendo a direção da dependência.
- **Precedente do projeto**: a feature 001 (auditoria) é exatamente este formato — mecanismo transversal, sem tela, consumido por várias features (AD-061).

---

## D2 — O retrato enviado inclui a forma **candidata**, ainda não aplicada

**Decision**: A consulta envia a venda **como ela ficaria** se a inserção fosse efetivada: a lista de formas de pagamento é a lista atual **mais** a forma candidata, e a condição é a que estará vigente após o gesto.

**Rationale**: o código do ERP soma o crediário percorrendo `&CheckoutFaturarNFCe.FormasDePagamento` e acumulando as formas com `FormaFpgUtiCar = 'CRD'` **e** `FormaEntrada = 'N'`. Com o estado anterior ao gesto, `&TotalCrediario` seria `0` na primeira inserção e todo o bloco de limite de crédito seria pulado — o gate passaria a aprovar exatamente o caso que existe para barrar. A pergunta correta é "e se eu inserir isto?", não "como está agora?".

**Alternatives considered**: enviar o estado atual e validar de novo depois de aplicar — rejeitado: validaria tarde demais (com o pagamento já aplicado, e possivelmente com uma cobrança externa já iniciada) e exigiria desfazer, que é justamente o que a feature evita.

---

## D3 — `montarPayloadFaturarNFCe` (004) é generalizado para `montarRetratoVenda`, compartilhado

**Decision**: A função pura hoje planejada na feature 004 como `src/client/domain/finalizacaoVenda/montarPayloadFaturarNFCe.ts` passa a viver em `src/client/domain/venda/montarRetratoVenda.ts`, parametrizada por (a) a operação (`'FATURAR' | 'SUSPENDER' | 'VALIDAR'`) e (b) a lista de pagamentos a considerar. A 004 e a 014 a consomem; nenhuma das duas reimplementa a montagem.

**Rationale**: a Constitution III exige que o Checkout não mantenha duas representações da mesma venda. Se a 014 montasse o seu próprio payload, uma divergência entre os dois montadores produziria o pior bug possível desta feature: o ERP aprovar um retrato e emitir sobre outro. Como a função já foi desenhada pura e recebendo snapshots prontos (ver `specs/004-.../plan.md`), a generalização é mecânica — acrescenta dois parâmetros, não muda a lógica.

**Alternatives considered**: a 014 importar de `domain/finalizacaoVenda/` — funcionaria, mas deixaria um módulo compartilhado com nome que declara pertencer a um fluxo só, o que convida a próxima feature a duplicá-lo.

---

## D4 — Só `Valido` decide bloqueio; `messages[].Type` é apenas apresentação

**Decision**: `interpretarRespostaValidacao` produz uma união discriminada baseada **exclusivamente** em `Valido`. `Type` é usado apenas para escolher o ícone/estilo da notificação quando a venda é aceita, e nem isso quando é recusada (recusa é sempre apresentada como erro).

**Rationale**: verificado no código real. `EmpLimCre = 'A'` com limite ultrapassado adiciona uma mensagem `GeneXus.MessageTypes.Warning` **sem** tocar em `&Valido` (que permanece `true`); `EmpLimCre = 'B'` no mesmo cenário adiciona mensagem do **mesmo tipo** e faz `&Valido = false`. Data limite vencida e crédito bloqueado também são `Warning` com `&Valido = false`. Logo, `Type` não é preditor de bloqueio — em três dos quatro casos ele é `Warning` e o desfecho difere.

**Alternatives considered**: mapear `Type` para severidade de bloqueio (padrão comum em respostas GeneXus) — seria um bug garantido neste endpoint específico. Registrado como armadilha explícita em `data-model.md` e coberto por teste negativo.

---

## D5 — Falha de comunicação é recusa (*fail-closed*), sem retry automático

**Decision**: timeout, erro de rede, status de erro HTTP ou resposta que não passa na validação de fronteira produzem o veredito `INDISPONIVEL`, que **não** efetiva a inserção. A mutation não tem retry automático; a nova tentativa é um gesto explícito do operador. A mensagem ao operador distingue "não consegui perguntar ao ERP" de "o ERP recusou".

**Rationale**: decisão direta do usuário (2026-08-31). Coerente com a Constitution III: sem resposta do ERP, o Checkout não tem autoridade para decidir que a venda pode receber um pagamento a prazo. Um retry automático, além disso, multiplicaria consultas justamente quando o ERP está degradado.

**Alternatives considered**: *fail-open* com aviso — descartado pelo usuário; deixaria passar exatamente as vendas a prazo que o gate existe para barrar.

---

## D6 — Veredito vigente substitui a revalidação na finalização

**Decision**: o veredito favorável da última inserção aceita fica retido no `validacaoVendaSlice` e é a licença de finalização. A finalização **não** consulta de novo. O veredito é invalidado por `removerPagamento` e por `limparPagamentos`/`selecionarCondicao` (que já esvazia a lista, I9 da 008).

**Rationale**: decisão direta do usuário (2026-08-31), com a justificativa que a torna segura: **depois da primeira forma aplicada, a venda está congelada** — não se altera carrinho, cliente, vendedor nem desconto de capa. Para mexer em qualquer um deles é preciso remover a forma, e é exatamente esse gesto que derruba o veredito. Não existe, portanto, janela em que o veredito descreva uma venda diferente da que será emitida.

**Consequência para a 008**: a invariante I7 hoje diz `podeMutarCarrinho() === false` quando há pagamento aprovado. O congelamento decidido aqui é **mais amplo** que I7 — abrange também cliente, vendedor e desconto de capa. Isso é uma emenda a aplicar na feature 008 (e refletida em 005/012), não uma leitura já existente.

**Alternatives considered**: revalidar sempre antes de `FaturarNFCe` — mais defensivo, mas descartado pelo usuário; custaria uma ida ao ERP no momento de maior pressa do caixa, sem cobrir nenhuma janela real dado o congelamento.

---

## D7 — Ordem no fluxo de inserção: local → ERP → aplicação → integração externa

**Decision**: a sequência de `aplicarPagamento` passa a ser:

1. Validações locais e puras da 008 (`podeAplicarForma`: venda sem itens, saldo zerado, segunda forma dinheiro, desconto acima do subtotal). Falhou aqui, **não** há consulta ao ERP (`FR-012`).
2. Projeção da forma candidata e montagem do retrato da venda (D2/D3).
3. Consulta `ValidarNFCe` — com `emValidacao = true` bloqueando novos acionamentos (`FR-011`).
4. Recusa ou indisponibilidade → nada muda na venda, notificação, evento de auditoria de recusa. Fim.
5. Aceite → `aplicarPagamento` efetiva a mutação; se `resolverIntegracao(...) !== 'NENHUMA'`, o pagamento entra como `PENDENTE_INTEGRACAO` e só então a integração (TEF/PIX) é acionada.

**Rationale**: `FR-010` exige que nenhuma cobrança externa seja criada numa venda recusada. Como a 008 já dispara `iniciarIntegracao` de dentro de `aplicarPagamento`, basta que o gate seja anterior a essa action — nenhuma mudança é necessária nas features 009 e 010, que continuam reagindo ao veredito de roteamento da 008. É o que mantém o custo desta feature concentrado em um ponto.

**Alternatives considered**: validar depois de `PENDENTE_INTEGRACAO` e antes da confirmação — deixaria o QR Code do PIX já gerado (cobrança criada no adquirente) numa venda que o ERP recusa.

---

## D8 — A 008 recebe o gate por injeção; nenhuma feature importa a 014

**Decision**: `pagamentoSlice` (008) ganha duas dependências injetadas na composição do `vendaStore`: `validarInsercao(candidata): Promise<Veredito>` e `invalidarVeredito(): void`. A 008 não importa nada da 014 — recebe abstrações.

**Rationale**: Constitution II (Dependency Inversion), no mesmo padrão que a 008 já usa para `iniciarIntegracao` (features 009/010) e que a 004 usa para o predicado de bloqueio de suspensão. Permite testar toda a matriz de comportamento da 008 com um gate falso, sem rede, e testar a 014 sem montar o slice de pagamento.

**Alternatives considered**: a 008 chamar diretamente o serviço de validação — acoplaria a camada de domínio de pagamento a uma chamada de rede, quebrando a pureza que sustenta os testes existentes da 008.

---

## D9 — A trilha de auditoria registra recusas, não avisos

**Decision**: um novo tipo de evento na feature 001 — `VALIDACAO_VENDA_RECUSADA` — registra recusa por regra de negócio e indisponibilidade, com o caminho de acionamento (`'MANUAL' | 'ATALHO_CENARIO'`), a condição/forma pretendida e o motivo. Avisos (`Valido = true` com mensagem) **não** entram na trilha.

**Rationale**: decisão direta do usuário (2026-08-31) na escolha da apresentação dos avisos: notificação apenas. A recusa, por outro lado, é um gesto do operador que não produziu efeito na venda — sem registro, a trilha mostraria um salto inexplicável. Alinha-se ao `FR-017` da 008, que já exige registrar pagamento recusado.

**Alternatives considered**: registrar também os avisos — descartado pelo usuário; inflaria o campo `Log` com texto do ERP em toda venda a prazo de cliente no limite.

---

## D10 — Sem cache, sem *debounce*, sem coalescência de consultas

**Decision**: **cada** inserção gera exatamente uma consulta — a primeira forma da venda, a segunda, a terceira e todas as seguintes de um pagamento dividido. Consultas não são cacheadas, não são deduplicadas por conteúdo e não são agrupadas. A única proteção é a exclusão mútua de `emValidacao` (`FR-011`).

Não se trata de conservadorismo: no split, **cada forma acrescentada muda o retrato** que o ERP avalia. Uma venda em que a primeira forma é dinheiro e a segunda é crediário só ultrapassa o limite de crédito na segunda consulta — reaproveitar o veredito da primeira aprovaria exatamente a inserção que o gate existe para barrar. O inverso também vale: reduzir o crediário substituindo formas pode transformar uma recusa em aceite.

**Rationale**: o resultado depende de estado do ERP que muda fora do Checkout (duplicatas em aberto do cliente, limite de crédito revisto pelo financeiro). Um cache, mesmo curto, transformaria o gate numa foto velha. O custo é baixo: a consulta acontece por gesto de pagamento, não por tecla digitada, e uma venda típica tem uma ou duas formas.

**Alternatives considered**: `staleTime` curto no TanStack Query — rejeitado; e como a chamada é uma mutation de consulta (efeito nulo, mas disparada por gesto), modelá-la como mutation também evita que o cache de queries a reexecute em `refetchOnWindowFocus`.

---

## Achados de contrato desta fase

1. **`FormaEntrada` (`FpgEnt`) deixa de ser pendência sem destino.** O campo, acrescentado a `CondicaoFormasDePagamento[]` no contrato `20260827192357` e registrado como item 36 de `PENDENCIES.md` com destino "feature 008", é **insumo direto** da regra de crediário deste endpoint (`FormaFpgUtiCar = 'CRD' and FormaEntrada = 'N'`). A feature 008 precisa carregá-lo do catálogo de `GetSessao` e a montagem do retrato precisa enviá-lo em cada forma. Sem ele, o ERP nunca soma crediário e o gate aprova o que deveria barrar.
2. **`ValidarNFCe` tinha destino provisório "feature 004"** no mesmo item 36 (registrado durante o Design da 013, quando ainda se supunha que fosse validação prévia à finalização). O destino correto é esta feature, e o momento correto é a inserção do pagamento, não a finalização.
3. **`PCheckout_ValidarNFCe` não valida nada de tributário nem de estoque.** O procedure lê empresa, condição, cliente e crédito, e retorna. As dezenas de variáveis tributárias declaradas no objeto são herança de cópia de `PCheckout_FaturarNFCe` e não são usadas no fluxo — confirma a afirmação do usuário de que o tributário é exclusivo da emissão.
4. **A validação de empresa é fail-fast e retorna antes das demais.** Empresa vazia/inexistente, condição inexistente e cliente inexistente interrompem o procedure imediatamente — a resposta traz uma única mensagem. Isso significa que uma venda com dois problemas pode precisar de duas rodadas de correção; comportamento do ERP, não do Checkout, e não há como o Checkout antecipá-lo sem reimplementar as regras (proibido pela Constitution III).
