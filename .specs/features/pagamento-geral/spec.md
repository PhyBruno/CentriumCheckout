# Pagamento (Geral) — Specification

## Problem Statement

O operador precisa carregar as formas/condições de pagamento disponíveis para o tenant e aplicar um ticket devolução em uma condição elegível, sem depender de eventos push do ERP e sem revalidação redundante na finalização. Este spec cobre o que é comum a **todas** as formas de pagamento; comportamento específico de PIX está em `.specs/features/pagamento-pix/spec.md` e de TEF em `.specs/features/pagamento-tef/spec.md`.

## UI Design

Tela principal: frame `Fundo PDV Online Web`, área "Pagamento e totais". Estado de valor faltante: frame `PDV Online Web - Valor Faltante`. Fluxo mobile: frame `PDV Mobile 02 - Produtos e Pagamento`, seção "Configuração pagamento". Frames específicos de modal TEF/PIX estão documentados em suas respectivas specs.

## Goals

- [ ] Formas/condições de pagamento sempre disponíveis com dados atualizados (cache de 30 min).
- [ ] Ticket devolução nunca bloqueia finalização por revalidação redundante.
- [ ] Split de pagamento (múltiplas formas na mesma venda) sempre disponível, com troco calculado só para dinheiro.

**Nota mobile (2026-08-25, AD-046; complementado em 2026-08-26, AD-074; revisado em 2026-09-03, AD-144):** o fluxo de pagamento no mobile precisa de adaptação de layout (fase Design de `.specs/features/layout-responsivo-mobile/spec.md`). Busca/cadastro de cliente, itens e condição/forma de pagamento funcionam normalmente no mobile. **Desde AD-144, TEF e PIX estão igualmente disponíveis no mobile** — o layout não entra no roteamento de integração, que depende só de `ConfiguracoesTEF.TEFAtivo`/`PIXAtivo`. A exclusão de TEF no mobile que AD-074 havia fixado foi revogada; ver `PAY-08` abaixo e `.specs/features/pagamento-tef/spec.md`.

---

## User Stories

### P1: Carregar formas e condições de pagamento ⭐ MVP

**User Story**: Como operador de caixa, quero ver as formas e condições de pagamento disponíveis para o tenant, para aplicar na venda.

**Why P1**: Sem isso a venda não pode ser finalizada.

**Acceptance Criteria**:

1. WHEN a tela de pagamento é aberta THEN o sistema SHALL ler as condições e formas de pagamento de `SessaoUsuario.CondicoesDePagamento[]`, obtidas via `GET /api/bootstrap` com TanStack Query e `staleTime` de 30 minutos. **Resolvido (2026-08-26, AD-097):** **não existe endpoint dedicado de formas/condições de pagamento** — o catálogo vem embutido no payload de `GetSessao` (`ApiCentriumOAuth.yaml`, linhas 865-938); os únicos endpoints de pagamento no contrato são `ValidaTicketDevolucao`, `GerarPIX`, `StatusPIX` e `FaturarNFCe`. A redação anterior deste AC dizia apenas "buscar formas/condições via TanStack Query", sem nomear a origem, o que poderia levar a implementação a inventar um endpoint inexistente.
2. WHEN `ConfiguracoesTEF.TEFAtivo` é `false` THEN o sistema SHALL ocultar/desabilitar o recurso de TEF. Detalhado em `.specs/features/pagamento-tef/spec.md` (`PAY-02`).
3. WHEN `ConfiguracoesPIX.UtilizaCentriumPAG` é `false` THEN o sistema SHALL ocultar/desabilitar o recurso de PIX. Detalhado em `.specs/features/pagamento-pix/spec.md` (`PAY-03`).

**Independent Test**: Mockar `GetSessao` com as duas flags desligadas e confirmar que TEF/PIX não aparecem na tela de pagamento.

---

### P1: Roteamento da integração por meio de pagamento ⭐ MVP

**User Story**: Como Checkout, quero identificar a integração correta a partir da forma de pagamento selecionada, para chamar PIX ou TEF somente quando aplicável.

**Why P1**: O campo `FormaMeioPagtoNFe` já é retornado pelo ERP junto de cada forma permitida e é a fonte de verdade para o roteamento operacional atual.

**Acceptance Criteria**:

1. WHEN `FormaMeioPagtoNFe` for `CartaoCredito` ou `CartaoDebito` AND `ConfiguracoesTEF.TEFAtivo` for `true` THEN o sistema SHALL chamar a integração TEF local e somente adicionar o pagamento após a aprovação do TEF.
2. WHEN `FormaMeioPagtoNFe` for `Pix` AND `ConfiguracoesPIX.UtilizaCentriumPAG` for `true` THEN o sistema SHALL chamar `POST /ApiCentriumOAuth/GerarPIX`, consultar `GET /ApiCentriumOAuth/StatusPIX` a cada 10 segundos e somente adicionar o pagamento após a aprovação do PIX.
3. WHEN `FormaMeioPagtoNFe` for `PixEstatico` THEN o sistema SHALL NOT tratá-la como PIX dinâmico nem encaminhá-la automaticamente para `GerarPIX`.
4. WHEN `FormaMeioPagtoNFe` tiver qualquer outro valor THEN o sistema SHALL seguir o fluxo normal da forma, sem chamar a integração TEF ou o fluxo PIX dinâmico.
5. WHEN a flag global da integração correspondente estiver `false` THEN o sistema SHALL ocultar ou desabilitar as formas que dependem daquela integração, conforme `PAY-02` e `PAY-03`.
6. WHEN o layout é mobile THEN o sistema SHALL rotear exatamente como no desktop — o layout **não** é insumo do roteamento de integração. **Corrigido (2026-09-03, AD-144):** decisão direta do usuário, revogando a exclusão de TEF no mobile que AD-074 havia fixado; cartão com `TEFAtivo = true` chama TEF em qualquer layout, e PIX segue disponível como sempre esteve. Ver `.specs/features/pagamento-tef/spec.md`.

**Independent Test**: Mockar formas com `FormaMeioPagtoNFe` igual a `CartaoCredito`, `CartaoDebito`, `Pix`, `PixEstatico` e `Dinheiro`; confirmar que somente cartão de crédito/débito chama TEF, somente `Pix` chama o fluxo PIX dinâmico e as demais formas não chamam integração externa. Repetir com layout mobile e confirmar que o resultado é **idêntico** ao do desktop para todas as formas — inclusive cartão com `TEFAtivo=true`, que chama TEF (AD-144).

---

### P2: Ticket devolução na condição de pagamento

**User Story**: Como operador de caixa, quero aplicar um ticket devolução em uma forma de pagamento elegível, sem validação redundante na finalização.

**Why P2**: Cenário frequente, mas não bloqueia o fluxo mínimo de venda com pagamento normal.

**Acceptance Criteria**:

1. WHEN o operador aplica um ticket devolução THEN o sistema SHALL chamar `POST /ApiCentriumOAuth/ValidaTicketDevolucao`, que retorna `ValorTicket: number`, `Valido: boolean` e `Mensagem: string`. **Regra vigente (2026-08-27, AD-101):** a validade é decidida **só** por `Valido` — o campo é sempre preenchido pelo procedure (`PCheckout_ValidaTicketDevolucao` atribui `&Valido = true`/`false` explicitamente nos dois ramos, confirmado por inspeção direta da KB), então o frontend não precisa (e não deve) cair para comparar `Mensagem`. O frontend **nunca** assume "HTTP 200 = válido". **Histórico:** a redação original deste AC (2026-08-21, AD-023) afirmava que "não existe campo booleano de validade" e mandava usar apenas a comparação de `Mensagem` — corrigida em 2026-08-26 (AD-099), que introduziu um fallback obrigatório por falta de confirmação de preenchimento; esse fallback foi removido em 2026-08-27 (AD-101), que resolve o item 32 de `.specs/project/PENDENCIES.md`.
2. WHEN a venda é finalizada THEN o sistema SHALL **não** revalidar o ticket devolução novamente — ele é sempre consumido em `FaturarNFCe`.
3. WHEN uma forma de pagamento específica não aceita ticket devolução THEN o sistema SHALL usar o campo `FormaFpgUtiCar` de `CondicaoFormasDePagamento[]`. **Resolvido (2026-08-21, AD-024):** confirmado — `FormaFpgUtiCar` existe tanto na SDT `SessaoUsuario` da KB quanto em `ApiCentriumOAuth.yaml` (linhas 893-916). Ressalva: `PCheckout_GetSessao` só preenche esse campo quando a empresa tem uma regra dinâmica de forma de pagamento configurada para a condição; no branch de fallback (sem regra definida, "puxa todos"), o campo vem vazio. **Resolvido (2026-08-25, AD-048):** decisão direta do usuário (contrária à recomendação apresentada) — `FormaFpgUtiCar` vazio SHALL ser tratado como elegível, permitindo aplicar o ticket devolução otimisticamente, e não como "não elegível".

**Independent Test**: Aplicar ticket em forma elegível e em forma não elegível; confirmar bloqueio apenas na segunda.

---

### P1: Split de pagamento e cálculo de troco ⭐ MVP

**User Story**: Como operador de caixa, quero aplicar múltiplas formas de pagamento na mesma venda e ver o troco calculado automaticamente quando o cliente paga em dinheiro acima do total, para fechar a venda com o valor exato recebido.

**Why P1**: Split de pagamento é operação comum no PDV físico; sem cálculo de troco correto, a venda não pode ser finalizada com segurança.

**Acceptance Criteria**:

1. WHEN o operador aplica mais de uma forma de pagamento na mesma venda THEN o sistema SHALL permitir o split (múltiplas formas), somando os valores aplicados até cobrir o total da venda. **Resolvido (2026-08-25, AD-036):** confirmado por decisão direta do usuário.
2. WHEN a forma de pagamento é dinheiro e o valor recebido excede o total (ou o saldo residual, em split) THEN o sistema SHALL calcular e exibir o troco. WHEN a forma de pagamento é cartão ou PIX THEN o sistema SHALL NÃO calcular troco — são sempre cobradas no valor exato/autorizado.
3. WHEN o operador tenta inserir uma segunda forma de pagamento "dinheiro" na mesma venda THEN o sistema SHALL bloquear a inserção e exibir um toast de notificação avisando que já existe uma forma "dinheiro" aplicada — só é possível uma entrada de dinheiro por venda.

**Independent Test**: Aplicar duas formas de pagamento diferentes cobrindo o total da venda; aplicar dinheiro acima do total e verificar o troco calculado; tentar inserir uma segunda forma "dinheiro" e verificar o toast de bloqueio.

---

### P1: Desconto manual — item e capa ⭐ MVP

**User Story**: Como operador de caixa, quero aplicar desconto direto em um item ou na capa da nota (afetando o total da venda), sem precisar de autorização, para agilizar negociações simples de preço.

**Why P1**: Desconto manual é operação frequente no balcão, sem depender de aprovação de supervisor.

**Acceptance Criteria**:

1. WHEN o operador aplica desconto direto em um item do carrinho THEN o sistema SHALL aceitar o valor sem teto e sem exigir senha/autorização. **Resolvido (2026-08-25, AD-039):** decisão direta do usuário.
2. WHEN o operador aplica desconto na capa da nota (seção de pagamentos) THEN o sistema SHALL aceitar o desconto em porcentagem ou em valor fixo, à escolha do operador, sem teto e sem senha.
3. WHEN o JSON de `FaturarNFCe` é montado com um desconto de capa aplicado THEN o sistema SHALL ratear o valor **igualmente** entre os itens ativos da venda, **com clamp e redistribuição**; WHEN o rateio não fecha em centavos exatos THEN o sistema SHALL distribuir o resto pelo **método do maior resto** (mesmo padrão de arredondamento generalizado em `.specs/features/carrinho-produto-precificacao/spec.md`, Edge Cases). **Formalizado (2026-08-26, AD-072):** cada item arredondado para baixo; a diferença total distribuída 1 centavo por vez aos itens com maior parte fracionária descartada, do maior resto para o menor, até zerar. **Completado (2026-08-26, AD-098):** a divisão igual sozinha pode atribuir a um item barato uma parcela maior que o próprio total da linha, produzindo `ValorTotal` negativo (rejeitado pela SEFAZ) — por isso toda linha cuja parcela exceda seu total líquido tem a parcela **fixada nesse teto** e sai do conjunto elegível, e o excedente é redividido igualmente entre as linhas restantes, repetindo até não haver estouro. Guarda de entrada obrigatória: `descontoCapa <= subtotal da venda` (é o que garante a terminação). Invariantes: `Σ parcelas === descontoCapa` e nenhuma parcela acima do total da linha. Exemplo: itens de `70,00 / 29,00 / 1,00` com desconto de `10,00` → `4,50 / 4,50 / 1,00` (a divisão igual ingênua daria `3,34 / 3,33 / 3,33`, invalidando a terceira linha). Algoritmo completo em `specs/008-pagamento-geral/data-model.md`, §5.

**Independent Test**: Aplicar desconto percentual e desconto em valor fixo na capa de uma venda com 3 itens cujo total não divide exatamente por 3; verificar que o JSON de `FaturarNFCe` rateia o desconto entre os itens, com os centavos remanescentes atribuídos pelo método do maior resto.

---

## Edge Cases

- **Novo (2026-08-31, AD-109 a AD-113):** WHEN o operador confirma a inserção de uma forma/condição de pagamento — **em toda e cada inserção da venda**, inclusive a segunda e as seguintes de um pagamento dividido, e inclusive quando a inserção vem do atalho F6–F9 de `.specs/features/venda-rapida-cenario-pagamento` (feature 013) — THEN o Checkout SHALL chamar `ValidarNFCe` **antes** de efetivar a inserção, enviando o retrato da venda com a forma candidata já incluída. WHEN a resposta traz `Valido = false` THEN o sistema SHALL NÃO inserir a forma, SHALL preservar a venda intacta e SHALL exibir as mensagens como notificação de erro; WHEN traz `Valido = true` com mensagens THEN o sistema SHALL inserir normalmente e exibir as mensagens como aviso, sem bloquear. O campo `messages[].Type` **não** decide bloqueio — só `Valido` decide (AD-110). WHEN a chamada não puder ser concluída THEN o sistema SHALL tratar como recusa (*fail-closed*, AD-112). A regra completa está na feature 014 (`specs/014-validacao-previa-nfce/spec.md`); esta feature fornece o gesto de inserção, as validações locais que o precedem, e a remoção de pagamento que invalida o veredito.
- **Novo (2026-08-31, AD-111):** WHEN o Checkout carrega o catálogo de `SessaoUsuario.CondicoesDePagamento[]` THEN o sistema SHALL carregar também `CondicaoFormasDePagamento[].FormaEntrada` (`FpgEnt`) e enviá-lo em cada forma do retrato da venda — o ERP só identifica crediário pela combinação `FormaFpgUtiCar = 'CRD'` **e** `FormaEntrada = 'N'`, e sem esse campo o limite de crédito nunca é avaliado.
- **Novo (2026-08-31, AD-113):** WHEN existe qualquer forma de pagamento aplicada à venda THEN o sistema SHALL bloquear a alteração do carrinho, do cliente, do vendedor e do desconto sobre o total — amplia o bloqueio de `CART-09`/AD-030, que cobria só o carrinho. Para alterar qualquer um deles o operador SHALL antes remover a forma aplicada, gesto que também invalida o veredito de validação vigente.
- WHEN uma forma de pagamento é selecionada THEN o Checkout SHALL rotear a operação pelo valor de `FormaMeioPagtoNFe`: `CartaoCredito` e `CartaoDebito` usam TEF **quando `ConfiguracoesTEF.TEFAtivo = true`** (ver `PAY-08` acima); `Pix` usa PIX dinâmico; `PixEstatico` não usa automaticamente o fluxo PIX dinâmico; os demais valores não usam essas integrações. **Pendência registrada em 2026-08-26 (AD-073 em `.specs/project/STATE.md`, item 30 de `.specs/project/PENDENCIES.md`):** essa regra não distingue, dentro de cartão, uma eventual forma cadastrada como "cartão avulso" (maquininha standalone fora do TEF) — a varredura inicial na KB do ERP não tinha encontrado campo/endpoint por-forma-de-pagamento para essa distinção. **Resolvido (2026-08-26, AD-078):** nova inspeção direta da KB confirmou que o campo existe — `SDTCheckout_GetSessao.CondicoesDePagamento[].CondicaoFormasDePagamento[].FormaIntegracaoCartao` (origem `FpgNfTefPos`, domínio `NFCe_tpIntegra`), com `1` = TEF (`PagtoIntegrado`) e `2` = POS/avulso. O campo já é retornado por `GetSessao` hoje, sem necessidade de mudança no ERP — disponível para o Checkout refinar `PAY-08` por forma de pagamento individual, se essa distinção vier a ser necessária.
- WHEN o Checkout precisa classificar uma forma de pagamento (dinheiro/cartão/TEF/duplicata) para regras de troco/crédito THEN o sistema SHALL usar `FormaMeioPagtoNFe` (domínio `NFCe_FormaPagto`) e `FormaFpgUtiCar` (indica vale devolução `VDV`, campo do contrato mapeado de `FpgUtiCar` no KB). **Resolvido (2026-08-21, AD-023):** classificação completa confirmada na KB do GenExus — domain `NFCe_FormaPagto` tem os valores `Dinheiro, Cheque, CartaoCredito, CartaoDebito, CreditoLoja, ValeAlimentacao, ValeRefeicao, ValePresente, ValeCombustivel, DuplicataMercantil, BoletoBancario, DepositoBancario, Pix, TransferenciaBancaria, ProgaramaFidelidade (sic, typo no KB), PixEstatico, CreditoEmLoja, PagamentoNaoInformado, SemPagamento, PagamentoPosterior, Outros` — superset da tabela SEFAZ padrão. **(2026-08-21, AD-024):** `FormaFpgUtiCar` confirmado presente no contrato (ver Story P2/PAY-07) — só vazio quando a empresa não tem regra dinâmica de pagamento configurada.
- WHEN qualquer um dos endpoints de pagamento é chamado (`GerarPIX`, `ValidaTicketDevolucao`, `FaturarNFCe`) THEN o sistema SHALL enviar `Empresa` (`codigoEmpresa` persistido, ver AD-019 em `.specs/project/STATE.md`), exigido pelo contrato. Aplica-se também a `GerarPIX`, específico de `.specs/features/pagamento-pix/spec.md`.
- WHEN uma condição/forma de pagamento é aplicada ou removida, um vale devolução é usado, ou uma forma de pagamento (TEF, PIX ou cartão manual) é recusada THEN o sistema SHALL registrar o evento correspondente (`CONDICAO_PAGAMENTO_APLICADA`, `FORMA_PAGAMENTO_APLICADA`/`REMOVIDA`, `VALE_DEVOLUCAO_USADO`, `PAGAMENTO_RECUSADO`) no log de auditoria da venda — aplica-se também aos fluxos específicos de `.specs/features/pagamento-pix/spec.md` e `.specs/features/pagamento-tef/spec.md`. **Novo (2026-08-25, AD-061):** ver `.specs/features/auditoria-acoes-operador/spec.md` (`AUDIT-05`, `AUDIT-06`).
- WHEN a forma de pagamento aplicada é `DuplicataMercantil` THEN o sistema SHALL NÃO gerar nem imprimir nenhum documento de duplicata — não há requisito de impressão associado a essa forma de pagamento neste produto. **Resolvido (2026-08-25, AD-064 em `.specs/project/STATE.md`):** decisão direta do usuário.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
|---|---|---|---|
| PAY-01 | Carregar formas/condições de `SessaoUsuario.CondicoesDePagamento[]` via `/api/bootstrap` (cache 30min) | Design | Verified (2026-08-26, AD-097 — não existe endpoint dedicado; origem confirmada no contrato) |
| PAY-02 | Ocultar TEF quando `TEFAtivo=false` | - | Verified (AC completo em `.specs/features/pagamento-tef/spec.md`) |
| PAY-03 | Ocultar PIX quando `UtilizaCentriumPAG=false` | - | Verified (AC completo em `.specs/features/pagamento-pix/spec.md`) |
| PAY-08 | Roteamento por `FormaMeioPagtoNFe` para TEF/PIX | - | Verified (regra confirmada pelo usuário em 2026-08-24; mantida em 2026-08-26, AD-073; a exclusão de TEF no mobile de AD-074 foi **revogada em 2026-09-03, AD-144** — o roteamento não depende de plataforma, e TEF e PIX valem em qualquer layout; campo `FormaIntegracaoCartao` confirmado na KB em 2026-08-26, AD-078, resolvendo item 30) |
| PAY-05 | Ticket devolução — valor via `ValidaTicketDevolucao`; validade só por `Valido` | Design | Verified (2026-08-27, AD-101 — confirma por KB que `Valido` é sempre preenchido, resolve o item 32 de `PENDENCIES.md` e remove o fallback de `Mensagem` introduzido por AD-099) |
| PAY-06 | Ticket devolução — sem revalidação na finalização | - | Verified |
| PAY-07 | Ticket devolução — elegibilidade por forma de pagamento (`FormaFpgUtiCar`, vazio tratado como elegível) | - | Verified (2026-08-25, AD-048 — decisão direta do usuário: vazio permite aplicação otimista) |
| PAY-09 | Split de pagamento (múltiplas formas) e troco restrito a dinheiro | - | Verified (2026-08-25, AD-036) |
| PAY-10 | Desconto manual — item e capa, com rateio no JSON de `FaturarNFCe` | Design | Verified (2026-08-25, AD-039; distribuição do resto pelo maior resto em 2026-08-26, AD-072; divisão igual **com clamp e redistribuição** formalizada em 2026-08-26, AD-098) |

**Coverage:** 10 total, 0 edge cases bloqueantes, **0 pendências abertas** (item 32 — campo `Valido` de `ValidaTicketDevolucao` — resolvido em 2026-08-27 por AD-101; o item 30 foi resolvido em 2026-08-26 por AD-078). `PAY-04` (status PIX) fica em `.specs/features/pagamento-pix/spec.md`.

**Atualização (2026-08-31, AD-104):** a **feature 013 — Venda Rápida por Cenário de Pagamento (`specs/013-venda-rapida-cenario-pagamento/`)** consome esta feature como camada de comando: as teclas F6–F9 lançam um pagamento pelo saldo em aberto integral usando as mesmas operações de domínio daqui (seleção de condição, aplicação de forma, `saldoEmAberto` em `Centavos`, `resolverIntegracao`), sem reimplementar nenhuma delas. Duas consequências para esta spec: (a) as portas listadas em `specs/013-venda-rapida-cenario-pagamento/contracts/venda-rapida-domain-api.md` passam a ser **superfície pública** do domínio de pagamento, não detalhe interno; (b) por decisão do usuário (2026-08-31), cenários cuja forma exige TEF ou PIX dinâmico **continuam elegíveis** ao atalho — `PAY-08` vale integralmente para o acionamento por tecla, e o pagamento só é dado por lançado após a aprovação da integração. O catálogo de cenários vem do mesmo payload de `GetSessao` que já traz `CondicoesDePagamento[]`, no campo `CenarioPagamento` — mesma constatação de AD-097 (não existe endpoint dedicado), agora aplicada a cenários.

**Fase Design concluída (2026-08-26):** `/speckit-plan` gerou `specs/008-pagamento-geral/` (`plan.md`, `research.md` com as decisões D1-D14, `data-model.md`, `contracts/erp-pagamento-api.md`, `contracts/pagamento-domain-api.md`, `quickstart.md`). Três achados de contrato viraram AD-097, AD-098 e AD-099 (AD-099 posteriormente resolvida em 2026-08-27 pela AD-101). Próximo passo: `/speckit-tasks`.

---

## Success Criteria

- [ ] Ticket devolução nunca bloqueia finalização por revalidação redundante.
