import type { FastifyInstance } from 'fastify';
import { montarBaseUrlErp, type Env } from '../config/env';
import { SESSION_COOKIE_NAME, type CifradorDeSessao } from '../session/cookie';
import type { DestinoGerencial } from '../../shared/gerencial';

/**
 * Telas legadas do ERP alcançadas pelo Menu gerencial.
 *
 * Caminhos confirmados pelo usuário em 2026-09-10. **Substituem** os de AD-020
 * e AD-026, que davam `WPMovimentoNaoFiscal_Lancamento.aspx` para as duas
 * opções — as telas são distintas, cada uma com o seu `.aspx`.
 */
const TELAS: Readonly<Record<DestinoGerencial, string>> = {
  'movimento-nao-fiscal': '/wwtecfmovnaofisc.aspx',
  'resumo-caixa': '/WWPResumoCaixa.aspx',
};

/**
 * Um `Map`, e não um acesso direto ao objeto: o rótulo chega da URL, então
 * `toString`, `constructor` e `__proto__` chegam como qualquer outro texto — e
 * um `Record` os resolveria pela cadeia de protótipos, devolvendo algo que não
 * é caminho de tela nenhuma.
 */
const CAMINHO_POR_DESTINO = new Map<string, string>(Object.entries(TELAS));

/** Caminho da tela legada, ou `null` para qualquer rótulo fora do mapa. */
export function caminhoDaTelaGerencial(destino: string): string | null {
  return CAMINHO_POR_DESTINO.get(destino) ?? null;
}

export interface GerencialDeps {
  readonly env: Env;
  readonly cifrador: CifradorDeSessao;
}

const REDIRECT_TEMPORARIO = 302;

/**
 * `GET /gerencial/:destino` — redirect para uma tela legada do ERP.
 *
 * Mora no BFF, e não no React, por dois motivos que se somam: `baseDomain` é
 * variável de ambiente do servidor (AD-019) e nunca chega ao navegador — o
 * payload de `/api/bootstrap` entrega só `tenant` e `codigoEmpresa` —, e o
 * `tenant` que compõe o host vem do cookie cifrado, não de nada que o cliente
 * possa escolher. Somado ao mapa fechado de caminhos, não sobra superfície de
 * redirect aberto: o navegador só informa um rótulo.
 *
 * Fica fora de `/api/` pelo mesmo motivo de `/session/start` — é navegação do
 * browser (aberta em nova aba pelo Menu gerencial), não chamada de dados.
 *
 * A sessão é verificada **antes** do destino: sem cookie, a resposta é a mesma
 * `401` para rótulo válido ou inválido, e um chamador anônimo não descobre
 * quais telas existem.
 */
export function registrarRotaGerencial(app: FastifyInstance, deps: GerencialDeps): void {
  app.get<{ Params: { destino: string } }>('/gerencial/:destino', async (request, reply) => {
    const sessao = deps.cifrador.decifrar(request.cookies[SESSION_COOKIE_NAME]);

    if (sessao === null) {
      return reply.code(401).send({ erro: 'Sessão ausente ou inválida' });
    }

    const caminho = caminhoDaTelaGerencial(request.params.destino);

    if (caminho === null) {
      return reply.code(404).send({ erro: 'Tela gerencial desconhecida' });
    }

    return reply.redirect(
      `${montarBaseUrlErp(deps.env, sessao.tenant)}${caminho}`,
      REDIRECT_TEMPORARIO,
    );
  });
}
