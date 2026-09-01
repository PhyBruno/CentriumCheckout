import type { ReactElement } from 'react';
import { Skeleton, configureBoneyard } from 'boneyard-js/react';
import './LoadingSkeleton.css';

// Cor e ângulo do shimmer são configuração global do Boneyard, não props do
// `<Skeleton>`. Os valores são os do frame `BIu92` do Pencil, lidos dos tokens.
configureBoneyard({
  animate: 'shimmer',
  color: 'var(--cc-skeleton-base)',
  shimmerColor: 'var(--cc-skeleton-highlight)',
  shimmerAngle: -99.778,
});

/**
 * Tela de carregamento bloqueante do bootstrap (T025, AUTH-05 / FR-004).
 *
 * O shimmer é gerado pelo Boneyard em runtime, a partir da estrutura de layout
 * real desta tela — não há um desenho separado do skeleton. A estrutura replica
 * o frame "PDV Online Web - Skeleton Carregamento" (`data-pencil-id="BIu92"`)
 * do design aprovado no Pencil.
 *
 * A barra superior fica fora do `<Skeleton>` de propósito: no design ela já
 * aparece com marca e identidade do PDV visíveis, e só os indicadores de status
 * entram em shimmer.
 */
export function LoadingSkeleton(): ReactElement {
  return (
    <div
      className="cc-pdv-shell"
      data-testid="skeleton-carregamento"
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="cc-visualmente-oculto">Carregando a configuração do ponto de venda…</span>

      <header className="cc-pdv-topbar">
        <div className="cc-pdv-marca">
          <div className="cc-pdv-simbolo" />
          <div className="cc-pdv-identidade">
            <strong>Centrium Checkout</strong>
            <span>Preparando o ponto de venda…</span>
          </div>
        </div>

        <div className="cc-pdv-status">
          <div className="cc-pdv-status-pill cc-shimmer" style={{ width: 92 }} />
          <div className="cc-pdv-status-pill cc-shimmer" style={{ width: 110 }} />
          <div className="cc-pdv-status-botao" />
          <div className="cc-pdv-status-botao" />
        </div>
      </header>

      <Skeleton name="pdv-venda" loading fallback={<EstruturaTelaVenda aria-hidden />}>
        <EstruturaTelaVenda />
      </Skeleton>
    </div>
  );
}

/**
 * Estrutura de layout da tela de venda usada como fonte do snapshot do
 * Boneyard. Quando as telas de venda reais existirem (features 003+), elas
 * passam a ser os `children` do `<Skeleton>` e esta estrutura sai.
 */
function EstruturaTelaVenda(props: { 'aria-hidden'?: boolean }): ReactElement {
  return (
    <div className="cc-pdv-area" aria-hidden={props['aria-hidden']}>
      <div className="cc-pdv-venda">
        <section className="cc-pdv-card cc-pdv-card--cliente">
          <div className="cc-pdv-linhas">
            <div className="cc-pdv-linha" style={{ width: '30%' }} />
            <div className="cc-pdv-linha" style={{ width: '70%' }} />
            <div className="cc-pdv-linha" style={{ width: '55%' }} />
          </div>
        </section>

        <section className="cc-pdv-card cc-pdv-card--entrada">
          <div className="cc-pdv-linhas">
            <div className="cc-pdv-linha" style={{ width: '45%' }} />
            <div className="cc-pdv-linha" style={{ width: '85%' }} />
          </div>
        </section>

        <section className="cc-pdv-card cc-pdv-card--produtos">
          <div className="cc-pdv-linhas">
            {Array.from({ length: 7 }, (_, indice) => (
              <div key={indice} className="cc-pdv-linha" style={{ width: `${95 - indice * 6}%` }} />
            ))}
          </div>
        </section>

        <div className="cc-pdv-atalhos">
          {Array.from({ length: 5 }, (_, indice) => (
            <div key={indice} className="cc-pdv-atalho" />
          ))}
        </div>
      </div>

      <aside className="cc-pdv-pagamento">
        {[
          'Condição de pagamento',
          'Desconto e acréscimo',
          'Forma de pagamento',
          'Valor recebido',
        ].map((rotulo) => (
          <div className="cc-pdv-bloco" key={rotulo}>
            <span>{rotulo}</span>
            <div className="cc-pdv-campo" />
          </div>
        ))}

        <div className="cc-pdv-total">
          <span>Total da venda</span>
          <strong>R$ 0,00</strong>
        </div>

        <div className="cc-pdv-acoes" />
      </aside>
    </div>
  );
}
