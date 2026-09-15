import { FileText } from 'reicon-react';
import type { ReactElement } from 'react';
import { notificar } from '@/lib/notificar';
import { cn } from '@/lib/utils';
import { atributosDeBloqueio } from '@/lib/bloqueio';
import {
  mensagemDeRecusa,
  type ImportacaoVendaDeps,
} from '../../services/importacao/importarVendaExistente';
import { ModalImportacaoDav } from '../dav/ModalImportacaoDav';
import { useJanelasStore } from '../../stores/janelasStore';
import { ModalRecuperacaoNFCe } from '../recuperacao/ModalRecuperacaoNFCe';
import { ModalMenuImportacao } from './ModalMenuImportacao';
import { useRecusaDeImportacao } from './useImportacaoDocumento';

/**
 * Atalho "Menu Importação" da faixa "Atalhos da venda" (Pencil, nó `i7nka`):
 * pílula de 36px, fundo branco com hairline, ícone `file-text` de 16px em
 * `#5B616E` e rótulo Inter 12px peso 600 — a mesma pílula de
 * `BotaoCancelarVenda`, que é o primeiro atalho da mesma faixa.
 *
 * **Abre o seletor** (`ModalMenuImportacao`, nó `yg9zq`), que era o que o
 * desenho sempre previu. A feature 006 o pulava de propósito, abrindo a janela
 * de DAV direto, porque a segunda opção — "Importar NFCe" — ainda não existia e
 * o seletor teria um item morto. Com a 011 implementada (AD-166) a condição que
 * justificava o atalho direto deixou de valer.
 *
 * Mora em `features/importacao/`, e não mais em `features/dav/`: ele já não
 * pertence a nenhuma das duas features, é o ponto de entrada comum das duas.
 *
 * **O estado de abertura mora no `janelasStore`** desde a feature 016. Antes
 * era um `useState` daqui — e continua não sendo de `BarraAtalhosVenda`, que é
 * da 004 e não deve conhecer o ciclo de vida destes modais —, mas o F1/F2 é
 * registrado em `AppShell` e precisava alcançar a mesma janela. Os modais
 * continuam **renderizados** aqui: o atalho só escreve no store, e quem desenha
 * é quem sempre desenhou.
 */
export interface BotaoMenuImportacaoProps {
  /** Portas injetáveis em teste (stub da feature 012, rede). */
  readonly deps?: Partial<ImportacaoVendaDeps>;
}

export function BotaoMenuImportacao({ deps }: BotaoMenuImportacaoProps = {}): ReactElement {
  // Um valor só para as três janelas, e não três booleanos — a exclusão mútua
  // que este componente já garantia agora é do tipo do store (I3 da 016).
  const janela = useJanelasStore((estado) => estado.janela);
  const abrirJanela = useJanelasStore((estado) => estado.abrir);
  const substituirJanela = useJanelasStore((estado) => estado.substituir);
  const fechar = useJanelasStore((estado) => estado.fechar);
  const { recusa, recusaAtual } = useRecusaDeImportacao();

  /**
   * Venda já iniciada — com cliente identificado, item lançado (cancelado
   * inclusive), condição escolhida ou forma aplicada — bloqueia o atalho
   * (pedido do usuário, 2026-09-03, reafirmado em 2026-09-04 para a 011), pelo
   * padrão de bloqueio explicativo desta base (`lib/bloqueio.ts`):
   * `aria-disabled`, e não `disabled`, para que clicar informe o motivo em vez
   * de não fazer nada.
   */
  const bloqueado = recusa === null ? null : mensagemDeRecusa(recusa);

  /**
   * A recusa é reaplicada no clique — não é só a resposta ao operador. Ela
   * também cobre o estado que muda entre a renderização e o gesto, e um call
   * site que renderizasse o botão habilitado por engano. A mesma regra ainda é
   * reaplicada dentro de `importarVendaExistente`.
   */
  function abrir(): void {
    const motivo = recusaAtual();
    if (motivo !== null) {
      notificar.erro(mensagemDeRecusa(motivo));
      return;
    }
    abrirJanela('seletor-importacao');
  }

  const depsOpcional = deps === undefined ? {} : { deps };

  return (
    <>
      <button
        type="button"
        data-testid="botao-menu-importacao"
        {...atributosDeBloqueio(bloqueado)}
        onClick={abrir}
        className={cn(
          'flex h-9 flex-1 items-center justify-center gap-xs rounded-full border border-border bg-card',
          'text-sm font-semibold whitespace-nowrap outline-none',
          'focus-visible:ring-[3px] focus-visible:ring-ring/50',
          bloqueado === null
            ? 'text-foreground'
            : 'cursor-not-allowed text-[var(--cc-color-muted-soft)]',
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

      <ModalMenuImportacao
        aberto={janela === 'seletor-importacao'}
        onFechar={fechar}
        // A escolha **substitui** o seletor em vez de empilhar uma janela sobre
        // a outra: são dois passos do mesmo gesto, e dois modais sobrepostos
        // deixariam dois backdrops e duas armadilhas de ESC na tela.
        onEscolherDav={() => {
          substituirJanela('dav');
        }}
        onEscolherNFCe={() => {
          substituirJanela('nfce');
        }}
      />

      <ModalImportacaoDav aberto={janela === 'dav'} onFechar={fechar} {...depsOpcional} />

      <ModalRecuperacaoNFCe aberto={janela === 'nfce'} onFechar={fechar} {...depsOpcional} />
    </>
  );
}
