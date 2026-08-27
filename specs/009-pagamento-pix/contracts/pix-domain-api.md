# Contract: API interna do módulo de PIX

Superfície pública que o modal PIX consome. Não é uma API HTTP — é o contrato de `src/client/domain/pix/` (puro) e `src/client/services/pix/` (query/rede), ver `plan.md`, "Project Structure".

Mesma divisão da feature 008/003: **domínio puro** (sem React, sem rede) e **camada de query** (TanStack Query, chama `contracts/erp-pix-api.md`).

---

## 1. Domínio puro — `src/client/domain/pix/`

### `interpretarStatusPix.ts`

```ts
export type ResultadoStatusPix =
  | { readonly situacao: 'PENDENTE' }
  | { readonly situacao: 'APROVADO' }
  | { readonly situacao: 'FALHA_TERMINAL'; readonly motivo: 'EXPIRADA' | 'RECUSADA' | 'ERRO' | 'DESCONHECIDO' };

export function interpretarStatusPix(statusTransacao: string): ResultadoStatusPix;
```

Função pura e total — nunca lança, nunca devolve `APROVADO` fora do caso exato `'PagamentoRecebido'` (`data-model.md` §2, invariante J2).

### `validarValorMinimoPix.ts`

```ts
export function validarValorMinimoPix(
  saldoRestante: Centavos,
  minimoPix: Centavos,
): { readonly ok: true } | { readonly ok: false };
```

Implementa `research.md` D13. `minimoPix` já convertido de `ConfiguracoesPIX.MinimoPix` (`double`) para `Centavos` na fronteira Zod do bootstrap (mesmo schema da feature 008).

### `montarDadosPagador.ts`

```ts
export function montarDadosPagador(clienteAtual: ClienteVenda | null): DadosPagadorPix;
```

- `clienteAtual?.nome ?? ''`, `clienteAtual?.documento ?? ''` (`research.md`, D7/AD-100).
- `email`/`telefone` sempre `''` — gap documentado, não uma omissão silenciosa (`research.md`, D7).
- `clienteAtual === null` só é possível quando a empresa nunca configurou cliente default e o operador ainda não selecionou nenhum (`ClienteState.clienteAtual`, feature 005, I1) — `montarDadosPagador` trata esse caso devolvendo todos os campos vazios, sem lançar; o bloqueio de "venda sem cliente" (se existir) é responsabilidade de outra feature, não desta função.

---

## 2. Camada de query — `src/client/services/pix/`

```ts
export function useGerarPix(): {
  gerar(input: DadosGerarPix): Promise<CobrancaPix>;
  status: 'idle' | 'gerando' | 'erro';
  erro: string | null;
};

export function useStatusPix(trnGuid: string, habilitado: boolean): {
  resultado: ResultadoStatusPix | null; // null enquanto a primeira consulta não voltou
  isLoading: boolean;
};
```

- `useGerarPix().gerar` chama `contracts/erp-pix-api.md` §1; em erro, expõe `status: 'erro'` e `erro` para o toast de retry (`research.md`, D12) — o call site decide gerar novo `TrnGUID` e chamar `gerar` de novo.
- `useStatusPix` é `useQuery` com `refetchInterval: habilitado ? 10_000 : false` (`research.md`, D9) sobre `contracts/erp-pix-api.md` §2, já passando a resposta por `interpretarStatusPix`.

---

## 3. Consumo pelo componente `ModalPix`

```ts
interface ModalPixProps {
  readonly formaCodigo: number;
  readonly saldoRestante: Centavos;
  readonly minimoPix: Centavos;
  readonly clienteAtual: ClienteVenda | null;
  readonly onAprovado: (pixGuid: string) => void;   // chama confirmarPagamentoIntegrado (008)
  readonly onAbandonado: (motivo: string) => void;  // chama recusarPagamentoIntegrado (008)
  readonly onFechar: () => void;
}
```

`ModalPix` não importa o slice de pagamento nem o carrinho diretamente — recebe tudo por prop (Dependency Inversion, mesma regra da feature 008 para o slice). `onAprovado`/`onAbandonado` são os únicos pontos de contato com o restante da aplicação; o componente que monta `ModalPix` (dentro da tela de pagamento da feature 008) é quem liga esses callbacks às actions do slice.

**Sequência**:

1. Ao abrir com `resolverIntegracao === 'PIX_DINAMICO'`: valida `validarValorMinimoPix`; se falhar, toast e não abre a chamada de rede (`research.md`, D13).
2. Chama `useGerarPix().gerar({ formaCodigo, valor: saldoRestante, pagador: montarDadosPagador(clienteAtual) })`.
3. Em sucesso: exibe QR Code/copia-e-cola; habilita `useStatusPix(trnGuid, true)`.
4. Cada resultado de `useStatusPix` passa por `interpretarStatusPix`: `APROVADO` → `onAprovado(trnGuid)`, desabilita polling; `FALHA_TERMINAL` → aviso + `onAbandonado(motivo)`, desabilita polling; `PENDENTE` → nada, aguarda o próximo tick.
5. Fechamento manual em qualquer momento com pagamento ainda pendente → mesmo aviso + `onAbandonado('FECHADO_PELO_OPERADOR')` (`research.md`, D11).

---

## 4. O que este contrato garante às outras features

| Feature | Consome |
|---|---|
| 005 — cliente | fornece `clienteAtual` para `montarDadosPagador` |
| 007 — layout mobile | nenhuma exclusão — PIX permanece disponível no mobile (AD-074); `ModalPix` recebe o mesmo tratamento responsivo que as demais superfícies de pagamento |
| 008 — pagamento geral | fornece o veredito `PIX_DINAMICO`, `saldoRestante`, `formaCodigo`, `minimoPix`; recebe `onAprovado`/`onAbandonado` que disparam `confirmarPagamentoIntegrado`/`recusarPagamentoIntegrado` |
