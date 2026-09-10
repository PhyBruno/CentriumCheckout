# Data Model — Fase 1: Display do cliente (feature 015)

**Plano**: [plan.md](./plan.md) · **Contrato do canal**: [contracts/canal-display.md](./contracts/canal-display.md)

Nada aqui é persistido. Todas as entidades vivem em memória, em uma das duas abas, e
morrem com ela — Constitution VI. Não há tabela, migração, nem chave.

---

## 1. `EstadoDisplay` — o que a tela do cliente deve desenhar

União discriminada por `tela`, em `src/shared/display.ts`. É a única coisa que o display
sabe sobre o mundo (FR-002, FR-012).

| Variante | Campos | Significado |
|---|---|---|
| `BOAS_VINDAS` | — | Repouso. Estado inicial e destino de todo caminho de saída. |
| `PIX_AGUARDANDO` | `trnGuid`, `valorCentavos`, `qrCodeFonte`, `copiaECola` | Cobrança viva, aguardando pagamento. |
| `PIX_APROVADO` | `trnGuid`, `valorCentavos`, `voltaEmMs` | Pagamento confirmado; contador correndo. |

```ts
type EstadoDisplay =
  | { readonly tela: 'BOAS_VINDAS' }
  | { readonly tela: 'PIX_AGUARDANDO'; readonly trnGuid: string;
      readonly valorCentavos: number; readonly qrCodeFonte: string;
      readonly copiaECola: string }
  | { readonly tela: 'PIX_APROVADO'; readonly trnGuid: string;
      readonly valorCentavos: number; readonly voltaEmMs: number };
```

**Campo a campo**

- **`trnGuid`** — identidade da cobrança, espelhada de `CobrancaPix.trnGuid`
  (`domain/pix/cobrancaPix.ts:41`). É o que decide quando a tela troca de conteúdo
  (FR-026): mudou o `trnGuid`, reinicia tudo, inclusive um contador em curso.
- **`valorCentavos`** — inteiro cru, **sem** a marca `Centavos` (research D5). O display o
  reconverte com `centavos()` antes de formatar.
- **`qrCodeFonte`** — `data:` URL já pronta para o `src` de uma `<img>`, copiada de
  `CobrancaPix.qrCodeFonte`. O tipo MIME já foi detectado no mapper do checkout a partir
  dos bytes reais; o display **não** escolhe formato (mesma regra que
  `cobrancaPix.ts:44-52` documenta).
- **`copiaECola`** — viaja no payload mas **não é renderizado** (FR-005). Está aqui para
  não fechar a porta a um uso futuro e para manter o espelho fiel; a tela do cliente não
  tem teclado nem apontador, então exibi-lo seria ruído de 130 caracteres.
- **`voltaEmMs`** — duração do contador, enviada pelo checkout (research D6). Só existe em
  `PIX_APROVADO`, porque só ali há contagem.

**Invariantes**

- **E1** — Exatamente uma variante ativa por vez. A união discriminada é a garantia.
- **E2** — `BOAS_VINDAS` não carrega nenhum dado da venda ou do cliente (FR-003, SC-006).
  O tipo torna isso impossível de violar por acidente: a variante não tem campos.
- **E3** — `valorCentavos` é inteiro ≥ 0. Violação lança em `centavos()` na fronteira do
  display, em vez de virar valor errado na tela (Constitution V).
- **E4** — `voltaEmMs` > 0. Um zero deixaria a confirmação invisível.

---

## 2. `MensagemDisplay` — o que trafega no canal

Duas mensagens, discriminadas por `tipo`. Detalhe de formato, tolerância a versão e regras
de descarte: ver [contracts/canal-display.md](./contracts/canal-display.md).

| `tipo` | Campos | Quem publica | Quem consome |
|---|---|---|---|
| `ESTADO` | `estado`, `nomeLoja`, `origemId`, `emitidoEm` | aba de checkout | display |
| `SOLICITAR_ESTADO` | — | display, ao montar | aba de checkout **com cobrança ativa** |

- **`nomeLoja: string \| null`** — resultado de `nomeDaLoja(sessao)` (research D1), **não**
  de `tituloDoProduto`. `null` quando a empresa não está cadastrada; a tela mostra só a
  saudação, sem linha órfã.
- **`origemId`** — identificador da aba que publicou, gerado uma vez por instância do
  canal. Serve para depuração e para o publicador ignorar o próprio eco; não participa de
  nenhuma regra de negócio.
- **`emitidoEm`** — instante da emissão, em epoch ms. Não é usado para ordenar (o canal
  entrega em ordem); serve ao diagnóstico e a afirmar o pulso em teste.

---

## 3. `CanalDisplay` — o publicador (aba de checkout)

`criarCanalDisplay(deps?) → { publicar, encerrar }`, em
`src/client/services/display/canalDisplay.ts`. Estado interno, todo privado:

| Campo | Papel |
|---|---|
| `ultimoEstado` | Último `EstadoDisplay` publicado. Alimenta o pulso e decide o handshake. |
| `origemId` | Gerado na criação. |
| `pulso` | Handle do temporizador de 5 s; existe **só** enquanto há cobrança ativa. |

**Regras**

- **C1** — `publicar(estado)` emite no canal e atualiza `ultimoEstado`.
- **C2** — Handshake seletivo (FR-018, research D7): ao receber `SOLICITAR_ESTADO`,
  responde **apenas** se `ultimoEstado.tela !== 'BOAS_VINDAS'`. Uma aba em repouso fica
  calada, e é isso que impede o handshake de apagar o QR publicado por outra aba.
- **C3** — Pulso (FR-019): enquanto `ultimoEstado` é cobrança ativa, republica a cada 5 s.
  Ao voltar a `BOAS_VINDAS`, o pulso é encerrado — repouso não precisa ser reafirmado.
- **C4** — `pagehide` publica `BOAS_VINDAS` antes de a aba morrer (FR-021), cobrindo o
  fechamento normal.
- **C5** — `encerrar()` limpa pulso, ouvintes e fecha o canal. Idempotente: o `StrictMode`
  monta e desmonta duas vezes em desenvolvimento (research D9).

---

## 4. Estado interno do `DisplayCliente` (aba do cliente)

| Campo | Papel |
|---|---|
| `estado` | `EstadoDisplay` corrente. Nasce `BOAS_VINDAS`. |
| `nomeLoja` | Última loja recebida; sobrevive à volta ao repouso, para a tela não perder a marca. |
| `recebidoEm` | Instante da última mensagem **válida**. Alimenta o corte por silêncio. |

### Transições

```text
                      ┌─────────────────────────────────────────┐
                      │                                         │
                      ▼                                         │
                ╔═══════════════╗                               │
   (inicial) ──▶║ BOAS_VINDAS   ║◀──── ESTADO:BOAS_VINDAS ───────┤
                ╚═══════╤═══════╝◀──── silêncio ≥ 15 s ──────────┤
                        │                                       │
          ESTADO:PIX_AGUARDANDO                                 │
                        ▼                                       │
                ╔═══════════════╗                               │
                ║ PIX_AGUARDANDO║──── trnGuid diferente ────────┐│
                ╚═══════╤═══════╝◀───────────────────────────────┘
                        │
           ESTADO:PIX_APROVADO
                        ▼
                ╔═══════════════╗
                ║ PIX_APROVADO  ║──── contador chega a 0 ───────▶ BOAS_VINDAS
                ╚═══════════════╝──── trnGuid diferente ───────▶ (reinicia)
```

**Regras de transição**

- **D1** — Estado inicial é sempre `BOAS_VINDAS`, inclusive após F5 (FR-023). Logo em
  seguida o display emite `SOLICITAR_ESTADO` (FR-017).
- **D2** — Mensagem que não valida é **descartada**, sem mudar o estado (research D4). Não
  atualiza `recebidoEm` — uma aba antiga publicando lixo não deve segurar um QR vivo.
- **D3** — Corte por silêncio (FR-020): `now - recebidoEm ≥ 15 s` **e** estado ≠
  `BOAS_VINDAS` → volta ao repouso. Só há verificação enquanto há cobrança na tela.
- **D4** — Contador (FR-024/025): ao entrar em `PIX_APROVADO`, conta `voltaEmMs` para trás
  e volta sozinho ao repouso. Um `BOAS_VINDAS` que chegue antes encerra o contador e vira a
  tela na hora — é o que faz as duas telas voltarem juntas quando o operador clica
  "Concluir" no décimo segundo 3.
- **D5** — Troca de `trnGuid` (FR-026) reinicia a tela e **descarta o contador em curso**,
  mesmo saindo de `PIX_APROVADO`. É o caminho do segundo PIX da mesma venda; no checkout
  ele corresponde à remontagem do `ModalPix` por `key={idPagamento}`
  (`ListaPagamentosAplicados.tsx:353`).
- **D6** — Nenhuma transição é iniciada pelo display por conta própria, exceto D3 e D4 —
  as duas únicas que existem para proteger o cliente, e nenhuma delas consulta o ERP
  (FR-013/014).

---

## 5. `nomeDaLoja` — derivação da identidade (checkout)

Função nova em `src/client/domain/sessao/identidadePdv.ts` (research D1). Domínio puro,
testável sem React, como o resto do módulo.

| Entrada (`IdentidadePdvBruta`) | Saída |
|---|---|
| `EmpresaNomeFantasia: 'Mercado Aurora'` | `'Mercado Aurora'` |
| só `EmpresaRazaoSocial: 'Aurora Com. de Alim. Ltda'` | `'Aurora Com. de Alim. Ltda'` |
| ambos preenchidos | `'Mercado Aurora'` (fantasia vence) |
| ambos vazios/ausentes/só espaços | `null` |

`tituloDoProduto` passa a chamá-la, para a regra de precedência existir **uma** vez.

---

## 6. Rastreabilidade

| Requisito | Onde é honrado |
|---|---|
| FR-002, FR-003 | §1 (E1, E2) |
| FR-004, FR-005 | §1 (`qrCodeFonte`, `copiaECola` não renderizado) |
| FR-008, FR-026 | §1 (`trnGuid`), §4 (D5) |
| FR-010, FR-011 | research D11 (mapa do `ModalPix`) |
| FR-012, FR-013, FR-014 | §4 (D6) |
| FR-017 | §4 (D1) |
| FR-018 | §3 (C2) |
| FR-019 | §3 (C3) |
| FR-020 | §4 (D3) |
| FR-021 | §3 (C4) |
| FR-022 | §4 (D2), contrato §4 |
| FR-024, FR-025 | §4 (D4) |
| Repouso sem dado da venda (SC-006) | §1 (E2) |
| Precisão monetária (Constitution V) | §1 (E3) |
