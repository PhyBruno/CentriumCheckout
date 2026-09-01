import Dexie, { type Table } from 'dexie';
import type { BootstrapPayload } from '../../shared/schemas/bootstrap.schema';

/**
 * Registro persistido da configuração do ponto de venda
 * (`data-model.md` § Configuração do Ponto de Venda).
 *
 * É a única coisa que o Checkout persiste no navegador: configuração de
 * tenant/PDV, nunca estado de venda (Constitution VI). Nenhum campo sensível
 * (`access_token`, `client_secret`, `password`) chega até aqui — eles não saem
 * do cookie no servidor.
 */
export interface RegistroBootstrap extends BootstrapPayload {
  /** Calculado localmente pelo Checkout, não vem do ERP (AD-045). */
  readonly _versionHash: string;
}

/**
 * Base local do bootstrap. A chave primária é o `tenant`, o que isola empresas
 * diferentes que compartilhem o mesmo navegador/máquina (FR-009).
 */
export class BootstrapDb extends Dexie {
  declare readonly bootstrap: Table<RegistroBootstrap, string>;

  constructor(nome = 'centrium-checkout') {
    super(nome);
    this.version(1).stores({ bootstrap: '&tenant, _versionHash' });
  }
}

/**
 * Porta de persistência do bootstrap (Dependency Inversion — Constitution II).
 * O cliente de bootstrap depende desta interface, não do Dexie.
 */
export interface RepositorioBootstrap {
  obterPorTenant(tenant: string): Promise<RegistroBootstrap | undefined>;
  obterPorVersionHash(versionHash: string): Promise<RegistroBootstrap | undefined>;
  listarVersionHashes(): Promise<string[]>;
  salvar(registro: RegistroBootstrap): Promise<void>;
}

export function criarRepositorioBootstrap(db: BootstrapDb): RepositorioBootstrap {
  return {
    async obterPorTenant(tenant) {
      return db.bootstrap.get(tenant);
    },

    async obterPorVersionHash(versionHash) {
      return db.bootstrap.where('_versionHash').equals(versionHash).first();
    },

    async listarVersionHashes() {
      const registros = await db.bootstrap.toArray();
      return registros.map((registro) => registro._versionHash);
    },

    async salvar(registro) {
      // `put` sobrescreve o registro do mesmo tenant e nunca toca nos demais.
      await db.bootstrap.put(registro);
    },
  };
}

/** Instância padrão usada pela aplicação. Testes criam a sua com outro nome. */
export const bootstrapDb = new BootstrapDb();
