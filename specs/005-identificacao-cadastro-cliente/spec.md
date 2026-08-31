# Feature Specification: Identificação e Cadastro de Cliente

**Feature Branch**: `[005-identificacao-cadastro-cliente]`

**Created**: 2026-08-26

**Status**: Draft

**Input**: User description: "Toda venda precisa de um cliente associado. O operador precisa localizar um cliente já cadastrado rapidamente (por documento ou busca livre) e, quando ele não existe, cadastrá-lo com dados básicos sem sair do Checkout."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Localizar cliente por documento ou busca livre (Priority: P1)

Como operador de caixa, quero buscar o cliente pelo documento (CPF/CNPJ), ou por nome/e-mail/telefone quando não sei o documento, para associá-lo à venda rapidamente.

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

- O que acontece quando o operador digita um CNPJ no campo de busca de cliente? O sistema bloqueia ou alerta, já que o cadastro simplificado só cria clientes pessoa física — um CNPJ nunca poderia ser cadastrado por esse caminho.
- Existe alguma indicação visual de que o cliente atual da venda veio do padrão da empresa em vez de uma seleção manual? Não — o campo cliente não distingue as duas origens visualmente.
- Qual o filtro padrão ao abrir a busca de cliente? ~~Só clientes ativos, por padrão.~~ **Corrigido (2026-08-26, AD-093 em `.specs/project/STATE.md`):** não há filtro de status — `GetListaClientes`/`GetCliente` não têm campo `Ativo`/`Status` no contrato do ERP, não há como filtrar ou exibir isso. O modal lista todos os clientes retornados pela busca, sem distinção de status.
- Como o sistema valida o endereço informado no cadastro simplificado? Como texto livre, sem validação de endereço postal oficial — apenas o formato do CEP é validado.
- O formulário de cadastro simplificado inclui limite de crédito ou permissão de venda a crédito? Não — esses campos não fazem parte do cadastro simplificado feito pelo Checkout.
- Como um desconto especial de convênio do cliente afeta o preço dos itens? É aplicado como percentual sobre os itens elegíveis (ver feature de carrinho e precificação).
- O que acontece quando o cliente da venda é selecionado, criado ou trocado? O sistema registra o evento correspondente no histórico de auditoria da venda (ver feature de auditoria de ações do operador).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST permitir que o operador localize um cliente pelo número do documento (CPF/CNPJ) diretamente.
- **FR-002**: O sistema MUST permitir que o operador localize um cliente por busca livre (nome, e-mail ou telefone) quando o documento não é conhecido, retornando uma lista de candidatos.
- **FR-003**: O sistema MUST tratar a identificação do cliente e a inserção de produtos como ações independentes, sem exigir uma sequência obrigatória entre elas.
- **FR-004**: O sistema MUST pré-selecionar automaticamente um cliente padrão em toda venda nova, sem exigir busca do operador, sempre que a empresa tiver um cliente padrão configurado.
- **FR-005**: O sistema MUST deixar o campo cliente vazio, exigindo seleção manual antes de finalizar a venda, quando a empresa não tiver um cliente padrão configurado.
- **FR-006**: O sistema MUST NOT distinguir visualmente, no campo cliente, se o valor atual veio do padrão da empresa ou de uma seleção manual do operador.
- ~~**FR-007**: O sistema MUST restringir a busca de cliente a clientes ativos por padrão.~~ **Removido (2026-08-26, AD-093):** o contrato do ERP (`GetListaClientes`/`GetCliente`) não expõe status de cliente — nem como parâmetro de filtro, nem como campo de resposta. Não há dado disponível para implementar essa restrição.
- **FR-008**: O sistema MUST permitir trocar o cliente da venda quando o carrinho já tem itens, recalculando o preço de qualquer item cujo valor dependa do cliente.
- **FR-009**: O sistema MUST bloquear a troca de cliente da venda assim que houver um pagamento aprovado.
- **FR-010**: O sistema MUST bloquear ou alertar o operador quando um CNPJ é informado na busca de cliente, já que o cadastro simplificado só admite clientes pessoa física.
- **FR-011**: O sistema MUST oferecer a opção de cadastro simplificado, sem sair do Checkout, quando uma busca de cliente não retorna resultado.
- **FR-012**: O sistema MUST validar o formato do documento e do CEP antes de enviar um cadastro simplificado.
- **FR-013**: O sistema MUST tratar os campos de endereço do cadastro simplificado como texto livre, sem validação de endereço postal oficial.
- **FR-014**: O sistema MUST NOT incluir campos de limite de crédito ou permissão de venda a crédito no formulário de cadastro simplificado.
- **FR-015**: O sistema MUST registrar, no histórico de auditoria da venda, a seleção, criação ou troca do cliente da venda.

### Key Entities *(include if feature involves data)*

- **Cliente**: pessoa física ou empresa associada à venda, identificada por documento, podendo carregar um desconto especial de convênio.
- **Cadastro Simplificado**: o conjunto mínimo de dados que o operador pode preencher para criar um novo cliente sem sair do Checkout, quando nenhum cliente correspondente é encontrado.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: O operador nunca fica impedido de continuar a venda por não encontrar o cliente.
- **SC-002**: Nenhuma venda é finalizada sem um cliente associado.
- **SC-003**: Nenhuma venda é bloqueada por falha do fluxo de cadastro simplificado em condições normais de uso.

## Assumptions

- O cadastro completo de cliente, com todas as validações usadas fora do Checkout, está fora de escopo — o Checkout oferece apenas o cadastro simplificado.
- O cadastro simplificado feito pelo Checkout cria exclusivamente clientes pessoa física.

## Known Limitations

- **Resolvido (2026-08-31, AD-108 — item 31 de `.specs/project/PENDENCIES.md` fechado):** a limitação antes registrada aqui (AD-094 — venda nascida com o cliente default pré-selecionado sem acesso à lista de preço e ao desconto de convênio desse cliente) **não existe mais**. A lista de preço vem de `SessaoUsuario.ListaPrecoDefault`, entregue pelo próprio `GetSessao`, e o cliente default não tem desconto de convênio por regra de negócio — o Checkout não chama `GetCliente` nesse caso. Permanece indisponível apenas o CPF/CNPJ do cliente default, o que só afeta `TrnPagadorCgc` em `GerarPIX` (enviado vazio, AD-100).
