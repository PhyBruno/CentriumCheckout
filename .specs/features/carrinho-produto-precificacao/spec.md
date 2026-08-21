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

1. WHEN `usaPrecoPorQuantidade = false` (flag do payload de bootstrap) THEN o sistema SHALL aplicar sempre `precos[1]`, independentemente de faixas.
2. WHEN `usaPrecoPorQuantidade = true` e a quantidade agregada do SKU na venda inteira atinge o limiar de uma faixa THEN o sistema SHALL aplicar o preço dessa faixa a **todas** as unidades daquele SKU na venda (modelo flat, não progressivo).
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

- WHEN `GetProduto` é chamado com `TipoPreco`/`ListaPreco` = `0` THEN o sistema SHALL usar esse valor — ⚠️ pendente: diferenciação semântica completa entre `TipoPreco` e `ListaPreco` fora do caso `0` não confirmada.
- WHEN o motor de precificação decide entre modo flat e por faixa (`usaPrecoPorQuantidade`, CART-04/CART-05) THEN ⚠️ pendente: esse nome de campo não foi localizado no schema de resposta de `GetSessao` (`ApiCentriumOAuth.yaml`) — não confirmado sob qual nome real esse flag existe no payload de bootstrap.
- WHEN o operador digita menos caracteres que o mínimo de busca THEN o sistema SHALL usar `QtdMinCharParaConsulta` (retornado por `GetSessao`) — ⚠️ pendente: confirmar que essa config dinâmica substitui o "mínimo 3 caracteres" fixo de `Regras.md`, para não hardcodar.
- WHEN o cliente tem `DescontoConvenio` aplicável THEN ⚠️ pendente: não confirmado se é percentual ou valor fixo — impacta diretamente o cálculo do motor de precificação (ver também `.specs/features/identificacao-cadastro-cliente/spec.md`).
- WHEN um produto pesável é bipado (código de barras iniciando em `2`) THEN ⚠️ pendente: formato exato do restante do código (padrão EAN-13 de balança vs. sintaxe `código*quantidade`) não confirmado — nenhum campo do contrato expõe essa máscara.
- WHEN o operador dá TAB em um produto na grid THEN ⚠️ pendente: qual campo entra em edição (preço, quantidade, desconto) e o critério de elegibilidade não estão confirmados.
- WHEN uma forma de pagamento já foi aprovada na venda THEN ⚠️ **em análise, não implementar até conclusão** (pedido explícito do usuário, 2026-08-20): definir como/onde travar inserção de novo produto e cancelamento de item — vários diagramas de referência do ERP trazem essa regra, mas o mecanismo exato (desabilitar UI vs. validação adicional) ainda não foi decidido.
- WHEN a validação de saldo/estoque está ativa THEN ⚠️ **em aberto, propositalmente não resolvido** (pedido explícito do usuário, 2026-08-20): não confirmado se a validação de estoque é sempre ativa ou condicionada a flag do `GetSessao`, nem o comportamento exato quando o saldo é insuficiente.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
|---|---|---|---|
| CART-01 | Busca via `GetListaProdutos` (modal) | - | Verified |
| CART-02 | Inserção direta via `GetProduto` | - | Verified |
| CART-03 | Cache por SKU, `staleTime: Infinity` na venda | - | Verified |
| CART-04 | Precificação flat sem `usaPrecoPorQuantidade` | - | Verified |
| CART-05 | Precificação flat por faixa de quantidade agregada | - | Verified |
| CART-06 | Reprecificação disparada em qualquer mutação de SKU | - | Verified |
| CART-07 | Cascata de reprecificação no cancelamento | - | Verified |
| CART-08 | Cancelamento mantém linha riscada (auditoria) | - | Verified |
| CART-09 | Bloqueio de edição pós-pagamento | - | Em análise — não implementar |
| CART-10 | Validação de saldo/estoque na inserção | - | Em aberto — propositalmente não resolvido |

**Coverage:** 10 total, 8 requisitos confirmados e prontos para Design/Tasks, 2 explicitamente bloqueados até análise adicional (`CART-09`/`CART-10`, categoria separada de "pendente de confirmação com ERP"), 6 edge cases pendentes de confirmação com equipe do ERP.

---

## Success Criteria

- [ ] Preço aplicado nunca diverge entre linhas do mesmo SKU na mesma venda.
- [ ] Nenhuma reprecificação exige ação manual do operador.
- [ ] Item cancelado sempre rastreável (quem, quando) até o fim da venda.
- [ ] Antes de codar: esta feature é candidata a passar pela fase **Design** (ver `.specs/project/ROADMAP.md`) dado o volume de regras de cascata do motor de precificação.
