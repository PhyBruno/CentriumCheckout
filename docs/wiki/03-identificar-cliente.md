# 03. Identificar cliente

> Como colocar o cliente na venda: por código ou CPF, pela busca por nome ou cadastrando um cliente novo, e o que vale quando você não identifica ninguém.

**Quem usa:** Operador de caixa

## Para que serve

Identificar o cliente serve a dois fins:

- **Preço:** a lista de preço do cliente vale para a venda inteira.
- **Nota fiscal:** o Checkout informa o cliente ao ERP, e a nota é emitida com os dados do cadastro dele (capítulo [10](10-finalizar-e-suspender-venda.md)).

Se você não identificar ninguém, a venda segue com o **cliente padrão** da sua loja (o "consumidor" configurado no ERP).

## Antes de começar

- **Identifique o cliente antes de bipar o primeiro produto.** Depois que a venda tem item, o cliente **não pode mais ser trocado**. Para trocar, cancele os itens antes.
- O cliente fica no cartão **Cliente da venda**, na parte de cima da coluna de venda. Se o cartão estiver fechado (**Recolhido**), clique em **Recolhido** ou na seta para abrir (**Expandido**).
- O Checkout atende **pessoa física (CPF)**. Cliente com CNPJ não pode ser usado na NFC-e (veja "Regras e bloqueios").

![Cartão Cliente da venda aberto, sem item na venda: pílulas Cliente e Vendedor no alto; abaixo os campos "Código do cliente ou CPF", "Nome / telefone", a lupa, o botão Identificar, "Contato" e o campo do vendedor.](imagens/03-01-cartao-cliente-aberto.png)
*Figura 03.01 — Cartão Cliente da venda aberto.*

## Passo a passo

### Identificar pelo código do cliente ou pelo CPF

1. Abra o cartão **Cliente da venda**.
2. Clique no campo **Código do cliente ou CPF** (ou pressione **F3** e use a busca, veja abaixo).
3. Digite só números:
   - **até 6 dígitos:** o Checkout entende como **código do cliente**;
   - **11 dígitos:** o Checkout entende como **CPF**. Pontos e traço são aceitos e ignorados.
4. Pressione **Enter**, clique em **Identificar** ou saia do campo.
5. O nome do cliente aparece em **Nome / telefone**, o telefone em **Contato** e a pílula **Cliente** mostra o nome. O cartão se fecha sozinho e o cursor vai para o campo do produto.

Exemplo: digite `123456` (código) ou `123.456.789-09` (CPF fictício).

![Cartão de cliente depois de identificado: pílula Cliente com o nome "Maria Exemplo", campo Código do cliente ou CPF preenchido, Nome / telefone preenchido e Contato com um telefone fictício.](imagens/03-02-cliente-identificado.png)
*Figura 03.02 — Cliente identificado.*

### Buscar o cliente por nome, e-mail, telefone ou documento

1. Abra o cartão **Cliente da venda** e clique na lupa **Buscar cliente**, ou pressione **F3** em qualquer lugar da tela de venda.
2. Na janela **Consultar cliente**, digite no campo "Busque por nome, e-mail, telefone ou documento". Digite pelo menos o número mínimo de caracteres que a janela pede ("Digite ao menos N caracteres para buscar."). Esse número vem da configuração da sua loja no ERP.
3. A lista mostra **Código**, **Cliente**, **CPF/CNPJ**, **Telefone** e **Cidade**, em páginas. Use **Anterior** e **Próxima** para mudar de página.
4. Clique no cliente desejado. A janela fecha e o cliente entra na venda.
5. Para sair sem escolher, clique em **Fechar** ou pressione **Esc**.

![Janela Consultar cliente com a busca preenchida e uma lista de cinco clientes fictícios nas colunas Código, Cliente, CPF/CNPJ, Telefone e Cidade, com o rodapé "Página 1 de 3" e os botões Anterior e Próxima.](imagens/03-03-busca-cliente.png)
*Figura 03.03 — Janela Consultar cliente.*

### Cadastrar um cliente novo (cadastro simplificado)

O cadastro abre de dois jeitos:

- **Pelo CPF:** você digitou um CPF que o ERP não conhece. O formulário abre sozinho com o CPF já preenchido.
- **Pela busca:** na janela **Consultar cliente**, clique em **Novo cliente**.

Preencha o formulário **Cadastrar cliente** ("Preencha as informações do novo cliente"):

1. **Dados do cliente:**
   - **Nome completo** (obrigatório);
   - **CPF** (obrigatório, 11 dígitos);
   - **E-mail (opcional)**;
   - **Celular (opcional)**.
2. **Endereço:**
   - **CEP** (obrigatório, 8 dígitos);
   - **Endereço**, **Bairro**, **Número**, **Cidade** e **UF**.
3. Clique em **Salvar cliente**. O botão só fica ativo com nome, CPF e CEP válidos.
4. O cliente é gravado no ERP e já entra na venda.

Para desistir, clique em **Cancelar** ou em **Fechar**, ou pressione **Esc**.

![Formulário Cadastrar cliente com as seções "Dados do cliente" e "Endereço", campos preenchidos com dados fictícios e o botão Salvar cliente ativo.](imagens/03-04-cadastro-simplificado.png)
*Figura 03.04 — Cadastro simplificado.*

### Vender para o cliente padrão

1. Não faça nada. Quando o Checkout abre, ele já coloca o cliente padrão da loja na venda.
2. Se a sua loja não tem cliente padrão configurado, o cartão mostra **Não identificado**.

> **Dica:** o cliente padrão não conta como "venda em andamento". Atualizar a página com a venda vazia e só o cliente padrão não pergunta nada.

## Regras e bloqueios

- **Cliente só antes dos itens.** Com pelo menos um item ativo na venda, o campo vira somente leitura e a lupa e o botão **Identificar** ficam bloqueados. Itens cancelados (riscados) não contam. A tecla **F3** diz a mesma coisa.
- **Cliente travado depois de pagamento aprovado.** Com pagamento já aprovado, o cliente não troca mais.
- **Só pessoa física.** O Ajuste SINIEF 11/2025 proíbe NFC-e para pessoa jurídica. Se você digitar um CNPJ, ou escolher na busca um cliente que seja CNPJ, o Checkout recusa e limpa o cliente. Para vender a um CNPJ, é preciso emitir NF-e pelo ERP.
- **Código com até 6 dígitos, CPF com 11.** Valores entre 7 e 10 dígitos, ou letras, são recusados.
- **Identificar não cadastra sozinho um código.** Um código que não existe só mostra aviso. O cadastro novo só abre a partir de um **CPF** desconhecido ou do botão **Novo cliente**.
- Ao identificar o cliente, o ERP informa a lista de preço dele. Essa lista é usada em todos os itens.

## Mensagens que você pode ver

| Mensagem na tela | O que significa | O que fazer |
|---|---|---|
| "Digite o CPF do consumidor para identificar." (motivo do botão **Identificar** apagado) | O campo está vazio. | Digite o código ou o CPF. |
| "Aguarde: a consulta ao ERP ainda está em andamento." | A consulta ainda não voltou. | Espere um instante. |
| "Esta venda já tem itens: o cliente não pode mais ser trocado, porque a lista de preço dele já valeu na precificação. Cancele os itens para trocar o cliente." | Já há item ativo na venda. | Cancele os itens (lixeira) se for mesmo trocar o cliente. |
| "Já há pagamento aprovado nesta venda: o cliente não pode mais ser trocado." | Há pagamento aprovado. | Não é possível trocar. |
| "O código do cliente e o CPF são só números: remova as letras." | O campo tem letras. | Digite só números. |
| "Informe o código do cliente (até 6 dígitos) ou um CPF (11 dígitos)." | A quantidade de dígitos não bate. | Confira o número. |
| "Venda para CNPJ exige NFe emitida pelo ERP: o Ajuste SINIEF 11/2025 proíbe NFCe para pessoa jurídica. Informe um CPF (11 dígitos) ou o código do cliente." | Foi digitado um CNPJ. | Use um CPF ou o código de um cliente pessoa física. |
| "Venda para CNPJ exige NFe emitida pelo ERP: [...] Escolha um cliente pessoa física." | O cliente escolhido é pessoa jurídica. | Escolha outro cliente. |
| "Nenhum cliente com o código N." | O código não existe. | Confira o código ou busque pelo nome. |
| "Não foi possível consultar o cliente. Tente novamente." | Falha na consulta ao ERP (rede ou ERP). | Tente de novo. Se repetir, chame o suporte. |
| "O ERP devolveu um cliente em formato inesperado. Nada foi alterado." | Resposta inválida do ERP. | Chame o suporte. |
| "O ERP encontrou o cliente N mas devolveu o cadastro sem nome. Não é possível identificá-lo na venda — avise o suporte." | Cadastro incompleto no ERP. | Chame o suporte; use outro cliente enquanto isso. |
| "Nenhum cliente encontrado para o termo informado." | A busca não achou. | Tente outro termo ou use **Novo cliente**. |
| "Digite ao menos N caracteres para buscar." | O termo é curto demais. | Digite mais caracteres. |
| "Não foi possível buscar clientes. Tente novamente." | Falha na busca. | Repita. |
| Frase devolvida pelo ERP ao salvar (por exemplo, CPF já cadastrado) | O ERP recusou o cadastro e disse o motivo. | Corrija o dado indicado. |
| "Configuração do ponto de venda ainda não carregada." | O cadastro foi tentado antes de a configuração carregar. | Aguarde o carregamento e tente de novo. |

## Dúvidas frequentes

**O cliente quer o CPF na nota, mas já lancei os itens. E agora?**
O Checkout não tem uma opção separada de "CPF na nota": o ERP usa o cliente da venda. Com itens lançados o cliente não troca. Cancele os itens (e use **Limpar**, se já escolheu a condição de pagamento), identifique o cliente e lance os itens de novo. Veja [10. Finalizar e suspender a venda](10-finalizar-e-suspender-venda.md).

**Digitei o CPF e o cadastro novo abriu. É erro?**
Não: significa que o ERP não conhece esse CPF. Cadastre, ou confira se digitou certo.

**Como saber se o cliente foi identificado por mim ou é o padrão?**
No cartão aberto, o campo **Código do cliente ou CPF** mostra o código do padrão. Identificado por CPF, mostra o CPF.

**A tecla F3 não abre a busca.**
Se a venda já tem item, a tecla mostra o motivo do bloqueio. Veja o capítulo [09](09-venda-rapida-e-atalhos.md).

## Veja também

- [04. Selecionar vendedor](04-selecionar-vendedor.md)
- [05. Produtos e carrinho](05-produtos-e-carrinho.md)
- [09. Venda rápida e atalhos](09-venda-rapida-e-atalhos.md)
- [10. Finalizar e suspender a venda](10-finalizar-e-suspender-venda.md)
