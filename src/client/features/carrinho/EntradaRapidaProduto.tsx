import { Barcode, Minus, Plus, Search } from 'lucide-react';
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
  type RefObject,
} from 'react';
import { gooeyToast } from 'goey-toast';
import { Button } from '@/components/ui/button';
import { acaoBloqueavel, atributosDeBloqueio, type MotivoBloqueio } from '@/lib/bloqueio';
import { cn } from '@/lib/utils';
import { rotuloTipoCodigoProduto } from '../../domain/precificacao/codigoProduto';
import {
  ZERO_CENTAVOS,
  calcularTotalLinha,
  centavos,
  formatarCentavos,
  somar,
  type Centavos,
} from '../../domain/precificacao/dinheiro';
import { TOTAL_MINIMO_DA_LINHA } from '../../domain/precificacao/linha';
import {
  MILESIMOS_POR_UNIDADE,
  formatarQuantidade,
  milesimos,
  milesimosDeUnidades,
  somarQuantidades,
  type Milesimos,
} from '../../domain/precificacao/quantidade';
import { useEdicaoItemStore } from '../../stores/edicaoItemStore';
import { useFocoVendaStore } from '../../stores/focoVendaStore';
import { ModalBuscaProduto } from './ModalBuscaProduto';
import {
  useContextoPrecificacao,
  useEdicaoDeItemExistente,
  useInsercaoDeProduto,
  type RevisaoProduto,
} from './useCarrinho';

const CENTAVOS_POR_REAL = 100;
/**
 * O rótulo "Quantidade" aponta para o input por `htmlFor`, não por
 * aninhamento — ver o comentário da célula de quantidade no JSX.
 */
const ID_CAMPO_QUANTIDADE = 'previa-campo-quantidade';
const UMA_UNIDADE = milesimos(MILESIMOS_POR_UNIDADE);
const QUANTIDADE_INICIAL = milesimosDeUnidades(1);

/**
 * Desconto que consome o item inteiro (pedido do usuário, 2026-09-04).
 *
 * A frase nomeia a saída — reduzir o desconto — porque o gesto que o operador
 * tentaria sozinho (confirmar assim mesmo) não funciona: o botão de inserir
 * fica bloqueado enquanto o total não voltar a `TOTAL_MINIMO_DA_LINHA`.
 */
const AVISO_DESCONTO_ZERA_ITEM =
  'O desconto não pode zerar o item: reduza o valor para o total ficar em pelo menos R$ 0,01.';

/**
 * Campos obrigatórios da prévia (pedido do usuário, 2026-09-04): sair de
 * quantidade, preço ou desconto com o campo vazio — ou com quantidade/preço
 * zerados — é erro, avisado na hora e com o foco devolvido ao campo.
 *
 * **Zero é recusado em quantidade e preço, mas não em desconto** (decisão do
 * usuário na mesma data): um item sem desconto é o caso normal, e o campo
 * nasce em `0,00`; exigir um desconto positivo impediria a inserção mais
 * comum do caixa. No desconto, portanto, só o campo vazio (ou um texto que
 * `lerCentavos` não entende) bloqueia — o desconto grande demais continua
 * coberto por `AVISO_DESCONTO_ZERA_ITEM`.
 */
const AVISO_QUANTIDADE_INVALIDA =
  'Informe a quantidade do item: ela precisa ser um número maior que zero.';
const AVISO_PRECO_INVALIDO =
  'Informe o preço unitário do item: ele precisa ser um valor maior que zero.';
const AVISO_DESCONTO_INVALIDO =
  'Informe o desconto do item: digite 0,00 quando não houver desconto.';

/** `"12,34"` e `"12.34"` → `1234` centavos; entrada inválida vira `null`. */
function lerCentavos(texto: string): Centavos | null {
  const normalizado = texto.trim().replace(',', '.');
  if (normalizado === '' || !/^\d+(\.\d{1,2})?$/.test(normalizado)) {
    return null;
  }
  return centavos(Math.round(Number(normalizado) * CENTAVOS_POR_REAL));
}

function paraTextoDecimal(valorEmCentavos: number): string {
  return (valorEmCentavos / CENTAVOS_POR_REAL).toFixed(2).replace('.', ',');
}

/** `"3"`, `"3,5"` ou `"3.5"` → `Milesimos`; inválida ou não positiva vira `null`. */
function lerQuantidadeTexto(texto: string): Milesimos | null {
  const normalizado = texto.trim().replace(',', '.');
  if (normalizado === '' || !/^\d+(\.\d{1,3})?$/.test(normalizado)) {
    return null;
  }
  const unidades = Number(normalizado);
  return unidades > 0 ? milesimosDeUnidades(unidades) : null;
}

/**
 * Recusa a saída de um campo obrigatório: avisa o operador e devolve o foco ao
 * campo (pedido do usuário, 2026-09-04).
 *
 * O `.focus()` vai agendado (`setTimeout` de 0), não direto: quando a saída é
 * um TAB — ou um clique em outro controle — o navegador ainda move o foco
 * **depois** de o handler de `blur` rodar, e um foco pedido dentro dele seria
 * desfeito no mesmo gesto. Agendar para o fim da fila deixa a navegação
 * terminar e só então traz o foco de volta, que é o comportamento pedido
 * ("voltar o foco para o campo referente").
 *
 * O texto digitado permanece no campo, como no aviso de desconto que zera o
 * item: quem impede a inserção é `bloqueioDeInsercao`, e apagar o que o
 * operador escreveu tiraria dele a chance de só corrigir um dígito.
 */
function exigirCampo(campo: RefObject<HTMLInputElement | null>, aviso: string): void {
  gooeyToast.error(aviso);
  window.setTimeout(() => {
    campo.current?.focus();
    campo.current?.select();
  }, 0);
}

/**
 * "R$" à esquerda do valor, como o Pencil desenha no campo de desconto do item
 * (`design/CentriumCheckout.pen`, nó `qhuOQ` "Símbolo dinheiro desconto",
 * Inter 12/700 em `$body`): elemento próprio, **fora** do `<input>`.
 *
 * É o que faz o símbolo persistir na inserção e na edição (correção do
 * usuário, 2026-09-03) sem virar máscara: o `value` do campo continua sendo só
 * o número, então apagar, corrigir e digitar por cima seguem funcionando como
 * em qualquer input, o cursor nunca esbarra num prefixo protegido, e
 * `lerCentavos` recebe exatamente o mesmo texto de antes.
 */
function SimboloReal({ testId }: { testId: string }): ReactElement {
  return (
    <span className="shrink-0 text-sm font-bold text-muted-foreground" data-testid={testId}>
      R$
    </span>
  );
}

/**
 * Barra de entrada rápida de produto (T021, `CART-02`) — réplica fiel do frame
 * "Entrada rápida de produto" do Pencil (`design/CentriumCheckout.pen`,
 * confirmado via MCP do Pencil): **um único cartão sempre com todas as
 * células visíveis** (código, quantidade, unidade, preço, desconto, total,
 * nome do produto abaixo, botão de inserir) — nunca colapsa a só o campo de
 * código, mesmo sem nenhum produto resolvido ainda.
 *
 * Enter no campo de código é a tecla de **inserção rápida**: confirma a
 * entrada e insere direto, sem exibir revisão (produto pesável/simples/balança
 * — `'S'`/`'B'`/`''`). TAB é a tecla de **revisão**: carrega o produto via
 * `GetProduto` (`revisarPorCodigo`) e preenche todas as células com os dados
 * reais — mas só quando há código digitado; com o campo vazio TAB volta a ser
 * navegação e leva o foco à lupa de busca (pedido do usuário, 2026-09-04).
 *
 * Quantidade, preço e desconto são sempre `<input>` de verdade — não só
 * texto — para participarem da navegação por TAB. Unidade também é um
 * `<input>` (mesma célula do design), mas **`disabled`** (pedido do usuário,
 * 2026-09-03): vem do cadastro, o operador nunca pode alterá-la, e por isso
 * nem entra na navegação por TAB — o próprio navegador pula elementos
 * desabilitados. Preço e desconto só ficam editáveis quando
 * `ProdutoPesavelEditavel = 'E'` (`FR-014`); nos demais casos ficam somente
 * leitura (`readOnly`, não `disabled` — continuam alcançáveis por TAB, só não
 * aceitam digitação), e o foco ao resolver via TAB vai direto para o botão
 * "+" (nada mais a decidir). Em produto `'E'`, o foco ao resolver vai para a
 * **quantidade** — nunca para o botão de inserir — e o próximo TAB segue a
 * ordem natural do DOM (quantidade → preço → desconto → "+", pulando a
 * unidade desabilitada): o operador revisa e ajusta cada campo digitando,
 * sem precisar do mouse.
 *
 * Não registra atalho global de teclado: um `hotkey` de escopo de documento
 * competiria com a própria bipagem, que chega como digitação rápida neste input.
 *
 * Dono do modal de busca por termo livre (`ModalBuscaProduto`, T015,
 * `CART-01`): o modal é **só um seletor de código** — escolher um candidato
 * só devolve o `CodigoProduto` (`onProdutoSelecionado`), nunca resolve nem
 * insere nada sozinho. É esta barra que carrega o código escolhido no campo,
 * chama `GetProduto` e mostra a revisão — o mesmo caminho de TAB no código
 * digitado. Achado do usuário (2026-09-03): a revisão vivia por engano
 * dentro do modal, duplicando esta UI.
 *
 * Também é o destino do lápis de uma linha **já inserida** (`GridItens.tsx`,
 * `ListaItensMobile.tsx`) — correção do usuário, 2026-09-03: em vez de editar
 * só a quantidade inline, o lápis carrega a linha inteira aqui (via
 * `useEdicaoItemStore`), preservando quantidade/unidade/preço/desconto/total,
 * e só libera preço/desconto para edição quando `ProdutoPesavelEditavel = 'E'`
 * — em `'S'`/`'B'` (pesável) só a quantidade fica ajustável, mesma regra da
 * inserção; em `''` (não editável) o lápis fica desabilitado na origem.
 * Enquanto isso dura, esta barra e a linha de origem (que fica "vazia" na
 * grid, sem sumir de vez) ganham o mesmo contorno amarelo pulsante
 * (`cc-pulso-edicao`, `global.css`) — pedido do usuário, 2026-09-03: o
 * operador precisa reconhecer à distância que o item não foi cancelado, só
 * voltou pra cá pra revisão.
 *
 * **Três acertos visuais pedidos pelo usuário em 2026-09-03 (AD-136)** — os
 * três reaproximam a barra do desenho em vez de se afastarem dele:
 *
 * 1. Preço unitário e desconto do item passam a ficar **alinhados à
 *    esquerda**, como o total sempre esteve: no Pencil, os três frames de
 *    valor (`kwsQ0`, `BADmf`, `m9FeF`) centralizam só no eixo vertical e
 *    deixam o texto começar na borda esquerda — o `text-right` era invenção da
 *    implementação.
 * 2. O **"R$" persiste** enquanto o operador digita, via `SimboloReal`. O
 *    desenho já traz `R$ 11.824,12` no preço (`pFkT1`) e um "R$" próprio no
 *    desconto (`qhuOQ`); era só o modo editável que perdia o símbolo.
 * 3. O hover do "−" deixa de acender pelo campo inteiro (ver a célula de
 *    quantidade no JSX) e, como toda superfície `secondary`, agora **escurece**
 *    em vez de clarear (`--secondary-hover`, `global.css`).
 *
 * **Um desvio do Pencil** nesse último ponto: o desenho separa o "R$" do
 * desconto em duas tipografias (Inter 12/700 no símbolo, Geist Mono 13/600 no
 * valor) e embute o do preço num texto único em Geist Mono. Aqui os dois
 * campos seguem a forma do desconto — símbolo em `font-sans` fora do
 * `<input>`, valor em `font-mono` dentro — porque um `<input>` comporta uma
 * tipografia só, e o símbolo precisa ficar fora dele para não virar máscara
 * sobre o texto que o operador edita.
 */
export function EntradaRapidaProduto(): ReactElement {
  const { inserirPorCodigo, confirmarEdicao, revisarPorCodigo, confirmarPrevia } =
    useInsercaoDeProduto();
  const { confirmarEdicaoDeLinha } = useEdicaoDeItemExistente();
  // Correção do usuário (2026-09-03): lápis da grid/lista mobile carrega uma
  // linha já inserida de volta para cá via `useEdicaoItemStore` (irmãos em
  // `TelaDeVenda`, sem relação de pai/filho) — ver `linhaEmEdicao` abaixo.
  const linhaEmEdicao = useEdicaoItemStore((estado) => estado.linhaEmEdicao);
  const limparEdicao = useEdicaoItemStore((estado) => estado.limparEdicao);
  const [buscaAberta, setBuscaAberta] = useState(false);
  // Rótulo do campo depende de `SessaoUsuario.UsuarioTipoCodigoProduto`
  // (`GetSessao`) — é configuração da empresa, nunca um texto fixo (mesmo
  // valor que `Tipocodproduto` leva em toda chamada a `GetProduto`, AD-033).
  const contextoPrecificacao = useContextoPrecificacao();
  const rotuloCampoCodigo =
    contextoPrecificacao === null
      ? 'Código do produto'
      : rotuloTipoCodigoProduto(contextoPrecificacao.tipoCodProduto);

  const [texto, setTexto] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [resolvido, setResolvido] = useState<RevisaoProduto | null>(null);
  const [quantidadeTexto, setQuantidadeTexto] = useState(() =>
    formatarQuantidade(QUANTIDADE_INICIAL, 3),
  );
  const [precoTexto, setPrecoTexto] = useState('');
  const [descontoTexto, setDescontoTexto] = useState('0,00');

  const campoCodigo = useRef<HTMLInputElement>(null);
  const campoQuantidade = useRef<HTMLInputElement>(null);
  // Preço e desconto ganharam ref pelo mesmo motivo que a quantidade sempre
  // teve: sair deles com valor inválido devolve o foco ao campo (`exigirCampo`).
  const campoPreco = useRef<HTMLInputElement>(null);
  const campoDesconto = useRef<HTMLInputElement>(null);
  const botaoConfirmar = useRef<HTMLButtonElement>(null);

  // `linhaEmEdicao` (item já inserido, recarregado pelo lápis) e `resolvido`
  // (produto novo em revisão, TAB/busca) nunca coexistem — cada um "vence" o
  // outro no ponto em que passa a existir (ver `aplicarRevisao`/efeito abaixo)
  // — mas os derivados leem os dois porque a UI é a mesma barra.
  const editavel = linhaEmEdicao
    ? linhaEmEdicao.snapshot.pesavelEditavel === 'E'
    : (resolvido?.editavel ?? false);
  const semResolucao = linhaEmEdicao === null && resolvido === null;
  const snapshotAtivo = linhaEmEdicao?.snapshot ?? resolvido?.snapshot ?? null;
  // Desconto de convênio da linha em edição: fixo, nunca digitado pelo
  // operador aqui — só `repricarSku` escreve (`descontoDeConvenio`,
  // `reprecificacao.ts`) — soma no total sem entrar no campo de desconto, que
  // representa exclusivamente o `descontoManual` que este formulário grava.
  const descontoConvenioFixo = linhaEmEdicao?.descontoConvenio ?? ZERO_CENTAVOS;
  const quantidadeLida = lerQuantidadeTexto(quantidadeTexto);
  const precoLido = editavel
    ? lerCentavos(precoTexto)
    : (linhaEmEdicao?.precoUnitario ?? resolvido?.snapshot.precoBase ?? null);
  const descontoManualLido = editavel
    ? lerCentavos(descontoTexto)
    : (linhaEmEdicao?.descontoManual ?? ZERO_CENTAVOS);
  const descontoTotalLido =
    descontoManualLido === null ? null : somar(descontoConvenioFixo, descontoManualLido);

  /**
   * Total da linha como ela entraria na venda — a mesma função do domínio que
   * o carrinho usa (`calcularTotalLinha`), nunca uma subtração local: o total
   * exibido, o total gravado e o total validado precisam ser o mesmo número.
   */
  const totalItemLido =
    quantidadeLida === null || precoLido === null || descontoTotalLido === null
      ? null
      : calcularTotalLinha(precoLido, quantidadeLida, descontoTotalLido);

  /**
   * O desconto digitado consome o item inteiro (pedido do usuário,
   * 2026-09-04). Só é possível em produto `'E'`, o único em que o campo de
   * desconto aceita digitação — nos demais o valor exibido é o da própria linha
   * e o operador não tem como estragá-lo daqui.
   *
   * `calcularTotalLinha` tem piso zero (invariante I8), então um desconto
   * exagerado não produz total negativo: ele produz **zero**, que é exatamente
   * o desfecho que esta guarda existe para recusar — um produto entregue de
   * graça, sem ninguém ser avisado.
   */
  const descontoZeraItem =
    editavel && totalItemLido !== null && totalItemLido < TOTAL_MINIMO_DA_LINHA;

  /**
   * Os três campos digitáveis da prévia são obrigatórios (pedido do usuário,
   * 2026-09-04) — ver os `AVISO_*` no topo do arquivo para o porquê de o zero
   * ser recusado em quantidade e preço, mas não em desconto.
   *
   * `precoInvalido` e `descontoInvalido` só existem quando o campo é de fato
   * digitável (`editavel`): em produto `'S'`/`'B'`/`''` os dois valores vêm do
   * cadastro ou da própria linha, o campo é `readOnly` e o operador não tem
   * como estragá-los daqui — bloqueá-lo por um preço zerado no cadastro seria
   * um beco sem saída, sem campo onde corrigir.
   */
  const quantidadeInvalida = quantidadeLida === null;
  const precoInvalido = editavel && (precoLido === null || precoLido <= ZERO_CENTAVOS);
  const descontoInvalido = editavel && descontoManualLido === null;

  // Foco automático ao resolver (TAB) ou ao recarregar uma linha existente
  // (lápis): produto editável pousa na quantidade — primeiro campo da
  // sequência de revisão, nunca no botão de inserir; não editável não tem
  // nada a decidir além do que o stepper já resolve, então pousa direto no
  // "+" (Enter/clique já confirma, sem exigir mouse).
  useEffect(() => {
    if (resolvido === null) {
      return;
    }
    if (resolvido.editavel) {
      campoQuantidade.current?.focus();
      campoQuantidade.current?.select();
    } else {
      botaoConfirmar.current?.focus();
    }
  }, [resolvido]);

  useEffect(() => {
    if (linhaEmEdicao === null) {
      return;
    }
    // Nova revisão de inserção "vence" uma edição pendente por baixo, se
    // houver (guarda espelhada em `aplicarRevisao`).
    setResolvido(null);
    setTexto(linhaEmEdicao.snapshot.codigoProduto);
    setQuantidadeTexto(formatarQuantidade(linhaEmEdicao.quantidade, 3));
    setPrecoTexto(paraTextoDecimal(linhaEmEdicao.precoUnitario));
    setDescontoTexto(paraTextoDecimal(linhaEmEdicao.descontoManual));
    if (linhaEmEdicao.snapshot.pesavelEditavel === 'E') {
      campoQuantidade.current?.focus();
      campoQuantidade.current?.select();
    } else {
      botaoConfirmar.current?.focus();
    }
  }, [linhaEmEdicao]);

  /**
   * Foco de volta pro código sempre que a barra volta ao estado vazio —
   * depois de confirmar (Enter em qualquer campo ou clique no "+") ou
   * cancelar (Escape). Pedido do usuário (2026-09-03): o operador precisa
   * poder bipar/digitar o próximo item sem tocar no mouse.
   *
   * Precisa ser um efeito, não uma chamada direta dentro de `resetar()`: o
   * campo de código só deixa de estar `disabled` depois que o React aplica
   * `setResolvido(null)`/`limparEdicao()` ao DOM — chamar `.focus()` na mesma
   * função síncrona que dispara esses `set` acontece **antes** desse commit,
   * então o campo ainda está desabilitado no instante da chamada e o
   * navegador ignora o foco em silêncio (achado do usuário: Enter inseria,
   * mas o foco não voltava).
   */
  useEffect(() => {
    if (resolvido === null && linhaEmEdicao === null) {
      campoCodigo.current?.focus();
    }
  }, [resolvido, linhaEmEdicao]);

  /**
   * Foco pedido de fora — hoje só pelo card de cliente, ao concluir uma
   * identificação (pedido do usuário, 2026-09-03).
   *
   * Efeito separado do de cima, e não uma dependência a mais nele: aquele
   * reage ao **estado da própria barra** voltar ao vazio, e reexecutá-lo por
   * um pedido externo roubaria o foco no meio de uma revisão de produto em
   * andamento. Aqui o pedido é explícito, e o guard de `resolvido` preserva a
   * mesma regra — quem está revisando um item não perde o campo.
   */
  const pedidosDeFocoNoCodigo = useFocoVendaStore((estado) => estado.pedidosDeFocoNoCodigo);
  // Sentido inverso: Shift+TAB no campo de código devolve o foco ao card de
  // cliente (ver `aoTeclarNoCodigo`).
  const focarDocumentoCliente = useFocoVendaStore((estado) => estado.focarDocumentoCliente);
  useEffect(() => {
    if (pedidosDeFocoNoCodigo > 0 && resolvido === null) {
      campoCodigo.current?.focus();
    }
    // `resolvido` fora das dependências de propósito: o efeito reage ao
    // pedido, não à barra — incluí-lo faria toda revisão concluída disparar um
    // foco extra em nome de um pedido antigo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedidosDeFocoNoCodigo]);

  function resetar(): void {
    setResolvido(null);
    setTexto('');
    setQuantidadeTexto(formatarQuantidade(QUANTIDADE_INICIAL, 3));
    setPrecoTexto('');
    setDescontoTexto('0,00');
    limparEdicao();
  }

  function alterarQuantidade(delta: number): void {
    const atual = quantidadeLida ?? QUANTIDADE_INICIAL;
    const proxima = delta > 0 ? somarQuantidades(atual, UMA_UNIDADE) : atual - UMA_UNIDADE;
    setQuantidadeTexto(formatarQuantidade(milesimos(Math.max(UMA_UNIDADE, proxima)), 3));
  }

  async function confirmarEntradaRapida(): Promise<void> {
    const entrada = texto.trim();
    if (entrada === '' || ocupado || resolvido !== null) {
      return;
    }

    setOcupado(true);
    try {
      const resultado = await inserirPorCodigo(entrada);

      if (resultado.situacao === 'edicao') {
        // Produto `'E'`: a linha não entra ainda; vira revisão editável,
        // mesmo caminho de quando o TAB resolve um produto `'E'` (`FR-014`).
        // Uma edição de linha existente pendente perde para esta revisão
        // nova (mesma guarda de `aplicarRevisao`).
        limparEdicao();
        setResolvido({
          situacao: 'revisao',
          snapshot: resultado.snapshot,
          quantidade: resultado.quantidade,
          origem: 'MANUAL',
          editavel: true,
        });
        setQuantidadeTexto(formatarQuantidade(resultado.quantidade, 3));
        setPrecoTexto(paraTextoDecimal(resultado.snapshot.precoBase));
        setDescontoTexto('0,00');
        // O código digitado permanece visível no campo (só desabilitado)
        // enquanto o operador revisa — é o que o Pencil mostra (`data-icon-name`
        // "Código digitado" convive com o resto da linha já resolvida).
        return;
      }

      if (resultado.situacao === 'inserido') {
        setTexto('');
      }
      // Em recusa o texto permanece: o operador corrige o que digitou.
      campoCodigo.current?.focus();
    } finally {
      setOcupado(false);
    }
  }

  /**
   * Aplica uma revisão resolvida (`GetProduto`) ao estado local — usada tanto
   * por `resolverEExibir` (TAB) quanto por `selecionarDaBusca` (produto
   * editável/pesável escolhido no modal). Uma edição de linha existente
   * pendente perde para esta revisão nova (mesma guarda de
   * `confirmarEntradaRapida`): o operador está deliberadamente resolvendo
   * outro produto.
   */
  function aplicarRevisao(revisao: RevisaoProduto): void {
    limparEdicao();
    setResolvido(revisao);
    setQuantidadeTexto(formatarQuantidade(revisao.quantidade, 3));
    setPrecoTexto(paraTextoDecimal(revisao.snapshot.precoBase));
    setDescontoTexto('0,00');
  }

  /**
   * Núcleo compartilhado por TAB (`revisarEntrada`, usa `texto` digitado) e
   * pela seleção no modal de busca (`selecionarDaBusca`, usa o código
   * escolhido direto) — os dois resolvem por `GetProduto` via
   * `revisarPorCodigo` e decidem entre inserir direto e mostrar a revisão pelo
   * mesmo critério.
   *
   * **Produto não editável e não pesável (`ProdutoPesavelEditavel === ''`)
   * entra direto no grid** (pedido do usuário, 2026-09-03; antes valia só para
   * a seleção no modal, AD-124, e agora vale também para o TAB): não há preço
   * nem desconto a ajustar (`'E'`) nem etiqueta de balança a interpretar
   * (`'S'`/`'B'`), então a prévia só custaria uma confirmação a mais no ritmo
   * do caixa. Os outros três valores continuam abrindo a revisão na barra.
   */
  async function resolverEExibir(codigo: string, origemForcada?: 'BUSCA'): Promise<void> {
    setOcupado(true);
    try {
      const resultado = await revisarPorCodigo(codigo, origemForcada);
      if (resultado.situacao === 'recusado') {
        campoCodigo.current?.focus();
        return;
      }
      if (resultado.snapshot.pesavelEditavel === '') {
        confirmarPrevia(resultado, resultado.quantidade);
        resetar();
        return;
      }
      // Mesma razão do caminho rápido: o código digitado fica visível durante
      // a revisão, só `resetar()` (confirmar/cancelar) o limpa.
      aplicarRevisao(resultado);
    } finally {
      setOcupado(false);
    }
  }

  async function revisarEntrada(): Promise<void> {
    const entrada = texto.trim();
    if (entrada === '' || ocupado || resolvido !== null) {
      return;
    }
    await resolverEExibir(entrada);
  }

  /**
   * Candidato escolhido no modal de busca (`CART-01`) — o modal só devolve o
   * `CodigoProduto`; carregar no campo, resolver via `GetProduto` e decidir
   * entre inserir direto e mostrar a revisão é responsabilidade desta barra,
   * não do modal.
   *
   * A decisão em si mora em `resolverEExibir`, o mesmo núcleo do TAB: desde a
   * correção do usuário de 2026-09-03 os dois caminhos seguem o critério
   * idêntico, e duplicá-lo aqui deixaria a barra com duas regras que podem
   * divergir.
   */
  async function selecionarDaBusca(codigoProduto: string): Promise<void> {
    if (ocupado) {
      return;
    }
    setTexto(codigoProduto);
    await resolverEExibir(codigoProduto, 'BUSCA');
  }

  /**
   * Confere os campos obrigatórios da prévia na ordem em que o operador os
   * percorre e para no primeiro inválido, avisando e devolvendo o foco a ele.
   *
   * Existe para o Enter, que confirma direto de qualquer campo e não passa por
   * `acaoBloqueavel`: sem esta guarda, Enter com um campo vazio simplesmente
   * não fazia nada — `confirmar()` retornava em silêncio e o operador ficava
   * sem inserção e sem explicação. Pelo botão "+", `bloqueioDeInsercao` já
   * barra antes e diz o mesmo motivo.
   */
  function previaValida(): boolean {
    if (quantidadeInvalida) {
      exigirCampo(campoQuantidade, AVISO_QUANTIDADE_INVALIDA);
      return false;
    }
    if (precoInvalido) {
      exigirCampo(campoPreco, AVISO_PRECO_INVALIDO);
      return false;
    }
    if (descontoInvalido) {
      exigirCampo(campoDesconto, AVISO_DESCONTO_INVALIDO);
      return false;
    }
    return true;
  }

  function confirmar(): void {
    if (!semResolucao && !previaValida()) {
      return;
    }

    // Correção do usuário (2026-09-03): lápis da grid/lista mobile — edita a
    // linha já inserida em vez de criar uma nova (`editarItem` por campo, via
    // `confirmarEdicaoDeLinha`). Produto pesável (`'S'`/`'B'`) só libera a
    // quantidade: `precoLido`/`descontoManualLido` chegam iguais aos da
    // própria linha (campos somente leitura), então `editarItem` não muda
    // nada neles (é idempotente, `carrinhoSlice.ts`).
    if (linhaEmEdicao !== null) {
      if (quantidadeLida === null || precoLido === null || descontoManualLido === null) {
        return;
      }
      confirmarEdicaoDeLinha(linhaEmEdicao, {
        quantidade: quantidadeLida,
        precoUnitario: precoLido,
        descontoManual: descontoManualLido,
      });
      resetar();
      return;
    }

    if (resolvido === null) {
      void confirmarEntradaRapida();
      return;
    }
    if (quantidadeLida === null) {
      return;
    }
    if (resolvido.editavel) {
      if (precoLido === null || descontoManualLido === null) {
        return;
      }
      confirmarEdicao(
        { situacao: 'edicao', snapshot: resolvido.snapshot, quantidade: quantidadeLida },
        {
          quantidade: quantidadeLida,
          precoUnitario: precoLido,
          descontoManual: descontoManualLido,
        },
      );
    } else {
      confirmarPrevia(resolvido, quantidadeLida);
    }
    resetar();
  }

  // Enter só é tratado aqui pra TAB — a inserção/confirmação por Enter é
  // única e vive em `aoTeclarNoCartao` (pedido do usuário, 2026-09-03: Enter
  // confirma a partir de qualquer campo da barra, não só do código).
  function aoTeclarNoCodigo(evento: KeyboardEvent<HTMLInputElement>): void {
    if (evento.key !== 'Tab') {
      return;
    }
    // Shift+TAB volta para o passo anterior do fluxo do caixa: a identificação
    // do cliente (pedido do usuário, 2026-09-04). A ordem natural do DOM
    // levaria ao botão "Recolhido" do cabeçalho do card — um controle de
    // layout, não uma etapa da venda —, e o campo de documento nem é
    // alcançável enquanto o card está recolhido (`inert`). Por isso o pedido
    // vai pelo `focoVendaStore`: quem expande e foca é o `CampoClienteVenda`,
    // dono desse estado.
    if (evento.shiftKey) {
      evento.preventDefault();
      focarDocumentoCliente();
      return;
    }
    // Campo vazio: não há código a revisar, então TAB volta a ser a tecla de
    // navegação e segue para a próxima ação da barra — a lupa de busca, que é
    // o próximo elemento focável no DOM (pedido do usuário, 2026-09-04).
    // Sem isto, o `preventDefault()` abaixo engolia o TAB e o foco ficava
    // preso no campo vazio, obrigando o operador a pegar o mouse para abrir a
    // busca por termo livre.
    if (texto.trim() === '') {
      return;
    }
    // Com código digitado, TAB não sai do campo: no PDV ele é a tecla de
    // revisão, não de navegação (AD-027/AD-063).
    evento.preventDefault();
    void revisarEntrada();
  }

  /**
   * Enter em **qualquer** campo de texto da barra confirma — insere um
   * produto novo ou aplica a edição de um item existente, conforme o estado
   * (`confirmar()` já decide isso). Pedido direto do usuário (2026-09-03):
   * antes só o campo de código reagia a Enter; quantidade/preço/desconto
   * exigiam clicar no "+" com o mouse.
   *
   * Escuta no `<div>` do cartão (não em cada `<input>`) porque o evento sobe
   * por bubbling — um único handler cobre os campos existentes e qualquer um
   * que vier a ser adicionado, sem precisar fiar `onKeyDown` em cada um. O
   * filtro por `HTMLInputElement` exclui os botões (buscar, +/-, confirmar):
   * Enter num botão focado já dispara o `click` nativo dele, e sem o filtro
   * este handler chamaria `confirmar()` de novo por cima, duplicando o efeito.
   */
  function aoTeclarNoCartao(evento: KeyboardEvent<HTMLDivElement>): void {
    if (evento.key === 'Escape' && (resolvido !== null || linhaEmEdicao !== null)) {
      resetar();
      return;
    }
    if (evento.key === 'Enter' && evento.target instanceof HTMLInputElement) {
      evento.preventDefault();
      confirmar();
    }
  }

  const podeConfirmar = semResolucao
    ? !ocupado && texto.trim() !== ''
    : !quantidadeInvalida &&
      !precoInvalido &&
      !descontoInvalido &&
      precoLido !== null &&
      descontoTotalLido !== null &&
      !descontoZeraItem;

  /**
   * Por que o botão de inserir está bloqueado — a frase que o operador lê ao
   * clicar nele bloqueado (padrão de `lib/bloqueio.ts`, pedido do usuário
   * 2026-09-03), ou `null` quando dá para inserir.
   *
   * Os motivos são exatamente os termos de `podeConfirmar`, na mesma ordem:
   * sem esse espelho, o texto poderia dizer uma coisa e o bloqueio responder a
   * outra. Cada campo obrigatório vazio ou zerado responde com o mesmo aviso
   * que `previaValida` dá ao sair dele (pedido do usuário, 2026-09-04) — o
   * operador lê a mesma frase pelos dois caminhos, em vez de um genérico aqui
   * e um específico ali. O desconto que zera o item vem depois dos três porque
   * ele **é** um valor bem formado: o operador digitou um número legítimo que
   * a regra de negócio recusa, e só faz sentido apontá-lo quando não há mais
   * nenhum campo por preencher.
   */
  const bloqueioDeInsercao: MotivoBloqueio = podeConfirmar
    ? null
    : ocupado
      ? 'Aguarde: o produto ainda está sendo consultado no ERP.'
      : semResolucao
        ? 'Digite ou bipe o código do produto para inserir.'
        : quantidadeInvalida
          ? AVISO_QUANTIDADE_INVALIDA
          : precoInvalido
            ? AVISO_PRECO_INVALIDO
            : descontoInvalido
              ? AVISO_DESCONTO_INVALIDO
              : descontoZeraItem
                ? AVISO_DESCONTO_ZERA_ITEM
                : 'Revise quantidade, preço e desconto: há um valor inválido.';

  const classeRotulo = 'font-semibold text-muted-foreground';
  // Sem `flex`: um `<input>` é elemento substituído — `display:flex` nele
  // produz alinhamento inconsistente entre navegadores. A altura fixa
  // (`h-11.5`) já centraliza o texto verticalmente sozinha.
  const classeCampoValor =
    'h-11.5 w-full min-w-0 rounded-xl border border-border bg-muted px-sm font-mono text-md tabular-nums outline-none read-only:cursor-default disabled:cursor-not-allowed disabled:opacity-70';
  // Preço e desconto não usam `classeCampoValor`: a moldura vai para um
  // wrapper e o `<input>` fica transparente dentro dele, para o "R$" caber ao
  // lado do valor sem entrar no `value` (ver `SimboloReal`).
  const classeMolduraValor =
    'flex h-11.5 w-full min-w-0 items-center gap-xs rounded-xl border border-border bg-muted px-sm';
  const classeValorDigitavel =
    'w-full min-w-0 bg-transparent font-mono text-md tabular-nums outline-none read-only:cursor-default';

  // `paraTextoDecimal`, não `formatarCentavos`: quem desenha o "R$" agora é o
  // `SimboloReal` ao lado, e o campo carrega só o número — o mesmo formato nos
  // dois estados, editável ou não.
  const precoExibido = editavel
    ? precoTexto
    : paraTextoDecimal(
        linhaEmEdicao?.precoUnitario ?? resolvido?.snapshot.precoBase ?? ZERO_CENTAVOS,
      );
  // Não editável mostra o desconto real da linha (convênio + manual, mesma
  // soma da coluna "Desconto" da grid) — não `0,00` fixo — quando há uma
  // linha existente carregada; numa inserção nova ainda não há desconto de
  // convênio a mostrar (`descontoConvenioFixo` é `0` nesse caso).
  const descontoExibido = editavel
    ? descontoTexto
    : paraTextoDecimal(somar(descontoConvenioFixo, linhaEmEdicao?.descontoManual ?? ZERO_CENTAVOS));

  return (
    <div
      className={cn(
        'flex flex-col gap-xs rounded-3xl border border-border bg-background p-base',
        // Contorno amarelo pulsante enquanto um item já inserido está
        // carregado aqui para edição (pedido do usuário, 2026-09-03).
        linhaEmEdicao !== null && 'cc-pulso-edicao',
      )}
      data-testid="entrada-rapida-produto"
      onKeyDown={aoTeclarNoCartao}
    >
      <div className="flex items-end gap-sm" data-testid="previa-insercao-produto">
        <label className="flex min-w-0 flex-1 flex-col gap-xxs text-sm">
          <span className="flex items-center gap-xs font-semibold text-muted-foreground">
            <Barcode className="size-4" aria-hidden="true" />
            {rotuloCampoCodigo}
          </span>
          <input
            ref={campoCodigo}
            className="h-11.5 w-full rounded-xl border border-border bg-muted px-3 font-mono"
            data-testid="campo-codigo-produto"
            autoComplete="off"
            autoFocus
            placeholder="Bipe ou digite (use * p/ quantidade)"
            value={texto}
            disabled={resolvido !== null || linhaEmEdicao !== null}
            onChange={(evento) => {
              setTexto(evento.target.value);
            }}
            onKeyDown={aoTeclarNoCodigo}
          />
        </label>

        <Button
          type="button"
          variant="secondary"
          size="icon-sm"
          className="size-11.5 shrink-0 rounded-full"
          aria-label="Buscar produto"
          data-testid="abrir-busca-produto"
          onClick={() => {
            setBuscaAberta(true);
          }}
        >
          <Search className="size-4.5" aria-hidden="true" />
        </Button>

        {/* Única célula que **não** é um `<label>` envolvendo o campo: esta
            contém os botões +/- além do input, e o navegador aplica o
            `:hover` do label ao *labeled control* — o primeiro form control
            descendente, que aqui é o botão "−". Passar o mouse em qualquer
            ponto do campo acendia o "−" (achado do usuário, 2026-09-03).
            Com o rótulo apontando para o input por `htmlFor`, a associação
            acessível continua de pé e o hover do "−" volta a ser só o dele. */}
        <div className="flex min-w-0 flex-1 flex-col gap-xxs text-sm">
          <label className={classeRotulo} htmlFor={ID_CAMPO_QUANTIDADE}>
            Quantidade
          </label>
          <div className="flex h-11.5 items-center justify-between gap-xs rounded-xl border border-border bg-muted px-xs">
            <Button
              type="button"
              variant="secondary"
              size="icon-sm"
              className="size-8 shrink-0 rounded-full bg-background"
              aria-label="Diminuir quantidade"
              data-testid="previa-quantidade-diminuir"
              onClick={() => {
                alterarQuantidade(-1);
              }}
            >
              <Minus className="size-4" aria-hidden="true" />
            </Button>
            <input
              ref={campoQuantidade}
              id={ID_CAMPO_QUANTIDADE}
              className="h-full w-full min-w-0 bg-transparent text-center font-mono text-lg tabular-nums outline-none"
              inputMode="decimal"
              data-testid="previa-quantidade"
              value={quantidadeTexto}
              onChange={(evento) => {
                setQuantidadeTexto(evento.target.value);
              }}
              // Quantidade vazia ou zerada não sai do campo (pedido do
              // usuário, 2026-09-04). Só vale com um produto em revisão: com a
              // barra vazia nada do que está aqui entra na venda — a inserção
              // rápida pelo código usa o multiplicador do próprio código
              // ("2*7891...", `confirmarEntradaRapida`) —, e prender o foco num
              // campo que ninguém vai ler impediria o operador de bipar o
              // próximo item.
              onBlur={() => {
                if (!semResolucao && quantidadeInvalida) {
                  exigirCampo(campoQuantidade, AVISO_QUANTIDADE_INVALIDA);
                }
              }}
            />
            <Button
              type="button"
              variant="secondary"
              size="icon-sm"
              className="size-8 shrink-0 rounded-full bg-background"
              aria-label="Aumentar quantidade"
              data-testid="previa-quantidade-aumentar"
              onClick={() => {
                alterarQuantidade(1);
              }}
            >
              <Plus className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </div>

        <label className="flex min-w-0 flex-1 flex-col gap-xxs text-sm">
          <span className={classeRotulo}>Unidade</span>
          <input
            className={cn(classeCampoValor, semResolucao && 'text-muted-foreground')}
            data-testid="previa-unidade"
            // `disabled`, não só `readOnly` (pedido do usuário, 2026-09-03): a
            // unidade vem do cadastro e o operador nunca pode alterá-la — o
            // campo some da navegação por TAB em vez de só recusar digitação.
            disabled
            value={snapshotAtivo?.unidadeMedida ?? 'UN'}
          />
        </label>

        <label className="flex min-w-0 flex-1 flex-col gap-xxs text-sm">
          <span className={classeRotulo}>Preço unitário</span>
          <span className={classeMolduraValor}>
            <SimboloReal testId="previa-preco-unitario-simbolo" />
            <input
              ref={campoPreco}
              className={cn(classeValorDigitavel, semResolucao && 'text-muted-foreground')}
              inputMode="decimal"
              data-testid="previa-preco-unitario"
              readOnly={!editavel}
              value={precoExibido}
              onChange={(evento) => {
                if (editavel) {
                  setPrecoTexto(evento.target.value);
                }
              }}
              // Preço vazio ou zerado não sai do campo (pedido do usuário,
              // 2026-09-04) — só onde há campo para corrigir, isto é, em
              // produto `'E'` (`precoInvalido` já embute o `editavel`).
              onBlur={() => {
                if (precoInvalido) {
                  exigirCampo(campoPreco, AVISO_PRECO_INVALIDO);
                }
              }}
            />
          </span>
        </label>

        <label className="flex min-w-0 flex-1 flex-col gap-xxs text-sm">
          <span className={classeRotulo}>Desconto do item</span>
          <span className={classeMolduraValor}>
            <SimboloReal testId="previa-desconto-item-simbolo" />
            <input
              ref={campoDesconto}
              className={cn(classeValorDigitavel, semResolucao && 'text-muted-foreground')}
              inputMode="decimal"
              data-testid="previa-desconto-item"
              readOnly={!editavel}
              value={descontoExibido}
              onChange={(evento) => {
                if (editavel) {
                  setDescontoTexto(evento.target.value);
                }
              }}
              // Avisa ao **sair do campo**, não a cada tecla (pedido do
              // usuário, 2026-09-04): digitar "10,00" num item de 10,00 passa
              // por "1", "1,0"… e cada passagem dispararia um toast idêntico
              // sobre um valor que o operador ainda está escrevendo. Mesma
              // política do desconto de capa, que aplica no `blur` e no Enter.
              // O texto permanece no campo para ser corrigido; quem impede a
              // inserção é `bloqueioDeInsercao`.
              //
              // Campo vazio vem primeiro e **prende o foco**: sem número
              // nenhum não há total a conferir, então o aviso de desconto que
              // zera o item nem chega a fazer sentido. O desconto grande
              // demais continua só avisando, sem tomar o foco — o valor está
              // escrito e o operador decide se reduz ou desiste do item.
              onBlur={() => {
                if (descontoInvalido) {
                  exigirCampo(campoDesconto, AVISO_DESCONTO_INVALIDO);
                  return;
                }
                if (descontoZeraItem) {
                  gooeyToast.warning(AVISO_DESCONTO_ZERA_ITEM);
                }
              }}
            />
          </span>
        </label>

        <label className="flex min-w-0 flex-1 flex-col gap-xxs text-sm">
          <span className={classeRotulo}>Total item</span>
          <strong
            className={cn(
              'flex h-11.5 items-center rounded-xl bg-secondary px-sm font-mono text-lg tabular-nums',
              semResolucao ? 'text-muted-foreground' : 'text-primary',
            )}
            data-testid="previa-total-item"
          >
            {formatarCentavos(totalItemLido ?? ZERO_CENTAVOS)}
          </strong>
        </label>

        <Button
          ref={botaoConfirmar}
          type="button"
          className="h-11.5 w-[70px] shrink-0 rounded-full"
          aria-label={
            linhaEmEdicao === null ? 'Adicionar item à venda' : 'Confirmar edição do item'
          }
          data-testid="previa-confirmar"
          {...atributosDeBloqueio(bloqueioDeInsercao)}
          onClick={acaoBloqueavel(bloqueioDeInsercao, confirmar)}
        >
          <Plus className="size-5" aria-hidden="true" />
        </Button>
      </div>

      <p className="text-sm font-medium text-foreground" data-testid="previa-descricao-produto">
        {snapshotAtivo?.descricao ?? ' '}
      </p>

      <ModalBuscaProduto
        aberto={buscaAberta}
        onFechar={() => {
          setBuscaAberta(false);
        }}
        onProdutoSelecionado={(codigoProduto) => {
          void selecionarDaBusca(codigoProduto);
        }}
      />
    </div>
  );
}
