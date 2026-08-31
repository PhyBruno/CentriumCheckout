# Data Model: Auditoria de Ações do Operador

## Evento de Auditoria (`EventoAuditoria`)

União TypeScript discriminada por `tipo`. Todo evento tem a base:

```ts
interface EventoAuditoriaBase<TTipo extends string, TDetalhes> {
  tipo: TTipo;
  timestamp: string; // ISO 8601, new Date().toISOString() — ver research.md #2
  detalhes: TDetalhes;
}
```

Os nomes de campo dentro de `detalhes` (`codigoCliente`, `codigoVendedor`, `codigoProduto`, etc.) são identificadores internos do Checkout (camelCase), não necessariamente os nomes de campo brutos do contrato do ERP (que seguem convenção GeneXus, ex. `CadCliCod`) — a normalização desses valores é responsabilidade da feature de origem (cliente/vendedor/carrinho/pagamento), que já os recebe tipados de suas próprias chamadas ao ERP antes de montar o `detalhes` do evento.

### Catálogo de tipos (20)

| # | `tipo` | Origem (feature) | `detalhes` |
|---|---|---|---|
| 1 | `VENDA_INICIADA` | Esta feature (chamado no bootstrap de uma nova sessão de venda) | `{ origem: 'NOVA' \| 'RASCUNHO' \| 'DAV' }` |
| 2 | `CLIENTE_SELECIONADO` | 005-identificacao-cadastro-cliente | `{ codigoCliente: number, nome: string }` |
| 3 | `CLIENTE_CRIADO` | 005-identificacao-cadastro-cliente | `{ codigoCliente: number, nome: string }` |
| 4 | `CLIENTE_TROCADO` | 005-identificacao-cadastro-cliente | `{ codigoClienteAnterior: number, codigoClienteNovo: number }` |
| 5 | `VENDEDOR_SELECIONADO` | 012-selecao-vendedor | `{ codigoVendedor: number, nome: string }` |
| 6 | `VENDEDOR_TROCADO` | 012-selecao-vendedor | `{ codigoVendedorAnterior: number, codigoVendedorNovo: number }` |
| 7 | `PRODUTO_INSERIDO` | 003-carrinho-produto-precificacao | `{ codigoProduto: string, quantidade: number, precoUnitario: number, desconto: number }` (`precoUnitario`/`desconto` em centavos inteiros — Constitution V). `precoUnitario` é a base **unitária**; `desconto` é absoluto e referente ao **total da linha**, não por unidade (ver `specs/003-carrinho-produto-precificacao/data-model.md`, §1) |
| 8 | `PRODUTO_ALTERADO` | 003-carrinho-produto-precificacao | `{ codigoProduto: string, campo: string, valorAnterior: unknown, valorNovo: unknown }` |
| 9 | `PRODUTO_CANCELADO` | 003-carrinho-produto-precificacao | `{ codigoProduto: string }` |
| 10 | `CONDICAO_PAGAMENTO_APLICADA` | 008-pagamento-geral | `{ condicao: string }` |
| 11 | `FORMA_PAGAMENTO_APLICADA` | 008-pagamento-geral | `{ formaPagamento: string, valor: number }` (centavos inteiros) |
| 12 | `FORMA_PAGAMENTO_REMOVIDA` | 008-pagamento-geral | `{ formaPagamento: string }` |
| 13 | `VALE_DEVOLUCAO_USADO` | 008-pagamento-geral | `{ codigoVale: string, valor: number }` (centavos inteiros) |
| 14 | `PAGAMENTO_RECUSADO` | 008-pagamento-geral / 009-pagamento-pix / 010-pagamento-tef | `{ tipo: string, motivo?: string }` |
| 15 | `FATURAMENTO_FALHOU` | 004-finalizacao-suspensao-venda | `{ operacao: 'FATURAR' \| 'SUSPENDER' }` |
| 16 | `VENDA_FINALIZADA` | 004-finalizacao-suspensao-venda | `{}` |
| 17 | `VENDA_SUSPENSA` | 004-finalizacao-suspensao-venda | `{}` |
| 18 | `VALIDACAO_VENDA_RECUSADA` | 014-validacao-previa-nfce | `{ origem: 'MANUAL' \| 'ATALHO_CENARIO', condicao: string, formaPagamento: string, motivo: string }` — registra recusa por regra de negócio **e** indisponibilidade do ERP; avisos (`Valido = true` com mensagem) **não** são registrados (AD-113) |
| 19 | `VENDA_RAPIDA_ACIONADA` | 013-venda-rapida-cenario-pagamento | `{ tecla: 'F6' \| 'F7' \| 'F8' \| 'F9', cenarioNome: string, condicaoCodigo: number, formaCodigo: number, valorLancado: number, finalizacaoAutomatica: boolean }` (`valorLancado` em centavos inteiros) — um evento por acionamento que alterou a venda; acionamento recusado em G1–G4 (`specs/013-.../data-model.md`) não gera evento (I12 da feature 013) |
| 20 | `DAV_IMPORTADO` | 006-importacao-dav | `{ numeroDav: string, numeroNota: number, quantidadeLinhas: number, quantidadeFormasDePagamento: number }` — disparado uma única vez ao final de `importarVendaExistente`, depois que carrinho/cliente/vendedor/pagamento já foram populados (AD-114); `numeroDav` só existe nesta trilha — não é reenviado a `FaturarNFCe` (AD-107) |

### Regras de estado (state machine do slice)

- **Zerado** → só no evento `VENDA_INICIADA` (início de venda nova ou retomada de rascunho/DAV). Nunca herda eventos de uma sessão anterior (FR-008).
- **Acumulando** → todo evento subsequente é `push`ado ao final do array na ordem em que ocorre (ordem cronológica estritamente crescente por `timestamp`).
- **Enviado, descartado** → após `FaturarNFCe` retornar sucesso (`FATURAR` ou `SUSPENDER`), o array é serializado para `Log` e o slice é resetado junto com carrinho/cache (FR-007).
- **Enviado, preservado** → se `FaturarNFCe` falhar por rede, o evento `FATURAMENTO_FALHOU` é adicionado ao array e o slice **não** é resetado — a próxima tentativa reenvia o array completo, incluindo a falha anterior (FR-006, AUDIT-09 — catálogo de invariantes em `.specs/features/auditoria-acoes-operador/spec.md`, linha 87).

## Histórico de Auditoria da Venda (`HistoricoAuditoriaVenda`)

```ts
type HistoricoAuditoriaVenda = EventoAuditoria[];
```

Coleção ordenada, sem identificador próprio — é um campo do slice `auditoria` dentro do store de venda, não uma entidade persistida com chave própria (Constitution VI: sem estado de venda persistido no cliente).

## Validação

Não se aplica Zod — nenhum destes dados cruza uma fronteira externa entrando na aplicação (todo evento é gerado internamente, a partir de dados já validados por sua feature de origem). A única saída de fronteira é a serialização de `Log` no payload de `FaturarNFCe`, coberta pelo contrato em `contracts/auditoria-events.md`.
