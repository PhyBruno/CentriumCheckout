/**
 * Catálogo de eventos de auditoria da venda (feature 001).
 *
 * Domínio puro: nenhuma dependência de React, Zustand ou rede — só a união
 * discriminada dos 20 tipos de evento (`data-model.md`) e uma factory tipada
 * por tipo, para que nenhuma feature consumidora precise montar o objeto
 * literal solto em cada call site (`contracts/auditoria-events.md`).
 *
 * Este módulo **não** conhece regra de negócio de cliente/vendedor/produto/
 * pagamento (Constitution II): recebe `detalhes` já normalizados pela feature
 * de origem e não recalcula nem arredonda valor monetário — todo campo de
 * dinheiro chega e sai em centavos inteiros (Constitution V).
 */

/** Origem da sessão de venda que inaugura o histórico (FR-002). */
export type OrigemVenda = 'NOVA' | 'RASCUNHO' | 'DAV';

/** Operação de `FaturarNFCe` que falhou (`SuspenderOuFaturar`). */
export type OperacaoFaturamento = 'FATURAR' | 'SUSPENDER';

/** Como o operador chegou à validação prévia recusada (feature 014). */
export type OrigemValidacaoVenda = 'MANUAL' | 'ATALHO_CENARIO';

/** Tecla de cenário de venda rápida (feature 013). */
export type TeclaVendaRapida = 'F6' | 'F7' | 'F8' | 'F9';

/**
 * Forma canônica de todo evento. `timestamp` é atribuído pelo slice no momento
 * do `push`, nunca pelo call site — ver `EventoAuditoriaSemTimestamp`.
 */
export interface EventoAuditoriaBase<TTipo extends string, TDetalhes> {
  readonly tipo: TTipo;
  /** ISO 8601 UTC com milissegundos, `new Date().toISOString()` (research.md #2). */
  readonly timestamp: string;
  readonly detalhes: TDetalhes;
}

/** Eventos sem campo em `detalhes` — objeto vazio de verdade, não `{}`. */
type SemDetalhes = Record<string, never>;

/* ------------------------------------------------------------------ *
 * 1. Início de sessão (esta feature)
 * ------------------------------------------------------------------ */

export type EventoVendaIniciada = EventoAuditoriaBase<
  'VENDA_INICIADA',
  { readonly origem: OrigemVenda }
>;

/* ------------------------------------------------------------------ *
 * 2–6. Cliente e vendedor (features 005 e 012)
 * ------------------------------------------------------------------ */

export type EventoClienteSelecionado = EventoAuditoriaBase<
  'CLIENTE_SELECIONADO',
  { readonly codigoCliente: number; readonly nome: string }
>;

export type EventoClienteCriado = EventoAuditoriaBase<
  'CLIENTE_CRIADO',
  { readonly codigoCliente: number; readonly nome: string }
>;

export type EventoClienteTrocado = EventoAuditoriaBase<
  'CLIENTE_TROCADO',
  { readonly codigoClienteAnterior: number; readonly codigoClienteNovo: number }
>;

export type EventoVendedorSelecionado = EventoAuditoriaBase<
  'VENDEDOR_SELECIONADO',
  { readonly codigoVendedor: number; readonly nome: string }
>;

export type EventoVendedorTrocado = EventoAuditoriaBase<
  'VENDEDOR_TROCADO',
  { readonly codigoVendedorAnterior: number; readonly codigoVendedorNovo: number }
>;

/* ------------------------------------------------------------------ *
 * 7–9. Produto (feature 003)
 * ------------------------------------------------------------------ */

export type EventoProdutoInserido = EventoAuditoriaBase<
  'PRODUTO_INSERIDO',
  {
    readonly codigoProduto: string;
    readonly quantidade: number;
    /** Base **unitária**, em centavos inteiros. */
    readonly precoUnitario: number;
    /** Absoluto e referente ao **total da linha**, não por unidade; centavos inteiros. */
    readonly desconto: number;
  }
>;

export type EventoProdutoAlterado = EventoAuditoriaBase<
  'PRODUTO_ALTERADO',
  {
    readonly codigoProduto: string;
    readonly campo: string;
    readonly valorAnterior: unknown;
    readonly valorNovo: unknown;
  }
>;

export type EventoProdutoCancelado = EventoAuditoriaBase<
  'PRODUTO_CANCELADO',
  { readonly codigoProduto: string }
>;

/* ------------------------------------------------------------------ *
 * 10–14. Pagamento (features 008, 009 e 010)
 * ------------------------------------------------------------------ */

export type EventoCondicaoPagamentoAplicada = EventoAuditoriaBase<
  'CONDICAO_PAGAMENTO_APLICADA',
  { readonly condicao: string }
>;

export type EventoFormaPagamentoAplicada = EventoAuditoriaBase<
  'FORMA_PAGAMENTO_APLICADA',
  { readonly formaPagamento: string; /** Centavos inteiros. */ readonly valor: number }
>;

export type EventoFormaPagamentoRemovida = EventoAuditoriaBase<
  'FORMA_PAGAMENTO_REMOVIDA',
  { readonly formaPagamento: string }
>;

export type EventoValeDevolucaoUsado = EventoAuditoriaBase<
  'VALE_DEVOLUCAO_USADO',
  { readonly codigoVale: string; /** Centavos inteiros. */ readonly valor: number }
>;

/**
 * Recusa da **própria forma de pagamento** (FR-003) — distinta da recusa da
 * validação prévia, que é `VALIDACAO_VENDA_RECUSADA` (FR-010).
 *
 * O `tipo` dentro de `detalhes` é o tipo do pagamento recusado (PIX, TEF, …),
 * não o discriminante do evento.
 */
export type EventoPagamentoRecusado = EventoAuditoriaBase<
  'PAGAMENTO_RECUSADO',
  { readonly tipo: string; readonly motivo?: string }
>;

/* ------------------------------------------------------------------ *
 * 15–17. Finalização e suspensão (feature 004)
 * ------------------------------------------------------------------ */

export type EventoFaturamentoFalhou = EventoAuditoriaBase<
  'FATURAMENTO_FALHOU',
  { readonly operacao: OperacaoFaturamento }
>;

export type EventoVendaFinalizada = EventoAuditoriaBase<'VENDA_FINALIZADA', SemDetalhes>;

export type EventoVendaSuspensa = EventoAuditoriaBase<'VENDA_SUSPENSA', SemDetalhes>;

/* ------------------------------------------------------------------ *
 * 18–20. Validação prévia, venda rápida e importação de DAV (014, 013, 006)
 * ------------------------------------------------------------------ */

/**
 * Recusa da validação prévia da venda, por regra de negócio **ou** por
 * indisponibilidade do ERP (FR-010). Avisos (`Valido = true` com mensagem)
 * não são registrados (AD-113).
 */
export type EventoValidacaoVendaRecusada = EventoAuditoriaBase<
  'VALIDACAO_VENDA_RECUSADA',
  {
    readonly origem: OrigemValidacaoVenda;
    readonly condicao: string;
    readonly formaPagamento: string;
    readonly motivo: string;
  }
>;

/**
 * Um evento por acionamento que **alterou** a venda; acionamento recusado nos
 * guards G1–G4 da feature 013 não gera evento (I12 daquela feature).
 */
export type EventoVendaRapidaAcionada = EventoAuditoriaBase<
  'VENDA_RAPIDA_ACIONADA',
  {
    readonly tecla: TeclaVendaRapida;
    readonly cenarioNome: string;
    readonly condicaoCodigo: number;
    readonly formaCodigo: number;
    /** Centavos inteiros. */
    readonly valorLancado: number;
    readonly finalizacaoAutomatica: boolean;
  }
>;

/**
 * Disparado uma única vez ao final de `importarVendaExistente`, depois que
 * carrinho/cliente/vendedor/pagamento já foram populados (AD-114). `numeroDav`
 * só existe nesta trilha — não é reenviado a `FaturarNFCe` (AD-107).
 */
export type EventoDavImportado = EventoAuditoriaBase<
  'DAV_IMPORTADO',
  {
    readonly numeroDav: string;
    readonly numeroNota: number;
    readonly quantidadeLinhas: number;
    readonly quantidadeFormasDePagamento: number;
  }
>;

/**
 * Retomada de um rascunho de NFCe suspenso (feature 011, AD-166).
 *
 * Irmão de `DAV_IMPORTADO`, e **não** o mesmo evento: os dois entram pela mesma
 * orquestração, mas registram gestos distintos — um traz um orçamento que ainda
 * não é venda, o outro devolve ao caixa uma venda que já existiu e foi
 * suspensa. Um evento só, distinguido por um campo, deixaria a leitura da
 * trilha depender de inspecionar `detalhes`.
 *
 * Não há `numeroDav` correspondente: o rascunho **é** identificado pelo próprio
 * `numeroNota`, que também é o elo reenviado a `FaturarNFCe` (`NFCE-02`).
 * `serie` acompanha porque `CarregarNFCe` só resolve o par número+série
 * (`research.md` D4) — sozinho, o número não identifica o documento.
 */
export type EventoNFCeRecuperada = EventoAuditoriaBase<
  'NFCE_RECUPERADA',
  {
    readonly numeroNota: number;
    readonly serie: string;
    readonly quantidadeLinhas: number;
    readonly quantidadeFormasDePagamento: number;
  }
>;

/* ------------------------------------------------------------------ *
 * União e histórico
 * ------------------------------------------------------------------ */

/** União discriminada por `tipo` dos 21 eventos do catálogo (`data-model.md`). */
export type EventoAuditoria =
  | EventoVendaIniciada
  | EventoClienteSelecionado
  | EventoClienteCriado
  | EventoClienteTrocado
  | EventoVendedorSelecionado
  | EventoVendedorTrocado
  | EventoProdutoInserido
  | EventoProdutoAlterado
  | EventoProdutoCancelado
  | EventoCondicaoPagamentoAplicada
  | EventoFormaPagamentoAplicada
  | EventoFormaPagamentoRemovida
  | EventoValeDevolucaoUsado
  | EventoPagamentoRecusado
  | EventoFaturamentoFalhou
  | EventoVendaFinalizada
  | EventoVendaSuspensa
  | EventoValidacaoVendaRecusada
  | EventoVendaRapidaAcionada
  | EventoDavImportado
  | EventoNFCeRecuperada;

/** Todo `tipo` do catálogo, para exaustividade em testes e consumidores. */
export type TipoEventoAuditoria = EventoAuditoria['tipo'];

/**
 * `Omit` **distributivo**: aplicado direto sobre a união, `Omit` colapsaria os
 * 20 membros num único objeto com as chaves comuns e perderia a discriminação
 * por `tipo` — o call site conseguiria passar `detalhes` de um tipo com o
 * `tipo` de outro. Distribuindo, cada membro perde só o seu `timestamp`.
 */
type SemTimestamp<T> = T extends unknown ? Omit<T, 'timestamp'> : never;

/**
 * O que o call site entrega ao dispatcher: o slice é quem atribui `timestamp`
 * no `push`, garantindo que a ordem do array acompanhe a ordem real dos
 * eventos mesmo se o call site atrasar (`contracts/auditoria-events.md`).
 */
export type EventoAuditoriaSemTimestamp = SemTimestamp<EventoAuditoria>;

/**
 * O que o dispatcher (`registrarEventoAuditoria`) aceita — `EventoAuditoriaSemTimestamp`
 * **menos** `VENDA_INICIADA`.
 *
 * `VENDA_INICIADA` é privativo de `resetarAuditoria`: é o único evento que
 * precisa **zerar** o histórico antes de entrar (FR-002 — início/retomada é o
 * primeiro evento da sessão). Se `VENDA_INICIADA` pudesse passar por
 * `registrarEventoAuditoria`, qualquer uma das features consumidoras poderia
 * empilhá-lo no meio de uma venda em andamento sem zerar o array, violando
 * FR-002 em silêncio — sem exceção, sem tela de revisão (FR-009), sem chance
 * de detecção antes da auditoria fiscal. Excluir o membro em tempo de
 * compilação fecha esse call site errado antes que ele exista.
 *
 * `Exclude` distribui sobre a união (mesma lógica de `SemTimestamp` acima):
 * cada um dos 20 membros de `EventoAuditoriaSemTimestamp` é testado
 * isoladamente contra `{ tipo: 'VENDA_INICIADA' }`, então o resultado continua
 * uma união discriminada por `tipo` — com 19 membros, não um objeto colapsado.
 */
export type EventoAuditoriaRegistravel = Exclude<
  EventoAuditoriaSemTimestamp,
  { tipo: 'VENDA_INICIADA' }
>;

/**
 * Coleção ordenada dos eventos de **uma única** sessão de venda. Sem
 * identificador próprio: é um campo do slice `auditoria`, nunca uma entidade
 * persistida (Constitution VI).
 */
export type HistoricoAuditoriaVenda = EventoAuditoria[];

/* ------------------------------------------------------------------ *
 * Factory functions (uma por tipo)
 * ------------------------------------------------------------------ */

/**
 * Só `resetarAuditoria` deve chamar esta factory. `VENDA_INICIADA` não faz
 * parte de `EventoAuditoriaRegistravel` — não é aceito por
 * `registrarEventoAuditoria` — porque é o evento que zera o histórico, não um
 * evento que se acumula nele (ver TSDoc de `EventoAuditoriaRegistravel`).
 * Continua exportada porque alguma feature de bootstrap pode precisar do tipo
 * `EventoVendaIniciada`/`OrigemVenda`, não para ser passada ao dispatcher.
 */
export function eventoVendaIniciada(
  detalhes: EventoVendaIniciada['detalhes'],
): SemTimestamp<EventoVendaIniciada> {
  return { tipo: 'VENDA_INICIADA', detalhes };
}

export function eventoClienteSelecionado(
  detalhes: EventoClienteSelecionado['detalhes'],
): SemTimestamp<EventoClienteSelecionado> {
  return { tipo: 'CLIENTE_SELECIONADO', detalhes };
}

export function eventoClienteCriado(
  detalhes: EventoClienteCriado['detalhes'],
): SemTimestamp<EventoClienteCriado> {
  return { tipo: 'CLIENTE_CRIADO', detalhes };
}

export function eventoClienteTrocado(
  detalhes: EventoClienteTrocado['detalhes'],
): SemTimestamp<EventoClienteTrocado> {
  return { tipo: 'CLIENTE_TROCADO', detalhes };
}

export function eventoVendedorSelecionado(
  detalhes: EventoVendedorSelecionado['detalhes'],
): SemTimestamp<EventoVendedorSelecionado> {
  return { tipo: 'VENDEDOR_SELECIONADO', detalhes };
}

export function eventoVendedorTrocado(
  detalhes: EventoVendedorTrocado['detalhes'],
): SemTimestamp<EventoVendedorTrocado> {
  return { tipo: 'VENDEDOR_TROCADO', detalhes };
}

export function eventoProdutoInserido(
  detalhes: EventoProdutoInserido['detalhes'],
): SemTimestamp<EventoProdutoInserido> {
  return { tipo: 'PRODUTO_INSERIDO', detalhes };
}

export function eventoProdutoAlterado(
  detalhes: EventoProdutoAlterado['detalhes'],
): SemTimestamp<EventoProdutoAlterado> {
  return { tipo: 'PRODUTO_ALTERADO', detalhes };
}

export function eventoProdutoCancelado(
  detalhes: EventoProdutoCancelado['detalhes'],
): SemTimestamp<EventoProdutoCancelado> {
  return { tipo: 'PRODUTO_CANCELADO', detalhes };
}

export function eventoCondicaoPagamentoAplicada(
  detalhes: EventoCondicaoPagamentoAplicada['detalhes'],
): SemTimestamp<EventoCondicaoPagamentoAplicada> {
  return { tipo: 'CONDICAO_PAGAMENTO_APLICADA', detalhes };
}

export function eventoFormaPagamentoAplicada(
  detalhes: EventoFormaPagamentoAplicada['detalhes'],
): SemTimestamp<EventoFormaPagamentoAplicada> {
  return { tipo: 'FORMA_PAGAMENTO_APLICADA', detalhes };
}

export function eventoFormaPagamentoRemovida(
  detalhes: EventoFormaPagamentoRemovida['detalhes'],
): SemTimestamp<EventoFormaPagamentoRemovida> {
  return { tipo: 'FORMA_PAGAMENTO_REMOVIDA', detalhes };
}

export function eventoValeDevolucaoUsado(
  detalhes: EventoValeDevolucaoUsado['detalhes'],
): SemTimestamp<EventoValeDevolucaoUsado> {
  return { tipo: 'VALE_DEVOLUCAO_USADO', detalhes };
}

export function eventoPagamentoRecusado(
  detalhes: EventoPagamentoRecusado['detalhes'],
): SemTimestamp<EventoPagamentoRecusado> {
  return { tipo: 'PAGAMENTO_RECUSADO', detalhes };
}

export function eventoFaturamentoFalhou(
  detalhes: EventoFaturamentoFalhou['detalhes'],
): SemTimestamp<EventoFaturamentoFalhou> {
  return { tipo: 'FATURAMENTO_FALHOU', detalhes };
}

export function eventoVendaFinalizada(): SemTimestamp<EventoVendaFinalizada> {
  return { tipo: 'VENDA_FINALIZADA', detalhes: {} };
}

export function eventoVendaSuspensa(): SemTimestamp<EventoVendaSuspensa> {
  return { tipo: 'VENDA_SUSPENSA', detalhes: {} };
}

export function eventoValidacaoVendaRecusada(
  detalhes: EventoValidacaoVendaRecusada['detalhes'],
): SemTimestamp<EventoValidacaoVendaRecusada> {
  return { tipo: 'VALIDACAO_VENDA_RECUSADA', detalhes };
}

export function eventoVendaRapidaAcionada(
  detalhes: EventoVendaRapidaAcionada['detalhes'],
): SemTimestamp<EventoVendaRapidaAcionada> {
  return { tipo: 'VENDA_RAPIDA_ACIONADA', detalhes };
}

export function eventoDavImportado(
  detalhes: EventoDavImportado['detalhes'],
): SemTimestamp<EventoDavImportado> {
  return { tipo: 'DAV_IMPORTADO', detalhes };
}

export function eventoNFCeRecuperada(
  detalhes: EventoNFCeRecuperada['detalhes'],
): SemTimestamp<EventoNFCeRecuperada> {
  return { tipo: 'NFCE_RECUPERADA', detalhes };
}
