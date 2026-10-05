/**
 * Proxy do ambiente beta: separa o que é OAuth do que é API de negócio.
 *
 * O `prototype` não tem a aplicação OAuth registrada no GAM, então o token é
 * pedido no `.apps` e todo o resto vai para o `.prototype`. O BFF chama
 * `ERP_PROXY_URL/<tenant>/<caminho>` (`src/server/config/env.ts`), e o
 * primeiro segmento diz para qual tenant encaminhar. Assim um proxy atende
 * todos os tenants do beta.
 *
 * **Provisório.** Sai quando o `prototype` emitir o próprio token: basta
 * `ERP_PROXY=0` no stack, e depois apagar este arquivo, o `COPY` do
 * `Dockerfile` e o `ERP_PROXY_URL` do BFF.
 *
 * Nada aqui escreve no ERP por conta própria: o proxy só encaminha. O log mostra
 * tenant, método, caminho (sem query) e status, e nunca o corpo, porque o corpo
 * leva credencial e dado de cliente.
 */

import { createServer } from 'node:http';

/** Variável vazia conta como ausente: o stack repassa `${VAR:-}` sem valor. */
function variavel(nome) {
  const valor = process.env[nome]?.trim();
  return valor ? valor : undefined;
}

const PORTA = Number(variavel('PORTA') ?? 4020);
const TIMEOUT_MS = Number(variavel('TIMEOUT_MS') ?? 120_000);

/**
 * Origens em forma de modelo: `{tenant}` é trocado pelo tenant da chamada. O
 * padrão vale para os tenants que têm o OAuth em `<tenant>.apps`.
 */
const MODELO_OAUTH = variavel('OAUTH_BASE') ?? 'https://{tenant}.apps.centrium.inf.br';
const MODELO_API = variavel('API_BASE') ?? 'https://{tenant}.prototype.centrium.inf.br';

/**
 * Exceções ao OAuth padrão, no formato `TENANT=url;TENANT=url`. Existe porque
 * há tenant cujo `.apps` não emite token: ele responde 307 para uma página, e o
 * token sai de outro host, sob um path base. O BFF monta `/oauth/access_token`
 * na raiz, então o path base vem junto na URL. Os valores reais ficam no
 * ambiente de deploy, não no repositório.
 */
const OAUTH_POR_TENANT = new Map(
  (variavel('OAUTH_BASE_POR_TENANT') ?? '')
    .split(/[;\n]/)
    .map((par) => par.trim())
    .filter(Boolean)
    .map((par) => {
      const [tenant, ...url] = par.split('=');
      return [tenant.trim().toLowerCase(), url.join('=').trim().replace(/\/+$/, '')];
    }),
);

/**
 * Lista opcional `t1,t2`. Vazia, o proxy aceita qualquer tenant de formato
 * válido. O formato vale sempre, porque o tenant vira subdomínio do destino.
 */
const TENANTS_PERMITIDOS = new Set(
  (variavel('TENANTS_PERMITIDOS') ?? '')
    .split(',')
    .map((tenant) => tenant.trim().toLowerCase())
    .filter(Boolean),
);
const FORMATO_TENANT = /^[A-Za-z0-9]{1,40}$/;

const CAMINHO_HEALTH = '/__erp-proxy/health';

/** Cabeçalhos que valem só para um salto e não podem ser repassados. */
const SALTO_A_SALTO = ['connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'host'];

function aplicarModelo(modelo, tenant) {
  return modelo.replaceAll('{tenant}', tenant).replace(/\/+$/, '');
}

/** `/oauth/...` (e o `/gam/` que ele usa) vai para o lado do token. */
function baseDe(tenant, caminho) {
  if (/^\/(oauth|gam)\b/i.test(caminho)) {
    return OAUTH_POR_TENANT.get(tenant.toLowerCase()) ?? aplicarModelo(MODELO_OAUTH, tenant);
  }
  return aplicarModelo(MODELO_API, tenant);
}

/** Separa `/<tenant>/<resto>`; devolve `null` se o tenant não for aceito. */
function separarTenant(url) {
  const [, tenant = '', ...resto] = url.split('/');
  if (!FORMATO_TENANT.test(tenant)) return null;
  if (TENANTS_PERMITIDOS.size > 0 && !TENANTS_PERMITIDOS.has(tenant.toLowerCase())) return null;
  return { tenant, caminho: `/${resto.join('/')}` };
}

function responderJson(resposta, status, corpo) {
  resposta.writeHead(status, { 'content-type': 'application/json' });
  resposta.end(JSON.stringify(corpo));
}

const servidor = createServer((requisicao, resposta) => {
  const url = requisicao.url ?? '/';

  if (url === CAMINHO_HEALTH) {
    responderJson(resposta, 200, { status: 'ok' });
    return;
  }

  const alvo = separarTenant(url);
  if (alvo === null) {
    console.warn(
      `RECUSADO ${requisicao.method} ${url.split('?')[0]}: tenant inválido ou fora da lista`,
    );
    responderJson(resposta, 400, { erro: 'tenant nao aceito pelo proxy' });
    return;
  }

  const destino = `${baseDe(alvo.tenant, alvo.caminho)}${alvo.caminho}`;
  const caminhoNoLog = destino.split('?')[0];

  const corpo = [];
  requisicao.on('data', (pedaco) => corpo.push(pedaco));
  requisicao.on('end', () => {
    const cabecalhos = { ...requisicao.headers };
    for (const nome of SALTO_A_SALTO) delete cabecalhos[nome];
    // Sem compressão: o corpo volta já decodificado e o `content-encoding` da
    // origem não precisa ser reconciliado com o que é reemitido.
    delete cabecalhos['accept-encoding'];
    delete cabecalhos['content-length'];

    const carga = Buffer.concat(corpo);

    fetch(destino, {
      method: requisicao.method,
      headers: cabecalhos,
      body: carga.length > 0 ? carga : undefined,
      // Um redirect aqui é sinal de origem errada (ex.: um `.apps` que responde
      // 307 para uma página). Ele é devolvido como veio e o `location` vai para
      // o log, em vez de o proxy segui-lo.
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
      .then(async (respostaErp) => {
        const bytes = Buffer.from(await respostaErp.arrayBuffer());
        const local = respostaErp.headers.get('location');
        console.log(
          `[${alvo.tenant}] ${requisicao.method} ${caminhoNoLog} → ${respostaErp.status} (${bytes.length}b)` +
            (local ? ` [location: ${local.split('?')[0]}]` : ''),
        );

        const saida = {};
        respostaErp.headers.forEach((valor, chave) => {
          if (
            chave !== 'content-encoding' &&
            chave !== 'content-length' &&
            !SALTO_A_SALTO.includes(chave)
          ) {
            saida[chave] = valor;
          }
        });

        resposta.writeHead(respostaErp.status, saida);
        resposta.end(bytes);
      })
      .catch((causa) => {
        console.error(
          `[${alvo.tenant}] FALHA ${requisicao.method} ${caminhoNoLog}: ${String(causa)}`,
        );
        responderJson(resposta, 502, { erro: 'proxy nao alcancou o ERP' });
      });
  });
});

servidor.listen(PORTA, '0.0.0.0', () => {
  console.log(`erp-proxy em :${PORTA}`);
  console.log(`  /<tenant>/oauth/* e /gam/* → ${MODELO_OAUTH}`);
  console.log(`  exceções de OAuth por tenant: ${OAUTH_POR_TENANT.size}`);
  console.log(`  /<tenant>/demais           → ${MODELO_API}`);
  console.log(
    `  tenants: ${TENANTS_PERMITIDOS.size > 0 ? [...TENANTS_PERMITIDOS].join(', ') : 'qualquer um de formato válido'}`,
  );
});

// O Swarm manda SIGTERM no rolling update: termina o que está em voo e sai.
process.on('SIGTERM', () => servidor.close(() => process.exit(0)));
