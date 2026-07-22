---
name: zod-boundary-validation
description: Use ao implementar ou revisar qualquer parsing de dado vindo de fora da aplicação (payload de bootstrap do ERP, resposta de produto, resposta do TEF/PIX, resposta de finalização de venda). Garante que nenhum dado externo entra na lógica de negócio sem passar por um schema Zod.
---

# Validação de fronteira com Zod

Inspirada em `anivar/zod-skill`, adaptada aos 4 pontos de fronteira concretos do CentriumCheckout (ver `ARCHITECTURE.md`, seção 2).

## Regra central

Todo dado que entra na aplicação vindo do ERP, do TEF ou da API de PIX passa por `schema.safeParse` antes de tocar qualquer lógica de negócio.

- Nunca usar `schema.parse` cru sem tratamento do erro (deixa a exceção vazar para a UI sem contexto).
- Nunca usar `as Tipo` para "confiar" na resposta de rede — isso remove exatamente a defesa que o projeto precisa.
- Como 100% do código é gerado por IA, o schema Zod é a linha de defesa contra campo alucinado, campo renomeado sem aviso ou contrato divergente do que o ERP realmente envia. Um `safeParse` que falha deve ser tratado como um evento de primeira classe (log estruturado + mensagem acionável), não engolido.

## Os 4 pontos de fronteira do projeto

Cada um tem um schema dedicado e nomeado — não reaproveitar um schema genérico entre pontos de fronteira diferentes, mesmo que pareçam parecidos hoje:

1. **`BootstrapPayloadSchema`** — payload de ~5MB do bootstrap (seção 5, passo 2). Contém as flags de comportamento do tenant (ex.: `usaPrecoPorQuantidade`), regras de arredondamento, formas de pagamento habilitadas. Validar por completo antes de gravar no Dexie.
2. **`ProdutoRespostaSchema`** — resposta de busca de produto por SKU/código de barras. Precisa validar `sku`, `precos` (tupla/array de 5 posições, `precos[1..5]`) e `faixasQuantidade` (as faixas são por produto, não configuração geral — ver seção 4 do ARCHITECTURE.md).
3. **`TefPixRespostaSchema`** — resposta do TEF local ou da API de PIX. Modelar como união discriminada pelo campo de status (ex.: `status: "aprovado" | "negado" | "pendente"`), não como um objeto único com campos opcionais soltos — uma união discriminada obriga a tratar os três casos explicitamente no código consumidor.
4. **`FinalizacaoVendaRespostaSchema`** — resposta do `POST` de finalização de venda (seção 5, passo 8), que devolve a NFCe pronta para impressão.

## Web Worker

A validação do `BootstrapPayloadSchema` roda dentro do Web Worker que faz fetch/parse do payload de 5MB (seção 5, passo 2) — nunca na thread principal. O resultado que sai do worker já deve estar validado; o código que recebe a mensagem do worker não deve precisar validar de novo.

## TDD

Para cada um dos 4 schemas, o teste vem antes da implementação e deve cobrir pelo menos:

- Um fixture sintético válido (ex.: `{ sku: "SKU-SINT-001", precos: [1000, 950, 900, 850, 800] }` em centavos) que passa no `safeParse`.
- Um fixture sintético quebrado de propósito (campo faltante, tipo trocado, enum fora do conjunto esperado) que deve falhar no `safeParse` — e o teste verifica que a falha é capturada antes de chegar à lógica de negócio, não que ela simplesmente não quebra o app.

Nunca usar dado real de produção nos fixtures — sempre valores sintéticos.
