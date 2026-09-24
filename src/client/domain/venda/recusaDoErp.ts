/**
 * Classificação da recusa que o ERP devolve em `messages` (AD-239).
 *
 * O `FaturarNFCe` recusa por motivos de natureza oposta, e o texto é a única
 * coisa que os distingue — o `Id` é o genérico `9999` em todos os casos medidos:
 *
 * - **validação da venda** (saldo, regra de NFCe): a venda continua no caixa e o
 *   operador ajusta e tenta de novo;
 * - **cenário tributário não encontrado**: a falha é de cadastro fiscal do ERP.
 *   Não há o que ajustar no Checkout — a venda sai do caixa e a correção é feita
 *   no ERP (decisão do usuário, 2026-09-16).
 *
 * Domínio puro: sem React, Zustand nem rede.
 */

/**
 * Normaliza para a comparação: minúsculas e sem acento. O ERP já mandou
 * "Cenário Tributário não foi Encontrada" com acento; a mesma frase sem acento
 * (outra versão, outro banco) precisa cair no mesmo desfecho.
 */
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/**
 * `true` quando a recusa é "Busca realizada pelo seguinte Cenário Tributário
 * não foi Encontrada" (texto medido no ERP real em 2026-09-16).
 */
export function ehRecusaDeCenarioTributario(mensagem: string): boolean {
  return /cenario\s+tributario/.test(normalizar(mensagem));
}
