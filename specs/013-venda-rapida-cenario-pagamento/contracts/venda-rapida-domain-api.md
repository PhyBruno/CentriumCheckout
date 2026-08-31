# Contrato interno — superfície pública da venda rápida

**Feature**: 013 — Venda Rápida por Cenário de Pagamento
**Data**: 2026-08-31
**Pressupõe**: `data-model.md` (entidades, pipeline E1–E6, fluxo G1–P7, invariantes I1–I12)

Este documento fixa **o que cada camada expõe e o que ela tem o direito de conhecer**. É o artefato que impede a feature de virar um `if` dentro do componente de pagamento.

---

## 1. Camadas e direção das dependências

```text
UI (dica de atalhos, desktop)
   │  usa
   ▼
comando de acionamento  ──── injeta ───▶  operações de pagamento (feature 008)
   │                                      finalização (feature 004)
   │  lê                                  auditoria (feature 001)
   ▼
projeção de atalhos (pura)
   │  lê
   ▼
parser de fronteira (puro)  ◀── payload de sessão (feature 002)
```

Regra de dependência (Constitution II — Dependency Inversion): **nenhuma camada abaixo conhece a de cima**, e o comando de acionamento não importa PIX, TEF, layout nem componentes — recebe tudo por injeção.

---

## 2. Parser de fronteira (puro)

**Responsabilidade única**: transformar o campo `CenarioPagamento` em cenários brutos válidos. Não sabe o que é tecla útil, catálogo ou plataforma.

| Operação | Entrada | Saída | Contrato |
|---|---|---|---|
| `parsearCenarios` | `string \| undefined` | `ReadonlyArray<CenarioPagamentoBruto>` | função **total**: nunca lança; entrada ilegível ⇒ `[]` (I4) |

Pós-condições: todo item devolvido tem exatamente os 7 campos convertidos; nenhum item devolvido tem `nome` vazio; `encerraOperacao` já é `boolean` (I11).

---

## 3. Projeção de atalhos (pura)

**Responsabilidade única**: decidir quais cenários viram atalhos. Não lança pagamento e não conhece o estado da venda.

| Operação | Entrada | Saída | Contrato |
|---|---|---|---|
| `projetarAtalhos` | cenários brutos, catálogo de condições/formas da sessão, `plataforma` | `ListaAtalhos` | idempotente e determinística: mesma entrada ⇒ mesma saída, sempre na mesma ordem (I2, I5, I10) |
| `buscarAtalho` | `ListaAtalhos`, `TeclaAtalho` | `AtalhoVendaRapida \| undefined` | consulta pura |

`plataforma` é **parâmetro**, não leitura de `window` — é o que torna I10 testável sem renderizar nada e o que reaproveita o padrão de AD-074 (feature 008).

---

## 4. Comando de acionamento

**Responsabilidade única**: orquestrar o gesto. Toda a matemática de dinheiro e toda a regra de finalização vêm injetadas — este módulo não calcula valor nem decide o que valida uma NFCe.

| Operação | Entrada | Saída | Contrato |
|---|---|---|---|
| `acionarCenario` | `TeclaAtalho` | `Promise<ResultadoAcionamento>` | executa G1–P7; nunca lança para o chamador; sempre limpa o guard (I9) |

**Dependências injetadas** (portas — a feature 013 define a interface, as features 008/004/001 fornecem a implementação):

| Porta | Assinatura conceitual | Fornecida por |
|---|---|---|
| `obterSaldoEmAberto` | `() => Centavos` | 008 |
| `vendaTemItens` | `() => boolean` | 003/008 |
| `irParaEtapaPagamento` | `() => void` | 008 (`FR-019`) |
| `selecionarCondicao` | `(codigo: number) => void` | 008 |
| `aplicarForma` | `(codigo: number, valor: Centavos) => Promise<AplicacaoForma>` | 008 |
| `resolverIntegracao` | `(forma) => 'TEF' \| 'PIX_DINAMICO' \| 'NENHUMA'` | 008 (reuso literal, sem alteração) |
| `finalizarVenda` | `() => Promise<void>` | 004 |
| `registrarEvento` | `(evento: EventoVendaRapida) => void` | 001 |

**Invariantes que este contrato impõe ao chamador**:

- `aplicarForma` recebe **sempre** o saldo em aberto integral em `Centavos` — nunca um valor parcial, nunca um `number` de reais (I6, Constitution V).
- `finalizarVenda` só é invocada quando o saldo em aberto for exatamente `0` **e** `encerraOperacao` for `true` (I7).
- Nenhuma chamada a `finalizarVenda` quando `aplicarForma` rejeitou (I8).
- `registrarEvento` é chamado uma única vez por acionamento que alterou a venda; acionamentos recusados em G1–G4 não geram evento (I12).

---

## 5. Evento de auditoria

Acrescenta **um** tipo de evento ao contrato da feature 001 — não cria trilha própria.

| Campo | Conteúdo |
|---|---|
| `tipo` | `VENDA_RAPIDA_ACIONADA` |
| `tecla` | `F6` \| `F7` \| `F8` \| `F9` |
| `cenarioNome` | rótulo do cenário acionado |
| `condicaoCodigo`, `formaCodigo` | par lançado |
| `valorLancado` | `Centavos` |
| `finalizacaoAutomatica` | `boolean` — se a finalização foi disparada pelo atalho |

---

## 6. Superfície de UI

| Elemento | Contrato |
|---|---|
| Dica de atalhos | renderiza uma entrada por `AtalhoVendaRapida` (tecla + `nome`); **não renderiza nada** quando a lista está vazia (`FR-016`) |
| Acionamento por clique | chama exatamente o mesmo `acionarCenario` da tecla — nenhum caminho alternativo (`US3`, cenário 3) |
| Registro das teclas | pelo mapa central de atalhos, desabilitado com foco em campo de entrada (`FR-014`, D12) |

A UI **não** filtra, ordena nem interpreta cenários: recebe `ListaAtalhos` pronta. Qualquer regra que apareça no componente é violação deste contrato.
