# Phase 0 — Research: Pagamento — TEF

**Feature**: `010-pagamento-tef` | **Date**: 2026-10-02 | **Plan**: `specs/010-pagamento-tef/plan.md`

Decisões que fecham todo `NEEDS CLARIFICATION` da feature. Base: o pedido do usuário de 2026-10-02 (pontos 0–7, citados no `plan.md`), `specs/010-pagamento-tef/spec.md`, `.specs/features/pagamento-tef/spec.md`, as decisões de `.specs/project/STATE.md` (AD-026, AD-037, AD-064, AD-144, AD-161, AD-162, AD-163, AD-180, AD-209, AD-224, AD-250, AD-251) e — **fonte primária desta rodada** — a KB GeneXus do ERP (`CentriumDEVU6`, lida pelo MCP `genexus` em 2026-10-02): API `ApiCentriumOAuth` (bloco `//SmartTEF`), procedures `PSmartTEF`, `PSmartTEF_CriarCardPagamento`, `PSmartTEF_ConsultarStatusCard`, `PSmartTEF_EstornarPagamento`, `PCheckout_FaturarNFCe`, `PCheckout_GetSessao`, SDTs `SDTSmartTefCriarCardReq`, `SDTSmartTefResposta`, `SDTSmartTefCriarCardResp`, `SDTSmartTefConsultaCard`, `SDTSmartTefCancelamentoResp`, `CheckoutFaturarNFCe`, `SessaoUsuario` e o domínio `SmartTefStatusPagamento`.

**O que a KB não responde e só a medição ao vivo responde** está marcado como **[medir]** — são três pontos, todos isolados em uma função cada, para que a medição troque uma linha e não um desenho (D6, D7, D17).

---

## D1 — Esta feature não re-decide o roteamento: só reage ao veredito `TEF`

**Decision**: `resolverIntegracao(forma, capacidades)` (`src/client/domain/pagamento/roteamentoIntegracao.ts`) já devolve `'TEF'` quando `capacidades.tefAtivo && forma.integracaoCartao === '1'` — para cartão de crédito, cartão de débito (AD-180) **e** PIX (AD-250). `integracaoCartao` é o `FpgNfTefPos` do cadastro da forma (`FormaIntegracaoCartao` no `GetSessao`): é a regra que o usuário cita no pedido ("o TEF chama quando FpgNFTefPOS é igual a 1"). A 010 implementa só o que acontece **depois**: criar a cobrança na maquininha, sondar o status, confirmar ou abandonar, e estornar.

**Rationale**: Constitution II. O ponto de decisão já é único e testado; uma segunda checagem de `integracaoCartao` no módulo TEF poderia divergir dele em silêncio — exatamente o que o predicado `cobradaNoTerminal` foi criado para impedir.

**Alternatives considered**: *checar de novo no modal, por defesa* — rejeitado pelo mesmo argumento de D1 da 009.

---

## D2 — Três endpoints reais, confirmados na KB — fecha o item 41 de `PENDENCIES.md`

**Decision**: o bloco `//SmartTEF` da API `ApiCentriumOAuth` expõe exatamente os três métodos que o usuário nomeou:

| Método | Verbo | Entrada (KB) | Saída (KB) |
|---|---|---|---|
| `CriarCardPagamento` | `POST` | `in:&CriarCardReq` (`SDTSmartTefCriarCardReq`) | `out:&RespostaSmartTEF` (`SDTSmartTefResposta`) |
| `ConsultarStatusCard` | `GET` | `in:&Empresa`, `in:&SmartTefPaymentIdentifier` (`VARCHAR(40)`) | `out:&RespostaSmartTEF` |
| `EstornarPagamento` | `POST` | `in:&Empresa`, `in:&SmartTefPaymentIdentifier` | `out:&RespostaSmartTEF` |

Contrato completo em `contracts/erp-tef-api.md`. Os três passam pelo proxy genérico `/api/erp/*` da feature 002 — nenhuma rota nova de BFF, só as regras de injeção de D7.

**Rationale**: o item 41 (aberto em AD-162, 2026-09-04) dizia que "os nomes dos dois endpoints, o formato do corpo/resposta de cada um" faltavam. A KB os tem; o `ApiCentriumOAuth.yaml` do repositório **ainda não** (é anterior ao bloco `SmartTEF`), e por isso o YAML deixa de ser a referência para estes três endpoints — a KB é.

**Observação que muda a leitura de AD-162**: o "cancelamento" que AD-162 descrevia é, no contrato real, um **estorno** (`EstornarPagamento`) cuja confirmação vem pela **mesma** consulta de status do pagamento (`ConsultarStatusCard`) — não por um segundo endpoint dedicado. AD-162 previa "dois endpoints (solicitação de cancelamento e confirmação)"; são dois, mas o de confirmação é o de consulta de status, compartilhado com a cobrança.

---

## D3 — A resposta é um envelope de transporte; o dado da SmartTEF vem como **texto JSON** dentro dele

**Decision**: os três métodos devolvem `SDTSmartTefResposta`:

```text
Sucesso          : Boolean   — HTTP 2xx da SmartTEF (não é veredito de pagamento)
CodigoStatusHttp : NUMERIC(3) — 0 quando a chamada nem saiu (erro de transporte ou recusa local)
MensagemErro     : VARCHAR(250)
RespostaJson     : LONGVARCHAR — corpo cru da SmartTEF, como STRING
```

A validação de fronteira é, portanto, **em dois estágios** (`contracts/erp-tef-api.md` §4): (1) Zod sobre o envelope; (2) `JSON.parse(RespostaJson)` seguido de um segundo schema Zod, específico de cada operação. Um `RespostaJson` vazio ou não-JSON com `Sucesso: true` é resposta fora do contrato (`ErroRespostaInvalida`), nunca "pendente".

**Rationale**: Constitution IV. Validar só o envelope deixaria o campo que decide o dinheiro (`payment_status`) entrar sem schema — o mesmo erro que `corpo-da-nfce-viaja-envelopado` registrou para o retrato da NFCe.

**Note sobre `messages`**: nenhum dos três métodos declara `out:&Messages`. A recusa de negócio chega por `Sucesso: false` + `MensagemErro` (ex.: `'Serial do POS (serial_pos) nao localizado para o usuario informado'`, `'Parcelamento so e permitido para pagamentos do tipo CREDITO'`, ambas montadas em `PSmartTEF`), não por `messages[]`. O helper `recusaDeNegocio` da 009 não se aplica; `semEnvelope` continua obrigatório pela regra de AD-218 **[medir]** se o ERP envolve a saída em `{ "RespostaSmartTEF": … }`.

---

## D4 — Os status do card da SmartTEF (`SmartTefStatusPagamento` + `REJ`, `PROC`, `IMP`)

**Decision**: o domínio `SmartTefStatusPagamento` (`CHARACTER(10)`, enumerado) tem nove literais, lidos da KB. A lista que o usuário colou em 2026-10-07 (AD-268) acrescenta três, que a KB não tinha — `REJ`, `PROC` e `IMP` — e fixa o significado dos rejeitados:

| Literal | Significado | Fase de **cobrança** | Fase de **estorno** |
|---|---|---|---|
| `PDT` | Pendente | `PENDENTE` | — (não deveria ocorrer) → `ESTORNO_PENDENTE` |
| `PROC_PAG` | Processando pagamento | `PENDENTE` | → `ESTORNO_PENDENTE` |
| `PROC` | Processando (genérico) | `PENDENTE` | `ESTORNO_PENDENTE` |
| `CNC` | Concluído | **`APROVADO`** | `ESTORNO_PENDENTE` (estorno ainda não registrado) |
| `REJ` | **O cartão não passou nesta tentativa.** O cliente pode tentar de novo, e a mesma cobrança pode chegar a `CNC` | **`TENTATIVA_RECUSADA`** — **não é desfecho**: a janela segue consultando e mostra o aviso com o `reason` | `ESTORNO_PENDENTE` |
| `CAN_ERP` | Cancelado pelo ERP | `FALHA` (`CANCELADO_NO_ERP`) | `ESTORNO_REJEITADO` |
| `REJ_PAG` | **O operador da maquininha não aceitou a cobrança** | `FALHA` (`PAGAMENTO_REJEITADO`) | `ESTORNO_REJEITADO` |
| `SOL_EST` | Estorno solicitado | `FALHA` (`ESTORNADO_FORA_DO_CHECKOUT`) | `ESTORNO_PENDENTE` — a janela continua consultando |
| `PROC_EST` | Processando estorno | `FALHA` (`ESTORNADO_FORA_DO_CHECKOUT`) | `ESTORNO_PENDENTE` |
| `EST` | Estornado | `FALHA` (`ESTORNADO_FORA_DO_CHECKOUT`) | **`ESTORNADO`** |
| `REJ_EST` | **O operador da maquininha não aceitou o estorno** | `FALHA` (`ESTORNADO_FORA_DO_CHECKOUT`) | **`ESTORNO_REJEITADO`** |
| `IMP` | Impresso — só de impressão (`print_status`) | `PENDENTE` (não esperado) | `ESTORNO_PENDENTE` |
| qualquer outro | — | `PENDENTE` (nunca aprovado) | `ESTORNO_PENDENTE` (nunca estornado) |

Duas funções puras, uma por fase (`interpretarStatusCobrancaTef`, `interpretarStatusEstornoTef` — `data-model.md` §2), cada uma com `switch` exaustivo e ramo `default` explícito.

**Rationale**:
- **Só `CNC` aprova.** Além de ser o significado do literal, é o único status que `PCheckout_FaturarNFCe` aceita: o `For Each` sobre `TransacaoTEF` filtra `TEFSmartSt = SmartTefStatusPagamento.CNC` e, sem achar, recusa a nota com "Pagamento SmartTEF … não Localizada". Dar por aprovado qualquer outro status produziria uma NFCe que o ERP recusa.
- **Literal desconhecido nunca vira sucesso** (Constitution IV, mesma regra J2 da 009) — mas vira **pendente**, não falha: um literal novo da SmartTEF não pode abandonar uma cobrança que o cliente talvez já tenha pago no cartão; o operador continua tendo a saída manual (D12).
- Na fase de cobrança, um status de estorno (`SOL_EST`…`REJ_EST`) significa que alguém estornou a transação **fora** do Checkout antes de ela ser confirmada aqui — fecha a janela e tira o pagamento da venda (`FALHA`), com o aviso de que foi estornada fora do Checkout. A frase está certa mesmo para `REJ_EST`: o estorno foi pedido fora daqui.
- **`REJ` não encerra a cobrança** (AD-268). O cartão não passou, mas o cliente pode tentar de novo na mesma cobrança. Tratá-lo como falha abandonaria uma cobrança que depois pode ser paga. A janela fica esperando e mostra "O cartão não foi aprovado", com o `reason` quando a SmartTEF o informa; o aviso some quando o status muda.
- **`REJ_PAG` e `REJ_EST` são o operador da maquininha não aceitando** a cobrança ou o estorno, e por isso a frase de `REJ_PAG` diz exatamente isso. Já `REJ` é o cartão.

---

## D5 — O "GUID do pagamento" é o `payment_identifier` da SmartTEF, e a chave é do ERP

**Decision**: o identificador que o usuário chama de "GUID do pagamento criado anteriormente" (pontos 6 e 7) é o `payment_identifier` (`VARCHAR(40)`) devolvido dentro do `RespostaJson` de `CriarCardPagamento` (`SDTSmartTefCriarCardResp`). Ele é:
- o `SmartTefPaymentIdentifier` de `ConsultarStatusCard` e `EstornarPagamento`;
- o `TEFPagId` da tabela `TransacaoTEF` gravada por `PSmartTEF_NovoPagamento`;
- o `TEFPagId` que viaja em `CheckoutFaturarNFCe.FormasDePagamento[]` (D16).

O Checkout **nunca** gera esse valor.

**Rationale**: mesma lição de AD-251 para o `TrnGUID` do PIX — a chave da transação é do ERP/adquirente e chega na resposta; sortear uma no cliente não identificaria nada.

---

## D6 — Corpo de `CriarCardPagamento`: seis campos do Checkout + dois do BFF

**Decision**: `SDTSmartTefCriarCardReq` tem oito campos. Origem de cada um:

| Campo (grafia da KB) | Tipo | Quem preenche | Valor |
|---|---|---|---|
| `EmpCod` | `NUMERIC(6)` | **BFF** (cookie, D7) | empresa da sessão |
| `UsuarioGAM` | `VARCHAR(40)` | **BFF** (cookie, D7) | GUID GAM do operador |
| `PagamentoValor` | `NUMERIC(10,2)` | cliente | `valorAplicado` do pagamento, `Centavos → reais` só na fronteira |
| `PagamentoParcelas` | `NUMERIC(3)` | cliente | D8 |
| `PagamentoCpfCliente` | `CPF` (`VARCHAR(14)`) | cliente | D9 |
| `PagamentoNomeCliente` | `VARCHAR(100)` | cliente | D9 |
| `FPgCod` | `Attribute:FPgCod` | cliente | `formaCodigo` do pagamento |
| `CNPJAdquirente` | `VARCHAR(40)` | **ninguém** | o próprio ERP sobrescreve (`PSmartTEF_CriarCardPagamento`, sub `'CarregarForma'`: `AdqCliCod` da forma → `CliCgc2`) |

O tipo de pagamento (`CREDIT`/`DEBIT`/`PIX`) **não** é enviado: o ERP o deduz de `FpgNfFormaPagamento` da forma (`'03'` → `CREDIT`, `'04'` → `DEBIT`, `'17'` → `PIX`, qualquer outro → `DEBIT`).

**Grafia**: o pedido escreve `FpgCod`; a KB declara `FPgCod`. Vale a da KB **[medir]** — a pendência 62 (AD-258) já registra que a sensibilidade a maiúsculas do desserializador GeneXus não foi confirmada para o `GerarPIX`.

**Envelope do corpo [medir]**: corpo **plano** na primeira tentativa — é o precedente medido mais recente para um `POST` com um SDT único de entrada (AD-251, `GerarPIX`: "o ERP só gera a cobrança com o corpo na raiz"). Se o ERP exigir `{ "CriarCardReq": { … } }`, troca-se `montarCorpoCriarCard` e a regra de injeção do BFF (D7) — as duas aceitam as duas formas desde o início, ver `contracts/erp-tef-api.md` §1.

**Rationale**: `EmpCod` e `UsuarioGAM` decidem **de quem** é a cobrança e **em qual maquininha** ela aparece (`PSmartTEF` escolhe o `serial_pos` pelo `UsuarioGAM`). São o mesmo tipo de campo que AD-024/AD-224 tiraram do navegador.

---

## D7 — `UsuarioGAM`: lido do `GetSessao` pelo BFF, gravado no cookie, injetado no corpo; o navegador só sabe se ele existe

**Decision**:
1. **Fonte**: campo novo `UsuarioGAM` na **raiz** da resposta de `GetSessao` (ponto 0 do pedido). **Ainda não existe** — o SDT `SessaoUsuario` da KB não o tem (lido em 2026-10-02). Abre o item 64 de `PENDENCIES.md`.
2. **Servidor**: `/session/start` já chama `GetSessao` para obter `UsuarioCodigo` (AD-224, `buscarUsuarioCodigo`); a mesma resposta passa a render `UsuarioGAM`, gravado no cookie cifrado como campo **opcional** `usuarioGam`. Opcional ⇒ fora de `CAMPOS_OBRIGATORIOS` ⇒ **sem bump** de versão do cookie (`cookie.ts`, regra do próprio arquivo: o bump é "a cada campo obrigatório novo").
3. **Injeção**: o proxy insere `UsuarioGAM` (e `EmpCod`) no corpo de `CriarCardPagamento` — **inserção por caminho**, mesmo mecanismo de `CAMINHOS_COM_EMPRESA_NA_RAIZ`, porque o navegador não manda o campo. Ocorrência vinda do navegador é sobrescrita.
4. **Cliente**: `bootstrap.schema.ts` ganha `UsuarioGAM: z.string().optional()` **só para saber se ele existe**. Ausente ou vazio ⇒ a janela TEF recusa **sem rede**, com motivo que nomeia a causa (`ErroTefSemUsuarioGam`: "Este operador não tem usuário do TEF vinculado no ERP…") — e o pagamento pendente sai da venda pelo mesmo caminho de desistência (D12), como o `ErroPixSemCliente` da 009.
5. **`ConsultarStatusCard`** (`GET`) e **`EstornarPagamento`** (`POST`) recebem `Empresa` como parâmetro, não pelo cabeçalho (não há `Event … .Before` para eles na API). No `GET`, a regra de AD-205 (`queryComEmpresaDaSessao`, `Empresa` como **primeiro** par da query) já cobre. No `POST`, `EstornarPagamento` entra em `CAMINHOS_COM_EMPRESA_NA_RAIZ`.

**Rationale**: AD-224 — "o campo viaja no corpo, o corpo vem do navegador, e o ERP não o confere contra o token". Um `UsuarioGAM` forjado no DevTools mandaria a cobrança para a maquininha de **outro** operador. Ler do cookie custa uma linha a mais numa chamada que já acontece.

**Alternatives considered**: *o cliente manda o `UsuarioGAM` do bootstrap* — mais simples e o mesmo dado, mas reabre o furo que AD-224 fechou para `UsuarioCodigo`; rejeitado. *Esconder a forma TEF sem `UsuarioGAM`* — rejeitado: `FR-002` esconde quando **a empresa** não usa TEF; um operador sem vínculo é cadastro incompleto, e esconder a forma deixaria o operador sem saber por que o cartão "sumiu".

---

## D8 — Parcelas: `CondicaoPrazo` da condição no crédito, `1` no débito e no PIX

**Decision**: `PagamentoParcelas = parcelasDoTef(meioPagtoNFe, condicao.prazo)`:
- `CartaoCredito` → `Math.max(1, Math.trunc(condicao.prazo))`;
- `CartaoDebito` e `Pix` → `1`.

**Rationale**: decisão do usuário (2026-10-02), depois de confirmado na KB que `PCheckout_GetSessao` preenche `CondicaoPrazo = PraNumPar` — o número de parcelas da condição de pagamento — e de AD-216 ter medido os valores (`'30 DIAS'` → `1`, `'2 VEZES'` → `2`, `'30/60/90/120 DIAS'` → `4`). O débito e o PIX são fixados em `1` porque `PSmartTEF` recusa sem chamar a SmartTEF quando `PagamentoParcelas > 1` e o tipo não é `CREDIT`. `prazo` `0` (condição à vista) vira `1`. A condição não muda com pagamento vivo na venda (I9 da 008), então lê-la no momento da criação é estável.

**Alternatives considered**: *operador escolhe no modal* — exigiria um campo que o Pencil não desenha, e duplicaria uma decisão que o cadastro da condição já tomou; *sempre 1* — perderia o parcelamento que o lojista configurou.

---

## D9 — Dados do pagador: cliente da venda; CPF vazio no cliente default

**Decision** (`montarPagadorTef`, puro):
- **Cliente identificado** → `PagamentoCpfCliente` = documento do cliente, só dígitos; `PagamentoNomeCliente` = nome do cliente.
- **Cliente default** → `PagamentoCpfCliente = ''` (ponto 5 do pedido); `PagamentoNomeCliente` = nome do cliente default (`ClienteDefaultNome`).
- **Sem cliente** → recusa local, `ErroTefSemCliente`, sem rede — rede de segurança, já que a ordem da venda (AD-209) garante cliente antes do pagamento.

O documento vai **como está** (CPF ou CNPJ): o domínio `CPF` do ERP é `VARCHAR(14)` e cabe um CNPJ; o valor só alimenta `extras.CPF` na SmartTEF, não validação fiscal.

**Rationale**: o pedido só fixou o CPF em branco para o default; o nome não tem regra de exceção, e mandar o nome do default é mais útil ao conciliador da SmartTEF do que vazio. Diferente do PIX desde AD-258, aqui o ERP **não** resolve o pagador pelo código do cliente — os campos são do SDT.

---

## D10 — Criação: comando imperativo, uma vez por montagem, sem `useQuery`

**Decision**: `useCriarCardTef` espelha `useGerarPix`: chamada em voo guardada num `ref` (reentrância devolve a mesma promessa), trava `criacaoIniciada` por montagem (StrictMode), status `idle | criando | erro`. Cada retry (`"Tentar novamente"` no painel de erro) é uma **nova** chamada.

**Rationale**: duas chamadas de `CriarCardPagamento` são **duas cobranças reais** na maquininha — pior que no PIX, porque o cliente pode passar o cartão nas duas. `PSmartTEF` tem timeout HTTP de 30s; a janela mostra o estado "Enviando para a maquininha…" enquanto isso.

**Retry após erro**: só é seguro porque o erro de criação, por definição, **não** devolveu `payment_identifier`. Se `Sucesso: true` chegou sem identificador legível, a resposta é tratada como `ErroRespostaInvalida` e o painel avisa que **pode** haver cobrança criada na maquininha — o operador confere no terminal antes de tentar de novo (mesma postura de D12).

---

## D11 — Polling: `ConsultarStatusCard` a cada 10s fixos — e é ele que atualiza o ERP

**Decision**: `useStatusTef(paymentIdentifier, habilitado)` — `useQuery` com `refetchInterval` condicional de `INTERVALO_POLLING_TEF_MS = 10_000` (AD-026, sem backoff, sem SSE), `staleTime: 0`, `gcTime: 0`, `retry: false`; erro de rede não encerra a cobrança, o próximo tick tenta de novo. Desligado na **mesma** renderização que processa um desfecho (J3 da 009). O mesmo hook serve à janela de estorno (D14).

**Achado que torna o polling obrigatório, não só cômodo**: `ConsultarStatusCard` → `PSmartTEF` (sub `'ConsultarStatusCard'`) → `PSmartTEF_AtualizaRetorno` grava o status **na `TransacaoTEF` do ERP**. E `PCheckout_FaturarNFCe` só aceita a forma TEF com `TEFSmartSt = CNC` naquela tabela. Ou seja: se o Checkout não observasse o `CNC` pelo polling, o ERP poderia não tê-lo gravado (o webhook de `AtualizarLoja` existe, mas não é garantia), e a NFCe seria recusada.

**Seleção do item**: `RespostaJson` de consulta é uma **lista** (`SDTSmartTefConsultaCard` com `.Count`). Usa-se o item cujo `payment_identifier` é o consultado; lista vazia ou sem o item ⇒ `PENDENTE`.

---

## D12 — Janela travada; desistir pede confirmação e **não cancela** a transação em voo

**Decision**: `ModalTef` replica as travas do `ModalPix` (pedido do usuário, ponto 1):
- enquanto não aprovado: ESC inerte, `X` do cabeçalho com bloqueio explicativo (`lib/bloqueio.ts`), único gesto de saída é o botão do rodapé **"Desistir da operação"**;
- "Desistir" com cobrança já criada abre `DialogoConfirmacaoDestrutiva` (`z-[60]`) com o aviso: **o Checkout não cancela automaticamente a transação em voo no TEF** — se o cliente ainda passar o cartão, ela pode ser aprovada na maquininha; confira no terminal;
- desistência confirmada **e** falha terminal (D4) convergem num único `abandonar()` → `recusarPagamentoIntegrado(idPagamento, motivo)` + aviso; nenhuma chamada de rede de cancelamento.

O rótulo do Pencil ("Cancelar operação", nó `mz2gp`) é **substituído** por "Desistir da operação" — mesma decisão do usuário já aplicada ao PIX (2026-09-04): um botão que diz "cancelar" e não cancela é falso positivo num caixa.

**Rationale**: `PSmartTEF` tem uma operação `CancelarPagamento` (`/commands/order/status/cancelar`), mas a API **não** a expõe ao Checkout — e o usuário pediu explicitamente o aviso "não cancelamos automaticamente". Desistência sem cobrança criada (erro de criação) sai direto, sem confirmação e sem o aviso sobre a maquininha (nada chegou a ela).

---

## D13 — Aprovação: entra na venda na hora; a janela fica 10s no estado aprovado

**Decision**: ao observar `CNC`, `onAprovado(dadosTef)` → `confirmarPagamentoIntegrado(idPagamento, { dadosTEF })` **imediatamente** (o saldo não pode mentir por 10s). A janela troca para o frame "PDV Online Web - Modal TEF Aprovado" (`xWrzX` / modal `A9MNZI`), com os detalhes da transação vindos do item consultado — **NSU** (`nsu_host`), **Autorização** (`autorization_code`, grafia da SmartTEF) e **Bandeira** (`card_brand`) — e fecha sozinha em `MS_FECHAMENTO_APOS_APROVACAO_TEF = 10_000`, ou antes, pelo botão "Fechar" (`xpon7`), `X` ou ESC.

**Rationale**: comportamento já aprovado pelo usuário para o PIX; o Pencil do TEF desenha o mesmo estado (o rodapé tem o botão "Fechar" de `$success`). Campo ausente no item consultado ⇒ a linha mostra "—", nunca um placeholder inventado.

---

## D14 — Exclusão de TEF aprovado = estorno; só se efetiva com `EST`

**Decision** (pedido do usuário, ponto 3; regra de confirmação escolhida pelo usuário em 2026-10-02):
1. O botão "Remover" de um TEF `APROVADO` **deixa de ser bloqueio** e passa a abrir uma confirmação destrutiva ("Estornar o pagamento no cartão?"). A I6 da 008 é **reescrita**, não revogada: continua proibida a remoção **direta** (`removerPagamento` mantém a guarda e o `AVISO_TEF_IRREVERSIVEL` como rede de segurança); a saída nova é o fluxo de estorno.
2. Confirmada, abre `JanelaEstornoTef` (travada como a de cobrança), que:
   a. **consulta o status primeiro** (`ConsultarStatusCard`, uma chamada): `EST` ⇒ efetiva sem pedir de novo; `SOL_EST`/`PROC_EST` ⇒ só sonda; `CNC` ⇒ pede o estorno;
   b. chama `EstornarPagamento(payment_identifier)`; `Sucesso: false` ⇒ painel de erro com `MensagemErro` íntegra, o TEF **continua aprovado** na venda;
   c. `Sucesso: true` ⇒ lê `payment_status` de `SDTSmartTefCancelamentoResp`: `EST` ⇒ efetiva; senão sonda `ConsultarStatusCard` a cada 10s;
   d. `ESTORNADO` ⇒ `confirmarEstornoTef(idPagamento)` — action **nova** do slice, a única que leva um TEF `APROVADO` a `EXCLUIDO` (riscado, AD-163; evento `FORMA_PAGAMENTO_REMOVIDA`; invalida o veredito da 014);
   e. `ESTORNO_REJEITADO` ⇒ aviso com o motivo; o TEF **continua aprovado**.
3. Desistir de **esperar** um estorno já pedido pede confirmação e avisa que o estorno **foi solicitado e pode se concluir** na SmartTEF; o pagamento continua `APROVADO` na venda (dinheiro ainda não devolvido). Tentar excluir de novo recomeça em 2a — e por isso 2a existe: torna o fluxo idempotente sem depender de como a SmartTEF responde a um segundo pedido de estorno.

Enquanto o estorno não é confirmado, nada muda na venda: o TEF aprovado continua bloqueando suspensão, "Limpar" (`descartarPagamento`) e mutação do carrinho, exatamente como hoje (`FR-004`, AD-042, AD-162).

**Rationale**: `EstornarPagamento` → `PSmartTEF` (sub `'EstornarPagamento'`) devolve um objeto com `payment_status`, e a KB mostra que o estorno passa por `SOL_EST` → `PROC_EST` → `EST`/`REJ_EST`; um `Sucesso: true` só diz que **o pedido** foi aceito. Riscar a forma nesse instante declararia devolvido um dinheiro que ainda pode ter o estorno rejeitado.

---

## D15 — Várias formas TEF na mesma venda; uma janela por vez

**Decision**: nenhum limite de quantidade de pagamentos TEF por venda (ponto 4). O que continua valendo é **uma janela de integração aberta por vez** — cobrança ou estorno —, porque ela é modal e travada.

**Achado**: o domínio da 008 **não** impede uma segunda inserção enquanto há um pagamento `PENDENTE_INTEGRACAO` (`podeAplicarForma` não olha pendentes, e `calcularSaldo` não os conta). Quem impede é a janela modal sobre a tela — mesmo arranjo que o PIX já usa (J1 da 009). A 010 mantém o arranjo e o torna explícito com teste (invariante T7 de `data-model.md`), em vez de acrescentar uma guarda nova ao domínio: uma guarda de domínio bloquearia também o atalho de venda rápida (013), que já espera o desfecho pelo estado (`aplicarFormaComIntegracao`).

**Rationale**: o `usePixPendente` usa `find`, não `filter`, pelo mesmo motivo; `useTefPendente` faz igual.

---

## D16 — O retrato da NFCe muda: `TEFPagId` entra, três campos saem

**Decision**: o SDT `CheckoutFaturarNFCe.FormasDePagamento[]` **da KB** tem hoje `TEFBandeira`, `TEFPagId` e `TEFTipoIntegracao` — e **não** tem mais `TEFidentificacao`, `TEFCNPJ` nem `TEFNumeroAutorizacao`, que `formaParaRetrato.ts` ainda envia e `dav.schema.ts` ainda exige. `PCheckout_FaturarNFCe`, ao ver `TEFPagId` preenchido, busca na `TransacaoTEF` (`TEFSmartSt = CNC`) a autorização, o CNPJ do adquirente e a bandeira — e recusa a nota se não achar.

Consequências:
- `DadosTEF` (`saldoPagamento.ts`) muda de forma: `{ pagId, bandeira, nsu, autorizacao, tipoIntegracao }` — os três últimos só para a tela (D13); `pagId` é o que importa ao ERP (`data-model.md` §1).
- `formaParaRetrato` passa a enviar `TEFPagId`, `TEFBandeira` (o `card_brand` observado) e `TEFTipoIntegracao: '1'` (integrado, domínio `NFCe_tpIntegra`); deixa de enviar os três campos que saíram.
- `dav.schema.ts`/`mapearVendaExistente.ts` (006/011) passam a ler `TEFPagId` (opcional) e deixam de exigir os três campos removidos, para que um rascunho com TEF **reenvie** o vínculo ao faturar. O que **não** muda nesta feature: a forma importada continua entrando com `integracao: 'NENHUMA'` (comportamento das 006/011) — torná-la estornável é outra decisão, registrada como item 65 de `PENDENCIES.md`.

**Rationale**: sem `TEFPagId` o ERP faturaria o cartão sem o vínculo `NfcFpSmTEF` à transação, e a NFCe sairia sem autorização do adquirente.

---

## D17 — Envelope da saída e grafia: três pontos a medir antes de codar

**Decision**: a primeira tarefa de implementação (`tasks.md`) é uma **medição** no prototype de `c0lj6mvzeh`, com o resultado registrado em AD antes de qualquer código de rede:
1. `CriarCardPagamento` aceita corpo plano ou exige `{ CriarCardReq: … }`? E a grafia `FPgCod` × `FpgCod`?
2. A saída dos três vem plana ou em `{ RespostaSmartTEF: … }`? (o código usa `semEnvelope` e aceita as duas, mas o `erp-mock` precisa imitar a real — item 42.)
3. Forma real de `RespostaJson` em cada operação (o SDT da KB é como o ERP a **lê**; a SmartTEF pode mandar campos a mais — por isso os schemas internos são `looseObject`).

**Rationale**: lição registrada em `envelope-erp-depende-de-messages` e `erp-prototype-contrato-20260914`: a KB descreve o desserializador, não o que trafega. **Cuidado operacional**: `CriarCardPagamento` cria cobrança real numa maquininha e `EstornarPagamento` estorna dinheiro real — a medição só acontece com o usuário, num terminal de homologação, nunca por sondagem automática.

---

## D18 — Fora do escopo, deliberadamente

- **Protocolo com o terminal físico** (AD-037, item 25): continua fora — e deixou de ser problema do Checkout: quem fala com a maquininha é o ERP, pela SmartTEF. O Checkout só fala HTTP com o ERP.
- **Comprovante**: nenhum (AD-064, `FR-005`) — o terminal imprime.
- **Tela do cliente (015)**: não espelha o TEF; a interação do cliente é com a maquininha.
- **Plataforma**: nenhuma ramificação por layout (AD-144).
- **Venda rápida (013)**: nenhuma mudança — `aplicarFormaComIntegracao` já espera o desfecho pelo estado.
- **`ConfiguracoesTEF.*`** além de `TEFAtivo` (`TEFempresaAutomacao`, `TEFcapAutomacao`…): eram do protocolo do parceiro antigo; não são consumidos.
- **`FormaTipoTransacaoTEF`**: continua transportado como opaco; a SmartTEF deduz o tipo pelo meio da forma (D6).
