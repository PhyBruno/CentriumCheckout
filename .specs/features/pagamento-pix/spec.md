# Pagamento — PIX — Specification

## Problem Statement

O operador precisa gerar um pagamento PIX e saber quando ele foi aprovado, sem depender de eventos push do ERP. Comportamento comum a todas as formas de pagamento (carregamento de formas/condições, ticket devolução) está em `.specs/features/pagamento-geral/spec.md`; TEF está em `.specs/features/pagamento-tef/spec.md`.

**Nota de plataforma (2026-09-03, AD-144):** o PIX sempre esteve disponível no mobile e continua — nada muda nesta feature. O que muda em volta dela é que o PIX **deixou de ser a única integração disponível no mobile**: AD-074 excluía o TEF ali, e AD-144 revogou essa exclusão. Nenhum texto desta spec pode ser lido como "PIX é a integração do mobile, TEF é a do desktop" — as duas valem nos dois layouts, decididas só por `ConfiguracoesPIX`/`ConfiguracoesTEF`.

## UI Design

Modal PIX: frame `PDV Online Web - Modal PIX` (QR Code, copia e cola, badge de status). Tela principal e área "Pagamento e totais": ver `.specs/features/pagamento-geral/spec.md`. **Fonte do QR Code resolvida por completo (2026-08-26, AD-079 e AD-087):** ver Edge Cases — `GerarPIXOutput` já expõe `Trnbase64image` no contrato atualizado (`ApiCentriumOAuth.yaml`, `info.version: 20260826163735`), ao lado do `Trnbase64text` ("copia e cola") que já existia.

## Goals

- [ ] Status de PIX confirmado de forma confiável via consulta ativa, sem SSE.

**Atualização (2026-08-31, AD-104):** a **feature 013 — Venda Rápida por Cenário de Pagamento (`specs/013-venda-rapida-cenario-pagamento/`)** pode acionar este fluxo por atalho de teclado. Se um cenário de pagamento cadastrado no ERP apontar para uma forma de PIX dinâmico, a tecla (F6–F9) apenas substitui o gesto de selecionar a forma — **todo o fluxo de PIX especificado aqui vale integralmente**, sem atalho, sem etapa suprimida e sem confirmação antecipada. Duas consequências: o pagamento só é dado por lançado após a confirmação do PIX; e, quando o cenário estiver marcado para encerrar a operação, a finalização automática da venda ocorre **depois** dessa confirmação, nunca no instante em que a tecla foi pressionada. Esta spec não muda em nada por causa da 013 — a nota existe para que o caminho "PIX iniciado por atalho" não seja lido como um fluxo alternativo não especificado.

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

### P1: Desistir de um PIX pendente, sem travar a venda ⭐ MVP

**User Story**: Como operador de caixa, quero poder desistir de uma cobrança PIX ainda pendente e trocar por outra forma de pagamento, sem travar a venda — mas sem correr o risco de descartá-la por um gesto acidental.

**Why P1**: Cliente pode desistir do PIX ou demorar demais — o operador precisa seguir com outra forma sem depender de expiração automática. Ao mesmo tempo, uma cobrança abandonada por engano continua viva no banco e ninguém no Checkout consegue desfazê-la.

**Acceptance Criteria**:

1. WHEN existe uma cobrança PIX pendente na tela THEN o sistema SHALL manter a janela **travada** contra fechamento acidental: ESC não faz nada e o botão de fechar do cabeçalho fica bloqueado (com o motivo legível ao ser clicado, nunca `disabled` mudo). **Definido (2026-09-04, AD-161):** decisão direta do usuário.
2. WHEN o operador aciona **"Desistir da operação"** no rodapé THEN o sistema SHALL pedir confirmação explícita antes de abandonar a cobrança. O rótulo é "Desistir", e não "Cancelar": o Checkout não cancela cobrança PIX, e um botão que prometesse isso seria falso. **Definido (2026-09-04, AD-161).**
3. WHEN a desistência é confirmada THEN o sistema SHALL exibir um aviso informando que o cancelamento ou o estorno precisa ser feito **diretamente no banco**, e a desassociação do documento na Central de Transações PIX do ERP. **Resolvido (2026-08-25, AD-040); redação corrigida (2026-09-04, AD-161)** — a versão anterior citava só a Central do ERP, que desfaz a associação mas não devolve dinheiro ao cliente.
4. WHEN a cobrança é abandonada dessa forma THEN o sistema SHALL remover a forma de pagamento PIX da venda local e permitir que o operador aplique outra forma no lugar.
5. WHEN o PIX é abandonado dessa forma THEN o sistema SHALL NÃO enviar nenhuma solicitação de cancelamento de PIX ao ERP/CentriumPag — a desassociação é sempre manual, feita pelo operador fora do Checkout. O PIX não expira em um tempo curto (sem teto de polling de 10-15min).

**Nota sobre a redação anterior desta story.** Até 2026-09-04 ela dizia "quero poder **fechar o modal**", e o fechamento era um clique só, sem confirmação — ESC inclusive. O usuário travou a janela (item 7) porque esse era o gesto que mais facilmente deixava uma cobrança órfã no banco sem o operador perceber. A saída deliberada **permanece** de propósito: sem ela, e sem um status terminal do ERP, o operador só sairia da janela com F5, perdendo a venda inteira.

**Independent Test**: Gerar um PIX; verificar que ESC não fecha a janela e que o botão de fechar está bloqueado; acionar "Desistir da operação", confirmar o diálogo, conferir o aviso sobre o banco e verificar que nenhuma chamada de cancelamento é feita; aplicar outra forma de pagamento no lugar.

---

### P1: A janela permanece na tela depois da aprovação ⭐ MVP

**User Story**: Como operador de caixa, quero ver que o PIX foi aprovado antes de a janela sair da frente, para não ficar em dúvida sobre o que aconteceu.

**Why P1**: Numa janela que some no instante da aprovação, o operador não distingue "foi pago" de "algo deu errado e a janela fechou".

**Acceptance Criteria**:

1. WHEN a sondagem detecta a aprovação THEN o sistema SHALL registrar o pagamento como aprovado na venda **imediatamente** — o total da venda nunca fica desatualizado esperando a janela.
2. WHEN o pagamento é aprovado THEN a janela SHALL trocar para o estado aprovado (indicação visual de confirmação) e fechar sozinha **10 segundos** depois.
3. WHEN o pagamento está aprovado THEN o fechamento manual SHALL ser liberado — ESC e o botão de fechar do cabeçalho passam a funcionar, para quem não quiser esperar.

**Definido (2026-09-04, AD-161):** decisão direta do usuário.

**Independent Test**: Mockar `StatusPIX` para aprovar; verificar que o pagamento entra aprovado na venda enquanto a janela ainda está visível no estado aprovado, que o botão de fechar deixou de estar bloqueado, e que a janela sai sozinha em seguida.

---

### P1: Remover uma forma PIX já aplicada ⭐ MVP

**User Story**: Como operador de caixa, quero poder tirar uma forma PIX da venda, sabendo que isso não devolve o dinheiro ao cliente.

**Why P1**: Sem isso, uma venda com PIX aplicado fica congelada — o operador não consegue reorganizá-la nem cancelá-la, e o bloqueio não protegia nada.

**Acceptance Criteria**:

1. WHEN o operador remove uma forma PIX da lista de pagamentos aplicados THEN o sistema SHALL pedir confirmação explícita antes de remover.
2. WHEN a remoção é confirmada THEN o sistema SHALL remover a forma da venda, **preservar o registro no log de auditoria** (`FORMA_PAGAMENTO_REMOVIDA`) e NÃO enviar nenhuma solicitação de cancelamento ou estorno — isso é feito pelo operador diretamente no banco.
3. WHEN a venda tem PIX e o operador aciona "Limpar" (descarte do pagamento em bloco) THEN o sistema SHALL pedir a mesma confirmação, pelo mesmo motivo.

**Definido (2026-09-04, AD-161), corrigindo o recorte de AD-030/AD-042 quanto ao PIX:** aquelas decisões tratavam TEF e PIX como o mesmo caso irreversível. O usuário separou os dois — só o **TEF** permanece irremovível, porque a transação vive num terminal físico que precisa ser cancelado antes (ver `.specs/features/pagamento-tef/spec.md`). O PIX nunca teve caminho de cancelamento pelo Checkout, então travar a forma na tela não protegia o dinheiro de ninguém.

**Independent Test**: Aplicar e aprovar um PIX; clicar em remover, conferir o diálogo de confirmação, confirmar, e verificar que a forma saiu da venda, que o saldo voltou e que o evento de remoção está no log.

---

## Edge Cases

- **Novo (2026-08-31, AD-109):** WHEN a forma PIX dinâmico é inserida na venda THEN o sistema SHALL chamar `GerarPIX` **somente depois** de a validação prévia da venda (`ValidarNFCe`, feature 014) ter dado veredito favorável para essa inserção. WHEN o ERP recusa a venda THEN o sistema SHALL NÃO gerar cobrança: nenhum QR Code, nenhum código "copia e cola" e nenhum registro no adquirente. Esta feature **não muda de mecanismo** por causa disso — o gate mora na inserção do pagamento (feature 008), que é quem dispara o roteamento ao qual este fluxo reage.
- WHEN o intervalo de polling de `StatusPIX` precisa ser definido THEN o sistema SHALL consultar a cada 10 segundos. **Resolvido (2026-08-24, AD-026):** decisão direta do usuário — intervalo fixo de 10s.
- WHEN `GerarPIX` é chamado THEN o sistema SHALL enviar `Empresa` (`codigoEmpresa` persistido, ver AD-019 em `.specs/project/STATE.md`), exigido pelo contrato — regra geral detalhada em `.specs/features/pagamento-geral/spec.md`.
- WHEN `GerarPIX` é chamado THEN o sistema SHALL exibir o QR Code retornado, decodificando e exibindo o campo `Trnbase64image` (já presente em `GerarPIXOutput` desde a atualização do contrato em 2026-08-26, AD-087) via `<img src="data:...;base64,...">`, com o **tipo MIME detectado a partir dos primeiros bytes** da imagem (assinatura PNG/JPEG/GIF/WebP/SVG/BMP), sem repetir o padrão legado de gravar em arquivo temporário (específico de Web Panel GX Web, não aplicável a uma SPA). **Histórico (2026-08-26, AD-079/AD-081/AD-087):** verificado no código-fonte real do ERP (`PCheckout_GerarPIX`) que o contrato antigo só devolvia `TrnGUID` e `Trnbase64text` — este último é o base64 do **texto** "copia e cola" (`ToBase64(&TrnPixCopiaECola)`), não uma imagem. A imagem do QR Code já era gerada pelo próprio ERP nesse mesmo fluxo (`PTransacao_CentriumPag_Post` chama `PGetBarCodeImage.Udp(BarCodeQRCode, copiaECola)`) e ficava persistida na tabela `Transacao` — usada pela tela legada do ERP (`WPTransacao_LapseStatus`, sub `CarregarQRCode`), mas nunca exposta ao Checkout até a equipe do ERP confirmar (AD-081) e efetivar (AD-087) a inclusão de `Trnbase64image` no `parm()` de saída de `PCheckout_GerarPIX`, corrigindo a assunção "eu acho" de AD-047. **Correção do tipo MIME (2026-09-04, AD-161):** a implementação declarava `image/jpeg` fixo para toda imagem, inclusive para os **PNG** que `PGetBarCodeImage` de fato gera — corrigido para detectar o tipo real pelos bytes.
- WHEN `GerarPIX`/`StatusPIX` devolvem `Trnbase64image`/`Trnbase64text` THEN o sistema SHALL **validar antes de decodificar**: só chamar a decodificação base64 quando o valor recebido de fato for base64 válido (alfabeto, preenchimento e legibilidade do resultado); quando não for, SHALL transmitir o dado **intacto**, sem lançar erro e sem esvaziá-lo. **Definido (2026-09-04, AD-161):** decisão direta do usuário — o nome do campo (`Trnbase64text`) é uma promessa do contrato, não uma garantia verificável a cada resposta; decodificar incondicionalmente um valor que já viesse em texto puro devolveria bytes sem sentido para o operador copiar no app do banco. Implementado em `domain/pix/base64.ts` (`ehBase64`, `decodificarSeBase64`, `fonteDeImagemBase64`), puro e testado isoladamente.
- WHEN `GerarPIX` é chamado THEN o sistema SHALL NÃO enviar o campo `TrnTempoExpiracaoPIX` (presente no SDT de entrada `SDTCentriumPag_Post`, Fato F3 de `.specs/project/DECISIONS.md`). **Resolvido (2026-08-25, AD-047):** decisão direta do usuário — campo não enviado pelo Checkout.
- WHEN o operador tenta gerar um PIX abaixo do valor mínimo configurado THEN o sistema SHALL validar `ConfiguracoesPIX.MinimoPix` no lado do cliente (client-side) e bloquear a geração. **Resolvido (2026-08-25, AD-047):** decisão direta do usuário.
- WHEN `GerarPIX` é chamado em uma venda com split de pagamento (outras formas já aplicadas) THEN o sistema SHALL usar o saldo residual da venda (valor ainda não coberto), não o total cheio. **Resolvido (2026-08-25, AD-047):** decisão direta do usuário.
- WHEN o Checkout precisa decidir se exibe alguma UI além do QR Code (encurtador de link, link externo) THEN o sistema SHALL assumir que o endpoint sempre retorna o QR Code em base64, sem necessidade de UI adicional para `ConfiguracoesPIX.UtilizaEncurtador`/`UtilizaLinkExterno`. **Confirmado (2026-08-26, AD-079 e AD-087):** a suposição de baixa confiança de AD-047 ("eu acho") foi verificada no código-fonte real do ERP e o contrato já expõe `Trnbase64image` — o Checkout sempre recebe o QR Code pronto em base64, sem exigir UI adicional para os dois flags.
- WHEN a própria chamada `POST /ApiCentriumOAuth/GerarPIX` falha (erro de rede/validação, distinto de falha no polling de `StatusPIX` depois de gerado) THEN o sistema SHALL exibir um erro simples e oferecer a opção de tentar novamente. **Resolvido (2026-08-25, AD-040):** decisão direta do usuário.
- WHEN `GerarPIX` é chamado THEN os campos `TrnPagadorNome`/`TrnPagadorCgc` do `SDTCentriumPag_Post` SHALL ser preenchidos com o cliente **atual** da venda (identificado explicitamente pelo operador, ou o cliente default quando não há seleção explícita — nunca vazio "sem cliente"); `TrnPagadorEmail`/`TrnPagadorFone` SHALL ser sempre enviados vazios nesta versão, porque o snapshot de cliente da venda (`identificacao-cadastro-cliente/spec.md`) não retém e-mail/celular. **Resolvido (2026-08-27, AD-100):** decisão direta do usuário, na fase Design da feature 009. Detalhe em `specs/009-pagamento-pix/research.md` (D7).
- WHEN `StatusPIX` retorna `StatusTransacao` THEN o sistema SHALL interpretar o literal recebido conforme a tabela de dez valores confirmada pelo usuário: `'C'` (Criada), `'A'` (Aberta) e `'G'` (Aguardando Pagamento) mantêm o polling; `'P'` (Pagamento Recebido) e `'M'` (Pagamento Liberado Manualmente) são **ambos** tratados como aprovado, dando continuidade ao checkout; `'X'` (Expirada), `'R'` (Recusada), `'E'` (Erro), `'F'` (Fechada) e `'O'` (Removido Associação PIX) são tratados como falha terminal, reaproveitando o **mesmo** fluxo já decidido para a desistência manual acima (aviso sobre o banco, remoção do pagamento local, nenhuma chamada de cancelamento) — não é um segundo mecanismo de estado, é o mesmo caminho acionado por um gatilho diferente. **Resolvido (2026-08-27, AD-102):** literais confirmados diretamente pelo usuário na fase Design da feature 009, fechando o item 33 de `.specs/project/PENDENCIES.md` (a leitura inicial via KB GeneXus tinha alta confiança só nos nomes de cinco estados, não nos literais exatos). Detalhe em `specs/009-pagamento-pix/research.md` (D8).
- WHEN uma cobrança PIX é gerada THEN o ERP mockado (`tests/e2e/support/erp-mock.ts`), sem roteiro explícito de transições configurado, SHALL manter `StatusTransacao = 'G'` por `atrasoPagamentoPixMs` (padrão: 20 segundos) e só então passar a devolver `'P'`, contado a partir do instante de `GerarPIX` e rastreado por `TrnGUID`. **Definido (2026-09-04, AD-161):** decisão direta do usuário — sem isto, o mock marcava a cobrança como paga já no segundo tick de polling, e o estado de espera (o que o operador realmente vê no mundo real, entre o QR Code aparecer e o cliente pagar) nunca era visível no teste manual da stack local. Um roteiro explícito (`statusPixTransicoes`) continua tendo precedência e é o único modo usado pelos cenários automatizados, que não podem depender de relógio real.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
|---|---|---|---|
| PAY-03 | Ocultar PIX quando `UtilizaCentriumPAG=false` | - | Verified |
| PAY-04 | Consulta ativa de status de PIX (sem SSE) | - | Verified (2026-08-21, AD-023 — endpoint `StatusPIX` confirmado no contrato atualizado) |
| PAY-11 | Desistir de um PIX pendente, com janela travada e confirmação (renomeado de "Fechamento de modal com PIX pendente") | - | Verified (2026-08-25, AD-040; travamento e confirmação em 2026-09-04, AD-161) |
| PAY-13 | A janela permanece 10s após a aprovação, com fechamento manual liberado nesse ponto | - | Verified (2026-09-04, AD-161) |
| PAY-14 | Remover forma PIX já aplicada, com confirmação e log preservado | - | Verified (2026-09-04, AD-161, corrige o recorte de AD-030/AD-042 quanto ao PIX) |

**Coverage:** 5 total, todos os edge cases resolvidos — QR Code do PIX via `Trnbase64image`, exposto em `GerarPIXOutput` desde 2026-08-26 (AD-087, corrige a assunção de baixa confiança de AD-047 e fecha o item 24 de `.specs/project/PENDENCIES.md`) e com o tipo MIME detectado pelos bytes desde 2026-09-04 (AD-161); intervalo de polling de `StatusPIX` — AD-026; `TrnTempoExpiracaoPIX`, `MinimoPix`, saldo residual — AD-047; falha em `GerarPIX` — AD-040; validação de base64 antes de decodificar (`Trnbase64image`/`Trnbase64text`) e status simulado por relógio no mock — AD-161.

---

## Success Criteria

- [ ] Nenhuma venda finalizada sem confirmação ativa de PIX quando aplicável.
