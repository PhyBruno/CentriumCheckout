import type { ReactElement } from 'react';
import type { ImpressaoDeps } from '../../services/impressao/imprimirNFCeLocal';
import { useSessionStore } from '../../stores/sessionStore';
import { BotaoCancelarVenda } from './BotaoCancelarVenda';
import { BotaoFinalizarVenda } from './BotaoFinalizarVenda';
import { DialogoConfirmarReenvio } from './DialogoConfirmarReenvio';
import { DialogoDocumentoFiscal } from './DialogoDocumentoFiscal';
import { useFinalizarOuSuspenderVenda, type FinalizacaoDeps } from './useFinalizarOuSuspenderVenda';

/**
 * Ponto de composição da finalização/suspensão.
 *
 * Existe porque os dois botões e os dois diálogos precisam compartilhar **uma**
 * máquina de estados: se cada componente chamasse `useFinalizarOuSuspenderVenda`
 * por conta própria, existiriam duas instâncias independentes disputando a
 * mesma venda — e a trava de `falha-rede` de uma não valeria para a outra,
 * abrindo exatamente o caminho de reenvio que `FR-004` fecha.
 *
 * Corresponde aos frames "Atalhos da venda" e "Ações finais" do Pencil
 * (`design/CentriumCheckout.pen`), que também desenham os dois juntos.
 */
export interface AcoesFinaisVendaProps {
  /** Layout compacto (mobile): lixeira em vez do atalho com rótulo (AD-089). */
  readonly compacto?: boolean;
  /** Dependências das features 014/008/012 e o envio — injetáveis em teste. */
  readonly deps?: FinalizacaoDeps;
  readonly impressaoDeps?: ImpressaoDeps;
}

export function AcoesFinaisVenda({
  compacto = false,
  deps,
  impressaoDeps,
}: AcoesFinaisVendaProps): ReactElement {
  const { estado, finalizar, suspender, confirmarReenvio, descartar } =
    useFinalizarOuSuspenderVenda(deps);
  const sessao = useSessionStore((s) => s.registro?.SessaoUsuario ?? null);

  const enviando = estado.tipo === 'enviando';
  // Durante `falha-rede` os dois botões ficam travados: o único caminho adiante
  // é a confirmação explícita no diálogo (`FR-004`, AD-038).
  const travado = enviando || estado.tipo === 'falha-rede';

  return (
    <div className="flex flex-col gap-xs">
      <div className={compacto ? 'flex justify-end' : 'flex h-11 items-center gap-[10px]'}>
        <BotaoCancelarVenda
          onCancelar={() => {
            void suspender();
          }}
          compacto={compacto}
          enviando={travado}
        />
      </div>

      <BotaoFinalizarVenda
        onFinalizar={() => {
          void finalizar();
        }}
        enviando={enviando}
        bloqueado={estado.tipo === 'falha-rede'}
      />

      {estado.tipo === 'falha-negocio' && (
        <p
          role="alert"
          data-testid="erro-finalizacao"
          className="text-sm text-[var(--cc-color-down)]"
        >
          {estado.mensagem}
        </p>
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
          em sucesso", passo 5), mas o operador precisa saber que o rascunho
          ficou do lado do servidor — é o que distingue suspender de descartar. */}
      {estado.tipo === 'sucesso' && estado.notaFiscal === null && (
        <p role="status" className="text-sm text-[var(--cc-color-body)]">
          Venda suspensa. O rascunho continua disponível para retomada.
        </p>
      )}

      {estado.tipo === 'sucesso' && estado.notaFiscal !== null && sessao !== null && (
        <DialogoDocumentoFiscal
          notaFiscal={estado.notaFiscal}
          tipoImpressao={sessao.TipoImpressao}
          cadMaqHost={sessao.CadMaqHost}
          onFechar={descartar}
          {...(impressaoDeps === undefined ? {} : { impressaoDeps })}
        />
      )}
    </div>
  );
}
