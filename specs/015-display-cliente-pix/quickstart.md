# Quickstart — Validação do display do cliente (feature 015)

**Plano**: [plan.md](./plan.md) · **Spec**: [spec.md](./spec.md) · **Contrato**: [contracts/canal-display.md](./contracts/canal-display.md)

Guia de execução e validação. Não contém código de implementação — o detalhe de cada
comportamento está no contrato e no [data-model.md](./data-model.md).

---

## Pré-requisitos

- Node ≥ 22 (`package.json` › `engines`).
- Branch `feat/display-cliente-pix` (saída de
  `fix/contrato-erp-real-pagamento-produto-cliente`, **não** de `master`).
- **Antes de qualquer teste E2E ou rodada manual, derrubar o que estiver na porta 3100.**
  Uma stack antiga do `erp-mock` já produziu falsos negativos em massa nesta base (AD-159);
  conferir a porta custa segundos e evita horas de depuração de um problema inexistente.

---

## Gates automatizados

```bash
npm run typecheck      # obrigatório antes de qualquer push (Constitution)
npm run lint
npm run test           # unitário + integração (Vitest)
npm run test:e2e       # Playwright
```

O que cada camada precisa provar:

| Camada | Arquivo | Prova |
|---|---|---|
| Unitário | `tests/unit/display-protocolo.spec.ts` | schemas rejeitam mensagem de versão antiga, `valorCentavos` não inteiro e objeto estranho — sempre **descartando**, nunca caindo para repouso (contrato §4) |
| Unitário | `tests/unit/canalDisplay.spec.ts` | C1–C5: publica a cada mudança; responde `SOLICITAR_ESTADO` **só** com cobrança ativa; pulso liga com cobrança e desliga no repouso; `pagehide` publica `BOAS_VINDAS`; `encerrar()` é idempotente |
| Unitário | `tests/unit/identidadePdv.spec.ts` | `nomeDaLoja`: fantasia vence razão social; ambos vazios → `null`; `tituloDoProduto` segue igual |
| Integração | `tests/integration/DisplayCliente.spec.tsx` | máquina de estados completa (§4 do data-model), com canal falso |
| Integração | `tests/integration/ModalPix.spec.tsx` | sequência de `onEstadoDisplay` conforme o mapa do contrato §7 |
| E2E | `tests/e2e/display-cliente.spec.ts` | as duas páginas conversando de verdade |

Os testes unitários e de integração usam o **canal injetado** (`deps.criarCanal`) — não
dependem do `BroadcastChannel` do jsdom (research D13). O `ModalPix.spec.tsx` existente já
traz o padrão a seguir: `erpFake()` por `deps.erpClient`, `intervaloMs: 20`, sem fake
timers, com os helpers `esperarAlemDeUmTick` / `esperarPollingParar` que já moram lá.

---

## Cenários de validação

Cada cenário mapeia para uma user story da spec. Os cinco primeiros são o conjunto mínimo
para dar a feature por pronta.

### Cenário 1 — Espelho da cobrança (US1)

1. Abrir o checkout, abrir `/display` numa segunda aba e deixá-la à vista.
2. No checkout: inserir um pagamento em PIX de **R$ 87,40**.

**Esperado**: o display sai do repouso e mostra QR Code, `R$ 87,40` e o aviso de espera. O
`trnGuid` e o valor coincidem com os da janela do operador. Escanear com um celular e
confirmar que o app do banco reconhece **a mesma** cobrança.

**Contraprova que importa**: durante a geração (antes de o QR existir), o display
permanece em **repouso** — sem esqueleto, sem promessa (FR-010).

### Cenário 2 — Abertura no meio da cobrança (US2) — *o ponto de atenção do pedido*

1. Inserir o PIX **primeiro**, com nenhum display aberto.
2. Só então clicar no botão do monitor da barra superior.

**Esperado**: a tela abre e, em até 2 segundos, já está mostrando a cobrança em curso, sem
nenhuma ação adicional. É o handshake (FR-017) funcionando.

### Cenário 3 — Reaproveitamento da janela (US2)

Clicar no botão do monitor três vezes.

**Esperado**: exatamente **uma** tela de display existe, trazida à frente a cada clique
(FR-028, SC-007). Se aparecerem três abas, o `noopener` voltou ao `window.open` — ver
research D3.

### Cenário 4 — Confirmação e volta ao repouso (US3)

Pagar o PIX de verdade (ou aprovar pelo mock).

**Esperado**: o display troca para a confirmação com contador regressivo, e volta sozinho
ao repouso ao fim de 10 s. Repetir clicando **"Concluir"** no checkout aos ~3 s: as duas
telas voltam **juntas** (FR-025).

### Cenário 5 — Cobrança obsoleta nunca fica presa (US4)

Com o QR no ar, executar os dois casos:

- **a.** Fechar a aba do checkout normalmente → o display volta ao repouso **imediatamente**
  (`pagehide`, FR-021).
- **b.** Matar a aba do checkout sem deixá-la rodar código — pelo gerenciador de tarefas do
  navegador (`Shift+Esc` no Chromium) → o display volta ao repouso em **no máximo 15 s**
  (FR-020). É o caso que o `pagehide` não cobre e o motivo de o pulso existir.

### Cenário 6 — Duas abas de checkout (US4)

Abrir duas abas de checkout e um display. Gerar o PIX na aba A. Com o QR na tela do
cliente, recarregar o display.

**Esperado**: o display volta a mostrar a cobrança da aba A. A aba B, em repouso, **não**
responde ao handshake e **não** apaga o QR (FR-018, research D7). Esta é a regra mais fácil
de quebrar numa refatoração — se o QR sumir aqui, o handshake voltou a responder sempre.

### Cenário 7 — Privacidade do repouso (US4)

Deixar o display em repouso e inspecionar a tela.

**Esperado**: nome da loja e saudação, e mais nada — nenhum item, preço, total, nome ou
documento (FR-003, SC-006). Conferir também que o nome exibido é **o da loja**
(`Mercado Aurora`), e **não** `Centrium Checkout - Mercado Aurora`: se aparecer o nome do
produto, a implementação usou `tituloDoProduto` em vez de `nomeDaLoja` (research D1).

### Cenário 8 — Segundo PIX na mesma venda (FR-026)

Com a confirmação do primeiro PIX ainda na tela (contador correndo), gerar um segundo PIX.

**Esperado**: o display troca **imediatamente** para a nova cobrança e a contagem anterior
é descartada.

### Cenário 9 — F5 na URL direta (FR-023)

Recarregar `/display` diretamente pela barra de endereço, em dev (`npm run dev`) e contra o
build (`npm run build && npm start`).

**Esperado**: a tela carrega nas duas pontas — em dev pelo fallback de SPA do Vite, em
produção pelo `setNotFoundHandler` do Fastify (`src/server/index.ts:50`). Nenhuma mudança
de servidor foi necessária (research D12).

---

## Rodada manual completa

```bash
npm run dev
```

Depois, no navegador: `/session/start` com as credenciais do tenant de teste, inserir um
PIX, clicar no botão do monitor e percorrer os cenários 1 a 8 nas duas telas lado a lado.

`npm run dev` sozinho derruba o BFF se as variáveis de ambiente vierem só do compose —
receita e contorno estão registrados no projeto (`dev-server-local-sem-docker`).

---

## Checklist de conclusão

- [ ] `npm run typecheck`, `npm run lint` e `npm run test` verdes
- [ ] `npm run test:e2e` verde, com a porta 3100 conferida antes
- [ ] Cenários 1 a 9 validados manualmente
- [ ] `.specs/project/STATE.md`: ADs novos (canal entre abas; `noopener` abandonado; display sem polling próprio; `nomeDaLoja`)
- [ ] `.specs/project/PENDENCIES.md`: item 28 fechado
- [ ] `.specs/project/ROADMAP.md`: feature 015 na tabela
- [ ] `.specs/codebase/ARCHITECTURE.md`: seção nova sobre a segunda aba e o canal
- [ ] Commit + push na branch e PR (`rules.md`)
