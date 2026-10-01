/**
 * Documento que originou um DAV, como a coluna "Documento de Origem" o mostra
 * (AD-258, pedido do usuário em 2026-10-01).
 *
 * Domínio puro: nenhuma dependência de React ou de schema. A janela de
 * importação só decide a cor da badge a partir de `tipo`; o rótulo e o número
 * formatado saem daqui, onde o teste os exercita sem montar componente.
 */

/**
 * Os três tipos que o ERP devolve em `ListaDAVs.Titulo` — medidos nas 284
 * linhas do tenant `c0lj6mvzeh` em 2026-10-01 (`PEDIDO`, `ORCAMENTO`,
 * `ORDEM SERVICO`). `OUTRO` cobre um tipo novo que o ERP passe a mandar: a
 * linha continua exibida, com o texto do ERP numa badge neutra, em vez de
 * sumir ou ganhar a cor de um tipo que não é o dela.
 */
export type TipoDocumentoOrigem = 'PEDIDO' | 'ORCAMENTO' | 'ORDEM_SERVICO' | 'OUTRO';

export interface ClassificacaoDocumentoOrigem {
  readonly tipo: TipoDocumentoOrigem;
  /** Texto da badge: `Pedido`, `Orçamento`, `O.S` — ou o `Titulo` cru. */
  readonly rotulo: string;
}

const ROTULOS: Readonly<Record<Exclude<TipoDocumentoOrigem, 'OUTRO'>, string>> = {
  PEDIDO: 'Pedido',
  ORCAMENTO: 'Orçamento',
  ORDEM_SERVICO: 'O.S',
};

/**
 * Compara sem acento, sem caixa e sem espaços repetidos: o ERP grava
 * `ORCAMENTO` sem cedilha, e um `Orçamento` ou `ORDEM  SERVICO` digitado de
 * outro jeito no cadastro continua sendo o mesmo tipo.
 */
function normalizar(titulo: string): string {
  // `\p{M}` remove as marcas combinantes (os acentos que o `NFD` separou da
  // letra). Mais legível que a faixa de code points equivalente, que no
  // arquivo acaba virando caracteres invisíveis.
  return titulo.normalize('NFD').replace(/\p{M}/gu, '').trim().replace(/\s+/g, ' ').toUpperCase();
}

export function classificarDocumentoOrigem(titulo: string): ClassificacaoDocumentoOrigem {
  switch (normalizar(titulo)) {
    case 'PEDIDO':
      return { tipo: 'PEDIDO', rotulo: ROTULOS.PEDIDO };
    case 'ORCAMENTO':
      return { tipo: 'ORCAMENTO', rotulo: ROTULOS.ORCAMENTO };
    case 'ORDEM SERVICO':
    case 'ORDEM DE SERVICO':
    case 'O.S':
    case 'OS':
      return { tipo: 'ORDEM_SERVICO', rotulo: ROTULOS.ORDEM_SERVICO };
    default:
      return { tipo: 'OUTRO', rotulo: titulo.trim() };
  }
}

/**
 * `Numero/Serie` — `1287/99`. Sem série (orçamento e O.S. vêm com ela vazia),
 * só o número: uma barra pendurada (`1605/`) sugeriria um dado faltando.
 * Sem número, `null`: a célula mostra só a badge.
 */
export function formatarNumeroDocumentoOrigem(
  numero: string | undefined,
  serie: string | undefined,
): string | null {
  const numeroLimpo = (numero ?? '').trim();
  if (numeroLimpo === '' || numeroLimpo === '0') {
    return null;
  }
  const serieLimpa = (serie ?? '').trim();
  return serieLimpa === '' ? numeroLimpo : `${numeroLimpo}/${serieLimpa}`;
}
