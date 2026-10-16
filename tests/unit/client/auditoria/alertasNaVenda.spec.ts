import { beforeEach, describe, expect, it, vi } from 'vitest';
import { notificar, ouvirAlertas } from '../../../../src/client/lib/notificar';
import { acaoBloqueavel } from '../../../../src/client/lib/bloqueio';
import { serializarLogAuditoria } from '../../../../src/client/domain/auditoria/serializarLog';
import { useVendaStore } from '../../../../src/client/stores/vendaStore';

/**
 * Todo alerta de erro ou aviso que o operador lê vira
 * `ALERTA_EXIBIDO_AO_OPERADOR` no `Log` (AD-280).
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

describe('ALERTA_EXIBIDO_AO_OPERADOR (AD-280)', () => {
  it('registra o erro com a frase exata que o operador leu', () => {
    notificar.erro('A venda já tem pagamento: nenhum produto entra mais.');

    expect(useVendaStore.getState().eventos.at(-1)).toMatchObject({
      tipo: 'ALERTA_EXIBIDO_AO_OPERADOR',
      detalhes: { nivel: 'ERRO', mensagem: 'A venda já tem pagamento: nenhum produto entra mais.' },
    });
  });

  it('registra o aviso com o nível de aviso — o gesto pode ter acontecido, com algo a saber', () => {
    notificar.aviso(
      'Desconto máximo desta condição de pagamento: 5%. O desconto foi ajustado automaticamente.',
    );

    expect(useVendaStore.getState().eventos.at(-1)).toMatchObject({
      tipo: 'ALERTA_EXIBIDO_AO_OPERADOR',
      detalhes: { nivel: 'AVISO' },
    });
  });

  it('registra o clique num controle bloqueado, que explica o motivo pelo mesmo canal', () => {
    const acao = vi.fn();

    acaoBloqueavel('Aguarde: esta venda ainda está sendo enviada ao ERP.', acao)();

    expect(acao).not.toHaveBeenCalled();
    expect(tiposDoHistorico()).toEqual(['VENDA_INICIADA', 'ALERTA_EXIBIDO_AO_OPERADOR']);
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

  it('não registra com o Log já a caminho do ERP — ele não teria como chegar lá', () => {
    useVendaStore.getState().marcarLogEmEnvio(true);
    notificar.erro('Aguarde: esta venda ainda está sendo enviada ao ERP.');
    useVendaStore.getState().marcarLogEmEnvio(false);
    notificar.erro('Informe o código do vale devolução.');

    expect(tiposDoHistorico()).toEqual(['VENDA_INICIADA', 'ALERTA_EXIBIDO_AO_OPERADOR']);
    expect(useVendaStore.getState().eventos.at(-1)?.detalhes).toEqual({
      nivel: 'ERRO',
      mensagem: 'Informe o código do vale devolução.',
    });
  });

  it('abrir a venda seguinte desliga a marca de envio — nenhuma venda nasce em trânsito', () => {
    useVendaStore.getState().marcarLogEmEnvio(true);

    useVendaStore.getState().resetarAuditoria('NOVA');

    expect(useVendaStore.getState().logEmEnvio).toBe(false);
  });

  it('vai inteiro no Log enviado ao ERP', () => {
    notificar.erro('Informe o código do vale devolução.');

    const log: unknown = JSON.parse(serializarLogAuditoria(useVendaStore.getState().eventos));

    expect(log).toEqual([
      expect.objectContaining({ tipo: 'VENDA_INICIADA' }),
      expect.objectContaining({
        tipo: 'ALERTA_EXIBIDO_AO_OPERADOR',
        detalhes: { nivel: 'ERRO', mensagem: 'Informe o código do vale devolução.' },
      }),
    ]);
  });

  it('um ouvinte que falha não tira dos outros ouvintes o alerta', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const desligarQuebrado = ouvirAlertas(() => {
      throw new Error('ouvinte quebrado');
    });
    const recebidas: string[] = [];
    const desligarSadio = ouvirAlertas((alerta) => recebidas.push(alerta.mensagem));

    try {
      notificar.aviso('Este vale devolução já foi aplicado nesta venda.');
    } finally {
      desligarQuebrado();
      desligarSadio();
    }

    expect(recebidas).toEqual(['Este vale devolução já foi aplicado nesta venda.']);
    expect(tiposDoHistorico()).toEqual(['VENDA_INICIADA', 'ALERTA_EXIBIDO_AO_OPERADOR']);
  });
});
