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
