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
| Impressão de comprovante TEF | Fora de escopo — decisão direta do usuário (AD-064 em `.specs/project/STATE.md`): o próprio terminal físico do TEF emite seu comprovante |
| Impressão de documento de duplicata | Fora de escopo — decisão direta do usuário (AD-064) — não há documento a imprimir para pagamento em duplicata |

---

## User Stories

### P1: Finalizar a venda (faturar NFCe) ⭐ MVP

**User Story**: Como operador de caixa, quero finalizar a venda e receber a NFCe pronta para impressão.

**Why P1**: É o objetivo final de toda venda.

**Acceptance Criteria**:

1. WHEN o operador finaliza a venda THEN o sistema SHALL chamar `POST /ApiCentriumOAuth/FaturarNFCe` com `SuspenderOuFaturar = "FATURAR"`, `Empresa` (`codigoEmpresa` persistido, ver AD-019 em `.specs/project/STATE.md`), `vendedorCodigo` (vendedor selecionado no modal de vendedor — ver `.specs/features/selecao-vendedor/spec.md`, `VEND-05` — nunca o `UsuarioCodigo`/`VendedorCodigo` da sessão do operador logado) e `CadSerieNFCe` = `SessaoUsuario.CadSerieNFCe` (retornado por `GetSessao`, persistido no bootstrap), além dos itens e do total já calculados pelo frontend. **Resolvido (2026-08-25, AD-034, clarificação de processo do usuário):** a série da NFCe vem sempre da configuração do usuário/máquina exposta em `GetSessao`, nunca escolhida pelo operador ou inferida pelo Checkout.
2. WHEN a venda é enviada THEN o sistema SHALL incluir, por item, os campos do contrato (`sequencial`, `codigoProduto`, `quantidade`, `precoUnitario`, `DescontoPercentual`, `DescontoValor`, `ValorBruto`, `UDM`, `ValorTotal`). **Reforçado (2026-08-21, AD-024):** conferido campo a campo direto no código-fonte de `PCheckout_FaturarNFCe` na KB — essa é a lista completa de campos de item, sem nenhum campo de tier/faixa. **Corrigido (2026-08-25, AD-062):** a rastreabilidade de itens cancelados **não** é mais feita por um campo dedicado `produtoCancelado` no item (decisão anterior, AD-026, revertida) — passa a ser o evento `PRODUTO_CANCELADO` no log de auditoria geral da venda, entregue no campo `Log` de `CheckoutFaturarNFCe` (ver `FIN-12` abaixo e `.specs/features/auditoria-acoes-operador/spec.md`).
3. WHEN a venda foi carregada de um rascunho existente no ERP (via `CarregarNFCe`) THEN o sistema SHALL enviar `NumeroNota` preenchido; WHEN a venda foi criada do zero no Checkout THEN o sistema SHALL enviar `NumeroNota = 0`.
4. WHEN a finalização é confirmada THEN o sistema SHALL descartar por completo o cache de produtos (TanStack Query) daquela venda — a próxima venda sempre começa com cache vazio.

**Independent Test**: Finalizar uma venda criada do zero (NumeroNota=0) e uma carregada de rascunho (NumeroNota preenchido); confirmar payload correto em cada caso.

**Edge case desta story — falha de rede (2026-08-25, AD-038):** WHEN o envio de `FaturarNFCe` falha por problema de rede (sem resposta recebida, não um erro de negócio do ERP) THEN o sistema SHALL NÃO reenviar automaticamente — o operador SHALL confirmar manualmente que uma solicitação já foi feita e não teve retorno, antes de permitir novo envio. Decisão direta do usuário — mitiga risco de NFCe duplicada.

---

### P1: Suspender a venda em digitação (cancelamento) ⭐ MVP

**User Story**: Como operador de caixa, ao cancelar uma venda em digitação, quero que ela fique suspensa no ERP (não só descartada localmente), para manter o rascunho consistente.

**Why P1**: Corrige entendimento anterior — suspensão sempre chama a API, não é operação 100% local.

**Acceptance Criteria**:

1. WHEN o operador cancela a venda em digitação THEN o sistema SHALL chamar `POST /ApiCentriumOAuth/FaturarNFCe` com `SuspenderOuFaturar = "SUSPENDER"` — a mesma regra de `NumeroNota` (0 ou preenchido) e `CadSerieNFCe` (`SessaoUsuario.CadSerieNFCe`, ver AD-034) da finalização se aplica.
2. WHEN a suspensão é confirmada THEN o sistema SHALL limpar por completo o carrinho (Zustand, sem `persist`) e o cache de produtos (TanStack Query) da venda, exatamente como na finalização.
3. WHEN uma nova venda começa após suspensão/finalização THEN o sistema SHALL nunca herdar itens ou dados de produto da venda anterior.

**Independent Test**: Suspender uma venda em digitação e verificar chamada com `SUSPENDER`, seguida de limpeza total do estado local.

**Edge case desta story — bloqueio por pagamento aprovado (2026-08-25, AD-042):** WHEN a venda tem uma forma de pagamento TEF ou PIX já aprovada THEN o sistema SHALL NÃO permitir suspender a venda — mesma lógica de bloqueio permanente de `CART-09` (AD-030), já que TEF/PIX não podem ser removidos. WHEN a venda tem só pagamento(s) removível(is) já aplicado(s) (dinheiro ou cartão manual fora do fluxo TEF) THEN o sistema SHALL permitir suspender normalmente — esse estado persiste ao retomar o rascunho depois (`CarregarNFCe` mantém o pagamento removível associado).

---

## Edge Cases

- WHEN a NFCe é autorizada THEN o sistema SHALL receber o PDF e o XML da nota já embutidos na própria resposta de `FaturarNFCe`. **Resolvido (2026-08-21, AD-024):** confirmado no código-fonte de `PCheckout_FaturarNFCe` (sub-rotina `SuspenderOuFaturar`) — ao autorizar, a procedure lê o PDF já gerado em disco (`PNfePasta_WEB.Udp`), converte para base64 e devolve em `NotaFiscal.PDFImpressao` (junto de `NotaFiscal.XMLImpressao` com o XML). Não existe "impressão direta pelo servidor" nem uma opção separada de PDF configurável no ERP — o Checkout sempre recebe o arquivo pronto na resposta HTTP e decide no cliente como apresentá-lo (abrir diálogo de impressão do navegador, exibir/baixar o PDF, enviar para impressora local do PDV via mecanismo próprio do Checkout). A escolha de "imprimir automaticamente vs. deixar o operador decidir" passa a ser decisão de UX do Checkout, não mais uma dúvida sobre o que o ERP expõe.
- WHEN a NFCe é autorizada THEN o sistema SHALL consultar `SessaoUsuario.TipoImpressao` (retornado por `GetSessao`) para decidir o mecanismo de impressão: `'E'` = impressão direta (via serviço de impressão local); `'P'` = PDF. **Resolvido (2026-08-26, AD-082):** decisão direta do usuário — fecha a metade de AD-037 que pedia "um indicativo faltante no `GetSessao` de qual mecanismo de impressão o tenant/máquina deve usar".
- WHEN `TipoImpressao = 'E'` THEN o sistema SHALL tentar enviar o `XMLImpressao` (já recebido na resposta de `FaturarNFCe`) a um serviço de impressão local — serviço sem autenticação, rodando em porta fixa na máquina do PDV (número ainda não informado). WHEN esse serviço local não responde THEN o sistema SHALL informar ao operador que não foi possível imprimir diretamente e perguntar se deseja imprimir o PDF (fallback), em vez de falhar silenciosamente. **Resolvido (2026-08-25, AD-037):** decisão direta do usuário, comportamento de fallback mantido sem alteração por AD-082. ⚠️ **Pendente:** contrato técnico completo do serviço local (porta, rota/método, formato de resposta) — ver item 22 de `.specs/project/PENDENCIES.md`.
- WHEN é necessário obter o `NumeroNota` antes de faturar uma venda criada do zero THEN o sistema SHALL sempre enviar `NumeroNota = 0`, sem controlar nenhum contador local. **Resolvido (2026-08-21, AD-023):** confirmado na KB do GenExus — `PCheckout_FaturarNFCe` trata `NumeroNota = 0` gerando uma nota nova via `PNFeSerializaRascunhoNota.Call(..., 'SERIALIZA', ...)` (`NewCapa`), sempre atribuído pelo ERP; o Checkout nunca precisa de um `GetProximoNumeroNFCe` ou equivalente. `NumeroNota <> 0` só ocorre quando a venda veio de um rascunho/DAV pré-existente (ver `FIN-03`), e nesse caso usa `AtualizarCapa`.
- WHEN o sistema precisa detectar contingência do ERP (que "obriga o relogin") THEN o sistema SHALL chamar `GET /ApiCentriumOAuth/GetStatusSistema` (params `Empresa`, `Cadmaqcod`, retorna `integer` puro, sem wrapper). **Parcialmente resolvido (2026-08-21, AD-023):** forma do contrato confirmada em `ApiCentriumOAuth.yaml` — ⚠️ ainda pendente: o significado dos códigos de retorno (quais valores indicam contingência/exigem relogin) e a necessidade de polling periódico não foram confirmados. **Reforçado (2026-08-21, AD-024):** lido o código-fonte de `PCheckout_GetStatusSistema` na KB — a procedure só repassa o valor bruto do atributo `CadStatus` (`NUMERIC(4)`, tabela de cadastro de máquina/caixa) sem nenhuma transformação, mapeamento ou lógica de negócio. O próprio atributo `CadStatus` não tem `Documentation`/`Help` preenchidos na KB — a semântica dos códigos é uma lacuna de documentação do ERP em si, não algo recuperável por inspeção de KB (independente de quão profundo se procure). Precisa mesmo de contato direto com a equipe do ERP, não de nova varredura de KB. **Nova pendência (2026-08-25, AD-051):** o timing de quando `GetStatusSistema` é chamado no fluxo (bootstrap único, polling periódico, antes de cada finalização) segue sem resposta — distinto da pendência acima (semântica dos códigos); usuário não respondeu a este ponto nesta rodada — ver item 23 de `.specs/project/PENDENCIES.md`. **Semântica e timing resolvidos (2026-08-26, AD-075, corrigido no mesmo dia por AD-080):** decisão direta do usuário — o endpoint (contrato **pendente de atualização pelo ERP**) passa a expor um retorno **`numeric`** com semântica de limiar: `0` indica que nada do que foi enviado em `GetSessao` mudou desde a última captura das informações pelo Checkout (nada a fazer); qualquer valor **`>= 1`** indica mudança, e nesse caso o sistema SHALL rechamar `GetSessao` por completo para atualizar o `SessaoUsuario` local (a redação original de AD-075 dizia `boolean`, corrigido por AD-080). WHEN o sistema está entre vendas (nenhum item no carrinho E nenhum cliente identificado) THEN o sistema SHALL consultar `GetStatusSistema` a cada 60 segundos. WHEN existe uma "venda ativa" (carrinho com pelo menos 1 item OU cliente já identificado) THEN o sistema SHALL NÃO consultar `GetStatusSistema` nesse intervalo. **Verificado na KB (2026-08-26):** `PCheckout_GetStatusSistema` ainda retorna `CadStatus` bruto hoje, sem a transformação de limiar descrita — a semântica acima é o desenho-alvo, não o comportamento atual do endpoint; o Checkout não pode implementar esse polling de fato até o ERP atualizar o contrato.
- WHEN o Checkout monta o payload de `FaturarNFCe` (`FATURAR` ou `SUSPENDER`) THEN o sistema SHALL incluir o log de auditoria acumulado da venda (eventos `VENDA_INICIADA`, ações de cliente/vendedor/produto/pagamento, `VENDA_FINALIZADA`/`VENDA_SUSPENSA`, falhas como `FATURAMENTO_FALHOU`) serializado no campo `Log`. **Novo (2026-08-25, AD-061):** ver `.specs/features/auditoria-acoes-operador/spec.md` para o mecanismo completo — inclui a regra de que uma falha de rede (edge case acima) não descarta o log acumulado, só anexa o evento de falha para reenvio na tentativa seguinte.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
|---|---|---|---|
| FIN-01 | Finalizar venda via `FaturarNFCe` (`FATURAR`) | - | Verified |
| FIN-02 | Trilha de auditoria de itens cancelados | - | Verified (2026-08-25, AD-062 — corrigido: não é mais campo por item, é evento `PRODUTO_CANCELADO` no log geral de `FIN-12`) |
| FIN-03 | `NumeroNota` correto (0 vs. preenchido) | - | Verified |
| FIN-04 | Descarte de cache de produto ao finalizar | - | Verified |
| FIN-05 | Suspender venda via `FaturarNFCe` (`SUSPENDER`) | - | Verified |
| FIN-06 | Limpeza total de carrinho/cache ao suspender | - | Verified |
| FIN-07 | `vendedorCodigo` do modal de seleção enviado em `FaturarNFCe` (não o do operador logado) | - | Verified (ver `.specs/features/selecao-vendedor/spec.md`, `VEND-05`) |
| FIN-08 | `CadSerieNFCe` = `SessaoUsuario.CadSerieNFCe` sempre enviado em `FaturarNFCe` (FATURAR e SUSPENDER) | - | Verified (2026-08-25, AD-034 — clarificação de processo do usuário) |
| FIN-09 | Falha de rede em `FaturarNFCe` exige confirmação manual antes de reenvio | - | Verified (2026-08-25, AD-038) |
| FIN-10 | Impressão via serviço local (`TipoImpressao='E'`) ou PDF (`TipoImpressao='P'`), com fallback para PDF quando serviço local indisponível | - | Verified (2026-08-25, AD-037; indicativo `GetSessao.TipoImpressao` confirmado em 2026-08-26, AD-082 — contrato técnico do serviço local ainda pendente) |
| FIN-11 | Suspensão bloqueada com TEF/PIX aprovado; permitida com pagamento removível, persiste ao retomar | - | Verified (2026-08-25, AD-042) |
| FIN-12 | Log de auditoria da venda (campo `Log`, string) enviado em `FaturarNFCe`, tanto `FATURAR` quanto `SUSPENDER` | - | Verified (2026-08-25, AD-061 — ver `.specs/features/auditoria-acoes-operador/spec.md`, `AUDIT-08`) |

**Coverage:** 12 total, 1 edge case resolvido em 2026-08-21 (impressão pós-autorização, AD-024) e 1 pendência ainda aberta, com escopo reduzido (contrato técnico do serviço de impressão local — porta/rota/formato de resposta, AD-037; o indicativo de mecanismo no `GetSessao`, `TipoImpressao`, foi resolvido em 2026-08-26, AD-082). **Atualização (2026-08-26, AD-075, corrigido no mesmo dia por AD-080):** semântica de `GetStatusSistema` (`numeric` com limiar `0`/`>=1`, não `boolean`, "algo mudou desde a última captura") e timing (polling de 60s só entre vendas) resolvidos por decisão direta do usuário — item 7 e item 23 fechados com resposta; endpoint segue pendente de atualização pelo ERP (ainda retorna `CadStatus` bruto hoje) — ver `.specs/project/PENDENCIES.md`. **Correção (2026-08-25, AD-062):** `FIN-02` deixa de depender do campo `produtoCancelado` (removido do escopo) — trilha de auditoria de cancelamento passa a viver no log geral de `FIN-12`.

---

## Success Criteria

- [ ] Nenhuma venda finalizada com dados de auditoria incompletos.
- [ ] Nenhuma suspensão deixa rascunho divergente entre Checkout e ERP.
