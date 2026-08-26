# Contract: API interna do módulo de Auditoria

Este é o contrato que as demais features (003, 004, 005, 008, 009, 010, 012) consomem para disparar eventos de auditoria. Não é uma API HTTP — é a superfície pública do módulo `src/client/domain/auditoria/` + `src/client/stores/slices/auditoriaSlice.ts` (ver `plan.md`, "Project Structure").

## Dispatcher

```ts
// src/client/stores/slices/auditoriaSlice.ts
function registrarEventoAuditoria(evento: EventoAuditoriaSemTimestamp): void;
```

- `EventoAuditoriaSemTimestamp` = `Omit<EventoAuditoria, 'timestamp'>` — quem chama não fornece o `timestamp`; o slice atribui `new Date().toISOString()` no momento do `push`, garantindo ordem cronológica estritamente crescente mesmo se o call site atrasar.
- Chamada síncrona, sem retorno — o call site de negócio (ex.: "cliente selecionado") não precisa aguardar nem tratar erro; é um `push` em memória.
- Cada feature de negócio usa as factory functions tipadas de `src/client/domain/auditoria/eventos.ts` (uma por `tipo`, ver `data-model.md`) para montar o `evento` antes de passar ao dispatcher — evita montar o objeto literal solto em cada call site.

## Ciclo de vida

```ts
function resetarAuditoria(origem: 'NOVA' | 'RASCUNHO' | 'DAV'): void; // zera o array e já registra VENDA_INICIADA
function descartarAuditoria(): void; // esvazia o array sem registrar evento — só chamado após entrega bem-sucedida ao ERP
```

- `resetarAuditoria` é chamado uma única vez, no início/retomada de uma sessão de venda (mesmo call site que zera o carrinho) — nunca no meio de uma venda em andamento.
- `descartarAuditoria` é chamado só pela feature 004 (finalização/suspensão), depois de `FaturarNFCe` retornar sucesso — mesmo call site que já limpa carrinho e cache de produtos (`FIN-04`/`FIN-06`). Uma falha de rede **não** chama `descartarAuditoria`.

## Serialização para o campo `Log`

```ts
// src/client/domain/auditoria/serializarLog.ts
function serializarLogAuditoria(eventos: HistoricoAuditoriaVenda): string;
```

- Implementação: `JSON.stringify(eventos)`.
- Consumido exclusivamente pela feature 004 ao montar o payload de `POST /ApiCentriumOAuth/FaturarNFCe`:

```jsonc
// corpo de CheckoutFaturarNFCe (trecho relevante — campo Log confirmado em
// ApiCentriumOAuth.yaml, info.version 20260825172440, linha 1432, AD-061)
{
  "SuspenderOuFaturar": "FATURAR", // ou "SUSPENDER"
  "NumeroNota": "...",
  "CadSerieNFCe": "...",
  "vendedorCodigo": "...",
  "Log": "[{\"tipo\":\"VENDA_INICIADA\",\"timestamp\":\"2026-08-26T17:32:07.123Z\",\"detalhes\":{\"origem\":\"NOVA\"}}, ...]"
  // ... demais campos de CheckoutFaturarNFCe, fora do escopo desta feature
}
```

- `Log` é sempre uma string JSON válida, round-trip parseável de volta ao array original (`JSON.parse(logRecebido)` reproduz a mesma estrutura de `data-model.md`).
- Em retentativa após falha de rede, o mesmo `serializarLogAuditoria` é chamado de novo sobre o array já acrescido do evento `FATURAMENTO_FALHOU` — o `Log` da tentativa seguinte é estritamente maior que o da tentativa que falhou, nunca reiniciado.
