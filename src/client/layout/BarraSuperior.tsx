import { Monitor, Settings, ShoppingCart, UserRound } from 'lucide-react';
import type { ReactElement } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  descreverSessaoAtiva,
  nomeDoOperador,
  tituloDoProduto,
} from '../domain/sessao/identidadePdv';
import {
  interpretarStatusSistema,
  rotularStatusOperacao,
  type StatusOperacaoNFCe,
} from '../domain/sessao/statusOperacaoNFCe';
import { useSessionStore } from '../stores/sessionStore';
import { useStatusSistemaStore } from '../stores/statusSistemaStore';

/**
 * Barra superior do PDV — nó `cm8HS` ("Barra superior") do Pencil, dentro do
 * componente `Fundo PDV Online Web` (`pbg1b`).
 *
 * A identidade vem de `SessaoUsuario` (`GetSessao`), já persistida no Dexie
 * pela feature 002, e o modo de operação da NFCe vem do polling de
 * `GetStatusSistema` (`FR-013`): a barra não chama o ERP nem deriva nada por
 * conta própria. Cada rótulo ausente some em vez de virar placeholder — um PDV cujo
 * cadastro não preencheu o nome fantasia mostra "Centrium Checkout" sozinho, e
 * não "Centrium Checkout - —".
 *
 * Medidas do desenho: altura 72, folga lateral 28, hairline só embaixo, fundo
 * `$canvas`; à esquerda o símbolo 40×40 `$cb-blue` e a identidade (16/600 e
 * 13/400); à direita as pílulas `$surface-strong` com folga 7×12 e os dois
 * botões redondos de 40.
 */
export function BarraSuperior(): ReactElement {
  const sessao = useSessionStore((estado) => estado.registro?.SessaoUsuario);
  const status = interpretarStatusSistema(
    useStatusSistemaStore((estado) => estado.ultimoStatus),
  );

  const identidade = sessao ?? {};
  const sessaoAtiva = descreverSessaoAtiva(identidade);
  const operador = nomeDoOperador(identidade);

  return (
    <header
      className="flex h-18 shrink-0 items-center justify-between border-b border-border bg-background px-7"
      data-testid="barra-superior"
    >
      {/* "Marca e contexto" (nó `ZyzZc`): símbolo + identidade, gap 14. */}
      <div className="flex items-center gap-3.5">
        <div className="flex size-10 items-center justify-center rounded-full bg-primary">
          <ShoppingCart className="size-5 text-primary-foreground" aria-hidden />
        </div>

        <div className="flex flex-col gap-0.5">
          <h1 className="text-lg leading-[1.2] font-semibold text-foreground">
            {tituloDoProduto(identidade)}
          </h1>
          {sessaoAtiva !== null && (
            <span className="text-base leading-[1.3] text-muted-foreground">{sessaoAtiva}</span>
          )}
        </div>
      </div>

      {/* "Status da operação" (nó `ARMjO`): pílulas + botões, gap 12. */}
      <div className="flex items-center gap-sm">
        <div className={PILULA} data-testid="status-operacao-nfce">
          <span className={cn('size-2 rounded-full', COR_DO_PONTO[status])} aria-hidden />
          {/* Entrar em contingência muda como a venda é emitida — o operador
              precisa perceber sem estar olhando para o canto da tela. */}
          <span className="text-base font-semibold text-foreground" aria-live="polite">
            {rotularStatusOperacao(status)}
          </span>
        </div>

        {operador !== null && (
          <div className={cn(PILULA, 'gap-2.5')} data-testid="operador-da-sessao">
            <UserRound className="size-[18px] text-muted-foreground" aria-hidden />
            <span className="text-base font-semibold text-foreground">
              <span className="sr-only">Operador: </span>
              {operador}
            </span>
          </div>
        )}

        {/* Os dois botões do desenho ficam visíveis, mas inertes: o display do
            cliente é gap de escopo em aberto (item 28 de `PENDENCIES.md`) e o
            menu gerencial é um redirect para telas legadas do ERP que ainda não
            tem tarefa (AD-020/AD-026). Omiti-los mudaria o layout aprovado; dar
            a eles uma ação inventada é pior. */}
        <BotaoInerte rotulo="Display do cliente (ainda não disponível)">
          <Monitor className="size-5" aria-hidden />
        </BotaoInerte>
        <BotaoInerte rotulo="Menu gerencial (ainda não disponível)">
          <Settings className="size-5" aria-hidden />
        </BotaoInerte>
      </div>
    </header>
  );
}

/**
 * Contingência é amarelo, não vermelho: o PDV continua vendendo, só que em
 * outro modo de emissão — não é falha. Sem leitura ainda, cinza.
 */
const COR_DO_PONTO: Record<StatusOperacaoNFCe, string> = {
  ONLINE: 'bg-[var(--cc-color-up)]',
  CONTINGENCIA: 'bg-[var(--cc-color-accent-yellow)]',
  DESCONHECIDO: 'bg-[var(--cc-color-muted-soft)]',
};

/** Pílula `$surface-strong` do desenho: raio total, folga 7×12, gap 8. */
const PILULA = 'flex items-center gap-xs rounded-full bg-secondary px-sm py-[7px]';

function BotaoInerte({
  rotulo,
  children,
}: {
  readonly rotulo: string;
  readonly children: ReactElement;
}): ReactElement {
  return (
    <Button
      type="button"
      variant="secondary"
      size="icon-lg"
      className="rounded-full text-muted-foreground"
      aria-label={rotulo}
      title={rotulo}
      disabled
    >
      {children}
    </Button>
  );
}
