# Phase 1 — Data Model: Venda Rápida por Cenário de Pagamento (F6–F9)

**Feature**: `specs/013-venda-rapida-cenario-pagamento/spec.md`
**Data**: 2026-08-31
**Pressupõe**: `research.md` (D1–D13)

---

## 1. Entidades

### 1.1 `CenarioPagamentoBruto` — o que o ERP entrega

Representa **um item do array** que vem serializado em `SessaoUsuario.CenarioPagamento`. Existe apenas na fronteira: é produzido pelo parser e consumido imediatamente pela normalização; nenhuma camada acima dele o enxerga.

| Campo | Origem (ERP) | Tipo na fronteira | Observação |
|---|---|---|---|
| `formaCodigo` | `CPgFpgCod` — NUMERIC(2) | `number` inteiro | chave, junto com `condicaoCodigo` |
| `formaDescricao` | `CPgFpgDes` — VARCHAR(16) | `string` | texto livre; não exibido (D9) |
| `condicaoCodigo` | `CPgPraCod` — NUMERIC(4) | `number` inteiro | chave |
| `condicaoDescricao` | `CPgPraDes` — VARCHAR(128) | `string` | texto livre; não exibido (D9) |
| `nome` | `CPgNome` — VARCHAR(60) | `string` | **rótulo exibido** |
| `encerraOperacao` | `CPgIsEncerraOperacao` — Boolean | `boolean` | interpretação fail-safe (D4) |
| `teclaAtalho` | `CPgTeclaAtalho` — VARCHAR(40) | `string` | ainda **não** normalizada |

### 1.2 `AtalhoVendaRapida` — o que o Checkout usa

Projeção validada de um `CenarioPagamentoBruto` que passou por todos os filtros. Só existem instâncias válidas: se algo falhou, o objeto não é construído (não há estado "atalho inválido").

| Campo | Tipo | Invariante |
|---|---|---|
| `tecla` | `TeclaAtalho` = `'F6' \| 'F7' \| 'F8' \| 'F9'` | união fechada; qualquer outra tecla já foi descartada |
| `nome` | `string` não vazio | rótulo do operador |
| `condicaoCodigo` | `number` | existe em `CondicoesDePagamento[]` da sessão |
| `formaCodigo` | `number` | existe em `CondicaoFormasDePagamento[]` da condição acima |
| `encerraOperacao` | `boolean` | já interpretado (D4) |

### 1.3 `ListaAtalhos` — o conjunto ativo da sessão

`ReadonlyArray<AtalhoVendaRapida>`, no máximo 4 elementos, no máximo um por tecla. É derivada, memoizada e imutável durante a sessão (D7).

### 1.4 `ResultadoAcionamento` — união discriminada do comando

O acionamento nunca devolve "sucesso parcial ambíguo". Modelar como união discriminada impede que o chamador leia o valor lançado sem antes checar o desfecho.

**Correção (2026-08-31, remediação de `/speckit-analyze` — achado C1):** a variante `AGUARDANDO_INTEGRACAO` foi removida. `aplicarForma` (porta injetada de 008) só resolve sua Promise depois que o pagamento está de fato aplicado — inclusive quando depende de confirmação de TEF/PIX, reaproveitando o mesmo ciclo `PENDENTE_INTEGRACAO` → `confirmarPagamentoIntegrado`/`recusarPagamentoIntegrado` que a feature 008 já implementa (`specs/008-pagamento-geral/tasks.md`, T021/T022). `acionarCenario` dá um único `await aplicarForma(...)`; P5/P6/P7 só executam depois desse `await` resolver, com ou sem integração externa envolvida — nenhuma retomada assíncrona separada é necessária. Enquanto a integração está em andamento, a UI observa `PENDENTE_INTEGRACAO` diretamente no estado já exposto por 008 (`pagamentoSlice`), sem que 013 precise de sinal próprio (ver `contracts/venda-rapida-domain-api.md` §4). Esta leitura já era o que `research.md` D10, `spec.md` FR-013 e `quickstart.md` C5 diziam — a inconsistência estava só nesta tabela.

| Variante | Campos | Quando |
|---|---|---|
| `{ tipo: 'LANCADO' }` | `valorLancado: Centavos`, `finalizacaoIniciada: boolean` | pagamento aplicado (com ou sem integração externa); `finalizacaoIniciada` reflete `FR-010` |
| `{ tipo: 'RECUSADO' }` | `motivo: MotivoRecusa` | nada foi alterado na venda (G1–G4) ou o lançamento em si falhou/foi recusado (P4, inclusive TEF/PIX recusado) |

`MotivoRecusa` = `'SEM_ITENS' \| 'SEM_SALDO_EM_ABERTO' \| 'ACIONAMENTO_EM_ANDAMENTO' \| 'ATALHO_INEXISTENTE' \| 'PLATAFORMA_NAO_SUPORTADA' \| 'LANCAMENTO_FALHOU'`.

### 1.5 Estado de venda introduzido

Apenas um campo, no slice de pagamento da venda: `acionamentoEmAndamento: boolean`. Nada mais desta feature entra no `vendaStore` (D7). Sem `persist`, como todo o resto do estado de venda (Constitution VI).

---

## 2. Pipeline de normalização

Cadeia de transformações puras, cada etapa com uma única razão para mudar (Constitution II). Nenhuma etapa lança exceção para item inválido: itens que falham são simplesmente omitidos do resultado.

```text
SessaoUsuario.CenarioPagamento (string)
  │
  ├─ E1  parseJsonDeStrings ......... string → ReadonlyArray<string>        (falha total → [])
  ├─ E2  parseItem .................. string → CenarioPagamentoBruto | null (≠7 campos → null)
  ├─ E3  filtrarTeclaValida ......... descarta tecla fora de F6–F9 após normalizar
  ├─ E4  filtrarExistenciaNoCatalogo  descarta condição/forma ausente da sessão
  ├─ E5  resolverEmpateDeTecla ...... mantém o primeiro por tecla, na ordem do ERP
  └─ E6  aplicarPlataforma .......... mobile → []
  │
  ▼
ListaAtalhos (≤ 4)
```

**E1 — `parseJsonDeStrings`**: `JSON.parse` sobre o campo; se o resultado não for um array de strings, ou o campo estiver ausente/vazio/ilegível, devolve `[]` (`FR-007`). Falha de parse **não** é erro de aplicação e não gera aviso ao operador — só registro técnico.

**E2 — `parseItem`**: `split(';')`; aceita **exatamente** 7 partes (D3). Converte campos 0 e 2 para inteiro — não numérico descarta o item (`FR-004`). Campo 5 pelo conjunto fail-safe de D4. Campo 4 (`nome`) vazio descarta o item, porque um atalho sem rótulo não é exibível (`FR-016`).

**E3 — `filtrarTeclaValida`**: `trim()` + caixa alta, comparação contra o conjunto fechado `{F6, F7, F8, F9}` (`FR-003`).

**E4 — `filtrarExistenciaNoCatalogo`**: exige que `condicaoCodigo` exista em `CondicoesDePagamento[]` **e** que `formaCodigo` exista entre as formas daquela condição (`FR-005`). É o filtro que impede o atalho de lançar um pagamento que a venda não aceitaria pelo caminho manual.

**E5 — `resolverEmpateDeTecla`**: primeiro item vence, na ordem em que o ERP devolveu — que é estável (`Order CPgEmpCod CPgFpgCod`), tornando o resultado idêntico entre recarregamentos da mesma sessão (`FR-006`, D6).

**E6 — `aplicarPlataforma`**: plataforma mobile devolve `[]` (`FR-020`, D11). Sendo a última etapa, garante que "não exibe" e "não aciona" sejam consequência do mesmo fato.

---

## 3. Fluxo do acionamento

```text
acionarCenario(tecla)
  │
  ├─ G1  guard: acionamentoEmAndamento?          → RECUSADO(ACIONAMENTO_EM_ANDAMENTO)
  ├─ G2  atalho existe na ListaAtalhos?          → RECUSADO(ATALHO_INEXISTENTE / PLATAFORMA_NAO_SUPORTADA)
  ├─ G3  venda tem itens?                        → RECUSADO(SEM_ITENS)
  ├─ G4  saldoEmAberto > 0?                      → RECUSADO(SEM_SALDO_EM_ABERTO)
  │
  ├─ P1  marca acionamentoEmAndamento = true
  ├─ P2  garante etapa de pagamento              (FR-019)
  ├─ P3  seleciona condição do cenário           (domínio da feature 008)
  ├─ P4  aplica forma do cenário por saldoEmAberto integral   (FR-008)
  │        └─ `await aplicarForma(...)` só resolve após o pagamento estar de fato aplicado — inclusive aguardando confirmação de TEF/PIX quando aplicável (D10); rejeição ⇒ RECUSADO(LANCAMENTO_FALHOU), pula P5
  ├─ P5  saldoEmAberto === 0 && encerraOperacao? → inicia finalização (FR-010)
  ├─ P6  emite evento de auditoria               (FR-017)
  └─ P7  limpa acionamentoEmAndamento (sempre, inclusive em falha)
```

Nenhum passo entre P3 e P5 tem diálogo de confirmação (`FR-010`). Falha em P3/P4 — inclusive TEF/PIX recusado — aborta antes de P5, preserva o estado anterior da venda e devolve o erro ao operador (`FR-011`).

---

## 4. Invariantes

| # | Invariante | Onde é garantida | Como é testada |
|---|---|---|---|
| **I1** | Toda instância de `AtalhoVendaRapida` tem tecla em `{F6,F7,F8,F9}` | tipo união fechada + E3 | teste de tabela com teclas válidas, inválidas e mal formatadas |
| **I2** | `ListaAtalhos` tem no máximo 4 elementos e no máximo um por tecla | E3 + E5 | catálogo com duplicatas e com 6 cenários válidos |
| **I3** | Item fora do padrão nunca vira atalho, e nunca interrompe o processamento dos demais | E2 | catálogo misto: item com 8 campos entre dois itens válidos |
| **I4** | Catálogo ausente/vazio/ilegível ⇒ `ListaAtalhos = []`, sem erro ao operador | E1 | três entradas: ausente, `""`, JSON malformado |
| **I5** | Todo atalho aponta para condição+forma existentes na sessão | E4 | cenário com condição inexistente e cenário com forma fora da condição |
| **I6** | Valor lançado = saldo em aberto integral, em `Centavos` inteiros | P4 | comparação exata com `saldoEmAberto` antes do lançamento |
| **I7** | Venda nunca é finalizada com saldo em aberto > 0 | P5 | lançamento forçado a não zerar ⇒ nenhuma finalização |
| **I8** | Falha no lançamento ⇒ nenhuma finalização e estado da venda inalterado | P4/P5/P7 | lançamento que rejeita ⇒ snapshot do store idêntico ao anterior |
| **I9** | Dois acionamentos concorrentes produzem no máximo um lançamento | G1 + P1/P7 | dois `acionarCenario` sem aguardar o primeiro |
| **I10** | Plataforma mobile ⇒ nenhum atalho listado e nenhum acionável | E6 + G2 | mesma sessão avaliada como desktop e como mobile |
| **I11** | `encerraOperacao` indeterminado é tratado como `false` | E2 (D4) | literais `"True"`, `"true"`, `"1"`, `"False"`, `""`, `"talvez"` |
| **I12** | Todo acionamento que altera a venda gera exatamente um evento de auditoria | P6 | um acionamento ⇒ um evento; acionamento recusado ⇒ nenhum |

---

## 5. Relação com o modelo das outras features

| Feature | O que 013 consome | O que 013 **não** faz |
|---|---|---|
| 002 — bootstrap | payload de sessão (campo `CenarioPagamento`) e catálogo `CondicoesDePagamento[]` | não chama o ERP, não grava em Dexie |
| 008 — pagamento | seleção de condição, aplicação de forma, `saldoEmAberto` em `Centavos`, `resolverIntegracao` | não reimplementa saldo, troco, rateio nem roteamento |
| 009/010 — PIX/TEF | o fluxo de integração, quando o cenário aponta para essas formas | não conhece detalhes de PIX ou TEF; só aguarda o desfecho |
| 004 — finalização | o comando de finalizar a venda, com todas as suas validações | não reimplementa nem relaxa validação de finalização |
| 001 — auditoria | contrato de evento | não cria mecanismo de trilha próprio |
| 007 — mobile | capacidade `plataforma` injetada | não adapta layout; apenas se ausenta no mobile |
