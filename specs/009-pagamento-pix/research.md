# Phase 0 — Research: Pagamento — PIX

**Feature**: `009-pagamento-pix` | **Date**: 2026-08-27 | **Plan**: `specs/009-pagamento-pix/plan.md`

Decisões que fecham todo `NEEDS CLARIFICATION` da feature. Base: `specs/009-pagamento-pix/spec.md` (requisitos de produto), `.specs/features/pagamento-pix/spec.md` (`PAY-03`/`PAY-04`/`PAY-11`), o contrato real `Fluxograma - Diagrama - Alinhamentos/APICentriumOAuth.yaml`, as decisões já registradas em `.specs/project/STATE.md` (AD-023, AD-026, AD-040, AD-047, AD-074, AD-079, AD-081, AD-087, AD-097, AD-098) e os artefatos já produzidos pela feature 008 (mesmo domínio de pagamento, consumido aqui, não duplicado).

---

## D1 — Esta feature não re-decide roteamento: só reage ao veredito `PIX_DINAMICO`

**Decision**: `resolverIntegracao(forma, capacidades)` (feature 008, `contracts/pagamento-domain-api.md`) já decide quando uma forma vira PIX dinâmico (`FormaMeioPagtoNFe = 'Pix'` e `ConfiguracoesPIX.UtilizaCentriumPAG = true`). A feature 009 implementa exclusivamente o que acontece **depois** desse veredito: gerar a cobrança, exibi-la, consultar status, e devolver aprovação/recusa via `confirmarPagamentoIntegrado`/`recusarPagamentoIntegrado` do slice de pagamento.

**Rationale**: Constitution II (Dependency Inversion) — o slice de pagamento recebe `iniciarIntegracao` injetado e não conhece PIX/TEF; a feature 009 não conhece o carrinho, a condição de pagamento nem o desconto de capa. `FR-003`/`PAY-03` (ocultar PIX quando não configurado) já é responsabilidade de `formaDisponivel` (008) — esta feature nunca precisa checar `UtilizaCentriumPAG` de novo.

**Alternatives considered**: *Duplicar a checagem de `pixAtivo` no módulo de PIX, por defesa*: rejeitado — duas fontes de verdade para a mesma flag divergem com o tempo (mesmo argumento de Constitution III).

---

## D2 — Dois endpoints reais, sem SSE

**Decision**: `POST /ApiCentriumOAuth/GerarPIX` (body `GerarPIXInput.SDTCentriumPag_Post`) gera a cobrança; `GET /ApiCentriumOAuth/StatusPIX` (params `Empresa`, `Trnguid`) consulta o status. Ambos atrás do proxy `/api/erp/*` do BFF (feature 002), que injeta `Authorization`/`Empresa` no servidor — o JS nunca monta esses campos manualmente (`.specs/codebase/ARCHITECTURE.md`, AD-019/AD-022). Confirmado em contrato (AD-023) — SSE descartado deliberadamente (AD-012, `.specs/features/pagamento-pix/spec.md`, "Out of Scope").

**Rationale**: Mesmo padrão da feature 008 (`ValidaTicketDevolucao`) — `Empresa` é sempre injetado pelo BFF a partir do `codigoEmpresa` persistido, nunca enviado pelo JS, seja em query (`StatusPIX`) ou dentro do corpo do SDT (`GerarPIX`).

---

## D3 — `TrnGUID` é gerado no cliente

**Decision**: O Checkout gera um novo UUID v4 (`crypto.randomUUID()`) no momento de `aplicarPagamento` quando `resolverIntegracao(...) === 'PIX_DINAMICO'`, atribui a `SDTCentriumPag_Post.TrnGUID` no corpo de `GerarPIX`, e usa o mesmo valor como `Trnguid` em toda chamada subsequente de `StatusPIX` — é a chave de correlação entre a cobrança gerada e o polling. O mesmo valor é persistido em `PagamentoAplicado.pixGuid` (campo já previsto em `specs/008-pagamento-geral/data-model.md`, §2).

**Rationale**: `SDTCentriumPag_Post.TrnGUID` (`format: uuid`) é a chave primária lógica da tabela `Transacao` no ERP (confirmado via KB real, `PCheckout_StatusPIX` busca `Transacao` por `TrnGUID`) — o cliente precisa fornecer um valor único antes do ERP criar a linha, não há alternativa de "o servidor gera e devolve".

---

## D4 — Só o subconjunto de `SDTCentriumPag_Post` relevante ao PIX é enviado

**Decision**: `SDTCentriumPag_Post` é um SDT genérico de transação, compartilhado com boleto/duplicata mercantil (campos como `TrnDatVen`, `TrnValMul`, `TrnPerMul`, `TrnTipTaxJ`, `TrnValJur`, `TrnPerJur`, `TrnDatLimD`, `TrnValDes`, `TrnPerDes`, `TrnValAbat`, `TrnDatPag`, `TrnStaBol`, `TrnOriEmp`, `TrnOriPar`, `TrnNosNumS`, `TrnIns1Cod/Val`, `TrnIns2Cod/Val`, `TrnIns3Cod/Val`, `TrnCodBar` — nomenclatura inequivocamente de boleto). O Checkout envia apenas: `TrnGUID` (D3), `TrnValor` (D6), `TrnFormaPagamento` (D5-bis), `TrnPagadorNome`/`TrnPagadorCgc`/`TrnPagadorEmail`/`TrnPagadorFone` (D7), `Empresa` (injetado pelo BFF, D2), `FPgCod` (código da forma PIX no catálogo, `PagamentoAplicado.formaCodigo`). Os campos específicos de boleto/duplicata **não são enviados** (ficam `undefined`, nunca um valor sintético).

**Rationale**: Achado desta fase, lendo o schema completo (`ApiCentriumOAuth.yaml`, linhas 1635-1780). Consistente com o espírito de AD-047 ponto 1 (não enviar `TrnTempoExpiracaoPIX`) — a mesma lógica de "só o que é de PIX" se estende ao resto do SDT genérico, agora com o schema completo à vista.

**Trade-off/confiança**: Alta confiança na omissão dos campos de boleto (naming inequívoco). Confiança média em quais dos campos de PIX genéricos (`CntGUID`, `TrnOrigemDocumento`/`TrnOrigemSerie`, `TrnStatus`) o Checkout deveria preencher — tratados em D4-bis abaixo.

### D4-bis — `CntGUID`, `TrnOrigemDocumento`/`TrnOrigemSerie`, `TrnStatus` não são enviados

**Decision**: Nenhum dos três é enviado pelo Checkout em `GerarPIX`.
- `TrnOrigemDocumento`/`TrnOrigemSerie` ("Origem Documento"/"Origem Série") — no momento em que o operador gera o PIX, a NFCe ainda não foi emitida (`FaturarNFCe` é a feature 004, chamada depois); não existe número/série de documento para referenciar.
- `CntGUID` ("Cnt GUID") — sem documentação no schema nem uso localizado nos procedimentos inspecionados (`PCheckout_StatusPIX`, `PCheckout_GerarPIX`); nenhum indício de que o Checkout deva gerá-lo.
- `TrnStatus` — é o campo que o próprio ERP escreve ao criar/atualizar a transação (D8); o cliente nunca o define na criação.

**Rationale**: Ausência de qualquer referência a esses três campos nos objetos reais inspecionados via KB (`mcp__genexus__genexus_search_source`/`genexus_read`, KB `CentriumDEVU6`) que manipulam PIX — tratá-los como responsabilidade exclusiva do servidor é a leitura mais conservadora do schema.

---

## D5 — `TrnFormaPagamento` recebe o valor de `MeioPagtoNFe` da forma aplicada

**Decision**: `SDTCentriumPag_Post.TrnFormaPagamento` (string) recebe `PagamentoAplicado.meioPagtoNFe`, ou seja, a string `'Pix'` — o mesmo domínio fechado `MeioPagtoNFe` já usado em toda a feature 008 (`specs/008-pagamento-geral/data-model.md`, §1), sem um segundo enum paralelo.

**Rationale**: `PTransacao_CentriumPag_GetStatusPAG` compara `&SDTCentriumPag_Retorno.TrnFormaPagamento = Nfce_FormaPagto.BoletoBancario` (achado via KB) — confirma que este campo usa o mesmo domínio `Nfce_FormaPagto` que `FormaMeioPagtoNFe`, não uma string livre.

---

## D6 — `TrnValor` é o saldo residual, não o total da venda

**Decision**: `TrnValor` (double) recebe `saldoRestante` (feature 008, `SaldoPagamento.saldoRestante`) convertido de `Centavos` para `double` (`valor / 100`), no momento da aplicação — não o subtotal cheio da venda.

**Rationale**: Decisão já fixada em AD-047 ponto 3 (Fato F3) — split de pagamento usa o saldo ainda não coberto. Reaproveita o seletor `saldo()` já exposto pelo slice de pagamento (008), sem recalcular aqui.

---

## D7 — Dados do pagador vêm do cliente atual da venda (identificado ou default) — **AD-100**

**Decision**: `TrnPagadorNome`/`TrnPagadorCgc` recebem `clienteAtual.nome`/`clienteAtual.documento` do slice `cliente` (feature 005, `ClienteVenda`) — o cliente identificado explicitamente pelo operador, ou, na ausência de seleção explícita, o cliente default da empresa (mesma fonte, já pré-selecionado desde o início da venda por AD-032). Quando `clienteAtual.documento` é `null` (só ocorre para `origem = 'DEFAULT'`, já que `GetSessao` não devolve CPF/CNPJ do cliente default — `specs/005-identificacao-cadastro-cliente/data-model.md`, §1), `TrnPagadorCgc` é enviado vazio (`''`). `TrnPagadorEmail`/`TrnPagadorFone` **não têm fonte** no snapshot atual de `ClienteVenda` — a interface (feature 005) não retém e-mail/celular mesmo para clientes de origem `CADASTRO_SIMPLIFICADO`, que os capturam no formulário mas não os persistem no estado da venda. O Checkout envia esses dois campos vazios (`''`) até que a feature 005 seja estendida para retê-los.

**Reason**: Decisão direta do usuário (2026-08-27, `AskUserQuestion` desta sessão) — "preencher com o cliente identificado, sem cliente identificado (ou seja, só o cliente default), os dados a serem enviados são os do cliente default". Resolve a ambiguidade de quais dados populam o corpo de `GerarPIX`.

**Trade-off**: `TrnPagadorEmail`/`TrnPagadorFone` ficam sistematicamente vazios nesta primeira versão — gap aceito, não um novo `NEEDS CLARIFICATION`, porque decorre de uma lacuna já existente no design da feature 005 (não recaptura de e-mail/celular no `ClienteVenda`), fora do escopo desta feature alterar. Documentado como nota em `.specs/features/pagamento-pix/spec.md` (Edge Cases), sem abrir item em `PENDENCIES.md` — não depende do ERP, é lacuna de escopo do Checkout.

**Impact**: Novo **AD-100** em `.specs/project/STATE.md`.

---

## D8 — Interpretação de `StatusTransacao` — achado via KB real do GeneXus

**Decision**: `StatusTransacao` é um domain `VARCHAR(1)` enumerado (não documentado em `.specs/` antes desta fase). Valores nomeados confirmados lendo o código-fonte real (`mcp__genexus__genexus_search_source`/`genexus_read`, KB `CentriumDEVU6`, objetos `PCheckout_StatusPIX`, `PTransacao_CentriumPag_GetStatusPAG`, `PTransacao_CentriumPag_TestaConexao`):

| Nome (enum) | Significado | Origem no código |
|---|---|---|
| `Aguardando` | Pendente — CentriumPag ainda não recebeu o pagamento | `PTransacao_CentriumPag_GetStatusPAG`, `Codigo = 4` |
| `PagamentoRecebido` | **Aprovado** — é o único estado que o Checkout SHALL tratar como `FR-002` "aprovado" | idem, `Codigo = 3` |
| `Expirada` | Estado terminal de falha — CentriumPag considerou a cobrança expirada | idem, `Codigo = 5` |
| `Recusada` | Estado terminal de falha — pagamento recusado | idem, `Codigo = 6` |
| `Erro` | Estado terminal de falha — erro de comunicação/config no lado do CentriumPag | idem, `Codigo = 2`/`9999` |

Além desses, `PCheckout_StatusPIX` usa o literal `'G'` diretamente (`if &StatusTransacao = 'G'`) como o estado inicial gravado na criação da transação (antes de qualquer consulta ativa a CentriumPag) — plausivelmente "Gerado", distinto de `Aguardando` (que só é escrito depois de uma consulta que já confirmou o status "aguardando pagamento" na adquirente). `PCheckout_StatusPIX` só dispara a consulta ativa à CentriumPag (`PTransacao_CentriumPag_GetStatusPAG`) quando o valor armazenado é `'G'` — ou seja, o polling do Checkout aciona indiretamente essa consulta a cada `GET /StatusPIX` enquanto a transação não sai do estado inicial.

**Interpretação adotada pelo Checkout** (`interpretarStatusPix`, `data-model.md` §5): compara a string recebida por **nome semântico**, nunca por char hardcoded:
- `PagamentoRecebido` → aprovado; chama `confirmarPagamentoIntegrado`.
- `Aguardando` ou o estado inicial (`'G'`) → ainda pendente; o polling continua (`FR-001`/`FR-002`).
- `Expirada`, `Recusada`, `Erro` → falha terminal; tratado com o **mesmo caminho de UX já decidido para fechamento manual** (AD-040/D11 abaixo) — aviso de desassociação manual, remoção do pagamento do estado local, sem chamada de cancelamento. **Não** é uma aprovação nem um erro de rede — é uma extensão direta de AD-040 para o caso em que é a própria CentriumPag, não o operador, que reporta que a cobrança não vai mais ser paga.

**Trade-off/confiança**: Alta confiança nos **nomes** dos cinco estados (lidos diretamente do código-fonte real, não suposição). Confiança média nos **literais exatos** (`'G'` confirmado para o estado inicial; os caracteres exatos usados para `Aguardando`/`PagamentoRecebido`/`Expirada`/`Recusada`/`Erro` não foram expostos pela ferramenta de introspecção de domain disponível nesta sessão — a implementação SHALL comparar por nome/constante nomeada do lado do ERP, nunca hardcode de char no Checkout, e a fronteira Zod SHALL aceitar qualquer string não reconhecida como "estado desconhecido", tratado como falha terminal por segurança, nunca como aprovado). Abre o **item 33** em `.specs/project/PENDENCIES.md`: confirmar com a equipe do ERP a lista completa e os literais exatos de `StatusTransacao`.

---

## D9 — Mecânica do polling: TanStack Query, 10s fixo, condicional ao modal aberto e status pendente

**Decision**: `useStatusPix(trnGuid, habilitado)` — hook TanStack Query com `refetchInterval: habilitado ? 10_000 : false`. `habilitado` é `true` somente enquanto: o modal PIX está aberto **e** o pagamento está em `PENDENTE_INTEGRACAO`. Ao detectar `PagamentoRecebido`, `Expirada`, `Recusada` ou `Erro` (D8), o hook para de fato o polling (o call site desabilita `habilitado` na mesma renderização que processa o resultado) — nunca depende só do `refetchInterval` parar sozinho.

**Rationale**: Intervalo fixo de 10s já decidido (AD-026, sem estratégia de backoff documentada — deliberado). TanStack Query é a mesma lib já usada pelo catálogo de pagamento (008) e pelo polling análogo de `GetStatusSistema` (AD-075/AD-080, 60s) — não introduz dependência nova. Habilitar só com o modal aberto evita polling órfão quando o operador já fechou a tela (mesmo raciocínio do UX de D11).

**Alternatives considered**: *`setInterval` manual dentro do componente*: rejeitado — duplicaria lógica de cache/retry/cleanup que o TanStack Query já resolve, e quebraria o padrão já estabelecido pela feature 008 para o catálogo.

---

## D10 — Exibição do QR Code e do "copia e cola"

**Decision**: `GerarPIXOutput.Trnbase64image` é decodificado direto em `<img src="data:image/jpeg;base64,{Trnbase64image}">`, sem etapa de arquivo temporário (padrão legado de Web Panel GX, não aplicável a uma SPA). `Trnbase64text` é decodificado (`atob`) para o texto "copia e cola" e exibido com um botão "Copiar" via Clipboard API (`navigator.clipboard.writeText`).

**Rationale**: AD-079/AD-087 já resolveram por completo a origem e disponibilidade dos dois campos no contrato (item 24 de `PENDENCIES.md`, fechado). Nada novo a decidir aqui além do mecanismo de exibição, que é puramente de UI.

---

## D11 — Fechamento do modal com PIX pendente (reaproveita AD-040)

**Decision**: Ao operador fechar o modal PIX com o pagamento ainda em `PENDENTE_INTEGRACAO`, o sistema exibe um aviso ("será necessário desassociar esta cobrança manualmente na Central de Transações PIX, fora do Checkout") e chama `recusarPagamentoIntegrado(idPagamento, 'FECHADO_PELO_OPERADOR')` (slice de pagamento, feature 008) — que remove o pagamento do estado local e permite aplicar outra forma. **Nenhuma chamada HTTP de cancelamento é feita** — nem para `GerarPIX`/`StatusPIX` nem para qualquer endpoint novo (não existe endpoint de cancelamento de PIX no contrato).

**Rationale**: AD-040 ponto 1, decisão direta do usuário — já registrado na spec técnica antes desta fase Design; esta fase só formaliza o mapeamento para a action já definida pelo slice da feature 008 (`recusarPagamentoIntegrado`), sem criar uma nova primitiva de estado.

---

## D12 — Falha na própria chamada `GerarPIX`

**Decision**: Erro de rede/validação ao chamar `POST /GerarPIX` (distinto de falha de polling depois de gerado) exibe um toast de erro simples com botão "Tentar novamente", que re-executa a mesma chamada com um **novo** `TrnGUID` (D3) — nunca reusa o GUID de uma tentativa que falhou antes de o ERP confirmar a criação da linha.

**Rationale**: AD-040 ponto 2. Gerar novo GUID a cada tentativa evita colisão com uma linha que, apesar do erro reportado ao cliente, pode ter sido parcialmente criada no servidor.

---

## D13 — Validação de valor mínimo antes de chamar `GerarPIX`

**Decision**: Antes de chamar `GerarPIX`, o Checkout valida `saldoRestante >= ConfiguracoesPIX.MinimoPix` (client-side); abaixo do mínimo, a geração é bloqueada com toast, sem request ao ERP.

**Rationale**: AD-047 ponto 2. `MinimoPix` já chega pelo bootstrap (`SessaoUsuario.ConfiguracoesPIX`, mesmo payload consumido pela feature 008) — nenhuma chamada nova.

---

## D14 — Auditoria reaproveita os eventos já definidos pela feature 008/001

**Decision**: A feature 009 não define nenhum tipo de evento de auditoria novo. Ao chamar `confirmarPagamentoIntegrado(idPagamento, { pixGuid })`, o slice de pagamento (008) já dispara `FORMA_PAGAMENTO_APLICADA`; ao chamar `recusarPagamentoIntegrado`, já dispara `PAGAMENTO_RECUSADO` (contrato em `specs/008-pagamento-geral/contracts/pagamento-domain-api.md`, tabela de actions). A feature 009 só popula `dados.pixGuid`/o motivo de recusa — nunca chama `registrarEventoAuditoria` diretamente.

**Rationale**: Constitution II — evita uma segunda fonte de eventos de pagamento; o contrato de auditoria (feature 001, `contracts/auditoria-events.md`) já lista as features 008/009/010 como consumidoras do mesmo dispatcher, não como emissoras paralelas.

---

## D15 — Fronteira Zod

**Decision**: `GerarPIXOutput` (`TrnGUID`, `Trnbase64text`, `Trnbase64image`) e `StatusPIXOutput` (`StatusTransacao`, `messages`) são validados com Zod na fronteira (`src/shared/schemas/pix.schema.ts`). `StatusTransacao` é validado como `string` livre (não união fechada) — dado o achado de confiança média de D8, uma união fechada rejeitaria um valor novo/desconhecido e quebraria a tela; a função `interpretarStatusPix` (domínio puro) é quem decide o significado, com um ramo explícito de "desconhecido → falha terminal, nunca aprovado" (Constitution IV — nenhum valor inesperado é tratado como sucesso).

**Rationale**: Mesmo padrão de resiliência já usado pela feature 008 para `MeioPagtoNFe` (`data-model.md` §1: valor fora da união conhecida não derruba a tela).
