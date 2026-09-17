import { describe, expect, it, vi } from 'vitest';
import {
  notificarVeredito,
  TEXTO_INDISPONIVEL,
} from '../../../../src/client/features/validacao/notificarVeredito';

/**
 * Roteamento do veredito por **canal** (feature 014, AD-239).
 *
 * O ponto da suíte é a separação: a recusa abre janela e o resto passa em toast.
 * Antes do AD-239 a recusa era um toast por motivo — o operador inseria a forma,
 * a lista de pagamentos não mudava e a explicação passava voando, indistinguível
 * de um clique que não pegou.
 */
function notificadorFalso() {
  return { warning: vi.fn(), error: vi.fn(), recusa: vi.fn() };
}

describe('notificarVeredito', () => {
  it('RECUSADA vai para a janela, com todos os motivos de uma vez', () => {
    const toast = notificadorFalso();

    notificarVeredito(
      {
        resultado: 'RECUSADA',
        motivos: [
          { id: '9999', severidade: 'ERRO', texto: 'Cliente sem CPF.' },
          { id: '9999', severidade: 'ERRO', texto: 'Crédito bloqueado.' },
        ],
      },
      toast,
    );

    expect(toast.recusa).toHaveBeenCalledWith(['Cliente sem CPF.', 'Crédito bloqueado.']);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('ACEITA com avisos continua em toast, um por mensagem', () => {
    const toast = notificadorFalso();

    notificarVeredito(
      {
        resultado: 'ACEITA',
        avisos: [{ id: '9999', severidade: 'AVISO', texto: 'Limite quase no fim.' }],
      },
      toast,
    );

    expect(toast.warning).toHaveBeenCalledWith('Limite quase no fim.');
    expect(toast.recusa).not.toHaveBeenCalled();
  });

  it('ACEITA sem avisos é silêncio deliberado', () => {
    const toast = notificadorFalso();

    notificarVeredito({ resultado: 'ACEITA', avisos: [] }, toast);

    expect(toast.warning).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.recusa).not.toHaveBeenCalled();
  });

  it('INDISPONIVEL é toast de erro, não janela: o gesto é tentar de novo', () => {
    const toast = notificadorFalso();

    notificarVeredito({ resultado: 'INDISPONIVEL', causa: 'REDE' }, toast);

    expect(toast.error).toHaveBeenCalledWith(TEXTO_INDISPONIVEL.REDE);
    expect(toast.recusa).not.toHaveBeenCalled();
  });
});
