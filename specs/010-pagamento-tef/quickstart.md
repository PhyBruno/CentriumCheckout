# Quickstart — validação da feature 010 (Pagamento — TEF)

**Feature**: `010-pagamento-tef` | **Date**: 2026-10-02

Guia de validação ponta a ponta. Contratos em `contracts/erp-tef-api.md` e `contracts/tef-domain-api.md`; estados e invariantes em `data-model.md`.

---

## Pré-requisitos

1. **Medição de contrato concluída** (`research.md` D17) e registrada em AD — sem ela, os cenários abaixo validam o mock, não o ERP.
2. Stack de teste manual (`erp-mock`, AD-159) com os três endpoints SmartTEF (`contracts/erp-tef-api.md` §5). Derrube antes qualquer serviço preso na porta 3100 (`e2e-porta-3100-ocupada-por-outro-projeto`).
3. No mock: `TEFAtivo: true`, `UsuarioGAM` presente na raiz do `GetSessao`, uma condição `'2 VEZES'` (`CondicaoPrazo: "2.00000"`) com uma forma de **crédito**, uma de **débito** e uma de **PIX**, todas com `FormaIntegracaoCartao: "1"`.
4. Para o teste no ERP real: **só com o usuário**, num terminal de homologação — `CriarCardPagamento` cobra e `EstornarPagamento` estorna de verdade.

Comandos: `npm run test` (Vitest), `npx tsc --noEmit`, `npm run lint`, `npx playwright test tests/e2e/pagamento-tef.spec.ts`.

---

## Cenários

| # | Passos | Resultado esperado | Requisito |
|---|---|---|---|
| 1 | Venda com cliente identificado e item; aplicar o **débito** TEF pelo saldo | Janela "Pagamento no TEF" abre na hora; corpo enviado tem `PagamentoParcelas: 1`, CPF do cliente, **sem** `EmpCod`/`UsuarioGAM` (o BFF os insere — conferir no log do mock) | FR-001, D6, D7 |
| 2 | Mock anda `PDT → PROC_PAG → CNC` | "Aguardando retorno do TEF" com skeleton → ao `CNC`, o saldo da venda abate **imediatamente**, a janela mostra "Pagamento aprovado" com NSU/Autorização/Bandeira e fecha em 10s | FR-001, D11, D13, T3 |
| 3 | Mesma venda, **crédito** na condição `'2 VEZES'` | `PagamentoParcelas: 2` no corpo | D8, T9 |
| 4 | Cliente default; aplicar TEF | `PagamentoCpfCliente: ""`, `PagamentoNomeCliente` = nome do default | D9 |
| 5 | Com a janela aguardando: ESC, `X`, clique fora | Nada fecha; o `X` explica o motivo ao ser clicado | D12 |
| 6 | "Desistir da operação" → confirmar | Confirmação diz que o Checkout **não cancela** a transação em voo; o pagamento sai da lista; **nenhuma** chamada além de `ConsultarStatusCard` | D12, T4 |
| 7 | Mock devolve `REJ_PAG` | Janela fecha com aviso de pagamento rejeitado; pagamento sai da lista; operador pode aplicar outra forma | D4 |
| 8 | Mock recusa a criação (`Sucesso: false`, "Serial do POS … nao localizado …") | Painel de erro com a frase do ERP; "Tentar novamente" faz **uma** chamada nova; "Desistir" sai sem confirmação | D3, D10 |
| 9 | `GetSessao` sem `UsuarioGAM`; aplicar TEF | Recusa **sem rede**, motivo nomeia o vínculo do operador no TEF; pagamento sai da lista | D7 |
| 10 | Dois TEFs aprovados na mesma venda (50 + 33,29) | Os dois entram; finalizar envia **dois** itens com `TEFPagId` distintos, `TEFTipoIntegracao: "1"` e sem `TEFidentificacao`/`TEFCNPJ`/`TEFNumeroAutorizacao` | FR-001, D15, D16, T11 |
| 11 | Com a janela TEF aberta, tentar inserir outra forma (F6–F9, campo de valor) | Nada é inserido | T7 |
| 12 | TEF aprovado → "Remover" | Confirmação "Estornar o pagamento no cartão?"; **não** há remoção direta | FR-003, D14 |
| 13 | Confirmar o estorno; mock anda `SOL_EST → PROC_EST → EST` | Janela de estorno trava; ao `EST` a faixa fica **riscada** (EXCLUIDO), o saldo volta, evento `FORMA_PAGAMENTO_REMOVIDA` | FR-007–FR-009, T5 |
| 14 | Estorno com mock em `REJ_EST` | Aviso de estorno rejeitado; TEF **continua aprovado**; suspender continua bloqueado | T6, FR-004 |
| 15 | Estorno pedido; "Desistir de esperar" → confirmar; depois "Remover" de novo com mock já em `EST` | Primeira saída deixa o TEF aprovado com aviso de estorno solicitado; a segunda tentativa **não** chama `EstornarPagamento` de novo (consulta inicial já vê `EST`) e risca a forma | D14 (2a), T6 |
| 16 | Venda com TEF aprovado → F10 (suspender) / "Limpar" / mudar o carrinho | Todos bloqueados com motivo; após o estorno do cenário 13, todos liberados | FR-004 |
| 17 | `TEFAtivo: false` | A forma de cartão aparece como avulsa (sem janela); PIX com `FormaIntegracaoCartao: "1"` volta ao QR Code se `UtilizaCentriumPAG` | FR-002, AD-180, AD-250 |
| 18 | Layout de celular (wizard) | Mesmos cenários 1, 6 e 13, sem diferença de regra | FR-006, AD-144 |
| 19 | Proxy recebe corpo forjado com `UsuarioGAM`/`EmpCod` de outro operador | O ERP recebe os valores do cookie | T8 (teste unitário do BFF) |

---

## Fluxo dourado (E2E)

Cenários **1 → 2 → 10 → 12 → 13 → finalizar** em `tests/e2e/pagamento-tef.spec.ts`: venda com dois TEFs aprovados, um deles estornado, NFCe enviada só com o restante e com o `TEFPagId` certo.
