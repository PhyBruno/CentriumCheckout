# CheckoutWEB (CentriumCheckout)

**Vision:** PDV (ponto de venda) web para operadores de caixa, acessado exclusivamente via redirecionamento a partir do ERP Centrium, cobrindo o ciclo completo de uma venda — identificação de cliente, inserção de produtos, precificação, pagamento e finalização/suspensão da NFCe.
**For:** Operadores de caixa dos clientes do ERP Centrium, em ambiente de loja física (desktop e mobile/tablet).
**Solves:** Substitui a tela de PDV do ERP por uma experiência web dedicada, mantendo o ERP como fonte de verdade (produtos, clientes, pagamentos, NFCe) e delegando ao Checkout apenas a orquestração da venda e o cálculo de precificação em tempo real.

## Goals

- Fluxo de venda ponta a ponta (identificar cliente → inserir produto → pagar → finalizar) sem exigir nenhuma tela do ERP durante a operação de caixa.
- Motor de precificação por faixa de quantidade correto e auditável (ver `.specs/features/carrinho-produto-precificacao/spec.md`), sem depender de recalcular manualmente em fluxos secundários.
- Zero alucinação de contrato de API em código 100% gerado por IA — mitigado por TypeScript `strict` e validação de fronteira com Zod (ver `.specs/codebase/STACK.md`).

## Tech Stack

**Core:**

- Framework: React + Vite
- Language: TypeScript (`strict`)
- Runtime: navegador (SPA, sem wrapper Electron/Tauri, exige internet — sem requisito offline)

**Key dependencies:** Zustand + Immer (estado da venda), TanStack Query (cache de dados do ERP), Zod (validação de fronteira), shadcn/ui (design system). Lista completa em `.specs/codebase/STACK.md`.

**Referência visual:** `design/CentriumCheckout.pen` (Pencil) é a fonte de verdade de UI; `design/DESIGN-coinbase.md` documenta um precedente de estilo usado como referência de tokens.

## Scope

**v1 includes:**

- Autenticação/sessão via credenciais recebidas do ERP na URL + bootstrap de configuração (`.specs/features/autenticacao-sessao-bootstrap/`)
- Identificação e cadastro simplificado de cliente (`.specs/features/identificacao-cadastro-cliente/`)
- Busca/inserção de produto, carrinho e motor de precificação por faixa de quantidade (`.specs/features/carrinho-produto-precificacao/`)
- Formas/condições de pagamento, incluindo PIX (`.specs/features/pagamento/`)
- Finalização e suspensão da venda (NFCe) (`.specs/features/finalizacao-suspensao-venda/`)
- Importação e faturamento de DAV (`.specs/features/importacao-dav/`)
- Layout responsivo desktop/mobile (`.specs/features/layout-responsivo-mobile/`)
- Seleção de vendedor associado à venda (`.specs/features/selecao-vendedor/`)
- Menu gerencial: redirect para telas legadas do ERP (central de movimentação não fiscal, resumo de caixa) — só desktop, sem lógica própria do Checkout (ver `.specs/codebase/ARCHITECTURE.md`)

**Explicitly out of scope:**

- Reimpressão de NFCe já autorizada (fora de escopo — confirmado)
- Cancelamento de NFCe já autorizada pelo Checkout (só suspensão de venda em digitação)
- Funcionamento offline / PWA
- Tela de login manual (credenciais sempre chegam prontas via query params do ERP)
- Conceito de "produto pai" (fora do contrato de API consumido)

## Constraints

- Técnico: 100% do código é gerado por IA — reforça necessidade de contratos de dados explícitos e tipagem forte.
- Implantação: aplicação 100% containerizada via Docker (dev e produção), detalhes em `.specs/codebase/ARCHITECTURE.md`.
- Integrações locais (TEF, impressão) rodam fora do container, na máquina do PDV — sujeitas a políticas de Chrome Enterprise do cliente (ver `.specs/codebase/INTEGRATIONS.md`).
