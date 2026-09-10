import { Search, User } from 'reicon-react';
import { useState, type ReactElement, type RefObject } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useFocoVendaStore } from '../../stores/focoVendaStore';
import { useVendaStore } from '../../stores/vendaStore';
import { ModalBuscaVendedor, type VendedorEscolhido } from './ModalBuscaVendedor';
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
export interface CampoVendedorVendaProps {
  /**
   * Ref da **lupa**, para quem monta este par poder focá-la de fora.
   *
   * O foco não é resolvido aqui de propósito (achado ao exercitar contra o ERP
   * real, 2026-09-10): este componente vive **dentro** do bloco colapsável de
   * `CampoClienteVenda`, que nasce recolhido e é `inert` enquanto isso — e um
   * `focus()` em subtree `inert` é ignorado pelo navegador, em silêncio. Com a
   * lupa focada por um efeito local, a barra de entrada rápida recusava a
   * inserção com o aviso certo e o foco simplesmente não saía do campo de
   * código.
   *
   * Quem precisa **expandir antes de focar** é o dono do estado de expansão, e
   * esse é o card de cliente — que já faz exatamente isso para o campo de
   * documento. Entregar o ref para lá é o que põe as duas coisas na mesma mão.
   *
   * `CampoVendedorVenda` segue montável sem a prop (o spec o exercita solto).
   */
  readonly refLupa?: RefObject<HTMLButtonElement | null>;
}

/**
 * O destino do foco é a **lupa**, não a caixa do nome: o par que o Pencil
 * desenha tem um único controle focável, e é ele que abre `ModalBuscaVendedor`.
 * Focar a caixa exigiria dar `tabindex` a um `<div>` de leitura, que anunciaria
 * ao leitor de tela um controle que não faz nada.
 */
export function CampoVendedorVenda({ refLupa }: CampoVendedorVendaProps = {}): ReactElement {
  const vendedorAtual = useVendedorAtual();
  const selecionarVendedor = useVendaStore((estado) => estado.selecionarVendedor);
  const focarCodigoProduto = useFocoVendaStore((estado) => estado.focarCodigoProduto);
  const [modalAberto, setModalAberto] = useState(false);

  const rotulo = rotuloDoVendedor(vendedorAtual);

  /**
   * Vendedor escolhido: o modal já fecha sozinho (`ModalBuscaVendedor`,
   * clique definitivo) e o foco volta ao código de barras do produto (pedido
   * do usuário, 2026-09-08) — mesmo destino de `concluirIdentificacao` em
   * `CampoClienteVenda`, porque os dois terminam no mesmo ponto do fluxo do
   * caixa: o próximo gesto é bipar um item.
   */
  function aoSelecionarVendedor(vendedor: VendedorEscolhido): void {
    selecionarVendedor(vendedor);
    focarCodigoProduto();
  }

  return (
    /* Campo e lupa a 10px um do outro, como o desenho (`AJhcG` termina em
       914px, `nRR9Q` começa em 924px). O par inteiro é `flex-1` porque quem o
       monta é a linha de campos do card de cliente, e lá ele divide a largura
       com o campo Contato, de 243px fixos. */
    <div className="flex min-w-0 flex-1 items-center gap-[10px]">
      <div className="flex h-[42px] min-w-0 flex-1 items-center gap-[9px] rounded-lg border border-border bg-[var(--cc-color-surface-soft)] px-sm">
        <User className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
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
        ref={refLupa}
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
        onVendedorSelecionado={aoSelecionarVendedor}
      />
    </div>
  );
}
