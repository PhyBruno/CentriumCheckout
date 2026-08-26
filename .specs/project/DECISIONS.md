# Decisions — Sessão de Grilling (2026-08-25)

Registro bruto de uma sessão de grilling (`/grill-me`, skill `mattpocock-skills:grilling`) sobre pontos nebulosos/ambíguos da documentação do CheckoutWEB ainda não cobertos por `PENDENCIES.md`/`STATE.md` até 2026-08-25 (AD-035). Cada pergunta traz a pergunta original, a recomendação apresentada e a resposta literal do usuário. **Este documento é fonte bruta, não é a fonte da verdade final** — as decisões aqui devem ser materializadas como novos ADs em `.specs/project/STATE.md` (continuando a numeração a partir de AD-036), refletidas em `.specs/project/PENDENCIES.md` e nos `spec.md` de cada feature afetada, seguindo o mesmo padrão já usado para AD-001 a AD-035.

Metodologia: 4 subagentes (forks) vasculharam em paralelo os 10 `spec.md` de `.specs/features/` mais `STACK.md`/`ARCHITECTURE.md`/`INTEGRATIONS.md`/`CONCERNS.md`, procurando contradições internas, fluxos de erro não cobertos, campos sem origem explicitada e TODOs não formalizados. Um achado (identidade de `SessaoUsuario.VendedorCodigo` vs. `UsuarioCodigo`) foi resolvido por fato verificado direto no contrato (`ApiCentriumOAuth.yaml`), sem precisar de pergunta ao usuário. Consultas adicionais à KB real do GenExus (MCP `genexus`) resolveram outro ponto como fato (Q23) e revelaram 3 novos pontos (`ConfiguracoesPIX`, `TrnTempoExpiracaoPIX`) que viraram perguntas Q27-Q30.

---

## Fatos verificados (não são pergunta ao usuário)

**F1 — Identidade de `VendedorCodigo` (achado do fork de precificação, descartado como contradição):** um dos 4 forks levantou possível contradição entre AD-032 (vendedor default = `SessaoUsuario.VendedorCodigo`) e a regra de `selecao-vendedor` de nunca associar vendedor = operador logado. Verificado direto no contrato `ApiCentriumOAuth.yaml` (`SDT SessaoUsuario`): `UsuarioCodigo` (linha 785, "Usuario Codigo") e `VendedorCodigo`/`VendedorNome` (linhas 802-808, "Vendedor Codigo"/"Vendedor Nome") são campos **distintos** no schema. Não há contradição — dois campos genuinamente separados. AD-032 permanece correto como está.

**F2 — `GetListaNFCes` (Q23):** DataProvider real é `DpCheckout_RascunhosLista` (mesmo padrão paginado de `GetListaClientes`/`GetListaVendedores`: `parm(in:&empcod, in:&TxtBusca, in:&Pagina, in:&TamanhoPagina)`). Lido o source completo na KB (`CentriumDEVU6`):
- `TxtBusca` filtra **só** por `CliNom` (nome do cliente) OU `NfcRepNom` (nome do vendedor) — **não busca por número da nota**.
- Dois filtros vêm **hardcoded**, não parametrizáveis: `NfcStatus = '0'` (sempre só rascunhos) e `NfcDatEmi >= (Today - 30)` (sempre só últimos 30 dias).
- Mesmo bug de paginação já encontrado em `ListaDAVs` (AD-024): `&TamanhoPaginaAuxiliar` é limitado a 50, depois **sobrescrito sem teto** por uma segunda atribuição quando `&TamanhoPagina` não é vazio — o Checkout não deve confiar no servidor para limitar o tamanho de página, deve limitar no próprio request.

**F3 — Campos de PIX não documentados até então:** lendo `SessaoUsuario` por completo (mesma leitura que confirmou F1), aparecem `ConfiguracoesPIX { UtilizaCentriumPAG, MinimoPix, TempoEspera, UtilizaEncurtador, UtilizaLinkExterno }` e o SDT de entrada de `GerarPIX` (`SDTCentriumPag_Post`) tem um campo `TrnTempoExpiracaoPIX`. Nenhum desses aparecia em `pagamento-pix/spec.md` antes desta sessão — deram origem às perguntas Q27-Q30.

---

## Rodada 1 (Q1-Q17)

**Q1 — Divisão de pagamento (split tender) existe no v1?**
➡️ Recomendação: presumo que sim, precisa virar story formal.
**Resposta:** Sim, é possível múltiplas formas de pagamento.

**Q2 — Cálculo de troco (dinheiro acima do total) está no escopo?**
➡️ Recomendação: sim, calculado e exibido pelo Checkout.
**Resposta:** Dinheiro gera troco se exceder o total. Cartão e PIX não geram troco. Só é possível inserir **uma** forma de pagamento "dinheiro" por venda — se o operador tentar inserir mais de uma, toast de notificação avisando.

**Q3 — Mecanismo técnico de comunicação com TEF/impressora local**
➡️ Sem recomendação — pedido de descrição do contrato real.
**Resposta:** TEF fica em aberto por ora (parceiro vai mudar). Impressora: serviço local sem autenticação, porta fixa, que recebe o `XMLImpressao` (retornado por `FaturarNFCe`). Registrar como **pendência**: em lugar nenhum há informação de se usa servidor de impressão local ou impressão por PDF — o certo seria ter um indicativo disso no `GetSessao`.

**Q4 — Timeout/erro de comunicação com o TEF**
➡️ Recomendação: nunca assumir sucesso silenciosamente, exigir confirmação humana.
**Resposta:** TEF deixar pendente (mesmo motivo de Q3 — parceiro vai mudar).

**Q5 — PIX pendente abandonado (timeout/fechamento de modal)**
➡️ Recomendação: teto de 10-15min de polling, depois marcar expirado.
**Resposta:** Operador pode fechar o modal (necessário aviso informando que será necessário desassociar o PIX na Central de Transações PIX), remover a forma de pagamento PIX e colocar outra — o Checkout **não** envia solicitação de cancelamento PIX. O PIX não expira em tempo curto.

**Q6 — Falha de rede entre envio de `FaturarNFCe` e a resposta (risco de nota duplicada)**
➡️ Recomendação: idempotency key ou confirmação manual antes de reenviar.
**Resposta:** Operador precisa confirmar manualmente que já foi feita uma solicitação de emissão e não teve retorno — se enviar novamente pode duplicar.

**Q7 — Impressão pós-autorização, qual mecanismo?**
➡️ Recomendação: enviar automaticamente ao servidor de impressão local (mesmo de Q3).
**Resposta:** Mesma questão colocada em Q3 (pendência registrada lá).

**Q8 — Falha de impressão local com NFCe já autorizada (sem reimpressão)**
➡️ Recomendação: manter PDF acessível na tela para novo clique.
**Resposta:** Mesma questão de Q3 (resolvida em Q20, rodada 2 — ver abaixo).

**Q9 — Precisão monetária (centavos inteiros vs. lib externa, ponto de arredondamento)**
➡️ Recomendação: inteiros em centavos, arredondar por linha.
**Resposta:** "Não entendi" — reformulada e respondida em Q18 (rodada 2).

**Q10 — Desconto/acréscimo livre do operador**
➡️ Sem recomendação — pergunta de existência/limite.
**Resposta:** Operador pode aplicar desconto direto no item, **ou** desconto na capa da nota (seção de pagamentos). Desconto de capa: na montagem do JSON para `FaturarNFCe`, o valor deve ser **rateado igualmente entre os itens** (não há meio centavo — se cair nesse caso, colocar um centavo a mais em um dos itens).

**Q11 — Listar/retomar rascunho de NFCe (`GetListaNFCes`/`CarregarNFCe`) existe no v1?**
➡️ Recomendação: se real, precisa de spec própria.
**Resposta:** Sim, é possível listar (não tinha UI no Pencil nesse momento — resolvido em Q22, rodada 2) e retomar um rascunho. Ao retomar, é preciso **preservar o campo `NumeroNota`** para enviar ao `FaturarNFCe` com essa informação.

**Q12 — Suspender venda com TEF/PIX já aprovado, permitido?**
➡️ Recomendação: bloquear.
**Resposta:** Não é possível.

**Q13 — Trocar cliente/vendedor com carrinho já populado (ou pagamento aprovado)**
➡️ Recomendação: bloquear pelo gatilho de `CART-09`; recalcular `TipoPreco=9` ao trocar cliente.
**Resposta:** É possível trocar o cliente depois do carrinho já populado. (Detalhado em Q25/Q26, rodada 2.)

**Q14 — Retomar rascunho com preço desatualizado**
➡️ Recomendação: re-consultar e atualizar/avisar.
**Resposta:** O preço pode ter sido alterado pelo próprio operador no retaguarda na inserção do item — por isso deve **preservar o valor salvo**. Se inserir mais um item que já está no carrinho, informar que o preço do item pode ser atualizado por estar tendo recálculo (nova inserção do mesmo item dispara recálculo).

**Q15 — Falha de renovação silenciosa de token com venda em digitação**
➡️ Recomendação: mostrar aviso equivalente ao `beforeunload`.
**Resposta:** Mostrar o aviso equivalente.

**Q16 — Isolamento por tenant no cache Dexie/IndexedDB**
➡️ Recomendação: incluir `tenant` na chave do banco.
**Resposta:** Incluir tenant.

**Q17 — Escopo mobile: Modal DAV é desktop-only?**
➡️ Recomendação: confirmar e documentar como já feito para o menu gerencial.
**Resposta:** Modal DAV é desktop only, além do modal de recuperação da NFCe (Q11/Q22).

---

## Rodada 2 (Q18-Q26)

**Q18 (reformulação de Q9) — Padrão de arredondamento monetário generalizado**
➡️ Recomendação: mesma regra de Q10 (centavos inteiros, sobra em um item) vale em todo lugar.
**Resposta:** Sim.

**Q19 — Serviço de impressão local, contrato técnico completo (porta, rota, formato de resposta)**
➡️ Sem recomendação.
**Resposta:** Deixar como **pendência**.

**Q20 — Fallback quando o serviço de impressão local não responde**
➡️ Recomendação: cair para exibir/baixar o PDF.
**Resposta:** Informar que não foi possível imprimir diretamente, **questionar se deseja imprimir o PDF**.

**Q21 — Desconto manual: limite e autorização; desconto de capa é percentual ou valor fixo?**
➡️ Sem recomendação.
**Resposta:** Sem teto, sem senha — decisão tomada agora. Desconto de capa pode ser em **porcentagem ou valor fixo**.

**Q22 — Nova feature: recuperação de NFCe, vira Specify formal própria?**
➡️ Recomendação: sim, Specify formal.
**Resposta:** Fase formal própria. Já existe UI de referência no Pencil: **"PDV Online Web - Modal Recuperação NFCe"**.

**Q23 — Filtros de `GetListaNFCes`: verificar fato na KB, não perguntar**
➡️ Verificação própria via MCP GenExus.
**Resposta:** Verificar na KB GenExus via MCP → resolvido como **Fato F2** acima.

**Q24 — Retomar rascunho com pagamento parcial removível (dinheiro/cartão manual) já aplicado, permitido suspender?**
➡️ Recomendação: sim, já que são removíveis.
**Resposta:** Sim.

**Q25 — Troca de cliente: dispara recálculo de `TipoPreco=9`? Bloqueada após pagamento aprovado?**
➡️ Recomendação: recálculo automático + bloqueio pelo gatilho de `CART-09`.
**Resposta:** Dispara o recálculo. Essa troca **não é permitida** com pagamento aprovado.

**Q26 — Troca de vendedor: mesma pergunta**
➡️ Recomendação: mesmo bloqueio de `CART-09`.
**Resposta:** É permitido, **exceto** após pagamento aprovado.

---

## Rodada 3 (Q27-Q37) — a partir dos Fatos F2/F3

**Q27 — `TrnTempoExpiracaoPIX` precisa ser preenchido pelo Checkout ao chamar `GerarPIX`?**
➡️ Sem recomendação fechada — perguntado se obrigatório.
**Resposta:** Não enviado.

**Q28 — `ConfiguracoesPIX.MinimoPix`, validar antes de gerar PIX?**
➡️ Recomendação: sim, client-side.
**Resposta:** Sim, bloquear no Checkout.

**Q29 — `UtilizaEncurtador`/`UtilizaLinkExterno`, precisa de UI além do QR Code?**
➡️ Sem recomendação.
**Resposta:** São configurações internas — o endpoint sempre retornará o base64 do QR Code PIX ("eu acho" — resposta com incerteza reconhecida pelo próprio usuário; tratar como assunção a confirmar depois, não como fato definitivo).

**Q30 — `GerarPIX` usa saldo residual da venda ou sempre o total cheio?**
➡️ Recomendação: saldo residual.
**Resposta:** Saldo residual.

**Q31 — `FormaFpgUtiCar` vazio: permitir aplicar ticket de devolução otimisticamente, ou tratar como não elegível?** (reformulada com exemplo concreto após "não entendi" na primeira tentativa)
➡️ Recomendação (na reformulação): esconder por segurança (não elegível).
**Resposta:** **Permitir** (contrário à recomendação — decisão explícita do usuário).

**Q32 — Falha não-401 no bootstrap inicial (erro 500/timeout do ERP)**
➡️ Recomendação: tela de erro com "Tentar novamente".
**Resposta:** Botão "tentar novamente".

**Q33 — Origem do hash/versão do cache Dexie (`AUTH-04`)**
➡️ Sem recomendação fechada.
**Resposta:** Hash calculado **localmente** (não é campo do `GetSessao`).

**Q34 — Cadastro simplificado (`CliTip='F'` fixo): bloquear entrada de CNPJ na busca?**
➡️ Recomendação: sim, bloquear/alertar.
**Resposta:** Bloquear/Alertar.

**Q35 — `GetStatusSistema`: quando é chamado no fluxo?**
➡️ Sem recomendação.
**Resposta:** Pendência (não resolvido nesta sessão).

**Q36 — Concorrência: dois operadores no mesmo DAV/rascunho de NFCe suspenso**
➡️ Recomendação: deixar o ERP resolver, sem lock otimista.
**Resposta:** Deixar o ERP resolver.

**Q37 — Cobertura mobile de pagamento e cadastro de cliente**
➡️ Recomendação: reaproveitar componentes, sem tela dedicada.
**Resposta:** Fluxo de pagamento precisará de adaptação, inferida pela IA (fase Design). Cadastro de cliente **deve existir** no mobile; **recuperação** (de NFCe) **não** (confirma Q17 — desktop-only).

---

## Rodada 4 (Q38-Q43)

**Q38 — `ClienteDefaultCodigo`/`VendedorCodigo` vazios no próprio `GetSessao` (tenant nunca configurou default — distinto de "lista de busca vazia", já resolvido por AD-032)**
➡️ Recomendação: campo nasce vazio, exige seleção manual antes de finalizar.
**Resposta:** "Mesmo tratamento" — confirma a recomendação (campo vazio até seleção manual).

**Q39 — Distinção visual entre cliente/vendedor no valor default vs. selecionado manualmente**
➡️ Recomendação (fraca): indicador sutil tipo "(padrão)".
**Resposta:** Não precisa de indicador.

**Q40 — Múltiplas abas do mesmo operador, cookie compartilhado — uma aba pode derrubar a sessão da outra?**
➡️ Recomendação: aceitar como comportamento conhecido.
**Resposta:** Aceitar esse comportamento.

**Q41 — Importação de DAV sobrescreve automaticamente o cliente/vendedor default (AD-032)?**
➡️ Recomendação: sim, sempre sobrescreve.
**Resposta:** Sim.

**Q42 — Falha na própria chamada `POST GerarPIX` (erro de rede/validação, não o polling depois)**
➡️ Recomendação: erro simples + tentar novamente.
**Resposta:** Opção de tentar novamente.

**Q43 — Filtro "Ativo" nos modais de listagem (vendedor/cliente): pré-marcado ou lista tudo por padrão?**
➡️ Recomendação: pré-marcado.
**Resposta:** Vem pré-marcado.

---

## Itens explicitamente deixados como pendência nesta sessão (não resolvidos, registrar em `PENDENCIES.md`)

1. **TEF** — protocolo de comunicação, mecanismo de invocação, timeout/erro (Q3/Q4). Bloqueio deliberado do usuário — parceiro de TEF será trocado, não vale desenhar contrato para o parceiro atual.
2. **Serviço de impressão local** — contrato técnico completo: porta fixa (número não informado), rota/método HTTP, formato de resposta (Q19). Falta indicativo no `GetSessao` de qual mecanismo de impressão usar (local vs. PDF) por tenant/máquina — idealmente um novo campo a pedir ao time do ERP.
3. **`GetStatusSistema`** — timing de quando é chamado no fluxo (Q35). Distinto da pendência já existente (#7 em `PENDENCIES.md`) sobre a semântica dos códigos de retorno — essa nova pendência é sobre o gatilho de chamada, não a semântica.
4. **`UtilizaEncurtador`/`UtilizaLinkExterno`** (Q29) — resposta do usuário veio com incerteza reconhecida ("eu acho"); tratar a assunção de "endpoint sempre retorna QR base64, sem necessidade de UI de link" como best-effort, a confirmar depois se necessário.

## Nova feature a especificar formalmente

**Recuperação de NFCe** (Q11/Q22) — listar rascunhos via `GetListaNFCes` (fato F2 acima) e retomar via `CarregarNFCe`, preservando `NumeroNota`. UI de referência já existe no Pencil: **"PDV Online Web - Modal Recuperação NFCe"**. Desktop-only (Q17/Q37). Precisa de spec própria em `.specs/features/recuperacao-nfce/spec.md`, no mesmo padrão de `.specs/features/importacao-dav/spec.md`.
