import { ArrowSwapHorizontal, Category, ChartBar, ChevronRight, X } from 'reicon-react';
import { useEffect, type ComponentType, type ReactElement } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useFocoDeModal } from '@/lib/useFocoDeModal';
import { DURACAO_SAIDA_MODAL_MS, usePresenca } from '@/lib/usePresenca';
import type { DestinoGerencial } from '../../../shared/gerencial';

/**
 * Seletor do Menu gerencial (Pencil, frame "PDV Online Web - Modal menu
 * gerencial", nó `viV0S`/`D4wrlS`): 560 de largura, raio 24, cabeçalho de 78px
 * com ícone `layout-grid`, corpo de 24 de folga com duas opções de 20 de folga
 * e raio 16.
 *
 * O desenho é o mesmo do "Modal menu importação" (`yg9zq`) até nas medidas — o
 * usuário pediu explicitamente que fosse assim (2026-09-10). Ainda assim os
 * dois modais são arquivos separados, e não um componente com props: é a
 * convenção desta base, que dá casca própria a cada janela
 * (`ModalImportacaoDav`, `ModalRecuperacaoNFCe`, `ModalMenuImportacao`), e as
 * duas features não compartilham nem opções nem regra de abertura.
 *
 * Ícones traduzidos de lucide (nome no `.pen`) para reicon (AD-201):
 * `layout-grid` → `Category`, `arrow-left-right` → `ArrowSwapHorizontal`,
 * `chart-column` → `ChartBar`.
 *
 * É **apresentacional**: não conhece `vendaStore`, rede nem `window.open` — o
 * destino escolhido sai por callback.
 */

export interface ModalMenuGerencialProps {
  readonly aberto: boolean;
  readonly onFechar: () => void;
  readonly onEscolher: (destino: DestinoGerencial) => void;
}

export function ModalMenuGerencial({
  aberto,
  onFechar,
  onEscolher,
}: ModalMenuGerencialProps): ReactElement | null {
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
      data-testid="modal-menu-gerencial"
    >
      <div
        ref={janelaRef}
        role="dialog"
        aria-modal="true"
        aria-label="Menu gerencial"
        className={cn(
          'flex max-h-full w-full max-w-[560px] flex-col overflow-hidden rounded-xl border border-border bg-background shadow-lg',
          saindo ? 'cc-modal-sai' : 'cc-modal-entra',
        )}
      >
        <header className="flex h-[78px] shrink-0 items-center justify-between gap-sm border-b border-border px-lg">
          <div className="flex items-center gap-sm">
            <span className="flex size-[42px] shrink-0 items-center justify-center rounded-full bg-secondary">
              <Category className="size-5 text-primary" aria-hidden="true" />
            </span>
            <div className="flex flex-col gap-[2px]">
              <h2 className="text-xl font-semibold text-foreground">Menu gerencial</h2>
              <p className="text-sm font-medium text-muted-foreground">
                Selecione uma opção para continuar
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
          <OpcaoGerencial
            icone={ArrowSwapHorizontal}
            titulo="Central de movimentação não fiscal"
            descricao="Sangria, suprimento e outras movimentações de caixa"
            testId="opcao-movimento-nao-fiscal"
            onEscolher={() => {
              onEscolher('movimento-nao-fiscal');
            }}
          />
          <OpcaoGerencial
            icone={ChartBar}
            titulo="Relatório de resumo de caixa"
            descricao="Totais, formas de pagamento e fechamento do caixa"
            testId="opcao-resumo-caixa"
            onEscolher={() => {
              onEscolher('resumo-caixa');
            }}
          />
        </div>

        {/* Sem rodapé, pela mesma AD-170 do menu de importação: o "Cancelar" que
            o frame `viV0S` desenha faz exatamente o que o "X" do cabeçalho já
            faz, e removê-lo deixaria uma faixa de 60px vazia com hairline —
            pior do que não existir. Divergência deliberada do desenho. */}
      </div>
    </div>
  );
}

interface OpcaoGerencialProps {
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
function OpcaoGerencial({
  icone: Icone,
  titulo,
  descricao,
  testId,
  onEscolher,
}: OpcaoGerencialProps): ReactElement {
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
