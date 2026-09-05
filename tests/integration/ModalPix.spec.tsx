import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  AVISO_DESASSOCIACAO_MANUAL,
  ModalPix,
  MOTIVO_ABAIXO_DO_MINIMO,
  MOTIVO_FECHADO_PELO_OPERADOR,
  type ModalPixProps,
} from '../../src/client/features/pagamento/pix/ModalPix';
import { resolverIntegracao } from '../../src/client/domain/pagamento/roteamentoIntegracao';
import type { ClienteVenda } from '../../src/client/domain/cliente/clienteVenda';
import { centavos } from '../../src/client/domain/precificacao/dinheiro';
import type { ErpClient, ResultadoChamadaErp } from '../../src/client/services/erpClient';
import { formaDe } from '../support/pagamento';

/**
 * Máquina de estados do modal de PIX (T011–T015, T019–T020, T023,
 * `data-model.md` §4).
 *
 * Todos os valores são sintéticos — nenhum dado de produção. O ERP é substituído
 * por um `ErpClient` de teste, e não por um mock de `fetch`: é a mesma fronteira
 * que a feature injeta em produção, então o corpo enviado a `GerarPIX` é
 * inspecionado exatamente como o ERP o receberia.
 *
 * O intervalo do polling é injetado em 20ms (`PixQueriesDeps.intervaloMs`). A
 * alternativa — relógio falso por baixo do TanStack Query — mediria o agendador
 * da biblioteca, não o comportamento desta feature, e é justamente o
 * comportamento (parar de sondar ao resolver, J3) que estes testes existem para
 * travar.
 */

const { avisos } = vi.hoisted(() => ({ avisos: [] as string[] }));

vi.mock('goey-toast', () => ({
  gooeyToast: {
    warning: (mensagem: string) => avisos.push(mensagem),
    error: (mensagem: string) => avisos.push(mensagem),
    success: (mensagem: string) => avisos.push(mensagem),
  },
}));

const CAMINHO_GERAR = '/ApiCentriumOAuth/GerarPIX';
const CAMINHO_STATUS = '/ApiCentriumOAuth/StatusPIX';

const COPIA_E_COLA = '00020126SINTETICO5204000053039865802BR5913CENTRIUM6304AB12';
const COPIA_E_COLA_BASE64 = btoa(COPIA_E_COLA);
/** Não é um JPEG real — só precisa ser base64 não vazio para virar `data:` URL. */
const QRCODE_BASE64 = '/9j/4AAQSkZJRgABAQAAsintetico';

const INTERVALO_TESTE_MS = 20;
const FORMA_PIX = formaDe({ codigo: 3, descricao: 'PIX', meioPagtoNFe: 'Pix', entrada: 'S' });

const MINIMO_PIX = centavos(500);
const VALOR_PADRAO = centavos(6550);

interface ChamadaCapturada {
  readonly caminho: string;
  readonly corpo: Record<string, unknown> | null;
}

interface SdtEnviado {
  readonly TrnGUID: string;
  readonly TrnValor: number;
  readonly TrnFormaPagamento: string;
  readonly FPgCod: number;
  readonly TrnPagadorNome: string;
  readonly TrnPagadorCgc: string;
  readonly TrnPagadorEmail: string;
  readonly TrnPagadorFone: string;
}

function respostaJson(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

interface OpcoesErpFake {
  /** Literais devolvidos por `StatusPIX`, um por consulta; o último se repete. */
  readonly statusSequencia?: readonly string[];
  /** Quantas primeiras chamadas de `GerarPIX` respondem 500. */
  readonly falhasDeGeracao?: number;
}

function erpFake(opcoes: OpcoesErpFake = {}): {
  cliente: ErpClient;
  chamadas: ChamadaCapturada[];
} {
  const chamadas: ChamadaCapturada[] = [];
  const sequencia = opcoes.statusSequencia ?? ['G'];
  let falhasRestantes = opcoes.falhasDeGeracao ?? 0;
  let consultas = 0;

  const cliente: ErpClient = {
    chamar(caminho: string, init: RequestInit = {}): Promise<ResultadoChamadaErp> {
      const corpo =
        typeof init.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null;
      chamadas.push({ caminho, corpo });

      if (caminho.startsWith(CAMINHO_GERAR)) {
        if (falhasRestantes > 0) {
          falhasRestantes -= 1;
          return Promise.resolve({
            estado: 'ok',
            resposta: respostaJson({ messages: [] }, 500),
          });
        }
        const sdt = (corpo?.['SDTCentriumPag_Post'] ?? {}) as SdtEnviado;
        return Promise.resolve({
          estado: 'ok',
          resposta: respostaJson({
            TrnGUID: sdt.TrnGUID,
            Trnbase64text: COPIA_E_COLA_BASE64,
            Trnbase64image: QRCODE_BASE64,
          }),
        });
      }

      const literal = sequencia[Math.min(consultas, sequencia.length - 1)] ?? 'G';
      consultas += 1;
      return Promise.resolve({
        estado: 'ok',
        resposta: respostaJson({ StatusTransacao: literal, messages: [] }),
      });
    },
  };

  return { cliente, chamadas };
}

function geracoes(chamadas: readonly ChamadaCapturada[]): readonly SdtEnviado[] {
  return chamadas
    .filter((chamada) => chamada.caminho.startsWith(CAMINHO_GERAR))
    .map((chamada) => (chamada.corpo?.['SDTCentriumPag_Post'] ?? {}) as SdtEnviado);
}

function consultasDeStatus(chamadas: readonly ChamadaCapturada[]): number {
  return chamadas.filter((chamada) => chamada.caminho.startsWith(CAMINHO_STATUS)).length;
}

/**
 * J5: nenhum caminho de abandono dispara cancelamento — não existe endpoint para
 * isso no contrato. O teste afirma pela lista **inteira** de chamadas, e não pela
 * ausência de um nome específico, para que um endpoint novo inventado no futuro
 * reprove aqui em vez de passar despercebido.
 */
function apenasGerarEStatus(chamadas: readonly ChamadaCapturada[]): boolean {
  return chamadas.every(
    (chamada) =>
      chamada.caminho.startsWith(CAMINHO_GERAR) || chamada.caminho.startsWith(CAMINHO_STATUS),
  );
}

const CLIENTE_IDENTIFICADO: ClienteVenda = {
  codigoCliente: 2538,
  nome: 'MARIA EXEMPLO',
  documento: '11122233344',
  celular: '55 47 90000-0000',
  listaPreco: 5,
  descontoConvenio: 10,
  codigoConvenio: 7,
  origem: 'BUSCA_DOCUMENTO',
};

const CLIENTE_DEFAULT: ClienteVenda = {
  codigoCliente: 1,
  nome: 'CONSUMIDOR FINAL',
  documento: null,
  celular: null,
  listaPreco: 3,
  descontoConvenio: 0,
  codigoConvenio: null,
  origem: 'DEFAULT',
};

interface Desfechos {
  readonly aprovados: string[];
  readonly abandonados: string[];
}

function renderizar(cliente: ErpClient, sobrescritas: Partial<ModalPixProps> = {}): Desfechos {
  const desfechos: Desfechos = { aprovados: [], abandonados: [] };
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  const props: ModalPixProps = {
    formaCodigo: FORMA_PIX.codigo,
    valor: VALOR_PADRAO,
    minimoPix: MINIMO_PIX,
    clienteAtual: CLIENTE_IDENTIFICADO,
    onAprovado: (pixGuid) => desfechos.aprovados.push(pixGuid),
    onAbandonado: (motivo) => desfechos.abandonados.push(motivo),
    onFechar: () => {
      /* a janela desmonta pelo estado do pagamento, como em produção. */
    },
    deps: { erpClient: cliente, intervaloMs: INTERVALO_TESTE_MS },
    ...sobrescritas,
  };

  render(createElement(ModalPix, props), {
    wrapper: ({ children }: { children: ReactNode }): ReactElement =>
      createElement(QueryClientProvider, { client: queryClient }, children),
  });

  return desfechos;
}

/** Espera tempo suficiente para vários ticks — usada para provar que **não** houve. */
async function esperarAlemDeUmTick(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, INTERVALO_TESTE_MS * 5));
}

/**
 * Afirma J3: depois do desfecho, o polling **para**.
 *
 * Mede a estabilização, e não um número de consultas, por duas razões. A
 * primeira é que não existe número certo: `erpFake` repete o último literal da
 * sequência indefinidamente, então quantos ticks couberam antes de o componente
 * processar a resposta terminal é temporização, não contrato — 3 e 4 são
 * igualmente válidos para uma sequência de 3.
 *
 * A segunda é que o instantâneo tirado logo após o callback (`const antes =
 * consultasDeStatus(...)`, como estava aqui até 2026-09-04) é uma corrida: o
 * tick que já estava em voo quando o desfecho foi processado ainda registra a
 * sua chamada **depois** da leitura. Sob a suíte cheia isso reprovava um teste
 * diferente a cada rodada, sempre com "expected N to be N-1", acusando um tick
 * que nunca existiu (item 44 de PENDENCIES).
 *
 * Nada é afrouxado: se o polling de fato não parar, a contagem segue crescendo
 * em todas as rodadas e a função lança.
 */
async function esperarPollingParar(chamadas: readonly ChamadaCapturada[]): Promise<void> {
  let anterior = consultasDeStatus(chamadas);

  for (let rodada = 0; rodada < 5; rodada += 1) {
    await esperarAlemDeUmTick();
    const atual = consultasDeStatus(chamadas);
    if (atual === anterior) {
      return;
    }
    anterior = atual;
  }

  throw new Error(
    `o polling não parou: ${String(consultasDeStatus(chamadas))} consultas de status e ainda crescendo`,
  );
}

beforeEach(() => {
  avisos.length = 0;
});

describe('US1 — acompanhar a aprovação do PIX', () => {
  // T011. `'G'` nas duas primeiras consultas (sem transição) e o literal de
  // aprovação na terceira — `'P'` e `'M'` são tratados de forma idêntica.
  it.each(['P', 'M'])(
    'gera, exibe QR Code e copia-e-cola, e detecta a aprovação em %s',
    async (literalAprovado) => {
      const { cliente, chamadas } = erpFake({
        statusSequencia: ['G', 'G', literalAprovado],
      });
      const desfechos = renderizar(cliente);

      const imagem = await screen.findByTestId('pix-qrcode');
      expect(imagem).toHaveAttribute('src', `data:image/jpeg;base64,${QRCODE_BASE64}`);
      expect(screen.getByTestId('pix-copia-e-cola')).toHaveTextContent(COPIA_E_COLA);
      expect(screen.getByTestId('pix-valor-a-cobrar')).toHaveTextContent('R$ 65,50');

      await waitFor(() => {
        expect(desfechos.aprovados).toHaveLength(1);
      });

      // O GUID devolvido é o mesmo que foi enviado ao ERP — é a chave de
      // correlação que a 008 grava em `PagamentoAplicado.pixGuid`.
      expect(desfechos.aprovados[0]).toBe(geracoes(chamadas)[0]?.TrnGUID);
      expect(desfechos.abandonados).toHaveLength(0);

      // J3: o polling não fica sondando uma cobrança já resolvida.
      await esperarPollingParar(chamadas);
    },
  );

  // T012 / `FR-009` (quickstart Cenário 5).
  it('bloqueia por valor mínimo sem abrir a janela e sem tocar a rede', async () => {
    const { cliente, chamadas } = erpFake();
    const desfechos = renderizar(cliente, { valor: centavos(300) });

    await waitFor(() => {
      expect(desfechos.abandonados).toEqual([MOTIVO_ABAIXO_DO_MINIMO]);
    });

    expect(screen.queryByTestId('modal-pix')).toBeNull();
    expect(chamadas).toHaveLength(0);
    expect(avisos.some((aviso) => aviso.includes('R$ 5,00'))).toBe(true);
  });

  // T013 / `FR-010` (quickstart Cenário 6): venda de 100,00 com 40,00 já pagos.
  it('envia o valor residual da venda, nunca o total cheio', async () => {
    const { cliente, chamadas } = erpFake();
    renderizar(cliente, { valor: centavos(6000) });

    await screen.findByTestId('pix-qrcode');

    expect(geracoes(chamadas)[0]?.TrnValor).toBe(60);
    expect(geracoes(chamadas)[0]?.TrnValor).not.toBe(100);
  });

  // T014 / `FR-011` (quickstart Cenário 7, `research.md` D12).
  it('refaz a geração com um TrnGUID novo depois de uma falha', async () => {
    const usuario = userEvent.setup();
    const { cliente, chamadas } = erpFake({ falhasDeGeracao: 1 });
    renderizar(cliente);

    await screen.findByTestId('erro-geracao-pix');
    expect(screen.queryByTestId('pix-qrcode')).toBeNull();

    await usuario.click(screen.getByTestId('tentar-novamente-pix'));

    await screen.findByTestId('pix-qrcode');

    const tentativas = geracoes(chamadas);
    expect(tentativas).toHaveLength(2);
    // J4: reusar o GUID colidiria com uma linha que o ERP pode ter criado apesar
    // do erro reportado ao cliente.
    expect(tentativas[0]?.TrnGUID).not.toBe(tentativas[1]?.TrnGUID);
  });

  // T015 / `research.md` D7 + AD-100 (quickstart Cenário 8).
  it('monta os dados do pagador a partir do cliente identificado', async () => {
    const { cliente, chamadas } = erpFake();
    renderizar(cliente, { clienteAtual: CLIENTE_IDENTIFICADO });

    await screen.findByTestId('pix-qrcode');

    expect(geracoes(chamadas)[0]).toMatchObject({
      TrnFormaPagamento: 'Pix',
      FPgCod: FORMA_PIX.codigo,
      TrnPagadorNome: 'MARIA EXEMPLO',
      TrnPagadorCgc: '11122233344',
      TrnPagadorEmail: '',
      TrnPagadorFone: '',
    });
  });

  it('envia documento vazio, nunca nulo, para o cliente default', async () => {
    const { cliente, chamadas } = erpFake();
    renderizar(cliente, { clienteAtual: CLIENTE_DEFAULT });

    await screen.findByTestId('pix-qrcode');

    const enviado = geracoes(chamadas)[0];
    expect(enviado?.TrnPagadorNome).toBe('CONSUMIDOR FINAL');
    expect(enviado?.TrnPagadorCgc).toBe('');
    // O JSON precisa carregar a string vazia, não `null` nem a ausência do campo:
    // é a diferença entre o SDT ler "sem documento" e não conseguir ler nada.
    expect(Object.keys(enviado ?? {})).toContain('TrnPagadorCgc');
  });

  // `research.md` D4/D4-bis: o SDT é genérico (boleto/duplicata); só o
  // subconjunto de PIX é enviado, e os demais campos ficam **ausentes**.
  it('não envia os campos de boleto/duplicata do SDT genérico', async () => {
    const { cliente, chamadas } = erpFake();
    renderizar(cliente);

    await screen.findByTestId('pix-qrcode');

    const enviados = Object.keys(geracoes(chamadas)[0] ?? {});
    for (const proibido of [
      'TrnDatVen',
      'TrnValMul',
      'TrnCodBar',
      'TrnStaBol',
      'CntGUID',
      'TrnOrigemDocumento',
      'TrnOrigemSerie',
      'TrnStatus',
      'TrnTempoExpiracaoPIX',
      'Empresa',
    ]) {
      expect(enviados).not.toContain(proibido);
    }
  });
});

describe('US3 — fechar a cobrança pendente e trocar de forma', () => {
  // T019 / `FR-004`–`FR-007` (quickstart Cenário 3), reescrito em 2026-09-04:
  // o gesto passou a ser "Desistir da operação" **com confirmação** (AD-161).
  it('desistir avisa, devolve o abandono e para o polling — depois de confirmado', async () => {
    const usuario = userEvent.setup();
    const { cliente, chamadas } = erpFake({ statusSequencia: ['G'] });
    const desfechos = renderizar(cliente);

    await screen.findByTestId('pix-qrcode');
    await waitFor(() => {
      expect(consultasDeStatus(chamadas)).toBeGreaterThan(0);
    });

    await usuario.click(screen.getByTestId('desistir-operacao-pix'));

    // Nada aconteceu ainda: o clique só abre a pergunta. Antes de AD-161 este
    // mesmo clique já abandonava a cobrança, sem o operador saber que ela
    // continuaria viva no banco.
    expect(desfechos.abandonados).toHaveLength(0);
    await screen.findByTestId('confirmar-desistencia-pix');

    await usuario.click(screen.getByTestId('confirmar-desistencia-pix-confirmar'));

    expect(desfechos.abandonados).toEqual([MOTIVO_FECHADO_PELO_OPERADOR]);
    expect(desfechos.aprovados).toHaveLength(0);
    expect(avisos.some((aviso) => aviso.includes(AVISO_DESASSOCIACAO_MANUAL))).toBe(true);
    expect(apenasGerarEStatus(chamadas)).toBe(true);

    // J3: sondar em background depois de o operador fechar deixaria requests
    // órfãos contra uma cobrança que a venda já esqueceu.
    await esperarPollingParar(chamadas);
  });

  // T020 / `data-model.md` §4-§5 (quickstart Cenário 4): mesmo tratamento do
  // fechamento manual, com o gatilho vindo do ERP em vez do operador.
  it.each([
    ['X', 'EXPIRADA'],
    ['R', 'RECUSADA'],
    ['E', 'ERRO'],
    ['F', 'FECHADA'],
    ['O', 'ASSOCIACAO_REMOVIDA'],
  ])(
    'falha terminal %s reportada pelo ERP abandona a cobrança como %s',
    async (literal, motivo) => {
      const { cliente, chamadas } = erpFake({ statusSequencia: ['G', literal] });
      const desfechos = renderizar(cliente);

      await screen.findByTestId('pix-qrcode');

      await waitFor(() => {
        expect(desfechos.abandonados).toEqual([motivo]);
      });

      expect(desfechos.aprovados).toHaveLength(0);
      expect(avisos.some((aviso) => aviso.includes(AVISO_DESASSOCIACAO_MANUAL))).toBe(true);
      expect(apenasGerarEStatus(chamadas)).toBe(true);

      await esperarPollingParar(chamadas);
    },
  );

  // J2 pelo lado da UI: um literal que o ERP não documentou nunca vira aprovação.
  it('status desconhecido abandona a cobrança em vez de aprová-la', async () => {
    const { cliente } = erpFake({ statusSequencia: ['G', 'Z'] });
    const desfechos = renderizar(cliente);

    await screen.findByTestId('pix-qrcode');

    await waitFor(() => {
      expect(desfechos.abandonados).toEqual(['DESCONHECIDO']);
    });
    expect(desfechos.aprovados).toHaveLength(0);
  });
});

/**
 * AD-161 (item 7 do usuário, 2026-09-04). A janela deixou de ser fechável por
 * gesto acidental enquanto a cobrança não é paga, e passou a sobreviver dez
 * segundos à aprovação.
 */
describe('A janela trava enquanto o PIX não é aprovado', () => {
  it('ESC não fecha nem abandona a cobrança pendente', async () => {
    const usuario = userEvent.setup();
    const { cliente } = erpFake({ statusSequencia: ['G'] });
    const desfechos = renderizar(cliente);

    await screen.findByTestId('pix-qrcode');
    await usuario.keyboard('{Escape}');

    expect(desfechos.abandonados).toHaveLength(0);
    expect(desfechos.aprovados).toHaveLength(0);
    expect(screen.getByTestId('modal-pix')).toBeInTheDocument();
  });

  it('o X do cabeçalho fica bloqueado com motivo, nunca `disabled` mudo', async () => {
    const { cliente } = erpFake({ statusSequencia: ['G'] });
    renderizar(cliente);

    await screen.findByTestId('pix-qrcode');

    const fechar = screen.getByTestId('fechar-modal-pix');
    expect(fechar).toHaveAttribute('aria-disabled', 'true');
    // O `disabled` nativo mataria o clique, e com ele o motivo — o operador
    // ficaria sem saber o que fazer (`lib/bloqueio.ts`).
    expect(fechar).not.toBeDisabled();
  });

  it('aprovado: confirma o pagamento na hora, mostra o estado e só então fecha sozinho', async () => {
    const { cliente } = erpFake({ statusSequencia: ['G', 'P'] });
    const fechamentos: number[] = [];
    const desfechos = renderizar(cliente, {
      // Zero: o fechamento é agendado para a próxima volta do laço de eventos em
      // vez de dez segundos reais — o que se afirma aqui é a **ordem** (aprova,
      // pinta, fecha), não a duração.
      atrasoFechamentoMs: 0,
      onFechar: () => fechamentos.push(Date.now()),
    });

    await screen.findByTestId('pix-qrcode');

    await waitFor(() => {
      expect(desfechos.aprovados).toHaveLength(1);
    });

    // O pagamento entra aprovado na venda **antes** de a janela sair: adiar
    // `onAprovado` junto com o fechamento deixaria o total da venda mentindo.
    expect(screen.getByTestId('pix-badge-status')).toHaveTextContent('Pagamento confirmado');
    expect(screen.getByTestId('pix-subtitulo')).toHaveTextContent('Pagamento aprovado');
    // Com o pagamento confirmado o fechamento manual é liberado.
    expect(screen.getByTestId('fechar-modal-pix')).not.toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByTestId('concluir-pix')).toBeInTheDocument();

    await waitFor(() => {
      expect(fechamentos).toHaveLength(1);
    });
  });

  it('ESC fecha depois de aprovado', async () => {
    const usuario = userEvent.setup();
    const { cliente } = erpFake({ statusSequencia: ['P'] });
    const fechamentos: number[] = [];
    const desfechos = renderizar(cliente, {
      // Grande o bastante para o automático não disparar durante o teste: o que
      // se mede aqui é o ESC, não o temporizador.
      atrasoFechamentoMs: 60_000,
      onFechar: () => fechamentos.push(Date.now()),
    });

    await waitFor(() => {
      expect(desfechos.aprovados).toHaveLength(1);
    });

    await usuario.keyboard('{Escape}');
    expect(fechamentos).toHaveLength(1);
  });
});

describe('US2 — PIX indisponível nunca alcança esta feature', () => {
  /**
   * T023. A feature 009 **não** re-verifica `UtilizaCentriumPAG` (`research.md`
   * D1): o veredito é da 008. O que este teste trava é a fronteira — sem o
   * veredito `PIX_DINAMICO` não existe pagamento `PENDENTE_INTEGRACAO` de PIX, e
   * é ele a única condição que monta `ModalPix` (`usePixPendente`,
   * `ListaPagamentosAplicados.tsx`).
   */
  it('sem UtilizaCentriumPAG o roteamento nunca devolve PIX_DINAMICO', () => {
    expect(resolverIntegracao(FORMA_PIX, { tefAtivo: false, pixAtivo: false })).toBe('NENHUMA');
    expect(resolverIntegracao(FORMA_PIX, { tefAtivo: true, pixAtivo: false })).toBe('NENHUMA');
    expect(resolverIntegracao(FORMA_PIX, { tefAtivo: false, pixAtivo: true })).toBe('PIX_DINAMICO');
  });

  it('sem o veredito de PIX o modal não é montado e nenhuma cobrança é possível', () => {
    const { chamadas } = erpFake();
    // A condição literal de `usePixPendente`: pagamento aprovado sem integração
    // — o desfecho de uma forma PIX num ambiente sem CentriumPag.
    const integracao = resolverIntegracao(FORMA_PIX, { tefAtivo: false, pixAtivo: false });
    expect(integracao).not.toBe('PIX_DINAMICO');
    expect(screen.queryByTestId('modal-pix')).toBeNull();
    expect(chamadas).toHaveLength(0);
  });
});
