import type { RegistroBootstrap } from '../../src/client/db/bootstrapDb';

/**
 * Registro de bootstrap sintético para os testes das features de venda.
 *
 * Todos os valores são inventados — nenhum dado de produção. Existe para que
 * cada feature nova que passa a ler um campo de `SessaoUsuario` (a 004 leu
 * `CadSerieNFCe`, `CadMaqHost` e `TipoImpressao`) não obrigue a editar um
 * literal repetido em cada arquivo de teste.
 */
export function registroBootstrapDe(
  sobrescritasDaSessao: Record<string, unknown> = {},
): RegistroBootstrap {
  return {
    tenant: 'acme',
    codigoEmpresa: '1',
    _versionHash: 'hash-de-teste',
    SessaoUsuario: {
      TipoPreco: 8,
      CadMaqCod: 'PDV01',
      CadSerieNFCe: '1',
      CadMaqHost: '127.0.0.1:4545',
      TipoImpressao: 'E',
      ListaPrecoDefault: 3,
      CenarioPagamento: '[]',
      QtdMinCharParaConsulta: 3,
      UsuarioTipoCodigoProduto: 'I',
      ClienteDefaultCodigo: 1,
      ...sobrescritasDaSessao,
    },
  };
}
