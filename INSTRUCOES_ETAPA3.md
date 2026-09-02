# Etapa 3 — Carrinho, Checkout e Frete por Zona

## O que foi feito

1. **Página de Carrinho** (`carrinho.html`): lista os itens salvos no
   Firestore, com controle de quantidade (+/−) e remoção. Atualiza em
   tempo real o subtotal e total.

2. **Ícone de carrinho na navbar** (todas as páginas), com contador de
   itens, visível só quando logado.

3. **Frete por zona de São Luís** (`services/frete.js`): como a loja fica
   no Monumental Shopping (Renascença) e só entrega na cidade, sem usar
   API paga de transportadora, criei uma tabela de **5 zonas por
   proximidade** + adicional por peso total do pedido:

   | Zona | Bairros (principais) | Frete base (até 1kg) |
   |---|---|---|
   | 1 | Renascença, Ponta d'Areia, Calhau | R$ 8 |
   | 2 | Cohama, Vinhais, Jaracaty, Fátima | R$ 12 |
   | 3 | Centro, João Paulo, Cohab, Liberdade | R$ 15 |
   | 4 | Cohatrac, Turu, Coroado | R$ 18 |
   | 5 | Itaqui, Anil, Maiobinha, demais bairros | R$ 24 |

   Adicional por peso total do carrinho: +R$5 (1–3kg), +R$10 (3–6kg),
   +R$18 (6kg+).

   **⚠️ Esses valores são estimativas de partida — ajuste em
   `services/frete.js`, na constante `ZONAS` (campo `valorBase`) e
   `FAIXAS_PESO`. A lista de bairros de cada zona também pode ser
   editada/expandida ali.**

   Se o bairro digitado não for reconhecido, o sistema aplica o frete da
   zona mais cara e avisa o cliente que o valor será confirmado por
   WhatsApp antes do envio — assim você nunca perde dinheiro por um
   bairro não mapeado.

4. **Retirada na loja**: opção sem custo de frete, com o endereço do
   Monumental Shopping já informado na tela.

5. **Endereço pré-preenchido**: se o cliente já salvou um endereço em
   "Minha Conta" (Etapa 1), ele aparece automaticamente no checkout.

6. **Criação de pedidos** (`services/pedidos.js`): ao finalizar a compra,
   um documento é criado em `pedidos/{id}` com itens, endereço, frete,
   subtotal e total. O carrinho é esvaziado automaticamente.

7. **Página de confirmação** (`pedido-confirmado.html`): mostra o número
   do pedido e o total. **O pagamento via Mercado Pago ainda não está
   conectado** — por enquanto a mensagem informa que a loja entrará em
   contato. Isso é o que construímos na próxima etapa.

## Novo índice do Firestore

Adicionei um índice composto para listar os pedidos de um usuário por
data. Publique junto com o resto:

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

## Pontos de atenção pra você revisar

- **Os valores de frete são só uma estimativa minha** baseada na
  geografia de São Luís — ajuste pra refletir sua realidade de custo
  (gasolina, motoboy, etc.)
- **A lista de bairros por zona não é exaustiva.** Se um bairro
  importante pra você não estiver na lista, é só adicionar dentro do
  array `bairros` da zona correta em `services/frete.js`.
- Como ainda não temos Mercado Pago, o pedido fica com status
  `aguardando_pagamento` indefinidamente — combine com o cliente por
  fora por enquanto.

## Próxima etapa

Integração com Mercado Pago: gerar cobrança real e confirmar pagamento
automaticamente (via Cloud Functions, que vamos adicionar agora).
