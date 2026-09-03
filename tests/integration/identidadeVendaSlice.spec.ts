import { describe, expect, it } from 'vitest';
import { criarVendaStore } from '../../src/client/stores/vendaStore';
import type { CarrinhoDeps } from '../../src/client/stores/slices/carrinhoSlice';
import { ErroIdentidadeVendaInvalida } from '../../src/client/stores/slices/identidadeVendaSlice';

/**
 * Guarda pós-pagamento da identidade da venda (AD-139).
 *
 * O slice é exercitado através de `criarVendaStore` — a composição real, com o
 * **mesmo** predicado `podeMutarCarrinho` que carrinho e cliente recebem
 * (AD-043) — e não de um `criarIdentidadeVendaSlice` isolado: é a composição que
 * pode divergir, e é ela que `abrirSessaoDeVenda` usa.
 */

function storeCom(podeMutarCarrinho: () => boolean, avisos: string[] = []) {
  const depsCarrinho: CarrinhoDeps = {
    podeMutarCarrinho,
    tipoPrecoAtual: () => 8,
    clienteAtual: () => null,
    avisar: (mensagem) => {
      avisos.push(mensagem);
    },
  };
  return criarVendaStore(depsCarrinho);
}

describe('definirIdentidadeVenda — bloqueio pós-pagamento (AD-139)', () => {
  it('é no-op com aviso quando a venda não pode mais ser mutada', () => {
    const avisos: string[] = [];
    const store = storeCom(() => false, avisos);

    store.getState().definirIdentidadeVenda({ origem: 'DAV', numeroNota: 90210 });

    // Sem a guarda, uma venda com pagamento aprovado passaria a apontar para o
    // rascunho de outro documento mantendo o próprio conteúdo, e `FaturarNFCe`
    // fecharia o documento errado — sem erro nem aviso.
    expect(store.getState().identidadeVenda).toEqual({ origem: 'NOVA', numeroNota: 0 });
    // No-op **com aviso**, nunca exceção — mesmo contrato de `inserirItem`
    // (003) e `selecionarCliente` (005).
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatch(/pagamento aprovado/i);
  });

  it('grava normalmente enquanto a venda pode ser mutada', () => {
    const store = storeCom(() => true);

    store.getState().definirIdentidadeVenda({ origem: 'DAV', numeroNota: 90210 });

    expect(store.getState().identidadeVenda).toEqual({ origem: 'DAV', numeroNota: 90210 });
  });

  it('valida o NumeroNota antes da guarda: payload impossível continua falhando alto', () => {
    const store = storeCom(() => false);

    // Um `numeroNota` fracionário é defeito de contrato, não estado legítimo da
    // venda: engoli-lo como no-op esconderia o bug justamente onde ele importa
    // (Constitution IV).
    expect(() => {
      store.getState().definirIdentidadeVenda({ origem: 'DAV', numeroNota: 1.5 });
    }).toThrow(ErroIdentidadeVendaInvalida);
  });
});

describe('início e fim de venda continuam livres com pagamento aprovado (AD-139)', () => {
  it('iniciarIdentidadeVenda não é barrada — é o caminho de `abrirSessaoDeVenda`', () => {
    const avisos: string[] = [];
    const store = storeCom(() => false, avisos);

    store.getState().iniciarIdentidadeVenda({ origem: 'RASCUNHO', numeroNota: 4821 });

    expect(store.getState().identidadeVenda).toEqual({ origem: 'RASCUNHO', numeroNota: 4821 });
    expect(avisos).toEqual([]);
  });

  it('resetarIdentidadeVenda não é barrada — roda depois do FaturarNFCe bem-sucedido', () => {
    const store = storeCom(() => true);
    store.getState().definirIdentidadeVenda({ origem: 'DAV', numeroNota: 90210 });

    // A partir daqui a venda tem pagamento aprovado: é exatamente o estado em
    // que `useFinalizarOuSuspenderVenda` limpa a venda (`FR-012`).
    const bloqueado = storeCom(() => false);
    bloqueado.getState().iniciarIdentidadeVenda({ origem: 'DAV', numeroNota: 90210 });
    bloqueado.getState().resetarIdentidadeVenda();

    expect(bloqueado.getState().identidadeVenda).toEqual({ origem: 'NOVA', numeroNota: 0 });
    expect(store.getState().identidadeVenda.numeroNota).toBe(90210);
  });

  it('reproduz a limpeza de fim de venda: reset + início da próxima, com o lock ligado', () => {
    const store = storeCom(() => false);
    store.getState().iniciarIdentidadeVenda({ origem: 'DAV', numeroNota: 90210 });

    // Sequência literal de `useFinalizarOuSuspenderVenda` no caso 'sucesso':
    // `resetarIdentidadeVenda()` seguido de `abrirSessaoDeVenda('NOVA')`, ambos
    // com o pagamento ainda aprovado no estado.
    store.getState().resetarIdentidadeVenda();
    store.getState().resetarAuditoria('NOVA');
    store.getState().iniciarIdentidadeVenda({ origem: 'NOVA', numeroNota: 0 });

    expect(store.getState().identidadeVenda).toEqual({ origem: 'NOVA', numeroNota: 0 });
  });

  it('a mesma sequência pela ação guardada deixaria a venda seguinte com a identidade anterior', () => {
    // Este teste existe para fixar **por que** a ação de início é separada da de
    // mudança: se `abrirSessaoDeVenda` usasse `definirIdentidadeVenda`, a
    // abertura da venda seguinte viraria um no-op silencioso assim que a feature
    // 008 ligasse o predicado real. Aqui o `resetarIdentidadeVenda` é omitido de
    // propósito para isolar o efeito da guarda sobre a abertura.
    const store = storeCom(() => false);
    store.getState().iniciarIdentidadeVenda({ origem: 'DAV', numeroNota: 90210 });

    store.getState().definirIdentidadeVenda({ origem: 'NOVA', numeroNota: 0 });

    expect(store.getState().identidadeVenda).toEqual({ origem: 'DAV', numeroNota: 90210 });
  });
});
