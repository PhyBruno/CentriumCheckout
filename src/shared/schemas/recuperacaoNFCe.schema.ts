import { z } from 'zod';
import { centavos } from '../../client/domain/precificacao/dinheiro';
import { checkoutFaturarNFCeSchema } from './dav.schema';
import { inteiroErp, numeroErp, semEnvelope } from './erpJson';

/**
 * Validação de fronteira das respostas de `GetListaNFCes` e `CarregarNFCe`
 * (T002, Constitution IV — `specs/011-recuperacao-nfce/contracts/erp-recuperacao-api.md`).
 *
 * Os nomes e tipos saem do contrato real (`Fluxograma - Diagrama -
 * Alinhamentos/ApiCentriumOAuth.yaml`, `info.version: 20260827192357`,
 * `CheckoutListaRascunhos` e `CheckoutListaRascunhos.Rascunho_Rascunho`),
 * conferidos campo a campo: nenhum campo é inventado e nenhum campo do contrato
 * é exigido além do que esta feature consome.
 *
 * **`CarregarNFCe` não ganha um schema de documento próprio** (AD-117): o corpo
 * que ele devolve é o mesmo `CheckoutFaturarNFCe` de `GetDav`, então este
 * módulo importa `checkoutFaturarNFCeSchema` de `dav.schema.ts` e só troca o
 * envelope. Duplicá-lo criaria dois schemas para um contrato só, que
 * divergiriam no primeiro campo que o ERP acrescentasse. Também **não** é o
 * `faturarNFCe.schema.ts` da feature 004 — aquele valida a resposta menor de
 * `POST FaturarNFCe` (`{ NotaFiscal }`), nunca o documento completo.
 */

/**
 * `Total` da listagem: `double` do ERP → `Centavos` inteiros.
 *
 * `numeroErp` porque o ERP real serializa decimal como string (`"167.89"`,
 * AD-165). Só exibição — este valor nunca entra em cálculo; quem manda no total
 * da venda retomada são as linhas que `CarregarNFCe` devolve.
 */
const valorEmCentavos = numeroErp.transform((valor) => centavos(Math.round(valor * 100)));

/**
 * `CheckoutListaRascunhos.Rascunho_Rascunho`.
 *
 * **Sem campo de série, de caixa/terminal ou de status**: nenhum dos três
 * existe no contrato. É por isso que a janela de recuperação não desenha as
 * colunas "Série" e "Caixa" nem os filtros de status/vendedor/série do Pencil —
 * exibi-los exigiria inventar o estado do documento, mesmo critério já aplicado
 * ao modal de DAV (AD-024/AD-095).
 *
 * `Vendedor` e `Operador` **são** nomes aqui, ao contrário de `ListaDAVs`, que
 * só devolve o código do vendedor (AD-095). A janela de NFCe consegue exibir os
 * dois por extenso.
 */
export const rascunhoDaListaSchema = z.looseObject({
  NumeroNota: inteiroErp,
  Cliente: z.string(),
  Vendedor: z.string(),
  Operador: z.string(),
  /**
   * `format: date-time` — repassado **cru** para dentro da aplicação e
   * formatado só na exibição. O Checkout não reinterpreta data do ERP
   * (Constitution III): converter para `Date` aqui aplicaria o fuso do
   * navegador do PDV a um instante que o servidor já resolveu.
   */
  Emissao: z.string(),
  Total: valorEmCentavos,
});

export const checkoutListaRascunhosSchema = z.looseObject({
  PaginaAtual: inteiroErp,
  RegistrosPorPagina: inteiroErp,
  TotalRegistros: inteiroErp,
  TotalPaginas: inteiroErp,
  Rascunho: z.array(rascunhoDaListaSchema),
});

/**
 * `GET /ApiCentriumOAuth/GetListaNFCes` — **sem** o envelope
 * `CheckoutListaRascunhos` do YAML.
 *
 * Mesmo comportamento de `ListaDAVs`/`GetProduto`/`GetCliente`: o GeneXus
 * serializa o SDT na raiz quando a procedure tem um único parâmetro de saída, e
 * `GetListaNFCes` está na lista dos verificados ao vivo em 2026-09-04 (AD-165,
 * `erpJson.ts`). `semEnvelope` aceita as duas formas, então o `erp-mock` dos
 * testes E2E pode continuar espelhando o YAML.
 */
export const listaNFCesOutputSchema = semEnvelope(
  'CheckoutListaRascunhos',
  checkoutListaRascunhosSchema,
);

/**
 * `GET /ApiCentriumOAuth/CarregarNFCe` — também **sem** envelope no ERP real
 * (AD-165), ao contrário de `GetDav`, que o mantém por devolver `messages`.
 *
 * `produtos` e `FormasDePagamento` seguem obrigatórios, herdados de
 * `checkoutFaturarNFCeSchema`: uma recusa de negócio do ERP volta `200` com o
 * SDT zerado, e aceitá-la retomaria um rascunho vazio, com `clienteCodigo: 0`,
 * como se fosse sucesso. Falhar na fronteira é o desfecho correto.
 */
export const carregarNFCeOutputSchema = semEnvelope(
  'OutCheckoutFaturarNFCe',
  checkoutFaturarNFCeSchema,
);

export type RascunhoDaLista = z.infer<typeof rascunhoDaListaSchema>;
export type CheckoutListaRascunhos = z.infer<typeof checkoutListaRascunhosSchema>;
