/**
 * Destino do envio da cobrança PIX por WhatsApp — domínio puro.
 *
 * Duas regras, e nenhuma delas conhece React, rede ou store: quem preenche o
 * formulário a partir do cliente da venda (`preencherDestinoWhatsapp`) e quem
 * decide se um número digitado é enviável (`normalizarTelefoneWhatsapp`).
 *
 * Mora aqui, e não dentro de `ModalPix.tsx`, pelo mesmo motivo de
 * `montarDadosPagador`: são regras testáveis sem montar componente nenhum, e o
 * modal já é o arquivo mais longo da feature.
 */

import type { ClienteVenda } from '../cliente/clienteVenda';

/** DDI do Brasil, prefixado quando o operador digita só DDD + número. */
const DDI_BRASIL = '55';

/** DDD (2) + 8 ou 9 dígitos. */
const COMPRIMENTO_NACIONAL = [10, 11];

/** DDI (2 ou 3) + DDD + número, isto é, um número que já veio internacional. */
const COMPRIMENTO_COM_DDI = [12, 13];

/**
 * Só os dígitos do que o operador digitou — máscara, parênteses, traço, espaço
 * e um eventual `+` saem fora.
 */
function somenteDigitos(texto: string): string {
  return texto.replace(/\D/g, '');
}

/**
 * O número pronto para o campo `Telefone` do ERP, ou `null` quando o que foi
 * digitado não é um destino possível.
 *
 * Formato decidido pelo usuário (2026-09-21): **dígitos com DDI 55**.
 *
 * **O comprimento decide antes do prefixo, e isso não é detalhe.** A tentação é
 * ler "começa com 55" como "já tem DDI", mas 55 também é o DDD de Santa Maria
 * (RS): `(55) 99999-9999` vira `55999999999`, onze dígitos que são um número
 * nacional completo. Tratá-lo como já internacional produziria `55 9999 9999`
 * no ERP — um destino que não existe, e que falharia longe daqui, no envio.
 * Por isso 10/11 dígitos são sempre nacionais e **sempre** recebem o `55` na
 * frente; 12/13 dígitos já trazem DDI e passam intactos, inclusive um DDI
 * estrangeiro, que não é nosso papel reescrever.
 *
 * Qualquer outro comprimento é `null`: o operador ainda está digitando, ou
 * errou. Quem chama transforma isso em botão bloqueado com motivo, nunca em
 * chamada ao ERP com um número truncado.
 */
export function normalizarTelefoneWhatsapp(texto: string): string | null {
  const digitos = somenteDigitos(texto);

  if (COMPRIMENTO_NACIONAL.includes(digitos.length)) {
    return `${DDI_BRASIL}${digitos}`;
  }

  if (COMPRIMENTO_COM_DDI.includes(digitos.length)) {
    return digitos;
  }

  return null;
}

/** Estado inicial dos dois campos do formulário de envio. */
export interface PreenchimentoDestinoWhatsapp {
  readonly nome: string;
  readonly telefone: string;
  /**
   * `true` quando o nome precisa ser digitado para o envio acontecer.
   *
   * O número **nunca** entra nesta bandeira porque ele não é opcional em
   * cenário nenhum: sem destino não há para onde enviar. O que a condição do
   * pedido distingue é só o nome — obrigatório no cliente default, opcional no
   * identificado, que já chega preenchido.
   */
  readonly nomeObrigatorio: boolean;
}

/**
 * Preenche os campos a partir do cliente da venda (pedido do usuário,
 * 2026-09-21).
 *
 * **Cliente default entra vazio, de propósito.** O pedido é "obrigatório
 * informar o nome do cliente e o número de destino" — e o cliente default tem
 * nome de cadastro genérico ("CONSUMIDOR", o que a empresa tiver configurado).
 * Pré-preencher com ele daria ao operador um campo já satisfeito, e o template
 * chegaria ao cliente chamando-o pelo rótulo interno da loja. Campo vazio é o
 * que de fato pede a informação.
 *
 * `clienteAtual === null` (empresa sem cliente default configurado, invariante
 * I1 da feature 005) segue o mesmo caminho do default: não há dado nenhum a
 * aproveitar, e tudo é digitado.
 *
 * Para o cliente identificado, `celular` pode ser `null` — cadastro sem
 * contato, ou cliente vindo de documento cujo `GetCliente` falhou (AD-237). O
 * campo então nasce vazio e o envio fica bloqueado até o operador digitar um
 * número, sem que isso torne o **nome** obrigatório: o nome veio do cadastro e
 * está correto.
 */
export function preencherDestinoWhatsapp(
  clienteAtual: ClienteVenda | null,
): PreenchimentoDestinoWhatsapp {
  if (clienteAtual === null || clienteAtual.origem === 'DEFAULT') {
    return { nome: '', telefone: '', nomeObrigatorio: true };
  }

  return {
    nome: clienteAtual.nome,
    telefone: clienteAtual.celular ?? '',
    nomeObrigatorio: false,
  };
}
