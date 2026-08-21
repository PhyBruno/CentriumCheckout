# External Integrations

## API do ERP Centrium

**Service:** API do ERP (`ApiCentriumOAuth.yaml`, em `Fluxograma - Diagrama - Alinhamentos/`)
**Purpose:** Fonte de verdade única de produto, cliente, pagamento e NFCe — o Checkout não tem banco de dados próprio.
**Implementation:** consumida pelo BFF do Checkout (AD-022 em `.specs/project/STATE.md`), que faz proxy autenticado das chamadas via `/api/erp/*` — o frontend nunca chama a API do ERP diretamente nem manipula `access_token`.
**Configuration:** host montado por `TENANT.<domínio-base>`, onde `tenant` vem do ERP na URL de abertura e o domínio base vem de variável de ambiente Docker (ver `.specs/codebase/CONCERNS.md`).
**Authentication:** OAuth2 `password` grant (`POST /oauth/access_token`) — chamado pelo BFF, nunca pelo navegador diretamente. Ver `.specs/features/autenticacao-sessao-bootstrap/spec.md`.

### Principais endpoints consumidos

| Endpoint | Uso |
|---|---|
| `POST /oauth/access_token` | Obtenção/renovação de `access_token` — chamado pelo BFF em `GET /session/start` e internamente em `/api/erp/*` na renovação silenciosa (AD-022) |
| `GET /ApiCentriumOAuth/GetSessao` | Bootstrap de configuração (~5MB) |
| `GET /ApiCentriumOAuth/GetCliente` | Identificação de cliente por CPF/CNPJ |
| `GET /ApiCentriumOAuth/GetListaClientes` | Busca de cliente por termo livre |
| `POST /ApiCentriumOAuth/PostCliente` | Cadastro simplificado de cliente |
| `GET /ApiCentriumOAuth/GetListaProdutos`, `GetProduto` | Busca/inserção de produto |
| `POST /ApiCentriumOAuth/FaturarNFCe` | Finalização (`FATURAR`) e suspensão (`SUSPENDER`) de venda |
| `POST /ApiCentriumOAuth/GerarPIX` | Geração de cobrança PIX (QR Code) |
| `GET /ApiCentriumOAuth/StatusPIX` | Consulta de status de pagamento PIX |
| `GET /ApiCentriumOAuth/ListaDAVs`, `GetDAV` | Importação de DAV |
| `GET /ApiCentriumOAuth/CarregarNFCe` | Recuperação de rascunho de venda |
| `GET /ApiCentriumOAuth/GetListaNFCes` | Listagem de rascunhos de NFCe |
| `GET /ApiCentriumOAuth/GetListaVendedores` | Listagem de vendedores por empresa (seleção do vendedor que atendeu o cliente final, ver `.specs/features/selecao-vendedor/spec.md`) |
| `GET /ApiCentriumOAuth/GetStatusSistema` | Health check por empresa/máquina (`Empresa`+`Cadmaqcod` → `integer`) |

Pendência real de contrato: nenhuma. Host por tenant confirmado como decisão correta (bloco `servers:` do contrato é só URL de ambiente de dev — `codigoEmpresa`→`Empresa`, `refresh_token` e host por tenant já resolvidos, ver AD-019/AD-023 em `.specs/project/STATE.md`). `GetListaClientes`, `StatusPIX` e `GetListaNFCes` (nome real do endpoint antes citado como `ListaNFCEs`) foram confirmados no `ApiCentriumOAuth.yaml` atualizado em 2026-08-21 — ver `.specs/codebase/CONCERNS.md`.

## Integrações locais (TEF e impressão)

**Service:** TEF e servidor de impressão, ambos instalados na máquina física do PDV, expondo API HTTP local.
**Purpose:** Autorização de pagamento TEF e impressão de NFCe/comprovantes.
**Implementation:** fora do container Docker do Checkout (ver `.specs/codebase/ARCHITECTURE.md`); acessados via HTTP puro na rede local.
**Configuration:** nenhuma do lado do Checkout — depende de política de Chrome Enterprise do cliente (abaixo).

### Restrição de navegador: Local Network Access + Mixed Content

Como o CheckoutWEB é servido via HTTPS a partir do domínio do ERP (não `localhost`), duas proteções do Chrome bloqueiam por padrão as chamadas HTTP locais ao TEF/impressão:

1. **Local Network Access (LNA)** — bloqueia acesso a endpoints de rede local sem permissão explícita (padrão a partir do Chrome 142).
2. **Mixed content** — página HTTPS chamando endpoint HTTP é bloqueada por padrão.

**Solução para produção:** políticas de Chrome Enterprise aplicadas pela TI de cada cliente (GPO no Windows ou Chrome Browser Cloud Management):
- `LocalNetworkAccessAllowedForUrls` — allowlist da origem do CheckoutWEB.
- `InsecureContentAllowedForUrls` — allowlist da mesma origem.

**Divisão de responsabilidade:** configuração das políticas é responsabilidade da TI de cada cliente, não do Checkout/Centrium — vira item padrão do checklist de implantação/onboarding. A responsabilidade do CheckoutWEB é (a) assumir que as políticas foram configuradas corretamente e (b) detectar e exibir mensagem de erro clara e acionável quando o navegador bloquear a chamada, apontando para configuração de navegador em vez de um "erro de conexão" genérico.

Fontes: [New permission prompt for Local Network Access | Chrome for Developers](https://developer.chrome.com/blog/local-network-access) · [LocalNetworkAccessAllowedForUrls | Chrome Enterprise](https://chromeenterprise.google/intl/en_ca/policies/local-network-access-allowed-for-urls/) · [InsecureContentAllowedForUrls | Chrome Enterprise](https://chromeenterprise.google/policies/insecure-content-allowed-for-urls/)
