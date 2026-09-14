import type { FastifyInstance } from 'fastify';

/**
 * Cabeçalhos de segurança de toda resposta do BFF.
 *
 * O servidor não mandava nenhum deles — sem CSP, `X-Frame-Options`, `nosniff`,
 * HSTS ou `Referrer-Policy` (achado do gate `/owasp-security`, item 54 de
 * `.specs/project/PENDENCIES.md`). São escritos à mão, e não via
 * `@fastify/helmet`, porque a política precisa de duas exceções muito
 * específicas deste PDV (impressão local e QR Code em `data:`) que só ficam
 * legíveis com o motivo ao lado — e porque um pacote a menos é uma superfície
 * de supply-chain a menos, preocupação já registrada em
 * `.specs/codebase/CONCERNS.md`.
 */

/**
 * Política de conteúdo da SPA.
 *
 * Duas diretivas fogem do `'self'` puro, e as duas têm causa concreta:
 *
 * - **`connect-src` aceita `http:`/`https:`** por causa da impressão direta:
 *   `imprimirNFCeLocal.ts` chama o serviço da máquina do PDV
 *   (`SessaoUsuario.CadMaqHost`, default `127.0.0.1:4545`) **do navegador**,
 *   sem passar pelo BFF — o container não tem, necessariamente, rota até a
 *   rede local do PDV (AD-006/AD-083). O host varia por máquina e só é
 *   conhecido depois do bootstrap, então não há valor fixo a listar aqui. A
 *   defesa que sobra contra exfiltração é `script-src 'self'`, que é a que
 *   impede o script injetado de existir em primeiro lugar.
 * - **`img-src` aceita `data:` e `blob:`** porque o QR Code do PIX chega como
 *   base64 no corpo do ERP e o PDF da NFCe vira `blob:` antes de abrir.
 * - **`object-src` aceita `'self'` e `blob:`**, e não `'none'`, pelo mesmo PDF:
 *   `abrirPdfNFCe` faz `window.open(blobUrl)`, o documento em `blob:` herda a
 *   CSP de quem o criou, e o visualizador embutido do Chrome renderiza num
 *   contexto de plugin regido por `object-src`. Com `'none'` o operador pode
 *   receber **aba em branco** no lugar do cupom — e em silêncio, porque o
 *   `window.open` teve sucesso e `abrirPdfNFCe` devolve `{estado:'aberto'}`.
 *   Continua fechado para plugin de origem externa, que é o risco real da
 *   diretiva.
 *
 * `style-src` mantém `'unsafe-inline'`: componentes do carrinho e dos modais
 * usam `style={{ … }}` para medidas calculadas em runtime, que o Tailwind não
 * expressa. `script-src` **não** tem escape equivalente — é a diretiva que
 * carrega o valor real desta política.
 */
export const CSP_CHECKOUT = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'self' blob:",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self'",
  // O parse do bootstrap (~5MB) roda em Web Worker de módulo (AUTH-04); alguns
  // bundlers o entregam como `blob:`.
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self' http: https:",
  "media-src 'self'",
].join('; ');

/**
 * HSTS **sem `includeSubDomains`**.
 *
 * A diretiva saiu por um motivo concreto, não por cautela genérica: o menu
 * gerencial redireciona o navegador para `<tenant>.<baseDomain>`
 * (`gerencial.ts`), e `ERP_PROTOCOL` é configurável. Se o Checkout for servido
 * do próprio `<baseDomain>` em HTTPS enquanto as telas legadas do ERP ainda
 * estiverem em `http:`, `includeSubDomains` fixaria **todo** subdomínio de
 * tenant em HTTPS por dois anos naquele navegador — e o gerencial pararia de
 * abrir, sem nada que o servidor pudesse fazer para desfazer. O host do próprio
 * Checkout continua protegido, que é o que o cabeçalho existe para fazer aqui.
 *
 * Dois anos continua sendo o `max-age` das listas de preload.
 *
 * **Vai em toda resposta, sem olhar o esquema — e isso é deliberado.** Emitir só
 * em `https` pareceria mais correto (RFC 6797 §7.2), mas o app roda em Docker
 * com o TLS terminando no proxy à frente e **sem `trustProxy`**
 * (`src/server/index.ts`): `request.protocol` seria `'http'` em produção e o
 * cabeçalho nunca sairia. Em `http:` de verdade — dev e E2E — o navegador
 * descarta o cabeçalho por conta própria, então mandá-lo sempre não atrapalha.
 */
export const HSTS = 'max-age=63072000';

/**
 * `Referrer-Policy: no-referrer` não é zelo genérico aqui: o Checkout é
 * alcançado por um redirect do ERP cuja query string **carrega as credenciais
 * do operador** (`/session/start`). Qualquer política que vaze a URL de origem
 * vazaria a senha junto.
 *
 * `Permissions-Policy` mantém a câmera liberada para a própria origem — o
 * scanner de código de barras depende dela — e fecha o resto.
 *
 * `Cross-Origin-Opener-Policy` é `same-origin-allow-popups`, não `same-origin`:
 * o display do cliente e o menu gerencial abrem abas com `window.open`.
 */
export const HEADERS_DE_SEGURANCA: Readonly<Record<string, string>> = {
  'Content-Security-Policy': CSP_CHECKOUT,
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Strict-Transport-Security': HSTS,
  'Permissions-Policy': 'camera=(self), microphone=(), geolocation=(), payment=()',
  'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'X-Permitted-Cross-Domain-Policies': 'none',
};

/**
 * Aplica os cabeçalhos a **toda** resposta — API, estático da SPA, redirect de
 * `/session/start` e páginas de erro.
 *
 * O hook é `onSend`, e não `onRequest`, porque é o último ponto por onde toda
 * resposta passa: o `@fastify/static` e o `notFoundHandler` montam as suas fora
 * do ciclo normal de rota.
 */
export function registrarHeadersDeSeguranca(app: FastifyInstance): void {
  app.addHook('onSend', async (_request, reply, payload: unknown) => {
    reply.headers(HEADERS_DE_SEGURANCA);
    return payload;
  });
}
