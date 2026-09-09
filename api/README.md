# Pagamento — Mercado Pago (Vercel Functions)

## Estado atual

| Parte | Situação |
|---|---|
| `api/pagamento.js` | ✅ pronto — recalcula subtotal + frete no servidor, cria a preferência do Mercado Pago (Checkout Pro: PIX + cartão), grava `pedidos/{id}.pagamento` e devolve `init_point`. |
| `api/webhook-mp.js` | ✅ pronto — valida a assinatura `x-signature`, consulta o status real na API do MP e atualiza `pedidos/{id}.pagamento.status`. |
| `api/_lib/*` | ✅ Admin SDK, cliente do MP, regra de parcelas, cópia server-side de preço/frete. |
| Front (`js/pedido-confirmado.js`) | ✅ botão "Pagar agora (PIX ou cartão)" → chama `/api/pagamento` → redireciona pro checkout. Se a função falhar/estiver sem credenciais, cai no **PIX manual + WhatsApp**. |
| `firestore.rules` | ✅ o create de `pedidos` aceita `pagamento.metodo == 'mercadopago'`. **Precisa de re-deploy.** |
| **Credenciais + webhook no painel do MP** | ❌ **você precisa fazer** (passos abaixo). |
| Config de "sem juros até Nx" | ❌ ajuste no painel do MP (passo 5). |

Enquanto as credenciais não estiverem na Vercel, `/api/pagamento` responde
500 e o site usa automaticamente o PIX manual — nada quebra.

## Fluxo

```
Carrinho → cria pedidos/{id} (sem valores)
        → pedido-confirmado.html
             "Pagar agora" → POST /api/pagamento { pedidoId }
                  → recalcula subtotal+frete no servidor
                  → cria preferência no Mercado Pago
                  → grava pedidos/{id}.pagamento { metodo, provedorId, total, ... }
                  → devolve init_point
             redireciona → checkout do Mercado Pago (PIX ou cartão)
        → cliente paga
Mercado Pago → POST /api/webhook-mp
                  → valida assinatura → consulta status real
                  → atualiza pedidos/{id}.pagamento.status = aprovado | recusado
        → pedido-confirmado.html reflete o status
```

## Passo a passo (setup)

### 1. Conta e aplicação no Mercado Pago
- `mercadopago.com.br/developers` → **Suas integrações** → criar aplicação
  ("Pagamentos online" / "Checkout Pro").
- Em **Credenciais de teste**, copiar o **Access Token** (`TEST-...`).

### 2. Webhook
- Na aplicação → **Webhooks / Notificações** → adicionar a URL:
  `https://<seu-domínio>/api/webhook-mp`
- Evento: **Pagamentos** (`payment`).
- Copiar a **assinatura secreta** que o painel gera.

### 3. Environment Variables na Vercel
Project → **Settings → Environment Variables** — preencher com base no
[`.env.example`](../.env.example):

| Variável | Valor |
|---|---|
| `MP_ACCESS_TOKEN` | o Access Token de teste (`TEST-...`) |
| `MP_WEBHOOK_SECRET` | a assinatura secreta do webhook |
| `FIREBASE_SERVICE_ACCOUNT` | JSON da service account do projeto Firebase, **numa linha só** |
| `PUBLIC_BASE_URL` | ex. `https://amira-phi.vercel.app` (sem barra no fim) |

Redeployar depois de salvar.

### 4. Deploy das rules
```bash
firebase deploy --only firestore:rules
```

### 5. Parcelas sem juros
A regra (carrinho > R$ 1.000 → só 1x sem juros; ≤ R$ 1.000 → até 4x) é
calculada em `api/_lib/parcelamento.js` e exibida no checkout. No **Checkout
Pro**, quem define até quantas parcelas ficam sem juros é o painel do MP:
**Suas integrações → sua aplicação → Checkout Pro → Parcelamento**. Se
precisar variar por pedido, migrar para **Checkout Transparente**.

### 6. Testar (sandbox)
- Usar os **cartões de teste** do MP (`mercadopago.com.br/developers` →
  documentação → cartões de teste) e o **usuário de teste** comprador.
- Fazer um pedido → "Pagar agora" → pagar no sandbox → conferir que
  `pedidos/{id}.pagamento.status` vira `aprovado` (o webhook fez isso).
- Testar recusa (cartão de teste que recusa) e PIX de teste.

### 7. Produção
- Trocar `MP_ACCESS_TOKEN` pelo de **produção** (`APP_USR-...`) e o
  `MP_WEBHOOK_SECRET` correspondente.
- Conferir `PUBLIC_BASE_URL` com o domínio real.

## Manutenção

- `api/_lib/precos.js` é **cópia** da lógica de preço (`services/produtos.js`
  → `infoPreco`) e frete (`services/frete.js`). Se mudar desconto ou tabela
  de frete no front, mudar aqui também.
- `api/_lib/parcelamento.js` ↔ `services/parcelamento.js` — mesma regra,
  manter em sincronia.

## Rodar local

`vercel dev` na raiz (lê o `.env` local). Funções em
`http://localhost:3000/api/*`.
