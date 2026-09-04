/**
 * `GerarPIXOutput`/`StatusPIXOutput` já validados (T005) → tipos do domínio de
 * PIX (T006).
 *
 * Uma responsabilidade só: adaptar a resposta do ERP à forma do domínio — mesmo
 * padrão de `pagamentoMapper.ts`/`clienteMapper.ts`. Nenhuma regra de negócio
 * nova mora aqui; a interpretação do status é delegada a `interpretarStatusPix`,
 * que é puro e testado isoladamente.
 */

import {
  interpretarStatusPix,
  type ResultadoStatusPix,
} from '../../domain/pix/interpretarStatusPix';
import type { CobrancaPix } from '../../domain/pix/cobrancaPix';
import type { Centavos } from '../../domain/precificacao/dinheiro';
import type { GerarPixOutput, StatusPixOutput } from '../../../shared/schemas/pix.schema';

/**
 * Decodifica o "copia e cola" (`Trnbase64text`).
 *
 * Falha de decodificação devolve `''` em vez de lançar: o QR Code — o caminho
 * principal de pagamento — já está na tela nesse ponto, e derrubar o modal por
 * causa do texto auxiliar tiraria do operador o único meio que ele tem de
 * receber. A ausência aparece como o campo vazio, que é honesto.
 */
function decodificarCopiaECola(base64: string): string {
  try {
    return atob(base64);
  } catch {
    console.warn('[pix] `Trnbase64text` não é base64 válido: "copia e cola" ficará indisponível.');
    return '';
  }
}

/**
 * `valor` e `trnGuid` vêm do **call site**, não da resposta.
 *
 * O `TrnGUID` devolvido pelo ERP é o mesmo que o cliente enviou (`research.md`
 * D3), mas quem manda continua sendo o valor gerado localmente: é ele que já
 * está sendo usado como chave de correlação do polling, e adotar o eco do
 * servidor abriria a possibilidade de as duas chamadas divergirem. O `valor`
 * simplesmente não trafega de volta.
 */
export function paraCobrancaPix(
  saida: GerarPixOutput,
  trnGuid: string,
  valor: Centavos,
): CobrancaPix {
  return {
    trnGuid,
    qrCodeImagemBase64: saida.Trnbase64image,
    copiaECola: decodificarCopiaECola(saida.Trnbase64text),
    valor,
  };
}

export function paraResultadoStatusPix(saida: StatusPixOutput): ResultadoStatusPix {
  return interpretarStatusPix(saida.StatusTransacao);
}
