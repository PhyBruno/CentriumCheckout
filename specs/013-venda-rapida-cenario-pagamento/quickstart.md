# Quickstart — Validação da Venda Rápida por Cenário de Pagamento (F6–F9)

**Feature**: 013 | **Data**: 2026-08-31
**Pressupõe**: `data-model.md` (invariantes I1–I12) e `contracts/` (portas injetadas)

Guia de validação: o que executar e o que precisa ser verdade ao final. Detalhes de estrutura estão nos artefatos referenciados — não são repetidos aqui.

---

## Pré-requisitos

- Ambiente do Checkout rodando via Docker (dev), com bootstrap de sessão mockado.
- Um payload de sessão de teste com `CenarioPagamento` populado e com `CondicoesDePagamento[]` coerente (as condições/formas citadas pelos cenários precisam existir, senão E4 descarta tudo — que é o comportamento correto, mas não é o que se quer exercitar nos cenários 1 a 4).
- Fixture sugerida (sintética, sem dado de produção):

```json
"[\"1;DINHEIRO;1;A VISTA;Dinheiro à vista;True;F6\",\"3;CARTAO DEB;1;A VISTA;Débito à vista;False;f7 \",\"7;CREDIARIO;30;30 DIAS;Crediário;False;\",\"9;VALE;1;A VISTA;Vale;Ops; promo;True;F8\",\"4;PIX;1;A VISTA;PIX à vista;True;F9\"]"
```

Essa fixture cobre, de uma vez: cenário válido com encerramento (F6), tecla mal formatada que deve ser aceita após normalização (F7), cenário sem tecla (descartado), item com `;` extra no nome (descartado, D3) e cenário com forma de integração externa (F9).

## Comandos

```bash
npm run test:unit -- venda-rapida     # parser, projeção e comando (I1–I12)
npm run test:integration -- pagamento # acionamento sobre o slice real de pagamento
npm run test:e2e -- venda-rapida      # fluxo dourado no navegador
```

---

## Cenários de validação

### C1 — Fluxo dourado: um toque encerra a venda

**Dado** a fixture acima em uma sessão desktop, com produtos no carrinho e saldo em aberto positivo.
**Quando** o operador pressiona F6.
**Então** um pagamento em dinheiro à vista é lançado pelo valor exato do saldo em aberto, o saldo vai a zero e a finalização começa **sem nenhum diálogo de confirmação** (`SC-001`, I6, I7).

### C2 — Cenário sem encerramento permanece na venda

**Quando** o operador pressiona F7 (débito, `encerraOperacao = false`).
**Então** o pagamento é lançado e a venda **não** é finalizada; o operador segue no controle.
Valida também a normalização da tecla `"f7 "` (I1).

### C3 — Tudo que está fora do padrão é ignorado sem ruído

**Então**, com a fixture acima, a lista de atalhos contém **exatamente** F6, F7 e F9. O cenário sem tecla e o cenário com `;` extra no nome não aparecem, nenhum erro é exibido ao operador, e os válidos funcionam normalmente (`SC-003`, I2, I3).

### C4 — Catálogo ausente, vazio ou ilegível

**Dado** `CenarioPagamento` ausente, depois `""`, depois `"{não é json"`.
**Então** em todos os três casos a venda funciona normalmente, nenhuma área de atalhos é exibida e nenhum erro aparece (`SC-006`, I4).

### C5 — Forma com integração externa

**Quando** o operador pressiona F9 (PIX dinâmico, `encerraOperacao = true`).
**Então** o fluxo de PIX é acionado exatamente como na seleção manual da forma, o pagamento **não** é dado por lançado antes da confirmação, e a finalização automática só ocorre depois dela (`FR-013`, D10).

### C6 — Recusas que não alteram a venda

**Quando** a tecla é pressionada (a) com carrinho vazio, (b) com saldo em aberto já zerado.
**Então** nada é lançado, o operador é informado e o estado da venda permanece idêntico ao anterior (`FR-009`, I8).

### C6a — Venda já iniciada por outro par recusa o atalho

**Quando** (a) o operador escolhe à mão uma condição diferente da do cenário e pressiona a tecla; (b) a venda já tem uma forma aplicada — inclusive a que veio de um DAV/rascunho retomado — e a tecla é pressionada.
**Então** nada é lançado, a venda permanece idêntica (a condição escolhida à mão continua selecionada) e o operador lê uma frase que nomeia a regra e aponta o "Limpar" do cartão de pagamento (`FR-023`, I13).

**E** pressionar de novo a **mesma** tecla depois de um lançamento recusado em P4 (TEF negado, por exemplo) **funciona**: a condição posta pelo próprio atalho não bloqueia a sua retentativa.

### C7 — Acionamento concorrente não duplica pagamento

**Quando** F6 é acionada duas vezes em sequência rápida, sem aguardar a primeira concluir.
**Então** exatamente um pagamento é lançado; o segundo acionamento é recusado por `ACIONAMENTO_EM_ANDAMENTO` (`SC-004`, I9).

### C8 — Atalho não dispara durante digitação nem bipagem

**Quando** o foco está no campo de busca de produto, de quantidade ou de valor, e a tecla é pressionada; e quando uma leitura de código de barras é simulada.
**Então** nenhum atalho dispara e a digitação/bipagem segue intacta (`SC-005`, `FR-014`).

### C9 — Acionamento com o carrinho ainda aberto

**Quando** a tecla é pressionada antes de o operador ir à etapa de pagamento.
**Então** a venda vai à etapa de pagamento e o cenário é lançado na mesma ação (`FR-019`).

### C10 — Mobile não tem venda rápida

**Dado** a mesma sessão avaliada como plataforma mobile.
**Então** nenhuma dica de atalho é renderizada e nenhum acionamento é possível — nem por tecla, nem por toque (`FR-020`, I10).

### C11 — Trilha de auditoria

**Quando** um acionamento altera a venda.
**Então** existe exatamente um evento `VENDA_RAPIDA_ACIONADA` com tecla, cenário, condição, forma, valor e indicador de finalização automática; acionamentos recusados não geram evento (`FR-017`, I12).

---

## Critério de pronto

A feature está validada quando C1–C11 passam e as invariantes I1–I12 de `data-model.md` têm teste correspondente. C3, C4, C7 e C10 são os cenários que mais provavelmente falham numa implementação apressada — priorizá-los na revisão.
