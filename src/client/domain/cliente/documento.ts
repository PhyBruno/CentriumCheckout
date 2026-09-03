/**
 * Classificação e validação de formato de documento (T003, `data-model.md` §5).
 *
 * Domínio puro — sem React, Zustand, Zod ou rede — mesma categoria
 * arquitetural de `domain/precificacao/codigoProduto.ts` (feature 003).
 *
 * **Formato, não checksum** (`research.md` D6): a spec pede "validar máscaras
 * de CPF e CEP", não "validar CPF real". O dígito verificador é regra de
 * negócio do ERP, que é a fonte única de verdade (Constitution III) — duplicá-la
 * aqui criaria uma segunda validação que pode divergir da dele.
 */

export type TipoDocumento = 'CPF' | 'CNPJ' | 'INVALIDO';

const DIGITOS_CPF = 11;
const DIGITOS_CNPJ = 14;
const DIGITOS_CEP = 8;

/**
 * Só dígitos, descartando qualquer pontuação de máscara (`.`, `-`, `/`,
 * espaço). É o que permite classificar `123.456.789-00` do mesmo jeito que
 * `12345678900`.
 */
export function apenasDigitos(texto: string): string {
  return texto.replace(/\D/g, '');
}

/**
 * `11` dígitos → `CPF`; `14` → `CNPJ`; qualquer outro comprimento →
 * `INVALIDO`.
 *
 * Usado em `ModalBuscaCliente.tsx` para decidir se o CTA de cadastro
 * simplificado é oferecido numa busca **sem resultado** — nunca para bloquear a
 * busca em si (`research.md` D4): um cliente pessoa jurídica pode existir
 * legitimamente no ERP, cadastrado fora do Checkout.
 */
export function classificarDocumento(texto: string): TipoDocumento {
  switch (apenasDigitos(texto).length) {
    case DIGITOS_CPF:
      return 'CPF';
    case DIGITOS_CNPJ:
      return 'CNPJ';
    default:
      return 'INVALIDO';
  }
}

/** `11` dígitos, sem dígito verificador (`CLI-04`, `research.md` D6). */
export function validarFormatoCPF(texto: string): boolean {
  return apenasDigitos(texto).length === DIGITOS_CPF;
}

/** `8` dígitos, sem validação de endereço postal oficial (AD-023). */
export function validarFormatoCEP(texto: string): boolean {
  return apenasDigitos(texto).length === DIGITOS_CEP;
}

const MAX_DIGITOS_CODIGO = 6;
const MIN_DIGITOS_CPF = 7;

/**
 * O que o operador digitou no campo "CPF/CNPJ" da venda.
 *
 * O mesmo campo aceita **código do cliente** e documento (pedido do usuário,
 * 2026-09-03) — são dois parâmetros diferentes de `GetCliente` (`CodCliente` e
 * `CPFCNPJ`), e a contagem de dígitos é o que decide qual enviar.
 *
 * `valor` já vem sem pontuação: o operador pode digitar `122.980.239-80`, mas
 * o ERP recebe `12298023980`.
 */
export type EntradaCliente =
  | { readonly tipo: 'CODIGO'; readonly codigo: number }
  | { readonly tipo: 'CPF'; readonly documento: string }
  | { readonly tipo: 'CNPJ'; readonly documento: string }
  | { readonly tipo: 'INVALIDO' };

/**
 * Faixas definidas pelo usuário (2026-09-03): até 6 dígitos é código do
 * cliente; de 7 a 11 é CPF; 14 é CNPJ.
 *
 * `12` e `13` dígitos ficam **inválidos** de propósito — não são nem um nem
 * outro, e adivinhar aqui mandaria o ERP procurar um documento que o operador
 * não terminou de digitar. Vazio também é inválido: quem chama trata como
 * "nada a fazer", não como erro.
 */
export function classificarEntradaCliente(texto: string): EntradaCliente {
  const digitos = apenasDigitos(texto);

  if (digitos.length === 0) {
    return { tipo: 'INVALIDO' };
  }
  if (digitos.length <= MAX_DIGITOS_CODIGO) {
    return { tipo: 'CODIGO', codigo: Number(digitos) };
  }
  if (digitos.length >= MIN_DIGITOS_CPF && digitos.length <= DIGITOS_CPF) {
    return { tipo: 'CPF', documento: digitos };
  }
  if (digitos.length === DIGITOS_CNPJ) {
    return { tipo: 'CNPJ', documento: digitos };
  }
  return { tipo: 'INVALIDO' };
}

/** `00000-000`. Texto que não tem 8 dígitos volta inalterado. */
export function formatarCEP(texto: string): string {
  const digitos = apenasDigitos(texto);
  return digitos.length === DIGITOS_CEP ? digitos.replace(/^(\d{5})(\d{3})$/, '$1-$2') : texto;
}

/**
 * Aplica a máscara de leitura ao documento — `000.000.000-00` para CPF e
 * `00.000.000/0000-00` para CNPJ.
 *
 * **Só apresentação**: o valor enviado ao ERP continua sendo o que o operador
 * digitou. Texto que não é CPF nem CNPJ volta inalterado, para o campo nunca
 * "corrigir" em silêncio algo que não sabe interpretar.
 */
export function formatarDocumento(texto: string): string {
  const digitos = apenasDigitos(texto);

  switch (classificarDocumento(digitos)) {
    case 'CPF':
      return digitos.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
    case 'CNPJ':
      return digitos.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
    case 'INVALIDO':
      return texto;
  }
}
