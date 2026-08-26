# Phase 0 — Research: Carrinho, Busca/Inserção de Produto e Motor de Precificação

**Feature**: `specs/003-carrinho-produto-precificacao/` | **Date**: 2026-08-26

Este documento resolve as incógnitas técnicas do Technical Context de `plan.md`. A maior parte do espaço de decisão desta feature **já estava fechado** em `.specs/project/STATE.md` (AD-023 a AD-076) e em `.specs/features/carrinho-produto-precificacao/spec.md` — a tabela de Requirement Traceability daquela spec registra 10 de 10 requisitos `Verified` e 0 edge cases bloqueantes. Portanto, as decisões abaixo dividem-se em duas naturezas, sinalizadas explicitamente:

- **Confirmação** — a decisão já existia; aqui só se registra como ela se materializa em código.
- **Nova** — decisão de design tomada nesta fase, porque a spec não a determinava. Estas são candidatas a virar AD em `.specs/project/STATE.md` e estão listadas em "Achados a promover" no fim do documento.

---

## D1 — O modal de busca é um seletor de código; `GetProduto` é sempre quem resolve a linha

**Natureza**: Nova (corrige uma leitura otimista da documentação de domínio).

**Decision**: Ao selecionar um candidato no modal de busca, o Checkout **não** monta a linha a partir do resultado de `GetListaProdutos`. Ele usa apenas o `CodigoProduto` do candidato e faz uma chamada a `GET /api/erp/GetProduto` para esse código — exatamente o mesmo caminho da inserção direta por código bipado (`CART-02`). O resultado de `GetListaProdutos` serve para exibir a lista (descrição, referência, código de barras, UDM) e para escolher, nada mais.

**Rationale**: Inspeção direta de `Fluxograma - Diagrama - Alinhamentos/APICentriumOAuth.yaml` mostra que o schema de retorno da busca, `CheckoutListaProdutos.Produtos_Produtos` (linhas 1182-1261), **não possui**:

- `PrecoVenda` — o campo único que carrega o preço já resolvido pelo ERP, obrigatório para todo `TipoPreco` diferente de `8` (AD-059/AD-060). A lista só traz `PrecoVenda1..PrecoVenda5`.
- `ProdutoPesavelEditavel` — o campo que decide simultaneamente pesável e editável ao TAB (AD-063/AD-070), presente apenas em `SDTCheckout_GetProduto` (linha 1348).

Além disso, `/GetListaProdutos` aceita somente `Empresa`, `Txtbusca`, `Pagina` e `Tamanhopagina` (linhas 153-177) — não aceita `Tipopreco`, `Codcliente` nem `Listapreco`, que `/GetProduto` aceita (linhas 197-233). Ou seja, a busca é estruturalmente incapaz de devolver um preço contextualizado pela sessão e pelo cliente. Montar a linha a partir dela produziria preço errado sempre que `TipoPreco ∉ {1..5}` e quebraria o fluxo de produto pesável/editável por falta da flag.

**Impacto na documentação de domínio**: `.specs/project/STATE.md:248` e `.specs/codebase/ARCHITECTURE.md` afirmam que `PrecoVenda` vem "de `GetProduto`/`GetListaProdutos`" — a segunda metade dessa afirmação não se sustenta contra o contrato atual. Ver "Achados a promover", A1.

**Alternatives considered**:
- *Montar a linha direto do resultado da busca quando `TipoPreco ∈ {1..5}`*: rejeitado — cria dois caminhos de inserção com semânticas diferentes, viola Single Responsibility e torna o comportamento dependente de uma configuração de tenant, o tipo exato de acoplamento que a Constitution II proíbe.
- *Pedir ao ERP que `GetListaProdutos` passe a devolver `PrecoVenda`*: seria a solução ideal a médio prazo, mas cria dependência de mudança de contrato para uma feature MVP. A chamada extra a `GetProduto` na seleção é barata (uma por item inserido, cacheada por SKU depois disso) e mantém o Checkout funcional com o contrato de hoje.

---

## D2 — `TipoPreco = 8` é a única regra de preço calculada localmente

**Natureza**: Confirmação (AD-025, AD-059, AD-060).

**Decision**: `resolvePrecoUnitario` tem exatamente dois ramos:

| `SessaoUsuario.TipoPreco` | Origem do preço unitário |
|---|---|
| `1`–`7`, `9`, `10`, `11` | Campo único `PrecoVenda` de `SDTCheckout_GetProduto`, aplicado tal como veio. Nenhuma indexação, nenhuma leitura de `PrecoVendaLista`, nenhuma lógica adicional. |
| `8` | Cálculo local de faixa: escolhe entre `PrecoVenda1..PrecoVenda5` conforme a quantidade agregada do SKU na venda inteira, comparada aos limiares `QtdMinimaPreco2..QtdMinimaPreco5`. |

**Rationale**: O ERP resolve internamente qual regra vale (índice, lista do cliente, custo, última venda, cliente×produto, índice) e devolve o resultado pronto em `PrecoVenda` — o Checkout não reimplementa essa seleção (Constitution III). O caso `8` é a única exceção legítima, e não por escolha do Checkout: a faixa depende da **quantidade agregada do SKU no carrinho**, que é estado que só existe no Checkout. O ERP não tem como resolvê-la por item isolado. Isso é delegação, não duplicação de fonte de verdade.

**Alternatives considered**:
- *Rechamar `GetProduto` a cada mudança de quantidade, passando a quantidade acumulada*: rejeitado — o contrato de `/GetProduto` não tem parâmetro de quantidade, e mesmo que tivesse, tornaria cada tecla de quantidade uma ida à rede, inviável no ritmo de um PDV.

---

## D3 — Linha congelada não entra na quantidade agregada do SKU

**Natureza**: Nova (a spec resolve metade da questão; esta decisão fecha a outra metade).

**Decision**: Uma linha com `precoCongelado: true` (origem rascunho de NFCe ou DAV importado, AD-067) é excluída de **duas** coisas: (a) do conjunto que `repricarSku` recalcula — isto já estava decidido — e (b) do somatório da quantidade agregada que determina qual faixa vale para as demais linhas do mesmo SKU. Ela continua contando normalmente nos **totais monetários** da venda, com o preço que trouxe.

**Rationale**: AD-067 decidiu (a) porque a linha congelada nunca recebeu `PrecoVenda1..5`/`QtdMinimaPreco2..5` — esses campos só vêm de `GetProduto`/`GetListaProdutos`, não de `CarregarNFCe`/`GetDAV`. A spec não diz o que fazer em (b), mas a resposta é forçada pela mesma razão: se a linha congelada contasse para o agregado, ela empurraria as linhas ativas para uma faixa superior **sem receber esse preço de volta**, produzindo duas linhas do mesmo SKU com preços divergentes por um motivo invisível ao operador. Incluí-la no agregado degrada `SC-001` sem nenhum ganho; excluí-la mantém o agregado coerente com o conjunto de linhas que ele governa.

**Consequência sobre `SC-001`**: o critério "o preço aplicado nunca diverge entre linhas do mesmo produto na mesma venda" passa a ser lido como *entre linhas ativas não-congeladas*. Divergência entre uma linha congelada e uma linha nova do mesmo SKU é comportamento **esperado e correto** (`FR-017`), não uma violação — o teste de aceitação precisa refletir isso.

**Alternatives considered**:
- *Contar a linha congelada no agregado*: rejeitado pelo motivo acima.
- *Descongelar a linha automaticamente quando um novo item do mesmo SKU entra*: rejeitado — contraria `FR-017` diretamente, que exige que o preço só descongele por ação explícita do operador (reinserção ou edição).

---

## D4 — Representação numérica: `Centavos` e `Milesimos`, ambos inteiros e branded

**Natureza**: Nova quanto à forma; confirmação quanto ao princípio (AD-071, AD-072, Constitution V).

**Decision**: Dois tipos branded no domínio:

- `Centavos = number & { readonly __brand: 'Centavos' }` — todo valor monetário. Conversão na fronteira Zod: `Math.round(valorDouble * 100)`.
- `Milesimos = number & { readonly __brand: 'Milesimos' }` — toda quantidade, inteira ou fracionária. Conversão: `Math.round(quantidade * 1000)`. Três casas cobrem a precisão exigida pela fórmula de produto pesável (AD-076, `round(..., 3)`).

Total de linha: `arredondar(precoCentavos × quantidadeMilesimos ÷ 1000)`. Rateios que não fecham em centavo exato usam `distribuirPorMaiorResto` (AD-072).

**Rationale**: O ERP entrega preços como `number/format: double` no JSON. Se esses valores circularem como `double` dentro do domínio, o primeiro `preco * quantidade` já introduz erro de ponto flutuante — exatamente o que a Constitution V proíbe, e cujo custo aqui é discrepância fiscal em NFCe, não bug de UI. Converter **na fronteira Zod** garante que nenhum `double` de preço atravessa para dentro. Os branded types impedem, em compile-time, passar um `number` cru (ex.: reais) onde se espera centavos — erro que um `type Centavos = number` simples não pegaria. `dinero.js` foi descartado em AD-071 por ser desproporcional às regras já mapeadas.

**Alternatives considered**:
- *`bigint`*: rejeitado — desnecessário na faixa de valores de um cupom fiscal (`Number.MAX_SAFE_INTEGER` cobre folgadamente) e atritaria com serialização JSON no payload de `FaturarNFCe`.
- *Quantidade como `number` decimal*: rejeitado — `0.1 + 0.2` na quantidade agregada quebraria a comparação com os limiares de faixa, que é justamente a decisão crítica de `TipoPreco = 8`.

---

## D5 — Chave e ciclo de vida do cache de produto

**Natureza**: Confirmação (`CART-03`, `.specs/codebase/ARCHITECTURE.md`) com a chave detalhada nesta fase.

**Decision**: `queryKey: ['produto', codigoProduto, tipoCodProduto, tipoPreco, listaPreco ?? null]`, com `staleTime: Infinity` e `gcTime` longo o bastante para durar a venda. O cache inteiro é invalidado (`queryClient.removeQueries({ queryKey: ['produto'] })`) em dois momentos e só neles: finalização e suspensão da venda.

`listaPreco` entra na chave porque, em `TipoPreco = 9`, trocar o cliente muda o preço do mesmo código (`FR-018`, AD-043) — sem isso, o cache devolveria o preço do cliente anterior.

**Rationale**: `staleTime: Infinity` dentro da venda é o que garante `CART-03` (reinserir o mesmo SKU não gera chamada) e, mais importante, o que impede que o mesmo SKU rebuscado no meio da venda produza linhas com preços de tabelas divergentes. A única fronteira de frescor é o fim da venda — regra já escrita em `.specs/codebase/ARCHITECTURE.md`.

**Nota de robustez**: mesmo com o cache, `repricarSku` **nunca** o consulta (`CART-05`, AC5) — ele opera sobre o snapshot copiado para dentro da linha. O cache é otimização de rede, não fonte de dado para cálculo.

---

## D6 — Ordem de validação do código bipado

**Natureza**: Confirmação (AD-028, AD-029, AD-076), com a ordem de precedência definida nesta fase.

**Decision**: `interpretarEntradaCodigo(texto)` classifica a entrada nesta ordem:

1. Contém `*` → formato `codigo*quantidade` (AD-029). Parte antes do `*` é o código; parte depois é a quantidade. Digitação manual.
2. 13 dígitos **e** começa com `2` **e** dígito verificador EAN-13 válido → código de balança (AD-076). Extrai código reduzido (posições 2-7) e valor da etiqueta (posições 8-12 ÷ 100).
3. Caso contrário → código simples, quantidade `1`.

O DV do EAN-13 é validado antes de aceitar o ramo 2. Se o DV falhar, a entrada cai no ramo 3 (código simples) em vez de ser rejeitada — um código de 13 dígitos iniciado em `2` que não passa no DV não é necessariamente inválido, pode ser um código interno legítimo do tenant.

**Rationale**: `*` é digitação manual deliberada do operador e não pode colidir com nenhum formato de código bipado; por isso vem primeiro. O ramo 2 é o formato de balança confirmado por inspeção do código-fonte real do ERP (`PAnalisaCodigoProduto`, AD-076). A quantidade do produto pesável é `round(trunc(valorEtiqueta / PrecoVenda, 5), 3)`, e quando `PrecoVenda` não está informado no ERP a inserção é **bloqueada com aviso ao operador** (`FR-013`) — nunca inserida com quantidade indefinida, mesma validação que o ERP já aplica hoje.

**Alternatives considered**:
- *Rejeitar código de 13 dígitos com DV inválido*: rejeitado — transformaria um código interno do tenant em erro de operação.

---

## D7 — `ProdutoPesavelEditavel` decide o fluxo de inserção

**Natureza**: Confirmação (AD-027, AD-063, AD-070).

**Decision**: Um único `switch` sobre o valor string, com os quatro valores discretos confirmados:

| Valor | Significado | Comportamento na inserção |
|---|---|---|
| `'S'` | Pesável, leitura na etiqueta | Quantidade e preço vêm do código de barras (D6). Linha entra direto, campos somente-leitura. |
| `'B'` | Pesável, leitura na balança | Idem `'S'`. |
| `''` | Não pesável, não editável | Linha entra direto na grid no mesmo TAB, com `preço`/`unidade`/`quantidade`/`desconto` somente-leitura (`FR-015`). |
| `'E'` | Não pesável, editável | Linha **não** entra ainda; o foco pula para os campos editáveis e a linha só é inserida quando o operador aciona o botão `+` (`FR-014`). Não há inserção automática ao terminar de editar. |

**Rationale**: AD-070 confirmou estruturalmente que pesável e editável são mutuamente exclusivos — é um único campo string entre 4 valores discretos, não dois booleanos combináveis. Isso permite modelar como união discriminada exaustiva em TypeScript (`never` no ramo default), sem estados impossíveis. Um produto pesável nunca passa pelo fluxo de edição manual, já que preço e peso vêm da etiqueta/balança.

---

## D8 — Bloqueio pós-pagamento entra por predicado injetado

**Natureza**: Nova quanto à forma; confirmação quanto à regra (AD-030, `CART-09`).

**Decision**: `carrinhoSlice` não importa nem conhece o slice de pagamento. As actions `editarItem` e `cancelarItem` consultam um predicado `podeMutarCarrinho(): boolean`, fornecido na composição do `vendaStore`. A feature 008 (pagamento) é quem implementa esse predicado com a regra real: bloqueado a partir de qualquer pagamento aprovado; permanente para TEF/PIX (sem fluxo de cancelamento no ERP); reversível para dinheiro e cartão manual não integrado, cuja remoção reabilita a edição.

**Rationale**: Dependency Inversion (Constitution II). Se o carrinho importasse o slice de pagamento, qualquer mudança na política de pagamento forçaria mudança no carrinho, e o teste unitário do carrinho passaria a exigir montar estado de pagamento. Com o predicado, o teste injeta `() => false` e verifica o bloqueio em uma linha. Split de pagamento não muda nada aqui — a mesma regra única se aplica com uma ou várias formas (`FR-010`, AD-036).

**Alternatives considered**:
- *Checar `vendaStore.pagamentos.length` dentro do carrinho*: rejeitado — acopla o carrinho ao formato interno do slice de pagamento e espalha a regra de reversibilidade TEF/PIX por duas features.

---

## D9 — Desconto de convênio é fator percentual aplicado no cálculo da linha

**Natureza**: Confirmação (AD-023).

**Decision**: Quando o cliente da venda tem `DescontoConvenio` (campo `number/double` em `SDTCheckout_GetCliente`, linha 1067 do yaml), o preço aplicado à linha recebe o fator `(1 - DescontoConvenio / 100)`, calculado em centavos com arredondamento por linha. Aplicação automática, sem entrada manual do operador.

**Rationale**: `PGeraPedidoVenda` na KB do GenExus calcula `&ConvDsc = (1 - CliConvDsc / 100)` — é fator percentual confirmado, não valor absoluto. Trocar o cliente da venda muda esse fator, portanto a troca de cliente dispara reprecificação (`FR-018`), pelo mesmo caminho de `TipoPreco = 9`.

**Nota de fronteira**: a origem do dado do cliente é a feature 005 (`identificacao-cadastro-cliente`). Este plano consome `DescontoConvenio` e `ListaPreco` do cliente já selecionado; não implementa a seleção.

---

## D10 — `TipoPreco = 9` sem lista de preço no cliente: lacuna de contrato

**Natureza**: Nova (pendência identificada nesta fase).

**Decision**: Implementar o caminho principal — quando `TipoPreco = 9` e o cliente tem `ListaPreco` preenchido, enviar esse valor no parâmetro `Listapreco` de `GetProduto`. Para `TipoPreco ≠ 9`, **não** enviar nada nesse parâmetro (regra de negócio confirmada em 2026-08-24). O ramo "cliente sem lista própria" fica registrado como pendência, com fallback definido abaixo.

**Problema**: `.specs/codebase/CONCERNS.md:118` e `.specs/project/STATE.md:248` instruem, para o caso de cliente sem lista própria, a usar a lista padrão da empresa "carregada em `SessaoUsuario.listaPrecoPadrao`". **Esse campo não existe em `APICentriumOAuth.yaml`.** O schema `SessaoUsuario` (linhas 799-864) contém `TipoPreco`, `QtdMinCharParaConsulta`, `UsuarioTipoCodigoProduto`, `CadMaqCod`, `CadSerieNFCe` e demais, mas nenhum campo de lista de preço padrão — busca por `listaPrecoPadrao`/`ListaPrecoPadrao` no yaml não retorna nenhuma ocorrência.

**Fallback adotado enquanto a pendência não é resolvida**: omitir o parâmetro `Listapreco` na chamada, deixando o ERP aplicar o padrão que ele já usa internamente. Isso é consistente com o resto da decisão (o ERP resolve o preço e devolve em `PrecoVenda`) e não inventa um valor no Checkout. É explicitamente um fallback, não a solução final. Ver "Achados a promover", A2.

---

## D11 — Pontos de disparo de auditoria

**Natureza**: Confirmação (AD-061, AD-062; contrato em `specs/001-auditoria-acoes-operador/contracts/auditoria-events.md`).

**Decision**: `carrinhoSlice` chama `registrarEventoAuditoria(...)` em três pontos, usando as factory functions tipadas de `src/client/domain/auditoria/eventos.ts`:

| Ação | Evento | `detalhes` |
|---|---|---|
| Linha efetivamente inserida | `PRODUTO_INSERIDO` | `{ codigoProduto, quantidade, precoUnitario, desconto }` — `precoUnitario`/`desconto` em centavos inteiros |
| Campo de linha editado | `PRODUTO_ALTERADO` | `{ codigoProduto, campo, valorAnterior, valorNovo }` |
| Linha cancelada | `PRODUTO_CANCELADO` | `{ codigoProduto }` |

Uma reprecificação automática **não** gera evento — só a ação do operador gera. Caso contrário, cruzar uma faixa com 5 linhas do mesmo SKU produziria 5 eventos `PRODUTO_ALTERADO` que o operador não causou diretamente, poluindo o log que vai no campo `Log` de `FaturarNFCe`.

**Rationale**: AD-062 substituiu o campo dedicado `produtoCancelado` no SDT pelo evento no log geral. O log é uma trilha de **ações do operador**, não um diário de mutações de estado — a interceptação genérica de mutações Zustand foi explicitamente rejeitada em AD-061.

---

## D12 — Identidade de linha: `idLinha`, não `codigoProduto`

**Natureza**: Nova (decisão de modelagem).

**Decision**: Cada linha do carrinho tem um `idLinha` próprio (string, gerado com `crypto.randomUUID()`), independente do `codigoProduto`. Todas as actions que atuam sobre uma linha específica (`editarItem`, `cancelarItem`) recebem `idLinha`; `repricarSku` recebe `codigoProduto`.

**Rationale**: O mesmo SKU pode legitimamente ocupar várias linhas na mesma venda — a spec exige isso explicitamente (`FR-006` fala em "todas as unidades desse produto na venda", `CART-03` em reinserção do mesmo SKU). Sem identidade própria de linha, cancelar "o produto X" seria ambíguo entre as linhas, e uma linha congelada de rascunho conviveria com uma linha ativa do mesmo SKU sem forma de distingui-las. Esta é a distinção que faz `repricarSku(sku)` e `cancelarItem(idLinha)` serem operações de granularidade diferente, como a spec descreve.

---

## Achados a promover a AD em `.specs/project/STATE.md`

Estes dois pontos foram descobertos nesta fase, contradizem ou completam documentação de domínio existente, e devem ser registrados como decisão arquitetural numerada antes de `/speckit-tasks`:

| # | Achado | Documento afetado | Ação sugerida |
|---|---|---|---|
| A1 | `GetListaProdutos` não devolve `PrecoVenda` nem `ProdutoPesavelEditavel`, e não aceita `Tipopreco`/`Codcliente`/`Listapreco` — a busca é seletor de código, e `GetProduto` é sempre quem resolve a linha (D1) | `.specs/project/STATE.md:248` e `.specs/codebase/ARCHITECTURE.md` afirmam que `PrecoVenda` vem de "`GetProduto`/`GetListaProdutos`" | Corrigir **no ponto do texto**, não por nota anexada ao fim do parágrafo (regra de `docs/agents/domain.md`) |
| A2 | `SessaoUsuario.listaPrecoPadrao` não existe no `APICentriumOAuth.yaml` — o fallback de `TipoPreco = 9` para cliente sem lista própria não tem campo de origem (D10) | `.specs/codebase/CONCERNS.md:118`, `.specs/project/STATE.md:248` | Abrir item em `.specs/project/PENDENCIES.md` (seção 1, confirmação com a equipe do ERP) e registrar o fallback de D10 como comportamento interino |

Nenhum dos dois bloqueia `/speckit-tasks`: A1 já está resolvido por decisão de design neste plano, e A2 tem fallback definido que não impede a implementação do caminho principal.
