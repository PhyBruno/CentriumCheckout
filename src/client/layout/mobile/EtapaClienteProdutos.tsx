import type { ReactElement } from 'react';
import { EntradaRapidaProduto } from '../../features/carrinho/EntradaRapidaProduto';
import { ListaItensMobile } from '../../features/carrinho/ListaItensMobile';
import { CampoClienteVenda } from '../../features/cliente/CampoClienteVenda';
import { ScannerCamera } from './ScannerCamera';

/**
 * Etapa 1 do wizard — "Cliente e produtos" (nó `IQloN` do Pencil, T015).
 *
 * Composição pura: identificação do cliente (005 — e, dentro do mesmo card, o
 * campo de vendedor da 012, que é onde o desenho o põe), entrada rápida de
 * produto (003) e a lista de itens.
 *
 * **A lista entra aqui de propósito**, e é o único desvio do desenho nesta
 * etapa. O Pencil compensa a ausência dela com um contador ("Itens · 5
 * produtos") no cartão escuro do topo; o cartão escuro real é `TotalDaVenda`
 * (008), que mostra total/recebido/faltante e não conta itens. Sem a lista, o
 * operador bipa e não recebe nenhuma confirmação do que entrou — justamente o
 * retorno que o contador do desenho existia para dar. Reaproveita
 * `ListaItensMobile`, a mesma da etapa 2, sem componente novo.
 *
 * **O que esta etapa nunca monta** (`FR-008`/`FR-010`): importação de documento
 * (006), recuperação de NFCe (011) e telas de retaguarda — nenhuma delas é
 * importada por arquivo algum de `layout/mobile/`, e `ausenciaEstrutural.spec.ts`
 * verifica isso automaticamente.
 */
export function EtapaClienteProdutos(): ReactElement {
  return (
    <div className="flex flex-col gap-xs" data-testid="etapa-cliente-produtos">
      <CampoClienteVenda />

      {/* O código lido pela câmera entra pelo **mesmo** `inserirPorCodigo` do
          leitor físico e da digitação (`FR-007`, D5) — o slot recebe a função,
          não um caminho de inserção próprio. Fora de Chrome/Android o botão
          nem chega a existir: `ScannerCamera` devolve `null` (`FR-011`). */}
      <EntradaRapidaProduto
        renderizarCaptura={(aoLerCodigo) => <ScannerCamera onCodigoLido={aoLerCodigo} />}
      />

      <ListaItensMobile />
    </div>
  );
}
