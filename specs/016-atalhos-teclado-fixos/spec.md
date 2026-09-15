# Feature Specification: Atalhos de teclado fixos do Checkout

**Feature Branch**: `docs/spec-atalhos-teclado-fixos`

**Created**: 2026-09-15

**Status**: Draft

**Input**: User description: mapa fixo das teclas de função do PDV — F1 importação de DAV, F2 importação de NFCe, F3 modal de identificação de cliente, F4 modal de identificação de produto, F5/F11/F12 reservadas, F6–F9 venda rápida (já existente), F10 suspender venda; foco direto no campo de digitação ao abrir modal por atalho; PDV de tela de toque deve funcionar só com teclado.

## Contexto

O Checkout já tem um mapa central de atalhos (`react-hotkeys-hook`, AD-176), mas ele atende hoje **uma única faixa de teclas** — F6 a F9, cujo conteúdo vem do cadastro `CenarioPagamento` do ERP (feature 013). Todas as outras teclas de função pertencem ao navegador.

Esta feature transforma o mapa de "registro de quatro atalhos configuráveis" em **mapa fixo do produto**: um conjunto de teclas cujo comportamento o operador pode decorar, que é o mesmo em toda instalação, e que não depende de cadastro nem de qual máquina o PDV está rodando.

O problema que motiva a feature não é a falta dos atalhos — é o que acontece **quando eles não estão registrados**. Levantamento de 2026-09-15 mostrou que o registro atual se desliga em seis situações, e que em todas elas a tecla volta a ser do navegador. A consequência varia de irritante a grave:

| Tecla sem dono | O que o navegador faz |
|---|---|
| F1 | Abre a ajuda do navegador em nova aba |
| F3 | Abre a barra de busca **e toma o foco do teclado** |
| F6 | Move o foco entre painéis do navegador |
| F10 | Abre a barra de menus do navegador |

O caso do F3 é o que justifica a prioridade: com o foco na barra de busca do navegador, **o próximo código de barras bipado é digitado dentro dela**, não no campo de produto. O item não entra na venda e nada na tela do PDV explica por quê. É exatamente a falha que a regra de não colisão com a bipagem existe para impedir, chegando por fora da aplicação — e ela acontece **hoje**, antes desta feature, porque F3 simplesmente não tem dono.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Nenhuma tecla de função reservada escapa para o navegador (Priority: P1)

O operador está com a tela de venda aberta. Ele aperta qualquer tecla do conjunto reservado pelo Checkout — por engano, por hábito de outro sistema, ou porque a ação não está disponível naquele momento. O navegador não reage: nenhuma aba de ajuda abre, nenhuma barra de busca aparece, nenhum menu é focado. O foco do teclado permanece exatamente onde estava, e a bipagem seguinte cai no campo de produto como deveria.

**Why this priority**: é a única história que corrige um defeito **já existente** em produção, e é a fundação das demais — sem posse garantida da tecla, todo atalho construído em cima herda o mesmo vazamento intermitente. Entregue sozinha, já elimina a classe de falha em que um código de barras desaparece dentro da interface do navegador.

**Independent Test**: com a tela de venda aberta, percorrer cada tecla reservada em cada um dos estados problemáticos (durante o carregamento inicial, com o operador sem cenários cadastrados, com o foco em campo de quantidade, com modal aberto) e verificar que o navegador não reage em nenhuma combinação. Não exige que nenhuma ação esteja implementada.

**Acceptance Scenarios**:

1. **Given** a tela de venda recém-aberta, com os dados do ERP ainda carregando, **When** o operador aperta F3, **Then** a barra de busca do navegador não aparece e o foco do teclado não muda de lugar.
2. **Given** um operador sem nenhum cenário de pagamento cadastrado no ERP, **When** ele aperta F1, **Then** nenhuma aba nova é aberta.
3. **Given** o foco no campo de quantidade de um item, **When** o operador aperta F10, **Then** a barra de menus do navegador não é focada e o que ele digitar em seguida continua indo para o campo de quantidade.
4. **Given** uma tecla reservada cuja ação não está disponível no momento, **When** o operador a aperta, **Then** o sistema informa em texto por que a ação não pode ser executada, em vez de simplesmente não reagir.
5. **Given** o operador segurando uma tecla reservada pressionada, **When** o sistema operacional emite a repetição automática, **Then** a ação correspondente é executada no máximo uma vez.

---

### User Story 2 - Identificar cliente e produto sem tirar a mão do teclado (Priority: P2)

O operador aperta F3 e o modal de identificação de cliente abre com o cursor já piscando no campo de busca — ele digita o nome ou o documento direto, sem tocar no mouse. O mesmo vale para F4 e o modal de identificação de produto.

**Why this priority**: é o ganho de velocidade mais frequente do caixa. Identificação de cliente e busca de produto acontecem várias vezes por venda, e hoje ambas exigem alcançar o mouse. Entregue sozinha, encurta o gesto mais repetido do operador.

**Independent Test**: abrir os dois modais exclusivamente por tecla, digitar o termo de busca sem tocar no mouse e concluir a seleção. Verificável sem F1, F2 e F10 existirem.

**Acceptance Scenarios**:

1. **Given** a tela de venda com o foco fora de qualquer campo, **When** o operador aperta F3, **Then** o modal de identificação de cliente abre e o campo de busca já está focado e pronto para receber a digitação.
2. **Given** a tela de venda, **When** o operador aperta F4, **Then** o modal de identificação de produto abre com o campo de busca focado.
3. **Given** o modal de cliente aberto pelo atalho, **When** o operador digita o termo e confirma pelo teclado, **Then** a identificação se conclui sem nenhum uso de mouse.
4. **Given** um modal já aberto, **When** o operador aperta a tecla que abriria outro modal, **Then** nenhum segundo modal é aberto e o navegador também não reage à tecla.
5. **Given** que a ordem da venda impede a ação naquele momento, **When** o operador aciona o atalho, **Then** a recusa e a explicação são as mesmas que o caminho por clique apresentaria.

---

### User Story 3 - Importar DAV e NFCe por tecla, com recusa explicada (Priority: P3)

O operador aperta F1 para importar um DAV ou F2 para recuperar uma NFCe. Se a venda já estiver em andamento, o sistema recusa e diz por quê, em vez de importar por cima do que já foi montado.

**Why this priority**: importação é operação de início de venda, menos frequente que identificação, mas é onde a recusa explicada mais importa — importar por cima de uma venda em andamento produziria um documento que o operador não consegue explicar.

**Independent Test**: acionar F1 e F2 em venda vazia (abre) e em venda com item ou cliente identificado (recusa com motivo em texto). Verificável sem os demais atalhos.

**Acceptance Scenarios**:

1. **Given** uma venda vazia, **When** o operador aperta F1, **Then** a importação de DAV abre com o campo de busca já focado.
2. **Given** uma venda vazia, **When** o operador aperta F2, **Then** a recuperação de NFCe abre com o campo de busca já focado.
3. **Given** uma venda com pelo menos um item lançado, **When** o operador aperta F1, **Then** a importação não abre e o sistema explica que não é possível importar sobre uma venda em andamento.
4. **Given** uma venda com cliente identificado e nenhum item, **When** o operador aperta F2, **Then** a recuperação não abre e a recusa é explicada.
5. **Given** uma venda em que apenas o cliente padrão está aplicado, **When** o operador aperta F1, **Then** a importação abre normalmente — cliente padrão não conta como venda em andamento.

---

### User Story 4 - Suspender a venda por tecla (Priority: P4)

O operador aperta F10 para suspender a venda atual, liberando o caixa para o próximo cliente sem perder o que já foi montado — a venda fica disponível para retomada depois.

**Why this priority**: acontece uma vez por venda interrompida, bem menos que as demais, e o caminho por clique já existe e é visível na tela.

**Independent Test**: acionar F10 em venda com conteúdo e verificar que a venda é suspensa — e não cancelada —, com a mesma confirmação do caminho por clique, e que ela pode ser retomada em seguida.

**Acceptance Scenarios**:

1. **Given** uma venda com itens lançados, **When** o operador aperta F10, **Then** o sistema apresenta a mesma confirmação que o caminho por clique de suspensão apresenta.
2. **Given** a confirmação apresentada, **When** o operador confirma, **Then** a venda é suspensa e fica disponível para retomada, exatamente como no caminho por clique.
3. **Given** a venda suspensa pelo atalho, **When** o operador a retoma, **Then** o conteúdo recuperado é o mesmo que a suspensão por clique produziria.
4. **Given** uma venda vazia, **When** o operador aperta F10, **Then** o sistema recusa e explica, sem deixar a tecla vazar para o navegador.
5. **Given** uma venda com pagamento que impede a suspensão, **When** o operador aperta F10, **Then** a recusa é a mesma que o caminho por clique apresentaria.
6. **Given** qualquer estado da venda, **When** o operador aperta F10, **Then** em nenhum momento lhe é oferecido cancelar com descarte — F10 tem um desfecho só.

---

### User Story 5 - Venda rápida funciona em PDV de tela de toque (Priority: P5)

Um PDV com monitor de toque e teclado físico, sem mouse, hoje é classificado como layout compacto e perde os atalhos de venda rápida. Nessa máquina o operador aperta F7 e nada acontece, embora ele tenha o teclado na frente. A partir desta feature, a tecla funciona; a faixa visual "Métodos de pagamento rápidos" continua aparecendo só no layout desktop, onde há espaço para ela.

**Why this priority**: corrige uma incoerência entre teclas — sem isso, na mesma máquina o F3 funcionaria e o F7 não —, mas depende de existir instalação de toque sem apontador fino, que é um subconjunto do parque.

**Independent Test**: simular o ambiente sem apontador fino e verificar que as teclas de venda rápida acionam e que a faixa visual não é renderizada.

**Acceptance Scenarios**:

1. **Given** um PDV sem apontador fino e com cenários de pagamento cadastrados, **When** o operador aperta a tecla de um cenário, **Then** o pagamento é lançado exatamente como no desktop.
2. **Given** o mesmo PDV, **When** a tela de venda é exibida, **Then** a faixa visual de métodos rápidos não é renderizada.
3. **Given** um PDV desktop, **When** a tela de venda é exibida, **Then** a faixa visual continua sendo renderizada como antes.

---

### Edge Cases

- **Tecla reservada acionada durante a bipagem.** O leitor de código de barras emite dígitos, letras e `Enter` — nunca teclas de função. Ainda assim, o campo de produto é declaradamente transparente aos atalhos, então uma tecla reservada apertada com o foco nele aciona a ação. É o comportamento desejado: o operador passa a venda inteira nesse campo.
- **Ação acionada duas vezes em sequência rápida.** Duas pressionadas do mesmo atalho não podem produzir dois lançamentos nem dois modais.
- **Tecla acionada enquanto uma operação de rede está em curso** (importação buscando, pagamento aguardando integração). A recusa precisa ser explicada, não silenciosa.
- **Tecla acionada fora da tela de venda** (bootstrap, painel de mensagem, display do cliente). Nesses contextos não há bipagem em curso e não há ação a executar.
- **Modal aberto e tecla de outro modal apertada.** Não abre o segundo, e a tecla também não chega ao navegador.
- **F5 apertado durante a venda.** O navegador recarrega e a venda em andamento é perdida — trade-off explicitamente aceito (ver Assumptions). A rede existente é a confirmação de saída do navegador.
- **F11 e F12 apertados.** O navegador alterna tela cheia e abre as ferramentas de desenvolvedor. Fora do alcance técnico do Checkout, documentado para não ser tentado de novo.

## Requirements *(mandatory)*

### Functional Requirements

#### Posse das teclas

- **FR-001**: O Checkout MUST assumir posse permanente das teclas F1, F2, F3, F4 e F10 enquanto a tela de venda estiver exibida, independentemente de a ação correspondente estar disponível.
- **FR-002**: A posse de uma tecla MUST NOT depender de dado remoto, de cadastro do operador, do resultado de uma consulta ao ERP, nem do estado da venda. Nenhuma dessas condições pode devolver a tecla ao navegador.
- **FR-003**: A posse de uma tecla MUST ser independente da disponibilidade da ação. Quando a ação não puder ser executada, o sistema MUST recusar e apresentar ao operador o motivo em texto, no mesmo padrão já usado pelos controles bloqueados da interface — nunca deixar de reagir.
- **FR-004**: Cada tecla MUST ter exatamente um dono. O sistema MUST NOT registrar a mesma tecla em dois pontos, ainda que um deles seja apenas uma guarda sem ação.
- **FR-005**: A posse MUST valer também com o foco em campo de entrada, dentro de janela modal e durante repetição automática de tecla segurada — situações em que hoje a tecla ainda alcançaria o navegador.
- **FR-006**: A ação de um atalho MUST ser suprimida enquanto houver janela modal aberta, sem que isso devolva a tecla ao navegador (FR-005 continua valendo).
- **FR-007**: Em repetição automática de tecla segurada, a ação MUST ser executada no máximo uma vez por pressionada.
- **FR-008**: As teclas F5, F11 e F12 MUST permanecer com o navegador. O Checkout NÃO as captura, e a especificação registra que F11 e F12 são **tecnicamente incapturáveis**: a saída de tela cheia é incancelável por especificação dos navegadores, e as ferramentas de desenvolvedor são resolvidas antes de a página receber o evento. Qualquer tentativa futura de reservá-las MUST ser recusada com base neste requisito.
- **FR-009**: O conjunto de teclas reservadas MUST estar declarado em um único lugar, consultável, contendo tecla, ação e descrição curta. Nenhuma tecla pode ser declarada solta no ponto de uso.

#### Independência de plataforma

- **FR-010**: Os atalhos F1, F2, F3, F4 e F10 MUST funcionar em qualquer plataforma, sem consultar a classificação de layout. Um PDV de tela de toque com teclado físico e sem mouse MUST ter os mesmos atalhos que um PDV desktop.
- **FR-011**: As teclas de venda rápida (F6–F9) MUST passar a acionar em qualquer plataforma. **Este requisito revoga parcialmente FR-020/D11 da feature 013**, que hoje trata "não exibir a faixa" e "não acionar a tecla" como consequência do mesmo fato.
- **FR-012**: A faixa visual "Métodos de pagamento rápidos" MUST continuar restrita ao layout desktop. A parte de FR-020/D11 da feature 013 que trata da exibição permanece válida.

#### Ações das teclas

- **FR-013**: F1 MUST abrir a importação de DAV. A ação MUST ser recusada quando já houver venda em andamento, reutilizando a **mesma** regra e a **mesma** função que o caminho por clique usa (AD-138/FR-011 da feature 006), sem reimplementar a verificação no atalho.
- **FR-014**: F2 MUST abrir a recuperação de NFCe, sujeita à mesma regra e ao mesmo reuso de FR-013 (feature 011).
- **FR-015**: F3 MUST abrir o modal de identificação de cliente (feature 005).
- **FR-016**: F4 MUST abrir o modal de identificação de produto (feature 003).
- **FR-017**: F10 MUST **suspender** a venda em aberto, com a mesma confirmação, as mesmas recusas e o mesmo desfecho do caminho por clique (feature 004). A suspensão é o **único** desfecho do F10: a tecla MUST NOT oferecer, nem produzir por qualquer caminho, o cancelamento com descarte da venda. Decisão do usuário (2026-09-15), tomada sobre a alternativa de F10 abrir uma escolha entre suspender e cancelar — descartada para que a tecla tenha um resultado só, previsível de cor pelo operador.
- **FR-018**: Todo atalho MUST executar a ação através do **mesmo** ponto de entrada que o controle equivalente na tela usa. Nenhuma regra de negócio pode ser duplicada dentro do tratamento da tecla.
- **FR-019**: As ações acionadas por atalho MUST ser registradas na auditoria de ações do operador com a mesma identificação de origem já usada pelos demais comandos com duas origens, para que a análise posterior distinga teclado de clique.

#### Foco

- **FR-020**: Ao abrir um modal por atalho (F1, F2, F3 e F4), o foco MUST ir diretamente para o campo de digitação da informação a ser buscada, pronto para receber o termo sem nenhuma interação de mouse.
- **FR-021**: FR-020 MUST valer também quando o modal for aberto pelo caminho por clique, para que o comportamento do campo não dependa de como o modal foi aberto.
- **FR-022**: Ao fechar um modal aberto por atalho, o foco MUST retornar a um ponto de trabalho utilizável da tela de venda, nunca ficar no corpo do documento.

### Key Entities

- **Tecla reservada**: uma tecla de função sobre a qual o Checkout declara posse. Atributos: identificação da tecla, ação associada, descrição curta para eventual tela de ajuda, e se é de posse permanente ou cedida ao navegador.
- **Mapa de teclas do produto**: o conjunto completo e único das teclas reservadas, fixo em toda instalação, distinto do mapeamento configurável F6–F9 que vem do cadastro do ERP.
- **Disponibilidade da ação**: o veredito, por tecla e por momento, de se a ação pode ser executada; quando negativo, carrega o motivo em texto apresentável ao operador.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Nenhuma das teclas reservadas produz reação do navegador em nenhum dos seis estados em que o registro hoje se esvazia — verificável percorrendo os seis estados para cada tecla.
- **SC-002**: O operador identifica um cliente e um produto usando exclusivamente o teclado, do atalho até a seleção concluída, sem nenhum evento de mouse.
- **SC-003**: Toda tecla reservada cuja ação esteja indisponível apresenta um motivo em texto ao operador; nenhuma pressionada resulta em ausência de reação.
- **SC-004**: Um PDV sem apontador fino executa o mesmo conjunto de atalhos que um PDV desktop — a diferença observável entre os dois se limita à faixa visual de métodos rápidos.
- **SC-005**: Um código de barras bipado logo após qualquer tecla reservada entra na venda; em nenhum caso o conteúdo do bipe é capturado por interface do navegador.
- **SC-006**: Toda tecla do mapa está declarada em um único lugar consultável, e uma varredura do código não encontra identificação de tecla declarada fora dele.
- **SC-007**: Cada atalho de ação tem cobertura de teste em dois casos: aciona com o foco fora de campo de entrada, e não vaza para o navegador durante a digitação no campo de busca/bipagem.

## Assumptions

- **Alcance de tela.** Os atalhos valem na tela de venda, que é onde o operador trabalha e onde há bipagem em curso. Telas de bootstrap, painel de mensagem e display do cliente ficam fora — é onde o risco do vazamento não existe.
- **F5 fica com o navegador, com perda de venda.** Decisão explícita do usuário (2026-09-15) após o trade-off ser apresentado: recarregar perde a venda em andamento, porque o estado da venda não é persistido. A rede existente é a confirmação de saída do navegador, que já está implementada. Reservar F5 para engoli-la teria protegido a venda; ficou para depois.
- **F11 e F12 não são "reservadas para o futuro", são indisponíveis.** A escolha de não capturá-las coincide com o limite técnico; nenhuma feature futura poderá reivindicá-las sem que o navegador mude.
- **Cliente padrão não é venda em andamento.** Segue a regra já estabelecida para importação: apenas cliente identificado ou item lançado caracterizam venda em andamento.
- **F10 suspende, sempre.** Decisão do usuário (2026-09-15): o desfecho é único e não negociável em tempo de execução. O cancelamento com descarte continua existindo apenas pelo caminho por clique, se a tela o oferecer — nunca por tecla. O motivo é o mesmo que sustenta o resto desta spec: uma tecla que o operador decora precisa produzir sempre o mesmo resultado, e a diferença entre suspender e descartar é grande demais para depender de um diálogo lido às pressas no caixa.
- **Origem registrada na auditoria.** Assume-se que a auditoria distingue teclado de clique reutilizando o padrão de parâmetro de origem já adotado em comandos com dois caminhos, sem inventar um segundo mecanismo.
- **A faixa visual permanece o único canal de descoberta dos atalhos de venda rápida.** Esta feature não cria tela de ajuda de atalhos; a descrição curta exigida em FR-009 existe para viabilizá-la depois.
- **Reuso sobre as features existentes.** As ações de F1, F2, F3, F4 e F10 já estão implementadas e acessíveis por clique nas features 006, 011, 005, 003 e 004. Esta feature adiciona um caminho de acionamento, não comportamento de negócio novo.

## Dependencies

- Mapa central de atalhos existente (AD-176) — será estendido, não substituído.
- Feature 013 (venda rápida) — FR-020/D11 é parcialmente revogado por FR-011 desta spec.
- Features 003, 004, 005, 006, 011 — fornecem as ações acionadas; nenhuma tem sua regra reimplementada aqui.
- Feature 001 (auditoria de ações do operador) — recebe os acionamentos por teclado.
- Padrão de bloqueio explicativo da interface — é o veículo da recusa exigida em FR-003.
