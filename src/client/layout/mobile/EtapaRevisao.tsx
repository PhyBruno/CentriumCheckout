import { CircleCheck, CreditCard, List, Percent, UserRound } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';
import { AcoesFinaisVenda } from '../../features/finalizacao-suspensao/AcoesFinaisVenda';
import { ListaPagamentosAplicados } from '../../features/pagamento/ListaPagamentosAplicados';
import { rotuloDoVendedor, useVendedorAtual } from '../../features/vendedor/useVendedor';
import { formatarCentavos } from '../../domain/precificacao/dinheiro';
import { linhasAtivas, totalVenda } from '../../domain/precificacao/linha';
import { useVendaStore } from '../../stores/vendaStore';

/**
 * Etapa 3 do wizard — "Revisão e finalização" (nó `V3SMF` do Pencil, T017).
 *
 * Duas leituras e uma ação: a conferência (cliente, vendedor, produtos, ajuste),
 * as formas de pagamento aplicadas e o botão de finalizar.
 *
 * **Nenhum número é calculado aqui.** Subtotal sai de `totalVenda` (003),
 * contagem de linhas de `linhasAtivas` (003), o valor do desconto de capa já
 * vem resolvido do slice (`descontoCapa.valorResolvido`, 008) e o total
 * líquido/troco fica com o cartão escuro do wizard (`TotalDaVenda`). Repetir
 * qualquer uma dessas contas aqui seria exatamente a duplicação que `SC-001`
 * proíbe.
 *
 * **Cancelar venda não mora nesta etapa**: no layout compacto ele é a lixeira do
 * cabeçalho (AD-089, nó `T9VTw`), montada por `MobileWizard`. Duplicá-lo aqui
 * daria duas superfícies para o mesmo gesto destrutivo na mesma tela.
 */
export function EtapaRevisao(): ReactElement {
  const clienteAtual = useVendaStore((estado) => estado.clienteAtual);
  const linhas = useVendaStore((estado) => estado.linhas);
  const descontoCapa = useVendaStore((estado) => estado.descontoCapa);
  const rotuloVendedor = rotuloDoVendedor(useVendedorAtual());

  const ativas = linhasAtivas(linhas);
  const quantidadeDeItens = ativas.length;

  return (
    <div className="flex flex-col gap-sm" data-testid="etapa-revisao">
      {/* Cartão "Resumo conferência etapa 3 mobile" (nó `SDwQ6`). */}
      <section className="flex flex-col gap-sm rounded-[18px] border border-border bg-card p-[14px]">
        <header className="flex items-center gap-xs">
          <CircleCheck className="size-4.5 shrink-0 text-foreground" aria-hidden="true" />
          <h2 className="text-base font-bold text-foreground">Conferência</h2>
        </header>

        <LinhaConferencia
          icone={<UserRound className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
          rotulo="Cliente"
          testId="conferencia-cliente"
        >
          {/* "Não identificado" é o estado real de uma venda ao consumidor, não
              um erro: o ERP aceita NFCe sem destinatário. */}
          {clienteAtual === null ? 'Não identificado' : clienteAtual.nome}
        </LinhaConferencia>

        <LinhaConferencia
          icone={<UserRound className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
          rotulo="Vendedor"
          testId="conferencia-vendedor"
        >
          {rotuloVendedor ?? 'Não selecionado'}
        </LinhaConferencia>

        <LinhaConferencia
          icone={<List className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
          rotulo="Produtos"
          testId="conferencia-produtos"
        >
          {/* Contagem e subtotal em `font-mono` (Geist Mono), como todo valor
              tabular do produto; o texto ao redor fica em Inter. Sem o `<span>`
              a linha inteira herdaria a mono, inclusive "itens" e "Subtotal". */}
          <span className="font-mono tabular-nums">{String(quantidadeDeItens)}</span>{' '}
          {quantidadeDeItens === 1 ? 'item' : 'itens'} • Subtotal{' '}
          <span className="font-mono tabular-nums">{formatarCentavos(totalVenda(linhas))}</span>
        </LinhaConferencia>

        {/* A linha de ajuste some quando não há desconto de capa: uma linha
            "Ajuste: —" ocuparia espaço de tela dizendo que nada aconteceu. */}
        {descontoCapa !== null && (
          <LinhaConferencia
            icone={<Percent className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
            rotulo="Ajuste"
            testId="conferencia-ajuste"
          >
            {descontoCapa.modo === 'PERCENTUAL' ? (
              <>
                Desconto{' '}
                <span className="font-mono tabular-nums">{String(descontoCapa.entrada)}%</span>
              </>
            ) : (
              'Desconto'
            )}{' '}
            •{' '}
            <span className="font-mono tabular-nums">
              − {formatarCentavos(descontoCapa.valorResolvido)}
            </span>
          </LinhaConferencia>
        )}
      </section>

      {/* Cartão "Pagamentos revisão etapa 3 mobile" (nó `SOgEV`): a **mesma**
          lista da etapa 2, sem variante de leitura — o operador ainda pode
          corrigir uma forma aqui, e um clone somente-leitura duplicaria as
          regras de exclusão/status que a 008 já implementa. */}
      <section className="flex flex-col gap-sm rounded-[18px] border border-border bg-card p-[14px]">
        <header className="flex items-center gap-xs">
          <CreditCard className="size-4.5 shrink-0 text-foreground" aria-hidden="true" />
          <h2 className="text-base font-bold text-foreground">Pagamentos</h2>
        </header>

        <ListaPagamentosAplicados />
      </section>

      {/* Nó `Tzmbk` "Botão finalizar etapa 3 mobile": é `AcoesFinaisVenda` (004),
          com todas as travas que ela já aplica — saldo coberto, vendedor
          associado, veredito favorável da 014 e trava de reenvio. */}
      <AcoesFinaisVenda />
    </div>
  );
}

interface LinhaConferenciaProps {
  readonly icone: ReactNode;
  readonly rotulo: string;
  readonly testId: string;
  readonly children: ReactNode;
}

/** Uma linha do resumo (nós `N4N7IF`/`RnRFc`/`sCpCa`): `$surface-soft`, raio 12. */
function LinhaConferencia({
  icone,
  rotulo,
  testId,
  children,
}: LinhaConferenciaProps): ReactElement {
  return (
    <div
      className="flex items-center gap-2.5 rounded-xl bg-[var(--cc-color-surface-soft)] px-sm py-2"
      data-testid={testId}
    >
      {icone}
      <span className="flex min-w-0 flex-1 flex-col gap-[1px]">
        <span className="text-[10px] font-bold text-muted-foreground">{rotulo}</span>
        <span className="truncate text-base font-semibold text-foreground">{children}</span>
      </span>
    </div>
  );
}
