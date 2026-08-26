# Quickstart — Validação: Layout Responsivo (Desktop/Mobile)

**Feature**: `specs/007-layout-responsivo-mobile/` | Pré-requisitos: features 001/002/003/005/012 implementadas (mínimo para haver `vendaStore` com carrinho, cliente e vendedor); 004/008 podem estar em stub/mock enquanto suas fases Design não rodam — ver `plan.md`, Technical Context.

## 1. Testes automatizados (primeira linha de verificação)

```bash
# Unitário — domínio puro de layout
npx vitest run tests/unit/domain/layout/

# Integração — wizard e preservação de estado ao trocar layout
npx vitest run tests/integration/mobileWizard.spec.ts

# E2E — golden path em cada layout + redimensionamento cruzando o breakpoint
npx playwright test tests/e2e/layout-desktop.spec.ts tests/e2e/layout-mobile.spec.ts tests/e2e/layout-responsivo.spec.ts
```

Critério de aprovação: os três blocos passam sem skip, e o E2E de redimensionamento (`layout-responsivo.spec.ts`) confirma que o total do carrinho antes e depois da troca de viewport é idêntico (`SC-003`).

## 2. Validação manual — alternância de layout (`US1`, `MOB-01`/`MOB-02`)

1. Abrir o Checkout numa viewport larga (`>= 768px`) — confirmar tela única (desktop).
2. Adicionar 2+ itens ao carrinho, selecionar um cliente e um vendedor.
3. Redimensionar a janela (ou usar o device toolbar do DevTools) para `< 768px`.
4. **Esperado**: a interface troca para o wizard de 3 etapas, começando na etapa 1; os mesmos itens, cliente e vendedor continuam presentes (verificável reabrindo a etapa 3 — revisão).
5. Redimensionar de volta para `>= 768px`.
6. **Esperado**: volta à tela desktop, com o mesmo estado — nenhum item duplicado, nenhum item perdido.

## 3. Validação manual — navegação no wizard (`US2`, `MOB-03`/`MOB-04`)

1. Em viewport mobile, avançar da etapa 1 até a etapa 3.
2. Voltar à etapa 1 usando a navegação livre.
3. Alterar um dado (ex.: adicionar mais um item).
4. Avançar novamente até a etapa 3.
5. **Esperado**: a alteração feita na etapa 1 aparece corretamente na revisão da etapa 3 — sem estado desatualizado.

## 4. Validação manual — atalhos desativados no mobile (`MOB-05`)

1. Em viewport mobile, com o foco fora de qualquer campo de texto, pressionar a combinação de finalizar venda do desktop (ex.: `Ctrl+Enter`, ver `.claude/skills/react-hotkeys-pdv/SKILL.md`).
2. **Esperado**: nenhuma ação dispara — o atalho simplesmente não existe nessa árvore.

## 5. Validação manual — Scanner por câmera (`US3`, `MOB-06`, AD-086/AD-090)

**Em Chrome/Android:**
1. Na etapa 1 (mobile), tocar em "Scanner".
2. Conceder permissão de câmera quando solicitado.
3. Apontar para um código de barras válido de um produto existente.
4. **Esperado**: o produto é inserido no carrinho pelo mesmo caminho de uma bipagem por leitor físico (mesmo preço, mesma regra de faixa/desconto).

**Fora de Chrome/Android (ex.: Safari/iOS, Chrome desktop):**
1. Abrir a etapa 1 (mobile, quando aplicável) ou observar a etapa de produtos.
2. **Esperado**: o botão "Scanner" **não aparece** — nenhum botão desabilitado, nenhuma mensagem.

## 6. Fora de escopo desta validação

Corretude de preço/desconto (feature 003), regra de troca de cliente/vendedor (005/012), roteamento de pagamento TEF/PIX (008) e emissão fiscal (004) — este quickstart valida só a composição e a preservação de estado entre layouts, não a lógica de negócio das telas compostas.
