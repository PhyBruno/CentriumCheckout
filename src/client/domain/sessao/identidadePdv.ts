/**
 * Identidade do ponto de venda exibida na barra superior.
 *
 * Domínio puro: recebe os campos crus de `SessaoUsuario` (`GetSessao`) e
 * devolve os rótulos já prontos. Fica fora do componente porque a regra de
 * apresentação — qual nome de empresa vence, como o caixa é zero-preenchido,
 * quando a linha inteira some — é testável sem montar React e é a mesma em
 * qualquer superfície que venha a mostrar a identidade do PDV (a 007 terá a
 * sua no mobile).
 */

/**
 * Subconjunto de `SessaoUsuario` lido aqui. Declarado com campos opcionais
 * porque é assim que o schema Zod os aceita: nenhum deles decide
 * comportamento de venda, então um payload sem eles não pode derrubar o
 * bootstrap inteiro — degrada só o rótulo (ver `bootstrap.schema.ts`).
 */
export interface IdentidadePdvBruta {
  readonly EmpresaNomeFantasia?: string | undefined;
  readonly EmpresaRazaoSocial?: string | undefined;
  readonly UsuarioNome?: string | undefined;
  readonly caixa?: number | undefined;
  readonly CadMaqCod?: string | undefined;
}

/** Como no Pencil: "Centrium Checkout - Organizações Tabajara" (nó `HSvSJ`). */
const NOME_DO_PRODUTO = 'Centrium Checkout';

/**
 * Nome fantasia na frente da razão social: é o nome pelo qual o operador
 * reconhece a loja onde está. Empresa sem nenhum dos dois cai no nome do
 * produto sozinho, sem o hífen solto.
 */
export function tituloDoProduto(sessao: IdentidadePdvBruta): string {
  const empresa = primeiroPreenchido(sessao.EmpresaNomeFantasia, sessao.EmpresaRazaoSocial);
  return empresa === null ? NOME_DO_PRODUTO : `${NOME_DO_PRODUTO} - ${empresa}`;
}

/**
 * Segunda linha da identidade: "Caixa 03 • PDV 01" (nó `YNhuO`).
 *
 * Cada metade é opcional de forma independente — PDV sem caixa configurado
 * mostra só o PDV, e vice-versa. `null` quando não há nada a dizer: o
 * componente omite a linha inteira em vez de imprimir um separador órfão.
 */
export function descreverSessaoAtiva(sessao: IdentidadePdvBruta): string | null {
  const partes: string[] = [];

  // `0` é "sem caixa" no ERP, não "caixa zero" — não vira "Caixa 00".
  if (typeof sessao.caixa === 'number' && Number.isFinite(sessao.caixa) && sessao.caixa > 0) {
    partes.push(`Caixa ${String(sessao.caixa).padStart(2, '0')}`);
  }

  const pdv = rotularPdv(sessao.CadMaqCod);
  if (pdv !== null) {
    partes.push(pdv);
  }

  return partes.length === 0 ? null : partes.join(' • ');
}

/** Nome do operador da sessão (`UsuarioNome`), ou `null` se o ERP não mandou. */
export function nomeDoOperador(sessao: IdentidadePdvBruta): string | null {
  return primeiroPreenchido(sessao.UsuarioNome);
}

/**
 * `CadMaqCod` é livre no cadastro do ERP: tanto `"01"` quanto `"PDV01"` são
 * valores reais. O rótulo "PDV" é prefixado só quando o próprio código ainda
 * não o traz, para não sair "PDV PDV01" na barra.
 */
function rotularPdv(cadMaqCod: string | undefined): string | null {
  const codigo = primeiroPreenchido(cadMaqCod);
  if (codigo === null) {
    return null;
  }

  const semPrefixo = codigo.replace(/^pdv[\s\-_]*/i, '').trim();
  return semPrefixo === '' ? codigo : `PDV ${semPrefixo}`;
}

/** Primeiro valor não vazio depois de aparado; `null` se não houver nenhum. */
function primeiroPreenchido(...valores: readonly (string | undefined)[]): string | null {
  for (const valor of valores) {
    const aparado = valor?.trim() ?? '';
    if (aparado !== '') {
      return aparado;
    }
  }
  return null;
}
