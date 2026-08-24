# Identificação e Cadastro de Cliente — Specification

## Problem Statement

Uma venda pode precisar de um cliente associado [Nao é obrigatorio]. O operador precisa localizar um cliente já cadastrado no ERP rapidamente (por CPF/CNPJ ou por busca livre) e, quando o cliente não existe, cadastrá-lo sem sair do Checkout — mas sem reimplementar todas as validações completas do ERP.

## UI Design

Busca de cliente: frame `PDV Online Web - Modal cliente` em `design/CentriumCheckout.pen` (tabela de resultados, filtros, paginação). Cadastro simplificado (`CLI-03`/`CLI-04`): frame `PDV Online Web - Modal cadastro de cliente` (design concluído em 2026-08-21, ver AD-011 em `.specs/project/STATE.md`). Fluxo mobile (etapa 1): frame `PDV Mobile 01 - Cliente e Produtos`, seção "Cliente e NFCe".

## Goals

- [ ] Localizar cliente já cadastrado em uma única etapa, por múltiplos critérios de busca.
- [ ] Permitir cadastro simplificado sem travar a venda por falta de acesso ao cadastro completo do ERP.

## Out of Scope

| Feature | Reason |
|---|---|
| Cadastro completo de cliente (todas as validações de `Regras.md`) | Fora de escopo — só o cadastro simplificado é feito pelo Checkout |

---

## User Stories

### P1: Busca de cliente por CPF/CNPJ ou termo livre ⭐ MVP

**User Story**: Como operador de caixa, quero buscar o cliente pelo CPF/CNPJ, ou por nome/e-mail/telefone quando não sei o documento, para associá-lo à venda rapidamente.

**Why P1**: Uma venda pode depender de um cliente identificado.

**Acceptance Criteria**:

1. WHEN o operador informa um CPF/CNPJ conhecido THEN o sistema SHALL chamar `GET /ApiCentriumOAuth/GetCliente` e retornar o cliente específico.
2. WHEN o operador não sabe o CPF/CNPJ e busca por nome, e-mail ou telefone THEN o sistema SHALL chamar `GET /ApiCentriumOAuth/GetListaClientes` com `Txtbusca` (mais `Empresa`, `Pagina`, `Tamanhopagina`), listando candidatos para seleção. **Resolvido (2026-08-21, AD-023):** endpoint confirmado no `ApiCentriumOAuth.yaml` atualizado.
3. WHEN a identificação de cliente e a montagem do carrinho acontecem na mesma etapa (layouts desktop/mobile) THEN o sistema SHALL tratá-las como ações independentes, não sequenciais obrigatórias.

**Independent Test**: Buscar um cliente conhecido por CPF e um desconhecido por nome parcial; verificar que cada caminho chama o endpoint correto.

---

### P1: Cadastro simplificado quando cliente não é encontrado ⭐ MVP

**User Story**: Como operador de caixa, quando o cliente não existe no ERP, quero cadastrá-lo com os dados básicos sem sair do Checkout, para não perder a identificaçao na venda se necessario.

**Why P1**: Bloquear a venda por falta de cadastro é operacionalmente inaceitável.

**Acceptance Criteria**:

1. WHEN a busca (GetCliente/GetListaClientes) não retorna nenhum cliente THEN o sistema SHALL oferecer a opção de cadastro simplificado dentro do próprio Checkout.
2. WHEN o operador preenche os dados básicos do cadastro simplificado THEN o sistema SHALL validar máscaras de CPF e CEP antes de enviar.
3. WHEN os dados são válidos THEN o sistema SHALL chamar `POST /ApiCentriumOAuth/PostCliente`, que grava o cliente no ERP com auditoria e retorna os dados cadastrados.

**Independent Test**: Buscar um CPF inexistente, preencher o formulário simplificado e verificar que `PostCliente` é chamado com payload válido.

---

## Edge Cases

- WHEN o operador informa um CEP no cadastro simplificado THEN o sistema SHALL tratar o campo de endereço como texto livre, sem validação de IBGE. **Resolvido (2026-08-21, AD-023):** decisão direta do usuário — será livre mesmo, além da máscara de formato já prevista (`CLI-04`).
- WHEN o formulário de cadastro simplificado é exibido THEN o sistema SHALL **não** incluir os campos "Limite de crédito" e "Permite venda a crédito" (presentes hoje no design, frame `PDV Online Web - Modal cadastro de cliente`) — `POST /ApiCentriumOAuth/PostCliente` não aceita esses campos no payload (só aceita `Empresa, nome, cpf, email, celular, cep, endereco, bairro, numero, cidade, uf`). **Reforçado (2026-08-21, AD-024):** confirmado lendo o código-fonte real de `PCheckout_PostCliente` na KB (não só o schema do contrato) — a procedure genuinamente não grava esses dois campos em lugar nenhum. **Resolvido (2026-08-24, AD-026, decisão direta do usuário):** os dois campos serão removidos da tela — não haverá tratamento como somente-leitura nem expansão de contrato pedida ao time do ERP. **Remoção visual ainda pendente:** o frame `PDV Online Web - Modal cadastro de cliente` (`design/CentriumCheckout.pen`) ainda não foi atualizado para refletir essa decisão — só o requisito foi corrigido nesta rodada. Achados laterais na mesma verificação (AD-024): (1) `CliTip` é hardcoded como `'F'` dentro de `PCheckout_PostCliente` — o cadastro simplificado do Checkout só cria cliente pessoa física, nunca pessoa jurídica, independentemente do que o formulário envie; (2) quando a empresa tem a configuração `UtilizaSegundoNivelDeEnderecos = 'S'` (`PCliente_conf`), o mesmo payload de endereço (`cep/endereco/bairro/numero/cidade/uf`) é roteado para criar um registro de `Endereco` separado em vez de gravar os campos direto no cliente — transparente para o Checkout (o payload enviado não muda), mas relevante para quem for depurar dados de cliente em tenants com essa config ativa.
- WHEN o cliente retornado tem `CodigoConvenio`/`DescontoConvenio` preenchidos THEN o sistema SHALL tratar `DescontoConvenio` como percentual. **Resolvido (2026-08-21, AD-023):** confirmado na KB do GenExus — `PGeraPedidoVenda` calcula `&ConvDsc = (1 - CliConvDsc / 100)`, fator de desconto percentual. Impacta o motor de precificação (`.specs/features/carrinho-produto-precificacao/spec.md`).

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
|---|---|---|---|
| CLI-01 | Busca por CPF/CNPJ (`GetCliente`) | - | Verified |
| CLI-02 | Busca por termo livre (`GetListaClientes`) | - | Verified (2026-08-21, AD-023 — endpoint confirmado em `ApiCentriumOAuth.yaml`) |
| CLI-03 | Cadastro simplificado via `PostCliente` | - | Verified |
| CLI-04 | Validação de máscara CPF/CEP no cadastro simplificado | - | Verified |

**Coverage:** 4 total, 0 mapeados a tasks, 0 requisitos pendentes, 0 edge cases pendentes de decisão de produto (campos "Limite de crédito"/"Permite venda a crédito" — decisão de remover do design confirmada em 2026-08-24, AD-026; remoção visual no Pencil ainda não aplicada).

---

## Success Criteria

- [ ] Operador nunca fica sem opção de continuar a venda por cliente não encontrado.
- [ ] Nenhuma venda é bloqueada por falha de cadastro simplificado dentro do fluxo normal.
