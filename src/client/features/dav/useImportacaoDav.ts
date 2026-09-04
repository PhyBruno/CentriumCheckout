import { fonteDav, type DavListado } from '../../services/dav/davQueries';
import type { ImportacaoVendaDeps } from '../../services/importacao/importarVendaExistente';
import {
  useImportacaoDocumento,
  type ApiImportacaoDocumento,
} from '../importacao/useImportacaoDocumento';

/**
 * A importação de DAV sobre a ligação genérica de
 * `features/importacao/useImportacaoDocumento.ts`.
 *
 * O que era o corpo deste hook virou aquele módulo quando a feature 011 chegou
 * (AD-166): a ligação com o `vendaStore` é idêntica para DAV e para rascunho de
 * NFCe. O que resta aqui é o que é de fato do DAV — a origem `'DAV'` do
 * cliente e a `fonteDav` construída a partir da linha selecionada.
 */

export interface ApiImportacaoDav extends Omit<ApiImportacaoDocumento, 'importar'> {
  /**
   * Importa o DAV selecionado. Devolve `true` no sucesso e `false` quando nada
   * foi alterado — a janela de importação usa isso para decidir se fecha ou
   * permanece aberta com o erro já exibido (D7).
   */
  importar(dav: DavListado): Promise<boolean>;
}

export function useImportacaoDav(
  sobrescritas: Partial<ImportacaoVendaDeps> = {},
): ApiImportacaoDav {
  const { recusa, recusaAtual, importar } = useImportacaoDocumento('DAV', sobrescritas);

  return {
    recusa,
    recusaAtual,
    importar: (dav) => importar(fonteDav(dav)),
  };
}
