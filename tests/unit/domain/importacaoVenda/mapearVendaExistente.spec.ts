import { describe, expect, it } from 'vitest';
import {
  ErroDocumentoImportadoInvalido,
  mapearVendaExistente,
  paraLinhaCarrinho,
} from '../../../../src/client/domain/importacaoVenda/mapearVendaExistente';
import { checkoutFaturarNFCeSchema } from '../../../../src/shared/schemas/dav.schema';
import {
  CODIGO_CLIENTE_DAV,
  CODIGO_VENDEDOR_DAV,
  NUMERO_NOTA,
  SKU_DAV,
  documentoDoDav,
  formaDePagamentoDoDav,
  produtoDoDav,
} from '../../../support/dav';

/**
 * Domínio puro da importação (T006).
 *
 * Entrada sempre validada pelo schema Zod antes de chegar ao mapper — é assim
 * que a função é chamada em produção, e é o que garante que os testes exercitem
 * a conversão de fronteira (`double` → centavos/milésimos) junto do mapeamento.
 */

function documentoValidado(sobrescritas: Record<string, unknown> = {}) {
  return checkoutFaturarNFCeSchema.parse(documentoDoDav(sobrescritas));
}

const ORIGEM_LISTA = { clienteNome: 'CLIENTE TESTE 01' } as const;

describe('mapearVendaExistente — documento completo', () => {
  it('traduz produtos em linhas congeladas com o preço do documento', () => {
    const venda = mapearVendaExistente(documentoValidado(), ORIGEM_LISTA);

    expect(venda.linhas).toHaveLength(1);
    const linha = venda.linhas[0];
    expect(linha?.codigoProduto).toBe(SKU_DAV);
    // 10,00 reais → 1000 centavos; 2 unidades → 2000 milésimos; 1,50 → 150.
    expect(linha?.precoUnitario).toBe(1000);
    expect(linha?.quantidade).toBe(2000);
    expect(linha?.descontoLinha).toBe(150);
    expect(linha?.udm).toBe('UN');
    // A descrição só chega depois, por `GetProduto` best-effort (AD-096).
    expect(linha?.descricao).toBeNull();
  });

  it('preserva NumeroNota intacto e não modela nenhum campo de DAV (D8, AD-107)', () => {
    const venda = mapearVendaExistente(documentoValidado(), ORIGEM_LISTA);

    expect(venda.numeroNota).toBe(NUMERO_NOTA);
    // `DavNum` saiu do contrato: nem o schema nem a venda importada o conhecem.
    expect(venda).not.toHaveProperty('davNum');
    expect(venda).not.toHaveProperty('numeroDav');
  });

  it('nunca resolve o nome do vendedor (AD-095) e tira o do cliente da listagem (D4)', () => {
    const venda = mapearVendaExistente(documentoValidado(), ORIGEM_LISTA);

    expect(venda.clienteCodigo).toBe(CODIGO_CLIENTE_DAV);
    expect(venda.clienteNome).toBe('CLIENTE TESTE 01');
    expect(venda.vendedorCodigo).toBe(CODIGO_VENDEDOR_DAV);
    expect(venda.vendedorNome).toBeNull();
  });

  it('sem origem de listagem, o nome do cliente sai vazio em vez de inventado', () => {
    const venda = mapearVendaExistente(documentoValidado(), null);

    expect(venda.clienteNome).toBe('');
    expect(venda.clienteCodigo).toBe(CODIGO_CLIENTE_DAV);
  });

  it('copia as formas de pagamento 1:1, sem reclassificar (D6)', () => {
    const venda = mapearVendaExistente(documentoValidado(), ORIGEM_LISTA);

    expect(venda.formasDePagamento).toEqual([
      {
        formaCodigo: 1,
        formaMeioPagtoNFe: '01',
        valor: 1850,
        tef: null,
        pixGuid: null,
        ticketDevolucao: null,
      },
    ]);
  });

  it('agrupa os campos TEF só quando o item de fato é TEF', () => {
    const documento = documentoValidado({
      FormasDePagamento: [
        formaDePagamentoDoDav({
          FormaCodigo: 3,
          TEFidentificacao: 55,
          TEFCNPJ: '00000000000191',
          TEFBandeira: 'VISA',
          TEFNumeroAutorizacao: 'A1B2C3',
          TEFTipoIntegracao: 'POS',
        }),
      ],
    });

    const venda = mapearVendaExistente(documento, ORIGEM_LISTA);

    expect(venda.formasDePagamento[0]?.tef).toEqual({
      identificacao: 55,
      cnpj: '00000000000191',
      bandeira: 'VISA',
      numeroAutorizacao: 'A1B2C3',
      tipoIntegracao: 'POS',
    });
  });
});

describe('mapearVendaExistente — bordas de dado de negócio', () => {
  it('documento sem forma de pagamento devolve array vazio, nunca lança', () => {
    const venda = mapearVendaExistente(documentoValidado({ FormasDePagamento: [] }), ORIGEM_LISTA);

    expect(venda.formasDePagamento).toEqual([]);
    expect(venda.linhas).toHaveLength(1);
  });

  it('documento sem produto devolve array vazio, nunca lança', () => {
    const venda = mapearVendaExistente(documentoValidado({ produtos: [] }), ORIGEM_LISTA);

    expect(venda.linhas).toEqual([]);
  });

  it('mantém uma linha por item, mesmo repetindo o SKU', () => {
    const documento = documentoValidado({
      produtos: [produtoDoDav(), produtoDoDav({ sequencial: 2, quantidade: 5 })],
    });

    const venda = mapearVendaExistente(documento, ORIGEM_LISTA);

    expect(venda.linhas.map((linha) => linha.quantidade)).toEqual([2000, 5000]);
  });
});

describe('mapearVendaExistente — violação de contrato', () => {
  it.each(['NumeroNota', 'clienteCodigo', 'vendedorCodigo'])(
    'lança quando `%s` não vem na resposta',
    (campo) => {
      // Contorna o schema de propósito: o cenário é o de um caller não
      // totalmente tipado, que é exatamente o que a checagem em runtime cobre.
      const documento = documentoValidado();
      const semCampo = { ...documento, [campo]: undefined };

      expect(() =>
        mapearVendaExistente(semCampo as unknown as typeof documento, ORIGEM_LISTA),
      ).toThrow(ErroDocumentoImportadoInvalido);
    },
  );

  it('o schema Zod recusa a resposta antes mesmo do mapper', () => {
    const semNumeroNota: Record<string, unknown> = documentoDoDav();
    delete semNumeroNota.NumeroNota;

    expect(checkoutFaturarNFCeSchema.safeParse(semNumeroNota).success).toBe(false);
  });
});

describe('paraLinhaCarrinho', () => {
  it('produz linha congelada de origem DAV, fora da precificação', () => {
    const venda = mapearVendaExistente(documentoValidado(), ORIGEM_LISTA);
    const importada = venda.linhas[0];
    expect(importada).toBeDefined();
    if (importada === undefined) {
      return;
    }

    const linha = paraLinhaCarrinho(importada, 'linha-1', 'DAV');

    expect(linha.origem).toBe('DAV');
    expect(linha.precoCongelado).toBe(true);
    expect(linha.precoUnitario).toBe(1000);
    expect(linha.quantidade).toBe(2000);
    // O desconto do documento entra como manual: `descontoConvenio` é campo
    // derivado e seria apagado na primeira reprecificação após um eventual
    // descongelamento por edição (invariante I6).
    expect(linha.descontoManual).toBe(150);
    expect(linha.descontoConvenio).toBe(0);
  });

  it('usa o código do produto como descrição enquanto GetProduto não responde', () => {
    const venda = mapearVendaExistente(documentoValidado(), ORIGEM_LISTA);
    const importada = venda.linhas[0];
    if (importada === undefined) {
      throw new Error('fixture sem linha');
    }

    expect(paraLinhaCarrinho(importada, 'linha-1', 'DAV').snapshot.descricao).toBe(SKU_DAV);
    expect(
      paraLinhaCarrinho({ ...importada, descricao: 'ARROZ 5KG' }, 'linha-1', 'DAV').snapshot
        .descricao,
    ).toBe('ARROZ 5KG');
  });

  /**
   * A origem é o **único** eixo em que a linha de um rascunho de NFCe (011)
   * difere da linha de um DAV (006) — AD-166. Este teste é o que impede que a
   * generalização volte a ser um literal fixo: fixar `'DAV'` de novo passaria
   * despercebido em todos os outros casos deste arquivo.
   */
  it('propaga a origem RASCUNHO sem mudar mais nada da linha', () => {
    const venda = mapearVendaExistente(documentoValidado(), ORIGEM_LISTA);
    const importada = venda.linhas[0];
    if (importada === undefined) {
      throw new Error('fixture sem linha');
    }

    const comoDav = paraLinhaCarrinho(importada, 'linha-1', 'DAV');
    const comoRascunho = paraLinhaCarrinho(importada, 'linha-1', 'RASCUNHO');

    expect(comoRascunho.origem).toBe('RASCUNHO');
    expect(comoRascunho.precoCongelado).toBe(true);
    expect({ ...comoRascunho, origem: 'DAV' }).toEqual(comoDav);
  });

  it('zera as faixas do snapshot — linha congelada nunca as lê', () => {
    const venda = mapearVendaExistente(documentoValidado(), ORIGEM_LISTA);
    const importada = venda.linhas[0];
    if (importada === undefined) {
      throw new Error('fixture sem linha');
    }

    const { snapshot } = paraLinhaCarrinho(importada, 'linha-1', 'DAV');

    expect(snapshot.precosFaixa).toEqual([0, 0, 0, 0, 0]);
    expect(snapshot.limiaresFaixa).toEqual([0, 0, 0, 0]);
    expect(snapshot.pesavelEditavel).toBe('');
    expect(snapshot.precoBase).toBe(1000);
  });
});
