import { useSessionStore } from '../../stores/sessionStore';
import { useVendaStore } from '../../stores/vendaStore';
import type { VendedorVenda } from '../../stores/slices/vendedorSlice';

/**
 * Leituras de sessão e de venda usadas pelas duas superfícies de vendedor
 * (campo da venda e modal de busca).
 *
 * `useQtdMinCharParaConsulta` é repetido aqui, e não importado de
 * `features/cliente`/`features/carrinho`, seguindo a convenção já estabelecida
 * por essas duas features: cada uma lê o próprio piso do `sessionStore`, sem que
 * uma superfície de UI passe a depender de outra. O dado é o mesmo campo do
 * bootstrap (AD-024) — a duplicação é de uma linha de seletor, não de regra.
 */

/** Piso de caracteres da busca livre — vem do ERP (AD-024), nunca hardcoded. */
export function useQtdMinCharParaConsulta(): number | null {
  return useSessionStore((estado) => estado.registro?.SessaoUsuario.QtdMinCharParaConsulta ?? null);
}

/** Vendedor associado à venda em andamento, ou `null` (`FR-006`/`VEND-07`). */
export function useVendedorAtual(): VendedorVenda | null {
  return useVendaStore((estado) => estado.vendedorAtual);
}

/**
 * O que o campo exibe: o nome do vendedor, ou `"Vendedor #<codigo>"` quando o
 * nome não veio junto (retomada de rascunho/importação de DAV — `AD-095`,
 * `research.md` D4).
 *
 * Função pura e exportada para o teste poder exercitá-la sem montar componente.
 */
export function rotuloDoVendedor(vendedor: VendedorVenda | null): string | null {
  if (vendedor === null) {
    return null;
  }
  if (vendedor.nome === null || vendedor.nome === '') {
    return `Vendedor #${String(vendedor.codigo)}`;
  }
  return vendedor.nome;
}
