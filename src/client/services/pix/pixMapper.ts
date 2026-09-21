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
 * O `trnGuid` é o que o **ERP** devolveu; só o `valor` vem do call site.
 *
 * **Corrigido em 2026-09-21 (AD-251).** A redação anterior dizia que "o
 * `TrnGUID` devolvido pelo ERP é o mesmo que o cliente enviou (`research.md`
 * D3)" e, por isso, guardava o GUID gerado localmente. Medido ao vivo contra o
 * prototype: o ERP **ignora** o que o cliente manda e gera o seu, devolvido
 * aqui — regra confirmada pelo usuário ("é sempre o ERP que gera o GUID, nunca
 * o checkout"). Guardar o local deixava a cobrança órfã: o polling consultava
 * `StatusPIX` com um GUID que não existe, o ERP respondia `'E'` ("Transação não
 * localizada"), `interpretarStatusPix` lia falha terminal e a janela fechava
 * sozinha sobre uma cobrança que o cliente ainda podia pagar.
 *
 * O `valor` continua vindo do call site — esse, de fato, não trafega de volta.
 */
export function paraCobrancaPix(saida: GerarPixOutput, valor: Centavos): CobrancaPix {
  return {
    trnGuid: saida.TrnGUID,
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
