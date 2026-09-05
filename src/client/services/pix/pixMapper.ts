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
import { decodificarSeBase64, fonteDeImagemBase64 } from '../../domain/pix/base64';
import type { CobrancaPix } from '../../domain/pix/cobrancaPix';
import type { Centavos } from '../../domain/precificacao/dinheiro';
import type { GerarPixOutput, StatusPixOutput } from '../../../shared/schemas/pix.schema';

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
    // Os dois campos chegam **codificados** e nenhum dos dois pode confiar no
    // nome: a imagem precisa do tipo MIME real e o texto precisa da checagem de
    // "isto é mesmo base64?" antes de qualquer `atob` (pedido do usuário,
    // 2026-09-04, itens 5 e 6). As duas regras vivem em `domain/pix/base64.ts`.
    qrCodeFonte: fonteDeImagemBase64(saida.Trnbase64image),
    copiaECola: decodificarSeBase64(saida.Trnbase64text),
    valor,
  };
}

export function paraResultadoStatusPix(saida: StatusPixOutput): ResultadoStatusPix {
  return interpretarStatusPix(saida.StatusTransacao);
}
