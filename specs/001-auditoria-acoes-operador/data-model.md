# Data Model: Auditoria de Ações do Operador

## Evento de Auditoria (`EventoAuditoria`)

União TypeScript discriminada por `tipo`. Todo evento tem a base:

```ts
interface EventoAuditoriaBase<TTipo extends string, TDetalhes> {
  tipo: TTipo;
  timestamp: string; // ISO 8601 no fuso do navegador, com deslocamento (instanteLocalIso, AD-280) — ver research.md #2
  detalhes: TDetalhes;
}
```

Os nomes de campo dentro de `detalhes` (`codigoCliente`, `codigoVendedor`, `codigoProduto`, etc.) são identificadores internos do Checkout (camelCase), não necessariamente os nomes de campo brutos do contrato do ERP (que seguem convenção GeneXus, ex. `CadCliCod`) — a normalização desses valores é responsabilidade da feature de origem (cliente/vendedor/carrinho/pagamento), que já os recebe tipados de suas próprias chamadas ao ERP antes de montar o `detalhes` do evento.

### Catálogo de tipos

⚠️ **O código tem 24 tipos desde AD-280 (2026-10-16), não os 20 desta tabela original.** A tabela abaixo ganhou as linhas 23 (`DESCONTO_CAPA_APLICADO`, 017/AD-279) e 24 (`ALERTA_EXIBIDO_AO_OPERADOR`, AD-280), e as linhas 7, 8 e 23 ganharam o valor **pedido** quando um limite o ajustou (AD-280); `NFCE_RECUPERADA` (011) e `ATALHO_ACIONADO` (016) existem em `src/client/domain/auditoria/eventos.ts` e estão documentados nas próprias features, não aqui. A fonte de verdade da forma de cada evento é a união `EventoAuditoria` daquele arquivo.

| # | `tipo` | Origem (feature) | `detalhes` |
|---|---|---|---|
| 1 | `VENDA_INICIADA` | Esta feature (chamado no bootstrap de uma nova sessão de venda) | `{ origem: 'NOVA' \| 'RASCUNHO' \| 'DAV' }` |
| 2 | `CLIENTE_SELECIONADO` | 005-identificacao-cadastro-cliente | `{ codigoCliente: number, nome: string }` |
| 3 | `CLIENTE_CRIADO` | 005-identificacao-cadastro-cliente | `{ codigoCliente: number, nome: string }` |
| 4 | `CLIENTE_TROCADO` | 005-identificacao-cadastro-cliente | `{ codigoClienteAnterior: number, codigoClienteNovo: number }` |
| 5 | `VENDEDOR_SELECIONADO` | 012-selecao-vendedor | `{ codigoVendedor: number, nome: string }` |
| 6 | `VENDEDOR_TROCADO` | 012-selecao-vendedor | `{ codigoVendedorAnterior: number, codigoVendedorNovo: number }` |
| 7 | `PRODUTO_INSERIDO` | 003-carrinho-produto-precificacao | `{ codigoProduto: string, quantidade: number, precoUnitario: number, desconto: number, descontoManualSolicitado?: number }` (`precoUnitario`/`desconto` em centavos inteiros — Constitution V). `precoUnitario` é a base **unitária**; `desconto` é absoluto e referente ao **total da linha**, não por unidade (ver `specs/003-carrinho-produto-precificacao/data-model.md`, §1). `descontoManualSolicitado` (centavos, AD-280) só aparece quando o preço mínimo ajustou o desconto manual: é o que o operador pediu, seja o ajuste da barra ou do slice |
| 8 | `PRODUTO_ALTERADO` | 003-carrinho-produto-precificacao | `{ codigoProduto: string, campo: string, valorAnterior: unknown, valorNovo: unknown, valorSolicitado?: unknown }` — `valorSolicitado` (AD-280) só quando o que entrou difere do pedido (hoje, o `descontoManual` ajustado ao preço mínimo). Um pedido ajustado de volta ao desconto que a linha já tinha também gera o evento, com `valorAnterior = valorNovo`: a linha não muda, mas a tentativa fica no `Log` |
| 9 | `PRODUTO_CANCELADO` | 003-carrinho-produto-precificacao | `{ codigoProduto: string }` |
| 10 | `CONDICAO_PAGAMENTO_APLICADA` | 008-pagamento-geral | `{ condicao: string }` |
| 11 | `FORMA_PAGAMENTO_APLICADA` | 008-pagamento-geral | `{ formaPagamento: string, valor: number }` (centavos inteiros) |
| 12 | `FORMA_PAGAMENTO_REMOVIDA` | 008-pagamento-geral; ampliado pela 018 (AD-283) | `{ formaPagamento: string, valor: number, motivo: 'OPERADOR' \| 'ESTORNO_TEF' \| 'LIMPAR', tefPagId?: string, pixGuid?: string }` — `valor` em centavos inteiros (`valorRecebido ?? valorAplicado`); `motivo` é o gesto que tirou a forma (botão Remover, estorno confirmado pelo TEF, "Limpar"); `tefPagId` (`payment_identifier` da SmartTEF, o `TEFPagId` do faturamento) e `pixGuid` só aparecem quando a forma tem a transação, nunca vazios |
| 13 | `VALE_DEVOLUCAO_USADO` | 008-pagamento-geral | `{ codigoVale: string, valor: number }` (centavos inteiros) |
| 14 | `PAGAMENTO_RECUSADO` | 008-pagamento-geral / 009-pagamento-pix / 010-pagamento-tef; ampliado pela 018 (AD-285) | `{ tipo: string, motivo?: string, formaPagamento?: string, valor?: number, tefPagId?: string, pixGuid?: string }` — os quatro últimos só quando a forma fica riscada na lista (desistência do operador ou falha de cobrança já criada): descrição da forma, valor em centavos inteiros e o identificador da cobrança TEF/PIX, nunca vazio |
| 15 | `FATURAMENTO_FALHOU` | 004-finalizacao-suspensao-venda | `{ operacao: 'FATURAR' \| 'SUSPENDER' }` |
| 16 | `VENDA_FINALIZADA` | 004-finalizacao-suspensao-venda | `Record<string, never>` — não `{}`: em TypeScript, `{}` como tipo aceita quase qualquer valor não-nulo e não expressa "objeto vazio" |
| 17 | `VENDA_SUSPENSA` | 004-finalizacao-suspensao-venda | `Record<string, never>` — mesmo motivo da linha acima |
| 18 | `VALIDACAO_VENDA_RECUSADA` | 014-validacao-previa-nfce | `{ origem: 'MANUAL' \| 'ATALHO_CENARIO', condicao: string, formaPagamento: string, motivo: string }` — registra recusa por regra de negócio **e** indisponibilidade do ERP; avisos (`Valido = true` com mensagem) **não** são registrados (AD-113) |
| 19 | `VENDA_RAPIDA_ACIONADA` | 013-venda-rapida-cenario-pagamento | `{ tecla: 'F6' \| 'F7' \| 'F8' \| 'F9', cenarioNome: string, condicaoCodigo: number, formaCodigo: number, valorLancado: number, finalizacaoAutomatica: boolean }` (`valorLancado` em centavos inteiros) — um evento por acionamento que alterou a venda; acionamento recusado em G1–G4 (`specs/013-.../data-model.md`) não gera evento (I12 da feature 013) |
| 20 | `DAV_IMPORTADO` | 006-importacao-dav | `{ numeroDav: string, numeroNota: number, quantidadeLinhas: number, quantidadeFormasDePagamento: number }` — disparado uma única vez ao final de `importarVendaExistente`, depois que carrinho/cliente/vendedor/pagamento já foram populados (AD-114); `numeroDav` só existe nesta trilha — não é reenviado a `FaturarNFCe` (AD-107) |
| 23 | `DESCONTO_CAPA_APLICADO` | 017-motor-desconto | `{ origem: 'CONDICAO' \| 'MANUAL', modo: 'PERCENTUAL' \| 'VALOR', entrada: number, valor: number, entradaSolicitada?: number }` (`valor` em centavos; `entrada` e `entradaSolicitada` são percentual em `PERCENTUAL` e centavos em `VALOR`) — emitido pela capa automática de `selecionarCondicao` e pela aplicação **não silenciosa** de `aplicarDescontoCapa` (nunca por tecla); deduplicado contra o último evento de capa do histórico da venda (`ultimoDescontoCapaAuditado`), com `entradaSolicitada` dentro da comparação. `entradaSolicitada` (AD-280) só aparece quando o teto da condição ajustou: o que o operador digitou, ou o desconto da própria condição acima do teto dela |
| 24 | `ALERTA_EXIBIDO_AO_OPERADOR` | Composição do `vendaStore` (AD-280), ouvindo `notificar` | `{ nivel: 'ERRO' \| 'AVISO', mensagem: string }` — toda frase de erro ou aviso que o operador lê num toast, inclusive o clique num controle bloqueado (`acaoBloqueavel`) e a tecla recusada; `mensagem` é o texto exato exibido. **Alerta, não recusa**: pelo contrato de `notificar`, o aviso pode acompanhar um gesto que aconteceu (capa ajustada, reprecificação que falhou), e o `nivel` diz qual era. Fica de fora sem sessão de venda aberta (histórico vazio) e com o `Log` já a caminho do ERP (`logEmEnvio`): no sucesso o histórico é descartado, e o alerta nunca chegaria lá. Convive com os eventos estruturados (14, 15, 18 e o valor pedido de 7, 8 e 23): aqueles registram o fato, este o que foi dito ao operador |

### Regras de estado (state machine do slice)

- **Zerado** → só no evento `VENDA_INICIADA` (início de venda nova ou retomada de rascunho/DAV). Nunca herda eventos de uma sessão anterior (FR-008).
- **Acumulando** → todo evento subsequente é `push`ado ao final do array na ordem em que ocorre. **A ordem autoritativa é a posição no próprio array (ordem de inserção via `push`), não o valor de `timestamp`**: o carimbo (`instanteLocalIso()`, AD-280) tem resolução de milissegundo, e dois eventos originados no mesmo milissegundo real (ex.: duas bipagens de código de barras em sequência rápida, produzindo dois `PRODUTO_INSERIDO`; ou dois `push` disparados no mesmo frame) recebem `timestamp` **iguais**. A sequência de `timestamp` é, portanto, **não-decrescente** — nunca estritamente crescente. O ERP deve tratar a ordem do array como autoritativa ao ler o campo `Log`, não reordenar por `timestamp`.
- **Enviado, descartado** → após `FaturarNFCe` retornar sucesso (`FATURAR` ou `SUSPENDER`), o array é serializado para `Log` e o slice é resetado junto com carrinho/cache (FR-007).
- **Enviado, preservado** → se `FaturarNFCe` falhar por rede, o evento `FATURAMENTO_FALHOU` é adicionado ao array e o slice **não** é resetado — a próxima tentativa reenvia o array completo, incluindo a falha anterior (FR-006, AUDIT-09 — catálogo de invariantes em `.specs/features/auditoria-acoes-operador/spec.md`, linha 87).

## Histórico de Auditoria da Venda (`HistoricoAuditoriaVenda`)

```ts
type HistoricoAuditoriaVenda = EventoAuditoria[];
```

Coleção ordenada, sem identificador próprio — é um campo do slice `auditoria` dentro do store de venda, não uma entidade persistida com chave própria (Constitution VI: sem estado de venda persistido no cliente).

## Validação

Não se aplica Zod — nenhum destes dados cruza uma fronteira externa entrando na aplicação (todo evento é gerado internamente, a partir de dados já validados por sua feature de origem). A única saída de fronteira é a serialização de `Log` no payload de `FaturarNFCe`, coberta pelo contrato em `contracts/auditoria-events.md`.
