import { useEffect, useLayoutEffect, useState, type ReactElement } from 'react';
import { eventoAtalhoAcionado } from '../domain/auditoria/eventos';
import {
  ProvedorFinalizacaoVenda,
  motivoDeBloqueioDoCancelar,
  useFinalizacaoVenda,
  vendaTemAlgoACancelar,
} from '../features/finalizacao-suspensao/AcoesFinaisVenda';
import { useFraseDeRecusaDeImportacao } from '../features/importacao/useImportacaoDocumento';
import { TeclasVendaRapida } from '../features/venda-rapida/TeclasVendaRapida';
import { useTeclasFixas } from '../hotkeys/mapaAtalhos';
import type { IdComando } from '../hotkeys/mapaFixo';
import { useAvisoAoSair } from '../lib/useAvisoAoSair';
import { usePollingStatusSistema } from '../services/statusSistema/pollingStatusSistema';
import { useJanelasStore } from '../stores/janelasStore';
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
  const compactoMedido = useIsMobile();
  /**
   * O layout **aplicado** — o medido, um passo atrás, só na travessia do
   * breakpoint.
   *
   * Existe por causa do `janelasStore` (feature 016). As janelas moram nele e
   * sobrevivem ao desmonte da árvore, e nem toda janela existe do outro lado: a
   * de DAV aberta no desktop atravessaria para o compacto sem ninguém que a
   * desenhe, e o store, inerte com janela "aberta" (I3), faria F3/F4 pararem de
   * responder no tablet. A janela é apresentação, do mesmo tipo que a etapa do
   * wizard, e perdê-la na travessia é o comportamento aceito (`research.md` D2).
   *
   * **Fechar antes de montar a árvore nova**, e não depois: montada com a janela
   * ainda aberta, a árvore compacta desenharia o modal e o levaria pela animação
   * de saída — um modal fechando sozinho logo depois de o tablet girar. O
   * `useLayoutEffect` fecha e troca o layout na mesma passada síncrona, antes da
   * pintura; nenhum quadro intermediário chega à tela.
   */
  const [compacto, setCompacto] = useState(compactoMedido);
  useLayoutEffect(() => {
    if (compacto === compactoMedido) {
      return;
    }
    useJanelasStore.getState().fechar();
    setCompacto(compactoMedido);
  }, [compacto, compactoMedido]);

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
        {/* Acima da bifurcação, dentro do provider: é o único ponto montado
            durante toda a venda nos dois layouts (`research.md` D4), e o F10
            precisa da mesma máquina de finalização que o botão usa. */}
        <TeclasFixasDaVenda compacto={compacto} />
        {/* F6–F9 no mesmo andar, pelo mesmo motivo: a tecla aciona nos dois
            layouts (`FR-011` da 016), e só a faixa visual continua no desktop. */}
        <TeclasVendaRapida />

        {/* Montagem condicional, não `display: none`. As duas árvores leem o
            mesmo carrinho; manter as duas no DOM duplicaria cada item para
            leitores de tela. É também o que a 007 exige de forma mais ampla:
            ausência estrutural, não flag de "oculto" (MOB-05, `FR-008`). */}
        {compacto ? <MobileWizard /> : <DesktopLayout />}
      </ProvedorFinalizacaoVenda>
    </main>
  );
}

/**
 * Recusa de F1/F2 no layout compacto (decisão do usuário, 2026-09-15).
 *
 * A importação de documento não existe na árvore compacta por decisão da 007
 * (`FR-008`, verificada por `ausenciaEstrutural.spec.tsx`). A tecla continua
 * sendo do Checkout — o PDV de toque com teclado físico não pode abrir a ajuda
 * do navegador —, mas o que ela faz ali é explicar, não abrir.
 */
export const MOTIVO_IMPORTACAO_NO_COMPACTO =
  'A importação de DAV e NFCe não está disponível no layout compacto: use um PDV com mouse.';

/**
 * Registra o acionamento por teclado na auditoria (`FR-019`) **antes** de a
 * ação rodar: o gesto aconteceu agora, e a suspensão, por exemplo, só produz o
 * próprio evento depois de uma confirmação.
 */
function auditarAtalho(comando: IdComando): void {
  useVendaStore
    .getState()
    .registrarEventoAuditoria(eventoAtalhoAcionado({ comando, origem: 'TECLADO' }));
}

interface TeclasFixasDaVendaProps {
  /** A leitura de layout que só o `AppShell` faz (`research.md` D3 da 007). */
  readonly compacto: boolean;
}

/**
 * O **único** call site de `useTeclasFixas` (feature 016, T012, invariante I6).
 *
 * Componente, e não o hook chamado direto no `AppShell`, por um motivo só: o
 * F10 precisa de `useFinalizacaoVenda`, e o provider que o fornece é
 * renderizado pelo próprio `AppShell` — de fora dele o contexto não existe.
 * Renderiza nada.
 *
 * **Nenhuma regra de negócio mora aqui** (`FR-018`, I7): cada `indisponivel`
 * delega ao mesmo veredito que o controle equivalente da tela consulta, lido
 * no instante da pressionada.
 *
 * O registro não depende de query, de `sessionStore`, de cadastro nem da
 * plataforma (`FR-002`): `useTeclasFixas` não recebe nenhum deles, e as teclas
 * ficam registradas desde a primeira pintura da tela de venda. O `compacto`
 * entra só no estágio 3, como motivo de recusa — nunca na posse.
 */
function TeclasFixasDaVenda({ compacto }: TeclasFixasDaVendaProps): null {
  const fraseDeRecusaDeImportacao = useFraseDeRecusaDeImportacao();
  const { estado, suspender } = useFinalizacaoVenda();

  /** Mesma recusa, com a mesma frase, do botão "Menu Importação" (`research.md` D7). */
  function recusaDeImportacao(): string | null {
    if (compacto) {
      return MOTIVO_IMPORTACAO_NO_COMPACTO;
    }
    return fraseDeRecusaDeImportacao();
  }

  useTeclasFixas({
    // Direto na janela, pulando o seletor (`research.md` D6): quem decorou a
    // tecla já escolheu o documento. A importação em si reaplica a recusa no
    // fim (`importarVendaExistente`), como no caminho por clique.
    IMPORTAR_DAV: {
      indisponivel: recusaDeImportacao,
      executar: () => {
        auditarAtalho('IMPORTAR_DAV');
        useJanelasStore.getState().abrir('dav');
      },
    },
    IMPORTAR_NFCE: {
      indisponivel: recusaDeImportacao,
      executar: () => {
        auditarAtalho('IMPORTAR_NFCE');
        useJanelasStore.getState().abrir('nfce');
      },
    },
    IDENTIFICAR_CLIENTE: {
      // A lupa do card de cliente nunca fica bloqueada: quem recusa a troca de
      // cliente com item na venda é o `clienteSlice`, no fim do gesto.
      indisponivel: () => null,
      // O mesmo `abrir` que a lupa chama. No wizard mobile, `MobileWizard` leva
      // o operador à etapa 1, onde o card existe (decisão de 2026-09-15).
      executar: () => {
        auditarAtalho('IDENTIFICAR_CLIENTE');
        useJanelasStore.getState().abrir('cliente');
      },
    },
    IDENTIFICAR_PRODUTO: {
      // Idem para a lupa da barra de produto.
      indisponivel: () => null,
      executar: () => {
        auditarAtalho('IDENTIFICAR_PRODUTO');
        useJanelasStore.getState().abrir('produto');
      },
    },
    SUSPENDER_VENDA: {
      // Os mesmos dois termos de `AcaoCancelarVenda`, lidos agora.
      indisponivel: () =>
        motivoDeBloqueioDoCancelar(
          estado.tipo === 'enviando' || estado.tipo === 'falha-rede',
          vendaTemAlgoACancelar(useVendaStore.getState()),
        ),
      // O `suspender` do botão "Cancelar venda", que já resolve para suspensão
      // (`research.md` D9) — inclusive a confirmação de PIX, que mora dentro da
      // máquina. F10 não tem outro desfecho (`FR-017`).
      executar: () => {
        auditarAtalho('SUSPENDER_VENDA');
        void suspender();
      },
    },
  });

  return null;
}
