import { ChevronDown, Package, Pencil, Trash2 } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '@/components/ui/button';
import { acaoBloqueavel, atributosDeBloqueio, type MotivoBloqueio } from '@/lib/bloqueio';
import { cn } from '@/lib/utils';
import { formatarCentavos } from '../../domain/precificacao/dinheiro';
import { totalLinha, totalVenda, type LinhaCarrinho } from '../../domain/precificacao/linha';
import { formatarQuantidade } from '../../domain/precificacao/quantidade';
import { useEdicaoItemStore } from '../../stores/edicaoItemStore';
import { useVendaStore } from '../../stores/vendaStore';
import { useMotivoCarrinhoBloqueado } from './useCarrinho';

/**
 * Quantas linhas ficam à vista antes do resumo colapsado.
 *
 * O Pencil mostra 2 (nós `nIskX`/`wkZCH`) e resume o resto em `wBCcH`
 * ("+3 produtos • R$ 97,31"). 3 aqui porque o desenho modela uma venda de 5
 * itens, em que 2 já são quase tudo; numa venda de 20 o operador precisa de um
 * pouco mais de rastro para reconhecer o que acabou de bipar.
 */
const LINHAS_VISIVEIS = 3;

export interface ListaItensMobileProps {
  /**
   * Sem lápis e sem lixeira — a lista vira conferência.
   *
   * É a etapa 2 do wizard (decisão do usuário, 2026-09-09): quem quer mexer num
   * item volta à etapa 1, onde a barra de entrada rápida está. O desenho
   * (`nIskX`) põe uma lixeira em cada linha da etapa 2; tirá-la é desvio
   * deliberado e evita a pergunta que ela abriria — o que fazer com a lixeira
   * quando já há pagamento aplicado, numa tela cujo assunto é justamente
   * pagar. Registrado em `.specs/project/STATE.md`.
   */
  readonly somenteLeitura?: boolean;
}

/**
 * Lista de itens no mobile (T017).
 *
 * Layout diferente, **mesma fonte de estado** da grid desktop: o carrinho é um
 * só, e cancelar aqui produz exatamente o mesmo efeito de cancelar lá — inclusive
 * a linha riscada que permanece visível (`CART-08`). O mesmo vale para o lápis
 * (correção do usuário, 2026-09-03): carrega a linha na barra de entrada
 * rápida via `useEdicaoItemStore`, compartilhado com `GridItens.tsx`, para os
 * dois layouts produzirem exatamente o mesmo efeito.
 */
export function ListaItensMobile({
  somenteLeitura = false,
}: ListaItensMobileProps = {}): ReactElement {
  const { linhas, cancelarItem } = useVendaStore(
    useShallow((estado) => ({
      linhas: estado.linhas,
      cancelarItem: estado.cancelarItem,
    })),
  );
  const { carregarParaEdicao, idLinhaEmEdicao } = useEdicaoItemStore(
    useShallow((estado) => ({
      carregarParaEdicao: estado.carregarParaEdicao,
      idLinhaEmEdicao: estado.linhaEmEdicao?.idLinha ?? null,
    })),
  );
  const bloqueioDoCarrinho = useMotivoCarrinhoBloqueado();
  const [expandida, setExpandida] = useState(false);

  /**
   * As mais **recentes** ficam à vista; as antigas colapsam num resumo acima.
   *
   * O desenho põe o resumo embaixo, depois das duas primeiras linhas — inversão
   * deliberada. Numa venda de 20 itens, ver as duas primeiras não responde à
   * única pergunta que o caixa faz depois de bipar ("entrou?"); ver as últimas
   * responde. O resumo vai para cima porque é o que ficou para trás, e a leitura
   * continua na ordem de inserção.
   */
  const colapsadas = expandida ? [] : linhas.slice(0, Math.max(0, linhas.length - LINHAS_VISIVEIS));
  const visiveis = linhas.slice(colapsadas.length);

  return (
    <section className="flex flex-1 flex-col gap-xs" data-testid="lista-itens-mobile">
      <h2 className="sr-only">Itens da venda em andamento</h2>

      {linhas.length === 0 ? (
        /* `py-sm`, não `py-lg`: a faixa vazia gastava 48px de altura para dizer
           que não há nada — justamente o estado em que a tela precisa caber sem
           rolagem (pedido do usuário, 2026-09-09). */
        <p className="px-base py-2 text-center text-sm text-muted-foreground">
          Nenhum item na venda.
        </p>
      ) : (
        <>
          {colapsadas.length > 0 && (
            <button
              type="button"
              className="flex items-center justify-between gap-sm rounded-xl border border-border bg-secondary px-base py-2.5 text-sm font-semibold text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              data-testid="expandir-itens-anteriores"
              aria-expanded={false}
              onClick={() => {
                setExpandida(true);
              }}
            >
              <span className="flex min-w-0 items-center gap-xs">
                <Package className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="truncate">
                  {`+${String(colapsadas.length)} ${colapsadas.length === 1 ? 'produto anterior' : 'produtos anteriores'}`}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-xs">
                <span className="font-mono tabular-nums">
                  {formatarCentavos(totalVenda(colapsadas))}
                </span>
                <ChevronDown className="size-4 text-muted-foreground" aria-hidden="true" />
              </span>
            </button>
          )}

          <ul className="flex flex-col gap-sm">
            {visiveis.map((linha) => (
              <ItemMobile
                key={linha.idLinha}
                linha={linha}
                onCancelar={cancelarItem}
                onEditar={carregarParaEdicao}
                emEdicaoNaBarra={linha.idLinha === idLinhaEmEdicao}
                bloqueioDoCarrinho={bloqueioDoCarrinho}
                somenteLeitura={somenteLeitura}
              />
            ))}
          </ul>
        </>
      )}

      {/* O rodapé só existe **com item na venda** (pedido do usuário,
          2026-09-09). Vazio, ele repetia em "R$ 0,00" o que o cartão escuro do
          topo do wizard (`TotalDaVenda`) já diz em corpo maior, e gastava 44px
          de altura na única tela que precisa caber sem rolagem. */}
      {linhas.length === 0 ? null : (
        <footer className="flex items-center justify-between gap-sm rounded-xl border border-border bg-background px-base py-2.5">
          <span className="text-sm text-muted-foreground">Total da venda</span>
          {/* `font-mono tabular-nums` como todo valor monetário do produto (regra
            de tipografia do projeto, `CLAUDE.md`): este total saía em Inter e
            desalinhava com o mesmo número exibido em Geist Mono no cartão
            escuro logo acima e na linha de cada item logo abaixo. */}
          <strong className="shrink-0 font-mono text-lg tabular-nums" data-testid="total-venda">
            {formatarCentavos(totalVenda(linhas))}
          </strong>
        </footer>
      )}
    </section>
  );
}

interface ItemMobileProps {
  readonly linha: LinhaCarrinho;
  readonly onCancelar: (idLinha: string) => void;
  /** Mesma semântica de `LinhaDaGrid` (`GridItens.tsx`): carrega a linha na
   * barra de entrada rápida em vez de editar quantidade inline. */
  readonly onEditar: (linha: LinhaCarrinho) => void;
  readonly emEdicaoNaBarra: boolean;
  /** Recusa vigente do carrinho, já traduzida em frase (`useCarrinho.ts`). */
  readonly bloqueioDoCarrinho: MotivoBloqueio;
  readonly somenteLeitura: boolean;
}

function ItemMobile({
  linha,
  onCancelar,
  onEditar,
  emEdicaoNaBarra,
  bloqueioDoCarrinho,
  somenteLeitura,
}: ItemMobileProps): ReactElement {
  // Mesma regra de `LinhaDaGrid`: só `''` (não editável) fica sem lápis.
  const editavel = linha.snapshot.pesavelEditavel !== '';

  return (
    <li
      data-testid="linha-carrinho"
      data-cancelada={linha.cancelada}
      data-codigo-produto={linha.snapshot.codigoProduto}
      className={cn(
        'cc-linha-entra flex flex-col gap-xs rounded-xl border border-border bg-background p-base',
        linha.cancelada && 'text-muted-foreground line-through',
        // Mesmo contorno pulsante de `LinhaDaGrid` (`GridItens.tsx`) —
        // pedido do usuário, 2026-09-03.
        emEdicaoNaBarra && 'cc-pulso-edicao',
      )}
    >
      <div className="flex items-start justify-between gap-sm">
        {/* `min-w-0` + `break-words`: a descrição vem do cadastro e pode ser uma
            sequência sem espaço (código de fabricante colado ao nome). Sem os
            dois, uma palavra longa empurrava o total para fora do cartão em
            390px, em vez de quebrar dentro dele. O total nunca cede espaço
            (`shrink-0`) — é o número que o operador confere. */}
        <span className="min-w-0 font-medium break-words">
          {linha.snapshot.descricao}
          {linha.cancelada ? <span className="sr-only"> (item cancelado)</span> : null}
        </span>
        <strong className="shrink-0 font-mono tabular-nums">
          {formatarCentavos(totalLinha(linha))}
        </strong>
      </div>

      <div className="flex items-center justify-between gap-sm text-sm text-muted-foreground">
        <span className="min-w-0 font-mono tabular-nums">
          {formatarQuantidade(linha.quantidade, 3)} {linha.snapshot.unidadeMedida} ×{' '}
          <span data-testid="preco-unitario">{formatarCentavos(linha.precoUnitario)}</span>
        </span>

        {/* 40px no compacto, os 28px de antes a partir de `md:`. Esta lista só
            existe no wizard mobile — onde o ponteiro é o dedo — e 28px é menos
            que o alvo mínimo de toque: o lápis e a lixeira ficam a 8px um do
            outro e cancelar um item por engano é irreversível na leitura do
            operador (a linha some riscada). Crescer o botão, e não só a área
            sensível, mantém os dois alvos sem sobreposição.

            **Bloqueio explicativo, nunca `disabled`** (`lib/bloqueio.ts`,
            AD-143, pedido do usuário 2026-09-09): antes, com pagamento
            aplicado, os dois ficavam ativos, o operador clicava e só então
            ouvia o não — e `disabled` nem chega a disparar o clique, então o
            motivo não teria como aparecer. Agora a recusa é antecipada e o
            clique **ensina a saída**. A ordem dos motivos é a da gravidade: o
            pagamento primeiro, porque é o que exige uma decisão em outra tela;
            os outros dois descrevem o estado do próprio item. */}
        {linha.cancelada || somenteLeitura ? null : (
          <div className="flex shrink-0 gap-xs">
            <BotaoDeLinha
              rotulo="Editar item"
              testId="editar-item"
              className="text-primary"
              bloqueio={
                bloqueioDoCarrinho ??
                (!editavel
                  ? 'Este produto não é editável: o cadastro do ERP não permite ajustar preço nem desconto dele.'
                  : emEdicaoNaBarra
                    ? 'Este item já está carregado na barra de entrada: confirme ou cancele a edição antes.'
                    : null)
              }
              onAcionar={() => {
                onEditar(linha);
              }}
            >
              <Pencil className="size-3.5" aria-hidden="true" />
            </BotaoDeLinha>

            <BotaoDeLinha
              rotulo="Cancelar"
              testId="cancelar-item"
              className="text-muted-foreground"
              bloqueio={
                bloqueioDoCarrinho ??
                (emEdicaoNaBarra
                  ? 'Este item já está carregado na barra de entrada: confirme ou cancele a edição antes.'
                  : null)
              }
              onAcionar={() => {
                onCancelar(linha.idLinha);
              }}
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
            </BotaoDeLinha>
          </div>
        )}
      </div>
    </li>
  );
}

interface BotaoDeLinhaProps {
  readonly rotulo: string;
  readonly testId: string;
  readonly className: string;
  readonly bloqueio: MotivoBloqueio;
  readonly onAcionar: () => void;
  readonly children: ReactElement;
}

/** Os dois botões da linha, com o mesmo padrão de bloqueio explicativo. */
function BotaoDeLinha({
  rotulo,
  testId,
  className,
  bloqueio,
  onAcionar,
  children,
}: BotaoDeLinhaProps): ReactElement {
  return (
    <Button
      type="button"
      variant="secondary"
      size="icon-sm"
      className={cn('size-10 rounded-full md:size-7', className)}
      aria-label={rotulo}
      data-testid={testId}
      {...atributosDeBloqueio(bloqueio)}
      onClick={acaoBloqueavel(bloqueio, onAcionar)}
    >
      {children}
    </Button>
  );
}
