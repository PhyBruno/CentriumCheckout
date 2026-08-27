# Pagamento — PIX — Specification

## Problem Statement

O operador precisa gerar um pagamento PIX e saber quando ele foi aprovado, sem depender de eventos push do ERP. Comportamento comum a todas as formas de pagamento (carregamento de formas/condições, ticket devolução) está em `.specs/features/pagamento-geral/spec.md`; TEF está em `.specs/features/pagamento-tef/spec.md`.

## UI Design

Modal PIX: frame `PDV Online Web - Modal PIX` (QR Code, copia e cola, badge de status). Tela principal e área "Pagamento e totais": ver `.specs/features/pagamento-geral/spec.md`. **Fonte do QR Code resolvida por completo (2026-08-26, AD-079 e AD-087):** ver Edge Cases — `GerarPIXOutput` já expõe `Trnbase64image` no contrato atualizado (`ApiCentriumOAuth.yaml`, `info.version: 20260826163735`), ao lado do `Trnbase64text` ("copia e cola") que já existia.

## Goals

- [ ] Status de PIX confirmado de forma confiável via consulta ativa, sem SSE.

## Out of Scope

| Feature | Reason |
|---|---|
| Server-Sent Events (SSE) para status de PIX | Confirmado (2026-08-20, AD-012 em `.specs/project/STATE.md`): não será usado — apesar de diagrama de referência do ERP mencionar SSE, o Checkout opta por consulta ativa (polling), mais simples de operar sem exigir que o BFF mínimo (AD-022) — hoje só responsável por sessão/proxy — passe a manter conexões persistentes |

---

## User Stories

### P1: Consulta ativa de status de PIX ⭐ MVP

**User Story**: Como operador de caixa, quero saber quando o pagamento PIX foi aprovado, sem depender de notificação push do servidor.

**Why P1**: Sem confirmação, a venda não pode ser finalizada com segurança.

**Acceptance Criteria**:

1. WHEN um pagamento PIX é gerado (QR Code exibido) THEN o sistema SHALL consultar ativamente `GET /ApiCentriumOAuth/StatusPIX` (params `Empresa`, `Trnguid`, retorna `StatusTransacao`) a cada 10 segundos — nunca via SSE. **Resolvido (2026-08-21, AD-023):** endpoint confirmado no `ApiCentriumOAuth.yaml` atualizado. **Intervalo de polling resolvido (2026-08-24, AD-026):** decisão direta do usuário — a cada 10s, sem estratégia de backoff documentada.

**Independent Test**: Mockar `StatusPIX` alternando entre pendente e aprovado; confirmar que o polling detecta a mudança.

---

### P1: Ocultar PIX quando não configurado ⭐ MVP

**User Story**: Como operador de caixa, não quero ver a opção de PIX quando o tenant não a utiliza.

**Why P1**: Evita oferecer uma forma de pagamento indisponível.

**Acceptance Criteria**:

1. WHEN `ConfiguracoesPIX.UtilizaCentriumPAG` é `false` THEN o sistema SHALL ocultar/desabilitar o recurso de PIX.

**Independent Test**: Mockar `GetSessao` com `UtilizaCentriumPAG=false` e confirmar que PIX não aparece na tela de pagamento. Faz parte do mesmo teste combinado descrito em `.specs/features/pagamento-geral/spec.md` (Story P1, `PAY-01`).

---

### P1: Fechamento do modal com PIX pendente ⭐ MVP

**User Story**: Como operador de caixa, quero poder fechar o modal PIX mesmo com uma transação ainda pendente e trocar por outra forma de pagamento, sem travar a venda.

**Why P1**: Cliente pode desistir do PIX ou demorar demais — o operador precisa seguir com outra forma sem depender de expiração automática.

**Acceptance Criteria**:

1. WHEN o operador fecha o modal PIX com uma transação ainda pendente THEN o sistema SHALL exibir um aviso informando que será necessário desassociar o PIX manualmente na Central de Transações PIX. **Resolvido (2026-08-25, AD-040):** decisão direta do usuário.
2. WHEN o modal é fechado nesse estado THEN o sistema SHALL remover a forma de pagamento PIX da venda local e permitir que o operador aplique outra forma no lugar.
3. WHEN o PIX é abandonado dessa forma THEN o sistema SHALL NÃO enviar nenhuma solicitação de cancelamento de PIX ao ERP/CentriumPag — a desassociação é sempre manual, feita pelo operador fora do Checkout. O PIX não expira em um tempo curto (sem teto de polling de 10-15min).

**Independent Test**: Gerar um PIX, fechar o modal antes da aprovação, confirmar o aviso de desassociação manual e verificar que nenhuma chamada de cancelamento é feita; aplicar outra forma de pagamento no lugar.

---

## Edge Cases

- WHEN o intervalo de polling de `StatusPIX` precisa ser definido THEN o sistema SHALL consultar a cada 10 segundos. **Resolvido (2026-08-24, AD-026):** decisão direta do usuário — intervalo fixo de 10s.
- WHEN `GerarPIX` é chamado THEN o sistema SHALL enviar `Empresa` (`codigoEmpresa` persistido, ver AD-019 em `.specs/project/STATE.md`), exigido pelo contrato — regra geral detalhada em `.specs/features/pagamento-geral/spec.md`.
- WHEN `GerarPIX` é chamado THEN o sistema SHALL exibir o QR Code retornado, decodificando e exibindo o campo `Trnbase64image` (já presente em `GerarPIXOutput` desde a atualização do contrato em 2026-08-26, AD-087) via `<img src="data:image/jpeg;base64,...">`, sem repetir o padrão legado de gravar em arquivo temporário (específico de Web Panel GX Web, não aplicável a uma SPA). **Histórico (2026-08-26, AD-079/AD-081/AD-087):** verificado no código-fonte real do ERP (`PCheckout_GerarPIX`) que o contrato antigo só devolvia `TrnGUID` e `Trnbase64text` — este último é o base64 do **texto** "copia e cola" (`ToBase64(&TrnPixCopiaECola)`), não uma imagem. A imagem do QR Code já era gerada pelo próprio ERP nesse mesmo fluxo (`PTransacao_CentriumPag_Post` chama `PGetBarCodeImage.Udp(BarCodeQRCode, copiaECola)`) e ficava persistida na tabela `Transacao` — usada pela tela legada do ERP (`WPTransacao_LapseStatus`, sub `CarregarQRCode`), mas nunca exposta ao Checkout até a equipe do ERP confirmar (AD-081) e efetivar (AD-087) a inclusão de `Trnbase64image` no `parm()` de saída de `PCheckout_GerarPIX`, corrigindo a assunção "eu acho" de AD-047.
- WHEN `GerarPIX` é chamado THEN o sistema SHALL NÃO enviar o campo `TrnTempoExpiracaoPIX` (presente no SDT de entrada `SDTCentriumPag_Post`, Fato F3 de `.specs/project/DECISIONS.md`). **Resolvido (2026-08-25, AD-047):** decisão direta do usuário — campo não enviado pelo Checkout.
- WHEN o operador tenta gerar um PIX abaixo do valor mínimo configurado THEN o sistema SHALL validar `ConfiguracoesPIX.MinimoPix` no lado do cliente (client-side) e bloquear a geração. **Resolvido (2026-08-25, AD-047):** decisão direta do usuário.
- WHEN `GerarPIX` é chamado em uma venda com split de pagamento (outras formas já aplicadas) THEN o sistema SHALL usar o saldo residual da venda (valor ainda não coberto), não o total cheio. **Resolvido (2026-08-25, AD-047):** decisão direta do usuário.
- WHEN o Checkout precisa decidir se exibe alguma UI além do QR Code (encurtador de link, link externo) THEN o sistema SHALL assumir que o endpoint sempre retorna o QR Code em base64, sem necessidade de UI adicional para `ConfiguracoesPIX.UtilizaEncurtador`/`UtilizaLinkExterno`. **Confirmado (2026-08-26, AD-079 e AD-087):** a suposição de baixa confiança de AD-047 ("eu acho") foi verificada no código-fonte real do ERP e o contrato já expõe `Trnbase64image` — o Checkout sempre recebe o QR Code pronto em base64, sem exigir UI adicional para os dois flags.
- WHEN a própria chamada `POST /ApiCentriumOAuth/GerarPIX` falha (erro de rede/validação, distinto de falha no polling de `StatusPIX` depois de gerado) THEN o sistema SHALL exibir um erro simples e oferecer a opção de tentar novamente. **Resolvido (2026-08-25, AD-040):** decisão direta do usuário.
- WHEN `GerarPIX` é chamado THEN os campos `TrnPagadorNome`/`TrnPagadorCgc` do `SDTCentriumPag_Post` SHALL ser preenchidos com o cliente **atual** da venda (identificado explicitamente pelo operador, ou o cliente default quando não há seleção explícita — nunca vazio "sem cliente"); `TrnPagadorEmail`/`TrnPagadorFone` SHALL ser sempre enviados vazios nesta versão, porque o snapshot de cliente da venda (`identificacao-cadastro-cliente/spec.md`) não retém e-mail/celular. **Resolvido (2026-08-27, AD-100):** decisão direta do usuário, na fase Design da feature 009. Detalhe em `specs/009-pagamento-pix/research.md` (D7).
- WHEN `StatusPIX` retorna `StatusTransacao` THEN o sistema SHALL interpretar o literal recebido conforme a tabela de dez valores confirmada pelo usuário: `'C'` (Criada), `'A'` (Aberta) e `'G'` (Aguardando Pagamento) mantêm o polling; `'P'` (Pagamento Recebido) e `'M'` (Pagamento Liberado Manualmente) são **ambos** tratados como aprovado, dando continuidade ao checkout; `'X'` (Expirada), `'R'` (Recusada), `'E'` (Erro), `'F'` (Fechada) e `'O'` (Removido Associação PIX) são tratados como falha terminal, reaproveitando o **mesmo** fluxo já decidido para o fechamento manual acima (aviso de desassociação manual, remoção do pagamento local, nenhuma chamada de cancelamento) — não é um segundo mecanismo de estado, é o mesmo caminho acionado por um gatilho diferente. **Resolvido (2026-08-27, AD-102):** literais confirmados diretamente pelo usuário na fase Design da feature 009, fechando o item 33 de `.specs/project/PENDENCIES.md` (a leitura inicial via KB GeneXus tinha alta confiança só nos nomes de cinco estados, não nos literais exatos). Detalhe em `specs/009-pagamento-pix/research.md` (D8).

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
|---|---|---|---|
| PAY-03 | Ocultar PIX quando `UtilizaCentriumPAG=false` | - | Verified |
| PAY-04 | Consulta ativa de status de PIX (sem SSE) | - | Verified (2026-08-21, AD-023 — endpoint `StatusPIX` confirmado no contrato atualizado) |
| PAY-11 | Fechamento de modal com PIX pendente (aviso de desassociação manual, sem cancelamento) | - | Verified (2026-08-25, AD-040) |

**Coverage:** 3 total, todos os edge cases resolvidos — QR Code do PIX via `Trnbase64image`, exposto em `GerarPIXOutput` desde 2026-08-26 (AD-087, corrige a assunção de baixa confiança de AD-047 e fecha o item 24 de `.specs/project/PENDENCIES.md`); intervalo de polling de `StatusPIX` — AD-026; `TrnTempoExpiracaoPIX`, `MinimoPix`, saldo residual — AD-047; falha em `GerarPIX` — AD-040.

---

## Success Criteria

- [ ] Nenhuma venda finalizada sem confirmação ativa de PIX quando aplicável.
