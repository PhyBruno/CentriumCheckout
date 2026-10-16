import type { StateCreator } from 'zustand';
import type { VendaState } from '../vendaStore';
import {
  eventoProdutoAlterado,
  eventoProdutoCancelado,
  eventoProdutoInserido,
} from '../../domain/auditoria/eventos';
import {
  paraLinhaCarrinho,
  type LinhaImportada,
  type OrigemDocumentoImportado,
} from '../../domain/importacaoVenda/mapearVendaExistente';
import {
  ajustarAoPrecoMinimo,
  ehVinculavel,
  limiteDeDesconto,
} from '../../domain/precificacao/descontoItem';
import {
  formatarCentavos,
  somar,
  ZERO_CENTAVOS,
  type Centavos,
} from '../../domain/precificacao/dinheiro';
import {
  TOTAL_MINIMO_DA_LINHA,
  origemCongelaPreco,
  participaDaPrecificacao,
  totalLinha,
  type LinhaCarrinho,
  type SnapshotPrecoProduto,
} from '../../domain/precificacao/linha';
import type { Milesimos } from '../../domain/precificacao/quantidade';
import { repricarSku, repricarTodosOsSkus } from '../../domain/precificacao/reprecificacao';

/**
 * Slice do carrinho da venda em andamento (feature 003).
 *
 * Combinado no `vendaStore` (Zustand+Immer, **sem `persist`**): o carrinho morre
 * num F5 por decisão de arquitetura (AD-006, Constitution VI).
 *
 * Responsabilidade única (Constitution II): **orquestrar**. Toda a matemática de
 * preço vive no domínio puro (`domain/precificacao/`) — este slice aplica a
 * mutação, chama `repricarSku` e registra o evento de auditoria. Nenhuma regra
 * de faixa, arredondamento ou parse de código de barras mora aqui.
 */

/** Dados do cliente que influenciam preço — origem é a feature 005. */
export interface ClienteDaVenda {
  readonly codigo: number;
  /** Só usada quando `TipoPreco = 9` (AD-092/AD-108). */
  readonly listaPreco: number | null;
  /** Percentual de convênio; o cliente default é sempre `0` (AD-108). */
  readonly descontoConvenio: number;
}

/**
 * Dependências injetadas na composição do `vendaStore` (Dependency Inversion).
 *
 * O carrinho **não importa** o slice de pagamento nem o de cliente. É isso que
 * permite testar o bloqueio pós-pagamento injetando `() => false`, sem montar
 * estado de pagamento (`research.md`, D8).
 */
export interface CarrinhoDeps {
  /** Implementado pela feature 008 (pagamento); `CART-09`/AD-030. */
  podeMutarCarrinho(): boolean;
  /** `SessaoUsuario.TipoPreco`, do bootstrap (feature 002). */
  tipoPrecoAtual(): number;
  /** Cliente atual da venda (feature 005); `null` antes de qualquer identificação. */
  clienteAtual(): ClienteDaVenda | null;
  /** Aviso ao operador. Injetado para o slice não importar a lib de toast. */
  avisar?: (mensagem: string) => void;
  /**
   * Há forma aprovada que entrou **com o documento** (feature 006/011), e não
   * por um gesto do operador — escolhe qual dos dois avisos de bloqueio ele lê
   * (AD-169).
   *
   * Opcional, como `avisar` e `gerarIdLinha`: o default `false` dá o texto
   * antigo, que é o correto para toda venda montada do zero. Quem não injeta
   * não perde comportamento nenhum.
   */
  pagamentoVeioDeDocumento?: () => boolean;
  /** Injetável para tornar `idLinha` determinístico em teste. */
  gerarIdLinha?: () => string;
}

interface InserirItemInputComum {
  readonly snapshot: SnapshotPrecoProduto;
  readonly quantidade: Milesimos;
  /** Desconto manual informado antes da inserção, em produto `'E'` (`FR-014`). */
  readonly descontoManual?: Centavos;
  /**
   * O desconto manual que o operador **pediu**, quando a barra já o ajustou ao
   * preço mínimo antes de chegar aqui (AD-280). Só para a auditoria: o que
   * entra na linha é `descontoManual`.
   */
  readonly descontoManualSolicitado?: Centavos;
}

/**
 * `precoUnitario` é **obrigatório** quando `origem` é `'RASCUNHO'` ou `'DAV'`:
 * essas origens trazem o preço já congelado do documento de origem (`FR-017`,
 * AD-067) — usar `snapshot.precoBase` (o preço vivo de hoje) violaria essa
 * invariante em silêncio. A união discriminada por `origem` torna esse estado
 * irrepresentável em tempo de compilação; nas demais origens, quando omitido,
 * o preço sai de `snapshot.precoBase`.
 *
 * `inserirItem` ainda repete a checagem em runtime (ver corpo da action)
 * porque a entrada pode vir de um caller não totalmente tipado — ex.: parse
 * de payload do ERP na importação de DAV (feature 006) ou na retomada de
 * rascunho (feature 004).
 */
export type InserirItemInput =
  | (InserirItemInputComum & {
      readonly origem: 'RASCUNHO' | 'DAV';
      readonly precoUnitario: Centavos;
    })
  | (InserirItemInputComum & {
      readonly origem: 'MANUAL' | 'BUSCA' | 'BALANCA';
      readonly precoUnitario?: Centavos;
    });

export type CampoEditavel = 'quantidade' | 'precoUnitario' | 'descontoManual';

/** Os três campos que o lápis edita juntos (017, `atualizarItem`). */
export interface AjustesDeItem {
  readonly quantidade: Milesimos;
  readonly precoUnitario: Centavos;
  readonly descontoManual: Centavos;
}

/**
 * O que acompanha `atualizarItem` só para a auditoria — fora de `AjustesDeItem`
 * de propósito: aquele objeto é espalhado na linha, e um campo a mais nele
 * entraria no estado do carrinho.
 */
export interface OpcoesAuditoriaDoItem {
  /** Ver `InserirItemInputComum.descontoManualSolicitado`. */
  readonly descontoManualSolicitado?: Centavos;
}

const CAMPOS_EDITAVEIS: readonly CampoEditavel[] = [
  'quantidade',
  'precoUnitario',
  'descontoManual',
];

export interface CarrinhoSlice {
  /** Ordem de inserção, **incluindo canceladas** (invariante I1). */
  linhas: LinhaCarrinho[];

  inserirItem(input: InserirItemInput): void;
  editarItem(idLinha: string, campo: CampoEditavel, valor: Centavos | Milesimos): void;
  /**
   * Aplica quantidade, preço e desconto como **uma** operação (017, FR-007,
   * I-D7): grava o conjunto ou não grava nada. `true` = gravou (inclusive
   * quando nada mudou).
   *
   * Existe ao lado de `editarItem`, e não no lugar dele, porque três
   * `editarItem` seguidos validam cada passo sozinho: linha 10 × R$ 10,00 com
   * R$ 50,00 de desconto, editada para preço R$ 5,00 e desconto R$ 20,00, tinha
   * o passo do preço recusado (bruto 50 − desconto 50 = 0) e o do desconto
   * aceito — terminando num estado que o operador nunca digitou (`research.md`
   * D5).
   */
  atualizarItem(idLinha: string, ajustes: AjustesDeItem, opcoes?: OpcoesAuditoriaDoItem): boolean;
  cancelarItem(idLinha: string): void;
  /** `FR-018` — troca de cliente com carrinho já populado. */
  reprecificarPorTrocaDeCliente(): void;
  limparCarrinho(): void;

  /**
   * Importa em lote as linhas de um documento já existente no ERP (feature
   * 006, `FR-005`/`FR-006`).
   *
   * Action **distinta** de `inserirItem`, não um caso especial dele, por três
   * razões que o `inserirItem` não conseguiria atender juntas: as linhas entram
   * já congeladas e **nunca** passam por `repricarSku`; não geram
   * `PRODUTO_INSERIDO` (importar em lote não é o operador inserindo produto —
   * `data-model.md` §6); e o lote inteiro entra numa única gravação, sem
   * reprecificar N vezes no meio do caminho.
   *
   * Não conhece o documento — recebe `LinhaImportada[]` já mapeadas. `origem`
   * é a única coisa que ele precisa saber sobre a procedência: distingue a
   * linha vinda de um DAV (006) da vinda de um rascunho de NFCe (011), que são
   * idênticas em todo o resto (AD-166).
   */
  importarLinhasCongeladas(
    linhas: readonly LinhaImportada[],
    origem: OrigemDocumentoImportado,
  ): void;

  /**
   * Preenche a descrição do snapshot de **todas** as linhas de um SKU (feature
   * 006, AD-096).
   *
   * O documento importado não traz descrição de produto; ela chega depois, por
   * um `GetProduto` best-effort. É metadado de exibição: não altera preço,
   * quantidade nem desconto, então **não** passa por `editarItem` — que
   * descongelaria a linha (invariante I6) e dispararia reprecificação.
   *
   * Pelo mesmo motivo não é barrada por `podeMutarCarrinho()`: com pagamento
   * aprovado a venda não pode mais mudar, mas trocar um código por um nome na
   * tela não é mudar a venda — bloquear aqui deixaria o operador conferindo
   * códigos crus na hora exata em que ele mais precisa ler a grid.
   */
  editarSnapshotDescricao(codigoProduto: string, descricao: string): void;
}

/**
 * Frase única para os dois motivos que `podeMutarCarrinho()` reúne — condição
 * de pagamento escolhida e forma já aprovada (pedido do usuário, 2026-09-04).
 *
 * Nomeia a **saída**, não só o impedimento: o operador precisa saber que existe
 * um caminho de volta ("Limpar" no cartão de pagamento, `descartarPagamento`),
 * senão a única leitura possível é a de que a venda travou. O texto anterior
 * falava só de "pagamento aprovado", que deixou de ser o gatilho mais comum —
 * hoje basta escolher a condição.
 */
const AVISO_CARRINHO_BLOQUEADO =
  'Esta venda já está em pagamento: use "Limpar" no cartão de pagamento para remover condição, desconto e formas e voltar a editar os itens.';

/**
 * A mesma trava, causa diferente: a venda **nasceu** congelada porque o
 * documento retomado já vinha pago (AD-169).
 *
 * Um rascunho de NFCe é uma venda que foi cobrada e depois suspensa, então a
 * forma aprovada entra junto com os itens e a grid trava no último passo da
 * própria retomada — sem que o operador tenha feito nada. Servir-lhe o texto
 * acima ("esta venda já está em pagamento") o mandaria procurar um pagamento
 * que ele não lançou, e a frase soaria como se ele tivesse errado. Aqui o
 * fato vem primeiro e a saída depois, com o aviso de que a saída **descarta um
 * valor já recebido** — a mesma advertência que a confirmação do "Limpar"
 * repete, porque este é o ponto em que o operador decide ir até lá.
 */
const AVISO_CARRINHO_BLOQUEADO_POR_DOCUMENTO =
  'Esta venda foi retomada com o pagamento já registrado no documento, por isso os itens estão travados. Para editá-los, use "Limpar" no cartão de pagamento — isso descarta um valor que já foi recebido.';

/**
 * O desconto **do item** não pode zerar o item (pedido do usuário,
 * 2026-09-04). Mesmo piso do rateio do desconto de capa
 * (`TOTAL_MINIMO_DA_LINHA`), aplicado aqui à linha inteira.
 */
const AVISO_DESCONTO_ZERA_A_LINHA =
  'O desconto deste item zeraria o total dele: reduza o desconto ou aumente a quantidade.';

/**
 * Desconto manual acima do limite do preço mínimo, já ajustado (017, FR-010).
 *
 * Exportada porque a barra de entrada ajusta **antes** e avisa com a mesma
 * frase (FR-013): duas cópias do texto poderiam divergir, e o operador leria
 * dois avisos diferentes para a mesma regra.
 */
export function avisoDePrecoMinimo(precoMinimo: Centavos): string {
  return `Preço mínimo deste item: ${formatarCentavos(precoMinimo)}. O desconto foi ajustado automaticamente.`;
}

/**
 * A linha com o desconto manual limitado ao preço mínimo, ou `null` quando não
 * há o que ajustar (017, I-D1).
 *
 * Só linha vinculável (`'E'` com preço de tabela): a de DAV/NFCe entra com
 * `pesavelEditavel: ''` e fica de fora, porque o documento já foi aceito pelo
 * ERP. A referência é o `precoUnitario` da linha — o preço de tabela, ou o
 * preço digitado acima dele. O convênio não entra na conta (FR-014).
 */
function ajustarLinhaAoMinimo(linha: LinhaCarrinho): LinhaCarrinho | null {
  if (!ehVinculavel(linha.snapshot)) {
    return null;
  }
  const limite = limiteDeDesconto(
    linha.precoUnitario,
    linha.snapshot.precoMinimo,
    linha.quantidade,
  );
  const ajuste = ajustarAoPrecoMinimo(linha.descontoManual, limite);
  return ajuste.ajustado ? { ...linha, descontoManual: ajuste.desconto } : null;
}

/**
 * A linha terminaria valendo menos de um centavo **por causa de um desconto**.
 *
 * O `desconto > 0` não é detalhe: um produto de brinde cadastrado com
 * `PrecoVenda = 0` vale zero sem que ninguém o tenha descontado, e recusá-lo
 * aqui impediria de vender o que o cadastro do ERP permite. O que a regra proíbe
 * é o desconto **consumir** a linha.
 *
 * Vive no slice, e não no componente, porque a quantidade também zera uma linha:
 * `descontoManual` é absoluto sobre o total e **não** escala com ela (só
 * `descontoConvenio` é recalculado por `repricarSku`). Uma linha de DAV com 10
 * un × R$ 10,00 e R$ 50,00 de desconto vale R$ 50,00; reduzida para 5 un, vale
 * zero — sem que o campo de desconto tenha sido tocado, e num produto que a
 * barra de entrada nem deixa editar.
 */
function descontoZeraALinha(linha: LinhaCarrinho): boolean {
  const desconto = somar(linha.descontoConvenio, linha.descontoManual);
  return desconto > ZERO_CENTAVOS && totalLinha(linha) < TOTAL_MINIMO_DA_LINHA;
}

/**
 * Por que o carrinho recusa alteração — `null` significa "pode alterar".
 *
 * **A mesma frase que a action mostra e que o botão antecipa.** Antes destas
 * duas mensagens saírem daqui, a UI não tinha como saber que a edição seria
 * recusada: o lápis e a lixeira ficavam ativos, o operador clicava e só então
 * ouvia o não. É o oposto do padrão desta base (`lib/bloqueio.ts`, AD-143), em
 * que o controle já nasce bloqueado e o clique **ensina a saída**. Duplicar o
 * texto no componente resolveria a tela e criaria o problema pior: duas cópias
 * de uma regra que pode divergir, uma dizendo "use Limpar" enquanto a outra
 * fala de pagamento aprovado.
 *
 * Pura de propósito — recebe os dois predicados e não lê store nenhum —, então
 * serve tanto ao slice (que já os tem em `deps`) quanto ao hook de React que a
 * grid do desktop e a lista mobile consultam.
 */
export function motivoCarrinhoBloqueado(
  podeMutarCarrinho: boolean,
  pagamentoVeioDeDocumento: boolean,
): string | null {
  if (podeMutarCarrinho) {
    return null;
  }
  return pagamentoVeioDeDocumento
    ? AVISO_CARRINHO_BLOQUEADO_POR_DOCUMENTO
    : AVISO_CARRINHO_BLOQUEADO;
}

function idAleatorio(): string {
  return crypto.randomUUID();
}

export function criarCarrinhoSlice(
  deps: CarrinhoDeps,
): StateCreator<VendaState, [['zustand/immer', never]], [], CarrinhoSlice> {
  const gerarIdLinha = deps.gerarIdLinha ?? idAleatorio;

  /** `0` quando não há cliente ou o cliente não tem convênio (AD-108). */
  function descontoConvenioPercentual(): number {
    return deps.clienteAtual()?.descontoConvenio ?? 0;
  }

  /** Bloqueio pós-pagamento: no-op com aviso, nunca exceção (`FR-010`). */
  function carrinhoBloqueado(): boolean {
    const motivo = motivoCarrinhoBloqueado(
      deps.podeMutarCarrinho(),
      deps.pagamentoVeioDeDocumento?.() === true,
    );
    if (motivo === null) {
      return false;
    }
    deps.avisar?.(motivo);
    return true;
  }

  return (set, get) => {
    /**
     * Reprecifica fora do `set` e só então grava.
     *
     * O domínio recebe o array plano de `get()`, nunca o draft do Immer: manter
     * as funções puras livres de qualquer noção de draft é o que as deixa
     * testáveis sem montar store (Constitution II). Por isso a gravação usa a
     * forma de **substituição parcial** do `set`, e não um recipe de rascunho:
     * o array já vem pronto do domínio, com as linhas inalteradas preservadas
     * por identidade.
     */
    function aplicarLinhas(linhas: readonly LinhaCarrinho[]): void {
      set({ linhas: [...linhas] });
    }

    function reprecificarSku(linhas: readonly LinhaCarrinho[], codigoProduto: string) {
      return repricarSku(
        linhas,
        codigoProduto,
        deps.tipoPrecoAtual(),
        descontoConvenioPercentual(),
      );
    }

    /**
     * Rede de segurança do preço mínimo (017, `research.md` D7), no mesmo ponto
     * de `descontoZeraALinha`: depois da reprecificação, antes da gravação.
     *
     * A barra ajusta antes e entrega um valor dentro do limite, então no caso
     * normal este passo fica calado; ele só fala quando outro chamador passa um
     * valor fora — e aí é o único aviso (FR-013).
     */
    function comPrecoMinimo(
      linhas: readonly LinhaCarrinho[],
      idLinha: string,
    ): readonly LinhaCarrinho[] {
      const alvo = linhas.find((linha) => linha.idLinha === idLinha);
      const ajustada = alvo === undefined ? null : ajustarLinhaAoMinimo(alvo);
      if (ajustada === null) {
        return linhas;
      }
      deps.avisar?.(avisoDePrecoMinimo(ajustada.snapshot.precoMinimo));
      return linhas.map((linha) => (linha.idLinha === idLinha ? ajustada : linha));
    }

    return {
      linhas: [],

      inserirItem: (input) => {
        if (carrinhoBloqueado()) {
          return;
        }

        // Reforço em runtime da invariante que `InserirItemInput` já expressa
        // em tipo: a entrada pode vir de um caller não totalmente tipado (ex.:
        // parse de payload do ERP na importação de DAV/rascunho), então o tipo
        // sozinho não basta — sem esta checagem, uma origem congelada sem
        // `precoUnitario` criaria a linha com o preço vivo de hoje em silêncio.
        if (origemCongelaPreco(input.origem) && input.precoUnitario === undefined) {
          throw new Error(
            `inserirItem: origem '${input.origem}' exige preço congelado (\`precoUnitario\`), mas nenhum foi informado (FR-017, AD-067).`,
          );
        }

        // Invariante I5 por construção: `precoCongelado` é derivado da origem,
        // não informado pelo call site, então não existe estado impossível.
        const precoCongelado = origemCongelaPreco(input.origem);

        const novaLinha: LinhaCarrinho = {
          idLinha: gerarIdLinha(),
          snapshot: input.snapshot,
          quantidade: input.quantidade,
          precoUnitario: input.precoUnitario ?? input.snapshot.precoBase,
          descontoConvenio: ZERO_CENTAVOS,
          descontoManual: input.descontoManual ?? ZERO_CENTAVOS,
          cancelada: false,
          precoCongelado,
          origem: input.origem,
        };

        const codigoProduto = input.snapshot.codigoProduto;
        const linhas = comPrecoMinimo(
          reprecificarSku([...get().linhas, novaLinha], codigoProduto),
          novaLinha.idLinha,
        );

        // A auditoria registra o preço **após** a reprecificação: é o valor que
        // de fato entrou na venda (`research.md`, D11).
        const inserida = linhas.find((linha) => linha.idLinha === novaLinha.idLinha) ?? novaLinha;

        // Checado **depois** da reprecificação e **antes** da gravação: o
        // desconto de convênio só existe a partir dela, e uma linha recusada não
        // pode chegar ao estado nem por um quadro.
        if (descontoZeraALinha(inserida)) {
          deps.avisar?.(AVISO_DESCONTO_ZERA_A_LINHA);
          return;
        }

        aplicarLinhas(linhas);

        // O pedido é o que a barra recebeu do operador antes de ajustar, ou o
        // próprio `descontoManual` quando quem ajustou foi `comPrecoMinimo`
        // aqui dentro (AD-280).
        const pedido = input.descontoManualSolicitado ?? input.descontoManual;
        get().registrarEventoAuditoria(
          eventoProdutoInserido({
            codigoProduto,
            quantidade: inserida.quantidade,
            precoUnitario: inserida.precoUnitario,
            desconto: somar(inserida.descontoConvenio, inserida.descontoManual),
            ...(pedido !== undefined && pedido !== inserida.descontoManual
              ? { descontoManualSolicitado: pedido }
              : {}),
          }),
        );
      },

      editarItem: (idLinha, campo, valor) => {
        if (carrinhoBloqueado()) {
          return;
        }

        const atuais = get().linhas;
        const alvo = atuais.find((linha) => linha.idLinha === idLinha);
        if (alvo === undefined || alvo.cancelada) {
          return;
        }

        const valorAnterior = alvo[campo];
        if (valorAnterior === valor) {
          return;
        }

        const estavaCongelada = alvo.precoCongelado;
        // Edição explícita **descongela** a linha (`FR-017`, invariante I6): a
        // partir daqui ela volta a participar do agregado e do recálculo.
        const editada: LinhaCarrinho = { ...alvo, [campo]: valor, precoCongelado: false };

        const comEdicao = atuais.map((linha) => (linha.idLinha === idLinha ? editada : linha));

        // Reprecifica na mudança de quantidade (`FR-007`) e no descongelamento,
        // que altera o agregado do SKU. A exceção é o operador ter acabado de
        // digitar o próprio `precoUnitario`: recalcular desfaria a edição dele.
        const deveReprecificar =
          campo === 'quantidade' || (estavaCongelada && campo !== 'precoUnitario');

        const resultantes = comPrecoMinimo(
          deveReprecificar ? reprecificarSku(comEdicao, alvo.snapshot.codigoProduto) : comEdicao,
          idLinha,
        );

        // Vale para **qualquer** campo, não só o desconto: reduzir a quantidade
        // ou o preço de uma linha que já tem desconto absoluto zera o total dela
        // do mesmo jeito. É por isso que a guarda mora aqui, e não no campo de
        // desconto da barra de entrada.
        const resultante = resultantes.find((linha) => linha.idLinha === idLinha);
        if (resultante !== undefined && descontoZeraALinha(resultante)) {
          deps.avisar?.(AVISO_DESCONTO_ZERA_A_LINHA);
          return;
        }

        aplicarLinhas(resultantes);

        // O valor que entrou, que difere do pedido quando o preço mínimo
        // ajustou o desconto — e aí o pedido acompanha (AD-280).
        const valorNovo = resultante?.[campo] ?? valor;
        get().registrarEventoAuditoria(
          eventoProdutoAlterado({
            codigoProduto: alvo.snapshot.codigoProduto,
            campo,
            valorAnterior,
            valorNovo,
            ...(valorNovo === valor ? {} : { valorSolicitado: valor }),
          }),
        );
      },

      atualizarItem: (idLinha, ajustes, opcoes) => {
        if (carrinhoBloqueado()) {
          return false;
        }

        const atuais = get().linhas;
        const alvo = atuais.find((linha) => linha.idLinha === idLinha);
        if (alvo === undefined || alvo.cancelada) {
          return false;
        }

        const alterados = CAMPOS_EDITAVEIS.filter((campo) => alvo[campo] !== ajustes[campo]);
        if (alterados.length === 0) {
          // Nada muda na linha — nem o descongelamento, que é efeito de edição
          // —, mas um desconto pedido e ajustado de volta ao que já estava é
          // uma tentativa, e fica no `Log` (AD-280).
          const pedido = opcoes?.descontoManualSolicitado;
          if (pedido !== undefined && pedido !== alvo.descontoManual) {
            get().registrarEventoAuditoria(
              eventoProdutoAlterado({
                codigoProduto: alvo.snapshot.codigoProduto,
                campo: 'descontoManual',
                valorAnterior: alvo.descontoManual,
                valorNovo: alvo.descontoManual,
                valorSolicitado: pedido,
              }),
            );
          }
          return true;
        }

        // Mesmas regras de `editarItem`, aplicadas ao conjunto: a edição
        // explícita descongela (invariante I6), e reprecifica na mudança de
        // quantidade ou no descongelamento — exceto quando o próprio operador
        // acabou de digitar o `precoUnitario`.
        const estavaCongelada = alvo.precoCongelado;
        const editada: LinhaCarrinho = { ...alvo, ...ajustes, precoCongelado: false };
        const comEdicao = atuais.map((linha) => (linha.idLinha === idLinha ? editada : linha));

        const deveReprecificar =
          alterados.includes('quantidade') ||
          (estavaCongelada && !alterados.includes('precoUnitario'));

        const resultantes = comPrecoMinimo(
          deveReprecificar ? reprecificarSku(comEdicao, alvo.snapshot.codigoProduto) : comEdicao,
          idLinha,
        );

        const resultante = resultantes.find((linha) => linha.idLinha === idLinha);
        if (resultante !== undefined && descontoZeraALinha(resultante)) {
          deps.avisar?.(AVISO_DESCONTO_ZERA_A_LINHA);
          return false;
        }

        aplicarLinhas(resultantes);

        // O desconto pedido (AD-280): o da barra, se ela ajustou antes, ou o que
        // chegou aqui, se quem ajustou foi `comPrecoMinimo`.
        const descontoAplicado = resultante?.descontoManual ?? ajustes.descontoManual;
        const descontoPedido = opcoes?.descontoManualSolicitado ?? ajustes.descontoManual;
        const descontoFoiAjustado = descontoPedido !== descontoAplicado;

        // Um pedido ajustado de volta ao desconto que a linha já tinha não
        // altera o campo, mas é uma tentativa: entra com anterior = novo, para o
        // `Log` mostrar o que foi pedido.
        const campos =
          descontoFoiAjustado && !alterados.includes('descontoManual')
            ? [...alterados, 'descontoManual' as const]
            : alterados;

        // Um evento por campo, no mesmo formato de `editarItem`: o `Log` que o
        // ERP recebe não muda de forma por causa da edição atômica.
        for (const campo of campos) {
          const ehDesconto = campo === 'descontoManual';
          get().registrarEventoAuditoria(
            eventoProdutoAlterado({
              codigoProduto: alvo.snapshot.codigoProduto,
              campo,
              valorAnterior: alvo[campo],
              valorNovo: ehDesconto ? descontoAplicado : ajustes[campo],
              ...(ehDesconto && descontoFoiAjustado ? { valorSolicitado: descontoPedido } : {}),
            }),
          );
        }
        return true;
      },

      cancelarItem: (idLinha) => {
        // Cancelar **não** exige supervisor nem reautenticação (`FR-012`,
        // AD-065): o único bloqueio é `podeMutarCarrinho()`.
        if (carrinhoBloqueado()) {
          return;
        }

        const atuais = get().linhas;
        const alvo = atuais.find((linha) => linha.idLinha === idLinha);
        if (alvo === undefined || alvo.cancelada) {
          return;
        }

        // A linha nunca sai do array (invariante I1, `CART-08`); reprecificar
        // pode derrubar as remanescentes para a faixa inferior (`FR-008`).
        const comCancelamento = atuais.map((linha) =>
          linha.idLinha === idLinha ? { ...linha, cancelada: true } : linha,
        );

        aplicarLinhas(reprecificarSku(comCancelamento, alvo.snapshot.codigoProduto));

        get().registrarEventoAuditoria(
          eventoProdutoCancelado({ codigoProduto: alvo.snapshot.codigoProduto }),
        );
      },

      reprecificarPorTrocaDeCliente: () => {
        const atuais = get().linhas;
        if (!atuais.some(participaDaPrecificacao)) {
          return;
        }

        // Sem evento próprio: a troca de cliente é auditada pela feature 005
        // como `CLIENTE_TROCADO`, e reprecificação automática nunca gera evento
        // (`research.md`, D11).
        aplicarLinhas(
          repricarTodosOsSkus(atuais, deps.tipoPrecoAtual(), descontoConvenioPercentual()),
        );
      },

      limparCarrinho: () => {
        set({ linhas: [] });
      },

      importarLinhasCongeladas: (linhas, origem) => {
        if (carrinhoBloqueado()) {
          return;
        }
        if (linhas.length === 0) {
          return;
        }

        // Uma única gravação para o lote inteiro. `repricarSku` não é chamado
        // em nenhum momento: as linhas nascem com `precoCongelado: true`, fora
        // do agregado por SKU desde o primeiro instante (invariante I3), então
        // não há faixa a recalcular nem risco de empurrar as linhas manuais do
        // mesmo SKU para outra faixa (AD-067).
        aplicarLinhas([
          ...get().linhas,
          ...linhas.map((linha) => paraLinhaCarrinho(linha, gerarIdLinha(), origem)),
        ]);
      },

      editarSnapshotDescricao: (codigoProduto, descricao) => {
        const atuais = get().linhas;

        let houveMudanca = false;
        const atualizadas = atuais.map((linha) => {
          if (
            linha.snapshot.codigoProduto !== codigoProduto ||
            linha.snapshot.descricao === descricao
          ) {
            return linha;
          }
          houveMudanca = true;
          return { ...linha, snapshot: { ...linha.snapshot, descricao } };
        });

        // Sem mudança real, não grava: o lote de `GetProduto` roda por SKU
        // distinto e pode devolver a descrição que a linha já tinha (linha
        // manual do mesmo SKU). Gravar mesmo assim trocaria a identidade do
        // array e faria a grid inteira re-renderizar à toa.
        if (!houveMudanca) {
          return;
        }

        aplicarLinhas(atualizadas);
      },
    };
  };
}
