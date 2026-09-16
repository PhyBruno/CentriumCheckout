import { z } from 'zod';
import { centavos } from '../../client/domain/precificacao/dinheiro';
import { checkoutFaturarNFCeSchema } from './dav.schema';
import { inteiroErp, numeroErp, semEnvelope } from './erpJson';

/**
 * Validação de fronteira das respostas de `GetListaNFCes` e `CarregarNFCe`
 * (T002, Constitution IV — `specs/011-recuperacao-nfce/contracts/erp-recuperacao-api.md`).
 *
 * Os nomes e tipos saem do contrato real (`Fluxograma - Diagrama -
 * Alinhamentos/ApiCentriumOAuth.yaml`, `info.version: 20260914191012`,
 * `CheckoutListaRascunhos` e `CheckoutListaRascunhos.Rascunho_Rascunho`),
 * conferidos campo a campo contra o ERP de preview (AD-235): nenhum campo é
 * inventado e nenhum campo do contrato é exigido além do que esta feature
 * consome.
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
 * `CheckoutListaRascunhos.Rascunho_Rascunho` — forma do contrato de 2026-09-14
 * (AD-235, medida no ERP de preview).
 *
 * Até então a linha trazia `NumeroNota` e três strings no formato
 * `"<código> - <NOME>"` (`Cliente`/`Vendedor`/`Operador`). O contrato novo
 * separa código e nome e acrescenta **`Serie`**, que passa a ser a série
 * enviada a `CarregarNFCe` — `SessaoUsuario.CadSerieNFCe` vem vazia no preview.
 *
 * **Sem campo de caixa/terminal ou de status**: nenhum dos dois existe no
 * contrato. É por isso que a janela de recuperação não desenha a coluna "Caixa"
 * nem os filtros de status/caixa do Pencil — exibi-los exigiria inventar o
 * estado do documento, mesmo critério já aplicado ao modal de DAV
 * (AD-024/AD-095).
 *
 * Nomes são `z.string()` aceitando `""`: é o default do SDT GeneXus para campo
 * não preenchido (operador sem nome), e quem exibe trata o vazio.
 */
export const rascunhoDaListaSchema = z.looseObject({
  /** Número nativo na listagem; string nos documentos. `inteiroErp` cobre os dois. */
  NumeroRascunho: inteiroErp,
  Serie: z.string(),
  ClienteCodigo: inteiroErp,
  ClienteNome: z.string(),
  VendedorCodigo: inteiroErp,
  VendedorNome: z.string(),
  OperadorCodigo: inteiroErp,
  OperadorNome: z.string(),
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
  /** Ausente na busca sem resultado — ver `Clientes` em `cliente.schema.ts`. */
  Rascunho: z.array(rascunhoDaListaSchema).optional().default([]),
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
 * `GET /ApiCentriumOAuth/CarregarNFCe` — envelope só quando há `messages`, como
 * todo o `ApiCentriumOAuth` (AD-218); `semEnvelope` aceita as duas formas.
 *
 * `produtos` segue obrigatório, herdado de `checkoutFaturarNFCeSchema`: uma
 * recusa de negócio do ERP volta `200` com o SDT zerado, e aceitá-la retomaria
 * um rascunho vazio, com `clienteCodigo: 0`, como se fosse sucesso. Falhar na
 * fronteira é o desfecho correto. (`FormasDePagamento` é opcional desde
 * 2026-09-11 — ver `dav.schema.ts`.)
 */
export const carregarNFCeOutputSchema = semEnvelope(
  'OutCheckoutFaturarNFCe',
  checkoutFaturarNFCeSchema,
);

export type RascunhoDaLista = z.infer<typeof rascunhoDaListaSchema>;
export type CheckoutListaRascunhos = z.infer<typeof checkoutListaRascunhosSchema>;
