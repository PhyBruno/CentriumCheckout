# Contract: API interna do domínio de Validação Prévia e do slice `validacaoVenda`

Superfície pública que as demais features consomem. Não é API HTTP — é o contrato dos módulos `src/client/domain/validacaoVenda/`, `src/client/domain/venda/` e `src/client/stores/slices/validacaoVendaSlice.ts`.

Mesma divisão das features 003, 004 e 008: **domínio puro** (sem React, Zustand, rede) ↔ **slice** (orquestra) ↔ **serviço** (rede) ↔ **UI** (notificação).

---

## 1. Domínio puro

### `src/client/domain/venda/montarRetratoVenda.ts` *(compartilhado com a feature 004)*

```ts
export type OperacaoVenda = 'FATURAR' | 'SUSPENDER' | 'VALIDAR';

export function montarRetratoVenda(
  snapshot: SnapshotVenda,                       // carrinho, cliente, vendedor, identidade, sessão, log
  operacao: OperacaoVenda,
  pagamentos: readonly PagamentoParaPayload[],   // aplicados, ou aplicados + candidata
): CheckoutFaturarNFCe;
```

Substitui `montarPayloadFaturarNFCe` da feature 004 (`research.md`, D3). Função pura e total; recebe snapshots já prontos, não conhece store nem rede.

**Contrato**: para o mesmo `snapshot` e a mesma lista de pagamentos, `montarRetratoVenda(s, 'VALIDAR', p)` e `montarRetratoVenda(s, 'FATURAR', p)` diferem **apenas** em `SuspenderOuFaturar`. É o que sustenta I5 de `data-model.md`, e é verificado por teste.

### `src/client/domain/validacaoVenda/projetarPagamentos.ts`

```ts
export function projetarPagamentos(
  aplicados: readonly PagamentoAplicado[],
  candidata: FormaCandidata,
): readonly PagamentoParaPayload[];
```

Produz a lista "como ficaria" (`FR-002`). Pura; não muta a lista de origem. `FormaCandidata` carrega obrigatoriamente `fpgUtiCar` e `entrada` — sem eles o ERP não avalia crediário (ver `erp-validacao-api.md`).

### `src/client/domain/validacaoVenda/interpretarVeredito.ts`

```ts
export function interpretarRespostaValidacao(resposta: ValidarNFCeOutput): Veredito;
export function vereditoDeFalha(causa: CausaIndisponibilidade): Veredito;
export function autorizaFinalizacao(veredito: Veredito | null): boolean;
```

Contrato de comportamento:

1. Ramifica **exclusivamente** em `resposta.Valido` (`FR-006`). `Type` nunca entra na decisão.
2. `Valido = false` sem mensagens ⇒ `RECUSADA` com uma mensagem genérica de recusa (`FR-008`).
3. `Valido = true` com mensagens ⇒ `ACEITA` com todas elas como avisos, na ordem recebida (`FR-005`/`FR-007`).
4. `autorizaFinalizacao(null)` é `false`; só `ACEITA` autoriza (`FR-015`).

---

## 2. Serviço — `src/client/services/validacao/`

```ts
// validarNFCeMutation.ts
export function useValidarNFCe(): {
  validar(retrato: CheckoutFaturarNFCe): Promise<Veredito>;
};
```

- TanStack **mutation**, não query: disparada por gesto, sem cache e sem refetch (`research.md`, D10).
- `retry: 0` e timeout explícito (`research.md`, D5).
- Toda falha é convertida em `vereditoDeFalha(...)` — a função **nunca** rejeita a promise, para que nenhum call site precise de `try/catch` para manter I4.
- Valida a resposta com `validarNFCeOutputSchema` antes de interpretar (Constitution IV).

---

## 3. Slice — `src/client/stores/slices/validacaoVendaSlice.ts`

```ts
export type OrigemAcionamento = 'MANUAL' | 'ATALHO_CENARIO';

export interface ValidacaoVendaSlice {
  vereditoVigente: Veredito | null;
  emValidacao: boolean;

  validarInsercao(candidata: FormaCandidata, origem: OrigemAcionamento): Promise<Veredito>;
  invalidarVeredito(): void;

  // seletor
  podeFinalizar(): boolean;
}
```

**`origem` — achado do `/speckit-analyze` de 2026-09-01 (I1)**: o evento `VALIDACAO_VENDA_RECUSADA` (`data-model.md`, tipo 18 do catálogo de `specs/001-auditoria-acoes-operador/data-model.md`) exige o caminho de acionamento, e só o chamador sabe qual foi. `origem` **não** é passado explicitamente pelas UIs de 008/013 — cada um dos dois pontos de entrada já existentes em `pagamentoSlice.ts` (008) embute o literal correspondente ao chamar `validarInsercao`: `aplicarPagamento` (botão da tela de pagamento) sempre passa `'MANUAL'`; `aplicarForma` (porta consumida pelo atalho de cenário da feature 013, `contracts/venda-rapida-domain-api.md` §4) sempre passa `'ATALHO_CENARIO'`. Nenhuma das duas assinaturas públicas (`aplicarPagamento(input)`, `aplicarForma(codigo, valor)`) muda — a distinção fica inteiramente dentro de `pagamentoSlice.ts`.

### Dependências injetadas (Dependency Inversion)

```ts
interface ValidacaoDeps {
  snapshotVenda(): SnapshotVenda;                       // features 001/002/003/005/012
  pagamentosAplicados(): readonly PagamentoAplicado[];  // feature 008
  validar(retrato: CheckoutFaturarNFCe): Promise<Veredito>;  // serviço
  registrarEvento(evento: EventoAuditoria): void;       // feature 001
}
```

O slice **não importa** o slice de pagamento, o de carrinho, nem os módulos de PIX/TEF.

### Contrato de comportamento

| Action | Pré-condição | Efeito | Auditoria |
|---|---|---|---|
| `validarInsercao` | `emValidacao === false` — caso contrário devolve imediatamente o veredito de "ocupado" sem consultar (`FR-011`, I8) | Projeta a candidata, monta o retrato, consulta, interpreta. `ACEITA` ⇒ grava `vereditoVigente`; `RECUSADA`/`INDISPONIVEL` ⇒ **não** toca `vereditoVigente` (o anterior, se houver, também não é apagado — a venda não mudou) | `VALIDACAO_VENDA_RECUSADA` em `RECUSADA` e `INDISPONIVEL`, com `origem` ecoado do parâmetro |
| `invalidarVeredito` | — | `vereditoVigente = null` | — |
| `podeFinalizar` | — | `autorizaFinalizacao(vereditoVigente)` | — |

---

## 4. UI — `src/client/features/validacao/notificarVeredito.ts`

```ts
export function notificarVeredito(veredito: Veredito, toast: GoeyToast): void;
```

| Veredito | Notificação |
|---|---|
| `ACEITA` sem avisos | nenhuma |
| `ACEITA` com avisos | uma notificação de **aviso** por mensagem, texto íntegro do ERP, auto-dismiss |
| `RECUSADA` | uma notificação de **erro** por mensagem (ou a genérica de `FR-008`) |
| `INDISPONIVEL` | notificação de **erro** com texto próprio do Checkout, distinto de recusa de negócio, convidando a nova tentativa (`FR-009`) |

Não há tela, modal ou área dedicada — decisão do usuário (2026-08-31): avisos são notificação, não banner persistente.

---

## 5. O que as outras features passam a consumir/fornecer

| Feature | Fornece a esta | Consome desta |
|---|---|---|
| **008 — pagamento** | forma candidata (com `fpgUtiCar`/`entrada`), condição vigente, pagamentos aplicados | `validarInsercao` e `invalidarVeredito` **injetados** no `pagamentoSlice`; `aplicarPagamento` só muta após `ACEITA` |
| **004 — finalização** | `montarRetratoVenda` (generalizado) e o `SnapshotVenda` | `podeFinalizar()` como pré-condição da emissão; `limparPagamentos` também zera o veredito |
| **013 — venda rápida** | — | nada diretamente: o atalho chama `aplicarPagamento` da 008; recusa aborta a finalização automática |
| **009/010 — PIX/TEF** | — | nada: continuam reagindo ao roteamento da 008, alcançado só após aceite (I9) |
| **001 — auditoria** | `registrarEvento` | novo tipo `VALIDACAO_VENDA_RECUSADA` |
