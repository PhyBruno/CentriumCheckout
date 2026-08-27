# Quickstart — Validação: Seleção de Vendedor

**Feature**: `specs/012-selecao-vendedor/` | **Date**: 2026-08-27

Guia de validação end-to-end desta feature. Não é um plano de testes automatizados completo (ver `tasks.md`, gerado por `/speckit-tasks`) — é o roteiro mínimo para provar que os cenários de aceite da spec (`spec.md`, User Story 1) funcionam de ponta a ponta.

## Pré-requisitos

- Sessão de venda iniciada (bootstrap da feature 002 concluído — `GetSessao` já retornou `VendedorCodigo`/`VendedorNome`).
- Mock ou stub de `GET /api/erp/GetListaVendedores` retornando ao menos 2 vendedores distintos do `VendedorCodigo` default da sessão (ver `contracts/erp-vendedor-api.md`).
- `vendaStore` combinado com `vendedorSlice`, `carrinhoSlice` (003) e `auditoriaSlice` (001) já montados (mesma composição usada pelos testes de integração das features 003/005).

## Cenário 1 — Pré-seleção automática do vendedor default (sem interação)

1. Iniciar uma nova venda (`resetarAuditoria('NOVA')` + `inicializarVendedorPadrao(sessaoUsuario)`).
2. **Esperado**: `vendedorAtual = { codigo: sessaoUsuario.VendedorCodigo, nome: sessaoUsuario.VendedorNome, origem: 'DEFAULT' }`, sem nenhuma chamada a `GetListaVendedores` e sem evento de auditoria registrado (`historicoAuditoria` não contém `VENDEDOR_SELECIONADO`/`VENDEDOR_TROCADO`).

## Cenário 2 — Buscar e selecionar um vendedor diferente do default

1. A partir do estado do Cenário 1, abrir `ModalBuscaVendedor`.
2. Digitar um termo parcial de nome (ex.: primeiras letras de um vendedor do mock, diferente do default).
3. **Esperado**: a listagem filtra para os resultados correspondentes; nenhum chip de filtro de status é exibido (`AD-103`).
4. Clicar na linha de um vendedor diferente do default.
5. **Esperado**: o modal fecha sem exigir um botão de confirmação separado; `vendedorAtual` passa a refletir o vendedor clicado (`origem: 'BUSCA'`); é registrado `VENDEDOR_SELECIONADO` (primeira escolha explícita desta sessão) com `{ codigoVendedor, nome }`.
6. Repetir a seleção com um terceiro vendedor.
7. **Esperado**: desta vez o evento registrado é `VENDEDOR_TROCADO`, com `{ codigoVendedorAnterior, codigoVendedorNovo }`.

## Cenário 3 — Finalização envia o vendedor selecionado, nunca o operador logado

1. A partir do estado do Cenário 2 (vendedor trocado, diferente do default e do operador logado da sessão), inserir ao menos um item no carrinho e finalizar a venda (`FaturarNFCe`, feature 004).
2. **Esperado**: o payload de `CheckoutFaturarNFCe` envia `vendedorCodigo = vendedorAtual.codigo` — nunca `sessaoUsuario.UsuarioCodigo`.

## Cenário 4 — Empresa sem vendedor default configurado

1. Iniciar uma nova venda com um mock de `GetSessao` em que `SessaoUsuario.VendedorCodigo` vem vazio/zero.
2. **Esperado**: `vendedorAtual = null` (`FR-006`/`VEND-07`); a UI exige seleção manual antes de permitir finalizar a venda.

## Cenário 5 — Busca sem resultado e fechamento sem seleção

1. A partir do Cenário 1, abrir o modal e buscar um termo sem correspondência.
2. **Esperado**: a listagem vazia não altera `vendedorAtual` (continua o default); o operador pode clicar "Cancelar" e fechar o modal normalmente, sem bloqueio.
3. Reabrir o modal e fechá-lo (botão "Cancelar") sem clicar em nenhuma linha.
4. **Esperado**: `vendedorAtual` permanece inalterado (`FR-011`).

## Cenário 6 — Troca bloqueada após pagamento aprovado

1. A partir de uma venda com carrinho populado e um vendedor já selecionado, aprovar uma forma de pagamento (feature 008).
2. Tentar selecionar um vendedor diferente no modal.
3. **Esperado**: `selecionarVendedor` é no-op (`podeMutarCarrinho() === false`) — `vendedorAtual` permanece o de antes da tentativa, com toast informando o bloqueio.

## Cenário 7 — Retomada de rascunho com vendedor sem nome

1. Carregar um rascunho de NFCe existente via `CarregarNFCe` (feature 004/011), cujo payload traz `vendedorCodigo` preenchido.
2. **Esperado**: `trocarVendedor({ codigo: vendedorCodigo, nome: null })` é chamado; o campo de vendedor na UI exibe `"Vendedor #<codigo>"` até o operador reabrir o modal e reselecionar; nenhum evento de auditoria é registrado por essa sobrescrita (ver `data-model.md`, I3).

---

Referências de contrato e shapes completos: `contracts/erp-vendedor-api.md`, `contracts/vendedor-domain-api.md`, `data-model.md`.
