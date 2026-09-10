import { CheckCircle } from 'reicon-react';
import type { ReactElement } from 'react';
import { cn } from '@/lib/utils';
import { acaoBloqueavel, atributosDeBloqueio, type MotivoBloqueio } from '@/lib/bloqueio';

/**
 * Botão "Finalizar venda" (T018, AD-089).
 *
 * Réplica do nó "Botão finalizar venda" do frame "PDV Online Web - Valor
 * Faltante"/"…- Pagamento" do Pencil (`design/CentriumCheckout.pen`, export em
 * `design/HTML - Pencil/CentriumCheckout.html`): pílula de 48px de altura,
 * largura total, ícone `circle-check` de 20px à esquerda, rótulo Inter 15px
 * peso 700, gap de 9px.
 *
 * Estado habilitado e desabilitado são **dois estados desenhados**, não uma
 * opacidade: habilitado é `#2563EB`/branco (`--primary`/`--primary-foreground`);
 * desabilitado é `#EEF0F3`/`#7C828A` (`--secondary`/`--cc-color-muted`) — foi
 * assim que os dois frames do Pencil desenharam o botão, e é o que comunica ao
 * operador que falta algo para a venda poder ser emitida (`FR-014`).
 *
 * Presentacional de propósito: quem possui a máquina de estados é
 * `AcoesFinaisVenda`, para não existirem duas instâncias do hook orquestrador
 * disputando a mesma venda.
 */
export interface BotaoFinalizarVendaProps {
  readonly onFinalizar: () => void;
  /** Envio em curso — evita o segundo clique antes do re-render. */
  readonly enviando?: boolean;
  /**
   * **Por que** a finalização está bloqueada, ou `null` quando está liberada
   * (correção do usuário, 2026-09-10).
   *
   * Era um `boolean`, e essa era a falha: quatro travas diferentes
   * (saldo em aberto, veredito da validação prévia, falha de rede, venda sem
   * vendedor) colapsavam num único `disabled`, e o operador não tinha como
   * saber qual delas pegou — nem o clique respondia, porque `disabled` nativo
   * não dispara evento. O sintoma relatado foi exatamente esse: botão apagado
   * com o pagamento cobrindo o total, sendo que a trava real era o vendedor
   * (`VendedorCodigo = 0` no tenant, `vendedorAtual = null`).
   *
   * Agora segue o padrão da base (`lib/bloqueio.ts`): `aria-disabled` no lugar
   * de `disabled`, e o clique notifica o motivo em vez de não fazer nada.
   */
  readonly motivoBloqueio?: MotivoBloqueio;
}

export function BotaoFinalizarVenda({
  onFinalizar,
  enviando = false,
  motivoBloqueio = null,
}: BotaoFinalizarVendaProps): ReactElement {
  /**
   * O envio em curso entra no mesmo canal, com frase própria: é o estado mais
   * transitório e precede os demais — dizer "falta um vendedor" a quem está
   * esperando o ERP responder seria falso (mesma ordem de
   * `motivoDeBloqueioDoCancelar`).
   */
  const motivo: MotivoBloqueio = enviando
    ? 'Aguarde: esta venda ainda está sendo enviada ao ERP.'
    : motivoBloqueio;
  const desabilitado = motivo !== null;

  return (
    <button
      type="button"
      data-testid="botao-finalizar-venda"
      {...atributosDeBloqueio(motivo)}
      aria-busy={enviando}
      onClick={acaoBloqueavel(motivo, onFinalizar)}
      className={cn(
        'flex h-12 w-full shrink-0 items-center justify-center gap-[9px] rounded-full',
        'text-[15px] font-bold transition-colors outline-none',
        'focus-visible:ring-[3px] focus-visible:ring-ring/50',
        desabilitado
          ? 'bg-secondary text-[var(--cc-color-muted)]'
          : 'bg-primary text-primary-foreground hover:bg-[var(--cc-color-primary-active)]',
      )}
    >
      <CheckCircle className="size-5" aria-hidden="true" />
      {enviando ? 'Finalizando…' : 'Finalizar venda'}
    </button>
  );
}
