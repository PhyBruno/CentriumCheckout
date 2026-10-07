# Catálogo de pagamento no `GetSessao` real — o que dá (e o que não dá) para saber

**Verificado ao vivo em 2026-09-05** contra o ERP de demonstração, tenant
`PZ6LP43176`, empresa `1`, via `GET /ApiCentriumOAuth/GetSessao?Login=admin`
com header `Empresa: 1`. Payload de **654 KB**, 87 condições, **1305 linhas de
forma de pagamento**.

Este documento existe para responder uma pergunta específica que a feature 013
levantou e que vale para toda a 008/009/010:

> Pelo que o `GetSessao` devolve na parte de pagamentos, dá para saber se uma
> forma/condição espera **TEF**, **PIX** ou **nenhuma integração**?

**Resposta curta (corrigida em 2026-09-08, AD-180):** para **PIX e TEF, sim, com
precisão** — os dois têm marca por forma **e** flag de empresa, e as duas
condições precisam valer juntas. E há um bloqueio anterior a essa pergunta: o
campo que carrega o **meio** de pagamento chega num formato que o Checkout hoje
não reconhece (§4).

> **Leia primeiro, se você está voltando a este documento.** A redação original
> (2026-09-05) respondia "para TEF, só no nível da empresa — não há, neste
> cadastro, nenhuma marca por forma", e concluía em §1/§3 que ler
> `FormaIntegracaoCartao` faria o Checkout "decidir errado". **Isso não vale
> mais.** O usuário confirmou em 2026-09-08 (AD-180) que esse campo é
> exatamente a marca por forma: `'1'` = TEF, `''`/`'2'` = POS (avulso). O dado
> observado aqui continua correto — o que estava errado era a conclusão tirada
> dele. As seções §1 e §3 abaixo já estão reescritas sob a regra vigente.

---

## 1. Os campos disponíveis, e o que cada um vale na prática

Cada item de `CondicoesDePagamento[].CondicaoFormasDePagamento[]` traz sete
campos. Cruzando **todas** as 1305 linhas do tenant real, só existem 13
combinações distintas:

| `FormaMeioPagtoNFe` | `FormaIntegracaoCartao` | `FormaTipoTransacaoTEF` | `FormaFpgUtiCar` | `FormaEntrada` | Ocorrências | Exemplo |
|---|---|---|---|---|---|---|
| `01` | `" "` | `""` | `""` | `S` | 174 | `21 - DINHEIRO` |
| `01` | `""` | `""` | `""` | `N` | 87 | `29 - CARTAO` |
| `02` | `""` | `""` | `""` | `S` | 87 | `23 - CHEQUE` |
| `03` | `""` | `""` | `""` | `S` | 87 | `31 - CARTAO CRED` |
| `04` | `""` | `""` | `""` | `S` | 87 | `30 - CARTAO DEB` |
| `05` | `" "` | `""` | `""` | `N` | 87 | `28 - CREDIARIO` |
| `05` | `" "` | `""` | `""` | `S` | 87 | `33 - VALE DEVOLUÇÃO` |
| `05` | `""` | `""` | `""` | `N` | 87 | `99 - ESCRITURAL` |
| `14` | `""` | `""` | `""` | `N` | 87 | `32 - A PRAZO` |
| `17` | `" "` | `""` | `""` | `S` | 87 | `36 - PIX` |
| `90` | `""` | `""` | `""` | `N` | 87 | `27 - SEM PAGAMENTO` |
| `99` | `""` | `""` | `""` | `N` | 87 | `25 - OUTROS` |
| `99` | `""` | `""` | `""` | `S` | 174 | `24 - RECIBO` |

O que essa tabela diz, campo a campo:

### `FormaMeioPagtoNFe` — **o único discriminador com sinal**

Chega como o **código numérico da tabela da NFe**, não como nome:

| Código | Significado (tabela NFe) | Integração esperada |
|---|---|---|
| `01` | Dinheiro | nenhuma |
| `02` | Cheque | nenhuma |
| `03` | Cartão de Crédito | **TEF**, se a empresa tiver TEF |
| `04` | Cartão de Débito | **TEF**, se a empresa tiver TEF |
| `05` | Crédito Loja | nenhuma |
| `14` | Duplicata Mercantil | nenhuma |
| `17` | **Pagamento Instantâneo (PIX)** | **PIX dinâmico**, se a empresa usar CentriumPAG |
| `90` | Sem Pagamento | nenhuma |
| `99` | Outros | nenhuma |

### `FormaIntegracaoCartao` — **a marca de TEF por forma; neste tenant, nenhuma forma é TEF**

Este é o campo `FPGNFTEFPO` (`FpgNfTefPos`) do cadastro da forma de pagamento, e
a semântica, confirmada pelo usuário em 2026-09-08 (**AD-180**), é:

| Valor | Significado | Roteamento da forma (cartão `03`/`04` e PIX `17`) |
|---|---|---|
| `'1'` | TEF | chama TEF **se** `ConfiguracoesTEF.TEFAtivo`; no PIX, isso **substitui** o `GerarPIX` (AD-250) |
| `'2'` | POS | pagamento avulso — nunca chama TEF; PIX segue pelo CentriumPAG |
| `''` (e `' '`, padding do GeneXus) | POS | pagamento avulso — nunca chama TEF; PIX segue pelo CentriumPAG |

Neste cadastro real ele **nunca** vem `'1'`: só aparecem `""` e `" "` nas 1305
linhas. Sob a regra vigente isso não é ausência de sinal — é a resposta "nenhuma
forma deste tenant passa no TEF", coerente com o `TEFAtivo: false` da empresa
(§2). Um campo não preenchido significa POS, não "não sei".

**Correção de leitura (2026-09-08).** A redação original desta seção dizia
"sem sinal neste tenant" e concluía que "qualquer regra que leia este campo para
decidir TEF vai decidir errado". A conclusão estava errada, e a evidência que a
sustentava também foi mal lida: o `" "` aparecer em `01`/`05`/`17` e o `""` nas
formas de cartão não é contradição nenhuma — os dois valores significam a mesma
coisa (POS), e o campo só tem sentido em cartão. Fora de cartão ele é ignorado
pelo roteamento, então onde o padding cai é irrelevante.

### `FormaTipoTransacaoTEF` — **vazio em 100% das linhas**

Zero sinal. Não serve para distinguir crédito de débito, nem para dizer que a
forma é TEF.

### `FormaFpgUtiCar` — **vazio em 100% das linhas**

Consequência colateral relevante para a 008: sob AD-149, `'VDV'` é o que
identifica a forma de vale devolução. Como o campo vem vazio, a forma
`33 - VALE DEVOLUÇÃO` deste tenant **não** seria reconhecida como vale — ela
cairia como uma forma comum de crédito loja, com campo de valor livre em vez da
janela do ticket.

### `FormaEntrada` (`FpgEnt`) — preenchido, `S`/`N`

Único campo, além do meio, que chega com conteúdo útil. Ecoado no payload de
faturamento (`FR-022`/AD-111), não interpretado.

---

## 2. As duas flags de empresa

```jsonc
"ConfiguracoesTEF": {
  "TEFAtivo": false,          // ← a única informação de TEF que existe
  "TEFempresaAutomacao": "", "TEFcapAutomacao": "0", "TEFversaoInterface": "0",
  "TEFnomeAutomacao": "", "TEFversaoAutomacao": "", "TEFregistroCertificacao": "",
  "TEFVersaoImpressao": "0"
},
"ConfiguracoesPIX": {
  "UtilizaCentriumPAG": false, // ← liga/desliga o PIX dinâmico
  "MinimoPix": "0.00000", "TempoEspera": "0",
  "UtilizaEncurtador": "", "UtilizaLinkExterno": ""
}
```

Os demais campos de `ConfiguracoesTEF` são **parâmetros de automação** que o
Checkout repassaria ao serviço TEF local do PDV — identificação da automação
comercial, versões, registro de certificação. Não são endereço de serviço nem
credencial: não dá para "chamar o TEF" a partir deles.

---

## 3. A resposta à pergunta

### PIX — dá para saber, com precisão

Dois campos bastam e são suficientes:

```
forma.FormaMeioPagtoNFe === '17'  →  esta forma é PIX
ConfiguracoesPIX.UtilizaCentriumPAG === true  →  esta empresa faz PIX dinâmico
```

Neste tenant a forma `36 - PIX` existe em todas as 87 condições, e
`UtilizaCentriumPAG` está **desligado** — logo, hoje, o PIX aqui é pagamento
manual (o operador confirma por fora), não integração.

### TEF — dá para saber, no nível da empresa **e** no da forma

Três campos bastam, e as duas últimas condições precisam valer **juntas**:

```
(meio === '03' || meio === '04' || meio === '17')  →  cartão ou PIX (AD-250)
ConfiguracoesTEF.TEFAtivo === true                 →  esta empresa tem TEF
forma.FormaIntegracaoCartao === '1'                →  esta forma passa no TEF (AD-180)
```

Sem qualquer uma das duas últimas, o cartão é **pagamento avulso/POS**: cobrado
na maquininha fora do Checkout, com o operador confirmando o valor. A forma
continua disponível na tela — o que ela não faz é acionar o terminal.

**O meio `17` entrou nessa conta em 2026-09-21 (AD-250)**, por regra de negócio
do usuário: apesar do nome, `FormaIntegracaoCartao` qualifica a **forma**, não o
meio. Uma forma de PIX com `'1'` numa empresa com `TEFAtivo` é cobrada pelo
terminal, e o `GerarPIX` do CentriumPAG **não** é chamado para ela — gerar o QR
Code em paralelo criaria uma segunda cobrança para o mesmo dinheiro. Um `17` sem
`'1'` (ou em empresa sem TEF) segue pelo CentriumPAG como sempre.

Neste tenant, `TEFAtivo` está desligado e nenhuma forma traz `'1'`; logo, nenhum
cartão daqui rotearia para TEF, pelas duas razões independentes.

`FormaTipoTransacaoTEF` continua vazio em 100% das linhas, mas isso não impede a
decisão: ele diria **que tipo** de transação abrir no terminal (crédito/débito),
não **se** abrir. Quem responde "se" é `FormaIntegracaoCartao`.

**Correção de leitura (2026-09-08, AD-180).** A redação original desta seção
afirmava que "não existe, no payload, nada que diga 'esta forma vai por TEF'" e
listava como limitação real do cadastro a impossibilidade de distinguir TEF de
POS. As duas afirmações caíram: o campo existe, sempre veio no payload, e
distingue exatamente isso.

### TEF — a cobrança na maquininha (SmartTEF): contrato da KB, **medido na recusa (2026-10-02) e no ciclo completo (2026-10-07)**

Quando o roteamento acima decide `TEF`, a feature 010 fala com três endpoints
do bloco `//SmartTEF` da API `ApiCentriumOAuth` (`CriarCardPagamento`,
`ConsultarStatusCard`, `EstornarPagamento`). O contrato completo está em
`specs/010-pagamento-tef/contracts/erp-tef-api.md` e foi lido **na KB**
`CentriumDEVU6` (AD-259), não neste payload nem em chamada ao vivo.

**A recusa foi medida contra o ERP real em 2026-10-02.** Os três
endpoints foram chamados no `prototype` do tenant `c0lj6mvzeh`, pelo BFF do
Checkout e com a sessão real, a pedido e com aval do usuário. Naquele dia o tenant
tinha `TEFAtivo:false`, nenhuma URL da SmartTEF e nenhum `UsuarioGAM`, então nada
chegou a terminal nenhum (em 2026-10-07 o `GetSessao` do mesmo tenant já traz
`TEFAtivo:true`):

- `ConsultarStatusCard` (`GET ?Empresa=1&SmartTefPaymentIdentifier=…`, com
  identificadores inexistentes, vazio ou sem o parâmetro) e `EstornarPagamento`
  (`{SmartTefPaymentIdentifier, Empresa:1}`, com identificador falso):
  `200` + `{"Sucesso":false,"CodigoStatusHttp":0,"MensagemErro":"1.00 - Invalid URI: The hostname could not be parsed.","RespostaJson":""}`.
- `CriarCardPagamento` (corpo plano de `montarCorpoCriarCard`, R$ 0,01, forma 19,
  com `EmpCod:1` e `UsuarioGAM:""` injetados pelo BFF): `200` +
  `{"Sucesso":false,"CodigoStatusHttp":0,"MensagemErro":"Serial do POS (serial_pos) nao localizado para o usuario informado","RespostaJson":""}`.
- Passado pela fronteira (`consultarStatusTef` com o corpo real), vira
  `ErroNegocioErp`, e o operador lê a `MensagemErro` íntegra.

**O ciclo completo de uma cobrança foi medido em 2026-10-07** no `prototype` do
`c0lj6mvzeh`, com POS **simulado** (`acquirer: "SIMULADO"`), a pedido do usuário,
R$ 1,00 na forma `3` e o `UsuarioGAM` dele (`bruno`). Cobrança, aprovação e estorno
terminaram sem sobra pendente:

| Passo | Chamada | Resposta (`RespostaJson`, texto dentro do envelope plano, `CodigoStatusHttp: 201`) |
|---|---|---|
| 1 | `CriarCardPagamento`, corpo **plano** `{EmpCod, UsuarioGAM, PagamentoValor:1, PagamentoParcelas:1, PagamentoCpfCliente, PagamentoNomeCliente, FPgCod:3}` | `{payment_identifier, payment_status:"PDT", order_type:"CRD_UNICO", charge_id:"", allow_multi_payments:false, allow_cash_payment:false, has_details:true, form:null}` |
| 2 | `ConsultarStatusCard` (minutos depois, o POS simulado aprovou) | **lista** com 1 item: `payment_status:"CNC"`, `card_brand:""`, `nsu_host:""`, `autorization_code:"authorizationCode"`, `reason:null`, `acquirer:"SIMULADO"`, `serial_pos`, `payment_extras:{CPF,Nome}` |
| 3 | `EstornarPagamento` `{Empresa:1, SmartTefPaymentIdentifier}` | objeto único `{payment_identifier, payment_status:"SOL_EST", order_type}` |
| 4 | `ConsultarStatusCard` (cerca de 1,5 min depois) | `payment_status:"EST"`, `refund_autorization_code:"authorizationCode"`, `refund_user_id`, `refund_date`, `refound_coupon:{client,store}` |

O que cada passo fixou:

| Ponto | Situação | O que o código assume | Onde troca |
|---|---|---|---|
| Envelope da saída (`RespostaSmartTEF`) | **medido:** SDT plano na raiz, sem `messages`, nos três endpoints, na recusa e no sucesso | as duas formas | `respostaSmartTefSchema` (`semEnvelope`) |
| `CodigoStatusHttp` | **medido:** número — `0` na recusa local, `201` no sucesso | número ou string | `respostaSmartTefSchema` |
| Recusa de negócio | **medido:** `Sucesso:false` + `MensagemErro`, `RespostaJson:""`, HTTP `200` | idem | `lerRespostaSmartTef` (`services/tef/tefMapper.ts`) |
| Envelope do corpo de `CriarCardPagamento` | **medido: plano** (`EmpCod` e `UsuarioGAM` na raiz). O envelope `CriarCardReq` não foi testado | plano | `montarCorpoCriarCard` (`services/tef/tefQueries.ts`); o BFF ainda injeta nas duas formas |
| Grafia `FPgCod` × `FpgCod` | **medido: `FPgCod`** (aceito com `FPgCod:3`; a forma entrou no ERP) | `FPgCod` | `montarCorpoCriarCard` |
| Forma de `RespostaJson` da consulta | **medido: lista** (1 item) | lista; objeto único aceito | `consultaCardRespSchema` |
| Grafia `card_brand`/`nsu_host`/`autorization_code` | **medido:** as da KB; no POS simulado os dois primeiros vêm `""`, e o código de autorização é o texto fixo `"authorizationCode"` | a da KB | `consultaCardItemSchema` |
| `reason` | **medido:** `null` em toda consulta sem rejeição | `string`, `number`, `null` ou ausente (`detalheTexto`) | `consultaCardItemSchema` |
| `EstornarPagamento` | **medido:** responde `SOL_EST` (pedido aceito); o `EST` vem pela consulta, em cerca de 1,5 min | `SOL_EST` pendente, só `EST` conclui | `interpretarStatusEstornoTef` |
| `UsuarioGAM` no `GetSessao` | **medido:** ausente no `c0lj6mvzeh`, na raiz e em `SessaoUsuario` (item 64). **Vem do `user_guid` da resposta do OAuth** (`GET /oauth/userinfo` devolve o mesmo valor em `GUID`), e o BFF o grava no cookie (AD-267) | `user_guid` do token, depois o `GetSessao` | `session-start.ts`, `bootstrap.ts` |

**O que continua sem medição:** o envelope `{ CriarCardReq: … }` no corpo (não é
mais necessário, o plano funciona), um POS **real** (bandeira, NSU e código de
autorização preenchidos; o simulador os devolve vazios ou fixos) e a rejeição
(`REJ` — o cartão não passou, não é desfecho —, `REJ_PAG` e `REJ_EST` — o operador da maquininha não aceitou —, com `reason`; AD-268), que o simulador só produz com ação manual
no app do POS. O `FaturarNFCe` com `TEFPagId` de uma cobrança `CNC` também não foi
exercitado contra o ERP real (item 67 de `PENDENCIES.md`).

### Nenhuma integração — é o resto

Todo meio fora de `03`/`04`/`17`, e também `03`/`04`/`17` quando a flag da
empresa correspondente está desligada.

Essa é exatamente a tabela que `resolverIntegracao`
(`src/client/domain/pagamento/roteamentoIntegracao.ts`) implementa desde AD-180
(2026-09-08): `meioPagtoNFe` + as duas capacidades da empresa + o
`integracaoCartao` da forma — para o ramo de cartão **e, desde AD-250
(2026-09-21), também para o ramo do `Pix`**, onde o terminal é consultado antes
de `pixAtivo`. Até 2026-09-08 aquela função ignorava `FormaIntegracaoCartao` de
propósito, e este documento chegou a registrar que ignorar tinha sido a escolha
certa — **não era**; ver o aviso no topo e as seções §1 e §3.

---

## 4. O bloqueio que vem antes de tudo isso

O Checkout **não consegue ler este catálogo hoje**.

`MeioPagtoNFe` (`domain/pagamento/formaPagamento.ts`, AD-023) é uma união
fechada de **nomes** — `'Dinheiro'`, `'CartaoCredito'`, `'Pix'`… — e o ERP real
manda **códigos numéricos**. A cadeia de fronteira reage assim:

1. `filtrarFormasValidas` (`shared/schemas/pagamento.schema.ts`) descarta, com
   `console.warn`, toda forma cujo `FormaMeioPagtoNFe` não está na união →
   **as 15 formas de cada condição são descartadas**;
2. `paraCondicoesPagamento` (`services/pagamento/pagamentoMapper.ts`) exclui
   condição que ficou sem nenhuma forma → **o catálogo inteiro fica vazio**;
3. sem catálogo: a tela de pagamento não oferece forma nenhuma, e a venda
   rápida (013) não produz atalho algum, porque o filtro E4 cruza o par
   (condição, forma) com esse mesmo catálogo.

O `erp-mock` dos testes reproduz os **nomes**, e é por isso que a suíte inteira
passa verde enquanto o caminho real está quebrado. Nenhum teste automatizado
cobre este formato hoje.

**Correção necessária, na fronteira e em um lugar só:** mapear código → nome em
`pagamento.schema.ts`, aceitando as duas formas (o ERP real e o YAML/mock),
exatamente como `numeroErp`/`inteiroErp` já fazem para número que chega como
string (AD-165). O domínio continua falando por nomes; só a fronteira aprende o
código.

---

## 5. Achados colaterais deste mesmo payload

Não pertencem à pergunta, mas foram observados no mesmo dado e afetam features
existentes:

1. **Teclas de venda rápida fora de F6–F9.** `CenarioPagamento` real:
   ```json
   ["21;DINHEIRO;1;À VISTA;Dinheiro;true;F4",
    "30;CARTAO DEB;1;À VISTA;DEBITO;true;F2",
    "31;CARTAO CRED;1;À VISTA;CREDITO A VISTA;true;F8"]
   ```
   `FR-003` da 013 aceita só F6–F9: dois dos três cenários seriam descartados
   em silêncio, sobrando só o `F8`. O formato de 7 campos e o `true` minúsculo
   em `CPgIsEncerraOperacao` estão de acordo com AD-105/AD-106.

2. **`FormaFpgUtiCar` vazio** quebra a identificação do vale devolução (AD-149)
   — ver §1.

3. **Descrição não é confiável para inferir o meio.** A forma `29 - CARTAO` tem
   `FormaMeioPagtoNFe = '01'` (Dinheiro). Toda decisão precisa sair do meio,
   nunca da descrição — o que a base já faz, e este cadastro confirma por quê.

4. **`GetSessao` exige o header `Empresa`.** Sem ele o ERP responde `200` com
   `SessaoUsuario` inteiro zerado e `messages: [{ Id: "9999", Description:
   "Cabeçalho de Empresa é obrigatório" }]` — sucesso HTTP com corpo vazio, não
   erro. Quem for depurar bootstrap contra o ERP real precisa saber disso.
