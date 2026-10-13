# Implementation Plan: Motor de desconto do Checkout (capa e item)

**Branch**: `feat/motor-desconto` | **Date**: 2026-10-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/017-motor-desconto/spec.md`

## Summary

A feature troca o desconto solto por um motor com regras explícitas, em duas frentes que compartilham um princípio: **o desconto passa a ter um limite e um dono**.

**Item.** Preço e desconto viram a mesma informação vista de dois lados, e o preço mínimo do produto limita o desconto. O desenho central é **não criar campo novo na linha**: `precoUnitario` guarda a referência de tabela e `descontoManual` guarda o desconto, como hoje; o preço que o operador vê é derivado. Assim o ERP continua recebendo o desconto explícito. A lógica sai do componente de 1964 linhas para um módulo puro (`descontoItem.ts`) e um hook (`useVinculoPrecoDesconto`). A edição pelo lápis passa a ser **atômica** (`atualizarItem`), porque o ajuste automático tornaria a sequência atual de três `editarItem` incorreta.

**Capa.** A condição de pagamento passa a preencher a capa e a limitá-la. O teto é **ajuste, não recusa** — o campo grava a cada tecla (AD-278), e "recusar e voltar" restauraria um valor que o operador nunca escolheu. A capa vai ao ERP como valor único em `CheckoutFaturarNFCe.DescontoCapaValor`, atrás de uma chave do BFF (`DESCONTO_CAPA_NO_ERP`, padrão desligada = comportamento atual byte a byte). A chave chega ao cliente pelo **bootstrap** — único canal BFF→SPA existente, cujo ETag já invalida o cache sozinho.

Três decisões da pesquisa corrigiram ou refinaram a spec e estão em [research.md](./research.md): **D4** (mestre na barra, para o arredondamento não virar laço), **D5** (edição atômica) e **D8** (teto como ajuste — a spec foi reescrita no ponto).

## Technical Context

**Language/Version**: TypeScript 5.x `strict`, React 19, Node (BFF Fastify)

**Primary Dependencies**: Zustand 5 + Immer, TanStack Query, Zod 4, Vitest + Testing Library, Playwright. **Nenhuma dependência nova.**

**Storage**: N/A — nenhum estado persistido novo. `recursos` entra no registro do bootstrap que o Dexie já guarda (cache de leitura). O Dexie **não** reparseia o registro ao ler; quem impede um registro anterior ao campo de ser reaproveitado é o ETag, que cobre `recursos` e muda junto com ele (ver `research.md` D11).

**Testing**: Vitest (unitário de domínio, integração de slice, componente) + Playwright E2E contra o `erp-mock`. Domínio monetário com teste de propriedade (soma exata, ida-e-volta preço↔desconto dentro de 1 centavo por unidade).

**Target Platform**: Navegador do PDV (desktop e tela de toque) + BFF em contêiner.

**Project Type**: SPA React com BFF mínimo de sessão (sem backend de domínio).

**Performance Goals**: recálculo de preço/desconto a cada tecla sem latência perceptível — é aritmética inteira local, sem rede. Nenhuma chamada nova ao ERP.

**Constraints**:
- Aritmética monetária **somente inteira** (Constitution V); `aplicarPercentual` é o único ponto de ponto flutuante, já existente e tratado.
- Com a chave desligada o corpo de `FaturarNFCe` é **idêntico** ao anterior (SC-007).
- Retrato validado (014) e retrato emitido recebem a **mesma** capa (I5): um único produtor, `montarPagamentosParaPayload`.
- Mobile: o campo de preço/desconto reescrito por código só recebe a seleção total (`selecionarConteudoAoFocar`) se estiver habilitado.

**Scale/Scope**: ~14 arquivos de produção alterados e 2 criados (`descontoItem.ts`, `useVinculoPrecoDesconto.ts`); 1 evento de auditoria novo; ~12 arquivos de teste reescritos e 5 criados (`descontoItem.spec.ts`, `useVinculoPrecoDesconto.spec.tsx`, `env.spec.ts`, `bootstrapRecursos.spec.ts`, mais o que `tasks.md` acrescentar).

## Constitution Check

*GATE: avaliado antes da Phase 0 e reavaliado após a Phase 1.*

| Princípio | Veredito | Justificativa |
|---|---|---|
| **I. Spec-Driven Development** | ✅ Passa | `/speckit-specify` → este plano → `/speckit-tasks` → `/speckit-implement`. Nenhum código escrito. |
| **II. Arquitetura SOLID** | ✅ Passa | O desenho existe *por causa* de SRP: a barra (1964 linhas) perde a regra de vínculo para `useVinculoPrecoDesconto`; a regra aritmética vive em `descontoItem.ts`, sem React. A capa mantém a separação slice (decide) / UI (mostra). `DescontoCapaNoRetrato` é aberta para extensão (novo modo = novo ramo) sem alterar quem a repassa. |
| **III. ERP como fonte única de verdade** | ✅ Passa | O preço mínimo, o desconto e o teto **vêm do ERP**; o Checkout só os aplica. O rateio da capa **sai** do Checkout (era reimplementação de regra do ERP) e volta ao ERP — o desenho **reforça** o princípio. O BFF **não** ganha lógica: só devolve um booleano de configuração (D11). |
| **IV. Tipagem estrita e validação de fronteira** | ✅ Passa | `PrecoMinimo` entra por Zod na fronteira (corrige o T004 da 003, que nunca foi cumprido). `recursos` tem schema com `default`. `DescontoCapaNoRetrato` é união discriminada, sem `any`/`as`. |
| **V. Precisão monetária** | ✅ Passa | É o princípio central. `dividirPorQuantidade` é inteira; limite comparado em totais, nunca por unidade; capa comparada em centavos, nunca em percentuais. Todo cálculo novo tem teste antes de concluído. |
| **VI. Sem estado de venda persistido** | ✅ Passa | Nenhum estado novo persistido. A chave é configuração de ambiente, não estado de venda. |
| **Branch por alteração** | ✅ Passa | `feat/motor-desconto` a partir de `origin/master`; PR obrigatório. |
| **Gates antes de push/merge** | ⏳ Pendente | `npx tsc --noEmit` antes de qualquer push; `/owasp-security` antes do merge a `master`. |

**Resultado (pré-Phase 0)**: nenhuma violação.

**Reavaliação pós-Phase 1**: mantida sem violação. A pesquisa **tensionou** um ponto que merece registro: a "recusa" da spec original para o teto da capa colidia com o invariante de AD-278 (campo e store nunca divergem, gravação por tecla). A solução — ajustar em vez de recusar — não viola princípio algum e dispensa estado novo; a spec foi corrigida no próprio ponto.

## Project Structure

### Documentation (this feature)

```text
specs/017-motor-desconto/
├── plan.md              # Este arquivo
├── research.md          # Phase 0 — 14 decisões (D1–D14)
├── data-model.md        # Phase 1 — tipos alterados/novos, fórmulas, transições, invariantes I-D1..I-D7
├── quickstart.md        # Phase 1 — 4 roteiros de validação (Q1–Q4)
├── contracts/
│   └── motor-desconto-api.md   # Assinaturas dos módulos, ações de store, BFF→cliente, Checkout→ERP
├── checklists/
│   └── requirements.md  # Gate de qualidade da spec
└── tasks.md             # Phase 2 — NÃO criado por /speckit-plan
```

### Source Code (repository root)

```text
src/
├── shared/schemas/
│   ├── produto.schema.ts            # ALTERADO — declara PrecoMinimo (Zod, centavos)
│   └── bootstrap.schema.ts          # ALTERADO — recursos { descontoCapaNoErp } com default
├── server/
│   ├── config/env.ts                # ALTERADO — DESCONTO_CAPA_NO_ERP
│   └── routes/bootstrap.ts          # ALTERADO — devolve `recursos` (entra no hash do ETag)
└── client/
    ├── domain/
    │   ├── precificacao/
    │   │   ├── dinheiro.ts          # ALTERADO — exporta dividirPorQuantidade
    │   │   ├── linha.ts             # ALTERADO — SnapshotPrecoProduto.precoMinimo
    │   │   └── descontoItem.ts      # NOVO — vínculo preço↔desconto e limite do mínimo
    │   ├── pagamento/
    │   │   ├── descontoCapa.ts      # ALTERADO — origem, tetoDaCapa, resolverCapaComTeto, recusa nova
    │   │   └── formaPagamento.ts    # ALTERADO — TSDoc de desconto/descontoMaximo
    │   ├── venda/montarRetratoVenda.ts   # ALTERADO — DescontoCapaNoRetrato + DescontoCapaValor
    │   ├── importacaoVenda/mapearVendaExistente.ts  # ALTERADO — snapshot com precoMinimo 0
    │   └── auditoria/eventos.ts     # ALTERADO — DESCONTO_CAPA_APLICADO (20 → 21 tipos)
    ├── services/produto/produtoMapper.ts   # ALTERADO — mapeia PrecoMinimo
    ├── stores/
    │   ├── vendaStore.ts            # ALTERADO — porta descontoCapaNoErp; validacaoDeps.descontoCapa
    │   └── slices/
    │       ├── carrinhoSlice.ts     # ALTERADO — atualizarItem atômico + guarda do preço mínimo
    │       ├── pagamentoSlice.ts    # ALTERADO — selecionarCondicao grava capa; teto; evento; payload
    │       └── validacaoVendaSlice.ts   # ALTERADO — repassa DescontoCapaNoRetrato
    ├── features/
    │   ├── carrinho/
    │   │   ├── useVinculoPrecoDesconto.ts   # NOVO — estado preço/desconto da barra, com mestre
    │   │   ├── EntradaRapidaProduto.tsx     # ALTERADO — consome o hook (remove estado solto)
    │   │   └── useCarrinho.ts               # ALTERADO — confirmarEdicaoDeLinha usa atualizarItem
    │   ├── pagamento/ControleDescontoCapa.tsx   # ALTERADO — teto, bloqueio, texto ajustado
    │   └── finalizacao-suspensao/useFinalizarOuSuspenderVenda.ts   # ALTERADO — repasse
    └── lib/                         # (sem mudança; reusa notificar.ts e bloqueio.ts)

tests/
├── unit/domain/precificacao/descontoItem.spec.ts        # NOVO
├── unit/domain/pagamento/descontoCapa.spec.ts           # ALTERADO — teto, origem, recusa nova
├── unit/client/carrinho/useVinculoPrecoDesconto.spec.tsx  # NOVO
├── unit/client/carrinho/EntradaRapidaProduto.spec.tsx   # ALTERADO — independência deixa de valer; preenche a lacuna do descontoZeraItem
├── unit/client/pagamento/ControleDescontoCapa.spec.tsx  # ALTERADO
├── unit/server/                                         # NOVO caso — env e bootstrap com `recursos`
├── integration/{carrinhoSlice,pagamentoSlice}.spec.ts   # ALTERADO — atualizarItem; condição muda a capa
├── e2e/{carrinho-precificacao,pagamento-geral}.spec.ts  # ALTERADO
├── e2e/support/erp-mock.ts                              # ALTERADO — condições A/B/C; aceita DescontoCapaValor
└── support/{precificacao,pagamento}.ts                  # ALTERADO — fixtures com precoMinimo e origem

.env.example, docker-compose.yml, deploy/beta/docker-stack.yml   # ALTERADO — DESCONTO_CAPA_NO_ERP
```

**Structure Decision**: SPA única com BFF mínimo, estrutura já vigente. Nenhum diretório novo. Os dois módulos novos ficam ao lado dos que complementam (`descontoItem.ts` em `domain/precificacao/`, o hook em `features/carrinho/`). A mudança de contrato do ERP **não** toca o proxy (`erp-proxy.ts` repassa o que não reescreve).

## Documentos que a implementação reescreve (no ponto, sem anexar)

| Documento | O que muda |
|---|---|
| `.specs/project/STATE.md` | **AD-279** (nova); AD-098 e AD-151 sinalizados onde o rateio local deixa de valer com a chave ligada |
| `specs/003-carrinho-produto-precificacao/spec.md` e `data-model.md` | FR-014/FR-015 e invariantes I8/I9: desconto deixa de ser independente do preço |
| `specs/008-pagamento-geral/spec.md`, `data-model.md` (linhas 21-22), `contracts/erp-pagamento-api.md` | FR-014/FR-015 "sem teto"; condição passa a limitar a capa; `DescontoCapaValor` |
| `specs/001-auditoria-acoes-operador/contracts/auditoria-events.md` | catálogo de 20 para 21 eventos |
| `.specs/project/PENDENCIES.md` | nome/tipo do campo no ERP; cadastro de tetos |
| `docs/wiki/` | capítulos de desconto e de solução de problemas |

## Riscos e pontos em aberto

| Risco | Tratamento |
|---|---|
| **ERP sem o campo ao ligar a chave**: o desconto some da nota | Chave nasce desligada; ordem de virada na spec; a validação prévia (014) usa o mesmo retrato |
| **Teto zero trava a capa** na maioria das condições (mock e ERP trazem `0`) | Cadastro de tetos é dependência explícita antes da virada. Alternativa de uma linha em `tetoDaCapa` se a operação reclamar (`0 = sem teto`) |
| **Condição importada de DAV com teto zero** bloqueia a capa digitada depois (AD-171: ela não congela o carrinho, mas o teto vale) | Aceito; anotar em `PENDENCIES.md` e validar com o piloto |
| **`entrada` com mais de 1 casa** na capa automática (ex.: 3,25%) | O campo exibe a entrada inteira e só rejeita casas extras na **digitação** (D9) |
| **Fixtures de teste com `precoMinimo` e `origem` obrigatórios** quebram `tsc` em massa | Esperado e desejado (o compilador aponta cada uma); `tasks.md` terá uma tarefa de varredura de fixtures **antes** das de comportamento |
| **Divisão não exata** (desconto ÷ qtd) | Desconto total é a verdade; mestre explícito na barra impede o laço (D4); teste de propriedade |
| **Dois avisos para uma ocorrência** (barra + slice) | A barra ajusta antes; o slice só fala se ainda precisar (D7); teste que conta chamadas de `notificar.aviso` |
| **`ZERA_UM_ITEM` some com a chave ligada**: o ERP pode ratear e deixar item abaixo de R$ 0,01 | Aceito (D13); a rede é o `ValidarNFCe` antes do pagamento |
| **Preço mínimo e teto só no cliente**: o corpo de `FaturarNFCe` é editável no navegador, e a Constitution III põe o ERP como fonte de verdade | Fora do escopo desta feature; registrado em `PENDENCIES.md` como pendência com o ERP (reconferir no `ValidarNFCe`). Não bloqueia |
| **Auditoria da capa some a partir da 2ª venda** se a deduplicação guardar estado fora do store (a venda reinicia, a closure não) | A dedup deriva do **último `DESCONTO_CAPA_APLICADO` em `eventos`**, que é zerado por venda (D10) |
| **1ª carga pós-implantação rebaixa ~5 MB por empresa**: `recursos` muda o hash do bootstrap de todos os tenants de uma vez | Esperado e único (AD-045/FR-008); entra na ordem de virada da spec |

## Complexity Tracking

Sem violações da Constitution a justificar. Dois pontos de **complexidade deliberada**, ambos pagos por um defeito concreto, não por generalidade:

| Complexidade | Por que é necessária | Alternativa mais simples rejeitada porque |
|---|---|---|
| Campo mestre (`PRECO`/`DESCONTO`) na barra | Sem ele o arredondamento de `desconto ÷ quantidade` reescreve o desconto digitado ao sair do campo de preço (R$ 1,00 → R$ 0,99 com 3 unidades) | Recalcular sempre pelo preço perde dinheiro sem aviso |
| `atualizarItem` atômico ao lado de `editarItem` | Três `editarItem` seguidos deixam a linha num estado que o operador nunca digitou, e com ajuste automático o defeito se agrava | Manter as três chamadas torna o ajuste do preço mínimo dependente da ordem em que a barra as dispara |
