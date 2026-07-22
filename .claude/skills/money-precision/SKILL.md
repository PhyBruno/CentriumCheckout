---
name: money-precision
description: Use ao implementar ou revisar qualquer lógica de precificação, desconto, troco ou arredondamento monetário no CentriumCheckout — motor de precificação por faixas de quantidade, cálculo de total do carrinho, troco de pagamento, ou qualquer formatação de valores monetários.
---

# Aritmética monetária e motor de precificação — CentriumCheckout

Esta skill não tem equivalente pronto encontrado em pesquisa (skills externas de "cálculo financeiro" encontradas eram sobre análise de DCF/investimentos, irrelevantes para PDV). Foi escrita do zero para este projeto porque é a área de maior risco: o CentriumCheckout tem 100% do código gerado por IA, e erros de arredondamento ou de regra de faixa em precificação viram diferença de caixa real.

## Regra inegociável: nunca `number` de ponto flutuante para dinheiro

- Todo valor monetário é representado em **centavos, como inteiro** (ou via uma lib de precisão decimal tipo `dinero.js`) — nunca como `number` fracionário representando reais.
- Proibido: `preco * 1.1`, `total.toFixed(2)` para gerar outro valor usado em cálculo, `parseFloat(string) + parseFloat(string)` em soma de preços.
- Permitido: `toFixed`/formatação apenas na camada de **exibição final** (ex.: `Intl.NumberFormat`), nunca como entrada de outro cálculo.
- Divisão (ex.: rateio de desconto entre linhas) deve definir explicitamente para onde vai o resto da divisão inteira (não pode "sumir" nem "aparecer" centavo por arredondamento simétrico ingênuo).
- Ao revisar um PR ou um diff gerado por IA: qualquer literal `number` operando sobre um campo de preço é suspeito até provar o contrário — pergunte "isso é centavos inteiros ou reais fracionários?" antes de aprovar.

## TDD obrigatório — casos de teste que devem existir antes da implementação

Alinhado com `ecc:tdd-workflow` / `superpowers:test-driven-development` (RED antes de GREEN). O motor de precificação é função pura (sem dependência de React/Zustand/Query — ver seção 3 do ARCHITECTURE.md), o que torna esses testes triviais de isolar. Nenhuma implementação do motor deve ser aceita sem que **todos** estes casos existam primeiro:

1. `usaPrecoPorQuantidade = false` → preço aplicado é sempre `precos[1]`, mesmo que a quantidade ultrapasse qualquer faixa.
2. `usaPrecoPorQuantidade = true`, quantidade abaixo do primeiro limiar → preço da faixa base.
3. Atingir exatamente o limiar de uma faixa → **todas** as unidades daquele SKU na venda passam a valer o preço da faixa (modelo flat, não progressivo por banda) — testar que não há cálculo "parcial" misturando preços de duas faixas na mesma linha.
4. Duas linhas de carrinho separadas do mesmo SKU → a quantidade que dispara a faixa é a **soma agregada** das duas linhas, não a quantidade de cada linha isolada.
5. Inserir uma nova linha de um SKU já presente no carrinho → dispara `repriceSku(sku)`, que recalcula **todas** as linhas daquele SKU (não só a linha nova).
6. Editar a quantidade de uma linha existente → mesmo efeito: `repriceSku(sku)` recalcula todas as linhas daquele SKU.
7. Remover uma linha que derruba a quantidade agregada abaixo de um limiar → as linhas remanescentes daquele SKU voltam a recalcular para a faixa inferior (teste de cascata).
8. Remover uma linha sem cruzar limiar nenhum → preço das linhas remanescentes não muda.
9. `repriceSku` após reload de página (F5): o teste deve simular que o cache do TanStack Query está vazio (não instanciado) e que os dados de `precos`/`faixasQuantidade` usados são os que já estavam copiados na própria linha do carrinho persistida em `localStorage` — nunca uma chamada de rede nem dependência do cache em memória.
10. Teste de regressão de ponto flutuante: somar N vezes um valor "problemático" em float (ex.: 0.1 + 0.2 em reais) e confirmar que a implementação em centavos inteiros não produz o erro clássico de arredondamento.

## Checklist de revisão para código gerado por IA nesta área

Como "100% do código é gerado por IA" é uma preocupação central do projeto (ver seção 1 do ARCHITECTURE.md), ao revisar qualquer diff que toque o motor de precificação ou o total do carrinho:

- **Alucinação de contrato**: o código assume algum campo do produto/payload que não está definido no schema Zod de fronteira (ex.: inventar `produto.descontoMaximo` que não existe na resposta real do ERP)? Isso só é pego se a fronteira estiver validada com Zod — se este código lê um campo sem que ele passe primeiro pela validação Zod da resposta do ERP, é um sinal de alerta.
- **Tipagem fraca no limite**: qualquer `any`, `as` (type assertion) ou `!` (non-null assertion) em dados vindos do ERP nesta área deve ser tratado como bug — o TypeScript `strict` existe exatamente para isso (ver seção 2 do ARCHITECTURE.md: "principal defesa contra alucinação de campos/contratos em código gerado por IA").
- **Fonte de dados do reprice**: confirme que o recálculo lê os dados já persistidos na linha do carrinho, nunca o cache do TanStack Query ao vivo (regra de fronteira da seção 3 do ARCHITECTURE.md) — um código gerado por IA que "otimiza" reusando o cache diretamente quebra a garantia de sobrevivência a F5.
- **Reatividade esquecida**: qualquer mutação de carrinho (inserir/editar/remover) que não dispare `repriceSku` para o SKU afetado é bug, mesmo que o "caminho feliz" pareça funcionar — cobrir isso é o papel dos testes 5–8 acima.

## Referência

Pesquisa de skills existentes (via `ecc:skill-scout`) não encontrou nenhuma skill pronta e vetável para aritmética monetária/motor de precificação aplicável a este domínio — as únicas skills externas encontradas sobre "cálculo financeiro" eram voltadas a análise de investimentos (DCF), sem relação com PDV/checkout. Esta skill foi escrita para preencher esse gap.
