# Research: Rastreabilidade de pagamentos cancelados e troco enviado ao ERP

**Feature**: `specs/018-rastreabilidade-pagamento-troco/spec.md` · **Data**: 2026-10-16

---

## D1 — O ERP com a soma das formas acima do total (dependência da US3)

**Decision**: Implementar a US3 por último, numa fase isolada, e só fazer merge dela depois de confirmar o comportamento do faturamento no ERP (tarefa de verificação bloqueante em `tasks.md`). US1 e US2 não dependem disso.

**O que já está confirmado**:
- `PCheckout_ValidarNFCe` (leitura do código-fonte na KB `CentriumDEVU6`, 2026-08-31, `specs/014-validacao-previa-nfce/contracts/erp-validacao-api.md`) **não confere** `Σ FormaValor` contra o total. `FormaValor` só é lido para somar o crediário, e dinheiro não é crediário (`FormaFpgUtiCar` vazio). A validação prévia aceita o dinheiro com troco sem mudança.
- `CheckoutFaturarNFCe.FormasDePagamento_FormasDePagamentoItem` (`ApiCentriumOAuth.yaml:1640`) **não tem campo de troco** nem de valor recebido. A única forma de o ERP saber do troco é `Σ FormaValor − total da nota`. Esse é o pedido do usuário (2026-10-16): mandar o recebido para o ERP gerar o troco.

**O que falta confirmar**: se `PCheckout_FaturarNFCe` deriva o troco (`vTroco` da NFCe) dessa diferença e grava a NFCe sem recusar. O MCP `genexus` não estava carregado na sessão do plano, então não foi possível ler o procedimento. Também falta saber se o ERP **grava** `FormaValor` como recebido (com troco) no documento, o que afeta a retomada (D6).

**Rationale**: A US3 reverte uma decisão (D3 da 008) que foi tomada justamente por causa do contrato. Mandar valor acima do total para um faturamento que não o espera arrisca recusa da NFCe, ou nota com pagamento maior que o total. Isolar a fase permite entregar US1/US2 sem esperar a confirmação.

**Alternatives considered**:
- *Chave de bootstrap para ligar o envio do recebido*, como `DESCONTO_CAPA_NO_ERP`: rejeitada por ora. O comportamento correto é único (a NFCe precisa do troco), e a chave só se justificaria se ERPs em versões diferentes coexistirem. Reabrir se a verificação mostrar que só versões novas do ERP calculam o troco.
- *Campo próprio de troco no contrato*: depende de mudança no SDT do ERP. Fica como saída se a verificação mostrar que o faturamento recusa a soma acima do total.

---

## D2 — Onde o valor recebido vira `FormaValor`

**Decision**: Em `formaParaRetrato`, que é o produtor único de `FormasDePagamento[]` (I5 da 014): `FormaValor = reais(valorRecebido ?? valorAplicado)`. `FormaCandidata` ganha `valorRecebido: Centavos | null`, que `aplicarNucleo` preenche com o que `derivarValores` já calcula. `candidataComoPagamento` passa o campo adiante em vez de fixar `null`.

**Rationale**:
- `valorRecebido` só existe em dinheiro (invariante I3 da 008), então `??` já restringe a mudança a dinheiro (FR-017).
- `valorAplicado` continua sendo o que quita a venda: saldo, faltante, troco exibido e o botão Finalizar (`saldoRestante === 0`) não mudam (FR-019).
- Sem mexer na candidata, a validação prévia mandaria o dinheiro com o aplicado e o faturamento com o recebido. A regra I5 / FR-018 diz que os dois retratos precisam ser iguais, e o teste `validacaoVendaSlice.spec.ts:377` pega essa divergência.

**Alternatives considered**: *Fazer `valorAplicado` incluir o troco*: rejeitada. Quebraria `calcularSaldo`, o limite de `derivarValores` e a separação "`totalAplicado` fecha a nota, `totalRecebido` fecha a gaveta" (STATE.md, revisão do recebido).

**Supersede**: D3 de `specs/008-pagamento-geral/research.md` ("o troco nunca entra no payload"). A correção é feita no ponto da decisão, conforme `docs/agents/domain.md`.

---

## D3 — "Limpar" marca como excluída, em vez de esvaziar

**Decision**: `descartarPagamento` passa a:
1. manter a guarda de TEF aprovado (FR-005);
2. sair sem efeito quando não há pagamento vivo, condição nem desconto de capa (FR-006, `pagamentosVivos()` em vez de `pagamentos.length`);
3. mapear cada pagamento **vivo** (`pagamentoVivo`: aprovado ou pendente) para `EXCLUIDO` e manter os já `EXCLUIDO` (FR-002/FR-003);
4. zerar condição, desconto de capa e vales num único `set` (FR-001);
5. registrar um `FORMA_PAGAMENTO_REMOVIDA` por forma excluída agora, com motivo `LIMPAR` e o rótulo resolvido **antes** do `set` (FR-004);
6. chamar `invalidarVeredito()`, como hoje.

`limparPagamentos` (pós-finalização da 004) continua esvaziando tudo (FR-009).

A UI acompanha: `BotaoLimparPagamento.vazio` (`ConfiguracaoPagamento.tsx:83`) e o teste de "PIX na venda" (`temPix`) passam a olhar só pagamentos vivos, senão um PIX já riscado pediria confirmação num "Limpar" que não mexe nele. A confirmação de documento já filtra por `APROVADO`.

**Rationale**: É o tratamento que `removerPagamento` dá a uma forma desde AD-163, aplicado em bloco. Nenhuma regra de "há pagamento?" muda de resposta, porque todas já usam `pagamentoVivo` ou `status === 'APROVADO'` (AD-171). A lista visível já esconde o botão Remover de linha riscada e já mostra o rótulo pelo meio de pagamento (`ListaPagamentosAplicados.tsx:575`), então FR-007 está satisfeito sem código novo.

Um PENDENTE que vira EXCLUIDO não volta: `confirmarPagamentoIntegrado` só transiciona PENDENTE. Uma aprovação de PIX que chegue depois do "Limpar" é ignorada, como já acontece com o PIX removido individualmente.

`temPixNaVenda` da finalização/suspensão (`useFinalizarOuSuspenderVenda.ts:259`) continua olhando qualquer status, de propósito: a cobrança riscada continua viva no banco (edge case da spec).

**Alternatives considered**: *Guardar a descrição da forma no pagamento*: proposta no `/speckit-specify` e descartada aqui. A lista não lê a condição para rotular, e a auditoria resolve o rótulo antes do `set`.

---

## D4 — Formato do evento `FORMA_PAGAMENTO_REMOVIDA`

**Decision**: Os detalhes passam a ser:

```ts
{
  formaPagamento: string;          // como hoje
  valor: number;                   // centavos inteiros: valorRecebido ?? valorAplicado
  motivo: 'OPERADOR' | 'ESTORNO_TEF' | 'LIMPAR';
  tefPagId?: string;               // dadosTEF.pagId, só quando há
  pixGuid?: string;                // só quando há (PIX aprovado)
}
```

O tipo do motivo se chama `MotivoRemocaoPagamento` e mora em `domain/auditoria/eventos.ts`, junto do evento. `domain/pagamento` importa da auditoria, que é a direção que já existe (`pagamentoSlice` importa as factories).

Os detalhes saem de uma função pura `detalhesDaRemocao(pagamento, rotulo, motivo)` em `domain/pagamento/`, chamada pelas três actions (`removerPagamento`, `confirmarEstornoTef`, `descartarPagamento`).

**Rationale**:
- `valor` em centavos e `formaPagamento` como texto seguem os vizinhos `FORMA_PAGAMENTO_APLICADA` e `VALE_DEVOLUCAO_USADO`. Para dinheiro, `valor` é o recebido, coerente com o que vai em `FormaValor` (D2).
- `motivo` como literal, e não frase, segue o padrão de `origem` no `DESCONTO_CAPA_APLICADO`: o `Log` é lido por quem consulta o ERP, e um literal estável é filtrável.
- Os identificadores são opcionais e omitidos quando ausentes (FR-014): campo vazio no `Log` afirmaria uma transação que não houve, mesmo cuidado de `formaParaRetrato`.
- `tefPagId` é o `payment_identifier` da SmartTEF, o mesmo valor que vai em `TEFPagId` no faturamento. É a chave que o ERP usa para achar a `TransacaoTEF` (AD-259), então basta para conciliar.
- Função pura única: as três actions não podem divergir no formato, e o slice continua só orquestrando (Constitution II).

**Alternatives considered**:
- *Evento novo `TEF_ESTORNADO`*: rejeitado. Duplicaria o registro da remoção e obrigaria quem lê o `Log` a juntar dois eventos para a mesma forma.
- *NSU e autorização no evento*: rejeitados. O `pagId` já leva a eles no ERP, e o pedido do usuário é o `payment_identifier`.

---

## D5 — O `Log` continua o mesmo transporte

**Decision**: Nenhuma mudança em `serializarLogAuditoria` nem no envio. Os campos novos atravessam o `JSON.stringify` (FR-015).

**Rationale**: O ERP guarda o `Log` como string, sem interpretar campo a campo (Assumptions da spec). Eventos já existentes ganharam campos opcionais antes sem mudança de transporte (AD-280: `entradaSolicitada`, `descontoManualSolicitado`).

---

## D6 — Retomada de documento com dinheiro acima do total

**Decision**: Função pura `reconstruirTrocoImportado(pagamentos, totalLiquido)` em `domain/pagamento/`, chamada por `importarFormasDePagamento` antes de gravar.
- Calcula `excedente = Σ valorAplicado − totalLiquido`.
- Se `excedente > 0` e há exatamente uma forma dinheiro com `valorAplicado ≥ excedente`, essa forma fica com `valorRecebido = valor do documento` e `valorAplicado = valor do documento − excedente`.
- Em qualquer outro caso, devolve a lista intacta: sem excedente (FR-021), sem dinheiro, ou excedente maior que o dinheiro.

`totalLiquido` é `deps.subtotalCarrinho()`, já preenchido porque `importarLinhasCongeladas` roda antes (`importarVendaExistente.ts:439` → `:458`). O desconto de capa não é importado, e a pré-condição da importação garante capa `null` nesse instante.

**Rationale**:
- Se o ERP gravar `FormaValor` com o troco (D1), uma venda retomada mostraria pagamento acima do total, com faltante negativo pisado em zero e troco 0. O operador veria "Recebido" errado e mandaria no próximo faturamento o recebido duas vezes contado.
- A reconstrução reproduz o estado que a venda tinha antes da suspensão.
- Exatamente um dinheiro: AD-036 garante uma forma dinheiro por venda feita no Checkout. Um DAV com dois dinheiros (permitido na importação) fica de fora, porque não há como atribuir o excedente sem inventar dado (Constitution IV).

**Ajusta**: D8 de `specs/011-recuperacao-nfce/research.md` ("dinheiro sem troco reconstruído"), no ponto da decisão.

**Alternatives considered**: *Ler o total do documento*: o schema de importação não modela o total nem a capa do cabeçalho (`dav.schema.ts`). Modelá-lo é a correção da lacuna de capa não importada, fora do escopo; está registrada nas Assumptions da spec.

---

## D7 — Testes que mudam de expectativa

Levantados no mapa de impacto. Mudam por decisão, não por regressão:

| Teste | Hoje | Passa a |
|---|---|---|
| `tests/integration/pagamentoSlice.spec.ts:899-944` | `FormaValor` 30 (aplicado) | 50 (recebido) |
| `tests/e2e/pagamento-geral.spec.ts:163-192` | Σ `FormaValor` ≈ 98 | 100 |
| `tests/e2e/pagamento-geral.spec.ts:339-340`, `tests/e2e/recuperacao-nfce.spec.ts:319-321` | 0 linhas após Limpar | linhas riscadas (`data-status="EXCLUIDO"`) |
| `tests/integration/limparPagamentoDoDocumento.spec.tsx:130,146`; `pagamentoSlice.spec.ts:337,581,595` | `pagamentos` vazio | todos `EXCLUIDO` |
| `tests/unit/domain/auditoria/eventos.spec.ts:192,220` | detalhes `{ formaPagamento }` | detalhes completos |
| Formatos exatos de `FormaCandidata` (`pagamentoSlice.spec.ts:1213`, `validacaoVendaSlice.spec.ts:263`, `projetarPagamentos.spec.ts:16`) | sem `valorRecebido` | com `valorRecebido` |

`pagamentoSlice.spec.ts:1304-1315` e `e2e/venda-rapida.spec.ts:153` (FR-009) **não** mudam.
