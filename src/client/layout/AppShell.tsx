import { useEffect, type ReactElement } from 'react';
import { ProvedorFinalizacaoVenda } from '../features/finalizacao-suspensao/AcoesFinaisVenda';
import { useAvisoAoSair } from '../lib/useAvisoAoSair';
import { usePollingStatusSistema } from '../services/statusSistema/pollingStatusSistema';
import { useSessionStore } from '../stores/sessionStore';
import { abrirSessaoDeVenda, useVendaStore } from '../stores/vendaStore';
import { DesktopLayout } from './desktop/DesktopLayout';
import { MobileWizard } from './mobile/MobileWizard';
import { useIsMobile } from './useIsMobile';

export interface AppShellProps {
  /**
   * Recarrega `SessaoUsuario` por completo. Passado de cima porque quem sabe
   * carregar o bootstrap é `App` (feature 002) — o polling desta feature só
   * decide **quando** chamar, nunca reimplementa a busca (`research.md` D6 da
   * feature 003).
   *
   * O contrato desta feature (`contracts/layout-domain-api.md` §3) descrevia
   * `AppShell()` sem props; a prop entrou na implementação porque a extração de
   * `TelaDeVenda` trouxe junto o polling, que já dependia dela desde a 003.
   * Registrado como desvio em `.specs/project/STATE.md`.
   */
  readonly onRecarregarBootstrap: () => void;
}

/**
 * Raiz de composição da tela de venda (T009) e **único** ponto do projeto que
 * lê `useIsMobile` para decidir *quais* componentes existem na tela
 * (`research.md` D3).
 *
 * Abaixo daqui ninguém reconsulta o breakpoint: quem está em `desktop/` sabe
 * que é desktop, quem está em `mobile/` sabe que é mobile. É o que mantém a
 * checagem de layout fora de dezenas de componentes e faz uma 4ª etapa mobile,
 * ou uma mudança de limiar, tocar um arquivo só (Open/Closed).
 *
 * **As duas árvores leem o mesmo `vendaStore`** (`FR-002`, `SC-003`): a troca de
 * layout desmonta uma sub-árvore de apresentação e monta outra, sem tocar em
 * nenhum slice — nada é migrado, copiado ou reinicializado, porque não há dois
 * estados para sincronizar. A sessão de venda, o aviso de saída e o polling de
 * status ficam **aqui**, acima da bifurcação, pelo mesmo motivo: se cada árvore
 * os montasse por conta própria, cruzar o breakpoint reabriria a sessão de
 * auditoria e apagaria o histórico já acumulado.
 */
export function AppShell({ onRecarregarBootstrap }: AppShellProps): ReactElement {
  const compacto = useIsMobile();
  const cadMaqCod = useSessionStore((estado) => estado.registro?.SessaoUsuario.CadMaqCod ?? null);
  const linhas = useVendaStore((estado) => estado.linhas);
  const houveEscolhaExplicita = useVendaStore((estado) => estado.houveEscolhaExplicita);

  /**
   * Há algo que um F5 destruiria (item 8 do usuário, 2026-09-04).
   *
   * **Cliente default não conta** — é o mesmo recorte de `vendaAtiva` logo
   * abaixo, e pelo mesmo motivo (AD-138): a pré-seleção automática do consumidor
   * padrão não é ação do operador, então perdê-la num reload não perde nada que
   * ele tenha digitado. Perguntar ali transformaria o aviso em ruído de fundo, e
   * um aviso que aparece sempre deixa de ser lido.
   *
   * **Linha cancelada conta**, e é deliberado: `linhas.length`, não
   * `linhasAtivas`. A linha cancelada permanece no array por rastreabilidade
   * (`CART-08`) e é prova de que houve digitação — a mesma leitura que
   * `useVendaTemItem` faz para liberar o "Cancelar venda". Um carrinho cujos
   * itens foram todos cancelados ainda carrega o histórico de auditoria da
   * venda, que o reload apagaria.
   *
   * Pagamento não precisa entrar na conta: não existe pagamento sem condição
   * escolhida, e não existe condição escolhida sem item no carrinho.
   */
  const haVendaAPerder = houveEscolhaExplicita || linhas.length > 0;
  useAvisoAoSair(haVendaAPerder);

  // Abre a sessão de venda quando a tela entra em cena, e só se ainda não
  // houver uma aberta: a tela pode remontar no meio de uma venda (recarga do
  // bootstrap, por exemplo), e reabrir a sessão ali apagaria o histórico de
  // auditoria já acumulado (`FR-006`/`FR-008` da feature 001).
  useEffect(() => {
    if (useVendaStore.getState().eventos.length === 0) {
      abrirSessaoDeVenda('NOVA');
    }
  }, []);

  usePollingStatusSistema({
    cadMaqCod: () => cadMaqCod,
    // `FR-013`: nunca durante uma venda em digitação. Desde a feature 005, a
    // identificação explícita do cliente também conta como venda em andamento —
    // recarregar `SessaoUsuario` ali descartaria a escolha do operador. A
    // pré-seleção automática do default não conta: ela não é ação do operador.
    vendaAtiva: () => houveEscolhaExplicita || linhas.some((linha) => !linha.cancelada),
    recarregarBootstrap: onRecarregarBootstrap,
  });

  return (
    // "Área operacional" do Pencil (nó `J9t3a`): fundo `$surface-soft`, altura
    // da janela, sem rolagem própria — quem rola é a coluna interna de cada
    // layout.
    <main
      className="flex h-screen flex-col overflow-hidden bg-[var(--cc-color-surface-soft)]"
      data-testid="tela-de-venda"
    >
      {/* Um provider só para todas as superfícies da finalização, nos dois
          layouts: no desktop o "Cancelar venda" fica na faixa de atalhos e o
          "Finalizar" dentro do cartão de pagamento; no mobile a lixeira fica no
          cabeçalho e o "Finalizar" na etapa 3. Se cada superfície chamasse
          `useFinalizarOuSuspenderVenda` por conta própria, existiriam máquinas
          independentes e a trava de `falha-rede` de uma não valeria para a
          outra — o caminho de reenvio que `FR-004` da 004 fecha. */}
      <ProvedorFinalizacaoVenda>
        {/* Montagem condicional, não `display: none`. As duas árvores leem o
            mesmo carrinho; manter as duas no DOM duplicaria cada item para
            leitores de tela. É também o que a 007 exige de forma mais ampla:
            ausência estrutural, não flag de "oculto" (MOB-05, `FR-008`). */}
        {compacto ? <MobileWizard /> : <DesktopLayout />}
      </ProvedorFinalizacaoVenda>
    </main>
  );
}
