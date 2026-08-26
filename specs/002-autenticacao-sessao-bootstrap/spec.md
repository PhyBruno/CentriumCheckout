# Feature Specification: Autenticação, Sessão e Bootstrap

**Feature Branch**: `[002-autenticacao-sessao-bootstrap]`

**Created**: 2026-08-26

**Status**: Draft

**Input**: User description: "O operador já está autenticado no ERP e não deve digitar credenciais de novo no Checkout — a aplicação deve abrir pronta para uso, com toda a configuração do ponto de venda já carregada, renovando a sessão de forma silenciosa e nunca expondo credenciais sensíveis ao navegador."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Entrada automática vindo do ERP (Priority: P1)

Como operador de caixa, quero que o Checkout abra pronto para uso ao ser acionado a partir do ERP, sem digitar nada, para começar a vender imediatamente.

**Why this priority**: Sem isso não existe ponto de entrada na aplicação.

**Independent Test**: Pode ser testado acionando o Checkout a partir do ERP e verificando que a tela de venda fica disponível sem qualquer campo de login preenchido pelo operador.

**Acceptance Scenarios**:

1. **Given** um operador já autenticado no ERP, **When** ele aciona o Checkout a partir do ERP, **Then** o Checkout abre sem solicitar usuário/senha.
2. **Given** o Checkout recebendo a identificação vinda do ERP, **When** essa identificação é validada, **Then** o operador é conduzido diretamente à tela de venda, sem qualquer credencial sensível visível na URL final exibida no navegador.

---

### User Story 2 - Tela principal só aparece com tudo carregado (Priority: P1)

Como operador de caixa, quero que toda a configuração do ponto de venda (formas de pagamento, condições, terminal) já esteja pronta quando a tela principal aparecer, para não encontrar comportamento inconsistente no meio da venda.

**Why this priority**: As demais funcionalidades da venda dependem dessa configuração já estar presente e correta.

**Independent Test**: Pode ser testado observando que a tela de venda só é exibida depois que toda a configuração do ponto de venda termina de carregar, nunca antes.

**Acceptance Scenarios**:

1. **Given** o operador entrando no Checkout, **When** a configuração do ponto de venda ainda está sendo carregada, **Then** o sistema exibe um indicador de carregamento em vez da tela de venda.
2. **Given** a configuração do ponto de venda totalmente carregada, **When** o carregamento termina, **Then** a tela de venda é liberada com todas as formas de pagamento e condições já disponíveis.
3. **Given** um erro ao carregar a configuração que não é de autenticação (ex.: falha temporária de rede ou do ERP), **When** esse erro ocorre, **Then** o sistema exibe uma opção de tentar novamente, sem forçar o operador a refazer o login.

---

### User Story 3 - Sessão renovada sem interromper a venda (Priority: P1)

Como operador de caixa, não quero ser desconectado no meio de uma venda só porque a sessão expirou.

**Why this priority**: Interromper uma venda em digitação é inaceitável do ponto de vista operacional.

**Independent Test**: Pode ser testado forçando a expiração da sessão durante uma venda em andamento e confirmando que a operação continua sem exigir novo login.

**Acceptance Scenarios**:

1. **Given** a sessão do operador expirando durante o uso normal, **When** isso acontece, **Then** o sistema renova a sessão automaticamente, sem interromper a venda em andamento e sem exigir login manual.
2. **Given** uma tentativa de renovação de sessão que falha, **When** não há venda em digitação, **Then** o sistema encerra a sessão e informa que é preciso reabrir o Checkout a partir do ERP.
3. **Given** uma tentativa de renovação de sessão que falha, **When** existe uma venda em digitação (carrinho com itens), **Then** o sistema avisa o operador de que a sessão será encerrada e a venda em andamento pode ser perdida, antes de efetivamente encerrar.

---

### Edge Cases

- Como o sistema se comporta quando o operador recarrega a página (F5) sem que a configuração do ponto de venda tenha mudado desde o último carregamento? Reaproveita o que já foi carregado, sem repetir o carregamento completo.
- O que acontece quando o mesmo operador abre mais de uma aba do Checkout com a mesma sessão? Uma aba pode afetar a validade da sessão nas demais (ex.: renovar ou encerrar); esse comportamento é aceito como está, sem nenhuma coordenação especial entre abas.
- Como o sistema isola a configuração carregada quando o mesmo navegador/máquina é usado por operadores de empresas diferentes? A configuração de cada empresa fica isolada — nunca reaproveita a de outra empresa carregada anteriormente no mesmo navegador.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST permitir que o operador comece a usar o Checkout imediatamente ao chegar a partir do ERP, sem nenhuma etapa de login manual.
- **FR-002**: O sistema MUST NOT expor a credencial de autenticação ou o token de sessão do operador ao código executado no navegador em nenhum momento.
- **FR-003**: O sistema MUST carregar por completo toda a configuração do ponto de venda (formas de pagamento, condições, terminal) antes de liberar o operador para começar a vender.
- **FR-004**: O sistema MUST exibir um indicador de carregamento enquanto essa configuração inicial ainda não terminou.
- **FR-005**: O sistema MUST renovar a sessão do operador automaticamente e sem interação quando ela expira durante o uso normal, sem interromper a venda em andamento e sem exigir novo login manual.
- **FR-006**: O sistema MUST encerrar a sessão do operador somente quando a renovação automática falhar, e MUST avisar o operador antes de encerrar uma sessão que tenha uma venda em digitação com itens, já que essa venda pode ser perdida.
- **FR-007**: O sistema MUST exibir uma opção de tentar novamente, em vez de forçar um novo login, quando o carregamento inicial falhar por um motivo não relacionado à autenticação.
- **FR-008**: O sistema MUST evitar recarregar a configuração do ponto de venda quando o operador recarrega a página e nada mudou desde o último carregamento bem-sucedido.
- **FR-009**: O sistema MUST isolar a configuração carregada por empresa/tenant, mesmo quando o mesmo navegador ou máquina é compartilhado entre operadores de empresas diferentes.

### Key Entities *(include if feature involves data)*

- **Sessão do Operador**: o período autenticado de uso do Checkout, iniciado sem login manual, renovado automaticamente durante o uso e encerrado apenas quando a renovação falha.
- **Configuração do Ponto de Venda**: o conjunto de dados necessários para operar (formas de pagamento, condições, terminal) que precisa estar completamente carregado antes do início da venda, isolado por empresa/tenant.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Operadores nunca veem uma tela de login manual ao entrar pelo ERP.
- **SC-002**: Operadores nunca veem a tela principal com a configuração do ponto de venda parcialmente carregada.
- **SC-003**: A expiração da sessão durante o uso normal nunca interrompe uma venda em andamento.
- **SC-004**: Nenhuma credencial sensível de autenticação fica acessível ao código executado no navegador em nenhum momento.

## Assumptions

- O ERP é responsável por encaminhar o operador ao Checkout já com a identificação necessária para autenticação — o Checkout não precisa suportar nenhum outro ponto de entrada além desse.
- Múltiplas abas do Checkout abertas com a mesma sessão podem se afetar mutuamente (uma aba renovando ou encerrando a sessão impacta as demais); isso é um comportamento aceito, não um defeito a corrigir.
- Encerrar a sessão é sempre a última alternativa diante de falha de renovação, nunca a primeira resposta a uma instabilidade passageira.
