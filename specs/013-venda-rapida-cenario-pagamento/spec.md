# Feature Specification: Venda Rápida por Cenário de Pagamento (teclas F6–F9)

**Feature Branch**: `[013-venda-rapida-cenario-pagamento]`

**Created**: 2026-08-31

**Status**: Draft

**Input**: User description: "Receberemos do ERP via GetSessao um mapeamento de até 4 teclas para inserção de condição/forma na venda rápida. O GetSessao retornará a tecla a ser utilizada (de F6 a F9 apenas serão utilizadas), e qual condição e forma de pagamento irá inserir automaticamente. O endpoint ainda retornará se após a inserção a venda será automaticamente finalizada ou não."

## Contexto

O operador de caixa repete, dezenas de vezes por dia, a mesma sequência de cliques para os pagamentos mais comuns da loja (ex.: "dinheiro à vista", "cartão de débito à vista"). O ERP já permite que a empresa cadastre **cenários de pagamento** — combinações nomeadas de condição + forma de pagamento — e associe a cada um uma **tecla de atalho**. Esta feature traz esses cenários para o Checkout: o operador pressiona uma tecla de função e o pagamento inteiro é lançado de uma vez, opcionalmente já finalizando a venda.

**Origem dos dados (confirmada por inspeção direta da KB do ERP em 2026-08-31):** o catálogo vem embutido no payload de `GetSessao`, no campo `SessaoUsuario.CenarioPagamento` — **não existe endpoint dedicado de cenários de pagamento**. A procedure `PCheckout_GetSessao` monta esse campo percorrendo a tabela `TCenarioPagamento` (chave `CPgEmpCod` + `CPgFpgCod` + `CPgPraCod`) e serializando cada registro como uma string de 7 campos separados por `;`, na ordem `CPgFpgCod;CPgFpgDes;CPgPraCod;CPgPraDes;CPgNome;CPgIsEncerraOperacao;CPgTeclaAtalho`; o conjunto dessas strings é entregue como um **array JSON serializado dentro de um único campo string**.

**Limites que o ERP impõe e os que ele não impõe** — distinção importante, verificada na KB:

- O ERP **garante unicidade da tecla por empresa**: a regra `PCenarioPagamento_RevisaTeclasAtalho`, disparada no cadastro, limpa a tecla de qualquer outro cenário da mesma empresa que use a mesma tecla.
- O ERP **não limita a quatro cenários com atalho**, **não restringe as teclas a F6–F9** (`CPgTeclaAtalho` é texto livre, sem domínio) e **não filtra cenários sem atalho na consulta** — o `For each` de `PCheckout_GetSessao` devolve todos os cenários da empresa, inclusive os de tecla vazia. Todo esse filtro é responsabilidade do Checkout.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Lançar o pagamento inteiro com uma tecla (Priority: P1)

Como operador de caixa, quero pressionar uma tecla de função e ter o pagamento lançado com a condição e a forma já definidas pela loja, pelo valor que falta pagar, para não repetir a mesma sequência de cliques em toda venda.

**Why this priority**: É o valor central da feature — sem isso não há venda rápida. As demais histórias só refinam ou protegem este fluxo.

**Independent Test**: Pode ser testado com uma sessão que traz um cenário na tecla F6, abrindo uma venda com itens e pressionando F6: o pagamento aparece lançado com a condição e a forma do cenário e com valor igual ao saldo em aberto.

**Acceptance Scenarios**:

1. **Given** uma venda com saldo em aberto e um cenário configurado na tecla F6, **When** o operador pressiona F6, **Then** o sistema lança um pagamento com a condição e a forma do cenário, no valor exato do saldo em aberto, sem pedir nenhum dado adicional ao operador.
2. **Given** o mesmo cenário, **When** o pagamento é lançado, **Then** o saldo em aberto da venda passa a zero e o lançamento aparece na lista de pagamentos da venda como qualquer outro.
3. **Given** uma venda cujo saldo em aberto já é zero, **When** o operador pressiona a tecla do cenário, **Then** o sistema não lança nada e informa que não há valor em aberto.
4. **Given** uma venda sem nenhum item, **When** o operador pressiona a tecla do cenário, **Then** o sistema não lança nada e informa que não há venda a pagar.

---

### User Story 2 - Encerrar a venda automaticamente quando o cenário assim determinar (Priority: P1)

Como operador de caixa, quero que os cenários marcados pela loja como "encerra a operação" finalizem a venda sozinhos logo após o lançamento, para que a venda mais comum da loja termine com um único toque.

**Why this priority**: É metade do valor da feature — o ganho de tempo real vem de eliminar também o passo de finalizar. Mas depende da História 1 estar de pé.

**Independent Test**: Pode ser testado com dois cenários, um com "encerra a operação" ligado e outro desligado, confirmando que apenas o primeiro dispara a finalização.

**Acceptance Scenarios**:

1. **Given** um cenário com "encerra a operação" ligado e uma venda com saldo em aberto, **When** o operador pressiona a tecla do cenário, **Then** o sistema lança o pagamento e inicia a finalização da venda imediatamente, sem exibir diálogo de confirmação.
2. **Given** um cenário com "encerra a operação" desligado, **When** o operador pressiona a tecla do cenário, **Then** o sistema lança o pagamento e permanece na venda, aguardando ação do operador.
3. **Given** um cenário com "encerra a operação" ligado, **When** o lançamento do pagamento falha por qualquer motivo, **Then** o sistema não finaliza a venda e apresenta o erro ao operador, deixando a venda no estado anterior ao acionamento.
4. **Given** um cenário com "encerra a operação" ligado cujo lançamento, por qualquer motivo, não zerou o saldo em aberto, **When** o sistema avalia a finalização, **Then** ele não finaliza a venda e informa o saldo remanescente ao operador.

---

### User Story 3 - Enxergar quais atalhos existem (Priority: P2)

Como operador de caixa, quero ver na tela quais teclas estão disponíveis e o que cada uma faz, para usar os atalhos sem depender de memorização ou de treinamento informal.

**Why this priority**: Aumenta muito a adoção, mas os atalhos funcionam sem a dica visual — por isso não é P1.

**Independent Test**: Pode ser testado com uma sessão que traz dois cenários válidos e um inválido, confirmando que a tela mostra exatamente os dois válidos com tecla e nome.

**Acceptance Scenarios**:

1. **Given** uma sessão com cenários válidos em F6 e F8, **When** o operador está na venda, **Then** o sistema exibe, para cada cenário, a tecla e o nome do cenário.
2. **Given** uma sessão sem nenhum cenário válido, **When** o operador está na venda, **Then** o sistema não exibe nenhuma área de atalhos de venda rápida, sem mensagem de erro.
3. **Given** um cenário exibido na tela, **When** o operador aciona esse cenário pelo elemento visual em vez da tecla, **Then** o comportamento é idêntico ao do acionamento por tecla.

---

### User Story 4 - Ignorar com segurança tudo que o ERP mandar fora do padrão (Priority: P1)

Como Checkout, quero descartar silenciosamente qualquer cenário que não sirva para atalho, para que um cadastro incompleto ou fora do padrão no ERP nunca quebre a tela de pagamento nem lance um pagamento errado.

**Why this priority**: O ERP não valida nada disso na origem (ver Contexto). Sem esta história, um cadastro qualquer derruba a venda — por isso é P1 mesmo sendo defensiva.

**Independent Test**: Pode ser testado com um catálogo de teste contendo cenários sem tecla, com tecla fora de F6–F9, com número de campos diferente do esperado e com condição/forma inexistentes, confirmando que nenhum deles vira atalho e que os cenários válidos do mesmo catálogo continuam funcionando.

**Acceptance Scenarios**:

1. **Given** um catálogo com cenários sem tecla de atalho, **When** o Checkout monta a lista de atalhos, **Then** esses cenários são ignorados e não aparecem na tela.
2. **Given** um cenário com tecla fora da faixa F6–F9 (ex.: F5, F10, "ctrl+d", texto arbitrário), **When** o Checkout monta a lista de atalhos, **Then** esse cenário é ignorado.
3. **Given** um cenário cuja tecla vem em formato diferente do canônico (ex.: minúscula ou com espaços em volta), **When** o Checkout monta a lista de atalhos, **Then** o sistema o reconhece normalmente se, uma vez normalizado, corresponder a F6, F7, F8 ou F9.
4. **Given** um item do catálogo que não tem exatamente os campos esperados (por exemplo, porque um texto livre de descrição contém o próprio separador), **When** o Checkout monta a lista de atalhos, **Then** esse item é ignorado sem interromper o processamento dos demais.
5. **Given** o catálogo ausente, vazio ou em formato ilegível, **When** o Checkout monta a lista de atalhos, **Then** a venda funciona normalmente sem nenhum atalho e nenhum erro é exibido ao operador.
6. **Given** dois cenários válidos que reivindicam a mesma tecla, **When** o Checkout monta a lista de atalhos, **Then** apenas um deles fica ativo, de forma determinística, e o outro é ignorado.
7. **Given** um cenário cuja condição ou forma de pagamento não existe entre as condições/formas disponíveis para a empresa nesta sessão, **When** o Checkout monta a lista de atalhos, **Then** esse cenário é ignorado, porque acioná-lo produziria um pagamento inválido.

---

### Edge Cases

- **Operador digitando**: a tecla de atalho é pressionada enquanto o foco está num campo de busca de produto, de quantidade ou de valor — o atalho não deve disparar e não deve interferir na bipagem de código de barras.
- **Forma com integração externa**: o cenário aponta para uma forma que exige terminal físico (TEF) ou PIX dinâmico — o atalho vale, mas o pagamento só se confirma após a integração (`FR-013`).
- **Tecla acionada com o carrinho ainda aberto**: o sistema leva a venda à etapa de pagamento e lança o cenário na mesma ação (`FR-019`).
- **Layout mobile**: o dispositivo não tem teclado físico — a venda rápida por cenário não existe nesse layout (`FR-020`).
- **Acionamento repetido**: o operador pressiona a mesma tecla duas vezes em sequência rápida, ou uma segunda tecla enquanto o primeiro lançamento ainda está em andamento.
- **Venda já em finalização**: a tecla é pressionada depois que a finalização automática já começou.
- **Cenário com "encerra a operação" ligado numa venda que ainda não tem cliente ou vendedor definido**: a finalização automática esbarra nas obrigatoriedades já especificadas para a finalização normal.
- **Catálogo grande**: a empresa tem muitos cenários cadastrados sem atalho — o custo de processá-los não pode pesar no carregamento da sessão.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST obter o catálogo de cenários de pagamento exclusivamente do payload de sessão do ERP (`SessaoUsuario.CenarioPagamento`), sem chamar nenhum endpoint dedicado — ele não existe.
- **FR-002**: O sistema MUST interpretar cada item do catálogo como a sequência de campos `código da forma`, `descrição da forma`, `código da condição`, `descrição da condição`, `nome do cenário`, `encerra a operação`, `tecla de atalho`, nessa ordem.
- **FR-003**: O sistema MUST considerar como atalho válido apenas o cenário cuja tecla, após normalização (remoção de espaços e caixa indiferente), seja exatamente `F6`, `F7`, `F8` ou `F9`; todos os demais MUST ser ignorados.
- **FR-004**: O sistema MUST ignorar, sem erro visível ao operador e sem interromper o processamento dos demais itens, qualquer cenário sem tecla, com número de campos diferente do esperado, ou com código de condição/forma não numérico.
- **FR-005**: O sistema MUST ignorar qualquer cenário cuja combinação condição + forma não exista entre as condições e formas de pagamento disponíveis para a empresa na sessão atual.
- **FR-006**: O sistema MUST expor no máximo 4 atalhos simultâneos, um por tecla de F6 a F9; havendo mais de um cenário válido para a mesma tecla, MUST manter apenas um, de forma determinística e sempre igual entre recarregamentos da mesma sessão.
- **FR-007**: O sistema MUST tratar catálogo ausente, vazio ou ilegível como "nenhum atalho disponível", mantendo a venda plenamente funcional.
- **FR-008**: Ao acionar um atalho, o sistema MUST lançar um pagamento na venda com a condição e a forma do cenário, pelo valor **integral do saldo em aberto** da venda no instante do acionamento.
- **FR-009**: O sistema MUST recusar o acionamento, informando o operador e sem alterar a venda, quando o saldo em aberto for zero ou negativo, ou quando a venda não tiver itens.
- **FR-010**: Quando o cenário acionado tiver "encerra a operação" ligado e o lançamento tiver zerado o saldo em aberto, o sistema MUST iniciar a finalização da venda imediatamente, **sem diálogo de confirmação**.
- **FR-011**: O sistema MUST NOT finalizar a venda quando o lançamento falhar ou quando, após o lançamento, ainda restar saldo em aberto; nesses casos MUST informar o operador e preservar o estado da venda.
- **FR-012**: A finalização disparada por atalho MUST obedecer exatamente às mesmas regras, validações e obrigatoriedades da finalização acionada manualmente — o atalho substitui o gesto do operador, nunca as regras.
- **FR-013**: Quando a forma de pagamento do cenário exigir uma integração externa (terminal físico ou PIX dinâmico), o sistema MUST seguir o mesmo roteamento já definido para a seleção manual dessa forma, e só MUST considerar o pagamento lançado — e, se aplicável, iniciar a finalização automática — após a confirmação dessa integração. **Resolvido (2026-08-31, decisão direta do usuário):** cenários com forma que exige TEF ou PIX dinâmico **continuam elegíveis a atalho**; a tecla substitui apenas o gesto de selecionar a forma, nunca o fluxo da integração.
- **FR-019**: Os atalhos MUST estar ativos em qualquer momento da venda, não apenas na etapa de pagamento. **Resolvido (2026-08-31, decisão direta do usuário):** acionada a tecla com o carrinho ainda aberto, o sistema MUST levar a venda à etapa de pagamento e lançar o cenário na mesma ação, respeitando `FR-009` (venda sem itens ou sem saldo em aberto recusa o acionamento) e `FR-014` (não dispara com foco em campo de entrada).
- **FR-020**: A venda rápida por cenário MUST ser exclusiva do layout desktop. **Resolvido (2026-08-31, decisão direta do usuário):** no layout mobile o sistema MUST NOT exibir os atalhos nem oferecer equivalente tocável, e nenhum cenário MUST ser acionável por esse layout.
- **FR-014**: Os atalhos MUST NOT disparar enquanto o foco estiver em um campo de entrada de texto ou numérico da venda, nem MUST interferir na leitura de código de barras.
- **FR-015**: O sistema MUST ignorar acionamentos de atalho enquanto um lançamento ou uma finalização anterior ainda estiver em andamento, evitando pagamento duplicado.
- **FR-016**: No layout desktop, o sistema MUST exibir ao operador, para cada atalho ativo, a tecla correspondente e o nome do cenário; e MUST omitir integralmente essa área quando não houver atalho ativo.
- **FR-017**: O acionamento de um atalho MUST ser registrado na trilha de auditoria da venda, identificando a tecla, o cenário, a condição, a forma, o valor lançado e se houve finalização automática.
- **FR-018**: O sistema MUST tratar o campo "encerra a operação" como falso sempre que seu valor não puder ser interpretado com segurança como verdadeiro — na dúvida, não finaliza sozinho.

### Key Entities *(include if feature involves data)*

- **Cenário de pagamento**: combinação nomeada de uma condição de pagamento e uma forma de pagamento, cadastrada pela empresa no ERP. Atributos relevantes: nome exibido ao operador, código da condição, código da forma, indicador de encerramento automático da operação e tecla de atalho associada. Chave de negócio no ERP: empresa + forma + condição.
- **Atalho de venda rápida**: projeção de um cenário de pagamento que o Checkout considerou utilizável — tem tecla dentro de F6–F9, condição e forma existentes na sessão, e é único por tecla. No máximo quatro por sessão.
- **Catálogo de cenários da sessão**: o conjunto de cenários entregue pelo ERP no carregamento da sessão, incluindo os que não servem como atalho.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Uma venda com pagamento coberto por um cenário que encerra a operação é concluída com **um único acionamento** de tecla após o último item, sem nenhuma outra interação do operador.
- **SC-002**: O tempo entre o acionamento do atalho e o pagamento visível na venda é inferior a 1 segundo em condições normais, para cenários que não dependem de integração externa.
- **SC-003**: 100% dos cenários fora do padrão (sem tecla, tecla fora da faixa, campos incompletos, condição/forma inexistente) são descartados sem que o operador veja qualquer erro e sem impedir o uso dos cenários válidos da mesma empresa.
- **SC-004**: Nenhum acionamento de atalho resulta em pagamento duplicado ou em venda finalizada com saldo em aberto, em nenhum dos cenários de teste, incluindo acionamentos repetidos em sequência rápida.
- **SC-005**: Nenhum atalho dispara durante digitação em campo de entrada ou durante leitura de código de barras, em 100% dos casos de teste.
- **SC-006**: Uma empresa sem nenhum cenário cadastrado usa o Checkout exatamente como antes, sem elemento visual adicional e sem qualquer erro.

## Assumptions

- O valor lançado é sempre o **saldo em aberto integral** e não é editável no ato do acionamento — decisão direta do usuário (2026-08-31). Ajustes posteriores usam a edição normal de pagamentos da venda.
- A finalização automática ocorre **sem diálogo de confirmação** — decisão direta do usuário (2026-08-31).
- Como o valor lançado é o saldo integral, o caso "sobra saldo após o lançamento" só ocorre por comportamento anômalo do lançamento; a especificação o trata defensivamente (FR-011) em vez de tratá-lo como fluxo normal.
- O teto de quatro atalhos decorre diretamente da faixa F6–F9 combinada com a unicidade de tecla; não é um limite adicional configurável.
- A unicidade de tecla por empresa já é garantida pelo ERP no cadastro; o tratamento de duplicidade em `FR-006` é defesa contra dados legados ou inconsistentes, não fluxo esperado.
- O catálogo é lido do payload de sessão já carregado no início da sessão; a feature não introduz nova chamada ao ERP nem novo momento de sincronização.
- O nome do cenário é o rótulo exibido ao operador (em vez das descrições de condição e forma), por ser o campo que a loja preenche justamente para identificar o cenário.

## Dependências

- **002 — Autenticação, sessão e bootstrap**: fornece e persiste o payload de sessão que contém o catálogo de cenários. Requer o acréscimo do campo ao contrato de bootstrap.
- **008 — Pagamento (geral)**: fornece o lançamento de pagamento, o saldo em aberto, o catálogo de condições/formas usado na validação de `FR-005` e o roteamento por integração externa de `FR-013`.
- **004 — Finalização e suspensão da venda**: fornece a finalização acionada por `FR-010`/`FR-012`.
- **001 — Auditoria de ações do operador**: recebe o evento exigido por `FR-017`.
- **007 — Layout responsivo/mobile**: precisa registrar que a venda rápida por cenário não existe no layout mobile (`FR-020`).
- **010 — Pagamento por terminal físico (TEF)** e **009 — Pagamento PIX**: fornecem o fluxo de integração que `FR-013` reaproveita quando o cenário aponta para essas formas.

## Decisões registradas nesta especificação

Todas as clarificações levantadas na redação foram resolvidas por decisão direta do usuário em 2026-08-31, sem pendência remanescente:

| Questão | Decisão | Onde está |
|---------|---------|-----------|
| Cenário com forma que exige TEF/PIX dinâmico pode ser atalho? | Sim — a tecla aciona a integração normalmente e o pagamento só se confirma após aprovação | `FR-013` |
| Quando as teclas F6–F9 valem? | Em qualquer momento da venda; com carrinho aberto, a tecla leva à etapa de pagamento e lança o cenário | `FR-019` |
| Comportamento no layout mobile? | Restrito ao desktop — nenhum atalho nem equivalente tocável no mobile | `FR-020` |
| Valor lançado pela tecla | Saldo em aberto integral, não editável no ato | `FR-008` |
| Finalização automática | Direto, sem diálogo de confirmação | `FR-010` |
