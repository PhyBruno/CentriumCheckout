import { useEffect, useRef, useState, type ReactElement } from 'react';
import {
  MS_SILENCIO_ATE_REPOUSO,
  NOME_CANAL_DISPLAY,
  interpretarMensagemDisplay,
  type CanalBruto,
  type EstadoDisplay,
  type EventoMensagem,
  type MensagemDisplay,
} from '../../../shared/display';
import { centavos } from '../../domain/precificacao/dinheiro';
import { TelaBoasVindas } from './TelaBoasVindas';
import { TelaCobrancaPix } from './TelaCobrancaPix';
import { TelaPagamentoAprovado } from './TelaPagamentoAprovado';

/**
 * A tela do cliente (feature 015, `data-model.md` §4).
 *
 * Terminal burro, e essa é a decisão central da feature: assina o canal, valida
 * cada mensagem e desenha o estado que recebeu. Não gera cobrança (FR-013), não
 * consulta o ERP (FR-014), não oferece ação capaz de alterar a venda (FR-015) e
 * não abre sessão nem polling (FR-016) — por isso monta **fora** do `App` e do
 * `AppShell` (research D9).
 *
 * Nenhuma mensagem inválida vira alerta, toast ou texto de erro: a tela é virada
 * ao cliente, e o erro é conversa com o operador (FR-011). Mensagem que não
 * valida é **descartada em silêncio**, sem mudar o estado atual — uma aba
 * rodando o bundle antigo depois de um deploy não é evidência de que a cobrança
 * acabou (contrato §4).
 */

export interface DepsDisplayCliente {
  /** Fábrica do canal, injetável para teste — ver `contracts/canal-display.md` §5. */
  readonly criarCanal?: (nome: string) => CanalBruto;
}

function criarCanalNativo(nome: string): CanalBruto {
  return new BroadcastChannel(nome);
}

export function DisplayCliente({
  deps,
}: {
  readonly deps?: DepsDisplayCliente;
} = {}): ReactElement {
  const [estado, setEstado] = useState<EstadoDisplay>({ tela: 'BOAS_VINDAS' });
  /** Sobrevive à volta ao repouso: a tela não perde a marca da loja. */
  const [nomeLoja, setNomeLoja] = useState<string | null>(null);
  /**
   * Marca da última mensagem **válida**, e o que reinicia o corte por silêncio.
   *
   * É um contador, e não o instante de recebimento que o `data-model.md` §4
   * nomeia `recebidoEm`: dois pulsos no mesmo milissegundo produziriam o mesmo
   * timestamp e o efeito abaixo não reiniciaria o temporizador. O contador
   * também torna o corte independente de o estado recebido ser ou não idêntico
   * ao anterior — que é o caso comum, já que o pulso republica o mesmo estado.
   */
  const [marcaDaUltimaMensagem, setMarcaDaUltimaMensagem] = useState(0);

  // A fábrica vem por prop, mas a assinatura precisa acontecer **uma** vez: sem
  // a referência, um re-render com objeto `deps` novo reabriria o canal.
  const criarCanalRef = useRef(deps?.criarCanal ?? criarCanalNativo);

  useEffect(() => {
    const canal = criarCanalRef.current(NOME_CANAL_DISPLAY);

    const aoReceber = (evento: EventoMensagem): void => {
      const mensagem = interpretarMensagemDisplay(evento.data);
      if (mensagem === null || mensagem.tipo !== 'ESTADO') {
        return;
      }
      setEstado(mensagem.estado);
      setNomeLoja(mensagem.nomeLoja);
      // Só mensagem válida adia o corte. Uma aba antiga emitindo lixo a cada
      // 5 s manteria um QR morto na tela indefinidamente (contrato §4).
      setMarcaDaUltimaMensagem((anterior) => anterior + 1);
    };

    canal.addEventListener('message', aoReceber);

    /**
     * Handshake (FR-017): a tela pode ser aberta **no meio** de uma cobrança, e
     * é esse o cenário do pedido — o operador insere o PIX e só então lembra de
     * ligar o monitor do cliente. A pergunta não carrega dado nenhum, e uma aba
     * de checkout em repouso não responde (contrato §5, C2), então repeti-la sob
     * `StrictMode` é inofensivo: no pior caso chegam duas respostas idênticas.
     */
    canal.postMessage({ tipo: 'SOLICITAR_ESTADO' } satisfies MensagemDisplay);

    // Idempotente e completo: o `StrictMode` monta e desmonta duas vezes em
    // desenvolvimento, e um canal deixado aberto acumularia ouvintes.
    return () => {
      canal.removeEventListener('message', aoReceber);
      canal.close();
    };
  }, []);

  /**
   * Corte por silêncio (FR-020, data-model D3): a rede de segurança da feature.
   *
   * Só existe enquanto há cobrança na tela — em repouso não há nada a proteger,
   * e um temporizador correndo o dia inteiro à toa seria só ruído. Cobre o caso
   * que o `pagehide` do checkout **não** cobre: a aba que trava, é morta pelo
   * gerenciador de tarefas ou perde o processo de renderização, deixando um QR
   * obsoleto virado para o próximo cliente da fila.
   *
   * A janela é 3× o pulso, então duas mensagens perdidas não derrubam um QR
   * válido (research D8).
   */
  useEffect(() => {
    if (estado.tela === 'BOAS_VINDAS') {
      return;
    }
    const temporizador = setTimeout(() => {
      setEstado({ tela: 'BOAS_VINDAS' });
    }, MS_SILENCIO_ATE_REPOUSO);
    return () => {
      clearTimeout(temporizador);
    };
  }, [estado, marcaDaUltimaMensagem]);

  /**
   * Volta automática depois da confirmação (FR-024, data-model D4/D5).
   *
   * A chave é o **`trnGuid`**, não a identidade do objeto de estado: o checkout
   * republica a mesma aprovação a cada 5 s (o pulso, FR-019), e depender do
   * objeto reiniciaria a contagem a cada pulso — a tela nunca voltaria sozinha.
   * Trocar de `trnGuid`, ao contrário, **descarta** a contagem em curso, que é
   * exatamente o caminho do segundo PIX da mesma venda (FR-026).
   */
  const trnGuidAprovado = estado.tela === 'PIX_APROVADO' ? estado.trnGuid : null;
  const voltaEmMs = estado.tela === 'PIX_APROVADO' ? estado.voltaEmMs : 0;

  useEffect(() => {
    if (trnGuidAprovado === null) {
      return;
    }
    const temporizador = setTimeout(
      () => {
        setEstado({ tela: 'BOAS_VINDAS' });
      },
      Math.max(voltaEmMs, 0),
    );
    return () => {
      clearTimeout(temporizador);
    };
  }, [trnGuidAprovado, voltaEmMs]);

  return (
    <main className="h-dvh w-screen overflow-hidden bg-background" data-testid="display-cliente">
      {estado.tela === 'BOAS_VINDAS' && <TelaBoasVindas nomeLoja={nomeLoja} />}

      {estado.tela === 'PIX_AGUARDANDO' && (
        <TelaCobrancaPix
          // Reconversão na fronteira (research D5, Constitution V): a marca
          // `Centavos` não sobrevive ao clone estrutural do canal, e `centavos()`
          // **lança** em não-inteiro — payload corrompido vira falha alta em vez
          // de uma discrepância de centavo na tela do cliente.
          valor={centavos(estado.valorCentavos)}
          qrCodeFonte={estado.qrCodeFonte}
        />
      )}

      {estado.tela === 'PIX_APROVADO' && (
        <TelaPagamentoAprovado
          // `key` pelo `trnGuid`: um segundo PIX aprovado reinicia o contador
          // visível do zero em vez de herdar o que sobrou do anterior.
          key={estado.trnGuid}
          valor={centavos(estado.valorCentavos)}
          voltaEmMs={estado.voltaEmMs}
        />
      )}
    </main>
  );
}
