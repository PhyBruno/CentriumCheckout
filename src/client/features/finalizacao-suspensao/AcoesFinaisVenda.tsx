import { createContext, useContext, type ReactElement, type ReactNode } from 'react';
import type { MotivoBloqueio } from '@/lib/bloqueio';
import type { ImpressaoDeps } from '../../services/impressao/imprimirNFCeLocal';
import { useSessionStore } from '../../stores/sessionStore';
import { useVendaStore } from '../../stores/vendaStore';
import { linhasAtivas, totalVenda } from '../../domain/precificacao/linha';
import { autorizaFinalizacao } from '../../domain/validacaoVenda/interpretarVeredito';
import { BotaoMenuGerencial } from '../gerencial/BotaoMenuGerencial';
import { BotaoMenuImportacao } from '../importacao/BotaoMenuImportacao';
import {
  AVISO_DESASSOCIACAO_MANUAL,
  CHAMADA_PIX_NAO_E_CANCELADO,
} from '../pagamento/pix/avisosPix';
import { DialogoConfirmacaoDestrutiva } from '../pagamento/DialogoConfirmacaoDestrutiva';
import { useVendedorAtual } from '../vendedor/useVendedor';
import { BotaoCancelarVenda } from './BotaoCancelarVenda';
import { BotaoFinalizarVenda } from './BotaoFinalizarVenda';
import { DialogoConfirmarReenvio } from './DialogoConfirmarReenvio';
import { DialogoDocumentoFiscal } from './DialogoDocumentoFiscal';
import { DialogoErroFaturamento } from './DialogoErroFaturamento';
import {
  useFinalizarOuSuspenderVenda,
  type ApiFinalizacaoVenda,
  type FinalizacaoDeps,
} from './useFinalizarOuSuspenderVenda';

/**
 * Composição da finalização/suspensão em **duas superfícies separadas**.
 *
 * No Pencil (`design/CentriumCheckout.pen`) as duas ações não ficam juntas:
 * "Cancelar venda" é o primeiro atalho da faixa "Atalhos da venda" (nó
 * `nyfSI`), embaixo da tabela de produtos, na coluna da esquerda; "Finalizar
 * venda" é o nó `UaFF2` ("Ações finais"), no rodapé do cartão branco "Pagamento
 * e totais" (`OzP7o`), na coluna da direita.
 *
 * As duas precisam, ainda assim, compartilhar **uma** máquina de estados: se
 * cada componente chamasse `useFinalizarOuSuspenderVenda` por conta própria,
 * existiriam duas instâncias independentes e a trava de `falha-rede` de uma não
 * valeria para a outra — exatamente o caminho de reenvio que `FR-004` fecha.
 * Daí o provider: um hook só, consumido de dois pontos distantes da árvore.
 */

const ContextoFinalizacao = createContext<ApiFinalizacaoVenda | null>(null);

export interface ProvedorFinalizacaoVendaProps {
  /** Dependências das features 014/008/012 e o envio — injetáveis em teste. */
  readonly deps?: FinalizacaoDeps;
  readonly impressaoDeps?: ImpressaoDeps;
  readonly children: ReactNode;
}

/**
 * Possui a máquina de estados e renderiza os diálogos (que são modais de tela
 * cheia e, por isso, não pertencem a nenhuma das duas colunas).
 */
export function ProvedorFinalizacaoVenda({
  deps,
  impressaoDeps,
  children,
}: ProvedorFinalizacaoVendaProps): ReactElement {
  const api = useFinalizarOuSuspenderVenda(deps);
  const sessao = useSessionStore((s) => s.registro?.SessaoUsuario ?? null);
  const { estado, confirmarReenvio, confirmarSuspensao, descartar } = api;

  return (
    <ContextoFinalizacao.Provider value={api}>
      {children}

      {estado.tipo === 'falha-negocio' && (
        <DialogoErroFaturamento mensagem={estado.mensagem} onFechar={descartar} />
      )}

      {/* "Cancelar venda" com cobrança PIX na venda (item 1.1 do usuário,
          2026-09-04). Fica aqui, e não dentro de `BarraAtalhosVenda`, pelo mesmo
          motivo dos outros diálogos: é modal de tela cheia e as duas superfícies
          de cancelamento (desktop e mobile) compartilham esta máquina. */}
      {estado.tipo === 'confirmar-suspensao-pix' && (
        <DialogoConfirmacaoDestrutiva
          testId="confirmar-suspensao-pix"
          titulo="Cancelar a venda com PIX gerado?"
          subtitulo="A venda vira rascunho no ERP, a cobrança não"
          chamada={CHAMADA_PIX_NAO_E_CANCELADO}
          explicacao={AVISO_DESASSOCIACAO_MANUAL}
          destaque="Se o cliente pagar o PIX depois disto, o dinheiro terá entrado numa venda que virou rascunho — e só o banco desfaz."
          rotuloConfirmar="Cancelar a venda mesmo assim"
          rotuloCancelar="Voltar para a venda"
          onConfirmar={() => {
            void confirmarSuspensao();
          }}
          onCancelar={descartar}
        />
      )}

      {estado.tipo === 'falha-rede' && (
        <DialogoConfirmarReenvio
          operacao={estado.operacao}
          onConfirmar={() => {
            void confirmarReenvio();
          }}
          onCancelar={descartar}
        />
      )}

      {/* Suspender chega a `sucesso` com `notaFiscal: null`: não há documento
          fiscal a apresentar (`contracts/faturamento-api.md`, "Efeito colateral
          em sucesso", passo 5). */}
      {estado.tipo === 'sucesso' && estado.notaFiscal !== null && sessao !== null && (
        <DialogoDocumentoFiscal
          notaFiscal={estado.notaFiscal}
          tipoImpressao={sessao.TipoImpressao}
          cadMaqHost={sessao.CadMaqHost}
          onFechar={descartar}
          {...(impressaoDeps === undefined ? {} : { impressaoDeps })}
        />
      )}
    </ContextoFinalizacao.Provider>
  );
}

/**
 * Não há o que suspender numa venda em que nada foi lançado: `SUSPENDER`
 * criaria um rascunho vazio no ERP, que o operador teria de limpar depois
 * (pedido do usuário, 2026-09-02).
 *
 * **Linha cancelada conta** (pedido do usuário, 2026-09-03, corrigindo a regra
 * anterior): ela permanece no array por rastreabilidade (`CART-08`) e é prova
 * de que a venda foi digitada. Uma venda cujos itens foram todos cancelados é
 * exatamente o caso em que o operador precisa desistir — travar o botão ali o
 * deixava sem saída na tela.
 */
function useVendaTemItem(): boolean {
  return useVendaStore((estado) => estado.linhas.length > 0);
}

/**
 * Por que "Cancelar venda" está bloqueado — a frase que o operador lê ao clicar
 * no botão bloqueado (padrão de `lib/bloqueio.ts`, pedido do usuário
 * 2026-09-03), ou `null` quando a ação está disponível.
 *
 * O envio vem primeiro porque é o estado mais transitório: dizer "não há itens"
 * a quem está esperando o ERP responder seria falso.
 */
function motivoDeBloqueioDoCancelar(travado: boolean, temItem: boolean): string | null {
  if (travado) {
    return 'Aguarde: esta venda ainda está sendo enviada ao ERP.';
  }
  if (!temItem) {
    return 'Não há nada a cancelar: nenhum item foi lançado nesta venda.';
  }
  return null;
}

/**
 * Só se fatura o que tem valor: sem linha ativa, ou com subtotal zerado, não há
 * NFCe a emitir e o botão fica desabilitado (pedido do usuário, 2026-09-02).
 *
 * **Estendido pela feature 008 (2026-09-03):** ter valor deixou de bastar — o
 * botão só libera quando os pagamentos aprovados cobrem o total líquido
 * (`saldoRestante === 0`), que é o fecho do fluxo dourado de
 * `specs/008-pagamento-geral/quickstart.md`. Sem isso o operador emitiria uma
 * NFCe cujo `Σ FormaValor` não fecha com o total da nota — divergência fiscal
 * que só apareceria na conferência.
 *
 * A regra mora num seletor só, e não espalhada pelo componente, justamente para
 * que essa extensão fosse um lugar só.
 */
function useVendaTemValorAFaturar(): boolean {
  // Seletores separados e primitivos: `saldo()` monta um objeto novo a cada
  // chamada, e devolvê-lo do seletor daria referência diferente por render — o
  // Zustand v5 leria como mudança e o componente entraria em laço.
  const temItemComValor = useVendaStore(
    (estado) => linhasAtivas(estado.linhas).length > 0 && totalVenda(estado.linhas) > 0,
  );
  const saldoRestante = useVendaStore((estado) => estado.saldo().saldoRestante);

  return temItemComValor && saldoRestante === 0;
}

/** As quatro travas da finalização, cada uma já resolvida em booleano. */
export interface CondicoesDeFinalizacao {
  /** Há linha ativa com valor **e** os pagamentos aprovados cobrem o total. */
  readonly haValorAFaturar: boolean;
  /** Veredito `ACEITA` vigente da validação prévia (`FR-014`, feature 014). */
  readonly temVereditoFavoravel: boolean;
  /** O envio anterior falhou por rede e a máquina está travada. */
  readonly falhaDeRede: boolean;
  /** `FR-006`/`SC-003` da feature 012 — nenhuma venda sem vendedor. */
  readonly temVendedor: boolean;
}

/**
 * Por que "Finalizar venda" está bloqueado — a frase que o operador lê ao
 * clicar (padrão de `lib/bloqueio.ts`), ou `null` quando a ação está liberada.
 *
 * **Existe porque as quatro travas colapsavam num `disabled` mudo** (correção
 * do usuário, 2026-09-10): o botão apagava e não dizia qual delas pegou, e o
 * `disabled` nativo nem sequer responde ao clique. O relato foi um botão
 * apagado com o pagamento cobrindo o total — a trava real era o vendedor, que
 * a tela em nenhum momento nomeava. Toda trava nova que entrar aqui precisa
 * trazer a sua frase junto; é o que este tipo força.
 *
 * **A ordem é a da precedência**, e não a da declaração: falha de rede primeiro
 * porque é a mais transitória e a que tem uma saída imediata (tentar de novo);
 * depois vendedor e pagamento, que são gestos que o operador ainda precisa
 * fazer; o veredito por último porque só faz sentido perguntar ao ERP quando o
 * resto da venda já está de pé — anunciá-lo antes mandaria o operador conferir
 * cliente e condição quando o que falta é lançar o pagamento.
 *
 * Função pura e exportada para o teste exercitá-la sem montar componente.
 */
export function motivoDeBloqueioDoFinalizar(condicoes: CondicoesDeFinalizacao): MotivoBloqueio {
  if (condicoes.falhaDeRede) {
    return 'O envio anterior falhou. Use "Tentar novamente" antes de finalizar.';
  }
  if (!condicoes.temVendedor) {
    return 'Escolha o vendedor da venda: o ERP não aceita NFCe sem vendedor associado.';
  }
  if (!condicoes.haValorAFaturar) {
    return 'A venda ainda não fecha: lance itens e cubra todo o total com as formas de pagamento.';
  }
  if (!condicoes.temVereditoFavoravel) {
    return 'O ERP ainda não aprovou esta venda. Revise cliente, condição e formas de pagamento.';
  }
  return null;
}

/**
 * A máquina de finalização compartilhada pelas superfícies desta tela.
 *
 * Exportada desde a feature 013: a venda rápida precisa da **mesma** instância
 * para o cenário "encerra a operação" finalizar pelo caminho normal, com todas
 * as validações da 004 (`FR-010`). Chamar `useFinalizarOuSuspenderVenda` por
 * conta própria criaria uma segunda máquina, e a trava de `falha-rede` de uma
 * não valeria para a outra — o mesmo defeito que este provider existe para
 * evitar.
 */
export function useFinalizacaoVenda(): ApiFinalizacaoVenda {
  const api = useContext(ContextoFinalizacao);
  if (api === null) {
    throw new Error(
      'Use <ProvedorFinalizacaoVenda> acima de BarraAtalhosVenda/AcoesFinaisVenda: ' +
        'as duas superfícies precisam compartilhar a mesma máquina de estados (FR-004).',
    );
  }
  return api;
}

export interface AcaoCancelarVendaProps {
  /** Só o ícone, sem rótulo — a lixeira do cabeçalho mobile (AD-089). */
  readonly compacto?: boolean;
}

/**
 * "Cancelar venda" **conectado** à máquina de finalização — o botão com o
 * `onCancelar` e o motivo de bloqueio já resolvidos.
 *
 * Extraído na feature 007: as duas superfícies do cancelamento (a faixa de
 * atalhos do desktop e a lixeira do cabeçalho do wizard mobile) repetiam a
 * mesma fiação de `suspender` + `motivoDeBloqueioDoCancelar`, e duas cópias
 * dessa decisão podem divergir — uma superfície liberaria o cancelamento no
 * instante em que a outra o recusa.
 */
export function AcaoCancelarVenda({ compacto = false }: AcaoCancelarVendaProps = {}): ReactElement {
  const { estado, suspender } = useFinalizacaoVenda();
  const temItem = useVendaTemItem();
  const travado = estado.tipo === 'enviando' || estado.tipo === 'falha-rede';

  return (
    <BotaoCancelarVenda
      onCancelar={() => {
        void suspender();
      }}
      compacto={compacto}
      bloqueado={motivoDeBloqueioDoCancelar(travado, temItem)}
    />
  );
}

/**
 * Faixa "Atalhos da venda" do Pencil (`nyfSI`): linha horizontal de 44px, gap
 * de 10px, logo abaixo do cartão de produtos.
 *
 * Os três atalhos do desenho, na ordem: "Cancelar venda" (feature 004), "Menu
 * Gerencial" e "Menu Importação" (feature 006). O vão do meio ficou reservado
 * enquanto o menu gerencial não existia; hoje está ocupado.
 *
 * Cada um ocupa um terço **fixo** da faixa em vez de esticar por `flex-1`: os
 * rótulos têm larguras diferentes e, com `flex-1`, o mais largo ("Menu
 * Importação") empurraria os outros dois, quebrando as três pílulas iguais que
 * o desenho mostra.
 */
export function BarraAtalhosVenda(): ReactElement {
  return (
    <div className="flex h-11 w-full shrink-0 items-center gap-[10px]" data-testid="atalhos-venda">
      {/* Um terço exato da faixa: 3 atalhos com 2 gaps de 10px entre eles. */}
      <div className="flex w-[calc((100%-20px)/3)]">
        <AcaoCancelarVenda />
      </div>
      <div className="flex w-[calc((100%-20px)/3)]">
        <BotaoMenuGerencial />
      </div>
      <div className="flex w-[calc((100%-20px)/3)]">
        <BotaoMenuImportacao />
      </div>
    </div>
  );
}

/**
 * Nó "Ações finais" (`UaFF2`) do Pencil: rodapé do cartão "Pagamento e totais",
 * coluna vertical com gap de 8px.
 *
 * Hoje só tem o botão de finalizar; a feature 008 acrescenta aqui o que o
 * desenho já prevê acima dele (total da venda, métricas, formas aplicadas).
 */
export function AcoesFinaisVenda(): ReactElement {
  const { estado, finalizar } = useFinalizacaoVenda();
  const haValorAFaturar = useVendaTemValorAFaturar();
  // `FR-006`/`SC-003` (feature 012): nenhuma venda é finalizada sem um
  // vendedor associado. `vendedorAtual` só chega `null` quando a empresa não
  // configurou default e o operador ainda não abriu a busca — sem esta trava
  // o botão liberaria com `vendedorCodigo: 0` (`useFinalizarOuSuspenderVenda.ts`).
  const vendedorAtual = useVendedorAtual();

  /**
   * Veredito favorável vigente da validação prévia (feature 014, `FR-014`).
   *
   * A prop `bloqueado` **declarava** este significado desde a 004 e não o
   * entregava: o call site passava só saldo, falha de rede e vendedor, então o
   * gate da finalização tinha uma camada só — a guarda de `iniciar`, que
   * responde com um toast **depois** do clique. Um botão azul que recusa ao ser
   * clicado é o oposto do padrão de `lib/bloqueio.ts` que o resto da base segue.
   *
   * Lido do `vereditoVigente`, e não chamando `podeFinalizar()` no seletor,
   * porque o Zustand precisa de um valor comparável para re-renderizar: uma
   * chamada de função devolveria referência nova a cada render.
   */
  const temVereditoFavoravel = useVendaStore((estadoVenda) =>
    autorizaFinalizacao(estadoVenda.vereditoVigente),
  );

  return (
    <div className="flex w-full flex-col gap-xs" data-testid="acoes-finais-venda">
      <BotaoFinalizarVenda
        onFinalizar={() => {
          void finalizar();
        }}
        enviando={estado.tipo === 'enviando'}
        motivoBloqueio={motivoDeBloqueioDoFinalizar({
          haValorAFaturar,
          temVereditoFavoravel,
          falhaDeRede: estado.tipo === 'falha-rede',
          temVendedor: vendedorAtual !== null,
        })}
      />
    </div>
  );
}

/*
 * `AcoesVendaCompactas` foi removida pela feature 007.
 *
 * Ela era o paliativo declarado no próprio TSDoc — "enquanto esse wizard não
 * existe, as duas ações ficam lado a lado no rodapé da tela compacta". O wizard
 * existe: a lixeira de suspender voltou para o cabeçalho, como AD-089 e o nó
 * `T9VTw` do Pencil mandam (`MobileWizard.tsx`), e o botão de finalizar foi para
 * a etapa 3 (`EtapaRevisao.tsx`). Manter o rodapé daria duas superfícies para o
 * mesmo par de ações na mesma tela.
 */
