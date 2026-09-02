import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { gooeyToast } from 'goey-toast';
import { criarAuditoriaSlice } from './slices/auditoriaSlice';
import type { AuditoriaSlice } from './slices/auditoriaSlice';
import { criarCarrinhoSlice } from './slices/carrinhoSlice';
import type { CarrinhoDeps, CarrinhoSlice } from './slices/carrinhoSlice';
import { criarIdentidadeVendaSlice } from './slices/identidadeVendaSlice';
import type { IdentidadeVendaSlice } from './slices/identidadeVendaSlice';
import { useSessionStore } from './sessionStore';
import type { OrigemVenda } from '../domain/auditoria/eventos';

/**
 * Store da venda em andamento — **sem `persist`** (AD-006, Constitution VI):
 * o carrinho e tudo que o acompanha morrem num F5, por decisão de arquitetura,
 * não por esquecimento.
 *
 * Montado pelo padrão de slices do Zustand para ficar aberto à extensão sem
 * alteração (Open/Closed): cada feature de venda acrescenta o seu slice à
 * interseção de `VendaState` e o seu slice creator ao spread abaixo —
 * cliente (005), pagamento (008), vendedor (012). Por ora existem os slices de
 * auditoria (001), carrinho (003) e identidade da venda (004).
 */
export type VendaState = AuditoriaSlice & CarrinhoSlice & IdentidadeVendaSlice;

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
 * Dependências do carrinho na composição real (Dependency Inversion — D8).
 *
 * `podeMutarCarrinho` e `clienteAtual` são os dois pontos que outras features
 * fecham sem tocar no carrinho: a 008 substitui o predicado pela regra de
 * bloqueio pós-pagamento (T038) e a 005 passa a devolver o cliente selecionado.
 * Até lá valem os defaults abaixo, que descrevem o estado real de uma venda sem
 * pagamento e com o cliente default — que nunca tem convênio (AD-108).
 */
export const carrinhoDepsPadrao: CarrinhoDeps = {
  podeMutarCarrinho: () => true,
  tipoPrecoAtual: tipoPrecoDoBootstrap,
  clienteAtual: () => null,
  avisar: (mensagem) => {
    gooeyToast.warning(mensagem);
  },
};

export function criarVendaStore(depsCarrinho: CarrinhoDeps = carrinhoDepsPadrao) {
  return create<VendaState>()(
    immer((...args) => ({
      ...criarAuditoriaSlice(...args),
      ...criarCarrinhoSlice(depsCarrinho)(...args),
      ...criarIdentidadeVendaSlice(...args),
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
 * Chamado ao abrir a tela de venda, depois de cada finalização/suspensão
 * bem-sucedida e, futuramente, pelas features 006 (DAV) e 011 (retomada de
 * rascunho) — estas com `origem`/`numeroNota` do documento carregado.
 */
export function abrirSessaoDeVenda(origem: OrigemVenda, numeroNota = 0): void {
  const venda = useVendaStore.getState();
  venda.resetarAuditoria(origem);
  venda.definirIdentidadeVenda({ origem, numeroNota });
}
