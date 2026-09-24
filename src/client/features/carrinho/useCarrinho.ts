import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { notificar } from '@/lib/notificar';
import type { MotivoBloqueio } from '@/lib/bloqueio';
import { motivoCarrinhoBloqueado } from '../../stores/slices/carrinhoSlice';
import {
  ErroPrecoIndisponivelParaPesagem,
  interpretarEntradaCodigo,
  quantidadePesavel,
  TIPO_COD_PRODUTO,
  type EntradaCodigo,
} from '../../domain/precificacao/codigoProduto';
import {
  AVALIACAO_LIVRE,
  avaliarSaldo,
  normalizarPoliticaSaldo,
  quantidadeDoProdutoNoCarrinho,
  type AvaliacaoSaldo,
  type PoliticaSaldo,
  type SaldoMilesimos,
} from '../../domain/estoque/saldoProduto';
import type { Centavos } from '../../domain/precificacao/dinheiro';
import type {
  LinhaCarrinho,
  OrigemLinha,
  SnapshotPrecoProduto,
} from '../../domain/precificacao/linha';
import { milesimosDeUnidades, type Milesimos } from '../../domain/precificacao/quantidade';
import { ErroProdutoSemPreco, exigirPrecoDeInsercao } from '../../domain/precificacao/tabelaPreco';
import type { ResolucaoProduto } from '../../services/produto/produtoMapper';
import {
  ErroProdutoNaoEncontrado,
  ErroRespostaInvalida,
  consultarSaldoProduto,
  invalidarCacheDeProduto,
  opcoesProduto,
  type ContextoPrecificacao,
} from '../../services/produto/produtoQueries';
import { useSessionStore } from '../../stores/sessionStore';
import { useVendaStore } from '../../stores/vendaStore';

/**
 * Orquestração de inserção de produto, compartilhada pelos dois caminhos de
 * entrada — modal de busca (US1) e código direto (US2).
 *
 * Fica num hook, e não em cada componente, porque a decisão de fluxo por
 * `ProdutoPesavelEditavel` (`research.md` D7) é a mesma nos dois: duplicá-la
 * criaria dois caminhos de inserção com semânticas divergentes, exatamente o
 * que AD-091 rejeitou.
 */

/** `TipoPreco` em que a lista de preço do cliente entra na chamada (AD-092). */
const TIPO_PRECO_POR_LISTA = 9;

const QUANTIDADE_PADRAO = 1;

/**
 * Contexto de precificação da sessão + cliente atual.
 *
 * `Codcliente`/`Listapreco` saem do cliente da venda quando há um (feature
 * 005) — inclusive o default, que já nasce pré-selecionado na abertura da venda
 * com `ListaPrecoDefault` e sem `GetCliente` (AD-032, AD-108).
 *
 * Sem cliente algum — empresa que não configurou default (`FR-005`) e nada
 * escolhido ainda — vale o que o bootstrap publica, que é o mesmo valor que a
 * feature 003 já enviava. Não é fallback inventado: `ClienteDefaultCodigo` é o
 * campo do contrato, e `0` ali significa "não configurado" para o próprio ERP.
 * Bloquear a inserção nesse caso violaria `FR-003` — identificar cliente e
 * inserir produto são ações independentes, sem sequência obrigatória.
 */
export function useContextoPrecificacao(): ContextoPrecificacao | null {
  const registro = useSessionStore((estado) => estado.registro);
  const cliente = useVendaStore((estado) => estado.clienteAtual);
  if (registro === null) {
    return null;
  }

  const sessao = registro.SessaoUsuario;
  const listaPreco = cliente === null ? sessao.ListaPrecoDefault : cliente.listaPreco;

  return {
    tipoCodProduto: sessao.UsuarioTipoCodigoProduto,
    tipoPreco: sessao.TipoPreco,
    codigoCliente: cliente?.codigoCliente ?? sessao.ClienteDefaultCodigo,
    listaPreco: sessao.TipoPreco === TIPO_PRECO_POR_LISTA ? listaPreco : null,
  };
}

/** Piso de caracteres para a busca — vem do ERP, nunca hardcoded (AD-024). */
export function useQtdMinCharParaConsulta(): number | null {
  return useSessionStore((estado) => estado.registro?.SessaoUsuario.QtdMinCharParaConsulta ?? null);
}

/**
 * `SessaoUsuario.UsuarioTipoCodigoProduto` para a UI (AD-204).
 *
 * O modal de busca precisa dele para saber **qual** dos códigos do candidato
 * devolver à barra de entrada (`codigoParaConsulta`) — mandar o campo errado faz
 * o ERP responder com o SDT vazio. `null` enquanto o bootstrap não chegou; o
 * modal só é alcançável com a tela de venda liberada, então na prática isso é a
 * janela entre montar e hidratar.
 */
export function useTipoCodigoProduto(): string | null {
  return useSessionStore(
    (estado) => estado.registro?.SessaoUsuario.UsuarioTipoCodigoProduto ?? null,
  );
}

/**
 * `SessaoUsuario.FaturaProdutoSemSaldo` normalizada (AD-236). Sem bootstrap, ou
 * com o ERP anterior ao contrato de 2026-09-14, vale `''` — não valida.
 */
export function usePoliticaSaldo(): PoliticaSaldo {
  return useSessionStore((estado) =>
    normalizarPoliticaSaldo(estado.registro?.SessaoUsuario.FaturaProdutoSemSaldo),
  );
}

/** O que a regra de saldo precisa saber de uma inserção ou edição proposta. */
export interface PropostaDeQuantidade {
  readonly snapshot: SnapshotPrecoProduto;
  readonly saldo: SaldoMilesimos | null;
  readonly quantidade: Milesimos;
  /** Presente na edição pelo lápis: sai da soma e marca o que é redução. */
  readonly linhaEditada?: LinhaCarrinho;
}

/**
 * Avalia a proposta contra o carrinho **atual** (AD-236).
 *
 * Função, e não hook, porque é chamada nos dois momentos: na renderização da
 * barra (com as linhas do seletor) e dentro das confirmações assíncronas (com
 * `getState()`, que não envelhece entre o clique e a resposta do ERP).
 */
export function avaliarContraCarrinho(
  politica: PoliticaSaldo,
  linhas: readonly LinhaCarrinho[],
  proposta: PropostaDeQuantidade,
): AvaliacaoSaldo {
  if (politica === '') {
    return AVALIACAO_LIVRE;
  }
  return avaliarSaldo({
    politica,
    saldo: proposta.saldo,
    quantidadeNoCarrinho: quantidadeDoProdutoNoCarrinho(
      linhas,
      proposta.snapshot.codigoProduto,
      proposta.linhaEditada?.idLinha,
    ),
    quantidadeProposta: proposta.quantidade,
    ...(proposta.linhaEditada === undefined
      ? {}
      : { quantidadeAnterior: proposta.linhaEditada.quantidade }),
    descricao: proposta.snapshot.descricao,
  });
}

/** Aviso (`'A'`, ou redução em `'B'`) e bloqueio viram toast; livre, nada. */
function comunicarSaldo(avaliacao: AvaliacaoSaldo): void {
  if (avaliacao.veredito === 'aviso') {
    notificar.aviso(avaliacao.frase);
  } else if (avaliacao.veredito === 'bloqueio') {
    notificar.erro(avaliacao.frase);
  }
}

/**
 * Saldo fresco para uma decisão (AD-236): reconsulta sempre, e na falha usa o
 * **último saldo conhecido** e segue.
 *
 * Qualquer falha cai no último conhecido — não só a de rede — porque o ERP
 * revalida o saldo no `FaturarNFCe` (`PNFCe_ValidaSaldoProdutos`): o Checkout
 * é a primeira barreira, não a única, e travar a venda porque a segunda
 * consulta do mesmo produto falhou seria pior que deixar o ERP decidir.
 */
async function saldoFresco(
  contexto: ContextoPrecificacao | null,
  codigoProduto: string,
  ultimoConhecido: SaldoMilesimos | null,
): Promise<SaldoMilesimos | null> {
  if (contexto === null) {
    return ultimoConhecido;
  }
  try {
    return await consultarSaldoProduto(codigoProduto, contexto);
  } catch {
    return ultimoConhecido;
  }
}

/** O produto exige revisão do operador antes de entrar na venda (`FR-014`). */
export interface PendenteDeEdicao {
  readonly situacao: 'edicao';
  readonly snapshot: SnapshotPrecoProduto;
  readonly quantidade: Milesimos;
  /** Saldo consultado na resolução (AD-236); `null` se desconhecido. */
  readonly saldo: SaldoMilesimos | null;
}

/**
 * A inserção automática (Enter, leitor, câmera) esbarrou no saldo em `'B'`
 * (AD-236): nada entrou, e o produto volta como prévia para a barra mostrar
 * bloqueada, com o motivo.
 */
export interface BloqueadoPorSaldo {
  readonly situacao: 'bloqueado';
  readonly revisao: RevisaoProduto;
}

export type ResultadoInsercao =
  | { readonly situacao: 'inserido' }
  | { readonly situacao: 'recusado' }
  | PendenteDeEdicao
  | BloqueadoPorSaldo;

/**
 * Desfecho de uma confirmação (prévia, edição de produto `'E'` ou lápis).
 *
 * `bloqueado` traz o saldo usado na decisão, para a barra reavaliar o `+`/`−`
 * com ele em vez do saldo antigo.
 */
export type ResultadoConfirmacao =
  | { readonly situacao: 'confirmado' }
  | { readonly situacao: 'bloqueado'; readonly saldo: SaldoMilesimos | null };

/**
 * Produto resolvido para revisão sob demanda (TAB no campo de código, barra de
 * entrada rápida) — nunca insere sozinho, ao contrário de `inserirPorCodigo`.
 * `editavel` espelha `ProdutoPesavelEditavel = 'E'` e decide, no componente, se
 * preço/desconto podem ser ajustados (`EdicaoItemEditavel`) ou só a quantidade
 * (`PreviaInsercaoProduto`).
 */
export interface RevisaoProduto {
  readonly situacao: 'revisao';
  readonly snapshot: SnapshotPrecoProduto;
  readonly quantidade: Milesimos;
  readonly origem: OrigemInsercaoViva;
  readonly editavel: boolean;
  /** Saldo consultado na resolução (AD-236); `null` se desconhecido. */
  readonly saldo: SaldoMilesimos | null;
  /**
   * Avaliação do saldo para `quantidade`, no momento da resolução — **ainda
   * não comunicada** (correção do usuário, 2026-09-17): quem decide se ela vira
   * toast é a barra, porque só ela sabe se o produto entra agora ou abre uma
   * prévia cuja quantidade o operador ainda vai revisar.
   */
  readonly avaliacaoSaldo: AvaliacaoSaldo;
}

export type ResultadoRevisao = RevisaoProduto | { readonly situacao: 'recusado' };

/**
 * Origens que este caminho de inserção pode produzir — nunca as congeladas
 * (`'RASCUNHO'`/`'DAV'`, `InserirItemInput` em `carrinhoSlice.ts`), que exigem
 * `precoUnitario` obrigatório e entram por um caminho dedicado ainda não
 * implementado (retomada de rascunho da feature 004, importação de DAV da
 * feature 006) — nunca por `useInsercaoDeProduto`.
 */
type OrigemInsercaoViva = Exclude<OrigemLinha, 'RASCUNHO' | 'DAV'>;

export interface OpcoesInsercao {
  readonly origem?: OrigemInsercaoViva;
  readonly quantidade?: Milesimos;
}

function mensagemDeErro(erro: unknown): string {
  if (erro instanceof ErroProdutoNaoEncontrado) {
    return `Produto ${erro.codigoProduto} não encontrado.`;
  }
  if (erro instanceof ErroRespostaInvalida) {
    return 'O ERP devolveu um produto em formato inesperado. Nada foi inserido.';
  }
  if (erro instanceof ErroPrecoIndisponivelParaPesagem) {
    return 'Produto pesável sem preço cadastrado no ERP. Nada foi inserido.';
  }
  if (erro instanceof ErroProdutoSemPreco) {
    return `Produto ${erro.codigoProduto} está sem preço de venda no ERP. Nada foi inserido.`;
  }
  return 'Não foi possível consultar o produto. Tente novamente.';
}

/** Com o que consultar `GetProduto`; `tipoCodigo` ausente vale o da sessão. */
interface ConsultaDaEntrada {
  readonly codigo: string;
  readonly tipoCodigo: string | undefined;
}

/**
 * A etiqueta de balança carrega o `MatCodRed`, então é consultada sempre como
 * `'R'`, qualquer que seja o tipo configurado na sessão (AD-252) — num tenant em
 * `'B'` o reduzido não casaria com `MatCodBar`.
 */
function consultaDaEntrada(entrada: EntradaCodigo): ConsultaDaEntrada {
  if (entrada.tipo === 'BALANCA') {
    return { codigo: entrada.codigoReduzido, tipoCodigo: TIPO_COD_PRODUTO.Reduzido };
  }
  return { codigo: entrada.codigo, tipoCodigo: undefined };
}

/**
 * Quantidade e origem derivadas da classificação da entrada.
 *
 * O valor da etiqueta de balança só vira quantidade em produto `'S'` (leitura
 * na etiqueta, AD-252) — e serve **exclusivamente** para isso: o total da linha
 * é recalculado depois por `preço × quantidade`, como em qualquer outra linha
 * (`data-model.md` §1). Nos demais a linha entra com a quantidade padrão, como
 * o `AddItem` do `WWPNFCe` faz quando o produto não é pesável.
 */
function quantidadeEOrigem(
  entrada: EntradaCodigo,
  snapshot: SnapshotPrecoProduto,
): { quantidade: Milesimos; origem: OrigemInsercaoViva } {
  if (entrada.tipo === 'BALANCA' && snapshot.pesavelEditavel === 'S') {
    return {
      quantidade: quantidadePesavel(entrada.valorEtiqueta, snapshot.precoBase),
      origem: 'BALANCA',
    };
  }
  if (entrada.tipo === 'COM_QTD') {
    return { quantidade: entrada.quantidade, origem: 'MANUAL' };
  }
  return { quantidade: milesimosDeUnidades(QUANTIDADE_PADRAO), origem: 'MANUAL' };
}

/** Opções de `confirmarEdicao`. */
export interface OpcoesConfirmacao {
  /**
   * Frase de saldo que a barra já anunciou para esta prévia (ao sair da
   * quantidade ou ao cruzar o limite). Um **aviso** igual não é repetido na
   * inserção (correção do usuário, 2026-09-17); um **bloqueio** é sempre
   * anunciado, porque é a explicação da recusa que acabou de acontecer.
   */
  readonly avisoJaComunicado?: string | null;
}

/** Opções de `confirmarPrevia`. */
export interface OpcoesConfirmacaoPrevia extends OpcoesConfirmacao {
  /**
   * A prévia acabou de sair de `revisarPorCodigo`, com o saldo fresco — caso
   * da inserção direta do TAB/modal. Evita a segunda chamada ao ERP (AD-236);
   * o veredito continua sendo anunciado aqui, na inserção.
   */
  readonly saldoRecemConsultado?: boolean;
}

export interface ApiInsercao {
  /**
   * Resolve o produto por código e decide o fluxo pelo `ProdutoPesavelEditavel`.
   * Em `'B'`, uma quantidade acima do saldo volta `bloqueado` (AD-236).
   */
  inserirPorCodigo(texto: string): Promise<ResultadoInsercao>;
  /**
   * Confirma a inserção de um produto `'E'` depois da revisão do operador.
   * Reconsulta o saldo antes de inserir (AD-236).
   */
  confirmarEdicao(
    pendente: PendenteDeEdicao,
    ajustes: { quantidade: Milesimos; precoUnitario: Centavos; descontoManual: Centavos },
    opcoes?: OpcoesConfirmacao,
  ): Promise<ResultadoConfirmacao>;
  /**
   * TAB no campo de código (ou seleção no modal de busca, que carrega o
   * código no campo e chama isto do mesmo jeito): resolve o produto **sem
   * inserir**, para a barra de entrada rápida mostrar a prévia (nome,
   * unidade, preço, total) antes de confirmar — nunca insere sozinho, ao
   * contrário de `inserirPorCodigo`.
   *
   * `origem` existe só para o caminho da busca (`CART-01`, AD-091): o texto
   * resolvido é sempre um código simples digitado pela própria barra, então
   * `quantidadeEOrigem` classificaria como `'MANUAL'` — sem o override a
   * proveniência "veio da busca" se perderia da linha inserida.
   *
   * `tipoCodigo` também é exclusivo da busca (AD-205): o candidato escolhido
   * decide por qual campo é consultável, e esse tipo pode não ser o da sessão
   * (produto sem código de barras numa empresa em `'B'`). Ausente, vale o da
   * sessão — que é o certo para o código **digitado** na barra.
   */
  revisarPorCodigo(
    texto: string,
    opcoes?: { origem?: 'BUSCA'; tipoCodigo?: string },
  ): Promise<ResultadoRevisao>;
  /**
   * Confirma a prévia de um produto **não editável** — só a quantidade é
   * ajustável. Reconsulta o saldo antes de inserir, salvo
   * `saldoRecemConsultado` (AD-236).
   */
  confirmarPrevia(
    revisao: RevisaoProduto,
    quantidade: Milesimos,
    opcoes?: OpcoesConfirmacaoPrevia,
  ): Promise<ResultadoConfirmacao>;
}

/**
 * Encerramento da venda (T040): esvazia o carrinho e descarta o cache de
 * produto, nos dois — e **apenas** nos dois — momentos permitidos, finalização e
 * suspensão (`research.md`, D5).
 *
 * Fora daqui, `staleTime` precisa valer: invalidar o cache no meio da venda
 * permitiria que o mesmo SKU produzisse linhas de tabelas divergentes.
 *
 * A auditoria **não** é descartada aqui: `descartarAuditoria` só pode ser
 * chamado depois de `FaturarNFCe` retornar sucesso (FR-007 da feature 001), e
 * quem sabe disso é a feature 004.
 */
/**
 * Por que o carrinho recusa alteração agora — a frase que o botão bloqueado
 * mostra ao ser clicado, ou `null` quando a edição está liberada.
 *
 * Casca de React sobre `motivoCarrinhoBloqueado` (`carrinhoSlice.ts`): a regra
 * e o texto moram no slice, junto da action que os aplica; aqui só se lê o
 * estado. É o que permite ao lápis e à lixeira **antecipar** a recusa em vez de
 * aceitar o clique e negar depois (`lib/bloqueio.ts`, AD-143) — nos dois
 * layouts, com a mesma frase.
 *
 * Dois seletores primitivos, e não um objeto: `podeMutarCarrinho()` devolve
 * booleano e a varredura de pagamentos devolve booleano, então cada um é
 * comparado por valor. Um seletor que montasse `{ pode, doDocumento }` daria
 * referência nova a cada render e o Zustand v5 leria como mudança.
 */
export function useMotivoCarrinhoBloqueado(): MotivoBloqueio {
  const podeMutar = useVendaStore((estado) => estado.podeMutarCarrinho());
  const veioDeDocumento = useVendaStore((estado) =>
    estado.pagamentos.some(
      (pagamento) => pagamento.veioDeDocumento && pagamento.status === 'APROVADO',
    ),
  );

  return motivoCarrinhoBloqueado(podeMutar, veioDeDocumento);
}

export function useEncerrarVenda(): () => void {
  const queryClient = useQueryClient();
  const limparCarrinho = useVendaStore((estado) => estado.limparCarrinho);

  return useCallback(() => {
    limparCarrinho();
    invalidarCacheDeProduto(queryClient);
  }, [limparCarrinho, queryClient]);
}

export function useInsercaoDeProduto(): ApiInsercao {
  const queryClient = useQueryClient();
  const contexto = useContextoPrecificacao();
  const politica = usePoliticaSaldo();
  const inserirItem = useVendaStore((estado) => estado.inserirItem);

  /** Avalia contra as linhas **deste instante** — ver `avaliarContraCarrinho`. */
  const avaliarAgora = useCallback(
    (proposta: PropostaDeQuantidade): AvaliacaoSaldo =>
      avaliarContraCarrinho(politica, useVendaStore.getState().linhas, proposta),
    [politica],
  );

  /**
   * Núcleo das três confirmações de inserção: reconsulta o saldo (salvo
   * quando acabou de ser consultado), avalia, comunica e só então insere.
   *
   * A inserção é o momento de anunciar o saldo (correção do usuário,
   * 2026-09-17) — a resolução não anuncia mais —, salvo o aviso que a barra já
   * deu com a mesma frase.
   */
  const confirmarComSaldo = useCallback(
    async (
      proposta: PropostaDeQuantidade,
      inserir: () => void,
      opcoes: OpcoesConfirmacaoPrevia,
    ): Promise<ResultadoConfirmacao> => {
      const saldo =
        politica === '' || opcoes.saldoRecemConsultado === true
          ? proposta.saldo
          : await saldoFresco(contexto, proposta.snapshot.codigoProduto, proposta.saldo);
      const avaliacao = avaliarAgora({ ...proposta, saldo });
      const avisoRepetido =
        avaliacao.veredito === 'aviso' && avaliacao.frase === opcoes.avisoJaComunicado;
      if (!avisoRepetido) {
        comunicarSaldo(avaliacao);
      }
      if (avaliacao.veredito === 'bloqueio') {
        return { situacao: 'bloqueado', saldo };
      }
      inserir();
      return { situacao: 'confirmado' };
    },
    [avaliarAgora, contexto, politica],
  );

  /**
   * `queryClient.query` (e não `fetchProduto` direto) é o que garante `CART-03`:
   * reinserir um SKU já presente na venda resolve pelo cache, sem nova chamada.
   * `staleTime: 'static'` é o "nunca refetch enquanto o dado estiver em cache"
   * do TanStack Query v5 — a única fronteira de frescor é o fim da venda, quando
   * `invalidarCacheDeProduto` descarta tudo (`research.md`, D5).
   */
  const resolverProduto = useCallback(
    async (codigoProduto: string, tipoCodigo?: string): Promise<ResolucaoProduto> => {
      if (contexto === null) {
        throw new Error('Configuração do ponto de venda ainda não carregada.');
      }
      // `tipoCodigo` só chega pelo modal de busca, que escolhe o campo
      // consultável do candidato (AD-205). O tipo faz parte de `chaveProduto`,
      // então o mesmo SKU consultado por campos diferentes ocupa entradas
      // distintas do cache — sem risco de servir o snapshot de uma consulta
      // pelo outro campo.
      const contextoDaConsulta =
        tipoCodigo === undefined ? contexto : { ...contexto, tipoCodProduto: tipoCodigo };

      const opcoesDaConsulta = opcoesProduto(codigoProduto, contextoDaConsulta);
      // Olhado **antes** da consulta: é o que diz se a resposta abaixo acabou
      // de vir da rede (saldo fresco) ou do cache da venda (saldo velho).
      const estavaEmCache = queryClient.getQueryData(opcoesDaConsulta.queryKey) !== undefined;
      const resolucao = await queryClient.query({ ...opcoesDaConsulta, staleTime: 'static' });

      // Aqui, e não em cada chamador: é o ponto único por onde passam os dois
      // caminhos (`inserirResolvido` e `revisarResolvido`), então a recusa por
      // preço zerado vale para digitar, TAB, modal e balança sem depender de
      // ninguém lembrar de repeti-la. Os dois já traduzem o erro em
      // notificação e devolvem `'recusado'`.
      exigirPrecoDeInsercao(contexto.tipoPreco, resolucao.snapshot);

      // Saldo sempre fresco (AD-236): o preço vem do cache, o saldo não. Se a
      // consulta acima foi à rede, o saldo dela já é o fresco — uma segunda
      // chamada seria desperdício.
      if (politica === '' || !estavaEmCache) {
        return resolucao;
      }
      return {
        snapshot: resolucao.snapshot,
        saldo: await saldoFresco(contexto, resolucao.snapshot.codigoProduto, resolucao.saldo),
      };
    },
    [contexto, politica, queryClient],
  );

  const inserirResolvido = useCallback(
    async (
      consulta: ConsultaDaEntrada,
      entrada: EntradaCodigo,
      opcoes: OpcoesInsercao = {},
    ): Promise<ResultadoInsercao> => {
      let snapshot: SnapshotPrecoProduto;
      let saldo: SaldoMilesimos | null;
      try {
        ({ snapshot, saldo } = await resolverProduto(consulta.codigo, consulta.tipoCodigo));
      } catch (erro) {
        notificar.erro(mensagemDeErro(erro));
        return { situacao: 'recusado' };
      }

      let quantidade: Milesimos;
      let origem: OrigemInsercaoViva;
      try {
        const derivado = quantidadeEOrigem(entrada, snapshot);
        quantidade = opcoes.quantidade ?? derivado.quantidade;
        origem = opcoes.origem ?? derivado.origem;
      } catch (erro) {
        // Produto pesável sem `PrecoVenda`: inserção bloqueada com aviso, nenhuma
        // linha criada, foco permanece no campo (`FR-013`, AD-076).
        notificar.erro(mensagemDeErro(erro));
        return { situacao: 'recusado' };
      }

      // Saldo avaliado logo depois de ter o produto em mãos (AD-236).
      const avaliacao = avaliarAgora({ snapshot, saldo, quantidade });

      // `'E'` não insere agora: o foco vai para os campos editáveis e a linha só
      // entra no botão `+` (`FR-014`). `'S'`, `'B'` e `''` inserem direto —
      // salvo quando o saldo bloqueia: aí o produto volta como prévia, para o
      // operador ver o motivo e poder reduzir a quantidade.
      switch (snapshot.pesavelEditavel) {
        case 'E':
          // **Sem toast aqui** (correção do usuário, 2026-09-17): a quantidade
          // ainda vai ser revisada, e o aviso saía agora e de novo ao inserir.
          // Quem anuncia é a barra, ao sair da quantidade, ou a confirmação.
          return { situacao: 'edicao', snapshot, quantidade, saldo };
        case 'S':
        case 'B':
        case '':
          // Aqui a inserção é agora (ou foi barrada agora): é o momento certo.
          comunicarSaldo(avaliacao);
          if (avaliacao.veredito === 'bloqueio') {
            return {
              situacao: 'bloqueado',
              revisao: {
                situacao: 'revisao',
                snapshot,
                quantidade,
                origem,
                editavel: false,
                saldo,
                avaliacaoSaldo: avaliacao,
              },
            };
          }
          inserirItem({ snapshot, quantidade, origem });
          return { situacao: 'inserido' };
      }
    },
    [avaliarAgora, inserirItem, resolverProduto],
  );

  /**
   * Mesma resolução de `inserirResolvido` (cache por SKU, quantidade/origem
   * derivadas da entrada), mas devolve a prévia em vez de inserir — para
   * **qualquer** `pesavelEditavel`, ao contrário de `inserirResolvido` (que só
   * pausa em `'E'`). É o que a barra usa para decidir se mostra preço/desconto
   * editáveis (`editavel`) ou só a quantidade.
   */
  const revisarResolvido = useCallback(
    async (
      consulta: ConsultaDaEntrada,
      entrada: EntradaCodigo,
      origemForcada: 'BUSCA' | undefined,
    ): Promise<ResultadoRevisao> => {
      let snapshot: SnapshotPrecoProduto;
      let saldo: SaldoMilesimos | null;
      try {
        ({ snapshot, saldo } = await resolverProduto(consulta.codigo, consulta.tipoCodigo));
      } catch (erro) {
        notificar.erro(mensagemDeErro(erro));
        return { situacao: 'recusado' };
      }

      let quantidade: Milesimos;
      let origem: OrigemInsercaoViva;
      try {
        ({ quantidade, origem } = quantidadeEOrigem(entrada, snapshot));
      } catch (erro) {
        notificar.erro(mensagemDeErro(erro));
        return { situacao: 'recusado' };
      }

      // Avaliada, não comunicada: a barra decide se isto é inserção direta
      // (anuncia agora) ou prévia (anuncia ao sair da quantidade/ao inserir).
      return {
        situacao: 'revisao',
        snapshot,
        quantidade,
        origem: origemForcada ?? origem,
        editavel: snapshot.pesavelEditavel === 'E',
        saldo,
        avaliacaoSaldo: avaliarAgora({ snapshot, saldo, quantidade }),
      };
    },
    [avaliarAgora, resolverProduto],
  );

  return {
    inserirPorCodigo: useCallback(
      async (texto) => {
        const entrada = interpretarEntradaCodigo(texto);
        const consulta = consultaDaEntrada(entrada);
        if (consulta.codigo === '') {
          return { situacao: 'recusado' };
        }
        return inserirResolvido(consulta, entrada);
      },
      [inserirResolvido],
    ),

    revisarPorCodigo: useCallback(
      async (texto, opcoes) => {
        const entrada = interpretarEntradaCodigo(texto);
        const consulta = consultaDaEntrada(entrada);
        if (consulta.codigo === '') {
          return { situacao: 'recusado' };
        }
        // O tipo escolhido pela busca (AD-205) só vale para código simples: a
        // etiqueta de balança é sempre `'R'` (AD-252).
        return revisarResolvido(
          { codigo: consulta.codigo, tipoCodigo: consulta.tipoCodigo ?? opcoes?.tipoCodigo },
          entrada,
          opcoes?.origem,
        );
      },
      [revisarResolvido],
    ),

    confirmarPrevia: useCallback(
      (revisao, quantidade, opcoes = {}) =>
        confirmarComSaldo(
          { snapshot: revisao.snapshot, saldo: revisao.saldo, quantidade },
          () => {
            inserirItem({ snapshot: revisao.snapshot, quantidade, origem: revisao.origem });
          },
          opcoes,
        ),
      [confirmarComSaldo, inserirItem],
    ),

    confirmarEdicao: useCallback(
      (pendente, ajustes, opcoes = {}) =>
        confirmarComSaldo(
          { snapshot: pendente.snapshot, saldo: pendente.saldo, quantidade: ajustes.quantidade },
          () => {
            inserirItem({
              snapshot: pendente.snapshot,
              quantidade: ajustes.quantidade,
              origem: 'MANUAL',
              precoUnitario: ajustes.precoUnitario,
              descontoManual: ajustes.descontoManual,
            });
          },
          opcoes,
        ),
      [confirmarComSaldo, inserirItem],
    ),
  };
}

export interface ApiEdicaoItem {
  /**
   * Aplica ajustes de quantidade/preço/desconto manual a uma linha **já
   * inserida** — caminho novo da barra de entrada rápida quando o operador
   * clica no lápis de uma linha da grid/lista mobile (correção do usuário,
   * 2026-09-03), em vez de editar só a quantidade inline
   * (`EdicaoQuantidadeItem`, removido).
   *
   * Cada campo passa por `editarItem`, que já é idempotente (no-op quando o
   * valor não mudou, `carrinhoSlice.ts`) e audita por campo — chamar os três
   * incondicionalmente é seguro mesmo quando só a quantidade mudou (produto
   * pesável, `'S'`/`'B'`: preço e desconto chegam inalterados).
   *
   * **Saldo (AD-236):** quando a quantidade muda, reconsulta o saldo e avalia
   * sem a própria linha na soma. Aumento acima do saldo em `'B'` não altera
   * nada; redução nunca bloqueia. `saldoConhecido` é o último saldo que a
   * barra tem, usado se a reconsulta falhar.
   */
  confirmarEdicaoDeLinha(
    linha: LinhaCarrinho,
    ajustes: { quantidade: Milesimos; precoUnitario: Centavos; descontoManual: Centavos },
    saldoConhecido?: SaldoMilesimos | null,
  ): Promise<ResultadoConfirmacao>;
}

export function useEdicaoDeItemExistente(): ApiEdicaoItem {
  const editarItem = useVendaStore((estado) => estado.editarItem);
  const contexto = useContextoPrecificacao();
  const politica = usePoliticaSaldo();

  return {
    confirmarEdicaoDeLinha: useCallback(
      async (linha, ajustes, saldoConhecido = null) => {
        // Só quantidade mexe em estoque: corrigir preço ou desconto de um item
        // não consulta o ERP.
        if (politica !== '' && ajustes.quantidade !== linha.quantidade) {
          const saldo = await saldoFresco(contexto, linha.snapshot.codigoProduto, saldoConhecido);
          const avaliacao = avaliarContraCarrinho(politica, useVendaStore.getState().linhas, {
            snapshot: linha.snapshot,
            saldo,
            quantidade: ajustes.quantidade,
            linhaEditada: linha,
          });
          comunicarSaldo(avaliacao);
          if (avaliacao.veredito === 'bloqueio') {
            return { situacao: 'bloqueado', saldo };
          }
        }
        editarItem(linha.idLinha, 'quantidade', ajustes.quantidade);
        editarItem(linha.idLinha, 'precoUnitario', ajustes.precoUnitario);
        editarItem(linha.idLinha, 'descontoManual', ajustes.descontoManual);
        return { situacao: 'confirmado' };
      },
      [contexto, editarItem, politica],
    ),
  };
}
