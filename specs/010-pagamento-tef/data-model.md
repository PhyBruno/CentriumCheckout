# Phase 1 — Data Model: Pagamento — TEF

**Feature**: `010-pagamento-tef` | **Date**: 2026-10-02 | **Research**: `specs/010-pagamento-tef/research.md`

Esta feature **não acrescenta estado de venda novo** ao `vendaStore`. O único estado duradouro continua sendo `PagamentoAplicado` (008); a cobrança e o estorno em curso são estado efêmero das duas janelas, descartado ao fechá-las (Constitution VI). O que muda no estado existente: a **forma** de `DadosTEF` (§1) e **uma action nova** no slice de pagamento (§5).

---

## 1. `DadosTEF` — reescrito (era opaco, preenchido "pela feature 010")

`src/client/domain/pagamento/saldoPagamento.ts`. Gravado em `PagamentoAplicado.dadosTEF` por `confirmarPagamentoIntegrado` quando o status observado é `CNC`.

| Campo | Tipo | Origem (`RespostaJson` de `ConsultarStatusCard`) | Uso |
|---|---|---|---|
| `pagId` | `string` (não vazio) | `payment_identifier` | **`TEFPagId`** do retrato da NFCe; chave do estorno |
| `bandeira` | `string` | `card_brand` (`''` se ausente) | `TEFBandeira` do retrato; linha "Bandeira" da janela aprovada |
| `nsu` | `string` | `nsu_host` (`''` se ausente) | só tela (linha "NSU") |
| `autorizacao` | `string` | `autorization_code` — grafia da SmartTEF (`''` se ausente) | só tela (linha "Autorização") |
| `tipoIntegracao` | `'1'` | constante | `TEFTipoIntegracao` do retrato (`NFCe_tpIntegra`: integrado) |

**Sai**: `identificacao: number`, `cnpj: string`, `numeroAutorizacao: string` — campos que o SDT `CheckoutFaturarNFCe` da KB não tem mais (`research.md` D16). O ERP busca autorização, CNPJ do adquirente e bandeira na própria `TransacaoTEF` a partir do `TEFPagId`.

**Regra de fronteira (inalterada)**: `dadosTEF` é cópia congelada no momento da aprovação; nada o relê depois.

---

## 2. Domínio puro — `src/client/domain/tef/`

### 2.1 `StatusSmartTef` (literal union)

```text
'PDT' | 'PROC_PAG' | 'CNC' | 'CAN_ERP' | 'REJ_PAG' | 'SOL_EST' | 'PROC_EST' | 'EST' | 'REJ_EST'
| 'REJ' | 'PROC' | 'IMP'
```

Os nove literais do domínio `SmartTefStatusPagamento` da KB mais `REJ`, `PROC` e `IMP`, da lista do usuário de 2026-10-07 (`research.md` D4, AD-268). A fronteira Zod aceita **qualquer** `string` em `payment_status`; o estreitamento acontece nas duas funções abaixo, cada uma com ramo `default`.

### 2.2 `ResultadoCobrancaTef` — `interpretarStatusCobrancaTef(status: string)`

```text
{ situacao: 'PENDENTE' }
{ situacao: 'TENTATIVA_RECUSADA' }   // REJ: não é desfecho, a janela segue esperando e avisa
{ situacao: 'APROVADO' }
{ situacao: 'FALHA', motivo: MotivoFalhaTef }

MotivoFalhaTef = 'PAGAMENTO_REJEITADO' | 'CANCELADO_NO_ERP' | 'ESTORNADO_FORA_DO_CHECKOUT'
```

Mapeamento: tabela "Fase de cobrança" de `research.md` D4. `MENSAGEM_POR_MOTIVO_FALHA_TEF: Record<MotivoFalhaTef, string>` mora junto (mesmo padrão de `interpretarStatusPix`).

### 2.3 `ResultadoEstornoTef` — `interpretarStatusEstornoTef(status: string)`

```text
{ situacao: 'ESTORNO_PENDENTE' }
{ situacao: 'ESTORNADO' }
{ situacao: 'ESTORNO_REJEITADO' }
```

Mapeamento: tabela "Fase de estorno" de `research.md` D4.

### 2.4 `parcelasDoTef(meio: MeioPagtoNFe, prazoDaCondicao: number): number`

`CartaoCredito` → `max(1, trunc(prazo))`; qualquer outro → `1` (`research.md` D8). Função total; `prazo` não finito vira `1`.

### 2.5 `montarPagadorTef(cliente: ClienteVenda | null): PagadorTef | null`

```text
PagadorTef = { cpf: string; nome: string }
```

`cpf` = só dígitos de `cliente.documento`, ou `''` quando ele é `null` — o que cobre o cliente default (o `GetSessao` não devolve documento) e o cliente de documento importado cujo `GetCliente` falhou (AD-237); `nome` = `cliente.nome` em todos os casos; `cliente === null` → `null` (o chamador recusa com `ErroTefSemCliente`). `research.md` D9.

### 2.6 `CobrancaTef` (estado efêmero da janela, não do store)

| Campo | Tipo | Nota |
|---|---|---|
| `paymentIdentifier` | `string` | `payment_identifier` de `CriarCardPagamento` (D5) |
| `valor` | `Centavos` | o `valorAplicado` cobrado — para o bloco "Valor a cobrar" |
| `statusInicial` | `string` | `payment_status` da criação; normalmente `PDT` |

O `idPagamento` **não** entra aqui: fica fechado nos callbacks da janela (mesma escolha de `CobrancaPix`), e é o único vínculo entre janela e pagamento.

### 2.7 `DadosCriarCardTef` (entrada da camada de rede)

| Campo | Tipo | Vira |
|---|---|---|
| `formaCodigo` | `number` | `FPgCod` |
| `valor` | `Centavos` | `PagamentoValor` (reais, 2 casas, só na fronteira) |
| `parcelas` | `number` | `PagamentoParcelas` |
| `pagador` | `PagadorTef` | `PagamentoCpfCliente`, `PagamentoNomeCliente` |

`EmpCod` e `UsuarioGAM` **não existem** neste tipo — são do BFF (`research.md` D7). O tipo é a garantia de que o JS não os monta.

---

## 3. Fronteira Zod — `src/shared/schemas/tef.schema.ts`

| Schema | Valida | Forma |
|---|---|---|
| `respostaSmartTefSchema` | envelope dos três métodos | `semEnvelope('RespostaSmartTEF', { Sucesso: boolean, CodigoStatusHttp: inteiroErp, MensagemErro: string, RespostaJson: string })` |
| `criarCardRespSchema` | `JSON.parse(RespostaJson)` de `CriarCardPagamento` | `looseObject({ payment_identifier: string().min(1), payment_status: string() })` |
| `consultaCardItemSchema` | cada item da lista de `ConsultarStatusCard` | `looseObject({ payment_identifier: string(), payment_status: string(), card_brand?, nsu_host?, autorization_code?, reason? })` |
| `consultaCardRespSchema` | a lista | `array(consultaCardItemSchema)` — aceita também objeto único **[medir]**, normalizado para lista |
| `estornoRespSchema` | `JSON.parse(RespostaJson)` de `EstornarPagamento` | `looseObject({ payment_identifier: string(), payment_status: string() })` |

`looseObject` porque a SmartTEF manda dezenas de campos que o Checkout não lê (`SDTSmartTefConsultaCard` tem 40). Números da SmartTEF chegam como texto (`value: VARCHAR(20)`) e não são lidos — o valor cobrado é o do Checkout.

`bootstrap.schema.ts` ganha `UsuarioGAM: z.string().optional()` na raiz da sessão (`research.md` D7).

---

## 4. Máquinas de estado das duas janelas

### 4.1 `ModalTef` — cobrança

```text
                 ┌──────────── sem cliente / sem UsuarioGAM ─────────────┐
                 │                                                        ▼
[montada] ── criar ──► CRIANDO ── Sucesso:false / rede ──► ERRO_CRIACAO ── Desistir ──► ABANDONADO
                          │                                    │  ▲
                          │                                    └──┘ Tentar novamente (nova chamada)
                          │ payment_identifier
                          ▼
                    AGUARDANDO (polling 10s) ── FALHA (D4) ─────────────────────────────► ABANDONADO
                     │      │
                     │      └── Desistir ──► CONFIRMANDO_DESISTENCIA ── confirma ──────► ABANDONADO
                     │                              └── volta ──► AGUARDANDO
                     │ CNC
                     ▼
                 APROVADO ── 10s / Fechar / X / ESC ──► FECHADO
```

- `ABANDONADO` ⇒ `onAbandonado(motivo)` → `recusarPagamentoIntegrado` (o pagamento sai da lista; evento `PAGAMENTO_RECUSADO`) + aviso. **Nenhuma** chamada de cancelamento.
- `APROVADO` ⇒ `onAprovado(dadosTef)` **antes** de a janela mudar de tela (T3).
- Um desfecho por montagem (`desfechoEmitido` ref).

### 4.2 `JanelaEstornoTef` — estorno

```text
[montada] ── consulta inicial ──► { EST ──────────────────────────────────────► ESTORNADO
                                  { SOL_EST | PROC_EST ──► AGUARDANDO_ESTORNO
                                  { CNC | outro ──► SOLICITANDO
SOLICITANDO ── EstornarPagamento ── Sucesso:false / rede ──► ERRO_ESTORNO (TEF segue APROVADO)
                    │ Sucesso:true
                    ├── payment_status EST ──────────────────────────────────► ESTORNADO
                    └── outro ──► AGUARDANDO_ESTORNO (polling 10s)
AGUARDANDO_ESTORNO ── EST ──► ESTORNADO
                   ── REJ_EST | CAN_ERP | REJ_PAG ──► ESTORNO_REJEITADO (TEF segue APROVADO)
                   ── Desistir de esperar ──► confirmação ──► FECHADO (TEF segue APROVADO)
ESTORNADO ──► onEstornado() → confirmarEstornoTef(idPagamento) → FECHADO
```

---

## 5. Mudanças no `pagamentoSlice` (feature 008)

| Item | Antes | Depois |
|---|---|---|
| `confirmarEstornoTef(idPagamento)` | não existe | **nova**. Único caminho de `TEF`+`APROVADO` para `EXCLUIDO`. No-op se o alvo não for `TEF`/`APROVADO`. Efeitos idênticos aos de `removerPagamento` (riscado, `FORMA_PAGAMENTO_REMOVIDA`, `invalidarVeredito`). |
| `removerPagamento` | recusa TEF aprovado com `AVISO_TEF_IRREVERSIVEL` | **inalterado** — continua sendo a guarda contra remoção direta (`FR-003`); a frase passa a apontar o estorno ("use Remover para estornar no TEF") |
| `motivoBloqueioRemocao` (`ListaPagamentosAplicados`) | bloqueia TEF aprovado | **não bloqueia**: o clique em TEF aprovado abre a confirmação de estorno |
| `descartarPagamento`, `temTefAprovado` (004), `podeMutarCarrinho` | travam com TEF aprovado | **inalterados** — a trava some sozinha quando o estorno vira `EXCLUIDO` |
| `iniciarIntegracao` (`vendaStore`) | no-op | **continua no-op**: a janela nasce do estado (AD-158), como no PIX |

---

## 6. Invariantes

| # | Invariante | Onde é garantida | Teste |
|---|---|---|---|
| T1 | Só `CNC` aprova; literal desconhecido nunca aprova nem estorna | `interpretarStatusCobrancaTef`/`…EstornoTef` (`default`) | unit, 9 literais + desconhecido, nas duas fases |
| T2 | Uma criação de card por montagem da janela; retry só após erro sem `payment_identifier` | `useCriarCardTef` (ref de voo) + `criacaoIniciada` | integração: StrictMode, duplo clique |
| T3 | `confirmarPagamentoIntegrado` é chamado no instante do `CNC`, não depois dos 10s | `ModalTef` | integração com relógio falso |
| T4 | Nenhum caminho de abandono chama rede além da consulta | `ModalTef` | integração: espião no `erpClient` |
| T5 | TEF aprovado só vira `EXCLUIDO` por `confirmarEstornoTef`, e só depois de `EST` observado | slice + `JanelaEstornoTef` | integração do slice + da janela |
| T6 | Estorno rejeitado, com erro ou abandonado deixa o TEF `APROVADO` e a venda bloqueada para suspensão | slice (nenhuma mutação) | integração |
| T7 | Com uma janela TEF aberta, nenhuma outra forma é inserida (a janela é modal) | `useFocoDeModal` + backdrop | integração: tentativa de inserir com janela aberta |
| T8 | `EmpCod`/`UsuarioGAM` nunca saem do navegador; o BFF os insere | `DadosCriarCardTef` (tipo) + `erp-proxy.ts` | unit do BFF: corpo forjado é sobrescrito |
| T9 | `PagamentoParcelas` > 1 só para `CartaoCredito` | `parcelasDoTef` | unit |
| T10 | `PagamentoValor` = `valorAplicado` em reais com 2 casas; nenhum cálculo monetário novo | fronteira de `criarCardTef` | unit |
| T11 | Toda forma TEF aprovada vai ao `FaturarNFCe` com `TEFPagId` não vazio | `formaParaRetrato` | unit |
