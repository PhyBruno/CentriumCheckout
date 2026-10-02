# Implementation Plan: Pagamento — TEF

**Branch**: `docs/plan-pagamento-tef` (feature `010-pagamento-tef`) | **Date**: 2026-10-02 | **Spec**: `specs/010-pagamento-tef/spec.md`

**Input**: especificação `specs/010-pagamento-tef/spec.md`, complementada por `.specs/features/pagamento-tef/spec.md` (`PAY-02`, `PAY-12`); pelo pedido do usuário de 2026-10-02 (pontos 0–7: `UsuarioGAM` no `GetSessao`, janela travada com confirmação ao desistir, polling como o PIX, exclusão de TEF aprovado por estorno, várias formas TEF por venda, e os três endpoints `CriarCardPagamento`/`ConsultarStatusCard`/`EstornarPagamento`); pela KB GeneXus do ERP (`CentriumDEVU6`, bloco `//SmartTEF` da API `ApiCentriumOAuth`, lida pelo MCP em 2026-10-02); pelos contratos já publicados das features 008 (`specs/008-pagamento-geral/contracts/pagamento-domain-api.md`) e 009 (`specs/009-pagamento-pix/contracts/`); e pelas decisões de `.specs/project/STATE.md` (AD-026, AD-037, AD-064, AD-144, AD-158, AD-161, AD-162, AD-163, AD-180, AD-209, AD-224, AD-250, AD-251 e o novo **AD-259** aberto por esta fase).

## Summary

A feature 010 implementa o que acontece **depois** que a 008 já decidiu, por `resolverIntegracao`, que uma forma é `TEF` — cartão de crédito, de débito ou PIX com `FpgNfTefPos = '1'` numa empresa com `TEFAtivo` (AD-180/AD-250). O desenho é deliberadamente o do PIX (009), como o usuário pediu ("o fluxo é praticamente igual"): a janela nasce do `PagamentoAplicado` em `PENDENTE_INTEGRACAO` (AD-158), cria a cobrança na maquininha **uma vez** (`POST CriarCardPagamento`), sonda `GET ConsultarStatusCard` a cada 10s fixos (AD-026), confirma com `confirmarPagamentoIntegrado` ao ver `CNC` e abandona com `recusarPagamentoIntegrado` em falha ou desistência confirmada — esta com o aviso de que **o Checkout não cancela a transação em voo**. Diferente do PIX, o TEF aprovado **pode** sair da venda, mas só por **estorno**: `POST EstornarPagamento` e polling até `EST`; só então uma action nova, `confirmarEstornoTef`, risca a forma (AD-163).

A fase de Design teve quatro achados na KB que mudam o desenho:

1. **Os endpoints existem e o contrato é outro do que AD-162 supunha** — não há "endpoint de confirmação de cancelamento": o estorno é confirmado pela **mesma** consulta de status da cobrança, e o ciclo tem nove status reais (`PDT`, `PROC_PAG`, `CNC`, `CAN_ERP`, `REJ_PAG`, `SOL_EST`, `PROC_EST`, `EST`, `REJ_EST`). Fecha o item 41 de `PENDENCIES.md`.
2. **O dado da SmartTEF chega como texto JSON dentro de um envelope de transporte** (`RespostaSmartTEF.RespostaJson`), e as recusas vêm por `Sucesso: false` + `MensagemErro`, não por `messages[]` — a validação de fronteira é em dois estágios.
3. **O polling não é só para a tela: é ele que grava o `CNC` no ERP** (`PSmartTEF_AtualizaRetorno`), e o `FaturarNFCe` só aceita a forma TEF se a `TransacaoTEF` estiver em `CNC`.
4. **O retrato da NFCe está defasado**: o SDT `CheckoutFaturarNFCe` da KB trocou `TEFidentificacao`/`TEFCNPJ`/`TEFNumeroAutorizacao` por `TEFPagId` — o ERP busca autorização, adquirente e bandeira na própria `TransacaoTEF`. `DadosTEF`, `formaParaRetrato` e o schema de importação mudam junto.

`UsuarioGAM` (ponto 0) **ainda não existe** no `GetSessao` real; o desenho o lê no BFF, guarda no cookie como campo opcional e o injeta no corpo — o navegador só sabe se ele está presente (AD-224, item 64 de `PENDENCIES.md`). As parcelas saem da condição de pagamento (`CondicaoPrazo = PraNumPar`), decisão do usuário nesta sessão.

## Technical Context

**Language/Version**: TypeScript `strict`, React 19 + Vite no cliente; Fastify no BFF (feature 002). A feature é majoritariamente client-side; o BFF ganha regras de injeção, não rotas.

**Primary Dependencies**: TanStack Query (`useStatusTef` com `refetchInterval` condicional de 10s — mesmo arranjo de `useStatusPix`); Zod 4 (fronteira em dois estágios, `research.md` D3); shadcn/ui + reicon (`CreditCard`, `Check`, `X` — tradução do Pencil por AD-201) + Goey Toast via `lib/notificar.ts`; `DialogoConfirmacaoDestrutiva` e `useFocoDeModal` já existentes. **Nenhuma dependência nova.**

**Storage**: N/A no cliente — cobrança e estorno em curso são estado efêmero das janelas (Constitution VI). No BFF, o cookie cifrado da sessão ganha o campo **opcional** `usuarioGam`, sem bump de versão.

**Testing**: Vitest + Testing Library. Unitários puros: `interpretarStatusCobrancaTef`/`interpretarStatusEstornoTef` (9 literais + desconhecido, nas duas fases), `parcelasDoTef`, `montarPagadorTef`, `formaParaRetrato` (TEFPagId), schemas de fronteira (dois estágios), e no BFF `corpoComOperadorTef` + `extrairUsuarioGam`. Integração: máquinas de estado de `ModalTef` e `JanelaEstornoTef` (`data-model.md` §4), slice (`confirmarEstornoTef`, T5/T6), teste negativo de "nenhum cancelamento em nenhum caminho de abandono" (T4) e de "nenhuma inserção com a janela aberta" (T7). Playwright: fluxo dourado de `quickstart.md`.

**Target Platform**: navegador (Chrome prioritário), desktop e celular — sem ramificação por plataforma (AD-144).

**Project Type**: web application (SPA React + BFF Fastify), estrutura já existente.

**Performance Goals**: polling fixo de 10s, sem backoff (AD-026); garantir que ele **para** de fato ao fechar a janela ou resolver o status (J3), sem requests órfãos. A criação pode levar até 30s (timeout HTTP de `PSmartTEF`) — a janela mostra o estado de envio enquanto isso.

**Constraints**:
- O Checkout nunca cancela uma transação em voo (não há método exposto, e o usuário pediu o aviso explícito) — `research.md` D12.
- Só `CNC` aprova; só `EST` estorna; literal desconhecido nunca é sucesso (T1).
- `EmpCod`/`UsuarioGAM` nunca são montados pelo JS (T8).
- `PagamentoValor` é o `valorAplicado` convertido só na fronteira; nenhum cálculo monetário novo (Constitution V).
- `CriarCardPagamento` e `EstornarPagamento` movimentam dinheiro real: nenhuma sondagem automática contra o ERP real; medição só com o usuário (`research.md` D17).

**Scale/Scope**: 1 módulo de domínio puro (`domain/tef/`, 4 arquivos) + 1 camada de rede (`services/tef/`) + 1 schema de fronteira (`tef.schema.ts`) + 2 janelas (`ModalTef`, `JanelaEstornoTef`) + ajustes em 008 (`pagamentoSlice`, `ListaPagamentosAplicados`, `saldoPagamento.ts`, `formaParaRetrato.ts`), 006/011 (`dav.schema.ts`, `mapearVendaExistente.ts`), 002 (`bootstrap.schema.ts`, BFF: `getSessao.ts`, `session-start.ts`, `cookie.ts`, `erp-proxy.ts`) e no `erp-mock`.

**NEEDS CLARIFICATION**: nenhum restante. Os três pontos que só a medição responde (envelope do corpo de `CriarCardPagamento` e grafia `FPgCod`; envelope da saída; forma real de `RespostaJson`) estão isolados em uma função cada e viraram a **primeira tarefa** da implementação (`research.md` D17) — não bloqueiam o desenho.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Avaliação (pré-Phase 0) | Re-avaliação (pós-Phase 1) |
|---|---|---|
| I. Spec-Driven Development | ✅ Plano gerado por `/speckit-plan` sobre `specs/010-pagamento-tef/spec.md`; os pontos novos do pedido de 2026-10-02 entram na spec como emenda (`FR-010`–`FR-016`) antes de qualquer código. | ✅ Todo artefato rastreia a `FR-xxx`/`PAY-0x`/ponto do pedido; os achados viraram AD-259 e os itens 64, 65 e 66 de `PENDENCIES.md`; o item 41 foi fechado. Nenhuma decisão implícita no código. |
| II. Arquitetura SOLID | ✅ Domínio puro ↔ rede ↔ UI, como na 009; o slice continua sem conhecer TEF (`iniciarIntegracao` segue no-op, a janela nasce do estado). | ✅ `ModalTef`/`JanelaEstornoTef` recebem callbacks e não importam store; a interpretação de status é um `switch` por fase (Open/Closed: um literal novo da SmartTEF muda uma linha). A única action nova (`confirmarEstornoTef`) tem responsabilidade única e não afrouxa `removerPagamento`. |
| III. ERP como Fonte Única de Verdade | ✅ O Checkout não decide se o cartão foi pago — espelha o `payment_status` que o ERP devolve. | ✅ Reforçado pelo achado D11: o ERP grava o status a cada consulta, e a NFCe só sai se o ERP o tiver em `CNC`. Autorização, adquirente e bandeira deixam de ser enviados pelo Checkout — o ERP os lê da própria `TransacaoTEF` (D16). |
| IV. Tipagem Estrita e Validação de Fronteira | ✅ Zod obrigatório na resposta dos três métodos. | ✅ Dois estágios: envelope **e** o JSON interno de `RespostaJson`; `payment_status` aceito como `string` na fronteira e estreitado só nas funções de domínio com `default` explícito (T1). `EmpCod`/`UsuarioGAM` fora do tipo de entrada da rede (T8). |
| V. Precisão Monetária Inegociável | ✅ `PagamentoValor` = `Centavos → reais` só na fronteira de saída. | ✅ Nenhum cálculo novo; o valor exibido é o do Checkout, nunca o `value`/`payment_value` textual da SmartTEF. |
| VI. Sem Estado de Venda Persistido no Cliente | ✅ `CobrancaTef` e o estado do estorno vivem só nas janelas. | ✅ Nada grava em Dexie/localStorage; o único estado duradouro novo é `usuarioGam` no **cookie do servidor** (credencial de sessão, não estado de venda — mesma natureza de `usuarioCodigo`, AD-224). |

Nenhuma violação nas duas avaliações. "Complexity Tracking" não preenchido.

## Project Structure

### Documentation (this feature)

```text
specs/010-pagamento-tef/
├── plan.md              # este arquivo
├── research.md          # Phase 0 — D1..D18 (endpoints da KB, 9 status, UsuarioGAM, parcelas, estorno, retrato)
├── data-model.md        # Phase 1 — DadosTEF reescrito, domínio puro, Zod, máquinas de estado, invariantes T1–T11
├── quickstart.md        # Phase 1 — 19 cenários + fluxo dourado
├── contracts/
│   ├── erp-tef-api.md       # CriarCardPagamento, ConsultarStatusCard, EstornarPagamento, BFF, delta do FaturarNFCe
│   └── tef-domain-api.md    # domínio puro, rede/query, ModalTef, JanelaEstornoTef, slice
├── checklists/
│   └── requirements.md  # gerado por /speckit-specify
└── tasks.md             # Phase 2 (/speckit-tasks — NÃO criado aqui)
```

### Source Code (repository root)

```text
src/
├── client/
│   ├── domain/
│   │   ├── tef/                                    # NOVO — puro, sem React/rede
│   │   │   ├── interpretarStatusTef.ts             # 9 literais × 2 fases (D4)
│   │   │   ├── parcelasDoTef.ts                    # D8
│   │   │   ├── pagadorTef.ts                       # D9
│   │   │   └── cobrancaTef.ts                      # CobrancaTef, DadosCriarCardTef, ConsultaTef
│   │   └── pagamento/
│   │       ├── saldoPagamento.ts                   # DadosTEF reescrito (D16)
│   │       └── formaParaRetrato.ts                 # TEFPagId/TEFBandeira/TEFTipoIntegracao (D16)
│   ├── services/
│   │   └── tef/                                    # NOVO
│   │       ├── tefQueries.ts                       # criarCardTef, consultarStatusTef, estornarTef, useCriarCardTef, useStatusTef
│   │       └── tefMapper.ts                        # envelope + RespostaJson validados → domínio
│   ├── features/
│   │   └── pagamento/
│   │       ├── ListaPagamentosAplicados.tsx        # useTefPendente, confirmação de estorno, sem bloqueio do TEF aprovado
│   │       └── tef/                                # NOVO
│   │           ├── ModalTef.tsx                    # frames Y0ka3 (aguardando) e xWrzX (aprovado)
│   │           ├── JanelaEstornoTef.tsx            # estorno, moldura do ModalTef
│   │           └── avisosTef.ts
│   └── stores/
│       └── slices/pagamentoSlice.ts                # confirmarEstornoTef; frase de AVISO_TEF_IRREVERSIVEL
├── server/
│   ├── session/{getSessao,cookie}.ts               # extrairUsuarioGam; cookie.usuarioGam opcional
│   └── routes/{session-start,erp-proxy}.ts         # grava usuarioGam; injeta EmpCod/UsuarioGAM/Empresa
└── shared/
    └── schemas/
        ├── tef.schema.ts                           # NOVO — envelope + JSON interno (dois estágios)
        ├── bootstrap.schema.ts                     # UsuarioGAM opcional
        └── dav.schema.ts                           # TEFPagId opcional; 3 campos TEF antigos opcionais

tests/
├── unit/
│   ├── domain/tef/{interpretarStatusTef,parcelasDoTef,pagadorTef}.spec.ts
│   ├── domain/pagamento/formaParaRetrato.spec.ts   # T11
│   ├── shared/schemas/tef.schema.spec.ts
│   └── server/{erp-proxy,getSessao}.spec.ts        # T8
├── integration/
│   ├── ModalTef.spec.tsx                           # data-model.md §4.1, T2–T4, T7
│   ├── JanelaEstornoTef.spec.tsx                   # §4.2, T5/T6
│   └── pagamentoSlice.spec.ts                      # confirmarEstornoTef
└── e2e/
    ├── support/erp-mock.ts                         # três endpoints SmartTEF
    └── pagamento-tef.spec.ts                       # fluxo dourado do quickstart.md
```

**Structure Decision**: sexta feature a estender a árvore da 002, com as mesmas decisões consolidadas pela 009: domínio puro em `domain/<assunto>/`, camada de rede em `services/<assunto>/`, e **nenhum slice novo** — o estado de cobrança/estorno é local às janelas. As janelas ficam em `features/pagamento/tef/`, irmãs de `pix/`, porque são sub-superfícies da tela de pagamento. **O módulo TEF não importa o módulo PIX**: compartilham padrão, não código — os contratos do ERP não têm um campo em comum, e uma abstração "integração genérica" acoplaria duas features que divergem exatamente no ponto que importa (o PIX não estorna; o TEF estorna).

### Referência visual (Pencil, consultado pelo MCP em 2026-10-02)

| Estado | Nó | Observação |
|---|---|---|
| Aguardando | frame `Y0ka3` → modal `uHAyW` (480px, raio 24) | cabeçalho `H4DCf` (disco `$info-soft` 42px, ícone `credit-card` → reicon `CreditCard`, "Pagamento no TEF" / "Operação em andamento"); anel `xObO3` 96px `$cb-blue`; badge `hEB6G` "Processando"; "Aguardando retorno do TEF"; instrução "Não feche esta tela nem desligue a maquininha durante a operação."; bloco escuro "Valor a cobrar" (Geist Mono 32/600); skeleton "Detalhes da transação" (`CDhv3`); rodapé `mz2gp` — rótulo **trocado** para "Desistir da operação" (`research.md` D12) |
| Aprovado | frame `xWrzX` → modal `A9MNZI` | disco `$success-soft` com `check`; "Pagamento aprovado" / "Transação concluída com sucesso"; "Valor pago"; linhas NSU / Autorização / Bandeira (`I0iWy`, `HGR9S`, `ean78`); botão "Fechar" `xpon7` em `$success` |
| Criando, erro de criação, estorno (todos os estados) | **sem nó** | reusam a moldura do modal TEF (cabeçalho, bloco de valor, rodapé) — mesma solução já aceita para os estados sem nó do `ModalPix`; registrado como item 66 de `PENDENCIES.md` (seção 4), caso o usuário queira desenhá-los |

## Complexity Tracking

> Nenhuma violação de Constitution Check — seção não preenchida.
