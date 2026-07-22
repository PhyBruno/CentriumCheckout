---
name: dexie-bootstrap-cache
description: Use ao implementar, revisar ou testar a persistência do payload de bootstrap do tenant (Dexie/IndexedDB) no CentriumCheckout — schema, versionamento, Web Worker de parse/validação, e o que deve (ou não) viver nessa camada.
metadata:
  origin: "Inspirada em devfirexyz/ui-skills (dexiejs), reescrita para as regras específicas deste projeto"
---

# Dexie.js — cache do payload de bootstrap

## Escopo desta skill

Esta skill cobre **apenas** a camada Dexie (IndexedDB) descrita na seção 3 do
`ARCHITECTURE.md`: as flags de comportamento do tenant/PDV vindas do payload de
bootstrap (~5MB). Ela **não** cobre:

- Venda em andamento (carrinho) → Zustand + `persist(localStorage)`. Ver skill
  de estado da venda.
- Produto e formas de pagamento → TanStack Query, cache em memória. Ver skill
  de TanStack Query.

Regra de fronteira: se o dado precisa sobreviver a F5 e é uma **flag/config
geral do tenant** (ex.: `usaPrecoPorQuantidade`, regras de arredondamento,
formas de pagamento habilitadas), ele pertence ao Dexie. Se muda por venda ou
vem do ERP sob demanda, não pertence ao Dexie.

## Padrões de schema e versionamento

- Uma tabela por domínio de configuração (ex.: `config`), nunca uma tabela
  genérica tipo `key-value` fantasma — schema explícito facilita tipagem
  forte, o que importa especialmente em código gerado por IA.
- Versionar o schema com `db.version(n).stores({...})`; mudanças de schema
  exigem um novo `.version().upgrade()` migrando os dados existentes, nunca um
  `db.delete()` silencioso.
- Usar `liveQuery` (do próprio core `dexie`) — ou `useLiveQuery` de
  `dexie-react-hooks` na camada React — apenas onde a UI precisa reagir a
  mudanças da própria config em tempo real (raro nesta camada, já que a config
  só muda no bootstrap) — não usar por padrão. (`dexie-observable` é um addon
  de sincronização, não a fonte do `liveQuery`; não confundir.)

## Fluxo específico do projeto (ARCHITECTURE.md, seção 5, passo 2)

1. Fetch do payload de ~5MB na API do ERP.
2. Parse e validação (Zod) rodam **dentro de um Web Worker** — nunca na thread
   principal, para não travar a UI do PDV.
3. O resultado normalizado é gravado no Dexie, em tabelas por domínio (ex.:
   `config`).
4. Antes de refazer o download completo, comparar versão/hash do payload
   contra o que já está persistido — só regravar se houver mudança. Isso evita
   re-transferir 5MB a cada carregamento da aplicação.

Ao implementar, a skill de código deve sempre incluir um teste que force os
dois caminhos: (a) hash igual → nenhum novo `GET`/nenhuma regravação; (b) hash
diferente → novo `GET`, novo parse no worker, e `upgrade`/regravação da
tabela.

## TDD para esta camada

- Não depender de um IndexedDB real no ambiente de teste: usar `fake-indexeddb`
  (ou equivalente já adotado no projeto) importado antes de instanciar o
  `Dexie` nos testes Vitest.
- Testes mínimos exigidos antes de qualquer implementação (RED primeiro):
  1. Dado um payload com hash novo, `bootstrapConfig()` grava a tabela
     `config` e retorna os dados normalizados.
  2. Dado um payload com o mesmo hash já persistido, `bootstrapConfig()` não
     dispara novo fetch nem regrava a tabela (mock do fetch deve registrar
     zero chamadas).
  3. Dado um schema em versão N+1, o `upgrade()` migra registros da versão N
     sem perda de campos.
  4. O parse/validação do payload roda isolado (função pura testável fora do
     Worker), e o Worker é apenas o transporte — isso permite testar a lógica
     de validação sem precisar simular `Worker` no ambiente de teste.

## Nota de origem

Esta skill foi escrita a partir da inspiração conceitual da skill
`devfirexyz/ui-skills` (dexiejs) — conteúdo vetado previamente (apenas
Markdown, sem comandos de shell, chamadas de rede ou credenciais). Como esse
repositório é pequeno e recente, o conteúdo foi reescrito localmente em vez de
depender do upstream, e adaptado às regras específicas de negócio deste
projeto (seções 3, 5 e 7 do `ARCHITECTURE.md`).
