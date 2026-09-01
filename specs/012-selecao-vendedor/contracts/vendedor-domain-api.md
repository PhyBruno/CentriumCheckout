# Contract: API interna do slice de Vendedor

Superfície pública que as demais features consomem. Não é uma API HTTP — é o contrato do módulo `src/client/stores/slices/vendedorSlice.ts` (ver `plan.md`, "Project Structure"). Não existe módulo de domínio puro separado para esta feature (ao contrário de precificação/documento) — a lógica é toda de orquestração de estado, sem regra de negócio computável isoladamente.

---

## 1. Slice — `src/client/stores/slices/vendedorSlice.ts`

```ts
export interface VendedorSlice {
  vendedorAtual: VendedorVenda | null;

  inicializarVendedorPadrao(sessaoUsuario: SessaoUsuario): void;
  selecionarVendedor(vendedor: { codigo: number; nome: string }): void;
  trocarVendedor(vendedor: { codigo: number; nome: string | null }, origem?: 'RASCUNHO' | 'DAV'): void;
}
```

Shapes completos (`VendedorVenda`, `OrigemVendedor`, invariantes I1-I6): `data-model.md`.

### Dependências injetadas (Dependency Inversion)

O slice recebe, na composição do `vendaStore`:

```ts
interface VendedorDeps {
  podeMutarCarrinho(): boolean; // implementado pela feature 008 (pagamento) — mesma dependência já usada por carrinho (003) e cliente (005)
}
```

O slice de vendedor **não importa** o slice de pagamento, carrinho ou cliente. Isso é o que permite testar o bloqueio pós-pagamento injetando `() => false`, sem montar estado de pagamento — mesmo padrão de `precificacao-domain-api.md` §2 e `cliente-domain-api.md`.

### Contrato de comportamento das actions

| Action | Pré-condição | Efeito | Auditoria |
|---|---|---|---|
| `inicializarVendedorPadrao` | — (chamada uma vez, início/retomada de venda) | Lê `sessaoUsuario.VendedorCodigo`/`VendedorNome`; se vazio, `vendedorAtual = null` (`FR-006`/`VEND-07`) | nenhum (I3) |
| `selecionarVendedor` | `podeMutarCarrinho()` — em `false`, é no-op com toast | Define `vendedorAtual = { codigo, nome, origem: 'BUSCA' }`; fecha o modal (a UI, não o slice, decide o fechamento) | `VENDEDOR_SELECIONADO` (primeira escolha) ou `VENDEDOR_TROCADO` (substituição) — `houveEscolhaExplicita` decide qual (`research.md` D6) |
| `trocarVendedor` | nenhuma — sobrescreve incondicionalmente, mesmo com pagamento aprovado | Define `vendedorAtual = { codigo, nome, origem }`, onde `origem` é o segundo parâmetro (`'RASCUNHO' \| 'DAV'`) | nenhum (I3) |

**Nota sobre `trocarVendedor` e pagamento aprovado**: ao contrário de `selecionarVendedor` (ação do operador, sempre sujeita a `podeMutarCarrinho()`), `trocarVendedor` é chamada por outra feature (006 importação de DAV, 011 retomada de rascunho) no momento em que a venda inteira está sendo substituída pelo conteúdo importado/carregado — nesse momento não há "pagamento aprovado desta venda" ainda, é o início de uma venda diferente sendo montada. Não há conflito com `VEND-09`/`FR-013` (que trata de trocar vendedor **no meio** de uma venda em digitação).

**Assinatura de `origem` resolvida (correção pós-`/speckit-analyze`, 2026-08-31)**: `trocarVendedor` recebe `origem` como segundo parâmetro **opcional**, com default `'DAV'` — preserva sem alteração a chamada de 2 argumentos que a feature 006 já reservou (`trocarVendedor({ codigo, nome: null })`, `specs/006-importacao-dav/contracts/importacao-domain-api.md`, item 5). O call site de 011 (retomada de rascunho via `CarregarNFCe`) MUST passar `origem: 'RASCUNHO'` explicitamente: `trocarVendedor({ codigo, nome: null }, 'RASCUNHO')` — já escrito em `specs/011-recuperacao-nfce/tasks.md` T022 (correção 2026-09-01 da auditoria de lacunas; 004 não chama `CarregarNFCe`, não é consumidora desta action).

---

## 2. O que este contrato garante às outras features

| Feature | Consome |
|---|---|
| 001 — auditoria | recebe os 2 eventos de vendedor pelo dispatcher tipado (`VENDEDOR_SELECIONADO`, `VENDEDOR_TROCADO`) |
| 004 — finalização/suspensão | lê `vendedorAtual.codigo` para montar `vendedorCodigo` em `CheckoutFaturarNFCe`; MUST bloquear o botão "Finalizar" quando `vendedorAtual === null` (`FR-006`, `SC-003`) — este contrato só garante que `vendedorAtual` reflete corretamente a ausência de default, não implementa o bloqueio. Não chama `trocarVendedor` — 004 nunca chama `CarregarNFCe` (retomada de rascunho é escopo exclusivo de 011) |
| 006 — importação de DAV | chama `trocarVendedor({ codigo, nome: null })` (usa o default `origem: 'DAV'`) — action já reservada por `specs/006-importacao-dav/contracts/importacao-domain-api.md` antes desta fase Design |
| 008 — pagamento | fornece `podeMutarCarrinho()` |
| 011 — recuperação de NFCe | chama `trocarVendedor({ codigo: vendedorCodigo, nome: null }, 'RASCUNHO')` ao retomar rascunho via `CarregarNFCe` (`research.md` D4) — único consumidor desta action para retomada; já escrito em `specs/011-recuperacao-nfce/tasks.md` T022 |
