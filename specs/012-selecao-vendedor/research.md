# Phase 0 — Research: Seleção de Vendedor

**Feature**: `specs/012-selecao-vendedor/` | **Date**: 2026-08-27

Este documento resolve as incógnitas técnicas do Technical Context de `plan.md`. A spec de domínio (`.specs/features/selecao-vendedor/spec.md`) já chegava a esta fase com 9/9 requisitos `Verified` — mas a verificação registrada para `VEND-03`/`VEND-08` (filtro "Ativo") dependia de uma checagem de contrato que `AD-053` (ponto 3) deixava explicitamente pendente "até a fase Design de `selecao-vendedor` confirmar (ou não) o mesmo problema de contrato" já encontrado para cliente (`AD-093`). Essa checagem foi feita nesta fase e confirmou a mesma lacuna — ver D2/AD-103 abaixo, o único achado de contrato desta rodada.

- **Confirmação** — a decisão já existia; aqui só se registra como ela se materializa em código.
- **Nova** — decisão de design tomada nesta fase, porque a spec não a determinava.

---

## D1 — Seleção na lista é definitiva; não existe endpoint singular de vendedor

**Natureza**: Nova quanto à forma; diverge deliberadamente do padrão "lista só capta, endpoint singular resolve" já ratificado para produto (AD-091) e cliente (`specs/005-identificacao-cadastro-cliente/research.md`, D1).

**Decision**: Ao selecionar uma linha em `GET /ApiCentriumOAuth/GetListaVendedores`, o Checkout monta `VendedorVenda` **diretamente** a partir do item da lista (`CheckoutListaVendedores.Vendedores_Vendedores`) — nenhuma chamada adicional é feita. Não existe `GetVendedor` (singular) no contrato (confirmado por inspeção de `Fluxograma - Diagrama - Alinhamentos/ApiCentriumOAuth.yaml` — o único `operationId` relacionado a vendedor é `APICentriumOAuth.GetListaVendedores`).

**Rationale**: O padrão "lista capta, singular resolve" existe para cliente/produto porque a lista paginada daqueles domínios **não** traz todos os campos que a venda precisa (ex.: `DescontoConvenio` só existe em `ClienteCheckout`, retorno de `GetCliente`). Para vendedor, `Vendedores_Vendedores` já traz tudo que a venda consome (`VendedorCodigo`, `VendedorNome`) — inventar uma segunda chamada sem endpoint real seria impossível, e desnecessário: não há campo adicional a completar.

**Alternatives considered**: nenhuma — a ausência de um endpoint singular não deixa outra opção tecnicamente viável.

---

## D2 — Filtro "Ativo" removido — mesma lacuna de contrato já corrigida para cliente

**Natureza**: Achado de contrato, promovido a **AD-103** em `.specs/project/STATE.md`.

**Decision**: `GetListaVendedores` aceita somente `Empresa`, `Txtbusca`, `Pagina`, `Tamanhopagina` — sem parâmetro de status. `CheckoutListaVendedores.Vendedores_Vendedores` (item de resposta) tem `VendedorCodigo`, `VendedorNome`, `VendedorCGC`, `VendedorFone` — sem `Ativo`/`Status`. O filtro "Ativo" pré-marcado (previsto por `AD-053`, ponto 3, condicionado a esta verificação) e a restrição "só vendedores ativos por padrão" (`FR-002`/`FR-003`/`VEND-03`/`VEND-08`) são **removidos** — não há dado real por trás. A coluna "subtítulo de função" (ex.: "Vendedora responsável"), presente só na comparação ilustrativa com o Modal cliente, também é removida pelo mesmo motivo: não existe campo de função/cargo no contrato.

**Rationale**: Mesmo padrão de achado já registrado para cliente (`AD-093`) — a lacuna é de contrato (o dado nunca chega ao Checkout), não uma escolha de produto a discutir. Tratar os dois casos com a mesma resolução (remoção de escopo, sem tentar simular o filtro) mantém consistência entre os dois modais quase idênticos.

**Alternatives considered**:
- *Manter o filtro como "presente mas sem efeito visível" (chip decorativo)*: rejeitado — enganaria o operador ao sugerir uma capacidade de filtro que não existe.
- *Pedir ao ERP que `GetListaVendedores` passe a expor status*: solução ideal a médio prazo, registrada só como observação — não é pendência bloqueante porque a feature é implementável hoje sem o filtro (mesma decisão de produto de AD-093, não um gap técnico aguardando resposta).

---

## D3 — Pré-seleção do vendedor default: snapshot completo desde o bootstrap

**Natureza**: Confirmação (`AD-032`, `AD-053`, `AD-056`) quanto ao gatilho e à forma. Redações anteriores contrastavam este caso com a limitação que `AD-094` impunha ao cliente default — contraste que deixou de existir: `AD-108` (2026-08-31) fechou aquela lacuna, e hoje **os dois** snapshots default nascem completos a partir do `GetSessao`.

**Decision**: Ao iniciar/retomar uma venda (mesmo call site que zera carrinho, cliente e auditoria — features 001/003/005), `vendedorSlice.inicializarVendedorPadrao(sessaoUsuario)` roda **sem nenhuma chamada de rede**:

```ts
if (sessaoUsuario.VendedorCodigo) {
  vendedorAtual = {
    codigo: sessaoUsuario.VendedorCodigo,
    nome: sessaoUsuario.VendedorNome,
    origem: 'DEFAULT',
  };
} else {
  vendedorAtual = null; // FR-006/VEND-07 (AD-053) — campo vazio, exige seleção manual
}
```

Nenhum evento de auditoria é disparado por esta inicialização (D6).

**Rationale**: `SessaoUsuario.VendedorCodigo`/`VendedorNome` (confirmados como campos distintos de `UsuarioCodigo` pela Fato F1/`AD-056`, linhas 802-808 do contrato) já são exatamente os dois campos que `VendedorVenda` precisa — o snapshot nasce **completo**, sem `null` parcial, e sem nenhum campo derivado a buscar. O cliente default chegou a ter uma limitação análoga (`AD-094`: `GetCliente` não busca por código, deixando `ListaPreco`/`DescontoConvenio` indisponíveis), **resolvida em 2026-08-31 por `AD-108`** — a lista vem de `SessaoUsuario.ListaPrecoDefault` e o cliente default não tem convênio. Não há pendência aberta em nenhum dos dois casos.

**Alternatives considered**: nenhuma — não há lacuna a contornar.

---

## D4 — Vendedor sem nome ao retomar rascunho ou importar DAV: mesmo fallback por código já usado por AD-095

**Natureza**: Confirmação — generaliza o padrão que a feature 006 já reservou (`contracts/importacao-domain-api.md`, `vendedorSlice.trocarVendedor({ codigo, nome: null })`) para o caso de retomada de rascunho via `CarregarNFCe` (feature 004/011).

**Decision**: `CheckoutFaturarNFCe` — o schema retornado tanto por `CarregarNFCe` quanto por `GetDAV` (`AD-057`) — só tem `vendedorCodigo`, nunca um campo de nome (confirmado por inspeção direta do schema, linhas 1414-1451 do yaml). `vendedorSlice.trocarVendedor({ codigo, nome: null })` é a mesma action pública que a feature 006 já reaproveita; a UI exibe `"Vendedor #<código>"` até o operador reabrir o modal de seleção e resolver o nome manualmente pela busca — mesma UX já decidida para cliente/vendedor sem nome em `AD-095`. Este plano só define a action; o call site que a invoca a partir de `CarregarNFCe` é responsabilidade da fase Design de `004-finalizacao-suspensao-venda`/`011-recuperacao-nfce` (ainda não executada — ver `STATE.md`, "Current Work").

**Rationale**: `AD-095` já resolveu exatamente este problema para o caso de importação de DAV; a causa raiz (o schema de retorno de faturamento/carregamento nunca inclui nome de vendedor) é a mesma para retomada de rascunho — reaproveitar a mesma decisão evita um segundo mecanismo de "vendedor parcial" no domínio.

**Alternatives considered**:
- *Chamar `GetListaVendedores` com `Txtbusca` vazio e tentar casar pelo código no cliente*: rejeitado — mesmo risco já descartado em `AD-095`/D1 de `specs/005.../research.md` (nome não é chave, correspondência por texto usando o código arrisca resolver o vendedor errado).

---

## D5 — Bloqueio de troca pós-pagamento reaproveita o predicado da feature 003

**Natureza**: Confirmação (`AD-043` — "mesmo gatilho de `CART-09`"), reaproveitando a forma já decidida em D8 de `specs/003-carrinho-produto-precificacao/research.md` e D8 de `specs/005-identificacao-cadastro-cliente/research.md`.

**Decision**: `vendedorSlice.trocarVendedor(...)` consulta o mesmo `podeMutarCarrinho(): boolean` já injetado na composição do `vendaStore` (feature 003, implementado pela feature 008) — não define um terceiro predicado nem importa o slice de pagamento/carrinho. Se `podeMutarCarrinho()` for `false`, a troca é no-op (o vendedor atual permanece).

**Rationale**: Dependency Inversion (Constitution II) — a terceira feature a consumir este predicado (depois de carrinho e cliente) confirma que ele é o ponto único de verdade sobre "quando a venda pode ser mutada"; duplicá-lo por slice arriscaria divergência silenciosa entre os três.

**Alternatives considered**: nenhuma — mesma decisão já ratificada duas vezes.

---

## D6 — `VENDEDOR_SELECIONADO` (primeira escolha explícita) vs. `VENDEDOR_TROCADO` (substituição)

**Natureza**: Nova quanto à forma; confirmação quanto aos dois tipos de evento (`.specs/features/auditoria-acoes-operador/spec.md`, `AUDIT-03`, referenciado por `AD-061`). Mais simples que o equivalente em cliente (D9 de `specs/005.../research.md`) porque não existe um terceiro evento de "criação" — vendedor não tem cadastro pelo Checkout (`FR-015`/Out of Scope).

**Decision**: O slice mantém a mesma flag interna, não persistida, `houveEscolhaExplicita: boolean` (`false` no início/retomada da venda). Regra:

| Ação do operador | `houveEscolhaExplicita` antes | Evento disparado | `houveEscolhaExplicita` depois |
|---|---|---|---|
| Seleciona candidato no modal | `false` | `VENDEDOR_SELECIONADO` | `true` |
| Seleciona candidato no modal | `true` | `VENDEDOR_TROCADO` | `true` |
| Pré-seleção automática do default (D3) | — | **nenhum evento** | inalterado (`false`) |
| Retomada de rascunho/DAV com `vendedorCodigo` salvo (D4) | — | **nenhum evento** — o vendedor já vinha registrado na venda, não é uma escolha desta sessão | inalterado (`false`) |

**Rationale**: Mesma filosofia já estabelecida por D11 (`specs/003.../research.md`) e D9 (`specs/005.../research.md`): só a ação do operador nesta sessão gera evento; pré-seleção automática (default, rascunho, DAV) reflete estado que já existia, não uma decisão tomada agora.

**Alternatives considered**:
- *Disparar `VENDEDOR_SELECIONADO` também na retomada de rascunho*: rejeitado — o vendedor não foi selecionado nesta sessão, é o mesmo já gravado; registrar como "selecionado" distorceria o histórico de auditoria da venda.

---

## Achados desta fase, já promovidos a AD

| # | Achado | AD | Resolução |
|---|---|---|---|
| A1 | `GetListaVendedores` não tem parâmetro de status nem campo `Ativo`/`Status` na resposta; a coluna "subtítulo de função" da UI também não tem campo correspondente — mesma lacuna já confirmada para cliente (`AD-093`) | **AD-103** | Removido do design/spec desta tela — decisão de design, sem pendência ao ERP |

Nada bloqueia `/speckit-tasks` — a feature é implementável hoje sem nenhuma pendência aberta. (Nota: `identificacao-cadastro-cliente` chegou a carregar `AD-094` como pendência bloqueante; ela foi **fechada em 2026-08-31 por `AD-108`**.)
