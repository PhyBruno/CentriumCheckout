import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StrictMode } from 'react';
import { act, render, screen } from '@testing-library/react';
import { DisplayCliente } from '../../src/client/features/display/DisplayCliente';
import {
  MS_PULSO_DISPLAY,
  MS_SILENCIO_ATE_REPOUSO,
  type MensagemDisplay,
} from '../../src/shared/display';
import {
  COPIA_E_COLA_SINTETICO,
  criarBarramentoFalso,
  QR_CODE_SINTETICO,
  TRN_GUID_SINTETICO,
  TRN_GUID_SINTETICO_2,
  type BarramentoFalso,
} from '../support/display';

const COBRANCA_87_40 = {
  tela: 'PIX_AGUARDANDO',
  trnGuid: TRN_GUID_SINTETICO,
  valorCentavos: 8740,
  qrCodeFonte: QR_CODE_SINTETICO,
  copiaECola: COPIA_E_COLA_SINTETICO,
} as const;

/**
 * Máquina de estados da tela do cliente (feature 015, `data-model.md` §4).
 *
 * O canal é **injetado**: o display não faz rede, não fala com o ERP e não tem
 * store — tudo o que ele sabe chega por mensagem, então um barramento em memória
 * é a fronteira inteira da feature (research D13). Valores sintéticos.
 */

function montar(barramento: BarramentoFalso): void {
  render(<DisplayCliente deps={{ criarCanal: barramento.criarCanal }} />);
}

/**
 * A mensagem chega por evento do canal, não por interação do usuário: sem
 * `act`, o React não descarrega o `setState` disparado de fora da sua fila.
 */
function entregar(barramento: BarramentoFalso, mensagem: unknown): void {
  act(() => {
    barramento.emitirDeFora(mensagem);
  });
}

function mensagemDeEstado(estado: unknown, nomeLoja: string | null = 'Mercado Aurora'): unknown {
  return {
    tipo: 'ESTADO',
    estado,
    nomeLoja,
    origemId: 'aba-sintetica',
    emitidoEm: 1_789_077_600_000,
  } satisfies Record<string, unknown>;
}

describe('DisplayCliente — a casca (T011)', () => {
  it('nasce em repouso, com a saudação e sem nada da venda', () => {
    montar(criarBarramentoFalso());

    expect(screen.getByTestId('display-boas-vindas')).toBeInTheDocument();
    expect(screen.queryByTestId('display-cobranca-pix')).not.toBeInTheDocument();
  });

  it('mostra o nome da loja assim que uma mensagem válida o traz', () => {
    const barramento = criarBarramentoFalso();
    montar(barramento);

    entregar(barramento, mensagemDeEstado({ tela: 'BOAS_VINDAS' }));

    expect(screen.getByTestId('display-nome-loja')).toHaveTextContent('Mercado Aurora');
  });

  it('omite o nome quando a empresa não está cadastrada — sem linha órfã', () => {
    const barramento = criarBarramentoFalso();
    montar(barramento);

    entregar(barramento, mensagemDeEstado({ tela: 'BOAS_VINDAS' }, null));

    expect(screen.queryByTestId('display-nome-loja')).not.toBeInTheDocument();
    expect(screen.getByTestId('display-boas-vindas')).toBeInTheDocument();
  });

  it.each([
    ['tela desconhecida', mensagemDeEstado({ tela: 'PIX_EM_ANALISE' })],
    ['tipo fora do protocolo', { tipo: 'ENCERRAR_VENDA' }],
    ['objeto que nem mensagem é', { qualquer: 'coisa' }],
    ['lixo puro', 42],
  ])('descarta %s sem mudar a tela e sem anunciar erro ao cliente', (_rotulo, lixo) => {
    const barramento = criarBarramentoFalso();
    montar(barramento);

    entregar(barramento, lixo);

    expect(screen.getByTestId('display-boas-vindas')).toBeInTheDocument();
    // FR-011: nenhum descarte vira alerta — a tela é virada ao cliente.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('não publica estado nenhum: o display escuta, nunca é fonte de verdade (FR-012)', () => {
    const barramento = criarBarramentoFalso();
    montar(barramento);

    const publicacoesDeEstado = barramento.publicadas.filter(
      (mensagem) => (mensagem as Partial<MensagemDisplay>).tipo === 'ESTADO',
    );
    expect(publicacoesDeEstado).toHaveLength(0);
  });
});

/**
 * US4 — a tela nunca mostra uma cobrança que não vale mais.
 *
 * Não é polimento: é a única fase que impede um QR obsoleto de ficar na tela e
 * o cliente seguinte pagar a cobrança do anterior.
 */
describe('DisplayCliente — US4: nada obsoleto sobrevive na tela (T035–T037)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function avancar(ms: number): void {
    act(() => {
      vi.advanceTimersByTime(ms);
    });
  }

  // FR-020: cobre a aba do checkout que trava ou é morta pelo gerenciador de
  // tarefas — casos em que nenhum código nosso roda e o `pagehide` não acontece.
  it('volta ao repouso depois de MS_SILENCIO_ATE_REPOUSO sem mensagem', () => {
    const barramento = criarBarramentoFalso();
    montar(barramento);

    entregar(barramento, mensagemDeEstado(COBRANCA_87_40));
    expect(screen.getByTestId('display-cobranca-pix')).toBeInTheDocument();

    avancar(MS_SILENCIO_ATE_REPOUSO);

    expect(screen.getByTestId('display-boas-vindas')).toBeInTheDocument();
  });

  it('o pulso mantém o QR de pé indefinidamente', () => {
    const barramento = criarBarramentoFalso();
    montar(barramento);

    entregar(barramento, mensagemDeEstado(COBRANCA_87_40));

    // Cinco pulsos: bem além da janela de corte, se ela não fosse reiniciada.
    for (let volta = 0; volta < 5; volta += 1) {
      avancar(MS_PULSO_DISPLAY);
      entregar(barramento, mensagemDeEstado(COBRANCA_87_40));
    }

    expect(screen.getByTestId('display-cobranca-pix')).toBeInTheDocument();
  });

  it('uma mensagem perdida não derruba o QR — a folga de 3× existe para isso', () => {
    const barramento = criarBarramentoFalso();
    montar(barramento);

    entregar(barramento, mensagemDeEstado(COBRANCA_87_40));
    // Dois pulsos perdidos; o terceiro chega a tempo.
    avancar(MS_PULSO_DISPLAY * 2);
    entregar(barramento, mensagemDeEstado(COBRANCA_87_40));
    avancar(MS_PULSO_DISPLAY * 2);

    expect(screen.getByTestId('display-cobranca-pix')).toBeInTheDocument();
  });

  // T036 / contrato §4: descartar **não** atualiza `recebidoEm`. Sem esta regra,
  // uma aba antiga emitindo lixo a cada 5 s manteria um QR morto na tela
  // indefinidamente — o pior desfecho possível desta feature.
  it('mensagem inválida não segura um QR morto na tela', () => {
    const barramento = criarBarramentoFalso();
    montar(barramento);

    entregar(barramento, mensagemDeEstado(COBRANCA_87_40));

    for (let volta = 0; volta < 5; volta += 1) {
      avancar(MS_PULSO_DISPLAY);
      entregar(barramento, mensagemDeEstado({ tela: 'FORMATO_DO_FUTURO' }));
    }

    expect(screen.getByTestId('display-boas-vindas')).toBeInTheDocument();
  });

  it('não verifica silêncio em repouso — não há nada a proteger ali', () => {
    const barramento = criarBarramentoFalso();
    montar(barramento);

    entregar(barramento, mensagemDeEstado({ tela: 'BOAS_VINDAS' }));
    avancar(MS_SILENCIO_ATE_REPOUSO * 4);

    expect(screen.getByTestId('display-boas-vindas')).toBeInTheDocument();
    expect(screen.getByTestId('display-nome-loja')).toHaveTextContent('Mercado Aurora');
  });

  // T037 / FR-003, SC-006 — a tela fica ligada o dia inteiro voltada ao público
  // da loja; o que estiver nela é lido por quem passar.
  it('o repouso não expõe nome, documento, item, preço nem total', () => {
    const barramento = criarBarramentoFalso();
    montar(barramento);

    entregar(barramento, mensagemDeEstado(COBRANCA_87_40));
    avancar(MS_SILENCIO_ATE_REPOUSO);

    const texto = screen.getByTestId('display-cliente').textContent ?? '';
    expect(texto).not.toMatch(/R\$/);
    expect(texto).not.toMatch(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/);
    expect(texto).not.toMatch(/total|subtotal|desconto|item|quantidade|cpf|cnpj/i);
    expect(screen.queryByTestId('display-qrcode')).not.toBeInTheDocument();
    expect(screen.queryByTestId('display-valor')).not.toBeInTheDocument();
    expect(screen.queryByTestId('display-valor-pago')).not.toBeInTheDocument();
  });
});

describe('DisplayCliente — US3: confirmação e volta ao repouso (T027/T028)', () => {
  const VOLTA_MS = 10_000;

  const APROVADO = {
    tela: 'PIX_APROVADO',
    trnGuid: TRN_GUID_SINTETICO,
    valorCentavos: 8740,
    voltaEmMs: VOLTA_MS,
  } as const;

  beforeEach(() => {
    // Relógio falso: um teste que esperasse dez segundos reais mediria o
    // agendador, não o comportamento. Nada aqui é assíncrono de rede — o
    // display não faz rede (FR-014) —, então não há corrida a temer.
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function avancar(ms: number): void {
    act(() => {
      vi.advanceTimersByTime(ms);
    });
  }

  it('mostra a confirmação com o contador e volta sozinho ao repouso (FR-024)', () => {
    const barramento = criarBarramentoFalso();
    montar(barramento);

    entregar(barramento, mensagemDeEstado(APROVADO));

    expect(screen.getByTestId('display-pagamento-aprovado')).toBeInTheDocument();
    expect(screen.getByTestId('display-contador')).toHaveTextContent('10');

    avancar(VOLTA_MS);

    expect(screen.getByTestId('display-boas-vindas')).toBeInTheDocument();
    expect(screen.queryByTestId('display-pagamento-aprovado')).not.toBeInTheDocument();
  });

  it('o contador decresce enquanto a confirmação está na tela', () => {
    const barramento = criarBarramentoFalso();
    montar(barramento);

    entregar(barramento, mensagemDeEstado(APROVADO));
    avancar(3_000);

    expect(screen.getByTestId('display-contador')).toHaveTextContent('7');
  });

  /**
   * FR-025 — é o que faz as duas telas voltarem **juntas** quando o operador
   * clica "Concluir" no décimo segundo 3, em vez de a do cliente insistir na
   * confirmação por mais sete.
   */
  it('um BOAS_VINDAS antecipado encerra o contador e vira a tela na hora', () => {
    const barramento = criarBarramentoFalso();
    montar(barramento);

    entregar(barramento, mensagemDeEstado(APROVADO));
    avancar(3_000);
    entregar(barramento, mensagemDeEstado({ tela: 'BOAS_VINDAS' }));

    expect(screen.getByTestId('display-boas-vindas')).toBeInTheDocument();
  });

  /**
   * FR-026 — o segundo PIX da mesma venda. No checkout ele corresponde à
   * remontagem do `ModalPix` por `key={idPagamento}`.
   */
  it('a troca de trnGuid reinicia a tela e descarta o contador em curso', () => {
    const barramento = criarBarramentoFalso();
    montar(barramento);

    entregar(barramento, mensagemDeEstado(APROVADO));
    avancar(3_000);

    entregar(
      barramento,
      mensagemDeEstado({ ...COBRANCA_87_40, trnGuid: TRN_GUID_SINTETICO_2, valorCentavos: 1500 }),
    );

    expect(screen.getByTestId('display-cobranca-pix')).toBeInTheDocument();
    expect(screen.getByTestId('display-valor')).toHaveTextContent('R$ 15,00');

    // Se o contador antigo tivesse sobrevivido, a tela voltaria ao repouso aqui
    // — apagando um QR novo e válido.
    avancar(VOLTA_MS);
    expect(screen.getByTestId('display-cobranca-pix')).toBeInTheDocument();
  });

  it('o pulso republicando a aprovação não reinicia a contagem', () => {
    const barramento = criarBarramentoFalso();
    montar(barramento);

    entregar(barramento, mensagemDeEstado(APROVADO));
    avancar(5_000);
    // O checkout reconfirma a cada 5 s enquanto há cobrança na tela (FR-019).
    entregar(barramento, mensagemDeEstado(APROVADO));
    avancar(5_000);

    expect(screen.getByTestId('display-boas-vindas')).toBeInTheDocument();
  });
});

describe('DisplayCliente — US2: abrir a tela no meio da cobrança (T022)', () => {
  it('pede o estado corrente ao montar (FR-017)', () => {
    const barramento = criarBarramentoFalso();
    montar(barramento);

    expect(barramento.publicadas).toContainEqual({ tipo: 'SOLICITAR_ESTADO' });
  });

  it('passa a exibir a cobrança já em curso quando a resposta chega', () => {
    const barramento = criarBarramentoFalso();
    montar(barramento);

    // É o Cenário 2 do quickstart — o ponto de atenção do pedido: o PIX foi
    // inserido **antes** de a tela do cliente existir.
    entregar(barramento, mensagemDeEstado(COBRANCA_87_40));

    expect(screen.getByTestId('display-cobranca-pix')).toBeInTheDocument();
    expect(screen.getByTestId('display-valor')).toHaveTextContent('R$ 87,40');
  });

  it('sob StrictMode não deixa canal aberto para trás', () => {
    const barramento = criarBarramentoFalso();
    render(
      <StrictMode>
        <DisplayCliente deps={{ criarCanal: barramento.criarCanal }} />
      </StrictMode>,
    );

    // O React monta, desmonta e remonta em desenvolvimento; o cleanup precisa
    // fechar o canal do primeiro ciclo, senão os ouvintes se acumulam.
    expect(barramento.canaisAbertos()).toBe(1);
    expect(barramento.publicadas).toContainEqual({ tipo: 'SOLICITAR_ESTADO' });
  });
});

describe('DisplayCliente — US1: a cobrança PIX na tela do cliente (T016)', () => {
  it('sai do repouso e mostra QR Code, valor e o aviso de espera', () => {
    const barramento = criarBarramentoFalso();
    montar(barramento);

    entregar(barramento, mensagemDeEstado(COBRANCA_87_40));

    expect(screen.getByTestId('display-cobranca-pix')).toBeInTheDocument();
    expect(screen.queryByTestId('display-boas-vindas')).not.toBeInTheDocument();

    expect(screen.getByTestId('display-qrcode')).toHaveAttribute('src', QR_CODE_SINTETICO);
    expect(screen.getByTestId('display-valor')).toHaveTextContent('R$ 87,40');
    expect(screen.getByTestId('display-aguardando')).toHaveTextContent(/aguardando/i);
  });

  it('não mostra o "copia e cola" — a tela do cliente não tem teclado (FR-005)', () => {
    const barramento = criarBarramentoFalso();
    montar(barramento);

    entregar(barramento, mensagemDeEstado(COBRANCA_87_40));

    expect(screen.queryByText(COPIA_E_COLA_SINTETICO)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /copiar/i })).not.toBeInTheDocument();
  });

  it('volta ao repouso quando o checkout publica BOAS_VINDAS', () => {
    const barramento = criarBarramentoFalso();
    montar(barramento);

    entregar(barramento, mensagemDeEstado(COBRANCA_87_40));
    entregar(barramento, mensagemDeEstado({ tela: 'BOAS_VINDAS' }));

    expect(screen.getByTestId('display-boas-vindas')).toBeInTheDocument();
    expect(screen.queryByTestId('display-cobranca-pix')).not.toBeInTheDocument();
  });

  it('mantém a cobrança na tela quando chega uma mensagem inválida (contrato §4)', () => {
    const barramento = criarBarramentoFalso();
    montar(barramento);

    entregar(barramento, mensagemDeEstado(COBRANCA_87_40));
    // Descartar não é o mesmo que voltar ao repouso: uma aba antiga publicando
    // lixo não é evidência de que a cobrança acabou.
    entregar(barramento, mensagemDeEstado({ ...COBRANCA_87_40, valorCentavos: 87.4 }));

    expect(screen.getByTestId('display-valor')).toHaveTextContent('R$ 87,40');
  });
});
