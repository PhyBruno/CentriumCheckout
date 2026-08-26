# Feature Specification: Seleção de Vendedor

**Feature Branch**: `[012-selecao-vendedor]`

**Created**: 2026-08-26

**Status**: Draft

**Input**: User description: "Toda venda precisa registrar o vendedor que atendeu o cliente final, que não é necessariamente o mesmo que o operador de caixa logado — o operador precisa localizar e selecionar esse vendedor rapidamente, dentre os vendedores da empresa, sem sair do Checkout."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Selecionar o vendedor que atendeu o cliente final (Priority: P1)

Como operador de caixa, quero buscar e selecionar o vendedor que atendeu o cliente final (que pode ser diferente de mim, o operador logado), para que a venda registre corretamente quem fez o atendimento.

**Why this priority**: Sem essa seleção, a informação de vendedor ficaria incorreta ou ausente na venda — é um campo sempre obrigatório.

**Independent Test**: Pode ser testado buscando um vendedor por nome parcial, selecionando-o, finalizando a venda e confirmando que o vendedor registrado é o selecionado, não o operador autenticado; e verificando que uma venda recém-iniciada, sem interação com a busca, já começa com um vendedor associado.

**Acceptance Scenarios**:

1. **Given** o operador abre a busca de vendedor, **When** ela carrega, **Then** os vendedores disponíveis na empresa do operador logado são exibidos.
2. **Given** a lista exibida, **When** o operador busca por nome, **Then** a lista é filtrada pelos vendedores correspondentes.
3. **Given** a lista de vendedores, **When** o operador seleciona um, **Then** esse vendedor fica associado à venda.
4. **Given** uma venda finalizada, **When** o registro é enviado, **Then** o vendedor associado é o selecionado neste fluxo, nunca o operador logado.
5. **Given** uma venda recém-iniciada, **When** a empresa tem um vendedor padrão configurado, **Then** esse vendedor já vem pré-selecionado, sem exigir nenhuma ação do operador.
6. **Given** uma venda recém-iniciada, **When** a empresa não tem vendedor padrão configurado, **Then** o campo vendedor começa vazio, exigindo seleção manual antes de finalizar.
7. **Given** um carrinho já com itens, **When** o operador troca o vendedor da venda, **Then** o sistema permite a troca; **When** já existe pagamento aprovado, **Then** essa troca fica bloqueada.

---

### Edge Cases

- O vendedor da venda pode ser o mesmo que o operador de caixa logado? Podem coincidir, mas o sistema nunca assume isso automaticamente — são sempre dois campos distintos, e o vendedor precisa ser selecionado (ou vir de um padrão) independentemente de quem está operando o caixa.
- O que acontece ao retomar uma venda suspensa que já tem um vendedor registrado? Esse vendedor é pré-selecionado automaticamente.
- O que acontece se a busca de vendedores não retornar nenhum resultado? O vendedor já selecionado (padrão ou anterior) é mantido, e o operador pode fechar a busca normalmente, sem bloqueio.
- O que acontece se o operador fechar a busca sem selecionar ninguém? O vendedor da venda permanece o que já estava antes.
- Qual o filtro padrão ao abrir a busca de vendedor? Só vendedores ativos, por padrão.
- O que acontece quando o vendedor da venda é selecionado ou trocado? O sistema registra o evento correspondente no histórico de auditoria da venda (ver feature de auditoria de ações do operador).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST permitir que o operador busque um vendedor por nome, entre os vendedores da empresa do operador logado.
- **FR-002**: O sistema MUST permitir que o operador filtre essa busca por status do vendedor (ex.: ativo).
- **FR-003**: O sistema MUST restringir essa busca a vendedores ativos por padrão.
- **FR-004**: O sistema MUST permitir que o operador selecione um vendedor dos resultados, associando-o imediatamente à venda.
- **FR-005**: O sistema MUST pré-selecionar automaticamente um vendedor padrão em toda venda nova, sem exigir busca do operador, sempre que a empresa tiver um vendedor padrão configurado.
- **FR-006**: O sistema MUST deixar o campo vendedor vazio, exigindo seleção manual antes de finalizar a venda, quando a empresa não tiver um vendedor padrão configurado.
- **FR-007**: O sistema MUST enviar, na finalização, o vendedor que estiver selecionado na venda naquele momento — nunca a identidade do operador logado como substituto.
- **FR-008**: O sistema MUST NOT tratar o operador logado como o vendedor da venda automaticamente, nem como um valor travado — os dois campos permanecem distintos e sempre editáveis.
- **FR-009**: Ao retomar uma venda suspensa que já tem um vendedor registrado, o sistema MUST pré-selecionar esse vendedor automaticamente.
- **FR-010**: Quando a busca de vendedor não retorna resultado, o sistema MUST manter o vendedor já selecionado (padrão ou anterior) e permitir que o operador feche a busca normalmente, sem bloqueio.
- **FR-011**: Quando o operador fecha a busca de vendedor sem selecionar ninguém, o sistema MUST manter o vendedor da venda inalterado.
- **FR-012**: O sistema MUST permitir trocar o vendedor da venda quando o carrinho já tem itens.
- **FR-013**: O sistema MUST bloquear a troca de vendedor da venda assim que houver um pagamento aprovado.
- **FR-014**: O sistema MUST registrar, no histórico de auditoria da venda, a seleção ou troca do vendedor da venda.
- **FR-015**: O sistema MUST NOT oferecer cadastro ou edição de vendedor dentro do Checkout — vendedores são geridos fora dele.

### Key Entities *(include if feature involves data)*

- **Vendedor**: a pessoa que atendeu o cliente final, distinta do operador logado, associada à venda e registrada na finalização.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: O operador nunca confunde "vendedor da venda" com "operador de caixa logado" — os dois permanecem distintos em toda a aplicação.
- **SC-002**: Nenhuma venda finalizada carrega a identidade do operador logado como substituto silencioso do vendedor.
- **SC-003**: Nenhuma venda é finalizada sem um vendedor associado.

## Assumptions

- Cadastrar ou editar vendedores está fora de escopo — o Checkout apenas busca e seleciona entre vendedores já existentes.
- A lista de vendedores é restrita aos vendedores registrados na empresa do operador logado.
