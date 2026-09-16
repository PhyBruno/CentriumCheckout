import { describe, expect, it } from 'vitest';
import { mapearRespostaFaturamento } from '../../../../src/client/services/faturamento/faturarNFCeMapper';

/**
 * Fronteira de `POST /api/erp/FaturarNFCe` — os três desfechos que o corpo 2xx
 * pode descrever (`contracts/faturamento-api.md`, `ApiCentriumOAuth.yaml`
 * `CheckoutFaturarNFCe.NotaFiscal` na linha 1604).
 *
 * O ponto desta suíte é a separação entre **rejeitada** e **inválida**, que a
 * correção do usuário de 2026-09-10 introduziu: as duas são recusas, e só a
 * primeira significa que o ERP gravou o documento — logo, só ela pode limpar o
 * caixa. Confundi-las custa caro nos dois sentidos (venda apagada sem nota
 * emitida, ou segunda NFCe para a mesma compra).
 *
 * Todos os valores são sintéticos.
 */

const PDF_SINTETICO = 'JVBERi0xLjQK-sintetico';
const XML_SINTETICO = '<NFe><infNFe>sintetico</infNFe></NFe>';

/** A forma do YAML/`erp-mock`: `NotaFiscal` dentro do envelope. */
function respostaDe(notaFiscal: unknown, messages?: unknown): unknown {
  return {
    OutCheckoutFaturarNFCe: {
      Empresa: '1',
      SuspenderOuFaturar: 'FATURAR',
      ...(notaFiscal === undefined ? {} : { NotaFiscal: notaFiscal }),
    },
    ...(messages === undefined ? {} : { messages }),
  };
}

/**
 * A forma **real** do ERP: tudo na raiz, sem envelope e sem `messages`.
 *
 * Medida ao vivo em 2026-09-10 contra o tenant `c0lj6mvzeh`, numa emissão
 * fiscal de verdade rejeitada pela SEFAZ. As duas formas convivem porque
 * `semEnvelope` aceita ambas — e é esta que precisa funcionar em produção.
 */
function respostaRealDe(notaFiscal: unknown): unknown {
  return {
    Empresa: '1',
    SuspenderOuFaturar: 'FATURAR',
    produtos: [],
    FormasDePagamento: [],
    ...(notaFiscal === undefined ? {} : { NotaFiscal: notaFiscal }),
  };
}

describe('FATURAR autorizado', () => {
  it('devolve a nota pronta para impressão', () => {
    const resultado = mapearRespostaFaturamento(
      'FATURAR',
      respostaDe({
        NumeroNota: '9001',
        SerieNota: '1',
        Autorizada: 'S',
        ErroCodigo: 0,
        ErroMensagem: '',
        PDFImpressao: PDF_SINTETICO,
        XMLImpressao: XML_SINTETICO,
      }),
    );

    expect(resultado).toEqual({
      estado: 'ok',
      notaFiscal: expect.objectContaining({
        PDFImpressao: PDF_SINTETICO,
        XMLImpressao: XML_SINTETICO,
        // AD-238: número e série da nota emitida, com o `int64` em string.
        NumeroNota: 9001,
        SerieNota: '1',
      }),
    });
  });

  it('número e série são opcionais no sucesso', () => {
    const resultado = mapearRespostaFaturamento(
      'FATURAR',
      respostaRealDe({ Autorizada: 'S', PDFImpressao: PDF_SINTETICO, XMLImpressao: XML_SINTETICO }),
    );

    expect(resultado).toMatchObject({ estado: 'ok' });
  });
});

/**
 * AD-238 — retorno estruturado da rejeição no contrato de 2026-09-14:
 * `RetornoMensagemIA` (sugestão da CentriumIA) e `UrlChamadas` (link do ERP).
 */
describe('NFCe rejeitada — retorno estruturado (AD-238)', () => {
  function rejeitadaCom(campos: Record<string, unknown>): unknown {
    return respostaRealDe({
      NumeroNota: '1305',
      SerieNota: '14',
      Autorizada: 'R',
      ErroCodigo: '531',
      ErroMensagem: 'Rejeicao: Total da BC ICMS difere do somatorio dos itens',
      PDFImpressao: '',
      XMLImpressao: '',
      ...campos,
    });
  }

  it('separa código, mensagem, sugestão da IA e link', () => {
    const resultado = mapearRespostaFaturamento(
      'FATURAR',
      rejeitadaCom({
        RetornoMensagemIA: 'Confira a base de cálculo.\nDepois reenvie.',
        UrlChamadas: 'https://atendimento.exemplo.invalid/chamado?id=1',
      }),
    );

    expect(resultado).toEqual({
      estado: 'rejeitada',
      mensagem: 'Rejeicao: Total da BC ICMS difere do somatorio dos itens',
      codigoErro: 531,
      numeroNota: 1305,
      serieNota: '14',
      sugestaoIA: 'Confira a base de cálculo.\nDepois reenvie.',
      urlChamadas: 'https://atendimento.exemplo.invalid/chamado?id=1',
    });
  });

  it('sem os campos novos, sugestão e link ficam null (desfecho N, ERP antigo)', () => {
    const resultado = mapearRespostaFaturamento('FATURAR', rejeitadaCom({ Autorizada: 'N' }));

    expect(resultado).toMatchObject({
      estado: 'rejeitada',
      codigoErro: 531,
      sugestaoIA: null,
      urlChamadas: null,
    });
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    '/relativo/sem/origem',
    'não é url',
    '   ',
  ])('descarta UrlChamadas que não é http(s) absoluta: %s', (url) => {
    const resultado = mapearRespostaFaturamento('FATURAR', rejeitadaCom({ UrlChamadas: url }));

    expect(resultado).toMatchObject({ estado: 'rejeitada', urlChamadas: null });
  });

  it('aceita http além de https', () => {
    const resultado = mapearRespostaFaturamento(
      'FATURAR',
      rejeitadaCom({ UrlChamadas: 'http://erp.exemplo.invalid/x' }),
    );

    expect(resultado).toMatchObject({ urlChamadas: 'http://erp.exemplo.invalid/x' });
  });

  it('extrai só o texto quando ErroMensagem vem em HTML (pendência 50)', () => {
    const resultado = mapearRespostaFaturamento(
      'FATURAR',
      rejeitadaCom({
        ErroMensagem:
          '<div class="header-aviso-erro-nfe"><pre>531 - Rejeicao: Total &amp; BC</pre>' +
          '<script>alert(1)</script><span style="x">Nota:1305/14</span></div>',
      }),
    );

    expect(resultado).toMatchObject({
      estado: 'rejeitada',
      mensagem: '531 - Rejeicao: Total & BC\nNota:1305/14',
    });
  });

  it('sugestão só de espaços vira null', () => {
    const resultado = mapearRespostaFaturamento(
      'FATURAR',
      rejeitadaCom({ RetornoMensagemIA: '  \n ' }),
    );

    expect(resultado).toMatchObject({ sugestaoIA: null });
  });
});

describe('NFCe rejeitada — o ERP gravou o documento (correção do usuário, 2026-09-10)', () => {
  it('lê ErroMensagem em vez de descartar o bloco NotaFiscal', () => {
    const resultado = mapearRespostaFaturamento(
      'FATURAR',
      respostaDe({
        NumeroNota: '9001',
        SerieNota: '1',
        Autorizada: 'N',
        ErroCodigo: 539,
        ErroMensagem: 'Rejeicao: Duplicidade de NF-e',
        PDFImpressao: '',
        XMLImpressao: '',
      }),
    );

    expect(resultado).toEqual({
      estado: 'rejeitada',
      // O código vai em campo próprio (AD-238), não mais colado no texto.
      mensagem: 'Rejeicao: Duplicidade de NF-e',
      codigoErro: 539,
      numeroNota: 9001,
      serieNota: '1',
      sugestaoIA: null,
      urlChamadas: null,
    });
  });

  it('cai em messages[] quando ErroMensagem vem vazio, sem inventar texto', () => {
    const resultado = mapearRespostaFaturamento(
      'FATURAR',
      respostaDe({ NumeroNota: 9001, Autorizada: 'N', ErroCodigo: 0, ErroMensagem: '   ' }, [
        { Id: 'ERR', Type: 1, Description: 'Certificado digital vencido.' },
      ]),
    );

    expect(resultado).toEqual({
      estado: 'rejeitada',
      mensagem: 'Certificado digital vencido.',
      // `0` é o "sem erro" do contrato: não vira código a exibir.
      codigoErro: null,
      numeroNota: 9001,
      serieNota: null,
      sugestaoIA: null,
      urlChamadas: null,
    });
  });

  it('ainda é rejeição quando o ERP não explica nada', () => {
    const resultado = mapearRespostaFaturamento('FATURAR', respostaDe({ Autorizada: 'N' }));

    expect(resultado).toMatchObject({ estado: 'rejeitada', numeroNota: null, serieNota: null });
  });

  it('trata Autorizada ausente como não autorizada', () => {
    const resultado = mapearRespostaFaturamento(
      'FATURAR',
      respostaDe({ NumeroNota: 9001, ErroMensagem: 'Rejeicao: CPF do destinatario invalido' }),
    );

    expect(resultado).toMatchObject({ estado: 'rejeitada' });
  });
});

describe('falha de fronteira — a venda continua no caixa', () => {
  it('não é rejeição quando o corpo não traz bloco NotaFiscal nenhum', () => {
    const resultado = mapearRespostaFaturamento(
      'FATURAR',
      respostaDe(undefined, [{ Id: '9999', Type: 1, Description: 'Empresa é obrigatória.' }]),
    );

    expect(resultado).toEqual({ estado: 'invalida', mensagem: 'Empresa é obrigatória.' });
  });

  it("não é rejeição quando o ERP diz Autorizada = 'S' e não entrega o documento", () => {
    // Resposta contraditória: o contrato não sustenta "autorizada sem nota", e
    // descartar a venda com base nela apagaria uma compra que talvez nunca
    // tenha virado documento.
    const resultado = mapearRespostaFaturamento(
      'FATURAR',
      respostaDe({ NumeroNota: 9001, Autorizada: 'S', PDFImpressao: '', XMLImpressao: '' }),
    );

    expect(resultado).toMatchObject({ estado: 'invalida' });
  });

  it('reprova corpo que nem é objeto', () => {
    expect(mapearRespostaFaturamento('FATURAR', 'não é JSON de venda')).toMatchObject({
      estado: 'invalida',
    });
  });
});

/**
 * Resposta **sem envelope** — a forma que o ERP realmente devolve.
 *
 * Este bloco existe porque a suíte anterior só exercitava a forma do YAML e por
 * isso passava inteira enquanto, contra o ERP de verdade, **nenhum** caminho
 * funcionava: nem o sucesso (NFCe autorizada virava falha de negócio, com a
 * venda presa no caixa), nem a rejeição (o motivo era descartado). Achado pelo
 * usuário, medido ao vivo em 2026-09-10.
 */
describe('forma real do ERP — NotaFiscal na raiz, sem envelope', () => {
  it('reconhece a NFCe autorizada', () => {
    const resultado = mapearRespostaFaturamento(
      'FATURAR',
      respostaRealDe({
        NumeroNota: '1304',
        SerieNota: '14',
        Autorizada: 'S',
        ErroCodigo: 0,
        ErroMensagem: '',
        PDFImpressao: PDF_SINTETICO,
        XMLImpressao: XML_SINTETICO,
      }),
    );

    expect(resultado).toMatchObject({ estado: 'ok' });
  });

  it("reconhece a rejeição real, com Autorizada = 'R' e NumeroNota zerado", () => {
    // Valores exatos da resposta capturada: o ERP zera `NumeroNota`/`SerieNota`
    // na rejeição e usa `'R'`, não `'N'`.
    const resultado = mapearRespostaFaturamento(
      'FATURAR',
      respostaRealDe({
        NumeroNota: '0',
        SerieNota: '',
        Autorizada: 'R',
        ErroCodigo: 0,
        ErroMensagem: 'Rejeicao: Total da BC ICMS difere do somatorio dos itens',
        XMLImpressao: '',
        PDFImpressao: '',
      }),
    );

    expect(resultado).toEqual({
      estado: 'rejeitada',
      mensagem: 'Rejeicao: Total da BC ICMS difere do somatorio dos itens',
      // `0` e `''` são o "sem número" do ERP nesta resposta — o diálogo não
      // anuncia nenhum documento (item 51 de `PENDENCIES.md`).
      numeroNota: 0,
      serieNota: null,
      codigoErro: null,
      sugestaoIA: null,
      urlChamadas: null,
    });
  });

  it('continua exigindo o bloco: raiz sem NotaFiscal não é rejeição', () => {
    expect(mapearRespostaFaturamento('FATURAR', respostaRealDe(undefined))).toMatchObject({
      estado: 'invalida',
    });
  });
});

describe('SUSPENDER não passa por nada disso', () => {
  it('é sucesso sem documento fiscal', () => {
    expect(mapearRespostaFaturamento('SUSPENDER', respostaDe(undefined))).toEqual({
      estado: 'ok',
      notaFiscal: null,
    });
  });

  it('aviso do ERP (Type 2) não transforma a suspensão em recusa', () => {
    expect(
      mapearRespostaFaturamento(
        'SUSPENDER',
        respostaDe(undefined, [{ Id: '1', Type: 2, Description: 'Rascunho gravado.' }]),
      ),
    ).toEqual({ estado: 'ok', notaFiscal: null });
  });
});

/**
 * AD-235 — `PCheckout_FaturarNFCe` grava o rascunho e preenche `NumeroRascunho`
 * **antes** de rodar `PNFCe_ValidaSaldoProdutos`/`PNfeValidaRascunho`, em
 * `SUSPENDER` e em `FATURAR`. Uma recusa dessas validações volta com
 * `messages` (Type 1) e com o número do rascunho já gravado, que o Checkout
 * adota para o reenvio não criar um segundo rascunho da mesma compra.
 */
describe('recusa com rascunho já gravado (AD-235)', () => {
  const recusaDeSaldo = [
    { Id: '9999', Type: 1, Description: 'Quantidade maior que o Saldo do produto: 1 - ARROZ!' },
  ];

  it('SUSPENDER recusado em messages é falha, com o NumeroRascunho do envelope', () => {
    const resultado = mapearRespostaFaturamento('SUSPENDER', {
      OutCheckoutFaturarNFCe: { SuspenderOuFaturar: 'SUSPENDER', NumeroRascunho: '6100' },
      messages: recusaDeSaldo,
    });

    expect(resultado).toEqual({
      estado: 'invalida',
      mensagem: 'Quantidade maior que o Saldo do produto: 1 - ARROZ!',
      numeroRascunho: 6100,
    });
  });

  it('FATURAR recusado sem NotaFiscal devolve o NumeroRascunho', () => {
    const resultado = mapearRespostaFaturamento('FATURAR', respostaDe(undefined, recusaDeSaldo));

    // `respostaDe` não traz número: sem ele, nada a adotar.
    expect(resultado).not.toHaveProperty('numeroRascunho');

    const comNumero = mapearRespostaFaturamento('FATURAR', {
      OutCheckoutFaturarNFCe: { SuspenderOuFaturar: 'FATURAR', NumeroRascunho: 6100 },
      messages: recusaDeSaldo,
    });
    expect(comNumero).toMatchObject({ estado: 'invalida', numeroRascunho: 6100 });
  });

  it('lê o NumeroRascunho também da forma flat', () => {
    const resultado = mapearRespostaFaturamento('SUSPENDER', {
      SuspenderOuFaturar: 'SUSPENDER',
      NumeroRascunho: '6100',
      messages: recusaDeSaldo,
    });

    expect(resultado).toMatchObject({ estado: 'invalida', numeroRascunho: 6100 });
  });

  it('NumeroRascunho 0 não é número a adotar', () => {
    const resultado = mapearRespostaFaturamento('SUSPENDER', {
      OutCheckoutFaturarNFCe: { NumeroRascunho: '0' },
      messages: recusaDeSaldo,
    });

    expect(resultado).toEqual({
      estado: 'invalida',
      mensagem: 'Quantidade maior que o Saldo do produto: 1 - ARROZ!',
    });
  });

  it('bloco NotaFiscal vazio + recusa em messages não é NFCe rejeitada', () => {
    // O SDT pode vir serializado com `NotaFiscal` em branco quando a validação
    // recusou antes de emitir. Tratá-lo como rejeição limparia o caixa de uma
    // venda que nunca virou documento fiscal.
    const resultado = mapearRespostaFaturamento('FATURAR', {
      OutCheckoutFaturarNFCe: {
        NumeroRascunho: '6100',
        NotaFiscal: { NumeroNota: '0', SerieNota: '', Autorizada: '', ErroMensagem: '' },
      },
      messages: recusaDeSaldo,
    });

    expect(resultado).toMatchObject({ estado: 'invalida', numeroRascunho: 6100 });
  });
});
