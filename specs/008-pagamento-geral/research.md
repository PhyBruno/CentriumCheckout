# Phase 0 — Research: Pagamento (Geral)

**Feature**: `008-pagamento-geral` | **Date**: 2026-08-26 | **Plan**: `specs/008-pagamento-geral/plan.md`

Fontes consultadas: `specs/008-pagamento-geral/spec.md` (FR-001..FR-018), `.specs/features/pagamento-geral/spec.md` (`PAY-01`..`PAY-10`), `.specs/project/STATE.md` (AD-019, AD-023, AD-024, AD-030, AD-036, AD-039, AD-046, AD-048, AD-061, AD-064, AD-072, AD-073, AD-074, AD-078, AD-085), `.specs/project/PENDENCIES.md` (item 25 aberto), `.specs/codebase/ARCHITECTURE.md`, `.specify/memory/constitution.md`, o contrato real `Fluxograma - Diagrama - Alinhamentos/APICentriumOAuth.yaml` e os designs já concluídos das features 001 e 003.

Todas as `NEEDS CLARIFICATION` do Technical Context estão resolvidas abaixo. Três decisões produziram **ADs novos** (AD-097, AD-098, AD-099) e uma **pendência nova** (item 32) — registrados em `.specs/project/STATE.md` e `.specs/project/PENDENCIES.md`.

---

## D1 — Origem das formas e condições de pagamento: não existe endpoint dedicado

**Decision**: As condições e formas de pagamento **não** vêm de um endpoint próprio. Elas chegam embutidas no payload de sessão, em `SessaoUsuario.CondicoesDePagamento[]` (`APICentriumOAuth.yaml`, linhas 865-938), consumido pelo Checkout através de `GET /api/bootstrap` (BFF da feature 002). A camada de acesso é um hook TanStack Query (`useCondicoesPagamento`) com `staleTime` de 30 minutos sobre `/api/bootstrap`, exatamente o número que `PAY-01` fixa.

**Rationale**: A varredura completa do contrato não encontra nenhum path do tipo `/GetFormasPagamento` ou `/GetCondicoesPagamento` — os únicos endpoints de pagamento são `ValidaTicketDevolucao`, `GerarPIX`, `StatusPIX` e `FaturarNFCe`. `CondicoesDePagamento` é um nível (`x-gx-level: "SessaoUsuario"`) dentro da SDT de sessão. A redação de `PAY-01` ("buscar formas/condições via TanStack Query") descrevia o **mecanismo de cache** correto sem nomear a origem, o que poderia levar a implementação a inventar um endpoint inexistente. Registrado como **AD-097** e corrigido in-place em `.specs/features/pagamento-geral/spec.md`.

**Alternatives considered**:
- *Ler direto do Dexie (bootstrap persistido pela feature 002)*: rejeitado — Dexie guarda o bootstrap para sobreviver a F5, mas não tem invalidação por tempo; `PAY-01` exige frescor de 30 min, que é semântica de cache de servidor (TanStack Query), não de armazenamento local. O Dexie permanece como a camada de persistência do bootstrap; a query lê o mesmo recurso com política de frescor própria.
- *Chamar `GetSessao` diretamente via `/api/erp/*`*: rejeitado — `GetSessao` devolve o payload completo (~5MB, incluindo campos sensíveis de sessão); `/api/bootstrap` já é a fronteira que a feature 002 definiu para expor só o não-sensível ao JS.

---

## D2 — Split é entre formas dentro de **uma** condição de pagamento

**Decision**: A venda tem **uma única** condição de pagamento (`CondicaoPagamentoCodigo`) e **N** formas aplicadas. O split de `FR-011` acontece entre formas, nunca entre condições. Trocar a condição depois de já haver formas aplicadas exige limpar as formas (o operador é avisado e confirma).

**Rationale**: O contrato é explícito e assimétrico: `CheckoutFaturarNFCe.CondicaoPagamentoCodigo` é escalar `integer/int64` (linha 1431), enquanto `CheckoutFaturarNFCe.FormasDePagamento` é `array` (linha 1459). Não há como expressar duas condições na mesma NFCe. Modelar o estado com um array de condições seria criar um estado impossível de serializar — o tipo passa a mentir sobre o domínio.

**Alternatives considered**: *Permitir condições distintas por forma e enviar a primeira*: rejeitado — perde informação silenciosamente no envio, exatamente o tipo de divergência Checkout↔ERP que a Constitution III existe para impedir.

---

## D3 — Troco não existe no contrato: é grandeza de UI, não de payload

**Decision**: O troco é calculado e exibido, mas **nunca** entra em `CheckoutFaturarNFCe`. Para a forma dinheiro, o estado guarda dois valores distintos: `valorRecebido` (o que o cliente entregou, usado só para exibir o troco) e `valorAplicado` (o que efetivamente quita a venda, que é o que vai em `FormaValor`). Invariante: `Σ FormaValor == total líquido da venda`.

**Rationale**: `CheckoutFaturarNFCe.FormasDePagamento_FormasDePagamentoItem` (linhas 1510-1550) não tem campo de troco nem de valor recebido — só `FormaValor`. Enviar o valor recebido em `FormaValor` faria a soma das formas exceder o total da nota, quebrando o fechamento fiscal. Separar as duas grandezas no modelo torna o erro impossível de cometer, em vez de depender de disciplina no call site.

**Alternatives considered**: *Guardar só `valorRecebido` e subtrair o troco na montagem do payload*: rejeitado — espalha a regra monetária para fora do domínio e torna o payload dependente de um cálculo feito na feature 004.

---

## D4 — Uma única forma "dinheiro" por venda é invariante de estado, não validação de UI

**Decision**: `aplicarPagamento` rejeita (no-op + toast, `FR-013`) qualquer segunda forma cujo `FormaMeioPagtoNFe` seja `Dinheiro`. A regra vive no domínio puro (`podeAplicarForma`), não no componente.

**Rationale**: AD-036 fixa a exclusividade. Se a checagem morar no componente, um segundo ponto de entrada (atalho de teclado, retomada de rascunho) a contorna. Como invariante de domínio, ela é testável sem montar React e vale para qualquer call site.

**Alternatives considered**: *Permitir múltiplas entradas de dinheiro e somar*: rejeitado explicitamente por AD-036 — o cálculo de troco deixaria de ter uma entrada única de referência.

---

## D5 — Roteamento por `FormaMeioPagtoNFe`, com capacidades injetadas

**Decision**: `resolverIntegracao(forma, capacidades)` é uma função pura que devolve `'TEF' | 'PIX_DINAMICO' | 'NENHUMA'`. As `capacidades` (`tefAtivo`, `pixAtivo`, `plataforma`) são **injetadas**, nunca lidas de dentro do domínio. Tabela de decisão:

| `FormaMeioPagtoNFe` | Condição | Resultado |
|---|---|---|
| `CartaoCredito`, `CartaoDebito` | `tefAtivo && plataforma !== 'MOBILE'` | `TEF` |
| `CartaoCredito`, `CartaoDebito` | caso contrário | `NENHUMA` |
| `Pix` | `pixAtivo` | `PIX_DINAMICO` |
| `Pix` | `!pixAtivo` | forma oculta/desabilitada (`FR-003`) |
| `PixEstatico` | sempre | `NENHUMA` (`FR-006`) |
| qualquer outro | sempre | `NENHUMA` |

**Rationale**: `PAY-08` define a regra e AD-074 acrescenta a exclusão mobile do TEF (PIX permanece). Injetar as capacidades é o que satisfaz a Constitution II (Dependency Inversion): o domínio de pagamento não importa o slice de sessão nem o hook de layout, e o teste cobre as 4 combinações de flags sem montar nada. Também é o que mantém a feature 008 **independente** das features 009 (PIX) e 010 (TEF): ela decide *qual* integração acionar e devolve o veredito; *como* acionar é responsabilidade delas.

**Alternatives considered**: *Ler `ConfiguracoesTEF.TEFAtivo` direto de dentro do domínio*: rejeitado — acopla a matemática de roteamento ao formato do bootstrap e impede testar o caso mobile sem stubar o store.

---

## D6 — `FormaIntegracaoCartao` é ecoado, não interpretado (nesta fase)

**Decision**: O campo `FormaIntegracaoCartao` (`'1'` = TEF/`PagtoIntegrado`, `'2'` = POS/avulso) é lido do cadastro da forma, copiado para o `PagamentoAplicado` e ecoado em `CheckoutFaturarNFCe.FormasDePagamento[].FormaIntegracaoCartao`. Ele **não** participa da decisão de `resolverIntegracao` nesta feature.

**Rationale**: AD-078 confirmou que o campo existe e resolve o item 30 de `PENDENCIES.md`, mas AD-073 manteve deliberadamente a regra de `PAY-08` como está — todo cartão com `TEFAtivo=true` roteia para TEF. Antecipar o refinamento seria implementar um requisito que nenhum `FR-xxx` pede. A tabela de D5 é uma função de tabela: refiná-la depois é acrescentar uma linha, sem tocar nos call sites (Open/Closed).

**Alternatives considered**: *Já usar `FormaIntegracaoCartao === '1'` como condição adicional para TEF*: rejeitado — mudaria comportamento sem AD que o autorize e quebraria empresas cujo cadastro não preenche o campo.

---

## D7 — Desconto de item é delegado ao carrinho; a feature 008 só possui o desconto de capa

**Decision**: `FR-014` (desconto direto no item) é atendido pelo mecanismo **já contratado** pela feature 003: `carrinhoSlice.editarItem(idLinha, 'descontoLinha', valor)`. A feature 008 não cria caminho paralelo — a UI de desconto de item chama essa action. O slice de pagamento possui exclusivamente o **desconto de capa** (`FR-015`/`FR-016`).

**Rationale**: `specs/003-carrinho-produto-precificacao/contracts/precificacao-domain-api.md` já expõe `CampoEditavel = 'quantidade' | 'precoUnitario' | 'descontoLinha'` e `calcularTotalLinha` já subtrai `descontoLinha` do total bruto. Duplicar isso criaria duas fontes de verdade para o total da linha — violação direta da Constitution V (auditabilidade) e do Single Responsibility.

**Alternatives considered**: *Um `descontosSlice` próprio cobrindo item + capa*: rejeitado — moveria o desconto de linha para fora do lugar onde a reprecificação o consome, forçando o carrinho a importar o slice de desconto.

---

## D8 — Rateio do desconto de capa: divisão igual com clamp e redistribuição

**Decision** (decisão direta do usuário, 2026-08-26 → **AD-098**): o desconto de capa é dividido **igualmente** entre os itens ativos, com o resto de centavo pelo método do maior resto (AD-072). Como a divisão igual pode atribuir a um item barato uma parcela maior que o próprio total da linha, o algoritmo aplica **clamp e redistribuição**:

1. Guarda de entrada: `descontoCapa <= subtotalLiquido` da venda. Acima disso a aplicação é bloqueada com toast — é o que garante a convergência do passo 3.
2. Distribui `descontoCapa` igualmente entre as `N` linhas ativas via `distribuirPorMaiorResto(descontoCapa, pesosIguais)`.
3. Toda linha cuja parcela exceda seu `totalLiquido` tem a parcela **fixada** nesse teto e sai do conjunto elegível; o excedente acumulado é redistribuído igualmente entre as linhas restantes, repetindo até não haver mais estouro.
4. Invariantes verificadas por teste: `Σ parcelas === descontoCapa` e `parcela_i <= totalLiquido_i` para toda linha.

O rateio é materializado **apenas na montagem do payload** (`PAY-10` AC3: "WHEN o JSON de `FaturarNFCe` é montado"); no estado, o desconto de capa continua sendo um único valor, preservando a capacidade de removê-lo sem reconstruir os itens.

**Rationale**: A alternativa proporcional foi apresentada ao usuário com o risco fiscal explícito e ele optou pela divisão igual, que é a redação literal de `PAY-10` AC3. O clamp é a adição mínima que impede o modo de falha real (item com `ValorTotal` negativo é rejeitado na SEFAZ) sem trocar o critério escolhido. O passo 1 é o que torna o laço do passo 3 finito: com o total do desconto limitado ao subtotal, sempre existe folga suficiente no conjunto restante.

**Alternatives considered**: *Rateio proporcional ao total líquido da linha* — apresentado como recomendação (padrão fiscal de NF-e, nunca negativa um item, dispensa clamp), **rejeitado por decisão direta do usuário** em favor da fidelidade à redação de `PAY-10`.

---

## D9 — Ticket devolução: `Valido` como fonte primária, `Mensagem` como fallback

**Decision** (decisão direta do usuário, 2026-08-26 → **AD-099**): `interpretarRespostaTicket` usa `resposta.Valido` quando o campo vem presente; quando vem ausente/`undefined`, cai para a comparação `resposta.Mensagem === 'Ticket Válido'`. O valor aplicado é sempre `ValorTicket`.

**Rationale**: Há contradição real entre as fontes. `ApiCentriumOAuth.yaml` (linhas 668-676) declara `ValidaTicketDevolucaoOutput` com **três** campos — `ValorTicket`, `Valido: boolean` e `Mensagem: string` — enquanto AD-023 afirma que "não existe campo booleano de validade" e fixa a comparação de `Mensagem` ao literal, a partir de inspeção da KB (`PCheckout_ValidaTicketDevolucao` → `PValidaTicketNfCe.Call`). As duas leituras podem ser simultaneamente verdadeiras se o campo existir no contrato mas não for preenchido pelo procedure. O fallback cobre os dois mundos sem travar a operação de caixa. AD-023 foi corrigido in-place e o ponto virou o **item 32** de `PENDENCIES.md`, para o ERP confirmar se `Valido` é efetivamente preenchido.

**Alternatives considered**:
- *Só `Mensagem === 'Ticket Válido'`*: mais fiel a AD-023, mas frágil a qualquer mudança de texto no ERP (inclusive acentuação).
- *Exigir `Valido === true` E `Mensagem === 'Ticket Válido'`*: mais seguro contra falso-positivo, rejeitado por bloquear a operação se o ERP preencher apenas um dos dois.

---

## D10 — Elegibilidade de vale devolução: ausência de dado é elegibilidade

**Decision**: `ehElegivelParaVale(forma)` devolve `true` quando `FormaFpgUtiCar` é vazio/ausente, e `true` quando o valor indica vale devolução (`'VDV'`). Só um valor explicitamente diferente torna a forma inelegível.

**Rationale**: AD-048 é uma decisão direta do usuário, **contrária** à recomendação apresentada na época — o campo só é preenchido quando a empresa tem regra dinâmica de forma de pagamento configurada (AD-024); no branch de fallback do ERP ele vem vazio, e tratar isso como "inelegível" bloquearia a maioria das empresas. O risco (aceitar ticket numa forma que a regra dinâmica talvez recusasse) foi explicitamente aceito.

**Alternatives considered**: *Vazio = inelegível*: rejeitado por AD-048.

---

## D11 — `podeMutarCarrinho()` mora aqui e distingue bloqueio permanente de reversível

**Decision**: A feature 008 implementa e exporta `podeMutarCarrinho()`, que a feature 003 já declara consumir por injeção. Retorna `false` quando existe **qualquer** pagamento aprovado. A distinção de AD-030/`CART-09` fica em `removerPagamento`: pagamentos com integração externa aprovada (`TEF`, `PIX_DINAMICO`) são **irreversíveis** — não podem ser removidos, e portanto o bloqueio do carrinho é permanente; pagamentos sem integração (dinheiro, cartão manual) podem ser removidos, o que devolve a mutabilidade ao carrinho.

**Rationale**: Um pagamento aprovado por terminal físico ou por PIX já movimentou dinheiro fora do Checkout; removê-lo do estado local criaria divergência com o ERP e com o adquirente (Constitution III). O predicado ser injetado — e não importado — é o que permite à feature 003 testar o bloqueio passando `() => false`, sem montar estado de pagamento.

**Alternatives considered**: *Bloqueio permanente para toda forma aplicada*: rejeitado — impediria corrigir um erro de digitação em pagamento em dinheiro, operação corriqueira no balcão.

---

## D12 — Duplicata: a garantia é a ausência de código, provada por teste negativo

**Decision**: Nenhum caminho de código gera, oferece ou imprime documento para `FormaMeioPagtoNFe === 'DuplicataMercantil'` (`FR-018`). A conformidade é afirmada por um teste que aplica essa forma e verifica que o serviço de impressão local não é invocado.

**Rationale**: AD-064 é uma decisão direta do usuário. Um requisito `MUST NOT` sem teste é indistinguível de um requisito esquecido — o teste negativo é o que impede uma feature futura de impressão de reintroduzir o comportamento silenciosamente.

**Alternatives considered**: *Não escrever teste, apenas não implementar*: rejeitado pelo motivo acima.

---

## D13 — Eventos de auditoria consumidos, não redefinidos

**Decision**: A feature 008 chama `registrarEventoAuditoria` com as factory functions tipadas da feature 001 para cinco eventos: `CONDICAO_PAGAMENTO_APLICADA`, `FORMA_PAGAMENTO_APLICADA`, `FORMA_PAGAMENTO_REMOVIDA`, `VALE_DEVOLUCAO_USADO` e `PAGAMENTO_RECUSADO` (`FR-017`, AD-061). Nenhum tipo de evento novo é criado por esta feature.

**Rationale**: `specs/001-auditoria-acoes-operador/contracts/auditoria-events.md` já lista a 008 entre as features consumidoras e fixa o dispatcher síncrono sem retorno. Seguir o mesmo padrão da feature 003 (que também só consome) mantém o `Log` de `FaturarNFCe` com um único formato.

**Nota**: recusas vindas das integrações (TEF na feature 010, PIX na 009) emitem `PAGAMENTO_RECUSADO` pelo mesmo dispatcher, com o payload de detalhes definido lá — esta feature emite o evento apenas para as recusas que ela mesma detecta (ex.: ticket inválido, bloqueio de segunda forma dinheiro).

---

## D14 — Item 25 de `PENDENCIES.md` não bloqueia esta feature

**Decision**: O bloqueio deliberado sobre o protocolo de TEF (item 25, AD-037 — o parceiro será trocado) **não** impede concluir este design. A fronteira desenhada aqui é `resolverIntegracao(...) === 'TEF'`; o que acontece a partir daí pertence à feature 010.

**Rationale**: É precisamente o benefício da injeção de D5 — a feature 008 fica completa e testável com um stub de integração, e a troca de parceiro de TEF não toca nenhum arquivo desta feature.
