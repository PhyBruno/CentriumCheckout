import type { FastifyInstance } from 'fastify';
import type { Env } from '../config/env';
import {
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_OPTIONS,
  type CifradorDeSessao,
  type SessaoOperador,
} from '../session/cookie';
import { chamarErpComRenovacao } from '../session/chamadaAutenticada';
import { executarOuEncerrarSessao } from '../session/respostaSessaoEncerrada';

export interface ErpProxyDeps {
  readonly env: Env;
  readonly cifrador: CifradorDeSessao;
  readonly fetchImpl?: typeof fetch;
}

const PREFIXO = '/api/erp';

function corpoDaRequisicao(body: unknown): BodyInit | undefined {
  if (body === undefined || body === null) {
    return undefined;
  }
  return typeof body === 'string' ? body : JSON.stringify(body);
}

/**
 * `Empresa` na query string, **além** do cabeçalho homônimo (AD-205).
 *
 * O cabeçalho sozinho não basta: no `APICentriumOAuth` da KB, só oito dos
 * métodos têm um `Event <Metodo>.Before` que faz
 * `&Empresa = &HttpRequest.GetHeader('empresa').ToNumeric()`. Os demais —
 * `GetProduto`, `GetDav`, `CarregarNFCe`, `GetStatusSistema`, `StatusPIX`,
 * `ValidaTicketDevolucao` — recebem `in:&Empresa` como parâmetro comum e o leem
 * da query. Sem ele chegam com `&Empresa = 0`, o `For Each` filtra por
 * `empcod = 0`, não acha nada e devolve `200` com o SDT recém-criado.
 *
 * Era essa a causa de "Produto não encontrado" para um produto que existe:
 * verificado ao vivo contra o ERP real em 2026-09-10 —
 * `GetProduto?Codigoproduto=0000TESTE7894&Tipocodproduto=B` com `Empresa` só no
 * cabeçalho devolveu `CodigoProduto: ""`; a mesma chamada com `Empresa=1` na
 * query devolveu o produto. Mandar nos dois lugares é decisão do usuário
 * (2026-09-10) e vale para **todos** os endpoints: nos que têm `.Before` o
 * cabeçalho sobrescreve com o mesmo valor, então o parâmetro é inócuo.
 *
 * **A posição importa: `Empresa` entra sempre como primeiro par.** Os
 * `.Before` de `GetSessao` e `GetCliente` não parseiam a query — recortam de
 * `Login=`/`CPFCNPJ=` **até o fim da string** com `SubStr`. Com `Empresa` no
 * fim, `&Login` viraria `bruno&Empresa=1` e a chamada falharia em silêncio
 * (confirmado ao vivo: `UsuarioCodigo: "0"` e `CodCliente: 0`, contra os
 * valores corretos com o parâmetro na frente).
 *
 * Ocorrências vindas do navegador são descartadas antes: a empresa da sessão
 * sai do cookie cifrado, e aceitar a do cliente deixaria um operador
 * autenticado consultar outra empresa do tenant — mesma razão de
 * `corpoComEmpresaDaSessao`. Os demais pares são repassados crus, sem
 * reserialização, para preservar codificação original e chaves repetidas.
 */
export function queryComEmpresaDaSessao(queryString: string, codigoEmpresa: string): string {
  const pares = queryString === '' ? [] : queryString.split('&');
  const semEmpresa = pares.filter((par) => !/^empresa=/i.test(par));

  return [`Empresa=${encodeURIComponent(codigoEmpresa)}`, ...semEmpresa].join('&');
}

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

/**
 * O caminho como o ERP o resolveria, para **comparar** com as listas de
 * injeção — nunca para reescrever o que é repassado.
 *
 * Achado da revisão OWASP da feature 010 (A01, 2026-10-02): as listas por
 * caminho comparavam só ignorando a caixa. Uma barra final, uma barra dupla ou
 * uma letra em `%XX` chegam ao mesmo método no servidor do ERP e escapavam da
 * comparação — o corpo forjado (com `EmpCod`/`UsuarioGAM`/`Empresa` de outro
 * operador ou empresa) seguia intacto. Aqui o caminho é decodificado, as barras
 * repetidas colapsam e a final sai. Codificação malformada fica crua: o ERP
 * também não a entenderia como o método.
 */
function caminhoComparavel(caminho: string): string {
  let decodificado = caminho;
  try {
    decodificado = decodeURIComponent(caminho);
  } catch {
    // `%` sem dois hexadecimais: compara como veio.
  }
  return decodificado.replace(/\/{2,}/g, '/').replace(/\/+$/, '').toLowerCase();
}

/**
 * O corpo sem nenhuma chave que, ignorando a caixa, seja uma das `chaves`.
 *
 * Inserir `EmpCod` ao lado de um `empcod` forjado deixaria as duas no corpo, e
 * não está confirmado se o desserializador GeneXus diferencia caixa (pendência
 * 62): a forjada poderia vencer. Removê-las antes de inserir fecha a dúvida sem
 * depender da resposta.
 */
function semVariantesDeCaixa(
  objeto: Record<string, unknown>,
  chaves: readonly string[],
): Record<string, unknown> {
  const proibidas = new Set(chaves.map((chave) => chave.toLowerCase()));
  return Object.fromEntries(
    Object.entries(objeto).filter(([chave]) => !proibidas.has(chave.toLowerCase())),
  );
}

/**
 * Campo de tenant que aparece **dentro** do corpo de alguns endpoints do ERP,
 * além do cabeçalho `Empresa`.
 *
 * O contrato exige `Cliente.Empresa` no corpo de `PostCliente` (AD-024) e
 * `CheckoutFaturarNFCe.Empresa` no de `FaturarNFCe`/`ValidarNFCe` (AD-188), e o
 * cliente hoje os preenche a partir do bootstrap. Como o corpo é do navegador,
 * um operador autenticado poderia trocar o valor e gravar registro em outra
 * empresa do tenant — o cabeçalho, que vem do cookie cifrado, não protegeria
 * disso. Aqui o servidor reescreve o campo com a empresa da sessão, que é a
 * única fonte confiável (achado da revisão, 2026-09-03).
 *
 * **Os corpos do ERP não são planos**, e por isso a varredura desce um nível:
 * `PostCliente` manda `{ Cliente: … }` e `FaturarNFCe`/`ValidarNFCe` mandam
 * `{ CheckoutFaturarNFCe: … }` (`faturarNFCeMutation.ts`,
 * `validarNFCeMutation.ts`). Quem olha só a raiz não encontra campo nenhum.
 *
 * **O tipo vai declarado por envelope porque os SDTs divergem:**
 * `Cliente.Empresa` é numérico, e `CheckoutFaturarNFCe.Empresa` é **texto** —
 * essa é a forma confirmada contra o ERP real em 2026-09-08 (AD-188), e trocar
 * o tipo ali recusaria toda venda com "Empresa é obrigatório".
 *
 * **`GerarPIX` esteve aqui por um dia e saiu.** AD-249 acrescentou
 * `SDTCentriumPag_Post` a esta lista, e a injeção estava certa — o que estava
 * errado era o envelope em volta: AD-251 mediu que o ERP só gera a cobrança com
 * o corpo **plano**, então o endpoint passou para `CAMINHOS_COM_EMPRESA_NA_RAIZ`
 * logo abaixo. Deixá-lo aqui seria injetar `Empresa` dentro de um envelope que
 * o cliente não monta mais, isto é, em lugar nenhum.
 */
const ENVELOPES_COM_EMPRESA = [
  { raiz: 'Cliente', comoTexto: false },
  { raiz: 'CheckoutFaturarNFCe', comoTexto: true },
] as const;

export function corpoComEmpresaDaSessao(body: unknown, codigoEmpresa: string): unknown {
  if (!ehObjeto(body)) {
    return body;
  }

  const empresa = Number(codigoEmpresa);
  if (!Number.isFinite(empresa)) {
    return body;
  }

  let corpo: Record<string, unknown> = body;
  for (const { raiz, comoTexto } of ENVELOPES_COM_EMPRESA) {
    const conteudo = corpo[raiz];
    if (ehObjeto(conteudo)) {
      corpo = {
        ...corpo,
        [raiz]: { ...conteudo, Empresa: comoTexto ? codigoEmpresa : empresa },
      };
    }
  }

  return corpo;
}

/**
 * Endpoints cujo corpo é **plano** e traz `Empresa` na própria raiz.
 *
 * `EnvioDiretoWhatsapp` (envio da cobrança PIX, 2026-09-21) é o primeiro:
 * `EnvioDiretoWhatsappInput` é `{ Empresa, TrnGUID, CliCod, Telefone }`, sem
 * envelope nomeado, então a varredura de `ENVELOPES_COM_EMPRESA` — que desce um
 * nível procurando `Cliente`/`CheckoutFaturarNFCe` — passa reto por ele.
 *
 * **Aqui o campo é inserido, não apenas reescrito**, e essa é a diferença que
 * justifica uma lista por caminho em vez de uma regra por presença: o cliente
 * não manda `Empresa` nenhuma (AD-019/AD-022 — o JS nunca monta tenant), logo
 * não há o que reescrever, e sem a inserção o ERP receberia `Empresa = 0` e o
 * envio morreria em silêncio, como já aconteceu com `GetProduto` em AD-205. Uma
 * regra genérica que inserisse `Empresa` em todo corpo POST atingiria também os
 * SDTs que não a declaram, o que é mexer em contrato alheio sem necessidade.
 *
 * A empresa continua vindo do cookie cifrado, que é a única fonte confiável — a
 * mesma razão de `corpoComEmpresaDaSessao` e `corpoComUsuarioDaSessao`. Ela vai
 * também na query, como em todo endpoint (AD-205); mandar nos dois lugares é o
 * que cobre o método que lê do corpo e o que lê do parâmetro.
 */
const CAMINHOS_COM_EMPRESA_NA_RAIZ = [
  '/ApiCentriumOAuth/EnvioDiretoWhatsapp',
  // `GerarPIX` entrou em 2026-09-21 (AD-251), vindo de `ENVELOPES_COM_EMPRESA`:
  // o corpo deixou de ser envelopado, e `Empresa` passou a ser um campo de raiz
  // como o do envio por WhatsApp. O SDT a declara `integer int64`, então vai
  // numérica — é o que `corpoComEmpresaNaRaiz` faz.
  '/ApiCentriumOAuth/GerarPIX',
  // Feature 010 (AD-259): `EstornarPagamento` recebe `in:&Empresa` como
  // parâmetro comum e não tem `Event … .Before` na API, então a empresa só
  // chega se estiver no corpo. O `ConsultarStatusCard`, que é `GET`, já a
  // recebe na query por `queryComEmpresaDaSessao`.
  '/ApiCentriumOAuth/EstornarPagamento',
];

export function corpoComEmpresaNaRaiz(
  body: unknown,
  caminhoNoErp: string,
  codigoEmpresa: string,
): unknown {
  const comparavel = caminhoComparavel(caminhoNoErp);
  const alvo = CAMINHOS_COM_EMPRESA_NA_RAIZ.some(
    (caminho) => caminhoComparavel(caminho) === comparavel,
  );
  if (!alvo || !ehObjeto(body)) {
    return body;
  }

  const empresa = Number(codigoEmpresa);
  if (!Number.isFinite(empresa)) {
    return body;
  }

  // `Empresa` é `integer int64` neste input — numérico, ao contrário do
  // `CheckoutFaturarNFCe.Empresa`, que é texto (AD-188).
  return { ...semVariantesDeCaixa(body, ['Empresa']), Empresa: empresa };
}

const CAMINHO_CRIAR_CARD_TEF = caminhoComparavel('/ApiCentriumOAuth/CriarCardPagamento');

/** Os dois campos que decidem de quem é a cobrança e em qual maquininha. */
const CAMPOS_OPERADOR_TEF = ['EmpCod', 'UsuarioGAM'] as const;

/** Envelope do SDT de entrada, caso a medição mostre que o ERP o exige. */
const ENVELOPE_CRIAR_CARD_TEF = 'CriarCardReq';

/**
 * Insere `EmpCod` e `UsuarioGAM` no corpo de `CriarCardPagamento` (feature
 * 010, `contracts/erp-tef-api.md` §5, invariante T8).
 *
 * Os dois decidem **de quem** é a cobrança e **em qual maquininha** ela aparece:
 * `PSmartTEF` escolhe o `serial_pos` pelo `UsuarioGAM`. Mesmo princípio de
 * `corpoComUsuarioDaSessao` (AD-224) — o corpo vem do navegador e o ERP não o
 * confere contra o token —, com uma diferença que justifica uma função própria:
 * aqui os campos são **inseridos**, porque o navegador não os manda (o tipo
 * `DadosCriarCardTef` nem os tem), e qualquer ocorrência que chegue é
 * sobrescrita.
 *
 * - `EmpCod` numérico (`NUMERIC(6)` no SDT); empresa da sessão não numérica
 *   deixa o campo como veio, porque `NaN` seria pior.
 * - `UsuarioGAM` do cookie, ou `''` quando a sessão não o tem: o ERP recusa
 *   com "Serial do POS … nao localizado", e um valor forjado nunca passa.
 * - Aplicado na raiz **e** dentro de `CriarCardReq`, se existir: o envelope do
 *   corpo ainda não foi medido (`research.md` D6/D17), e o BFF não pode ficar
 *   para trás quando o cliente trocar a forma.
 */
export function corpoComOperadorTef(
  body: unknown,
  caminhoNoErp: string,
  sessao: Pick<SessaoOperador, 'codigoEmpresa' | 'usuarioGam'>,
): unknown {
  if (caminhoComparavel(caminhoNoErp) !== CAMINHO_CRIAR_CARD_TEF || !ehObjeto(body)) {
    return body;
  }

  const empresa = Number(sessao.codigoEmpresa);
  // Empresa da sessão não numérica: o `EmpCod` que veio fica — `NaN` seria
  // pior —, mas só ele; as variantes de caixa saem igual.
  const empCodPreservado = Number.isFinite(empresa) ? {} : comEmpCodOriginal(body);
  const operador: Record<string, unknown> = {
    ...(Number.isFinite(empresa) ? { EmpCod: empresa } : empCodPreservado),
    UsuarioGAM: sessao.usuarioGam ?? '',
  };

  const corpo: Record<string, unknown> = {
    ...semVariantesDeCaixa(body, CAMPOS_OPERADOR_TEF),
    ...operador,
  };
  const envelope = body[ENVELOPE_CRIAR_CARD_TEF];
  if (ehObjeto(envelope)) {
    corpo[ENVELOPE_CRIAR_CARD_TEF] = {
      ...semVariantesDeCaixa(envelope, CAMPOS_OPERADOR_TEF),
      ...operador,
    };
  }
  return corpo;
}

/** O `EmpCod` exatamente como veio, quando a sessão não tem empresa numérica. */
function comEmpCodOriginal(body: Record<string, unknown>): Record<string, unknown> {
  return 'EmpCod' in body ? { EmpCod: body['EmpCod'] } : {};
}

/** Campo do retrato que diz quem emitiu a nota (`CheckoutFaturarNFCe`, AD-221). */
const CAMPO_USUARIO = 'UsuarioCodigo';

/**
 * Reescreve `UsuarioCodigo` com o operador da sessão.
 *
 * Mesmo princípio de `corpoComEmpresaDaSessao`, e pelo mesmo motivo: o campo
 * viaja no corpo, o corpo vem do navegador, e o ERP não o confere contra o
 * token. Sem esta reescrita, um operador autenticado que editasse o payload no
 * DevTools emitiria nota assinada por outro — e a assinatura é justamente o que
 * AD-221 existe para garantir (item 53 de `.specs/project/PENDENCIES.md`, OWASP
 * A01/A09). O valor confiável é o do cookie cifrado, gravado em
 * `/session/start` a partir do `GetSessao` (AD-224).
 *
 * A reescrita acontece pela **presença do campo** — na raiz do corpo **ou**
 * dentro de qualquer objeto de primeiro nível —, não por uma lista de caminhos:
 * hoje só `FaturarNFCe` e `ValidarNFCe` o mandam, sempre envelopado em
 * `CheckoutFaturarNFCe`, mas um endpoint novo que passe a mandá-lo entra
 * protegido por construção, seja qual for o nome do envelope, em vez de entrar
 * esquecido numa lista que ninguém lembra de atualizar.
 *
 * **Descer um nível não é zelo:** a primeira versão desta função só olhava a
 * raiz e por isso nunca disparou em produção — os dois chamadores envelopam o
 * retrato (`faturarNFCeMutation.ts`, `validarNFCeMutation.ts`), e o corpo
 * forjado no DevTools chegava intacto ao ERP (achado da revisão do PR #73).
 *
 * O valor sai como número, que é o tipo do campo no SDT; um cookie com código
 * não numérico deixa o corpo como está, porque gravar `NaN` no documento fiscal
 * seria pior que o valor que veio.
 */
function comUsuario(objeto: Record<string, unknown>, codigo: number): Record<string, unknown> {
  return CAMPO_USUARIO in objeto ? { ...objeto, [CAMPO_USUARIO]: codigo } : objeto;
}

export function corpoComUsuarioDaSessao(body: unknown, usuarioCodigo: string): unknown {
  if (!ehObjeto(body)) {
    return body;
  }

  const codigo = Number(usuarioCodigo);
  if (!Number.isFinite(codigo)) {
    return body;
  }

  let corpo = comUsuario(body, codigo);

  for (const [chave, valor] of Object.entries(body)) {
    if (!ehObjeto(valor)) {
      continue;
    }
    const envelope = comUsuario(valor, codigo);
    if (envelope !== valor) {
      corpo = { ...corpo, [chave]: envelope };
    }
  }

  return corpo;
}

/**
 * `/api/erp/*` — proxy autenticado das chamadas de negócio (T031, US3).
 *
 * Injeta `Authorization`/`Empresa` do cookie decifrado e, em `401` do ERP,
 * renova o token e refaz a chamada original de forma transparente ao JS
 * (FR-005). Só quando a renovação falha o cookie é invalidado e o `401` chega
 * ao cliente — único gatilho de logout automático (FR-006).
 *
 * O conteúdo de negócio de cada endpoint é responsabilidade das features
 * correspondentes; aqui a resposta é repassada como está.
 */
export function registrarRotaErpProxy(app: FastifyInstance, deps: ErpProxyDeps): void {
  app.all(`${PREFIXO}/*`, async (request, reply) => {
    const sessao = deps.cifrador.decifrar(request.cookies[SESSION_COOKIE_NAME]);

    if (sessao === null) {
      return reply.code(401).send({ erro: 'Sessão ausente ou inválida' });
    }

    const [caminhoSemQuery = '', queryString = ''] = request.url.split('?');
    const caminhoNoErp = caminhoSemQuery.slice(PREFIXO.length);

    // O default `application/json` de `montarHeaders` serve ao bootstrap (GET
    // sem corpo); aqui o corpo é o da requisição original, então o
    // `Content-Type` real precisa ser repassado como está.
    const contentTypeOriginal = request.headers['content-type'];

    // Empresa e operador saem do cookie cifrado, nunca do corpo que o navegador
    // mandou (AD-024, AD-224 e, para o TEF, AD-259).
    const corpo = corpoComOperadorTef(
      corpoComUsuarioDaSessao(
        corpoComEmpresaNaRaiz(
          corpoComEmpresaDaSessao(request.body, sessao.codigoEmpresa),
          caminhoNoErp,
          sessao.codigoEmpresa,
        ),
        sessao.usuarioCodigo,
      ),
      caminhoNoErp,
      sessao,
    );

    // `null` = a sessão acabou e o 401 terminal já foi respondido (FR-006).
    const resultado = await executarOuEncerrarSessao(reply, () =>
      chamarErpComRenovacao(
        sessao,
        {
          caminho: caminhoNoErp,
          method: request.method,
          // Query crua, com `Empresa` da sessão à frente: preserva chaves
          // repetidas e a codificação original dos demais pares (AD-205).
          queryString: queryComEmpresaDaSessao(queryString, sessao.codigoEmpresa),
          ...(contentTypeOriginal === undefined
            ? {}
            : { headersExtras: { 'Content-Type': contentTypeOriginal } }),
          body: corpoDaRequisicao(corpo),
        },
        { env: deps.env, ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}) },
      ),
    );

    if (resultado === null) {
      return reply;
    }

    if (resultado.sessaoRenovada !== null) {
      reply.setCookie(
        SESSION_COOKIE_NAME,
        deps.cifrador.cifrar(resultado.sessaoRenovada),
        SESSION_COOKIE_OPTIONS,
      );
    }

    const contentType = resultado.resposta.headers.get('content-type');
    if (contentType !== null) {
      reply.header('content-type', contentType);
    }

    return reply
      .code(resultado.resposta.status)
      .send(Buffer.from(await resultado.resposta.arrayBuffer()));
  });
}
