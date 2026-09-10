# Feature Specification: Display do cliente — espelho do QR Code PIX em segunda tela

**Feature Branch**: `feat/display-cliente-pix`

**Created**: 2026-09-10

**Status**: Draft

**Input**: User description: "em 015" — abrir o ciclo Spec Kit da feature 015, cujo design aprovado está em `specs/015-display-cliente-pix/design.md`. Origem do escopo: item 28 de `.specs/project/PENDENCIES.md` (AD-066) e o fluxograma "Tela do cliente" em `Fluxograma - Diagrama - Alinhamentos/FLUXOS-MERMAID.md`.

Hoje o QR Code do PIX só existe na tela do operador. Para pagar, o cliente precisa se debruçar no balcão ou o operador precisa girar o monitor. O produto já previa a solução: o botão do monitor na barra superior existe desde sempre, desabilitado, com o rótulo "Display do cliente (ainda não disponível)". Esta feature liga aquele botão e cria uma tela dedicada, voltada ao cliente, que espelha **a mesma cobrança PIX** que o operador está vendo.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - O cliente escaneia o QR Code na tela virada para ele (Priority: P1)

O operador registra um pagamento em PIX. Assim que a cobrança existe, a tela dedicada — já aberta no monitor voltado ao cliente e ligada o dia inteiro — passa a mostrar o QR Code em tamanho legível a cerca de um metro de distância, o valor a pagar e o aviso de que o pagamento está sendo aguardado. O cliente aponta o celular e paga, sem que ninguém gire o monitor.

**Why this priority**: é a razão de a feature existir. Sozinha, com a tela aberta previamente, já entrega todo o ganho operacional pretendido: o cliente paga sem intervenção física no equipamento do caixa.

**Independent Test**: com a tela do cliente já aberta e em repouso, inserir um pagamento em PIX no checkout e verificar que QR Code e valor aparecem nela; escanear com um celular e confirmar que o aplicativo do banco reconhece a mesma cobrança que o operador tem à frente.

**Acceptance Scenarios**:

1. **Given** a tela do cliente aberta em repouso, **When** o operador gera uma cobrança PIX de R$ 87,40, **Then** a tela passa a exibir o QR Code dessa cobrança, o valor R$ 87,40 e a indicação de que o pagamento está sendo aguardado.
2. **Given** a cobrança exibida na tela do cliente, **When** o cliente escaneia o QR Code, **Then** o aplicativo do banco apresenta a mesma cobrança (mesmo identificador e mesmo valor) que o checkout apresenta ao operador.
3. **Given** uma cobrança PIX ainda em geração (sem QR Code disponível), **When** o operador está aguardando, **Then** a tela do cliente permanece em repouso, sem esqueleto de carregamento e sem prometer um código que ainda pode falhar.
4. **Given** um valor abaixo do mínimo aceito ou uma falha na geração da cobrança, **When** o checkout exibe o erro ao operador, **Then** a tela do cliente permanece ou volta ao repouso, sem exibir mensagem de erro ao cliente.
5. **Given** qualquer cobrança PIX gerada com a tela do cliente aberta, **When** a venda é concluída, **Then** o número de cobranças criadas no adquirente é exatamente o mesmo que seria criado sem a tela do cliente aberta.

---

### User Story 2 - Abrir a tela do cliente pelo botão do monitor, inclusive com a cobrança já no ar (Priority: P2)

O operador clica no botão do monitor na barra superior e a tela do cliente abre em uma janela própria, que ele arrasta para o segundo monitor. Se clicar de novo, a janela já aberta é reaproveitada em vez de nascer uma terceira. E se ele só se lembrar de abrir a tela **depois** de o QR Code já estar na tela dele, a tela do cliente se sincroniza sozinha e mostra a cobrança em curso.

**Why this priority**: sem esta história a feature só funciona quando a tela é aberta antes da cobrança — e o caso "abriu no meio" é o ponto de atenção declarado explicitamente pelo usuário ao pedir a feature. Depende da US1 para ter o que exibir, mas é testável separadamente.

**Independent Test**: gerar uma cobrança PIX primeiro e só então clicar no botão do monitor; verificar que a tela abre já com o QR Code e o valor corretos, sem nenhuma ação adicional do operador.

**Acceptance Scenarios**:

1. **Given** o checkout aberto, **When** o operador clica no botão do monitor da barra superior, **Then** a tela do cliente abre em janela própria, em repouso, e o rótulo do botão não menciona mais indisponibilidade.
2. **Given** a tela do cliente já aberta, **When** o operador clica no botão do monitor novamente, **Then** a tela existente é reaproveitada e trazida à frente — nunca é criada uma segunda instância.
3. **Given** uma cobrança PIX já visível ao operador, **When** a tela do cliente é aberta pela primeira vez, **Then** em poucos segundos ela exibe essa cobrança, com identificador e valor iguais aos do checkout.
4. **Given** a tela do cliente aberta, **When** o operador recarrega a página diretamente por seu endereço fixo, **Then** ela volta a carregar corretamente, em repouso, e sincroniza de novo com o checkout.
5. **Given** nenhuma cobrança PIX em curso em nenhuma tela de checkout, **When** a tela do cliente é aberta, **Then** ela exibe a tela de repouso.

---

### User Story 3 - O cliente vê a confirmação do pagamento e a tela volta sozinha ao repouso (Priority: P3)

Aprovado o pagamento, a tela do cliente troca a cobrança por uma confirmação visível, com um contador regressivo, e volta sozinha ao repouso — pronta para o próximo cliente, sem o operador precisar tocar nela.

**Why this priority**: fecha o ciclo do fluxograma original ("Agradecer pela compra") e evita que o QR Code fique na tela depois de já ter sido pago. Não é pré-requisito para o cliente pagar, mas é o que permite deixar a tela ligada o dia inteiro sem manutenção.

**Independent Test**: aprovar um pagamento PIX e cronometrar a tela do cliente: confirmação aparece, contador decresce, e a tela volta ao repouso sozinha ao fim da contagem.

**Acceptance Scenarios**:

1. **Given** uma cobrança PIX exibida na tela do cliente, **When** o pagamento é aprovado, **Then** a tela exibe a confirmação do pagamento junto com um contador regressivo visível.
2. **Given** a confirmação exibida, **When** o contador chega a zero, **Then** a tela volta ao repouso sem qualquer ação do operador.
3. **Given** a confirmação exibida com o contador ainda correndo, **When** o operador conclui o pagamento no checkout antes do fim da contagem, **Then** as duas telas voltam ao repouso juntas.
4. **Given** a confirmação exibida, **When** uma nova cobrança PIX é gerada (segundo pagamento da mesma venda ou venda seguinte), **Then** a tela troca imediatamente para a nova cobrança e a contagem anterior é descartada.
5. **Given** a confirmação exibida, **When** ela é comparada à tela do operador, **Then** o valor confirmado é o mesmo nas duas.

---

### User Story 4 - A tela do cliente nunca mostra uma cobrança que não vale mais (Priority: P4)

A tela fica horas à vista de qualquer pessoa na loja, sem ninguém olhando para ela. Ela precisa se proteger sozinha de dois riscos: exibir um QR Code que já não é válido — o risco concreto é o próximo cliente pagar a cobrança do anterior — e expor dado que não é da conta de quem passa na frente do balcão.

**Why this priority**: é requisito de segurança e privacidade, não de funcionalidade; a feature "funciona" sem ele, mas não pode ir a produção sem ele.

**Independent Test**: com o QR Code no ar, matar a tela do checkout (fechar a aba e, separadamente, travá-la) e cronometrar quanto tempo o código sobrevive na tela do cliente.

**Acceptance Scenarios**:

1. **Given** um QR Code exibido na tela do cliente, **When** a tela do checkout que o originou é fechada normalmente, **Then** a tela do cliente volta ao repouso imediatamente.
2. **Given** um QR Code exibido na tela do cliente, **When** a tela do checkout que o originou trava ou morre sem aviso, **Then** a tela do cliente volta ao repouso em no máximo 15 segundos.
3. **Given** um QR Code exibido na tela do cliente, publicado por uma tela de checkout, **When** uma segunda tela de checkout está aberta e em repouso, **Then** ela não apaga o QR Code em exibição.
4. **Given** a tela do cliente em repouso, **When** qualquer pessoa a observa, **Then** ela exibe apenas a identificação da loja e uma saudação — nenhum item, preço, total, nome, documento ou qualquer outro dado do cliente ou da venda.
5. **Given** a tela do cliente em qualquer estado, **When** ela é inspecionada, **Then** não há nela nenhum comando capaz de alterar a venda, cancelar, concluir ou gerar cobrança.

---

### Edge Cases

- **Cobrança gerada antes de a tela existir**: coberto pela US2, cenário 3 — a tela sincroniza ao abrir. É o caso central do pedido.
- **Duas telas de checkout abertas, cada uma em uma venda**: uma em cobrança e outra em repouso — a que está em repouso permanece calada e a cobrança continua visível (US4, cenário 3). Se ambas gerarem cobrança, prevalece a última publicada; o identificador da cobrança é a identidade que define o que a tela mostra.
- **Pagamento parcial em PIX seguido de outro PIX na mesma venda**: cada cobrança tem identificador próprio; a troca de identificador reinicia a tela e qualquer contagem em curso (US3, cenário 4).
- **Pagamento em dinheiro, cartão ou outro meio**: a tela do cliente permanece em repouso. Esta feature cobre apenas PIX.
- **Operador abandona a cobrança sem aprovação**: a tela volta ao repouso.
- **Tela do cliente aberta enquanto nenhuma tela de checkout está aberta**: repouso, indefinidamente, sem erro visível ao cliente.
- **Tela do cliente recarregada no meio de uma cobrança**: volta ao repouso por um instante e resincroniza com a cobrança em curso.
- **Monitor secundário sem toque**: a tela precisa se apresentar corretamente em um monitor que não é touch, sem depender de nenhuma interação.
- **Rede do PDV instável**: como a tela do cliente não fala com o ERP, uma queda de rede não altera o que ela mostra; quem detecta a falha e muda de estado é o checkout.

## Requirements *(mandatory)*

### Functional Requirements

**Tela do cliente e seus estados**

- **FR-001**: O sistema MUST oferecer uma tela dedicada ao cliente, acessível por um endereço fixo e próprio, separada da tela de operação do caixa.
- **FR-002**: A tela do cliente MUST ter exatamente três estados visíveis: repouso, cobrança PIX aguardando pagamento, e pagamento confirmado.
- **FR-003**: No estado de repouso, a tela MUST exibir apenas a identificação da loja e uma saudação, e MUST NOT exibir itens, quantidades, preços, totais, descontos, nome, documento ou qualquer outro dado do cliente ou da venda.
- **FR-004**: No estado de cobrança, a tela MUST exibir o QR Code da cobrança, o valor a pagar e a indicação de que o pagamento está sendo aguardado.
- **FR-005**: No estado de cobrança, a tela MUST NOT exibir o código "copia e cola" nem oferecer botão de copiar — o cliente não dispõe de teclado nem de apontador nessa tela.
- **FR-006**: O QR Code e o valor MUST ser dimensionados para leitura confortável a cerca de um metro de distância, em monitor sem toque.
- **FR-007**: No estado de pagamento confirmado, a tela MUST exibir a confirmação e um contador regressivo até o retorno automático ao repouso.

**Fidelidade ao que o operador vê**

- **FR-008**: A cobrança exibida na tela do cliente MUST ser a mesma cobrança exibida ao operador — mesmo identificador e mesmo valor.
- **FR-009**: A tela do cliente MUST refletir a mudança de estado do checkout em até 1 segundo, em condições normais.
- **FR-010**: Enquanto uma cobrança estiver em geração e ainda não tiver QR Code, a tela do cliente MUST permanecer em repouso.
- **FR-011**: Quando o checkout apresentar erro de geração ou recusa por valor abaixo do mínimo, a tela do cliente MUST voltar ao repouso, sem exibir a mensagem de erro ao cliente.

**Autoridade e limites da tela do cliente**

- **FR-012**: O checkout MUST ser a única fonte de verdade do estado exibido; a tela do cliente MUST se limitar a desenhar o estado que recebe.
- **FR-013**: A tela do cliente MUST NOT criar cobrança PIX, sob nenhuma circunstância — uma segunda cobrança seria real, órfã e sem caminho de cancelamento no contrato do ERP (invariante J5).
- **FR-014**: A tela do cliente MUST NOT consultar o status do pagamento por conta própria, evitando duplicar as chamadas ao ERP e criar duas fontes de verdade que podem divergir.
- **FR-015**: A tela do cliente MUST NOT oferecer nenhuma ação capaz de alterar a venda (concluir, cancelar, abandonar, inserir item ou pagamento).
- **FR-016**: A abertura da tela do cliente MUST NOT iniciar sessão de venda, registro de auditoria ou verificação periódica de status do sistema.

**Sincronização e abertura**

- **FR-017**: Ao ser aberta, a tela do cliente MUST solicitar o estado corrente e passar a exibir uma cobrança já em curso, se houver, sem ação adicional do operador.
- **FR-018**: Uma tela de checkout **sem** cobrança ativa MUST permanecer calada diante dessa solicitação, para não apagar uma cobrança publicada por outra tela de checkout.
- **FR-019**: Enquanto houver cobrança na tela, o checkout MUST reconfirmá-la periodicamente, em intervalo não superior a 5 segundos.
- **FR-020**: A tela do cliente MUST voltar ao repouso após 15 segundos sem reconfirmação, cobrindo o caso de a tela do checkout travar ou morrer com o QR Code no ar.
- **FR-021**: Ao ser fechada normalmente, a tela do checkout MUST devolver a tela do cliente ao repouso antes de encerrar.
- **FR-022**: A tela do cliente MUST validar toda mensagem recebida antes de usá-la, descartando o que não estiver íntegro — telas com versões diferentes da aplicação podem coexistir após um deploy.
- **FR-023**: A tela do cliente MUST sobreviver a um recarregamento direto de seu endereço, tanto em desenvolvimento quanto em produção.

**Contador e identidade da cobrança**

- **FR-024**: O contador regressivo pós-aprovação MUST durar 10 segundos, o mesmo tempo do fechamento automático na tela do operador, para que as duas voltem juntas.
- **FR-025**: A tela do cliente MUST aceitar um retorno antecipado ao repouso enviado pelo checkout, encerrando o contador antes do fim.
- **FR-026**: A troca do identificador da cobrança MUST reiniciar a tela e descartar qualquer contagem em curso, inclusive quando o estado anterior era "pagamento confirmado".

**Botão de abertura**

- **FR-027**: O botão do monitor na barra superior MUST deixar de ser inerte, perder a indicação de indisponibilidade e passar a abrir a tela do cliente.
- **FR-028**: Cliques repetidos no botão MUST reaproveitar a tela já aberta em vez de criar instâncias adicionais.

### Key Entities

- **Estado da tela do cliente**: o que a tela deve desenhar em um dado momento. Assume exatamente um entre três valores — repouso, cobrança PIX aguardando, pagamento confirmado — e é decidido exclusivamente pelo checkout.
- **Cobrança PIX espelhada**: a cobrança em exibição, identificada por um identificador único e caracterizada por valor e código de leitura (QR Code). O identificador é a identidade que define quando a tela troca de conteúdo.
- **Identidade da loja**: o nome exibido no repouso, derivado da sessão do PDV já conhecida pelo checkout e enviado junto com o estado, para que a tela do cliente não precise carregar dados do tenant.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em 100% das cobranças PIX geradas com a tela do cliente aberta, o QR Code correspondente aparece nela.
- **SC-002**: O QR Code aparece na tela do cliente em até 1 segundo depois de aparecer na tela do operador.
- **SC-003**: Uma tela do cliente aberta no meio de uma cobrança já em curso passa a exibi-la em até 2 segundos, sem qualquer ação adicional do operador.
- **SC-004**: O número de cobranças PIX criadas por venda permanece idêntico ao de antes da feature — zero cobranças duplicadas atribuíveis à segunda tela.
- **SC-005**: Nenhum QR Code permanece visível ao cliente por mais de 15 segundos após o checkout deixar de confirmá-lo.
- **SC-006**: Em auditoria visual da tela em repouso, zero ocorrências de dado da venda ou do cliente (itens, valores, nome, documento).
- **SC-007**: Clicar o botão do monitor N vezes resulta em exatamente uma tela do cliente aberta, para qualquer N ≥ 1.
- **SC-008**: O cliente completa o pagamento em PIX sem que o operador precise girar o monitor ou entregar qualquer equipamento — zero intervenções físicas no equipamento do caixa por cobrança.
- **SC-009**: A tela do cliente permanece ligada por um turno inteiro de operação sem exigir nenhuma intervenção manual de reinício ou de retorno ao repouso.

## Assumptions

- **A tela do cliente e o checkout rodam no mesmo navegador da mesma máquina de PDV.** O segundo monitor é uma saída de vídeo da mesma estação, não um dispositivo remoto; não há requisito de espelhar a cobrança para outro computador, tablet ou celular.
- **Propaganda e conteúdo de mídia estão fora de escopo.** O fluxograma original ("Tela do cliente", `FLUXOS-MERMAID.md`) começa por "Exibe imagem" e o item 28 de `PENDENCIES.md` menciona propaganda; o usuário decidiu (2026-09-10) que o repouso desta versão é apenas marca da loja e saudação. Propaganda, se entrar, é feature futura.
- **Só PIX é espelhado.** Dinheiro, cartão/TEF e demais meios não produzem nada na tela do cliente nesta versão — ela permanece em repouso.
- **A tela do cliente não tem interação.** É um monitor de exibição; nenhum requisito depende de toque, teclado ou apontador nela.
- **Não há requisito de sonorização.** Nenhum aviso sonoro na aprovação.
- **O contador de 10 segundos espelha o comportamento já existente do fechamento automático na tela do operador** — a intenção é que as duas telas voltem juntas, então o valor acompanha o do checkout se este mudar.
- **A branch desta feature parte de `fix/contrato-erp-real-pagamento-produto-cliente`, não de `master`** (decisão do usuário, 2026-09-10): `master` está 15 commits atrás e não contém as versões da tela de pagamento, da barra superior e da lista de pagamentos que esta feature toca.
- **Não há artefato visual desta tela no Pencil.** O usuário autorizou (2026-09-10) derivar o visual do modal PIX já existente, reutilizando os tokens de estilo e a biblioteca de ícones vigentes do projeto. Esta é a única exceção autorizada à regra de consultar o Pencil primeiro.
- **Concluir esta feature fecha o item 28 de `.specs/project/PENDENCIES.md`** (AD-066) e resolve o gap de escopo ali registrado.
