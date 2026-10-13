# Research: Motor de desconto do Checkout (capa e item)

**Feature**: [spec.md](./spec.md) | **Data**: 2026-10-13

Cada decisão abaixo foi tomada lendo o código vigente (`src/`), não a documentação. Onde a documentação e o código divergem, o código venceu e a divergência está dita.

## D1. Como a linha guarda preço e desconto vinculados

**Decisão**: a linha **não ganha campo novo**. `precoUnitario` guarda o preço de referência (o de tabela) e `descontoManual` guarda o desconto, absoluto sobre o total da linha. O preço que o operador vê na barra é derivado: `precoUnitario − desconto ÷ quantidade`.

**Por quê**: é o único desenho em que o ERP continua recebendo o desconto explícito. O pedido é que o ERP "some com o desconto dado individualmente por item"; se a linha guardasse o preço já líquido, `DescontoValor` sairia zero e o desconto de item desapareceria do documento. Também mantém intactos `totalLinha`, `totalBruto`, o payload, a importação de DAV e a auditoria, que já tratam os dois campos separados.

**Alternativas rejeitadas**:
- *Guardar o preço líquido e `desconto = 0`*: perde o desconto no documento fiscal.
- *Campo novo `precoPraticado` na linha*: três verdades (`precoUnitario`, `precoPraticado`, `descontoManual`) que precisam ser mantidas coerentes à mão — exatamente o defeito que a feature remove.

**Referência do "preço original"**: sempre `snapshot.precoBase` (o `PrecoVenda` do ERP no momento da inserção). Preço digitado **acima** dele não gera desconto: vira o `precoUnitario` da linha com `descontoManual = 0`. Um desconto digitado depois sempre parte do `precoBase`, nunca do preço elevado — fixar a referência evita que ela "ande" conforme o operador digita.

## D2. O vínculo só existe onde o preço é do operador

**Decisão**: o vínculo vale para produto `'E'` com `precoBase > 0`. Em qualquer outro caso preço e desconto seguem como hoje.

**Por quê** (lido em `reprecificacao.ts:102-115` e `EntradaRapidaProduto.tsx:455-460`): em produto `'S'`, `'B'` ou `''` preço e desconto são somente leitura — o preço vem da tabela e `repricarSku` o reescreve. Só `'E'` tem campo digitável, e é nele que `repricarSku` preserva o preço do operador. O `'E'` é o tipo dominante no tenant medido (191 de 195 produtos, AD-223), e **80 deles têm `PrecoVenda > 0`** — não é caso raro. Os 111 restantes têm preço zero: sem referência, não há desconto a derivar, e vale a regra FR-005 da spec.

**Consequência para linhas importadas**: `mapearVendaExistente.ts` grava `pesavelEditavel: ''` nas linhas de DAV/NFCe, então elas nunca entram no vínculo nem no preço mínimo. Isso é intencional — o documento já foi aceito pelo ERP.

## D3. Aritmética: a divisão desconto ÷ quantidade precisa de função própria

**Decisão**: exportar `dividirPorQuantidade(valor: Centavos, quantidade: Milesimos): Centavos` em `dinheiro.ts`, com arredondamento meio-para-longe-de-zero.

**Por quê**: `dinheiro.ts` já tem `dividirArredondando` (`multiplicarPorQuantidade` o usa na linha 77), mas ele é privado, e a derivação `preço = referência − desconto ÷ quantidade` precisa da operação inversa. Reimplementar a divisão num componente seria o "cálculo monetário solto" que a Constitution V proíbe. Aritmética inteira, sem ponto flutuante.

**Limite conhecido** (spec, Edge Cases): desconto R$ 1,00 numa linha de 3 unidades dá preço unitário com fração de centavo, e o preço exibido é arredondado. A fonte da verdade é o **desconto total**; o preço exibido é derivado e nunca volta como entrada do desconto (ver D4).

## D4. Na barra, o último campo editado é o mestre

**Decisão**: a barra guarda qual campo o operador editou por último (`'PRECO' | 'DESCONTO'`) e só recalcula o **outro**. Sair de um campo nunca recalcula o campo em que se está saindo.

**Por quê**: sem isso, o arredondamento de D3 vira laço. Operador digita desconto R$ 1,00 (qtd 3) → preço exibido R$ 19,67 → ao sair do preço, a barra recalcula o desconto como (20 − 19,67) × 3 = R$ 0,99. O desconto digitado se perde sem aviso. Com mestre explícito, o desconto continua R$ 1,00.

**Mudança de quantidade**: preserva o **preço exibido** e recalcula o desconto total (FR-004). Se o mestre era o desconto e a divisão não era exata, o desconto muda por até 1 centavo por unidade — aceito e documentado; o total da linha segue exato porque é calculado pelo domínio.

**Onde vive**: hook novo `useVinculoPrecoDesconto` ao lado de `EntradaRapidaProduto.tsx`, não dentro dele. O componente tem 1964 linhas e a Constitution II manda decompor o que tem mais de uma razão para mudar; este estado tem regra própria e é testável sem renderizar a barra.

## D5. Edição atômica: `atualizarItem` substitui três chamadas de `editarItem`

**Decisão**: nova ação `atualizarItem(idLinha, { quantidade, precoUnitario, descontoManual }) → boolean` no `carrinhoSlice`. Valida o conjunto resultante (desconto zera a linha, preço mínimo), grava uma única vez e devolve se aplicou.

**Por quê** (`useCarrinho.ts:790-813`, `carrinhoSlice.ts:355-408`): `confirmarEdicaoDeLinha` chama `editarItem` três vezes, e cada uma valida sozinha. Exemplo real: linha 10 × R$ 10,00 com desconto R$ 50,00; operador muda preço para R$ 5,00 e desconto para R$ 20,00. O passo do preço é recusado (bruto 50 − desconto 50 = 0), o passo do desconto passa, e a linha fica com preço 10 e desconto 20 — nem o que estava, nem o que ele digitou. Além disso o hook devolve `'confirmado'` **sempre**, e a barra se limpa mesmo com a edição recusada.

Com o ajuste automático da feature, isso pioraria: o desconto passaria a ser reescrito pelo slice no meio da sequência. A atomicidade deixa de ser melhoria e vira pré-requisito.

`editarItem` **continua** (outros chamadores e a auditoria por campo). `atualizarItem` audita por campo, igual a ele, para o `Log` manter o formato que o ERP já recebe.

## D6. `PrecoMinimo` entra no snapshot, como campo obrigatório

**Decisão**: `SnapshotPrecoProduto.precoMinimo: Centavos`, com `0` significando "sem mínimo". Declarado em `produto.schema.ts` e mapeado em `paraSnapshotPrecoProduto`.

**Por quê**: o campo existe em `SDTCheckout_GetProduto` (`ApiCentriumOAuth.yaml:1421`) e hoje atravessa o `looseObject` sem ser lido. O `tasks.md` T004 da 003 dizia convertê-lo, e o código nunca o fez — divergência a corrigir, e a corrigir **na fronteira Zod** (Constitution IV), não no mapper.

**Obrigatório e não opcional**: opcional aceitaria `undefined` em fixtures esquecidas e transformaria "sem mínimo" em "não sei". O custo é varrer as fixtures de teste que montam snapshot literal; o compilador as aponta.

**`GetListaProdutos` não traz preço nenhum** (AD-091), então o mínimo só chega por `GetProduto`, que já é a única fonte do snapshot. Nada a mudar na busca.

## D7. O preço mínimo é imposto na barra e no slice — e o aviso sai de um só lugar por vez

**Decisão**: a barra ajusta o desconto no ato (ao sair do campo ou confirmar) e avisa. O slice repete a regra como rede de segurança e só avisa se **ainda** precisar ajustar.

**Por quê**: AD-153 já estabeleceu que guarda de desconto sobe da UI para o slice. Se os dois avisassem sempre, o operador veria dois toasts para uma ocorrência (FR-013). Como a barra entrega ao slice um valor já dentro do limite, o slice fica calado no caso normal e só fala quando outro chamador (importação, teste, futuro atalho) passa um valor fora.

**Ajustar, não recusar**: é o que o usuário pediu ("automaticamente deve alterar o valor para o limiar"). Diferente de `descontoZeraALinha`, que **recusa** — ali não existe valor intermediário sensato.

**Limite**: `desconto ≤ (precoUnitario − precoMinimo) × quantidade`, em totais, não por unidade — comparar totais evita a divisão não exata de D3.

## D8. Capa: o teto é do slice, e é ajuste, não recusa

**Decisão**: `aplicarDescontoCapa` consulta `condicaoSelecionada.descontoMaximo`. Acima do teto, **ajusta ao teto** e avisa; teto zero **recusa** com explicação própria.

**Por quê** (`ControleDescontoCapa.tsx:246-305`, AD-278): o controle grava a cada tecla. Digitar "10" passa por "1", que é uma capa válida e é gravada. Com **recusa**, "voltar ao último valor válido" restauraria o 1% de passagem, não os 7% que o operador tinha antes de começar a digitar. Para devolver os 7% seria preciso guardar um retrato no foco do campo — estado novo para um caso que o ajuste resolve sem estado. Com **ajuste ao teto**, "10" vira 8% e o operador entende o limite na hora. É também o mesmo tratamento do preço mínimo (D7), o que mantém o produto coerente.

**Isto corrige a primeira redação da spec** (FR-016 e US3 cenário 2 diziam "recusada e volta ao último valor válido"); a spec foi reescrita no ponto, sem anexo.

**Teto zero recusa** porque não há valor ao qual ajustar além de zero, e o operador precisa saber **por quê** o campo não aceita nada (`CONDICAO_SEM_DESCONTO`, bloqueio explicativo de `lib/bloqueio.ts`).

**Comparação em centavos**: `valorResolvido > aplicarPercentual(subtotal, descontoMaximo)`. Percentual contra percentual e valor contra valor produziriam respostas diferentes para o mesmo desconto por causa do arredondamento; centavos contra centavos, não.

## D9. Capa automática: onde e quando

**Decisão**: `selecionarCondicao` grava a condição **e** a capa no mesmo `set`. Capa nova = `PERCENTUAL` com `min(desconto, descontoMaximo)`; descarta qualquer capa anterior (FR-019).

**Por quê**: já é a ação que muda a condição e a única que a muda com pagamento recusado (`pagamentosVivos() > 0`, linha 783). Pôr a regra aqui faz o desconto automático herdar a recusa de graça. Um `set` só evita um quadro com condição nova e capa velha.

**A capa é estável porque o carrinho já congelou**: escolher a condição congela o carrinho (AD-152, `podeMutarCarrinho`), então `valorResolvido` — fotografia em centavos no momento da aplicação — não envelhece.

**Fora do escopo**: `importarCondicaoPagamento` (documento importado, AD-171) **não** passa por `selecionarCondicao` e não aplica capa automática — a condição de um DAV é o replay do documento, não uma declaração do operador. O teto dessa condição, porém, **vale** para a capa que o operador digitar depois. Risco anotado em `plan.md`.

**`entrada` com mais de 1 casa decimal**: o ERP pode cadastrar 3,25%; o campo do operador aceita 1 casa. A capa automática grava a entrada exata do ERP. O campo deve **exibi-la inteira**, e só rejeitar casas extras na digitação.

## D10. Auditoria da capa: um evento por confirmação, não por tecla

**Decisão**: novo evento `DESCONTO_CAPA_APLICADO` (`origem`, `modo`, `entrada`, `valor`), emitido pela chamada **não silenciosa** (saída do campo, Enter, troca de modo) e pela capa automática de `selecionarCondicao`; deduplicado contra o **último `DESCONTO_CAPA_APLICADO` em `eventos`** (seletor puro em `domain/auditoria/eventos.ts`).

**Por que a dedup lê o `Log` e não guarda uma variável no slice**: o store é um só e a venda reinicia, mas uma closure do slice sobreviveria à venda. Na venda seguinte, a mesma capa (muito comum: a mesma condição de 5%) seria igual à "última auditada" e **não geraria evento** — violando FR-025 a partir da 2ª venda. `eventos` é zerado por venda, então a dedup herda o escopo certo sem estado novo.

**Por quê**: o comentário em `ControleDescontoCapa.tsx:364-370` diz que "a aplicação não audita (a 004 audita na finalização)". Verifiquei: **não existe nenhum evento de capa** em `eventos.ts` — a 004 não audita capa, só envia. FR-025 exige o registro da origem, então o evento tem de nascer. Emitir por tecla (a capa grava a cada tecla desde AD-278) poluiria o `Log` que vai inteiro ao ERP; a chamada não silenciosa já existe e já é o "número completo" do operador.

**Custo**: o catálogo passa de 20 para 21 tipos, e `specs/001-auditoria-acoes-operador/contracts/auditoria-events.md` precisa ser atualizado.

## D11. A chave de virada viaja pelo bootstrap

**Decisão**: `DESCONTO_CAPA_NO_ERP` (variável do BFF, padrão `false`) → `Env.descontoCapaNoErp` → `GET /api/bootstrap` devolve `recursos: { descontoCapaNoErp }` → `sessionStore.registro` → `PagamentoDeps.descontoCapaNoErp()`.

**Registro guardado e ETag (corrigido em 2026-10-13)**: o Dexie **não** reparseia o registro ao ler. `bootstrapClient.ts` devolve o registro guardado sem validar quando o servidor responde 304 (linhas 133-136) ou quando o hash coincide (176-177). O `default` do schema só age sobre payload **recém-buscado**. O que impede um registro anterior ao campo de ser reaproveitado é o hash: como `recursos` entra no corpo, o hash muda e o servidor responde 200, e o registro novo substitui o velho. Efeito colateral esperado: na primeira carga depois do deploy **todas** as empresas rebaixam o bootstrap (~5 MB) uma vez.

**Por quê**: não existe hoje nenhum canal BFF → cliente para chave de comportamento (varri `process.env` e `import.meta.env` em `src/`: o cliente não lê nenhum). O bootstrap é a única leitura de partida da SPA, e seu ETag é o hash do corpo (`calcularVersionHash(validado.data)`, `bootstrap.ts:136`) — então a chave entra no hash e a SPA descarta o cache do Dexie sozinha quando ela muda. Sem trabalho extra de invalidação.

**Padrão já usado**: `capacidadesDoBootstrap()` (`vendaStore.ts:204`) lê `registro` de forma síncrona pelo mesmo motivo — a decisão acontece dentro de uma ação e não pode esperar rede. Mesmo desfecho seguro: sem bootstrap, a chave vale `false` (comportamento atual).

**Alternativas rejeitadas**:
- *BFF reescreve o corpo de `FaturarNFCe`* (some o rateio e põe o campo): o BFF "MUST NOT crescer para conter lógica de negócio" (Constitution, Additional Constraints), e o corpo reescrito deixaria de ser o que a validação prévia enviou — quebra a invariante I5 da 014.
- *Endpoint `/api/config` separado*: segunda ida à rede na partida e segundo cache a invalidar, para um booleano.
- *Flag de build do Vite (`import.meta.env`)*: a imagem Docker é uma só para todos os tenants; virar a chave exigiria rebuild e redeploy, e não daria loja piloto.

## D12. O retrato recebe a capa como união discriminada

**Decisão**: `montarRetratoVenda` troca o 4º parâmetro `rateioDescontoCapa: Map` por `descontoCapa: DescontoCapaNoRetrato`, uma união `{ tipo: 'RATEADA', rateio }` | `{ tipo: 'NO_CABECALHO', valor }`. `montarPagamentosParaPayload()` devolve essa união já decidida pela chave.

**Por quê**: dois parâmetros opcionais (rateio e valor de cabeçalho) deixariam representável o estado "os dois", em que o desconto seria contado duas vezes. A união torna esse estado impossível por construção. E como **uma única função** decide, o retrato validado (014) e o emitido continuam idênticos (I5) — `validacaoDepsPadrao.rateioDescontoCapa` e `useFinalizarOuSuspenderVenda` apenas repassam.

**Chave desligada**: o campo `DescontoCapaValor` **não aparece** no objeto (nem como zero), para o documento ficar byte a byte igual ao de hoje (SC-007). **Ligada**: sempre presente, zero quando não há capa — o ERP que ligou a chave já lê o campo, e ausência vs. zero seria uma ambiguidade a mais.

## D13. `ZERA_UM_ITEM` com a chave ligada

**Decisão**: com a chave ligada, o slice passa `linhas = []` a `recusaDoDescontoCapa`, que então só avalia `ZERA_A_VENDA` (`descontoCapa.ts:109-111`: com lista vazia a função devolve `null` depois da primeira regra). Nenhuma assinatura muda.

**Por quê**: `ZERA_UM_ITEM` é uma recusa **sobre o rateio igual**, que com a chave ligada passa a ser do ERP; manter a recusa significaria proibir descontos por uma regra de distribuição que o Checkout deixou de executar, e inventaria uma que o ERP talvez não use. Risco aceito e anotado: o ERP pode ratear e deixar um item negativo se ratear mal; a rede de proteção é o `ValidarNFCe` (014), que roda antes do pagamento com o mesmo retrato.

## D14. Mudanças fora do código

`.specs/project/STATE.md` ganha **AD-279**. Reescrever no ponto (não anexar): AD-098 e AD-151 (marcar o escopo que a chave desliga), FR-014/FR-015 das specs 003 e 008, os invariantes I8/I9 de `specs/003-carrinho-produto-precificacao/data-model.md`, e `specs/008-pagamento-geral/data-model.md:21-22`. `PENDENCIES.md`: nome/tipo do campo no ERP e cadastro de tetos. Wiki: capítulos de desconto e solução de problemas.

## Resumo: nenhum `NEEDS CLARIFICATION` aberto

Os quatro pontos de maior impacto foram decididos com o usuário antes da spec. O que a pesquisa acrescentou — D4, D5 e D8 — são consequências de ler o código, não perguntas novas; D8 corrigiu a spec.
