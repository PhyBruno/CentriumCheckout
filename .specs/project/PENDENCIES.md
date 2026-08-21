# Pendências e Edge Cases — Mapa Consolidado

Índice de toda pendência real aberta no projeto (dúvida de requisito, edge case não confirmado, bloqueio deliberado, trabalho de design ainda não feito). **Não é a fonte da verdade** — cada item continua documentado por completo no arquivo de origem; aqui só há um resumo de uma linha + link, para não duplicar texto que fica desatualizado. Ao resolver um item, atualize o documento de origem primeiro (e a tabela de Requirement Traceability da feature, se aplicável) — só depois marque como resolvido aqui.

**Última atualização:** 2026-08-21, logo após AD-023 (`.specs/project/STATE.md`) fechar a maior parte das pendências de contrato de API.

---

## 1. Pendências de confirmação com a equipe do ERP

Dúvidas operacionais reais — não são ambiguidade de produto, dependem de resposta da equipe do ERP (ou, em alguns casos, de nova inspeção do KB GenExus).

| # | Item | Onde mora | Nota |
|---|---|---|---|
| 1 | `TipoPreco`/`ListaPreco` fora do valor `0` | `.specs/features/carrinho-produto-precificacao/spec.md`, Edge Cases | Confirmado (AD-023) que são conceitos distintos (empresa vs. cliente) — nenhum dos dois tem enum de valores válidos no KB |
| 2 | `usaPrecoPorQuantidade` — nome real do campo no payload de `GetSessao` | `.specs/features/carrinho-produto-precificacao/spec.md`, Edge Cases | Campo não localizado no schema de `ApiCentriumOAuth.yaml` |
| 3 | `QtdMinCharParaConsulta` substitui o mínimo de 3 caracteres hardcoded? | `.specs/features/carrinho-produto-precificacao/spec.md`, Edge Cases | Campo existe no contrato; falta confirmar se é para usar em vez do valor fixo de `Regras.md` |
| 4 | Formato de código de barras pesável (`ProdutoPesavel`/`DavMatProdPes`) | `.specs/features/carrinho-produto-precificacao/spec.md`, Edge Cases + `.specs/codebase/CONCERNS.md` | Varredura do KB GenExus (AD-023) não achou lógica de parse; achado lateral sugere código multi-valor (default `'E'`), não `S`/`N` |
| 5 | Produto editável ao dar TAB na grid — qual campo, critério de elegibilidade | `.specs/features/carrinho-produto-precificacao/spec.md`, Edge Cases | Não confirmado |
| 6 | `PAY-07` — elegibilidade de ticket devolução por forma de pagamento (`FpgUtiCar`) | `.specs/features/pagamento/spec.md`, Edge Cases + Requirement Traceability | `CondicaoFormasDePagamento[]` não tem campo de elegibilidade correspondente no contrato |
| 7 | Intervalo/estratégia de polling de `StatusPIX` | `.specs/features/pagamento/spec.md`, Edge Cases | Endpoint confirmado (AD-023); intervalo ainda não definido |
| 8 | Trilha de auditoria de tier de preço aplicado em `FaturarNFCe` | `.specs/features/finalizacao-suspensao-venda/spec.md`, story "Finalizar a venda", AC2 | Array `produtos` do contrato não expõe campo dedicado — não confirmado se a rastreabilidade fica só no Checkout (logs) |
| 9 | Impressão pós-autorização — direta vs. opção de PDF, origem da preferência | `.specs/features/finalizacao-suspensao-venda/spec.md`, Edge Cases | Não confirmado |
| 10 | `GetStatusSistema` — semântica dos códigos de retorno, necessidade de polling | `.specs/features/finalizacao-suspensao-venda/spec.md`, Edge Cases | Forma do contrato confirmada (AD-023: `Empresa`+`Cadmaqcod` → `integer`); significado dos códigos não |
| 11 | Pré-seleção automática de vendedor ao carregar rascunho via `CarregarNFCe` | `.specs/features/selecao-vendedor/spec.md`, Edge Cases | Não confirmado |
| 12 | Comportamento quando listagem de vendedores retorna vazia | `.specs/features/selecao-vendedor/spec.md`, Edge Cases | Bloquear finalização ou permitir prosseguir sem vendedor? |
| 13 | Campos "Limite de crédito"/"Permite venda a crédito" no cadastro simplificado | `.specs/features/identificacao-cadastro-cliente/spec.md`, Edge Cases | `PostCliente` não aceita esses campos no payload atual — presentes no design, sem contrato correspondente |
| 14 | Filtros server-side de `ListaDAVs` (cliente, data, status, vendedor, tipo, origem) | `.specs/features/importacao-dav/spec.md`, Edge Cases | Contrato só aceita `Pagina`/`Tamanhopagina` — os 6 filtros do design não têm suporte server-side |
| 15 | Ação de reimpressão por linha no Modal DAV | `.specs/features/importacao-dav/spec.md`, Edge Cases | Presente no design, sem requisito/critério de aceite |
| 16 | URL da opção "Relatório de resumo de caixa" (menu gerencial) | `.specs/codebase/ARCHITECTURE.md`, seção Responsividade | Só "Central de movimentação não fiscal" tem URL confirmada |

## 2. Pendências de implementação já entendidas

Mecanismo geral já confirmado — falta só decidir/nomear um detalhe técnico específico, não é mais dúvida de "isso existe?".

| # | Item | Onde mora | Nota |
|---|---|---|---|
| 17 | Campo do SDT `CheckoutFaturarNFCe` para marcar DAV como importado/faturado | `.specs/features/importacao-dav/spec.md`, Edge Cases + `.specs/codebase/CONCERNS.md` | Confirmado (AD-023): tratado via `FaturarNFCe`, sem endpoint próprio — falta só definir o campo exato. Marcado pelo usuário como "PENDÊNCIA DEV" |

## 3. Bloqueios deliberados do usuário (não resolver ainda)

Diferente das seções acima — aqui a ambiguidade **não** é falta de resposta do ERP, é decisão explícita do usuário de não avançar por ora.

| # | Item | Onde mora | Nota |
|---|---|---|---|
| 18 | `CART-09` — bloqueio de edição/cancelamento de item pós-pagamento aprovado | `.specs/features/carrinho-produto-precificacao/spec.md`, Edge Cases + Requirement Traceability | "Em análise, não implementar até conclusão" — pedido explícito do usuário (2026-08-20) |
| 19 | `CART-10` — validação de saldo/estoque na inserção de produto | `.specs/features/carrinho-produto-precificacao/spec.md`, Edge Cases + Requirement Traceability | "Em aberto, propositalmente não resolvido" — pedido explícito do usuário (2026-08-20) |

## 4. Pendências de design (visual/técnico)

Não são dúvida de requisito — é trabalho de design ainda não feito, ou uma checagem visual pendente.

| # | Item | Onde mora | Nota |
|---|---|---|---|
| 20 | `AUTH-05` — tela de carregamento bloqueante sem frame dedicado no Pencil | `.specs/features/autenticacao-sessao-bootstrap/spec.md`, UI Design | Workaround já viável: skeleton via Boneyard, sem depender de mockup dedicado |
| 21 | `layout-responsivo-mobile` — fase Design técnico não iniciada | `.specs/features/layout-responsivo-mobile/spec.md`, Requirement Traceability (`MOB-01` a `MOB-05`) | Design visual 100% concluído; falta breakpoint, componentes React, hook `useIsMobile` |
| 22 | Frame desktop dedicado à finalização/suspensão não identificado no Pencil | `.specs/features/finalizacao-suspensao-venda/spec.md`, UI Design | Parece estar dentro da área "Pagamento e totais" da tela principal, sem modal próprio — confirmar |

## 5. Infraestrutura/deploy

| # | Item | Onde mora | Nota |
|---|---|---|---|
| 23 | Orquestração além de `docker-compose` simples (Kubernetes?) | `.specs/codebase/CONCERNS.md`, seção Docker | Não bloqueia desenvolvimento de features — decidir na primeira sprint de infra |

## 6. Riscos/lembretes de segurança

| # | Item | Onde mora | Nota |
|---|---|---|---|
| 24 | `goey-toast`/`boneyard` embutem `SKILL.md`/`CLAUDE.md` voltados a agentes de IA | `.specs/codebase/CONCERNS.md` | Ler conteúdo bruto antes de instalar/seguir qualquer instrução — risco de supply-chain via prompt injection. Repos confirmados de autoria do usuário, mas o lembrete fica para quem instalar de fato |

---

## Notas

- `.specs/codebase/CONVENTIONS.md`, `STRUCTURE.md` e `TESTING.md` (padrão brownfield mapping) **não** são pendência real — dependem de código existir, e serão gerados assim que o scaffolding inicial existir (ver `.specs/codebase/CONCERNS.md`).
- Itens resolvidos por `AD-023` (`.specs/project/STATE.md`) já foram removidos deste mapa; o histórico completo da rodada de resolução fica lá, não aqui.
