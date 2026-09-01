import { describe, expect, it } from 'vitest';
import {
  SESSION_COOKIE_OPTIONS,
  criarCifradorDeSessao,
  type SessaoOperador,
} from '../../../../src/server/session/cookie';

const SEGREDO = 'segredo-de-teste-com-32-caracteres-ok';

/** Sessão sintética — nenhum valor real de produção. */
const sessao: SessaoOperador = {
  access_token: 'token-sintetico-abc123',
  tenant: 'acme',
  client_id: 'client-sintetico',
  client_secret: 'secret-sintetico',
  username: 'operador.teste',
  password: 'senha-sintetica',
  Repository: '00000000-0000-0000-0000-000000000000',
  codigoEmpresa: '1',
};

describe('cookie de sessão', () => {
  it('faz round-trip preservando todos os campos', () => {
    const cifrador = criarCifradorDeSessao(SEGREDO);

    const cifrado = cifrador.cifrar(sessao);
    const aberto = cifrador.decifrar(cifrado);

    expect(aberto).toEqual(sessao);
  });

  it('não deixa nenhum campo sensível legível no valor cifrado', () => {
    const cifrador = criarCifradorDeSessao(SEGREDO);

    const cifrado = cifrador.cifrar(sessao);

    expect(cifrado).not.toContain(sessao.access_token);
    expect(cifrado).not.toContain(sessao.client_secret);
    expect(cifrado).not.toContain(sessao.password);
    expect(cifrado).not.toContain(sessao.username);
  });

  it('gera valores diferentes a cada cifragem (IV aleatório)', () => {
    const cifrador = criarCifradorDeSessao(SEGREDO);

    expect(cifrador.cifrar(sessao)).not.toEqual(cifrador.cifrar(sessao));
  });

  it('recusa cookie cifrado com outro SESSION_SECRET', () => {
    const cifrado = criarCifradorDeSessao(SEGREDO).cifrar(sessao);
    const outro = criarCifradorDeSessao('outro-segredo-de-teste-com-32-chars!!');

    expect(outro.decifrar(cifrado)).toBeNull();
  });

  it('recusa cookie adulterado', () => {
    const cifrador = criarCifradorDeSessao(SEGREDO);
    const cifrado = cifrador.cifrar(sessao);
    const partes = cifrado.split('.');
    const conteudo = partes[3];
    expect(conteudo).toBeDefined();

    const adulterado = [partes[0], partes[1], partes[2], `${conteudo}AA`].join('.');

    expect(cifrador.decifrar(adulterado)).toBeNull();
  });

  it.each([
    ['ausente', undefined],
    ['vazio', ''],
    ['sem as quatro partes', 'v1.abc'],
    ['de versão desconhecida', 'v2.a.b.c'],
    ['não cifrado', JSON.stringify(sessao)],
  ])('devolve null para cookie %s', (_caso, valor) => {
    const cifrador = criarCifradorDeSessao(SEGREDO);

    expect(cifrador.decifrar(valor)).toBeNull();
  });

  it('recusa payload cifrado válido que não tem a forma de uma sessão', () => {
    const cifrador = criarCifradorDeSessao(SEGREDO);
    // Cifrado com a chave certa, mas sem os campos obrigatórios.
    const incompleto = cifrador.cifrar({ ...sessao, codigoEmpresa: '' } as SessaoOperador);
    expect(cifrador.decifrar(incompleto)).not.toBeNull();

    const semCampo: Record<string, string> = { ...sessao };
    delete semCampo['Repository'];
    const cifradoSemCampo = cifrador.cifrar(semCampo as unknown as SessaoOperador);

    expect(cifrador.decifrar(cifradoSemCampo)).toBeNull();
  });

  it('marca o cookie como HttpOnly, Secure e SameSite=Lax (FR-002)', () => {
    expect(SESSION_COOKIE_OPTIONS).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
    });
  });
});
