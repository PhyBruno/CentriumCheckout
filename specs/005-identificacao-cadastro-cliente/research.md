# Phase 0 — Research: Identificação e Cadastro de Cliente

**Feature**: `specs/005-identificacao-cadastro-cliente/` | **Date**: 2026-08-26

Este documento resolve as incógnitas técnicas do Technical Context de `plan.md`. A maior parte do espaço de decisão já estava fechado em `.specs/project/STATE.md` (AD-011 a AD-061) e em `.specs/features/identificacao-cadastro-cliente/spec.md` — a tabela de Requirement Traceability daquela spec registra 8 de 8 requisitos `Verified`. Duas lacunas de contrato surgiram durante esta fase, ambas levadas ao usuário antes de qualquer artefato de código: uma fechada por remoção de escopo (AD-093), a outra registrada como pendência bloqueante para a equipe do ERP (AD-094). As decisões abaixo dividem-se em:

- **Confirmação** — a decisão já existia; aqui só se registra como ela se materializa em código.
- **Nova** — decisão de design tomada nesta fase, porque a spec não a determinava.

---

## D1 — O modal de busca por termo livre é um seletor de documento; `GetCliente` é sempre quem resolve o registro completo

**Natureza**: Nova quanto à forma; segue o mesmo princípio já ratificado pela feature 003 (AD-091).

**Decision**: Ao selecionar um candidato no modal de busca por termo livre (`GetListaClientes`), o Checkout **não** monta o `ClienteVenda` a partir do item da lista. Ele usa o campo `CPF` do candidato (`SDTCheckoutListaClientes.Clientes_ClientesItem.CPF`) e chama `GET /api/erp/GetCliente?CPFCNPJ=...` — o mesmo caminho da busca direta por documento (`CLI-01`). O resultado de `GetListaClientes` serve só para exibir a lista (nome, documento, lista de preço, contato, endereço) e para escolher.

**Rationale**: Inspeção do `ApiCentriumOAuth.yaml` mostra que `SDTCheckoutListaClientes.Clientes_ClientesItem` **tem** `ListaPreco`, mas **não tem** `DescontoConvenio`/`CodigoConvenio` nem `email` — campos presentes apenas em `ClienteCheckout` (retorno de `GetCliente`). Diferente do caso de produto (feature 003, onde a lista carecia até do preço), aqui a lista já tem o suficiente para exibição, mas não o suficiente para o snapshot completo que a feature 003 consome (`DescontoConvenio`, D9 de `specs/003-carrinho-produto-precificacao/research.md`). Montar o `ClienteVenda` só com os campos da lista deixaria `descontoConvenio` sempre `null`, mesmo quando o cliente tem convênio configurado — bug silencioso de precificação. A chamada extra a `GetCliente` é barata (uma por seleção, não por tecla) e mantém uma única fonte de verdade para o snapshot.

**Alternatives considered**:
- *Usar os campos da lista quando disponíveis e só completar `DescontoConvenio` sob demanda*: rejeitado — cria dois formatos de `ClienteVenda` (completo vs. parcial) que a feature 003 precisaria distinguir, reintroduzindo o mesmo tipo de acoplamento condicional que a Constitution II evita.
- *Pedir ao ERP que `GetListaClientes` passe a devolver `DescontoConvenio`/`CodigoConvenio`*: solução ideal a médio prazo, mas não necessária — a chamada extra já resolve com o contrato de hoje, sem depender de mudança do ERP.

---

## D2 — Dois caminhos de busca, dois endpoints

**Natureza**: Confirmação (`CLI-01`, `CLI-02`, AD-023).

**Decision**: `buscarPorDocumento(cpfCnpj)` chama `GetCliente` diretamente (sem paginação, resultado único ou vazio). `buscarPorTermoLivre(texto, pagina)` chama `GetListaClientes` (paginado). São dois fluxos de UI e de query distintos — não há tentativa de inferir automaticamente qual endpoint chamar a partir do formato digitado, exceto pela classificação de documento que decide se o campo de busca livre aceita ou alerta sobre um CNPJ (D4).

**Rationale**: O contrato já expõe os dois endpoints como caminhos separados, com parâmetros diferentes (`CPFCNPJ` vs. `Txtbusca`/`Pagina`/`Tamanhopagina`) — não há benefício em unificar a UI de busca em um único campo que decide o endpoint por heurística, o que adicionaria complexidade sem necessidade (a spec já modela como dois fluxos: `CLI-01` e `CLI-02`).

---

## D3 — Pré-seleção do cliente default: snapshot completo a partir do `GetSessao`, sem chamada de rede

**Natureza**: Confirmação (AD-032, AD-053) quanto ao gatilho; **revista em 2026-08-31 por AD-108** quanto à forma do snapshot — a redação anterior descrevia um snapshot *parcial* (`listaPreco`/`descontoConvenio` em `null`) por causa de AD-094, que deixou de valer.

**Decision**: Ao iniciar/retomar uma venda (mesmo call site que zera o carrinho e a auditoria, feature 001), `clienteSlice.inicializarClientePadrao(sessaoUsuario)` roda **sem nenhuma chamada de rede**:

```ts
if (sessaoUsuario.ClienteDefaultCodigo) {
  clienteAtual = {
    codigoCliente: sessaoUsuario.ClienteDefaultCodigo,
    nome: sessaoUsuario.ClienteDefaultNome,
    documento: null,          // indisponível — GetSessao não devolve CPF/CNPJ
    listaPreco: sessaoUsuario.ListaPrecoDefault, // lista do cliente default, do próprio GetSessao (AD-108)
    descontoConvenio: 0,      // cliente default não tem convênio (AD-108)
    codigoConvenio: null,
    origem: 'DEFAULT',
  };
} else {
  clienteAtual = null; // FR-005/CLI-06 — campo vazio, exige seleção manual
}
```

Nenhum evento de auditoria é disparado por esta inicialização (D9).

**Rationale**: `GetSessao` devolve código e nome do cliente default (AD-032) **e** a lista de preço dele em `SessaoUsuario.ListaPrecoDefault` (contrato `20260827192357`, populado pelo ERP a partir do `CliListCod` do cliente default, com fallback `1`). Somado à regra de negócio de que o cliente default não tem convênio, o bootstrap já carrega tudo o que a feature 003 precisa para resolver `TipoPreco = 9` — nenhuma chamada de rede é necessária, e `GetCliente` **não** é chamado para esse cliente (AD-108). A redação anterior desta decisão montava um snapshot parcial, com `listaPreco`/`descontoConvenio` em `null`, por falta desses dados (AD-094); isso está superado.

**Consequência para a feature 003**: com `origem === 'DEFAULT'`, uma linha inserida sob `TipoPreco = 9` vai a `GetProduto` com `Codcliente = ClienteDefaultCodigo` **e** `Listapreco = ListaPrecoDefault` — sem parâmetro faltando e sem depender de o ERP adivinhar a lista a partir do código. O fator de convênio aplicado localmente é `1` (nenhum desconto), porque `descontoConvenio = 0`.

**Alternatives considered**:
- *Chamar `GetListaClientes` com `Txtbusca = ClienteDefaultNome` para tentar encontrar o registro completo*: rejeitado — nome não é chave única, risco real de resolver o cliente errado (dois clientes com nome igual/parecido) e atribuir `descontoConvenio` incorreto a uma venda. Rejeitado antes de AD-108 por esse motivo, e desnecessário depois dela: a lista de preço vem pronta na sessão e o convênio é inexistente por regra de negócio.

---

## D4 — CNPJ é recusado em toda a venda: a busca não é chamada e o cadastro resolvido não é associado

**Natureza**: Reescrita (2026-09-03, **AD-133**) — a redação anterior desta decisão ("bloqueio de CNPJ na busca é alerta, não impedimento de chamada") está **revogada**; ver "Redação anterior" ao final desta seção.

**Decision**: Quando o texto digitado no campo de busca por documento é classificado como CNPJ (14 dígitos), o Checkout **bloqueia a chamada** — `GetCliente` não é disparado — e exibe um aviso (Goey Toast) explicando que a venda para pessoa jurídica exige NFe, emitida pelo ERP, fora do Checkout. O mesmo bloqueio se aplica **depois que `GetCliente` resolve o cadastro**, ponto único por onde passam os três caminhos de identificação: um cadastro cujo documento tenha 14 dígitos não é associado à venda, e a tentativa produz o mesmo aviso. Isso cobre o caminho que o campo de documento não vê — a identificação também aceita **código do cliente** (até 6 dígitos), e o código de uma PJ nunca se parece com um CNPJ antes da resposta do ERP. A busca por termo livre em si continua sendo chamada quando o termo não é um documento — ela recebe nome, e-mail ou telefone, que não têm como ser classificados antes da resposta. O CTA de "cadastro simplificado" (`CLI-03`) segue não sendo oferecido para CNPJ, pelo mesmo motivo, agora fiscal e não mais só contratual.

**Rationale**: O Ajuste SINIEF 11/2025 proíbe emitir NFCe para destinatário pessoa jurídica identificada por CNPJ (AD-133). Como a NFCe é a única nota que o Checkout emite, um cliente PJ associado à venda não tem desfecho válido: ou a SEFAZ recusa a autorização com o cliente já no caixa e a venda inteira é refeita, ou a nota é autorizada em desacordo com a norma. Bloquear antes da chamada, e também na resolução do cadastro, é o que garante que nenhum caminho da UI chegue a esse estado — o campo de documento sozinho não bastaria, porque a identificação também aceita **código do cliente**, e um código de PJ não se parece com um CNPJ até o ERP responder.

A **lista de busca não precisa** dessa defesa: `PCheckout_ClientesLista` já filtra `where CliTip = 'F'` no ERP, nos dois `For Each` (itens e contagem), verificado no código-fonte da KB em 2026-09-03. A validação na resolução ainda a cobre, mas por consequência — não é ela o motivo.

O bloqueio é duro por decisão explícita de AD-133: com risco fiscal, um aviso que o operador pode ignorar não é proteção. `CliTip = 'F'` hardcoded em `PCheckout_PostCliente` (AD-024) continua verdadeiro e continua impedindo o cadastro de PJ, mas deixou de ser a razão pela qual o CNPJ é recusado.

**Alternatives considered**:
- *Permitir a busca e a seleção de PJ, bloqueando só a finalização*: rejeitado — empurra a descoberta do problema para o fim do fluxo, depois do carrinho montado e possivelmente com pagamento em andamento, que é exatamente o custo que o bloqueio na entrada elimina.
- *Alertar sem bloquear (redação anterior desta decisão)*: rejeitado por AD-133 — ver abaixo.

**Redação anterior (2026-08-26, revogada por AD-133 em 2026-09-03)**: a decisão original era **não** bloquear a chamada — `GetCliente`/`GetListaClientes` prosseguiam normalmente para CNPJ, e o que mudava era apenas a ausência do CTA de cadastro simplificado numa busca sem resultado, acompanhada de um aviso de que o Checkout só cria pessoa física. O `Rationale` daquela versão era que `CliTip = 'F'` é hardcoded só na procedure de **criação**, que o contrato não restringe **busca**/seleção por CNPJ, e que "um cliente pessoa jurídica pode legitimamente já existir no ERP e precisar ser associado a uma venda" — de modo que bloquear a busca quebraria a seleção de um PJ legítimo. **Esse raciocínio caiu**: o cliente PJ continua podendo existir no ERP, mas não pode ser associado a uma venda do Checkout, porque a NFCe que ela gera não pode tê-lo como destinatário.

---

## D5 — Payload de `PostCliente`: só os 11 campos confirmados, nunca os de crédito

**Natureza**: Confirmação (AD-024, AD-026).

**Decision**: `postCliente(dados: CadastroSimplificadoInput)` monta o payload com exatamente `{ Empresa, nome, cpf, email, celular, cep, endereco, bairro, numero, cidade, uf }`. `LimiteCredito` e `PermiteVendaCredito` — presentes no schema `ClienteCheckout` usado por `PostClienteInput` — nunca são incluídos no payload nem exibidos na UI, mesmo que o schema TypeScript gerado pelo Zod os declare como opcionais.

**Rationale**: `PCheckout_PostCliente` (KB real do GenExus) só lê esses 11 campos — confirmado por inspeção direta do código-fonte, não só do schema (AD-024). `CliTip` é hardcoded `'F'` dentro da procedure — o Checkout nunca envia esse campo. Enviar `LimiteCredito`/`PermiteVendaCredito` seria enviar dado que o ERP silenciosamente ignora — risco de o operador acreditar que configurou algo que nunca foi persistido.

---

## D6 — Máscaras de CPF e CEP: validação de formato, não de checksum

**Natureza**: Confirmação (`CLI-04`).

**Decision**: `validarFormatoCPF(texto)` verifica 11 dígitos (ignorando pontuação); `validarFormatoCEP(texto)` verifica 8 dígitos. Nenhum dos dois calcula dígito verificador — a spec pede explicitamente "validar máscaras", não "validar CPF real".

**Rationale**: Mesma leitura literal já usada pela feature 003 para o EAN-13 (onde o DV *é* validado, porque o contrato exige) — aqui a spec e a tech spec (`.specs/features/identificacao-cadastro-cliente/spec.md`, Edge Cases) são explícitas: "validar máscaras de CPF e CEP", "sem validação de endereço postal oficial (só a máscara de formato do CEP)". Implementar checksum de CPF seria além do que foi pedido — a Constitution não exige validação além do escopo declarado, e o ERP é quem detém a validação de negócio real do documento.

---

## D7 — Troca de cliente com carrinho populado: re-fetch de `GetProduto` por SKU, não recomputação local

**Natureza**: Nova quanto à forma; confirmação quanto à origem da regra (`FR-008`/`CLI-07`, AD-043, D9 de `specs/003-carrinho-produto-precificacao/research.md`).

**Decision**: Ao trocar o cliente da venda com o carrinho já populado, `clienteSlice.trocarCliente(...)`:

1. Atualiza `clienteAtual` (novo snapshot, via D1).
2. Para cada `codigoProduto` distinto presente em linhas **ativas e não-congeladas** do carrinho (`carrinho.linhas`, lido do próprio `vendaStore` combinado — `clienteSlice` não importa `carrinhoSlice`, só lê o estado já combinado), chama `fetchProduto(codigoProduto, { tipoPreco, codCliente: novo.codigoCliente, listaPreco: novo.listaPreco })` — a mesma função de serviço já pública que a feature 003 expõe em `services/produto/produtoQueries.ts`.
3. Para cada resultado, atualiza `snapshot.precoBase` (e, se `TipoPreco = 8`, `precosFaixa`/`limiaresFaixa`) de **todas** as linhas ativas não-congeladas daquele SKU, e recalcula `precoUnitario`/`descontoLinha`/totais pela mesma fórmula de `specs/003-carrinho-produto-precificacao/data-model.md` §1 — sem duplicar a fórmula, importando o módulo puro `precificacao/dinheiro.ts`.

Linhas congeladas (origem rascunho/DAV) **não** são tocadas — mesma regra I3/D3 de `specs/003-carrinho-produto-precificacao`.

**Rationale**: A feature 003 já decidiu (D1/D2 daquele plano) que `PrecoVenda` é **sempre** resolvido pelo ERP via `GetProduto` — o Checkout nunca reimplementa a seleção de lista de preço/convênio localmente, exceto para o cálculo de faixa por quantidade (`TipoPreco = 8`, que é local por natureza — depende de estado que só existe no carrinho). Trocar o cliente muda `Codcliente`/`Listapreco`, parâmetros que só fazem sentido em uma nova chamada a `GetProduto` — não há como recalcular isso localmente sem reimplementar a regra de negócio do ERP (violaria Constitution III). Isso é consistente com a nota de D9 de `specs/003-carrinho-produto-precificacao/research.md`: "a troca de cliente dispara reprecificação... pelo mesmo caminho de `TipoPreco = 9`" — ou seja, pelo caminho de rede, não pela função pura `repricarSku` (exclusiva de `TipoPreco = 8`).

**Alternatives considered**:
- *Aplicar só o fator de `DescontoConvenio` localmente, sem rechamar `GetProduto`*: rejeitado para o caso geral — cobriria só o desconto de convênio, mas não uma mudança de `PrecoVenda` por `TipoPreco = 9` (lista diferente por cliente), que é justamente o caso mais comum de "preço depende do cliente" citado em `FR-008`.
- *Bloquear a troca de cliente com carrinho populado, exigindo carrinho vazio*: rejeitado — contraria `CLI-07`/AD-043, decisão direta do usuário já ratificada.

---

## D8 — Bloqueio de troca pós-pagamento reaproveita o predicado da feature 003

**Natureza**: Confirmação (AD-043 — "mesmo gatilho de `CART-09`"), reaproveitando a forma já decidida em D8 de `specs/003-carrinho-produto-precificacao/research.md`.

**Decision**: `clienteSlice.trocarCliente(...)` consulta o mesmo `podeMutarCarrinho(): boolean` injetado na composição do `vendaStore` (feature 003, D8) — não define um segundo predicado nem importa o slice de pagamento. Se `podeMutarCarrinho()` for `false`, a troca é no-op (o cliente atual permanece).

**Rationale**: Dependency Inversion (Constitution II) — reaproveitar o mesmo predicado, já testado pela feature 003, evita duas fontes de verdade sobre "quando a venda pode ser mutada" (uma para carrinho, outra para cliente) que poderiam divergir silenciosamente. `AD-043` já declara explicitamente que é "mesmo gatilho de `CART-09`", não um gatilho paralelo.

---

## D9 — `CLIENTE_SELECIONADO` (primeira escolha explícita) vs. `CLIENTE_TROCADO` (substituição)

**Natureza**: Nova (a spec define os três tipos de evento, mas não a regra de qual dispara quando).

**Decision**: O slice mantém uma flag interna, não persistida, `houveEscolhaExplicita: boolean` (`false` no início/retomada da venda, junto com `resetarAuditoria`). Regra:

| Ação do operador | `houveEscolhaExplicita` antes | Evento disparado | `houveEscolhaExplicita` depois |
|---|---|---|---|
| Seleciona candidato no modal (busca) | `false` | `CLIENTE_SELECIONADO` | `true` |
| Seleciona candidato no modal (busca) | `true` | `CLIENTE_TROCADO` | `true` |
| Confirma cadastro simplificado | `false` | `CLIENTE_CRIADO` | `true` |
| Confirma cadastro simplificado | `true` | `CLIENTE_CRIADO` | `true` |
| Pré-seleção automática do default (D3) | — | **nenhum evento** | inalterado (`false`) |

`CLIENTE_CRIADO` sempre dispara (nunca vira `CLIENTE_TROCADO`) porque marca uma ação distinta (criação, não substituição) — a spec já trata os três tipos como mutuamente exclusivos por ação (`.specs/features/identificacao-cadastro-cliente/spec.md`, Edge Cases: "registrar o evento **correspondente**").

**Rationale**: A pré-seleção automática do default (AD-032) não é uma ação do operador — mesma filosofia já estabelecida por D11 em `specs/003-carrinho-produto-precificacao/research.md` ("reprecificação automática não gera evento — só a ação do operador gera"). Sem a flag, a primeira interação do operador com o modal (mesmo que substituindo um default silencioso) ficaria ambígua entre "SELECIONADO" e "TROCADO"; a flag resolve isso sem exigir que o log carregue um evento fantasma para a pré-seleção automática.

---

## D10 — `descontoConvenio`/`listaPreco` no snapshot: valores reais para o cliente default, `null` só onde o dado não existe

**Natureza**: Nova (decisão de modelagem, consequência direta de D3); **revista em 2026-08-31 por AD-108**.

**Decision**: `ClienteVenda.listaPreco` e `ClienteVenda.descontoConvenio` continuam tipados como `number | null`, mas `null` nunca é usado para disfarçar um dado que existe. Para `origem = 'DEFAULT'`, os dois campos são **valores reais**: `listaPreco = SessaoUsuario.ListaPrecoDefault` e `descontoConvenio = 0` (AD-108). `null` fica reservado a `CADASTRO_SIMPLIFICADO` — cliente recém-criado, que ainda não tem lista nem convênio configurados no ERP. Em nenhum caso se inventa um fallback (`1` para lista, por exemplo) para um cliente cujo cadastro o Checkout não leu.

**Rationale**: Um valor "seguro" inventado esconderia uma limitação real atrás de algo que parece válido — o tipo de bug mais perigoso neste domínio, porque não quebra em teste óbvio, só produz preço sutilmente errado em produção. A diferença que AD-108 introduz é que, para o cliente default, o valor **não é inventado**: `ListaPrecoDefault` vem do próprio ERP e o `0` de convênio é regra de negócio explícita. Onde o dado genuinamente não existe (`CADASTRO_SIMPLIFICADO`), `null` continua sendo a única representação aceita, e a feature 003 deve tratá-lo como ausência de dado, nunca como "sem desconto"/"lista padrão".

---

## Achados desta fase, já promovidos a AD

Os dois achados de contrato levantados durante este Design foram levados ao usuário no mesmo dia (2026-08-26) e registrados em `.specs/project/STATE.md`.

| # | Achado | AD | Resolução |
|---|---|---|---|
| A1 | `GetListaClientes`/`GetCliente` não têm parâmetro de status nem campo `Ativo`/`Status` na resposta — o filtro "Ativo" pré-marcado (AD-053) não tem dado real por trás para o modal de cliente | **AD-093** | Removido do design/spec desta tela — decisão direta do usuário |
| A2 | `GetCliente` só aceita `CPFCNPJ`; `GetSessao` só devolvia código+nome do cliente default — não havia como completar `ListaPreco`/`DescontoConvenio` do cliente default sem interação do operador | **AD-094**, **superada por AD-108 (2026-08-31)** | Registrado como pendência bloqueante (item 31 de `.specs/project/PENDENCIES.md`) em 2026-08-26; **fechado em 2026-08-31** por decisão direta do usuário — a lista vem de `SessaoUsuario.ListaPrecoDefault` e o cliente default não tem convênio, então `GetCliente` nunca é chamado para ele |

Nada bloqueia `/speckit-tasks` — e, desde AD-108 (2026-08-31), a feature não tem nenhuma limitação conhecida pendente.
