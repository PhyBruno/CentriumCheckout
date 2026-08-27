# Phase 0 — Research: Finalização e Suspensão da Venda

**Feature**: `specs/004-finalizacao-suspensao-venda/` | **Date**: 2026-08-26

Este documento resolve as incógnitas técnicas do Technical Context de `plan.md`. Como em `specs/003-carrinho-produto-precificacao/research.md`, a maior parte do espaço de decisão de **negócio** já estava fechada em `.specs/project/STATE.md` (AD-006 a AD-089) e em `.specs/features/finalizacao-suspensao-venda/spec.md` — a tabela de Requirement Traceability daquela spec registra 12 de 12 requisitos `Verified`, 0 pendências abertas. As decisões abaixo são majoritariamente de **arquitetura de código** (onde cada responsabilidade vive, como os módulos se compõem) — a natureza de cada uma está sinalizada:

- **Confirmação** — a decisão de negócio já existia; aqui só se registra como ela se materializa em código.
- **Nova** — decisão de design tomada nesta fase, porque nem a spec nem `.specs/` a determinavam.

---

## D1 — Novo slice `identidadeVenda` para resolver `NumeroNota` (0 vs. preenchido)

**Natureza**: Nova.

**Decision**: A distinção "venda nova" vs. "venda retomada de rascunho/DAV" (`FR-003`) passa a viver num slice dedicado, `identidadeVendaSlice`, combinado no `vendaStore` ao lado de `carrinho` (003) e `auditoria` (001):

```ts
interface IdentidadeVenda {
  origem: 'NOVA' | 'RASCUNHO' | 'DAV';
  numeroNota: number; // 0 = venda nova, nunca faturada; != 0 = rascunho/DAV pré-existente (AD-023)
}
```

`origem`/`numeroNota` são setados uma única vez, no mesmo call site que já zera o slice `auditoria` via `resetarAuditoria(origem)` (contrato de `specs/001-auditoria-acoes-operador/contracts/auditoria-events.md`) — ou seja, o início/retomada de uma sessão de venda passa a tocar dois slices no mesmo ponto de código, nunca um sem o outro.

**Rationale**: Nenhuma feature já planejada (001, 002, 003) possui hoje um lugar natural para "qual é a identidade desta venda no ERP". `auditoria` só guarda o **enum** `origem` (para o evento `VENDA_INICIADA`), não o `numeroNota` — que só importa para esta feature, no momento de montar o payload de `FaturarNFCe`. Criar o campo aqui, e não em `carrinho`, respeita Single Responsibility: `carrinho` são as linhas da venda, `identidadeVenda` é "quem" essa venda é para o ERP — conceitos que mudam por razões diferentes (o carrinho muda a cada item; a identidade só muda ao carregar um rascunho/DAV).

**Impacto em features futuras**: as features 006 (importação de DAV) e 011 (recuperação de NFCe) passam a ter uma responsabilidade nova e explícita — chamar o setter deste slice ao carregar uma venda existente, análogo ao que já fazem hoje (implicitamente) para popular o carrinho. Este plano não implementa esses call sites, só o slice que eles vão consumir.

**Alternatives considered**:
- *Guardar `numeroNota` dentro do slice `carrinho`*: rejeitado — misturaria "identidade da venda no ERP" com "itens da venda", duas responsabilidades com ciclos de mudança diferentes (Constitution II).
- *Inferir `origem`/`numeroNota` a partir do array de eventos de auditoria (procurar o último `VENDA_INICIADA`)*: rejeitado — acoplaria a lógica de negócio de finalização a um mecanismo de auditoria que é, por design (AD-061), só um log opaco para o ERP, não uma fonte de verdade a ser lida de volta pelo próprio Checkout.

---

## D2 — Falha de rede vs. falha de negócio: dois estados de erro distintos

**Natureza**: Confirmação (AD-038) quanto à regra de negócio; Nova quanto ao mecanismo técnico de distinção.

**Decision**: A mutation de `FaturarNFCe` distingue dois tipos de falha por sua origem, não por conteúdo de mensagem:

| Tipo | Como é detectado | Comportamento |
|---|---|---|
| Falha de rede (sem resposta) | O `fetch` rejeita antes de produzir uma resposta HTTP (erro de rede/timeout do BFF ao proxiar, ou do proxy ao ERP) | Estado `falha-rede` — bloqueia novo envio até o operador confirmar explicitamente que uma tentativa anterior não teve retorno (`FR-004`, AD-038) |
| Falha de negócio (o ERP respondeu com erro) | A chamada retorna uma resposta HTTP, ainda que de erro (ex.: validação do ERP) | Estado `falha-negocio` — exibe o erro, permite reenvio livre assim que o operador corrigir o problema, sem exigir confirmação extra |

**Rationale**: AD-038 fala especificamente de "problema de conectividade (sem resposta recebida)" como o risco a mitigar — reenviar sem saber se o ERP já processou a primeira tentativa é o que arrisca duplicar a NFCe. Uma resposta de erro do ERP já prova que a primeira tentativa **não** gerou NFCe (o ERP respondeu recusando), então não há risco de duplicidade nesse caso — travar o reenvio ali seria fricção desnecessária, não uma proteção real.

**Alternatives considered**:
- *Tratar toda falha (rede ou negócio) com a mesma trava de confirmação manual*: rejeitado — superdimensiona a mitigação de AD-038 para um caso (erro de negócio) que ela não visava, degradando a experiência do operador sem ganho de segurança.

---

## D3 — Orquestração de envio + limpeza vive num hook, não num slice nem no domínio puro

**Natureza**: Nova.

**Decision**: `useFinalizarOuSuspenderVenda.ts` é a única peça que (a) lê `carrinho`/`auditoria`/`identidadeVenda` do `vendaStore`, (b) monta o payload via `montarPayloadFaturarNFCe` (domínio puro), (c) dispara a mutation, (d) em sucesso, chama em sequência a limpeza de carrinho, cache de produto, auditoria e identidade da venda, e decide o mecanismo de impressão. O estado "aguardando confirmação de reenvio" (`falha-rede`) vive como estado local do hook (`useState`/`useReducer`), não como um novo slice global.

**Rationale**: Nenhuma outra parte da aplicação precisa saber que uma tentativa de `FaturarNFCe` está pendente de confirmação — é um detalhe efêmero da tela de finalização/suspensão, mesma categoria de "Estado de UI efêmero" que `.specs/codebase/ARCHITECTURE.md` já reserva para "Zustand sem `persist`, ou estado local de componente". Colocar essa orquestração num slice Zustand geraria uma dependência circular de fato: o slice precisaria conhecer `carrinho`, `auditoria` e `identidadeVenda` para limpá-los, e o domínio puro não pode depender de rede/Zustand (Constitution II) — um hook React é o único lugar onde compor os três sem violar nenhuma das duas regras.

**Alternatives considered**:
- *Um novo slice `finalizacaoSlice` com toda a orquestração*: rejeitado — o slice passaria a depender de outros slices para poder resetá-los, um acoplamento que os slices existentes (`carrinho`, `auditoria`) não têm entre si hoje; violaria Interface Segregation (o slice exporia bem mais do que "estado da tentativa de envio").
- *Colocar a orquestração dentro de `montarPayloadFaturarNFCe`*: rejeitado — misturaria "calcular o payload" (puro, testável sem React) com "efeitos colaterais de rede e limpeza de estado" (Single Responsibility).

---

## D4 — Serviço de impressão local: chamada direta do navegador, fora do proxy do BFF

**Natureza**: Confirmação (AD-083) quanto ao protocolo; Nova quanto à decisão arquitetural de não usar `/api/erp/*`.

**Decision**: `imprimirNFCeLocal.ts` chama `POST http://{CadMaqHost}` diretamente do navegador — **não** passa pelo proxy `/api/erp/*` do BFF (feature 002). O proxy existe para injetar `Authorization`/`Empresa` nas chamadas ao ERP; o serviço de impressão local não tem autenticação (AD-083) e não é o ERP — é uma máquina na rede local do próprio PDV, à qual o BFF (rodando em container Docker, potencialmente numa rede diferente da do PDV) não tem necessariamente acesso de rede.

**Rationale**: Fazer essa chamada passar pelo BFF exigiria que o servidor do Checkout estivesse na mesma rede local que o PDV — quebra a premissa de que TEF e impressão são integrações que rodam "fora do container, na máquina do PDV" (Constitution VI, AD-006 em `ARCHITECTURE.md`). É o navegador do operador, rodando na mesma máquina/rede do PDV, que tem acesso direto a `CadMaqHost`.

**Consequência**: esta é a única chamada de rede desta feature sujeita às restrições de Local Network Access e Mixed Content do Chrome documentadas em `.specs/codebase/INTEGRATIONS.md` — ver D5.

**Alternatives considered**:
- *Proxiar via BFF*: rejeitado pelo motivo acima — pressupõe uma topologia de rede que a arquitetura já decidida não garante.

---

## D5 — Falha de impressão direta: distinguir "serviço indisponível" de "navegador bloqueou a chamada"

**Natureza**: Nova — a spec e `.specs/features/finalizacao-suspensao-venda/spec.md` descrevem o fallback ("perguntar se quer PDF") mas não distinguem a causa técnica da falha; `.specs/codebase/INTEGRATIONS.md` já pede essa distinção para as integrações locais em geral.

**Decision**: `imprimirNFCeLocal.ts` captura o erro do `fetch` e classifica em duas categorias antes de acionar o fallback (que, nos dois casos, oferece o PDF — `FR-009` não muda):
- **Erro de rede/conexão recusada** (porta fechada, serviço não está rodando) → mensagem genérica "não foi possível imprimir diretamente" (comportamento já descrito em `FIN-10`).
- **Bloqueio do navegador** (Local Network Access negado, Mixed Content bloqueado — identificável por `TypeError` específico do Chrome antes mesmo da tentativa de conexão) → mensagem apontando para configuração de navegador/política de TI, não "erro de conexão", seguindo a divisão de responsabilidade já registrada em `.specs/codebase/INTEGRATIONS.md` ("a responsabilidade do CheckoutWEB é... detectar e exibir mensagem de erro clara e acionável quando o navegador bloquear a chamada").

**Rationale**: As duas causas têm remediações completamente diferentes — a primeira é "o serviço de impressão da máquina não está rodando, verifique"; a segunda é "a política de TI não liberou este site para rede local", um problema de infraestrutura que o operador de caixa não pode resolver sozinho. Misturar as duas na mesma mensagem genérica contraria a divisão de responsabilidade já documentada.

**Alternatives considered**:
- *Uma única mensagem genérica de falha de impressão*: rejeitado — já era o comportamento mínimo aceitável de `FIN-10`, mas `INTEGRATIONS.md` pede explicitamente a distinção; não aproveitar essa orientação já registrada seria retrabalho futuro previsível.

---

## D6 — `GetStatusSistema`: escopo desta feature por posicionamento da spec, não por afinidade de domínio

**Natureza**: Confirmação (AD-088) quanto ao contrato/semântica; Nova quanto à decisão de manter o polling nesta feature em vez de mover para a feature 002.

**Decision**: O polling de `GetStatusSistema` (`FR-013`) é implementado nesta feature (`pollingStatusSistema.ts`), porque é onde `specs/004-finalizacao-suspensao-venda/spec.md` (gerada pela fase Specify) formalizou o requisito — não porque o assunto pertença tecnicamente à finalização/suspensão. Ao detectar mudança (`>= 1`), o módulo chama um `refetchBootstrap()` já exposto pela feature 002 (`src/client/services/bootstrapClient.ts`, ver `specs/002-autenticacao-sessao-bootstrap/plan.md`) — este plano não duplica a lógica de busca/gravação do bootstrap, só decide **quando** chamá-la.

**Rationale**: Mover o requisito para a feature 002 exigiria reabrir uma spec/plan já com Design concluído, fora do escopo de "seguir a spec formal como está" que rege esta fase. A guarda de "venda ativa" (carrinho com item OU cliente identificado) depende de estado das features 003/005, então o polling não poderia viver dentro do domínio puro de nenhuma delas de qualquer forma — um módulo de serviço próprio desta feature, lendo o `vendaStore` como dependência externa, é uma escolha neutra que não força acoplamento a nenhuma feature em particular.

**Alternatives considered**:
- *Implementar em `specs/002-autenticacao-sessao-bootstrap/`*: rejeitado nesta fase — reabriria um Design já concluído; pode ser revisitado numa futura reconciliação entre specs se a equipe achar o posicionamento estranho, mas não é decisão a tomar unilateralmente durante o Design de 004.

---

## D7 — Predicado de bloqueio de suspensão por pagamento: injeção de dependência, mesmo padrão de `CART-09`

**Natureza**: Confirmação (AD-030/AD-042) quanto à regra; Nova quanto ao mecanismo de composição de código.

**Decision**: `useFinalizarOuSuspenderVenda.ts` recebe (ou lê de um seletor combinado do `vendaStore`) um predicado `temPagamentoNaoRemovivel(): boolean`, com a mesma origem/semântica do predicado que a feature 003 já planejou injetar em `repricarSku`/`carrinhoSlice` para `CART-09` (`specs/003-carrinho-produto-precificacao/plan.md`, Constitution Check II). Suspender é bloqueado quando esse predicado é verdadeiro (TEF/PIX aprovado); finalizar nunca é bloqueado por esse motivo — finalizar com qualquer pagamento aprovado é o caminho normal e esperado.

**Rationale**: `FR-005`/`FR-006` (e `FIN-11`) reaproveitam explicitamente a regra de `CART-09` ("mesma lógica de bloqueio permanente de `CART-09`") — reimplementar o predicado nesta feature duplicaria a fonte de verdade sobre o que é um pagamento removível, violando Constitution II (Open/Closed: uma nova forma de pagamento removível teria que ser ensinada em dois lugares).

**Alternatives considered**:
- *Cada feature (003, 004, 012) reimplementa sua própria checagem de "pagamento aprovado bloqueia X"*: rejeitado — é exatamente a duplicação que a injeção de dependência evita; a feature de pagamento (008) é quem deve ser dona única desse predicado.

---

## Achados a promover

Nenhum achado novo de **contrato de API** surgiu nesta fase — `.specs/features/finalizacao-suspensao-venda/spec.md` já cobre os três endpoints envolvidos (`FaturarNFCe`, o serviço de impressão local, `GetStatusSistema`) com 0 pendências abertas. As decisões D1–D7 acima são inteiramente de arquitetura de código deste plano, não de descoberta de comportamento do ERP — não há candidato a novo AD em `.specs/project/STATE.md`.
