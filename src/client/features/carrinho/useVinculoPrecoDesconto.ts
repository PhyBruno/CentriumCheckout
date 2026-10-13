import { useCallback, useRef, useState } from 'react';
import { lerCentavosDigitados } from '@/lib/numeroDigitado';
import {
  ajustarAoPrecoMinimo,
  consolidarPorDesconto,
  consolidarPorPreco,
  descontoDoPreco,
  ehVinculavel,
  limiteDeDesconto,
  precoDoDesconto,
  type ItemConsolidado,
} from '../../domain/precificacao/descontoItem';
import { ZERO_CENTAVOS, type Centavos } from '../../domain/precificacao/dinheiro';
import type { LinhaCarrinho, SnapshotPrecoProduto } from '../../domain/precificacao/linha';
import type { Milesimos } from '../../domain/precificacao/quantidade';

/**
 * Estado dos campos de preço e desconto da barra de entrada (feature 017,
 * `contracts/motor-desconto-api.md` §3, AD-279).
 *
 * Mora fora de `EntradaRapidaProduto` porque tem regra própria e é testável sem
 * renderizar a barra (Constitution II, `research.md` D4). A aritmética é do
 * domínio (`descontoItem.ts`); aqui só se decide **qual** campo recalcular.
 *
 * **O campo editado por último é o mestre.** Digitar no preço recalcula o
 * desconto; digitar no desconto recalcula o preço; sair de um campo não
 * recalcula nada. Sem isso o arredondamento de `desconto ÷ quantidade` vira
 * laço: R$ 1,00 de desconto em 3 unidades mostra preço R$ 19,67, e recalcular
 * o desconto a partir dele daria R$ 0,99 — o operador perderia um centavo sem
 * ter tocado no campo. Na confirmação, o mestre decide o par gravado
 * (`consolidar`).
 *
 * Fora de um produto vinculável (`ehVinculavel`) os dois textos são
 * independentes, como antes da 017, e `consolidar` devolve `null`.
 *
 * Os valores correntes vivem também numa ref, atualizada junto com o estado:
 * quem ajusta e confirma no mesmo gesto (US2) lê o par novo, não o do quadro
 * anterior.
 */

/** Qual dos dois campos o operador editou por último. */
export type MestreDoVinculo = 'PRECO' | 'DESCONTO';

export interface ArgsVinculoPrecoDesconto {
  /** Produto da barra (revisão ou lápis); `null` com a barra vazia. */
  readonly snapshot: SnapshotPrecoProduto | null;
  /** Quantidade lida do campo; `null` quando o texto é inválido. */
  readonly quantidade: Milesimos | null;
}

export interface VinculoPrecoDesconto {
  readonly vinculavel: boolean;
  /** Com `'DESCONTO'` num produto vinculável, o texto do preço é derivado. */
  readonly mestre: MestreDoVinculo;
  readonly precoTexto: string;
  readonly descontoTexto: string;
  mudarPreco(texto: string): void;
  mudarDesconto(texto: string): void;
  /** Mantém o preço exibido e recalcula o desconto da linha (FR-004). */
  mudarQuantidade(quantidade: Milesimos | null): void;
  /** O par que a linha deve guardar, ou `null` fora do vínculo ou com texto inválido. */
  consolidar(): ItemConsolidado | null;
  /**
   * Limita o desconto ao preço mínimo (017, US2) e devolve os dois textos
   * ajustados — `null` quando não havia o que ajustar. Quem chama avisa o
   * operador e lê os textos devolvidos, não o estado do quadro corrente.
   */
  ajustarAoMinimo(): { readonly precoTexto: string; readonly descontoTexto: string } | null;
  /** Lápis: carrega o par **derivado** da linha (o preço praticado, não o de referência). */
  carregar(linha: LinhaCarrinho): void;
  /** Revisão de produto novo: preço de tabela, sem desconto. */
  iniciar(snapshot: SnapshotPrecoProduto): void;
  zerar(): void;
}

export const TEXTO_SEM_DESCONTO = '0,00';

/** Centavos → texto do campo (`1967` → `"19,67"`), em aritmética inteira. */
export function textoDeCentavos(valor: Centavos): string {
  const reais = Math.trunc(valor / 100);
  const resto = valor % 100;
  return `${String(reais)},${String(resto).padStart(2, '0')}`;
}

interface Campos {
  readonly precoTexto: string;
  readonly descontoTexto: string;
  readonly mestre: MestreDoVinculo;
}

const CAMPOS_VAZIOS: Campos = {
  precoTexto: '',
  descontoTexto: TEXTO_SEM_DESCONTO,
  mestre: 'PRECO',
};

export function useVinculoPrecoDesconto(args: ArgsVinculoPrecoDesconto): VinculoPrecoDesconto {
  const [campos, setCampos] = useState<Campos>(CAMPOS_VAZIOS);
  const atual = useRef<Campos>(CAMPOS_VAZIOS);
  // Snapshot e quantidade do último render: os handlers rodam depois dele.
  const contexto = useRef(args);
  contexto.current = args;

  const gravar = useCallback((novos: Campos) => {
    atual.current = novos;
    setCampos(novos);
  }, []);

  const snapshotVinculavel = useCallback((): SnapshotPrecoProduto | null => {
    const { snapshot } = contexto.current;
    return snapshot !== null && ehVinculavel(snapshot) ? snapshot : null;
  }, []);

  const mudarPreco = useCallback(
    (texto: string) => {
      const snapshot = snapshotVinculavel();
      const preco = lerCentavosDigitados(texto);
      const { quantidade } = contexto.current;
      if (snapshot === null || preco === null || quantidade === null) {
        gravar({ ...atual.current, precoTexto: texto, mestre: 'PRECO' });
        return;
      }
      const desconto = descontoDoPreco(snapshot.precoBase, preco, quantidade);
      gravar({ precoTexto: texto, descontoTexto: textoDeCentavos(desconto), mestre: 'PRECO' });
    },
    [gravar, snapshotVinculavel],
  );

  const mudarDesconto = useCallback(
    (texto: string) => {
      const snapshot = snapshotVinculavel();
      const desconto = lerCentavosDigitados(texto);
      const { quantidade } = contexto.current;
      if (snapshot === null || desconto === null || quantidade === null) {
        gravar({ ...atual.current, descontoTexto: texto, mestre: 'DESCONTO' });
        return;
      }
      const preco = precoDoDesconto(snapshot.precoBase, desconto, quantidade);
      gravar({ precoTexto: textoDeCentavos(preco), descontoTexto: texto, mestre: 'DESCONTO' });
    },
    [gravar, snapshotVinculavel],
  );

  const mudarQuantidade = useCallback(
    (quantidade: Milesimos | null) => {
      contexto.current = { ...contexto.current, quantidade };
      const snapshot = snapshotVinculavel();
      const preco = lerCentavosDigitados(atual.current.precoTexto);
      if (snapshot === null || preco === null || quantidade === null) {
        return;
      }
      const desconto = descontoDoPreco(snapshot.precoBase, preco, quantidade);
      gravar({ ...atual.current, descontoTexto: textoDeCentavos(desconto) });
    },
    [gravar, snapshotVinculavel],
  );

  const consolidar = useCallback((): ItemConsolidado | null => {
    const snapshot = snapshotVinculavel();
    const { quantidade } = contexto.current;
    if (snapshot === null || quantidade === null) {
      return null;
    }
    if (atual.current.mestre === 'DESCONTO') {
      const desconto = lerCentavosDigitados(atual.current.descontoTexto);
      return desconto === null ? null : consolidarPorDesconto(snapshot, desconto);
    }
    const preco = lerCentavosDigitados(atual.current.precoTexto);
    return preco === null ? null : consolidarPorPreco(snapshot, preco, quantidade);
  }, [snapshotVinculavel]);

  const ajustarAoMinimo = useCallback(() => {
    const snapshot = snapshotVinculavel();
    const { quantidade } = contexto.current;
    const item = consolidar();
    if (snapshot === null || quantidade === null || item === null) {
      return null;
    }
    const limite = limiteDeDesconto(item.precoUnitario, snapshot.precoMinimo, quantidade);
    const ajuste = ajustarAoPrecoMinimo(item.descontoManual, limite);
    if (!ajuste.ajustado) {
      return null;
    }
    const novos: Campos = {
      precoTexto: textoDeCentavos(precoDoDesconto(item.precoUnitario, ajuste.desconto, quantidade)),
      descontoTexto: textoDeCentavos(ajuste.desconto),
      // O desconto ajustado é exato; o preço exibido é que deriva dele.
      mestre: 'DESCONTO',
    };
    gravar(novos);
    return { precoTexto: novos.precoTexto, descontoTexto: novos.descontoTexto };
  }, [consolidar, gravar, snapshotVinculavel]);

  const carregar = useCallback(
    (linha: LinhaCarrinho) => {
      contexto.current = { snapshot: linha.snapshot, quantidade: linha.quantidade };
      if (!ehVinculavel(linha.snapshot)) {
        gravar({
          precoTexto: textoDeCentavos(linha.precoUnitario),
          descontoTexto: textoDeCentavos(linha.descontoManual),
          mestre: 'PRECO',
        });
        return;
      }
      const preco = precoDoDesconto(linha.precoUnitario, linha.descontoManual, linha.quantidade);
      // Com desconto, a referência gravada é o preço de tabela e o desconto é
      // a verdade (D4): confirmar sem mexer regrava o mesmo desconto, não um
      // recalculado a partir do preço arredondado. Sem desconto, o preço manda
      // — inclusive um preço acima da tabela, que `consolidarPorDesconto`
      // trocaria pelo de tabela.
      const desconto = linha.descontoManual;
      const mestre: MestreDoVinculo =
        desconto > ZERO_CENTAVOS && linha.precoUnitario === linha.snapshot.precoBase
          ? 'DESCONTO'
          : 'PRECO';
      gravar({
        precoTexto: textoDeCentavos(preco),
        descontoTexto: textoDeCentavos(desconto),
        mestre,
      });
    },
    [gravar],
  );

  const iniciar = useCallback(
    (snapshot: SnapshotPrecoProduto) => {
      contexto.current = { ...contexto.current, snapshot };
      gravar({
        precoTexto: textoDeCentavos(snapshot.precoBase),
        descontoTexto: TEXTO_SEM_DESCONTO,
        mestre: 'PRECO',
      });
    },
    [gravar],
  );

  const zerar = useCallback(() => {
    gravar(CAMPOS_VAZIOS);
  }, [gravar]);

  return {
    vinculavel: args.snapshot !== null && ehVinculavel(args.snapshot),
    mestre: campos.mestre,
    precoTexto: campos.precoTexto,
    descontoTexto: campos.descontoTexto,
    mudarPreco,
    mudarDesconto,
    mudarQuantidade,
    consolidar,
    ajustarAoMinimo,
    carregar,
    iniciar,
    zerar,
  };
}
