# Research: Atalhos de teclado fixos do Checkout

**Feature**: 016 | **Date**: 2026-09-15 | **Plan**: [plan.md](./plan.md)

Phase 0. Todas as incógnitas do Technical Context resolvidas; nenhum `NEEDS CLARIFICATION` remanescente.

---

## D1 — Dois registros separados, não um `useAtalhosDeTeclado` generalizado

**Decision**: criar `useTeclasFixas` ao lado do `useAtalhosDeTeclado` existente, em `src/client/hotkeys/mapaAtalhos.ts`, cada um com seu próprio conjunto de opções. O hook atual não muda de comportamento.

**Rationale**: os dois têm regras **opostas** sobre foco. O de venda rápida (F6–F9) *deve* ignorar o evento com o foco em campo de entrada — é `FR-014` da feature 013, e a exceção do campo de produto é declarada no próprio campo. O mapa fixo *deve* engolir a tecla justamente nesses contextos (FR-005). Parametrizar um hook só para inverter a guarda produziria uma função com dois modos e duas razões de mudança, contra Constitution II.

**Alternatives considered**:
- *Generalizar `useAtalhosDeTeclado` com uma flag `respeitarFoco`*: rejeitado — a flag vira o ponto onde as duas políticas se confundem, e o próximo leitor precisa saber qual modo está ativo para entender o que a tecla faz.
- *Migrar F6–F9 para o mapa fixo*: rejeitado — F6–F9 são cadastráveis no ERP e variam por operador; o mapa fixo é constante de produto. Fundi-los apagaria a distinção que a spec faz questão de manter.

---

## D2 — Como a posse incondicional é obtida

**Decision**: um único `useHotkeys` com as teclas fixas e as opções: `enabled: true` (constante, nunca derivada), `preventDefault: true`, `useKey: true`, `enableOnFormTags: true`, `enableOnContentEditable: true`, e `ignoreEventWhen: (evento) => evento.defaultPrevented`.

**Rationale**: é a combinação mínima que satisfaz FR-001, FR-002 e FR-005. Cada opção responde a um caso do levantamento:
- `enabled` literal impede que a posse dependa de query, cadastro ou estado — os seis casos de esvaziamento deixam de existir por construção.
- `enableOnFormTags` + `enableOnContentEditable` cobrem o foco em campo de entrada.
- `ignoreEventWhen` reduzido a `defaultPrevented` mantém a deferência a quem já tratou a tecla, sem reintroduzir a guarda de foco.
- A biblioteca aplica `preventDefault` no casamento da tecla, **antes** do callback; então engolir não depende de o handler fazer nada.

**A tecla repetida é tratada no handler, não na guarda** (FR-007): `evento.repeat` faz o handler retornar sem agir, mas o `preventDefault` já aconteceu. Colocá-lo em `ignoreEventWhen`, como faz o mapa da venda rápida, devolveria a tecla repetida ao navegador.

**Alternatives considered**: `keydown` de `window` escrito à mão — rejeitado pelo mesmo motivo de AD-176, e agravado aqui: seriam duas implementações artesanais coexistindo.

---

## D3 — "Há janela aberta?" vem da pilha de janelas, não do `event.target`

**Decision**: expor de `src/client/lib/useFocoDeModal.ts` uma consulta `haJanelaAberta()` sobre a `pilhaDeJanelas` que o módulo já mantém, e usá-la no handler das teclas fixas para suprimir a ação (FR-006).

**Rationale**: o mapa da venda rápida usa `alvo.closest('[role="dialog"]')`, que só funciona quando o foco está **dentro** do diálogo. Com o foco no `body` — situação real logo após uma janela abrir, e exatamente a que a gotcha do `inert` produz — o `closest` devolve `null` e a ação passaria por baixo do modal. A pilha é o registro autoritativo de quantas janelas estão abertas e já existe.

**Alternatives considered**:
- *Manter `closest('[role="dialog"]')`*: rejeitado pelo furo acima.
- *Um booleano no `janelasStore`*: rejeitado — duplicaria a informação que a pilha já tem, e as duas divergiriam para janelas que não passam pelo store (confirmações destrutivas, modal do PIX).

---

## D4 — O registro mora em `AppShell`

**Decision**: `useTeclasFixas` é chamado uma única vez, em `src/client/layout/AppShell.tsx`.

**Rationale**: `AppShell` é a raiz da tela de venda e fica **acima** da bifurcação `useIsMobile()` que escolhe entre `DesktopLayout` e `MobileWizard`. Registrar ali satisfaz três requisitos sem escrever condição nenhuma: FR-004 (dono único — há um só call site), FR-010 (independência de plataforma — o componente não sabe qual layout virá) e o alcance de tela declarado nas Assumptions (montado durante toda a venda, ausente no bootstrap e no display do cliente). É também onde o `ProvedorFinalizacaoVenda` e o `useAvisoAoSair` já vivem, pelo mesmo motivo.

**Alternatives considered**: registrar em cada layout — rejeitado, duplicaria o dono da tecla e cairia na armadilha de `defaultPrevented` descrita em FR-004.

---

## D5 — `janelasStore`: a abertura das janelas sobe para um store pequeno

**Decision**: criar `src/client/stores/janelasStore.ts` (Zustand, sem `persist`, sem Immer — o estado é um enum), com `janela: JanelaAberta`, `abrir(janela)` e `fechar()`. `BotaoMenuImportacao`, `CampoClienteVenda` e `EntradaRapidaProduto` passam a ler dele em vez de manter `useState` próprio para essa dimensão.

**Rationale**: hoje o estado de abertura vive em três componentes-folha, abaixo da bifurcação de layout. Um atalho registrado na raiz não tem como alcançá-los, e no wizard mobile parte deles pode nem estar montada no passo corrente. Além de resolver o alcance, o store entrega dois requisitos de graça: a exclusão mútua entre janelas vira uma união fechada (nenhum estado representa "duas janelas abertas"), e FR-006 — a tecla não abre um segundo modal — passa a ser consequência do tipo, não de uma checagem espalhada.

O precedente está estabelecido: `edicaoItemStore` e `focoVendaStore` são stores pequenos de coordenação de UI, fora do `vendaStore`. A mesma justificativa vale aqui — o `vendaStore` é reservado ao que a venda acumula, e qual janela está aberta não é venda.

**Alternatives considered**:
- *Barramento de comandos*: cada componente registra um handler `abrir` num registro central e o atalho despacha. Rejeitado — mantém o estado disperso e acrescenta indireção sem dono claro; o registro precisaria de desregistro no unmount, que é exatamente a classe de bug (dono que some) que esta feature existe para eliminar.
- *Colocar no `vendaStore`*: rejeitado — contraria a separação já documentada em `useAtalhosVendaRapida`.

---

## D6 — F1 e F2 abrem DAV e NFCe **direto**, pulando o seletor

**Decision**: F1 leva a `janela: 'dav'` e F2 a `janela: 'nfce'`. O seletor (`ModalMenuImportacao`) continua sendo o caminho do clique em "Menu Importação".

**Rationale**: é o que a spec pede (FR-013/FR-014), e é coerente com o propósito do atalho — o operador que decorou a tecla já escolheu o documento; passar pelo seletor seria um passo que o clique precisa e a tecla não. Não há conflito: o seletor apenas *define* `janela`, e o atalho define o mesmo valor por outro caminho.

**Nota histórica**: a feature 006 abria a janela de DAV direto no clique porque a segunda opção ainda não existia; com a 011 implementada (AD-166) o seletor passou a ser o caminho do clique. O atalho não reabre essa discussão — ele é um terceiro caminho, mais curto, para o mesmo destino.

---

## D7 — A recusa de F1/F2 reusa `useRecusaDeImportacao`, sem cópia

**Decision**: o handler de F1/F2 chama `recusaAtual()` e, havendo motivo, `notificar.erro(mensagemDeRecusa(motivo))` — exatamente o que `BotaoMenuImportacao.abrir()` faz hoje.

**Rationale**: FR-018 proíbe reimplementar a regra no atalho, e Constitution III proíbe duplicar regra do domínio. O trio `useRecusaDeImportacao` / `recusaAtual()` / `mensagemDeRecusa()` já é o ponto de verdade, e a própria `importarVendaExistente` reaplica a regra no fim — três camadas de reaplicação que o atalho herda sem escrever nada.

`recusaAtual()` (e não o `recusa` renderizado) é o certo: cobre o estado que muda entre o render e o gesto, que num atalho é ainda mais provável do que num clique.

---

## D8 — O store guarda só a janela; parâmetro de abertura continua local

**Decision**: `janelasStore` guarda exclusivamente qual janela está aberta. Termo de busca pré-preenchido, item em edição e qualquer outro parâmetro permanecem no componente que já os mantém.

**Rationale**: é o corte que mantém o store pequeno e a refatoração contida (risco 1 do plano). Subir parâmetros junto transformaria um store de coordenação num espelho parcial do estado dos modais, com duas fontes para o mesmo dado.

**Consequência a verificar na implementação**: `EntradaRapidaProduto` e `CampoClienteVenda` precisam continuar conseguindo abrir suas janelas *com* parâmetro pelo caminho de clique. A tarefa de implementação deve confirmar isso antes de remover o `useState` local, e registrar como desvio se algum parâmetro estiver acoplado ao booleano de abertura.

---

## D9 — F10 chama `suspender()`, que é o que o botão "Cancelar venda" já faz

**Decision**: F10 usa `useFinalizacaoVenda().suspender` e `motivoDeBloqueioDoCancelar`, os mesmos de `AcaoCancelarVenda`.

**Rationale**: descoberta da pesquisa de código — `AcaoCancelarVenda` (`src/client/features/finalizacao-suspensao/AcoesFinaisVenda.tsx`) já resolve para `suspender()`. O rótulo na tela diz "Cancelar venda" e o desfecho é suspensão. A decisão do usuário de 2026-09-15 (F10 sempre suspende) portanto **não introduz comportamento novo**: alinha a tecla ao que o clique faz, o que é o resultado exigido por FR-017 e FR-018.

O provedor `ProvedorFinalizacaoVenda` já está montado em `AppShell`, então `useFinalizacaoVenda()` está disponível exatamente no call site escolhido em D4, sem fiação adicional.

**Alternatives considered**: expor uma ação nova de suspensão — rejeitado, seria um segundo caminho para o mesmo desfecho, contra FR-018.

---

## D10 — Plataforma sai de `projetarAtalhos` e passa a viver na faixa

**Decision**: `projetarAtalhos(cenarios, catalogo)` perde o parâmetro `plataforma` e o curto-circuito `if (plataforma !== 'desktop') return []`. A condição de exibição migra para o componente que renderiza a faixa, onde `useIsMobile` já é observável.

**Rationale**: FR-011 e FR-012 partem em dois o que hoje é um fato só. A projeção é domínio puro e passa a responder apenas "quais cenários viraram atalho", que é a sua pergunta legítima; "isto aparece na tela?" é pergunta de apresentação. A separação é a própria Constitution II aplicada — a função tinha duas razões de mudança.

**Impacto declarado**: `usePlataforma` deixa de ser consumido por `useAtalhosVendaRapida`; `PlataformaVendaRapida` deixa de ser parâmetro de domínio. Os testes de plataforma da 013 migram da suíte de `projetarAtalhos` para a do componente da faixa.

**Correção de decisão superada**: FR-020/D11 da feature 013 precisa ser reescrito **no ponto** onde o leitor o encontraria, não corrigido por nota no fim — regra do projeto para decisão superada em `.specs/`.

---

## D11 — Foco inicial vira responsabilidade de `useFocoDeModal`

**Decision**: `useFocoDeModal` passa a aceitar a declaração do elemento que recebe o foco inicial e a aplicá-lo quando a janela abre, um render depois de ela deixar de ser inerte. Os quatro modais de F1–F4 declaram seu campo de busca.

**Rationale**: FR-020 e FR-021 exigem o mesmo comportamento em quatro modais e nos dois caminhos de abertura. Quatro `useEffect` ad hoc divergiriam, e a gotcha que os faria divergir é silenciosa: `focus()` numa subtree `inert` é **ignorado sem erro**, e os modais desta base não desmontam ao fechar — ficam ocultos. Um lugar só concentra a ordem correta (deixar de ser inerte → focar) e a torna testável uma vez.

FR-021 (mesmo comportamento no clique) sai de graça dessa escolha: o hook não sabe como a janela foi aberta.

**Alternatives considered**: `autoFocus` no input — rejeitado, é aplicado na montagem, e estes modais montam uma vez e permanecem montados.

---

## D12 — Auditoria distingue teclado de clique por parâmetro de origem

**Decision**: as ações acionadas por tecla registram origem `'TECLADO'`, reusando o padrão de parâmetro de origem já adotado em `trocarVendedor`.

**Rationale**: FR-019 pede a distinção e proíbe um segundo mecanismo. O padrão existe e é o mais barato: o comando ganha (ou já tem) um parâmetro de origem, e o evento de auditoria o carrega.

**Ponto de atenção**: `TeclaVendaRapida` em `src/client/domain/auditoria/eventos.ts` é hoje a união fechada `'F6' | 'F7' | 'F8' | 'F9'`. As teclas novas **não** pertencem a essa união — ela descreve a venda rápida, não o teclado inteiro. A implementação deve decidir entre estender a união ou introduzir um tipo irmão para o mapa fixo, e a resposta correta é a segunda: são dois vocabulários distintos, e fundi-los faria a auditoria da venda rápida aceitar teclas que ela nunca emite.

---

## D13 — Conjuntos de teclas disjuntos como invariante testável

**Decision**: o mapa fixo (F1, F2, F3, F4, F10) e o mapa da venda rápida (F6–F9) são disjuntos, e a disjunção é verificada por teste, não apenas por convenção.

**Rationale**: os dois registros coexistem e ambos consultam ou alteram `defaultPrevented`. Enquanto os conjuntos forem disjuntos não há interação possível; se um dia deixarem de ser, a falha seria intermitente e dependente da ordem de montagem — a pior forma de descobrir. Um teste que compara os dois conjuntos custa três linhas e transforma a armadilha de FR-004 em erro de suíte.
