# Feature Specification: Identificação e Cadastro de Cliente

**Feature Branch**: `[005-identificacao-cadastro-cliente]`

**Created**: 2026-08-26

**Status**: Draft

**Input**: User description: "Toda venda precisa de um cliente associado. O operador precisa localizar um cliente já cadastrado rapidamente (por documento ou busca livre) e, quando ele não existe, cadastrá-lo com dados básicos sem sair do Checkout."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Localizar cliente por documento ou busca livre (Priority: P1)

Como operador de caixa, quero buscar o cliente pelo CPF, ou por nome/e-mail/telefone quando não sei o documento, para associá-lo à venda rapidamente. Somente pessoa física: um CNPJ é recusado em qualquer ponto da busca ou da seleção, porque a NFCe não pode ser emitida para pessoa jurídica (AD-133).

**Why this priority**: Toda venda precisa de um cliente identificado — é um campo sempre obrigatório.

**Independent Test**: Pode ser testado buscando um cliente conhecido pelo documento e um desconhecido por nome parcial, confirmando que cada caminho retorna o resultado esperado; e verificando que uma venda recém-iniciada, sem nenhuma interação com a busca, já começa com um cliente associado.

**Acceptance Scenarios**:

1. **Given** o operador conhece o documento do cliente, **When** ele o informa, **Then** o sistema retorna o cliente correspondente.
2. **Given** o operador não sabe o documento, **When** ele busca por nome, e-mail ou telefone, **Then** o sistema lista os clientes candidatos para seleção.
3. **Given** uma venda recém-iniciada, **When** a empresa tem um cliente padrão configurado, **Then** esse cliente já vem pré-selecionado na venda, sem exigir nenhuma ação do operador.
4. **Given** uma venda recém-iniciada, **When** a empresa não tem cliente padrão configurado, **Then** o campo cliente começa vazio, exigindo seleção manual antes de finalizar.
5. **Given** um carrinho já com itens, **When** o operador troca o cliente da venda, **Then** o sistema permite a troca e recalcula o preço de qualquer item cujo valor dependa do cliente; **When** já existe pagamento aprovado, **Then** essa troca fica bloqueada.

---

### User Story 2 - Cadastro simplificado quando o cliente não é encontrado (Priority: P1)

Como operador de caixa, quando o cliente não existe no cadastro, quero registrá-lo com os dados básicos sem sair do Checkout, para não perder a venda por falta de cadastro.

**Why this priority**: Bloquear a venda por falta de cadastro do cliente é operacionalmente inaceitável.

**Independent Test**: Pode ser testado buscando um documento inexistente, preenchendo o formulário simplificado e confirmando que o cliente passa a existir e fica associado à venda.

**Acceptance Scenarios**:

1. **Given** uma busca que não retorna nenhum cliente, **When** isso acontece, **Then** o sistema oferece a opção de cadastro simplificado sem sair do Checkout.
2. **Given** o formulário de cadastro simplificado preenchido, **When** o operador confirma, **Then** o sistema valida o formato do documento e do CEP antes de enviar.
3. **Given** dados válidos enviados, **When** o cadastro é confirmado, **Then** o cliente passa a existir e fica associado à venda.

---

### Edge Cases

- O que acontece quando o operador digita um CNPJ no campo de busca de cliente? O sistema **bloqueia** — a busca não é sequer disparada — e explica que a venda para pessoa jurídica exige NFe, emitida pelo ERP, fora do Checkout. ~~O sistema bloqueia ou alerta, já que o cadastro simplificado só cria clientes pessoa física — um CNPJ nunca poderia ser cadastrado por esse caminho.~~ **Corrigido (2026-09-03, AD-133):** a alternativa "bloquear ou alertar" deixou de existir e o motivo deixou de ser a limitação do cadastro simplificado — o Ajuste SINIEF 11/2025 proíbe emitir NFCe para CNPJ, o que torna o bloqueio fiscal e obrigatório.
- E quando o operador informa o **código** de um cliente pessoa jurídica, em vez do documento? A associação é recusada depois que o ERP resolve o cadastro — a recusa vale para toda a venda, não só para o campo de documento, porque a identificação também aceita código do cliente e um código de PJ não se parece com um CNPJ até o ERP responder (AD-133). Pela busca por termo livre esse caso não chega a aparecer: o ERP já devolve apenas pessoa física (`PCheckout_ClientesLista`, `where CliTip = 'F'`).
- Existe alguma indicação visual de que o cliente atual da venda veio do padrão da empresa em vez de uma seleção manual? Não — o campo cliente não distingue as duas origens visualmente.
- Qual o filtro padrão ao abrir a busca de cliente? ~~Só clientes ativos, por padrão.~~ **Corrigido (2026-08-26, AD-093 em `.specs/project/STATE.md`):** não há filtro de status — `GetListaClientes`/`GetCliente` não têm campo `Ativo`/`Status` no contrato do ERP, não há como filtrar ou exibir isso. O modal lista todos os clientes retornados pela busca, sem distinção de status.
- Como o sistema valida o endereço informado no cadastro simplificado? Como texto livre, sem validação de endereço postal oficial — apenas o formato do CEP é validado.
- O formulário de cadastro simplificado inclui limite de crédito ou permissão de venda a crédito? Não — esses campos não fazem parte do cadastro simplificado feito pelo Checkout.
- Como um desconto especial de convênio do cliente afeta o preço dos itens? É aplicado como percentual sobre os itens elegíveis (ver feature de carrinho e precificação).
- O que acontece quando o cliente da venda é selecionado, criado ou trocado? O sistema registra o evento correspondente no histórico de auditoria da venda (ver feature de auditoria de ações do operador).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST permitir que o operador localize um cliente pelo número do CPF diretamente. Documento de pessoa jurídica não é aceito nesse campo — ver `FR-010`.
- **FR-002**: O sistema MUST permitir que o operador localize um cliente por busca livre (nome, e-mail ou telefone) quando o documento não é conhecido, retornando uma lista de candidatos.
- **FR-003**: O sistema MUST tratar a identificação do cliente e a inserção de produtos como ações independentes, sem exigir uma sequência obrigatória entre elas.
- **FR-004**: O sistema MUST pré-selecionar automaticamente um cliente padrão em toda venda nova, sem exigir busca do operador, sempre que a empresa tiver um cliente padrão configurado.
- **FR-005**: O sistema MUST deixar o campo cliente vazio, exigindo seleção manual antes de finalizar a venda, quando a empresa não tiver um cliente padrão configurado.
- **FR-006**: O sistema MUST NOT distinguir visualmente, no campo cliente, se o valor atual veio do padrão da empresa ou de uma seleção manual do operador.
- ~~**FR-007**: O sistema MUST restringir a busca de cliente a clientes ativos por padrão.~~ **Removido (2026-08-26, AD-093):** o contrato do ERP (`GetListaClientes`/`GetCliente`) não expõe status de cliente — nem como parâmetro de filtro, nem como campo de resposta. Não há dado disponível para implementar essa restrição.
- **FR-008**: O sistema MUST permitir trocar o cliente da venda quando o carrinho já tem itens, recalculando o preço de qualquer item cujo valor dependa do cliente.
- **FR-009**: O sistema MUST bloquear a troca de cliente da venda assim que houver um pagamento aprovado.
- **FR-010**: O sistema MUST recusar cliente pessoa jurídica (documento de 14 dígitos) em **todos** os pontos da venda — bloqueando a busca por documento antes de chamar o ERP, recusando a associação de um cadastro pessoa jurídica resolvido por código do cliente, e não oferecendo o cadastro simplificado — informando ao operador que a venda para pessoa jurídica exige NFe, emitida pelo ERP, fora do Checkout. ~~O sistema MUST bloquear ou alertar o operador quando um CNPJ é informado na busca de cliente, já que o cadastro simplificado só admite clientes pessoa física.~~ **Corrigido (2026-09-03, AD-133):** o Ajuste SINIEF 11/2025 proíbe a emissão de NFCe para CNPJ; o bloqueio deixa de ser opcional ("ou alertar"), deixa de valer só para a busca, e passa a ter fundamento fiscal em vez da limitação de `CliTip='F'` no cadastro.
- **FR-011**: O sistema MUST oferecer a opção de cadastro simplificado, sem sair do Checkout, quando uma busca de cliente não retorna resultado.
- **FR-012**: O sistema MUST validar o formato do documento e do CEP antes de enviar um cadastro simplificado.
- **FR-013**: O sistema MUST tratar os campos de endereço do cadastro simplificado como texto livre, sem validação de endereço postal oficial.
- **FR-014**: O sistema MUST NOT incluir campos de limite de crédito ou permissão de venda a crédito no formulário de cadastro simplificado.
- **FR-015**: O sistema MUST registrar, no histórico de auditoria da venda, a seleção, criação ou troca do cliente da venda.
- **FR-016**: O sistema MUST expor uma forma de buscar cliente por código (`CodCliente`), reutilizável por outras features do Checkout que não dispõem do documento do cliente. **Adicionado 2026-08-31** — achado do `/speckit-tasks` da feature 006 (importação de DAV, AD-115): o DAV só traz o código do cliente, nunca o CPF/CNPJ, e o contrato `GetCliente` não tinha parâmetro para buscar por código até essa data.

### Key Entities *(include if feature involves data)*

- **Cliente**: pessoa física associada à venda, identificada por CPF, podendo carregar um desconto especial de convênio. Pessoa jurídica está fora do alcance desta feature — a NFCe não pode tê-la como destinatária (AD-133), e a venda para PJ é feita por NFe no ERP.
- **Cadastro Simplificado**: o conjunto mínimo de dados que o operador pode preencher para criar um novo cliente sem sair do Checkout, quando nenhum cliente correspondente é encontrado.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: O operador nunca fica impedido de continuar a venda por não encontrar o cliente.
- **SC-002**: Nenhuma venda é finalizada sem um cliente associado. **Nota de rastreabilidade**: o gate que bloqueia a finalização (`podeFinalizar`) é implementado pela feature 004 (`specs/004-finalizacao-suspensao-venda`) — esta feature (005) é responsável apenas por garantir que `clienteAtual` reflita corretamente o estado consultado por aquele gate (default pré-selecionado, seleção manual, ou `null` quando nada foi configurado/escolhido).
- **SC-003**: Nenhuma venda é bloqueada por falha do fluxo de cadastro simplificado em condições normais de uso.

## Assumptions

- O cadastro completo de cliente, com todas as validações usadas fora do Checkout, está fora de escopo — o Checkout oferece apenas o cadastro simplificado.
- O Checkout opera exclusivamente com clientes pessoa física, em toda a venda: o cadastro simplificado só cria PF, e a busca/seleção também só aceita PF (AD-133). Venda para pessoa jurídica exige NFe emitida pelo ERP, fora do Checkout.

## Known Limitations

- **Resolvido (2026-08-31, AD-108 — item 31 de `.specs/project/PENDENCIES.md` fechado):** a limitação antes registrada aqui (AD-094 — venda nascida com o cliente default pré-selecionado sem acesso à lista de preço e ao desconto de convênio desse cliente) **não existe mais**. A lista de preço vem de `SessaoUsuario.ListaPrecoDefault`, entregue pelo próprio `GetSessao`, e o cliente default não tem desconto de convênio por regra de negócio — o Checkout não chama `GetCliente` nesse caso. Permanece indisponível apenas o CPF/CNPJ do cliente default, o que só afeta `TrnPagadorCgc` em `GerarPIX` (enviado vazio, AD-100).
