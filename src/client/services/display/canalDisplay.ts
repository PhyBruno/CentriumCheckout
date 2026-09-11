import {
  MS_PULSO_DISPLAY,
  NOME_CANAL_DISPLAY,
  ehCobrancaAtiva,
  interpretarMensagemDisplay,
  type CanalBruto,
  type EstadoDisplay,
  type EventoMensagem,
  type MensagemDisplay,
} from '../../../shared/display';

/**
 * Publicador do display do cliente (feature 015, `contracts/canal-display.md` §5).
 *
 * Vive em `services/` porque fala com a plataforma — abre o canal, agenda o
 * pulso, ouve `pagehide`. Nada aqui sabe o que é React, store ou venda: recebe
 * um `EstadoDisplay` pronto e o coloca no canal.
 *
 * A fábrica do canal é **injetável** (`deps.criarCanal`, Dependency Inversion —
 * Constitution II) porque o `BroadcastChannel` do jsdom não entrega entre
 * contextos: depender dele tornaria o teste sensível ao ambiente sem provar nada
 * a mais (research D13).
 *
 * As cinco obrigações do contrato, todas aqui: publicar e memorizar (C1),
 * responder o handshake **só** com cobrança ativa (C2), pulsar enquanto a
 * cobrança vive (C3), devolver a tela ao repouso no `pagehide` (C4) e encerrar
 * de forma idempotente (C5).
 */

export interface DepsCanalDisplay {
  /** Fábrica do canal. O padrão é o `BroadcastChannel` da plataforma. */
  readonly criarCanal?: (nome: string) => CanalBruto;
  /** Relógio, só para o teste afirmar `emitidoEm` sem depender do real. */
  readonly agora?: () => number;
}

export interface CanalDisplay {
  /** Publica o estado, o memoriza e (re)liga ou desliga o pulso conforme o caso. */
  readonly publicar: (estado: EstadoDisplay, nomeLoja: string | null) => void;
  /** Limpa pulso, ouvintes e fecha o canal. Idempotente. */
  readonly encerrar: () => void;
}

const REPOUSO: EstadoDisplay = { tela: 'BOAS_VINDAS' };

/**
 * `origemId` da aba. Opaco de propósito: serve a diagnóstico e a ignorar o
 * próprio eco, e nenhuma regra de negócio o lê.
 */
function gerarOrigemId(): string {
  const aleatorio = globalThis.crypto.randomUUID();
  return `aba-${aleatorio.slice(0, 8)}`;
}

function criarCanalNativo(nome: string): CanalBruto {
  return new BroadcastChannel(nome);
}

export function criarCanalDisplay(deps: DepsCanalDisplay = {}): CanalDisplay {
  const criarCanal = deps.criarCanal ?? criarCanalNativo;
  const agora = deps.agora ?? (() => Date.now());

  const canal = criarCanal(NOME_CANAL_DISPLAY);
  const origemId = gerarOrigemId();
  let encerrado = false;
  /** Último estado publicado. Alimenta o handshake (C2) e o pulso (C3). */
  let ultimoEstado: EstadoDisplay = REPOUSO;
  let ultimoNomeLoja: string | null = null;
  /** Handle do temporizador; existe **só** enquanto há cobrança ativa. */
  let pulso: ReturnType<typeof setInterval> | null = null;

  const emitir = (estado: EstadoDisplay, nomeLoja: string | null): void => {
    const mensagem: MensagemDisplay = {
      tipo: 'ESTADO',
      estado,
      nomeLoja,
      origemId,
      emitidoEm: agora(),
    };
    canal.postMessage(mensagem);
  };

  const pararPulso = (): void => {
    if (pulso !== null) {
      clearInterval(pulso);
      pulso = null;
    }
  };

  /**
   * Pulso (C3, FR-019): reconfirma a cobrança a cada 5 s.
   *
   * Existe porque `pagehide` cobre só o fechamento **normal** da aba. Não cobre
   * a aba que trava, é morta pelo gerenciador de tarefas ou perde o processo de
   * renderização — casos em que nenhum código nosso roda. Aí o QR ficaria preso
   * na tela virada ao cliente, e o risco concreto é o **próximo** cliente pagar
   * a cobrança do anterior.
   *
   * Sempre para antes de religar: trocar de cobrança não pode acumular
   * temporizadores. E o repouso não é reafirmado — não há nada a proteger nele.
   */
  const sincronizarPulso = (): void => {
    pararPulso();
    if (encerrado || !ehCobrancaAtiva(ultimoEstado)) {
      return;
    }
    pulso = setInterval(() => {
      emitir(ultimoEstado, ultimoNomeLoja);
    }, MS_PULSO_DISPLAY);
  };

  const publicarEstado = (estado: EstadoDisplay, nomeLoja: string | null): void => {
    ultimoEstado = estado;
    ultimoNomeLoja = nomeLoja;
    emitir(estado, nomeLoja);
    sincronizarPulso();
  };

  /**
   * Handshake seletivo (C2, FR-018, research D7).
   *
   * Responde **apenas** com cobrança ativa. Uma aba de checkout em repouso fica
   * calada, e é isso que impede o handshake de um display recém-aberto de apagar
   * o QR publicado por **outra** aba de checkout. O display não precisa de
   * resposta para ficar em repouso: repouso é o seu estado inicial, e silêncio
   * aqui é a resposta correta.
   */
  const aoReceber = (evento: EventoMensagem): void => {
    const mensagem = interpretarMensagemDisplay(evento.data);
    if (mensagem === null || mensagem.tipo !== 'SOLICITAR_ESTADO' || encerrado) {
      return;
    }
    if (!ehCobrancaAtiva(ultimoEstado)) {
      return;
    }
    emitir(ultimoEstado, ultimoNomeLoja);
  };

  /**
   * Fechamento normal da aba (C4, FR-021): devolve a tela do cliente ao repouso
   * **antes** de morrer, o que dá a volta imediata em vez dos 15 s do corte por
   * silêncio.
   *
   * `pagehide`, e não `beforeunload`: este é o evento que os navegadores
   * garantem também no descarte para o cache de retrocesso, e não exige
   * interação prévia para disparar.
   */
  const aoSairDaPagina = (): void => {
    if (encerrado || !ehCobrancaAtiva(ultimoEstado)) {
      return;
    }
    publicarEstado(REPOUSO, ultimoNomeLoja);
  };

  canal.addEventListener('message', aoReceber);
  window.addEventListener('pagehide', aoSairDaPagina);

  return {
    publicar(estado: EstadoDisplay, nomeLoja: string | null): void {
      // Publicar depois de encerrado seria o rastro de um `useEffect` que não
      // limpou: silencioso em produção, e um vazamento sob `StrictMode`.
      if (encerrado) {
        return;
      }
      publicarEstado(estado, nomeLoja);
    },

    encerrar(): void {
      // Idempotente: o `StrictMode` monta e desmonta duas vezes em
      // desenvolvimento, e a segunda chamada não pode explodir (C5, research D9).
      if (encerrado) {
        return;
      }
      encerrado = true;
      pararPulso();
      window.removeEventListener('pagehide', aoSairDaPagina);
      canal.removeEventListener('message', aoReceber);
      canal.close();
    },
  };
}
