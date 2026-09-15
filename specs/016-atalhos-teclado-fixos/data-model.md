# Data Model: Atalhos de teclado fixos do Checkout

**Feature**: 016 | **Date**: 2026-09-15 | **Plan**: [plan.md](./plan.md)

Nenhuma entidade persistida e nenhum contrato de ERP novo. O que segue são os tipos em memória e a máquina de decisão que governa cada pressionada.

---

## 1. `TeclaFixa` — a união fechada das teclas que o produto possui

```
TeclaFixa = 'F1' | 'F2' | 'F3' | 'F4' | 'F10'
```

Fechada de propósito: cada tecla nova é uma decisão de produto que passa por spec, não uma string que alguém acrescenta no ponto de uso (FR-009).

**Distinta de `TeclaAtalho`** (`'F6' | 'F7' | 'F8' | 'F9'`, feature 013), que descreve o que o ERP pode cadastrar. As duas uniões não se misturam — ver Invariante I1.

## 2. `ComandoFixo` — o que uma tecla carrega

| Campo | Tipo | Significado |
|---|---|---|
| `tecla` | `TeclaFixa` | A tecla como o navegador a reporta |
| `comando` | `IdComando` | Qual ação do Checkout ela aciona |
| `rotulo` | `string` | Descrição curta, para eventual tela de ajuda (FR-009) |

```
IdComando = 'IMPORTAR_DAV' | 'IMPORTAR_NFCE' | 'IDENTIFICAR_CLIENTE'
          | 'IDENTIFICAR_PRODUTO' | 'SUSPENDER_VENDA'
```

**O mapa fixo** é a constante que associa os cinco: literal, sem consulta, sem cadastro, idêntica em toda instalação.

| Tecla | Comando | Rótulo |
|---|---|---|
| F1 | `IMPORTAR_DAV` | Importar DAV |
| F2 | `IMPORTAR_NFCE` | Importar NFCe |
| F3 | `IDENTIFICAR_CLIENTE` | Identificar cliente |
| F4 | `IDENTIFICAR_PRODUTO` | Identificar produto |
| F10 | `SUSPENDER_VENDA` | Suspender venda |

**Teclas explicitamente não possuídas**: F5, F11, F12 (FR-008). Não aparecem no mapa e não devem aparecer — F11 e F12 são tecnicamente incapturáveis, e registrá-las criaria a impressão de que o Checkout as controla.

## 3. `JanelaAberta` — o estado do `janelasStore`

```
JanelaAberta = 'nenhuma' | 'seletor-importacao' | 'dav' | 'nfce' | 'cliente' | 'produto'
```

Um enum, não um conjunto de booleanos: as janelas são mutuamente exclusivas, e booleanos independentes permitiriam representar "cliente e produto abertos ao mesmo tempo", que não é estado real. Herda a justificativa do `JanelaAberta` local de `BotaoMenuImportacao`, que este tipo substitui e amplia.

**Transições**

| De | Evento | Para |
|---|---|---|
| `nenhuma` | clique em "Menu Importação" | `seletor-importacao` |
| `nenhuma` | **F1** | `dav` |
| `nenhuma` | **F2** | `nfce` |
| `nenhuma` | **F3** / clique no campo de cliente | `cliente` |
| `nenhuma` | **F4** / clique na busca de produto | `produto` |
| `seletor-importacao` | escolher DAV | `dav` |
| `seletor-importacao` | escolher NFCe | `nfce` |
| qualquer ≠ `nenhuma` | fechar | `nenhuma` |
| qualquer ≠ `nenhuma` | **qualquer tecla fixa** | *(inalterado — ver I3)* |

A escolha no seletor **substitui** a janela em vez de empilhar — comportamento preservado do componente atual, que evita dois backdrops e duas armadilhas de ESC.

## 4. Máquina de decisão de uma pressionada

Três estágios, nesta ordem. Os dois primeiros não conhecem o comando; o terceiro não conhece a tecla.

```
   tecla pressionada
          │
   ┌──────▼───────────────────────────────┐
   │ 1. POSSE                             │
   │    A tecla está no mapa fixo?        │
   │    Alguém já chamou preventDefault?  │
   └──────┬───────────────────────────────┘
          │ sim, é minha; ninguém tratou
          │ → preventDefault()  ← navegador nunca age daqui em diante
          │
   ┌──────▼───────────────────────────────┐
   │ 2. ELEGIBILIDADE DO EVENTO           │
   │    evento.repeat?        → engole    │
   │    há janela aberta?     → engole    │
   └──────┬───────────────────────────────┘
          │ evento elegível
          │
   ┌──────▼───────────────────────────────┐
   │ 3. DISPONIBILIDADE DA AÇÃO           │
   │    o comando pode rodar agora?       │
   │      não → recusa + explica          │
   │      sim → executa pelo mesmo ponto  │
   │            de entrada do clique      │
   └──────────────────────────────────────┘
```

O ponto do desenho: **o estágio 1 nunca depende dos estágios 2 e 3**. É o que traduz FR-001/FR-002 em estrutura — não há caminho em que a indisponibilidade da ação, o carregamento de uma query ou a plataforma façam a tecla escapar.

"Engole" no estágio 2 significa: `preventDefault` já ocorreu, nenhuma ação roda, nada é dito ao operador. É o desfecho correto para tecla repetida (ele não pediu duas vezes) e para janela aberta (a decisão pendente na tela é o contexto, não o atalho).

## 5. Disponibilidade por comando

| Comando | Fonte da disponibilidade | Recusa quando |
|---|---|---|
| `IMPORTAR_DAV`, `IMPORTAR_NFCE` | `recusaAtual()` de `useRecusaDeImportacao` | Venda em andamento: cliente identificado, item lançado (cancelado inclusive), condição escolhida ou forma aplicada. Cliente padrão **não** conta |
| `IDENTIFICAR_CLIENTE`, `IDENTIFICAR_PRODUTO` | A mesma do controle equivalente na tela | Conforme a ordem da venda já vigente |
| `SUSPENDER_VENDA` | `motivoDeBloqueioDoCancelar` | Venda sem nada lançado; pagamento que impede a suspensão |

Nenhuma dessas regras é escrita nesta feature (FR-018). A tabela documenta de onde cada veredito vem.

## 6. Invariantes

- **I1 — Disjunção dos mapas.** O conjunto de `TeclaFixa` e o de `TeclaAtalho` não têm elemento em comum. Verificado por teste (D13), não por convenção.
- **I2 — Posse total.** Para toda `TeclaFixa`, em todo estado da aplicação com a tela de venda montada, o navegador não executa a ação nativa da tecla.
- **I3 — Exclusão mútua de janelas.** Nunca há duas janelas abertas; e com uma janela aberta, nenhuma tecla fixa altera `JanelaAberta`.
- **I4 — Um acionamento por pressionada.** Repetição automática de tecla segurada não multiplica execuções.
- **I5 — Nenhuma recusa silenciosa.** Toda recusa do estágio 3 produz mensagem ao operador. (Distinto do "engole" do estágio 2, que é silencioso por desenho.)
- **I6 — Dono único.** Cada `TeclaFixa` é registrada em exatamente um ponto da árvore.
- **I7 — Sem regra duplicada.** Todo comando resolve para o mesmo ponto de entrada que o controle equivalente da tela usa.
