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

| Valor | Significado | Roteamento do cartão |
|---|---|---|
| `'1'` | TEF | chama TEF **se** `ConfiguracoesTEF.TEFAtivo` |
| `'2'` | POS | pagamento avulso — nunca chama TEF |
| `''` (e `' '`, padding do GeneXus) | POS | pagamento avulso — nunca chama TEF |

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
(meio === '03' || meio === '04')          →  esta forma é cartão
ConfiguracoesTEF.TEFAtivo === true        →  esta empresa tem TEF
forma.FormaIntegracaoCartao === '1'       →  esta forma passa no TEF (AD-180)
```

Sem qualquer uma das duas últimas, o cartão é **pagamento avulso/POS**: cobrado
na maquininha fora do Checkout, com o operador confirmando o valor. A forma
continua disponível na tela — o que ela não faz é acionar o terminal.

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

### Nenhuma integração — é o resto

Todo meio fora de `03`/`04`/`17`, e também `03`/`04`/`17` quando a flag da
empresa correspondente está desligada.

Essa é exatamente a tabela que `resolverIntegracao`
(`src/client/domain/pagamento/roteamentoIntegracao.ts`) implementa desde AD-180
(2026-09-08): `meioPagtoNFe` + as duas capacidades da empresa + o
`integracaoCartao` da forma, para o ramo de cartão. Até 2026-09-08 aquela função
ignorava `FormaIntegracaoCartao` de propósito, e este documento chegou a
registrar que ignorar tinha sido a escolha certa — **não era**; ver o aviso no
topo e as seções §1 e §3.

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
