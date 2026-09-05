import { ArchiveRestore, ChevronRight, Download, ReceiptText, X } from 'lucide-react';
import { useEffect, type ComponentType, type ReactElement } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useFocoDeModal } from '@/lib/useFocoDeModal';
import { DURACAO_SAIDA_MODAL_MS, usePresenca } from '@/lib/usePresenca';

/**
 * Seletor do tipo de importação (Pencil, frame "PDV Online Web - Modal menu
 * importação", nó `yg9zq`/`L9uhIo`): 560 de largura, raio 24, cabeçalho de 78px
 * com ícone `download`, corpo de 24 de folga com duas opções de 20 de folga e
 * raio 16, rodapé de 60px só com "Cancelar".
 *
 * **Só agora existe.** A feature 006 abria a janela de DAV direto do atalho e
 * registrou o porquê em `BotaoMenuImportacao`: um seletor de duas opções com a
 * segunda morta obrigaria o operador a escolher numa lista de um item. Com a
 * 011 implementada, as duas opções são reais e o seletor entra no lugar que o
 * desenho sempre lhe deu.
 *
 * É **apresentacional**: não conhece `vendaStore`, rede nem regra de recusa —
 * quem decide se ele pode abrir é o atalho, e o que cada opção faz chega por
 * callback. Isso é o que permite às duas janelas seguirem independentes.
 */

export interface ModalMenuImportacaoProps {
  readonly aberto: boolean;
  readonly onFechar: () => void;
  readonly onEscolherDav: () => void;
  readonly onEscolherNFCe: () => void;
}

export function ModalMenuImportacao({
  aberto,
  onFechar,
  onEscolherDav,
  onEscolherNFCe,
}: ModalMenuImportacaoProps): ReactElement | null {
  const { montado, saindo } = usePresenca(aberto, DURACAO_SAIDA_MODAL_MS);
  const janelaRef = useFocoDeModal<HTMLDivElement>(aberto);

  // Mesmo ouvinte de `window` das outras janelas desta base: um `onKeyDown` no
  // backdrop só dispararia com o foco dentro do modal.
  useEffect(() => {
    if (!aberto) {
      return;
    }
    const aoTeclar = (evento: KeyboardEvent): void => {
      if (evento.key === 'Escape') {
        onFechar();
      }
    };
    window.addEventListener('keydown', aoTeclar);
    return () => {
      window.removeEventListener('keydown', aoTeclar);
    };
  }, [aberto, onFechar]);

  if (!montado) {
    return null;
  }

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex items-center justify-center bg-[color-mix(in_srgb,var(--cc-color-ink)_40%,transparent)] p-lg',
        saindo ? 'cc-backdrop-sai' : 'cc-backdrop-entra',
      )}
      data-testid="modal-menu-importacao"
    >
      <div
        ref={janelaRef}
        role="dialog"
        aria-modal="true"
        aria-label="Menu Importação"
        className={cn(
          'flex max-h-full w-full max-w-[560px] flex-col overflow-hidden rounded-xl border border-border bg-background shadow-lg',
          saindo ? 'cc-modal-sai' : 'cc-modal-entra',
        )}
      >
        <header className="flex h-[78px] shrink-0 items-center justify-between gap-sm border-b border-border px-lg">
          <div className="flex items-center gap-sm">
            <span className="flex size-[42px] shrink-0 items-center justify-center rounded-full bg-secondary">
              <Download className="size-5 text-primary" aria-hidden="true" />
            </span>
            <div className="flex flex-col gap-[2px]">
              <h2 className="text-xl font-semibold text-foreground">Menu Importação</h2>
              <p className="text-sm font-medium text-muted-foreground">
                Selecione o tipo de importação para continuar
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="icon-lg"
            className="shrink-0 rounded-full"
            aria-label="Fechar"
            onClick={onFechar}
          >
            <X className="size-4.5" aria-hidden="true" />
          </Button>
        </header>

        <div className="flex flex-col gap-[14px] p-lg">
          <OpcaoDeImportacao
            icone={ReceiptText}
            titulo="Importar DAV"
            descricao="Carregue uma DAV para a venda atual"
            testId="opcao-importar-dav"
            onEscolher={onEscolherDav}
          />
          <OpcaoDeImportacao
            icone={ArchiveRestore}
            titulo="Importar NFCe"
            descricao="Carregue uma NFCe suspensa para a venda atual"
            testId="opcao-importar-nfce"
            onEscolher={onEscolherNFCe}
          />
        </div>

        <footer className="flex h-[60px] shrink-0 items-center justify-end border-t border-border px-lg">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-9 w-28 gap-xs rounded-full text-sm font-semibold"
            onClick={onFechar}
          >
            <X className="size-3.5" aria-hidden="true" />
            Cancelar
          </Button>
        </footer>
      </div>
    </div>
  );
}

interface OpcaoDeImportacaoProps {
  readonly icone: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  readonly titulo: string;
  readonly descricao: string;
  readonly testId: string;
  readonly onEscolher: () => void;
}

/**
 * Uma das duas opções do seletor.
 *
 * É um `<button>`, e não um cartão com um `chevron` clicável: a linha inteira é
 * o alvo no desenho, e o `chevron` é só o sinal de que ela leva a outra tela.
 */
function OpcaoDeImportacao({
  icone: Icone,
  titulo,
  descricao,
  testId,
  onEscolher,
}: OpcaoDeImportacaoProps): ReactElement {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onEscolher}
      className={cn(
        'flex w-full items-center justify-between gap-[14px] rounded-lg border border-border bg-muted p-[20px] text-left',
        'outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50',
      )}
    >
      <span className="flex min-w-0 items-center gap-[14px]">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-secondary">
          <Icone className="size-[22px] text-primary" aria-hidden={true} />
        </span>
        <span className="flex min-w-0 flex-col gap-[2px]">
          <span className="truncate text-md font-semibold text-foreground">{titulo}</span>
          <span className="text-sm leading-[1.4] text-muted-foreground">{descricao}</span>
        </span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
    </button>
  );
}
