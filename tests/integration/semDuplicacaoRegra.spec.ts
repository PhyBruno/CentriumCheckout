import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * T028 — `SC-001`: nenhuma regra de negócio é duplicada entre desktop e mobile.
 *
 * O critério verificável dessa frase é **de onde a mutação sai**. Se um arquivo
 * de `layout/` importasse um slice direto, ele teria como aplicar uma regra
 * própria — inserir item com preço calculado ali, escolher forma sem passar
 * pelas validações da 008 — e a partir daí as duas árvores poderiam divergir sem
 * que nenhum teste de comportamento acusasse.
 *
 * A regra é: `layout/` **compõe**; quem muta a venda é sempre um componente da
 * feature dona (003/004/005/008/012/014), pelo store combinado. Ler o
 * `vendaStore` combinado é permitido — é como toda a base lê estado; o que não é
 * permitido é falar com um slice pelas costas do store.
 */
const RAIZ_LAYOUT = join(process.cwd(), 'src/client/layout');

function arquivosDeLayout(diretorio: string = RAIZ_LAYOUT): readonly string[] {
  return readdirSync(diretorio, { withFileTypes: true }).flatMap((entrada) => {
    const caminho = join(diretorio, entrada.name);
    if (entrada.isDirectory()) {
      return arquivosDeLayout(caminho);
    }
    return entrada.name.endsWith('.ts') || entrada.name.endsWith('.tsx') ? [caminho] : [];
  });
}

function importsDe(conteudo: string): readonly string[] {
  return [...conteudo.matchAll(/^\s*import[^;]*?from\s*'([^']+)';/gm)].map(
    (encontro) => encontro[1] ?? '',
  );
}

describe('Nenhuma regra de venda mora em layout/ (SC-001)', () => {
  it('há arquivos de layout a inspecionar', () => {
    expect(arquivosDeLayout().length).toBeGreaterThan(0);
  });

  it('nenhum arquivo de layout/ importa um slice do vendaStore diretamente', () => {
    const violacoes = arquivosDeLayout().flatMap((caminho) => {
      const conteudo = readFileSync(caminho, 'utf8');
      return importsDe(conteudo)
        .filter((especificador) => especificador.includes('stores/slices/'))
        .map((especificador) => `${caminho} importa ${especificador}`);
    });

    expect(violacoes).toEqual([]);
  });

  it('nenhum arquivo de layout/ importa um serviço de rede do ERP', () => {
    // Constitution III: esta feature não faz nenhuma chamada de rede própria —
    // toda ida ao ERP pertence à feature de domínio composta. A exceção
    // declarada é o polling de status do sistema (003, `research.md` D6), que o
    // `AppShell` só agenda: quem busca é `App` (002).
    const violacoes = arquivosDeLayout().flatMap((caminho) => {
      const conteudo = readFileSync(caminho, 'utf8');
      return importsDe(conteudo)
        .filter(
          (especificador) =>
            especificador.includes('services/') && !especificador.includes('statusSistema'),
        )
        .map((especificador) => `${caminho} importa ${especificador}`);
    });

    expect(violacoes).toEqual([]);
  });
});
