import { useRef, useState, type KeyboardEvent, type ReactElement } from 'react';
import { Button } from '@/components/ui/button';
import { EdicaoItemEditavel } from './EdicaoItemEditavel';
import { useInsercaoDeProduto, type PendenteDeEdicao } from './useCarrinho';

/**
 * Campo de bipagem/digitação de código (T021, `CART-02`).
 *
 * TAB e Enter confirmam a entrada. A classificação (`codigo*qtd`, EAN-13 de
 * balança, código simples) é do domínio puro — este componente só coleta o
 * texto, entrega ao hook de inserção e reage ao resultado.
 *
 * Não registra atalho global de teclado: um `hotkey` de escopo de documento
 * competiria com a própria bipagem, que chega como digitação rápida neste input.
 */
export function EntradaRapidaProduto(): ReactElement {
  const { inserirPorCodigo, confirmarEdicao } = useInsercaoDeProduto();
  const [texto, setTexto] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [pendente, setPendente] = useState<PendenteDeEdicao | null>(null);
  const campo = useRef<HTMLInputElement>(null);

  function devolverFoco(): void {
    campo.current?.focus();
  }

  async function confirmarEntrada(): Promise<void> {
    const entrada = texto.trim();
    if (entrada === '' || ocupado) {
      return;
    }

    setOcupado(true);
    try {
      const resultado = await inserirPorCodigo(entrada);

      if (resultado.situacao === 'edicao') {
        // Produto `'E'`: a linha não entra ainda; o foco vai para os campos
        // editáveis e a inserção espera o botão `+` (`FR-014`).
        setPendente(resultado);
        setTexto('');
        return;
      }

      if (resultado.situacao === 'inserido') {
        setTexto('');
      }
      // Em recusa o texto permanece: o operador corrige o que digitou. Em ambos
      // os casos o foco volta ao campo, sem exigir clique (`FR-013`).
      devolverFoco();
    } finally {
      setOcupado(false);
    }
  }

  function aoTeclar(evento: KeyboardEvent<HTMLInputElement>): void {
    if (evento.key !== 'Enter' && evento.key !== 'Tab') {
      return;
    }
    // TAB não pode sair do campo antes de confirmar a entrada: no PDV ele é a
    // tecla de confirmação, não de navegação (AD-027/AD-063).
    evento.preventDefault();
    void confirmarEntrada();
  }

  return (
    <div className="flex flex-col gap-sm" data-testid="entrada-rapida-produto">
      <label className="flex flex-col gap-xxs text-sm">
        Código do produto
        <div className="flex items-center gap-sm">
          <input
            ref={campo}
            className="h-10 flex-1 rounded-lg border border-border px-3"
            data-testid="campo-codigo-produto"
            autoComplete="off"
            autoFocus
            placeholder="Bipe ou digite o código (use * para informar a quantidade)"
            value={texto}
            disabled={pendente !== null}
            onChange={(evento) => {
              setTexto(evento.target.value);
            }}
            onKeyDown={aoTeclar}
          />
          <Button
            type="button"
            disabled={ocupado || texto.trim() === '' || pendente !== null}
            onClick={() => {
              void confirmarEntrada();
            }}
          >
            Inserir
          </Button>
        </div>
      </label>

      {pendente === null ? null : (
        <EdicaoItemEditavel
          pendente={pendente}
          onConfirmar={(ajustes) => {
            confirmarEdicao(pendente, ajustes);
            setPendente(null);
            devolverFoco();
          }}
          onCancelar={() => {
            setPendente(null);
            devolverFoco();
          }}
        />
      )}
    </div>
  );
}
