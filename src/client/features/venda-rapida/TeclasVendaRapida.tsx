import { useAtalhosDeTeclado } from '../../hotkeys/mapaAtalhos';
import type { ListaAtalhos, TeclaAtalho } from '../../domain/vendaRapida/tipos';
import { useAcionarCenario } from './useAcionarCenario';

/**
 * O registro das teclas F6–F9 da venda rápida (feature 016, US5).
 *
 * **Separado da faixa visual de propósito.** Até a 016 quem registrava as
 * teclas era `DicaAtalhos`, e a faixa só é montada no cartão de pagamento do
 * desktop — então "não exibir a faixa" e "não acionar a tecla" eram o mesmo
 * fato (`FR-020`/D11 da 013). A 016 os separa: a tecla aciona em qualquer
 * plataforma (`FR-011`), a faixa continua só no desktop (`FR-012`). Com o
 * registro aqui, montado em `AppShell` acima da bifurcação de layout, a faixa
 * vira apresentação pura e a tecla passa a ter **um dono só** nos dois layouts.
 *
 * As regras de quando a tecla vale são as de sempre, e continuam em
 * `useAtalhosDeTeclado`: cede a tecla a quem digita, não age com modal aberto,
 * ignora a repetição (`FR-014` da 013).
 */

/** Liga cada atalho da lista ao comando. */
function useTeclasDosAtalhos(atalhos: ListaAtalhos, onAcionar: (tecla: TeclaAtalho) => void): void {
  useAtalhosDeTeclado(
    atalhos.map((atalho) => ({
      tecla: atalho.tecla,
      aoAcionar: () => {
        onAcionar(atalho.tecla);
      },
    })),
    // Sem atalho, o mapa não escuta nada — e um F6 sem cenário volta a ser do
    // navegador. A posse incondicional é só do mapa fixo da 016.
    atalhos.length > 0,
  );
}

export interface TeclasDosAtalhosProps {
  readonly atalhos: ListaAtalhos;
  /** O **mesmo** comando do clique na faixa — não há caminho alternativo. */
  readonly onAcionar: (tecla: TeclaAtalho) => void;
}

/**
 * Registra as teclas de uma `ListaAtalhos` pronta. Renderiza nada.
 *
 * Recebe a lista e o comando por prop, como `DicaAtalhos`, para as regras de
 * colisão com digitação e bipagem serem exercitáveis sem o provider de
 * finalização nem a query do catálogo.
 */
export function TeclasDosAtalhos({ atalhos, onAcionar }: TeclasDosAtalhosProps): null {
  useTeclasDosAtalhos(atalhos, onAcionar);
  return null;
}

/** As teclas ligadas à venda: lista da sessão + comando real. Renderiza nada. */
export function TeclasVendaRapida(): null {
  const { atalhos, acionar } = useAcionarCenario();
  useTeclasDosAtalhos(atalhos, (tecla) => {
    void acionar(tecla);
  });
  return null;
}
