import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ReactElement } from 'react';
import { aplicarMascaraData, CampoData } from '../../../../src/client/components/ui/campo-data';

/**
 * Campo de data das janelas de importação (correção do usuário, 2026-09-11).
 *
 * O defeito que originou a suíte: digitar `11092026` no filtro de emissão não
 * virava data nenhuma — o texto ficava cru, `paraIso` não o reconhecia, o
 * filtro nunca era aplicado e o `onBlur` devolvia a data anterior em silêncio.
 * No caixa ninguém digita a barra.
 */

/** Hospedeiro mínimo: o campo é controlado, e a máscara depende disso. */
function CampoDeProva({
  inicial = '',
  onChange = (): void => {
    /* o teste que precisa do valor passa o seu */
  },
}: {
  readonly inicial?: string;
  readonly onChange?: (iso: string) => void;
}): ReactElement {
  const [valor, setValor] = useState(inicial);
  return (
    <CampoData
      rotulo="Data inicial de emissão"
      testId="campo-data"
      valor={valor}
      onChange={(iso) => {
        setValor(iso);
        onChange(iso);
      }}
    />
  );
}

describe('aplicarMascaraData', () => {
  it('põe as barras conforme os dígitos chegam', () => {
    expect(aplicarMascaraData('1')).toBe('1');
    expect(aplicarMascaraData('11')).toBe('11');
    expect(aplicarMascaraData('119')).toBe('11/9');
    expect(aplicarMascaraData('1109')).toBe('11/09');
    expect(aplicarMascaraData('110920')).toBe('11/09/20');
    expect(aplicarMascaraData('11092026')).toBe('11/09/2026');
  });

  /**
   * A barra nunca se antecipa ao dígito: com `11/` montado sozinho, o
   * Backspace apagaria a barra e a máscara a reporia na mesma tecla, prendendo
   * o operador no campo.
   */
  it('não antecipa a barra, então apagar sempre encurta o texto', () => {
    expect(aplicarMascaraData('11/09/2026'.slice(0, -1))).toBe('11/09/202');
    expect(aplicarMascaraData('11/0'.slice(0, -1))).toBe('11');
    expect(aplicarMascaraData('11'.slice(0, -1))).toBe('1');
    expect(aplicarMascaraData('')).toBe('');
  });

  it('é idempotente e aceita texto colado já formatado', () => {
    expect(aplicarMascaraData('11/09/2026')).toBe('11/09/2026');
    expect(aplicarMascaraData(aplicarMascaraData('11092026'))).toBe('11/09/2026');
  });

  it('descarta o que não é dígito e para no oitavo', () => {
    expect(aplicarMascaraData('1a1b0c9')).toBe('11/09');
    expect(aplicarMascaraData('110920261234')).toBe('11/09/2026');
  });
});

describe('CampoData — digitação', () => {
  it('formata sozinho enquanto o operador digita só números', async () => {
    const usuario = userEvent.setup();
    render(<CampoDeProva />);

    const campo = screen.getByTestId('campo-data');
    await usuario.type(campo, '11092026');

    expect(campo).toHaveValue('11/09/2026');
  });

  it('entrega ao filtro o ISO da data digitada sem barra', async () => {
    const aoTrocar = vi.fn<(iso: string) => void>();
    const usuario = userEvent.setup();
    render(<CampoDeProva onChange={aoTrocar} />);

    await usuario.type(screen.getByTestId('campo-data'), '01062026');

    expect(aoTrocar).toHaveBeenLastCalledWith('2026-06-01');
  });

  /**
   * A data impossível não vira filtro nenhum: o texto fica em tela até o campo
   * perder o foco, e então volta ao último valor válido — o `Date` normalizaria
   * 31/02 para março em silêncio.
   */
  it('não aplica data que não existe no calendário', async () => {
    const aoTrocar = vi.fn<(iso: string) => void>();
    const usuario = userEvent.setup();
    render(<CampoDeProva inicial="2026-09-01" onChange={aoTrocar} />);

    const campo = screen.getByTestId('campo-data');
    await usuario.clear(campo);
    await usuario.type(campo, '31022026');

    expect(campo).toHaveValue('31/02/2026');
    expect(aoTrocar).not.toHaveBeenCalled();

    await usuario.tab();
    expect(campo).toHaveValue('01/09/2026');
  });
});
