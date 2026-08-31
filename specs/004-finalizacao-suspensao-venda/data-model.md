# Phase 1 — Data Model: Finalização e Suspensão da Venda

**Feature**: `specs/004-finalizacao-suspensao-venda/` | **Date**: 2026-08-26

Todas as estruturas abaixo vivem **em memória**: o slice `identidadeVenda` no `vendaStore` (Zustand + Immer, sem `persist` — Constitution VI/AD-006) e o estado de envio como estado local do hook orquestrador. Nada aqui é gravado em Dexie/`localStorage`/IndexedDB, e nada sobrevive a F5.

---

## 1. Identidade da Venda (`identidadeVenda`, novo slice — ver `research.md`, D1)

```ts
interface IdentidadeVenda {
  origem: 'NOVA' | 'RASCUNHO' | 'DAV';
  numeroNota: number; // inteiro >= 0
}
```

| Campo | Regra |
|---|---|
| `origem` | Mesmo enum já usado pelo evento `VENDA_INICIADA` do slice `auditoria` (`specs/001-auditoria-acoes-operador/data-model.md`) — setado uma única vez, no início/retomada da venda. |
| `numeroNota` | `0` para venda criada do zero no Checkout (nunca faturada); valor preenhido, vindo de `CarregarNFCe` ou do fluxo de DAV, quando a venda é um rascunho/nota pré-existente (AD-023). Enviado como `NumeroNota` no payload de `FaturarNFCe` sem transformação — o Checkout nunca calcula nem infere esse número. |

**State transitions**: `ausente` → `definida` (setter chamado no início/retomada da venda, mesmo call site de `resetarAuditoria`) → `descartada` (após `FaturarNFCe` retornar sucesso, junto com carrinho/cache/auditoria — `FR-012`).

---

## 2. Payload de Requisição — `CheckoutFaturarNFCe` (corpo de `POST /api/erp/FaturarNFCe`)

Contrato completo em `contracts/faturamento-api.md`. **Emenda de 2026-08-31 (AD-111, feature 014):** o payload não é mais montado por uma função exclusiva desta feature — `montarPayloadFaturarNFCe` virou `src/client/domain/venda/montarRetratoVenda.ts`, compartilhado com a validação prévia (`ValidarNFCe`), parametrizado por operação (`'FATURAR' | 'SUSPENDER' | 'VALIDAR'`) e pela lista de pagamentos a considerar. Os campos abaixo continuam sendo os que esta feature fornece como entrada para essa função; o que muda é que o retrato enviado ao gate e o retrato emitido passam a ser garantidamente idênticos (exceto `SuspenderOuFaturar`), por construção. Campos que **esta feature** é responsável por preencher:

| Campo | Tipo | Origem |
|---|---|---|
| `SuspenderOuFaturar` | `"FATURAR"` \| `"SUSPENDER"` | Botão acionado (`BotaoFinalizarVenda`/`BotaoCancelarVenda`) |
| `Empresa` | `int64` | Injetado pelo BFF (mesmo padrão de todo endpoint `/api/erp/*`) |
| `NumeroNota` | `int64` | `identidadeVenda.numeroNota` (§1) |
| `CadSerieNFCe` | `string` | `SessaoUsuario.CadSerieNFCe` (bootstrap, feature 002, AD-034) — leitura, esta feature não grava esse campo |
| `vendedorCodigo` | `int64` | Vendedor selecionado no modal de vendedor (feature 012, `VEND-05`) — dependência lida, não escrita por esta feature |
| `Log` | `string` | `serializarLogAuditoria(eventos)` (`specs/001-auditoria-acoes-operador/contracts/auditoria-events.md`) |

Campos que **outras features** já possuem e que esta feature só repassa sem transformar: `produtos[]` (itens do carrinho, feature 003) e os campos de pagamento (feature 008, ainda não planejada — referenciados aqui só como dependência declarada, sem shape definido por este plano).

---

## 3. Resposta de Sucesso — `NotaFiscal` (subconjunto relevante de `CheckoutFaturarNFCeOutput`)

```ts
interface NotaFiscalResposta {
  PDFImpressao: string; // base64 — presente sempre que a NFCe é autorizada (AD-024)
  XMLImpressao: string; // texto XML — mesma origem, usado pela impressão direta (AD-083)
}
```

Validado por `src/shared/schemas/faturarNFCe.schema.ts` (Zod, Constitution IV) antes de entrar no fluxo de decisão de impressão (§5). Uma resposta de sucesso sem esses dois campos preenchidos é erro de fronteira — trata-se como falha de negócio (§4), nunca como sucesso parcial.

---

## 4. Estado de Envio (máquina de estados do hook `useFinalizarOuSuspenderVenda`)

```ts
type EstadoEnvio =
  | { tipo: 'ocioso' }
  | { tipo: 'enviando'; operacao: 'FATURAR' | 'SUSPENDER' }
  | { tipo: 'sucesso'; notaFiscal: NotaFiscalResposta }
  | { tipo: 'falha-negocio'; mensagem: string }
  | { tipo: 'falha-rede'; operacao: 'FATURAR' | 'SUSPENDER' }; // aguardando confirmação manual, AD-038
```

**Emenda de 2026-08-31 (AD-113, feature 014):** para `operacao = 'FATURAR'`, a transição `ocioso` → `enviando` exige `podeFinalizar() === true` (veredito favorável vigente da validação prévia, obtido na última inserção de pagamento aceita) — sem essa pré-condição, o botão "Finalizar Venda" fica bloqueado e nenhuma requisição é disparada (`FR-014`). Não há nova consulta ao ERP neste ponto. `operacao = 'SUSPENDER'` **não** tem essa pré-condição (`FR-016`).

| Transição | Gatilho | Efeito |
|---|---|---|
| `ocioso` → `enviando` | Operador aciona "Finalizar Venda"/"Cancelar Venda", ou confirma reenvio a partir de `falha-negocio` | Dispara a mutation — para `FATURAR`, só após `podeFinalizar()` (ver acima) |
| `enviando` → `sucesso` | `FaturarNFCe` retorna 2xx com `NotaFiscal` válida | Descarta carrinho + cache de produto + auditoria + `identidadeVenda` (`FR-012`); decide mecanismo de impressão (§5) |
| `enviando` → `falha-negocio` | `FaturarNFCe` retorna erro com resposta HTTP (ver `research.md`, D2) | Exibe erro; `ocioso` liberado para nova tentativa sem exigir confirmação extra |
| `enviando` → `falha-rede` | `fetch` rejeita sem resposta (ver `research.md`, D2) | Bloqueia novo envio até confirmação manual (`FR-004`); o log de auditoria acumulado **não** é descartado — evento `FATURAMENTO_FALHOU` é anexado (contrato da feature 001) |
| `falha-rede` → `enviando` | Operador confirma explicitamente, via `DialogoConfirmarReenvio`, que uma tentativa anterior não teve retorno | Reenvia o **mesmo** payload recomposto (o log de auditoria já inclui o evento de falha anterior) |

**Invariante**: nenhuma transição para `sucesso` ocorre sem que a resposta tenha passado pela validação Zod de §3 — uma resposta 2xx com corpo inválido é tratada como `falha-negocio`, nunca como sucesso silencioso (Constitution IV).

---

## 5. Mecanismo de Impressão (decisão pura — `decidirMecanismoImpressao`)

```ts
function decidirMecanismoImpressao(tipoImpressao: 'E' | 'P'): 'direta' | 'pdf';
```

| `SessaoUsuario.TipoImpressao` | Resultado | Comportamento subsequente |
|---|---|---|
| `'E'` | `'direta'` | `imprimirNFCeLocal(xmlImpressao, cadMaqHost)` — sucesso: nada mais a fazer. Falha (rede ou bloqueio de navegador, ver `research.md`, D5): oferece o PDF como fallback |
| `'P'` | `'pdf'` | Exibe/oferece download do `PDFImpressao` diretamente, sem tentar o serviço local |

Qualquer valor de `TipoImpressao` fora de `{'E', 'P'}` é erro de fronteira (Constitution IV) — tratado no schema Zod de `SessaoUsuario` (feature 002), não reinterpretado aqui com um terceiro comportamento silencioso.

---

## 6. `GetStatusSistema` — Estado de Polling (`pollingStatusSistema`)

```ts
interface ParametrosStatusSistema {
  Empresa: number;     // codigoEmpresa, injetado pelo BFF
  Cadmaqcod: string;   // SessaoUsuario.CadMaqCod (AD-088)
}
```

| Estado | Condição | Ação |
|---|---|---|
| Ativo | Carrinho vazio **e** nenhum cliente identificado (leitura das features 003/005, `FR-013`) | `GET /api/erp/GetStatusSistema` a cada 60s |
| Suspenso | Existe item no carrinho **ou** cliente identificado | Nenhuma chamada — intervalo pausado, não só ignorado (evita chamada supérflua durante venda ativa) |
| Mudança detectada | Resposta `>= 1` | Chama `refetchBootstrap()` (feature 002) para atualizar `SessaoUsuario` local por completo |
| Sem mudança | Resposta `0` | Nenhuma ação |

Este módulo não persiste nenhum estado próprio além do `intervalId` do polling em si (efeito de React, não dado de domínio) — não há entidade nova a modelar além dos parâmetros da chamada.

---

## Dependências declaradas, não implementadas por este plano

| Dependência | Feature dona | Uso nesta feature |
|---|---|---|
| `temPagamentoNaoRemovivel(): boolean` | 008 (pagamento, ainda não planejada) | Bloqueia `SUSPENDER` (`FR-005`/`FR-006`) — ver `research.md`, D7 |
| `vendedorCodigo` selecionado | 012 (seleção de vendedor, ainda não planejada) | Campo `vendedorCodigo` do payload (§2) |
| `refetchBootstrap()` | 002 (`bootstrapClient.ts`, já planejada) | Chamado pelo polling de `GetStatusSistema` (§6) quando detecta mudança |
| Setter de `identidadeVenda` ao carregar rascunho/DAV | 006 (DAV) / 011 (recuperação de NFCe), ainda não planejadas | Popula `identidadeVenda` (§1) fora do fluxo "venda nova" |
| `podeFinalizar(): boolean` | 014 (validação prévia da venda, `specs/014-validacao-previa-nfce/`) | **Acrescentado em 2026-08-31 (AD-113).** Pré-condição da transição `ocioso` → `enviando` para `FATURAR` (§4) — só finaliza com veredito favorável vigente, sem revalidar aqui |
| `montarRetratoVenda(snapshot, operacao, pagamentos)` | 014 (`src/client/domain/venda/montarRetratoVenda.ts`) | **Acrescentado em 2026-08-31 (AD-111).** Substitui a montagem de payload que antes era exclusiva desta feature (§2) — módulo compartilhado com a validação prévia |
