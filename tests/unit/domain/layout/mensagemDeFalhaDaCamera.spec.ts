import { describe, expect, it } from 'vitest';
import {
  CAUSA_CONTEXTO_INSEGURO,
  mensagemDeFalhaDaCamera,
} from '../../../../src/client/domain/layout/mensagemDeFalhaDaCamera';

/**
 * Correção do usuário, 2026-09-15: "erro ao chamar o scanner e permitir pelo
 * celular — 'Este site não pode pedir permissões. Feche todos os balões e
 * sobreposições de outros apps. Em seguida, tente novamente.'".
 *
 * O que estes casos protegem não é o texto, é a **saída** que cada frase indica.
 * Uma única mensagem genérica ("não foi possível abrir a câmera") é verdadeira
 * em todos os desfechos e útil em nenhum: manda procurar defeito de hardware
 * quem precisa fechar uma bolha de conversa, e manda tentar de novo quem está
 * num endereço sem HTTPS, onde nenhuma tentativa jamais funcionará.
 */

/** O erro que o navegador de fato lança, e não um objeto qualquer com `name`. */
function erroDeMidia(nome: string): DOMException {
  return new DOMException('mensagem irrelevante para a regra', nome);
}

describe('mensagemDeFalhaDaCamera', () => {
  it('na permissão recusada, nomeia as sobreposições de outros apps', () => {
    // O Chrome/Android usa `NotAllowedError` tanto para a recusa deliberada
    // quanto para o caso em que o **Android** se negou a exibir o diálogo por
    // causa de uma sobreposição. A frase precisa servir aos dois, porque o
    // navegador não os separa.
    const frase = mensagemDeFalhaDaCamera(erroDeMidia('NotAllowedError'));

    expect(frase).toContain('permissão');
    expect(frase).toMatch(/sobreposto|sobreposição/i);
    // E a venda não depende disso: o campo de código continua sendo a saída.
    expect(frase).toContain('campo de código');
  });

  it('aceita o nome legado da mesma recusa, que Android antigo ainda lança', () => {
    expect(mensagemDeFalhaDaCamera(erroDeMidia('PermissionDeniedError'))).toBe(
      mensagemDeFalhaDaCamera(erroDeMidia('NotAllowedError')),
    );
  });

  it('sem câmera no aparelho, não manda tentar de novo', () => {
    const frase = mensagemDeFalhaDaCamera(erroDeMidia('NotFoundError'));

    expect(frase).toContain('Nenhuma câmera');
    // Repetir o gesto num aparelho sem câmera é o conselho que mais desgasta a
    // confiança do operador: nunca vai funcionar.
    expect(frase).not.toContain('Tentar de novo');
  });

  it('a câmera traseira inexistente cai no mesmo desfecho de "sem câmera"', () => {
    // `facingMode: 'environment'` não satisfeito — para quem opera, é igual a
    // não haver câmera.
    expect(mensagemDeFalhaDaCamera(erroDeMidia('OverconstrainedError'))).toBe(
      mensagemDeFalhaDaCamera(erroDeMidia('NotFoundError')),
    );
  });

  it('com a câmera presa em outro aplicativo, manda fechá-lo e tentar de novo', () => {
    const frase = mensagemDeFalhaDaCamera(erroDeMidia('NotReadableError'));

    expect(frase).toContain('outro aplicativo');
    expect(frase).toContain('Tentar de novo');
  });

  it('fora de contexto seguro, aponta o HTTPS em vez de prometer nova tentativa', () => {
    // O cenário real de teste em rede local: `http://<ip-da-lan>` ou HTTPS com
    // certificado que o celular não confia. Ali `navigator.mediaDevices` nem
    // existe, e insistir no botão não muda nada.
    const frase = mensagemDeFalhaDaCamera(erroDeMidia(CAUSA_CONTEXTO_INSEGURO));

    expect(frase).toContain('HTTPS');
    expect(mensagemDeFalhaDaCamera(erroDeMidia('SecurityError'))).toBe(frase);
  });

  it('o que não se reconhece ainda diz o que fazer, sem inventar causa', () => {
    expect(mensagemDeFalhaDaCamera(erroDeMidia('AlgoQueNinguemPreviu'))).toBe(
      'Não foi possível abrir a câmera. Use o campo de código.',
    );
    // Nem todo `catch` recebe um `Error` — um `throw 'texto'` de biblioteca cai
    // aqui, e a função não pode quebrar ao ler `.name` de uma string.
    expect(mensagemDeFalhaDaCamera('falhou')).toContain('campo de código');
  });
});
