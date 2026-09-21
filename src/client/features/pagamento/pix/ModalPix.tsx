import { AlertTriangle, ChatRound, CheckCircle, Copy, Qr, Refresh, Send, X } from 'reicon-react';
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { notificar } from '@/lib/notificar';
import { Button } from '@/components/ui/button';
import { acaoBloqueavel, atributosDeBloqueio, type MotivoBloqueio } from '@/lib/bloqueio';
import { useFocoDeModal } from '@/lib/useFocoDeModal';
import type { EstadoDisplay } from '../../../../shared/display';
import type { ClienteVenda } from '../../../domain/cliente/clienteVenda';
import type { CobrancaPix } from '../../../domain/pix/cobrancaPix';
import { MENSAGEM_POR_MOTIVO_FALHA } from '../../../domain/pix/interpretarStatusPix';
import {
  normalizarTelefoneWhatsapp,
  preencherDestinoWhatsapp,
} from '../../../domain/pix/destinoWhatsapp';
import { montarDadosPagador } from '../../../domain/pix/montarDadosPagador';
import { validarValorMinimoPix } from '../../../domain/pix/validarValorMinimoPix';
import { formatarCentavos, type Centavos } from '../../../domain/precificacao/dinheiro';
import { enviarPixPorWhatsapp } from '../../../services/pix/envioWhatsappMutation';
import { useGerarPix, useStatusPix, type PixQueriesDeps } from '../../../services/pix/pixQueries';
import {
  AVISO_DESASSOCIACAO_MANUAL,
  CHAMADA_PIX_NAO_E_CANCELADO,
  DESTAQUE_PIX_SEGUE_NO_BANCO,
} from './avisosPix';
import { DialogoConfirmacaoDestrutiva } from '../DialogoConfirmacaoDestrutiva';

/**
 * Janela de cobrança PIX (T016–T018, T021–T022) — réplica do frame
 * "PDV Online Web - Modal PIX" (`design/CentriumCheckout.pen`, nó `j3pJA`).
 *
 * **O MCP do Pencil não conectou nesta sessão** (`CONNECTION_CLOSED`); a leitura
 * foi feita direto no `.pen`, que é JSON legível e é a mesma fonte que o MCP
 * serve (alternativa já registrada em 2026-09-03). Nenhum valor visual abaixo
 * foi escolhido por conta própria.
 *
 * Estrutura do nó, item a item: cartão de 480px, raio 24, `$canvas`, hairline de
 * 1px; cabeçalho (`lSsvw`) de 78px com borda inferior, disco `$success-soft` de
 * 42px com o ícone `qr-code` de 20px em `$success` (o `Qr` do reicon — ver AD-201), título "Pagamento via
 * PIX" (Inter 20/600) e subtítulo "Aguardando pagamento" (Inter 13/500); corpo
 * (`r6UdER`) com 28px de folga vertical, 24px lateral e `gap: 20`, contendo o
 * cartão do QR Code (`DRKJh`, raio 16, hairline, 16px de folga, imagem de
 * 200×200), a instrução centralizada (`v2iVz`, Inter 13/400, `line-height` 1.4),
 * a faixa "copia e cola" (`HVY3r`, `$surface-soft`, raio 12, hairline, `padding:
 * 10px 12px`) com o código em **Geist Mono 11/400** e o botão circular de 32px
 * com o ícone `copy` de 16px, o bloco escuro "Valor a cobrar" (`ZgrCz`,
 * `$surface-dark`, raio 20, rótulo 13/400 em `#8E99A8` e valor em **Geist Mono
 * 32/600** branco) e a badge `$success-soft` (`hKvqW`) com o ponto de 7px e o
 * texto "Aguardando confirmação" em `$success-ink`; rodapé (`N4kBap`) de 60px
 * com borda superior e o botão pílula do rodapé (`nl8xt`, 36px de altura,
 * `$surface-strong`, ícone `x` de 15px).
 *
 * **Quatro estados sem nó correspondente no `.pen`.** O desenho modela um único
 * instante — a cobrança já gerada, aguardando pagamento. Os outros existem de
 * fato e precisam de tela:
 *
 * 1. **Gerando** — o corpo mostra o mesmo cartão do QR Code com o shimmer já
 *    usado no skeleton de carregamento (`cc-shimmer`), e não um spinner novo: a
 *    caixa que vai receber o QR Code é a que precisa comunicar espera, e assim o
 *    layout não salta quando a imagem chega.
 * 2. **Erro de geração** (`research.md` D12) — painel de alerta no lugar do QR
 *    Code, com "Tentar novamente" no rodapé. O toast anuncia a falha; o painel é
 *    o que mantém o motivo na tela depois que o toast some.
 * 3. **Valor abaixo do mínimo** (`FR-009`) — a janela **não chega a aparecer**:
 *    avisa por toast e devolve o desfecho na mesma passagem, sem tocar a rede.
 * 4. **Aprovado** (novo, 2026-09-04) — ver "A janela sobrevive à aprovação",
 *    abaixo.
 *
 * ---
 *
 * ### A janela trava enquanto o pagamento não é aprovado (pedido do usuário, 2026-09-04)
 *
 * **Regra vigente:** enquanto o PIX não é dado por pago, a janela não fecha por
 * gesto acidental — ESC não faz nada e o `X` do cabeçalho fica bloqueado. A
 * única saída é o botão do rodapé, **"Desistir da operação"**, e ele passa por
 * uma confirmação explícita antes de abandonar a cobrança.
 *
 * Isto substitui o desenho original em dois pontos, e os dois foram decisão
 * direta do usuário:
 *
 * - o cabeçalho ganhou um `X` que o `.pen` não tem — ele existe para o estado
 *   **aprovado**, em que fechar é inofensivo e o operador precisa de um gesto
 *   óbvio para seguir a venda;
 * - o rodapé deixou de dizer "Cancelar operação" e passou a dizer "Desistir da
 *   operação". O rótulo anterior prometia um cancelamento que o Checkout não
 *   executa: não há endpoint de cancelamento de PIX no contrato (invariante J5),
 *   e quem cancela de fato é o banco. Um botão que promete cancelar e apenas
 *   remove a forma da tela é a pior espécie de falso positivo num caixa.
 *
 * A confirmação existe porque o gesto é irreversível **do lado de fora**: a
 * cobrança já pode ter sido registrada, e a partir daqui ninguém no Checkout
 * consegue desfazê-la.
 *
 * ### A janela sobrevive à aprovação por 10 segundos
 *
 * Ao detectar `APROVADO`, `onAprovado` é chamado na hora — o pagamento vira
 * `APROVADO` no `vendaStore` imediatamente, e nenhum dinheiro fica invisível
 * para a venda. O que muda é que a janela **não desmonta junto**: ela troca para
 * o estado aprovado (disco verde, badge "Pagamento confirmado") e só chama
 * `onFechar` 10 segundos depois. É o tempo de o operador ver que deu certo antes
 * de a tela voltar para a venda; nesse intervalo o `X` e o ESC já funcionam,
 * para quem não quiser esperar.
 *
 * Isso exige que quem monta a janela a mantenha montada depois da aprovação —
 * ver `usePixPendente` em `ListaPagamentosAplicados.tsx`, que passou a seguir o
 * `idPagamento` exibido em vez de só procurar um pagamento pendente.
 *
 * ### Nenhuma chamada de cancelamento é feita, em nenhum caminho
 *
 * Invariante J5 (`research.md` D11): não existe endpoint para isso no contrato.
 * Desistir da cobrança pendente — ou receber uma falha terminal do ERP — apenas
 * remove o pagamento local e avisa o operador de onde a cobrança se resolve.
 *
 * **Desistência manual e falha terminal convergem no mesmo call site** (T022,
 * `data-model.md` §4): `abandonar()` é uma função só, acionada por dois gatilhos
 * diferentes. Dois caminhos de código para o mesmo desfecho divergiriam com o
 * tempo — e o desfecho aqui é o que decide se a venda fica com um pagamento
 * órfão em `PENDENTE_INTEGRACAO`.
 *
 * Não importa `vendaStore` (Dependency Inversion, Constitution II): tudo chega
 * por prop, e `onAprovado`/`onAbandonado` são os únicos pontos de contato com o
 * resto da aplicação.
 */
export interface ModalPixProps {
  /** `PagamentoAplicado.formaCodigo` — vira `FPgCod` no corpo de `GerarPIX`. */
  readonly formaCodigo: number;
  /**
   * Valor **desta** cobrança, em centavos.
   *
   * Divergência consciente de `contracts/pix-domain-api.md` §3, que nomeia a
   * prop `saldoRestante`: quem chega aqui é `PagamentoAplicado.valorAplicado`,
   * já limitado ao saldo por `derivarValores` (feature 008). Nos cenários do
   * quickstart os dois números coincidem — é o mesmo `60,00` do Cenário 6 —, mas
   * eles se separam num split em que o operador cobra **parte** do saldo por
   * PIX: aí o correto é o valor da forma inserida, não o resto todo da venda.
   * Manter o nome antigo prometeria um número que a prop não carrega.
   */
  readonly valor: Centavos;
  /** `ConfiguracoesPIX.MinimoPix` já em centavos (`research.md` D13). */
  readonly minimoPix: Centavos;
  /**
   * `ConfiguracoesPIX.TempoEspera` em segundos, já com o padrão aplicado —
   * vira `TrnTempoExpiracaoPIX` no corpo de `GerarPIX` (AD-251).
   *
   * Vem por prop, como `minimoPix`, e não de uma leitura própria do catálogo:
   * quem conhece a query é o call site, e o modal segue sem saber o que é
   * TanStack Query.
   */
  readonly tempoExpiracaoPix: number;
  readonly clienteAtual: ClienteVenda | null;
  /** Chama `confirmarPagamentoIntegrado(idPagamento, { pixGuid })` (feature 008). */
  readonly onAprovado: (pixGuid: string) => void;
  /** Chama `recusarPagamentoIntegrado(idPagamento, motivo)` (feature 008). */
  readonly onAbandonado: (motivo: string) => void;
  readonly onFechar: () => void;
  /** Injetável só para teste — ver `PixQueriesDeps.intervaloMs`. */
  readonly deps?: PixQueriesDeps;
  /**
   * Quanto tempo a janela permanece na tela depois da aprovação.
   *
   * Injetável **só** para teste, pelo mesmo motivo de `intervaloMs`: um teste
   * que esperasse 10 segundos reais mediria o agendador, não o comportamento. O
   * padrão é o que o usuário pediu.
   */
  readonly atrasoFechamentoMs?: number;
  /**
   * Espelho da janela na tela virada ao cliente (feature 015, contrato §7).
   *
   * **Uma** prop, opcional, e o modal continua sem saber o que é aba, canal ou
   * display: recebe uma função e a chama, exatamente como já faz com
   * `onAprovado`/`onAbandonado` — o que preserva a Interface Segregation que
   * este TSDoc defende acima. Quem a liga ao canal é `usePixPendente`
   * (`ListaPagamentosAplicados.tsx`), e sem ela a janela funciona igual.
   */
  readonly onEstadoDisplay?: (estado: EstadoDisplay) => void;
}

export const MOTIVO_FECHADO_PELO_OPERADOR = 'FECHADO_PELO_OPERADOR';
export const MOTIVO_ABAIXO_DO_MINIMO = 'VALOR_ABAIXO_DO_MINIMO';

/**
 * Reexportado de `avisosPix.ts` para não quebrar quem já importava a constante
 * daqui (os testes de integração da 009, entre outros). A definição mora lá
 * porque quatro telas de três features diferentes a usam.
 */
export { AVISO_DESASSOCIACAO_MANUAL };

/** Pedido do usuário (2026-09-04): 10 segundos entre a aprovação e o fechamento. */
export const MS_FECHAMENTO_APOS_APROVACAO = 10_000;

/**
 * Frase do `X` bloqueado. Diz o que falta acontecer, não "não pode": num caixa,
 * a pergunta do operador é sempre "e agora?", e a resposta é o botão do rodapé.
 */
const MOTIVO_JANELA_TRAVADA =
  'Aguarde a confirmação do pagamento. Se o cliente desistiu, use "Desistir da operação".';

const DEPS_VAZIAS: PixQueriesDeps = {};

export function ModalPix({
  formaCodigo,
  valor,
  minimoPix,
  tempoExpiracaoPix,
  clienteAtual,
  onAprovado,
  onAbandonado,
  onFechar,
  deps = DEPS_VAZIAS,
  atrasoFechamentoMs = MS_FECHAMENTO_APOS_APROVACAO,
  onEstadoDisplay,
}: ModalPixProps): ReactElement | null {
  const [cobranca, setCobranca] = useState<CobrancaPix | null>(null);
  /** Desliga o polling na **mesma renderização** que processa o desfecho (J3). */
  const [resolvido, setResolvido] = useState(false);
  /** Pagamento confirmado: libera o fechamento e agenda o automático. */
  const [aprovado, setAprovado] = useState(false);
  const [confirmandoDesistencia, setConfirmandoDesistencia] = useState(false);
  const [copiado, setCopiado] = useState(false);
  /**
   * Envio da cobrança por WhatsApp (pedido do usuário, 2026-09-21).
   *
   * O formulário nasce fechado: quem abre é o botão, e é esse gesto que o
   * pedido descreve ("ao pressionar o botão, deverá disponibilizar dois campos
   * para edição"). Fechado ele custa uma linha de altura, o que preserva a
   * densidade que AD-233 conquistou para o celular.
   */
  const [envioAberto, setEnvioAberto] = useState(false);
  /**
   * Preenchimento calculado **uma vez**, na montagem.
   *
   * Lazy initializer, e não `useMemo` sobre `clienteAtual`: se o cliente
   * mudasse no meio do preenchimento, um `useMemo` reescreveria por baixo o que
   * o operador já digitou. Na prática a venda não troca de cliente com um
   * pagamento pendente (AD-209) — o que torna a diferença invisível em
   * produção e, exatamente por isso, o tipo de acoplamento que não se deve
   * deixar armado.
   */
  const [destinoInicial] = useState(() => preencherDestinoWhatsapp(clienteAtual));
  const [nomeDestino, setNomeDestino] = useState(destinoInicial.nome);
  const [telefoneDestino, setTelefoneDestino] = useState(destinoInicial.telefone);
  const [enviandoWhatsapp, setEnviandoWhatsapp] = useState(false);
  const [enviadoWhatsapp, setEnviadoWhatsapp] = useState(false);
  /**
   * Substitui o laço de foco próprio desta janela (AD-170). O ouvinte local só
   * via a tecla com o foco já dentro, não devolvia o foco ao fechar, e não
   * cedia a vez à confirmação de desistência que abre por cima dela.
   */
  const janelaRef = useFocoDeModal<HTMLDivElement>(true);

  /**
   * Um desfecho por cobrança. Sem esta trava, a aprovação detectada num tick
   * poderia ser reprocessada no render seguinte e `confirmarPagamentoIntegrado`
   * seria chamada duas vezes — o slice já ignora a segunda (só
   * `PENDENTE_INTEGRACAO` transiciona), mas a auditoria registraria dois eventos
   * `FORMA_PAGAMENTO_APLICADA` para um pagamento só.
   */
  const desfechoEmitido = useRef(false);
  /**
   * Uma geração por montagem. O `StrictMode` do React 19 executa o efeito duas
   * vezes em desenvolvimento; sem a trava, o operador veria um QR Code enquanto
   * uma **segunda cobrança real** ficasse órfã no adquirente, sem caminho de
   * cancelamento.
   */
  const geracaoIniciada = useRef(false);

  const { gerar, status, erro } = useGerarPix(deps);
  const { resultado } = useStatusPix(
    cobranca?.trnGuid ?? '',
    cobranca !== null && !resolvido,
    deps,
  );

  const abaixoDoMinimo = !validarValorMinimoPix(valor, minimoPix).ok;
  // Derivado aqui, e não junto do JSX como antes: o efeito que alimenta a tela
  // do cliente precisa dele, e todo hook tem de ficar acima do retorno
  // antecipado de `abaixoDoMinimo`.
  const emErro = status === 'erro' && cobranca === null;

  const gerarCobranca = useCallback((): void => {
    void gerar({
      formaCodigo,
      valor,
      pagador: montarDadosPagador(clienteAtual),
      tempoExpiracaoSegundos: tempoExpiracaoPix,
    })
      .then(setCobranca)
      .catch(() => {
        // O motivo já está em `erro` e vira painel + toast abaixo. Engolir aqui
        // é o que impede a rejeição de virar `unhandledrejection` — o desfecho
        // dela é uma tela, não uma exceção.
        notificar.erro('Não foi possível gerar a cobrança PIX. Tente novamente.');
      });
  }, [gerar, formaCodigo, valor, clienteAtual, tempoExpiracaoPix]);

  /** Desistência manual e falha terminal: **um** caminho de código (T022). */
  const abandonar = useCallback(
    (motivo: string, mensagem: string): void => {
      if (desfechoEmitido.current) {
        return;
      }
      desfechoEmitido.current = true;
      setResolvido(true);
      notificar.aviso(mensagem);
      onAbandonado(motivo);
      onFechar();
    },
    [onAbandonado, onFechar],
  );

  // `FR-009`: o bloqueio acontece **antes** de qualquer rede, e a janela não
  // chega a ser desenhada. O pagamento pendente que a feature 008 acabou de
  // inserir precisa sair junto — deixá-lo na lista travaria a venda num
  // `PENDENTE_INTEGRACAO` que nada mais resolveria.
  useEffect(() => {
    if (!abaixoDoMinimo || desfechoEmitido.current) {
      return;
    }
    desfechoEmitido.current = true;
    notificar.aviso(
      `O valor mínimo para cobrança PIX é ${formatarCentavos(minimoPix)}. Escolha outra forma de pagamento.`,
    );
    onAbandonado(MOTIVO_ABAIXO_DO_MINIMO);
    onFechar();
  }, [abaixoDoMinimo, minimoPix, onAbandonado, onFechar]);

  useEffect(() => {
    if (abaixoDoMinimo || geracaoIniciada.current) {
      return;
    }
    geracaoIniciada.current = true;
    gerarCobranca();
  }, [abaixoDoMinimo, gerarCobranca]);

  // Cada resultado do polling passa por `interpretarStatusPix` (já aplicado no
  // mapper). `PENDENTE` não faz nada — aguarda o próximo tick (`FR-001`).
  useEffect(() => {
    if (resultado === null || cobranca === null || desfechoEmitido.current) {
      return;
    }
    if (resultado.situacao === 'PENDENTE') {
      return;
    }
    if (resultado.situacao === 'APROVADO') {
      desfechoEmitido.current = true;
      setResolvido(true);
      // O pagamento entra aprovado na venda **agora**; só a janela é que espera.
      // Adiar também `onAprovado` deixaria o total da venda mentindo por 10s.
      setAprovado(true);
      onAprovado(cobranca.trnGuid);
      return;
    }
    abandonar(
      resultado.motivo,
      `${MENSAGEM_POR_MOTIVO_FALHA[resultado.motivo]} ${AVISO_DESASSOCIACAO_MANUAL}`,
    );
  }, [resultado, cobranca, onAprovado, abandonar]);

  // Fechamento automático. `atrasoFechamentoMs <= 0` fecha na próxima volta do
  // laço de eventos em vez de agendar — é o que permite ao teste checar o estado
  // aprovado sem depender de relógio.
  useEffect(() => {
    if (!aprovado) {
      return;
    }
    const temporizador = setTimeout(onFechar, Math.max(atrasoFechamentoMs, 0));
    return () => {
      clearTimeout(temporizador);
    };
  }, [aprovado, atrasoFechamentoMs, onFechar]);

  /**
   * Desiste da cobrança. Chamado pela confirmação — nunca direto por um clique,
   * exceto quando não há cobrança nenhuma a desassociar.
   */
  const desistir = useCallback((): void => {
    setConfirmandoDesistencia(false);
    // Sem cobrança gerada não há o que desassociar: o erro de geração é o caso
    // em que nada chegou ao ERP, e avisar sobre o banco ali mandaria o operador
    // procurar uma cobrança inexistente.
    if (cobranca === null) {
      if (!desfechoEmitido.current) {
        desfechoEmitido.current = true;
        onAbandonado(MOTIVO_FECHADO_PELO_OPERADOR);
        onFechar();
      }
      return;
    }
    abandonar(
      MOTIVO_FECHADO_PELO_OPERADOR,
      `Cobrança PIX encerrada sem confirmação de pagamento. ${AVISO_DESASSOCIACAO_MANUAL}`,
    );
  }, [cobranca, abandonar, onAbandonado, onFechar]);

  /** Gesto do rodapé: pede confirmação quando existe cobrança viva. */
  const pedirDesistencia = useCallback((): void => {
    if (cobranca === null) {
      desistir();
      return;
    }
    setConfirmandoDesistencia(true);
  }, [cobranca, desistir]);

  // ESC só fecha **depois** de aprovado (pedido do usuário, 2026-09-04). Com a
  // cobrança pendente a tecla é deliberadamente inerte: era o gesto que mais
  // facilmente deixava uma cobrança órfã no banco sem o operador perceber.
  // Ouvinte de `window`, como nos demais modais desta base: um `onKeyDown` no
  // backdrop só dispara com o foco dentro do modal, e um clique no fundo faria a
  // tecla parar de funcionar.
  useEffect(() => {
    const aoTeclar = (evento: globalThis.KeyboardEvent): void => {
      if (evento.key === 'Escape' && aprovado) {
        onFechar();
      }
    };
    window.addEventListener('keydown', aoTeclar);
    return () => {
      window.removeEventListener('keydown', aoTeclar);
    };
  }, [aprovado, onFechar]);

  /**
   * Espelho na tela do cliente (feature 015, contrato §7 / research D11).
   *
   * "Gerando" e "erro" mapeiam para **repouso** de propósito: não há QR a
   * mostrar, e um esqueleto na tela virada ao cliente prometeria algo que ainda
   * pode falhar (FR-010); o erro é conversa com o operador (FR-011).
   *
   * `resolvido` sem aprovação é abandono a caminho da desmontagem — a cobrança
   * já não vale, e deixá-la na tela do cliente é o começo do cenário em que o
   * **próximo** cliente paga a cobrança do anterior.
   */
  useEffect(() => {
    if (onEstadoDisplay === undefined) {
      return;
    }
    if (abaixoDoMinimo || emErro || cobranca === null) {
      onEstadoDisplay({ tela: 'BOAS_VINDAS' });
      return;
    }
    if (aprovado) {
      onEstadoDisplay({
        tela: 'PIX_APROVADO',
        trnGuid: cobranca.trnGuid,
        valorCentavos: cobranca.valor,
        // Da **instância**, não da constante importada: assim o que o cliente vê
        // contando acompanha o que esta janela de fato vai esperar antes de
        // fechar, e as duas telas voltam juntas (research D6, FR-024).
        voltaEmMs: atrasoFechamentoMs,
      });
      return;
    }
    if (resolvido) {
      // Resolvido sem aprovação é abandono a caminho da desmontagem. A cobrança
      // já não vale, e deixá-la na tela do cliente é o começo do cenário em que
      // o **próximo** cliente paga a cobrança do anterior.
      onEstadoDisplay({ tela: 'BOAS_VINDAS' });
      return;
    }
    onEstadoDisplay({
      tela: 'PIX_AGUARDANDO',
      trnGuid: cobranca.trnGuid,
      // Inteiro cru: a marca `Centavos` não sobrevive ao clone do canal, e
      // fingir que sobrevive seria um `as` não justificado (research D5).
      valorCentavos: cobranca.valor,
      qrCodeFonte: cobranca.qrCodeFonte,
      copiaECola: cobranca.copiaECola,
    });
  }, [onEstadoDisplay, abaixoDoMinimo, emErro, cobranca, resolvido, aprovado, atrasoFechamentoMs]);

  /**
   * Repouso ao desmontar, em efeito **próprio** e com dependências vazias.
   *
   * Pendurar este cleanup no efeito acima o faria disparar a cada transição —
   * `PIX_AGUARDANDO` → `BOAS_VINDAS` → `PIX_APROVADO` —, e a tela do cliente
   * piscaria o repouso no meio de uma cobrança viva. A referência mantém a
   * função atual sem reabrir o efeito.
   */
  const onEstadoDisplayRef = useRef(onEstadoDisplay);
  onEstadoDisplayRef.current = onEstadoDisplay;
  useEffect(() => {
    return () => {
      onEstadoDisplayRef.current?.({ tela: 'BOAS_VINDAS' });
    };
  }, []);

  if (abaixoDoMinimo) {
    return null;
  }

  async function copiarCodigo(): Promise<void> {
    if (cobranca === null || cobranca.copiaECola === '') {
      return;
    }
    try {
      await navigator.clipboard.writeText(cobranca.copiaECola);
      setCopiado(true);
    } catch {
      // Área de transferência negada pelo navegador (contexto inseguro, permissão
      // recusada). O código continua visível e selecionável na tela — dizer o que
      // aconteceu é melhor do que um botão que não responde.
      notificar.erro('Não foi possível copiar o código. Selecione e copie manualmente.');
    }
  }

  const telefoneNormalizado = normalizarTelefoneWhatsapp(telefoneDestino);

  /**
   * Por que o envio pode estar barrado — sempre com a frase que diz o que
   * fazer, nunca um `disabled` mudo (`lib/bloqueio.ts`).
   *
   * **O número é exigido nos dois cenários, o nome só no cliente default.** É a
   * leitura literal do pedido: sem destino não existe envio possível, então a
   * condicionalidade que o usuário descreveu recai sobre o nome — obrigatório
   * quando o cliente é o default, opcional quando já veio do cadastro.
   *
   * Sem cliente na venda o envio não acontece de jeito nenhum: `CliCod` é
   * parâmetro do contrato e o Checkout não tem código nenhum a pôr ali.
   * Preencher com `0` seria inventar um cliente — a mesma armadilha que
   * `listaPreco` recusa em `clienteVenda.ts`.
   */
  const bloqueioDoEnvioWhatsapp: MotivoBloqueio = enviandoWhatsapp
    ? 'Enviando a cobrança. Aguarde a resposta do ERP.'
    : clienteAtual === null
      ? 'Identifique o cliente da venda para enviar a cobrança por WhatsApp.'
      : destinoInicial.nomeObrigatorio && nomeDestino.trim() === ''
        ? 'Informe o nome do cliente para enviar a cobrança.'
        : telefoneNormalizado === null
          ? 'Informe o número de destino com DDD, por exemplo (11) 98765-4321.'
          : null;

  async function enviarPorWhatsapp(): Promise<void> {
    // As três guardas repetem o que `bloqueioDoEnvioWhatsapp` já impede na
    // tela. Ficam aqui porque são o que estreita os tipos para o contrato do
    // ERP — e porque um caminho novo de disparo (um atalho de teclado, um
    // reenvio automático) não pode contornar a checagem só por não passar pelo
    // botão.
    if (cobranca === null || clienteAtual === null || telefoneNormalizado === null) {
      return;
    }

    setEnviandoWhatsapp(true);
    const resultado = await enviarPixPorWhatsapp(
      {
        trnGuid: cobranca.trnGuid,
        codigoCliente: clienteAtual.codigoCliente,
        telefone: telefoneNormalizado,
        nome: nomeDestino.trim(),
      },
      deps,
    );
    setEnviandoWhatsapp(false);

    switch (resultado.estado) {
      case 'enviado':
        setEnviadoWhatsapp(true);
        // Fecha o formulário: o gesto terminou, e manter os campos abertos
        // convidaria ao segundo envio acidental da mesma cobrança.
        setEnvioAberto(false);
        notificar.sucesso('Cobrança PIX enviada para o WhatsApp do cliente.');
        return;
      case 'recusado':
        // A frase é do ERP — ele sabe por que recusou ("telefone inválido",
        // "integração não configurada"), e traduzi-la para um genérico tiraria
        // do operador a única informação acionável.
        notificar.aviso(resultado.motivo);
        return;
      case 'falhou':
        notificar.erro(`${resultado.motivo} A cobrança continua válida na tela.`);
        return;
    }
  }

  const bloqueioDoFechar: MotivoBloqueio = aprovado ? null : MOTIVO_JANELA_TRAVADA;

  return (
    <div
      className="cc-backdrop-entra fixed inset-0 z-50 flex items-start justify-center bg-[color-mix(in_srgb,var(--cc-color-ink)_40%,transparent)] px-base pt-3 md:px-lg md:pt-9"
      data-testid="modal-pix"
    >
      <div
        ref={janelaRef}
        role="dialog"
        aria-modal="true"
        aria-label="Pagamento via PIX"
        className="cc-modal-entra flex max-h-full w-full max-w-[480px] flex-col overflow-hidden rounded-3xl border border-border bg-background shadow-lg"
      >
        {/* Cabeçalho `lSsvw`, com o `X` que o desenho não tem — ver o TSDoc do
            componente: ele existe para o estado aprovado, e fica bloqueado (com
            motivo, nunca `disabled` mudo) enquanto o pagamento não confirma. */}
        {/* As medidas do Pencil — 78px de cabeçalho, 60 de rodapé, 28/24 de
            folga no corpo, QR de 200 — são de um cartão de 480px numa tela de
            balcão, e o `.pen` não modela variante compacta desta janela. No
            celular elas somavam ~750px de altura e a janela passou a exigir
            rolagem para o operador ver o valor a cobrar e a confirmação
            (correção do usuário, 2026-09-15: "o modal do PIX está necessitando
            de Scroll down para ver informação, deveria ser suficiente sem
            scroll").

            A saída é densidade, não corte: nenhum elemento do desenho saiu da
            tela — encolheram as folgas, o QR e as alturas de cabeçalho/rodapé, e
            `md:` (que desde AD-198 significa "árvore desktop", não largura)
            devolve os valores exatos do `.pen` onde eles cabem. */}
        <header className="flex h-16 shrink-0 items-center gap-sm border-b border-border px-base md:h-[78px] md:px-lg">
          <span
            className="flex size-[42px] shrink-0 items-center justify-center rounded-full bg-[var(--cc-color-up-soft)]"
            data-testid="pix-disco-cabecalho"
          >
            {aprovado ? (
              <CheckCircle className="size-5 text-[var(--cc-color-up)]" aria-hidden="true" />
            ) : (
              <Qr className="size-5 text-[var(--cc-color-up)]" aria-hidden="true" />
            )}
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
            <h2 className="text-xl leading-[1.2] font-semibold text-foreground">
              Pagamento via PIX
            </h2>
            <p
              className="text-base leading-[1.2] font-medium text-muted-foreground"
              data-testid="pix-subtitulo"
            >
              {aprovado
                ? 'Pagamento aprovado'
                : emErro
                  ? 'Falha ao gerar a cobrança'
                  : 'Aguardando pagamento'}
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="icon-sm"
            className="shrink-0 rounded-full"
            data-testid="fechar-modal-pix"
            aria-label="Fechar"
            {...atributosDeBloqueio(bloqueioDoFechar)}
            onClick={acaoBloqueavel(bloqueioDoFechar, onFechar)}
          >
            <X className="size-4 text-muted-foreground" aria-hidden="true" />
          </Button>
        </header>

        <div
          className="flex flex-col items-center gap-3 overflow-y-auto px-base py-4 md:gap-md md:px-lg md:py-7"
          // O `overflow-y-auto` continua aqui como rede de segurança — uma
          // tradução longa, um aparelho muito baixo —, mas no celular comum ele
          // não deve ter o que rolar. Quem verifica isso é o E2E de layout
          // mobile, que compara `scrollHeight` com `clientHeight` deste nó.
          data-testid="pix-corpo"
        >
          {emErro ? (
            <div
              className="flex w-full flex-col gap-xs rounded-lg bg-[var(--cc-color-warning-soft)] px-sm py-sm"
              data-testid="erro-geracao-pix"
              role="alert"
            >
              <div className="flex items-start gap-xs">
                <AlertTriangle
                  className="mt-[2px] size-4.5 shrink-0 text-[var(--cc-color-accent-yellow)]"
                  aria-hidden="true"
                />
                <p className="text-base font-semibold text-foreground">
                  Não foi possível gerar a cobrança PIX.
                </p>
              </div>
              <p className="text-sm font-medium text-muted-foreground">
                {erro ?? 'O ERP não respondeu à geração da cobrança.'}
              </p>
            </div>
          ) : (
            <>
              {/* Cartão `DRKJh` — 200×200 é a medida do nó `g8F3HF`. */}
              <div className="flex items-center justify-center rounded-2xl border border-border bg-background p-3 md:p-base">
                {cobranca === null ? (
                  <div
                    className="cc-shimmer size-[160px] rounded-md md:size-[200px]"
                    data-testid="pix-qrcode-carregando"
                    aria-label="Gerando o QR Code do PIX"
                    role="status"
                  />
                ) : (
                  <img
                    // 160px no compacto: continua acima do mínimo que a câmera
                    // de um celular lê com folga a um palmo de distância, e é o
                    // corte que mais devolve altura sem tirar nada da tela.
                    className="size-[160px] md:size-[200px]"
                    data-testid="pix-qrcode"
                    // Já é uma `data:` URL pronta, com o tipo MIME detectado no
                    // mapper a partir dos bytes reais — a UI não escolhe formato.
                    src={cobranca.qrCodeFonte}
                    alt="QR Code do PIX para pagamento"
                  />
                )}
              </div>

              <p className="w-full text-center text-base leading-[1.4] text-muted-foreground">
                {aprovado
                  ? 'Pagamento confirmado pelo banco. Esta janela fecha sozinha em instantes.'
                  : 'Abra o app do seu banco e escaneie o QR Code para concluir o pagamento.'}
              </p>

              {/* Faixa `HVY3r`. O código fica em Geist Mono, como todo valor
                  tabular do produto, e quebra em vez de estourar a caixa: o
                  "copia e cola" tem ~130 caracteres e o desenho o mostra inteiro. */}
              <div className="flex w-full items-center gap-xs rounded-lg border border-border bg-muted px-sm py-[10px]">
                <span
                  // Duas linhas no compacto, inteiro no desktop. O texto
                  // permanece no DOM — `line-clamp` corta só o que se pinta —,
                  // então seleção, leitor de tela e o `Copiar` ao lado continuam
                  // vendo os ~130 caracteres. Ler o código para digitá-lo à mão
                  // não é gesto de PDV; o botão é.
                  className="line-clamp-2 min-w-0 flex-1 font-mono text-xs leading-[1.3] break-all text-[var(--cc-color-muted)] md:line-clamp-none"
                  data-testid="pix-copia-e-cola"
                >
                  {cobranca?.copiaECola ?? ''}
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon-sm"
                  className="shrink-0 rounded-full"
                  data-testid="copiar-codigo-pix"
                  aria-label="Copiar código PIX"
                  onClick={() => {
                    void copiarCodigo();
                  }}
                >
                  <Copy className="size-4 text-foreground" aria-hidden="true" />
                </Button>
                {/* Gatilho do envio por WhatsApp (pedido do usuário,
                    2026-09-21), **dentro** da faixa e não abaixo dela.

                    Não é estética: o corpo desta janela tem 41px de folga no
                    celular — 467px de conteúdo contra 508 úteis, medidos pelo
                    E2E de layout mobile em 2026-09-15 —, e um botão de largura
                    inteira somaria 48px com o `gap`, devolvendo à janela a
                    rolagem que AD-233 acabou de tirar. Ao lado do `Copiar` ele
                    custa zero de altura, e o lugar é o certo: as duas ações
                    fazem a mesma coisa com o mesmo código — uma entrega pela
                    área de transferência, a outra pelo WhatsApp do cliente.

                    Só aparece com cobrança **gerada**: o `TrnGUID` é parâmetro
                    obrigatório do endpoint. E some ao aprovar, porque mandar ao
                    cliente uma cobrança que ele acabou de pagar não é
                    informação, é confusão. */}
                {cobranca !== null && !aprovado && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon-sm"
                    className="shrink-0 rounded-full"
                    data-testid="abrir-envio-whatsapp"
                    aria-label="Enviar por WhatsApp"
                    title="Enviar por WhatsApp"
                    aria-expanded={envioAberto}
                    onClick={() => {
                      setEnvioAberto((aberto) => !aberto);
                    }}
                  >
                    <ChatRound className="size-4 text-foreground" aria-hidden="true" />
                  </Button>
                )}
              </div>
              {/* Confirmação do copiar: o desenho não a modela, e sem ela o
                  clique no botão não produz retorno visível nenhum — num PDV o
                  operador repetiria o gesto sem saber se funcionou. */}
              {copiado && (
                <p className="sr-only" role="status" data-testid="pix-codigo-copiado">
                  Código PIX copiado.
                </p>
              )}

              {/* Formulário do envio por WhatsApp (pedido do usuário,
                  2026-09-21) — os "dois campos para edição" que o botão da
                  faixa acima revela.

                  O `.pen` não modela este bloco: é tela nova, desenhada com os
                  tokens e as medidas do resto da janela (campos de 42px como os
                  do cadastro de cliente, raio `lg`, botão de 36px). */}
              {cobranca !== null && !aprovado && (
                <div className="flex w-full flex-col gap-xs">
                  {envioAberto && (
                    <div
                      className="flex w-full flex-col gap-xs rounded-lg border border-border bg-muted px-sm py-sm"
                      data-testid="form-envio-whatsapp"
                    >
                      <label className="flex min-w-0 flex-col gap-[4px]">
                        <span className="text-sm font-semibold text-foreground">
                          Nome do cliente
                          {destinoInicial.nomeObrigatorio && (
                            <span className="text-muted-foreground"> (obrigatório)</span>
                          )}
                        </span>
                        <input
                          className="h-[42px] rounded-lg border border-border bg-background px-sm text-base outline-none placeholder:text-[var(--cc-color-muted)] focus-visible:border-ring"
                          data-testid="campo-nome-whatsapp"
                          autoComplete="off"
                          placeholder="Para quem é a cobrança"
                          value={nomeDestino}
                          onChange={(evento) => {
                            setNomeDestino(evento.target.value);
                          }}
                        />
                      </label>

                      <label className="flex min-w-0 flex-col gap-[4px]">
                        <span className="text-sm font-semibold text-foreground">
                          Número de destino <span className="text-muted-foreground">(com DDD)</span>
                        </span>
                        <input
                          // `font-mono` como todo valor tabular do produto, e
                          // `inputMode="tel"` para o teclado numérico do celular
                          // — é lá que este campo será digitado no balcão.
                          className="h-[42px] rounded-lg border border-border bg-background px-sm font-mono text-base tabular-nums outline-none placeholder:font-sans placeholder:text-[var(--cc-color-muted)] focus-visible:border-ring"
                          data-testid="campo-telefone-whatsapp"
                          autoComplete="off"
                          inputMode="tel"
                          placeholder="(11) 98765-4321"
                          value={telefoneDestino}
                          onChange={(evento) => {
                            setTelefoneDestino(evento.target.value);
                          }}
                        />
                      </label>

                      <Button
                        type="button"
                        className="h-9 w-full gap-xs rounded-full px-base text-base font-semibold"
                        data-testid="confirmar-envio-whatsapp"
                        {...atributosDeBloqueio(bloqueioDoEnvioWhatsapp)}
                        onClick={acaoBloqueavel(bloqueioDoEnvioWhatsapp, () => {
                          void enviarPorWhatsapp();
                        })}
                      >
                        <Send className="size-4" aria-hidden="true" />
                        {enviandoWhatsapp ? 'Enviando…' : 'Enviar cobrança'}
                      </Button>
                    </div>
                  )}

                  {enviadoWhatsapp && (
                    <p
                      className="text-sm font-medium text-[var(--cc-color-up-ink)]"
                      role="status"
                      data-testid="pix-enviado-whatsapp"
                    >
                      Cobrança enviada por WhatsApp.
                    </p>
                  )}
                </div>
              )}

              {/* Bloco escuro `ZgrCz` — o valor é o único número da tela e usa a
                  maior escala tipográfica do produto. */}
              <div className="flex w-full flex-col items-center gap-[6px] rounded-[20px] bg-[var(--cc-color-surface-dark)] p-3 md:p-base">
                <span className="text-base text-[var(--cc-color-on-dark-muted)]">
                  Valor a cobrar
                </span>
                <span
                  className="font-mono text-2xl leading-[1.05] font-semibold tabular-nums text-[var(--cc-color-on-primary)]"
                  data-testid="pix-valor-a-cobrar"
                >
                  {formatarCentavos(valor)}
                </span>
              </div>

              {/* Badge `hKvqW` no estado `$success-soft` do nó `uwg5J`. O ponto
                  pulsa enquanto se espera e fica sólido ao confirmar — a mesma
                  badge dizendo duas coisas diferentes. */}
              <span
                className="flex items-center gap-[6px] rounded-full bg-[var(--cc-color-up-soft)] px-sm py-[5px]"
                data-testid="pix-badge-status"
              >
                <span
                  className="size-[7px] shrink-0 rounded-full bg-[var(--cc-color-up)]"
                  aria-hidden="true"
                />
                <span className="text-sm font-semibold whitespace-nowrap text-[var(--cc-color-up-ink)]">
                  {aprovado ? 'Pagamento confirmado' : 'Aguardando confirmação'}
                </span>
              </span>
            </>
          )}
        </div>

        <footer className="flex h-14 shrink-0 items-center justify-center gap-[10px] border-t border-border px-base md:h-[60px] md:px-lg">
          {emErro && (
            <Button
              type="button"
              className="h-9 gap-xs rounded-full px-base text-base font-semibold"
              data-testid="tentar-novamente-pix"
              onClick={() => {
                gerarCobranca();
              }}
            >
              <Refresh className="size-3.5" aria-hidden="true" />
              Tentar novamente
            </Button>
          )}
          {aprovado ? (
            <Button
              type="button"
              className="h-9 gap-xs rounded-full px-base text-base font-semibold"
              data-testid="concluir-pix"
              onClick={onFechar}
            >
              <CheckCircle className="size-4" aria-hidden="true" />
              Concluir
            </Button>
          ) : (
            <Button
              type="button"
              variant="secondary"
              className="h-9 gap-xs rounded-full px-base text-base font-semibold"
              data-testid="desistir-operacao-pix"
              onClick={pedirDesistencia}
            >
              <X className="size-[15px] text-muted-foreground" aria-hidden="true" />
              Desistir da operação
            </Button>
          )}
        </footer>
      </div>

      {confirmandoDesistencia && (
        <DialogoConfirmacaoDestrutiva
          testId="confirmar-desistencia-pix"
          titulo="Desistir da cobrança PIX?"
          subtitulo="A cobrança já foi gerada no banco"
          chamada={CHAMADA_PIX_NAO_E_CANCELADO}
          explicacao={AVISO_DESASSOCIACAO_MANUAL}
          destaque={DESTAQUE_PIX_SEGUE_NO_BANCO}
          rotuloConfirmar="Desistir mesmo assim"
          rotuloCancelar="Continuar aguardando"
          onConfirmar={desistir}
          onCancelar={() => {
            setConfirmandoDesistencia(false);
          }}
        />
      )}
    </div>
  );
}
