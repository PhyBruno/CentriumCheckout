import { describe, expect, it } from 'vitest';
import {
  corpoComEmpresaDaSessao,
  queryComEmpresaDaSessao,
} from '../../../../src/server/routes/erp-proxy';

/**
 * O tenant do corpo vem da sessão, nunca do navegador.
 *
 * O contrato exige `Cliente.Empresa` **dentro** do corpo de `PostCliente`
 * (AD-024), e o cabeçalho `Empresa` que o BFF injeta não protege esse campo. Um
 * operador autenticado que altere o payload gravaria registro em outra empresa
 * do tenant — daí a reescrita no servidor (achado da revisão, 2026-09-03).
 *
 * Todos os valores são sintéticos.
 */

const CORPO_CADASTRO = {
  Cliente: {
    Empresa: 999,
    nome: 'CLIENTE EXEMPLO',
    cpf: '11122233344',
    uf: 'MT',
  },
};

describe('corpoComEmpresaDaSessao', () => {
  it('sobrescreve Cliente.Empresa com a empresa da sessão', () => {
    const corpo = corpoComEmpresaDaSessao(CORPO_CADASTRO, '7') as typeof CORPO_CADASTRO;

    expect(corpo.Cliente.Empresa).toBe(7);
  });

  it('preserva todos os demais campos do cadastro', () => {
    const corpo = corpoComEmpresaDaSessao(CORPO_CADASTRO, '7') as typeof CORPO_CADASTRO;

    expect(corpo.Cliente.nome).toBe('CLIENTE EXEMPLO');
    expect(corpo.Cliente.cpf).toBe('11122233344');
    expect(corpo.Cliente.uf).toBe('MT');
  });

  it('não muta o corpo original da requisição', () => {
    corpoComEmpresaDaSessao(CORPO_CADASTRO, '7');

    expect(CORPO_CADASTRO.Cliente.Empresa).toBe(999);
  });

  it('acrescenta Empresa quando o cliente não a enviou', () => {
    const corpo = corpoComEmpresaDaSessao({ Cliente: { nome: 'X' } }, '3') as {
      Cliente: Record<string, unknown>;
    };

    expect(corpo.Cliente['Empresa']).toBe(3);
  });

  it('repassa intacto o corpo sem a raiz Cliente', () => {
    // `FaturarNFCe` e os demais endpoints não têm esse campo — o proxy não pode
    // inventar um.
    const original = { CheckoutFaturarNFCe: { NumeroNota: 0 } };

    expect(corpoComEmpresaDaSessao(original, '7')).toEqual(original);
  });

  it('repassa intacto o que não é objeto — string, array, null', () => {
    expect(corpoComEmpresaDaSessao('texto cru', '7')).toBe('texto cru');
    expect(corpoComEmpresaDaSessao([{ Cliente: {} }], '7')).toEqual([{ Cliente: {} }]);
    expect(corpoComEmpresaDaSessao(null, '7')).toBeNull();
  });

  it('deixa o corpo como está quando a empresa da sessão não é numérica', () => {
    // Melhor enviar o que o cliente mandou do que gravar `NaN` no cadastro.
    const corpo = corpoComEmpresaDaSessao(CORPO_CADASTRO, 'acme') as typeof CORPO_CADASTRO;

    expect(corpo.Cliente.Empresa).toBe(999);
  });

  it('ignora Cliente que não é objeto', () => {
    const original = { Cliente: 'nao-e-objeto' };

    expect(corpoComEmpresaDaSessao(original, '7')).toEqual(original);
  });
});

/**
 * `Empresa` na query string, além do cabeçalho (AD-205).
 *
 * Metade dos métodos do `APICentriumOAuth` lê `&Empresa` do cabeçalho num
 * `Event <Metodo>.Before`; a outra metade — `GetProduto` inclusive — recebe
 * `in:&Empresa` como parâmetro comum e o lê da query. Sem ele o `For Each`
 * filtra por `empcod = 0`, não acha nada e devolve `200` com o SDT vazio, que o
 * Checkout traduz em "produto não encontrado" (verificado contra o ERP real em
 * 2026-09-10).
 *
 * **A posição é parte do contrato, não estética:** os `.Before` de `GetSessao`
 * e `GetCliente` recortam `Login=`/`CPFCNPJ=` até o **fim** da query string com
 * `SubStr`, então `Empresa` depois deles entraria no valor recortado e zeraria
 * a resposta.
 */
describe('queryComEmpresaDaSessao', () => {
  it('põe Empresa como primeiro par, antes dos recortados por SubStr no ERP', () => {
    expect(queryComEmpresaDaSessao('Login=operador', '7')).toBe('Empresa=7&Login=operador');
  });

  it('preserva os demais pares crus, na ordem e na codificação originais', () => {
    expect(queryComEmpresaDaSessao('Txtbusca=caf%C3%A9&Pagina=2', '1')).toBe(
      'Empresa=1&Txtbusca=caf%C3%A9&Pagina=2',
    );
  });

  it('query vazia vira só a empresa', () => {
    expect(queryComEmpresaDaSessao('', '3')).toBe('Empresa=3');
  });

  it('descarta a Empresa vinda do navegador — a da sessão é a única confiável', () => {
    expect(queryComEmpresaDaSessao('Empresa=999&Codigoproduto=ABC', '1')).toBe(
      'Empresa=1&Codigoproduto=ABC',
    );
    expect(queryComEmpresaDaSessao('empresa=999', '1')).toBe('Empresa=1');
  });

  it('não confunde outro parâmetro que só termina em "empresa"', () => {
    expect(queryComEmpresaDaSessao('CodEmpresa=5', '1')).toBe('Empresa=1&CodEmpresa=5');
  });
});
