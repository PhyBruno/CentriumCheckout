# Contract: API interna do módulo de Auditoria

Este é o contrato que as demais features (003, 004, 005, 006, 008, 009, 010, 012, 013, 014) consomem para disparar eventos de auditoria. Não é uma API HTTP — é a superfície pública do módulo `src/client/domain/auditoria/` + `src/client/stores/slices/auditoriaSlice.ts` (ver `plan.md`, "Project Structure"). **Acrescentado em 2026-08-31**: 013 (venda rápida) dispara `VENDA_RAPIDA_ACIONADA`; 014 (validação prévia) dispara `VALIDACAO_VENDA_RECUSADA`; 006 (importação de DAV) dispara `DAV_IMPORTADO`, achado durante `/speckit-tasks` da 006 (AD-114) — ver `data-model.md`, tipos 18–20.

## Dispatcher

```ts
// src/client/stores/slices/auditoriaSlice.ts
function registrarEventoAuditoria(evento: EventoAuditoriaRegistravel): void;
```

- `EventoAuditoriaSemTimestamp` e `EventoAuditoriaRegistravel` são tipos **exportados por `src/client/domain/auditoria/eventos.ts`** — importe-os de lá, não reescreva a fórmula. Ambos são construídos com `Omit` **distributivo** sobre a união discriminada `EventoAuditoria` (aplicado membro a membro, ex. `T extends unknown ? Omit<T, 'timestamp'> : never`), não um `Omit<EventoAuditoria, 'timestamp'>` direto: `Omit` direto sobre uma união de 20 membros colapsa a união nas chaves comuns e **perde a discriminação por `tipo`**, permitindo combinar em compilação o `tipo` de um evento com o `detalhes` de outro — por isso ninguém deve "simplificar" essa fórmula de volta a um `Omit` direto.
- `EventoAuditoriaRegistravel` é, além disso, `EventoAuditoriaSemTimestamp` **menos** o membro `VENDA_INICIADA` — é o tipo que `registrarEventoAuditoria` aceita. `VENDA_INICIADA` é privativo de `resetarAuditoria` (ver "Ciclo de vida", abaixo): nenhuma feature de negócio deve registrá-lo por conta própria via `registrarEventoAuditoria`, sob pena de produzir esse evento no meio do histórico sem zerar o array — violação silenciosa de FR-002, invisível porque a feature não tem tela de revisão (FR-009).
- Quem chama não fornece o `timestamp`; o slice atribui `new Date().toISOString()` no momento do `push`. Essa atribuição tem resolução de milissegundo: dois eventos originados no mesmo milissegundo real recebem `timestamp` iguais. **A ordem autoritativa é a posição no array** (ordem de inserção via `push`), não o valor de `timestamp`, que é não-decrescente — nunca estritamente crescente.
- Chamada síncrona, sem retorno — o call site de negócio (ex.: "cliente selecionado") não precisa aguardar nem tratar erro; é um `push` em memória.
- Cada feature de negócio usa as factory functions tipadas de `src/client/domain/auditoria/eventos.ts` (uma por `tipo`, ver `data-model.md`) para montar o `evento` antes de passar ao dispatcher — evita montar o objeto literal solto em cada call site.

## Ciclo de vida

```ts
function resetarAuditoria(origem: 'NOVA' | 'RASCUNHO' | 'DAV'): void; // zera o array e já registra VENDA_INICIADA
function descartarAuditoria(): void; // esvazia o array sem registrar evento — só chamado após entrega bem-sucedida ao ERP
```

- `resetarAuditoria` é chamado uma única vez, no início/retomada de uma sessão de venda (mesmo call site que zera o carrinho) — nunca no meio de uma venda em andamento. É o **único** produtor de `VENDA_INICIADA`: esse evento não pertence a `EventoAuditoriaRegistravel` (ver "Dispatcher", acima), então nenhum call site de feature de negócio consegue registrá-lo diretamente via `registrarEventoAuditoria`.
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
