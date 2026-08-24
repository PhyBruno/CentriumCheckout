# Finalização e Suspensão da Venda — Specification

## Problem Statement

O operador precisa fechar a venda gerando a NFCe, ou suspendê-la (cancelamento em digitação) sem perder rastreabilidade no ERP — o rascunho de venda existe no servidor, então "cancelar" não é uma operação puramente local.

## UI Design

Fluxo mobile: frame `PDV Mobile 03 - Revisão e Finalização` (resumo de conferência, pagamentos em revisão, botão finalizar). ⚠️ Não identificado frame desktop dedicado à finalização/suspensão — parece estar dentro da própria área "Pagamento e totais" da tela principal (`Fundo PDV Online Web`), sem modal próprio — confirmar. `PDV Online Web - Valor Faltante` também é relevante aqui como bloqueio antes de finalizar.

## Goals

- [ ] Finalização sempre gera NFCe consistente com os itens/preços já calculados no Checkout.
- [ ] Suspensão sempre sincronizada com o ERP — nunca puramente local.

## Out of Scope

| Feature | Reason |
|---|---|
| Cancelamento de NFCe já autorizada pelo Checkout | Não existe esse endpoint e não está no escopo — só se cancela venda ainda em digitação (suspensão) |
| Reimpressão de NFCe | Fora de escopo — `GetPDFNota` não é usado para essa finalidade neste produto |

---

## User Stories

### P1: Finalizar a venda (faturar NFCe) ⭐ MVP

**User Story**: Como operador de caixa, quero finalizar a venda e receber a NFCe pronta para impressão.

**Why P1**: É o objetivo final de toda venda.

**Acceptance Criteria**:

1. WHEN o operador finaliza a venda THEN o sistema SHALL chamar `POST /ApiCentriumOAuth/FaturarNFCe` com `SuspenderOuFaturar = "FATURAR"`, `Empresa` (`codigoEmpresa` persistido, ver AD-019 em `.specs/project/STATE.md`) e `vendedorCodigo` (vendedor selecionado no modal de vendedor — ver `.specs/features/selecao-vendedor/spec.md`, `VEND-05` — nunca o `UsuarioCodigo`/`VendedorCodigo` da sessão do operador logado), além dos itens e do total já calculados pelo frontend.
2. WHEN a venda é enviada THEN o sistema SHALL incluir, por item, os campos do contrato (`sequencial`, `codigoProduto`, `quantidade`, `precoUnitario`, `DescontoPercentual`, `DescontoValor`, `ValorBruto`, `UDM`), mais o novo campo `produtoCancelado` (`boolean`, `NULL` equivale a `false`) — indica que o item foi inserido no carrinho mas cancelado antes da finalização. **Reforçado (2026-08-21, AD-024):** conferido campo a campo direto no código-fonte de `PCheckout_FaturarNFCe` na KB — a lista completa de campos de item é exatamente essa (mais `ValorTotal`), sem nenhum campo de tier/faixa. **Resolvido (2026-08-24, AD-026, decisão direta do usuário):** a rastreabilidade de itens cancelados na venda será feita adicionando `produtoCancelado` ao SDT `CheckoutFaturarNFCe` — a mesma decisão resolve a pendência #21 (`.specs/features/carrinho-produto-precificacao/spec.md`, Edge Cases, marcação de autoria de cancelamento). O contrato não ganha um campo dedicado para o tier de preço aplicado por item — a expansão de contrato decidida foi para marcar cancelamento, não tier; se rastreabilidade de tier for necessária no futuro, fica só no lado do Checkout (logs). **Campo ainda não implementado no lado do ERP** — é uma decisão de contrato a desenvolver pela equipe do ERP, mesmo status de "PENDÊNCIA DEV" do item 13 em `.specs/project/PENDENCIES.md` (marcação de DAV importado).
3. WHEN a venda foi carregada de um rascunho existente no ERP (via `CarregarNFCe`) THEN o sistema SHALL enviar `NumeroNota` preenchido; WHEN a venda foi criada do zero no Checkout THEN o sistema SHALL enviar `NumeroNota = 0`.
4. WHEN a finalização é confirmada THEN o sistema SHALL descartar por completo o cache de produtos (TanStack Query) daquela venda — a próxima venda sempre começa com cache vazio.

**Independent Test**: Finalizar uma venda criada do zero (NumeroNota=0) e uma carregada de rascunho (NumeroNota preenchido); confirmar payload correto em cada caso.

---

### P1: Suspender a venda em digitação (cancelamento) ⭐ MVP

**User Story**: Como operador de caixa, ao cancelar uma venda em digitação, quero que ela fique suspensa no ERP (não só descartada localmente), para manter o rascunho consistente.

**Why P1**: Corrige entendimento anterior — suspensão sempre chama a API, não é operação 100% local.

**Acceptance Criteria**:

1. WHEN o operador cancela a venda em digitação THEN o sistema SHALL chamar `POST /ApiCentriumOAuth/FaturarNFCe` com `SuspenderOuFaturar = "SUSPENDER"` — a mesma regra de `NumeroNota` (0 ou preenchido) da finalização se aplica.
2. WHEN a suspensão é confirmada THEN o sistema SHALL limpar por completo o carrinho (Zustand, sem `persist`) e o cache de produtos (TanStack Query) da venda, exatamente como na finalização.
3. WHEN uma nova venda começa após suspensão/finalização THEN o sistema SHALL nunca herdar itens ou dados de produto da venda anterior.

**Independent Test**: Suspender uma venda em digitação e verificar chamada com `SUSPENDER`, seguida de limpeza total do estado local.

---

## Edge Cases

- WHEN a NFCe é autorizada THEN o sistema SHALL receber o PDF e o XML da nota já embutidos na própria resposta de `FaturarNFCe`. **Resolvido (2026-08-21, AD-024):** confirmado no código-fonte de `PCheckout_FaturarNFCe` (sub-rotina `SuspenderOuFaturar`) — ao autorizar, a procedure lê o PDF já gerado em disco (`PNfePasta_WEB.Udp`), converte para base64 e devolve em `NotaFiscal.PDFImpressao` (junto de `NotaFiscal.XMLImpressao` com o XML). Não existe "impressão direta pelo servidor" nem uma opção separada de PDF configurável no ERP — o Checkout sempre recebe o arquivo pronto na resposta HTTP e decide no cliente como apresentá-lo (abrir diálogo de impressão do navegador, exibir/baixar o PDF, enviar para impressora local do PDV via mecanismo próprio do Checkout). A escolha de "imprimir automaticamente vs. deixar o operador decidir" passa a ser decisão de UX do Checkout, não mais uma dúvida sobre o que o ERP expõe.
- WHEN é necessário obter o `NumeroNota` antes de faturar uma venda criada do zero THEN o sistema SHALL sempre enviar `NumeroNota = 0`, sem controlar nenhum contador local. **Resolvido (2026-08-21, AD-023):** confirmado na KB do GenExus — `PCheckout_FaturarNFCe` trata `NumeroNota = 0` gerando uma nota nova via `PNFeSerializaRascunhoNota.Call(..., 'SERIALIZA', ...)` (`NewCapa`), sempre atribuído pelo ERP; o Checkout nunca precisa de um `GetProximoNumeroNFCe` ou equivalente. `NumeroNota <> 0` só ocorre quando a venda veio de um rascunho/DAV pré-existente (ver `FIN-03`), e nesse caso usa `AtualizarCapa`.
- WHEN o sistema precisa detectar contingência do ERP (que "obriga o relogin") THEN o sistema SHALL chamar `GET /ApiCentriumOAuth/GetStatusSistema` (params `Empresa`, `Cadmaqcod`, retorna `integer` puro, sem wrapper). **Parcialmente resolvido (2026-08-21, AD-023):** forma do contrato confirmada em `ApiCentriumOAuth.yaml` — ⚠️ ainda pendente: o significado dos códigos de retorno (quais valores indicam contingência/exigem relogin) e a necessidade de polling periódico não foram confirmados. **Reforçado (2026-08-21, AD-024):** lido o código-fonte de `PCheckout_GetStatusSistema` na KB — a procedure só repassa o valor bruto do atributo `CadStatus` (`NUMERIC(4)`, tabela de cadastro de máquina/caixa) sem nenhuma transformação, mapeamento ou lógica de negócio. O próprio atributo `CadStatus` não tem `Documentation`/`Help` preenchidos na KB — a semântica dos códigos é uma lacuna de documentação do ERP em si, não algo recuperável por inspeção de KB (independente de quão profundo se procure). Precisa mesmo de contato direto com a equipe do ERP, não de nova varredura de KB.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
|---|---|---|---|
| FIN-01 | Finalizar venda via `FaturarNFCe` (`FATURAR`) | - | Verified |
| FIN-02 | Trilha de auditoria por item na finalização | - | Verified |
| FIN-03 | `NumeroNota` correto (0 vs. preenchido) | - | Verified |
| FIN-04 | Descarte de cache de produto ao finalizar | - | Verified |
| FIN-05 | Suspender venda via `FaturarNFCe` (`SUSPENDER`) | - | Verified |
| FIN-06 | Limpeza total de carrinho/cache ao suspender | - | Verified |
| FIN-07 | `vendedorCodigo` do modal de seleção enviado em `FaturarNFCe` (não o do operador logado) | - | Verified (ver `.specs/features/selecao-vendedor/spec.md`, `VEND-05`) |

**Coverage:** 7 total, 1 edge case resolvido em 2026-08-21 (impressão pós-autorização, AD-024), 1 edge case resolvido em 2026-08-24 por decisão direta do usuário (trilha de auditoria via `produtoCancelado`, AD-026 — campo ainda não implementado no ERP) e 1 edge case que só a equipe do ERP resolve diretamente (semântica dos códigos de `GetStatusSistema`, confirmado como lacuna de documentação do próprio ERP).

---

## Success Criteria

- [ ] Nenhuma venda finalizada com dados de auditoria incompletos.
- [ ] Nenhuma suspensão deixa rascunho divergente entre Checkout e ERP.
