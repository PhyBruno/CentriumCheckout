# Contract: API interna do módulo de TEF

Superfície pública que as duas janelas TEF consomem. Não é uma API HTTP — é o contrato de `src/client/domain/tef/` (puro), `src/client/services/tef/` (rede/query) e `src/client/features/pagamento/tef/` (UI). Mesma divisão do PIX (`specs/009-pagamento-pix/contracts/pix-domain-api.md`).

---

## 1. Domínio puro — `src/client/domain/tef/`

```ts
// interpretarStatusTef.ts
export type StatusSmartTef =
  | 'PDT' | 'PROC_PAG' | 'CNC' | 'CAN_ERP' | 'REJ_PAG' | 'SOL_EST' | 'PROC_EST' | 'EST' | 'REJ_EST'
  | 'REJ' | 'PROC' | 'IMP'; // os três últimos: lista do usuário, 2026-10-07 (AD-268)

export type MotivoFalhaTef = 'PAGAMENTO_REJEITADO' | 'CANCELADO_NO_ERP' | 'ESTORNADO_FORA_DO_CHECKOUT';

export type ResultadoCobrancaTef =
  | { readonly situacao: 'PENDENTE' }
  | { readonly situacao: 'TENTATIVA_RECUSADA' } // REJ: o cartão não passou; NÃO é desfecho
  | { readonly situacao: 'APROVADO' }
  | { readonly situacao: 'FALHA'; readonly motivo: MotivoFalhaTef };

export type ResultadoEstornoTef =
  | { readonly situacao: 'ESTORNO_PENDENTE' }
  | { readonly situacao: 'ESTORNADO' }
  | { readonly situacao: 'ESTORNO_REJEITADO' };

export function interpretarStatusCobrancaTef(status: string): ResultadoCobrancaTef;
export function interpretarStatusEstornoTef(status: string): ResultadoEstornoTef;
export const MENSAGEM_POR_MOTIVO_FALHA_TEF: Readonly<Record<MotivoFalhaTef, string>>;
```

Totais e puras; nunca lançam; `CNC` é o único caminho para `APROVADO` e `EST` o único para `ESTORNADO` (T1).

```ts
// parcelasDoTef.ts
export function parcelasDoTef(meio: MeioPagtoNFe, prazoDaCondicao: number): number;

// pagadorTef.ts
export interface PagadorTef { readonly cpf: string; readonly nome: string }
export function montarPagadorTef(cliente: ClienteVenda | null): PagadorTef | null;

// cobrancaTef.ts
export interface CobrancaTef {
  readonly paymentIdentifier: string;
  readonly valor: Centavos;
  readonly statusInicial: string;
}
export interface DadosCriarCardTef {
  readonly formaCodigo: number;
  readonly valor: Centavos;
  readonly parcelas: number;
  readonly pagador: PagadorTef;
}
/** O item da consulta, já reduzido ao que a tela e o retrato usam. */
export interface ConsultaTef {
  readonly status: string;            // payment_status cru — quem interpreta é o chamador, por fase
  readonly bandeira: string;
  readonly nsu: string;
  readonly autorizacao: string;
  readonly motivo: string;            // `reason`, '' se ausente
}
```

---

## 2. Rede — `src/client/services/tef/tefQueries.ts`

```ts
export const INTERVALO_POLLING_TEF_MS = 10_000; // AD-026

export interface TefQueriesDeps {
  readonly erpClient?: ErpClient;
  readonly intervaloMs?: number; // só teste
}

export class ErroTefSemCliente extends Error {}
export class ErroTefSemUsuarioGam extends Error {}

/** POST CriarCardPagamento. Recusa local (sem rede) por cliente ausente — o chamador checa `UsuarioGAM` antes. */
export function criarCardTef(entrada: DadosCriarCardTef, deps?: TefQueriesDeps): Promise<CobrancaTef>;

/** GET ConsultarStatusCard — item do `paymentIdentifier`, ou `{ status: '' … }` se a lista não o trouxer (⇒ pendente nas duas fases). */
export function consultarStatusTef(paymentIdentifier: string, deps?: TefQueriesDeps): Promise<ConsultaTef>;

/** POST EstornarPagamento — devolve o `payment_status` da resposta (normalmente `SOL_EST`, às vezes já `EST`). */
export function estornarTef(paymentIdentifier: string, deps?: TefQueriesDeps): Promise<string>;

/** Comando imperativo, uma chamada em voo por vez (T2). */
export function useCriarCardTef(deps?: TefQueriesDeps): {
  criar(entrada: DadosCriarCardTef): Promise<CobrancaTef>;
  readonly status: 'idle' | 'criando' | 'erro';
  readonly erro: string | null;
};

/** Polling compartilhado pelas duas janelas. `habilitado=false` desliga na mesma renderização (J3). */
export function useStatusTef(
  paymentIdentifier: string,
  habilitado: boolean,
  deps?: TefQueriesDeps,
): { readonly consulta: ConsultaTef | null; readonly isLoading: boolean };
```

Erros: `ErroRedeErp`, `ErroSessaoEncerrada`, `ErroRespostaInvalida`, `ErroNegocioErp` (com `MensagemErro` íntegra do ERP) — os mesmos de `services/errosErp.ts`. `pixQueries.ts` não é reaproveitado por import: as duas camadas compartilham **padrão**, não código, porque os contratos do ERP não têm nada em comum.

---

## 3. UI — `src/client/features/pagamento/tef/`

### `ModalTef.tsx` — cobrança (frames Pencil `Y0ka3`/`uHAyW` e `xWrzX`/`A9MNZI`)

```ts
export interface ModalTefProps {
  readonly formaCodigo: number;
  readonly meioPagtoNFe: MeioPagtoNFe;       // decide as parcelas
  readonly valor: Centavos;                  // PagamentoAplicado.valorAplicado
  readonly prazoDaCondicao: number;          // condicaoSelecionada.prazo
  readonly clienteAtual: ClienteVenda | null;
  readonly usuarioGamPresente: boolean;      // bootstrap.UsuarioGAM não vazio
  readonly onAprovado: (dados: DadosTEF) => void;   // → confirmarPagamentoIntegrado
  readonly onAbandonado: (motivo: string) => void;  // → recusarPagamentoIntegrado
  readonly onFechar: () => void;
  readonly deps?: TefQueriesDeps;
  readonly atrasoFechamentoMs?: number;      // só teste; padrão 10_000
}
```

Não importa `vendaStore` (Constitution II). Montado por `useTefPendente()` em `ListaPagamentosAplicados.tsx`: segue o `idPagamento` do pagamento `PENDENTE_INTEGRACAO` com `integracao === 'TEF'` — `find`, não `filter` — e continua montado durante os 10s do estado aprovado (mesma correção do `usePixPendente`).

### `JanelaEstornoTef.tsx` — estorno (sem nó no Pencil: reusa a moldura do `ModalTef`, ver `plan.md`)

```ts
export interface JanelaEstornoTefProps {
  readonly paymentIdentifier: string;        // PagamentoAplicado.dadosTEF.pagId
  readonly valor: Centavos;
  readonly onEstornado: () => void;          // → confirmarEstornoTef(idPagamento)
  readonly onFechar: () => void;             // sem mutação: TEF segue APROVADO
  readonly deps?: TefQueriesDeps;
}
```

### `avisosTef.ts`

Textos compartilhados por janela, confirmação e lista: aviso de desistência com transação em voo ("O Checkout **não cancela** automaticamente a transação em voo no TEF…"), aviso de estorno solicitado e não confirmado, motivo do `X` travado, motivo de `UsuarioGAM` ausente.

---

## 4. Slice de pagamento (008) — superfície tocada

```ts
interface PagamentoSlice {
  // … existente …
  /** Único caminho TEF/APROVADO → EXCLUIDO; chamado só depois de `EST` observado (T5). */
  confirmarEstornoTef(idPagamento: string): void;
}
```

`removerPagamento`, `descartarPagamento`, `confirmarPagamentoIntegrado`, `recusarPagamentoIntegrado` e `iniciarIntegracao` mantêm a assinatura (`data-model.md` §5).
