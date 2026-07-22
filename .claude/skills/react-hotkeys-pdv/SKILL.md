---
name: react-hotkeys-pdv
description: Use ao implementar, revisar ou testar qualquer atalho de teclado no CentriumCheckout (react-hotkeys-hook). Garante que atalhos globais não colidam com a bipagem de código de barras nem com digitação em campos de busca/quantidade, e que todo atalho novo passe por um mapa central e por teste automatizado.
metadata:
  origin: criada do zero para o projeto — nenhum candidato de mercado equivalente foi encontrado na pesquisa de skills (tech-leads-club/agent-skills, GitHub search, skills.sh)
---

# Atalhos de teclado no PDV (react-hotkeys-hook)

## Por que esta skill existe

O CheckoutWEB é um PDV: o operador **bipa códigos de barras constantemente**, e um bipe nada mais é do que uma sequência de teclas digitadas em altíssima velocidade seguida de `Enter`. Qualquer atalho de teclado mal desenhado pode:

- Disparar acidentalmente quando um caractere do código de barras coincide com uma tecla de atalho global.
- Disparar quando o operador está digitando em um campo de busca, quantidade ou desconto, atrapalhando o fluxo de venda.
- Conflitar com outro atalho já existente, silenciosamente, porque não existe um único lugar que liste todos os atalhos do sistema.

Como 100% do código deste projeto é gerado por IA, o risco de duplicação/colisão de atalhos introduzida sem perceber é maior do que em um projeto escrito à mão — por isso esta skill existe para tornar essas regras explícitas e verificáveis.

## Regras obrigatórias

### 1. Nunca usar tecla alfanumérica solta como atalho global

Proibido: `a`, `f`, `1`, `Delete` isolados como atalho global de ação (ex.: "tecla `F` finaliza a venda").

Permitido como atalho **global** (fora de campos de input): combinações ou teclas de função —`F2`, `F4`, `Ctrl+Enter`, `Ctrl+Shift+C`, `Escape`.

Justificativa: um código de barras pode conter qualquer dígito ou letra em sequência; uma tecla solta registrada como hotkey global dispara no meio da leitura do bipe.

### 2. Escopos (`scopes`) obrigatórios, nunca um único escopo global

Use os `scopes` do `react-hotkeys-hook` para separar pelo menos:

- `venda-navegacao` — atalhos de navegação entre telas/painéis (não deve estar ativo dentro de um modal).
- `venda-acao` — atalhos que alteram o carrinho (finalizar, cancelar, remover linha). Deve ficar **desativado** enquanto o foco estiver em um campo de busca/bipagem ou quantidade, exceto os atalhos explicitamente desenhados para funcionar durante a digitação (ex.: `Enter` no campo de busca já é o próprio fluxo de inserção, não um "atalho" concorrente).
- `modal` — ativado somente quando um modal está aberto; some com o modal.

Regra de ouro: **o escopo do atalho de ação de venda nunca deve estar ativo ao mesmo tempo que o foco está em um `<input>` de busca/bipagem/quantidade**, a não ser que o atalho seja especificamente `Escape` (fechar/cancelar) ou outro atalho de escape de emergência combinando `Ctrl`/`Alt`.

```tsx
// Errado: hotkey solta, sem escopo, sempre ativa
useHotkeys('f', finalizarVenda)

// Certo: combinação + escopo dedicado, inativo durante bipagem
useHotkeys('ctrl+enter', finalizarVenda, { scopes: ['venda-acao'] })
```

### 3. Mapa central de atalhos — proibido espalhar strings de tecla pelo código

Todo atalho novo **deve** ser adicionado a um único arquivo de constantes (ex.: `src/config/hotkeys.ts`), nunca declarado como string literal solta dentro de um componente. O mapa central deve conter, no mínimo: combinação de tecla, escopo, descrição curta (para eventual tela de ajuda) e a ação que dispara.

Antes de adicionar um atalho novo, quem for implementar (ou revisar) deve conferir esse mapa para garantir que a combinação não está em uso em outro escopo conflitante.

```ts
// src/config/hotkeys.ts
export const HOTKEYS = {
  finalizarVenda: { keys: 'ctrl+enter', scope: 'venda-acao', label: 'Finalizar venda' },
  cancelarVenda: { keys: 'ctrl+shift+c', scope: 'venda-acao', label: 'Cancelar venda' },
  removerLinha: { keys: 'ctrl+delete', scope: 'venda-acao', label: 'Remover linha selecionada' },
  fecharModal: { keys: 'escape', scope: 'modal', label: 'Fechar modal' },
} as const
```

### 4. TDD — todo atalho novo nasce com teste antes da implementação

Seguindo o fluxo TDD do projeto (`ecc:tdd-workflow`), escreva primeiro o teste que falha, depois a implementação:

- Simule o atalho com `user-event` do Testing Library (`userEvent.keyboard('{Control>}{Enter}{/Control}')` ou equivalente), nunca disparando `keyDown` manualmente via DOM API crua.
- Teste **dois casos por atalho de ação**: (a) dispara quando o foco está fora de campos de input e o escopo correto está ativo; (b) **não** dispara quando o foco está dentro do campo de busca/bipagem — esse segundo caso é o que mais importa e é o que costuma faltar.
- Para atalhos que devem funcionar em qualquer contexto (ex.: `Escape` fechando modal), teste explicitamente que funcionam mesmo com foco em um input.

```tsx
it('não finaliza a venda via atalho enquanto o operador está digitando no campo de busca', async () => {
  render(<Pdv />)
  await userEvent.click(screen.getByRole('textbox', { name: /buscar produto/i }))
  await userEvent.keyboard('{Control>}{Enter}{/Control}')
  expect(finalizarVendaMock).not.toHaveBeenCalled()
})
```

## Checklist de revisão para qualquer PR que adicione/altere um atalho

- [ ] A combinação de tecla não é uma tecla alfanumérica solta em escopo global.
- [ ] O atalho está registrado no mapa central (`hotkeys.ts` ou equivalente), não como string solta no componente.
- [ ] O escopo escolhido é o correto e não conflita com outro atalho já existente no mesmo escopo.
- [ ] Existe teste cobrindo o disparo correto **e** o não-disparo durante digitação em campo de busca/bipagem (quando aplicável).
- [ ] Se o atalho interage com o motor de precificação ou o carrinho, ele passa pelas mesmas funções que a ação equivalente via clique/mouse usa — nunca duplica lógica de negócio dentro do handler do atalho.
