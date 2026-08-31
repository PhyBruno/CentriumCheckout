# Implementation Plan: Pagamento — PIX

**Branch**: `009-pagamento-pix` | **Date**: 2026-08-27 | **Spec**: `specs/009-pagamento-pix/spec.md`

**Input**: Feature specification from `specs/009-pagamento-pix/spec.md`, complementada pela especificação de domínio mais detalhada em `.specs/features/pagamento-pix/spec.md` (`PAY-03`, `PAY-04`, `PAY-11`), pelo contrato real `Fluxograma - Diagrama - Alinhamentos/APICentriumOAuth.yaml`, pelo contrato de domínio já publicado pela feature 008 (`specs/008-pagamento-geral/contracts/pagamento-domain-api.md`) e pelas decisões arquiteturais em `.specs/project/STATE.md` (AD-019, AD-022, AD-023, AD-026, AD-040, AD-047, AD-074, AD-079, AD-081, AD-087, AD-097, e o novo **AD-100** aberto por esta fase de Design).

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

A feature 009 implementa exclusivamente o que acontece **depois** que a feature 008 já decidiu, via `resolverIntegracao`, que uma forma de pagamento é `PIX_DINAMICO` (`research.md`, D1) — gerar a cobrança (`POST GerarPIX`), exibir QR Code e "copia e cola", consultar ativamente o status a cada 10 segundos (`GET StatusPIX`, sem SSE, AD-012/AD-026) e devolver aprovação/recusa ao slice de pagamento via `confirmarPagamentoIntegrado`/`recusarPagamentoIntegrado` — as mesmas duas actions já expostas pelo contrato da feature 008, sem que esta feature acrescente estado novo ao `vendaStore`.

O maior achado desta fase foi a semântica real de `StatusPIXOutput.StatusTransacao`: um campo `VARCHAR(1)` sem documentação prévia em `.specs/`, com dez literais possíveis (`'C'` Criada, `'A'` Aberta, `'G'` Aguardando Pagamento, `'P'` Pagamento Recebido, `'M'` Pagamento Liberado Manualmente, `'X'` Expirada, `'R'` Recusada, `'E'` Erro, `'F'` Fechada, `'O'` Removido Associação PIX) — os três primeiros (pendente), `'P'`/`'M'` (aprovado, ambos) e os cinco últimos (falha terminal) confirmados diretamente pelo usuário nesta sessão (**AD-102**, fecha o item 33 de `PENDENCIES.md`, corrigindo uma leitura inicial via KB GeneXus que tinha alta confiança só nos nomes de cinco estados, não nos literais). Esse achado também revelou um comportamento de produto que a spec original não cobria explicitamente: a CentriumPag/ERP pode reportar uma falha terminal (ou uma desassociação feita fora do Checkout, `'O'`) sem que o operador tenha fechado o modal manualmente — este design resolve isso reaproveitando exatamente o mesmo caminho de UX já decidido para o fechamento manual (AD-040): aviso, remoção do pagamento local, nenhuma chamada de cancelamento, nunca um segundo mecanismo de estado. O segundo achado foi que `SDTCentriumPag_Post` é um SDT genérico compartilhado com boleto/duplicata — só um subconjunto pequeno de campos é relevante para PIX, com os dados do pagador resolvidos por decisão direta do usuário nesta sessão (cliente identificado, ou o cliente default da venda — **AD-100**).

## Technical Context

**Language/Version**: TypeScript `strict`, React 19 + Vite — feature inteiramente client-side. O BFF (feature 002) participa só como proxy autenticado em `/api/erp/GerarPIX`/`/api/erp/StatusPIX`; nenhuma rota nova de servidor é introduzida.

**Primary Dependencies**: TanStack Query (`useStatusPix` com `refetchInterval` condicional de 10s, `research.md` D9 — mesma lib já usada pelo catálogo de pagamento da feature 008 e pelo polling análogo de `GetStatusSistema`, AD-075/AD-080); Zod (validação de fronteira de `GerarPIXOutput`/`StatusPIXOutput`); shadcn/ui + Boneyard (modal PIX, QR Code, botão copiar) + Goey Toast (bloqueio de valor mínimo, erro de geração, aviso de desassociação manual). **Nenhum estado novo no Zustand do `vendaStore`** — o único estado de pagamento persistente continua sendo `PagamentoAplicado` (008); a cobrança PIX em si é estado efêmero de UI, descartado ao fechar o modal.

**Storage**: N/A — nenhum dado desta feature sobrevive além do modal PIX aberto (Constitution VI). `MinimoPix`/`UtilizaCentriumPAG` são lidos do mesmo cache em memória do TanStack Query sobre o bootstrap (feature 002), nunca uma query própria.

**Testing**: Vitest + Testing Library. Unitários puros (sem React) para: `interpretarStatusPix` (10 literais confirmados, AD-102, + `default` desconhecido, `data-model.md` J2), `validarValorMinimoPix`, `montarDadosPagador` (cliente identificado × default × `null`). Integração para a máquina de estados do modal (`data-model.md` §4): geração → polling → aprovação; geração → polling → falha terminal; geração → fechamento manual; geração → erro de rede → retry com novo `TrnGUID`. Teste negativo explícito de que nenhuma chamada de cancelamento é feita em qualquer caminho de abandono (`data-model.md` J5, mesmo padrão do teste negativo de impressão da feature 008). Playwright para o fluxo dourado de `quickstart.md`.

**Target Platform**: Navegador (Chrome prioritário), desktop e mobile — PIX é uma das únicas duas integrações que **permanecem** disponíveis no mobile (AD-074; a outra é nenhuma, já que TEF é excluído). Nenhuma ramificação de código por plataforma dentro desta feature.

**Performance Goals**: Polling fixo de 10s, sem backoff (AD-026, decisão deliberada) — nenhuma meta de performance além de garantir que o `refetchInterval` para de fato quando o modal fecha ou o status resolve (`data-model.md` J3), para não deixar requests órfãos.

**Constraints**:
- Nenhuma chamada de cancelamento de PIX é feita em nenhum cenário — não existe esse endpoint no contrato (`research.md` D11).
- `TrnValor` é sempre o saldo residual (`Centavos`), nunca o subtotal cheio (`research.md` D6).
- `TrnGUID` é gerado no cliente e nunca reaproveitado entre tentativas (`data-model.md` J4).
- `TrnTempoExpiracaoPIX` e os campos de boleto/duplicata do SDT genérico nunca são enviados (`research.md` D4/D4-bis, AD-047).
- Um valor desconhecido de `StatusTransacao` nunca é interpretado como aprovado (`data-model.md` J2, Constitution IV).
- `TrnPagadorEmail`/`TrnPagadorFone` são sempre enviados vazios nesta versão — gap de escopo aceito, não uma pendência de ERP (`research.md` D7).

**Scale/Scope**: 1 módulo de domínio puro (`interpretarStatusPix`, `validarValorMinimoPix`, `montarDadosPagador`) + 1 camada de query (`useGerarPix`, `useStatusPix`) + 1 schema Zod de fronteira (`pix.schema.ts`) + 1 superfície de UI (`ModalPix`, com QR Code, copia-e-cola, badge de status). Fora do escopo: a decisão de roteamento (feature 008, já resolvida), o TEF (feature 010), o envio de `FaturarNFCe` (feature 004) e a adaptação de layout mobile em si (feature 007 — esta feature só é renderizada dentro do container responsivo já definido por 007).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Avaliação (pré-Phase 0) | Re-avaliação (pós-Phase 1) |
|---|---|---|
| I. Spec-Driven Development | ✅ Este plano é resultado de `/speckit-plan` sobre `specs/009-pagamento-pix/spec.md`, seguindo a sequência obrigatória. | ✅ Mantido — todo artefato rastreia a um `FR-xxx`/`PAY-0x`; os achados desta fase viraram AD-100 (dados do pagador) e AD-102 (os dez literais reais de `StatusTransacao`, fechando o item 33 de `PENDENCIES.md`), nenhuma decisão implícita no código. |
| II. Arquitetura SOLID | ✅ Planejado com domínio puro (`interpretarStatusPix` etc.) ↔ query (rede) ↔ UI (`ModalPix`), sem tocar o slice de pagamento diretamente. | ✅ Confirmado em `contracts/pix-domain-api.md`: `ModalPix` recebe `onAprovado`/`onAbandonado` por prop, não importa `vendaStore`; `interpretarStatusPix` não conhece TanStack Query nem React. Uma futura mudança de significado de `StatusTransacao` altera só um `switch` em um arquivo (Open/Closed). |
| III. ERP como Fonte Única de Verdade | ✅ O Checkout nunca decide localmente se um PIX foi pago — só interpreta o que `StatusPIX` devolve. | ✅ Confirmado, e reforçado pelo achado de que `StatusPIX` já delega a CentriumPag via `PTransacao_CentriumPag_GetStatusPAG` quando o status está no estado inicial — o Checkout nunca simula/infere aprovação, só espelha o que o ERP relata. |
| IV. Tipagem Estrita e Validação de Fronteira | ✅ Zod obrigatório em `GerarPIXOutput`/`StatusPIXOutput`. | ✅ Confirmado: `StatusTransacao` agora é validado com os dez literais reais confirmados por AD-102 (`data-model.md` §2), mas a fronteira Zod aceita qualquer `string` e é `interpretarStatusPix` quem tem o ramo `default` explícito para um valor fora dos dez — é o compilador + o teste J2 que impedem um valor novo (ex.: um literal futuro do ERP) de ser lido como sucesso, sem quebrar a tela. |
| V. Precisão Monetária Inegociável | ✅ `TrnValor` é `Centavos → double` só na fronteira de saída; nenhum cálculo novo de dinheiro nesta feature (reusa `saldoRestante` já calculado pela 008). | ✅ Confirmado — esta feature não introduz nenhum algoritmo monetário próprio; `data-model.md` J6 é só uma restrição de uso, não um cálculo novo. |
| VI. Sem Estado de Venda Persistido no Cliente | ✅ `CobrancaPix` é estado efêmero de UI, descartado ao fechar o modal; o único estado duradouro é `PagamentoAplicado`, já coberto pela feature 008. | ✅ Confirmado — nenhum artefato de design grava em Dexie/localStorage; `data-model.md` §1 é explícito que `CobrancaPix` não é `vendaStore`. |

Nenhuma violação identificada em nenhuma das duas avaliações. Nenhuma entrada necessária em "Complexity Tracking".

## Project Structure

### Documentation (this feature)

```text
specs/009-pagamento-pix/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output — D1..D15, origem de AD-100 e AD-102 (fecha o item 33)
├── data-model.md        # Phase 1 output — CobrancaPix, ResultadoStatusPix, máquina de estados
├── quickstart.md        # Phase 1 output — 8 cenários de validação + fluxo dourado
├── contracts/           # Phase 1 output
│   ├── erp-pix-api.md          # GerarPIX, StatusPIX
│   └── pix-domain-api.md       # domínio puro + camada de query + ModalPix
├── checklists/
│   └── requirements.md  # gerado por /speckit-specify
└── tasks.md              # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── client/
│   ├── domain/
│   │   └── pix/                              # camada pura — sem React, TanStack Query ou fetch
│   │       ├── interpretarStatusPix.ts       # 10 literais (AD-102) + default desconhecido (data-model.md §2)
│   │       ├── validarValorMinimoPix.ts      # research.md D13
│   │       └── montarDadosPagador.ts         # research.md D7, AD-100
│   ├── services/
│   │   └── pix/
│   │       ├── pixQueries.ts                 # useGerarPix, useStatusPix (refetchInterval 10s)
│   │       └── pixMapper.ts                  # GerarPIXOutput/StatusPIXOutput validado → domínio
│   └── features/
│       └── pagamento/
│           └── pix/
│               └── ModalPix.tsx              # QR Code, copia-e-cola, badge de status, FR-001..FR-011
└── shared/
    └── schemas/
        └── pix.schema.ts                      # Zod: GerarPIXOutput, StatusPIXOutput

tests/
├── unit/
│   └── domain/
│       └── pix/
│           ├── interpretarStatusPix.spec.ts  # 10 literais (AD-102) + valor desconhecido (J2)
│           ├── validarValorMinimoPix.spec.ts
│           └── montarDadosPagador.spec.ts    # identificado × default × null
├── integration/
│   └── ModalPix.spec.tsx                     # máquina de estados completa (data-model.md §4)
└── e2e/
    └── pagamento-pix.spec.ts                 # fluxo dourado de quickstart.md
```

**Structure Decision**: Quinta feature a estender a árvore proposta pela feature 002, mantendo as mesmas duas decisões já consolidadas pelas features 001/003/008: (a) módulos de domínio puro sob `src/client/domain/<assunto>/`; (b) nenhum slice novo no `vendaStore` quando o estado é efêmero e local a um componente — diferente de 008, que introduziu `pagamentoSlice` porque `PagamentoAplicado` precisa sobreviver ao fechamento de qualquer modal. `ModalPix.tsx` fica sob `features/pagamento/pix/`, não em `features/pix/` na raiz, porque é estritamente uma sub-superfície da tela de pagamento (008), nunca navegável isoladamente. Não adiciona nada a `src/server/` — consome `/api/erp/GerarPIX`/`/api/erp/StatusPIX` já cobertos pelo proxy genérico da feature 002.

## Complexity Tracking

> Nenhuma violação de Constitution Check identificada nesta fase — seção não preenchida.

## Emenda de 2026-08-31 — validação prévia da venda (feature 014)

**Nenhuma mudança de mecanismo nesta feature.** O registro existe para que a ordem fique explícita e ninguém a reintroduza ao contrário:

1. `GerarPIX` só é alcançado **depois** de a feature 014 ter dado veredito favorável para a inserção da forma PIX (`FR-012` de `spec.md`). O gate mora em `aplicarPagamento` (feature 008), que é quem dispara o roteamento ao qual esta feature reage — logo, nenhuma cobrança PIX nasce numa venda que o ERP recusou, sem que esta feature precise conhecer o gate.
2. Isso vale igualmente quando a forma PIX entra por atalho de venda rápida (feature 013), que usa o mesmo caminho.
3. O cenário 6 de `specs/014-validacao-previa-nfce/quickstart.md` é o teste que prova essa ordem: venda recusada ⇒ nenhum QR Code, nenhum código "copia e cola", nenhum registro no adquirente.
