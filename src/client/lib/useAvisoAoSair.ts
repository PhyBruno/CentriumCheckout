import { useEffect } from 'react';

/**
 * Pede confirmação ao navegador antes de descartar a página (F5, fechar a aba,
 * navegar para fora) — pedido do usuário, 2026-09-04 (item 8).
 *
 * Fecha uma lacuna antiga: AD-006 decidiu que a venda **não** sobrevive a um
 * reload (Zustand sem `persist`, Constitution VI) e a própria constitution do
 * projeto exige que "F5 durante a venda MUST exigir confirmação explícita do
 * operador (`beforeunload`)". A decisão estava escrita em `.specs/` desde
 * 2026-08-20 e nunca chegou ao código: até aqui, um F5 acidental apagava
 * carrinho, cliente e pagamento sem uma única pergunta.
 *
 * ---
 *
 * ### O texto do aviso é do navegador, não nosso
 *
 * Desde 2016 Chrome, Firefox e Safari **ignoram** a mensagem passada em
 * `returnValue` e exibem um texto genérico próprio ("As alterações feitas podem
 * não ser salvas"), justamente para impedir que páginas escrevam frases
 * coercitivas nesse diálogo. Não há API que mude isso, e nenhum modal próprio
 * pode substituí-lo: o `beforeunload` é síncrono e o React não consegue pintar
 * nada durante ele.
 *
 * Então o que este hook controla é **se** o diálogo aparece — que é exatamente a
 * decisão de negócio. A perda de dados que ele anuncia é a real: com o carrinho
 * ou um cliente identificado na tela, confirmar o reload zera a venda.
 *
 * ### Por que um hook genérico, e não "useAvisoDeVendaEmAndamento"
 *
 * O hook recebe um booleano e não conhece `vendaStore` (Dependency Inversion,
 * Constitution II). Quem sabe o que conta como "venda em andamento" é a tela de
 * venda — e essa definição já existe e é usada por outra regra (o polling de
 * `GetStatusSistema`). Duplicá-la aqui dentro criaria duas respostas para a
 * mesma pergunta, livres para divergir.
 *
 * O ouvinte é **removido** quando `ativo` é `false`, em vez de registrado sempre
 * e desviado por dentro: um `beforeunload` registrado permanentemente desliga o
 * cache de retrocesso/avanço (bfcache) dos navegadores, tornando o "voltar" lento
 * mesmo numa venda vazia.
 */
export function useAvisoAoSair(ativo: boolean): void {
  useEffect(() => {
    if (!ativo) {
      return;
    }

    const aoSair = (evento: BeforeUnloadEvent): void => {
      // Os dois são necessários: `preventDefault()` é o padrão atual e
      // `returnValue` continua sendo o que navegadores mais antigos leem. Sem
      // um dos dois, parte dos navegadores descarta a página sem perguntar.
      evento.preventDefault();
      evento.returnValue = '';
    };

    window.addEventListener('beforeunload', aoSair);
    return () => {
      window.removeEventListener('beforeunload', aoSair);
    };
  }, [ativo]);
}
