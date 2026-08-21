# Architecture

**Pattern:** SPA (single-page application) consumidora de API externa — sem backend próprio. Estado dividido entre estado de servidor (cache do ERP via TanStack Query), estado de sessão/venda (Zustand) e persistência local só para configuração (Dexie).

> Nota: como ainda não existe código-fonte, este documento registra a arquitetura **decidida**, não extraída de código real (diferente do uso padrão de brownfield mapping). Deve ser revalidado contra o código assim que o scaffolding inicial existir.

## High-Level Structure

```
ERP (autentica operador, abre URL do Checkout com credenciais)
        │
        ▼
CheckoutWEB (SPA React)
        │  consome
        ▼
API do ERP (ApiCentriumOAuth.yaml) ── produtos, clientes, pagamento, NFCe
        │
        ├── TEF local (HTTP, máquina do PDV)
        └── Servidor de impressão local (HTTP, máquina do PDV)
```

Não há banco de dados nem serviço próprio do Checkout — toda fonte de verdade de negócio (produto, cliente, pagamento, NFCe) vive no ERP.

## Divisão de responsabilidades e persistência

| Camada | Tecnologia | Responsabilidade | Persiste? |
|---|---|---|---|
| Configuração do tenant/PDV | Dexie (IndexedDB) | Flags de comportamento gerais vindas do payload de bootstrap (~5MB) (ex.: `usaPrecoPorQuantidade` ⚠️ nome de campo não confirmado no schema de `GetSessao`, regras de arredondamento, formas de pagamento habilitadas) | Sim — sobrevive a F5, atualizado por versão/hash para evitar re-transferência desnecessária |
| Produto | TanStack Query | Busca por SKU/código de barras no ERP, no ato da inserção. Retorna `preco1..preco5` e as faixas de quantidade do próprio produto | Não — cache em memória com `staleTime: Infinity` durante a venda; descartado ao finalizar/cancelar |
| Formas/condições de pagamento | TanStack Query | Cache em memória, `staleTime` de 30 minutos | Não |
| Venda em andamento (carrinho) | Zustand (sem `persist`) | Itens, cliente selecionado, vendedor selecionado (ver `.specs/features/selecao-vendedor/spec.md`), descontos | Não — vive só em memória durante a sessão; não sobrevive a F5 (ver AD-006 em `.specs/project/STATE.md`) |
| Motor de precificação | Função pura (camada de domínio, sem dependência de React/Zustand/Query) | Calcula o preço aplicado por linha (ver `.specs/features/carrinho-produto-precificacao/spec.md`) | N/A (stateless) |
| Estado de UI efêmero | Zustand sem `persist`, ou estado local de componente | Modais, loading, resultados de busca | Não |

**Regra de fronteira:** o carrinho nunca referencia dados do Dexie/TanStack Query ao vivo. Ao inserir um item, os campos necessários do produto (preços, faixas) são copiados para dentro do estado do carrinho no momento da inserção — a lógica de reprecificação sempre opera sobre os dados já capturados na linha, nunca dependendo do cache de produto continuar presente.

**Regra de consistência do cache de produto:** dentro de uma venda aberta, o cache de produto não se atualiza sozinho por tempo decorrido (`staleTime` efetivamente infinito) — evita que o mesmo SKU rebuscado no meio da venda gere linhas com preços de tabelas divergentes. A única fronteira de frescor é o fim da venda (finalização ou suspensão), quando o cache é descartado por completo.

## Autenticação e segurança

O `access_token` e as credenciais originais recebidas do ERP são armazenados em cookie `HttpOnly` (inacessível a JavaScript, mitigando exfiltração via XSS) — não em `localStorage`/`sessionStorage`. Fluxo completo em `.specs/features/autenticacao-sessao-bootstrap/spec.md`.

## Responsividade

Uma única aplicação atende desktop e mobile via layout condicional sobre o mesmo estado de venda (Zustand) — sem build ou rota separada. Detalhes em `.specs/features/layout-responsivo-mobile/spec.md`.

No design (`design/CentriumCheckout.pen`), a tela principal desktop já está modelada como um único componente reutilizável (`Fundo PDV Online Web`) dividido em duas áreas — "Venda e produtos" e "Pagamento e totais" — confirmando visualmente a divisão de responsabilidades documentada acima.

**Modal menu gerencial:** não é uma tela própria do Checkout — é um menu de navegação com duas opções, ambas apontando para telas do sistema legado do ERP via redirect (`TENANT + baseDomain + <caminho>`, reaproveitando o padrão de montagem de host de AD-002/AD-003, formalizado para este caso em AD-020 em `.specs/project/STATE.md`). Existe só no desktop — confirmado pelo usuário (2026-08-21) que não há equivalente mobile (ver `.specs/features/layout-responsivo-mobile/spec.md`, Out of Scope). Frame `PDV Online Web - Modal menu gerencial` (id `viV0S`) em `design/CentriumCheckout.pen`, sub-frames `Cabeçalho modal menu gerencial`, `Corpo modal menu gerencial` (as duas opções abaixo) e `Rodapé modal menu gerencial` (só botão "Cancelar" — sem tela própria a "salvar/confirmar").

| Opção no design | Descrição no design | Destino |
|---|---|---|
| "Central de movimentação não fiscal" | "Sangria, suprimento e outras movimentações de caixa" | `TENANT + baseDomain + /WPMovimentoNaoFiscal_Lancamento.aspx` (confirmado pelo usuário) |
| "Relatório de resumo de caixa" | "Totais, formas de pagamento e fechamento do caixa" | ⚠️ **pendente** — URL da tela legada equivalente não foi confirmada pelo usuário; não presumir que é a mesma `WPMovimentoNaoFiscal_Lancamento.aspx` da primeira opção, já que o conteúdo descrito (relatório de fechamento de caixa) é distinto de movimentação não fiscal |

Cada opção é só um link/navegação para fora do Checkout — nenhuma das duas é implementada como funcionalidade dentro da SPA (sem chamada de API própria, sem estado no Zustand). Ver `.specs/codebase/CONCERNS.md`, "Telas desenhadas sem spec de requisito", para o histórico da pendência.

## Containerização (Docker)

100% Docker, cobrindo todo o ciclo:

- **Desenvolvimento:** container roda o servidor de dev do Vite com hot-reload, código-fonte montado via volume.
- **Produção:** build multi-stage — um estágio compila os assets estáticos, outro serve esses assets (ex.: Nginx) em imagem final enxuta.
- **Fora do escopo do container:** TEF e servidor de impressão continuam nativos na máquina física do PDV (ver `.specs/codebase/INTEGRATIONS.md`).
- **Domínio base da API do ERP:** vem de variável de ambiente Docker chamada `baseDomain`, configurada por ambiente de implantação (dev/staging/produção) (ver AD-019 em `.specs/project/STATE.md`).
- **Imagem-base:** `node:<version>-slim`, para dev e produção.
- **CI/CD (produção):** a cada merge na `master`, workflow do GitHub Actions builda a imagem e publica no Docker Hub.
- **CI/CD (dev):** script PowerShell local que executa todo o processo de build e sobe a imagem, sem depender de Actions.

## Code Organization

A definir quando o scaffolding inicial for criado — ainda não há árvore de diretórios real. Ver `.specs/project/ROADMAP.md` ("Ainda não gerados") para `CONVENTIONS.md`/`STRUCTURE.md`/`TESTING.md`.
