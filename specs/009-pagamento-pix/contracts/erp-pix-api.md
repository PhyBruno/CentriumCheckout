# Contract: consumo da API do ERP para PIX

Como a feature 009 conversa com o ERP. Toda chamada passa pelo proxy autenticado `/api/erp/*` do BFF (feature 002), que injeta `Authorization`/`Empresa` no servidor — o JS **nunca** monta esses campos (`.specs/codebase/ARCHITECTURE.md`, AD-019/AD-022), inclusive quando `Empresa` aparece dentro do corpo de `GerarPIX` (não só em query string).

Fonte do contrato: `Fluxograma - Diagrama - Alinhamentos/APICentriumOAuth.yaml`. Toda resposta é validada com Zod na fronteira (Constitution IV).

---

## 1. Gerar cobrança — `POST /api/erp/GerarPIX`

**Request** (`GerarPIXInput.SDTCentriumPag_Post` — só o subconjunto relevante ao PIX, `research.md` D4/D4-bis; valores sintéticos):

```jsonc
{
  "SDTCentriumPag_Post": {
    "TrnGUID": "b3a1c2d4-0000-4000-8000-000000000001",   // gerado no cliente (D3)
    "TrnValor": 65.50,                                     // saldoRestante em double (D6)
    "TrnFormaPagamento": "Pix",                             // MeioPagtoNFe (D5)
    "FPgCod": 3,                                            // FormaPagamento.codigo do catálogo (008)
    "TrnPagadorNome": "Cliente Exemplo",                    // clienteAtual.nome (D7, AD-100)
    "TrnPagadorCgc": "00000000000",                         // clienteAtual.documento, '' se null
    "TrnPagadorEmail": "",                                  // sempre vazio nesta versão (D7)
    "TrnPagadorFone": ""                                    // sempre vazio nesta versão (D7)
    // Empresa: injetado pelo BFF a partir do codigoEmpresa persistido — o JS não envia
    // Demais campos do SDT genérico (boleto/duplicata, CntGUID, TrnOrigemDocumento/Serie,
    // TrnStatus, TrnTempoExpiracaoPIX) NÃO são enviados — research.md D4/D4-bis/AD-047
  }
}
```

**Response** (`GerarPIXOutput`, yaml linhas 733-740):

```jsonc
{
  "TrnGUID": "b3a1c2d4-0000-4000-8000-000000000001",
  "Trnbase64text": "MDAyMDAxMjYzMzAwMTQuLi4=",   // "copia e cola", decodificar com atob (D10)
  "Trnbase64image": "/9j/4AAQSkZJRgABAQAA..."      // QR Code, <img src="data:image/jpeg;base64,...">
}
```

**Conversão de fronteira Zod**: nenhum `double` de dinheiro chega nesta resposta (só `TrnValor` sai, no request) — `Trnbase64text`/`Trnbase64image` são `string`, sem conversão numérica.

**Falha desta chamada** (rede/validação, distinta de falha de polling): toast simples + "Tentar novamente", novo `TrnGUID` a cada tentativa (`research.md`, D12).

---

## 2. Consultar status — `GET /api/erp/StatusPIX`

**Request** (params `Empresa` — injetado pelo BFF — e `Trnguid`):

```text
GET /api/erp/StatusPIX?Trnguid=b3a1c2d4-0000-4000-8000-000000000001
```

**Response** (`StatusPIXOutput`, yaml linhas 742-747):

```jsonc
{ "StatusTransacao": "G", "messages": [] }
```

**Interpretação** (`interpretarStatusPix`, `data-model.md` §2, `research.md` D8, **AD-102**): os dez literais reais de `StatusTransacao`, confirmados diretamente pelo usuário — fecha o item 33 de `.specs/project/PENDENCIES.md`.

| Literal | Significado | Situação |
|---|---|---|
| `'C'` | Criada | `PENDENTE` |
| `'A'` | Aberta | `PENDENTE` |
| `'G'` | Aguardando Pagamento | `PENDENTE` |
| `'P'` | Pagamento Recebido | `APROVADO` |
| `'M'` | Pagamento Liberado Manualmente | `APROVADO` |
| `'X'` | Expirada | `FALHA_TERMINAL` |
| `'R'` | Recusada | `FALHA_TERMINAL` |
| `'E'` | Erro | `FALHA_TERMINAL` |
| `'F'` | Fechada | `FALHA_TERMINAL` |
| `'O'` | Removido Associação PIX | `FALHA_TERMINAL` |

```ts
// src/client/domain/pix/interpretarStatusPix.ts
switch (resposta.StatusTransacao) {
  case 'P': case 'M': return { situacao: 'APROVADO' };
  case 'C': case 'A': case 'G': return { situacao: 'PENDENTE' };
  case 'X': return { situacao: 'FALHA_TERMINAL', motivo: 'EXPIRADA' };
  case 'R': return { situacao: 'FALHA_TERMINAL', motivo: 'RECUSADA' };
  case 'E': return { situacao: 'FALHA_TERMINAL', motivo: 'ERRO' };
  case 'F': return { situacao: 'FALHA_TERMINAL', motivo: 'FECHADA' };
  case 'O': return { situacao: 'FALHA_TERMINAL', motivo: 'ASSOCIACAO_REMOVIDA' };
  default: return { situacao: 'FALHA_TERMINAL', motivo: 'DESCONHECIDO' };
}
```

`'P'` (Pagamento Recebido) e `'M'` (Pagamento Liberado Manualmente) são tratados de forma **idêntica** — ambos indicam que o PIX foi recebido e o Checkout pode dar continuidade (confirmado pelo usuário). O ramo `default` é mantido mesmo com a união agora fechada — guarda defensiva permanente (Constitution IV): um literal novo introduzido pelo ERP no futuro nunca é lido como aprovado por omissão.

**Política de polling**: `refetchInterval: 10_000` enquanto o modal está aberto e o pagamento está `PENDENTE_INTEGRACAO` (`research.md`, D9). Parar de fato o polling é responsabilidade do call site, não do `refetchInterval` sozinho.

---

## 3. O que esta feature **não** chama

| Endpoint | Quem chama | Por quê não aqui |
|---|---|---|
| `GET /api/bootstrap` (`ConfiguracoesPIX`, catálogo de formas) | feature 002/008 | esta feature só **lê** `ConfiguracoesPIX.MinimoPix` do cache já existente (`research.md`, D13), não busca de novo |
| Qualquer endpoint de cancelamento de PIX | — | não existe no contrato; `research.md` D11 confirma que nenhuma chamada de cancelamento é feita, em nenhum cenário |
| `POST /FaturarNFCe` | feature 004 | esta feature só entrega `pixGuid` opaco via `PagamentoAplicado`, não monta nem envia o payload de faturamento |
