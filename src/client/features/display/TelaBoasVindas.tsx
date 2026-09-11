import { CartShopping } from 'reicon-react';
import type { ReactElement } from 'react';

/**
 * Repouso da tela do cliente (feature 015, FR-003).
 *
 * **Nada** da venda ou do cliente aparece aqui — nem item, nem preço, nem total,
 * nem nome, nem documento. Não é economia de tela: é uma tela virada para o
 * público de uma loja, e o que estiver nela é lido por quem estiver por perto.
 * A união discriminada de `EstadoDisplay` garante o mesmo pelo tipo: a variante
 * `BOAS_VINDAS` não tem campo nenhum (invariante E2).
 *
 * **Sem nó no Pencil.** Esta feature não tem tela desenhada em
 * `design/CentriumCheckout.pen`; o usuário autorizou (2026-09-10) derivar o
 * visual do `ModalPix` já implementado, e a exceção está registrada na spec §
 * Assumptions. É exceção, não regra nova: qualquer outra tela continua exigindo
 * consulta ao Pencil primeiro.
 *
 * O nome exibido é `nomeDaLoja`, **nunca** `tituloDoProduto` (research D1): o
 * cliente não tem nada a ver com o nome do software de PDV. `null` quando a
 * empresa não está cadastrada, e aí sobra só a saudação — sem linha órfã.
 */
export function TelaBoasVindas({ nomeLoja }: { readonly nomeLoja: string | null }): ReactElement {
  return (
    <section
      className="flex h-full w-full flex-col items-center justify-center gap-md px-xl text-center"
      data-testid="display-boas-vindas"
    >
      <span className="flex size-24 items-center justify-center rounded-full bg-primary">
        <CartShopping className="size-12 text-primary-foreground" aria-hidden="true" />
      </span>

      {nomeLoja !== null && (
        <h1
          className="text-5xl leading-[1.15] font-semibold text-foreground"
          data-testid="display-nome-loja"
        >
          {nomeLoja}
        </h1>
      )}

      <p className="text-2xl leading-[1.3] text-muted-foreground">Seja bem-vindo!</p>
    </section>
  );
}
