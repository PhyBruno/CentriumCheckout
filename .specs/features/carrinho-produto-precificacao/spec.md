# Carrinho, Busca/Inserção de Produto e Motor de Precificação — Specification

## Problem Statement

O operador precisa inserir produtos na venda por busca livre ou por código já conhecido, com o preço correto aplicado automaticamente conforme regras de faixa de quantidade por SKU — recalculado a cada mutação relevante do carrinho, sem depender de recálculo manual.

## UI Design

Tela principal: frame `Fundo PDV Online Web` (componente base reutilizado em todas as telas web), área "Venda e produtos". Busca de produto: frame `PDV Online Web - Modal produto`. Fluxo mobile: frame `PDV Mobile 01 - Cliente e Produtos` (seção "Entrada rápida") e `PDV Mobile 02 - Produtos e Pagamento` (lista de produtos + subtotal).

**Nomenclatura:** `precos`/`faixasQuantidade`, usados neste documento, são apelidos internos simplificados para os campos reais do contrato `PrecoVenda1`...`PrecoVenda5` e `QtdMinimaPreco2`...`QtdMinimaPreco5` (`ApiCentriumOAuth.yaml`, `GetListaProdutos`/`GetProduto`) — não são nomes literais de campo. Esses dois só são usados quando `TipoPreco = 8` (preço por faixa de quantidade); em todos os demais casos o preço a aplicar vem do campo único `PrecoVenda`, já resolvido pelo ERP (ver Edge Cases, AD-059).

## Goals

- [ ] Preço aplicado sempre correto, mesmo com múltiplas linhas do mesmo SKU e cancelamentos parciais.
- [ ] Reprecificação automática disparada por qualquer mutação relevante (inserir, editar quantidade, cancelar).
- [ ] Trilha de auditoria de itens cancelados preservada durante toda a venda.

## Out of Scope

| Feature | Reason |
|---|---|
| Conceito de "produto pai" | Endpoints do ERP consumidos pelo Checkout não retornam esse dado — confirmado (2026-08-20) |
| Modelo de precificação progressivo por banda | Modelo é de limiar único (flat): atingida a faixa, todas as unidades do SKU na venda valem o preço da faixa |
| Aprovação de supervisor para cancelamento de item / modal de reautenticação | Checkout não implementa essa restrição — decisão direta do usuário (AD-065 em `.specs/project/STATE.md`); único bloqueio de cancelamento é o pós-pagamento (`CART-09`) |

---

## User Stories

### P1: Busca de produto via modal de pesquisa ⭐ MVP

**User Story**: Como operador de caixa, quero buscar produto por termo livre quando não sei o código exato, para listar candidatos e selecionar o certo.

**Why P1**: Caminho de entrada obrigatório quando o operador não tem o código em mãos.

**Acceptance Criteria**:

1. WHEN o operador digita um termo de busca no modal de pesquisa THEN o sistema SHALL chamar `GET /ApiCentriumOAuth/GetListaProdutos` (paginado) e listar candidatos.
2. WHEN o operador seleciona um candidato THEN o sistema SHALL chamar `GET /ApiCentriumOAuth/GetProduto` para o `CodigoProduto` escolhido e cachear **essa** resposta (preço, faixas, `ProdutoPesavelEditavel`) em memória via TanStack Query, chaveada por SKU, com `staleTime: Infinity` durante a venda. **Confirmado (2026-08-26, AD-091, decisão direta do usuário):** o modal de lista serve apenas para captar e selecionar produtos — quem resolve a linha é sempre `GetProduto`, porque o retorno de `GetListaProdutos` não traz `PrecoVenda` nem `ProdutoPesavelEditavel` e o endpoint não aceita `Tipopreco`/`Codcliente`/`Listapreco`.

**Independent Test**: Buscar termo parcial e verificar paginação e cache por SKU.

---

### P1: Inserção direta por código conhecido ⭐ MVP

**User Story**: Como operador de caixa, quero inserir um produto direto pelo código de barras bipado ou digitado, sem passar pelo modal de busca, para agilizar a operação.

**Why P1**: Fluxo mais comum no dia a dia do PDV — velocidade é crítica.

**Acceptance Criteria**:

1. WHEN o operador bipa ou digita um código já conhecido THEN o sistema SHALL chamar `GET /ApiCentriumOAuth/GetProduto` para esse código específico, sempre enviando o parâmetro `Tipocodproduto` com o valor de `SessaoUsuario.UsuarioTipoCodigoProduto` (retornado por `GetSessao`, ver `.specs/features/autenticacao-sessao-bootstrap/spec.md`). **Resolvido (2026-08-25, AD-033, clarificação de processo do usuário):** o tipo de código enviado é sempre o configurado na sessão, nunca inferido por chamada. Não se aplica a `GetListaProdutos` (`CART-01`) — o parâmetro não existe nesse endpoint.
2. WHEN o mesmo SKU é reinserido na mesma venda THEN o sistema SHALL reusar o cache já existente (mesmos `precos`/`faixasQuantidade`), sem nova chamada de rede e sem risco de divergência entre linhas.
3. WHEN o operador digita o código no formato `código*quantidade` (ex.: `12345*3`) e pressiona Enter THEN o sistema SHALL carregar os dados do produto pela parte antes do `*` (chamada a `GetProduto`) e aplicar o valor após o `*` ao campo de quantidade do item, inserindo a linha diretamente na grid. **Resolvido (2026-08-24, AD-029, decisão direta do usuário):** WHEN o operador digita só o código (sem `*`) e pressiona Enter THEN o sistema SHALL inserir o item com quantidade `1` (padrão). Mecanismo de digitação manual, distinto do formato de código de barras *bipado* (escaneado) de produto pesável, já resolvido em AD-028.

**Independent Test**: Inserir o mesmo SKU duas vezes na mesma venda e confirmar que só há uma chamada de rede. Digitar `código*quantidade` e Enter, e confirmar que o item entra na grid já com a quantidade informada; digitar só o código e Enter, e confirmar que entra com quantidade 1.

---

### P1: Motor de precificação por faixa de quantidade ⭐ MVP

**User Story**: Como operador de caixa, quero que o preço de cada linha reflita automaticamente a faixa de quantidade correta do SKU, sem precisar recalcular manualmente.

**Why P1**: Lógica de negócio crítica — erro aqui é erro de cobrança.

**Acceptance Criteria**:

1. WHEN `SessaoUsuario.TipoPreco` (domain `EmpDefPre`) for diferente de `8` (todo o range `1` a `11` exceto `8` — inclui `1` a `5`, `6`, `7`, `9`, `10` e `11`, ver Edge Cases) THEN o sistema SHALL aplicar sempre o valor do campo único `PrecoVenda`, retornado por `GetProduto` (único endpoint que traz esse campo — AD-091) — o ERP já resolve internamente qual regra de preço vale (índice `1`-`5`, lista do cliente, custo, última venda, cliente x produto ou índice) e devolve o valor final pronto, sem o Checkout precisar indexar `precos[TipoPreco]` nem ler um campo separado por caso. **Corrigido (2026-08-25, AD-059):** substitui a leitura anterior de indexação direta em `PrecoVenda1`...`PrecoVenda5`. **Corrigido (2026-08-25, AD-060):** `6`, `7`, `10` e `11` também estão cobertos por esta regra geral — reverte a exclusão de escopo registrada em AD-031.
2. WHEN `SessaoUsuario.TipoPreco = 8` e a quantidade agregada do SKU na venda inteira atinge o limiar de uma faixa THEN o sistema SHALL aplicar o preço dessa faixa (`precos[1]` a `precos[5]`) a **todas** as unidades daquele SKU na venda (modelo flat, não progressivo).
3. WHEN qualquer mutação afeta um SKU (inserir nova linha, editar quantidade, cancelar linha) THEN o sistema SHALL disparar `repriceSku(sku)`, recalculando **todas** as linhas ativas daquele SKU **que não estejam com preço congelado por origem de rascunho/DAV** — não só a linha alterada. **Resolvido (2026-08-26, AD-067 em `.specs/project/STATE.md`):** uma linha vinda de rascunho de NFCe retomado ou de DAV importado (`.specs/features/recuperacao-nfce/spec.md`, `NFCE-03`; `.specs/features/importacao-dav/spec.md`, `DAV-02`) fica fora do escopo de `repriceSku` enquanto permanecer congelada — só entra no recálculo normal quando o operador a reinsere como linha nova ou a edita explicitamente (`NFCE-04`), o que evita tentar recalcular uma linha que nunca recebeu `faixasQuantidade`/`precos` (dados que só vêm de `GetProduto`/`GetListaProdutos`, não de `CarregarNFCe`/`GetDAV`).
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

- WHEN `GetProduto`/`GetSessao` retornam `SessaoUsuario.TipoPreco` (via `PTrazEmpDefP.Call`, domain `EmpDefPre`) THEN o sistema SHALL tratar o valor como índice de `1` a `11` que indica **diretamente qual regra de preço de venda vale para o item** — não é mais tratado como valor 0-based nem como espelho de `ListaPreco`. **Correção (2026-08-25, AD-059):** para todo `TipoPreco` diferente de `8`, o valor a aplicar no item SHALL ser lido do campo único `PrecoVenda` (retornado por `GetProduto`, único endpoint que traz esse campo — AD-091) — o ERP já resolve internamente qual regra vale e devolve o valor final pronto nesse campo; o sistema NÃO SHALL indexar `PrecoVenda1`...`PrecoVenda5` nem ler `PrecoVendaLista` para esses casos (substitui a leitura anterior de 2026-08-24). `8` (preço por faixa de quantidade, único caso que usa `PrecoVenda1`...`PrecoVenda5`, ver bullet abaixo) é o único caso realmente especial. Os demais valores fora de `1`-`5` — `6` (Preço de Custo), `7` (Preço da última venda), `9` (preço por lista, ver bullet abaixo), `10` (Preço Cliente x Produto, `PRM0241`) e `11` (Preço por Índice) — são todos tratados normalmente, lendo `PrecoVenda` igual a `1`-`5`, sem nenhuma lógica adicional. **Resolvido (2026-08-25, AD-031; corrigido no mesmo dia por AD-060):** a semântica de `6`, `7`, `10` e `11` é conhecida e os quatro valores **estão no escopo** do Checkout — a redação original desta AD-031 declarava esses valores fora de escopo por engano; a AD-060 reverte isso. O motor de precificação cobre `1`-`11` uniformemente, com `8` como única exceção.
- WHEN `SessaoUsuario.TipoPreco = 9` THEN o sistema SHALL aplicar **sempre** a lista de preço configurada no cadastro do cliente (`ClienteCheckout.ListaPreco`/`CliListCod`, via `PCheckout_GetCliente`), enviando esse valor no parâmetro `Listapreco` de `GetProduto`. **Resolvido (2026-08-26, AD-092, decisão direta do usuário):** **não existe lista de preço padrão da empresa** — `TipoPreco = 9` significa exatamente "o tipo de preço é por lista, e a lista é a do cliente", sem nenhum fallback. O campo `SessaoUsuario.listaPrecoPadrao`, citado em redações anteriores deste bullet como origem desse fallback, nunca existiu no contrato (`ApiCentriumOAuth.yaml`, schema `SessaoUsuario`) e foi removido desta especificação. **Confirmado (2026-08-24, regra de negócio do usuário):** o parâmetro de lista de preço na chamada a `GetProduto` só é aplicável quando `TipoPreco = 9` — WHEN `TipoPreco <> 9` THEN o sistema SHALL NÃO enviar valor algum nesse parâmetro. **Correção (2026-08-25, AD-059):** ao chamar `GetProduto` com esse valor informado, o campo a ler para o preço a aplicar é o único campo `PrecoVenda` (mesmo campo usado por `TipoPreco` `1`-`5`) — `SDTCheckout_GetProduto.PrecoVendaLista` deixa de ser referenciado nesta documentação, substituindo a leitura anterior de 2026-08-24.
- WHEN o motor de precificação decide entre modo flat e por faixa (CART-04/CART-05) THEN o sistema SHALL usar `SessaoUsuario.TipoPreco = 8` como sinal — **não existe flag booleano separado no contrato** (ex.: `usaPrecoPorQuantidade`). **Resolvido (2026-08-24, regra de negócio confirmada pelo usuário):** substitui a hipótese anterior (AD-024) de inferir o modo localmente via `QtdMinimaPreco2 > 0` — o próprio valor `8` de `TipoPreco` já é o sinal oficial de "preço por faixa de quantidade", variando o uso de `PrecoVenda1` a `PrecoVenda5` conforme a quantidade agregada do SKU. **Nota (AD-059):** esse é o único caso em que o Checkout lê `PrecoVenda1`...`PrecoVenda5` — em todo `TipoPreco` diferente de `8`, o campo lido é `PrecoVenda`.
- WHEN o operador digita menos caracteres que o mínimo de busca THEN o sistema SHALL usar `QtdMinCharParaConsulta` (retornado por `GetSessao`). **Resolvido (2026-08-21, AD-024):** confirmado na KB do GenExus — `PCheckout_GetSessao` já aplica `&SessaoUsuario.QtdMinCharParaConsulta = iif(&QtdMinChar <= 2, 3, &QtdMinChar)`, ou seja, o próprio ERP garante um piso de 3. O Checkout deve usar sempre o valor retornado diretamente, nunca hardcodar 3 — o valor já vem com o piso aplicado, então usar o retorno é estritamente equivalente ou mais correto que o fixo de `Regras.md`.
- WHEN o cliente tem `DescontoConvenio` aplicável THEN o sistema SHALL tratar o valor como percentual. **Resolvido (2026-08-21, AD-023):** confirmado na KB do GenExus — `PGeraPedidoVenda` calcula `&ConvDsc = (1 - CliConvDsc / 100)`, fator de desconto percentual (ver também `.specs/features/identificacao-cadastro-cliente/spec.md`).
- WHEN `GetProduto` retorna o produto THEN o sistema SHALL ler `SDTCheckout_GetProduto.ProdutoPesavelEditavel` (string) — campo presente **apenas** no retorno de `GetProduto`, não no de `GetListaProdutos` (AD-091) — para determinar simultaneamente se o produto é pesável e se é editável ao TAB — campo confirmado pelo usuário (2026-08-25, AD-063 em `.specs/project/STATE.md`) com os valores `'S'` (pesável, leitura na etiqueta), `'B'` (pesável, leitura na balança), `''` (não pesável, não editável) e `'E'` (não pesável, editável). **Confirmado estruturalmente (2026-08-26, AD-070 em `.specs/project/STATE.md`):** pesável (`'S'`/`'B'`) e editável (`'E'`) são mutuamente exclusivos por construção do campo (um único valor string entre 4 discretos, não dois booleanos combináveis) — não é mais suposição a confirmar. Um produto pesável nunca passa pelo fluxo de edição manual descrito abaixo, já que preço/peso vêm da etiqueta/balança.
- WHEN um produto pesável é bipado THEN o sistema SHALL reconhecer o código como gerado por balança quando ele tiver **13 dígitos** e começar em `2`. **Resolvido (2026-08-24, AD-028, decisão direta do usuário):** confirma o padrão EAN-13 de balança levantado como hipótese em AD-023 (descarta a sintaxe alternativa `código*quantidade`) — a detecção pelo código bipado é independente da leitura de `ProdutoPesavelEditavel` no bullet acima (uma identifica o produto pelo cadastro antes de qualquer bipagem; a outra faz o parse do código já bipado). **Resolvido — máscara completa e fórmula de quantidade (2026-08-26, AD-076 em `.specs/project/STATE.md`), fecha a pendência bloqueante do item 29 de `.specs/project/PENDENCIES.md` (AD-068):** confirmado por inspeção direta do código-fonte do ERP na KB real do GeneXus (`PAnalisaCodigoProduto`) — após validar o EAN-13 e o prefixo `2`, o sistema SHALL extrair o código reduzido do produto das posições 2 a 7 do código (6 dígitos) e o valor da etiqueta das posições 8 a 12 (5 dígitos, convertido para numérico e dividido por 100 — os 2 últimos dígitos são centavos); a posição 13 é o dígito verificador do EAN-13 (validado à parte, não é dado de negócio). WHEN o produto é pesável e o código bipado foi identificado como gerado na balança THEN o sistema SHALL calcular a quantidade como `round(trunc(valorEtiqueta / precoVendaDoProduto, 5), 3)` — ou seja, preço da etiqueta ÷ `PrecoVenda` do produto (mesmo campo de CART-04), truncado em 5 casas decimais e arredondado para 3 casas decimais (confirmado no evento `Enter` de `WWPNFCE` do ERP, fonte da regra hoje). WHEN `PrecoVenda` do produto não estiver informado no ERP THEN o sistema SHALL bloquear a inserção do item e avisar o operador — não deve inserir com quantidade indefinida (mesma validação aplicada hoje pelo ERP).
- WHEN o operador digita o código do produto e pressiona TAB THEN o resultado depende de `ProdutoPesavelEditavel` (bullet acima). WHEN o valor é `''` (não pesável, não editável) THEN o sistema SHALL inserir a linha diretamente na grid nesse mesmo TAB, com os campos `preço`, `unidade de medida`, `quantidade` e `desconto` já somente-leitura (mesmo fluxo de `CART-01`/`CART-02`). WHEN o valor é `'E'` (não pesável, editável) THEN o sistema SHALL NÃO inserir a linha nesse momento — em vez disso, o foco pula para os campos `preço`, `unidade de medida`, `quantidade` e `desconto`, permitindo ao operador editar esses valores; a linha só entra efetivamente na grid quando o operador aciona o botão `+` já previsto na UI (não há inserção automática ao terminar de editar os campos). **Resolvido (2026-08-24, AD-027, mecanismo de TAB; 2026-08-25, AD-063, campo que expõe a flag):** AD-027 confirmou o mecanismo de TAB por decisão direta do usuário, mas a verificação de KB da época (`MatBloq*`/`MatEdit*`/`MatPermite*`) não encontrou nenhum campo de editabilidade — lacuna fechada por AD-063, que identificou `ProdutoPesavelEditavel` como o campo real (nome não continha nenhum dos termos buscados).
- WHEN qualquer forma de pagamento já foi aprovada na venda THEN o sistema SHALL bloquear edição e cancelamento de item do carrinho. **Resolvido (2026-08-24, AD-030, decisão direta do usuário):** o bloqueio vale para qualquer pagamento aprovado, não só um subconjunto. WHEN o pagamento aprovado é TEF ou PIX THEN o sistema SHALL NÃO permitir a remoção desse pagamento — ambos chamam apps externos e não existe fluxo de cancelamento dessas transações no ERP, então o bloqueio de edição/cancelamento de item se torna permanente para o restante da venda. WHEN o pagamento aprovado é cartão fora do fluxo TEF (entrada manual, não integrada) ou dinheiro THEN o sistema SHALL permitir a remoção desse pagamento, o que reabilita a edição/cancelamento de item no carrinho.
- WHEN o operador cancela um item do carrinho THEN o sistema SHALL NÃO exigir aprovação de supervisor nem exibir modal de reautenticação — o único bloqueio de cancelamento continua sendo `CART-09` (pagamento aprovado). **Resolvido (2026-08-25, AD-065 em `.specs/project/STATE.md`):** decisão direta do usuário — fecha, sem implementar, o mecanismo de aprovação de supervisor descrito nos fluxogramas antigos de `Fluxograma - Diagrama - Alinhamentos\FLUXOS-MERMAID.md`.
- WHEN o operador insere um produto no carrinho THEN o sistema SHALL NÃO validar saldo/estoque disponível. **Resolvido (2026-08-24, AD-030, decisão direta do usuário):** validação de estoque é regra de controle do ERP, não do Checkout — o Checkout não implementa nenhuma verificação de saldo/estoque na inserção de produto.
- WHEN um item é cancelado (`CART-08`) THEN o sistema SHALL registrar o evento `PRODUTO_CANCELADO` (`codigoProduto`) no log de auditoria da venda, entregue ao ERP no campo `Log` de `FaturarNFCe` — ver `.specs/features/auditoria-acoes-operador/spec.md` (`AUDIT-04`). **Corrigido (2026-08-25, AD-062):** substitui a decisão anterior (2026-08-24, AD-026) de um campo dedicado `produtoCancelado` (`boolean`) no SDT `CheckoutFaturarNFCe` — removido do escopo por ser redundante com o log de auditoria geral, que já cobre esse e outros tipos de evento. O front continua mantendo a linha riscada localmente (AC1/AC2 da story acima); só a forma de comunicar o cancelamento ao ERP muda, de campo de payload estruturado por item para evento no log geral da venda.
- WHEN o operador aplica split de pagamento (múltiplas formas na mesma venda, `.specs/features/pagamento-geral/spec.md`, `PAY-09`, AD-036) THEN o sistema SHALL NÃO gerar, por si só, nenhum bloqueio de edição/cancelamento de item — o bloqueio continua sendo regido exclusivamente por `CART-09` (qualquer pagamento aprovado, independentemente de a venda ter split ou uma única forma).
- WHEN qualquer cálculo monetário no Checkout precisa arredondar um valor que não fecha em centavos exatos (ex.: rateio de desconto de capa entre itens, `.specs/features/pagamento-geral/spec.md`, `PAY-10`) THEN o sistema SHALL usar centavos inteiros, arredondados por linha, com a sobra distribuída pelo **método do maior resto** — nunca fração de centavo. **Resolvido (2026-08-25, AD-039):** decisão direta do usuário — mesmo padrão já usado no rateio de desconto de capa (AD-039), generalizado para todo cálculo monetário da aplicação, não só esse caso específico. **Critério de distribuição formalizado (2026-08-26, AD-072 em `.specs/project/STATE.md`):** cada item é arredondado para baixo; a diferença total em centavos é distribuída, 1 centavo por vez, aos itens com maior parte fracionária descartada, do maior resto para o menor, até zerar — substitui a redação anterior ("atribuída a um dos itens"), que não especificava qual item nem o critério.
- WHEN uma venda é retomada a partir de um rascunho de NFCe (`.specs/features/recuperacao-nfce/spec.md`, AD-041) THEN o sistema SHALL preservar/congelar o preço de cada item exatamente como salvo no rascunho — SEM disparar o motor de precificação deste documento automaticamente. WHEN o operador reinsere um item que já está no carrinho retomado THEN o sistema SHALL disparar o recálculo normal (`CART-04`/`CART-05`) para esse SKU.
- WHEN o cliente da venda é trocado com o carrinho já populado (`.specs/features/identificacao-cadastro-cliente/spec.md`, AD-043) THEN o sistema SHALL disparar recálculo de preço para `TipoPreco = 9` (preço por lista) — essa troca é permitida até existir pagamento aprovado, quando passa a ser bloqueada pelo mesmo gatilho de `CART-09`.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
|---|---|---|---|
| CART-01 | Busca via `GetListaProdutos` (modal), apenas para captar/selecionar — a linha é sempre resolvida por `GetProduto` | - | Verified (2026-08-26, AD-091) |
| CART-02 | Inserção direta via `GetProduto`, sempre com `Tipocodproduto` = `SessaoUsuario.UsuarioTipoCodigoProduto` | - | Verified (2026-08-25, AD-033) |
| CART-03 | Cache por SKU, `staleTime: Infinity` na venda | - | Verified |
| CART-04 | Precificação via campo único `PrecoVenda` para todo `TipoPreco` exceto `8` (inclui 1-5, 6, 7, 9, 10 e 11) | - | Verified (2026-08-25, AD-059/AD-060) |
| CART-05 | Precificação por faixa de quantidade (`TipoPreco = 8`) | - | Verified |
| CART-06 | Reprecificação disparada em qualquer mutação de SKU | - | Verified (2026-08-26, AD-067 — exclui linha congelada de rascunho/DAV até reinserção/edição) |
| CART-07 | Cascata de reprecificação no cancelamento | - | Verified |
| CART-08 | Cancelamento mantém linha riscada (auditoria) | - | Verified |
| CART-09 | Bloqueio de edição/cancelamento pós-pagamento | - | Verified |
| CART-10 | Validação de saldo/estoque na inserção | - | Verified |

**Atualização (2026-08-26, fase Design da feature 003 — `specs/003-carrinho-produto-precificacao/`):** dois pontos desta especificação foram corrigidos por decisão direta do usuário, após inspeção do `ApiCentriumOAuth.yaml` durante `/speckit-plan`. **AD-091:** `GetListaProdutos` não devolve `PrecoVenda` nem `ProdutoPesavelEditavel` e não aceita `Tipopreco`/`Codcliente`/`Listapreco` — o modal de lista só capta produtos para seleção, e a linha do carrinho é **sempre** resolvida por `GetProduto` (`CART-01`, `CART-04`, Edge Cases de `TipoPreco` e de `ProdutoPesavelEditavel` reescritos no ponto). **AD-092:** não existe lista de preço padrão da empresa — `TipoPreco = 9` sempre usa a lista do cliente, sem fallback, e o campo `SessaoUsuario.listaPrecoPadrao` (citado em redações anteriores) nunca existiu no contrato. Nenhuma das duas correções abre pendência nova.

**Coverage:** 10 total, 10 requisitos confirmados e prontos para Design/Tasks (`CART-09`/`CART-10` resolvidos em 2026-08-24, AD-030, por decisão direta do usuário), 0 edge cases bloqueantes — o parse fino dos 12 dígitos internos do código de barras pesável (bloqueante desde AD-068) foi resolvido em 2026-08-26 com a máscara completa e a fórmula de quantidade confirmadas na KB real do GeneXus (AD-076, fecha item 29 de `.specs/project/PENDENCIES.md`). **Resolvido (2026-08-25, AD-063):** flag de editabilidade ao TAB e semântica de "produto pesável" — ambas fechadas pelo mesmo campo, `SDTCheckout_GetProduto.ProdutoPesavelEditavel`, confirmado pelo usuário. **Correção (2026-08-25, AD-062):** marcação de autoria de cancelamento deixa de depender de campo de contrato — passa a ser evento `PRODUTO_CANCELADO` no log de auditoria (`.specs/features/auditoria-acoes-operador/spec.md`, AD-061), superando a decisão anterior (AD-026) de um campo dedicado `produtoCancelado`. **Atualização (2026-08-25):** padrão de arredondamento monetário generalizado (AD-039), interação com split de pagamento (AD-036), preço congelado ao retomar rascunho via `recuperacao-nfce` (AD-041) e recálculo de `TipoPreco=9` ao trocar cliente com carrinho populado (AD-043) documentados nos Edge Cases — nenhum deles introduz pendência nova. **Correção (2026-08-25, AD-059):** o campo lido para o preço a aplicar em todo `TipoPreco` diferente de `8` passa a ser o único campo `PrecoVenda` — corrige a leitura anterior de indexação em `PrecoVenda1`...`PrecoVenda5` (casos 1-5) e de leitura de `PrecoVendaLista` (caso 9); `PrecoVenda1`...`PrecoVenda5` seguem em uso exclusivamente para `TipoPreco = 8`. Inserção/edição/cancelamento de item também alimentam o log de auditoria geral (`PRODUTO_INSERIDO`/`PRODUTO_ALTERADO`/`PRODUTO_CANCELADO`, AD-061) — ver `.specs/features/auditoria-acoes-operador/spec.md`. **Atualização (2026-08-26, auditoria de grilling):** `CART-06` passa a excluir explicitamente linha congelada de rascunho/DAV do escopo de `repriceSku` (AD-067); exclusividade pesável/editável confirmada estruturalmente, não mais suposição (AD-070); método do maior resto formaliza o critério de distribuição do resto de arredondamento, corrigindo a redação vaga de AD-039 (AD-072); parse fino do código de barras pesável reclassificado de detalhe não bloqueante para pendência bloqueante, corrigindo AD-028 (AD-068, item 29 de `.specs/project/PENDENCIES.md`) — **e resolvido no mesmo dia (AD-076):** máscara completa (código do produto nas posições 2-7, valor da etiqueta nas posições 8-12 ÷100) e fórmula de quantidade (`round(trunc(valorEtiqueta/PrecoVenda, 5), 3)`) confirmadas em código-fonte real da KB do GeneXus, fechando a pendência bloqueante sem depender de resposta adicional da equipe do ERP.

---

## Success Criteria

- [ ] Preço aplicado nunca diverge entre linhas do mesmo SKU na mesma venda.
- [ ] Nenhuma reprecificação exige ação manual do operador.
- [ ] Item cancelado sempre rastreável (quem, quando) até o fim da venda.
- [ ] Antes de codar: esta feature é candidata a passar pela fase **Design** (ver `.specs/project/ROADMAP.md`) dado o volume de regras de cascata do motor de precificação.
