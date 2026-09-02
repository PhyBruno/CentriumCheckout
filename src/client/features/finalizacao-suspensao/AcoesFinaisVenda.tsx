import { createContext, useContext, type ReactElement, type ReactNode } from 'react';
import type { ImpressaoDeps } from '../../services/impressao/imprimirNFCeLocal';
import { useSessionStore } from '../../stores/sessionStore';
import { BotaoCancelarVenda } from './BotaoCancelarVenda';
import { BotaoFinalizarVenda } from './BotaoFinalizarVenda';
import { DialogoConfirmarReenvio } from './DialogoConfirmarReenvio';
import { DialogoDocumentoFiscal } from './DialogoDocumentoFiscal';
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
  const { estado, confirmarReenvio, descartar } = api;

  return (
    <ContextoFinalizacao.Provider value={api}>
      {children}

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

function useFinalizacaoVenda(): ApiFinalizacaoVenda {
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
 * "Cancelar venda" é o **primeiro** atalho, à esquerda. Os outros dois do
 * desenho — "Menu Gerencial" e "Menu Importação" — pertencem a outras features
 * e ainda não existem; por isso o atalho ocupa um terço da faixa em vez de
 * esticar, para que os dois vizinhos entrem no lugar certo quando chegarem.
 */
export function BarraAtalhosVenda(): ReactElement {
  const { estado, suspender } = useFinalizacaoVenda();
  const travado = estado.tipo === 'enviando' || estado.tipo === 'falha-rede';

  return (
    <div className="flex h-11 w-full shrink-0 items-center gap-[10px]" data-testid="atalhos-venda">
      {/* Um terço exato da faixa: 3 atalhos com 2 gaps de 10px entre eles. */}
      <div className="flex w-[calc((100%-20px)/3)]">
        <BotaoCancelarVenda
          onCancelar={() => {
            void suspender();
          }}
          enviando={travado}
        />
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

  return (
    <div className="flex w-full flex-col gap-xs" data-testid="acoes-finais-venda">
      {estado.tipo === 'falha-negocio' && (
        <p
          role="alert"
          data-testid="erro-finalizacao"
          className="text-sm text-[var(--cc-color-down)]"
        >
          {estado.mensagem}
        </p>
      )}

      {/* Suspender não emite documento fiscal — o operador só precisa saber que
          o rascunho ficou do lado do servidor, que é o que distingue suspender
          de descartar. */}
      {estado.tipo === 'sucesso' && estado.notaFiscal === null && (
        <p role="status" className="text-sm text-[var(--cc-color-body)]">
          Venda suspensa. O rascunho continua disponível para retomada.
        </p>
      )}

      <BotaoFinalizarVenda
        onFinalizar={() => {
          void finalizar();
        }}
        enviando={estado.tipo === 'enviando'}
        bloqueado={estado.tipo === 'falha-rede'}
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
        enviando={travado}
      />
    </div>
  );
}
