# Architecture

**Pattern:** SPA (single-page application) com um BFF (Backend for Frontend) mínimo de sessão/autenticação — sem lógica de negócio nem banco de dados próprio (ver AD-022 em `.specs/project/STATE.md`). O ERP continua sendo a única fonte de verdade de negócio. Estado dividido entre estado de servidor (cache do ERP via TanStack Query), estado de sessão/venda (Zustand) e persistência local só para configuração (Dexie).

> Nota: como ainda não existe código-fonte, este documento registra a arquitetura **decidida**, não extraída de código real (diferente do uso padrão de brownfield mapping). Deve ser revalidado contra o código assim que o scaffolding inicial existir.

## High-Level Structure

```
ERP (autentica operador, abre URL do Checkout com credenciais + validationKey)
        │
        ▼
BFF (Node — sessão/autenticação; cookie HttpOnly cifrado; proxy de API; AD-022)
        │  serve os assets estáticos da SPA + troca credenciais por access_token
        ▼
CheckoutWEB (SPA React)
        │  consome via /api/erp/* (mesma origem, proxy do BFF)
        ▼
API do ERP (ApiCentriumOAuth.yaml) ── produtos, clientes, pagamento, NFCe
        │
        ├── TEF local (HTTP, máquina do PDV)
        └── Servidor de impressão local (HTTP, máquina do PDV)
```

Não há banco de dados nem lógica de negócio própria do Checkout — toda fonte de verdade de negócio (produto, cliente, pagamento, NFCe) vive no ERP. O BFF (AD-022) existe só para sessão/autenticação, sem armazenar estado próprio: a sessão inteira vive cifrada dentro do cookie, não em disco/Redis/banco de dados.

## Divisão de responsabilidades e persistência

| Camada | Tecnologia | Responsabilidade | Persiste? |
|---|---|---|---|
| Configuração do tenant/PDV | Dexie (IndexedDB) | Flags de comportamento gerais vindas do payload de bootstrap (~5MB) (ex.: `SessaoUsuario.TipoPreco` — domain `EmpDefPre`, `1`-`11`, indica qual regra de preço vale; `8` = por faixa de quantidade, `9` = por lista — ver AD-025/AD-059 em `.specs/project/STATE.md` —, regras de arredondamento, formas de pagamento habilitadas) | Sim — sobrevive a F5, atualizado por versão/hash para evitar re-transferência desnecessária |
| Produto | TanStack Query | Busca por SKU/código de barras no ERP, no ato da inserção, **sempre via `GetProduto`** — `GetListaProdutos` (modal de busca) só capta e seleciona produtos, não resolve a linha (AD-091). Retorna `PrecoVenda` (valor já resolvido pelo ERP, aplicável a todo `TipoPreco` exceto `8`) e, só para o caso `TipoPreco = 8`, `PrecoVenda1..PrecoVenda5` e as faixas de quantidade do produto (AD-059) | Não — cache em memória com `staleTime: Infinity` durante a venda; descartado ao finalizar/cancelar |
| Formas/condições de pagamento | TanStack Query | Cache em memória, `staleTime` de 30 minutos | Não |
| Venda em andamento (carrinho) | Zustand (sem `persist`) | Itens, cliente selecionado, vendedor selecionado (ver `.specs/features/selecao-vendedor/spec.md`), descontos | Não — vive só em memória durante a sessão; não sobrevive a F5 (ver AD-006 em `.specs/project/STATE.md`) |
| Auditoria de ações do operador | Zustand (sem `persist`, slice dedicado) | Array de eventos tipados com timestamp (cliente, vendedor, produto, pagamento, falhas, finalização/suspensão) — ver `.specs/features/auditoria-acoes-operador/spec.md` (AD-061) | Não — mesmo ciclo de vida do carrinho; serializado e enviado no campo `Log` de `FaturarNFCe` ao finalizar/suspender, depois descartado |
| Motor de precificação | Função pura (camada de domínio, sem dependência de React/Zustand/Query) | Calcula o preço aplicado por linha (ver `.specs/features/carrinho-produto-precificacao/spec.md`) | N/A (stateless) |
| Estado de UI efêmero | Zustand sem `persist`, ou estado local de componente | Modais, loading, resultados de busca | Não |

**Regra de fronteira:** o carrinho nunca referencia dados do Dexie/TanStack Query ao vivo. Ao inserir um item, os campos necessários do produto (preços, faixas) são copiados para dentro do estado do carrinho no momento da inserção — a lógica de reprecificação sempre opera sobre os dados já capturados na linha, nunca dependendo do cache de produto continuar presente.

**Regra de consistência do cache de produto:** dentro de uma venda aberta, o cache de produto não se atualiza sozinho por tempo decorrido (`staleTime` efetivamente infinito) — evita que o mesmo SKU rebuscado no meio da venda gere linhas com preços de tabelas divergentes. A única fronteira de frescor é o fim da venda (finalização ou suspensão), quando o cache é descartado por completo.

## Autenticação e segurança

Um BFF mínimo (Node, sem banco de dados, sem lógica de negócio — AD-022 em `.specs/project/STATE.md`) intermedia toda a sessão:

- `GET /session/start` recebe o redirect do ERP (query params `tenant`, `client_id`, `client_secret`, `username`, `password`, `Repository`, `codigoEmpresa` e `validationKey`), valida `validationKey` (credencial fixa por ambiente, igual para todos os tenants — só confirma a origem da chamada, não é uma credencial de operador), troca as credenciais por `access_token` (`POST /oauth/access_token`) e cifra `access_token` + credenciais originais num cookie `HttpOnly`/`Secure`/`SameSite=Lax`, usando uma chave de servidor própria (não em `localStorage`/`sessionStorage`, e nunca em texto plano acessível fora do processo do BFF).
- `GET /api/bootstrap` decifra o cookie no servidor e devolve ao JS só os campos não sensíveis (`codigoEmpresa`, `tenant`) combinados com o payload do `GetSessao` — o frontend nunca lê `client_secret`, `password` ou `access_token`.
- `/api/erp/*` faz proxy autenticado de toda chamada de negócio subsequente, injetando `Authorization`/`Empresa` no servidor e renovando o token sozinho em caso de expiração (401) — renovação de sessão é lógica 100% de servidor, invisível ao JS.

Fluxo completo em `.specs/features/autenticacao-sessao-bootstrap/spec.md`.

## A segunda aba e o canal do display

Desde 2026-09-10 (feature 015, AD-210 a AD-213) a aplicação tem **duas** superfícies servidas pelo mesmo bundle: a tela do operador e a tela do cliente, em `/display`, arrastada para o monitor voltado a quem paga.

**Uma rota, sem roteador.** `main.tsx` ramifica por `window.location.pathname`: `/display` monta `<DisplayCliente/>` **fora** de `App`, do `AppShell` e dos providers — sem `QueryClientProvider` e sem `GooeyToaster`. Não é organização de código. O `AppShell` chama `abrirSessaoDeVenda('NOVA')` na montagem, registra o `beforeunload` de `useAvisoAoSair` e liga o polling de `GetStatusSistema`; uma aba de display dentro dele abriria uma segunda sessão de auditoria e um segundo polling para uma tela que não vende nada. Nenhuma mudança foi necessária no servidor nem no Vite: `/display` cai no `setNotFoundHandler` do Fastify, que já devolve `index.html` para todo GET fora de `/api/`, e no fallback de SPA do Vite em desenvolvimento — então a rota sobrevive a um F5 direto na URL nas duas pontas.

**O canal é `BroadcastChannel`, e é o primeiro do projeto.** O protocolo mora em `src/shared/display.ts` (mesmo motivo de `gerencial.ts`: vocabulário comum às duas pontas, e um rename quebra a compilação em vez de virar erro de runtime). Os papéis são fixos e assimétricos: a aba de checkout **publica**; a de display **escuta**. A única mensagem que o display emite é `SOLICITAR_ESTADO`, que não carrega dado nenhum. O display não gera cobrança, não consulta o ERP e não oferece nenhuma ação capaz de alterar a venda — ele desenha o estado que recebe, e nada mais. Toda mensagem passa por Zod na chegada, porque depois de um deploy uma aba aberta há horas continua rodando o bundle antigo.

**O que mantém a tela honesta são três mecanismos, não um.** `pagehide` cobre o fechamento normal da aba do checkout e devolve o display ao repouso na hora. O **pulso** de 5 s reconfirma a cobrança enquanto ela vive. O **corte por silêncio** de 15 s no display cobre o que o `pagehide` não alcança — a aba que trava, é morta pelo gerenciador de tarefas ou perde o processo de renderização, casos em que nenhum código nosso roda. O risco que os três existem para evitar é concreto e específico: um QR obsoleto preso na tela e o **próximo** cliente da fila pagando a cobrança do anterior.

Contrato completo em `specs/015-display-cliente-pix/contracts/canal-display.md`; decisões em `.specs/project/STATE.md` (AD-210 a AD-213).

## Responsividade

Uma única aplicação atende desktop e mobile via layout condicional sobre o mesmo estado de venda (Zustand) — sem build ou rota separada. Detalhes em `.specs/features/layout-responsivo-mobile/spec.md`.

No design (`design/CentriumCheckout.pen`), a tela principal desktop já está modelada como um único componente reutilizável (`Fundo PDV Online Web`) dividido em duas áreas — "Venda e produtos" e "Pagamento e totais" — confirmando visualmente a divisão de responsabilidades documentada acima.

**Modal menu gerencial:** não é uma tela própria do Checkout — é um menu de navegação com duas opções, cada uma apontando para uma tela distinta do sistema legado do ERP. **Implementado em 2026-09-10 (AD-203).** Existe só no desktop — confirmado pelo usuário (2026-08-21) que não há equivalente mobile (ver `.specs/features/layout-responsivo-mobile/spec.md`, Out of Scope). Frame `PDV Online Web - Modal menu gerencial` (id `viV0S`) em `design/CentriumCheckout.pen`. O atalho que o abre é o **segundo** dos três da faixa "Atalhos da venda" (`kLUB1`); a engrenagem da barra superior segue inerte, por decisão do usuário.

**O redirect é montado no BFF, não na SPA.** `GET /gerencial/:destino` (`src/server/routes/gerencial.ts`) decifra o cookie de sessão, monta `<protocolo>://<tenant>.<baseDomain>` por `montarBaseUrlErp` (o mesmo padrão de host de AD-002/AD-003/AD-019) e responde `302`. O navegador só informa um rótulo de um conjunto fechado (`src/shared/gerencial.ts`): `baseDomain` é variável de ambiente do servidor e nunca chega ao JS, e o `tenant` vem do cookie cifrado — não sobra superfície de redirect aberto. Sem sessão, `401`; rótulo desconhecido, `404`.

| Opção no design | Descrição no design | Destino |
|---|---|---|
| "Central de movimentação não fiscal" | "Sangria, suprimento e outras movimentações de caixa" | `<tenant>.<baseDomain>` + `/wwtecfmovnaofisc.aspx` (rótulo `movimento-nao-fiscal`) |
| "Relatório de resumo de caixa" | "Totais, formas de pagamento e fechamento do caixa" | `<tenant>.<baseDomain>` + `/WWPResumoCaixa.aspx` (rótulo `resumo-caixa`) |

Os dois caminhos acima foram confirmados pelo usuário em 2026-09-10 e **substituem** os registrados em AD-020 e AD-026, que davam `WPMovimentoNaoFiscal_Lancamento.aspx` para as duas opções — as telas são distintas, cada uma com o seu `.aspx`.

Cada opção é só navegação para fora do Checkout — nenhuma das duas é funcionalidade dentro da SPA (sem chamada de API própria, sem estado no Zustand). A abertura é sempre em **nova aba** (`window.open(..., '_blank', 'noopener')`): a venda em andamento não sobrevive a uma navegação, porque o `vendaStore` é Zustand sem `persist`. Pelo mesmo motivo o atalho **nunca fica bloqueado**, ao contrário do "Menu Importação" (AD-138) — abrir uma tela de retaguarda em outra aba não toca no carrinho. Ver `.specs/codebase/CONCERNS.md`, "Telas desenhadas sem spec de requisito", para o histórico da pendência.

## Containerização (Docker)

100% Docker, cobrindo todo o ciclo:

- **Desenvolvimento:** container roda o servidor de dev do Vite com hot-reload, código-fonte montado via volume, mais o processo Node do BFF (AD-022) respondendo `/session/start`, `/api/bootstrap` e `/api/erp/*`.
- **Produção:** build multi-stage — um estágio compila os assets estáticos da SPA, outro roda o processo Node do BFF (AD-022), que serve esses assets **e** responde as rotas de sessão/proxy — não é mais um Nginx puro servindo estático, é um processo Node ativo.
- **Fora do escopo do container:** TEF e servidor de impressão continuam nativos na máquina física do PDV (ver `.specs/codebase/INTEGRATIONS.md`).
- **Domínio base da API do ERP:** vem de variável de ambiente Docker chamada `baseDomain`, configurada por ambiente de implantação (dev/staging/produção) (ver AD-019 em `.specs/project/STATE.md`).
- **Credencial fixa de validação do redirect do ERP:** variável de ambiente Docker `validationKey`, igual para todos os tenants de um mesmo ambiente (AD-022).
- **Chave de cifra do cookie de sessão:** variável de ambiente Docker `SESSION_SECRET` (AD-022).
- **Imagem-base:** `node:<version>-slim`, para dev e produção.
- **CI/CD (produção):** a cada merge na `master`, workflow do GitHub Actions builda a imagem e publica no Docker Hub.
- **CI/CD (dev):** script PowerShell local que executa todo o processo de build e sobe a imagem, sem depender de Actions.

## Code Organization

**Atualizado em 2026-09-01:** o scaffolding inicial passou a existir — foi criado pela feature `002-autenticacao-sessao-bootstrap` (Fase 1 de `specs/002-autenticacao-sessao-bootstrap/tasks.md`), a primeira a precisar dele. A árvore real é:

```text
src/
├── client/                  # SPA React (build via Vite → dist/client)
│   ├── features/<feature>/  # componentes por feature
│   ├── stores/              # Zustand (sem persist)
│   ├── db/                  # Dexie: só o bootstrap do tenant
│   ├── services/            # chamadas à API, Web Workers
│   └── styles/global.css    # design tokens do Pencil
├── server/                  # BFF Fastify (sessão/proxy, sem lógica de negócio)
│   ├── routes/ | session/ | config/
└── shared/                  # schemas Zod e utilidades usadas pelos dois lados
tests/unit/ | tests/integration/ | tests/e2e/
```

Um único processo Node serve a API de sessão/proxy **e** os assets estáticos da SPA — não há Nginx separado (ver "Containerização" acima e AD-022).

`CONVENTIONS.md`/`STRUCTURE.md`/`TESTING.md` continuam pendentes: agora já há código real para basear o brownfield mapping — ver `.specs/project/ROADMAP.md`.
