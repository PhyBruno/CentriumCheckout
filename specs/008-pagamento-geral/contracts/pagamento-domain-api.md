# Contract: API interna do domínio de Pagamento e do slice `pagamento`

Superfície pública que as demais features consomem. Não é uma API HTTP — é o contrato dos módulos `src/client/domain/pagamento/` e `src/client/stores/slices/pagamentoSlice.ts` (ver `plan.md`, "Project Structure").

Mesma divisão que a feature 003 estabeleceu e que a Constitution II exige: o **domínio é puro** (funções sem estado, sem React, sem Zustand, sem rede) e o **slice orquestra** (aplica mutação, chama o domínio, emite auditoria).

---

## 1. Domínio puro — `src/client/domain/pagamento/`

### `formaPagamento.ts`

```ts
export type MeioPagtoNFe = /* união fechada — ver data-model.md, §1 */;

export interface FormaPagamento {
  readonly codigo: number;
  readonly descricao: string;
  readonly entrada: string;
  readonly meioPagtoNFe: MeioPagtoNFe;
  readonly integracaoCartao: '1' | '2' | '';
  readonly tipoTransacaoTEF: string;
  readonly fpgUtiCar: string;
}

export function ehDinheiro(forma: FormaPagamento): boolean;
export function ehCartao(forma: FormaPagamento): boolean;
export function ehPixDinamico(forma: FormaPagamento): boolean;
export function geraTroco(forma: FormaPagamento): boolean;   // ⇔ ehDinheiro
export function exigeDocumentoImpresso(forma: FormaPagamento): false;  // sempre false (FR-018)
```

- `geraTroco` é intencionalmente um alias semântico de `ehDinheiro`: o call site do troco pergunta pela **capacidade**, não pelo meio de pagamento, o que deixa `FR-012` legível no ponto de uso.
- `exigeDocumentoImpresso` tem retorno de tipo literal `false` — o compilador impede que um call site futuro escreva um ramo de impressão (`FR-018`/AD-064).

### `roteamentoIntegracao.ts`

```ts
export type IntegracaoPagamento = 'NENHUMA' | 'TEF' | 'PIX_DINAMICO';
export type Plataforma = 'DESKTOP' | 'MOBILE';

export interface CapacidadesPagamento {
  readonly tefAtivo: boolean;      // ConfiguracoesTEF.TEFAtivo
  readonly pixAtivo: boolean;      // ConfiguracoesPIX.UtilizaCentriumPAG
  readonly plataforma: Plataforma; // feature 007
}

export function resolverIntegracao(
  forma: FormaPagamento,
  capacidades: CapacidadesPagamento,
): IntegracaoPagamento;

export function formaDisponivel(
  forma: FormaPagamento,
  capacidades: CapacidadesPagamento,
): boolean;
```

Função **pura e total** — tabela de decisão completa em `research.md`, D5. Contrato de comportamento:

1. `CartaoCredito`/`CartaoDebito` → `'TEF'` **somente** se `tefAtivo && plataforma !== 'MOBILE'`; caso contrário `'NENHUMA'` (AD-074: no mobile o cartão segue como pagamento manual, sem integração).
2. `Pix` → `'PIX_DINAMICO'` se `pixAtivo`; a plataforma **não** influencia (AD-074: PIX permanece no mobile).
3. `PixEstatico` → sempre `'NENHUMA'` (`FR-006`).
4. Qualquer outro meio → `'NENHUMA'` (`FR-004` AC3).

`formaDisponivel` implementa `FR-002`/`FR-003`: uma forma cuja integração está desligada é ocultada/desabilitada — cartão fica disponível sem TEF (vira pagamento manual), mas `Pix` com `pixAtivo = false` é indisponível, porque não há caminho manual para ele.

`resolverIntegracao` **não conhece** as features 009 e 010: devolve um veredito, não executa integração. É isso que permite testar as 4 combinações de flags sem stub de rede.

### `saldoPagamento.ts`

```ts
export interface SaldoPagamento {
  readonly totalLiquido: Centavos;
  readonly totalAplicado: Centavos;
  readonly saldoRestante: Centavos;
  readonly troco: Centavos;
}

export function calcularSaldo(
  subtotalCarrinho: Centavos,
  descontoCapa: Centavos,
  pagamentos: readonly PagamentoAplicado[],
): SaldoPagamento;

export function podeAplicarForma(
  forma: FormaPagamento,
  pagamentosAtuais: readonly PagamentoAplicado[],
): ResultadoValidacao;

export function derivarValores(
  forma: FormaPagamento,
  valorInformado: Centavos,
  saldoRestante: Centavos,
): { readonly valorAplicado: Centavos; readonly valorRecebido: Centavos | null };

export type ResultadoValidacao =
  | { readonly ok: true }
  | { readonly ok: false; readonly motivo: 'DINHEIRO_DUPLICADO' | 'SALDO_JA_COBERTO' };
```

- `calcularSaldo` conta **apenas** pagamentos `APROVADO`; algoritmo em `data-model.md`, §6.
- `podeAplicarForma` é onde vive `FR-013` (I2): uma segunda forma dinheiro devolve `{ ok: false, motivo: 'DINHEIRO_DUPLICADO' }`, que o slice converte em toast. A regra é de domínio, não de componente (`research.md`, D4).
- `derivarValores` é a **única** forma de obter o par `valorAplicado`/`valorRecebido`, e é o que torna I3/I5 impossíveis de violar: para dinheiro devolve `valorAplicado = min(valorInformado, saldoRestante)` e `valorRecebido = valorInformado`; para qualquer outra forma devolve `valorRecebido = null`.

### `descontoCapa.ts`

```ts
export interface LinhaRateavel {
  readonly idLinha: string;
  readonly totalLiquido: Centavos;
}

export function resolverDescontoCapa(
  modo: 'PERCENTUAL' | 'VALOR',
  entrada: number,
  subtotal: Centavos,
): Centavos;

export function ratearDescontoCapa(
  descontoCapa: Centavos,
  linhas: readonly LinhaRateavel[],
): ReadonlyMap<string, Centavos>;
```

- `ratearDescontoCapa` implementa a divisão **igual** com clamp e redistribuição (AD-098) — algoritmo completo em `data-model.md`, §5. Reusa `distribuirPorMaiorResto` de `src/client/domain/precificacao/dinheiro.ts`; **não** reimplementa o método do maior resto (AD-072).
- Pós-condições afirmadas por teste: `Σ valores === descontoCapa` e `valor(L) <= L.totalLiquido` para toda linha.
- Pré-condição `descontoCapa <= Σ totalLiquido`: violá-la lança erro de domínio explícito, em vez de devolver um rateio silenciosamente errado (mesmo padrão de `resolvePrecoUnitario` na feature 003). O slice nunca deixa chegar nesse ponto — a guarda I8 barra antes.
- `ratearDescontoCapa` é chamada **na montagem do payload**, não na aplicação do desconto — o estado guarda só o valor único.

### `valeDevolucao.ts`

```ts
export type ResultadoTicket =
  | { readonly valido: true;  readonly valor: Centavos }
  | { readonly valido: false; readonly mensagem: string };

export function ehElegivelParaVale(forma: FormaPagamento): boolean;

export function interpretarRespostaTicket(
  resposta: RespostaValidaTicket,
): ResultadoTicket;
```

- `ehElegivelParaVale`: `fpgUtiCar` vazio → `true` (AD-048, `research.md` D10). Só um valor explicitamente diferente de vale devolução torna a forma inelegível.
- `interpretarRespostaTicket`: usa só `Valido` (AD-101 — corrige o fallback para `Mensagem` de AD-099, item 32 resolvido). União discriminada — o call site não alcança `valor` sem checar `valido`.

---

## 2. Slice — `src/client/stores/slices/pagamentoSlice.ts`

```ts
export interface PagamentoSlice {
  condicaoSelecionada: CondicaoPagamento | null;
  pagamentos: PagamentoAplicado[];
  descontoCapa: DescontoCapa | null;
  valeDevolucao: ValeDevolucaoAplicado | null;

  selecionarCondicao(condicao: CondicaoPagamento): void;
  aplicarPagamento(input: AplicarPagamentoInput): void;
  confirmarPagamentoIntegrado(idPagamento: string, dados: DadosIntegracao): void;
  recusarPagamentoIntegrado(idPagamento: string, motivo: string): void;
  removerPagamento(idPagamento: string): void;
  aplicarDescontoCapa(modo: 'PERCENTUAL' | 'VALOR', entrada: number): void;
  removerDescontoCapa(): void;
  aplicarValeDevolucao(codigo: string, idPagamento: string): Promise<void>;
  limparPagamentos(): void;

  // seletores
  podeMutarCarrinho(): boolean;
  saldo(): SaldoPagamento;
  montarPagamentosParaPayload(): PagamentosPayload;
}
```

### Dependências injetadas (Dependency Inversion)

O slice recebe, na composição do `vendaStore`:

```ts
interface PagamentoDeps {
  subtotalCarrinho(): Centavos;                    // feature 003
  linhasRateaveis(): readonly LinhaRateavel[];     // feature 003 (só linhas ativas)
  capacidades(): CapacidadesPagamento;             // features 002 + 007
  validarTicket(codigo: string): Promise<ResultadoTicket>;  // camada de query
  iniciarIntegracao(integracao: IntegracaoPagamento, ctx: ContextoIntegracao): void; // features 009/010
  validarInsercao(candidata: FormaCandidata, origem: 'MANUAL' | 'ATALHO_CENARIO'): Promise<Veredito>;  // feature 014 — gate pré-inserção (OrigemAcionamento, specs/014-validacao-previa-nfce/contracts/validacao-domain-api.md §3); aplicarPagamento sempre passa 'MANUAL', aplicarForma sempre passa 'ATALHO_CENARIO' — achado I1 do /speckit-analyze da 014 (2026-09-01)
  invalidarVeredito(): void;                                      // feature 014 — ao remover pagamento
}
```

O slice de pagamento **não importa** o slice de carrinho, o hook de layout, nem os módulos de PIX/TEF. É o que permite testar todo o comportamento — inclusive o mobile sem TEF e a recusa de integração — sem montar componente nem rede.

### Contrato de comportamento das actions

| Action | Pré-condição | Efeito | Auditoria |
|---|---|---|---|
| `selecionarCondicao` | — | Define `condicaoSelecionada`; se já havia pagamentos, **esvazia** a lista após confirmação do operador (I9) | `CONDICAO_PAGAMENTO_APLICADA` |
| `aplicarPagamento` | `podeAplicarForma(...).ok`; `saldoRestante > 0`; **e** `validarInsercao(candidata)` com veredito `ACEITA` (feature 014, `FR-019`) | Ordem obrigatória: (1) validações locais puras — falhou aqui, **nenhuma** consulta ao ERP (`FR-020`); (2) `validarInsercao` — recusa ou indisponibilidade encerram sem mutação; (3) só então chama `derivarValores` e cria `PagamentoAplicado`. Se `resolverIntegracao !== 'NENHUMA'`, entra como `PENDENTE_INTEGRACAO` e dispara `iniciarIntegracao` — que assim **nunca** é alcançado numa venda recusada | `FORMA_PAGAMENTO_APLICADA` (só quando `APROVADO`) |
| `confirmarPagamentoIntegrado` | pagamento em `PENDENTE_INTEGRACAO` | Transiciona para `APROVADO`, anexa `dadosTEF`/`pixGuid` | `FORMA_PAGAMENTO_APLICADA` |
| `recusarPagamentoIntegrado` | pagamento em `PENDENTE_INTEGRACAO` | Marca `RECUSADO` e remove da lista | `PAGAMENTO_RECUSADO` |
| `removerPagamento` | pagamento com `integracao === 'NENHUMA'` — em integração aprovada é no-op com toast (I6) | Remove da lista; chama `invalidarVeredito()` (`FR-021`); pode devolver a mutabilidade do carrinho e, com a lista vazia, do cliente/vendedor/desconto de capa (I12) | `FORMA_PAGAMENTO_REMOVIDA` |
| `aplicarDescontoCapa` | `resolverDescontoCapa(...) <= subtotalCarrinho()` (I8) — acima disso é no-op com toast | Substitui o `descontoCapa` (nunca acumula) | — (o desconto é auditado pela feature 004 na finalização) |
| `removerDescontoCapa` | — | Zera o desconto de capa | — |
| `aplicarValeDevolucao` | `ehElegivelParaVale(forma)` — inelegível é no-op com toast | `await validarTicket(codigo)`; se `valido`, vincula ao pagamento e soma o valor; se não, toast com `mensagem` | `VALE_DEVOLUCAO_USADO` (só quando válido); `PAGAMENTO_RECUSADO` quando inválido |
| `limparPagamentos` | — | Esvazia pagamentos, condição, desconto e vale. Chamada pela feature 004 após entrega bem-sucedida, junto com `limparCarrinho` e `descartarAuditoria` | — |

`aplicarValeDevolucao` é a **única** action assíncrona do slice, e chama `ValidaTicketDevolucao` exatamente uma vez por vale — a finalização nunca revalida (`FR-009`/`PAY-06`).

### Seletores

| Seletor | Contrato |
|---|---|
| `podeMutarCarrinho()` | `false` sempre que existir pagamento `APROVADO` (I7). É este predicado que a feature 003 recebe injetado — ver `specs/003-carrinho-produto-precificacao/contracts/precificacao-domain-api.md`, §2 |
| `saldo()` | `calcularSaldo(subtotalCarrinho(), descontoCapa?.valorResolvido ?? 0, pagamentos)` — puro, nunca armazenado |
| `montarPagamentosParaPayload()` | Devolve `CondicaoPagamentoCodigo`, `FormasDePagamento[]` (só aprovados) e o `Map<idLinha, Centavos>` do rateio, para a feature 004. Regras em `contracts/erp-pagamento-api.md`, §3 |

---

## 3. O que este contrato garante às outras features

| Feature | Consome |
|---|---|
| 001 — auditoria | recebe os 5 eventos de pagamento pelo dispatcher tipado |
| 003 — carrinho | recebe `podeMutarCarrinho()` injetado; fornece `subtotalCarrinho()` e `linhasRateaveis()` |
| 004 — finalização | chama `montarPagamentosParaPayload()` e `limparPagamentos()` |
| 007 — layout mobile | fornece `plataforma` em `capacidades()`; nenhuma regra de pagamento é duplicada na camada de layout |
| 009 — PIX | recebe o veredito `PIX_DINAMICO` via `iniciarIntegracao`; responde por `confirmarPagamentoIntegrado`/`recusarPagamentoIntegrado` |
| 010 — TEF | idem, com o veredito `TEF` — e nunca é acionada quando `plataforma === 'MOBILE'` (AD-074) |
| 013 — venda rápida (F6–F9) | **acrescentado em 2026-08-31 (AD-104)**: consome `selecionarCondicao`, a aplicação de forma, `saldoEmAberto` e `resolverIntegracao` como **portas injetadas**, para lançar o pagamento inteiro por atalho de teclado. Não reimplementa saldo, troco, rateio nem roteamento; recebe o veredito de integração e apenas aguarda o desfecho antes de decidir sobre a finalização automática. As operações listadas em `specs/013-venda-rapida-cenario-pagamento/contracts/venda-rapida-domain-api.md` passam a ser superfície pública deste domínio, não detalhe interno |
