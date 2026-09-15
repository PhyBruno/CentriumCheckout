# Quickstart: validação dos atalhos fixos

**Feature**: 016 | **Date**: 2026-09-15 | **Plan**: [plan.md](./plan.md)

Roteiro de validação de ponta a ponta. Tipos e assinaturas em [contracts/atalhos-fixos-api.md](./contracts/atalhos-fixos-api.md); a máquina de decisão em [data-model.md](./data-model.md).

## Pré-requisitos

```bash
docker compose up -d          # stack completa (ERP mock na 3100)
npm run test -- hotkeys       # suíte de componente dos atalhos
npx tsc --noEmit              # gate obrigatório antes de qualquer push
```

**Antes de crer numa falha E2E, derrube a porta 3100** — uma stack de teste antiga deixada de pé já produziu falsos negativos em massa nesta base.

**A validação de posse (C1–C4) não é fiel em navegador dirigido por CDP.** Tecla injetada pelo DevTools Protocol não passa pelos aceleradores do navegador, então o Chrome não abriria a barra de busca nem com o bug presente. Esses quatro cenários exigem **pressionada real de teclado** num Chrome comum; os demais rodam em automação.

---

## C1 — A tecla não escapa durante o carregamento *(P1, FR-002)*

O caso mais frequente: acontece em toda abertura da tela.

1. Abra a tela de venda com a rede estrangulada (throttling lento), de modo que o catálogo do ERP demore a resolver.
2. Enquanto o esqueleto ainda está na tela, pressione **F3**.

**Esperado**: a barra de busca do Chrome não aparece; o foco não muda de lugar. Ao terminar o carregamento, F3 abre o modal de cliente normalmente.

**Falha que este cenário pega**: posse derivada de query — o bug original.

---

## C2 — A tecla não escapa com o foco num campo *(FR-005)*

1. Com a venda aberta, lance um item e clique no campo de **quantidade**.
2. Pressione **F1**, depois **F10**.

**Esperado**: nenhuma aba de ajuda, nenhuma barra de menus focada. O que for digitado em seguida continua indo para o campo de quantidade.

---

## C3 — A tecla não escapa com janela aberta *(FR-006, I3)*

1. Abra o modal de cliente (F3).
2. Pressione **F4**.

**Esperado**: nenhum segundo modal abre, e o navegador também não reage. O modal de cliente permanece utilizável.

---

## C4 — Tecla segurada aciona uma vez só *(FR-007, I4)*

1. Com a venda vazia, segure **F1** por dois segundos.

**Esperado**: a janela de DAV abre **uma** vez. Nenhuma reação do navegador durante a repetição.

---

## C5 — Cliente e produto sem tocar no mouse *(P2, FR-020)*

1. Com o foco fora de qualquer campo, pressione **F3**.
2. Digite o nome do cliente **sem clicar em lugar nenhum** e confirme pelo teclado.
3. Repita com **F4** e um código de produto.

**Esperado**: em ambos, o modal abre com o cursor já no campo de busca; a digitação entra sem nenhum clique intermediário; a seleção conclui por teclado.

**Falha que este cenário pega**: foco disparado antes de a janela deixar de ser inerte — ignorado em silêncio, sem erro no console.

---

## C6 — O foco não depende de como o modal abriu *(FR-021)*

1. Abra o modal de produto **por clique** no controle da tela.

**Esperado**: o campo de busca está focado, igual ao caminho por tecla.

---

## C7 — Importação recusada em venda em andamento *(P3, FR-013/FR-014)*

1. Venda vazia → **F1** abre a janela de DAV. Feche.
2. Lance um item. Pressione **F1**.
3. Limpe a venda, identifique um cliente (não o padrão). Pressione **F2**.

**Esperado**: nos passos 2 e 3 a janela não abre e o operador recebe a mensagem de recusa — a **mesma** que o botão "Menu Importação" bloqueado apresenta. Nada de reação silenciosa.

---

## C8 — Cliente padrão não bloqueia *(FR-013, regra AD-138)*

1. Venda em que apenas o cliente padrão foi aplicado, sem item.
2. Pressione **F1**.

**Esperado**: a janela de DAV abre. Cliente padrão não é venda em andamento.

---

## C9 — F10 suspende, e só *(P4, FR-017)*

1. Venda com itens lançados. Pressione **F10**.
2. Confirme.
3. Retome a venda suspensa.

**Esperado**: a confirmação é a mesma do botão "Cancelar venda"; a venda é **suspensa** e retomável com o mesmo conteúdo; em nenhum momento é oferecido cancelar com descarte.

4. Com a venda vazia, pressione **F10**.

**Esperado**: recusa explicada, sem vazar para o navegador.

---

## C10 — PDV de toque sem mouse *(P5, FR-011/FR-012)*

Emule um dispositivo sem apontador fino (DevTools → emulação de toque, sem mouse), com cenários de pagamento cadastrados no operador.

1. Verifique que a faixa "Métodos de pagamento rápidos" **não** é renderizada.
2. Pressione a tecla de um cenário (F6–F9).
3. Pressione **F3**.

**Esperado**: o pagamento do cenário é lançado igual ao desktop, apesar de a faixa não aparecer; o modal de cliente abre normalmente. Em desktop, a faixa continua sendo renderizada.

---

## Cobertura de teste exigida *(SC-007)*

Para **cada** atalho de ação, dois casos obrigatórios (skill de projeto `react-hotkeys-pdv`):

| Caso | O que verifica |
|---|---|
| (a) aciona com o foco fora de campo de entrada | O caminho feliz |
| (b) não vaza para o navegador durante digitação no campo de busca/bipagem | O caso que costuma faltar — e o que motivou a feature |

Atalhos simulados com `user-event` (`userEvent.keyboard('{F1}')`), nunca com `keyDown` cru via DOM.

**Lembrete de teste desta base**: o `user-event` não conhece teclas de função no mapa padrão e emite `code: 'Unknown'`. O casamento por `event.key` (`useKey: true`, AD-176) é o que mantém esses atalhos verificáveis em teste de componente — o mapa fixo precisa da mesma opção, ou os testes (a) e (b) só existiriam no E2E.
