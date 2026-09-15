/**
 * Por que a câmera não abriu — a frase que o operador lê dentro da janela do
 * scanner (correção do usuário, 2026-09-15).
 *
 * **O que motivou a separação por causa.** Até aqui todo desfecho de
 * `getUserMedia` produzia a mesma frase, "Não foi possível abrir a câmera. Use o
 * campo de código.". Ela é verdadeira e inútil no caso que o usuário relatou: o
 * Android recusou **exibir** o diálogo de permissão e mostrou por cima "Este
 * site não pode pedir permissões — feche todos os balões e sobreposições de
 * outros apps". Quem lê só a frase genérica conclui que o Checkout está
 * quebrado; a saída real é fechar a bolha de conversa, o filtro de luz azul ou o
 * gravador de tela que está desenhando sobre o Chrome, e tentar de novo.
 *
 * O Chrome não distingue esse caso no `name` do erro — vem `NotAllowedError`,
 * igual à recusa deliberada do operador —, então a frase da permissão cobre os
 * dois desfechos e nomeia as duas saídas. Inventar uma terceira leitura a partir
 * da `message`, que muda entre versões do navegador, seria adivinhação.
 *
 * Puro e fora do componente pelo mesmo motivo de `suportaScannerCamera`: é regra
 * de produto (o que o operador deve fazer), não desenho de tela, e assim cada
 * causa ganha teste sem montar câmera nenhuma.
 */

/**
 * Causa sintética para o caso em que **não há o que chamar**: fora de um
 * contexto seguro o navegador nem publica `navigator.mediaDevices`, e tentar
 * `getUserMedia` ali produz um `TypeError` cuja frase padrão não diz nada ao
 * operador. É o desfecho de abrir o Checkout por `http://<ip-da-lan>` ou por
 * HTTPS com certificado que o aparelho não confia — exatamente o cenário de
 * teste em rede local (`vite --mode lan`).
 */
export const CAUSA_CONTEXTO_INSEGURO = 'ContextoInseguro';

const PERMISSAO_RECUSADA =
  'A permissão da câmera não foi concedida. Se o aparelho avisou que o site não pode pedir permissões, feche o que estiver sobreposto na tela — bolhas de conversa, filtro de luz, gravador — e toque em "Tentar de novo". Pelo campo de código a venda segue normalmente.';

const SEM_CAMERA =
  'Nenhuma câmera disponível neste aparelho. Use o campo de código para inserir o produto.';

const CAMERA_OCUPADA =
  'A câmera está em uso por outro aplicativo. Feche-o e toque em "Tentar de novo", ou use o campo de código.';

const CONTEXTO_INSEGURO =
  'A câmera só abre em conexão segura: acesse o Checkout por um endereço HTTPS confiável. Use o campo de código para inserir o produto.';

const FALHA_GENERICA = 'Não foi possível abrir a câmera. Use o campo de código.';

/**
 * `unknown` na entrada, e não `DOMException`: o que chega ao `catch` de
 * `getUserMedia` é o que o navegador resolveu lançar — inclusive o `TypeError`
 * de `navigator.mediaDevices` indefinido, que nem é uma exceção de mídia.
 */
export function mensagemDeFalhaDaCamera(erro: unknown): string {
  // `DOMException` é testado à parte de `Error`, e não por preciosismo: no
  // navegador ela herda de `Error`, mas no jsdom não — sem esta linha, **toda**
  // causa cairia no genérico durante os testes e a regra passaria despercebida
  // até alguém abrir a tela num celular.
  const nome = erro instanceof DOMException || erro instanceof Error ? erro.name : '';

  // `PermissionDeniedError` é o nome legado da mesma recusa, ainda lançado por
  // Android antigo — que é justamente o parque de aparelhos de um PDV.
  // `OverconstrainedError` é a câmera traseira inexistente (`facingMode:
  // 'environment'` não satisfeito): para quem opera, é igual a não haver câmera.
  switch (nome) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return PERMISSAO_RECUSADA;
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return SEM_CAMERA;
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return CAMERA_OCUPADA;
    case 'SecurityError':
    case CAUSA_CONTEXTO_INSEGURO:
      return CONTEXTO_INSEGURO;
    default:
      return FALHA_GENERICA;
  }
}
