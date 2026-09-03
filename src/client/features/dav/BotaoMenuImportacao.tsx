import { FileText } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { gooeyToast } from 'goey-toast';
import { cn } from '@/lib/utils';
import { mensagemDeRecusa, type ImportacaoVendaDeps } from '../../services/dav/davQueries';
import { ModalImportacaoDav } from './ModalImportacaoDav';
import { useImportacaoDav } from './useImportacaoDav';

/**
 * Atalho "Menu Importação" da faixa "Atalhos da venda" (Pencil, nó `i7nka`):
 * pílula de 36px, fundo branco com hairline, ícone `file-text` de 16px em
 * `#5B616E` e rótulo Inter 12px peso 600 — a mesma pílula de
 * `BotaoCancelarVenda`, que é o primeiro atalho da mesma faixa.
 *
 * **Abre direto a janela de DAV**, e não o "Modal menu importação" (nó `yg9zq`)
 * que o Pencil desenha entre os dois. Aquele modal é um seletor de duas opções
 * — "Importar DAV" (esta feature) e "Importar NFCe" (feature 011, ainda não
 * implementada) —, e hoje ele obrigaria o operador a escolher numa lista de uma
 * opção só, com a outra morta na tela. Quando a 011 existir, o seletor entra
 * aqui e passa a abrir esta janela; a `ModalImportacaoDav` não muda.
 *
 * O estado de abertura mora neste componente, não em `BarraAtalhosVenda`: a
 * faixa de atalhos é da feature 004 e não deve conhecer o ciclo de vida de um
 * modal da 006.
 */
export interface BotaoMenuImportacaoProps {
  /** Portas injetáveis em teste (stubs das features 008/012, rede). */
  readonly deps?: Partial<ImportacaoVendaDeps>;
}

export function BotaoMenuImportacao({ deps }: BotaoMenuImportacaoProps = {}): ReactElement {
  const [aberto, setAberto] = useState(false);
  const { recusaAtual } = useImportacaoDav(deps);

  /**
   * A recusa acontece **no clique**, não no confirmar (pedido do usuário,
   * 2026-09-03): o operador precisa saber que não pode importar antes de
   * escolher um documento, não depois.
   *
   * O botão continua habilitado de propósito. Desabilitado ele não explicaria
   * nada — e o motivo (venda com item, cliente identificado, pagamento
   * aprovado, documento já importado) é exatamente o que o operador precisa
   * ler para saber que a saída é cancelar a venda.
   */
  function abrir(): void {
    const recusa = recusaAtual();
    if (recusa !== null) {
      gooeyToast.error(mensagemDeRecusa(recusa));
      return;
    }
    setAberto(true);
  }

  return (
    <>
      <button
        type="button"
        data-testid="botao-menu-importacao"
        onClick={abrir}
        className={cn(
          'flex h-9 flex-1 items-center justify-center gap-xs rounded-full border border-border bg-card',
          'text-sm font-semibold whitespace-nowrap text-foreground outline-none',
          'focus-visible:ring-[3px] focus-visible:ring-ring/50',
        )}
      >
        <FileText className="size-4 text-[var(--cc-color-body)]" aria-hidden="true" />
        Menu Importação
      </button>

      <ModalImportacaoDav
        aberto={aberto}
        onFechar={() => {
          setAberto(false);
        }}
        {...(deps === undefined ? {} : { deps })}
      />
    </>
  );
}
