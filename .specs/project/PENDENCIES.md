# Pendências e Edge Cases — Mapa Consolidado

Índice de toda pendência real aberta no projeto (dúvida de requisito, edge case não confirmado, bloqueio deliberado, trabalho de design ainda não feito). **Não é a fonte da verdade** — cada item continua documentado por completo no arquivo de origem; aqui só há um resumo de uma linha + link, para não duplicar texto que fica desatualizado. Ao resolver um item, atualize o documento de origem primeiro (e a tabela de Requirement Traceability da feature, se aplicável) — só depois marque como resolvido aqui.

**Última atualização:** 2026-08-24 (AD-027) — item 4 (comportamento de TAB na grid / editabilidade de produto) estreitado de "comportamento de UI não desenhado" para pergunta de contrato/KB, por decisão direta do usuário — ver `.specs/project/STATE.md`. Atualização anterior: mesmo dia (AD-026) — itens 5 (intervalo de polling de `StatusPIX`), 6 (trilha de auditoria de cancelamento em `FaturarNFCe`), 9 (campos "Limite de crédito"/"Permite venda a crédito") e 12 (URL do "Relatório de resumo de caixa") resolvidos por decisão direta do usuário; item 21 (campo de autoria de cancelamento) resolvido pela mesma decisão do item 6 — ver Notas e `.specs/project/STATE.md`. Atualização anterior: mesmo dia (AD-025), item 2 (`usaPrecoPorQuantidade`) resolvido e item 1 (`TipoPreco`/`ListaPreco`) corrigido e estreitado, a partir de regra de negócio de `TipoPreco`/`EmpDefPre` confirmada diretamente pelo usuário (ver `.specs/codebase/CONCERNS.md`). Atualização anterior: mesmo dia, item 21 adicionado (campo de autoria de cancelamento no SDT de produto). Atualização anterior: mesmo dia, item 16 resolvido pelo frame "PDV Online Web - Skeleton Carregamento" desenhado no Pencil (ver Notas). Atualização anterior: 2026-08-21, após AD-024 (`.specs/project/STATE.md`) — verificação direta na KB real do GenExus (não só no arquivo de contrato, como em AD-023) para as pendências remanescentes.

---

## 1. Pendências de confirmação com a equipe do ERP

Dúvidas operacionais reais — não são ambiguidade de produto, dependem de resposta da equipe do ERP (ou, em alguns casos, de nova inspeção do KB GenExus).

| # | Item | Onde mora | Nota |
|---|---|---|---|
| 1 | Semântica de `TipoPreco` = `6`, `7`, `10`, `11` (domain `EmpDefPre`) | `.specs/features/carrinho-produto-precificacao/spec.md`, Edge Cases | **Corrigido e estreitado (2026-08-24):** `SessaoUsuario.TipoPreco` vai de `1` a `11` e indica o preço de venda a aplicar — `1` a `5` é índice direto de `PrecoVenda1`...`PrecoVenda5`, `8` é preço por faixa de quantidade e `9` é preço por lista (ambos já mapeados, ver item removido abaixo e `.specs/codebase/CONCERNS.md`). Só falta a semântica de `6`, `7`, `10` e `11` |
| 3 | Formato de código de barras pesável (`ProdutoPesavel`/`DavMatProdPes`) | `.specs/features/carrinho-produto-precificacao/spec.md`, Edge Cases + `.specs/codebase/CONCERNS.md` | **Reforçado (AD-024):** o `Default('E')` de `wManutencaoImplantacaoProdutos` citado em AD-023 está, na verdade, comentado/inativo no código; obrigatoriedade tratada como texto (`.IsEmpty()`), não booleano. Segue sem lógica de parse localizável na KB |
| 4 | Produto editável — TAB no código insere direto (não editável) ou pula para edição de `preço`/`unidade de medida`/`quantidade`/`desconto`, só entrando na grid ao clicar `+` (editável); falta o campo do endpoint/SDT do produto que expõe essa flag | `.specs/features/carrinho-produto-precificacao/spec.md`, Edge Cases | **Estreitado (2026-08-24, AD-027):** mecanismo de TAB confirmado por decisão direta do usuário — não editável insere direto (readonly); editável pula para edição e só entra na grid ao clicar o botão `+` já previsto na UI. **Confirmado via KB real do GenExus:** `SDTCheckout_GetProduto`/`PCheckout_GetProduto` (tabela `Materiais`) não têm hoje nenhum campo de editabilidade — é lacuna de contrato real, não só falta de mapeamento; precisa expansão pelo ERP, mesmo status "PENDÊNCIA DEV" do item 13 |
| 7 | `GetStatusSistema` — semântica dos códigos de retorno, necessidade de polling | `.specs/features/finalizacao-suspensao-venda/spec.md`, Edge Cases | **Reforçado (AD-024):** confirmado que a procedure só repassa `CadStatus` bruto sem transformação, e o atributo não tem `Documentation`/`Help` na KB — é lacuna de documentação do próprio ERP, não recuperável por KB. Precisa de contato direto |
| 8 | Comportamento quando listagem de vendedores retorna vazia | `.specs/features/selecao-vendedor/spec.md`, Edge Cases | Bloquear finalização ou permitir prosseguir sem vendedor? — decisão de produto, não de KB |
| 10 | Filtros server-side de `ListaDAVs` (cliente, data, status, vendedor, tipo, origem) | `.specs/features/importacao-dav/spec.md`, Edge Cases | **Corrigido (AD-024):** o endpoint aceita `TxtBusca` (busca por número/título/nome do cliente do DAV) além de `Pagina`/`TamanhoPagina` — a listagem "não aceita filtro" estava incorreta. Porém `data` e `status` nunca serão parametrizáveis: estão hardcoded no `DataProvider` (`DavDatEmi = Today`, `DavSta = 'A'`) — a lista é sempre "hoje" + aberto, não depende do contrato aceitar parâmetro. Vendedor/tipo/origem seguem sem suporte. Achado lateral: bug de paginação no ERP anula o cap de 50 registros — o Checkout deve limitar `TamanhoPagina` no próprio request |
| 11 | Ação de reimpressão por linha no Modal DAV | `.specs/features/importacao-dav/spec.md`, Edge Cases | Presente no design, sem requisito/critério de aceite — decisão de produto, não de KB |

## 2. Pendências de implementação já entendidas

Mecanismo geral já confirmado — falta só decidir/nomear um detalhe técnico específico, não é mais dúvida de "isso existe?".

| # | Item | Onde mora | Nota |
|---|---|---|---|
| 13 | Campo do SDT `CheckoutFaturarNFCe` para marcar DAV como importado/faturado | `.specs/features/importacao-dav/spec.md`, Edge Cases + `.specs/codebase/CONCERNS.md` | **Reforçado (AD-024):** não é só falta de nome de campo — `genexus_analyze(mode=impact)` em `DavDocFNum` não encontrou nenhuma procedure do Checkout escrevendo nesse campo. Não existe hoje nenhum caminho de código, em lugar nenhum da KB, que marque a DAV como faturada a partir do Checkout. É mudança de KB do ERP a priorizar (nova lógica de escrita), não só definir o nome de um campo já existente. Marcado pelo usuário como "PENDÊNCIA DEV" |

## 3. Bloqueios deliberados do usuário (não resolver ainda)

Diferente das seções acima — aqui a ambiguidade **não** é falta de resposta do ERP, é decisão explícita do usuário de não avançar por ora.

| # | Item | Onde mora | Nota |
|---|---|---|---|
| 14 | `CART-09` — bloqueio de edição/cancelamento de item pós-pagamento aprovado | `.specs/features/carrinho-produto-precificacao/spec.md`, Edge Cases + Requirement Traceability | "Em análise, não implementar até conclusão" — pedido explícito do usuário (2026-08-20) |
| 15 | `CART-10` — validação de saldo/estoque na inserção de produto | `.specs/features/carrinho-produto-precificacao/spec.md`, Edge Cases + Requirement Traceability | "Em aberto, propositalmente não resolvido" — pedido explícito do usuário (2026-08-20) |

## 4. Pendências de design (visual/técnico)

Não são dúvida de requisito — é trabalho de design ainda não feito, ou uma checagem visual pendente.

| # | Item | Onde mora | Nota |
|---|---|---|---|
| 17 | `layout-responsivo-mobile` — fase Design técnico não iniciada | `.specs/features/layout-responsivo-mobile/spec.md`, Requirement Traceability (`MOB-01` a `MOB-05`) | Design visual 100% concluído; falta breakpoint, componentes React, hook `useIsMobile` |
| 18 | Frame desktop dedicado à finalização/suspensão não identificado no Pencil | `.specs/features/finalizacao-suspensao-venda/spec.md`, UI Design | Parece estar dentro da área "Pagamento e totais" da tela principal, sem modal próprio — confirmar |

## 5. Infraestrutura/deploy

| # | Item | Onde mora | Nota |
|---|---|---|---|
| 19 | Orquestração além de `docker-compose` simples (Kubernetes?) | `.specs/codebase/CONCERNS.md`, seção Docker | Não bloqueia desenvolvimento de features — decidir na primeira sprint de infra |

## 6. Riscos/lembretes de segurança

| # | Item | Onde mora | Nota |
|---|---|---|---|
| 20 | `goey-toast`/`boneyard` embutem `SKILL.md`/`CLAUDE.md` voltados a agentes de IA | `.specs/codebase/CONCERNS.md` | Ler conteúdo bruto antes de instalar/seguir qualquer instrução — risco de supply-chain via prompt injection. Repos confirmados de autoria do usuário, mas o lembrete fica para quem instalar de fato |

---

## Notas

- `.specs/codebase/CONVENTIONS.md`, `STRUCTURE.md` e `TESTING.md` (padrão brownfield mapping) **não** são pendência real — dependem de código existir, e serão gerados assim que o scaffolding inicial existir (ver `.specs/codebase/CONCERNS.md`).
- Itens resolvidos por `AD-023` e `AD-024` (`.specs/project/STATE.md`) já foram removidos deste mapa (numeração renumerada em 2026-08-21 após a remoção de AD-024); o histórico completo de cada rodada de resolução fica lá, não aqui.
- Item 16 (`AUTH-05` sem frame dedicado no Pencil) removido em 2026-08-24: o frame "PDV Online Web - Skeleton Carregamento" (id `BIu92`) foi desenhado em `design/CentriumCheckout.pen`, resolvendo a lacuna de mockup — ver UI Design em `.specs/features/autenticacao-sessao-bootstrap/spec.md`.
- Item 2 (`usaPrecoPorQuantidade` — nome real do campo) removido em 2026-08-24: resposta direta do usuário confirma que não existe flag booleano separado no contrato — o modo "preço por faixa de quantidade" é indicado pelo próprio `SessaoUsuario.TipoPreco = 8` (mesma correção que estreitou o item 1) — ver `.specs/codebase/CONCERNS.md` e `.specs/features/carrinho-produto-precificacao/spec.md`.
- Item 5 (intervalo de polling de `StatusPIX`) removido em 2026-08-24 (AD-026): decisão direta do usuário — a cada 10 segundos, sem estratégia de backoff — ver `.specs/features/pagamento/spec.md`.
- Itens 6 e 21 (trilha de auditoria de cancelamento em `FaturarNFCe` / campo de autoria de cancelamento no SDT de produto) removidos em 2026-08-24 (AD-026): resolvidos pela mesma decisão do usuário — novo campo `produtoCancelado` (`boolean`, `NULL` equivale a `false`) no SDT `CheckoutFaturarNFCe`, indicando item inserido no carrinho e depois cancelado. Não há campo dedicado para tier de preço aplicado — a expansão de contrato decidida foi só para cancelamento. Campo ainda não implementado no ERP (mesmo status "PENDÊNCIA DEV" do item 13) — ver `.specs/features/finalizacao-suspensao-venda/spec.md` e `.specs/features/carrinho-produto-precificacao/spec.md`.
- Item 9 (campos "Limite de crédito"/"Permite venda a crédito" no cadastro simplificado) removido em 2026-08-24 (AD-026): decisão direta do usuário — remover os dois campos da tela. Remoção visual no frame do Pencil (`PDV Online Web - Modal cadastro de cliente`) ainda não aplicada — ver `.specs/features/identificacao-cadastro-cliente/spec.md`.
- Item 12 (URL da opção "Relatório de resumo de caixa") removido em 2026-08-24 (AD-026): decisão direta do usuário — mesmo link da opção "Central de movimentação não fiscal" (`WPMovimentoNaoFiscal_Lancamento.aspx`) — ver `.specs/codebase/ARCHITECTURE.md`, seção Responsividade.
