import { describe, expect, it } from 'vitest';
import { getDavOutputSchema } from '../../../src/shared/schemas/dav.schema';
import { documentoDoDav, NUMERO_NOTA, respostaGetDav } from '../../support/dav';

/**
 * Fronteira Zod de `GetDav` (Constitution IV).
 *
 * Os casos abaixo são regressão do defeito achado em 2026-09-11 na revisão dos
 * parses contra o ERP real: o schema exigia o envelope `OutCheckoutFaturarNFCe`,
 * que só aparece nas **recusas**, e por isso reprovava toda importação de DAV
 * bem-sucedida.
 */

describe('getDavOutputSchema', () => {
  it('aceita a resposta com envelope, como o YAML e o contrato desenham', () => {
    const lido = getDavOutputSchema.parse(respostaGetDav());

    expect(lido.NumeroNota).toBe(NUMERO_NOTA);
  });

  /**
   * O caminho de sucesso do ERP real: SDT na raiz, sem envelope e sem
   * `messages`. O envelope acompanha a presença de `messages` — com a coleção
   * vazia sobra um único parâmetro de saída e o GeneXus serializa na raiz.
   */
  it('aceita a resposta flat, como o ERP real devolve no sucesso', () => {
    const lido = getDavOutputSchema.parse(documentoDoDav());

    expect(lido.NumeroNota).toBe(NUMERO_NOTA);
    expect(lido.produtos.length).toBeGreaterThan(0);
  });

  /**
   * DAV sem nenhum pagamento lançado — o estado normal de um DAV. O ERP omite a
   * chave em vez de mandar `[]` (mesmo comportamento de coleção vazia de
   * AD-216), e exigi-la reprovava o caminho feliz da importação.
   */
  it('aceita o documento sem FormasDePagamento, com lista vazia por default', () => {
    const lido = getDavOutputSchema.parse(documentoDoDav({ FormasDePagamento: undefined }));

    expect(lido.FormasDePagamento).toEqual([]);
  });

  /**
   * A recusa de negócio: `200` com o SDT zerado dentro do envelope e a razão em
   * `messages`. `produtos` é o que a discrimina — aceitá-la importaria um
   * documento vazio, com `clienteCodigo: 0`, como se fosse sucesso.
   */
  it('reprova a recusa de negócio, que vem envelopada e com o SDT zerado', () => {
    const recusa = {
      OutCheckoutFaturarNFCe: {
        Empresa: 0,
        SuspenderOuFaturar: '',
        clienteCodigo: '0',
        vendedorCodigo: '0',
        CondicaoPagamentoCodigo: '0',
        NumeroNota: '0',
        CadSerieNFCe: '',
        UsuarioCodigo: '0',
        Log: '',
      },
      messages: [
        { Id: '', Type: 1, Description: 'Erro - Pedido Liberado: S, Status Digitação: N' },
      ],
    };

    expect(getDavOutputSchema.safeParse(recusa).success).toBe(false);
  });

  it('reprova o SDT zerado também quando ele chega flat', () => {
    expect(getDavOutputSchema.safeParse(documentoDoDav({ produtos: undefined })).success).toBe(
      false,
    );
  });
});
