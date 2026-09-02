import { centavos, type Centavos } from '../../src/client/domain/precificacao/dinheiro';
import type {
  LinhaCarrinho,
  OrigemLinha,
  PesavelEditavel,
  SnapshotPrecoProduto,
} from '../../src/client/domain/precificacao/linha';
import {
  milesimosDeUnidades,
  type Milesimos,
} from '../../src/client/domain/precificacao/quantidade';

/**
 * Fixtures sintéticas do domínio de precificação, compartilhadas pelos testes
 * unitários e de integração da feature 003.
 *
 * Todos os valores são inventados — nenhum dado de produção. O produto padrão
 * reproduz o exemplo de `data-model.md` §5: `PrecoVenda1 = 1000` centavos,
 * `PrecoVenda2 = 900`, `QtdMinimaPreco2 = 5` unidades.
 */

export interface OpcoesSnapshot {
  readonly codigoProduto?: string;
  readonly precoBase?: number;
  readonly precosFaixa?: readonly [number, number, number, number, number];
  readonly limiaresFaixaEmUnidades?: readonly [number, number, number, number];
  readonly pesavelEditavel?: PesavelEditavel;
}

export function snapshotDe(opcoes: OpcoesSnapshot = {}): SnapshotPrecoProduto {
  const precos = opcoes.precosFaixa ?? [1000, 900, 0, 0, 0];
  const limiares = opcoes.limiaresFaixaEmUnidades ?? [5, 0, 0, 0];

  return {
    codigoProduto: opcoes.codigoProduto ?? '001234',
    descricao: 'PRODUTO EXEMPLO 500G',
    unidadeMedida: 'UN',
    precoBase: centavos(opcoes.precoBase ?? 1000),
    precosFaixa: [
      centavos(precos[0]),
      centavos(precos[1]),
      centavos(precos[2]),
      centavos(precos[3]),
      centavos(precos[4]),
    ],
    limiaresFaixa: [
      milesimosDeUnidades(limiares[0]),
      milesimosDeUnidades(limiares[1]),
      milesimosDeUnidades(limiares[2]),
      milesimosDeUnidades(limiares[3]),
    ],
    pesavelEditavel: opcoes.pesavelEditavel ?? '',
  };
}

export interface OpcoesLinha {
  readonly idLinha?: string;
  readonly snapshot?: SnapshotPrecoProduto;
  readonly quantidadeEmUnidades?: number;
  readonly precoUnitario?: number;
  readonly descontoConvenio?: number;
  readonly descontoManual?: number;
  readonly cancelada?: boolean;
  readonly precoCongelado?: boolean;
  readonly origem?: OrigemLinha;
}

let sequencia = 0;

export function linhaDe(opcoes: OpcoesLinha = {}): LinhaCarrinho {
  sequencia += 1;
  const snapshot = opcoes.snapshot ?? snapshotDe();

  return {
    idLinha: opcoes.idLinha ?? `linha-${String(sequencia)}`,
    snapshot,
    quantidade: milesimosDeUnidades(opcoes.quantidadeEmUnidades ?? 1),
    precoUnitario: centavos(opcoes.precoUnitario ?? snapshot.precoBase),
    descontoConvenio: centavos(opcoes.descontoConvenio ?? 0),
    descontoManual: centavos(opcoes.descontoManual ?? 0),
    cancelada: opcoes.cancelada ?? false,
    precoCongelado: opcoes.precoCongelado ?? false,
    origem: opcoes.origem ?? 'MANUAL',
  };
}

export function unidades(valor: number): Milesimos {
  return milesimosDeUnidades(valor);
}

export function emCentavos(valor: number): Centavos {
  return centavos(valor);
}

/** Payload sintético de `GetProduto`, em reais como o ERP devolve. */
export function respostaGetProduto(
  sobrescritas: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    CodigoProduto: '001234',
    Descricao: 'PRODUTO EXEMPLO 500G',
    Referencia: 'REF-EX',
    CodigoBarras: '7890000000001',
    PrecoVenda: 10.0,
    PrecoVenda1: 10.0,
    PrecoVenda2: 9.0,
    PrecoVenda3: 0,
    PrecoVenda4: 0,
    PrecoVenda5: 0,
    PrecoMinimo: 8.5,
    Estoque: 42.0,
    QtdMinimaPreco2: 5,
    QtdMinimaPreco3: 0,
    QtdMinimaPreco4: 0,
    QtdMinimaPreco5: 0,
    UDM: 'UN',
    ProdutoPesavelEditavel: '',
    ...sobrescritas,
  };
}
