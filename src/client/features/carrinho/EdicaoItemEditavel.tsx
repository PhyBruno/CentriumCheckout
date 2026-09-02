import { useEffect, useRef, useState, type ReactElement } from 'react';
import { Button } from '@/components/ui/button';
import { centavos, formatarCentavos, type Centavos } from '../../domain/precificacao/dinheiro';
import { milesimosDeUnidades, type Milesimos } from '../../domain/precificacao/quantidade';
import type { PendenteDeEdicao } from './useCarrinho';

/**
 * Revisão de um produto `ProdutoPesavelEditavel = 'E'` antes da inserção (T022).
 *
 * A linha **não** entra ao terminar de editar: só quando o operador aciona o
 * botão `+` (`FR-014`, AD-027/AD-063). É por isso que este componente não chama
 * `inserirItem` sozinho — devolve os ajustes a quem o montou.
 *
 * Compartilhado pelos dois caminhos de inserção, busca (US1) e código direto
 * (US2), porque o fluxo `'E'` é o mesmo nos dois.
 */

export interface AjustesDeItem {
  readonly quantidade: Milesimos;
  readonly precoUnitario: Centavos;
  readonly descontoLinha: Centavos;
}

export interface EdicaoItemEditavelProps {
  readonly pendente: PendenteDeEdicao;
  readonly onConfirmar: (ajustes: AjustesDeItem) => void;
  readonly onCancelar: () => void;
}

const CENTAVOS_POR_REAL = 100;

/** `"12,34"` e `"12.34"` → `1234` centavos; entrada inválida vira `null`. */
function lerCentavos(texto: string): Centavos | null {
  const normalizado = texto.trim().replace(',', '.');
  if (normalizado === '' || !/^\d+(\.\d{1,2})?$/.test(normalizado)) {
    return null;
  }
  return centavos(Math.round(Number(normalizado) * CENTAVOS_POR_REAL));
}

function lerQuantidade(texto: string): Milesimos | null {
  const normalizado = texto.trim().replace(',', '.');
  if (normalizado === '' || !/^\d+(\.\d{1,3})?$/.test(normalizado)) {
    return null;
  }
  const unidades = Number(normalizado);
  return unidades > 0 ? milesimosDeUnidades(unidades) : null;
}

function paraTextoDecimal(valorEmCentavos: number): string {
  return (valorEmCentavos / CENTAVOS_POR_REAL).toFixed(2).replace('.', ',');
}

export function EdicaoItemEditavel({
  pendente,
  onConfirmar,
  onCancelar,
}: EdicaoItemEditavelProps): ReactElement {
  const [quantidade, setQuantidade] = useState(() =>
    (pendente.quantidade / 1000).toFixed(3).replace('.', ','),
  );
  const [preco, setPreco] = useState(() => paraTextoDecimal(pendente.snapshot.precoBase));
  const [desconto, setDesconto] = useState('0,00');

  // O foco pula para os campos editáveis assim que o produto `'E'` é resolvido
  // (`FR-014`) — o operador não precisa alcançá-los com o mouse.
  const primeiroCampo = useRef<HTMLInputElement>(null);
  useEffect(() => {
    primeiroCampo.current?.focus();
    primeiroCampo.current?.select();
  }, [pendente]);

  const quantidadeLida = lerQuantidade(quantidade);
  const precoLido = lerCentavos(preco);
  const descontoLido = lerCentavos(desconto);
  const valido = quantidadeLida !== null && precoLido !== null && descontoLido !== null;

  return (
    <form
      className="flex flex-col gap-sm rounded-xl border border-border bg-background p-base"
      data-testid="edicao-item-editavel"
      onSubmit={(evento) => {
        evento.preventDefault();
        if (quantidadeLida === null || precoLido === null || descontoLido === null) {
          return;
        }
        onConfirmar({
          quantidade: quantidadeLida,
          precoUnitario: precoLido,
          descontoLinha: descontoLido,
        });
      }}
    >
      <p className="font-medium">{pendente.snapshot.descricao}</p>

      <div className="flex flex-wrap items-end gap-sm">
        <label className="flex flex-col gap-xxs text-sm">
          Quantidade
          <input
            ref={primeiroCampo}
            className="h-9 w-28 rounded-md border border-border px-2 text-right tabular-nums"
            inputMode="decimal"
            data-testid="edicao-quantidade"
            value={quantidade}
            onChange={(evento) => {
              setQuantidade(evento.target.value);
            }}
          />
        </label>

        <label className="flex flex-col gap-xxs text-sm">
          Unidade
          {/* A unidade vem do cadastro do produto e não é editável no PDV. */}
          <input
            className="h-9 w-20 rounded-md border border-border bg-muted px-2"
            data-testid="edicao-unidade"
            value={pendente.snapshot.unidadeMedida}
            readOnly
          />
        </label>

        <label className="flex flex-col gap-xxs text-sm">
          Preço un.
          <input
            className="h-9 w-32 rounded-md border border-border px-2 text-right tabular-nums"
            inputMode="decimal"
            data-testid="edicao-preco"
            value={preco}
            onChange={(evento) => {
              setPreco(evento.target.value);
            }}
          />
        </label>

        <label className="flex flex-col gap-xxs text-sm">
          Desconto
          <input
            className="h-9 w-32 rounded-md border border-border px-2 text-right tabular-nums"
            inputMode="decimal"
            data-testid="edicao-desconto"
            value={desconto}
            onChange={(evento) => {
              setDesconto(evento.target.value);
            }}
          />
        </label>

        <Button type="submit" disabled={!valido} data-testid="confirmar-item-editavel">
          <span aria-hidden>+</span>
          <span className="sr-only">Adicionar item à venda</span>
        </Button>

        <Button type="button" variant="ghost" onClick={onCancelar}>
          Descartar
        </Button>
      </div>

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {valido
          ? `Total do item: ${formatarCentavos(
              centavos(
                Math.max(
                  0,
                  Math.round((precoLido * quantidadeLida) / 1000) - descontoLido,
                ),
              ),
            )}`
          : 'Informe quantidade, preço e desconto válidos.'}
      </p>
    </form>
  );
}
