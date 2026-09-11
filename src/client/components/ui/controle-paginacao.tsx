import { ChevronLeft, ChevronRight } from 'reicon-react';
import { useState, type ReactElement } from 'react';
import { Button } from '@/components/ui/button';

/**
 * Rodapé de paginação das janelas de consulta (DAV e recuperação de NFCe).
 *
 * Era o mesmo bloco escrito duas vezes, e com ele o mesmo defeito duas vezes:
 * o contador lia `lista.data?.totalPaginas ?? 1`, e `data` fica `undefined`
 * enquanto o ERP responde a página nova. Resultado, a cada clique em "Próxima",
 * um instante de **"3 de 1"** — a contagem sumia justamente no momento em que
 * o operador olhava para ela (correção do usuário, 2026-09-11).
 *
 * A correção tem duas metades, e as duas moram aqui:
 *
 * - **A página exibida é a do operador**, não a que voltou do ERP. Quem clicou
 *   em "Próxima" já está na página 3; esperar o servidor confirmar faria o
 *   número piscar para trás.
 * - **O total de páginas é lembrado** enquanto a consulta não traz um novo.
 *   Ele é propriedade do conjunto filtrado, não da página em trânsito: some do
 *   `data` durante o fetch, mas continua verdadeiro. O último total conhecido
 *   fica retido aqui e só é substituído quando chega outro.
 *
 * Por isso o total lembrado é estado **deste** componente, e não da query: o
 * cache do TanStack Query guarda uma entrada por página, e nenhuma delas
 * sobrevive à troca de filtro — que é exatamente quando o total muda de valor.
 *
 * Forma do frame do Pencil (`Modal Menu DAV`, nó `Hao17`): dois botões de 36px
 * de altura e 112 de largura, pílula de contagem entre eles, folga de 8.
 */

export interface ControlePaginacaoProps {
  /** Página que o operador está vendo — estado da janela, não da resposta. */
  readonly pagina: number;
  /**
   * Total de páginas da consulta atual, ou `undefined` enquanto o ERP responde.
   * Ausente não é "uma página": é "ainda não sei", e o último total conhecido
   * continua valendo.
   */
  readonly totalPaginas: number | undefined;
  readonly onTrocarPagina: (pagina: number) => void;
  /** Prefixo dos `data-testid` (`dav`, `nfce`). */
  readonly testIdPrefixo: string;
}

export function ControlePaginacao({
  pagina,
  totalPaginas,
  onTrocarPagina,
  testIdPrefixo,
}: ControlePaginacaoProps): ReactElement {
  const [ultimoTotal, setUltimoTotal] = useState(1);
  if (totalPaginas !== undefined && totalPaginas !== ultimoTotal) {
    // Estado derivado no padrão do React 19 — um `useEffect` aqui renderizaria
    // uma vez com o total velho antes de corrigir, que é o piscar que este
    // componente existe para eliminar.
    setUltimoTotal(totalPaginas);
  }

  // Consulta sem resultado devolve `TotalPaginas: 0` (confirmado no ERP real,
  // 2026-09-11). "1 de 0" não é contagem de nada — a página vazia ainda é uma
  // página, e é a que está em tela.
  const total = Math.max(1, totalPaginas ?? ultimoTotal);
  const naUltima = pagina >= total;

  return (
    <div className="flex items-center gap-xs" data-testid={`paginacao-${testIdPrefixo}`}>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="h-9 w-28 gap-xs rounded-full text-sm font-semibold"
        data-testid={`${testIdPrefixo}-pagina-anterior`}
        disabled={pagina <= 1}
        onClick={() => {
          onTrocarPagina(Math.max(1, pagina - 1));
        }}
      >
        <ChevronLeft className="size-3.5" aria-hidden="true" />
        Anterior
      </Button>
      <span
        className="flex h-9 items-center rounded-full bg-secondary px-sm text-sm font-semibold text-foreground"
        data-testid={`${testIdPrefixo}-contador-paginas`}
      >
        {pagina} de {total}
      </span>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="h-9 w-28 gap-xs rounded-full text-sm font-semibold"
        data-testid={`${testIdPrefixo}-pagina-proxima`}
        disabled={naUltima}
        onClick={() => {
          onTrocarPagina(pagina + 1);
        }}
      >
        Próxima
        <ChevronRight className="size-3.5" aria-hidden="true" />
      </Button>
    </div>
  );
}
