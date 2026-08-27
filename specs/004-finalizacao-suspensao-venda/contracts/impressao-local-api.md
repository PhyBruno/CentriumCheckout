# Contract: serviço de impressão local (fora do proxy do BFF)

Diferente dos demais contratos desta feature, esta **não** é uma chamada a `/api/erp/*` — é uma chamada HTTP direta do navegador a uma máquina na rede local do PDV, replicando exatamente o mecanismo do `Impressao.js` já usado em produção pelo PDV atual do ERP (AD-083). Ver `research.md`, D4, para a decisão de manter essa chamada fora do proxy do BFF.

---

## `POST http://{CadMaqHost}`

### Origem de `CadMaqHost`

`SessaoUsuario.CadMaqHost` (já retornado por `GetSessao`, persistido no bootstrap pela feature 002) — string única `host:porta`. **Fallback**: quando `CadMaqHost` está vazio, usar `127.0.0.1:4545` (mesmo default hardcoded do PDV atual), avisando o operador que o default está em uso (mesmo padrão do `alert` do PDV atual).

### Requisição

| Aspecto | Valor |
|---|---|
| Método | `POST` |
| URL | `http://{CadMaqHost}` — raiz do host, **sem** path/rota adicional (não é um endpoint REST com rota própria) |
| Headers | `Content-Type: text/plain` |
| Corpo | `XMLImpressao` (recebido na resposta de `FaturarNFCe`, ver `contracts/faturamento-api.md`) — texto **cru**, não JSON, não envelope estruturado |

```jsonc
// Corpo da requisição — exemplo sintético, não dado de produção
"<NFe><infNFe>...</infNFe></NFe>"
```

### Resposta

**Não existe formato de resposta a validar.** O sistema SHALL NÃO ler nem depender do corpo/formato da resposta — sucesso é definido exclusivamente por a requisição não lançar erro de rede/conexão. Isso replica o comportamento real do `Impressao.js`: o serviço local não escuta a porta quando indisponível, e o cliente atual só trata isso via `catch` da própria chamada `fetch`.

### Tratamento de falha (ver `research.md`, D5)

| Causa | Detecção | Mensagem ao operador |
|---|---|---|
| Serviço indisponível (porta fechada/serviço não rodando) | Erro de rede/conexão recusada no `catch` do `fetch` | "Não foi possível imprimir diretamente" + oferece PDF como alternativa (`FR-009`) |
| Bloqueio do navegador (Local Network Access negado ou Mixed Content bloqueado) | `TypeError` específico do Chrome, antes de qualquer tentativa real de conexão — ver `.specs/codebase/INTEGRATIONS.md` | Mensagem apontando para configuração de navegador/política de TI (`LocalNetworkAccessAllowedForUrls`/`InsecureContentAllowedForUrls`), não "erro de conexão" genérico + oferece PDF como alternativa |

Em ambos os casos, o sistema SHALL NÃO falhar silenciosamente — o fallback (oferecer o PDF via `DialogoDocumentoFiscal`) é sempre acionado (`FR-009`).

### Pré-condição de infraestrutura (fora do controle do Checkout)

A viabilidade desta chamada depende de políticas de Chrome Enterprise (`LocalNetworkAccessAllowedForUrls`, `InsecureContentAllowedForUrls`) configuradas pela TI de cada cliente — responsabilidade de implantação, documentada em `.specs/codebase/INTEGRATIONS.md`, não desta feature. Esta feature só é responsável por detectar e comunicar claramente quando o bloqueio ocorre.
