import { describe, expect, it } from 'vitest';
import { mapearRespostaFaturamento } from '../../../../src/client/services/faturamento/faturarNFCeMapper';

/**
 * Fronteira de `POST /api/erp/FaturarNFCe` — os desfechos que o corpo 2xx pode
 * descrever (`contracts/faturamento-api.md`, `ApiCentriumOAuth.yaml`
 * `CheckoutFaturarNFCe.NotaFiscal` na linha 1604).
 *
 * O ponto desta suíte é a separação entre os desfechos que **limpam** o caixa
 * (NFCe rejeitada pela SEFAZ, cenário tributário não encontrado) e os que
 * **devolvem** a venda ao operador (recusa de validação, resposta inválida).
 * Confundi-los custa caro nos dois sentidos: venda apagada sem nota gravada, ou
 * segunda NFCe para a mesma compra.
 *
 * Todos os valores são sintéticos, com a forma medida no ERP real.
 */

const PDF_SINTETICO = 'JVBERi0xLjQK-sintetico';
const XML_SINTETICO = '<NFe><infNFe>sintetico</infNFe></NFe>';

/** A forma do YAML: `NotaFiscal` dentro do envelope. */
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
 * A forma **real** do ERP: tudo na raiz, sem envelope e sem `messages`, com o
 * rascunho (`NumeroRascunho`/`CadSerieNFCe`) no primeiro nível.
 */
function respostaRealDe(notaFiscal: unknown, raiz: Record<string, unknown> = {}): unknown {
  return {
    Empresa: 1,
    SuspenderOuFaturar: 'FATURAR',
    NumeroRascunho: '6037',
    CadSerieNFCe: 'R01',
    produtos: [],
    FormasDePagamento: [],
    ...raiz,
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
 * Rejeição da SEFAZ — AD-238, corrigido pelo AD-239.
 *
 * Medido no ERP real em 2026-09-16 (rascunho 6037, rejeição 704): a nota vem com
 * `NumeroNota: "0"` e `SerieNota: ""`. **Quem identifica o documento para a
 * correção no ERP é o rascunho**, no primeiro nível da resposta — e por isso o
 * número só aparecia quando a venda tinha sido importada (a identidade trazia
 * o número; a resposta, lida no lugar errado, não).
 */
describe('NFCe rejeitada — retorno estruturado (AD-238, AD-239)', () => {
  function rejeitadaCom(campos: Record<string, unknown>, raiz?: Record<string, unknown>): unknown {
    return respostaRealDe(
      {
        NumeroNota: '0',
        SerieNota: '',
        Autorizada: 'R',
        ErroCodigo: '704',
        ErroMensagem:
          'Rejeicao: NFC-e ou NF-e com DANFE Simplificado Tipo 2 com Data-Hora de emissao atrasada',
        PDFImpressao: '',
        XMLImpressao: '',
        ...campos,
      },
      raiz,
    );
  }

  it('identifica o rascunho e a série da raiz, não a nota zerada', () => {
    const resultado = mapearRespostaFaturamento(
      'FATURAR',
      rejeitadaCom({
        RetornoMensagemIA: 'Ajuste o horário da máquina.\nDepois gere uma nova nota.',
        UrlChamadas: 'https://atendimento.exemplo.invalid/helpdesk.faq.php?id=297',
      }),
    );

    expect(resultado).toEqual({
      estado: 'rejeitada',
      mensagem:
        'Rejeicao: NFC-e ou NF-e com DANFE Simplificado Tipo 2 com Data-Hora de emissao atrasada',
      codigoErro: 704,
      numeroRascunho: 6037,
      serieRascunho: 'R01',
      sugestaoIA: 'Ajuste o horário da máquina.\nDepois gere uma nova nota.',
      urlChamadas: 'https://atendimento.exemplo.invalid/helpdesk.faq.php?id=297',
    });
  });

  it('forma do YAML: lê o rascunho de dentro do envelope', () => {
    const resultado = mapearRespostaFaturamento('FATURAR', {
      OutCheckoutFaturarNFCe: {
        NumeroRascunho: 90210,
        CadSerieNFCe: '1',
        NotaFiscal: { Autorizada: 'R', ErroMensagem: 'Rejeicao: Duplicidade de NF-e' },
      },
    });

    expect(resultado).toMatchObject({
      estado: 'rejeitada',
      numeroRascunho: 90210,
      serieRascunho: '1',
    });
  });

  it('sem rascunho na resposta, número e série ficam null (quem chama usa a identidade)', () => {
    const resultado = mapearRespostaFaturamento(
      'FATURAR',
      rejeitadaCom({}, { NumeroRascunho: '0', CadSerieNFCe: '' }),
    );

    expect(resultado).toMatchObject({ numeroRascunho: null, serieRascunho: null });
  });

  it('sem os campos novos, sugestão e link ficam null (desfecho N, ERP antigo)', () => {
    const resultado = mapearRespostaFaturamento('FATURAR', rejeitadaCom({ Autorizada: 'N' }));

    expect(resultado).toMatchObject({
      estado: 'rejeitada',
      codigoErro: 704,
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

  it('cai em messages[] quando ErroMensagem vem vazio, sem inventar texto', () => {
    const resultado = mapearRespostaFaturamento(
      'FATURAR',
      respostaDe({ NumeroNota: 9001, Autorizada: 'N', ErroCodigo: 0, ErroMensagem: '   ' }, [
        { Id: 'ERR', Type: 2, Description: 'Certificado digital vencido.' },
      ]),
    );

    expect(resultado).toMatchObject({
      estado: 'rejeitada',
      mensagem: 'Certificado digital vencido.',
      // `0` é o "sem erro" do contrato: não vira código a exibir.
      codigoErro: null,
    });
  });

  it('ainda é rejeição quando o ERP não explica nada', () => {
    const resultado = mapearRespostaFaturamento('FATURAR', respostaDe({ Autorizada: 'N' }));

    expect(resultado).toMatchObject({ estado: 'rejeitada', numeroRascunho: null });
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
  it("não é rejeição quando o ERP diz Autorizada = 'S' e não entrega o documento", () => {
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

  it('raiz sem NotaFiscal e sem messages é inválida (FATURAR sem desfecho, medido em 6036)', () => {
    expect(mapearRespostaFaturamento('FATURAR', respostaRealDe(undefined))).toMatchObject({
      estado: 'invalida',
    });
  });
});

describe('SUSPENDER aceito', () => {
  it('é sucesso sem documento fiscal', () => {
    expect(mapearRespostaFaturamento('SUSPENDER', respostaDe(undefined))).toEqual({
      estado: 'ok',
      notaFiscal: null,
    });
  });

  it('forma real, com o bloco NotaFiscal da suspensão (Autorizada N), continua sucesso', () => {
    expect(
      mapearRespostaFaturamento(
        'SUSPENDER',
        respostaRealDe(
          { NumeroNota: '6031', SerieNota: 'R01', Autorizada: 'N', ErroCodigo: '0' },
          { SuspenderOuFaturar: 'SUSPENDER' },
        ),
      ),
    ).toEqual({ estado: 'ok', notaFiscal: null });
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
 * Recusa de validação (AD-235, reclassificada pelo AD-239): `messages` com
 * `Type: 1`. Não é erro na nota — é o ERP dizendo que a venda, como está, não
 * passa. A venda continua no caixa, e o rascunho já gravado é adotado.
 */
describe('recusa de validação — a venda continua no caixa', () => {
  const recusaDeSaldo = [
    { Id: '9999', Type: 1, Description: 'Quantidade maior que o Saldo do produto: 1 - ARROZ!' },
  ];

  it('SUSPENDER recusado traz a mensagem, o rascunho e a série', () => {
    const resultado = mapearRespostaFaturamento('SUSPENDER', {
      OutCheckoutFaturarNFCe: {
        SuspenderOuFaturar: 'SUSPENDER',
        NumeroRascunho: '6100',
        CadSerieNFCe: 'R01',
      },
      messages: recusaDeSaldo,
    });

    expect(resultado).toEqual({
      estado: 'recusada',
      mensagem: 'Quantidade maior que o Saldo do produto: 1 - ARROZ!',
      numeroRascunho: 6100,
      serieRascunho: 'R01',
    });
  });

  it('FATURAR recusado sem NotaFiscal também é recusa de validação', () => {
    const resultado = mapearRespostaFaturamento('FATURAR', respostaDe(undefined, recusaDeSaldo));

    expect(resultado).toEqual({
      estado: 'recusada',
      mensagem: 'Quantidade maior que o Saldo do produto: 1 - ARROZ!',
    });
  });

  it('NumeroRascunho 0 não é número a adotar', () => {
    const resultado = mapearRespostaFaturamento('SUSPENDER', {
      OutCheckoutFaturarNFCe: { NumeroRascunho: '0', CadSerieNFCe: '' },
      messages: recusaDeSaldo,
    });

    expect(resultado).toEqual({
      estado: 'recusada',
      mensagem: 'Quantidade maior que o Saldo do produto: 1 - ARROZ!',
    });
  });

  it('bloco NotaFiscal vazio + recusa em messages não é NFCe rejeitada', () => {
    const resultado = mapearRespostaFaturamento('FATURAR', {
      OutCheckoutFaturarNFCe: {
        NumeroRascunho: '6100',
        NotaFiscal: { NumeroNota: '0', SerieNota: '', Autorizada: '', ErroMensagem: '' },
      },
      messages: recusaDeSaldo,
    });

    expect(resultado).toMatchObject({ estado: 'recusada', numeroRascunho: 6100 });
  });
});

/**
 * Cenário tributário não encontrado (AD-239) — resposta medida no ERP real em
 * 2026-09-16: envelope zerado (`NumeroRascunho: "0"`) + `messages`. Não há o que
 * corrigir no Checkout: o cadastro fiscal é do ERP, e a venda sai do caixa.
 */
describe('cenário tributário não encontrado — limpa o caixa', () => {
  const RESPOSTA_REAL = {
    OutCheckoutFaturarNFCe: {
      Empresa: 0,
      SuspenderOuFaturar: '',
      NumeroRascunho: '0',
      CadSerieNFCe: '',
    },
    messages: [
      {
        Id: '9999',
        Type: 1,
        Description:
          'Busca realizada pelo seguinte Cenário Tributário não foi Encontrada\r\n[ Empresa: 0, UF Origem: SC ]',
      },
    ],
  };

  it.each(['SUSPENDER', 'FATURAR'] as const)('%s vira cenario-tributario', (operacao) => {
    expect(mapearRespostaFaturamento(operacao, RESPOSTA_REAL)).toEqual({
      estado: 'cenario-tributario',
      mensagem:
        'Busca realizada pelo seguinte Cenário Tributário não foi Encontrada\r\n[ Empresa: 0, UF Origem: SC ]',
      numeroRascunho: null,
      serieRascunho: null,
    });
  });

  it('usa o rascunho da resposta quando o ERP o informa', () => {
    const resultado = mapearRespostaFaturamento('FATURAR', {
      OutCheckoutFaturarNFCe: { NumeroRascunho: '6200', CadSerieNFCe: 'R01' },
      messages: [{ Id: '9999', Type: 1, Description: 'Cenario tributario nao encontrado' }],
    });

    expect(resultado).toMatchObject({
      estado: 'cenario-tributario',
      numeroRascunho: 6200,
      serieRascunho: 'R01',
    });
  });
});
