# Feature Specification: Importação e Faturamento de DAV

**Feature Branch**: `[006-importacao-dav]`

**Created**: 2026-08-26

**Status**: Draft

**Input**: User description: "Além da inserção manual de produtos, o operador precisa poder importar um documento de venda já existente e pronto para faturamento, e faturá-lo, sem digitar os itens/pagamentos novamente."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Listar e selecionar documento para importação (Priority: P1)

Como operador de caixa, quero ver a lista de documentos prontos para faturamento e escolher um para importar.

**Why this priority**: Ponto de entrada do fluxo — sem lista, não há importação.

**Independent Test**: Pode ser testado abrindo a janela de importação e confirmando que a lista aparece, com busca e filtro de data funcionando.

**Acceptance Scenarios**:

1. **Given** o operador abre a janela de importação, **When** a lista carrega, **Then** os documentos prontos para faturamento são exibidos.
2. **Given** a lista exibida, **When** o operador busca por um termo livre, **Then** a lista é filtrada pelos documentos correspondentes.
3. **Given** a lista exibida, **When** o operador ajusta o período de data de emissão, **Then** a lista reflete apenas os documentos emitidos nesse período.

---

### User Story 2 - Importar documento completo para o carrinho (Priority: P1)

Como operador de caixa, ao selecionar um documento pronto para faturamento, quero que os itens e formas de pagamento já venham preenchidos, para só revisar e finalizar.

**Why this priority**: Elimina redigitação manual de um documento que já existe.

**Independent Test**: Pode ser testado importando um documento com itens e uma forma de pagamento já registrados, e confirmando que o carrinho reflete exatamente esses dados antes de qualquer edição manual.

**Acceptance Scenarios**:

1. **Given** um documento selecionado na lista, **When** o operador confirma a importação, **Then** o carrinho é preenchido com os itens e formas de pagamento já registrados nesse documento.
2. **Given** um documento importado, **When** os itens entram no carrinho, **Then** o preço de cada item é preservado exatamente como estava no documento original, sem recálculo automático.
3. **Given** um documento importado que traz cliente e vendedor próprios, **When** a importação acontece, **Then** o cliente e o vendedor da venda são substituídos pelos dados trazidos no documento, mesmo que já houvesse um cliente/vendedor padrão selecionado.
4. **Given** uma venda iniciada a partir de um documento importado, **When** o operador continua a operação, **Then** ela segue exatamente o mesmo fluxo de carrinho, pagamento e finalização de uma venda criada manualmente.

---

### Edge Cases

- Quais filtros a lista de documentos suporta hoje? Busca livre por termo e período de data de emissão; filtros por status, vendedor, tipo ou origem ainda não são suportados.
- O operador pode reimprimir, pela janela de importação, um documento já emitido anteriormente? Não — essa ação não é oferecida por este fluxo.
- O que acontece quando dois operadores tentam importar o mesmo documento ao mesmo tempo? Não há nenhum bloqueio implementado no Checkout para impedir isso — a resolução desse conflito é responsabilidade do sistema de origem dos documentos.
- Como o documento importado é efetivamente faturado? Pelo mesmo fluxo de finalização de venda normal — não existe uma etapa separada para "marcar como importado".

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST permitir que o operador visualize uma lista de documentos prontos para faturamento disponíveis para importação.
- **FR-002**: O sistema MUST permitir que o operador busque nessa lista por um termo livre.
- **FR-003**: O sistema MUST permitir que o operador filtre essa lista por um período de data de emissão, em **dois campos** — início e fim —, cada um abrindo um calendário a qualquer clique no campo. A janela MUST abrir com o período já aplicado: início em hoje − 7 dias, fim em hoje, sem exibir horário (o filtro é por dia, então "hoje" cobre até as 23:59). (Detalhado em 2026-09-03 por decisão direta do usuário, durante a implementação — AD-140.)
- **FR-004**: O sistema MUST permitir que o operador selecione um documento da lista para importá-lo.
- **FR-005**: Ao importar, o sistema MUST preencher o carrinho com todos os itens e formas de pagamento já registrados no documento importado, sem exigir que o operador os digite novamente.
- **FR-006**: Ao importar, o sistema MUST preservar o preço de cada item exatamente como registrado no documento original, sem disparar recálculo automático.
- **FR-007**: Ao importar, o sistema MUST substituir o cliente e o vendedor da venda pelos dados trazidos no documento importado, independentemente de já existir um cliente/vendedor padrão selecionado.
- **FR-008**: Após a importação, o sistema MUST permitir que a venda siga exatamente o mesmo fluxo de carrinho, pagamento e finalização de uma venda criada manualmente, sem tratamento especial.
- **FR-009**: O sistema MUST NOT oferecer, dentro deste fluxo, uma ação de reimpressão de um documento já emitido anteriormente.
- **FR-010**: O sistema MUST NOT implementar nenhum mecanismo de bloqueio para impedir que dois operadores importem o mesmo documento concorrentemente.
- **FR-011**: O sistema MUST recusar a importação de um documento quando a venda em andamento já tiver itens lançados — **canceladas inclusive** (AD-141): a linha cancelada permanece no carrinho, na auditoria e no retrato de `FaturarNFCe`, e o documento não pode entrar por cima dela —, um cliente identificado pelo operador, um documento já importado, ou pagamento aprovado — e MUST informar o motivo ao operador **sem que ele precise tentar**: desde 2026-09-03 (AD-140) o atalho de importação fica desabilitado enquanto a recusa vale, com o motivo no `title` do botão; a notificação de erro permanece como rede de segurança para qualquer outro caminho que chegue à importação. Nada da venda MUST ser alterado. (Acrescentado em 2026-09-03 por decisão direta do usuário, durante a implementação. O cliente **default**, pré-selecionado automaticamente no início da venda, não conta como "cliente identificado": ele não é escolha do operador, e considerá-lo impediria toda importação.)

### Key Entities *(include if feature involves data)*

- **Documento Pronto para Faturamento**: um documento de venda criado previamente, disponível para importação, carregando seus próprios itens, formas de pagamento, cliente e vendedor.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Nenhum dado de um documento importado é redigitado manualmente pelo operador.
- **SC-002**: Uma venda iniciada a partir de um documento importado segue exatamente as mesmas regras de precificação, pagamento e finalização de uma venda manual.

## Assumptions

- Filtrar a lista por status, vendedor, tipo ou origem não é suportado nesta versão — apenas busca livre e período de data de emissão estão disponíveis.
- Reimprimir um documento já emitido anteriormente está fora de escopo deste fluxo — é tratado fora do Checkout.
- Resolver um conflito entre dois operadores importando o mesmo documento é responsabilidade do sistema de origem dos documentos, não do Checkout.
