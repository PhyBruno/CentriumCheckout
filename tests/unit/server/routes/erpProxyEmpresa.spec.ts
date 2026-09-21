import { describe, expect, it } from 'vitest';
import {
  corpoComEmpresaDaSessao,
  corpoComEmpresaNaRaiz,
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

  it('repassa intacto o corpo sem nenhum envelope conhecido', () => {
    // Endpoint que não carrega `Empresa` no corpo — o proxy não inventa um.
    const original = { Produto: { CodigoProduto: 'ABC' } };

    expect(corpoComEmpresaDaSessao(original, '7')).toEqual(original);
  });

  it('sobrescreve também CheckoutFaturarNFCe.Empresa, e como texto', () => {
    // O TSDoc anterior deste teste dizia que `FaturarNFCe` "não tem esse campo".
    // Tem, é obrigatório, e é lido do **corpo** — sem ele o ERP recusa toda
    // venda com "Empresa é obrigatório" (AD-188, confirmado ao vivo em
    // 2026-09-08). Como vinha do navegador, ficava forjável.
    const corpo = corpoComEmpresaDaSessao(
      { CheckoutFaturarNFCe: { Empresa: '999', NumeroRascunho: 0 } },
      '7',
    ) as { CheckoutFaturarNFCe: Record<string, unknown> };

    // Texto, não número: é o tipo do campo neste SDT, e o que o ERP aceitou.
    expect(corpo.CheckoutFaturarNFCe['Empresa']).toBe('7');
    expect(corpo.CheckoutFaturarNFCe['NumeroRascunho']).toBe(0);
  });

  it('reescreve os dois envelopes quando ambos aparecem no mesmo corpo', () => {
    const corpo = corpoComEmpresaDaSessao(
      { Cliente: { Empresa: 999 }, CheckoutFaturarNFCe: { Empresa: '999' } },
      '7',
    ) as Record<string, Record<string, unknown>>;

    expect(corpo['Cliente']?.['Empresa']).toBe(7);
    expect(corpo['CheckoutFaturarNFCe']?.['Empresa']).toBe('7');
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
 * `Empresa` na **raiz** do corpo, para os endpoints de payload plano.
 *
 * `EnvioDiretoWhatsapp` (envio da cobrança PIX, 2026-09-21) declara
 * `{ Empresa, TrnGUID, CliCod, Telefone }` sem envelope nomeado, e o JS não
 * manda tenant nenhum (AD-019/AD-022) — aqui o campo é **inserido**, não
 * reescrito. Sem ele o ERP receberia `Empresa = 0` e o envio morreria em
 * silêncio, como já aconteceu com `GetProduto` em AD-205.
 */
describe('corpoComEmpresaNaRaiz', () => {
  const CORPO_ENVIO = {
    TrnGUID: 'b3a1c2d4-0000-4000-8000-000000000001',
    CliCod: 37,
    Telefone: '5511900000000',
    Nome: 'FULANO DE TAL',
  };

  it('insere Empresa na raiz do corpo do envio por WhatsApp', () => {
    const corpo = corpoComEmpresaNaRaiz(
      CORPO_ENVIO,
      '/ApiCentriumOAuth/EnvioDiretoWhatsapp',
      '7',
    ) as Record<string, unknown>;

    // Numérico: `EnvioDiretoWhatsappInput.Empresa` é `integer int64`, ao
    // contrário do `CheckoutFaturarNFCe.Empresa`, que é texto (AD-188).
    expect(corpo['Empresa']).toBe(7);
    expect(corpo['TrnGUID']).toBe('b3a1c2d4-0000-4000-8000-000000000001');
    expect(corpo['CliCod']).toBe(37);
  });

  it('sobrescreve a Empresa que o navegador tentou mandar', () => {
    const corpo = corpoComEmpresaNaRaiz(
      { ...CORPO_ENVIO, Empresa: 999 },
      '/ApiCentriumOAuth/EnvioDiretoWhatsapp',
      '7',
    ) as Record<string, unknown>;

    expect(corpo['Empresa']).toBe(7);
  });

  it('não toca no corpo de outros endpoints', () => {
    const original = { SDTCentriumPag_Post: { TrnGUID: 'x' } };

    expect(corpoComEmpresaNaRaiz(original, '/ApiCentriumOAuth/GerarPIX', '7')).toEqual(original);
  });

  it('não muta o corpo original da requisição', () => {
    corpoComEmpresaNaRaiz(CORPO_ENVIO, '/ApiCentriumOAuth/EnvioDiretoWhatsapp', '7');

    expect('Empresa' in CORPO_ENVIO).toBe(false);
  });

  it('deixa o corpo como está quando a empresa da sessão não é numérica', () => {
    const corpo = corpoComEmpresaNaRaiz(
      CORPO_ENVIO,
      '/ApiCentriumOAuth/EnvioDiretoWhatsapp',
      'acme',
    ) as Record<string, unknown>;

    expect(corpo['Empresa']).toBeUndefined();
  });

  it('repassa intacto o que não é objeto', () => {
    expect(corpoComEmpresaNaRaiz('texto cru', '/ApiCentriumOAuth/EnvioDiretoWhatsapp', '7')).toBe(
      'texto cru',
    );
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
