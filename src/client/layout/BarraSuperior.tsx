import { CartShopping, Monitor, Settings, User } from 'reicon-react';
import type { ReactElement } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { NOME_JANELA_DISPLAY, ROTA_DISPLAY } from '../../shared/display';
import {
  descreverSessaoAtiva,
  nomeDoOperador,
  tituloDoProduto,
} from '../domain/sessao/identidadePdv';
import { useSessionStore } from '../stores/sessionStore';

/**
 * Barra superior do PDV — nó `cm8HS` ("Barra superior") do Pencil, dentro do
 * componente `Fundo PDV Online Web` (`pbg1b`).
 *
 * O conteúdo vem de `SessaoUsuario` (`GetSessao`), já persistido no Dexie pela
 * feature 002: a barra não chama o ERP nem deriva nada por conta própria.
 *
 * A pílula "Online" que aparece no desenho **não** é implementada: o valor de
 * `GetStatusSistema` só serve para decidir se o Checkout precisa pedir um
 * `GetSessao` novo, e essa decisão será controlada no backend — não há
 * indicador de status para o operador (decisão do usuário, 2026-09-02). Cada rótulo ausente some em vez de virar placeholder — um PDV cujo
 * cadastro não preencheu o nome fantasia mostra "Centrium Checkout" sozinho, e
 * não "Centrium Checkout - —".
 *
 * Medidas do desenho: altura 72, folga lateral 28, hairline só embaixo, fundo
 * `$canvas`; à esquerda o símbolo 40×40 `$cb-blue` e a identidade (16/600 e
 * 13/400); à direita a pílula `$surface-strong` do operador, com folga 7×12, e
 * os dois botões redondos de 40.
 */
export function BarraSuperior(): ReactElement {
  const sessao = useSessionStore((estado) => estado.registro?.SessaoUsuario);

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
          <CartShopping className="size-5 text-primary-foreground" aria-hidden />
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
        {operador !== null && (
          <div className={cn(PILULA, 'gap-2.5')} data-testid="operador-da-sessao">
            <User className="size-[18px] text-muted-foreground" aria-hidden />
            <span className="text-base font-semibold text-foreground">
              <span className="sr-only">Operador: </span>
              {operador}
            </span>
          </div>
        )}

        {/* O botão do monitor abre a tela do cliente (feature 015, FR-027):
            deixou de ser inerte e perdeu o "(ainda não disponível)" do rótulo
            quando o item 28 de `PENDENCIES.md` fechou.

            A engrenagem continua inerte — ela é a que não tem destino. E **não**
            abre o Menu gerencial: ele existe desde AD-203, mas o usuário
            escolheu (2026-09-10) mantê-lo só no atalho da faixa "Atalhos da
            venda". O rótulo aqui deixou de citá-lo justamente para não prometer
            o que este botão não faz. */}
        <Button
          type="button"
          variant="secondary"
          size="icon-lg"
          className="rounded-full text-muted-foreground"
          aria-label={ROTULO_DISPLAY}
          title={ROTULO_DISPLAY}
          onClick={abrirDisplayDoCliente}
        >
          <Monitor className="size-5" aria-hidden />
        </Button>
        <BotaoInerte rotulo="Configurações (ainda não disponível)">
          <Settings className="size-5" aria-hidden />
        </BotaoInerte>
      </div>
    </header>
  );
}

/** Pílula `$surface-strong` do desenho: raio total, folga 7×12, gap 8. */
const PILULA = 'flex items-center gap-xs rounded-full bg-secondary px-sm py-[7px]';

const ROTULO_DISPLAY = 'Display do cliente';

/**
 * Abre a tela do cliente numa janela **nomeada** e **sem `noopener`**
 * (feature 015, FR-028, research D3).
 *
 * O `noopener` faz a especificação HTML ignorar o nome da janela e abrir um
 * contexto novo a cada chamada — o operador que clica três vezes ficaria com
 * três displays, cada um ocupando um monitor que não existe. Com o nome, o
 * segundo clique traz à frente a tela já aberta.
 *
 * É desvio consciente do precedente de `BotaoMenuGerencial.tsx:40`
 * (`'_blank', 'noopener'`), que continua correto **lá**: aquele destino é o ERP
 * legado, em outra origem, e o `noopener` é o que impede a página de destino de
 * tocar o Checkout. Aqui o alvo é página da própria origem e a comunicação é por
 * `BroadcastChannel`, nunca por `window.opener` — o display não lê nem escreve
 * nada do abridor.
 */
function abrirDisplayDoCliente(): void {
  window.open(ROTA_DISPLAY, NOME_JANELA_DISPLAY);
}

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
