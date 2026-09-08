/**
 * Apresentação do veredito da validação prévia (T006,
 * `contracts/validacao-domain-api.md` §4).
 *
 * **Notificação, não banner nem área dedicada** — decisão do usuário
 * (2026-08-31): o operador de caixa lê o aviso e segue; um painel persistente
 * roubaria espaço da tela de venda para uma informação que envelhece a cada
 * inserção.
 *
 * Uma notificação **por mensagem**, e não uma com os textos concatenados
 * (`FR-005`/`FR-007`): o ERP manda motivos independentes, e juntá-los numa frase
 * só produziria um parágrafo que o operador não termina de ler. O texto de cada
 * uma é o `Description` íntegro, sem reescrita nem resumo (I11).
 */

import type { MensagemValidacao, Veredito } from '../../domain/validacaoVenda/interpretarVeredito';

/**
 * Superfície mínima de toast que esta função usa (Interface Segregation).
 *
 * Estrutural em vez de importar `gooeyToast` direto: é o que permite o teste
 * contar notificações sem montar a lib, e o que impede este módulo de amarrar a
 * feature a uma biblioteca de UI específica. `gooeyToast` satisfaz o tipo como
 * está.
 */
export interface NotificadorVeredito {
  warning(mensagem: string): void;
  error(mensagem: string): void;
}

/**
 * Indisponibilidade do ERP, uma frase por causa (`FR-009`).
 *
 * Cada uma é **distinta da recusa de negócio** e diz o que fazer, porque as duas
 * situações pedem gestos opostos: na recusa o operador precisa corrigir a venda,
 * aqui precisa apenas tentar de novo. Uma frase genérica ("não foi possível
 * validar") faria o caixa procurar no cliente um problema que não existe.
 *
 * Todas afirmam que o pagamento **não** foi aplicado: sem isso o operador ficaria
 * sem saber se deve repetir a inserção ou se acabou de duplicá-la.
 */
export const TEXTO_INDISPONIVEL = {
  REDE: 'Sem comunicação com o ERP para validar a venda. O pagamento não foi aplicado — verifique a rede e tente de novo.',
  TIMEOUT:
    'O ERP demorou demais para validar a venda. O pagamento não foi aplicado — tente de novo.',
  SERVIDOR:
    'O ERP não conseguiu validar a venda agora. O pagamento não foi aplicado — tente de novo em instantes.',
  RESPOSTA_INVALIDA:
    'O ERP respondeu em formato inesperado ao validar a venda. O pagamento não foi aplicado — tente de novo.',
} as const;

function textos(mensagens: readonly MensagemValidacao[]): readonly string[] {
  return mensagens.map((mensagem) => mensagem.texto);
}

/**
 * @param veredito Desfecho da consulta ao gate.
 * @param toast Destino das notificações.
 *
 * `ACEITA` sem avisos é **silêncio deliberado**: o caminho feliz da inserção já
 * se comunica sozinho — a forma aparece na lista de pagamentos. Um toast de
 * "validado" a cada inserção treinaria o operador a ignorar todos os outros.
 */
export function notificarVeredito(veredito: Veredito, toast: NotificadorVeredito): void {
  switch (veredito.resultado) {
    case 'ACEITA':
      for (const texto of textos(veredito.avisos)) {
        toast.warning(texto);
      }
      return;

    case 'RECUSADA':
      // Sempre há ao menos uma: `interpretarRespostaValidacao` já substitui a
      // lista vazia pela mensagem genérica de `FR-008`.
      for (const texto of textos(veredito.motivos)) {
        toast.error(texto);
      }
      return;

    case 'INDISPONIVEL':
      toast.error(TEXTO_INDISPONIVEL[veredito.causa]);
      return;
  }
}
