---

description: "Task list for feature 010 — Pagamento TEF"
---

# Tasks: Pagamento — TEF

**Input**: Design documents from `specs/010-pagamento-tef/` (`plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/erp-tef-api.md`, `contracts/tef-domain-api.md`, `quickstart.md`)

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Tests**: Incluídos, por TDD. `plan.md` § Testing nomeia três camadas: domínio puro, integração das duas janelas e do slice, e E2E. `data-model.md` §6 dá a cada invariante T1–T11 um teste. Cada teste é escrito **antes** do código que ele cobre e precisa falhar (RED) antes da implementação.

**Organization**: a spec tem três user stories. **US1** (P1, aplicar o pagamento pelo terminal) carrega quase todo o pedido de 2026-10-02: janela travada, polling, várias formas TEF, os campos de `CriarCardPagamento`, `UsuarioGAM`, detalhes da aprovação e `TEFPagId` no retrato (`FR-001`, `FR-005`, `FR-006`, `FR-010`–`FR-016`). **US2** (P1, ocultar quando indisponível) já está implementada pela 008 (`resolverIntegracao`, AD-180/AD-250) e aqui só ganha testes de regressão. **US3** (P2, desfazer um TEF aprovado) é o estorno (`FR-003`, `FR-004`, `FR-007`–`FR-009`).

**⚠️ Dependências cruzadas**: esta feature depende de:
- **002**: proxy `/api/erp/*`, cookie de sessão, `GetSessao` no `/session/start`, `bootstrap.schema.ts`;
- **003**: `Centavos`;
- **005**: `ClienteVenda`;
- **008**: `PagamentoAplicado`, `resolverIntegracao`, `confirmarPagamentoIntegrado`/`recusarPagamentoIntegrado`/`removerPagamento`, `ListaPagamentosAplicados`, `DialogoConfirmacaoDestrutiva`;
- **009**: o **padrão** de `ModalPix`/`pixQueries`/`usePixPendente`, copiado e **não** importado (`plan.md` § Structure Decision);
- **004**: `formaParaRetrato`/retrato da NFCe e o bloqueio de suspensão `temTefAprovado`;
- **006/011**: `dav.schema.ts` e `mapearVendaExistente.ts`.

Todas já estão em `master`.

**⚠️ Medição antes de qualquer código de rede (T001)**: três pontos do contrato só a medição ao vivo responde (`research.md` D17). `CriarCardPagamento` cobra e `EstornarPagamento` estorna **dinheiro real**, então T001 é feito **com o usuário**, num terminal de homologação, e nunca por sondagem automática. As tarefas que dependem dela estão marcadas "(depende de T001)".

**⚠️ Consulta ao Pencil MCP obrigatória nas tarefas de UI (CLAUDE.md § "Referência visual (design)")**: toda tarefa marcada **"consultar o Pencil MCP antes de implementar"** começa por:
1. `get_editor_state(include_schema: true)`;
2. `batch_get` dos nós citados;
3. `get_screenshot` antes e depois.

Nós deste módulo: frame `Y0ka3` / modal `uHAyW` (aguardando) e frame `xWrzX` / modal `A9MNZI` (aprovado). Os ícones do `.pen` são lucide e precisam ser traduzidos para reicon (AD-201): `credit-card` → `CreditCard`, `check` → `Check`, `x` → `X`. Confira o nome no catálogo de `node_modules/reicon-react/index.d.ts`, nunca chute.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência de tarefa incompleta)
- **[Story]**: US1, US2 ou US3
- Caminhos exatos em cada descrição

## Path Conventions

Sexta extensão da árvore da 002 (`plan.md` § Project Structure):

```text
src/client/domain/tef/                       # NOVO — interpretarStatusTef, parcelasDoTef, pagadorTef, cobrancaTef
src/client/services/tef/                     # NOVO — tefQueries.ts, tefMapper.ts
src/client/features/pagamento/tef/           # NOVO — ModalTef.tsx, JanelaEstornoTef.tsx, avisosTef.ts
src/shared/schemas/tef.schema.ts             # NOVO
src/server/{session,routes}/                 # ajustes de UsuarioGAM/EmpCod/Empresa
tests/unit/{domain/tef,services/tef,shared,server}/ | tests/integration/ | tests/e2e/
```

---

## Phase 1: Setup

**Purpose**: fechar os três pontos de contrato que a KB não responde e preparar a árvore.

- [X] T001 **Medir o contrato SmartTEF com o usuário** — **não medido (2026-10-02, AD-260):** o usuário ainda não tem a maquininha; a não-medição foi registrada e o código seguiu as formas do contrato, como a própria tarefa prevê. A medição virou o item 67 de `PENDENCIES.md`. (`research.md` D17), no prototype de `c0lj6mvzeh` ou no ambiente que o usuário indicar, com terminal de homologação. Use a receita de `erp-prototype-contrato-20260914` (proxy oauth→apps). **Nunca** chame `CriarCardPagamento`/`EstornarPagamento` sem o usuário presente e de acordo. Responda e registre num novo AD em `.specs/project/STATE.md`:
  - (a) `CriarCardPagamento` aceita corpo plano ou só `{ "CriarCardReq": { … } }`? O ERP lê `FPgCod` (KB) ou `FpgCod` (pedido)?
  - (b) A saída dos três endpoints vem plana ou em `{ "RespostaSmartTEF": … }`?
  - (c) A forma real de `RespostaJson` em cada operação. Em especial: a consulta devolve lista ou objeto? Os campos `payment_status`, `card_brand`, `nsu_host` e `autorization_code` vêm com essa grafia?
  - (d) O `GetSessao` já devolve `UsuarioGAM` na raiz? Se sim, feche o item 64 de `PENDENCIES.md`.

  Se algum resultado contradisser `contracts/erp-tef-api.md`, corrija o contrato **antes** de seguir. Se o usuário não puder medir agora, registre isso no AD e siga com as formas do contrato: elas estão isoladas em `montarCorpoCriarCard` (T014) e no schema (T010), então trocar depois custa uma linha.
- [X] T002 Criar os diretórios `src/client/domain/tef/`, `src/client/services/tef/`, `src/client/features/pagamento/tef/`, `tests/unit/domain/tef/`, `tests/unit/services/tef/`.

**Checkpoint**: contrato confirmado (ou a não-medição registrada) e árvore pronta.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: domínio puro, fronteira Zod, camada de rede, o lado do BFF, o `erp-mock` e o novo `DadosTEF`. As janelas de US1 e US3 dependem de tudo isto.

**⚠️ CRITICAL**: nenhuma user story começa antes desta fase terminar.

### Domínio puro (TDD)

- [X] T003 [P] Escrever `tests/unit/domain/tef/interpretarStatusTef.spec.ts` (RED). Cobrir os nove literais **nas duas fases** com a tabela de `research.md` D4: `interpretarStatusCobrancaTef` (só `CNC` → `APROVADO`; `PDT`/`PROC_PAG` → `PENDENTE`; `CAN_ERP`, `REJ_PAG`, `SOL_EST`, `PROC_EST`, `EST` e `REJ_EST` → `FALHA` com o motivo certo) e `interpretarStatusEstornoTef` (só `EST` → `ESTORNADO`; `REJ_EST`/`CAN_ERP`/`REJ_PAG` → `ESTORNO_REJEITADO`; `CNC`, `PDT`, `PROC_PAG`, `SOL_EST` e `PROC_EST` → `ESTORNO_PENDENTE`). Incluir `''`, `'cnc'` minúsculo e `'XYZ'`: nunca aprovam nem estornam (invariante T1). Verificar também que `MENSAGEM_POR_MOTIVO_FALHA_TEF` tem frase para os três motivos.
- [X] T004 [P] Implementar `src/client/domain/tef/interpretarStatusTef.ts` conforme `contracts/tef-domain-api.md` §1: tipos `StatusSmartTef`, `MotivoFalhaTef`, `ResultadoCobrancaTef` e `ResultadoEstornoTef`, as duas funções com `switch` e ramo `default` explícito, e `MENSAGEM_POR_MOTIVO_FALHA_TEF`. TSDoc com a origem dos literais (domínio `SmartTefStatusPagamento` da KB, AD-259) e o porquê de só `CNC` aprovar (`PCheckout_FaturarNFCe` filtra `TEFSmartSt = CNC`). T003 fica verde.
- [X] T005 [P] Escrever `tests/unit/domain/tef/parcelasDoTef.spec.ts` e `tests/unit/domain/tef/pagadorTef.spec.ts` (RED).
  - `parcelasDoTef`: crédito com prazo `1`/`2`/`4` → igual; `0`, `0.5` e `NaN` → `1`; `2.9` → `2`; débito e PIX com prazo `4` → `1` (T9).
  - `montarPagadorTef`: identificado com CPF formatado `123.456.789-09` → `'12345678909'`; CNPJ → só dígitos; `documento: null` (default) → `cpf: ''` e o nome do cliente; `null` → `null`.
- [X] T006 [P] Implementar `src/client/domain/tef/parcelasDoTef.ts` (`research.md` D8) e `src/client/domain/tef/pagadorTef.ts` (`research.md` D9, `data-model.md` §2.5). T005 fica verde.
- [X] T007 [P] Implementar `src/client/domain/tef/cobrancaTef.ts`: só os tipos `CobrancaTef`, `DadosCriarCardTef` e `ConsultaTef` (`contracts/tef-domain-api.md` §1). `DadosCriarCardTef` **não** tem `EmpCod` nem `UsuarioGAM`, e um comentário TSDoc diz por quê (invariante T8, AD-224).

### `DadosTEF` e textos compartilhados

- [X] T008 Reescrever `DadosTEF` em `src/client/domain/pagamento/saldoPagamento.ts` para `{ pagId, bandeira, nsu, autorizacao, tipoIntegracao: '1' }` (`data-model.md` §1), apagando `identificacao`, `cnpj` e `numeroAutorizacao`. Rodar `npx tsc --noEmit` e corrigir **só** os erros de compilação que a troca causar. `formaParaRetrato.ts` ganha a lógica nova em T025; aqui ele só precisa compilar.
- [X] T009 [P] Criar `src/client/features/pagamento/tef/avisosTef.ts` com os textos de `contracts/tef-domain-api.md` §3:
  - aviso de desistência com transação em voo, com a frase "o Checkout não cancela automaticamente a transação em voo no TEF" (`FR-010`);
  - aviso de estorno solicitado e não confirmado;
  - motivo do `X` travado;
  - motivo de `UsuarioGAM` ausente (`FR-014`);
  - chamada e explicação da confirmação de estorno.

  Mesmo padrão de `features/pagamento/pix/avisosPix.ts`.

### Fronteira Zod e rede (TDD)

- [X] T010 [P] Escrever `tests/unit/shared/tef.schema.spec.ts` (RED) e implementar `src/shared/schemas/tef.schema.ts` (`data-model.md` §3). Depende de T001.
  - `respostaSmartTefSchema` com `semEnvelope` aceita a forma plana e `{ RespostaSmartTEF: … }`, e `CodigoStatusHttp` como texto ou número (`inteiroErp`).
  - `criarCardRespSchema` reprova `payment_identifier` vazio.
  - `consultaCardRespSchema` aceita lista ou objeto único e normaliza para lista.
  - `estornoRespSchema` aceita a forma documentada.
  - Os quatro schemas são `looseObject`, e campos extras da SmartTEF passam.
- [X] T011 [P] Acrescentar `UsuarioGAM: z.string().optional()` na raiz da sessão em `src/shared/schemas/bootstrap.schema.ts`, com TSDoc: só presença, nunca enviado pelo JS (`research.md` D7). Cobrir em `tests/unit/shared/bootstrap.schema.spec.ts` presente, ausente e `''`.
- [X] T012 Escrever `tests/unit/services/tef/tefQueries.spec.ts` (RED), com um `erpClient` falso. Depende de T001 e T010. Cobrir:
  - (a) o corpo de `criarCardTef` tem `PagamentoValor` em reais com 2 casas (`8329` centavos → `83.29`, T10), `PagamentoParcelas`, CPF, nome e `FPgCod`, e **não** tem `EmpCod` nem `UsuarioGAM` (T8);
  - (b) `Sucesso: false` → `ErroNegocioErp` com a `MensagemErro` íntegra, e `MensagemErro` vazia → frase padrão;
  - (c) `RespostaJson` não-JSON ou sem `payment_identifier` → `ErroRespostaInvalida`;
  - (d) `consultarStatusTef` escolhe o item do `payment_identifier` consultado; lista vazia → `status: ''`;
  - (e) `estornarTef` devolve o `payment_status`;
  - (f) erro de rede → `ErroRedeErp`;
  - (g) `ConsultarStatusCard` vai por `GET` com `SmartTefPaymentIdentifier` na query, e `EstornarPagamento` por `POST` com `{ SmartTefPaymentIdentifier }`;
  - (h) `useCriarCardTef` com duas chamadas simultâneas faz **uma** requisição (T2);
  - (i) `useStatusTef` desligado não consulta e não fica em `isLoading`.
- [X] T013 Implementar `src/client/services/tef/tefMapper.ts`. Depende de T001. Ele faz a validação em dois estágios (envelope → `JSON.parse(RespostaJson)` → schema interno, `contracts/erp-tef-api.md` §4) e o mapeamento para `CobrancaTef`/`ConsultaTef`/`string`.
- [X] T014 Implementar `src/client/services/tef/tefQueries.ts` conforme `contracts/tef-domain-api.md` §2. Depende de T001 e T013. T012 fica verde. Conteúdo:
  - `INTERVALO_POLLING_TEF_MS = 10_000`;
  - `ErroTefSemCliente`, `ErroTefSemUsuarioGam`;
  - `montarCorpoCriarCard`: único ponto que conhece a forma do corpo — plana ou envelopada, conforme T001;
  - `criarCardTef`, `consultarStatusTef`, `estornarTef`;
  - `useCriarCardTef`: ref de voo, como `useGerarPix` (`research.md` D10);
  - `useStatusTef`: `refetchInterval` condicional, `staleTime: 0`, `gcTime: 0`, `retry: false` e `isLoading` só com a query ligada (AD-134).

  **Não importar `services/pix/`**: copiar o padrão, não o código (`plan.md` § Structure Decision).

### BFF (TDD)

- [X] T015 [P] Em `tests/unit/server/session/getSessao.spec.ts`, escrever os casos de `extrairUsuarioGam` (RED): raiz com valor → valor; ausente, `''` ou não-string → `null`. Implementar em `src/server/session/getSessao.ts`. `buscarUsuarioCodigo` passa a devolver também `usuarioGam`, **sem** mudar o desfecho: operador sem `UsuarioGAM` continua `identificado`.
- [X] T016 [P] Acrescentar o campo **opcional** `usuarioGam?: string` em `src/server/session/cookie.ts`, fora de `CAMPOS_OBRIGATORIOS` e **sem** bump de versão. O TSDoc explica que o bump só é obrigatório para campo obrigatório. Cobrir em `tests/unit/server/session/cookie.spec.ts`: cookie atual sem o campo continua decifrando, e cookie com o campo faz ida e volta intacto.
- [X] T017 Em `src/server/routes/session-start.ts`, gravar `usuarioGam` no cookie quando o `GetSessao` o devolver. **Não** recusar a entrada sem ele: o operador sem TEF continua vendendo. Cobrir em `tests/unit/server/routes/sessionStartUsuario.spec.ts`. Depende de T015 e T016.
- [X] T018 Criar `tests/unit/server/routes/erpProxyTef.spec.ts` (RED) e implementar em `src/server/routes/erp-proxy.ts` (`contracts/erp-tef-api.md` §5). Depende de T001 e T016.
  - (a) `EstornarPagamento` entra em `CAMINHOS_COM_EMPRESA_NA_RAIZ`.
  - (b) Nova `corpoComOperadorTef(body, caminhoNoErp, sessao)`, só para `CriarCardPagamento`. Ela insere `EmpCod` (numérico) e `UsuarioGAM` (texto; `''` sem o campo no cookie) na raiz **e**, se existir, dentro de `CriarCardReq`, sobrescrevendo valores forjados pelo navegador (T8).
  - (c) A composição no handler chama a função nova junto das já existentes.

  Casos de teste: corpo forjado é sobrescrito; outro caminho fica intocado; caminho com caixa diferente casa; cookie sem `usuarioGam` → `''`. A `query` de `ConsultarStatusCard` já recebe `Empresa=` como primeiro par por `queryComEmpresaDaSessao`: só afirmar em teste, sem código novo.

### Mock

- [X] T019 Estender `tests/e2e/support/erp-mock.ts` (`contracts/erp-tef-api.md` §5). Depende de T001.
  - `GetSessao` devolve `UsuarioGAM` na raiz, com uma flag para omiti-lo.
  - Os três endpoints, na forma **medida** em T001: `RespostaJson` como string.
  - Uma `TransacaoTEF` em memória por `payment_identifier`. A cobrança anda `PDT → PROC_PAG → CNC` conforme o número de consultas, com flags para `REJ_PAG` e para `Sucesso: false` na criação ("Serial do POS (serial_pos) nao localizado para o usuario informado"). O estorno anda `CNC → SOL_EST → PROC_EST → EST`, com flag para `REJ_EST`.
  - Uma condição `'2 VEZES'` (`CondicaoPrazo: "2.00000"`) com formas de crédito, débito e PIX com `FormaIntegracaoCartao: "1"`, e `TEFAtivo: true`.
  - O `FaturarNFCe` do mock recusa forma TEF sem `TEFPagId` com a mensagem real "Pagamento SmartTEF … não Localizada.".

**Checkpoint**: domínio, rede, BFF e mock prontos e testados. As janelas podem começar.

---

## Phase 3: User Story 1 — Aplicar pagamento cobrado no terminal físico (Priority: P1) 🎯 MVP

**Goal**: o operador aplica crédito, débito ou PIX cadastrados como TEF. A janela cria a cobrança na maquininha **uma vez**, sonda a cada 10s, e ao ver `CNC` o pagamento entra aprovado na venda, com NSU, autorização e bandeira na tela. Desistir pede confirmação e avisa que a transação em voo não é cancelada. Pode haver vários TEFs na mesma venda, e a NFCe sai com `TEFPagId`.

**Independent Test**: `quickstart.md` cenários 1–11 e 18. Aplicar dois TEFs aprovados e finalizar: o `FaturarNFCe` leva dois `TEFPagId` distintos e nenhum dos três campos TEF antigos.

### Tests for User Story 1 ⚠️ (escrever primeiro, garantir RED)

- [X] T020 [P] [US1] Criar `tests/unit/domain/pagamento/formaParaRetrato.spec.ts` (RED): forma TEF aprovada → `TEFPagId` = `dadosTEF.pagId`, `TEFBandeira`, `TEFTipoIntegracao: '1'`, e **ausência** de `TEFidentificacao`/`TEFCNPJ`/`TEFNumeroAutorizacao` (T11); forma sem TEF → nenhum campo `TEF*`.
- [X] T021 [P] [US1] Criar `tests/integration/ModalTef.spec.tsx` (RED), com o mesmo arranjo de `tests/integration/ModalPix.spec.tsx`: `intervaloMs` e `atrasoFechamentoMs` injetados e `erpClient` falso. Cobrir a máquina de `data-model.md` §4.1:
  - (a) montagem em `StrictMode` → **uma** chamada de `CriarCardPagamento` (T2);
  - (b) consultas `PDT → PROC_PAG → CNC` → `onAprovado` chamado no tick do `CNC`, **antes** de passar o atraso (T3), com `DadosTEF` montado do item consultado; tela aprovada mostra NSU, Autorização e Bandeira (`FR-015`), e "—" em campo ausente;
  - (c) fechamento automático após `atrasoFechamentoMs`; botão "Fechar", `X` e ESC liberados só depois de aprovado;
  - (d) aguardando: ESC não fecha; `X` explica ao ser clicado (`lib/bloqueio.ts`);
  - (e) "Desistir da operação" → confirmação com o aviso de `FR-010` → `onAbandonado` + `onFechar`, sem nenhuma chamada além de `ConsultarStatusCard` (T4);
  - (f) `REJ_PAG` → `onAbandonado` com a mensagem do motivo;
  - (g) erro de criação → painel com a `MensagemErro`, "Tentar novamente" faz uma chamada nova, e "Desistir" sai **sem** confirmação;
  - (h) `usuarioGamPresente: false` ou `clienteAtual: null` → nenhuma requisição, `onAbandonado` com o motivo (`FR-014`);
  - (i) o corpo leva `PagamentoParcelas: 2` para crédito com prazo 2 e `1` para débito (`FR-013`);
  - (j) desmontar com o polling ligado não deixa requisição pendente.
- [X] T022 [P] [US1] Em `tests/unit/client/pagamento/ListaPagamentosAplicados.spec.tsx`, acrescentar (RED):
  - (a) pagamento `PENDENTE_INTEGRACAO` com `integracao: 'TEF'` monta a janela TEF, e com `PIX_DINAMICO` continua montando a do PIX;
  - (b) a janela segue montada no estado aprovado (segue o `idPagamento`);
  - (c) dois TEFs em sequência na mesma venda → duas janelas recriadas (a `key` muda), sem reuso das travas (`FR-012`);
  - (d) com a janela TEF aberta, tentar inserir outra forma (botão "Adicionar pagamento" e atalho de venda rápida) não insere nada (T7).
- [X] T023 [P] [US1] Atualizar `tests/unit/shared/dav.schema.spec.ts` e `tests/unit/domain/importacaoVenda/mapearVendaExistente.spec.ts` (RED): documento com `TEFPagId` → preservado até o retrato; documento sem os três campos antigos → aceito; documento antigo com eles → aceito e ignorado.

### Implementation for User Story 1

- [X] T024 [US1] Ajustar `src/shared/schemas/dav.schema.ts` e `src/client/domain/importacaoVenda/mapearVendaExistente.ts` (`research.md` D16, `contracts/erp-tef-api.md` §6). Depende de T008.
  - `TEFPagId` entra opcional; `TEFidentificacao`, `TEFCNPJ` e `TEFNumeroAutorizacao` passam a opcionais e deixam de ser lidos.
  - `TefImportado`/`paraTef` passam a reconhecer TEF por `TEFPagId` não vazio, e o `pagId` chega ao `dadosTEF` do pagamento importado para ser **reenviado** ao faturar.
  - A forma importada continua com `integracao: 'NENHUMA'` (item 65 de `PENDENCIES.md`).

  T023 fica verde.
- [X] T025 [US1] Reescrever o bloco TEF de `src/client/domain/pagamento/formaParaRetrato.ts`: envia `TEFPagId`, `TEFBandeira` e `TEFTipoIntegracao`, e deixa de enviar os três campos removidos. Ajustar o tipo `FormaDePagamentoRetrato` em `src/client/domain/venda/montarRetratoVenda.ts` se ele declarar os campos antigos. T020 fica verde e `tests/integration/validacaoVendaSlice.spec.ts` continua verde.
- [X] T026 [US1] Implementar `src/client/features/pagamento/tef/ModalTef.tsx` — **consultar o Pencil MCP antes de implementar**: frames `Y0ka3`/`uHAyW` e `xWrzX`/`A9MNZI`, além dos nós `H4DCf`, `xObO3`, `hEB6G`, `ELWs2`, `SJmhL`, `CDhv3`, `mz2gp`, `vjHCo` e `xpon7`. Seguir `contracts/tef-domain-api.md` §3 (`ModalTefProps`) e a estrutura do `ModalPix.tsx`:
  - `useFocoDeModal`;
  - trava `desfechoEmitido` e `criacaoIniciada`;
  - um único `abandonar()` para desistência e falha;
  - ESC só depois de aprovado;
  - fechamento automático em `MS_FECHAMENTO_APOS_APROVACAO_TEF = 10_000`.

  Rótulo do rodapé: **"Desistir da operação"** (`research.md` D12). Estados sem nó (criando, erro de criação) reusam a moldura (item 66). Tokens de cor e raio de `src/client/styles/global.css`; valor em `font-mono`. **Não importar `vendaStore`.** T021 fica verde.
- [X] T027 [US1] Em `src/client/features/pagamento/ListaPagamentosAplicados.tsx`, criar `useTefPendente()`, espelho de `usePixPendente`: `find` do pagamento `PENDENTE_INTEGRACAO` com `integracao === 'TEF'`, `idExibido` acompanhando o pagamento exibido, `key={idPagamento}`. As props vêm do store:
  - `prazoDaCondicao` de `condicaoSelecionada.prazo`;
  - `meioPagtoNFe`, `formaCodigo` e `valorAplicado` do pagamento;
  - `clienteAtual`;
  - `usuarioGamPresente` de `useSessionStore` (`UsuarioGAM` não vazio).

  Ligar `onAprovado` → `confirmarPagamentoIntegrado(id, { dadosTEF })` e `onAbandonado` → `recusarPagamentoIntegrado`. Atualizar o TSDoc de `iniciarIntegracao` em `src/client/stores/vendaStore.ts`: a 010 também liga a janela pelo estado, e a porta segue no-op. T022 fica verde.

**Checkpoint**: US1 completa. Venda com TEF aprovado finaliza com `TEFPagId` (MVP).

---

## Phase 4: User Story 2 — Ocultar a opção quando não disponível (Priority: P1)

**Goal**: sem `TEFAtivo` ou com forma POS (`FormaIntegracaoCartao` ≠ `'1'`), nenhuma janela TEF nasce e nenhum endpoint SmartTEF é chamado. **Já implementado pela 008** (`resolverIntegracao`/`formaDisponivel`, AD-180/AD-250). Esta fase só **prova** que a 010 não abriu um segundo caminho.

**Independent Test**: `quickstart.md` cenário 17.

### Tests for User Story 2

- [X] T028 [P] [US2] Conferir `tests/unit/domain/pagamento/roteamentoIntegracao.spec.ts` e acrescentar só os casos que faltarem: `tefAtivo: false` → cartão `NENHUMA`; `integracaoCartao` `''`/`'2'` → `NENHUMA`; PIX com `'1'` e `tefAtivo` → `TEF`, mesmo com `pixAtivo`. Sem mudança de código esperada; se algum falhar, é regressão a investigar, não a contornar.
- [X] T029 [P] [US2] Em `tests/unit/client/pagamento/ListaPagamentosAplicados.spec.tsx`, acrescentar: forma de cartão aplicada com `integracao: 'NENHUMA'` entra `APROVADO`, não monta a janela TEF e não faz nenhuma requisição SmartTEF.

**Checkpoint**: US2 provada sem código novo.

---

## Phase 5: User Story 3 — Desfazer um TEF já aprovado, pelo estorno do ERP (Priority: P2)

**Goal**: "Remover" num TEF aprovado pede confirmação e abre a janela de estorno. A janela consulta o status primeiro, chama `EstornarPagamento` se preciso e sonda até `EST`. Só aí a forma é riscada. Estorno rejeitado, com erro ou abandonado mantém o TEF aprovado e a venda bloqueada para suspensão.

**Independent Test**: `quickstart.md` cenários 12–16.

### Tests for User Story 3 ⚠️ (escrever primeiro, garantir RED)

- [X] T030 [P] [US3] Em `tests/integration/pagamentoSlice.spec.ts`, acrescentar os casos de `confirmarEstornoTef` (RED):
  - (a) TEF `APROVADO` → `EXCLUIDO`, saldo volta, evento `FORMA_PAGAMENTO_REMOVIDA` e `invalidarVeredito` chamado (T5);
  - (b) no-op para PIX, dinheiro, TEF `PENDENTE_INTEGRACAO` e TEF já `EXCLUIDO`, sem evento;
  - (c) `removerPagamento` **continua** recusando TEF aprovado com `AVISO_TEF_IRREVERSIVEL` (`FR-003`);
  - (d) depois de `confirmarEstornoTef`, `descartarPagamento` e `podeMutarCarrinho` voltam a liberar (`FR-009`);
  - (e) com dois TEFs aprovados, estornar um mantém o outro bloqueando.
- [X] T031 [P] [US3] Criar `tests/integration/JanelaEstornoTef.spec.tsx` (RED). Cobrir a máquina de `data-model.md` §4.2:
  - (a) consulta inicial `EST` → `onEstornado` **sem** chamar `EstornarPagamento`;
  - (b) consulta inicial `SOL_EST` → só sonda, sem segundo pedido;
  - (c) consulta `CNC` → `EstornarPagamento` → `SOL_EST` → polling → `EST` → `onEstornado`;
  - (d) `EstornarPagamento` devolve `EST` direto → `onEstornado` sem polling;
  - (e) `Sucesso: false` → painel com a `MensagemErro`, sem `onEstornado` (T6);
  - (f) `REJ_EST` → aviso, sem `onEstornado` (T6);
  - (g) "Desistir de esperar" → confirmação com o aviso de estorno solicitado → `onFechar` sem `onEstornado`;
  - (h) ESC e `X` inertes enquanto aguarda;
  - (i) `StrictMode` → um único `EstornarPagamento`.
- [X] T032 [P] [US3] Em `tests/unit/client/pagamento/ListaPagamentosAplicados.spec.tsx`, acrescentar (RED):
  - (a) o botão remover de TEF aprovado **não** tem mais `aria-disabled` e abre a confirmação "Estornar o pagamento no cartão?";
  - (b) cancelar a confirmação não chama nada;
  - (c) confirmar monta `JanelaEstornoTef` com o `pagId` do pagamento;
  - (d) `onEstornado` chama `confirmarEstornoTef` e a faixa aparece riscada;
  - (e) PIX e formas de documento mantêm as confirmações atuais.

### Implementation for User Story 3

- [X] T033 [US3] Em `src/client/stores/slices/pagamentoSlice.ts`, implementar `confirmarEstornoTef(idPagamento)` (`data-model.md` §5, `contracts/tef-domain-api.md` §4) com os mesmos efeitos de `removerPagamento` (riscado, evento, `invalidarVeredito`), restrita a TEF `APROVADO`. `removerPagamento` mantém a guarda. Reescrever a frase e o TSDoc de `AVISO_TEF_IRREVERSIVEL`: a saída agora é o estorno pelo botão Remover, não "cancele no terminal". Atualizar o TSDoc de I6. T030 fica verde.
- [X] T034 [US3] Implementar `src/client/features/pagamento/tef/JanelaEstornoTef.tsx` (`contracts/tef-domain-api.md` §3) — **consultar o Pencil MCP antes de implementar**: não há nó próprio (item 66), então reusar a moldura do `ModalTef` (cabeçalho `H4DCf`, bloco de valor `SJmhL`, rodapé `Ttsy4`) com título e estados de estorno. Comportamento:
  - consulta inicial por `consultarStatusTef`;
  - `estornarTef` só quando o status é `CNC` ou desconhecido;
  - polling por `useStatusTef`, interpretado com `interpretarStatusEstornoTef`;
  - travas de desfecho único e de "um pedido de estorno por montagem".

  T031 fica verde.
- [X] T035 [US3] Em `src/client/features/pagamento/ListaPagamentosAplicados.tsx`:
  - `motivoBloqueioRemocao` deixa de bloquear TEF aprovado;
  - `pedirRemocao` passa a abrir uma `DialogoConfirmacaoDestrutiva` de estorno (`testId="confirmar-estorno-tef"`, textos de `avisosTef.ts`) para TEF aprovado;
  - confirmar monta `JanelaEstornoTef`, e `onEstornado` chama `confirmarEstornoTef`.

  Depende de T033 e T034. T032 fica verde.
- [X] T036 [US3] Revisar os textos de bloqueio por TEF aprovado fora da lista, para apontarem para o estorno em vez de "cancele no terminal":
  - `temTefAprovado` e o motivo de suspensão em `src/client/features/finalizacao-suspensao/useFinalizarOuSuspenderVenda.ts`;
  - o motivo em `src/client/features/pagamento/ConfiguracaoPagamento.tsx`, linha do `integracao === 'TEF' && status === 'APROVADO'`.

  Só texto e TSDoc; a regra não muda (`FR-004`). Ajustar as asserções de texto que quebrarem nos testes existentes.

**Checkpoint**: US3 completa. Um TEF aprovado sai da venda só por estorno confirmado.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T037 Criar `tests/e2e/pagamento-tef.spec.ts` com o fluxo dourado do `quickstart.md`, nos projetos desktop e mobile (cenário 18): dois TEFs aprovados (débito e crédito `'2 VEZES'`), estorno de um, finalizar, e afirmar o corpo do `FaturarNFCe` (um `TEFPagId`, sem campos TEF antigos). Incluir também desistência (cenário 6) e estorno rejeitado (cenário 14). Antes de rodar, derrubar o que estiver na porta 3100 (`e2e-porta-3100-ocupada-por-outro-projeto`).
- [X] T038 [P] Atualizar a documentação de domínio:
  - `.specs/features/pagamento-tef/spec.md`: Requirement Traceability `PAY-12` → Verified;
  - `.specs/codebase/CONTRATO-PAGAMENTO-ERP-REAL.md`: seção SmartTEF com o que T001 mediu;
  - `.specs/project/STATE.md`: um AD de implementação com os desvios de contrato decididos no caminho.

  Corrigir decisão superada **no lugar**, nunca anexando no fim (`docs/agents/domain.md`).
- [X] T039 Rodar os gates e corrigir até ficarem limpos:
  - `npm run test`, `npx tsc --noEmit`, `npm run lint` e o formatador do projeto;
  - a skill `typescript-strict` sobre os arquivos novos (sem `any`/`as` na fronteira, `import type`) — obrigatória antes do push;
  - a skill `owasp-security` sobre o diff do BFF (`erp-proxy.ts`, `cookie.ts`, `session-start.ts`) — injeção de `UsuarioGAM`/`EmpCod`, A01/A04.
- [ ] T040 **Validação ao vivo com o usuário** — **aberta (2026-10-02, AD-260, item 67):** o usuário ainda não tem o terminal de homologação, e o ERP ainda não publica `UsuarioGAM` (item 64). (`quickstart.md`, pré-requisito 4): cenários 1, 2, 10, 13 e 14 contra o ERP real, com terminal de homologação, depois de o ERP publicar `UsuarioGAM` (item 64). Registrar o resultado no AD de T038. Se o ERP ainda não tiver publicado, deixar a tarefa aberta e dizer isso no fechamento — não marcar como feita.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Fase 1)**: T001 bloqueia toda tarefa marcada "(depende de T001)": T010, T012, T013, T014, T018 e T019. T002 não depende de nada.
- **Foundational (Fase 2)**: depende da Fase 1 e bloqueia todas as user stories.
- **US1 (Fase 3)**: depende da Fase 2.
- **US2 (Fase 4)**: depende só da Fase 2. Em tese pode rodar junto da US1, mas T029 e T022 editam o mesmo arquivo de teste.
- **US3 (Fase 5)**: depende da Fase 2 e, na prática, da US1. Sem a US1 não há TEF aprovado para estornar no teste de integração da lista nem no E2E. Os testes de slice e da janela (T030, T031) só precisam da Fase 2.
- **Polish (Fase 6)**: depende das três stories.

### Ordem interna da Fase 2

```text
T003 → T004            T005 → T006            T007      T008      T009      T011
T001 → T010 → T012 → T013 → T014
T015 ┐
T016 ┴→ T017
T001 + T016 → T018
T001 → T019
```

### Arquivos tocados por mais de uma tarefa (nunca em paralelo)

| Arquivo | Tarefas |
|---|---|
| `src/client/features/pagamento/ListaPagamentosAplicados.tsx` | T027, T035 |
| `tests/unit/client/pagamento/ListaPagamentosAplicados.spec.tsx` | T022, T029, T032 |
| `src/client/stores/slices/pagamentoSlice.ts` | T033 (T008 só se a compilação exigir) |
| `src/client/domain/pagamento/saldoPagamento.ts` | T008 |
| `src/client/domain/pagamento/formaParaRetrato.ts` | T008 (compilar), T025 (lógica) |
| `src/server/routes/erp-proxy.ts` | T018 |
| `tests/e2e/support/erp-mock.ts` | T019, T037 (ajustes) |

### Within Each User Story

Testes (RED) → domínio/schema → serviço → componente → integração na lista. Commit ao fim de cada tarefa ou grupo lógico, com push ao fim da tarefa coerente (`rules.md`).

### Parallel Opportunities

- **Fase 2**: T003/T005/T007/T008/T009/T011 em paralelo; T015 e T016 em paralelo.
- **US1**: T020, T021, T022 e T023 (quatro arquivos de teste diferentes) em paralelo; T024 e T025 em paralelo entre si.
- **US3**: T030 e T031 em paralelo; T032 depois de T022/T029, por ser o mesmo arquivo.
- **Polish**: T038 em paralelo a T037.

---

## Parallel Example: Foundational

```text
Task: "T003 [P] tests/unit/domain/tef/interpretarStatusTef.spec.ts (RED)"
Task: "T005 [P] tests/unit/domain/tef/parcelasDoTef.spec.ts + pagadorTef.spec.ts (RED)"
Task: "T007 [P] src/client/domain/tef/cobrancaTef.ts (tipos)"
Task: "T009 [P] src/client/features/pagamento/tef/avisosTef.ts"
Task: "T011 [P] UsuarioGAM em src/shared/schemas/bootstrap.schema.ts"
Task: "T015 [P] extrairUsuarioGam em src/server/session/getSessao.ts"
Task: "T016 [P] usuarioGam opcional em src/server/session/cookie.ts"
```

## Parallel Example: User Story 1

```text
Task: "T020 [P] [US1] tests/unit/domain/pagamento/formaParaRetrato.spec.ts"
Task: "T021 [P] [US1] tests/integration/ModalTef.spec.tsx"
Task: "T022 [P] [US1] tests/unit/client/pagamento/ListaPagamentosAplicados.spec.tsx"
Task: "T023 [P] [US1] tests/unit/shared/dav.schema.spec.ts + mapearVendaExistente.spec.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Fase 1: medir com o usuário (T001).
2. Fase 2: foundational completa.
3. Fase 3: US1. Venda com TEF aprovado finaliza com `TEFPagId`.
4. **Parar e validar**: cenários 1–11 do `quickstart.md` no mock e, se `UsuarioGAM` já existir, no ERP real com o usuário.

Sem a US3, um TEF aprovado por engano continua travando a venda, como hoje: o MVP não piora nada, só deixa de ter a saída.

### Incremental Delivery

1. Setup + Foundational → base testada.
2. US1 → MVP de cobrança.
3. US2 → regressão provada (barato, sem código).
4. US3 → estorno.
5. Polish → E2E, docs, gates e validação ao vivo.

---

## Notes

- `iniciarIntegracao` continua **no-op**: a janela nasce do estado (AD-158). Não criar um segundo gatilho.
- Nenhum caminho de abandono chama cancelamento. A API não expõe `CancelarPagamento`, e o usuário pediu o aviso explícito (T4).
- `EmpCod` e `UsuarioGAM` nunca no JS (T8). Se um teste precisar deles no corpo, o teste está no lugar errado: é teste do BFF.
- Literal de status desconhecido: espera, nunca aprova nem estorna (T1).
- Edição de arquivo só com `Read`/`Write`/`Edit`, nunca por script (`CLAUDE.md`).
