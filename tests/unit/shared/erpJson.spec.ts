import { describe, expect, it } from 'vitest';
import { recusaDeNegocio } from '../../../src/shared/schemas/erpJson';

/**
 * `recusaDeNegocio` — o motivo que o ERP escreve em `messages[]` quando recusa
 * por regra de negócio (`200` + SDT zerado, padrão GeneXus).
 *
 * Os corpos abaixo são os que o ERP real devolveu em 2026-09-11 nos casos
 * relatados pelo operador: rascunho de NFCe sem série configurada e DAV em
 * digitação. Antes desta função, os dois chegavam à tela como "formato
 * inesperado", com o motivo descartado.
 */

describe('recusaDeNegocio', () => {
  it('extrai o motivo de CarregarNFCe quando a série não está configurada', () => {
    const resposta = {
      OutCheckoutFaturarNFCe: { clienteCodigo: '0', NumeroNota: '0', Log: '' },
      messages: [{ Id: '9999', Type: 1, Description: 'Série é obrigatório' }],
    };

    expect(recusaDeNegocio(resposta)).toBe('Série é obrigatório');
  });

  /** O ERP encerra esta mensagem com `\r\n`, que não deve chegar à tela. */
  it('extrai o motivo de GetDav e apara o espaço em branco das pontas', () => {
    const resposta = {
      OutCheckoutFaturarNFCe: { clienteCodigo: '0', NumeroNota: '0', Log: '' },
      messages: [
        {
          Id: '',
          Type: 1,
          Description: 'Erro - Item Liberado: S, Pedido Liberado: S, Status Digitação: N\r\n',
        },
      ],
    };

    expect(recusaDeNegocio(resposta)).toBe(
      'Erro - Item Liberado: S, Pedido Liberado: S, Status Digitação: N',
    );
  });

  it('devolve null para a resposta de sucesso, que vem flat e sem messages', () => {
    const sucesso = { Empresa: 1, clienteCodigo: '1007', NumeroNota: '5881', produtos: [] };

    expect(recusaDeNegocio(sucesso)).toBeNull();
  });

  /**
   * Aviso não é recusa. `PostCliente` confirma o cadastro com `Type: 2`, e
   * tratar isso como erro transformaria sucesso em falha — o oposto do defeito
   * que esta função corrige.
   */
  it('ignora mensagens que não são erro', () => {
    expect(recusaDeNegocio({ messages: [{ Id: '1', Type: 2, Description: '37 - FULANO' }] })).toBe(
      null,
    );
    expect(recusaDeNegocio({ messages: [{ Id: 'OK', Type: 0, Description: 'Gravado.' }] })).toBe(
      null,
    );
  });

  /**
   * Uma recusa sem texto não tem o que mostrar ao operador: deixar seguir para
   * a validação de fronteira dá a mensagem genérica, que aí é o melhor
   * disponível. O ERP devolve isso para `GetDav` de número inexistente.
   */
  it('devolve null quando a mensagem de erro vem sem descrição', () => {
    expect(recusaDeNegocio({ messages: [{ Id: '', Type: 1, Description: '' }] })).toBeNull();
    expect(recusaDeNegocio({ messages: [] })).toBeNull();
  });

  it('não quebra com corpo que não é objeto de resposta', () => {
    expect(recusaDeNegocio(null)).toBeNull();
    expect(recusaDeNegocio('texto solto')).toBeNull();
    expect(recusaDeNegocio({ messages: 'não é lista' })).toBeNull();
  });
});
