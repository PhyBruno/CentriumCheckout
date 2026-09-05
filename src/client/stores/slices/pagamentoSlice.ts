import type { StateCreator } from 'zustand';
import type { VendaState } from '../vendaStore';
import {
  eventoCondicaoPagamentoAplicada,
  eventoFormaPagamentoAplicada,
  eventoFormaPagamentoRemovida,
  eventoPagamentoRecusado,
  eventoValeDevolucaoUsado,
} from '../../domain/auditoria/eventos';
import type { FormaPagamentoImportada } from '../../domain/importacaoVenda/mapearVendaExistente';
import {
  MEIOS_PAGTO_NFE,
  type CondicaoPagamento,
  type FormaPagamento,
  type MeioPagtoNFe,
} from '../../domain/pagamento/formaPagamento';
import {
  ratearDescontoCapa,
  recusaDoDescontoCapa,
  resolverDescontoCapa,
  type DescontoCapa,
  type LinhaRateavel,
  type RecusaDescontoCapa,
} from '../../domain/pagamento/descontoCapa';
import {
  resolverIntegracao,
  type CapacidadesPagamento,
  type IntegracaoPagamento,
} from '../../domain/pagamento/roteamentoIntegracao';
import {
  calcularSaldo,
  derivarValores,
  podeAplicarForma,
  type DadosTEF,
  type PagamentoAplicado,
  type SaldoPagamento,
} from '../../domain/pagamento/saldoPagamento';
import { ehFormaDeValeDevolucao, type ResultadoTicket } from '../../domain/pagamento/valeDevolucao';
import { subtrair, ZERO_CENTAVOS, type Centavos } from '../../domain/precificacao/dinheiro';
import type { FormaDePagamentoRetrato } from '../../domain/venda/montarRetratoVenda';

/**
 * Slice do pagamento da venda em andamento (feature 008).
 *
 * Combinado no `vendaStore` (Zustand+Immer, **sem `persist`**): o pagamento
 * morre num F5 junto com o carrinho, por decisão de arquitetura (AD-006,
 * Constitution VI).
 *
 * Responsabilidade única (Constitution II): **orquestrar**. Toda a matemática
 * — saldo, troco, rateio, roteamento de integração, elegibilidade de vale —
 * vive no domínio puro (`domain/pagamento/`); aqui só existem a mutação, a
 * chamada às portas injetadas e o disparo dos cinco eventos de auditoria
 * (`research.md` D13). O slice **não importa** o slice de carrinho, o de
 * cliente, o hook de layout, os módulos de PIX/TEF nem a camada de query: tudo
 * chega por `PagamentoDeps` (Dependency Inversion). É isso que permite testar o
 * gate de validação prévia, a irreversibilidade e o troco sem montar componente
 * nem rede.
 *
 * **Bloqueio é sempre no-op com aviso, nunca exceção** — mesmo padrão de
 * `carrinhoSlice.carrinhoBloqueado()`: derrubar a venda de um operador de caixa
 * por uma regra de negócio é pior do que recusar a ação e explicar.
 *
 * ---
 *
 * ### Divergência consciente do contrato: `aplicarPagamento` é assíncrona
 *
 * `specs/008-pagamento-geral/contracts/pagamento-domain-api.md` §2 declara
 * `aplicarPagamento(input): void` e afirma que `aplicarValeDevolucao` é "a única
 * action assíncrona do slice". **O contrato é inconsistente consigo mesmo**: a
 * tabela "Contrato de comportamento das actions", no mesmo §2, exige que
 * `aplicarPagamento` só mute o estado **depois** de `await validarInsercao(...)`
 * (`FR-019`, invariante I11 de `data-model.md`). Uma action que devolvesse
 * `void` não teria como oferecer ao call site nenhum ponto de espera — a UI e o
 * atalho da feature 013 não conseguiriam saber se o pagamento entrou, e um
 * teste não conseguiria afirmar "nada mutou antes do veredito" sem depender de
 * `setTimeout`.
 *
 * Por isso `aplicarPagamento` e `aplicarForma` devolvem `Promise<void>`. A frase
 * do contrato continua verdadeira no sentido em que foi escrita —
 * `aplicarValeDevolucao` é a única action que faz uma chamada **de rede
 * própria** (`ValidaTicketDevolucao`); as duas de aplicação apenas aguardam uma
 * porta injetada que pertence à feature 014.
 */

/* ------------------------------------------------------------------ *
 * Tipos emprestados da feature 014 (validação prévia)
 * ------------------------------------------------------------------ */

/**
 * Como o operador chegou à inserção da forma
 * (`specs/014-validacao-previa-nfce/contracts/validacao-domain-api.md` §3).
 *
 * Declarado **aqui** porque a feature 014 ainda não existe no código. Quando
 * existir, estes três tipos migram para `validacaoVendaSlice.ts` e este arquivo
 * passa a importá-los — a assinatura das actions não muda, porque `origem`
 * nunca é parâmetro público: cada ponto de entrada embute o seu literal (achado
 * I1 do `/speckit-analyze` da 014).
 */
export type OrigemAcionamento = 'MANUAL' | 'ATALHO_CENARIO';

/**
 * A forma que o operador está tentando inserir, projetada como o ERP a veria.
 *
 * `fpgUtiCar` e `entrada` são obrigatórios: sem `entrada` (`FpgEnt`) o ERP
 * calcula crediário zero e aprova exatamente o que a validação prévia existe
 * para barrar (`FR-022`/AD-111).
 */
export interface FormaCandidata {
  readonly formaCodigo: number;
  readonly meioPagtoNFe: MeioPagtoNFe;
  readonly valor: Centavos;
  readonly fpgUtiCar: string;
  readonly entrada: string;
}

/**
 * Veredito da validação prévia, reduzido ao que **esta** feature precisa
 * decidir: aceitar ou recusar. A 014 modela mais estados (`ACEITA` com avisos,
 * `INDISPONIVEL`); aqui os dois últimos colapsam em `aceita: false`, porque o
 * efeito sobre a inserção é idêntico — nada muta (I11).
 */
export type Veredito =
  { readonly aceita: true } | { readonly aceita: false; readonly motivo: string };

/* ------------------------------------------------------------------ *
 * Tipos emprestados das features 009/010 (PIX e TEF)
 * ------------------------------------------------------------------ */

/** Contexto opaco entregue à integração — esta feature não o interpreta. */
export interface ContextoIntegracao {
  readonly idPagamento: string;
  readonly formaCodigo: number;
  readonly valor: Centavos;
}

/** Resultado opaco devolvido pela integração ao confirmar o pagamento. */
export interface DadosIntegracao {
  readonly dadosTEF?: DadosTEF;
  readonly pixGuid?: string;
}

/* ------------------------------------------------------------------ *
 * Tipos próprios do slice
 * ------------------------------------------------------------------ */

/**
 * Quanto de um vale devolução se perderia por não haver troco (`FR-026`).
 * Entregue à UI para que a confirmação mostre números, não uma frase genérica.
 */
export interface ExcedenteDeVale {
  readonly valorTicket: Centavos;
  readonly saldoRestante: Centavos;
  readonly excedente: Centavos;
}

/** Vale consumido **uma única vez**, na aplicação (`data-model.md` §2). */
export interface ValeDevolucaoAplicado {
  readonly codigo: string;
  readonly valor: Centavos;
  readonly idPagamento: string;
}

export interface AplicarPagamentoInput {
  readonly forma: FormaPagamento;
  /**
   * O que o operador digitou. Para `Dinheiro` é o valor **recebido** — o
   * excedente vira troco e nunca entra em `valorAplicado` (`data-model.md` §6).
   */
  readonly valorInformado: Centavos;
}

/** A parte de pagamento de `CheckoutFaturarNFCe`, montada para a feature 004. */
export interface PagamentosPayload {
  readonly CondicaoPagamentoCodigo: number;
  readonly FormasDePagamento: readonly FormaDePagamentoRetrato[];
  /** Rateio do desconto de capa por `idLinha`, para a feature 004 aplicar em `produtos[].DescontoValor`. */
  readonly rateioDescontoCapa: ReadonlyMap<string, Centavos>;
}

/**
 * Dependências injetadas na composição do `vendaStore` (Dependency Inversion).
 *
 * Nenhuma delas é importada: é o que permite exercitar o gate `FR-019`, a
 * irreversibilidade de I6 e o rateio sem montar React, rede ou o slice de
 * carrinho.
 */
export interface PagamentoDeps {
  /** Subtotal das linhas ativas do carrinho (feature 003). */
  subtotalCarrinho(): Centavos;
  /** Linhas **ativas** que participam do rateio do desconto de capa (feature 003). */
  linhasRateaveis(): readonly LinhaRateavel[];
  /** `TEFAtivo`/`UtilizaCentriumPAG` do bootstrap (feature 002). */
  capacidades(): CapacidadesPagamento;
  /** `ValidaTicketDevolucao` pela camada de query (feature 008). */
  validarTicket(codigo: string): Promise<ResultadoTicket>;
  /** Entrega o veredito de integração às features 009/010 — nunca as executa aqui. */
  iniciarIntegracao(integracao: IntegracaoPagamento, ctx: ContextoIntegracao): void;
  /** Gate pré-inserção da feature 014 (`FR-019`, I11). */
  validarInsercao(candidata: FormaCandidata, origem: OrigemAcionamento): Promise<Veredito>;
  /** Invalida o veredito vigente da 014 ao remover pagamento (`FR-021`). */
  invalidarVeredito(): void;
  /** Aviso ao operador. Injetado para o slice não importar a lib de toast. */
  avisar?: (mensagem: string) => void;
  /** Injetável para tornar `idPagamento` determinístico em teste (padrão de `gerarIdLinha`). */
  gerarIdPagamento?: () => string;
}

export interface PagamentoSlice {
  /** Escalar: **uma** condição por venda (I1, `research.md` D2). */
  condicaoSelecionada: CondicaoPagamento | null;
  pagamentos: PagamentoAplicado[];
  /** Um único desconto de capa; aplicar de novo substitui, nunca acumula. */
  descontoCapa: DescontoCapa | null;
  /**
   * Vales já aplicados nesta venda, um por pagamento de forma `'VDV'`.
   *
   * Lista, e não escalar: nada no ERP limita a venda a **um** vale, e o cliente
   * pode chegar com dois tickets de devoluções diferentes. O que não pode
   * repetir é o **mesmo código** — ver `aplicarValeDevolucao`.
   */
  valesDevolucao: ValeDevolucaoAplicado[];

  selecionarCondicao(condicao: CondicaoPagamento): void;
  aplicarPagamento(input: AplicarPagamentoInput): Promise<void>;
  /** Porta da feature 013 — mesmo núcleo, só muda a `origem` do gate. */
  aplicarForma(codigo: number, valor: Centavos): Promise<void>;
  confirmarPagamentoIntegrado(idPagamento: string, dados: DadosIntegracao): void;
  recusarPagamentoIntegrado(idPagamento: string, motivo: string): void;
  removerPagamento(idPagamento: string): void;
  /**
   * Devolve `true` quando o desconto entrou. O booleano existe para o campo
   * poder **descartar o texto recusado** (correção do usuário, 2026-09-04): sem
   * ele, o número digitado ficava na tela como se estivesse valendo, e o
   * operador só descobria o contrário ao ler o total.
   */
  aplicarDescontoCapa(modo: 'PERCENTUAL' | 'VALOR', entrada: number): boolean;
  removerDescontoCapa(): void;
  /**
   * Valida o ticket no ERP e, se válido, **insere o pagamento** de valor igual
   * ao do vale. Devolve `true` quando o pagamento entrou.
   *
   * `confirmarExcedente` é consultado **só** quando o ticket vale mais do que
   * falta pagar (`FR-026`). Ausente, o excedente é tratado como não confirmado
   * e nada é aplicado — o padrão seguro para qualquer chamador que ainda não
   * saiba perguntar.
   */
  aplicarValeDevolucao(
    forma: FormaPagamento,
    codigo: string,
    confirmarExcedente?: (excedente: ExcedenteDeVale) => Promise<boolean>,
  ): Promise<boolean>;
  limparPagamentos(): void;
  /**
   * Devolve a venda ao estado "sem pagamento" a **pedido do operador**, para
   * reabrir a edição do carrinho (pedido do usuário, 2026-09-04).
   *
   * Não é `limparPagamentos`: aquela é a limpeza pós-entrega da feature 004,
   * chamada depois de o ERP confirmar, e por isso não tem guarda nenhuma.
   * Esta é um gesto de tela e recusa o que I6 já protege — um TEF/PIX aprovado
   * movimentou dinheiro fora do Checkout e não desaparece por um clique.
   */
  descartarPagamento(): void;
  /** Feature 006 — importação de DAV/rascunho, nunca gesto do operador. */
  importarFormasDePagamento(formas: readonly FormaPagamentoImportada[]): void;

  // seletores
  podeMutarCarrinho(): boolean;
  saldo(): SaldoPagamento;
  montarPagamentosParaPayload(): PagamentosPayload;
}

/* ------------------------------------------------------------------ *
 * Mensagens de aviso (texto único, reusado pela UI)
 * ------------------------------------------------------------------ */

export const AVISO_DINHEIRO_DUPLICADO = 'Já existe uma forma dinheiro aplicada nesta venda.';
export const AVISO_SALDO_JA_COBERTO = 'O saldo desta venda já está totalmente coberto.';
/**
 * `FR-024`. A frase nomeia a causa (a forma não gera troco) e a saída (informar
 * no máximo o que falta), porque a alternativa que o operador tentaria sozinho
 * — insistir no mesmo valor — nunca funciona.
 */
export const AVISO_VALOR_ACIMA_DO_SALDO =
  'Esta forma de pagamento não gera troco: informe no máximo o valor que falta para fechar a venda.';
export const AVISO_VALIDACAO_INDISPONIVEL =
  'Não foi possível validar a venda no ERP: o pagamento não foi aplicado.';
/**
 * Venda cujo total líquido é zero (pedido do usuário, 2026-09-04).
 *
 * Distinta de `AVISO_SALDO_JA_COBERTO`, que descreve o desfecho **feliz** —
 * havia valor e ele já foi todo pago. Aqui não houve valor nenhum a cobrar, e
 * dizer "já está coberto" mandaria o operador procurar um pagamento que não
 * existe em vez de olhar o desconto ou os itens.
 */
export const AVISO_VENDA_SEM_VALOR =
  'Esta venda não tem valor a cobrar: revise o desconto de capa ou os itens antes de adicionar um pagamento.';
export const AVISO_FORMA_FORA_DA_CONDICAO =
  'Esta forma de pagamento não pertence à condição selecionada.';
/**
 * Troca de condição com forma já inserida (regra do usuário, 2026-09-04).
 *
 * A frase nomeia a regra ("uma condição por venda") e a saída ("Limpar"), porque
 * o que o operador tentaria sozinho — escolher outra condição de novo — nunca
 * vai funcionar, e antes desta guarda o gesto apagava as formas em silêncio.
 */
export const AVISO_CONDICAO_COM_PAGAMENTO =
  'Esta venda já tem forma de pagamento aplicada e cada venda usa uma condição só: use "Limpar" para recomeçar o pagamento.';
/**
 * Só o **TEF** aprovado trava a remoção (correção do usuário, 2026-09-04).
 *
 * A regra anterior — herdada de AD-030/AD-042 — travava TEF **e** PIX com a
 * mesma frase. O usuário corrigiu a premissa: os dois casos não são iguais.
 *
 * - **TEF** continua irremovível. A transação vive no terminal físico, e
 *   removê-la da venda sem cancelá-la lá deixa o Checkout e a operadora
 *   discordando sobre um dinheiro que já saiu do cartão do cliente. O
 *   cancelamento acontece **antes**, no terminal (e, quando a feature 010
 *   existir, pelo endpoint de cancelamento do ERP — ver
 *   `.specs/features/pagamento-tef/spec.md`).
 * - **PIX** passou a ser removível. Não há terminal a sincronizar: a cobrança
 *   vive no banco, o Checkout nunca soube cancelá-la (invariante J5, não existe
 *   endpoint), e travar a forma na venda não desfazia nada — só prendia o
 *   operador numa venda que ele precisava reorganizar. A remoção agora exige
 *   confirmação explícita, que é onde o aviso sobre o banco aparece.
 */
export const AVISO_TEF_IRREVERSIVEL =
  'Cartão aprovado no TEF não pode ser removido: cancele a transação no terminal antes.';
export const AVISO_DESCONTO_COM_PAGAMENTO =
  'Esta venda já tem pagamento aplicado: o desconto não pode mais ser alterado.';
/**
 * As duas recusas do desconto de capa (pedido do usuário, 2026-09-04).
 *
 * Substituem o antigo `AVISO_DESCONTO_ACIMA_DO_SUBTOTAL` ("não pode ser maior
 * que o total"), que descrevia um limite que já não é o vigente: hoje o
 * desconto também não pode **igualar** o total, e a segunda frase cobre o caso
 * que o texto único não sabia nomear — o total da venda continua positivo, mas
 * o rateio zera uma das linhas.
 */
export const AVISO_DESCONTO_ZERA_A_VENDA =
  'O desconto não pode zerar o total da venda: informe um valor menor que o total.';
export const AVISO_DESCONTO_ZERA_ITEM =
  'Este desconto zeraria um item da venda: no rateio, cada item precisa continuar valendo pelo menos R$ 0,01.';

const AVISO_POR_RECUSA_DESCONTO: Record<RecusaDescontoCapa, string> = {
  ZERA_A_VENDA: AVISO_DESCONTO_ZERA_A_VENDA,
  ZERA_UM_ITEM: AVISO_DESCONTO_ZERA_ITEM,
};
export const AVISO_VALE_FORMA_ERRADA =
  'Esta forma de pagamento não é vale devolução: escolha a forma de vale no catálogo.';
export const AVISO_VALE_SEM_CODIGO = 'Informe o código do vale devolução.';
/**
 * Repetição **do mesmo código** na mesma venda. Não é "a venda já tem um vale":
 * dois tickets diferentes são legítimos — o cliente pode ter duas devoluções.
 */
export const AVISO_VALE_JA_APLICADO = 'Este vale devolução já foi aplicado nesta venda.';
export const AVISO_VALE_INDISPONIVEL =
  'Não foi possível validar o vale devolução no ERP: nada foi aplicado.';

const AVISO_POR_MOTIVO_LOCAL = {
  DINHEIRO_DUPLICADO: AVISO_DINHEIRO_DUPLICADO,
  SALDO_JA_COBERTO: AVISO_SALDO_JA_COBERTO,
  VALOR_ACIMA_DO_SALDO: AVISO_VALOR_ACIMA_DO_SALDO,
} as const;

const CENTAVOS_POR_REAL = 100;

const MEIOS_CONHECIDOS = new Set<string>(MEIOS_PAGTO_NFE);

function ehMeioPagtoNfeConhecido(valor: string): valor is MeioPagtoNFe {
  return MEIOS_CONHECIDOS.has(valor);
}

function idAleatorio(): string {
  return crypto.randomUUID();
}

/**
 * Fronteira de saída: centavos inteiros → reais decimais.
 *
 * É o **único** ponto deste arquivo em que um valor monetário deixa de ser
 * inteiro, e o resultado nunca volta para dentro de um cálculo. Mesma fronteira
 * de `montarRetratoVenda.ts`, repetida aqui porque lá ela é privada do módulo —
 * exportá-la só para este uso ampliaria a superfície pública da 004 sem que
 * nenhum outro call site precisasse dela.
 */
function reaisDeCentavos(valor: Centavos): number {
  return valor / CENTAVOS_POR_REAL;
}

/**
 * O criador declara o estado como `VendaState & PagamentoSlice`, e não
 * `VendaState`, apenas porque a composição em `vendaStore.ts` ainda não
 * acrescentou este slice a `VendaState` — assim que ela o fizer, a interseção
 * colapsa para `VendaState` e a assinatura fica **idêntica** à do contrato
 * (`pagamento-domain-api.md` §2). Sem isso, `get().pagamentos` não compilaria
 * hoje, e a alternativa seria um `as` que apagaria justamente a checagem que
 * mantém o slice honesto.
 */
export function criarPagamentoSlice(
  deps: PagamentoDeps,
): StateCreator<VendaState & PagamentoSlice, [['zustand/immer', never]], [], PagamentoSlice> {
  const gerarIdPagamento = deps.gerarIdPagamento ?? idAleatorio;

  return (set, get) => {
    /** Saldo do instante — puro, nunca armazenado (`data-model.md` §2). */
    function saldoAtual(): SaldoPagamento {
      const { descontoCapa, pagamentos } = get();
      return calcularSaldo(
        deps.subtotalCarrinho(),
        descontoCapa?.valorResolvido ?? ZERO_CENTAVOS,
        pagamentos,
      );
    }

    /**
     * Substitui a lista inteira. Mesma escolha do `aplicarLinhas` do carrinho:
     * o array já vem pronto, então a gravação usa a forma de substituição
     * parcial do `set`, não um recipe de rascunho do Immer.
     */
    function aplicarPagamentos(pagamentos: readonly PagamentoAplicado[]): void {
      set({ pagamentos: [...pagamentos] });
    }

    /** A forma do catálogo por trás de um pagamento já aplicado, se ainda houver condição. */
    function formaDoCatalogo(formaCodigo: number): FormaPagamento | undefined {
      return get().condicaoSelecionada?.formas.find((forma) => forma.codigo === formaCodigo);
    }

    /**
     * Rótulo do pagamento na auditoria. Cai no `meioPagtoNFe` quando a forma
     * não está mais no catálogo (pagamento importado de DAV, condição trocada):
     * um evento com rótulo vazio seria pior do que um rótulo técnico.
     */
    function rotuloDoPagamento(pagamento: PagamentoAplicado): string {
      return formaDoCatalogo(pagamento.formaCodigo)?.descricao ?? pagamento.meioPagtoNFe;
    }

    /**
     * Núcleo **único** de aplicação de forma, compartilhado por
     * `aplicarPagamento` (botão da tela) e `aplicarForma` (atalho de cenário da
     * feature 013). A única diferença entre os dois pontos de entrada é o
     * literal de `origem` — duplicar o gate aqui seria criar um segundo caminho
     * capaz de divergir do primeiro em silêncio (achado I1 do
     * `/speckit-analyze` da 014).
     *
     * Ordem obrigatória (`FR-019`/`FR-020`, I11):
     * 1. validações locais **puras** — recusa aqui não consulta o ERP;
     * 2. `await validarInsercao(...)` — recusa ou indisponibilidade encerram
     *    sem mutação, e por isso `iniciarIntegracao` **nunca** é alcançado numa
     *    venda recusada (é o que impede uma cobrança PIX/TEF nascer nela);
     * 3. só então a mutação.
     */
    async function aplicarNucleo(
      forma: FormaPagamento,
      valorInformado: Centavos,
      origem: OrigemAcionamento,
      /**
       * Código do ticket, quando a forma **é** a de vale devolução
       * (`ehFormaDeValeDevolucao`). Entra por aqui, e não por um caminho
       * paralelo, para o vale passar pelas mesmas guardas de qualquer outra
       * forma — `FR-024` inclusive, que é o que impede consumir um ticket de
       * 25,00 numa venda de 10,00 (o ERP baixa `DevValTot` inteiro, não há uso
       * parcial).
       */
      ticketDevolucao: string | null = null,
    ): Promise<boolean> {
      const saldo = saldoAtual();

      // Guarda anterior a toda regra de forma (pedido do usuário, 2026-09-04):
      // uma venda sem valor líquido não recebe pagamento nenhum. Precisa vir
      // antes de `podeAplicarForma`, e não dentro dela: com `totalLiquido` zero
      // o `saldoRestante` também é zero, e a função pura responderia
      // `SALDO_JA_COBERTO` — a frase certa para o desfecho oposto, o da venda
      // integralmente paga.
      //
      // Em tese `recusaDoDescontoCapa` já impede o desconto de zerar a venda;
      // esta guarda cobre o que acontece **depois** dele: itens cancelados
      // derrubam o subtotal sem tocar no desconto já aplicado, e `calcularSaldo`
      // pisa o líquido em zero (AD-150).
      if (saldo.totalLiquido === ZERO_CENTAVOS) {
        deps.avisar?.(AVISO_VENDA_SEM_VALOR);
        return false;
      }

      // `valorInformado` entra na validação (`FR-024`): sem ele a checagem não
      // conseguiria distinguir "cabe no saldo" de "excede", e uma forma sem
      // troco seria truncada em silêncio por `derivarValores`.
      const validacaoLocal = podeAplicarForma(
        forma,
        get().pagamentos,
        saldo.saldoRestante,
        valorInformado,
      );
      if (!validacaoLocal.ok) {
        deps.avisar?.(AVISO_POR_MOTIVO_LOCAL[validacaoLocal.motivo]);
        return false;
      }

      // `derivarValores` roda antes do gate porque é puro e não muta nada: a
      // candidata precisa ser projetada com o valor que **de fato** entraria no
      // payload, senão o ERP validaria um total que a venda nunca teria.
      const { valorAplicado, valorRecebido } = derivarValores(
        forma,
        valorInformado,
        saldo.saldoRestante,
      );

      const candidata: FormaCandidata = {
        formaCodigo: forma.codigo,
        meioPagtoNFe: forma.meioPagtoNFe,
        valor: valorAplicado,
        fpgUtiCar: forma.fpgUtiCar,
        entrada: forma.entrada,
      };

      let veredito: Veredito;
      try {
        veredito = await deps.validarInsercao(candidata, origem);
      } catch {
        // ERP indisponível tem o **mesmo** desfecho de uma recusa: nada muta.
        // Tratar indisponibilidade como aprovação tácita deixaria passar
        // exatamente a venda que o gate existe para barrar (`FR-019`).
        deps.avisar?.(AVISO_VALIDACAO_INDISPONIVEL);
        return false;
      }

      if (!veredito.aceita) {
        deps.avisar?.(veredito.motivo);
        return false;
      }

      const integracao = resolverIntegracao(forma, deps.capacidades());
      const idPagamento = gerarIdPagamento();

      // Cópia congelada do catálogo (`data-model.md` §2, "Regra de fronteira"):
      // o pagamento nunca resolve `meioPagtoNFe`/`integracaoCartao`/`entrada`
      // olhando o catálogo depois — um bootstrap revalidado no meio da venda
      // não pode reclassificar um pagamento já aprovado.
      const pagamento: PagamentoAplicado = {
        idPagamento,
        formaCodigo: forma.codigo,
        meioPagtoNFe: forma.meioPagtoNFe,
        integracaoCartao: forma.integracaoCartao,
        entrada: forma.entrada,
        valorAplicado,
        valorRecebido,
        integracao,
        status: integracao === 'NENHUMA' ? 'APROVADO' : 'PENDENTE_INTEGRACAO',
        dadosTEF: null,
        pixGuid: null,
        ticketDevolucao,
        // Gesto do operador nesta venda: nada foi recebido antes, e "Limpar"
        // sobre esta forma descarta só o que ele acabou de digitar.
        veioDeDocumento: false,
      };

      aplicarPagamentos([...get().pagamentos, pagamento]);

      if (ticketDevolucao !== null) {
        // O vale entra no estado **junto** com o pagamento que ele criou, e não
        // antes: se qualquer guarda acima recusasse, o código ficaria registrado
        // como usado numa venda que nunca o aplicou, e o operador não
        // conseguiria mais informá-lo.
        set({
          valesDevolucao: [
            ...get().valesDevolucao,
            { codigo: ticketDevolucao, valor: valorAplicado, idPagamento },
          ],
        });
        get().registrarEventoAuditoria(
          eventoValeDevolucaoUsado({ codigoVale: ticketDevolucao, valor: valorAplicado }),
        );
      }

      if (integracao !== 'NENHUMA') {
        deps.iniciarIntegracao(integracao, {
          idPagamento,
          formaCodigo: forma.codigo,
          valor: valorAplicado,
        });
        return true;
      }

      // `FORMA_PAGAMENTO_APLICADA` só existe quando o status é `APROVADO`: um
      // pagamento pendente ainda pode ser recusado pela integração, e auditar a
      // aplicação antes disso registraria uma forma que nunca quitou a venda.
      get().registrarEventoAuditoria(
        eventoFormaPagamentoAplicada({ formaPagamento: forma.descricao, valor: valorAplicado }),
      );

      return true;
    }

    return {
      condicaoSelecionada: null,
      pagamentos: [],
      descontoCapa: null,
      valesDevolucao: [],

      selecionarCondicao: (condicao) => {
        const atual = get().condicaoSelecionada;
        // Reselecionar a mesma condição não é troca: não avisa nem duplica o
        // evento de auditoria.
        if (atual !== null && atual.codigo === condicao.codigo) {
          return;
        }

        // I9, reescrita pelo usuário em 2026-09-04: **cada venda tem uma
        // condição só**, e com forma já inserida a condição não muda mais.
        //
        // Antes esta porta *trocava* a condição e esvaziava `pagamentos` e
        // `valesDevolucao` no mesmo `set` — as formas eram de fato **apagadas**
        // do estado (não apenas ocultadas), então nunca chegariam ao ERP; o
        // operador via a lista sumir sem nenhuma explicação e sem gesto que a
        // trouxesse de volta. Um esvaziamento silencioso é o pior desfecho
        // possível para um dado que o caixa acabou de digitar: a alternativa
        // honesta é recusar a troca e dizer por quê.
        //
        // A recusa é no-op com aviso, nunca exceção — mesmo padrão de
        // `carrinhoBloqueado()`. A saída existe e a frase a nomeia: "Limpar"
        // (`descartarPagamento`), que zera condição, formas, desconto e vales de
        // uma vez, com o operador sabendo o que está descartando.
        if (get().pagamentos.length > 0) {
          deps.avisar?.(AVISO_CONDICAO_COM_PAGAMENTO);
          return;
        }

        // Sem pagamento não há o que esvaziar: `valesDevolucao` só existe
        // vinculado a um `idPagamento`, então a lista vazia acima implica esta
        // vazia também. Trocar a condição aqui é só corrigir uma escolha feita
        // antes de começar a cobrar.
        set({ condicaoSelecionada: condicao });

        get().registrarEventoAuditoria(
          eventoCondicaoPagamentoAplicada({ condicao: condicao.descricao }),
        );
      },

      aplicarPagamento: async (input) => {
        await aplicarNucleo(input.forma, input.valorInformado, 'MANUAL');
      },

      aplicarForma: async (codigo, valor) => {
        const forma = formaDoCatalogo(codigo);
        if (forma === undefined) {
          deps.avisar?.(AVISO_FORMA_FORA_DA_CONDICAO);
          return;
        }
        await aplicarNucleo(forma, valor, 'ATALHO_CENARIO');
      },

      confirmarPagamentoIntegrado: (idPagamento, dados) => {
        const alvo = get().pagamentos.find((pagamento) => pagamento.idPagamento === idPagamento);
        // Só `PENDENTE_INTEGRACAO` transiciona: não existe caminho de
        // `APROVADO` para `APROVADO` de novo, nem de `RECUSADO` de volta
        // (`data-model.md` §4).
        if (alvo === undefined || alvo.status !== 'PENDENTE_INTEGRACAO') {
          return;
        }

        const aprovado: PagamentoAplicado = {
          ...alvo,
          status: 'APROVADO',
          dadosTEF: dados.dadosTEF ?? alvo.dadosTEF,
          pixGuid: dados.pixGuid ?? alvo.pixGuid,
        };

        aplicarPagamentos(
          get().pagamentos.map((pagamento) =>
            pagamento.idPagamento === idPagamento ? aprovado : pagamento,
          ),
        );

        get().registrarEventoAuditoria(
          eventoFormaPagamentoAplicada({
            formaPagamento: rotuloDoPagamento(aprovado),
            valor: aprovado.valorAplicado,
          }),
        );
      },

      recusarPagamentoIntegrado: (idPagamento, motivo) => {
        const alvo = get().pagamentos.find((pagamento) => pagamento.idPagamento === idPagamento);
        if (alvo === undefined || alvo.status !== 'PENDENTE_INTEGRACAO') {
          return;
        }

        // `RECUSADO` é terminal e **efêmero** (`data-model.md` §4): o evento
        // preserva o registro na auditoria e o pagamento sai da lista, para que
        // o operador possa tentar outra forma imediatamente.
        aplicarPagamentos(
          get().pagamentos.filter((pagamento) => pagamento.idPagamento !== idPagamento),
        );

        get().registrarEventoAuditoria(
          eventoPagamentoRecusado({ tipo: alvo.meioPagtoNFe, motivo }),
        );
      },

      removerPagamento: (idPagamento) => {
        const alvo = get().pagamentos.find((pagamento) => pagamento.idPagamento === idPagamento);
        // `EXCLUIDO` é terminal: excluir de novo o que já está riscado não tem
        // efeito, nem gera um segundo evento de auditoria.
        if (alvo === undefined || alvo.status === 'EXCLUIDO') {
          return;
        }

        // I6, reescrita pelo usuário em 2026-09-04: **só o TEF** aprovado é
        // irremovível. Ele vive no terminal físico, e tirar a forma da venda sem
        // cancelar lá deixaria o Checkout e a operadora discordando sobre um
        // dinheiro já debitado (Constitution III).
        //
        // O PIX saiu desta guarda de propósito. Removê-lo **não** estorna nada —
        // e nunca estornou: o Checkout não tem endpoint de cancelamento de PIX.
        // Travar a forma aqui não protegia o dinheiro do cliente, só impedia o
        // operador de reorganizar a venda. Quem avisa que a cobrança segue viva
        // no banco é a confirmação da UI, antes de chamar esta action.
        if (alvo.integracao === 'TEF' && alvo.status === 'APROVADO') {
          deps.avisar?.(AVISO_TEF_IRREVERSIVEL);
          return;
        }

        // A forma **fica na lista**, com o status virando `EXCLUIDO` — mesmo
        // tratamento do item cancelado do carrinho (pedido do usuário,
        // 2026-09-04): é rastreabilidade, não apagamento. `calcularSaldo` e
        // `montarPagamentosParaPayload` já só enxergam `APROVADO`, então a forma
        // excluída some do saldo e do envelope ao ERP sem precisar de um
        // segundo filtro aqui — a UI é quem risca a linha.
        aplicarPagamentos(
          get().pagamentos.map((pagamento) =>
            pagamento.idPagamento === idPagamento
              ? { ...pagamento, status: 'EXCLUIDO' as const }
              : pagamento,
          ),
        );

        // O vale sai da lista de aplicados: o ticket não chegou a ser
        // consumido de fato (o ERP só marca `DevTicSit = 3` no faturamento, e a
        // forma excluída não vai ao payload), então o mesmo código pode ser
        // informado de novo nesta venda.
        set({
          valesDevolucao: get().valesDevolucao.filter((vale) => vale.idPagamento !== idPagamento),
        });

        // `FR-021`/I11: o veredito da 014 valia para a venda **daquele**
        // instante. Removida uma forma, a próxima inserção precisa consultar o
        // ERP de novo, mesmo que a candidata seja idêntica à anterior.
        deps.invalidarVeredito();

        get().registrarEventoAuditoria(
          eventoFormaPagamentoRemovida({ formaPagamento: rotuloDoPagamento(alvo) }),
        );
      },

      aplicarDescontoCapa: (modo, entrada) => {
        // Guarda 1 — I12/`FR-023`/AD-113: com pagamento aplicado, o desconto
        // congela junto com carrinho, cliente e vendedor. Alterá-lo aqui mudaria
        // o total líquido de uma venda que já tem dinheiro atribuído a ela.
        if (get().pagamentos.length > 0) {
          deps.avisar?.(AVISO_DESCONTO_COM_PAGAMENTO);
          return false;
        }

        const subtotal = deps.subtotalCarrinho();
        const valorResolvido = resolverDescontoCapa(modo, entrada, subtotal);

        // Guarda 2 — I8, apertada pelo usuário em 2026-09-04: além de manter a
        // pré-condição de `ratearDescontoCapa` (`desconto <= Σ linhas`), o
        // desconto agora não pode zerar nem o total da venda nem o de um item
        // depois do rateio. Quem decide é o domínio; aqui só se traduz a recusa
        // na frase que o operador lê ao sair do campo.
        const recusa = recusaDoDescontoCapa(valorResolvido, subtotal, deps.linhasRateaveis());
        if (recusa !== null) {
          deps.avisar?.(AVISO_POR_RECUSA_DESCONTO[recusa]);
          return false;
        }

        // Substitui, nunca acumula. Sem evento de auditoria: o desconto é
        // auditado pela feature 004 na finalização.
        set({ descontoCapa: { modo, entrada, valorResolvido } });
        return true;
      },

      removerDescontoCapa: () => {
        if (get().pagamentos.length > 0) {
          deps.avisar?.(AVISO_DESCONTO_COM_PAGAMENTO);
          return;
        }
        set({ descontoCapa: null });
      },

      /**
       * Valida o ticket e, se válido, **insere o pagamento** com o valor dele.
       *
       * O vale é uma forma de pagamento como as outras — a que tem
       * `FpgUtiCar = 'VDV'` no cadastro. Por isso o desfecho aqui é uma inserção
       * pelo `aplicarNucleo`, e não um remendo sobre um pagamento existente: o
       * ticket ganha as mesmas guardas de qualquer forma (dinheiro duplicado
       * não se aplica, saldo coberto, `FR-024`, gate da 014) e vai para o
       * payload como `FormasDePagamento[]` com o seu `TicketDevolucao`, que é
       * exatamente o formato que `CheckoutFaturarNFCe` espera.
       *
       * **Ordem das guardas.** Forma errada e código repetido são recusados
       * **sem rede**: `PValidaTicketNFCe` com ação `'validar'` é uma consulta
       * barata, mas perguntar ao ERP sobre um ticket que já está nesta venda não
       * responderia nada de novo — ele só é marcado como usado (`DevTicSit = 3`)
       * na ação `'emitir'`, no faturamento, e até lá `'validar'` devolveria
       * **válido de novo**. Sem esta guarda local o mesmo ticket entraria duas
       * vezes na venda, o ERP baixaria um só, e a nota fecharia com um valor
       * que o cliente nunca pagou (verificado na KB, 2026-09-04).
       */
      aplicarValeDevolucao: async (forma, codigo, confirmarExcedente) => {
        // **Primeira** guarda, antes de qualquer rede (correção da revisão,
        // 2026-09-04): numa venda de líquido zero o excedente calculado adiante
        // é o ticket inteiro, e o fluxo pedia ao operador que confirmasse perder
        // os R$ 25,00 do vale — para então `aplicarNucleo` recusar a inserção
        // por venda sem valor. Confirmar uma perda e receber uma recusa é o pior
        // desfecho possível de uma tela de caixa.
        if (saldoAtual().totalLiquido === ZERO_CENTAVOS) {
          deps.avisar?.(AVISO_VENDA_SEM_VALOR);
          return false;
        }

        if (!ehFormaDeValeDevolucao(forma)) {
          deps.avisar?.(AVISO_VALE_FORMA_ERRADA);
          return false;
        }

        const codigoLimpo = codigo.trim();
        if (codigoLimpo === '') {
          deps.avisar?.(AVISO_VALE_SEM_CODIGO);
          return false;
        }

        if (get().valesDevolucao.some((vale) => vale.codigo === codigoLimpo)) {
          deps.avisar?.(AVISO_VALE_JA_APLICADO);
          return false;
        }

        let resultado: ResultadoTicket;
        try {
          resultado = await deps.validarTicket(codigoLimpo);
        } catch {
          // Mesmo desfecho de `aplicarNucleo`: ERP fora do ar não muta nada e
          // não vira evento — recusa é decisão do ERP, isto aqui é falha técnica.
          deps.avisar?.(AVISO_VALE_INDISPONIVEL);
          return false;
        }

        if (!resultado.valido) {
          // A mensagem exibida é a **do ERP**, não uma reescrita local: só ele
          // distingue "vencido", "ainda não emitido", "já utilizado no documento
          // N" e "inválido" — os quatro desfechos de `PValidaTicketNFCe`.
          deps.avisar?.(resultado.mensagem);
          get().registrarEventoAuditoria(
            eventoPagamentoRecusado({ tipo: forma.meioPagtoNFe, motivo: resultado.mensagem }),
          );
          return false;
        }

        // `FR-026`: o ticket pode valer mais do que falta pagar. Não dá para
        // recusar (o cliente ficaria sem usar o vale) nem para aplicar calado
        // (o excedente **não vira troco** — o ERP baixa `DevValTot` inteiro na
        // ação `'emitir'` e a diferença se perde). O operador decide, com o
        // valor da perda na frente. Recusar a confirmação não consome nada: o
        // ticket só muda de situação no faturamento.
        const excedente = subtrair(resultado.valor, saldoAtual().saldoRestante);
        if (excedente > ZERO_CENTAVOS) {
          const confirmado = await (confirmarExcedente?.({
            valorTicket: resultado.valor,
            saldoRestante: saldoAtual().saldoRestante,
            excedente,
          }) ?? Promise.resolve(false));

          if (!confirmado) {
            return false;
          }
        }

        // O valor é o do ticket, não um valor digitado. `derivarValores` limita
        // `valorAplicado` ao saldo, e é o correto: a nota fecha pelo total dela
        // (`Σ FormaValor` nunca excede), enquanto o ticket é consumido por
        // inteiro no ERP — que é exatamente a perda que a confirmação anunciou.
        return aplicarNucleo(forma, resultado.valor, 'MANUAL', codigoLimpo);
      },

      limparPagamentos: () => {
        // Chamada pela feature 004 **depois** da entrega bem-sucedida, junto com
        // `limparCarrinho` e `descartarAuditoria`.
        set({
          condicaoSelecionada: null,
          pagamentos: [],
          descontoCapa: null,
          valesDevolucao: [],
        });
      },

      descartarPagamento: () => {
        const { condicaoSelecionada, descontoCapa, pagamentos } = get();

        // I6: o mesmo recorte de `removerPagamento` vale para o descarte em
        // bloco — só o TEF aprovado trava, porque só ele tem uma transação viva
        // num terminal que precisa ser cancelada antes. Um PIX na venda não
        // impede o descarte; quem avisa que a cobrança segue no banco é a
        // confirmação que a UI exibe antes de chamar esta action.
        if (
          pagamentos.some(
            (pagamento) => pagamento.integracao === 'TEF' && pagamento.status === 'APROVADO',
          )
        ) {
          deps.avisar?.(AVISO_TEF_IRREVERSIVEL);
          return;
        }

        if (condicaoSelecionada === null && pagamentos.length === 0 && descontoCapa === null) {
          return;
        }

        // Um evento por forma descartada, com o rótulo resolvido **antes** do
        // `set`: depois dele a condição já não existe e `rotuloDoPagamento`
        // cairia no `meioPagtoNFe` técnico. O desconto de capa não gera evento
        // aqui pelo mesmo motivo de `aplicarDescontoCapa` — ele é auditado pela
        // feature 004 na finalização.
        const rotulos = pagamentos.map(rotuloDoPagamento);

        set({
          condicaoSelecionada: null,
          pagamentos: [],
          descontoCapa: null,
          valesDevolucao: [],
        });

        for (const formaPagamento of rotulos) {
          get().registrarEventoAuditoria(eventoFormaPagamentoRemovida({ formaPagamento }));
        }

        // `FR-021`/I11, mesma razão de `removerPagamento`: o veredito da 014
        // valia para a venda daquele instante.
        deps.invalidarVeredito();
      },

      importarFormasDePagamento: (formas) => {
        const importados: PagamentoAplicado[] = [];

        for (const forma of formas) {
          if (!ehMeioPagtoNfeConhecido(forma.formaMeioPagtoNFe)) {
            // Um meio novo cadastrado no ERP descarta **aquela** forma, não a
            // importação inteira: derrubar o DAV por causa de um valor
            // desconhecido deixaria o operador sem nenhum caminho de venda
            // (mesma política de `filtrarFormasValidas`, `data-model.md` §1).
            console.warn(
              `[pagamento] forma de pagamento importada descartada: \`FormaMeioPagtoNFe\` desconhecido (${forma.formaMeioPagtoNFe}).`,
            );
            continue;
          }

          const doCatalogo = formaDoCatalogo(forma.formaCodigo);
          const meioPagtoNFe = forma.formaMeioPagtoNFe;

          importados.push({
            idPagamento: gerarIdPagamento(),
            formaCodigo: forma.formaCodigo,
            meioPagtoNFe,
            integracaoCartao: doCatalogo?.integracaoCartao ?? '',
            entrada: doCatalogo?.entrada ?? '',
            valorAplicado: forma.valor,
            // I3 (`valorRecebido !== null` ⇔ `Dinheiro`) preservada: o documento
            // registra o que quitou, então recebido e aplicado coincidem e o
            // troco derivado é zero — que é o correto para uma venda já fechada.
            valorRecebido: meioPagtoNFe === 'Dinheiro' ? forma.valor : null,
            // Sempre `NENHUMA`/`APROVADO`: o veredito do ERP já está implícito
            // no próprio documento existir, e nenhuma integração é reaberta.
            integracao: 'NENHUMA',
            status: 'APROVADO',
            // O único ponto da base que marca a forma como vinda do documento.
            // É o que permite ao aviso da grid e ao "Limpar" falarem do valor
            // já recebido em vez de tratá-la como cobrança digitada agora.
            veioDeDocumento: true,
            dadosTEF: forma.tef,
            pixGuid: forma.pixGuid,
            ticketDevolucao: forma.ticketDevolucao,
          });
        }

        // Substitui a lista inteira, nunca acumula — e sem `validarInsercao` e
        // sem a checagem de dinheiro único: um DAV pode legitimamente trazer
        // duas formas Dinheiro. Sem evento por forma: a 006 dispara um único
        // `DAV_IMPORTADO` que cobre a importação inteira.
        //
        // **Também sem a guarda de venda sem valor**, e isto é decisão, não
        // esquecimento (revisão de 2026-09-04): esta porta não é gesto do
        // operador, é o replay de um documento que o ERP já emitiu. Recusar as
        // formas de um DAV cujo total ficou zerado deixaria a venda importada
        // pela metade — com os itens dentro e o pagamento fora —, que é pior do
        // que reproduzir fielmente um documento estranho. A guarda vale para o
        // que o operador digita; o que o ERP já registrou entra como está.
        aplicarPagamentos(importados);
      },

      podeMutarCarrinho: () =>
        // I7, ampliada pelo usuário em 2026-09-04: **escolher a condição já
        // congela a venda**, antes de qualquer forma ser aplicada. A condição é
        // o ponto em que o operador declara que terminou de montar a compra e
        // passou a cobrá-la; deixar a grid editável a partir daí permitiria
        // mudar o total por baixo de um pagamento em curso — e a condição é
        // justamente o que o gate da 014 e o rateio do desconto de capa tomam
        // como fixo.
        //
        // Continua valendo a parte anterior: qualquer pagamento **aprovado**
        // congela. `PENDENTE_INTEGRACAO` não congela por si — enquanto a
        // integração não aprovar, nada foi registrado (`FR-004`/`FR-005`) —,
        // mas na prática ele só existe com condição escolhida, que já congelou.
        //
        // O predicado é o mesmo de cliente e identidade da venda (AD-043), de
        // propósito: uma segunda regra de "a venda ainda pode mudar" divergiria
        // em silêncio. A saída é `descartarPagamento()`.
        //
        // **O desconto de capa congela junto** (regra do usuário, 2026-09-04:
        // "se tiver condição, desconto, forma de pagamento, etc, não pode
        // voltar e mudar o carrinho"). Não é só simetria: é o que torna
        // verdadeira a promessa de `recusaDoDescontoCapa`. Aquela guarda valida
        // o rateio contra as linhas **do instante da aplicação**, e
        // `montarPagamentosParaPayload` rateia de novo, na finalização, com as
        // linhas de então — sem revalidar. Com o carrinho livre no meio, um
        // desconto aceito sobre duas linhas de R$ 100,00 sobrevivia à redução
        // de uma delas para R$ 10,00 e o clamp a zerava no cupom; pior, um
        // desconto maior que a soma restante fazia `ratearDescontoCapa`
        // **lançar** dentro da finalização, depois de o evento terminal já ter
        // sido registrado. Congelar o carrinho enquanto há desconto elimina as
        // duas transições — a pré-condição daquela função passa a ser
        // invariante, não coincidência.
        get().condicaoSelecionada === null &&
        get().descontoCapa === null &&
        !get().pagamentos.some((pagamento) => pagamento.status === 'APROVADO'),

      saldo: saldoAtual,

      montarPagamentosParaPayload: () => {
        const { condicaoSelecionada, descontoCapa, pagamentos } = get();

        const formasDePagamento = pagamentos
          // Só `APROVADO` entra: pendente e recusado nunca são registrados
          // (`erp-pagamento-api.md` §3).
          .filter((pagamento) => pagamento.status === 'APROVADO')
          .map((pagamento): FormaDePagamentoRetrato => {
            const forma: Record<string, unknown> = {
              FormaCodigo: pagamento.formaCodigo,
              FormaMeioPagtoNFe: pagamento.meioPagtoNFe,
              // Fronteira de saída: o ERP recebe `double` em reais, não
              // centavos. `Σ FormaValor` é exatamente o total líquido — o troco
              // não tem campo no contrato e **nunca** aparece aqui
              // (`research.md` D3).
              FormaValor: reaisDeCentavos(pagamento.valorAplicado),
              FormaIntegracaoCartao: pagamento.integracaoCartao,
              // `FR-022`/AD-111: sem `FormaEntrada` o ERP calcula crediário zero.
              FormaEntrada: pagamento.entrada,
              // O campo é por-forma no contrato, não por-venda; string vazia
              // quando não há vale vinculado a esta forma.
              TicketDevolucao: pagamento.ticketDevolucao ?? '',
            };

            if (pagamento.dadosTEF !== null) {
              forma.TEFidentificacao = pagamento.dadosTEF.identificacao;
              forma.TEFCNPJ = pagamento.dadosTEF.cnpj;
              forma.TEFBandeira = pagamento.dadosTEF.bandeira;
              forma.TEFNumeroAutorizacao = pagamento.dadosTEF.numeroAutorizacao;
              forma.TEFTipoIntegracao = pagamento.dadosTEF.tipoIntegracao;
            }
            if (pagamento.pixGuid !== null) {
              forma.FormaPixGUID = pagamento.pixGuid;
            }

            return forma;
          });

        return {
          // `0` quando não há condição: o contrato exige o escalar, e um
          // `undefined` viraria ausência de campo no corpo da requisição.
          CondicaoPagamentoCodigo: condicaoSelecionada?.codigo ?? 0,
          FormasDePagamento: formasDePagamento,
          // O rateio é calculado **na montagem**, nunca guardado no estado: ele
          // depende das linhas ativas do carrinho, que mudam sem que o desconto
          // de capa mude (`data-model.md` §5).
          rateioDescontoCapa: ratearDescontoCapa(
            descontoCapa?.valorResolvido ?? ZERO_CENTAVOS,
            deps.linhasRateaveis(),
          ),
        };
      },
    };
  };
}
