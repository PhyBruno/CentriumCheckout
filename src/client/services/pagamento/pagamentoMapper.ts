/**
 * `CondicaoPagamentoValidada`/`SessaoPagamento` já validados (T007) → tipos de
 * domínio de `domain/pagamento/formaPagamento.ts`/`roteamentoIntegracao.ts` (T008).
 *
 * Uma responsabilidade só: adaptar a forma validada do ERP à forma do domínio
 * — mesmo padrão de `clienteMapper.ts`/`produtoMapper.ts`. Nenhum `double` de
 * dinheiro passa por aqui: a conversão `double → Centavos` já aconteceu em
 * `pagamento.schema.ts`. Nenhuma regra de negócio nova mora aqui, só tradução
 * de shape.
 */

import type { CondicaoPagamento, FormaPagamento } from '../../domain/pagamento/formaPagamento';
import type { CapacidadesPagamento } from '../../domain/pagamento/roteamentoIntegracao';
import type {
  CondicaoPagamentoValidada,
  FormaPagamentoValidada,
  SessaoPagamento,
} from '../../../shared/schemas/pagamento.schema';

function paraFormaPagamento(forma: FormaPagamentoValidada): FormaPagamento {
  return {
    codigo: forma.FormaCodigo,
    descricao: forma.FormaDescricao,
    entrada: forma.FormaEntrada,
    meioPagtoNFe: forma.FormaMeioPagtoNFe,
    integracaoCartao: forma.FormaIntegracaoCartao,
    tipoTransacaoTEF: forma.FormaTipoTransacaoTEF,
    fpgUtiCar: forma.FormaFpgUtiCar,
  };
}

/**
 * Traduz `CondicoesDePagamento[]` já validado para o catálogo do domínio.
 *
 * Exclui condições que ficaram **sem nenhuma forma** depois do descarte de
 * `FormaMeioPagtoNFe` desconhecido (`pagamento.schema.ts`,
 * `filtrarFormasValidas`) — `data-model.md` §1 fixa que uma condição sem forma
 * "pelo menos uma para a condição ser selecionável". Descartar aqui, e não só
 * documentar a invariante, é o que impede a UI de oferecer uma condição vazia
 * que travaria o operador ao tentar escolher uma forma que não existe.
 */
export function paraCondicoesPagamento(
  condicoes: readonly CondicaoPagamentoValidada[],
): readonly CondicaoPagamento[] {
  const resultado: CondicaoPagamento[] = [];

  for (const condicao of condicoes) {
    if (condicao.CondicaoFormasDePagamento.length === 0) {
      continue;
    }

    resultado.push({
      codigo: condicao.CondicaoCodigo,
      descricao: condicao.CondicaoDescricao,
      prazo: condicao.CondicaoPrazo,
      minimoEntrada: condicao.CondicaoMinimoEntrada,
      desconto: condicao.CondicaoDesconto,
      descontoMaximo: condicao.CondicaoDescontoMaximo,
      formas: condicao.CondicaoFormasDePagamento.map(paraFormaPagamento),
    });
  }

  return resultado;
}

/**
 * Traduz as duas flags de disponibilidade (`FR-002`/`FR-003`) para
 * `CapacidadesPagamento`, o tipo que `resolverIntegracao` injeta.
 *
 * `ConfiguracoesTEF`/`ConfiguracoesPIX` podem estar ausentes num bootstrap
 * antigo — `pagamento.schema.ts` os deixa `optional()` na fronteira, e aqui a
 * ausência vira `false` (integração desligada), nunca `undefined` propagado
 * adiante.
 */
export function paraCapacidadesPagamento(sessao: SessaoPagamento): CapacidadesPagamento {
  return {
    tefAtivo: sessao.ConfiguracoesTEF?.TEFAtivo ?? false,
    pixAtivo: sessao.ConfiguracoesPIX?.UtilizaCentriumPAG ?? false,
  };
}
