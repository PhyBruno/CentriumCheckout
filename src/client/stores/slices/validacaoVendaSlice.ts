import { castDraft } from 'immer';
import type { StateCreator } from 'zustand';
import type { VendaState } from '../vendaStore';
import type { Centavos } from '../../domain/precificacao/dinheiro';
import type { PagamentoAplicado } from '../../domain/pagamento/saldoPagamento';
import {
  autorizaFinalizacao,
  type Veredito,
} from '../../domain/validacaoVenda/interpretarVeredito';
import {
  projetarPagamentos,
  type FormaCandidata,
} from '../../domain/validacaoVenda/projetarPagamentos';
import {
  montarRetratoVenda,
  type CheckoutFaturarNFCe,
  type SnapshotVenda,
} from '../../domain/venda/montarRetratoVenda';
import {
  eventoValidacaoVendaRecusada,
  type OrigemValidacaoVenda,
} from '../../domain/auditoria/eventos';

/**
 * Gate de validação prévia da venda no ERP (T007, feature 014).
 *
 * Orquestra: projeta a candidata sobre os pagamentos aplicados, monta o retrato
 * pelo **mesmo** montador do faturamento, consulta `ValidarNFCe`, interpreta e
 * notifica. Nenhuma regra de negócio vive aqui — o ERP é a fonte de verdade
 * (Constitution III), e este slice não reimplementa limite de crédito nem
 * crediário.
 *
 * **Não importa nenhum outro slice**: pagamentos, snapshot da venda, rede e
 * auditoria chegam por `ValidacaoDeps` (Dependency Inversion). É isso que
 * permite testar o gate inteiro sem montar React, rede ou o slice de pagamento
 * — e é o que impede um ciclo com `pagamentoSlice`, que consome este.
 */

/**
 * Como o operador chegou à inserção (`contracts/validacao-domain-api.md` §3).
 *
 * Alias do tipo da auditoria (001), e não uma segunda união com os mesmos dois
 * literais: o único consumidor de `origem` é o evento `VALIDACAO_VENDA_RECUSADA`,
 * e dois tipos idênticos declarados em lugares diferentes divergiriam no dia em
 * que um terceiro caminho de acionamento aparecesse.
 *
 * **Nunca é parâmetro público das UIs**: cada ponto de entrada de
 * `pagamentoSlice` embute o seu literal — `aplicarPagamento` (botão da tela de
 * pagamento) passa `'MANUAL'`, `aplicarForma` (porta do atalho de cenário da
 * feature 013) passa `'ATALHO_CENARIO'`.
 */
export type OrigemAcionamento = OrigemValidacaoVenda;

export interface ValidacaoDeps {
  /** Carrinho, cliente, vendedor, identidade, sessão e log (001/002/003/005/012). */
  snapshotVenda(): SnapshotVenda;
  /** Formas já aplicadas à venda, na ordem de inserção (008). */
  pagamentosAplicados(): readonly PagamentoAplicado[];
  /**
   * Rateio do desconto de capa por `idLinha` (008).
   *
   * Entra na dependência em vez de ser recalculado aqui porque o retrato
   * validado precisa ser idêntico ao retrato emitido (I5), e o rateio é parte
   * dele: um segundo cálculo poderia distribuir centavos de forma diferente.
   */
  rateioDescontoCapa(): ReadonlyMap<string, Centavos>;
  /** Consulta ao ERP. **Nunca rejeita** — falha vira `INDISPONIVEL` (I4). */
  validar(retrato: CheckoutFaturarNFCe): Promise<Veredito>;
  /**
   * Trilha de auditoria da venda (001).
   *
   * Tipada pelo retorno da factory, e não por `EventoAuditoriaRegistravel`: este
   * slice registra **um** tipo de evento, e aceitar a união inteira permitiria
   * a composição injetar um dispatcher que nem sabe lidar com ele.
   */
  registrarEvento(evento: ReturnType<typeof eventoValidacaoVendaRecusada>): void;
  /** Apresentação do veredito. Injetada para o slice não importar a lib de toast. */
  notificar(veredito: Veredito): void;
}

export interface ValidacaoVendaSlice {
  /**
   * Último veredito **favorável** obtido nesta venda, ou `null`.
   *
   * `null` não é "ainda não perguntei": é "não há autorização para emitir".
   * Recusa e indisponibilidade não o zeram nem o preenchem — a venda não mudou,
   * então o que valia antes continua valendo.
   */
  vereditoVigente: Veredito | null;
  /** Há uma consulta em voo — exclusão mútua de `FR-011`/I8. */
  emValidacao: boolean;

  validarInsercao(candidata: FormaCandidata, origem: OrigemAcionamento): Promise<Veredito>;
  invalidarVeredito(): void;

  /**
   * A venda foi montada a partir de um documento que o ERP **já aceitou** —
   * rascunho de NFCe retomado (011) ou DAV importado já pago (006).
   *
   * Existe porque o gate valida o que o operador **acrescenta**, e nesses dois
   * caminhos ele não acrescentou nada: as formas entram por
   * `importarFormasDePagamento`, que substitui a lista inteira sem passar por
   * `aplicarPagamento`. Sem esta porta, uma venda retomada já paga ficaria com
   * `vereditoVigente === null` para sempre e o botão "Finalizar" nunca liberaria
   * — o operador não teria nem como consultar o ERP, porque não há candidata a
   * validar. Achado pelo E2E da 011 ao ligar o gate real (T009).
   *
   * Não é um atalho para "aprovar sem perguntar": qualquer forma que o operador
   * acrescente **depois** passa pelo gate normalmente, e `removerPagamento`
   * continua zerando o veredito.
   */
  dispensarValidacaoPorDocumento(): void;

  /** Seletor: a venda pode ser emitida? (`FR-015`, I6) */
  podeFinalizar(): boolean;
}

/**
 * Devolvido quando já existe uma consulta em voo (`FR-011`, I8).
 *
 * `INDISPONIVEL` e não uma recusa de negócio: nada foi perguntado ao ERP, e
 * dizer ao operador que a venda foi recusada seria mentira. Como todo
 * `INDISPONIVEL`, não muta nada e não autoriza finalização.
 */
const VEREDITO_OCUPADO: Veredito = { resultado: 'INDISPONIVEL', causa: 'SERVIDOR' };

/** Rótulo do motivo na auditoria — texto do ERP, ou a causa quando não houve resposta. */
function motivoParaAuditoria(veredito: Veredito): string {
  switch (veredito.resultado) {
    case 'RECUSADA':
      return veredito.motivos.map((mensagem) => mensagem.texto).join(' ');
    case 'INDISPONIVEL':
      return `ERP indisponível (${veredito.causa}).`;
    case 'ACEITA':
      // Inalcançável: `ACEITA` não gera evento (AD-113). O ramo existe para o
      // `switch` ser total, e não para descrever um caso real.
      return '';
  }
}

export function criarValidacaoVendaSlice(
  deps: ValidacaoDeps,
): StateCreator<VendaState, [['zustand/immer', never]], [], ValidacaoVendaSlice> {
  return (set, get) => ({
    vereditoVigente: null,
    emValidacao: false,

    validarInsercao: async (candidata, origem) => {
      // Guarda de entrada (`FR-011`, I8): dois toques rápidos no mesmo atalho
      // F6–F9 disparam dois acionamentos, e sem isto o ERP receberia duas
      // consultas para a mesma venda — a segunda validando um retrato que a
      // primeira ainda não efetivou. Devolve sem consultar, em vez de enfileirar:
      // o segundo gesto não representa uma segunda intenção do operador.
      if (get().emValidacao) {
        return VEREDITO_OCUPADO;
      }

      // `set` com objeto, e não com recipe do Immer: `Veredito` carrega arrays
      // `readonly`, e o draft mutável do Immer não aceita atribuí-los. Trocar o
      // tipo por arrays mutáveis só para agradar o middleware daria a um call
      // site a chance de alterar os motivos de uma recusa já emitida.
      set({ emValidacao: true });

      try {
        const retrato = montarRetratoVenda(
          deps.snapshotVenda(),
          'VALIDAR',
          projetarPagamentos(deps.pagamentosAplicados(), candidata),
          deps.rateioDescontoCapa(),
        );

        const veredito = await deps.validar(retrato);

        if (veredito.resultado === 'ACEITA') {
          // `castDraft` porque `Veredito` carrega arrays `readonly` e o
          // middleware do Immer tipa o estado como draft mutável. A alternativa
          // — tornar `avisos`/`motivos` mutáveis — daria a qualquer call site a
          // chance de alterar os motivos de um veredito já emitido, que é
          // exatamente o que a união imutável existe para impedir.
          set({ vereditoVigente: castDraft(veredito) });
        } else {
          // Recusa e indisponibilidade **não** tocam `vereditoVigente` — nem
          // para gravar, nem para apagar. A venda não mudou: se havia uma
          // autorização válida da inserção anterior, ela continua descrevendo a
          // mesma venda. Zerar aqui bloquearia a finalização de uma venda que o
          // ERP já aprovou, por causa de uma tentativa que não chegou a existir.
          deps.registrarEvento(
            eventoValidacaoVendaRecusada({
              origem,
              condicao: String(retrato.CondicaoPagamentoCodigo),
              formaPagamento: String(candidata.formaCodigo),
              motivo: motivoParaAuditoria(veredito),
            }),
          );
        }

        // Fora do `if`: `ACEITA` **com avisos** também notifica (`FR-005`), e
        // é o único caso em que o operador vê mensagem sem ser bloqueado.
        deps.notificar(veredito);

        return veredito;
      } finally {
        // `finally` e não no fim do `try`: uma exceção inesperada em
        // `montarRetratoVenda` (o rateio do desconto de capa lança quando o
        // desconto excede as linhas) deixaria `emValidacao` preso em `true` e o
        // gate travado para o resto da venda — nenhuma inserção seguinte
        // conseguiria nem consultar.
        set((estado) => {
          estado.emValidacao = false;
        });
      }
    },

    invalidarVeredito: () => {
      set((estado) => {
        estado.vereditoVigente = null;
      });
    },

    dispensarValidacaoPorDocumento: () => {
      // Sem avisos: o documento não trouxe mensagem nenhuma do ERP, e inventar
      // uma notificação aqui contaria ao operador algo que não aconteceu.
      set({ vereditoVigente: { resultado: 'ACEITA', avisos: [] } });
    },

    podeFinalizar: () => autorizaFinalizacao(get().vereditoVigente),
  });
}
