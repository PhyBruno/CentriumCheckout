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
  const { recusa, recusaAtual } = useImportacaoDav(deps);

  /**
   * Venda já iniciada — com cliente identificado ou item lançado — desabilita
   * o atalho (pedido do usuário, 2026-09-03), em vez de deixá-lo clicável para
   * recusar depois. O motivo não se perde: ele vai no `title`, e o caminho de
   * saída continua sendo o mesmo de sempre, cancelar a venda.
   */
  const bloqueado = recusa !== null;

  /**
   * A recusa é reaplicada no clique porque o estado pode mudar entre a
   * renderização e o gesto — e porque, sem ela, um call site que renderizasse
   * o botão habilitado por engano abriria a janela sobre uma venda em
   * digitação. A mesma regra ainda é reaplicada dentro de
   * `importarVendaExistente`.
   */
  function abrir(): void {
    const motivo = recusaAtual();
    if (motivo !== null) {
      gooeyToast.error(mensagemDeRecusa(motivo));
      return;
    }
    setAberto(true);
  }

  return (
    <>
      <button
        type="button"
        data-testid="botao-menu-importacao"
        disabled={bloqueado}
        {...(recusa === null ? {} : { title: mensagemDeRecusa(recusa) })}
        onClick={abrir}
        className={cn(
          'flex h-9 flex-1 items-center justify-center gap-xs rounded-full border border-border bg-card',
          'text-sm font-semibold whitespace-nowrap outline-none',
          'focus-visible:ring-[3px] focus-visible:ring-ring/50',
          bloqueado ? 'text-[var(--cc-color-muted-soft)]' : 'text-foreground',
        )}
      >
        {/* Mesmo par de estados de `BotaoCancelarVenda`, o atalho vizinho da
            faixa: desabilitado, o ícone perde a cor de corpo e acompanha o
            rótulo apagado. */}
        <FileText
          className={cn('size-4', bloqueado ? '' : 'text-[var(--cc-color-body)]')}
          aria-hidden="true"
        />
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
