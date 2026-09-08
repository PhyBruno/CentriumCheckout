import { createContext, useContext, type ReactElement, type ReactNode } from 'react';
import type { ImpressaoDeps } from '../../services/impressao/imprimirNFCeLocal';
import { useSessionStore } from '../../stores/sessionStore';
import { useVendaStore } from '../../stores/vendaStore';
import { linhasAtivas, totalVenda } from '../../domain/precificacao/linha';
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

/**
 * Faixa "Atalhos da venda" do Pencil (`nyfSI`): linha horizontal de 44px, gap
 * de 10px, logo abaixo do cartão de produtos.
 *
 * "Cancelar venda" é o **primeiro** atalho, à esquerda, e "Menu Importação" é o
 * **terceiro** (feature 006). O segundo do desenho — "Menu Gerencial" —
 * pertence a outra feature e ainda não existe; por isso cada atalho ocupa um
 * terço da faixa em vez de esticar, para que ele entre no lugar certo quando
 * chegar.
 */
export function BarraAtalhosVenda(): ReactElement {
  const { estado, suspender } = useFinalizacaoVenda();
  const temItem = useVendaTemItem();
  const travado = estado.tipo === 'enviando' || estado.tipo === 'falha-rede';

  return (
    <div className="flex h-11 w-full shrink-0 items-center gap-[10px]" data-testid="atalhos-venda">
      {/* Um terço exato da faixa: 3 atalhos com 2 gaps de 10px entre eles. */}
      <div className="flex w-[calc((100%-20px)/3)]">
        <BotaoCancelarVenda
          onCancelar={() => {
            void suspender();
          }}
          bloqueado={motivoDeBloqueioDoCancelar(travado, temItem)}
        />
      </div>
      {/* Terceiro terço, encostado à direita: o vão do meio é o lugar que o
          "Menu Gerencial" vai ocupar, e deixá-lo vazio agora evita mexer no
          posicionamento dos outros dois quando ele chegar. */}
      <div className="ml-auto flex w-[calc((100%-20px)/3)]">
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

  return (
    <div className="flex w-full flex-col gap-xs" data-testid="acoes-finais-venda">
      <BotaoFinalizarVenda
        onFinalizar={() => {
          void finalizar();
        }}
        enviando={estado.tipo === 'enviando'}
        bloqueado={!haValorAFaturar || estado.tipo === 'falha-rede' || vendedorAtual === null}
      />
    </div>
  );
}

/**
 * Superfície mobile: no Pencil o layout compacto põe só a lixeira de suspender
 * na barra superior (AD-089) e leva o botão de finalizar para a etapa 03 do
 * wizard — que pertence à feature 007. Enquanto esse wizard não existe, as duas
 * ações ficam lado a lado no rodapé da tela compacta.
 */
export function AcoesVendaCompactas(): ReactElement {
  const { estado, suspender } = useFinalizacaoVenda();
  const temItem = useVendaTemItem();
  const travado = estado.tipo === 'enviando' || estado.tipo === 'falha-rede';

  return (
    <div className="flex w-full items-end gap-sm" data-testid="acoes-venda-compactas">
      <div className="flex-1">
        <AcoesFinaisVenda />
      </div>
      <BotaoCancelarVenda
        onCancelar={() => {
          void suspender();
        }}
        compacto
        bloqueado={motivoDeBloqueioDoCancelar(travado, temItem)}
      />
    </div>
  );
}
