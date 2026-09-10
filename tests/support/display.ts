import type { CanalBruto, EventoMensagem } from '../../src/shared/display';

/**
 * Barramento em memória que substitui o `BroadcastChannel` nos testes da
 * feature 015.
 *
 * Existe porque `criarCanalDisplay` recebe a fábrica do canal por injeção
 * (`deps.criarCanal`, contrato §5): depender do `BroadcastChannel` do jsdom
 * tornaria o teste sensível ao ambiente sem provar nada a mais — e o jsdom não
 * entrega mensagens entre contextos, que é justamente o comportamento em jogo.
 *
 * A semântica imita a real nos dois pontos que importam: quem publica **não**
 * recebe a própria mensagem, e todo canal aberto no mesmo barramento recebe a de
 * todos os outros.
 */

interface CanalFalso extends CanalBruto {
  readonly ouvintes: ((evento: EventoMensagem) => void)[];
  fechado: boolean;
}

export interface BarramentoFalso {
  /** Passe como `deps.criarCanal`. */
  readonly criarCanal: (nome: string) => CanalBruto;
  /** Tudo que foi publicado por canais deste barramento, em ordem. */
  readonly publicadas: readonly unknown[];
  /**
   * Entrega uma mensagem a **todos** os canais abertos, como se viesse de outro
   * contexto — é assim que o teste simula o display pedindo `SOLICITAR_ESTADO`
   * ou o checkout publicando um estado.
   */
  readonly emitirDeFora: (dado: unknown) => void;
  /** Quantos canais foram criados e ainda não fecharam. */
  readonly canaisAbertos: () => number;
  /** Nomes passados à fábrica, na ordem de criação. */
  readonly nomes: readonly string[];
}

export function criarBarramentoFalso(): BarramentoFalso {
  const canais: CanalFalso[] = [];
  const publicadas: unknown[] = [];
  const nomes: string[] = [];

  const entregar = (dado: unknown, exceto: CanalFalso | null): void => {
    // Cópia da lista: um ouvinte pode fechar o próprio canal ao ser chamado.
    for (const canal of [...canais]) {
      if (canal === exceto || canal.fechado) {
        continue;
      }
      for (const ouvinte of [...canal.ouvintes]) {
        ouvinte({ data: dado });
      }
    }
  };

  return {
    criarCanal(nome: string): CanalBruto {
      nomes.push(nome);
      const canal: CanalFalso = {
        ouvintes: [],
        fechado: false,
        postMessage(mensagem: unknown): void {
          if (canal.fechado) {
            return;
          }
          publicadas.push(mensagem);
          entregar(mensagem, canal);
        },
        addEventListener(_tipo: 'message', ouvinte: (evento: EventoMensagem) => void): void {
          canal.ouvintes.push(ouvinte);
        },
        removeEventListener(_tipo: 'message', ouvinte: (evento: EventoMensagem) => void): void {
          const indice = canal.ouvintes.indexOf(ouvinte);
          if (indice >= 0) {
            canal.ouvintes.splice(indice, 1);
          }
        },
        close(): void {
          canal.fechado = true;
          canal.ouvintes.length = 0;
        },
      };
      canais.push(canal);
      return canal;
    },
    publicadas,
    emitirDeFora(dado: unknown): void {
      entregar(dado, null);
    },
    canaisAbertos(): number {
      return canais.filter((canal) => !canal.fechado).length;
    },
    nomes,
  };
}

/** Valores sintéticos reusados pelos testes — nenhum dado de produção. */
export const TRN_GUID_SINTETICO = '00000000-0000-4000-8000-000000000001';
export const TRN_GUID_SINTETICO_2 = '00000000-0000-4000-8000-000000000002';
export const QR_CODE_SINTETICO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgSINTETICO';
export const COPIA_E_COLA_SINTETICO =
  '00020126580014BR.GOV.BCB.PIX0136exemplo-sintetico-nao-pagavel6304ABCD';
