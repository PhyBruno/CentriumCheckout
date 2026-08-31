# Phase 0 — Research: Recuperação de NFCe

**Feature**: `specs/011-recuperacao-nfce/` | **Date**: 2026-08-27

## D1 — Endpoint de listagem: `GetListaNFCes` (`DpCheckout_RascunhosLista`), filtros hardcoded no servidor

**Decision**: Listar via `GET /ApiCentriumOAuth/GetListaNFCes`, params `Empresa`/`Txtbusca`/`Pagina`/`Tamanhopagina` (nomes exatos do contrato, `ApiCentriumOAuth.yaml:429-453`). `Txtbusca` filtra **só** `CliNom` (nome do cliente) ou `NfcRepNom` (nome do vendedor) — nunca por número da nota. `NfcStatus = '0'` (só rascunhos) e `NfcDatEmi >= Today-30` são hardcoded no `DataProvider`, não parametrizáveis pelo Checkout.

**Rationale**: Confirmado via KB do GenExus (Fato F2 de `.specs/project/DECISIONS.md`, AD-041 em `.specs/project/STATE.md`). Retorno: `GetListaNFCesOutput.CheckoutListaRascunhos` (`ApiCentriumOAuth.yaml:722-726`, `1582-1633`) — `PaginaAtual`, `RegistrosPorPagina`, `TotalRegistros`, `TotalPaginas`, `Rascunho[]` com `NumeroNota`, `Cliente`, `Vendedor`, `Operador`, `Emissao` (`date-time`), `Total` (`double`).

**Alternatives considered**: Buscar por número da nota — descartado, endpoint não suporta (FR-001 assume nesta versão).

---

## D2 — Paginação: limitar `Tamanhopagina` no próprio request, nunca confiar no servidor

**Decision**: O Checkout SHALL enviar `Tamanhopagina` já limitado a um teto fixo (`RASCUNHOS_TAMANHO_PAGINA = 50`) e nunca aumentar esse valor mesmo que o servidor aceite um número maior.

**Rationale**: Mesmo bug de paginação de cap-50 anulado já encontrado em `ListaDAVs` (AD-024/AD-041 em `.specs/project/STATE.md`) — `&TamanhoPaginaAuxiliar` é limitado a 50 no `DataProvider`, mas depois sobrescrito sem teto por uma segunda atribuição quando `&TamanhoPagina` não é vazio. Não é bug a corrigir no Checkout — é o servidor que não protege a si mesmo; a mitigação é do lado do cliente.

**Alternatives considered**: Confiar no servidor para limitar — rejeitado, reproduziria o mesmo bug já documentado.

---

## D3 — `CarregarNFCe` reaproveita exatamente o shape de `GetDavOutput` (correção 2026-08-31, AD-117: não é o schema de `FaturarNFCeOutput`)

**Decision**: `GET /ApiCentriumOAuth/CarregarNFCe` (params `Empresa`/`Numeronota`/`Serienota`, `ApiCentriumOAuth.yaml:383-417`) retorna `CarregarNFCeOutput.OutCheckoutFaturarNFCe`, que é o **mesmo shape de tipo** `CheckoutFaturarNFCe` (`ApiCentriumOAuth.yaml:1414-1507`) que aparece no corpo da requisição de `FaturarNFCe` e na resposta de `GetDAV`. Isso **não** significa reaproveitar `src/shared/schemas/faturarNFCe.schema.ts` (feature 004) — esse schema valida só a **resposta** de `POST FaturarNFCe`, que é um objeto bem menor (`{ NotaFiscal: { PDFImpressao, XMLImpressao } }`); o corpo de `FaturarNFCe` (onde o shape completo aparece como requisição) é construído internamente pelo Checkout, não validado por Zod. O schema Zod que de fato valida o shape completo `CheckoutFaturarNFCe` como dado **recebido** de fronteira é `src/shared/schemas/dav.schema.ts`, introduzido pela feature 006 para a resposta de `GetDAV` (`specs/006-importacao-dav/contracts/erp-dav-api.md`) — é esse schema que `CarregarNFCe` reaproveita sem alteração, não o de 004. Um único parser/schema Zod cobre os dois endpoints que **recebem** esse shape como resposta (`GetDAV` e `CarregarNFCe`).

**Rationale**: Mesmo achado de AD-057 (`.specs/project/STATE.md`) já aplicado à importação de DAV — o ERP devolve deliberadamente o formato de rascunho de NFCe tanto em `GetDAV` quanto em `CarregarNFCe`. Reaproveitar o parser de 006 evita duplicar a validação de fronteira (Constitution IV) sem inventar uma segunda leitura do mesmo shape.

**Alternatives considered**: Schema Zod próprio para `CarregarNFCeOutput` — rejeitado, duplicaria validação já necessária para `GetDavOutput` (006). Reaproveitar `faturarNFCe.schema.ts` (004) — rejeitado após achado do `/speckit-analyze` de 2026-08-31 (AD-117): esse schema nunca validou o shape completo, só a resposta menor de `FaturarNFCe`; usá-lo deixaria `produtos[]`/`FormasDePagamento[]`/`clienteCodigo` sem validação de fronteira real, violação do Princípio IV da Constitution.

---

## D4 — Parâmetro `Serienota` de `CarregarNFCe`

**Decision**: `Serienota` SHALL ser sempre `SessaoUsuario.CadSerieNFCe` — o mesmo campo do bootstrap (feature 002) já usado como `CadSerieNFCe` no payload de `FaturarNFCe` (feature 004, AD-034, `specs/004-finalizacao-suspensao-venda/data-model.md` §2). O Checkout nunca lê `SerieNota` de volta da listagem (`CheckoutListaRascunhos.Rascunho` não devolve esse campo).

**Rationale**: A série é uma configuração fixa por tenant/PDV (AD-034), não um dado por rascunho — não há campo alternativo no contrato para obtê-la a partir da listagem, e não faz sentido um rascunho ter série diferente da série corrente do caixa.

**Alternatives considered**: Nenhuma — não há outro campo no contrato que forneça esse valor.

---

## D5 — Linha congelada tem snapshot **parcial**: refina `SnapshotPrecoProduto` de `specs/003-carrinho-produto-precificacao/data-model.md` §2/§3

**Decision**: `CheckoutFaturarNFCe.produtos[]` (retornado por `CarregarNFCe`) só traz `sequencial`, `codigoProduto`, `quantidade`, `precoUnitario`, `DescontoPercentual`, `DescontoValor`, `UDM`, `ValorBruto`, `ValorTotal` (`ApiCentriumOAuth.yaml:1469-1507`) — **não** traz `precoVenda1..5`, faixas de quantidade, nem `ProdutoPesavelEditavel`. Uma `LinhaCarrinho` de origem `'RASCUNHO'` SHALL, portanto, ser criada com um snapshot degenerado (`precosFaixa`/`limiaresFaixa`/`pesavelEditavel` ausentes/`null`), nunca inventando valores para esses campos.

Isso é seguro porque `AD-067` (`.specs/project/STATE.md`) já garante que uma linha `precoCongelado = true` fica **fora** de `repricarSku` — os campos ausentes nunca são lidos enquanto a linha estiver congelada. Eles só passam a ser necessários no instante em que a linha descongela (reinserção/edição explícita, `CONGELADA → ATIVA`, `specs/003-carrinho-produto-precificacao/data-model.md` §6) — momento em que a feature 003 já precisa buscar o produto de novo via `GetProduto` para obter o snapshot completo (mecanismo que pertence a 003/AD-067, não a esta feature).

**Rationale**: Fecha uma lacuna que `AD-067` deixou implícita — a decisão original só resolveu o comportamento (exclusão de `repricarSku`/agregado), não a forma do tipo. Sem essa distinção, o tipo `SnapshotPrecoProduto` de 003 (todos os campos obrigatórios, não-`null`) seria inconsistente com o que `CarregarNFCe` de fato devolve.

**Impacto declarado, não aplicado por este plano**: `specs/003-carrinho-produto-precificacao/data-model.md` §2/§3 precisa, na prática, de um tipo discriminado (`SnapshotPrecoProduto` completo vs. um `SnapshotOrigemCongelada` parcial) para representar essa diferença com segurança de tipo — refinamento a aplicar quando a feature 003 for implementada ou revisitada, não uma mudança que este plano da feature 011 executa diretamente sobre o artefato de outra feature já desenhada.

**Alternatives considered**:
- Chamar `GetProduto` para cada item do rascunho ao carregar, preenchendo o snapshot completo antes mesmo do preço ser aplicado — rejeitado: contradiria diretamente `NFCE-03`/AD-041 (preço deve vir **exatamente** do rascunho, não recalculado por `GetProduto` no momento da retomada).
- Inventar valores default (`0`, `''`) para os campos ausentes — rejeitado, violaria a mesma disciplina de "nunca fabricar dado" já aplicada em `.specs/features/identificacao-cadastro-cliente/spec.md` (AD-094) e Constitution IV.

---

## D6 — Cliente: `CarregarNFCe` só devolve `clienteCodigo`; hidratação completa via `GetCliente`

**Decision**: `CheckoutFaturarNFCe.clienteCodigo` (`int64`) é a única informação de cliente devolvida pelo rascunho. Para montar um `ClienteVenda` completo (`specs/005-identificacao-cadastro-cliente/data-model.md` §1 — `nome`, `documento`, `listaPreco`, `descontoConvenio`, `codigoConvenio`), o Checkout SHALL chamar `GET /ApiCentriumOAuth/GetCliente` com esse código, reaproveitando a query já definida pela feature 005.

**Impacto declarado, não aplicado por este plano**: `OrigemCliente` (`specs/005-identificacao-cadastro-cliente/data-model.md` §1, hoje `'DEFAULT' | 'BUSCA_DOCUMENTO' | 'BUSCA_LIVRE' | 'CADASTRO_SIMPLIFICADO'`) precisa de um quinto valor, `'RASCUNHO'`, para representar corretamente esta origem — extensão a aplicar no artefato da feature 005, fora do escopo mecânico deste plano (mesmo padrão de "dependência declarada" já usado em `specs/004-finalizacao-suspensao-venda/data-model.md`, seção final).

**Rationale**: Reaproveitar `GetCliente`/`ClienteVenda` evita duplicar schema Zod e lógica de leitura de convênio/lista de preço só para o caso de retomada — a Constitution II (SOLID/Open-Closed) favorece estender o enum a criar um tipo paralelo de cliente.

**Alternatives considered**: Tratar `clienteCodigo` como suficiente, sem buscar nome/documento/convênio — rejeitado, quebraria a exibição do cliente na tela e a aplicação de desconto de convênio (`.specs/features/carrinho-produto-precificacao/spec.md`) na venda retomada.

---

## D7 — Vendedor: pré-seleção é responsabilidade da feature 012 (ainda não planejada)

**Decision**: `CheckoutFaturarNFCe.vendedorCodigo` vem pronto no rascunho (FR-009/NFCE-04) — esta feature só expõe esse valor como parte do `RascunhoCarregado` (`data-model.md` §3). A pré-seleção efetiva no estado de vendedor (`.specs/features/selecao-vendedor/spec.md`, AD-024) é implementada quando a feature 012 (`specs/012-selecao-vendedor/`) passar por `/speckit-plan` — hoje só tem `spec.md`, sem `data-model.md`/slice definido.

**Rationale**: Mesmo padrão de "dependência declarada, não implementada" já usado por `specs/004-finalizacao-suspensao-venda/data-model.md` para o mesmo campo `vendedorCodigo` (seção final) — não há tipo de estado de vendedor ainda desenhado para esta feature consumir.

**Alternatives considered**: Nenhuma — não há como implementar contra um slice que ainda não existe.

---

## D8 — Pagamento: mapeamento de `FormasDePagamento[]` para `PagamentoAplicado` (008); dinheiro sem troco reconstruído

**Decision**: Cada item de `CheckoutFaturarNFCe.FormasDePagamento[]` (`ApiCentriumOAuth.yaml:1510-1550`) mapeia para um `PagamentoAplicado` (`specs/008-pagamento-geral/data-model.md` §2) com `status = 'APROVADO'` sempre (o pagamento já foi validado quando o rascunho foi suspenso originalmente) e `integracao` inferida pela mesma regra já usada pela feature 008 a partir de `FormaMeioPagtoNFe`/`FormaIntegracaoCartao`. Quando `meioPagtoNFe === 'Dinheiro'`, `valorRecebido = FormaValor` (mesmo valor de `valorAplicado`) — a venda retomada nunca reconstrói um troco já entregue ao cliente na suspensão original; `troco` derivado (`SaldoPagamento`, 008 §2) é `0` para essa linha até o operador editar.

**Rationale**: O contrato não devolve um campo de "valor recebido em dinheiro" separado de `FormaValor` — o troco de uma operação em dinheiro é, por natureza, entregue no momento da suspensão original, não algo que sobrevive para a retomada. Assumir `valorRecebido = FormaValor` é a única leitura consistente sem inventar dado (Constitution IV) — nenhuma edge case da spec (`recuperacao-nfce/spec.md`) contradiz essa leitura; a edge case existente só fala de a forma "permanecer associada, disponível na próxima retomada" (AD-042), sem mencionar troco.

**Alternatives considered**: Deixar `valorRecebido = null` mesmo em Dinheiro — rejeitado, violaria o invariante I3 de `specs/008-pagamento-geral/data-model.md` (`valorRecebido !== null` **sse** `meioPagtoNFe === 'Dinheiro'`).

---

## D9 — `identidadeVenda`: esta feature implementa o setter que a feature 004 já declarou como pendente

**Decision**: Ao retomar um rascunho, o Checkout SHALL setar `identidadeVenda = { origem: 'RASCUNHO', numeroNota: <NumeroNota do rascunho> }` (`specs/004-finalizacao-suspensao-venda/data-model.md` §1), fechando a dependência listada na seção final daquele documento ("Setter de `identidadeVenda` ao carregar rascunho/DAV | 006 (DAV) / 011 (recuperação de NFCe)").

**Rationale**: `identidadeVenda` já existe como slice desenhado por 004; esta feature só precisa chamar o setter já contratado, na ordem certa (antes de popular carrinho/pagamento/cliente/vendedor, mesmo call site de `resetarAuditoria`, per 004 §1).

**Alternatives considered**: Nenhuma — o slice e sua semântica já estão fixados por 004.

---

## D10 — Auditoria: evento `VENDA_INICIADA(origem='RASCUNHO')` já contratado pela feature 001

**Decision**: Ao retomar, o Checkout SHALL disparar `VENDA_INICIADA` com `detalhes.origem = 'RASCUNHO'`, usando o slice/contrato já definido por `specs/001-auditoria-acoes-operador/contracts/auditoria-events.md` — o slice `auditoria` é zerado antes desse evento (AUDIT-01/AUDIT-10 da spec de domínio).

**Rationale**: A feature 001 já cobre esse caso explicitamente (`.specs/features/auditoria-acoes-operador/spec.md`, Edge Cases — retomada de rascunho/DAV inicia log vazio). Nenhum tipo de evento novo é necessário.

**Alternatives considered**: Nenhuma.

---

## D11 — Concorrência entre operadores: sem lock, já decidido (AD-052)

**Decision**: Nenhum mecanismo de lock otimista/pessimista é implementado — reafirmação direta de AD-052 (`.specs/project/STATE.md`), já aplicada a DAV e a esta feature no texto original de `.specs/features/recuperacao-nfce/spec.md`.

**Rationale**: Decisão já tomada, sem necessidade de nova pergunta ao usuário.

---

## D12 — Desktop-only (AD-046)

**Decision**: Sem equivalente mobile — reafirmação de AD-046 (`.specs/project/STATE.md`). Nenhum artefato desta fase considera layout responsivo; `specs/007-layout-responsivo-mobile/` já documenta essa exclusão.

**Rationale**: Decisão já tomada.

---

## D13 — Reinserção/"descongelamento" de linha (`CONGELADA → ATIVA`) pertence inteiramente à feature 003 (AD-067)

**Decision**: Esta feature (011) só é responsável por **criar** linhas congeladas corretamente na retomada. A transição `CONGELADA → ATIVA` (reinserção/edição explícita do operador num SKU já presente numa linha congelada) é mecanismo de `carrinho-produto-precificacao` (`specs/003-carrinho-produto-precificacao/data-model.md` §6, invariante I6), já especificado por AD-067 — 011 não reimplementa nem redefine esse comportamento.

**Rationale**: Evita duplicar/discordar de uma máquina de estados já fechada por outra feature; mantém uma única fonte de verdade para o ciclo de vida de `LinhaCarrinho`.

**Alternatives considered**: Nenhuma — redefinir o comportamento aqui violaria a Constitution I (rastreabilidade, uma decisão por lugar).
