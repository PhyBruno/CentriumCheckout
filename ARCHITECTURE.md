# Arquitetura Frontend — CentriumCheckout (CheckoutWEB)

> Documento vivo de alinhamento técnico. Registra a stack, o fluxo de negócio e a divisão de responsabilidades decididos até o momento. Itens ainda não fechados estão marcados na seção **Pontos em aberto**.

## 1. Visão geral

O CheckoutWEB é um PDV web, acessado exclusivamente via redirecionamento do ERP (que injeta `Tenant` e `Token` na URL/headers). A aplicação roda em navegador comum (sem wrapper Electron/Tauri), exige conexão com internet o tempo todo e não tem requisito de funcionamento offline. 100% do código é gerado por IA, o que reforça a necessidade de contratos de dados explícitos, tipagem forte e lógica de negócio isolada em funções puras testáveis.

## 2. Stack tecnológica

| Camada | Tecnologia | Papel |
|---|---|---|
| Core UI | React + Vite | Build e runtime da aplicação |
| Linguagem | TypeScript (`strict`) | Principal defesa contra alucinação de campos/contratos em código gerado por IA |
| Ícones | Lucide | Ícones da interface |
| Estado da venda | Zustand (+ Immer middleware) | Estado global da venda em andamento (carrinho, cliente, totais); Immer facilita updates imutáveis gerados por IA |
| Estado de servidor / cache | TanStack Query | Busca e cache em memória de dados vindos do ERP (produtos, formas de pagamento) |
| Persistência do payload de bootstrap | Dexie.js (IndexedDB) | Armazena as configurações/flags de comportamento do tenant carregadas no bootstrap |
| Persistência da venda em andamento | `localStorage` (via `persist` do Zustand) | Garante que a venda sobrevive a um F5 |
| Navegação por teclado | react-hotkeys-hook | Atalhos de teclado do PDV |
| Validação de fronteira | Zod | Validação em runtime do payload de 5MB, resposta de produto, resposta do TEF/PIX e resposta de finalização de venda |
| Aritmética monetária | Valores em centavos (inteiros) ou lib tipo `dinero.js` | Evita erro de ponto flutuante em preço/desconto/troco |
| Testes | Vitest + Testing Library + Playwright | Cobertura da lógica de precificação (crítica) e do fluxo dourado ponta a ponta |
| Empacotamento/execução | Docker | Ambiente 100% containerizado — cobre tanto desenvolvimento quanto produção (ver seção 9) |

## 3. Divisão de responsabilidades

| Camada | Tecnologia | Responsabilidade | Persiste? |
|---|---|---|---|
| Configuração do tenant/PDV | Dexie (IndexedDB) | Flags de comportamento gerais vindas do payload de 5MB (ex.: `usaPrecoPorQuantidade`, regras de arredondamento, formas de pagamento habilitadas) | Sim — sobrevive a F5, atualizado por versão/hash para evitar re-transferência desnecessária |
| Produto | TanStack Query | Busca por SKU/código de barras no ERP, no ato da inserção. Retorna `preco1..preco5` **e** as faixas de quantidade do próprio produto | Não — cache em memória com `staleTime: Infinity` enquanto a venda estiver aberta (sem refetch automático em segundo plano); descartado ao finalizar ou cancelar a venda |
| Formas/condições de pagamento | TanStack Query | Cache em memória, `staleTime` de 30 minutos | Não |
| Venda em andamento (carrinho) | Zustand + `persist(localStorage)` | Itens, cliente selecionado, descontos | Sim — apenas a fatia relevante, via `partialize` (nada de estado de UI efêmero); limpo integralmente ao finalizar ou cancelar a venda |
| Motor de precificação | Função pura (camada de domínio, sem dependência de React/Zustand/Query) | Calcula o preço aplicado por linha, dado: flag geral + preços e faixas do produto + quantidade agregada do SKU na venda | N/A (stateless) |
| Estado de UI efêmero (modais, loading, resultados de busca) | Zustand sem `persist`, ou estado local de componente | Não persiste, não sobrevive a F5 (e não deveria) | Não |

**Regra de fronteira**: o carrinho nunca referencia dados do Dexie/TanStack Query ao vivo. Ao inserir um item, os campos necessários do produto (preços, faixas) são copiados para dentro do estado do carrinho no momento da inserção — o `localStorage` fica autocontido, e a lógica de reprecificação sempre opera sobre os dados já capturados na linha.

**Regra de consistência do cache de produto**: dentro de uma venda aberta, o cache de produto não pode se atualizar sozinho por tempo decorrido — se o mesmo SKU fosse rebuscado no meio da venda com dados diferentes do ERP, linhas diferentes daquele SKU poderiam acabar com preços vindos de tabelas divergentes. Por isso o `staleTime` do produto é efetivamente infinito durante a venda (sem refetch em segundo plano); a única fronteira de frescor é o fim da venda (finalização ou cancelamento), quando o cache é descartado por completo.

## 4. Motor de precificação — regras de negócio

**Entrada**: `usaPrecoPorQuantidade` (flag do payload de 5MB) + `produto` (com seus próprios `precos[1..5]` e `faixasQuantidade`) + `quantidadeAgregadaDoSKU` (soma da quantidade de todas as linhas do carrinho com aquele SKU).

**Saída**: `{ precoAplicado, tierAplicado }`.

Regras confirmadas:
- As faixas de quantidade são definidas **por produto**, não como configuração geral do tenant. O payload de 5MB só liga/desliga o comportamento (`usaPrecoPorQuantidade`); os limiares em si vêm do próprio produto, retornado pelo ERP no ato da inserção.
- Se `usaPrecoPorQuantidade = false`, o preço aplicado é sempre `precos[1]`, independentemente de faixas.
- Se `usaPrecoPorQuantidade = true`, o modelo é de **limiar único (flat)**: ao atingir o total da faixa, **todas** as unidades daquele SKU na venda passam a valer o preço da faixa atingida — não é um modelo progressivo por banda.
- A quantidade que dispara a faixa é **agregada por SKU na venda inteira**, não por linha isolada do carrinho. Se o mesmo produto aparece em duas linhas separadas, a soma das duas é que determina a faixa.
- **Reatividade obrigatória**: qualquer mutação que afete um SKU — inserir nova linha, editar quantidade, remover linha — dispara uma reprecificação (`repriceSku(sku)`) que recalcula **todas** as linhas daquele SKU na venda, não só a linha alterada.
- **Cascata na remoção**: se a remoção de uma linha derruba a quantidade agregada do SKU abaixo de um limiar, as linhas remanescentes voltam a recalcular para a faixa inferior automaticamente.
- O preço aplicado não deve ser tratado como valor fixo desde a inserção — ele é reavaliado a cada mutação relevante do carrinho, para não depender de lembrar de "recalcular manualmente" em fluxos secundários (edição em lote, split de item, etc.).
- **Fonte de dados do `repriceSku`**: o recálculo sempre lê os `precos`/`faixasQuantidade` já persistidos na própria linha do carrinho (copiados na inserção, ver "Regra de fronteira" na seção 3) — nunca depende do cache do TanStack Query estar presente. Isso garante que editar a quantidade de uma linha já existente funcione corretamente mesmo após um F5, quando o cache em memória do TanStack Query já foi perdido mas o carrinho persistido em `localStorage` sobrevive. Uma nova chamada ao ERP só acontece quando o operador insere o produto novamente — não para editar a quantidade de uma linha já existente.

## 5. Fluxo completo

1. **Autenticação/bootstrap**: ERP redireciona para o CheckoutWEB com `Tenant` e `Token` via URL/headers.
2. **Carga inicial**: frontend faz `GET` na API do ERP e recebe o payload de ~5MB. Fetch, parse e validação rodam em **Web Worker** (evita bloquear a thread principal); resultado gravado em Dexie, normalizado em tabelas (ex.: `config`), com checagem de versão/hash para evitar re-download se nada mudou.
3. **Busca/inserção de produto**: operador busca ou bipa um produto → TanStack Query faz `GET` no ERP por SKU → resposta cacheada em memória, chaveada por SKU, com `staleTime: Infinity` pela duração da venda (garante que toda reinserção do mesmo produto na mesma venda reusa exatamente os mesmos `precos`/`faixasQuantidade`, sem nova chamada de rede e sem risco de divergência entre linhas).
4. **Item entra no carrinho** (Zustand), com os dados do produto copiados para a linha e a quantidade informada.
5. **Reprecificação**: motor de precificação roda para o SKU afetado, atualizando o `precoAplicado` de todas as linhas daquele SKU conforme as regras da seção 4.
6. **Persistência**: a cada mudança relevante, o `persist` do Zustand grava a fatia "venda em andamento" em `localStorage`. Um F5 recarrega o carrinho a partir daí; o payload de configuração é recarregado do Dexie (sem novo download de 5MB, salvo mudança de versão).
7. **Formas/condições de pagamento**: buscadas via TanStack Query, cacheadas em memória com `staleTime` de 30 minutos.
8. **Finalização**: `POST` para a API do ERP com os itens e o total já calculados pelo frontend — cujos insumos (preços e faixas) vieram originalmente do próprio ERP (payload de bootstrap + resposta de produto). Junto de cada item, o payload inclui os insumos usados no cálculo (SKU, quantidade agregada, tier aplicado, preço de tabela usado) como trilha de auditoria — o ERP não bloqueia a finalização com base nisso, mas fica com o dado para eventual reconciliação. O ERP devolve a NFCe pronta para impressão. **Ao finalizar (ou ao cancelar a venda em andamento)**, o cache de produtos do TanStack Query referente àquela venda é descartado — a próxima venda sempre começa com cache vazio, nunca reaproveitando dados de produto de uma venda anterior. Essa fronteira (fim da venda) é o único gatilho de descarte, já que o cache não expira sozinho por tempo durante a venda (ver "Regra de consistência do cache de produto" na seção 3).
9. **Integrações externas**: comunicação com o TEF local e com o servidor de impressão local (ambos instalados na máquina do PDV, expondo API HTTP local) e com a API de PIX do ERP (online, exibição de QR Code). Ver requisitos de implantação na seção 8.

**Cancelamento da venda em andamento** (caminho alternativo à finalização): operação 100% local, sem chamada ao ERP — coerente com não existir rascunho de venda no lado do servidor, então não há nada lá para desfazer. Cancelar limpa por completo o carrinho (Zustand + `localStorage`) e o cache de produtos (TanStack Query) da venda, exatamente como acontece na finalização (passo 8). A próxima venda sempre começa do zero, nunca herdando itens ou dados de produto de uma venda cancelada.

## 6. Responsividade e fluxo mobile

O CheckoutWEB é responsivo: a mesma aplicação atende desktop e mobile, adotando disposições de exibição diferentes conforme o dispositivo — não há build ou rota separada, apenas layout condicional sobre o mesmo estado de venda.

- **Critério de troca de layout**: breakpoint de largura de viewport (`< 768px` aciona o layout mobile). Não depende de detecção de capacidade touch, apenas da largura da tela.
- **Desktop**: layout de tela única, com identificação de cliente, carrinho, forma de pagamento e finalização visíveis simultaneamente.
- **Mobile**: layout em wizard de 3 etapas sequenciais:
  1. **Identificação de cliente e adição de produtos.**
  2. **Conferência dos produtos e inserção de forma/condição de pagamento.**
  3. **Revisão final e finalização.**
- **Navegação entre etapas (mobile)**: livre entre etapas já visitadas — o operador pode voltar a qualquer etapa anterior já visitada a qualquer momento antes da finalização (ex.: da etapa 3, voltar à etapa 1 para trocar o cliente), para reduzir risco de erro não corrigível no meio do fluxo.
- **Atalhos de teclado (react-hotkeys-hook, seção 2)**: desativados no layout mobile. São uma otimização para o operador de PDV com teclado físico/leitor de código de barras fixo; no layout mobile, touch-first, essa navegação não se aplica e toda ação tem equivalente por toque.
- **Estado**: a divisão em etapas é puramente de apresentação — o estado da venda (Zustand, seção 3) é o mesmo em ambos os layouts. Não há duplicação de lógica de negócio entre desktop e mobile, apenas disposição visual diferente sobre os mesmos dados e ações.

## 7. Pontos em aberto

- **Detalhes de implementação do Docker** (seção 9): imagem-base específica, orquestração além de um `docker-compose` simples (ex.: necessidade de Kubernetes), pipeline de CI/CD de build/publish da imagem, e estratégia de registry ainda não foram definidos. O que já está confirmado: escopo cobre dev e produção (ciclo completo), e TEF/impressão local permanecem fora do container.

## 8. Requisitos de implantação — integrações locais (TEF e impressão)

O TEF e o servidor de impressão, ambos instalados na máquina do PDV, expõem suas APIs em **HTTP puro** na rede local. Como o CheckoutWEB é servido via HTTPS a partir do domínio do ERP (não a partir de `localhost`), a exceção de loopback do navegador não se aplica, e **duas proteções independentes do Chrome** entram em ação simultaneamente sobre essas chamadas:

1. **Local Network Access (LNA)** — bloqueia por padrão que uma página pública acesse endpoints de rede local/`localhost` sem permissão explícita. Passou a ser aplicada por padrão a partir do Chrome 142 (existia como flag opcional desde o Chrome 138, `chrome://flags/#local-network-access-check`). Hoje o time contorna isso desabilitando essa flag manualmente em máquinas de desenvolvimento/teste — **isso não é uma solução viável para produção**: a partir do enforcement por padrão, a flag deixa de ser a via de controle, e não é escalável pedir para cada operador de PDV alterar configuração do navegador.
2. **Mixed content (bloqueio de conteúdo ativo)** — página HTTPS chamando endpoint HTTP é bloqueado por padrão pelo Chrome, independentemente do LNA.

**Solução para produção**: ambas as proteções são resolvidas via política de Chrome Enterprise, aplicada pela TI de cada cliente nas máquinas de PDV (GPO no Windows ou Chrome Browser Cloud Management):
- `LocalNetworkAccessAllowedForUrls` — allowlist da origem do CheckoutWEB, liberando acesso a `localhost`/endpoints de rede local (TEF e impressão) sem prompt de permissão.
- `InsecureContentAllowedForUrls` — allowlist da mesma origem, liberando conteúdo misto ativo (chamadas HTTP a partir da página HTTPS).

**Divisão de responsabilidade**: como o CheckoutWEB atende N clientes, cada um com sua própria gestão de máquinas, a configuração dessas políticas é responsabilidade da TI de cada cliente — não algo que o frontend ou a Centrium possam impor a partir da aplicação. Isso vira um **item padrão do checklist de implantação/onboarding** de cada cliente. A responsabilidade do CheckoutWEB é: (a) fazer as chamadas assumindo que essas políticas foram configuradas corretamente a jusante; (b) detectar e exibir uma mensagem de erro clara e acionável quando o navegador bloquear a chamada (falha de rede/permissão), apontando para configuração de navegador em vez de um "erro de conexão" genérico — para que o suporte identifique rapidamente que é uma pendência de TI/GPO do cliente, não um bug da aplicação.

Fontes: [New permission prompt for Local Network Access | Chrome for Developers](https://developer.chrome.com/blog/local-network-access) · [LocalNetworkAccessAllowedForUrls | Chrome Enterprise](https://chromeenterprise.google/intl/en_ca/policies/local-network-access-allowed-for-urls/) · [InsecureContentAllowedForUrls | Chrome Enterprise](https://chromeenterprise.google/policies/insecure-content-allowed-for-urls/)

## 9. Containerização (Docker)

O CheckoutWEB é **100% Docker**, cobrindo todo o ciclo — desenvolvimento e produção:

- **Desenvolvimento**: container roda o servidor de dev do Vite com hot-reload, código-fonte montado via volume; não há necessidade de instalar Node/dependências diretamente na máquina do desenvolvedor.
- **Produção**: build multi-stage — um estágio compila os assets estáticos (`npm run build`), outro serve esses assets (ex.: Nginx) em uma imagem final enxuta, sem toolchain de build.
- **Fora do escopo do container**: TEF e servidor de impressão (seção 8) continuam rodando nativamente na máquina física do PDV, fora do Docker — são software/hardware do fornecedor local, instalados diretamente no equipamento, e o CheckoutWEB os acessa via HTTP local (sujeito às mesmas ressalvas de LNA/mixed content da seção 8, independentemente de o próprio CheckoutWEB estar containerizado).
- Detalhes ainda não decididos: ver seção 7 (Pontos em aberto).
