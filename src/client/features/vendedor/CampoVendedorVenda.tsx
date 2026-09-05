import { Search, UserRound } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useVendaStore } from '../../stores/vendaStore';
import { ModalBuscaVendedor } from './ModalBuscaVendedor';
import { rotuloDoVendedor, useVendedorAtual } from './useVendedor';

/**
 * Vendedor da venda (T014) — réplica do par "Campo vendedor NFCe" + "Botão lupa
 * vendedor NFCe" do Pencil (nós `AJhcG`/`nRR9Q` em `design/CentriumCheckout.pen`),
 * que o desenho posiciona na **segunda linha** do card "Cliente da venda
 * expansível", ao lado do campo Contato: caixa de 42px, raio 12, fundo
 * `$surface-soft`, borda `$hairline`, ícone `user-round`, rótulo "Vendedor NFCe"
 * e o nome do vendedor; à direita, a lupa circular de 42px que abre
 * `ModalBuscaVendedor`.
 *
 * **Sem indicador de origem** (I5, AD-053): o campo mostra só o nome, sem
 * distinguir o vendedor pré-selecionado do PDV (AD-032) de uma escolha do
 * operador. Os dois únicos estados que ele diferencia são a **ausência** de
 * vendedor (`FR-006`/`VEND-07` — empresa sem default configurado) e a ausência
 * do **nome**, que cai em `"Vendedor #<codigo>"` (`AD-095`, `research.md` D4).
 *
 * O componente não decide o bloqueio pós-pagamento: quem decide é
 * `selecionarVendedor` no slice, que é no-op com aviso quando
 * `podeMutarCarrinho()` é falso (I4). Manter a lupa clicável é deliberado — o
 * operador precisa poder abrir a lista e ver quem está na venda mesmo depois de
 * um pagamento aprovado.
 */
export function CampoVendedorVenda(): ReactElement {
  const vendedorAtual = useVendedorAtual();
  const selecionarVendedor = useVendaStore((estado) => estado.selecionarVendedor);
  const [modalAberto, setModalAberto] = useState(false);

  const rotulo = rotuloDoVendedor(vendedorAtual);

  return (
    /* Campo e lupa a 10px um do outro, como o desenho (`AJhcG` termina em
       914px, `nRR9Q` começa em 924px). O par inteiro é `flex-1` porque quem o
       monta é a linha de campos do card de cliente, e lá ele divide a largura
       com o campo Contato, de 243px fixos. */
    <div className="flex min-w-0 flex-1 items-center gap-[10px]">
      <div className="flex h-[42px] min-w-0 flex-1 items-center gap-[9px] rounded-lg border border-border bg-[var(--cc-color-surface-soft)] px-sm">
        <UserRound className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="flex min-w-0 flex-1 flex-col gap-[1px]">
          <span className="text-[10px] font-semibold text-muted-foreground">Vendedor NFCe</span>
          {/* Sem vendedor, o campo se comporta como placeholder — texto e cor
              secundária, como o "Não informado" do contato: a venda nasce assim
              quando a empresa não configurou vendedor default, e o operador
              precisa ler que falta escolher, não um traço ambíguo. */}
          <span
            className={cn(
              'truncate text-sm font-semibold',
              rotulo === null ? 'text-muted-foreground' : 'text-foreground',
            )}
            data-testid="nome-vendedor"
          >
            {rotulo ?? 'Selecionar vendedor'}
          </span>
        </span>
      </div>

      <Button
        type="button"
        variant="secondary"
        size="icon-lg"
        className="size-[42px] shrink-0 rounded-full"
        data-testid="abrir-busca-vendedor"
        aria-label="Buscar vendedor"
        onClick={() => {
          setModalAberto(true);
        }}
      >
        <Search className="size-4" aria-hidden="true" />
      </Button>

      <ModalBuscaVendedor
        aberto={modalAberto}
        onFechar={() => {
          setModalAberto(false);
        }}
        onVendedorSelecionado={selecionarVendedor}
      />
    </div>
  );
}
