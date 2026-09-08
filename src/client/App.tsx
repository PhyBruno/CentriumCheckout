import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAvisoAoSair } from './lib/useAvisoAoSair';
import {
  bootstrapDb,
  criarRepositorioBootstrap,
  type RepositorioBootstrap,
} from './db/bootstrapDb';
import {
  carregarBootstrap,
  criarAnalisadorViaWorker,
  type AnalisadorBootstrap,
} from './services/bootstrapClient';
import { leitorCarrinhoVazio, type LeitorCarrinho } from './services/erpClient';
import { useSessionStore, telaDeVendaLiberada } from './stores/sessionStore';
import { LoadingSkeleton } from './features/session-bootstrap/LoadingSkeleton';
import { ErrorRetry } from './features/session-bootstrap/ErrorRetry';
import { SessionExpiredWarning } from './features/session-bootstrap/SessionExpiredWarning';
import { PainelMensagem } from './features/session-bootstrap/PainelMensagem';
import { CampoClienteVenda } from './features/cliente/CampoClienteVenda';
import { EntradaRapidaProduto } from './features/carrinho/EntradaRapidaProduto';
import { GridItens } from './features/carrinho/GridItens';
import { ListaItensMobile } from './features/carrinho/ListaItensMobile';
import {
  AcoesVendaCompactas,
  BarraAtalhosVenda,
  ProvedorFinalizacaoVenda,
} from './features/finalizacao-suspensao/AcoesFinaisVenda';
import { PainelPagamentoETotais } from './features/pagamento/PainelPagamentoETotais';
import { BarraSuperior } from './layout/BarraSuperior';
import { useLayoutCompacto } from './layout/usePlataforma';
import { usePollingStatusSistema } from './services/statusSistema/pollingStatusSistema';
import { abrirSessaoDeVenda, useVendaStore } from './stores/vendaStore';

export interface AppProps {
  /** Injetáveis para teste — em produção usam os padrões reais. */
  readonly repositorio?: RepositorioBootstrap;
  readonly criarAnalisador?: () => AnalisadorBootstrap;
  /** Fornecido pela feature 001/003 quando a venda em andamento existir. */
  readonly leitorCarrinho?: LeitorCarrinho;
}

/**
 * Orquestra o bootstrap da sessão (T027, US2).
 *
 * A tela de venda só é liberada depois que o Dexie confirma a gravação (ou que
 * o registro já estava lá): nunca aparece parcialmente configurada
 * (FR-003/SC-002).
 */
export function App({
  repositorio,
  criarAnalisador = criarAnalisadorViaWorker,
  leitorCarrinho = leitorCarrinhoVazio,
}: AppProps = {}): ReactElement {
  const { estado, mensagemErro, itensNaVenda } = useSessionStore(
    useShallow((s) => ({
      estado: s.estado,
      mensagemErro: s.mensagemErro,
      itensNaVenda: s.itensNaVenda,
    })),
  );

  const repositorioEfetivo = useMemo(
    () => repositorio ?? criarRepositorioBootstrap(bootstrapDb),
    [repositorio],
  );

  const analisadorRef = useRef<AnalisadorBootstrap | null>(null);

  /**
   * Há um `carregar()` em andamento.
   *
   * Não dá para derivar de `estado`: quando `ErrorRetry` está na tela o estado
   * já é `'erro-recuperavel'`, então o botão precisa do próprio flag para não
   * disparar dois carregamentos concorrentes no duplo clique.
   */
  const [carregando, setCarregando] = useState(false);

  const carregar = useCallback(async (): Promise<void> => {
    const { iniciarCarregamento, concluir, falhar, encerrarSessao } = useSessionStore.getState();
    iniciarCarregamento();
    setCarregando(true);

    analisadorRef.current ??= criarAnalisador();

    try {
      const resultado = await carregarBootstrap({
        repositorio: repositorioEfetivo,
        analisador: analisadorRef.current,
      });

      switch (resultado.estado) {
        case 'pronto':
          concluir(resultado.registro, resultado.reaproveitado);
          return;
        case 'sessao-encerrada':
          encerrarSessao(leitorCarrinho.quantidadeDeItens());
          return;
        case 'erro-recuperavel':
          falhar(resultado.mensagem);
          return;
        case 'cancelado':
          // O componente está desmontando: não há estado de UI a atualizar.
          return;
      }
    } finally {
      setCarregando(false);
    }
  }, [criarAnalisador, leitorCarrinho, repositorioEfetivo]);

  useEffect(() => {
    void carregar();

    return () => {
      analisadorRef.current?.encerrar();
      analisadorRef.current = null;
    };
  }, [carregar]);

  if (estado === 'sessao-encerrada') {
    // Com venda em digitação, avisa antes de encerrar (FR-006); com carrinho
    // vazio, encerra direto pedindo para reabrir pelo ERP.
    return itensNaVenda > 0 ? (
      <SessionExpiredWarning
        itensNaVenda={itensNaVenda}
        onEncerrar={() => {
          window.location.assign('/');
        }}
      />
    ) : (
      <PainelMensagem
        titulo="Sessão encerrada"
        texto="Reabra o Checkout a partir do ERP para continuar."
      />
    );
  }

  if (estado === 'erro-recuperavel') {
    return (
      <ErrorRetry
        mensagem={mensagemErro ?? 'Falha ao carregar a configuração do ponto de venda.'}
        tentando={carregando}
        onTentarNovamente={() => {
          void carregar();
        }}
      />
    );
  }

  if (!telaDeVendaLiberada(estado)) {
    return <LoadingSkeleton />;
  }

  return (
    <TelaDeVenda
      onRecarregarBootstrap={() => {
        void carregar();
      }}
    />
  );
}

interface TelaDeVendaProps {
  /**
   * Recarrega `SessaoUsuario` por completo. Passado de cima porque quem sabe
   * carregar o bootstrap é `App` (feature 002) — o polling desta feature só
   * decide **quando** chamar, nunca reimplementa a busca (`research.md`, D6).
   */
  readonly onRecarregarBootstrap: () => void;
}

/**
 * Tela de venda. A configuração do PDV já está inteira carregada aqui (a
 * feature 002 garante isso); o conteúdo é das features de venda — por ora o
 * carrinho (003) e a finalização/suspensão (004), depois pagamento (008).
 *
 * A grid desktop e a lista mobile leem o **mesmo** estado de carrinho; só uma
 * das duas é montada por vez.
 */
function TelaDeVenda({ onRecarregarBootstrap }: TelaDeVendaProps): ReactElement {
  const compacto = useLayoutCompacto();
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
    // "Área operacional" do Pencil (nó `J9t3a`): fundo `$surface-soft`, duas
    // colunas com 20px entre elas e folga de 20/24/24 ao redor.
    <main
      className="flex h-screen flex-col overflow-hidden bg-[var(--cc-color-surface-soft)]"
      data-testid="tela-de-venda"
    >
      <BarraSuperior />

      {/* Um provider só para as duas superfícies da finalização, que no desenho
          ficam em colunas diferentes: o atalho "Cancelar venda" à esquerda,
          embaixo dos produtos, e "Finalizar venda" dentro do cartão de
          pagamento à direita. Ver o TSDoc de `ProvedorFinalizacaoVenda`. */}
      <ProvedorFinalizacaoVenda>
        <div className="flex min-h-0 flex-1 gap-[20px] px-lg pt-md pb-lg">
          {/* "Venda e produtos" (nó `imX5b`): coluna vertical, gap 16. */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-base">
            {/* "Cliente da venda expansível" (nó `AasDP`): abre a coluna, acima
                da entrada de produto, como no desenho. */}
            <CampoClienteVenda />

            <EntradaRapidaProduto />

            {/* Montagem condicional, não `display: none`. As duas superfícies
                leem o mesmo carrinho; manter as duas árvores no DOM duplicaria
                cada item para leitores de tela. É também o que a 007 exige de
                forma mais ampla: ausência estrutural, não flag de "oculto"
                (MOB-05, FR-008). */}
            {compacto ? <ListaItensMobile /> : <GridItens />}

            {compacto ? <AcoesVendaCompactas /> : <BarraAtalhosVenda />}
          </div>

          {/* O cartão de pagamento é a coluna da direita do desenho e não cabe
              no layout compacto — lá as ações ficam empilhadas no rodapé até o
              `MobileWizard` da feature 007 existir. */}
          {!compacto && <PainelPagamentoETotais />}
        </div>
      </ProvedorFinalizacaoVenda>
    </main>
  );
}
