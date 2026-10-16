import { beforeEach, describe, expect, it, vi } from 'vitest';
import { notificar, ouvirRecusas } from '../../../../src/client/lib/notificar';
import { acaoBloqueavel } from '../../../../src/client/lib/bloqueio';
import { serializarLogAuditoria } from '../../../../src/client/domain/auditoria/serializarLog';
import { useVendaStore } from '../../../../src/client/stores/vendaStore';

/**
 * Toda recusa que o operador lê vira `OPERACAO_RECUSADA` no `Log` (AD-280).
 *
 * O que se protege aqui é a costura entre `notificar` (canal único dos toasts)
 * e a trilha da venda: se ela se soltar, o `Log` volta a registrar só o que
 * aconteceu, e o ERP deixa de ver o que o operador tentou e não pôde.
 */

vi.mock('goey-toast', () => ({
  gooeyToast: { error: vi.fn(), warning: vi.fn(), success: vi.fn() },
}));

function tiposDoHistorico(): string[] {
  return useVendaStore.getState().eventos.map((evento) => evento.tipo);
}

beforeEach(() => {
  useVendaStore.getState().resetarAuditoria('NOVA');
});

describe('OPERACAO_RECUSADA (AD-280)', () => {
  it('registra o erro com a frase exata que o operador leu', () => {
    notificar.erro('A venda já tem pagamento: nenhum produto entra mais.');

    expect(useVendaStore.getState().eventos.at(-1)).toMatchObject({
      tipo: 'OPERACAO_RECUSADA',
      detalhes: { nivel: 'ERRO', mensagem: 'A venda já tem pagamento: nenhum produto entra mais.' },
    });
  });

  it('registra o aviso — o desconto ajustado ao teto também é uma tentativa que não passou', () => {
    notificar.aviso(
      'Desconto máximo desta condição de pagamento: 5%. O desconto foi ajustado automaticamente.',
    );

    expect(useVendaStore.getState().eventos.at(-1)).toMatchObject({
      tipo: 'OPERACAO_RECUSADA',
      detalhes: { nivel: 'AVISO' },
    });
  });

  it('registra o clique num controle bloqueado, que explica o motivo pelo mesmo canal', () => {
    const acao = vi.fn();

    acaoBloqueavel('Aguarde: esta venda ainda está sendo enviada ao ERP.', acao)();

    expect(acao).not.toHaveBeenCalled();
    expect(tiposDoHistorico()).toEqual(['VENDA_INICIADA', 'OPERACAO_RECUSADA']);
  });

  it('não registra sucesso: o desfecho que deu certo já tem o próprio evento', () => {
    notificar.sucesso('Venda suspensa.');

    expect(tiposDoHistorico()).toEqual(['VENDA_INICIADA']);
  });

  it('não registra nada sem sessão de venda aberta (FR-002)', () => {
    useVendaStore.getState().descartarAuditoria();

    notificar.erro('Configuração do ponto de venda ainda não carregada.');

    expect(useVendaStore.getState().eventos).toEqual([]);
  });

  it('vai inteiro no Log enviado ao ERP', () => {
    notificar.erro('Informe o código do vale devolução.');

    const log: unknown = JSON.parse(serializarLogAuditoria(useVendaStore.getState().eventos));

    expect(log).toEqual([
      expect.objectContaining({ tipo: 'VENDA_INICIADA' }),
      expect.objectContaining({
        tipo: 'OPERACAO_RECUSADA',
        detalhes: { nivel: 'ERRO', mensagem: 'Informe o código do vale devolução.' },
      }),
    ]);
  });

  it('um ouvinte que falha não tira do operador o toast nem dos outros ouvintes a recusa', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const desligarQuebrado = ouvirRecusas(() => {
      throw new Error('ouvinte quebrado');
    });
    const recebidas: string[] = [];
    const desligarSadio = ouvirRecusas((recusa) => recebidas.push(recusa.mensagem));

    try {
      notificar.aviso('Este vale devolução já foi aplicado nesta venda.');
    } finally {
      desligarQuebrado();
      desligarSadio();
    }

    expect(recebidas).toEqual(['Este vale devolução já foi aplicado nesta venda.']);
    expect(tiposDoHistorico()).toEqual(['VENDA_INICIADA', 'OPERACAO_RECUSADA']);
  });
});
