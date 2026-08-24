# Carrinho, Busca/Inserção de Produto e Motor de Precificação — Specification

## Problem Statement

O operador precisa inserir produtos na venda por busca livre ou por código já conhecido, com o preço correto aplicado automaticamente conforme regras de faixa de quantidade por SKU — recalculado a cada mutação relevante do carrinho, sem depender de recálculo manual.

## UI Design

Tela principal: frame `Fundo PDV Online Web` (componente base reutilizado em todas as telas web), área "Venda e produtos". Busca de produto: frame `PDV Online Web - Modal produto`. Fluxo mobile: frame `PDV Mobile 01 - Cliente e Produtos` (seção "Entrada rápida") e `PDV Mobile 02 - Produtos e Pagamento` (lista de produtos + subtotal).

**Nomenclatura:** `precos`/`faixasQuantidade`, usados neste documento, são apelidos internos simplificados para os campos reais do contrato `PrecoVenda1`...`PrecoVenda5` e `QtdMinimaPreco2`...`QtdMinimaPreco5` (`ApiCentriumOAuth.yaml`, `GetListaProdutos`/`GetProduto`) — não são nomes literais de campo.

## Goals

- [ ] Preço aplicado sempre correto, mesmo com múltiplas linhas do mesmo SKU e cancelamentos parciais.
- [ ] Reprecificação automática disparada por qualquer mutação relevante (inserir, editar quantidade, cancelar).
- [ ] Trilha de auditoria de itens cancelados preservada durante toda a venda.

## Out of Scope

| Feature | Reason |
|---|---|
| Conceito de "produto pai" | Endpoints do ERP consumidos pelo Checkout não retornam esse dado — confirmado (2026-08-20) |
| Modelo de precificação progressivo por banda | Modelo é de limiar único (flat): atingida a faixa, todas as unidades do SKU na venda valem o preço da faixa |

---

## User Stories

### P1: Busca de produto via modal de pesquisa ⭐ MVP

**User Story**: Como operador de caixa, quero buscar produto por termo livre quando não sei o código exato, para listar candidatos e selecionar o certo.

**Why P1**: Caminho de entrada obrigatório quando o operador não tem o código em mãos.

**Acceptance Criteria**:

1. WHEN o operador digita um termo de busca no modal de pesquisa THEN o sistema SHALL chamar `GET /ApiCentriumOAuth/GetListaProdutos` (paginado) e listar candidatos.
2. WHEN o operador seleciona um candidato THEN o sistema SHALL cachear a resposta (preços, faixas) em memória via TanStack Query, chaveada por SKU, com `staleTime: Infinity` durante a venda.

**Independent Test**: Buscar termo parcial e verificar paginação e cache por SKU.

---

### P1: Inserção direta por código conhecido ⭐ MVP

**User Story**: Como operador de caixa, quero inserir um produto direto pelo código de barras bipado ou digitado, sem passar pelo modal de busca, para agilizar a operação.

**Why P1**: Fluxo mais comum no dia a dia do PDV — velocidade é crítica.

**Acceptance Criteria**:

1. WHEN o operador bipa ou digita um código já conhecido THEN o sistema SHALL chamar `GET /ApiCentriumOAuth/GetProduto` para esse código específico.
2. WHEN o mesmo SKU é reinserido na mesma venda THEN o sistema SHALL reusar o cache já existente (mesmos `precos`/`faixasQuantidade`), sem nova chamada de rede e sem risco de divergência entre linhas.

**Independent Test**: Inserir o mesmo SKU duas vezes na mesma venda e confirmar que só há uma chamada de rede.

---

### P1: Motor de precificação por faixa de quantidade ⭐ MVP

**User Story**: Como operador de caixa, quero que o preço de cada linha reflita automaticamente a faixa de quantidade correta do SKU, sem precisar recalcular manualmente.

**Why P1**: Lógica de negócio crítica — erro aqui é erro de cobrança.

**Acceptance Criteria**:

1. WHEN `SessaoUsuario.TipoPreco` (domain `EmpDefPre`) for diferente de `8` e diferente de `9` (preço por lista, ver Edge Cases) THEN o sistema SHALL aplicar sempre o preço fixo indicado pelo índice de `TipoPreco` (`precos[TipoPreco]`, `1` a `5`), independentemente de faixas de quantidade.
2. WHEN `SessaoUsuario.TipoPreco = 8` e a quantidade agregada do SKU na venda inteira atinge o limiar de uma faixa THEN o sistema SHALL aplicar o preço dessa faixa (`precos[1]` a `precos[5]`) a **todas** as unidades daquele SKU na venda (modelo flat, não progressivo).
3. WHEN qualquer mutação afeta um SKU (inserir nova linha, editar quantidade, cancelar linha) THEN o sistema SHALL disparar `repriceSku(sku)`, recalculando **todas** as linhas ativas daquele SKU — não só a linha alterada.
4. WHEN uma linha é cancelada e isso derruba a quantidade agregada das linhas ainda ativas do SKU abaixo de um limiar THEN o sistema SHALL recalcular as linhas remanescentes ativas para a faixa inferior automaticamente.
5. WHEN `repriceSku` executa THEN o sistema SHALL usar sempre os `precos`/`faixasQuantidade` já copiados para a própria linha do carrinho no momento da inserção — nunca dependendo do cache do TanStack Query estar presente.

**Independent Test**: Inserir 3 unidades de um SKU com faixa em 5, depois mais 3 (total 6, cruza a faixa) — todas as 6 unidades devem recalcular para o preço da faixa. Cancelar 3 — as 3 restantes devem voltar à faixa inferior.

---

### P1: Cancelamento de item preserva a linha para auditoria ⭐ MVP

**User Story**: Como operador de caixa, ao cancelar um item por engano de inserção, quero que ele fique riscado na grid (não sumir), para que auditoria possa ver o que foi cancelado.

**Why P1**: Requisito de auditoria confirmado contra diagrama de referência do ERP.

**Acceptance Criteria**:

1. WHEN o operador cancela/remove um item do carrinho THEN o sistema SHALL manter a linha no estado, marcada como cancelada e exibida riscada na grid — não removê-la do array.
2. WHEN o motor de precificação (story acima) recalcula quantidade agregada e totais THEN o sistema SHALL excluir linhas canceladas do cálculo.

**Independent Test**: Cancelar uma linha e verificar que ela permanece visível riscada, e que o total da venda não a inclui.

---

## Edge Cases

- WHEN `GetProduto`/`GetSessao` retornam `SessaoUsuario.TipoPreco` (via `PTrazEmpDefP.Call`, domain `EmpDefPre`) THEN o sistema SHALL tratar o valor como índice de `1` a `11` que indica **diretamente o preço de venda a aplicar no item** — não é mais tratado como valor 0-based nem como espelho de `ListaPreco`. **Correção (2026-08-24, regra de negócio confirmada pelo usuário):** de `1` a `5`, o valor é índice direto para `PrecoVenda1`...`PrecoVenda5` (sem faixa de quantidade). De `6` a `11` são casos especiais, dos quais dois já mapeados — `8` (preço por faixa de quantidade, ver bullet abaixo) e `9` (preço por lista, ver bullet abaixo); a semântica de `6`, `7`, `10` e `11` continua sem confirmação (pendência estreitada, não eliminada).
- WHEN `SessaoUsuario.TipoPreco = 9` THEN o sistema SHALL aplicar a lista de preço configurada no cadastro do cliente (`ClienteCheckout.ListaPreco`/`CliListCod`, via `PCheckout_GetCliente`) — não a lista padrão da empresa. WHEN o cliente não tem lista de preço própria configurada THEN o sistema SHALL usar a lista padrão da empresa, carregada em `SessaoUsuario.listaPrecoPadrao`. **Confirmado (2026-08-24, regra de negócio do usuário):** ao chamar `GetProduto` com a lista de preço do cliente informada, o campo `SDTCheckout_GetProduto.PrecoVendaLista` retorna preenchido — é esse o valor a aplicar nesse caso, distinto de `PrecoVenda1`...`PrecoVenda5`.
- WHEN o motor de precificação decide entre modo flat e por faixa (CART-04/CART-05) THEN o sistema SHALL usar `SessaoUsuario.TipoPreco = 8` como sinal — **não existe flag booleano separado no contrato** (ex.: `usaPrecoPorQuantidade`). **Resolvido (2026-08-24, regra de negócio confirmada pelo usuário):** substitui a hipótese anterior (AD-024) de inferir o modo localmente via `QtdMinimaPreco2 > 0` — o próprio valor `8` de `TipoPreco` já é o sinal oficial de "preço por faixa de quantidade", variando o uso de `PrecoVenda1` a `PrecoVenda5` conforme a quantidade agregada do SKU.
- WHEN o operador digita menos caracteres que o mínimo de busca THEN o sistema SHALL usar `QtdMinCharParaConsulta` (retornado por `GetSessao`). **Resolvido (2026-08-21, AD-024):** confirmado na KB do GenExus — `PCheckout_GetSessao` já aplica `&SessaoUsuario.QtdMinCharParaConsulta = iif(&QtdMinChar <= 2, 3, &QtdMinChar)`, ou seja, o próprio ERP garante um piso de 3. O Checkout deve usar sempre o valor retornado diretamente, nunca hardcodar 3 — o valor já vem com o piso aplicado, então usar o retorno é estritamente equivalente ou mais correto que o fixo de `Regras.md`.
- WHEN o cliente tem `DescontoConvenio` aplicável THEN o sistema SHALL tratar o valor como percentual. **Resolvido (2026-08-21, AD-023):** confirmado na KB do GenExus — `PGeraPedidoVenda` calcula `&ConvDsc = (1 - CliConvDsc / 100)`, fator de desconto percentual (ver também `.specs/features/identificacao-cadastro-cliente/spec.md`).
- WHEN um produto pesável é bipado (código de barras iniciando em `2`) THEN ⚠️ pendente: formato exato do restante do código (padrão EAN-13 de balança vs. sintaxe `código*quantidade`) não confirmado — nenhum campo do contrato expõe essa máscara. **Atualização (2026-08-21, AD-023):** subagente varreu ~6% do KB do GenExus (8090 objetos) sem encontrar lógica de parse de código de barras pesável. Achado lateral: `ProdutoPesavel`/`DavMatProdPes` tem valor default `'E'` em `wManutencaoImplantacaoProdutos` — sugere um código de caractere único com múltiplos valores possíveis, não um simples flag `S`/`N`. **Reforçado (2026-08-21, AD-024):** confirmado que `MatProdPes` (produto) e `DavMatProdPes` (item de DAV) são o mesmo conceito em dois contextos — leitura direta de `PCheckout_GetProduto` e `PCheckout_GetDav` confirma ambos os nomes de atributo. Porém a linha `Default(&sdtDefaultProdutos.MatProdPes,'E')` em `wManutencaoImplantacaoProdutos` está **comentada/inativa** no código-fonte (não é o default real em vigor); e a validação de campo obrigatório do mesmo WebPanel trata o valor via `.IsEmpty()` (comportamento de texto, não de booleano `S`/`N`), reforçando a hipótese de código multi-valor. Pendência real permanece — precisa de confirmação direta com a equipe do ERP, não só inspeção de KB.
- WHEN o operador digita o código do produto e pressiona TAB THEN o resultado depende de uma flag de editabilidade vinda do próprio cadastro do produto (⚠️ campo exato no contrato/KB ainda não confirmado — item 4, `.specs/project/PENDENCIES.md`). WHEN o produto NÃO é editável THEN o sistema SHALL inserir a linha diretamente na grid nesse mesmo TAB, com os campos `preço`, `unidade de medida`, `quantidade` e `desconto` já somente-leitura (mesmo fluxo de `CART-01`/`CART-02`). WHEN o produto É editável THEN o sistema SHALL NÃO inserir a linha nesse momento — em vez disso, o foco pula para os campos `preço`, `unidade de medida`, `quantidade` e `desconto`, permitindo ao operador editar esses valores; a linha só entra efetivamente na grid quando o operador aciona o botão `+` já previsto na UI (não há inserção automática ao terminar de editar os campos). **Resolvido parcialmente (2026-08-24, AD-027, decisão direta do usuário, com verificação na KB real do GenExus):** mecanismo de TAB (inserir direto vs. pular para edição + confirmar no botão `+`) confirmado. Verificado diretamente em `SDTCheckout_GetProduto`/`PCheckout_GetProduto` (tabela `Materiais`, atributos `Mat*`) — **não existe hoje nenhum campo de editabilidade no contrato nem na origem** (sem `MatBloq*`/`MatEdit*`/`MatPermite*` na KB). É lacuna real de contrato, não só falta de mapeamento — precisa de expansão pelo ERP, mesmo status "PENDÊNCIA DEV" do item 13.
- WHEN uma forma de pagamento já foi aprovada na venda THEN ⚠️ **em análise, não implementar até conclusão** (pedido explícito do usuário, 2026-08-20): definir como/onde travar inserção de novo produto e cancelamento de item — vários diagramas de referência do ERP trazem essa regra, mas o mecanismo exato (desabilitar UI vs. validação adicional) ainda não foi decidido.
- WHEN a validação de saldo/estoque está ativa THEN ⚠️ **em aberto, propositalmente não resolvido** (pedido explícito do usuário, 2026-08-20): não confirmado se a validação de estoque é sempre ativa ou condicionada a flag do `GetSessao`, nem o comportamento exato quando o saldo é insuficiente.
- WHEN um item é cancelado (`CART-08`) THEN o sistema SHALL enviar ao ERP a marcação de que o cancelamento foi feito pelo operador do checkout, via o campo `produtoCancelado` (`boolean`, `NULL` equivale a `false`) no SDT `CheckoutFaturarNFCe`. **Resolvido (2026-08-24, AD-026, decisão direta do usuário):** o front mantém a linha riscada localmente (AC1/AC2 da story acima) e, ao finalizar (`FaturarNFCe`), envia `produtoCancelado = true` para o item que foi inserido no carrinho e depois cancelado — mesma decisão que resolve a pendência #6 (`.specs/features/finalizacao-suspensao-venda/spec.md`, story "Finalizar a venda", AC2). **Campo ainda não implementado no lado do ERP** — decisão de contrato a desenvolver pela equipe do ERP, mesmo status de "PENDÊNCIA DEV" do item 13 em `.specs/project/PENDENCIES.md`.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
|---|---|---|---|
| CART-01 | Busca via `GetListaProdutos` (modal) | - | Verified |
| CART-02 | Inserção direta via `GetProduto` | - | Verified |
| CART-03 | Cache por SKU, `staleTime: Infinity` na venda | - | Verified |
| CART-04 | Precificação por índice fixo de `TipoPreco` (1-5) | - | Verified |
| CART-05 | Precificação por faixa de quantidade (`TipoPreco = 8`) | - | Verified |
| CART-06 | Reprecificação disparada em qualquer mutação de SKU | - | Verified |
| CART-07 | Cascata de reprecificação no cancelamento | - | Verified |
| CART-08 | Cancelamento mantém linha riscada (auditoria) | - | Verified |
| CART-09 | Bloqueio de edição pós-pagamento | - | Em análise — não implementar |
| CART-10 | Validação de saldo/estoque na inserção | - | Em aberto — propositalmente não resolvido |

**Coverage:** 10 total, 8 requisitos confirmados e prontos para Design/Tasks, 2 explicitamente bloqueados até análise adicional (`CART-09`/`CART-10`, categoria separada de "pendente de confirmação com ERP"), 5 edge cases pendentes de confirmação com equipe do ERP (marcação de autoria de cancelamento resolvida em 2026-08-24, AD-026 — campo `produtoCancelado`, ainda não implementado no ERP).

---

## Success Criteria

- [ ] Preço aplicado nunca diverge entre linhas do mesmo SKU na mesma venda.
- [ ] Nenhuma reprecificação exige ação manual do operador.
- [ ] Item cancelado sempre rastreável (quem, quando) até o fim da venda.
- [ ] Antes de codar: esta feature é candidata a passar pela fase **Design** (ver `.specs/project/ROADMAP.md`) dado o volume de regras de cascata do motor de precificação.
