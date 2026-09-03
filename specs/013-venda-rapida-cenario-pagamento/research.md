# Phase 0 — Research: Venda Rápida por Cenário de Pagamento (F6–F9)

**Feature**: `specs/013-venda-rapida-cenario-pagamento/spec.md`
**Data**: 2026-08-31
**Fontes primárias**: inspeção direta da KB GeneXus do ERP (`CentriumDEVU6`) via MCP `genexus` — objetos `PCheckout_GetSessao`, `TCenarioPagamento` (Transaction e Table), `PCenarioPagamento_RevisaTeclasAtalho`, `PCenarioPagamento_BuscaPorTeclaAtalho`, `SDTCenarioPagamento`; contrato `Fluxograma - Diagrama - Alinhamentos/ApiCentriumOAuth.yaml` versão `20260827192357`.

> Toda afirmação de contrato abaixo foi lida no código-fonte real da KB nesta data, não inferida. Onde a KB **não** responde (D4), o ponto está explicitamente aberto como pendência, não presumido.

---

## D1 — Origem do catálogo: campo do `GetSessao`, não endpoint próprio

**Decisão**: o catálogo de cenários é lido de `SessaoUsuario.CenarioPagamento`, entregue no payload de bootstrap já existente (`GET /api/bootstrap` → `GET /ApiCentriumOAuth/GetSessao`). Nenhuma chamada nova ao ERP é introduzida por esta feature.

**Rationale**: `ApiCentriumOAuth.yaml` (linha 903) declara `CenarioPagamento: {type: string}` dentro do schema de sessão, e `PCheckout_GetSessao` popula esse campo no mesmo fluxo que já monta `CondicoesDePagamento[]`. Não existe path dedicado a cenários no contrato. É exatamente o mesmo padrão de AD-097 (formas/condições de pagamento também vêm embutidas na sessão) — reconhecer isso evita que a implementação invente um endpoint inexistente.

**Alternativas consideradas**: (a) endpoint dedicado — não existe, descartado por inspeção do contrato; (b) reusar `PCenarioPagamento_BuscaPorTeclaAtalho` (procedure que o PDV atual usa para resolver uma tecla em tempo real) — descartado: é procedure interna da KB, **não está exposta na API REST**, e exigiria uma ida ao servidor por tecla pressionada, contra a meta de resposta imediata (`SC-002`).

**Registrado como AD-104** em `.specs/project/STATE.md`.

---

## D2 — Formato do campo: JSON de strings delimitadas por `;` (parse em duas etapas)

**Decisão**: tratar `CenarioPagamento` como **string contendo um array JSON de strings**, e cada string como **7 campos posicionais separados por `;`**, na ordem:

| # | Campo (ERP) | Tipo na origem | Uso no Checkout |
|---|---|---|---|
| 0 | `CPgFpgCod` | NUMERIC(2) | código da forma de pagamento |
| 1 | `CPgFpgDes` | VARCHAR(16) | descrição da forma (não exibida — ver D9) |
| 2 | `CPgPraCod` | NUMERIC(4) | código da condição de pagamento |
| 3 | `CPgPraDes` | VARCHAR(128) | descrição da condição (não exibida — ver D9) |
| 4 | `CPgNome` | VARCHAR(60) | **rótulo exibido ao operador** |
| 5 | `CPgIsEncerraOperacao` | Boolean | dispara finalização automática |
| 6 | `CPgTeclaAtalho` | VARCHAR(40) | tecla candidata a atalho |

**Rationale**: é literalmente o que `PCheckout_GetSessao` faz — concatena os sete campos com `';'`, adiciona cada string a uma coleção e atribui `&CenarioPagamento.ToJson()` ao campo. O parse precisa ser em duas etapas (JSON → array de strings; string → campos) porque o ERP não entrega objetos estruturados.

**Alternativas consideradas**: pedir ao ERP que serialize um array de objetos JSON tipado (como já faz em `CondicoesDePagamento[]`) — é a forma correta a longo prazo e está registrada como pendência em D3, mas **não bloqueia** esta feature: o formato atual é parseável de forma segura desde que itens fora do padrão sejam descartados.

---

## D3 — O delimitador `;` é ambíguo em três campos de texto livre → descarte determinístico

**Decisão**: um item cujo `split(';')` não produza **exatamente 7 partes** é descartado (`FR-004`). Nenhuma heurística de recuperação é aplicada.

**Rationale**: `CPgFpgDes` (16), `CPgPraDes` (128) e `CPgNome` (60) são texto livre digitado no cadastro do ERP e podem conter `;`. Como esses três campos ficam **no meio** da sequência (índices 1, 3 e 4), um item com 8 partes é genuinamente ambíguo: não há como saber qual dos três recebeu o separador extra, e portanto não há como localizar com certeza o código da condição. Numa feature que lança pagamento e pode finalizar a venda sozinha, um parse "provavelmente certo" é pior que nenhum atalho: descartar produz ausência visível de um botão; adivinhar produz um pagamento na condição errada.

**Alternativas consideradas**:
- **Ancorar pela cauda** (últimos dois campos são sempre `encerra` e `tecla`, o primeiro é sempre `FpgCod`) — recupera parte do item, mas deixa `CPgPraCod` ambíguo exatamente quando `CPgFpgDes` contém `;`. Rejeitada por ser heurística não determinística sobre o campo que define a condição de pagamento.
- **Aceitar e truncar em 7 partes** — silenciosamente deslocaria os campos. Rejeitada.

**Fechado (2026-08-31, decisão direta do usuário)**: serialização estruturada **não é viável** no ERP — o formato delimitado é definitivo. Em contrapartida, fica garantido que os campos de texto do cadastro **não conterão `;`**, de modo que a ambiguidade acima não deve ocorrer na prática. O descarte permanece implementado como **defesa** contra dado inesperado, não como tratamento de caso esperado. Sem pendência aberta. **Registrado como AD-105.**

---

## D4 — Literal do booleano `CPgIsEncerraOperacao`: interpretação fail-safe

**Decisão**: interpretar como verdadeiro apenas um conjunto fechado de literais, comparados sem distinção de caixa e com espaços removidos: `true`, `1`, `s`, `sim`, `y`, `yes`. Qualquer outro valor — incluindo string vazia e valores inesperados — é tratado como **falso** (`FR-018`).

**Rationale**: `CPgIsEncerraOperacao` é `Boolean` na tabela e chega ao campo via `.ToString()`, cuja representação exata depende do gerador da KB (`True`/`true`/`1` são todas plausíveis) — a KB não permite determinar o literal sem observar uma resposta real do endpoint. A assimetria é deliberada e segue o princípio de menor dano: interpretar erroneamente como **falso** custa ao operador um clique a mais em "Finalizar Venda"; interpretar erroneamente como **verdadeiro** finaliza uma venda que o operador não mandou finalizar — e finalização emite NFCe, que é irreversível pelo Checkout.

**Alternativas consideradas**: aceitar qualquer valor não vazio como verdadeiro — rejeitada pela assimetria de dano acima (`False` não vazio viraria `true`).

**Fechado (2026-08-31, decisão direta do usuário)**: aceitar um conjunto de literais é a solução **definitiva**, não uma tolerância provisória — o conjunto não será estreitado depois e não há literal a confirmar com o ERP. Sem pendência aberta. **Registrado como AD-106.**

---

## D5 — Normalização e filtro da tecla

**Decisão**: normalizar `CPgTeclaAtalho` com `trim()` + caixa alta e aceitar somente `F6`, `F7`, `F8`, `F9` (`FR-003`). Todo o resto é descartado silenciosamente.

**Rationale**: `CPgTeclaAtalho` é `VARCHAR(40)` **sem domínio** na transação — o ERP aceita qualquer texto, e nada impede `f6`, ` F6 `, `F12` ou `Ctrl+D`. A faixa F6–F9 é restrição do Checkout, não do ERP (ver D6). O teto de 4 atalhos de `FR-006` é consequência aritmética da faixa combinada com a unicidade de tecla — não é um limite configurável separado.

**Alternativas consideradas**: aceitar toda a faixa F1–F12 delegando a escolha ao cadastro — rejeitada porque F1–F5 e F10–F12 colidem com atalhos já previstos ou reservados do navegador, e porque o pedido do usuário fixou F6–F9.

---

## D6 — O que o ERP garante e o que não garante

**Decisão**: confiar na unicidade de tecla por empresa, mas **implementar a defesa mesmo assim** (`FR-006`), resolvendo empate de forma determinística: vence o primeiro item na ordem em que o ERP devolveu (que é `Order CPgEmpCod CPgFpgCod`, portanto estável entre chamadas).

**Rationale**: `PCenarioPagamento_RevisaTeclasAtalho`, chamada em `AfterComplete` do cadastro, esvazia `CPgTeclaAtalho` de qualquer outro cenário da mesma empresa que use a tecla — a unicidade existe. Mas ela só roda **no cadastro**: registros legados anteriores à regra, ou gravados por outra via, podem violá-la. A defesa custa uma linha e elimina a classe inteira de bug "a tecla faz coisas diferentes dependendo do dia".

Em contrapartida, três coisas que o ERP **não** garante e que a implementação não pode presumir: não há limite de 4, não há restrição de faixa de tecla, e o `For each` de `PCheckout_GetSessao` **não filtra por tecla preenchida** — cenários sem atalho vêm no mesmo array e precisam ser descartados pelo Checkout.

---

## D7 — Onde o estado vive: projeção derivada do bootstrap, fora do `vendaStore`

**Decisão**: a lista de atalhos é uma **projeção pura e memoizada** do payload de sessão, cruzada com `CondicoesDePagamento[]`; não entra no store Zustand da venda. Só o guard de concorrência do acionamento (`D8`) é estado de venda.

**Rationale**: o catálogo é configuração de tenant, tem o mesmo ciclo de vida do bootstrap (Dexie, feature 002) e não muda durante a venda. Colocá-lo no `vendaStore` violaria a fronteira já estabelecida pela skill `zustand-immer-state` (o carrinho não referencia dados vivos do Dexie/TanStack Query) e faria o catálogo ser descartado a cada venda sem necessidade. Constitution VI permanece intocada: nada de estado de venda é persistido.

**Alternativas consideradas**: slice próprio no `vendaStore` — rejeitado pela fronteira acima; recomputar a projeção a cada tecla — rejeitado por desperdício, já que a entrada é imutável durante a sessão.

---

## D8 — Acionamento em qualquer momento da venda, com guard de concorrência

**Decisão**: um único comando `acionarCenario(tecla)` que (1) recusa se não houver itens ou saldo em aberto, (2) garante que a venda esteja na etapa de pagamento, (3) lança o pagamento e (4) decide sobre a finalização. Um guard booleano de acionamento em andamento rejeita qualquer novo acionamento até o anterior concluir (`FR-015`).

**Rationale**: decisão direta do usuário (2026-08-31) — as teclas valem em qualquer momento da venda, inclusive com o carrinho aberto, caso em que a tecla leva à etapa de pagamento e lança o cenário na mesma ação (`FR-019`). O guard é obrigatório justamente por isso: com o atalho disponível o tempo todo, o teclado repetindo (`keydown` contínuo) ou dois toques rápidos poderiam gerar dois lançamentos do saldo integral.

**Alternativas consideradas**: fila de acionamentos — rejeitada; enfileirar pagamentos é exatamente o comportamento errado aqui (o segundo lançamento já não teria saldo). Debounce por tempo — rejeitado por ser probabilístico; o guard de estado é determinístico.

---

## D9 — Rótulo exibido: `CPgNome`, não as descrições

**Decisão**: exibir `CPgNome` (e a tecla) na dica visual de `FR-016`; `CPgFpgDes` e `CPgPraDes` são parseados mas não exibidos.

**Rationale**: `CPgNome` é o campo que a loja preenche justamente para nomear o cenário, é obrigatório no cadastro (regra `Error('Nome do Cenário de pagamento é Obrigatório')` na transação) e tem 60 caracteres contra os 16 de `CPgFpgDes`. As descrições servem de apoio para diagnóstico/log, não para a UI.

---

## D10 — Reuso do domínio das features 008/004: esta feature não reimplementa pagamento

**Decisão**: o lançamento usa a API de domínio da feature 008 (aplicação de forma de pagamento, saldo em aberto em `Centavos`, roteamento por integração) e a finalização usa a da feature 004. A feature 013 é uma **camada de comando** sobre elas.

**Rationale**: Constitution II e V. Saldo em aberto e valor lançado são dinheiro — precisam vir de `Centavos` inteiros do domínio já testado da 003/008, nunca de um cálculo novo. Roteamento de TEF/PIX já existe como função pura de tabela em 008 (`resolverIntegracao`) e é reaproveitado sem alteração: por decisão do usuário, cenários com forma que exige TEF ou PIX dinâmico **continuam elegíveis** a atalho, e a tecla apenas substitui o gesto de selecionar a forma (`FR-013`).

**Consequência sobre a finalização automática**: quando a forma exige integração externa, o pagamento só é considerado lançado após a aprovação da integração — logo a finalização automática de `FR-010` é avaliada **depois** desse retorno, nunca no instante da tecla.

---

## D11 — Desktop-only expresso como dado, não como ramo de código

**Decisão**: a exclusividade de desktop (`FR-020`) é aplicada pela mesma capacidade `plataforma` já injetada na feature 008 — a projeção de atalhos devolve lista vazia quando a plataforma é mobile.

**Rationale**: decisão direta do usuário (2026-08-31): venda rápida restrita ao desktop, sem equivalente tocável. Modelar como dado injetado (e não como `if (isMobile)` espalhado na UI) repete o padrão de capacidade injetada que AD-074 estreou — **o padrão continua válido, a regra de TEF que o originou não: AD-144 (2026-09-03) liberou o TEF no mobile** —, mantém a regra testável sem renderizar componente e evita divergência entre "não mostra" e "não aciona" — com lista vazia, as duas coisas são a mesma coisa.

---

## D12 — Atalhos de teclado: mapa central e não colisão com bipagem

**Decisão**: registrar F6–F9 no mapa central de atalhos do Checkout (`react-hotkeys-hook`), com disparo desabilitado enquanto o foco estiver em campo de entrada, e com teste automatizado por atalho (`FR-014`).

**Rationale**: exigência da skill de projeto `react-hotkeys-pdv` — todo atalho novo passa por mapa central e por teste. O risco concreto aqui não é teórico: o leitor de código de barras emite uma sequência de teclas, e um atalho global mal registrado no meio de uma bipagem lançaria um pagamento durante a digitação de itens. Como esta feature deixa os atalhos ativos durante toda a venda (D8), essa proteção deixa de ser higiene e vira requisito de correção.

---

## D13 — Auditoria do acionamento

**Decisão**: emitir um evento de auditoria por acionamento, contendo tecla, nome do cenário, condição, forma, valor lançado e se houve finalização automática (`FR-017`), pelo contrato de eventos da feature 001.

**Rationale**: um atalho comprime várias ações do operador em um gesto; sem o evento, a trilha de auditoria da venda mostraria um pagamento (e possivelmente uma NFCe emitida) sem nenhum registro do gesto que os originou. A feature 001 já serializa a trilha no campo `Log` de `FaturarNFCe`, então o custo é acrescentar um tipo de evento, não construir mecanismo.

---

## Achados de contrato colaterais (fora do escopo desta feature, registrados para não se perderem)

A leitura de `PCheckout_GetSessao` e do diff de `ApiCentriumOAuth.yaml` (`20260826163735` → `20260827192357`) revelou mudanças que **não** pertencem a esta feature, mas que afetam features já especificadas e precisam de tratamento próprio:

1. **`ValidarNFCe`** — novo endpoint (`POST`, recebe `CheckoutFaturarNFCe`, devolve `Valido` + `messages`). **Destino corrigido (2026-08-31, ver `plan.md` § "Emenda de 2026-08-31"):** não é a feature 004 — virou a feature 014 (validação prévia da venda no ERP), aplicada no momento da inserção do pagamento, não da finalização (AD-109). Esta própria feature (013) já reflete a decisão em `FR-021`/`FR-022`: o atalho passa pelo mesmo gate ao chamar `aplicarForma` (008).
2. **`DavNum` removido** de `CheckoutFaturarNFCe`. **Resolvido em 2026-08-31 (AD-107), sem impacto:** o ERP identifica sozinho que a NFCe faturada veio de um DAV, então o Checkout nunca precisou levar o número do DAV à NFCe (mesma mecânica de AD-058). A feature 006 apenas deixou de modelar o campo.
3. **`ListaPrecoDefault`** acrescentado a `SessaoUsuario` e populado por `PCheckout_GetSessao` a partir de `CliListCod` do cliente default (com fallback `1`). **Resolvido em 2026-08-31 (AD-108):** é a lista de preço do **cliente default** e fecha por completo o item 31 de `PENDENCIES.md` — com o cliente default, o Checkout envia esse valor em `Listapreco` de `GetProduto` quando `TipoPreco = 9`, não chama `GetCliente` e trata o convênio como inexistente (`descontoConvenio = 0`). Features 005 e 003 atualizadas.
4. **`FormaEntrada`** (`FpgEnt`) acrescentado a `CondicaoFormasDePagamento[]`. Afeta a feature 008.
5. **`FormaFpgUtiCar` continua não sendo preenchido no branch de fallback** ("puxa todos") de `PCheckout_GetSessao` — confirma a ressalva de AD-048 e mantém válida a decisão de tratar vazio como elegível.

Destes cinco pontos, três já foram tratados fora desta feature: `DavNum` (AD-107), `ListaPrecoDefault` (AD-108) e `ValidarNFCe` (destino corrigido para a feature 014, AD-109 — ver `plan.md` § "Emenda de 2026-08-31"). Os dois restantes (`FormaEntrada`, item 4, e a confirmação sobre `FormaFpgUtiCar`, item 5) seguem registrados em `.specs/project/PENDENCIES.md` (item 36) para tratamento na feature 008 — **nenhum deles é resolvido por esta feature**.
