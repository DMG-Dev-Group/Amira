# Manual do Sistema de Pagamento — Flora Beauty

**Para:** Miguel (DMG) · **Atualizado em:** rodada 2 (07/2026)
**Princípio desta rodada: pagamento 100% GRATUITO** — sem gateway, sem mensalidade, sem plano pago do Firebase. O modelo é **PIX manual + confirmação via WhatsApp**, e é também a **camada final de segurança de preço** (ver seção 3).

---

## 1. Como o pagamento funciona

1. O cliente fecha o pedido no carrinho. O pedido é gravado **sem nenhum valor monetário** — só os produtos, quantidades e modo (varejo/atacado).
2. A página **pedido-confirmado.html** calcula o total com os **preços atuais do catálogo** e mostra:
   - a **chave PIX** da loja com botão "copiar";
   - o botão **"Combinar pagamento no WhatsApp"** — um link `wa.me` (click-to-chat, **gratuito**, não é a API paga do WhatsApp) já com o número do pedido e o valor na mensagem.
3. Você recebe a mensagem/comprovante, **abre o pedido no painel admin** (que deriva o total do catálogo do mesmo jeito) e **confere se o PIX recebido bate com o total mostrado**.
4. Batendo, muda o status do pedido para `pago` e combina entrega/retirada.

## 2. Cadastrar a SUA chave PIX (passo a passo, sem mexer em código)

1. Abra o [Firebase Console](https://console.firebase.google.com) → projeto `flora-5754a` → **Firestore Database**.
2. Na coleção **`configuracoes`**, crie (ou edite) um documento com o ID exatamente **`pagamento`**.
3. Adicione os campos (tipo *string*):

| Campo        | Exemplo                                       | Obrigatório? |
|--------------|-----------------------------------------------|--------------|
| `pixChave`   | `98984853656` (celular, e-mail, CNPJ ou chave aleatória) | Sim — sem ele a página mostra só o WhatsApp |
| `pixNome`    | `Flora Boutique`                              | Recomendado (o cliente confere o favorecido) |
| `instrucoes` | `Envie o comprovante pelo WhatsApp para agilizar` | Opcional |

4. Salve. A página de confirmação já passa a mostrar a chave — sem deploy.

**QR Code estático (opcional, melhora a experiência):** gere no app do seu banco (a maioria tem "receber com QR") ou em geradores de "PIX copia-e-cola estático". Como o QR é uma imagem, você pode subir para um host de imagem e futuramente exibi-lo na página; por ora a chave copia-e-cola cobre o fluxo. *(Evolução registrada no ROADMAP.)*

**Segurança:** o documento `configuracoes/pagamento` é público para LEITURA (o cliente precisa ver a chave), e só o admin escreve (regra no `firestore.rules`). Chave PIX é dado de RECEBIMENTO — não dá acesso à sua conta.

## 3. A conferência manual é parte da SEGURANÇA (leia!)

Sem servidor (plano Spark), o pedido não carrega valores e o total é derivado do catálogo — mas as quantidades vêm do cliente. **A trava final é você**: o painel admin mostra o total oficial derivado dos SEUS preços; se o PIX recebido não bater com esse total, **não envie o pedido**. O painel também exibe avisos automáticos (⚠) quando detecta algo estranho no pedido (ex.: item de atacado num pedido de varejo). Detalhes do risco residual: `docs/FALHAS_REMANESCENTES.md`.

## 4. Se um dia quiser um gateway (futuro, NÃO é necessário agora)

Só considere opções **sem mensalidade**, que cobram apenas % por venda:

| Opção | Custo | Observação |
|-------|-------|------------|
| **Mercado Pago Checkout Pro** | ~4,98% por venda no cartão; PIX ~0,99% | Sem mensalidade. Confirmação automática exigiria backend (ver ROADMAP) |
| **PagBank / InfinitePay links de pagamento** | % por venda | Link de pagamento gerado manualmente por pedido — funciona até SEM backend, mas é trabalho manual seu |
| **PIX direto (atual)** | **R$ 0** para você (pessoa física/MEI) | O modelo desta rodada |

> ⚠️ A confirmação AUTOMÁTICA de pagamento (webhook) exige um backend — hoje descartado pela restrição de custo zero. Com o modelo atual, a confirmação é manual e isso está ok para o volume da loja.

## 5. Checklist

- [ ] Documento `configuracoes/pagamento` criado com a sua chave PIX
- [ ] Teste ponta a ponta: pedido → página de confirmação mostra chave e valor → mensagem chega no WhatsApp da loja
- [ ] Rotina combinada: conferir o total no painel admin ANTES de aceitar o comprovante
- [ ] (Opcional) QR estático gerado no app do banco para enviar pelo WhatsApp
