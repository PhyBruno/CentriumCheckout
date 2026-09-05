import { gooeyToast } from 'goey-toast';
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
 * `'RASCUNHO'` do cliente, a `fonteRascunho` e a série da sessão — o resto do
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
    // `Serienota` é **sempre** `SessaoUsuario.CadSerieNFCe`, do bootstrap, nunca
    // um valor vindo da listagem (`research.md` D4) — a listagem sequer devolve
    // série. Lido no momento da ação, e não na montagem do hook, pelo mesmo
    // motivo do contexto de precificação: a sessão pode ter sido recarregada
    // com a janela já aberta.
    const registro = useSessionStore.getState().registro;
    if (registro === null) {
      // Sem bootstrap não há série, e chamar `CarregarNFCe` com série vazia
      // devolveria "não encontrado" para um rascunho que existe — erro que o
      // operador leria como documento perdido. Recusar aqui nomeia a causa
      // real.
      gooeyToast.error('A sessão do operador não está carregada. Reabra o Checkout pelo ERP.');
      return false;
    }

    return importar(
      fonteRascunho({
        numeroNota: rascunho.numeroNota,
        cliente: rascunho.cliente,
        // O nome do vendedor só existe na listagem — o documento devolve o
        // código (AD-095). Capturá-lo aqui é o que permite pré-selecionar o
        // vendedor com nome, e não só com número (`FR-009`).
        vendedor: rascunho.vendedor,
        serie: registro.SessaoUsuario.CadSerieNFCe,
      }),
    );
  }

  return { recusa, recusaAtual, retomar };
}
