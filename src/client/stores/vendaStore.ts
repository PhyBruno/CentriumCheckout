import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { gooeyToast } from 'goey-toast';
import { criarAuditoriaSlice } from './slices/auditoriaSlice';
import type { AuditoriaSlice } from './slices/auditoriaSlice';
import { criarCarrinhoSlice } from './slices/carrinhoSlice';
import type { CarrinhoDeps, CarrinhoSlice } from './slices/carrinhoSlice';
import { criarClienteSlice } from './slices/clienteSlice';
import type { ClienteDeps, ClienteSlice } from './slices/clienteSlice';
import { criarIdentidadeVendaSlice } from './slices/identidadeVendaSlice';
import type { IdentidadeVendaSlice } from './slices/identidadeVendaSlice';
import { useSessionStore } from './sessionStore';
import type { OrigemVenda } from '../domain/auditoria/eventos';
import { fetchProduto } from '../services/produto/produtoQueries';

/**
 * Store da venda em andamento — **sem `persist`** (AD-006, Constitution VI):
 * o carrinho e tudo que o acompanha morrem num F5, por decisão de arquitetura,
 * não por esquecimento.
 *
 * Montado pelo padrão de slices do Zustand para ficar aberto à extensão sem
 * alteração (Open/Closed): cada feature de venda acrescenta o seu slice à
 * interseção de `VendaState` e o seu slice creator ao spread abaixo —
 * pagamento (008), vendedor (012). Por ora existem os slices de auditoria
 * (001), carrinho (003), identidade da venda (004) e cliente (005).
 */
export type VendaState = AuditoriaSlice & CarrinhoSlice & IdentidadeVendaSlice & ClienteSlice;

/** Configuração do PDV ainda não carregada quando o carrinho precisou dela. */
export class ErroSessaoSemConfiguracao extends Error {
  constructor() {
    super(
      'Configuração do ponto de venda indisponível: o carrinho só opera depois do bootstrap concluído.',
    );
    this.name = 'ErroSessaoSemConfiguracao';
  }
}

/**
 * `SessaoUsuario.TipoPreco` do bootstrap (feature 002).
 *
 * Falha alto em vez de assumir um tipo qualquer: o carrinho só é alcançável
 * depois de `telaDeVendaLiberada`, então a ausência aqui é bug de composição —
 * e precificar com um `TipoPreco` inventado produziria preço errado em silêncio,
 * que é justamente o que a Constitution V existe para impedir.
 */
function tipoPrecoDoBootstrap(): number {
  const registro = useSessionStore.getState().registro;
  if (registro === null) {
    throw new ErroSessaoSemConfiguracao();
  }
  return registro.SessaoUsuario.TipoPreco;
}

/**
 * `SessaoUsuario.UsuarioTipoCodigoProduto` — enviado sempre, nunca inferido por
 * chamada (AD-033). Falha alto pelo mesmo motivo de `tipoPrecoDoBootstrap`.
 */
function tipoCodProdutoDoBootstrap(): string {
  const registro = useSessionStore.getState().registro;
  if (registro === null) {
    throw new ErroSessaoSemConfiguracao();
  }
  return registro.SessaoUsuario.UsuarioTipoCodigoProduto;
}

/**
 * Dependências do carrinho na composição real (Dependency Inversion — D8).
 *
 * `podeMutarCarrinho` é o ponto que a 008 fecha sem tocar no carrinho,
 * substituindo o predicado pela regra de bloqueio pós-pagamento (T038); até lá
 * vale o default abaixo, que descreve uma venda sem pagamento. `clienteAtual`
 * já está fechado pela 005: lê o slice de cliente do próprio store combinado,
 * sem o carrinho importar `clienteSlice.ts`.
 */
export const carrinhoDepsPadrao: CarrinhoDeps = {
  podeMutarCarrinho: () => true,
  tipoPrecoAtual: tipoPrecoDoBootstrap,
  clienteAtual: () => {
    const cliente = useVendaStore.getState().clienteAtual;
    if (cliente === null) {
      return null;
    }
    return {
      codigo: cliente.codigoCliente,
      listaPreco: cliente.listaPreco,
      // `null` significa "o cadastro deste cliente não define convênio"
      // (cadastro simplificado, `research.md` D10) — para o cálculo, ausência
      // de convênio e convênio zero produzem o mesmo fator `1`.
      descontoConvenio: cliente.descontoConvenio ?? 0,
    };
  },
  avisar: (mensagem) => {
    gooeyToast.warning(mensagem);
  },
};

/**
 * Dependências do cliente na composição real (`research.md` D7/D8).
 *
 * `podeMutarCarrinho` é **o mesmo** predicado do carrinho, não um segundo:
 * cliente e carrinho compartilham a regra de "a venda ainda pode ser mutada"
 * (AD-043).
 */
export function clienteDepsPadrao(depsCarrinho: CarrinhoDeps): ClienteDeps {
  return {
    podeMutarCarrinho: depsCarrinho.podeMutarCarrinho,
    buscarSnapshotProduto: (codigoProduto, cliente) =>
      fetchProduto(codigoProduto, {
        tipoCodProduto: tipoCodProdutoDoBootstrap(),
        tipoPreco: depsCarrinho.tipoPrecoAtual(),
        codigoCliente: cliente.codigoCliente,
        listaPreco: cliente.listaPreco,
      }),
    ...(depsCarrinho.avisar ? { avisar: depsCarrinho.avisar } : {}),
  };
}

export function criarVendaStore(
  depsCarrinho: CarrinhoDeps = carrinhoDepsPadrao,
  depsCliente: ClienteDeps = clienteDepsPadrao(depsCarrinho),
) {
  return create<VendaState>()(
    immer((...args) => ({
      ...criarAuditoriaSlice(...args),
      ...criarCarrinhoSlice(depsCarrinho)(...args),
      ...criarIdentidadeVendaSlice(...args),
      ...criarClienteSlice(depsCliente)(...args),
    })),
  );
}

export const useVendaStore = criarVendaStore();

/**
 * Abre uma sessão de venda: **único** ponto que toca `auditoria` e
 * `identidadeVenda` juntos (feature 004, `research.md` D1).
 *
 * Existir aqui, e não dentro de um dos dois slices, é o que garante a
 * invariante que D1 pede — o início de uma venda nunca zera um slice sem o
 * outro. Um slice que chamasse o outro precisaria conhecê-lo, acoplamento que
 * os slices existentes não têm entre si.
 *
 * Chamado ao abrir a tela de venda e depois de cada finalização/suspensão
 * bem-sucedida.
 *
 * **A importação de DAV (feature 006) não passa por aqui** (AD-137), embora
 * este TSDoc antecipasse que passaria: importar um documento acontece **no
 * meio** de uma venda, e `resetarAuditoria` apagaria o histórico do que o
 * operador já fez (contra `FR-009` da feature 001). A 006 grava só a identidade
 * — `definirIdentidadeVenda({ origem: 'DAV', numeroNota })` — e acrescenta
 * `DAV_IMPORTADO` à trilha existente. A feature 011 decidirá a sua por conta;
 * `abrirSessaoDeVenda` continua sendo o caminho de quem de fato **inicia** uma
 * sessão de venda do zero.
 */
export function abrirSessaoDeVenda(origem: OrigemVenda, numeroNota = 0): void {
  const venda = useVendaStore.getState();
  venda.resetarAuditoria(origem);
  venda.definirIdentidadeVenda({ origem, numeroNota });

  // Pré-seleção do cliente default (feature 005, `FR-004`/AD-032): acontece
  // aqui, e não dentro de um slice, pelo mesmo motivo dos dois acima — é o
  // início da venda que precisa deixar auditoria, identidade e cliente
  // coerentes entre si, e nenhum slice conhece os outros. Sem registro de
  // bootstrap não há default a aplicar e o campo cliente nasce vazio
  // (`FR-005`), que é exatamente o estado inicial do slice.
  const registro = useSessionStore.getState().registro;
  if (registro !== null) {
    venda.inicializarClientePadrao(registro.SessaoUsuario);
  }
}
