# 15. Solução de problemas

> Consulta rápida para o suporte: sintoma, causa provável e o que fazer, por área, mais a infraestrutura local e o que coletar ao abrir um chamado.

**Quem usa:** Suporte | Supervisor/gestor

## Como usar este capítulo

1. Procure o **texto exato** que o operador viu (as mensagens estão entre aspas nos capítulos de cada área) ou o sintoma.
2. Leia a causa provável e siga o "o que fazer".
3. Se não resolver, reúna as informações da seção **O que coletar ao abrir um chamado** antes de escalar.

Três regras valem em qualquer caso, e evitam o pior dos problemas:

> **Atenção:** **nunca reenvie** uma finalização sem conferir no ERP. **Cada envio grava uma nota nova** no ERP. Uma NFC-e rejeitada já foi gravada.

> **Atenção:** **o Checkout não cancela PIX nem transação de cartão no TEF.** Desistir, remover ou suspender não devolve dinheiro. Confira no banco ou na maquininha.

> **Atenção:** **a venda não sobrevive a F5.** Recarregar a página apaga a venda em andamento.

## O que coletar ao abrir um chamado

Peça ao operador (ou colete) estas informações. Elas encurtam muito o atendimento:

1. **Loja, caixa e operador** (aparecem na barra superior: nome da loja, "Caixa NN • PDV NN" e o nome do operador).
2. **Dia e hora** em que o problema aconteceu, e se acontece sempre ou de vez em quando.
3. **O texto exato** da mensagem na tela (foto ou captura). Se houver janela de erro, o título dela (por exemplo, "NFCe rejeitada") e o bloco **Motivo apontado pelo ERP** ou **Motivo da rejeição**.
4. **O que o operador estava fazendo** (passo a passo curto) e se havia itens, cliente, vendedor e forma de pagamento.
5. **O equipamento:** computador (mouse e janela grande) ou celular/tablet; navegador e versão (o Chrome tem `chrome://version`); se havia segundo monitor.
6. **Em venda finalizada ou com erro de envio:** o **número e a série** da nota (aparecem na janela "Venda finalizada" como "NFCe N · série S") ou do rascunho ("Rascunho N · série S"), e **se o ERP tem a nota** (quantas notas existem para a venda).
7. **Em PIX:** o valor, o horário e se o dinheiro entrou no banco.
8. **Em cartão pelo TEF:** o valor, o horário e o que a maquininha mostrou.
9. **Em problema de impressão:** o tipo de impressão do caixa (direta ou PDF) e se o serviço de impressão da máquina está em execução.
10. **Do lado do servidor do Checkout** (quem faz a implantação): o log do servidor no horário do problema. As frases de log mais úteis estão na tabela de acesso abaixo. O endereço `/health` do Checkout responde "ok" quando o servidor está de pé.

![Janela "Venda finalizada" com a identificação da nota "NFCe 1234 · série 1" em destaque, que o operador deve fotografar ou anotar ao abrir um chamado.](imagens/15-01-identificacao-da-nota.png)
*Figura 15.01 — O número e a série da nota aparecem na janela "Venda finalizada": peça ao operador para registrá-los.*

## Acesso e sessão

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| Tela "Não foi possível carregar o checkout com os dados fornecidos" **sem botão**, e a instrução "Acesse o Checkout novamente pelo CentriumWEB." | O acesso não foi aceito: endereço digitado à mão, vencido ou incompleto; **chave de cifra do ambiente diferente da usada pelo ERP**; dados obrigatórios vazios no acesso (por exemplo, código da empresa); usuário não reconhecido pelo ERP; ou a sessão já terminou. | Abra pelo ERP de novo. Se for recorrente em todos os operadores, confira com a implantação a chave e o vetor de cifra de entrada (iguais aos do ERP) e o log: "redirect sem entrada cifrada válida" (chave diferente ou endereço em claro), "entrada decifrada sem os campos obrigatórios" (campos vazios), "falha ao iniciar sessão" (login recusado ou ERP fora) ou "operador não identificado pelo ERP". |
| Mesma tela, **com** o botão "Tentar novamente" | O acesso foi aceito, mas o carregamento da configuração falhou (ERP lento ou fora, resposta inválida, rede). | **Tentar novamente**. Se persistir, confira o ERP e a rede. Log comum: resposta do ERP que não é JSON válido ou configuração fora do contrato. |
| "A sessão do operador foi encerrada. Reabra o Checkout pelo ERP [...]" no meio de uma operação | A sessão expirou ou o login foi invalidado (por exemplo, troca de senha). | Reabra pelo ERP. Se a operação era finalizar, **confira no ERP** se algo foi gravado. |
| Operador entra, mas vê o nome de outro usuário na barra | Sessão de outro usuário no mesmo navegador. | Feche, saia do ERP, entre com o usuário certo e reabra o Checkout. |
| Configuração da loja mudou no ERP e o caixa não refletiu | O Checkout confere a mudança a cada 1 minuto, **só com a venda vazia**. | Espere ou reabra pelo ERP. |

## Tela de venda, atalhos e produtos

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| F6 a F9 não fazem nada | Sem cenário cadastrado na tecla; cursor em campo de digitação (menos o de código); janela aberta; venda sem item ou já em pagamento. | Veja o capítulo [09](09-venda-rapida-e-atalhos.md). |
| F6 abriu a barra de endereço do Chrome | Não há cenário cadastrado para a tecla. | Cadastre o cenário no ERP ou oriente a não usar a tecla. |
| Pagamento por atalho com forma "errada" (por exemplo, "Cheque") | O cadastro do cenário/forma no ERP. | Corrija o cenário no ERP. |
| "Escolha o vendedor da venda antes de inserir produtos" em toda venda | Loja sem vendedor padrão configurado. | Oriente a escolher o vendedor, ou configure um padrão no ERP. |
| Pílula do vendedor mostra o nome do operador | O ERP usa o nome do usuário quando não há vendedor padrão (pendência do ERP). | O código enviado na nota é o correto; só o nome na tela engana. |
| "Produto N não encontrado" para produto que existe | Código lido no tipo errado, produto de outra empresa, ou resposta vazia do ERP. | Confira o tipo de código do usuário no ERP (campo mostra "Código reduzido", "Código de barras" ou "Referência") e a empresa. |
| Produto sem preço ("está sem preço de venda no ERP") | Cadastro sem preço. | Corrija no ERP. |
| Janela "Produto não inserido" / "Cenário tributário não encontrado" | Falta cenário tributário para o produto e o cliente no ERP. | Corrija o cadastro fiscal. Cada tentativa de **suspender** nesse caso pode criar um rascunho vazio no ERP (limpe no ERP). |
| "Estoque insuficiente para [...]" | Política de saldo do ERP (avisa ou bloqueia). | Ajuste a quantidade ou o saldo. |
| Preço diferente do esperado | Lista de preço do cliente, faixa de quantidade ou convênio. | Confira o cliente da venda, a quantidade total do produto e o cadastro. |
| Cliente com CNPJ recusado | Regra fiscal: NFC-e não pode ser emitida para pessoa jurídica. | NF-e pelo ERP. |
| Não consegue trocar cliente ou vendedor | Venda com item (cliente) ou em pagamento. | Cancele os itens ou use **Limpar**. |
| "Tentar de novo" na câmera, ou botão Scanner ausente | Veja o capítulo [13](13-celular-e-tablet.md). | Android com Chrome, HTTPS, câmera liberada. |

## Pagamento, PIX e TEF

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| Condição de pagamento bloqueada | Sem produto; ou já há forma aplicada; ou catálogo não carregou. | Veja os motivos em [06](06-pagamento.md). |
| "Finalizar venda" apagado e o ERP "ainda não aprovou" | A conferência prévia do ERP não aprovou ou nunca rodou. | Revise cliente, condição e formas; adicione o pagamento de novo. |
| Janela "Pagamento não aceito" | O ERP recusou a venda ao adicionar a forma; o motivo vem do ERP. | Leia o **Motivo apontado pelo ERP** e corrija. |
| PIX indisponível (forma apagada) | PIX não está ativo na configuração da loja. | Ative no ERP. |
| "O ERP não gerou o QR Code desta cobrança [...]" ou "Não foi possível gerar a cobrança PIX" | Configuração do PIX incompleta no ERP, ou falha na geração. No ambiente de testes, a geração com o cliente padrão chegou a falhar. | Confira a configuração do PIX da empresa e teste com um cliente identificado; escale ao ERP com horário e valor. |
| PIX "preso" aguardando | O banco ainda não confirmou, ou a consulta não atualiza. | Confira no banco. Não gere outra cobrança sem conferir. A janela só sai com **Desistir da operação**. |
| Cliente pagou o PIX depois de desistir | O Checkout não cancela a cobrança. | Estorno no banco e desassociação na Central de Transações PIX do ERP. |
| WhatsApp do PIX desabilitado | Loja sem o envio habilitado. | Habilite com o comercial. |
| TEF: "Este operador não tem usuário do TEF vinculado no ERP [...]" | O usuário não tem o identificador do TEF, ou a sessão foi aberta antes do vínculo. | Vincule a maquininha ao usuário no ERP e peça para reabrir o Checkout pelo ERP. |
| TEF: "Falha ao criar a cobrança" | Maquininha não localizada para o usuário, TEF fora, rede. | Confira a maquininha e o vínculo. Em homologação sem maquininha, nada é cobrado. |
| TEF: janela esperando sem fim | Maquininha desligada, sem rede ou operação não concluída. | Confira na maquininha. Use **Desistir da operação** e **confira o terminal**: a transação pode ser aprovada depois. |
| Cartão aprovado e a venda não pode ser suspensa ou limpa | Regra: só estorno remove cartão aprovado. | Estorne pelo botão de remover. |
| Cartão avulso (POS) lançado sem janela | A forma não está marcada para TEF. | Normal: o operador confere na maquininha. Se era para ser TEF, ajuste o cadastro da forma. |

## Finalização, NFC-e e impressão

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| "Sem resposta do servidor [...] Confirme no ERP antes de reenviar" | A rede caiu no envio. A nota pode ou não ter sido gravada. | **Confira no ERP** antes de reenviar. Reenviar uma venda já processada gera uma segunda nota. |
| "NFCe rejeitada" | A SEFAZ não autorizou. A nota foi gravada no ERP. | Corrija e retransmita **no ERP**. O Checkout não reenvia. O número e a série da nota podem vir zerados na rejeição (pendência do ERP). |
| "O ERP respondeu sem a nota fiscal pronta para impressão. A venda não foi emitida." | O ERP respondeu sem a nota. Em testes, uma emissão respondeu assim e o rascunho saiu da lista de suspensas. | **Confira no ERP** se a nota existe antes de qualquer reenvio. |
| "Venda não aceita pelo ERP" | Recusa de negócio do ERP, com o motivo. | Corrija conforme o motivo. A venda continua aberta. |
| Nota duplicada | Reenvio após falha de rede, ou finalização repetida. | Confira quantas notas foram gravadas; cancele a duplicada **no ERP**. |
| Cupom não imprime, janela "Não foi possível imprimir" | Serviço de impressão local parado ou bloqueado pelo Chrome. | Veja "Infraestrutura local" abaixo. Use **Abrir o PDF em outra aba** enquanto isso. |
| "O navegador bloqueou a aba do PDF" | Bloqueador de pop-up. | Libere pop-ups para o Checkout. |
| Venda suspensa sumiu | Rascunho no ERP. | Menu Importação > NFC-e (capítulo [11](11-importar-dav-e-recuperar-nfce.md)). Rascunho de NFC-e rejeitada não aparece lá. |
| Vendedor "#0" ou em branco ao retomar documento | O ERP devolve o vendedor zerado em alguns rascunhos. | O operador escolhe o vendedor antes de finalizar. |
| Importação recusada ("Esta venda já tem itens [...]") | A venda não está vazia. | **Cancelar venda** e importar de novo. |
| Itens travados em venda retomada | O documento veio com pagamento já registrado. | **Limpar** descarta o registro (não devolve dinheiro). Confirme com o gestor antes. |

## Infraestrutura local

O Checkout roda em um servidor próprio, mas a **impressão** e o **TEF** dependem de coisas instaladas na **máquina do caixa**, fora do servidor.

### Impressão direta

- O **navegador** do caixa chama o serviço de impressão instalado na própria máquina, por HTTP, no endereço do cadastro do caixa no ERP. Se o caixa não tem endereço cadastrado, o Checkout usa o padrão `127.0.0.1:4545` e avisa.
- O tipo de impressão (direta ou PDF) vem do cadastro do caixa no ERP.
- Sintomas: "Não foi possível imprimir diretamente: o serviço de impressão da máquina não respondeu." (serviço parado ou endereço errado); "O navegador bloqueou a comunicação com o serviço de impressão local [...]" (política do Chrome).
- **Confira, nesta ordem:** (1) o serviço de impressão está em execução na máquina do caixa; (2) o endereço cadastrado está certo; (3) as políticas do Chrome abaixo estão aplicadas; (4) a impressora está ligada e é a padrão do serviço.

### Políticas do Chrome (TI da loja)

O Checkout é servido por HTTPS, e o serviço de impressão local responde por HTTP. A partir do Chrome 142, o navegador bloqueia por padrão o acesso a endereços de rede local e o conteúdo misto. A TI de cada cliente deve aplicar (por política de grupo no Windows ou pelo gerenciamento de navegador na nuvem), com a **origem do Checkout** da loja:

- **`LocalNetworkAccessAllowedForUrls`:** libera o acesso à rede local.
- **`InsecureContentAllowedForUrls`:** libera o conteúdo misto (HTTP a partir de página HTTPS).

Para conferir, abra `chrome://policy` na máquina do caixa e procure as duas políticas. Depois de aplicar, **reinicie o Chrome**. O Checkout sempre tenta a chamada e só depois classifica a falha: por isso, o bloqueio aparece como a mensagem de "configuração de navegador/política de TI", não como erro genérico de conexão.

![Página chrome://policy do Chrome na máquina do caixa, com as políticas LocalNetworkAccessAllowedForUrls e InsecureContentAllowedForUrls listadas, com status "OK" e a origem do Checkout da loja como valor.](imagens/15-02-chrome-policy.png)
*Figura 15.02 — As duas políticas do Chrome aplicadas na máquina do caixa.*

> **Suporte:** essa configuração é responsabilidade da TI do cliente e é item do checklist de implantação. O Checkout não consegue contorná-la.

### TEF (maquininha)

- O TEF é cobrado pelo **ERP**, que fala com a maquininha. O Checkout apenas pede a cobrança, acompanha o status e pede o estorno.
- Requisitos: TEF ativo na empresa; forma marcada para TEF; **usuário vinculado a uma maquininha** no ERP; maquininha ligada e conectada.
- O identificador do usuário no TEF é obtido na abertura da sessão: depois de mudar o vínculo no ERP, o operador precisa **reabrir o Checkout pelo ERP**.
- A validação com terminal real ainda não foi feita (veja abaixo). Faça cobrança e estorno de teste.

### Câmera (Scanner)

Exige Chrome para Android, endereço HTTPS e permissão de câmera. Veja o capítulo [13](13-celular-e-tablet.md).

### Rede

O Checkout depende de internet até o ERP. Sem rede: o acesso falha, e envios e conferências retornam "Sem comunicação com o ERP [...]". Oscilações curtas na entrada são repetidas pelo servidor duas vezes antes de recusar.

## Pontos conhecidos que dependem do ERP ou de homologação

Itens que podem aparecer em campo e que **não são defeito do Checkout**:

- **TEF sem terminal real:** a cobrança e o estorno foram medidos contra uma maquininha simulada. Bandeira, NSU e autorização reais ainda precisam ser conferidos com um terminal da loja. Rejeição de pagamento e de estorno também não foram medidas ao vivo.
- **PIX:** a geração de cobrança em ambiente de testes não foi concluída de ponta a ponta (o ERP de testes recusou ou respondeu sem cobrança). Valide em cada loja nova.
- **Motivo de NFC-e rejeitada:** o texto vem do ERP, às vezes longo, com sugestão de correção; número e série da nota podem vir zerados.
- **Vendedor:** rascunhos retomados podem trazer o vendedor zerado.
- **Recusa por cenário tributário:** o ERP pode gravar um rascunho vazio a cada tentativa.
- **Finalização sem nota na resposta:** em testes, o ERP respondeu sem a nota e o rascunho saiu da lista de suspensas; o Checkout trata como falha e mantém a venda no caixa.
- **Cartão TEF de documento retomado:** o Checkout não oferece estorno.
- **Cenário tributário de produto:** em ambiente de testes, nenhum produto foi aprovado pela checagem de cenário.

## Veja também

- [01. Acesso e sessão](01-acesso-e-sessao.md)
- [06. Pagamento](06-pagamento.md)
- [07. Pagamento PIX](07-pagamento-pix.md)
- [08. Pagamento com cartão (TEF)](08-pagamento-cartao-tef.md)
- [10. Finalizar e suspender a venda](10-finalizar-e-suspender-venda.md)
- [13. Celular e tablet](13-celular-e-tablet.md)
- [18. Auditoria de ações](18-auditoria-de-acoes.md)
