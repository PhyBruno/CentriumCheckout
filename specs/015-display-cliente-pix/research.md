# Research — Fase 0: Display do cliente (feature 015)

**Plano**: [plan.md](./plan.md) · **Spec**: [spec.md](./spec.md) · **Data**: 2026-09-10

Todo `NEEDS CLARIFICATION` do Technical Context foi resolvido aqui. Cada decisão foi
verificada contra o código real desta branch (`feat/display-cliente-pix`), não contra o
que o `design.md` supunha — e **duas suposições do design não sobreviveram à verificação**
(D1 e D10).

---

## D1 — O nome da loja no repouso **não** sai de `tituloDoProduto`

> ⚠️ **Correção de uma suposição do `design.md`.** O design (§1, "Arquitetura") diz que
> `nomeLoja` é "calculado no checkout por `tituloDoProduto`". Isso está **errado** e
> produziria a tela errada. Esta decisão a substitui.

**Decisão**: exportar uma função nova, `nomeDaLoja(sessao): string | null`, em
`src/client/domain/sessao/identidadePdv.ts`, e enviar **o resultado dela** no payload.

**Rationale**: `tituloDoProduto` (`identidadePdv.ts:43`) devolve
`"Centrium Checkout - Supermercado Aurora"` — o nome do **produto** na frente, a loja
depois; e `"Centrium Checkout"` sozinho quando a empresa não está cadastrada. É o rótulo
certo para a barra do operador, que precisa saber em que sistema está. Na tela virada ao
cliente é o rótulo errado duas vezes: anuncia ao cliente o nome de um software de PDV que
não lhe diz nada, e no caso sem cadastro a tela de boas-vindas passaria a exibir
literalmente "Centrium Checkout" como se fosse o nome da loja.

`nomeDaLoja` devolve `EmpresaNomeFantasia`, senão `EmpresaRazaoSocial`, senão `null` — e
`null` faz a tela de repouso mostrar só a saudação, sem linha órfã. É a mesma regra de
precedência que `tituloDoProduto` já aplica internamente, extraída para reúso; o helper
`primeiroPreenchido` (`identidadePdv.ts:92`) existe mas é privado ao módulo, então a
função nova nasce ao lado dele e `tituloDoProduto` passa a chamá-la, sem duplicar a regra.

**Alternativas consideradas**:
- *Usar `tituloDoProduto` como o design dizia* — rejeitada pelo motivo acima.
- *Fatiar a string no display* (`split(' - ')[1]`) — rejeitada: transforma um rótulo de
  apresentação em contrato implícito, e quebra para qualquer loja cujo nome contenha " - ".
- *Enviar os campos crus de `SessaoUsuario` e decidir no display* — rejeitada: colocaria
  regra de apresentação de identidade em dois lugares, e o display passaria a conhecer o
  formato do `GetSessao`.

---

## D2 — Canal entre abas: `BroadcastChannel`

**Decisão**: `BroadcastChannel` com nome fixo, encapsulado atrás de
`criarCanalDisplay(deps?)` com a fábrica injetável.

**Rationale**: o projeto **não tinha nenhum** canal entre abas até aqui — verificado: não
há `BroadcastChannel`, `SharedWorker`, ouvinte de `storage`, SSE nem WebSocket em `src/`.
Esta feature introduz o primeiro, então a escolha vale o registro. `BroadcastChannel` é
API nativa (nenhuma dependência nova, Constitution "stack fixada"), entrega
estruturado-clonado a todos os contextos da mesma origem, e é exatamente do tamanho do
problema: mensagens efêmeras, sem persistência, sem servidor.

**Alternativas consideradas**:
- *Evento `storage` do `localStorage`* — rejeitada: exige **escrever** o QR Code e o valor
  em armazenamento persistente, o que colide de frente com a Constitution VI e deixaria a
  cobrança sobrevivendo ao fechamento das abas. Também não notifica a aba que escreveu.
- *`SharedWorker`* — rejeitada: um processo a mais para gerir, ciclo de vida próprio, e
  nenhum ganho — não há estado compartilhado a coordenar além da última mensagem.
- *`window.opener` / `postMessage`* — rejeitada: cria acoplamento direto entre as janelas,
  morre se o display for aberto por URL em vez do botão, e obrigaria a manter o `opener`
  vivo (o que é justamente o que D3 evita depender).
- *SSE/WebSocket pelo BFF* — rejeitada: faria o BFF crescer para além de sessão/autenticação
  (Constitution, "sem backend próprio de domínio") para um problema que é local à máquina.

---

## D3 — `window.open` com janela nomeada e **sem** `noopener`

**Decisão**: `window.open(ROTA_DISPLAY, NOME_JANELA_DISPLAY)`, sem o terceiro argumento.

**Rationale**: FR-028 exige que cliques repetidos reaproveitem a tela já aberta. Isso
depende do **nome** da janela — e, pela especificação HTML, `noopener` faz o nome ser
ignorado, abrindo sempre um contexto novo. Com `noopener`, o operador que clica três vezes
fica com três displays, cada um mostrando a mesma coisa e cada um ocupando um monitor que
não existe.

Abrir mão do `noopener` aqui não custa nada em segurança: o alvo é uma página da **própria
origem**, e a comunicação é por canal, nunca por `window.opener` — o display nunca lê nem
escreve nada do abridor. É desvio consciente do precedente `BotaoMenuGerencial.tsx:40`
(`'_blank', 'noopener'`), que continua correto lá, porque aquele destino é o ERP legado em
**outra** origem e o `noopener` é o que impede a página de destino de tocar o Checkout.

**Alternativas consideradas**:
- *`'_blank', 'noopener'` como no menu gerencial* — rejeitada: quebra FR-028, conforme acima.
- *Manter `noopener` e desduplicar por canal* (perguntar "já tem display aberto?" antes de
  abrir) — rejeitada: resolveria o clique repetido, mas não consegue **focar** a janela
  existente, que é metade do requisito; e adiciona um round-trip assíncrono a um gesto que
  precisa ser imediato.

---

## D4 — A mensagem é validada por Zod na chegada

**Decisão**: schema Zod para a mensagem inteira, aplicado no `DisplayCliente` a cada
mensagem recebida; mensagem inválida é **descartada em silêncio**, sem mudar o estado atual.

**Rationale**: é a regra de fronteira do projeto (Constitution IV) e aqui ela não é
formalidade: depois de um deploy, uma aba de checkout aberta há horas continua rodando o
bundle antigo e pode publicar um formato que o display novo não conhece — ou o contrário.
Um `estado.tela` desconhecido chegando sem validação viraria uma tela em branco na frente
do cliente.

Descartar em silêncio (e não cair para repouso) é deliberado: uma mensagem corrompida não
é evidência de que a cobrança acabou. Quem tira o QR da tela é o corte por silêncio de D8,
que já cobre esse caso em 15 s.

**Alternativas consideradas**:
- *Confiar no tipo TypeScript* — rejeitada: o tipo não existe em runtime, e o dado vem de
  outro contexto de execução.
- *Cair para `BOAS_VINDAS` ao receber mensagem inválida* — rejeitada: uma aba antiga
  publicando lixo apagaria um QR válido publicado por outra aba.

---

## D5 — Valor viaja como inteiro cru e é reconvertido por `centavos()`

**Decisão**: o campo é `valorCentavos: number` na mensagem; o display chama
`centavos(valorCentavos)` (`dinheiro.ts:37`) antes de formatar.

**Rationale**: `Centavos` é tipo de marca (`number & { __brand }`, `dinheiro.ts:20`) — uma
marca de compilação, que não sobrevive ao clone estrutural do canal. Fingir que sobrevive
seria um `as` não justificado, exatamente o que a Constitution IV trata como erro de
review. `centavos()` **lança** em não-inteiro, o que transforma um payload corrompido em
falha alta em vez de discrepância de centavo na tela (Constitution V).

**Alternativas consideradas**:
- *Enviar a string já formatada* (`"R$ 87,40"`) — rejeitada: joga fora a validação numérica
  e impede o display de aplicar a própria tipografia (Geist Mono tabular) com segurança.
- *Enviar reais como decimal* — rejeitada de saída: ponto flutuante em valor monetário é
  o que a Constitution V proíbe.

---

## D6 — `voltaEmMs` viaja no payload

**Decisão**: o checkout envia a duração do contador; o display não importa
`MS_FECHAMENTO_APOS_APROVACAO`.

**Rationale**: a constante é `ModalPix.tsx:163`, um componente de feature do checkout.
Importá-la de dentro de `features/display/` acoplaria a tela do cliente à janela do
operador por um caminho que nenhuma das duas precisa. Enviando-a, existe **uma** fonte da
duração (FR-024 exige que as duas telas voltem juntas) e o display continua ignorando de
onde ela veio. Bônus concreto: o `ModalPix` já aceita `atrasoFechamentoMs` injetável para
teste (`ModalPix.tsx:149`), então o valor publicado acompanha automaticamente o que aquela
instância está de fato usando.

**Alternativas consideradas**:
- *Constante duplicada em `src/shared/display.ts`* — rejeitada: duas constantes que
  precisam ser iguais e nada garante que fiquem.
- *Import direto do `ModalPix`* — rejeitada pelo acoplamento acima.

---

## D7 — Aba de checkout **em repouso** fica calada no handshake

**Decisão**: `criarCanalDisplay` responde `SOLICITAR_ESTADO` **apenas** quando o seu último
estado publicado é uma cobrança ativa (`PIX_AGUARDANDO` ou `PIX_APROVADO`).

**Rationale**: é a regra que faz o sistema se comportar com duas abas de checkout abertas
(FR-018), e é contra-intuitiva o bastante para merecer teste próprio. Se a aba em repouso
respondesse `BOAS_VINDAS`, o handshake de um display aberto no meio de uma cobrança
apagaria o QR que a **outra** aba acabou de publicar — e o operador veria a tela do cliente
zerar no instante em que abriu o display, que é o oposto do requisito.

O display não precisa de resposta para ficar em repouso: repouso é o seu estado inicial.
Silêncio, aqui, é a resposta correta.

**Alternativas consideradas**:
- *Responder sempre* — rejeitada pelo motivo acima.
- *Eleger uma aba "dona" por token/timestamp* — rejeitada: coordenação distribuída para um
  problema que a regra de silêncio resolve sem estado extra.

---

## D8 — Pulso de 5 s e corte por silêncio em 15 s

**Decisão**: enquanto houver cobrança na tela, o checkout republica o estado a cada 5 s
(FR-019); o display volta a `BOAS_VINDAS` após 15 s sem qualquer mensagem (FR-020).

**Rationale**: `pagehide` cobre o fechamento **normal** da aba, e é o que dá a volta
imediata do cenário 1 de US4. Não cobre a aba que trava, é morta pelo gerenciador de
tarefas, ou perde o processo de renderização — casos em que nenhum código nosso roda. Aí o
QR fica preso na tela virada ao cliente, e o risco concreto é o **próximo** cliente pagar a
cobrança do anterior. 5 s dá três chances de pulso dentro da janela de 15 s, então uma
mensagem perdida não derruba um QR válido; 15 s é curto o bastante para que ninguém
complete um pagamento errado no intervalo.

**Alternativas consideradas**:
- *Só `pagehide`* — rejeitada: não cobre travamento, que é justamente o caso perigoso.
- *Pulso mais curto (1 s)* — rejeitada: quinze vezes mais mensagens para nenhum ganho; o
  limite útil é a janela de corte, não a frequência.
- *Display consultar o ERP para saber se a cobrança vive* — rejeitada: viola FR-014 e
  recria a segunda fonte de verdade que a feature inteira existe para evitar.

---

## D9 — O display monta **fora** do `App`, do `AppShell` e dos providers

**Decisão**: `main.tsx` ramifica por `window.location.pathname`; a rota `/display` renderiza
`<DisplayCliente/>` sem `QueryClientProvider`, sem `GooeyToaster` e sem `App`.

**Rationale**: não é preferência de estilo. O `AppShell` chama `abrirSessaoDeVenda('NOVA')`
na montagem, registra o `beforeunload` de `useAvisoAoSair` e liga o polling de
`GetStatusSistema`. Uma aba de display dentro dele abriria uma segunda sessão de auditoria
e um segundo polling para uma tela que não vende nada — exatamente o que FR-016 proíbe. O
`QueryClientProvider` é dispensável porque o display não faz rede (FR-014), e o
`GooeyToaster` porque toast é conversa com o operador, não com o cliente.

**Nota de implementação**: `main.tsx:40` envolve tudo em `<StrictMode>`, que executa efeitos
duas vezes em desenvolvimento. A assinatura do canal e o temporizador do contador precisam
ser idempotentes e limpar-se corretamente no *cleanup* — o mesmo cuidado que a trava
`geracaoIniciada` do `ModalPix` documenta (`ModalPix.tsx:208-213`), aqui sem o risco de
rede.

**Alternativas consideradas**:
- *Rota dentro do `App`* — rejeitada pelos efeitos do `AppShell` acima.
- *Entry point e `index.html` separados* — rejeitada: exigiria mudar a configuração do Vite
  e do `fastify-static`, e o ganho (alguns KB de bundle) não paga a divergência de build.

---

## D10 — `sincronizarLayoutNoDocumento()` já é global; nada a fazer

> ⚠️ **Correção de uma suposição do `design.md`.** O design (§4) diz que o display "chama
> `sincronizarLayoutNoDocumento()`". Ele **já é chamado**, e a tarefa não existe.

**Decisão**: nenhuma ação. A função roda em `main.tsx:25`, **antes** de qualquer render e
fora da árvore React, então a rota `/display` já a herda.

**Rationale**: verificado no arquivo. O único requisito real é **não** mover essa chamada
para dentro do `App` ao implementar o branch de rota — se ela migrar, o display perde o
atributo `data-layout` e o `md:` do projeto (AD-198, que é seletor de `<html data-layout>` e
não largura) deixa de resolver num monitor sem toque. Isso vira uma nota na tarefa de
`main.tsx`, não uma tarefa própria.

---

## D11 — Mapeamento do estado interno do `ModalPix` para `EstadoDisplay`

**Decisão**: um `useEffect` no `ModalPix` deriva o estado do que ele já sabe e chama
`onEstadoDisplay`:

| Situação interna (`ModalPix`) | `EstadoDisplay` publicado |
|---|---|
| `abaixoDoMinimo`, `emErro`, ou `cobranca === null` (gerando) | `BOAS_VINDAS` |
| cobrança gerada e não resolvida | `PIX_AGUARDANDO` |
| `aprovado === true` | `PIX_APROVADO` |
| desmontagem (cleanup do efeito) | `BOAS_VINDAS` |

**Rationale**: "gerando" mapeia para repouso de propósito (FR-010) — não há QR a mostrar, e
um esqueleto na tela do cliente prometeria algo que ainda pode falhar. `emErro` idem
(FR-011): o erro é conversa com o operador.

Dois detalhes verificados no código que a implementação precisa respeitar:
- `ModalPix` retorna `null` cedo quando `abaixoDoMinimo` (`ModalPix.tsx:361`), mas **todos
  os hooks já rodaram** até ali — o efeito de publicação funciona normalmente nesse caminho.
- `usePixPendente` monta o modal com `key={exibido.idPagamento}`
  (`ListaPagamentosAplicados.tsx:353`), então um segundo PIX na mesma venda **remonta** o
  componente. O cleanup publica `BOAS_VINDAS` e o novo monta publicando a cobrança nova —
  o que satisfaz FR-026 (troca de `trnGuid` reinicia a tela) sem código extra.

**Alternativas consideradas**:
- *Publicar direto de dentro do `ModalPix`* — rejeitada: o modal passaria a conhecer abas e
  canais, violando a Interface Segregation que o seu TSDoc já defende ("não importa
  `vendaStore` […] tudo chega por prop").
- *Derivar o estado no `vendaStore`* — rejeitada: a `CobrancaPix` é efêmera por decisão
  (Constitution VI, TSDoc de `cobrancaPix.ts`), e levá-la ao store para alimentar o display
  desfaria essa decisão pela porta dos fundos.

---

## D12 — A rota `/display` não exige mudança no servidor nem no Vite

**Decisão**: nenhuma alteração em `src/server/` nem em `vite.config.ts`.

**Rationale**: verificado em `src/server/index.ts:50` — o `setNotFoundHandler` devolve
`index.html` para todo GET que não começa com `/api/`, e `/display` não colide com nenhuma
rota registrada (`/health`, `/session/start`, `/bootstrap`, o proxy do ERP e `/gerencial`).
Em dev, o fallback de SPA do Vite faz o mesmo. Logo `/display` sobrevive a um F5 direto na
URL nas duas pontas (FR-023).

**Ressalva registrada**: o `notFoundHandler` está dentro do `if (env.serveStaticClient)`
(`index.ts:42`). Em produção isso está ligado; se algum ambiente futuro servir a SPA por
outro caminho, `/display` precisa ser reconferido lá. Não bloqueia esta feature.

---

## D13 — Estratégia de teste

**Decisão**: três camadas, com o canal **injetado** nas duas primeiras.

- **Unitário** — schemas do protocolo (rejeitam mensagem de versão antiga, D4) e
  `canalDisplay` (publica a cada mudança, responde `SOLICITAR_ESTADO` **só** com cobrança
  ativa, emite pulso, limpa no `pagehide`), tudo com canal falso.
- **Integração** — `DisplayCliente` percorrendo a máquina de estados com canal falso; e
  `ModalPix.spec.tsx` estendido para afirmar a sequência de `onEstadoDisplay`.
- **E2E** — duas páginas no **mesmo contexto** de browser do Playwright, porque é a
  condição para o `BroadcastChannel` atravessar; uma insere o PIX e a outra abre `/display`
  **depois** que o QR já está na tela, provando o handshake (US2 cenário 3, o ponto de
  atenção do pedido).

**Rationale**: a fábrica injetável (`deps.criarCanal`) existe para isto — depender do
`BroadcastChannel` do jsdom tornaria o teste sensível ao ambiente sem testar nada a mais.
O `ModalPix.spec.tsx` existente já traz o padrão a seguir (`erpFake()` por `deps.erpClient`,
`intervaloMs: 20`, sem fake timers, com os helpers `esperarAlemDeUmTick` /
`esperarPollingParar`); estender é mais barato e mais fiel que criar um arquivo novo.

**Ressalva operacional**: antes de crer em qualquer falha E2E, derrubar a porta 3100 — uma
stack antiga do `erp-mock` já produziu falsos negativos em massa nesta base (AD-159).

---

## D14 — Propaganda no repouso fica fora

**Decisão**: repouso é nome da loja + saudação, e nada mais.

**Rationale**: decisão do usuário (2026-09-10), já registrada em Assumptions na spec. O
fluxograma original ("Tela do cliente", `FLUXOS-MERMAID.md`) abre com "Exibe imagem" e o
item 28 de `PENDENCIES.md` cita propaganda — a divergência é consciente e está sinalizada
nos dois documentos de origem, não escondida. Entra como feature futura se for pedida;
nada neste desenho impede, porque `BOAS_VINDAS` é um estado próprio e ganharia conteúdo sem
mexer no protocolo.
