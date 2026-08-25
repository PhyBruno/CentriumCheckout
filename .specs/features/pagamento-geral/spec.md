# Pagamento (Geral) — Specification

## Problem Statement

O operador precisa carregar as formas/condições de pagamento disponíveis para o tenant e aplicar um ticket devolução em uma condição elegível, sem depender de eventos push do ERP e sem revalidação redundante na finalização. Este spec cobre o que é comum a **todas** as formas de pagamento; comportamento específico de PIX está em `.specs/features/pagamento-pix/spec.md` e de TEF em `.specs/features/pagamento-tef/spec.md`.

## UI Design

Tela principal: frame `Fundo PDV Online Web`, área "Pagamento e totais". Estado de valor faltante: frame `PDV Online Web - Valor Faltante`. Fluxo mobile: frame `PDV Mobile 02 - Produtos e Pagamento`, seção "Configuração pagamento". Frames específicos de modal TEF/PIX estão documentados em suas respectivas specs.

## Goals

- [ ] Formas/condições de pagamento sempre disponíveis com dados atualizados (cache de 30 min).
- [ ] Ticket devolução nunca bloqueia finalização por revalidação redundante.
- [ ] Split de pagamento (múltiplas formas na mesma venda) sempre disponível, com troco calculado só para dinheiro.

**Nota mobile (2026-08-25, AD-046):** o fluxo de pagamento no mobile precisa de adaptação de layout (fase Design de `.specs/features/layout-responsivo-mobile/spec.md`) — decisão direta do usuário, sem detalhamento adicional nesta rodada.

---

## User Stories

### P1: Carregar formas e condições de pagamento ⭐ MVP

**User Story**: Como operador de caixa, quero ver as formas e condições de pagamento disponíveis para o tenant, para aplicar na venda.

**Why P1**: Sem isso a venda não pode ser finalizada.

**Acceptance Criteria**:

1. WHEN a tela de pagamento é aberta THEN o sistema SHALL buscar formas/condições via TanStack Query, cacheadas em memória com `staleTime` de 30 minutos.
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

**Independent Test**: Mockar formas com `FormaMeioPagtoNFe` igual a `CartaoCredito`, `CartaoDebito`, `Pix`, `PixEstatico` e `Dinheiro`; confirmar que somente cartão de crédito/débito chama TEF, somente `Pix` chama o fluxo PIX dinâmico e as demais formas não chamam integração externa.

---

### P2: Ticket devolução na condição de pagamento

**User Story**: Como operador de caixa, quero aplicar um ticket devolução em uma forma de pagamento elegível, sem validação redundante na finalização.

**Why P2**: Cenário frequente, mas não bloqueia o fluxo mínimo de venda com pagamento normal.

**Acceptance Criteria**:

1. WHEN o operador aplica um ticket devolução THEN o sistema SHALL chamar `POST /ApiCentriumOAuth/ValidaTicketDevolucao`, que retorna `ValorTicket: number` e `Mensagem: string`. **Resolvido (2026-08-21, AD-023):** o contrato atualizado já retorna o valor (`ValorTicket`) — não existe campo booleano de validade; a KB do GenExus confirma que a **elegibilidade é indicada comparando `Mensagem` ao literal fixo `'Ticket Válido'`** (`PCheckout_ValidaTicketDevolucao` → `PValidaTicketNfCe.Call`) — qualquer outro texto em `Mensagem` indica ticket inválido/inelegível. O frontend deve implementar essa comparação de string explicitamente, não assumir "HTTP 200 = válido".
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
3. WHEN o JSON de `FaturarNFCe` é montado com um desconto de capa aplicado THEN o sistema SHALL ratear o valor igualmente entre os itens da venda; WHEN o rateio não fecha em centavos exatos THEN o sistema SHALL adicionar o centavo remanescente a um dos itens (mesmo padrão de arredondamento generalizado em `.specs/features/carrinho-produto-precificacao/spec.md`, Edge Cases).

**Independent Test**: Aplicar desconto percentual e desconto em valor fixo na capa de uma venda com 3 itens cujo total não divide exatamente por 3; verificar que o JSON de `FaturarNFCe` rateia o desconto entre os itens com o centavo remanescente em um deles.

---

## Edge Cases

- WHEN uma forma de pagamento é selecionada THEN o Checkout SHALL rotear a operação pelo valor de `FormaMeioPagtoNFe`: `CartaoCredito` e `CartaoDebito` usam TEF; `Pix` usa PIX dinâmico; `PixEstatico` não usa automaticamente o fluxo PIX dinâmico; os demais valores não usam essas integrações.
- WHEN o Checkout precisa classificar uma forma de pagamento (dinheiro/cartão/TEF/duplicata) para regras de troco/crédito THEN o sistema SHALL usar `FormaMeioPagtoNFe` (domínio `NFCe_FormaPagto`) e `FormaFpgUtiCar` (indica vale devolução `VDV`, campo do contrato mapeado de `FpgUtiCar` no KB). **Resolvido (2026-08-21, AD-023):** classificação completa confirmada na KB do GenExus — domain `NFCe_FormaPagto` tem os valores `Dinheiro, Cheque, CartaoCredito, CartaoDebito, CreditoLoja, ValeAlimentacao, ValeRefeicao, ValePresente, ValeCombustivel, DuplicataMercantil, BoletoBancario, DepositoBancario, Pix, TransferenciaBancaria, ProgaramaFidelidade (sic, typo no KB), PixEstatico, CreditoEmLoja, PagamentoNaoInformado, SemPagamento, PagamentoPosterior, Outros` — superset da tabela SEFAZ padrão. **(2026-08-21, AD-024):** `FormaFpgUtiCar` confirmado presente no contrato (ver Story P2/PAY-07) — só vazio quando a empresa não tem regra dinâmica de pagamento configurada.
- WHEN qualquer um dos endpoints de pagamento é chamado (`GerarPIX`, `ValidaTicketDevolucao`, `FaturarNFCe`) THEN o sistema SHALL enviar `Empresa` (`codigoEmpresa` persistido, ver AD-019 em `.specs/project/STATE.md`), exigido pelo contrato. Aplica-se também a `GerarPIX`, específico de `.specs/features/pagamento-pix/spec.md`.
- WHEN uma condição/forma de pagamento é aplicada ou removida, um vale devolução é usado, ou uma forma de pagamento (TEF, PIX ou cartão manual) é recusada THEN o sistema SHALL registrar o evento correspondente (`CONDICAO_PAGAMENTO_APLICADA`, `FORMA_PAGAMENTO_APLICADA`/`REMOVIDA`, `VALE_DEVOLUCAO_USADO`, `PAGAMENTO_RECUSADO`) no log de auditoria da venda — aplica-se também aos fluxos específicos de `.specs/features/pagamento-pix/spec.md` e `.specs/features/pagamento-tef/spec.md`. **Novo (2026-08-25, AD-061):** ver `.specs/features/auditoria-acoes-operador/spec.md` (`AUDIT-05`, `AUDIT-06`).
- WHEN a forma de pagamento aplicada é `DuplicataMercantil` THEN o sistema SHALL NÃO gerar nem imprimir nenhum documento de duplicata — não há requisito de impressão associado a essa forma de pagamento neste produto. **Resolvido (2026-08-25, AD-064 em `.specs/project/STATE.md`):** decisão direta do usuário.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
|---|---|---|---|
| PAY-01 | Carregar formas/condições (cache 30min) | - | Verified |
| PAY-02 | Ocultar TEF quando `TEFAtivo=false` | - | Verified (AC completo em `.specs/features/pagamento-tef/spec.md`) |
| PAY-03 | Ocultar PIX quando `UtilizaCentriumPAG=false` | - | Verified (AC completo em `.specs/features/pagamento-pix/spec.md`) |
| PAY-08 | Roteamento por `FormaMeioPagtoNFe` para TEF/PIX | - | Verified (regra confirmada pelo usuário em 2026-08-24) |
| PAY-05 | Ticket devolução — valor via `ValidaTicketDevolucao` | - | Verified (2026-08-21, AD-023 — `ValorTicket` confirmado; elegibilidade via comparação de `Mensagem` a `'Ticket Válido'`) |
| PAY-06 | Ticket devolução — sem revalidação na finalização | - | Verified |
| PAY-07 | Ticket devolução — elegibilidade por forma de pagamento (`FormaFpgUtiCar`, vazio tratado como elegível) | - | Verified (2026-08-25, AD-048 — decisão direta do usuário: vazio permite aplicação otimista) |
| PAY-09 | Split de pagamento (múltiplas formas) e troco restrito a dinheiro | - | Verified (2026-08-25, AD-036) |
| PAY-10 | Desconto manual — item e capa, com rateio no JSON de `FaturarNFCe` | - | Verified (2026-08-25, AD-039) |

**Coverage:** 10 total, 0 edge cases pendentes. `PAY-04` (status PIX) fica em `.specs/features/pagamento-pix/spec.md`.

---

## Success Criteria

- [ ] Ticket devolução nunca bloqueia finalização por revalidação redundante.
