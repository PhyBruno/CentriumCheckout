# Quickstart — Validação: Importação e Faturamento de DAV

**Feature**: `specs/006-importacao-dav/` | **Date**: 2026-08-26

Guia de validação ponta a ponta para confirmar que a feature funciona conforme `spec.md` e `plan.md`. Pressupõe o scaffolding do projeto já criado (feature 002 em diante) e um ambiente com acesso a um tenant do ERP com pelo menos um DAV pronto para faturamento.

## Pré-requisitos

- Sessão do Checkout autenticada (feature 002) — operador logado, `GetSessao` já resolvido.
- Pelo menos um DAV de teste no ERP, com: 2+ itens, 1 forma de pagamento, cliente e vendedor distintos do default da sessão.
- Ambiente desktop — esta feature não tem equivalente mobile (AD-046).

## Cenário 1 — Listar e filtrar (US1, DAV-01)

1. Abrir a janela de importação de DAV.
2. Confirmar que a lista carrega, paginada.
3. Digitar um termo de busca livre (nome do cliente do DAV de teste) → lista filtra para o(s) documento(s) correspondente(s).
4. Ajustar o período de data de emissão para excluir o DAV de teste → lista não o exibe. Ajustar de volta para incluir → lista volta a exibi-lo.

**Esperado**: nenhuma chamada de rede falha; paginação e filtros refletem o parâmetro enviado (`Txtbusca`, `Datainicial`/`Datafinal`).

## Cenário 2 — Importar DAV completo (US2, DAV-02/03/04)

1. Selecionar o DAV de teste na lista.
2. Confirmar a importação.
3. Verificar que o carrinho reflete exatamente os itens do DAV — mesma quantidade, mesmo preço unitário do documento original (não o preço de catálogo atual, se divergente).
4. Verificar que o cliente da venda passou a ser o cliente do DAV — mesmo que outro cliente estivesse selecionado antes.
5. Verificar que o vendedor da venda passou a ser o vendedor do DAV (exibido por código, ver Cenário 4).
6. Verificar que a(s) forma(s) de pagamento do DAV aparecem já registradas na tela de pagamento, sem exigir nova cobrança.

**Esperado**: nenhum dado do DAV é redigitado (SC-001); preço de cada item bate exatamente com o valor original (SC-002).

## Cenário 3 — Venda importada segue o fluxo normal (FR-008)

1. A partir do carrinho importado no Cenário 2, inserir manualmente um novo produto (não presente no DAV original).
2. Confirmar que o novo item segue o motor de precificação normal (`specs/003-carrinho-produto-precificacao/`), enquanto as linhas importadas permanecem com o preço congelado.
3. Finalizar a venda pelo fluxo normal (`specs/004-finalizacao-suspensao-venda/`, quando planejada).

**Esperado**: `FaturarNFCe` é chamado uma única vez, incluindo tanto as linhas congeladas quanto a linha nova; o ERP fecha o DAV internamente (AD-058), sem chamada adicional do Checkout para "marcar como importado". Conferir no payload enviado que **`NumeroNota` é o mesmo devolvido por `GetDav`** (único elo com o DAV, AD-107) e que **nenhum campo de DAV é enviado** — `DavNum` não existe mais no contrato. Se o DAV não fechar no ERP após o faturamento, o primeiro suspeito é `NumeroNota` alterado/zerado no caminho, não um campo de vínculo faltando.

## Cenário 4 — Fallbacks de exibição (AD-095, AD-096)

1. No carrinho importado, verificar que cada linha exibe a descrição do produto (resolvida via `GetProduto` em segundo plano) — não o código cru, salvo se a chamada de descrição falhar.
2. Verificar que o campo de vendedor exibe "Vendedor #<código>" (sem nome) até o operador abrir o modal de seleção de vendedor e escolher explicitamente.

**Esperado**: nenhuma dessas duas lacunas bloqueia a importação ou a finalização da venda.

## Cenário 5 — Erro de importação (D7, AD-052)

1. Tentar importar um DAV que já foi faturado por outra sessão/operador (simular no backend de teste, ou reimportar o mesmo DAV duas vezes em sequência rápida).
2. Confirmar que o Checkout exibe um toast de erro e **não** popula o carrinho com dado parcial.

**Esperado**: nenhum estado inconsistente — o carrinho permanece como estava antes da tentativa de importação.

## Referências

- Contratos de rede: `contracts/erp-dav-api.md`
- Contrato de domínio: `contracts/importacao-domain-api.md`
- Modelo de dados: `data-model.md`
- Achados de contrato desta fase: AD-095, AD-096 (`.specs/project/STATE.md`)
