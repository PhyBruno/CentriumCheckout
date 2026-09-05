/**
 * Dados do pagador de `GerarPIX` a partir do cliente da venda (T004,
 * `research.md` D7, **AD-100**).
 *
 * Domínio puro: recebe o snapshot já pronto da feature 005 e devolve as quatro
 * strings que o SDT do ERP espera. Não lê o `vendaStore`, não conhece rede.
 *
 * **O cliente default conta como pagador.** Decisão direta do usuário
 * (2026-08-27): sem identificação explícita, os dados enviados são os do cliente
 * default da empresa, que já está pré-selecionado desde o início da venda
 * (AD-032). Não há um "modo sem pagador".
 */

import type { ClienteVenda } from '../cliente/clienteVenda';
import type { DadosPagadorPix } from './cobrancaPix';

/**
 * `null` → todos os campos vazios, **sem lançar**.
 *
 * `clienteAtual === null` só acontece quando a empresa nunca configurou cliente
 * default e o operador ainda não escolheu ninguém (`ClienteState`, invariante I1
 * da feature 005). Barrar a venda por isso não é competência deste módulo — se
 * existir um bloqueio de "venda sem cliente", ele mora na feature que o
 * especificou.
 *
 * `email`/`telefone` saem sempre vazios nesta versão: `ClienteVenda` não retém
 * e-mail, e o celular só existe para clientes buscados — o gap está documentado
 * em `research.md` D7 como escopo, não como omissão silenciosa. Preencher
 * `telefone` com `celular` seria inventar equivalência entre dois campos que o
 * contrato do ERP separa (`TrnPagadorFone` × contato do cadastro).
 */
export function montarDadosPagador(clienteAtual: ClienteVenda | null): DadosPagadorPix {
  return {
    nome: clienteAtual?.nome ?? '',
    // `?? ''` cobre os dois casos de uma vez: cliente ausente e cliente default
    // (cujo `documento` é `null`, porque `GetSessao` não devolve o CPF/CNPJ
    // dele). O ERP nunca recebe `null` bruto neste campo.
    documento: clienteAtual?.documento ?? '',
    email: '',
    telefone: '',
  };
}
