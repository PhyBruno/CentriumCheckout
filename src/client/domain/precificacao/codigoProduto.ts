/**
 * Interpretação da entrada de código do operador (T020) — bipada ou digitada.
 *
 * Ordem de classificação (`research.md`, D6): `*` → balança → simples. O `*` é
 * digitação manual deliberada e não pode colidir com nenhum formato bipado, por
 * isso vem primeiro.
 */

import { centavos, type Centavos } from './dinheiro';
import {
  milesimos,
  milesimosDeUnidades,
  MILESIMOS_POR_UNIDADE,
  type Milesimos,
} from './quantidade';

export type EntradaCodigo =
  | { readonly tipo: 'SIMPLES'; readonly codigo: string }
  | { readonly tipo: 'COM_QTD'; readonly codigo: string; readonly quantidade: Milesimos }
  | { readonly tipo: 'BALANCA'; readonly codigoReduzido: string; readonly valorEtiqueta: Centavos };

/** Produto pesável cujo `PrecoVenda` o ERP não informou (`FR-013`, AD-076). */
export class ErroPrecoIndisponivelParaPesagem extends Error {
  constructor() {
    super(
      'Produto pesável sem PrecoVenda informado: não há como derivar a quantidade a partir da etiqueta.',
    );
    this.name = 'ErroPrecoIndisponivelParaPesagem';
  }
}

const SEPARADOR_QUANTIDADE = '*';
const TAMANHO_EAN13 = 13;
const PREFIXO_BALANCA = '2';
/** Posições 2–7 do EAN-13 de balança: código reduzido do produto (AD-076). */
const INICIO_CODIGO_REDUZIDO = 1;
const FIM_CODIGO_REDUZIDO = 7;
/** Posições 8–12: valor da etiqueta, já em centavos (2 últimos dígitos). */
const INICIO_VALOR_ETIQUETA = 7;
const FIM_VALOR_ETIQUETA = 12;
/** Casas decimais preservadas antes do arredondamento final (AD-076). */
const CASAS_TRUNCAMENTO = 1e5;

/**
 * Dígito verificador EAN-13: pesos alternados 1 e 3 sobre os 12 primeiros
 * dígitos, complemento de 10.
 */
function digitoVerificadorEan13(doze: string): number {
  let soma = 0;
  for (let indice = 0; indice < doze.length; indice += 1) {
    const digito = Number(doze[indice]);
    soma += indice % 2 === 0 ? digito : digito * 3;
  }
  return (10 - (soma % 10)) % 10;
}

function ehCodigoDeBalanca(texto: string): boolean {
  if (texto.length !== TAMANHO_EAN13 || !/^\d{13}$/.test(texto)) {
    return false;
  }
  if (!texto.startsWith(PREFIXO_BALANCA)) {
    return false;
  }
  return digitoVerificadorEan13(texto.slice(0, TAMANHO_EAN13 - 1)) === Number(texto.at(-1));
}

/**
 * Aceita `3`, `3,5` e `3.5` — o operador digita no teclado numérico do PDV, onde
 * o separador decimal varia com o layout do teclado.
 */
function interpretarQuantidade(texto: string): Milesimos | null {
  const normalizado = texto.trim().replace(',', '.');
  if (normalizado === '' || !/^\d+(\.\d+)?$/.test(normalizado)) {
    return null;
  }
  const unidades = Number(normalizado);
  if (!Number.isFinite(unidades) || unidades <= 0) {
    return null;
  }
  return milesimosDeUnidades(unidades);
}

/**
 * Classifica a entrada. Nunca lança: entrada malformada cai em `SIMPLES` e o
 * ERP responde `404`, que a UI já trata — transformar um código interno legítimo
 * do tenant em erro de operação seria pior (`research.md`, D6).
 */
export function interpretarEntradaCodigo(texto: string): EntradaCodigo {
  const limpo = texto.trim();

  const separador = limpo.indexOf(SEPARADOR_QUANTIDADE);
  if (separador > 0) {
    const codigo = limpo.slice(0, separador).trim();
    const quantidade = interpretarQuantidade(limpo.slice(separador + 1));
    if (codigo !== '' && quantidade !== null) {
      return { tipo: 'COM_QTD', codigo, quantidade };
    }
  }

  if (ehCodigoDeBalanca(limpo)) {
    return {
      tipo: 'BALANCA',
      codigoReduzido: limpo.slice(INICIO_CODIGO_REDUZIDO, FIM_CODIGO_REDUZIDO),
      valorEtiqueta: centavos(Number(limpo.slice(INICIO_VALOR_ETIQUETA, FIM_VALOR_ETIQUETA))),
    };
  }

  return { tipo: 'SIMPLES', codigo: limpo };
}

/**
 * Os três tipos de código que `PCheckout_GetProduto` sabe filtrar, e o campo do
 * produto que cada um casa (AD-204, fonte lido na KB em 2026-09-10):
 *
 * ```
 * where MatCodRed  = &CodigoProduto when &TipoCodProduto in ('R', '')
 * where MatCodBar  = &CodigoProduto when &TipoCodProduto = 'B'
 * where MatModelo  = &CodigoProduto when &TipoCodProduto = 'M'
 * ```
 *
 * **Não confundir com o domínio `EnumTipoCodigoProduto`** (`''`/`'D'`/`'C'`/
 * `'P'`), que a redação anterior deste módulo tomava como fonte de verdade:
 * `SessaoUsuario.UsuarioTipoCodigoProduto` **não** sai daquele domínio — sai do
 * parâmetro `PRM0656` (`PCheckout_GetSessao`, linha 63), cujos valores são
 * estes. Um tenant real devolve `'B'`, que nem existe naquele domínio.
 *
 * Um valor fora destes três não filtra nada no `For Each` do ERP, que então
 * devolve o **primeiro produto da empresa** — por isso o rótulo genérico e a
 * guarda de SDT vazio em `fetchProduto` importam.
 */
export const TIPO_COD_PRODUTO = {
  Reduzido: 'R',
  ReduzidoVazio: '',
  Barras: 'B',
  Modelo: 'M',
} as const;

/**
 * Rótulo do campo de entrada conforme `SessaoUsuario.UsuarioTipoCodigoProduto`.
 *
 * O tipo de código que o operador bipa/digita é configuração da empresa, não um
 * valor fixo. Mesmo valor vai em `Tipocodproduto` na chamada a `GetProduto`
 * (AD-033) — este rótulo só troca o texto mostrado ao operador, nunca a lógica
 * de inserção.
 *
 * Um valor desconhecido não pode travar a tela (mesma postura de
 * `interpretarEntradaCodigo`, que também nunca lança): cai num rótulo genérico.
 */
export function rotuloTipoCodigoProduto(usuarioTipoCodigoProduto: string): string {
  switch (usuarioTipoCodigoProduto) {
    case TIPO_COD_PRODUTO.ReduzidoVazio:
    case TIPO_COD_PRODUTO.Reduzido:
      return 'Código reduzido';
    case TIPO_COD_PRODUTO.Barras:
      return 'Código de barras';
    case TIPO_COD_PRODUTO.Modelo:
      return 'Referência';
    default:
      return 'Código do produto';
  }
}

/** Os três campos que um candidato da busca (`GetListaProdutos`) sempre traz. */
export interface CandidatoDeBusca {
  readonly CodigoProduto: string;
  readonly CodigoBarras: string;
  readonly Referencia: string;
}

/**
 * Qual campo do candidato pode ser reenviado como `Codigoproduto` na chamada a
 * `GetProduto`, dado o `Tipocodproduto` da sessão (AD-204).
 *
 * Existe porque o modal de busca não insere nada sozinho: escolher um candidato
 * devolve **um código**, que a barra de entrada rebusca com o
 * `Tipocodproduto` da sessão (AD-091). Devolver sempre `CodigoProduto`, como se
 * fazia, só funciona quando a empresa está configurada em código reduzido — num
 * tenant com `'B'` o ERP filtra por `MatCodBar`, o reduzido não casa com nada e
 * a resposta é um SDT vazio, que virava linha sem descrição, sem unidade e com
 * preço zero.
 *
 * `null` quando o candidato não tem o campo exigido preenchido (produto sem
 * código de barras cadastrado, com a empresa em `'B'`): não há código que
 * funcione, e inventar um produziria a mesma linha zerada por outro caminho.
 */
export function codigoParaConsulta(
  candidato: CandidatoDeBusca,
  usuarioTipoCodigoProduto: string,
): string | null {
  const campo =
    usuarioTipoCodigoProduto === TIPO_COD_PRODUTO.Barras
      ? candidato.CodigoBarras
      : usuarioTipoCodigoProduto === TIPO_COD_PRODUTO.Modelo
        ? candidato.Referencia
        : candidato.CodigoProduto;

  return campo === '' ? null : campo;
}

/**
 * Quantidade de um produto pesável: `round(trunc(valorEtiqueta / precoVenda, 5), 3)`
 * (AD-076).
 *
 * O valor da etiqueta serve **exclusivamente** para derivar a quantidade — o
 * total da linha é recalculado depois por `preço × quantidade`, como em qualquer
 * outra linha. A divergência de até 1 centavo em relação ao impresso na etiqueta
 * é aceita, e o que vale para a venda é o valor recalculado (`data-model.md` §1).
 */
export function quantidadePesavel(valorEtiqueta: Centavos, precoVenda: Centavos): Milesimos {
  if (precoVenda <= 0) {
    throw new ErroPrecoIndisponivelParaPesagem();
  }
  const unidades = valorEtiqueta / precoVenda;
  const truncado = Math.trunc(unidades * CASAS_TRUNCAMENTO) / CASAS_TRUNCAMENTO;
  return milesimos(Math.round(truncado * MILESIMOS_POR_UNIDADE));
}
