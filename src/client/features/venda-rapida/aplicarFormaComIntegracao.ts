import type { Centavos } from '../../domain/precificacao/dinheiro';
import type { VendaState } from '../../stores/vendaStore';

/**
 * Adaptador da porta `aplicarForma` da feature 013 sobre o slice de pagamento
 * da 008.
 *
 * ### Por que ele existe
 *
 * `contracts/venda-rapida-domain-api.md` §4 exige que a Promise de
 * `aplicarForma` **só resolva depois que o pagamento estiver de fato aplicado**
 * — inclusive quando a forma exige TEF/PIX (correção C1 de `/speckit-analyze`).
 * O slice da 008, porém, resolve assim que o pagamento entra no estado: uma
 * forma com integração nasce `PENDENTE_INTEGRACAO` e só vira `APROVADO` quando
 * `confirmarPagamentoIntegrado` chega, do modal de PIX ou do TEF.
 *
 * A diferença é real e importa: `calcularSaldo` **não** conta pagamento
 * pendente (`saldoPagamento.ts`), então, sem esta espera, o passo P5 do
 * acionamento leria saldo em aberto positivo logo depois de um PIX lançado e
 * nunca finalizaria a venda que o cenário mandou encerrar (`quickstart.md` C5).
 *
 * A espera mora **aqui**, na composição da 013, e não dentro do slice da 008:
 * o ciclo `PENDENTE_INTEGRACAO` → `confirmarPagamentoIntegrado`/
 * `recusarPagamentoIntegrado` já é o mecanismo daquela feature, e este módulo só
 * o observa. Nenhum mecanismo novo de retomada é criado — é literalmente o que
 * o contrato descreve, implementado no ponto de junção.
 */

/**
 * O recorte do store que este módulo usa. Interface própria, e não o tipo do
 * `useVendaStore`, para o teste poder exercitar a espera com um duplo mínimo.
 */
export interface StoreDaVenda {
  getState(): VendaState;
  subscribe(ouvinte: (estado: VendaState) => void): () => void;
}

/**
 * Desfecho do pagamento `id` no estado atual: `true` aprovado, `false`
 * recusado/excluído/removido, `null` ainda pendente.
 *
 * O pagamento **sumir da lista** conta como `false` e não como "ainda
 * esperando": `recusarPagamentoIntegrado` remove o registro (o estado
 * `RECUSADO` é efêmero por desenho da 008), e `descartarPagamento` esvazia
 * tudo. Tratar a ausência como pendência deixaria a Promise viva para sempre,
 * com o guard de acionamento travado junto.
 */
function desfechoDoPagamento(estado: VendaState, id: string): boolean | null {
  const pagamento = estado.pagamentos.find((candidato) => candidato.idPagamento === id);
  if (pagamento === undefined) {
    return false;
  }
  if (pagamento.status === 'PENDENTE_INTEGRACAO') {
    return null;
  }
  return pagamento.status === 'APROVADO';
}

function aguardarDesfecho(store: StoreDaVenda, id: string): Promise<boolean> {
  return new Promise<boolean>((resolver) => {
    let cancelar: (() => void) | null = null;
    let resolvido = false;

    const concluir = (desfecho: boolean): void => {
      if (resolvido) {
        return;
      }
      resolvido = true;
      cancelar?.();
      resolver(desfecho);
    };

    cancelar = store.subscribe((estado) => {
      const desfecho = desfechoDoPagamento(estado, id);
      if (desfecho !== null) {
        concluir(desfecho);
      }
    });

    // Reavalia já inscrito: entre o `await` da aplicação e a inscrição acima o
    // estado pode ter mudado (uma integração que confirma de forma síncrona no
    // teste, por exemplo), e essa transição não geraria notificação nenhuma.
    const imediato = desfechoDoPagamento(store.getState(), id);
    if (imediato !== null) {
      concluir(imediato);
    }
  });
}

/**
 * Aplica a forma e devolve `true` só quando o pagamento está **aprovado**.
 *
 * Para formas sem integração o desfecho é imediato; para TEF/PIX a Promise fica
 * viva até a confirmação ou a recusa. É o motivo de o contrato avisar que o
 * acionamento "pode levar de instantâneo a ~90s" e que o chamador não deve
 * tratá-lo como síncrono.
 */
export async function aplicarFormaComIntegracao(
  store: StoreDaVenda,
  codigo: number,
  valor: Centavos,
): Promise<boolean> {
  const idsAntes = new Set(store.getState().pagamentos.map((pagamento) => pagamento.idPagamento));

  const entrou = await store.getState().aplicarForma(codigo, valor);
  if (!entrou) {
    return false;
  }

  // O id é descoberto por diferença porque `aplicarForma` não o devolve — e
  // devolvê-lo mudaria a assinatura de uma action da 008 para servir a esta
  // feature. A diferença é segura: o slice acrescenta **um** pagamento por
  // aplicação bem-sucedida, e nada mais escreve na lista nesse intervalo.
  const novo = store
    .getState()
    .pagamentos.find((pagamento) => !idsAntes.has(pagamento.idPagamento));
  if (novo === undefined) {
    return false;
  }

  const imediato = desfechoDoPagamento(store.getState(), novo.idPagamento);
  if (imediato !== null) {
    return imediato;
  }

  return aguardarDesfecho(store, novo.idPagamento);
}
