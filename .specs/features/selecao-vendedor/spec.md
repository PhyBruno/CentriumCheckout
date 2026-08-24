# Seleção de Vendedor — Specification

## Problem Statement

Toda NFCe emitida pelo Checkout precisa registrar o vendedor que atendeu o cliente final (campo `vendedorCodigo`, consumido por `POST /ApiCentriumOAuth/FaturarNFCe`). **Esse vendedor não é necessariamente o mesmo que o operador de caixa logado no Checkout** (`UsuarioCodigo`/`VendedorCodigo` retornados por `GetSessao` referem-se à sessão autenticada, não à venda em digitação) — em muitas lojas, quem realiza o atendimento no salão é diferente de quem opera o caixa. O operador precisa localizar e selecionar esse vendedor rapidamente, dentre os vendedores disponíveis na empresa, sem sair do Checkout.

## UI Design

Frame `PDV Online Web - Modal vendedor` (id `xdlmR`) em `design/CentriumCheckout.pen`, contendo os sub-frames `Modal consulta de vendedor` → `Cabeçalho modal vendedor`, `Filtros modal vendedor`, `Tabela modal vendedor`, `Rodapé modal vendedor`. Título do modal: "Consultar vendedor" / "Selecione o vendedor informado na NFCe".

Estrutura e padrão de interação praticamente idênticos ao já especificado `Modal cliente` (`.specs/features/identificacao-cadastro-cliente/spec.md`, frame `PDV Online Web - Modal cliente`, id `P52V0I`):

| Área | Modal cliente | Modal vendedor |
|---|---|---|
| Busca | Campo de texto livre | Campo de texto livre (busca por nome, ex.: "mariana") |
| Filtro adicional | Chip de filtro de status (ex.: "Ativo") | Chip de filtro de status (ex.: "Ativo") — idêntico, não é diferencial |
| Contagem de resultados | Sim + texto de contexto ("Origem: consulta de cliente da venda") | Sim ("4 vendedores encontrados") + texto de contexto ("Origem: vendedor da NFCe") — idêntico em estrutura, muda só o conteúdo |
| Botão "Novo cliente" | Sim — exclusivo do Modal cliente (atalho para cadastro simplificado) | Não existe — Checkout não cadastra vendedor (ver Out of Scope) |
| Colunas da tabela | Seleção, Código, Cliente, CPF/CNPJ, Telefone, Cidade, Status | Seleção, Código, Vendedor (nome + subtítulo de função, ex.: "Vendedora responsável"), CPF, Status |
| Seleção de linha | Clique na linha marca ícone `circle-check` | Idêntico — clique na linha marca `circle-check`, sem botão de confirmação separado no rodapé |
| Rodapé | Paginação + Cancelar | Paginação + Cancelar |

*(Correção 2026-08-21: a revisão cruzada encontrou que "Filtro adicional" e "Contagem de resultados" tinham sido descritos como exclusivos do Modal vendedor — na verdade o Modal cliente já tem os dois. O diferencial real entre os dois modais é o botão "Novo cliente", exclusivo do Modal cliente.)*

Não há botão explícito de "Selecionar"/"Confirmar" no rodapé de nenhum dos dois modais — o clique na linha já aplica a seleção (mesmo padrão nos dois designs).

No mobile, o gatilho de abertura deste modal é o `Campo Vendedor mobile`, dentro de `Cliente e NFCe mobile` (etapa 1 do wizard, `PDV Mobile 01 - Cliente e Produtos`) — ver `.specs/features/layout-responsivo-mobile/spec.md`. O conteúdo do modal em si não muda entre desktop/mobile.

## Goals

- [ ] Permitir localizar e selecionar, em uma única etapa, o vendedor que atendeu o cliente final, distinto do operador logado.
- [ ] Restringir a listagem aos vendedores da empresa (`codigoEmpresa`/`Empresa`) do operador logado, seguindo o padrão de escopo por empresa dos demais endpoints (AD-019 em `.specs/project/STATE.md`).

## Out of Scope

| Feature | Reason |
|---|---|
| Cadastro/edição de vendedor pelo Checkout | Fora de escopo — o Checkout só consulta e seleciona, não gerencia o cadastro de vendedores (fonte de verdade é o ERP) |
| Associar automaticamente o vendedor = operador logado | Confirmado pelo usuário que são campos semanticamente distintos — não deve haver esse atalho/suposição |

---

## User Stories

### P1: Selecionar o vendedor que atendeu o cliente final ⭐ MVP

**User Story**: Como operador de caixa, quero buscar e selecionar o vendedor que atendeu o cliente final (que pode ser diferente de mim, o operador logado), para que a NFCe registre corretamente quem fez a venda no salão.

**Why P1**: `vendedorCodigo` é campo consumido por `FaturarNFCe` (`.specs/features/finalizacao-suspensao-venda/spec.md`) — sem essa seleção, a informação de vendedor ficaria incorreta ou ausente na NFCe.

**Acceptance Criteria**:

1. WHEN o operador abre o modal de seleção de vendedor THEN o sistema SHALL carregar a listagem de vendedores disponíveis **na empresa do operador logado** via `GET /ApiCentriumOAuth/GetListaVendedores`, com `Empresa` (`codigoEmpresa`, ver AD-019), `Txtbusca`, `Pagina` e `Tamanhopagina` — mesmo padrão paginado de `GetListaClientes`. **Resolvido (2026-08-21, AD-023):** endpoint confirmado no `ApiCentriumOAuth.yaml` atualizado, retornando `VendedorCodigo`, `VendedorNome`, `VendedorCGC`, `VendedorFone` por item.
2. WHEN o operador digita um termo de busca THEN o sistema SHALL filtrar a listagem pelo nome do vendedor.
3. WHEN o operador aplica o filtro de status (ex.: "Ativo") THEN o sistema SHALL restringir a listagem por esse status.
4. WHEN o operador clica em uma linha da tabela de resultados THEN o sistema SHALL marcar essa linha como selecionada (ícone de confirmação) e associar o `vendedorCodigo` correspondente à venda em digitação, fechando o modal — sem exigir um botão de confirmação separado.
5. WHEN a venda em digitação é finalizada (`FaturarNFCe`) THEN o sistema SHALL enviar o `vendedorCodigo` selecionado neste modal, e não o `UsuarioCodigo`/`VendedorCodigo` da sessão do operador logado.

**Independent Test**: Abrir o modal, buscar um vendedor por nome parcial, selecioná-lo clicando na linha, finalizar a venda e verificar que o `vendedorCodigo` enviado a `FaturarNFCe` corresponde ao vendedor selecionado — não ao operador autenticado.

---

## Edge Cases

- WHEN o modal é aberto THEN o sistema SHALL chamar `GET /ApiCentriumOAuth/GetListaVendedores`. **Resolvido (2026-08-21, AD-023):** o novo `ApiCentriumOAuth.yaml` confirma o endpoint de listagem, exatamente no padrão esperado dos demais endpoints paginados do contrato (`Empresa`, `Txtbusca`, `Pagina`, `Tamanhopagina` como parâmetros; `VendedorCodigo`/`VendedorNome`/`VendedorCGC`/`VendedorFone` por item da lista). As ocorrências pontuais de campos de vendedor já mapeadas continuam válidas para outros fins: `VendedorCodigo`/`VendedorNome` na resposta de `GetSessao` (dados do operador logado, não uma lista), `vendedorCodigo` no corpo de `FaturarNFCe`/`CarregarNFCe` (campo de envio/retorno da venda, não de consulta) e `VendedorCodigo`/`VendedorNome` na resposta de `ListaDAVs`.
- WHEN uma venda é carregada de um rascunho existente via `CarregarNFCe` (ver `.specs/features/finalizacao-suspensao-venda/spec.md`, `FIN-03`) e a resposta já traz `vendedorCodigo` preenchido THEN o sistema SHALL pré-selecionar automaticamente esse vendedor. **Resolvido (2026-08-21, AD-024):** confirmado na KB do GenExus — `PCheckout_CarregarNFCe` já monta `&OutCheckoutFaturarNFCe.vendedorCodigo = RepCod` a partir do registro salvo do rascunho (não é um valor vazio a preencher, o próprio ERP devolve o vendedor gravado). O operador pode reconfirmar/trocar manualmente depois, mas o estado inicial do modal deve refletir o vendedor já salvo, não vir em branco.
- WHEN a listagem de vendedores retorna vazia (nenhum vendedor ativo cadastrado, por exemplo) THEN ⚠️ pendente: comportamento não definido pelo usuário — permitir prosseguir sem vendedor selecionado, ou bloquear a finalização da venda? Precisa confirmação (relacionado ao Edge Case já registrado em `.specs/features/finalizacao-suspensao-venda/spec.md` sobre campos obrigatórios de `FaturarNFCe`).
- WHEN o operador fecha o modal sem selecionar nenhum vendedor (botão "Cancelar") THEN o sistema SHALL manter o estado anterior da venda (nenhuma alteração de `vendedorCodigo`).

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
|---|---|---|---|
| VEND-01 | Listagem de vendedores por empresa via `GET /ApiCentriumOAuth/GetListaVendedores` | - | Verified (2026-08-21, AD-023 — endpoint confirmado no contrato atualizado) |
| VEND-02 | Busca por nome | - | Verified (via design) |
| VEND-03 | Filtro por status | - | Verified (via design) |
| VEND-04 | Seleção de linha associa `vendedorCodigo` à venda | - | Verified (via design) |
| VEND-05 | `vendedorCodigo` selecionado é enviado em `FaturarNFCe`, distinto do operador logado | - | Verified (contrato confirma campo em `FaturarNFCe`) |

**Coverage:** 5 total, 0 mapeados a tasks, 0 pendências bloqueantes, 0 edge cases pendentes de contrato/KB (pré-seleção de vendedor ao carregar rascunho resolvida em 2026-08-21, AD-024) — resta 1 edge case de decisão de produto (comportamento quando a listagem de vendedores retorna vazia, ver `.specs/project/PENDENCIES.md` #8).

---

## Success Criteria

- [ ] Operador nunca confunde "vendedor da venda" com "operador de caixa logado" — os dois campos permanecem semanticamente e tecnicamente distintos em toda a aplicação.
- [ ] `FaturarNFCe` sempre recebe o `vendedorCodigo` explicitamente selecionado neste modal (quando aplicável), nunca inferido automaticamente da sessão.
