# Contract: endpoints do ERP para o TEF (SmartTEF)

Fonte: KB GeneXus `CentriumDEVU6`, API `ApiCentriumOAuth`, bloco `//SmartTEF` (lida em 2026-10-02 — `research.md` D2). O `Fluxograma - Diagrama - Alinhamentos/APICentriumOAuth.yaml` do repositório é **anterior** a este bloco e não os descreve.

Todos os três passam pelo proxy autenticado `/api/erp/ApiCentriumOAuth/<Método>` da feature 002. O navegador **nunca** envia `Empresa`, `EmpCod` nem `UsuarioGAM` — o BFF os injeta (§5).

**Medido ao vivo em 2026-10-07** no `prototype` do `c0lj6mvzeh` (POS simulado, R$ 1,00, forma `3`): o ciclo completo criar → `PDT` → `CNC` → estornar → `SOL_EST` → `EST` (AD-267). Todos os pontos que este documento marcava como **[medir]** foram fechados abaixo, com o resultado no próprio item. Os valores de exemplo seguem sintéticos.

Valores de exemplo abaixo são **sintéticos**.

---

## 1. `CriarCardPagamento` — cria a cobrança na maquininha

`POST /api/erp/ApiCentriumOAuth/CriarCardPagamento`

**Corpo enviado pelo navegador** (forma **plana — medida**: o ERP a aceita sem o envelope `{ "CriarCardReq": { … } }`):

```json
{
  "PagamentoValor": 83.29,
  "PagamentoParcelas": 1,
  "PagamentoCpfCliente": "12345678909",
  "PagamentoNomeCliente": "CLIENTE EXEMPLO",
  "FPgCod": 40
}
```

**Corpo que chega ao ERP** (o BFF insere, sobrescrevendo qualquer ocorrência vinda do navegador):

```json
{
  "EmpCod": 1,
  "UsuarioGAM": "0f2c9a4e-0000-4000-8000-000000000000",
  "PagamentoValor": 83.29,
  "PagamentoParcelas": 1,
  "PagamentoCpfCliente": "12345678909",
  "PagamentoNomeCliente": "CLIENTE EXEMPLO",
  "FPgCod": 40
}
```

| Campo | Regra |
|---|---|
| `PagamentoValor` | `valorAplicado` (`Centavos`) / 100, na fronteira; `NUMERIC(10,2)` |
| `PagamentoParcelas` | `parcelasDoTef` — `CondicaoPrazo` no crédito, `1` nos demais (`research.md` D8) |
| `PagamentoCpfCliente` | só dígitos do documento; `""` no cliente default (`research.md` D9) |
| `PagamentoNomeCliente` | nome do cliente da venda (default incluído) |
| `FPgCod` | `formaCodigo` do pagamento — grafia da KB, **confirmada** (`FPgCod: 3` entrou no ERP) |
| `CNPJAdquirente` | **não enviado** — o ERP o sobrescreve a partir da forma |
| tipo (`CREDIT`/`DEBIT`/`PIX`) | **não enviado** — o ERP deduz de `FpgNfFormaPagamento` |

**Resposta** (`SDTSmartTefResposta`, **plana** — sem `{ "RespostaSmartTEF": … }`; `CodigoStatusHttp` numérico, `201` no sucesso):

```json
{
  "Sucesso": true,
  "CodigoStatusHttp": 201,
  "MensagemErro": "",
  "RespostaJson": "{\"payment_identifier\":\"pay_exemplo_0001\",\"payment_status\":\"PDT\",\"order_type\":\"CRD_UNICO\",\"charge_id\":\"\",\"allow_multi_payments\":false,\"allow_cash_payment\":false,\"has_details\":true,\"form\":null}"
}
```

`RespostaJson` interno = `SDTSmartTefCriarCardResp`: `payment_identifier`, `payment_status` (`SmartTefStatusPagamento`), `order_type`, `charge_id`, `form` (`null` no POS simulado). O Checkout lê só os dois primeiros.

**Recusas conhecidas** (montadas pelo próprio ERP, sem chamar a SmartTEF — `CodigoStatusHttp: 0`, `RespostaJson: ""`):
- `"Serial do POS (serial_pos) nao localizado para o usuario informado"` — `UsuarioGAM` sem maquininha vinculada na configuração SmartTEF da empresa;
- `"Parcelamento so e permitido para pagamentos do tipo CREDITO"`.

Efeito colateral no ERP quando `Sucesso`: `PSmartTEF_NovoPagamento` grava a `TransacaoTEF` (`TEFPagId` = `payment_identifier`).

---

## 2. `ConsultarStatusCard` — sonda o status (cobrança **e** estorno)

`GET /api/erp/ApiCentriumOAuth/ConsultarStatusCard?SmartTefPaymentIdentifier=pay_exemplo_0001`

O BFF prefixa `Empresa=<empresa da sessão>` como **primeiro** par da query (AD-205); não há `Event … .Before` para este método, então o `Empresa` vem do parâmetro.

**Resposta**: `SDTSmartTefResposta` com `RespostaJson` = **lista** de `SDTSmartTefConsultaCard` (**medido: lista** com um item; o schema ainda normaliza objeto único para lista).

```json
{
  "Sucesso": true,
  "CodigoStatusHttp": 201,
  "MensagemErro": "",
  "RespostaJson": "[{\"payment_identifier\":\"pay_exemplo_0001\",\"payment_status\":\"CNC\",\"card_brand\":\"\",\"nsu_host\":\"\",\"autorization_code\":\"authorizationCode\",\"payment_type\":\"CREDIT\",\"installments\":1,\"acquirer\":\"SIMULADO\",\"reason\":null}]"
}
```

O exemplo é o do **POS simulado**: `card_brand` e `nsu_host` vêm `""` e o código de autorização é o texto fixo `authorizationCode`. Um POS real preenche os três; a aprovação não depende deles — só do `payment_status`. O item traz ~40 campos; os demais não são lidos.

Campos lidos: `payment_identifier`, `payment_status`, `card_brand`, `nsu_host`, `autorization_code` (grafia da SmartTEF, sem o "h"), `reason` (`null` em toda consulta sem rejeição; para a mensagem de rejeição). Item escolhido = o de `payment_identifier` igual ao consultado; lista vazia ⇒ `PENDENTE`.

Depois do estorno o mesmo item volta com `payment_status: "EST"` e os campos `refund_*` preenchidos (`refund_autorization_code`, `refund_user_id`, `refund_date`, `refound_coupon` — grafia do ERP, com "o" a mais). O Checkout não lê nenhum deles.

Efeito colateral no ERP: `PSmartTEF_AtualizaRetorno` grava o status na `TransacaoTEF` — é o que permite ao `FaturarNFCe` achá-la em `CNC` (`research.md` D11).

---

## 3. `EstornarPagamento` — solicita o estorno

`POST /api/erp/ApiCentriumOAuth/EstornarPagamento`

**Corpo enviado pelo navegador**:

```json
{ "SmartTefPaymentIdentifier": "pay_exemplo_0001" }
```

**Corpo que chega ao ERP** (BFF insere `Empresa` na raiz, numérica — `CAMINHOS_COM_EMPRESA_NA_RAIZ`):

```json
{ "Empresa": 1, "SmartTefPaymentIdentifier": "pay_exemplo_0001" }
```

**Resposta**: `SDTSmartTefResposta` com `RespostaJson` = **objeto único** `SDTSmartTefCancelamentoResp`:

```json
{
  "Sucesso": true,
  "CodigoStatusHttp": 201,
  "MensagemErro": "",
  "RespostaJson": "{\"payment_identifier\":\"pay_exemplo_0001\",\"payment_status\":\"SOL_EST\",\"order_type\":\"CRD_UNICO\"}"
}
```

`Sucesso: true` significa **pedido aceito**, não estorno concluído. **Medido:** a resposta é `SOL_EST` e o `EST` chega pela consulta de §2, cerca de 1,5 min depois no POS simulado (`research.md` D14).

---

## 4. Validação de fronteira — dois estágios

```text
resposta HTTP ── ok? ── não ──► ErroRedeErp
                 │ sim
                 ▼
respostaSmartTefSchema (semEnvelope) ── falha ──► ErroRespostaInvalida('<Método>')
                 │
       Sucesso === false ──► ErroNegocioErp('<Método>', MensagemErro || 'A SmartTEF recusou a operação.')
                 │
JSON.parse(RespostaJson) ── lança ──► ErroRespostaInvalida
                 │
schema interno da operação ── falha ──► ErroRespostaInvalida
                 │
mapper → domínio (interpretarStatus…)
```

`ErroSessaoEncerrada` e a renovação de token seguem o `erpClient` da 002, como nas demais chamadas.

---

## 5. Mudanças no BFF (`src/server/`)

| Onde | Mudança |
|---|---|
| `session/getSessao.ts` | `extrairUsuarioGam(json): string \| null` — lê `UsuarioGAM` da **raiz** da resposta; ausente ⇒ `null`. **Medido em 2026-10-07: o `GetSessao` não o publica** (item 64), então este é só o fallback |
| `shared/schemas/token-response.schema.ts`, `routes/session-start.ts` | **AD-267.** A fonte do `UsuarioGAM` é o `user_guid` da resposta de `POST /oauth/access_token` (o GAM, falando do próprio usuário autenticado); o `GetSessao` é o fallback. Grava `usuarioGam` no cookie quando algum dos dois existe; **não** recusa a entrada sem ele (o operador sem TEF continua vendendo) |
| `routes/bootstrap.ts` | **AD-267.** Devolve ao cliente `SessaoUsuario.UsuarioGAM` com o valor do cookie, para a recusa antes da rede (`FR-014`) enxergar o campo. O corpo de `CriarCardPagamento` segue sendo escrito pelo BFF a partir do cookie, nunca do navegador |
| `session/cookie.ts` | campo opcional `usuarioGam?: string`; fora de `CAMPOS_OBRIGATORIOS`; **sem** bump de versão |
| `routes/erp-proxy.ts` | (a) `EstornarPagamento` em `CAMINHOS_COM_EMPRESA_NA_RAIZ`; (b) nova `corpoComOperadorTef(body, caminho, sessao)`: só em `CriarCardPagamento`, insere `EmpCod` (numérico) e `UsuarioGAM` (texto; `""` quando o cookie não tem) na raiz **e**, se existir, dentro de `CriarCardReq` — cobre as duas formas de §1 até a medição |
| `tests/e2e/support/erp-mock.ts` | os três endpoints, com uma `TransacaoTEF` em memória que anda `PDT → PROC_PAG → CNC` por número de consultas, e `CNC → SOL_EST → EST` (ou `REJ_EST`, por flag) no estorno |

---

## 6. Delta em `FaturarNFCe` / `ValidarNFCe` (`CheckoutFaturarNFCe.FormasDePagamento[]`)

| Campo | Antes (código atual) | Depois (SDT da KB) |
|---|---|---|
| `TEFPagId` | — | `dadosTEF.pagId` (**obrigatório** para forma TEF aprovada) |
| `TEFBandeira` | `dadosTEF.bandeira` | `dadosTEF.bandeira` (o `card_brand` observado) |
| `TEFTipoIntegracao` | `dadosTEF.tipoIntegracao` | `'1'` |
| `TEFidentificacao` | `dadosTEF.identificacao` | **removido** — não existe mais no SDT |
| `TEFCNPJ` | `dadosTEF.cnpj` | **removido** — o ERP lê `TEFcnpjAdiquirente` da `TransacaoTEF` |
| `TEFNumeroAutorizacao` | `dadosTEF.numeroAutorizacao` | **removido** — o ERP lê `TEFcodigoAutorizacao` da `TransacaoTEF` |

Recusas do ERP que a 004 passa a poder receber (`messages`, `Id: '9999'`): `"Pagamento SmartTEF <id> não Localizada."`, `"Código de Autorização não localizado. Pagamento SmartTEF <id>"`, `"CNPJ do Adquirente não localizado. Pagamento SmartTEF <id>"` — exibidas pelo fluxo de erro de faturamento já existente, sem tratamento novo.

Na leitura (`CarregarNFCe`/`GetDav` → `dav.schema.ts`): `TEFPagId` opcional entra; `TEFidentificacao`/`TEFCNPJ`/`TEFNumeroAutorizacao` passam a opcionais (ERP antigo) e deixam de ser lidos.
