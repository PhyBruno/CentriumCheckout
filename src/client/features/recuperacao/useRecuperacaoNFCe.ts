import { notificar } from '@/lib/notificar';
import type { ImportacaoVendaDeps } from '../../services/importacao/importarVendaExistente';
import { fonteRascunho, type RascunhoListado } from '../../services/recuperacao/recuperacaoQueries';
import { useSessionStore } from '../../stores/sessionStore';
import {
  useImportacaoDocumento,
  type ApiImportacaoDocumento,
} from '../importacao/useImportacaoDocumento';

/**
 * A recuperação de rascunho de NFCe sobre a ligação genérica de
 * `features/importacao/useImportacaoDocumento.ts` (T022).
 *
 * Espelho de `useImportacaoDav`: o que é particular desta feature são a origem
 * `'RASCUNHO'` do cliente, a `fonteRascunho` e a série do rascunho — o resto do
 * comportamento é o compartilhado (AD-166).
 */

export interface ApiRecuperacaoNFCe extends Omit<ApiImportacaoDocumento, 'importar'> {
  /**
   * Retoma o rascunho selecionado. Devolve `true` no sucesso e `false` quando
   * nada foi alterado — a janela usa isso para decidir se fecha ou permanece
   * aberta com o erro já exibido.
   */
  retomar(rascunho: RascunhoListado): Promise<boolean>;
}

export function useRecuperacaoNFCe(
  sobrescritas: Partial<ImportacaoVendaDeps> = {},
): ApiRecuperacaoNFCe {
  const { recusa, recusaAtual, importar } = useImportacaoDocumento('RASCUNHO', sobrescritas);

  async function retomar(rascunho: RascunhoListado): Promise<boolean> {
    // `Serienota` é a série **da linha da listagem** (AD-235): o contrato de
    // 2026-09-14 devolve `Rascunho[].Serie`, e é ela que identifica o documento
    // junto com o número — no preview, `SessaoUsuario.CadSerieNFCe` vem vazia.
    // Isto supera `research.md` D4, que decidia pela série da sessão quando a
    // listagem não trazia nenhuma. A da sessão sobra só como fallback de linha
    // sem série, lida no momento da ação (a sessão pode ter sido recarregada
    // com a janela aberta).
    const serie =
      rascunho.serie.trim() !== ''
        ? rascunho.serie
        : (useSessionStore.getState().registro?.SessaoUsuario.CadSerieNFCe ?? '');
    if (serie.trim() === '') {
      // Chamar `CarregarNFCe` sem série só devolveria "Série é obrigatório" do
      // ERP; recusar aqui nomeia a causa sem gastar a chamada.
      notificar.erro(
        'Este rascunho veio sem série e o ponto de venda não tem série configurada. Verifique no ERP.',
      );
      return false;
    }

    // Número, série e vendedor da linha. O vendedor é fallback de
    // `mapearVendaExistente` (AD-172/AD-235): o que permite pré-selecionar o
    // vendedor com nome (`FR-009`) e com código quando o documento vem com 0.
    return importar(fonteRascunho({ ...rascunho, serie }));
  }

  return { recusa, recusaAtual, retomar };
}
