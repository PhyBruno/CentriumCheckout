import { useCallback } from 'react';
import { gooeyToast } from 'goey-toast';
import type {
  CadastroSimplificadoInput,
  OrigemSelecaoCliente,
} from '../../domain/cliente/clienteVenda';
import {
  documentoEhPessoaJuridica,
  MOTIVO_VENDA_PESSOA_JURIDICA,
} from '../../domain/cliente/documento';
import {
  ErroCadastroRecusado,
  ErroClienteNaoEncontrado,
  fetchClientePorCodigo,
  fetchClientePorDocumento,
  postCliente,
} from '../../services/cliente/clienteQueries';
import { ErroRespostaInvalida } from '../../services/errosErp';
import type { ClienteCheckout } from '../../../shared/schemas/cliente.schema';
import type { ResultadoAplicacaoCliente } from '../../stores/slices/clienteSlice';
import { useSessionStore } from '../../stores/sessionStore';
import { useVendaStore } from '../../stores/vendaStore';

/**
 * Orquestração da identificação de cliente, compartilhada pelas três
 * superfícies (campo da venda, modal de busca, formulário de cadastro).
 *
 * Fica num hook, e não em cada componente, pelo mesmo motivo de
 * `useCarrinho.ts`: os dois caminhos de identificação — documento direto
 * (`CLI-01`) e candidato escolhido na lista (`CLI-02`) — terminam na **mesma**
 * resolução por `GetCliente` (`research.md` D1). Duplicá-la criaria dois
 * formatos de snapshot que a feature 003 precisaria distinguir.
 */

/** `Empresa` do payload de `PostCliente` — do bootstrap, nunca hardcoded (AD-019). */
export function useCodigoEmpresa(): number | null {
  return useSessionStore((estado) => {
    const bruto = estado.registro?.codigoEmpresa;
    if (bruto === undefined) {
      return null;
    }
    const numero = Number(bruto);
    return Number.isFinite(numero) ? numero : null;
  });
}

/** Piso de caracteres da busca livre — vem do ERP (AD-024). */
export function useQtdMinCharParaConsulta(): number | null {
  return useSessionStore((estado) => estado.registro?.SessaoUsuario.QtdMinCharParaConsulta ?? null);
}

export type ResultadoIdentificacao =
  | { readonly situacao: 'identificado' }
  /** Documento válido, sem cadastro correspondente — abre o cadastro simplificado. */
  | { readonly situacao: 'nao-encontrado' }
  /** Falha de rede/fronteira, ou o slice recusou a mudança: nada mudou. */
  | { readonly situacao: 'recusado' };

function mensagemDeErro(erro: unknown): string {
  if (erro instanceof ErroCadastroRecusado) {
    // A recusa de negócio vem descrita pelo próprio ERP — é o texto que diz ao
    // operador o que corrigir, e o Checkout não o reinterpreta.
    return erro.message;
  }
  if (erro instanceof ErroRespostaInvalida) {
    return 'O ERP devolveu um cliente em formato inesperado. Nada foi alterado.';
  }
  return 'Não foi possível consultar o cliente. Tente novamente.';
}

/**
 * Traduz o desfecho do slice para a UI.
 *
 * `'bloqueado'` vira `'recusado'`: o slice já avisou o operador pelo toast de
 * bloqueio, e quem chamou precisa saber que **nada mudou** — sem isso o modal
 * de cadastro fecharia como se a associação tivesse acontecido (achado da
 * revisão, 2026-09-03). `'inalterado'` conta como sucesso: o cliente pedido é
 * exatamente o que já está na venda.
 */
function traduzir(resultado: ResultadoAplicacaoCliente): ResultadoIdentificacao {
  return resultado === 'bloqueado' ? { situacao: 'recusado' } : { situacao: 'identificado' };
}

export interface ApiIdentificacaoCliente {
  /**
   * Resolve o cliente pelo documento e associa à venda — o campo CPF/CNPJ da
   * tela (`BUSCA_DOCUMENTO`).
   */
  identificarPorDocumento(
    documento: string,
    origem: OrigemSelecaoCliente,
  ): Promise<ResultadoIdentificacao>;
  /**
   * Resolve o cliente pelo `CodCliente` e associa à venda (`FR-016`, AD-115).
   *
   * É o caminho da escolha no modal: o candidato **sempre** traz
   * `ClienteCodigo`, enquanto o `CPF` dele pode vir vazio (cliente cadastrado
   * sem documento, comum no varejo) — resolver pelo documento nesse caso
   * chamaria `GetCliente` sem parâmetro e abriria o cadastro simplificado
   * sozinho (achado da revisão, 2026-09-03).
   */
  identificarPorCodigo(
    codigo: number,
    origem: OrigemSelecaoCliente,
  ): Promise<ResultadoIdentificacao>;
  /** Cria o cliente no ERP e o associa à venda (`CLI-03`). */
  cadastrar(dados: CadastroSimplificadoInput): Promise<ResultadoIdentificacao>;
}

export function useIdentificacaoCliente(): ApiIdentificacaoCliente {
  const selecionarCliente = useVendaStore((estado) => estado.selecionarCliente);
  const cadastrarESelecionarCliente = useVendaStore((estado) => estado.cadastrarESelecionarCliente);
  const codigoEmpresa = useCodigoEmpresa();

  const identificar = useCallback(
    async (
      resolver: () => Promise<ClienteCheckout>,
      origem: OrigemSelecaoCliente,
    ): Promise<ResultadoIdentificacao> => {
      try {
        const cliente = await resolver();

        // Guarda final da norma (Ajuste SINIEF 11/2025): o cadastro que o ERP
        // devolveu é de pessoa jurídica, então nenhum caminho pode associá-lo à
        // venda. O caso que ela de fato cobre é o **código do cliente** (até 6
        // dígitos): um código de PJ não se parece com um CNPJ, então não passa
        // pela contagem de dígitos das superfícies. Vale também para o
        // `CodCliente` que a importação de DAV usará (feature 006).
        //
        // Pelo modal, este ponto nunca dispara: `PCheckout_ClientesLista` filtra
        // `where CliTip = 'F'` no próprio ERP (verificado no código-fonte da KB,
        // 2026-09-03), então a lista não traz pessoa jurídica. A guarda continua
        // aqui, e não em cada componente, por ser o único ponto por onde os três
        // caminhos passam — se o filtro do ERP mudar, o Checkout não regride.
        if (documentoEhPessoaJuridica(cliente.cpf)) {
          gooeyToast.warning(`${MOTIVO_VENDA_PESSOA_JURIDICA} Escolha um cliente pessoa física.`);
          return { situacao: 'recusado' };
        }

        return traduzir(await selecionarCliente(cliente, origem));
      } catch (erro) {
        if (erro instanceof ErroClienteNaoEncontrado) {
          return { situacao: 'nao-encontrado' };
        }
        gooeyToast.error(mensagemDeErro(erro));
        return { situacao: 'recusado' };
      }
    },
    [selecionarCliente],
  );

  return {
    identificarPorDocumento: useCallback(
      (documento, origem) => identificar(() => fetchClientePorDocumento(documento), origem),
      [identificar],
    ),

    identificarPorCodigo: useCallback(
      (codigo, origem) => identificar(() => fetchClientePorCodigo(codigo), origem),
      [identificar],
    ),

    cadastrar: useCallback(
      async (dados) => {
        if (codigoEmpresa === null) {
          gooeyToast.error('Configuração do ponto de venda ainda não carregada.');
          return { situacao: 'recusado' };
        }

        try {
          return traduzir(
            await cadastrarESelecionarCliente(dados, (entrada) =>
              postCliente(entrada, codigoEmpresa),
            ),
          );
        } catch (erro) {
          // O slice não muda `clienteAtual` nem registra evento quando
          // `postCliente` falha (`SC-003`): a venda segue com o cliente que
          // tinha, e o operador vê o motivo.
          gooeyToast.error(mensagemDeErro(erro));
          return { situacao: 'recusado' };
        }
      },
      [cadastrarESelecionarCliente, codigoEmpresa],
    ),
  };
}
