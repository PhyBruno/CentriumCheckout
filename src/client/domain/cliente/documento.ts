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
 * Motivo único da recusa de pessoa jurídica, compartilhado por todas as
 * superfícies que identificam cliente.
 *
 * **O Ajuste SINIEF 11/2025 proíbe a emissão de NFCe para CNPJ** (decisão do
 * usuário, 2026-09-03): venda para pessoa jurídica exige NFe, emitida pelo ERP,
 * fora do Checkout. Não é mais uma limitação do cadastro simplificado — é a
 * venda inteira que não pode acontecer aqui, e por isso o CNPJ é recusado em
 * qualquer ponto, não só na criação de cliente.
 *
 * Fica no domínio, e não em cada componente, para as três superfícies (campo
 * CPF/CNPJ, modal de busca e a resolução por `GetCliente`) dizerem o **mesmo**
 * motivo — cada uma acrescenta só a instrução que faz sentido nela.
 */
export const MOTIVO_VENDA_PESSOA_JURIDICA =
  'Venda para CNPJ exige NFe emitida pelo ERP: o Ajuste SINIEF 11/2025 proíbe NFCe para pessoa jurídica.';

/**
 * `11` dígitos → `CPF`; `14` → `CNPJ`; qualquer outro comprimento →
 * `INVALIDO`.
 *
 * Continua classificando `CNPJ` mesmo agora que ele é recusado na venda: quem
 * precisa reconhecê-lo é justamente quem o recusa (`documentoEhPessoaJuridica`)
 * e a máscara de leitura (`formatarDocumento`), que ainda pode receber o
 * documento de um cadastro pessoa jurídica vindo do ERP.
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

/**
 * Documento **completo** de pessoa jurídica — exatamente 14 dígitos.
 *
 * Estrito de propósito, ao contrário da faixa aberta de
 * `classificarEntradaCliente`: quem chama aqui já tem um documento inteiro nas
 * mãos — o `cpf` que o ERP devolveu em `GetCliente` ou o termo que o operador
 * terminou de digitar no modal. Nesse contexto, "mais de 11 dígitos" pegaria
 * telefone com DDI (`5547999998888`, 13 dígitos), que é um termo de busca
 * legítimo do modal.
 */
export function documentoEhPessoaJuridica(texto: string): boolean {
  return classificarDocumento(texto) === 'CNPJ';
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
  /**
   * Mais de 11 dígitos: pessoa jurídica, recusada pelo Ajuste SINIEF 11/2025
   * (`MOTIVO_VENDA_PESSOA_JURIDICA`). Sem `documento`, porque não há nada a
   * consultar — o valor não chega ao ERP.
   */
  | { readonly tipo: 'PESSOA_JURIDICA' }
  | { readonly tipo: 'INVALIDO' };

/**
 * Faixas do campo "CPF/CNPJ" da venda: até 6 dígitos é código do cliente; de 7
 * a 11 é CPF; **acima de 11 é pessoa jurídica e não entra na venda** (pedido do
 * usuário, 2026-09-03, sobre o Ajuste SINIEF 11/2025).
 *
 * O corte em 11, e não em 14, junta num caso só o CNPJ inteiro e o CNPJ pela
 * metade (12, 13 dígitos): depois da norma, nenhuma entrada acima de 11 dígitos
 * pode resultar em venda aqui — completar o número só levaria o operador a uma
 * segunda recusa. A mensagem única também é a única acionável nos dois casos,
 * porque ela diz o que fazer (NFe pelo ERP) *e* o que digitar (CPF ou código).
 *
 * `INVALIDO` sobra para a entrada sem nenhum dígito — só pontuação ou letras.
 * Vazio cai aí também: quem chama trata como "nada a fazer", não como erro.
 */
export function classificarEntradaCliente(texto: string): EntradaCliente {
  const digitos = apenasDigitos(texto);

  if (digitos.length === 0) {
    return { tipo: 'INVALIDO' };
  }
  if (digitos.length <= MAX_DIGITOS_CODIGO) {
    return { tipo: 'CODIGO', codigo: Number(digitos) };
  }
  if (digitos.length <= DIGITOS_CPF) {
    return { tipo: 'CPF', documento: digitos };
  }
  return { tipo: 'PESSOA_JURIDICA' };
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
