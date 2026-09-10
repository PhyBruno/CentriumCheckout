import { beforeEach, describe, expect, it, vi } from 'vitest';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { centavos } from '../../src/client/domain/precificacao/dinheiro';
import type { SnapshotPrecoProduto } from '../../src/client/domain/precificacao/linha';
import type {
  CondicaoPagamento,
  FormaPagamento,
} from '../../src/client/domain/pagamento/formaPagamento';
import type { IntegracaoPagamento } from '../../src/client/domain/pagamento/roteamentoIntegracao';
import type { ResultadoTicket } from '../../src/client/domain/pagamento/valeDevolucao';
import {
  montarRetratoVenda,
  type CheckoutFaturarNFCe,
  type SnapshotVenda,
} from '../../src/client/domain/venda/montarRetratoVenda';
import type { Veredito as VereditoCompleto } from '../../src/client/domain/validacaoVenda/interpretarVeredito';
import { criarAuditoriaSlice } from '../../src/client/stores/slices/auditoriaSlice';
import {
  criarCarrinhoSlice,
  type CarrinhoDeps,
} from '../../src/client/stores/slices/carrinhoSlice';
import { criarClienteSlice, type ClienteDeps } from '../../src/client/stores/slices/clienteSlice';
import {
  criarIdentidadeVendaSlice,
  type IdentidadeVendaDeps,
} from '../../src/client/stores/slices/identidadeVendaSlice';
import {
  criarVendedorSlice,
  type VendedorDeps,
} from '../../src/client/stores/slices/vendedorSlice';
import {
  criarPagamentoSlice,
  AVISO_VENDA_MUDOU_DURANTE_VALIDACAO,
  type ContextoIntegracao,
  type PagamentoDeps,
} from '../../src/client/stores/slices/pagamentoSlice';
import {
  criarValidacaoVendaSlice,
  type ValidacaoDeps,
} from '../../src/client/stores/slices/validacaoVendaSlice';
import type { VendaState } from '../../src/client/stores/vendaStore';
import { enviarValidarNFCe } from '../../src/client/services/validacao/validarNFCeMutation';
import { MEIO_PAGTO } from '../../src/client/domain/pagamento/formaPagamento';
import { formaDe } from '../support/pagamento';

/**
 * Gate de validação prévia, no nível de integração (feature 014).
 *
 * Cobre T012, T013, T014, T016, T017, T018, T019, T021, T022, T023, T024 e T025.
 *
 * O store é montado com os slices **reais** — pagamento e validação ligados um
 * ao outro exatamente como `vendaStore.ts` os liga. É isso que torna "o botão e
 * o atalho passam pelo mesmo gate" (US3) uma afirmação sobre o código de
 * produção, e não sobre um duplo. Só a rede e a notificação são duplos: são as
 * fronteiras que o slice existe para não atravessar.
 *
 * Todas as fixtures são sintéticas; nenhum dado de produção.
 */

const TOTAL_PADRAO = 10_000; // R$ 100,00 em centavos
const WARNING = 1;
const ERROR = 2;

const DINHEIRO = formaDe({
  codigo: 1,
  descricao: 'DINHEIRO',
  entrada: 'S',
  meioPagtoNFe: MEIO_PAGTO.Dinheiro,
});

/** Crediário: é a forma cujo `fpgUtiCar` o ERP soma em `&TotalCrediario`. */
const CREDIARIO = formaDe({
  codigo: 7,
  descricao: 'CREDIARIO',
  entrada: 'N',
  meioPagtoNFe: MEIO_PAGTO.Outros,
  fpgUtiCar: 'CRD',
});

const CARTAO_TEF = formaDe({
  codigo: 2,
  descricao: 'CARTAO CREDITO',
  entrada: 'N',
  meioPagtoNFe: MEIO_PAGTO.CartaoCredito,
  integracaoCartao: '1',
});

function condicaoDe(codigo: number, descricao: string): CondicaoPagamento {
  return {
    codigo,
    descricao,
    prazo: 0,
    minimoEntrada: centavos(0),
    desconto: 0,
    descontoMaximo: 0,
    formas: [DINHEIRO, CREDIARIO, CARTAO_TEF] as readonly FormaPagamento[],
  };
}

const A_VISTA = condicaoDe(1, 'A VISTA');
const A_PRAZO = condicaoDe(2, 'A PRAZO');

const SNAPSHOT: SnapshotVenda = {
  empresa: '1',
  linhas: [],
  identidade: { origem: 'NOVA', numeroNota: 0 },
  cadSerieNFCe: 'SER1',
  clienteCodigo: 4321,
  vendedorCodigo: 7,
  condicaoPagamentoCodigo: A_VISTA.codigo,
  eventos: [],
};

const ACEITA: VereditoCompleto = { resultado: 'ACEITA', avisos: [] };

function recusa(texto: string, tipo = ERROR): VereditoCompleto {
  return {
    resultado: 'RECUSADA',
    motivos: [{ id: '9999', severidade: tipo === WARNING ? 'AVISO' : 'ERRO', texto }],
  };
}

/* ------------------------------------------------------------------ *
 * Montagem do store — pagamento e validação ligados como em produção
 * ------------------------------------------------------------------ */

interface Opcoes {
  readonly condicao?: CondicaoPagamento;
  readonly capacidades?: { tefAtivo: boolean; pixAtivo: boolean };
}

function montarStore(opcoes: Opcoes = {}) {
  const capacidades = opcoes.capacidades ?? { tefAtivo: false, pixAtivo: false };

  const validar = vi.fn((_retrato: CheckoutFaturarNFCe): Promise<VereditoCompleto> =>
    Promise.resolve(ACEITA),
  );
  const notificar = vi.fn((_veredito: VereditoCompleto) => undefined);
  const iniciarIntegracao = vi.fn((_i: IntegracaoPagamento, _ctx: ContextoIntegracao) => undefined);
  const avisar = vi.fn((_mensagem: string) => undefined);
  const retratosEnviados: CheckoutFaturarNFCe[] = [];

  const depsValidacao: ValidacaoDeps = {
    snapshotVenda: () => ({
      ...SNAPSHOT,
      condicaoPagamentoCodigo: store.getState().condicaoSelecionada?.codigo ?? 0,
      eventos: store.getState().eventos,
    }),
    pagamentosAplicados: () => store.getState().pagamentos,
    rateioDescontoCapa: () => store.getState().montarPagamentosParaPayload().rateioDescontoCapa,
    validar: (retrato) => {
      retratosEnviados.push(retrato);
      return validar(retrato);
    },
    registrarEvento: (evento) => {
      store.getState().registrarEventoAuditoria(evento);
    },
    notificar,
  };

  let sequencia = 0;
  const depsPagamento: PagamentoDeps = {
    subtotalCarrinho: () => centavos(TOTAL_PADRAO),
    linhasRateaveis: () => [],
    capacidades: () => capacidades,
    validarTicket: (): Promise<ResultadoTicket> =>
      Promise.resolve({ valido: false, mensagem: 'não exercitado' }),
    iniciarIntegracao,
    // Ligação idêntica à de `vendaStore.pagamentoDepsPadrao`: reduz o veredito
    // completo à porta `aceita` sim/não, **sem** motivo — o slice de validação
    // já notificou.
    validarInsercao: async (candidata, origem) => {
      const veredito = await store.getState().validarInsercao(candidata, origem);
      return veredito.resultado === 'ACEITA' ? { aceita: true } : { aceita: false };
    },
    invalidarVeredito: () => {
      store.getState().invalidarVeredito();
    },
    validacaoDispensadaPorDocumento: () => {
      store.getState().dispensarValidacaoPorDocumento();
    },
    avisar,
    gerarIdPagamento: () => {
      sequencia += 1;
      return `pag-${String(sequencia)}`;
    },
  };

  const depsCarrinho: CarrinhoDeps = {
    podeMutarCarrinho: () => true,
    tipoPrecoAtual: () => 1,
    clienteAtual: () => null,
  };
  const depsCliente: ClienteDeps = {
    podeMutarCarrinho: () => true,
    buscarSnapshotProduto: (): Promise<SnapshotPrecoProduto> =>
      Promise.reject(new Error('busca de produto não é exercitada nesta suíte')),
  };
  const depsIdentidade: IdentidadeVendaDeps = { podeMutarCarrinho: () => true };
  const depsVendedor: VendedorDeps = { podeMutarCarrinho: () => true };

  const store = create<VendaState>()(
    immer((...args) => ({
      ...criarAuditoriaSlice(...args),
      ...criarCarrinhoSlice(depsCarrinho)(...args),
      ...criarIdentidadeVendaSlice(depsIdentidade)(...args),
      ...criarClienteSlice(depsCliente)(...args),
      ...criarPagamentoSlice(depsPagamento)(...args),
      ...criarValidacaoVendaSlice(depsValidacao)(...args),
      ...criarVendedorSlice(depsVendedor)(...args),
    })),
  );

  store.getState().resetarAuditoria('NOVA');
  store.getState().selecionarCondicao(opcoes.condicao ?? A_VISTA);

  return { store, validar, notificar, iniciarIntegracao, avisar, retratosEnviados };
}

function tiposDeEvento(store: ReturnType<typeof montarStore>['store']): readonly string[] {
  return store.getState().eventos.map((evento) => evento.tipo);
}

/* ------------------------------------------------------------------ *
 * T012 — núcleo do slice
 * ------------------------------------------------------------------ */

describe('validacaoVendaSlice — núcleo (T012)', () => {
  it('RECUSADA não muta vereditoVigente nem o estado da venda (I1)', async () => {
    const { store, validar } = montarStore();
    validar.mockResolvedValue(recusa('Cliente está com crédito bloqueado.'));

    await store.getState().aplicarPagamento({ forma: DINHEIRO, valorInformado: centavos(10_000) });

    expect(store.getState().pagamentos).toEqual([]);
    expect(store.getState().vereditoVigente).toBeNull();
    expect(store.getState().podeFinalizar()).toBe(false);
  });

  it('ACEITA grava o veredito vigente e libera a finalização (I6)', async () => {
    const { store } = montarStore();

    await store.getState().aplicarPagamento({ forma: DINHEIRO, valorInformado: centavos(10_000) });

    expect(store.getState().vereditoVigente).toEqual(ACEITA);
    expect(store.getState().podeFinalizar()).toBe(true);
  });

  it('dois acionamentos sem aguardar o primeiro fazem UMA consulta só (FR-011, I8)', async () => {
    const { store, validar } = montarStore();
    let liberar: (veredito: VereditoCompleto) => void = () => undefined;
    validar.mockReturnValue(
      new Promise<VereditoCompleto>((resolve) => {
        liberar = resolve;
      }),
    );

    const primeira = store.getState().validarInsercao(
      {
        formaCodigo: DINHEIRO.codigo,
        meioPagtoNFe: MEIO_PAGTO.Dinheiro,
        valor: centavos(5_000),
        fpgUtiCar: '',
        entrada: 'S',
        integracaoCartao: '',
        ticketDevolucao: null,
      },
      'MANUAL',
    );

    const segunda = await store.getState().validarInsercao(
      {
        formaCodigo: DINHEIRO.codigo,
        meioPagtoNFe: MEIO_PAGTO.Dinheiro,
        valor: centavos(5_000),
        fpgUtiCar: '',
        entrada: 'S',
        integracaoCartao: '',
        ticketDevolucao: null,
      },
      'MANUAL',
    );

    // O segundo gesto volta sem consultar — e como `INDISPONIVEL`, não como
    // recusa de negócio: nada foi perguntado ao ERP.
    expect(segunda.resultado).toBe('INDISPONIVEL');
    expect(validar).toHaveBeenCalledTimes(1);

    liberar(ACEITA);
    await primeira;
    expect(store.getState().emValidacao).toBe(false);
  });

  it('o retrato enviado contém as formas aplicadas MAIS a candidata (I2)', async () => {
    const { store, retratosEnviados } = montarStore();

    await store.getState().aplicarPagamento({ forma: DINHEIRO, valorInformado: centavos(4_000) });
    await store.getState().aplicarPagamento({ forma: CREDIARIO, valorInformado: centavos(6_000) });

    expect(retratosEnviados).toHaveLength(2);
    expect(retratosEnviados[0]?.FormasDePagamento).toHaveLength(1);
    // Segunda consulta: a forma já aplicada **mais** a candidata.
    expect(retratosEnviados[1]?.FormasDePagamento.map((forma) => forma.FormaCodigo)).toEqual([
      DINHEIRO.codigo,
      CREDIARIO.codigo,
    ]);
    expect(retratosEnviados[1]?.FormasDePagamento[1]).toMatchObject({ FormaFpgUtiCar: 'CRD' });
  });

  it('invalidarVeredito zera o veredito vigente (I7)', async () => {
    const { store } = montarStore();
    await store.getState().aplicarPagamento({ forma: DINHEIRO, valorInformado: centavos(10_000) });
    expect(store.getState().vereditoVigente).not.toBeNull();

    store.getState().invalidarVeredito();

    expect(store.getState().vereditoVigente).toBeNull();
    expect(store.getState().podeFinalizar()).toBe(false);
  });

  it('o retrato de VALIDAR é idêntico ao de FATURAR, exceto SuspenderOuFaturar (I5, C2)', async () => {
    const { store, retratosEnviados } = montarStore();

    await store.getState().aplicarPagamento({ forma: DINHEIRO, valorInformado: centavos(10_000) });

    const enviado = retratosEnviados[0];
    expect(enviado).toBeDefined();

    // Mesmo snapshot, mesma lista de pagamentos projetados: o retrato que a
    // emissão produziria precisa bater campo a campo.
    const paraFaturar = montarRetratoVenda(
      { ...SNAPSHOT, condicaoPagamentoCodigo: A_VISTA.codigo, eventos: store.getState().eventos },
      'FATURAR',
      enviado?.FormasDePagamento ?? [],
      store.getState().montarPagamentosParaPayload().rateioDescontoCapa,
    );

    // `'VALIDAR'` chega ao ERP como `'FATURAR'` — a igualdade é total, o que é
    // mais forte do que "difere só em um campo".
    expect(enviado?.SuspenderOuFaturar).toBe('FATURAR');
    expect({ ...enviado, Log: '' }).toEqual({ ...paraFaturar, Log: '' });

    // A comparação acima alimenta o retrato de `FATURAR` com a **própria** lista
    // validada, então ela prova os campos de cabeçalho e nada diz sobre as
    // formas. Esta segunda asserção fecha a lacuna pelo lado que importa: a
    // forma que o gate validou é, campo a campo, a que a emissão enviaria a
    // partir do estado — mesma função `formaParaRetrato` nas duas pontas (I5).
    expect(enviado?.FormasDePagamento).toEqual(
      store.getState().montarPagamentosParaPayload().FormasDePagamento,
    );
  });
});

/* ------------------------------------------------------------------ *
 * T013 — falha de comunicação (quickstart, Cenário 4)
 * ------------------------------------------------------------------ */

describe('validacaoVendaSlice — indisponibilidade do ERP (T013, FR-009, I4)', () => {
  const CASOS = [
    { causa: 'REDE', resposta: { estado: 'erro-de-rede' as const } },
    {
      causa: 'SERVIDOR',
      resposta: { estado: 'ok' as const, resposta: new Response('erro', { status: 500 }) },
    },
    {
      causa: 'RESPOSTA_INVALIDA',
      resposta: {
        estado: 'ok' as const,
        // 200 **sem** o campo `Valido`: nunca é aceite presumido.
        resposta: new Response(JSON.stringify({ messages: [] }), { status: 200 }),
      },
    },
  ] as const;

  for (const caso of CASOS) {
    it(`${caso.causa} vira INDISPONIVEL, sem retentativa automática`, async () => {
      const chamar = vi.fn().mockResolvedValue(caso.resposta);

      const veredito = await enviarValidarNFCe({} as CheckoutFaturarNFCe, {
        erpClient: { chamar },
      });

      expect(veredito).toEqual({ resultado: 'INDISPONIVEL', causa: caso.causa });
      // `retry: 0` (research.md D5): a nova tentativa é gesto do operador.
      expect(chamar).toHaveBeenCalledTimes(1);
    });
  }

  it('TIMEOUT é distinto de REDE, mesmo o erpClient devolvendo o mesmo estado', async () => {
    // `criarErpClient` traduz **qualquer** exceção do fetch (o `AbortError`
    // incluído) para `erro-de-rede`. Sem a flag própria de expiração, um ERP
    // lento chegaria ao operador com a frase de "sem comunicação" — duas causas
    // distintas com o mesmo texto, e nenhuma pista de que basta esperar.
    const chamar = vi.fn(
      (_caminho: string, init?: RequestInit) =>
        new Promise<{ estado: 'erro-de-rede' }>((resolve) => {
          init?.signal?.addEventListener('abort', () => {
            resolve({ estado: 'erro-de-rede' });
          });
        }),
    );

    const veredito = await enviarValidarNFCe({} as CheckoutFaturarNFCe, {
      erpClient: { chamar },
      timeoutMs: 10,
    });

    expect(veredito).toEqual({ resultado: 'INDISPONIVEL', causa: 'TIMEOUT' });
  });

  it('corpo ilegível também é RESPOSTA_INVALIDA', async () => {
    const chamar = vi.fn().mockResolvedValue({
      estado: 'ok' as const,
      resposta: new Response('não é json', { status: 200 }),
    });

    await expect(
      enviarValidarNFCe({} as CheckoutFaturarNFCe, { erpClient: { chamar } }),
    ).resolves.toEqual({ resultado: 'INDISPONIVEL', causa: 'RESPOSTA_INVALIDA' });
  });

  it('restabelecida a rota, a tentativa seguinte consulta de novo e aceita', async () => {
    const chamar = vi
      .fn()
      .mockResolvedValueOnce({ estado: 'erro-de-rede' as const })
      .mockResolvedValueOnce({
        estado: 'ok' as const,
        resposta: new Response(JSON.stringify({ Valido: true, messages: [] }), { status: 200 }),
      });

    const cliente = { chamar };
    await expect(
      enviarValidarNFCe({} as CheckoutFaturarNFCe, { erpClient: cliente }),
    ).resolves.toMatchObject({ resultado: 'INDISPONIVEL' });
    await expect(
      enviarValidarNFCe({} as CheckoutFaturarNFCe, { erpClient: cliente }),
    ).resolves.toEqual({ resultado: 'ACEITA', avisos: [] });
    expect(chamar).toHaveBeenCalledTimes(2);
  });

  it('indisponibilidade não aplica o pagamento e notifica de forma distinta da recusa', async () => {
    const { store, validar, notificar } = montarStore();
    validar.mockResolvedValue({ resultado: 'INDISPONIVEL', causa: 'REDE' });

    await store.getState().aplicarPagamento({ forma: DINHEIRO, valorInformado: centavos(10_000) });

    expect(store.getState().pagamentos).toEqual([]);
    expect(notificar).toHaveBeenCalledWith({ resultado: 'INDISPONIVEL', causa: 'REDE' });
    expect(tiposDeEvento(store)).toContain('VALIDACAO_VENDA_RECUSADA');
  });
});

/* ------------------------------------------------------------------ *
 * US1 (T014) — recusa bloqueia a inserção
 * ------------------------------------------------------------------ */

describe('US1 — a venda recusada não recebe pagamento (T014)', () => {
  it('crédito bloqueado a prazo: nada aplicado, auditoria com origem MANUAL, finalização travada', async () => {
    const { store, validar, notificar } = montarStore({ condicao: A_PRAZO });
    const veredito = recusa('Cliente está com crédito bloqueado, venda a prazo não permitida.');
    validar.mockResolvedValue(veredito);

    await store.getState().aplicarPagamento({ forma: CREDIARIO, valorInformado: centavos(10_000) });

    expect(store.getState().pagamentos).toEqual([]);
    expect(store.getState().podeFinalizar()).toBe(false);
    // Texto do ERP íntegro, sem reescrita (FR-007).
    expect(notificar).toHaveBeenCalledWith(veredito);

    const evento = store
      .getState()
      .eventos.find((registrado) => registrado.tipo === 'VALIDACAO_VENDA_RECUSADA');
    expect(evento?.detalhes).toMatchObject({
      origem: 'MANUAL',
      condicao: String(A_PRAZO.codigo),
      formaPagamento: String(CREDIARIO.codigo),
      motivo: 'Cliente está com crédito bloqueado, venda a prazo não permitida.',
    });
  });

  it('corrigida a causa, a inserção seguinte faz NOVA consulta e é aceita', async () => {
    const { store, validar } = montarStore({ condicao: A_PRAZO });
    validar.mockResolvedValueOnce(recusa('Cliente está com crédito bloqueado.'));

    await store.getState().aplicarPagamento({ forma: CREDIARIO, valorInformado: centavos(10_000) });
    expect(store.getState().pagamentos).toEqual([]);

    await store.getState().aplicarPagamento({ forma: CREDIARIO, valorInformado: centavos(10_000) });

    expect(store.getState().pagamentos).toHaveLength(1);
    expect(validar).toHaveBeenCalledTimes(2);
  });
});

/* ------------------------------------------------------------------ *
 * US2 (T016/T017) — aviso não bloqueia; severidade não decide
 * ------------------------------------------------------------------ */

describe('US2 — aviso sem bloqueio (T016) e severidade que não decide (T017)', () => {
  it('EmpLimCre=A: Valido=true com aviso aplica o pagamento e notifica sem exigir confirmação', async () => {
    const { store, validar, notificar } = montarStore({ condicao: A_PRAZO });
    const comAviso: VereditoCompleto = {
      resultado: 'ACEITA',
      avisos: [
        { id: '9999', severidade: 'AVISO', texto: 'Cliente acima do limite de crédito.' },
        { id: '9999', severidade: 'AVISO', texto: 'Data limite de crédito próxima.' },
      ],
    };
    validar.mockResolvedValue(comAviso);

    await store.getState().aplicarPagamento({ forma: CREDIARIO, valorInformado: centavos(10_000) });

    expect(store.getState().pagamentos).toHaveLength(1);
    expect(notificar).toHaveBeenCalledWith(comAviso);
    // Aviso não é recusa: nenhum evento de auditoria (AD-113/research.md D9).
    expect(tiposDeEvento(store)).not.toContain('VALIDACAO_VENDA_RECUSADA');
  });

  it('aceite sem mensagens não gera notificação de conteúdo algum', async () => {
    const { store, notificar } = montarStore();

    await store.getState().aplicarPagamento({ forma: DINHEIRO, valorInformado: centavos(10_000) });

    expect(notificar).toHaveBeenCalledWith({ resultado: 'ACEITA', avisos: [] });
    expect(store.getState().pagamentos).toHaveLength(1);
  });

  it('EmpLimCre=B: mesma forma, Valido=false com Type=Warning é RECUSA (FR-006, I3)', async () => {
    const { store, validar } = montarStore({ condicao: A_PRAZO });
    validar.mockResolvedValue(recusa('Cliente acima do limite de crédito.', WARNING));

    await store.getState().aplicarPagamento({ forma: CREDIARIO, valorInformado: centavos(10_000) });

    expect(store.getState().pagamentos).toEqual([]);
    expect(store.getState().podeFinalizar()).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * US3 (T018/T019) — mesmo gate por qualquer caminho
 * ------------------------------------------------------------------ */

describe('US3 — o mesmo gate pelos dois caminhos de inserção (T018/T019)', () => {
  it('aplicarPagamento passa MANUAL e aplicarForma passa ATALHO_CENARIO — mesma instância', async () => {
    const { store, validar } = montarStore({ condicao: A_PRAZO });
    validar.mockResolvedValue(recusa('Recusado.'));

    await store.getState().aplicarPagamento({ forma: CREDIARIO, valorInformado: centavos(5_000) });
    await store.getState().aplicarForma(CREDIARIO.codigo, centavos(5_000));

    const origens = store
      .getState()
      .eventos.filter((evento) => evento.tipo === 'VALIDACAO_VENDA_RECUSADA')
      .map((evento) => (evento.detalhes as { origem: string }).origem);

    expect(origens).toEqual(['MANUAL', 'ATALHO_CENARIO']);
    // Duas consultas ao **mesmo** gate: nenhum caminho implementa validação
    // própria nem contorna a existente.
    expect(validar).toHaveBeenCalledTimes(2);
  });

  it('recusa nunca alcança iniciarIntegracao — nenhuma cobrança PIX/TEF nasce numa venda recusada (I9)', async () => {
    const { store, validar, iniciarIntegracao } = montarStore({
      capacidades: { tefAtivo: true, pixAtivo: true },
    });
    validar.mockResolvedValue(recusa('Recusado.'));

    await store
      .getState()
      .aplicarPagamento({ forma: CARTAO_TEF, valorInformado: centavos(10_000) });

    expect(iniciarIntegracao).not.toHaveBeenCalled();
  });

  it('aceite aciona a integração, e só depois do veredito favorável', async () => {
    const { store, iniciarIntegracao } = montarStore({
      capacidades: { tefAtivo: true, pixAtivo: true },
    });

    await store
      .getState()
      .aplicarPagamento({ forma: CARTAO_TEF, valorInformado: centavos(10_000) });

    expect(iniciarIntegracao).toHaveBeenCalledTimes(1);
  });
});

/* ------------------------------------------------------------------ *
 * US4 (T021–T024) — finalização apoiada no veredito já obtido
 * ------------------------------------------------------------------ */

describe('US4 — finalização usa o veredito da última inserção aceita (T021–T024)', () => {
  it('finalizar não repete a consulta: podeFinalizar lê o veredito vigente (FR-013)', async () => {
    const { store, validar } = montarStore();

    await store.getState().aplicarPagamento({ forma: DINHEIRO, valorInformado: centavos(10_000) });
    validar.mockClear();

    expect(store.getState().podeFinalizar()).toBe(true);
    expect(validar).not.toHaveBeenCalled();
  });

  it('remover um pagamento zera o veredito e obriga nova consulta (FR-014, I7)', async () => {
    const { store, validar } = montarStore();
    await store.getState().aplicarPagamento({ forma: DINHEIRO, valorInformado: centavos(5_000) });
    const idPagamento = store.getState().pagamentos[0]?.idPagamento ?? '';

    store.getState().removerPagamento(idPagamento);

    expect(store.getState().vereditoVigente).toBeNull();
    expect(store.getState().podeFinalizar()).toBe(false);

    validar.mockClear();
    await store.getState().aplicarPagamento({ forma: DINHEIRO, valorInformado: centavos(5_000) });
    expect(validar).toHaveBeenCalledTimes(1);
  });

  it('limparPagamentos zera o veredito — a venda seguinte não nasce autorizada', async () => {
    const { store } = montarStore();
    await store.getState().aplicarPagamento({ forma: DINHEIRO, valorInformado: centavos(10_000) });
    expect(store.getState().podeFinalizar()).toBe(true);

    // É o que a feature 004 chama depois da emissão bem-sucedida. Sem esta
    // invalidação, a venda seguinte começa autorizada por uma consulta que
    // descreveu **outra** venda — o mesmo desfecho do stub `() => true` que a
    // 014 veio substituir (`data-model.md` §3, terceira invalidação).
    store.getState().limparPagamentos();

    expect(store.getState().vereditoVigente).toBeNull();
    expect(store.getState().podeFinalizar()).toBe(false);
  });

  it('recusa da integração zera o veredito: a forma saiu, a autorização vai junto (I7)', async () => {
    const { store } = montarStore({ capacidades: { tefAtivo: true, pixAtivo: true } });
    await store
      .getState()
      .aplicarPagamento({ forma: CARTAO_TEF, valorInformado: centavos(10_000) });
    const idPagamento = store.getState().pagamentos[0]?.idPagamento ?? '';
    expect(store.getState().podeFinalizar()).toBe(true);

    store.getState().recusarPagamentoIntegrado(idPagamento, 'Cartão recusado pela operadora.');

    expect(store.getState().pagamentos).toEqual([]);
    expect(store.getState().podeFinalizar()).toBe(false);
  });

  it('sem veredito favorável a finalização fica travada mesmo com o total coberto (FR-015)', async () => {
    const { store, validar } = montarStore();
    validar.mockResolvedValue(recusa('Recusado.'));

    await store.getState().aplicarPagamento({ forma: DINHEIRO, valorInformado: centavos(10_000) });

    expect(store.getState().podeFinalizar()).toBe(false);
  });

  it('pagamento dividido gera uma consulta por inserção, nunca agrupada (FR-001a, I2a)', async () => {
    const { store, validar } = montarStore({ condicao: A_PRAZO });

    await store.getState().aplicarPagamento({ forma: DINHEIRO, valorInformado: centavos(4_000) });
    await store.getState().aplicarPagamento({ forma: CREDIARIO, valorInformado: centavos(6_000) });
    expect(validar).toHaveBeenCalledTimes(2);

    const segundo = store.getState().pagamentos[1]?.idPagamento ?? '';
    store.getState().removerPagamento(segundo);
    await store.getState().aplicarPagamento({ forma: CREDIARIO, valorInformado: centavos(6_000) });

    // Terceira consulta: reinserir a mesma forma nunca reaproveita o veredito.
    expect(validar).toHaveBeenCalledTimes(3);
  });
});

/* ------------------------------------------------------------------ *
 * Venda montada a partir de documento (006/011)
 * ------------------------------------------------------------------ */

describe('venda vinda de documento não fica presa no gate', () => {
  it('importar as formas de um documento já pago libera a finalização sem consultar o ERP', async () => {
    const { store, validar } = montarStore();

    store.getState().importarFormasDePagamento([
      {
        formaCodigo: DINHEIRO.codigo,
        formaMeioPagtoNFe: MEIO_PAGTO.Dinheiro,
        valor: centavos(10_000),
        tef: null,
        pixGuid: null,
        ticketDevolucao: null,
      },
    ]);

    // O ERP já aceitou o documento ao gravá-lo: não há candidata a validar, e
    // exigir veredito aqui travaria "Finalizar" para sempre.
    expect(store.getState().pagamentos).toHaveLength(1);
    expect(store.getState().podeFinalizar()).toBe(true);
    expect(validar).not.toHaveBeenCalled();
  });

  it('mas uma forma acrescentada depois pelo operador ainda passa pelo gate', async () => {
    const { store, validar } = montarStore();
    store.getState().importarFormasDePagamento([
      {
        formaCodigo: DINHEIRO.codigo,
        formaMeioPagtoNFe: MEIO_PAGTO.Dinheiro,
        valor: centavos(4_000),
        tef: null,
        pixGuid: null,
        ticketDevolucao: null,
      },
    ]);
    validar.mockResolvedValue(recusa('Recusado.'));

    await store.getState().aplicarPagamento({ forma: CREDIARIO, valorInformado: centavos(6_000) });

    expect(validar).toHaveBeenCalledTimes(1);
    // A forma nova foi recusada; só a do documento continua na venda.
    expect(store.getState().pagamentos).toHaveLength(1);
  });
});

/* ------------------------------------------------------------------ *
 * A venda mudou entre o gesto e a resposta do ERP
 * ------------------------------------------------------------------ */

describe('venda alterada durante a consulta não é mutada com o valor velho (I1)', () => {
  it('PIX confirmado no meio do await aborta a inserção em curso, com aviso', async () => {
    const { store, validar, avisar } = montarStore({
      capacidades: { tefAtivo: true, pixAtivo: true },
    });

    // PIX pendente não conta no saldo, então o gesto seguinte é derivado sobre
    // os R$ 100 cheios.
    await store.getState().aplicarPagamento({ forma: CARTAO_TEF, valorInformado: centavos(6_000) });
    const idPix = store.getState().pagamentos[0]?.idPagamento ?? '';
    expect(store.getState().saldo().saldoRestante).toBe(10_000);

    // A confirmação assíncrona cai **enquanto** o ERP responde: o saldo desaba
    // para 4.000, mas `valorAplicado` já foi derivado como 10.000.
    validar.mockImplementation(() => {
      store.getState().confirmarPagamentoIntegrado(idPix, { dadosTEF: undefined });
      return Promise.resolve(ACEITA);
    });

    await store.getState().aplicarPagamento({ forma: DINHEIRO, valorInformado: centavos(10_000) });

    // Gravar os 10.000 somaria R$ 160,00 numa nota de R$ 100,00 — e o ERP
    // validou a venda de antes, não esta.
    expect(store.getState().pagamentos.map((p) => p.valorAplicado)).toEqual([6_000]);
    expect(avisar).toHaveBeenCalledWith(AVISO_VENDA_MUDOU_DURANTE_VALIDACAO);
  });
});

/* ------------------------------------------------------------------ *
 * T025 — recusa local não chega ao ERP
 * ------------------------------------------------------------------ */

describe('recusa local não consulta o gate (T025, FR-012)', () => {
  it('segunda forma dinheiro é barrada localmente, sem nenhuma requisição de validação', async () => {
    const { store, validar } = montarStore();
    await store.getState().aplicarPagamento({ forma: DINHEIRO, valorInformado: centavos(4_000) });
    validar.mockClear();

    await store.getState().aplicarPagamento({ forma: DINHEIRO, valorInformado: centavos(4_000) });

    expect(validar).not.toHaveBeenCalled();
  });
});

beforeEach(() => {
  vi.clearAllMocks();
});
