import { z } from 'zod';

/**
 * Primitivos de fronteira comuns a **todas** as respostas do `ApiCentriumOAuth`
 * (AD-165).
 *
 * Existem porque o JSON que o ERP real devolve não é o que o
 * `ApiCentriumOAuth.yaml` desenha, em dois pontos que se repetem endpoint a
 * endpoint. Ambos foram confirmados ao vivo em 2026-09-04 contra o ERP de
 * demonstração (tenant `c0lj6mvzeh`, empresa 1), com `curl`, sem passar pelo
 * BFF — não são suposição sobre o contrato, são o contrato observado:
 *
 * 1. **Número decimal e `int64` chegam como string JSON.** `"PrecoVenda1":
 *    "1.0000"`, `"ValorTotal": "89.50"`, `"ClienteDefaultCodigo": "999999"`,
 *    `"CondicaoPrazo": "0.00000"`. Só `int32` (`CodigoGrupo`, `TotalRegistros`,
 *    `PaginaAtual`) vem como número nativo. Um `z.number()` puro reprova a
 *    resposta inteira.
 * 2. **O envelope de saída some quando a procedure tem um único parâmetro de
 *    saída.** `GetProduto` devolve o SDT do produto na raiz, não
 *    `{"Produto": …}`; o mesmo vale para `GetCliente`, `GetSessao`,
 *    `GetListaProdutos`, `GetListaClientes`, `ListaDAVs`, `GetListaNFCes`,
 *    `GetListaVendedores` e `CarregarNFCe`. Quem **mantém** o envelope é quem
 *    também devolve `messages`: `GetDav` e `FaturarNFCe` (verificados um a um).
 *
 * Os dois helpers são deliberadamente **tolerantes**, não substitutivos: aceitam
 * tanto o formato real quanto o do YAML. Não é indulgência — é a única forma
 * segura enquanto as duas formas coexistem no mundo (o ERP de demonstração de
 * hoje e a versão de KB que o `ApiCentriumOAuth.yaml` documenta), e é o que
 * permite ao `erp-mock` dos testes E2E continuar espelhando o YAML sem que a
 * suíte deixe de exercitar o caminho de produção.
 */

/**
 * Texto que representa um número decimal, do jeito que o GeneXus serializa
 * (`"1.0000"`, `"-203.000"`, `"0.00000"`, `"999999"`).
 *
 * Restrito de propósito: `Number('')` é `0` e `Number(' ')` também, então uma
 * string vazia num campo de preço viraria "R$ 0,00" em silêncio. Aqui ela é
 * erro de fronteira, como qualquer outro corpo fora do contrato.
 */
const TEXTO_NUMERICO = /^\s*[+-]?\d+(?:\.\d+)?\s*$/;

const textoNumericoSchema = z.string().regex(TEXTO_NUMERICO).transform(Number);

/**
 * Campo numérico do ERP: aceita `number` (int32, e o que o `erp-mock` produz) e
 * a string numérica que o ERP real devolve para `double`/`int64`.
 *
 * Substitui `z.number()` em todo schema de resposta. Não é `z.coerce.number()`:
 * aquele converte `true` em `1`, `null` em `0` e `""` em `0` — três corpos
 * inválidos que passariam a atravessar a fronteira como valor plausível.
 */
export const numeroErp = z.union([z.number(), textoNumericoSchema]);

/** Mesmo contrato de `numeroErp`, exigindo inteiro depois da conversão. */
export const inteiroErp = numeroErp.pipe(z.number().int());

/**
 * Aceita a resposta com **ou** sem o envelope nomeado do YAML, e devolve sempre
 * o conteúdo interno.
 *
 * O desembrulho acontece no `preprocess`, antes da validação: quando a chave
 * está presente o schema interno valida o valor dela; quando não está — o caso
 * do ERP real — valida a própria raiz. Como o resultado é o objeto interno nos
 * dois caminhos, quem consome não precisa saber qual formato chegou.
 *
 * `messages`, quando existe ao lado do envelope, é descartado aqui: nenhum dos
 * endpoints que usam este helper o consome (quem consome é `GetDav`/
 * `FaturarNFCe`, que mantêm o envelope e por isso **não** passam por aqui).
 */
export function semEnvelope<S extends z.ZodType>(
  chave: string,
  interno: S,
): z.ZodType<z.output<S>> {
  return z.preprocess((valor: unknown) => {
    if (typeof valor === 'object' && valor !== null && !Array.isArray(valor) && chave in valor) {
      return (valor as Record<string, unknown>)[chave];
    }
    return valor;
  }, interno);
}
