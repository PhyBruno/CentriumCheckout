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

/**
 * `research.md` D3 e `FR-009`/AD-144, na forma verificável: **quem lê o
 * breakpoint**.
 *
 * A garantia de que nenhum comportamento depende do layout não vem de um teste
 * de comportamento — viria de infinitos deles. Vem de ninguém ter a informação:
 * se só o `AppShell` sabe qual árvore está montada, nenhuma regra de pagamento,
 * carrinho ou finalização **pode** variar com ela. Um `useIsMobile` novo dentro
 * de `features/pagamento/`, por exemplo, seria o primeiro passo para uma forma
 * de pagamento sumir no tablet sem que ninguém tivesse decidido isso.
 */
const CONSULTAS_DE_LAYOUT = [
  'useIsMobile',
  'useLayoutCompacto',
  'usePlataforma',
  'obterPlataforma',
  'classificarLayout',
  'CONSULTA_LAYOUT_COMPACTO',
] as const;

/**
 * As exceções declaradas. Ambas variam a **apresentação** de algo que já
 * aconteceu, nunca a disponibilidade de uma forma de pagamento, de uma
 * integração ou de um passo da venda — que é a linha que este teste protege.
 *
 * - `useAtalhosVendaRapida.ts` (013): `projetarAtalhos` recebe a plataforma como
 *   capacidade injetada (`FR-020`/D11 daquela feature) e devolve lista vazia no
 *   compacto — é exatamente assim que `FR-005` da 007 se cumpre, sem flag nova.
 * - `lib/notificar.ts` (007/AD-195): escolhe **onde a mesma frase é desenhada** —
 *   título no desktop, `description` mais tremida no compacto. O operador lê
 *   palavra por palavra o mesmo texto nos dois layouts; o que muda é o campo da
 *   API do `goey-toast`, porque o título do pacote é uma pílula de linha única
 *   que recorta frase longa em 390px. Nenhuma notificação existe num layout e
 *   falta no outro — se um dia faltasse, seria uma violação de verdade e este
 *   comentário estaria mentindo.
 */
const EXCECOES = [
  'src/client/features/venda-rapida/useAtalhosVendaRapida.ts',
  'src/client/lib/notificar.ts',
] as const;

function arquivosDoCliente(
  diretorio: string = join(process.cwd(), 'src/client'),
): readonly string[] {
  return readdirSync(diretorio, { withFileTypes: true }).flatMap((entrada) => {
    const caminho = join(diretorio, entrada.name);
    if (entrada.isDirectory()) {
      return arquivosDoCliente(caminho);
    }
    return entrada.name.endsWith('.ts') || entrada.name.endsWith('.tsx') ? [caminho] : [];
  });
}

function relativo(caminho: string): string {
  return caminho.slice(process.cwd().length + 1).replaceAll('\\', '/');
}

describe('Só o AppShell decide por layout (research.md D3, FR-009/AD-144)', () => {
  it('nenhum arquivo fora de layout/ consulta o breakpoint, salvo a exceção declarada da 013', () => {
    const violacoes = arquivosDoCliente().flatMap((caminho) => {
      const relativoDoArquivo = relativo(caminho);
      if (
        relativoDoArquivo.startsWith('src/client/layout/') ||
        relativoDoArquivo.startsWith('src/client/domain/layout/') ||
        EXCECOES.includes(relativoDoArquivo as (typeof EXCECOES)[number])
      ) {
        return [];
      }

      const conteudo = readFileSync(caminho, 'utf8');
      // Só os `import`s: uma menção em comentário (`PainelPagamentoETotais`
      // explica por que a faixa some no compacto) não dá acesso a nada.
      const importados = importsDe(conteudo).join('\n');
      const linhasDeImport = conteudo.match(/^\s*import[^;]*?from\s*'[^']+';/gm) ?? [];

      return CONSULTAS_DE_LAYOUT.filter(
        (consulta) =>
          linhasDeImport.some((linha) => linha.includes(consulta)) ||
          importados.includes(`layout/${consulta}`),
      ).map((consulta) => `${relativoDoArquivo} consulta ${consulta}`);
    });

    expect(violacoes).toEqual([]);
  });

  it('o roteamento de integração de pagamento não recebe a plataforma como insumo', () => {
    // AD-144 revogou AD-074: cartão vai ao TEF pela configuração do ambiente
    // (`FormaIntegracaoCartao`, AD-180), nunca pelo tamanho da tela. Se o
    // parâmetro voltasse à assinatura, a disponibilidade de TEF poderia divergir
    // entre o cartão do desktop e a etapa 2 do wizard sem nenhum teste de tela
    // perceber.
    const roteamento = readFileSync(
      join(process.cwd(), 'src/client/domain/pagamento/roteamentoIntegracao.ts'),
      'utf8',
    );

    expect(importsDe(roteamento).some((especificador) => especificador.includes('layout'))).toBe(
      false,
    );
  });
});
