import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ReactElement } from 'react';
import { ControlePaginacao } from '../../../../src/client/components/ui/controle-paginacao';

/**
 * Rodapé de paginação das janelas de consulta (correção do usuário,
 * 2026-09-11).
 *
 * O defeito que originou a suíte: ao virar a página, o contador exibia
 * **"3 de 1"** por um instante. O total vinha de `lista.data?.totalPaginas ?? 1`
 * e `data` fica `undefined` enquanto o ERP responde — a contagem sumia
 * justamente no momento em que o operador olhava para ela.
 */

function Hospedeiro({
  totalPaginas,
  paginaInicial = 1,
}: {
  readonly totalPaginas: number | undefined;
  readonly paginaInicial?: number;
}): ReactElement {
  const [pagina, setPagina] = useState(paginaInicial);
  return (
    <ControlePaginacao
      pagina={pagina}
      totalPaginas={totalPaginas}
      testIdPrefixo="dav"
      onTrocarPagina={setPagina}
    />
  );
}

describe('ControlePaginacao', () => {
  it('lembra o total de páginas enquanto a próxima consulta não responde', async () => {
    const usuario = userEvent.setup();
    const { rerender } = render(<Hospedeiro totalPaginas={5} />);

    expect(screen.getByTestId('dav-contador-paginas')).toHaveTextContent('1 de 5');

    await usuario.click(screen.getByTestId('dav-pagina-proxima'));
    // A consulta da página 2 está em voo: a query zera `data`, e era aqui que
    // aparecia "2 de 1".
    rerender(<Hospedeiro totalPaginas={undefined} paginaInicial={2} />);

    expect(screen.getByTestId('dav-contador-paginas')).toHaveTextContent('2 de 5');
  });

  it('troca o total assim que a consulta traz outro', () => {
    const { rerender } = render(<Hospedeiro totalPaginas={5} />);
    rerender(<Hospedeiro totalPaginas={undefined} />);
    rerender(<Hospedeiro totalPaginas={2} />);

    expect(screen.getByTestId('dav-contador-paginas')).toHaveTextContent('1 de 2');
  });

  /** A página exibida é a do operador, não a que voltou do ERP. */
  it('avança o número da página no clique, sem esperar a resposta', async () => {
    const aoTrocar = vi.fn<(pagina: number) => void>();
    const usuario = userEvent.setup();
    render(
      <ControlePaginacao
        pagina={3}
        totalPaginas={9}
        testIdPrefixo="nfce"
        onTrocarPagina={aoTrocar}
      />,
    );

    await usuario.click(screen.getByTestId('nfce-pagina-proxima'));
    expect(aoTrocar).toHaveBeenCalledWith(4);

    await usuario.click(screen.getByTestId('nfce-pagina-anterior'));
    expect(aoTrocar).toHaveBeenLastCalledWith(2);
  });

  /**
   * `TotalPaginas: 0` é o que o ERP real devolve para consulta sem resultado
   * (confirmado em 2026-09-11). "1 de 0" não é contagem de nada.
   */
  it('mostra "1 de 1" quando a consulta não tem resultado', () => {
    render(<Hospedeiro totalPaginas={0} />);

    expect(screen.getByTestId('dav-contador-paginas')).toHaveTextContent('1 de 1');
    expect(screen.getByTestId('dav-pagina-anterior')).toBeDisabled();
    expect(screen.getByTestId('dav-pagina-proxima')).toBeDisabled();
  });

  /** Pedido do usuário: as pontas são alcançáveis de qualquer página. */
  it('salta para a primeira e para a última página em um clique', async () => {
    const aoTrocar = vi.fn<(pagina: number) => void>();
    const usuario = userEvent.setup();
    render(
      <ControlePaginacao
        pagina={7}
        totalPaginas={25}
        testIdPrefixo="dav"
        onTrocarPagina={aoTrocar}
      />,
    );

    await usuario.click(screen.getByTestId('dav-primeira-pagina'));
    expect(aoTrocar).toHaveBeenLastCalledWith(1);

    await usuario.click(screen.getByTestId('dav-ultima-pagina'));
    expect(aoTrocar).toHaveBeenLastCalledWith(25);
  });

  /**
   * O salto usa o total lembrado, não um número inventado: enquanto a consulta
   * está em voo, "Última página" leva ao fim que se conhece.
   */
  it('salta para o último total conhecido enquanto a consulta não responde', async () => {
    const aoTrocar = vi.fn<(pagina: number) => void>();
    const usuario = userEvent.setup();
    const { rerender } = render(
      <ControlePaginacao
        pagina={2}
        totalPaginas={9}
        testIdPrefixo="dav"
        onTrocarPagina={aoTrocar}
      />,
    );
    rerender(
      <ControlePaginacao
        pagina={3}
        totalPaginas={undefined}
        testIdPrefixo="dav"
        onTrocarPagina={aoTrocar}
      />,
    );

    await usuario.click(screen.getByTestId('dav-ultima-pagina'));
    expect(aoTrocar).toHaveBeenLastCalledWith(9);
  });

  it('fecha os saltos nas pontas, junto com "Anterior" e "Próxima"', () => {
    const semAcao = (): void => {
      /* o teste olha só o estado dos botões */
    };
    const { rerender } = render(
      <ControlePaginacao
        pagina={1}
        totalPaginas={4}
        testIdPrefixo="dav"
        onTrocarPagina={semAcao}
      />,
    );

    expect(screen.getByTestId('dav-primeira-pagina')).toBeDisabled();
    expect(screen.getByTestId('dav-ultima-pagina')).toBeEnabled();

    rerender(
      <ControlePaginacao
        pagina={4}
        totalPaginas={4}
        testIdPrefixo="dav"
        onTrocarPagina={semAcao}
      />,
    );
    expect(screen.getByTestId('dav-primeira-pagina')).toBeEnabled();
    expect(screen.getByTestId('dav-ultima-pagina')).toBeDisabled();
  });

  it('fecha "Anterior" na primeira página e "Próxima" na última', () => {
    const semAcao = (): void => {
      /* o teste olha só o estado dos botões */
    };
    const { rerender } = render(
      <ControlePaginacao
        pagina={1}
        totalPaginas={3}
        testIdPrefixo="dav"
        onTrocarPagina={semAcao}
      />,
    );

    expect(screen.getByTestId('dav-pagina-anterior')).toBeDisabled();
    expect(screen.getByTestId('dav-pagina-proxima')).toBeEnabled();

    rerender(
      <ControlePaginacao
        pagina={3}
        totalPaginas={3}
        testIdPrefixo="dav"
        onTrocarPagina={semAcao}
      />,
    );
    expect(screen.getByTestId('dav-pagina-anterior')).toBeEnabled();
    expect(screen.getByTestId('dav-pagina-proxima')).toBeDisabled();
  });
});
