import { useEffect, useId, useRef, useState, type ReactElement } from 'react';
import { Button } from '@/components/ui/button';
import {
  formatarQuantidade,
  milesimosDeUnidades,
  type Milesimos,
} from '../../domain/precificacao/quantidade';

/**
 * Edição inline da quantidade de uma linha **já inserida** no carrinho
 * (`FR-007`, T030) — a única forma que o operador tem hoje de corrigir uma
 * quantidade bipada errada sem cancelar a linha inteira e reinseri-la.
 *
 * Extraído de `GridItens.tsx`/`ListaItensMobile.tsx` porque os dois precisam
 * do mesmo comportamento (parse, validação, confirmar/cancelar) sobre a mesma
 * fonte de estado — duplicá-lo nos dois componentes violaria responsabilidade
 * única (Constitution II). Mesmo padrão visual de `EdicaoItemEditavel.tsx`
 * (form com foco automático e validação antes de habilitar o submit), mas sem
 * reaproveitar código dele: aquele componente edita um item **antes** de
 * entrar na venda e nunca chama `editarItem`.
 *
 * Não chama `editarItem` diretamente — devolve a quantidade lida para quem o
 * monta, que decide o `idLinha` e fecha o modo de edição (mesma divisão de
 * responsabilidade de `EdicaoItemEditavel`/`onConfirmar`).
 */

export interface EdicaoQuantidadeItemProps {
  readonly quantidadeAtual: Milesimos;
  readonly onConfirmar: (quantidade: Milesimos) => void;
  readonly onCancelar: () => void;
}

/** `"3"`, `"3,5"` ou `"3.5"` → `Milesimos`; inválida ou não positiva vira `null`. */
function lerQuantidade(texto: string): Milesimos | null {
  const normalizado = texto.trim().replace(',', '.');
  if (normalizado === '' || !/^\d+(\.\d{1,3})?$/.test(normalizado)) {
    return null;
  }
  const unidades = Number(normalizado);
  return unidades > 0 ? milesimosDeUnidades(unidades) : null;
}

export function EdicaoQuantidadeItem({
  quantidadeAtual,
  onConfirmar,
  onCancelar,
}: EdicaoQuantidadeItemProps): ReactElement {
  const [quantidade, setQuantidade] = useState(() => formatarQuantidade(quantidadeAtual, 3));
  const idCampo = useId();

  // Foco automático ao abrir a edição, como em `EdicaoItemEditavel` — o
  // operador não precisa alcançar o campo com o mouse.
  const campoRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    campoRef.current?.focus();
    campoRef.current?.select();
  }, []);

  const quantidadeLida = lerQuantidade(quantidade);
  const valida = quantidadeLida !== null;

  return (
    <form
      className="flex items-center gap-xs"
      data-testid="edicao-quantidade-item"
      onSubmit={(evento) => {
        evento.preventDefault();
        if (quantidadeLida === null) {
          return;
        }
        onConfirmar(quantidadeLida);
      }}
    >
      <label className="sr-only" htmlFor={idCampo}>
        Nova quantidade
      </label>
      <input
        id={idCampo}
        ref={campoRef}
        className="h-8 w-20 rounded-md border border-border px-2 text-right tabular-nums"
        inputMode="decimal"
        data-testid="editar-quantidade-input"
        value={quantidade}
        onChange={(evento) => {
          setQuantidade(evento.target.value);
        }}
      />
      <Button type="submit" size="sm" disabled={!valida} data-testid="confirmar-quantidade">
        Confirmar
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        data-testid="cancelar-edicao-quantidade"
        onClick={onCancelar}
      >
        Cancelar
      </Button>
    </form>
  );
}
