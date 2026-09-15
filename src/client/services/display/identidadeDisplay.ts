import {
  NOME_CANAL_DISPLAY,
  interpretarMensagemDisplay,
  type EventoMensagem,
  type MensagemDisplay,
} from '../../../shared/display';
import { criarCanalNativo, gerarOrigemId, type DepsCanalDisplay } from './canalDisplay';

/**
 * Anunciante da identidade da loja na tela do cliente (correção do usuário,
 * 2026-09-15).
 *
 * **O defeito que resolve:** aberta antes do primeiro PIX, a tela do cliente
 * ficava sem o nome da empresa. O nome só viajava dentro de `ESTADO`, e ninguém
 * publicava estado em repouso — o publicador de cobrança (`criarCanalDisplay`)
 * nasce sob demanda com o primeiro PIX, e mesmo depois dele fica calado no
 * repouso de propósito (C2): responder "boas-vindas" ao handshake apagaria o QR
 * que **outra** aba de checkout estivesse mostrando.
 *
 * Por isso a identidade é uma mensagem **separada**, sem estado de tela: pode
 * sair de qualquer aba, a qualquer momento, sem tocar em cobrança nenhuma. Duas
 * ocasiões bastam — quando o nome passa a ser conhecido (a tela do cliente já
 * estava aberta quando a sessão carregou) e em todo `SOLICITAR_ESTADO` (a tela
 * foi aberta com o checkout já de pé).
 *
 * Separado de `criarCanalDisplay` porque as duas coisas mudam por razões
 * diferentes: aquele tem pulso, corte e `pagehide` para uma cobrança que pode
 * ficar obsoleta; a identidade é constante durante a sessão e não precisa de
 * nada disso (Constitution II).
 */

export interface AnuncianteIdentidadeDisplay {
  /** Memoriza e anuncia o nome. `null` — sessão carregando, empresa sem cadastro — cala. */
  readonly anunciar: (nomeLoja: string | null) => void;
  /** Tira o ouvinte e fecha o canal. Idempotente (`StrictMode`). */
  readonly encerrar: () => void;
}

export function criarAnuncianteIdentidadeDisplay(
  deps: DepsCanalDisplay = {},
): AnuncianteIdentidadeDisplay {
  const criarCanal = deps.criarCanal ?? criarCanalNativo;
  const agora = deps.agora ?? (() => Date.now());

  const canal = criarCanal(NOME_CANAL_DISPLAY);
  const origemId = gerarOrigemId();
  let encerrado = false;
  let nomeAtual: string | null = null;

  const emitir = (): void => {
    if (encerrado || nomeAtual === null) {
      return;
    }
    const mensagem: MensagemDisplay = {
      tipo: 'IDENTIDADE',
      nomeLoja: nomeAtual,
      origemId,
      emitidoEm: agora(),
    };
    canal.postMessage(mensagem);
  };

  const aoReceber = (evento: EventoMensagem): void => {
    const mensagem = interpretarMensagemDisplay(evento.data);
    if (mensagem?.tipo === 'SOLICITAR_ESTADO') {
      emitir();
    }
  };

  canal.addEventListener('message', aoReceber);

  return {
    anunciar(nomeLoja: string | null): void {
      nomeAtual = nomeLoja;
      emitir();
    },

    encerrar(): void {
      if (encerrado) {
        return;
      }
      encerrado = true;
      canal.removeEventListener('message', aoReceber);
      canal.close();
    },
  };
}
