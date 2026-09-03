import { useCallback } from 'react';
import { gooeyToast } from 'goey-toast';
import type {
  CadastroSimplificadoInput,
  OrigemSelecaoCliente,
} from '../../domain/cliente/clienteVenda';
import {
  ErroClienteNaoEncontrado,
  fetchClientePorDocumento,
  postCliente,
} from '../../services/cliente/clienteQueries';
import { ErroRespostaInvalida } from '../../services/errosErp';
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
  /** Falha de rede/fronteira, ou troca bloqueada: nada mudou. */
  | { readonly situacao: 'recusado' };

function mensagemDeErro(erro: unknown): string {
  if (erro instanceof ErroRespostaInvalida) {
    return 'O ERP devolveu um cliente em formato inesperado. Nada foi alterado.';
  }
  return 'Não foi possível consultar o cliente. Tente novamente.';
}

export interface ApiIdentificacaoCliente {
  /**
   * Resolve o cliente pelo documento e associa à venda.
   *
   * Usado pelos dois caminhos: o campo CPF/CNPJ da tela (`BUSCA_DOCUMENTO`) e a
   * escolha de um candidato no modal, pelo `CPF` dele (`BUSCA_LIVRE`, D1).
   */
  identificarPorDocumento(
    documento: string,
    origem: OrigemSelecaoCliente,
  ): Promise<ResultadoIdentificacao>;
  /** Cria o cliente no ERP e o associa à venda (`CLI-03`). */
  cadastrar(dados: CadastroSimplificadoInput): Promise<ResultadoIdentificacao>;
}

export function useIdentificacaoCliente(): ApiIdentificacaoCliente {
  const selecionarCliente = useVendaStore((estado) => estado.selecionarCliente);
  const cadastrarESelecionarCliente = useVendaStore((estado) => estado.cadastrarESelecionarCliente);
  const codigoEmpresa = useCodigoEmpresa();

  return {
    identificarPorDocumento: useCallback(
      async (documento, origem) => {
        try {
          const cliente = await fetchClientePorDocumento(documento);
          await selecionarCliente(cliente, origem);
          return { situacao: 'identificado' };
        } catch (erro) {
          if (erro instanceof ErroClienteNaoEncontrado) {
            return { situacao: 'nao-encontrado' };
          }
          gooeyToast.error(mensagemDeErro(erro));
          return { situacao: 'recusado' };
        }
      },
      [selecionarCliente],
    ),

    cadastrar: useCallback(
      async (dados) => {
        if (codigoEmpresa === null) {
          gooeyToast.error('Configuração do ponto de venda ainda não carregada.');
          return { situacao: 'recusado' };
        }

        try {
          await cadastrarESelecionarCliente(dados, (entrada) =>
            postCliente(entrada, codigoEmpresa),
          );
          return { situacao: 'identificado' };
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
